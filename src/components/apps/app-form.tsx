"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppLogo } from "@/components/apps/shared";
import { useMe } from "@/components/session-provider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NEW_APP_CHECKLIST } from "@/lib/apps/checklist";
import { appsStore } from "@/lib/data";
import { createItem } from "@/lib/items";
import type { Owner } from "@/lib/members";
import { useRows } from "@/lib/store";
import type { AppRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const field = "h-9 w-full min-w-0 rounded-lg border border-line bg-glass px-3 text-[13.5px] outline-none transition-colors duration-100 placeholder:text-faint focus:border-line-strong";
const slugOf = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const https = (v: string) => (/^https:\/\/\S+$/.test(v) ? v : null);

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-[12px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Une image choisie à la main, réduite à 256 px, pour servir de logo. */
function shrink(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const side = Math.min(img.width, img.height);
      canvas.getContext("2d")?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

/** « Nouvelle app », ou la modification d'une fiche si `app` est donné. */
export function AppForm({ app, onClose }: { app?: AppRow; onClose: () => void }) {
  const me = useMe();
  const router = useRouter();
  const apps = useRows(appsStore);
  const [name, setName] = useState(app?.name ?? "");
  const [slug, setSlug] = useState<string | null>(app?.slug ?? null);
  const [logo, setLogo] = useState<string | null>(app?.logo_url ?? null);
  const [owner, setOwner] = useState<Owner>(app?.owner ?? "both");
  const [busy, setBusy] = useState(false);
  const finalSlug = slug ?? slugOf(name);
  const taken = !app && apps.some((a) => a.slug === finalSlug);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    if (!name.trim() || !finalSlug || taken) return;
    setBusy(true);
    const project = get("project") || null;
    let logo_url = logo;
    // Pas de logo choisi à la main : on prend celui du projet RevenueCat.
    if (!logo_url && project) {
      logo_url = await fetch("/api/apps/logo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: project }) })
        .then((r) => r.json() as Promise<{ logo_url: string | null }>).then((r) => r.logo_url).catch(() => null);
    }
    const fields = {
      name: name.trim(), bundle_id: get("bundle") || null, revenuecat_project_id: project, store_url: https(get("store")), repo_url: https(get("repo")),
      notion_url: https(get("notion")), slack_channel: get("slack") || null, os_application_id: get("os") || null, launch_date: get("launch") || null,
      pays_cibles: get("pays").toUpperCase().split(/[\s,;]+/).filter((c) => /^[A-Z]{2}$/.test(c)), owner, logo_url,
    };
    if (app) {
      const ok = await appsStore.update(app.slug, fields);
      setBusy(false);
      if (!ok) return void toast.error("Fiche non enregistrée");
      toast("Fiche enregistrée");
      return onClose();
    }
    const ok = await appsStore.insert({ ...fields, slug: finalSlug, color: null, sort_order: Math.max(0, ...apps.map((a) => a.sort_order)) + 1, active: true, phase: "preparation" });
    if (!ok) {
      setBusy(false);
      return void toast.error("App non créée");
    }
    // La fiche est en base : on peut y rattacher la checklist.
    NEW_APP_CHECKLIST.forEach((t, i) => createItem({ title: t.title(fields.name), owner: t.owner, category: t.category, bucket: "inbox", app_slug: finalSlug, created_by: me.id, sort_order: Date.now() + i }));
    toast(`${fields.name} créée`, { description: `${NEW_APP_CHECKLIST.length} tâches ajoutées. Clé à mettre dans Vercel : REVENUECAT_KEY_${finalSlug.toUpperCase()}` , duration: 10000 });
    router.push(`/apps/${finalSlug}`);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{app ? app.name : "Nouvelle app"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex items-center gap-3">
            <AppLogo app={{ name: name || "?", logo_url: logo }} size={52} />
            <label className="cursor-pointer text-[12.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
              {logo ? "Changer le logo" : "Envoyer un logo"}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void shrink(e.target.files[0]).then((d) => d && setLogo(d))} />
            </label>
            {!logo && <span className="text-[12.5px] text-faint">sinon, celui de RevenueCat</span>}
          </div>
          <Field label="Nom"><input required autoFocus={!app} value={name} onChange={(e) => setName(e.target.value)} className={field} /></Field>
          <Field label="Slug">
            <input required disabled={Boolean(app)} value={finalSlug} onChange={(e) => setSlug(slugOf(e.target.value))} pattern="[a-z0-9_]+" className={cn(field, "num disabled:opacity-60", taken && "border-bad")} />
          </Field>
          <Field label="Bundle id"><input name="bundle" defaultValue={app?.bundle_id ?? ""} placeholder="com.vikstudios.app" className={cn(field, "num")} /></Field>
          <Field label="Projet RevenueCat"><input name="project" defaultValue={app?.revenuecat_project_id ?? ""} placeholder="proj…" pattern="proj[a-z0-9]+" className={cn(field, "num")} /></Field>
          <Field label="URL App Store" className="col-span-2"><input name="store" type="url" defaultValue={app?.store_url ?? ""} placeholder="https://apps.apple.com/…" className={field} /></Field>
          <Field label="Repo" className="col-span-2"><input name="repo" type="url" defaultValue={app?.repo_url ?? ""} placeholder="https://github.com/…" className={field} /></Field>
          {app && (
            <>
              <Field label="Page Notion"><input name="notion" type="url" defaultValue={app.notion_url ?? ""} placeholder="https://…" className={field} /></Field>
              <Field label="Canal Slack"><input name="slack" defaultValue={app.slack_channel ?? ""} placeholder="#app" className={field} /></Field>
              <Field label="Identifiant dans l'OS" className="col-span-2"><input name="os" defaultValue={app.os_application_id ?? ""} className={cn(field, "num")} /></Field>
            </>
          )}
          <Field label="Pays cibles"><input name="pays" defaultValue={app?.pays_cibles.join(", ") ?? ""} placeholder="NO, SE, FI" className={cn(field, "num")} /></Field>
          <Field label="Date de lancement"><input name="launch" type="date" defaultValue={app?.launch_date ?? ""} className={cn(field, "num")} /></Field>
          <div className="col-span-2">
            <span className="mb-1 block text-[12px] text-muted-foreground">Owner</span>
            <div className="inline-flex rounded-[10px] border border-line bg-glass p-[3px]">
              {([["max", "Max"], ["adrien", "Adrien"], ["both", "Les deux"]] as const).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={owner === key} onClick={() => setOwner(key)} className={cn("h-[28px] rounded-[7px] px-3 text-[12.5px] font-medium transition-colors duration-100", owner === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{label}</button>
              ))}
            </div>
          </div>
          {taken && <p className="col-span-2 text-[12.5px] text-bad">Ce slug existe déjà.</p>}
          <div className="col-span-2 mt-1 flex items-center justify-end gap-2">
            {app && (
              <button type="button" onClick={() => { if (!window.confirm(`Archiver ${app.name} ? Elle disparaît de la grille, ses données restent.`)) return; void appsStore.update(app.slug, { active: false }); onClose(); router.push("/apps"); }} className="mr-auto h-9 rounded-lg px-2 text-[13px] text-muted-foreground hover:text-bad">Archiver</button>
            )}
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-line px-3.5 text-[13.5px] font-medium hover:border-line-strong">Annuler</button>
            <button type="submit" disabled={busy || taken || !name.trim()} className="h-9 rounded-lg bg-foreground px-3.5 text-[13.5px] font-semibold text-background disabled:opacity-40">{busy ? "Enregistrement…" : app ? "Enregistrer" : "Créer la fiche"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
