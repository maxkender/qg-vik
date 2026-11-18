"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ViewHeader } from "@/components/app/shell";
import { Panel } from "@/components/dashboard/charts";
import { Tick } from "@/components/planner/item-card";
import { accessStore, legalStore } from "@/lib/data";
import { newId, useRows } from "@/lib/store";
import type { AccessRow, Legal } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Garde-fou : cette page ne doit contenir AUCUN secret. On refuse ce qui ressemble
 * à une clé API ou à un mot de passe (longue suite sans espaces, préfixes connus…).
 */
function looksLikeSecret(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  if (/^(sk|pk|rk|sb|ghp|gho|xox[abp]|AKIA|eyJ|whsec|re|sbp)[-_]?[A-Za-z0-9_-]{12,}/.test(s)) return true;
  if (/(mot de passe|password|mdp|pwd)\s*[:=]\s*\S+/i.test(s)) return true;
  // Un seul « mot » long qui mélange lettres et chiffres, sans espace : très probablement un secret.
  return s.split(/\s+/).some((w) => w.length >= 20 && /[a-z]/i.test(w) && /\d/.test(w) && !/^https?:\/\//.test(w) && !w.includes("@"));
}
function refuse() {
  toast.error("Ça ressemble à un mot de passe ou à une clé.", { description: "Note seulement où il est rangé (ex. « 1Password, coffre Vik »)." });
}

const LEGAL_FIELDS: [keyof Omit<Legal, "id" | "updated_at">, string][] = [
  ["raison_sociale", "Raison sociale"],
  ["forme", "Forme juridique"],
  ["siren", "SIREN"],
  ["siret", "SIRET"],
  ["tva", "N° TVA intracom."],
  ["siege", "Siège"],
  ["date_creation", "Date de création"],
  ["dirigeant", "Président / dirigeant"],
  ["comptable", "Cabinet comptable"],
  ["banque", "Banque"],
];

const field = "h-9 w-full min-w-0 rounded-lg border border-line bg-glass px-3 text-[13.5px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";
const cell = "h-8 w-full min-w-[120px] rounded-md border border-transparent bg-transparent px-1.5 text-[13px] outline-none transition-colors duration-100 placeholder:text-faint hover:border-line focus:border-line-strong focus:bg-glass";

/** Cellule modifiable : enregistre en quittant le champ, refuse les secrets. */
function Cell({ value, onSave, placeholder = "…", label, type = "text" }: { value: string | null; onSave: (v: string | null) => void; placeholder?: string; label: string; type?: string }) {
  return (
    <input
      key={value ?? ""}
      type={type}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        if (v === (value ?? "")) return;
        if (looksLikeSecret(v)) {
          e.currentTarget.value = value ?? "";
          return refuse();
        }
        onSave(v || null);
      }}
      className={cell}
    />
  );
}

