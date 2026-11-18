"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Copy, ExternalLink, Eye, EyeOff, Lock, ShieldAlert, Trash2, Vault } from "lucide-react";
import { toast } from "sonner";
import { Documents } from "@/components/acces/documents";
import { ViewHeader } from "@/components/app/shell";
import { Panel } from "@/components/dashboard/charts";
import { Tick } from "@/components/planner/item-card";
import { logout, useMe } from "@/components/session-provider";
import { accessStore, legalStore } from "@/lib/data";
import { eur } from "@/lib/format";
import { newId, useRows } from "@/lib/store";
import type { AccessRow, Legal } from "@/lib/types";
import { cn } from "@/lib/utils";

const TWELVE_HOURS = 12 * 3600 * 1000;
const DEFAULT_VAULT = "https://vault.bitwarden.com";

type LegalKey = keyof Omit<Legal, "id" | "updated_at" | "vault_url">;
const LEGAL_GROUPS: { title: string; fields: [LegalKey, string][] }[] = [
  {
    title: "Identité",
    fields: [
      ["raison_sociale", "Raison sociale"], ["nom_commercial", "Nom commercial"], ["forme", "Forme juridique"],
      ["siren", "SIREN"], ["siret", "SIRET"], ["tva", "N° TVA intracom."],
      ["code_ape", "Code APE / NAF"], ["capital", "Capital social"], ["date_creation", "Date de création"],
      ["dirigeant", "Dirigeant"], ["ville_rcs", "Ville RCS"], ["siege", "Siège social"],
      ["comptable", "Cabinet comptable"],
    ],
  },
  {
    title: "Banque",
    fields: [
      ["banque", "Banque"], ["iban", "IBAN"], ["bic", "BIC / SWIFT"],
      ["banque_titulaire", "Titulaire"], ["banque_domiciliation", "Domiciliation"],
    ],
  },
];

const field = "h-9 w-full min-w-0 rounded-lg border border-line bg-glass px-3 text-[13.5px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";
const cell = "h-8 w-full min-w-[110px] rounded-md border border-transparent bg-transparent px-1.5 text-[13px] outline-none transition-colors duration-100 placeholder:text-faint hover:border-line focus:border-line-strong focus:bg-glass";
const th = "border-b border-line px-1.5 py-1.5 text-left text-[12px] font-medium text-muted-foreground whitespace-nowrap";

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(() => toast("Copié"), () => toast.error("Impossible de copier"));
}

/** Cellule modifiable : enregistre en quittant le champ. Si l'enregistrement est refusé (secret détecté), la valeur revient. */
function Cell({
  value, onSave, placeholder = "…", label, type = "text", className,
}: {
  value: string | number | null;
  onSave: (v: string | null) => Promise<boolean>;
  placeholder?: string;
  label: string;
  type?: string;
  className?: string;
}) {
  const shown = value === null || value === undefined ? "" : String(value);
  return (
    <input
      key={shown}
      type={type}
      defaultValue={shown}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
      inputMode={type === "number" ? "decimal" : undefined}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={(e) => {
        const el = e.currentTarget;
        const v = el.value.trim();
        if (v === shown) return;
        void onSave(v || null).then((ok) => {
          if (!ok) el.value = shown;
        });
      }}
      className={cn(cell, className)}
    />
  );
}

/** Email du compte : masqué par défaut (m•••@gmail.com), visible et modifiable au clic. */
function EmailCell({ row, save }: { row: AccessRow; save: (patch: Partial<AccessRow>) => Promise<boolean> }) {
  const [shown, setShown] = useState(false);
  const email = row.account_email;
  const masked = email ? email.replace(/^(.)[^@]*(@.*)$/, "$1•••$2") : null;
  if (shown || !email) {
    return (
      <div className="flex items-center gap-1">
        <Cell label={`Email du compte ${row.service}`} type="email" value={email} placeholder="email du compte" onSave={(v) => save({ account_email: v })} />
        {email && (
          <button type="button" onClick={() => setShown(false)} aria-label="Masquer l'email" className="grid size-7 shrink-0 place-items-center rounded-md text-faint hover:text-foreground">
            <EyeOff className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setShown(true)} aria-label={`Afficher l'email du compte ${row.service}`} className="num inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[12.5px] text-muted-foreground hover:bg-glass hover:text-foreground">
      {masked} <Eye className="size-3.5" aria-hidden />
    </button>
  );
}

export default function AccessPage() {
  const me = useMe();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // Page sensible : il faut s'être connecté il y a moins de 12 heures.
  const fresh = now - me.signedInAt < TWELVE_HOURS;

  if (!fresh) {
    return (
      <div className="grid flex-1 place-items-center px-6">
        <div className="glass max-w-md rounded-3xl p-8 text-center">
          <Lock className="mx-auto size-7 text-muted-foreground" aria-hidden />
          <h1 className="mt-4 text-[24px] font-semibold">Reconnecte-toi pour ouvrir cette page</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Les documents légaux et les accès demandent une connexion de moins de 12 heures. La tienne est plus ancienne.
          </p>
          <button type="button" onClick={() => void logout("/acces")} className="mt-6 h-10 rounded-xl bg-foreground px-5 text-[14px] font-semibold text-background">
            Me reconnecter
          </button>
        </div>
      </div>
    );
  }
  return <AccessContent />;
}

function AccessContent() {
  const rows = useRows(accessStore);
  const legal = useRows(legalStore)[0];
  const [only2fa, setOnly2fa] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const accesses = useMemo(() => rows.filter((r) => r.kind === "access").sort((a, b) => a.service.localeCompare(b.service, "fr")), [rows]);
  const keys = useMemo(() => rows.filter((r) => r.kind === "key").sort((a, b) => a.service.localeCompare(b.service, "fr")), [rows]);
  const no2fa = accesses.filter((a) => !a.two_fa).length;
  const shown = only2fa ? accesses.filter((a) => !a.two_fa) : accesses;
  const monthly = accesses.reduce((s, a) => s + Number(a.monthly_cost ?? 0), 0);
  const vault = legal?.vault_url || DEFAULT_VAULT;

  const save = (id: string) => (patch: Partial<AccessRow>) => accessStore.update(id, patch);

  function add(kind: AccessRow["kind"]) {
    return (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      const service = String(f.get("service") ?? "").trim();
      const extra = String(f.get("extra") ?? "").trim();
      if (!service) return;
      void accessStore
        .insert({
          id: newId(), kind, service,
          url: kind === "access" && extra ? (/^https?:\/\//.test(extra) ? extra : "https://" + extra) : null,
          login_hint: null, secret_location: null, two_fa: false, who: null,
          used_by: kind === "key" ? extra || null : null, rotated_at: null,
          account_email: null, owner: null, payment_method: null, monthly_cost: null, renewal_date: null,
          created_at: new Date().toISOString(),
        })
        .then((ok) => ok && form.reset());
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

  /** « Où est le secret » : le nom de l'élément dans le coffre, et un bouton qui ouvre le coffre. */
  const secretCell = (r: AccessRow) => (
    <div className="flex items-center gap-1">
      <Cell label={`Où est le secret de ${r.service}`} value={r.secret_location} placeholder="ex. Vik / Qonto admin" onSave={(v) => save(r.id)({ secret_location: v })} />
      <a href={vault} target="_blank" rel="noopener noreferrer" title="Ouvrir le coffre" aria-label={`Ouvrir le coffre pour ${r.service}`} className="grid size-7 shrink-0 place-items-center rounded-md text-faint hover:bg-accent hover:text-foreground">
        <Vault className="size-3.5" aria-hidden />
      </a>
    </div>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="Légal & accès" />
      <div className="flex flex-col gap-3 px-4 pb-16 md:px-6">
        <div role="note" className="flex items-start gap-3 rounded-2xl border border-warn/50 bg-warn-soft p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
          <p className="text-[13.5px]">
            <b className="text-warn">Rien de secret ici. </b>
            Aucun mot de passe ni aucune clé API dans le QG : ni dans un champ, ni dans un document. Range-les dans le coffre et note seulement ici le
            nom de l&apos;élément et qui y a accès. Tout ce qui ressemble à un secret est bloqué.
          </p>
        </div>

        {/* ----------------------------------------------------- fiche société */}
        <Panel
          title="Fiche société"
          caption="Enregistré dès que tu quittes un champ"
          action={
            legal && (
              <button
                type="button"
                onClick={() => copy(LEGAL_GROUPS.flatMap((g) => g.fields).filter(([k]) => legal[k]).map(([k, l]) => `${l} : ${legal[k]}`).join("\n"))}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] text-muted-foreground hover:border-line-strong hover:text-foreground"
              >
                <Copy className="size-3.5" aria-hidden /> Tout copier
              </button>
            )
          }
        >
          {LEGAL_GROUPS.map((g) => (
            <div key={g.title} className="mb-4 last:mb-0">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-faint uppercase">{g.title}</p>
              <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.fields.map(([key, label]) => (
                  <label key={key} className="block min-w-0">
                    <span className="mb-1 block text-[12px] text-muted-foreground">{label}</span>
                    <span className="flex items-center gap-1">
                      <input
                        key={legal?.[key] ?? ""}
                        defaultValue={legal?.[key] ?? ""}
                        placeholder="…"
                        autoComplete="off"
                        disabled={!legal}
                        onKeyDown={(e) => e.stopPropagation()}
                        onBlur={(e) => {
                          const el = e.currentTarget;
                          const v = el.value.trim();
                          if (!legal || v === (legal[key] ?? "")) return;
                          void legalStore.update("true", { [key]: v || null }).then((ok) => {
                            if (!ok) el.value = legal[key] ?? "";
                          });
                        }}
                        className={field}
                      />
                      {legal?.[key] && (
                        <button type="button" onClick={() => copy(legal[key]!)} aria-label={`Copier ${label}`} title="Copier" className="grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:bg-accent hover:text-foreground">
                          <Copy className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </Panel>

        <Documents />

        {/* ---------------------------------------------- connexions et comptes */}
        <h2 className="mt-6 text-[20px] font-semibold">Connexions et comptes</h2>
        <Panel
          caption={
            <>
              <span className="num">{accesses.length}</span> comptes · <span className={cn("num", no2fa > 0 && "font-semibold text-warn")}>{no2fa}</span> sans 2FA
              {monthly > 0 && <> · <span className="num">{eur(monthly)}</span> par mois</>}
            </>
          }
          action={
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                aria-pressed={only2fa}
                onClick={() => setOnly2fa((v) => !v)}
                className={cn("h-8 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors duration-100", only2fa ? "border-warn/60 bg-warn-soft text-warn" : "border-line text-muted-foreground hover:text-foreground")}
              >
                2FA pas activée
              </button>
              <a href={vault} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] text-muted-foreground hover:border-line-strong hover:text-foreground">
                <Vault className="size-3.5" aria-hidden /> Ouvrir le coffre
              </a>
            </div>
          }
        >
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[1500px] border-collapse">
              <thead>
                <tr>
                  <th className={cn(th, "sticky left-0 z-10 bg-[var(--viz-surface)]")}>Service</th>
                  <th className={th}>Email du compte</th>
                  <th className={th}>Propriétaire</th>
                  <th className={th}>Où est le secret</th>
                  <th className={th}>2FA</th>
                  <th className={th}>Qui a accès</th>
                  <th className={th}>Moyen de paiement</th>
                  <th className={th}>Coût / mois</th>
                  <th className={th}>Renouvellement</th>
                  <th className={th}>Page de connexion</th>
                  <th className="border-b border-line" />
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="sticky left-0 z-10 bg-[var(--viz-surface)] px-1.5 py-1 text-[13px] font-medium whitespace-nowrap">
                      {a.url ? (
                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-line-strong underline-offset-4 hover:decoration-foreground">
                          {a.service} <ExternalLink className="size-3 text-faint" aria-hidden />
                        </a>
                      ) : (
                        a.service
                      )}
                    </td>
                    <td className="py-1"><EmailCell row={a} save={save(a.id)} /></td>
                    <td className="px-1 py-1">
                      <select value={a.owner ?? ""} aria-label={`Propriétaire du compte ${a.service}`} onChange={(e) => void save(a.id)({ owner: (e.target.value || null) as AccessRow["owner"] })} className={cn(cell, "min-w-[120px]")}>
                        <option value="">…</option>
                        <option>Max</option>
                        <option>Adrien</option>
                        <option>Vik Studios</option>
                      </select>
                    </td>
                    <td className="py-1">{secretCell(a)}</td>
                    <td className="px-1.5 py-1"><Tick checked={a.two_fa} label={`2FA activée sur ${a.service}`} onChange={() => void save(a.id)({ two_fa: !a.two_fa })} /></td>
                    <td className="py-1"><Cell label={`Qui a accès à ${a.service}`} value={a.who} placeholder="ex. Max, Adrien" onSave={(v) => save(a.id)({ who: v })} /></td>
                    <td className="py-1"><Cell label={`Moyen de paiement de ${a.service}`} value={a.payment_method} placeholder="ex. carte Qonto •4273" onSave={(v) => save(a.id)({ payment_method: v })} /></td>
                    <td className="py-1">
                      <Cell label={`Coût mensuel de ${a.service}`} type="number" value={a.monthly_cost} placeholder="€" className="num min-w-[80px]" onSave={(v) => save(a.id)({ monthly_cost: v === null ? null : Number(v.replace(",", ".")) })} />
                    </td>
                    <td className="py-1"><Cell label={`Renouvellement de ${a.service}`} type="date" value={a.renewal_date} onSave={(v) => save(a.id)({ renewal_date: v })} /></td>
                    <td className="py-1"><Cell label={`Page de connexion de ${a.service}`} type="url" value={a.url} placeholder="https://…" onSave={(v) => save(a.id)({ url: v && !/^https?:\/\//.test(v) ? "https://" + v : v })} /></td>
                    <td className="w-8 py-1 pr-1 text-right">{del(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {only2fa && shown.length === 0 && <p className="mt-3 text-[13.5px] text-good">La 2FA est activée partout.</p>}
          <form onSubmit={add("access")} className="mt-3 flex flex-wrap gap-2">
            <input name="service" required placeholder="Service (ex. Qonto)" aria-label="Service" onKeyDown={(e) => e.stopPropagation()} className={cn(field, "flex-[1_1_180px]")} />
            <input name="extra" placeholder="Page de connexion https://…" aria-label="Page de connexion" onKeyDown={(e) => e.stopPropagation()} className={cn(field, "flex-[2_1_260px]")} />
            <button type="submit" className="h-9 rounded-lg bg-foreground px-4 text-[13.5px] font-semibold text-background">Ajouter</button>
          </form>
        </Panel>

        {/* ------------------------------------------------------------ clés API */}
        <h2 className="mt-6 text-[20px] font-semibold">Mots de passe et clés API</h2>
        <Panel caption="Seulement le nom de l'élément dans le coffre, jamais le secret lui-même">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Clé</th>
                  <th className={th}>Utilisée par</th>
                  <th className={th}>Où est le secret</th>
                  <th className={th}>Dernière rotation</th>
                  <th className="border-b border-line" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-line last:border-0">
                    <td className="px-1.5 py-1 text-[13px] font-medium whitespace-nowrap">{k.service}</td>
                    <td className="py-1"><Cell label={`Qui utilise la clé ${k.service}`} value={k.used_by} onSave={(v) => save(k.id)({ used_by: v })} /></td>
                    <td className="py-1">{secretCell(k)}</td>
                    <td className="py-1"><Cell type="date" label={`Dernière rotation de la clé ${k.service}`} value={k.rotated_at} onSave={(v) => save(k.id)({ rotated_at: v })} /></td>
                    <td className="w-8 py-1 pr-1 text-right">{del(k)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form onSubmit={add("key")} className="mt-3 flex flex-wrap gap-2">
            <input name="service" required placeholder="Nom de la clé (ex. OpenAI)" aria-label="Nom de la clé" onKeyDown={(e) => e.stopPropagation()} className={cn(field, "flex-[1_1_180px]")} />
            <input name="extra" placeholder="Utilisée par (ex. OS, Supabase)" aria-label="Utilisée par" onKeyDown={(e) => e.stopPropagation()} className={cn(field, "flex-[2_1_260px]")} />
            <button type="submit" className="h-9 rounded-lg bg-foreground px-4 text-[13.5px] font-semibold text-background">Ajouter</button>
          </form>
          <label className="mt-4 block border-t border-line pt-3">
            <span className="mb-1 block text-[12px] text-muted-foreground">Adresse du coffre (Bitwarden, 1Password…) ouverte par les boutons « coffre »</span>
            <input
              key={legal?.vault_url ?? ""}
              type="url"
              defaultValue={legal?.vault_url ?? ""}
              placeholder={DEFAULT_VAULT}
              disabled={!legal}
              onKeyDown={(e) => e.stopPropagation()}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                if (legal && v !== (legal.vault_url ?? "")) void legalStore.update("true", { vault_url: v || null });
              }}
              className={cn(field, "max-w-md")}
            />
          </label>
        </Panel>
      </div>
    </div>
  );
}