export default function AccessPage() {
  const rows = useRows(accessStore);
  const legalRows = useRows(legalStore);
  const legal = legalRows[0];
  const accesses = useMemo(() => rows.filter((r) => r.kind === "access").sort((a, b) => a.service.localeCompare(b.service, "fr")), [rows]);
  const keys = useMemo(() => rows.filter((r) => r.kind === "key").sort((a, b) => a.service.localeCompare(b.service, "fr")), [rows]);
  const [confirm, setConfirm] = useState<string | null>(null);

  const save = (id: string, patch: Partial<AccessRow>) => void accessStore.update(id, patch);

  function add(kind: AccessRow["kind"]) {
    return (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const service = String(f.get("service") ?? "").trim();
      const extra = String(f.get("extra") ?? "").trim();
      if (!service) return;
      if (looksLikeSecret(service) || looksLikeSecret(extra)) return refuse();
      void accessStore.insert({
        id: newId(),
        kind,
        service,
        url: kind === "access" && extra ? (/^https?:\/\//.test(extra) ? extra : "https://" + extra) : null,
        login_hint: null,
        secret_location: null,
        two_fa: false,
        who: null,
        used_by: kind === "key" ? extra || null : null,
        rotated_at: null,
        created_at: new Date().toISOString(),
      });
      e.currentTarget.reset();
    };
  }

  const del = (r: AccessRow) =>
    confirm === r.id ? (
      <span className="flex items-center gap-1.5 text-[12px] whitespace-nowrap">
        <button type="button" autoFocus onClick={() => void accessStore.remove(r.id)} className="rounded-md bg-bad px-2 py-0.5 font-semibold text-white">Supprimer</button>
        <button type="button" onClick={() => setConfirm(null)} className="rounded-md border border-line-strong px-2 py-0.5 text-muted-foreground">Non</button>
      </span>
    ) : (
      <button type="button" aria-label={`Supprimer ${r.service}`} onClick={() => setConfirm(r.id)} className="grid size-7 place-items-center rounded-md text-faint hover:text-bad">
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    );

  const th = "border-b border-line px-1.5 py-1.5 text-left text-[12px] font-medium text-muted-foreground whitespace-nowrap";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Légal & accès" sub="Où se connecter, qui a accès, et où sont rangés les secrets. Jamais les secrets eux-mêmes." />
      <div className="flex flex-col gap-3 px-4 pb-16 md:px-6">
        <div role="note" className="flex items-start gap-3 rounded-2xl border border-warn/50 bg-warn-soft p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
          <p className="text-[13.5px]">
            <b className="text-warn">Rien de secret ici. </b>
            Ne colle jamais un mot de passe ni une clé API sur cette page. Range-les dans un gestionnaire (1Password, Bitwarden…) et note seulement
            ici <b>où</b> les trouver et <b>qui</b> y a accès. Tout ce qui ressemble à un secret est refusé.
          </p>
        </div>

        <Panel title="Fiche légale" caption="Enregistré dès que tu quittes un champ">
          <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {LEGAL_FIELDS.map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-[12px] text-muted-foreground">{label}</span>
                <input
                  key={legal?.[key] ?? ""}
                  defaultValue={legal?.[key] ?? ""}
                  placeholder="…"
                  autoComplete="off"
                  disabled={!legal}
                  onKeyDown={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim();
                    if (!legal || v === (legal[key] ?? "")) return;
                    void legalStore.update("true", { [key]: v || null });
                  }}
                  className={field}
                />
              </label>
            ))}
          </div>
        </Panel>

        <h2 className="mt-6 text-[20px] font-extrabold">Connexions</h2>
        <Panel caption="Où se connecter, avec quel compte, et où est rangé le mot de passe">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Service</th>
                  <th className={th}>Compte utilisé</th>
                  <th className={th}>Mot de passe rangé où</th>
                  <th className={th}>2FA</th>
                  <th className={th}>Qui a accès</th>
                  <th className="border-b border-line" />
                </tr>
              </thead>
              <tbody>
                {accesses.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-1.5 py-1 text-[13px] font-medium whitespace-nowrap">
                      {a.url ? (
                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-4 hover:decoration-foreground">{a.service}</a>
                      ) : (
                        a.service
                      )}
                    </td>
                    <td className="py-1"><Cell label={`Compte utilisé pour ${a.service}`} value={a.login_hint} placeholder="ex. compte Google de Max" onSave={(v) => save(a.id, { login_hint: v })} /></td>
                    <td className="py-1"><Cell label={`Où est rangé le mot de passe de ${a.service}`} value={a.secret_location} placeholder="ex. 1Password, coffre Vik" onSave={(v) => save(a.id, { secret_location: v })} /></td>
                    <td className="px-1.5 py-1"><Tick checked={a.two_fa} label={`2FA activée sur ${a.service}`} onChange={() => save(a.id, { two_fa: !a.two_fa })} /></td>
                    <td className="py-1"><Cell label={`Qui a accès à ${a.service}`} value={a.who} placeholder="ex. Max, Adrien" onSave={(v) => save(a.id, { who: v })} /></td>
                    <td className="w-8 py-1 pr-1 text-right">{del(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form onSubmit={add("access")} className="mt-3 flex flex-wrap gap-2">
            <input name="service" required placeholder="Service (ex. Qonto)" aria-label="Service" className={cn(field, "flex-[1_1_180px]")} />
            <input name="extra" placeholder="Adresse de connexion https://…" aria-label="Adresse de connexion" className={cn(field, "flex-[2_1_260px]")} />
            <button type="submit" className="h-9 rounded-lg bg-foreground px-4 text-[13.5px] font-semibold text-background">Ajouter</button>
          </form>
        </Panel>

        <h2 className="mt-6 text-[20px] font-extrabold">Clés API</h2>
        <Panel caption="Seulement le nom de la clé et où elle est stockée, jamais la clé elle-même">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Service</th>
                  <th className={th}>Utilisée par</th>
                  <th className={th}>Stockée où</th>
                  <th className={th}>Dernière rotation</th>
                  <th className="border-b border-line" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-line last:border-0">
                    <td className="px-1.5 py-1 text-[13px] font-medium whitespace-nowrap">{k.service}</td>
                    <td className="py-1"><Cell label={`Qui utilise la clé ${k.service}`} value={k.used_by} onSave={(v) => save(k.id, { used_by: v })} /></td>
                    <td className="py-1"><Cell label={`Où est stockée la clé ${k.service}`} value={k.secret_location} placeholder="ex. variables Vercel de l'OS" onSave={(v) => save(k.id, { secret_location: v })} /></td>
                    <td className="py-1"><Cell type="date" label={`Dernière rotation de la clé ${k.service}`} value={k.rotated_at} onSave={(v) => save(k.id, { rotated_at: v })} /></td>
                    <td className="w-8 py-1 pr-1 text-right">{del(k)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form onSubmit={add("key")} className="mt-3 flex flex-wrap gap-2">
            <input name="service" required placeholder="Service de la clé (ex. OpenAI)" aria-label="Service de la clé" className={cn(field, "flex-[1_1_180px]")} />
            <input name="extra" placeholder="Utilisée par (ex. OS, Supabase)" aria-label="Utilisée par" className={cn(field, "flex-[2_1_260px]")} />
            <button type="submit" className="h-9 rounded-lg bg-foreground px-4 text-[13.5px] font-semibold text-background">Ajouter</button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
