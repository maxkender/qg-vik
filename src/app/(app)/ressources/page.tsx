"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ViewHeader } from "@/components/app/shell";
import { useMe } from "@/components/session-provider";
import { assetsStore } from "@/lib/data";
import { containsSecret, SECRET_MESSAGE } from "@/lib/secrets";
import { newId, useRows } from "@/lib/store";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Asset } from "@/lib/types";
import { cn } from "@/lib/utils";

const BUCKET = "ressources";
const PRESETS = ["Logos Vik Studios", "Apps", "Captures et visuels", "Divers"];
const weight = (n: number | null) => (n === null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`);
const ext = (name: string) => (/\.([a-z0-9]{1,8})$/i.exec(name)?.[1] ?? "").toUpperCase();
const isImage = (a: Asset) => (a.mime ?? "").startsWith("image/");

// Les fichiers de la marque : logos, icônes des apps, visuels. Un clic pour télécharger.
export default function ResourcesPage() {
  const me = useMe();
  const assets = useRows(assetsStore);
  const [folder, setFolder] = useState(PRESETS[0]);
  const [busy, setBusy] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);

  const folders = useMemo(() => [...new Set([...PRESETS, ...assets.map((a) => a.folder)])], [assets]);
  const groups = useMemo(() => folders.map((f) => ({ folder: f, list: assets.filter((a) => a.folder === f).sort((a, b) => a.name.localeCompare(b.name, "fr")) })).filter((g) => g.list.length), [assets, folders]);

  // Les aperçus : des liens signés d'une heure, demandés une fois par image.
  useEffect(() => {
    const missing = assets.filter((a) => isImage(a) && !urls[a.id]);
    if (!missing.length) return;
    let alive = true;
    void supabaseBrowser().storage.from(BUCKET).createSignedUrls(missing.map((a) => a.path), 3600).then(({ data }) => {
      if (!alive || !data) return;
      // Un échec est noté « - » pour ne pas redemander le lien en boucle.
      setUrls((u) => ({ ...u, ...Object.fromEntries(missing.map((m, i) => [m.id, data[i]?.signedUrl || "-"])) }));
    });
    return () => {
      alive = false;
    };
  }, [assets, urls]);

  async function add(files: Iterable<File>) {
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`« ${file.name} » dépasse 50 Mo.`);
        continue;
      }
      if (containsSecret(file.name)) {
        toast.error(SECRET_MESSAGE);
        continue;
      }
      setBusy((n) => n + 1);
      const id = newId();
      const path = `${id}${/\.[a-z0-9]{1,8}$/i.exec(file.name)?.[0].toLowerCase() ?? ""}`;
      const { error } = await supabaseBrowser().storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (error) toast.error(`Impossible d'ajouter « ${file.name} ».`);
      else {
        const ok = await assetsStore.insert({ id, name: file.name, folder, path, mime: file.type || null, size: file.size, added_by: me.id, created_at: new Date().toISOString() });
        if (!ok) await supabaseBrowser().storage.from(BUCKET).remove([path]);
      }
      setBusy((n) => n - 1);
    }
  }

  async function download(a: Asset) {
    const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(a.path, 300, { download: a.name });
    if (error || !data) return void toast.error("Téléchargement impossible.");
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = a.name;
    link.click();
  }
  async function remove(a: Asset) {
    if (!window.confirm(`Supprimer « ${a.name} » ?`)) return;
    await supabaseBrowser().storage.from(BUCKET).remove([a.path]);
    void assetsStore.remove(a.id);
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        void add(e.dataTransfer.files);
      }}
    >
      <ViewHeader title="Ressources">
        <select value={folder} onChange={(e) => (e.target.value === "+" ? setFolder(window.prompt("Nom du nouveau groupe ?")?.trim() || folder) : setFolder(e.target.value))} aria-label="Groupe où ranger les fichiers ajoutés" className="h-9 max-w-[220px] rounded-lg border border-line bg-glass px-2.5 text-[13px] outline-none focus:border-line-strong">
          {[...new Set([...folders, folder])].map((f) => <option key={f} value={f}>Ranger dans : {f}</option>)}
          <option value="+">+ Nouveau groupe…</option>
        </select>
        <button type="button" onClick={() => input.current?.click()} disabled={busy > 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-[13.5px] font-semibold text-background disabled:opacity-50">
          <Upload className="size-4" aria-hidden /> {busy > 0 ? "Envoi…" : "Ajouter des fichiers"}
        </button>
        <input ref={input} type="file" multiple className="sr-only" aria-label="Ajouter des fichiers" onChange={(e) => { void add(e.target.files ?? []); e.target.value = ""; }} />
      </ViewHeader>

      <div className={cn("flex min-w-0 flex-col gap-6 px-4 pb-24 md:px-6", dropping && "opacity-60")}>
        {assetsStore.loaded && !assets.length && (
          <button type="button" onClick={() => input.current?.click()} className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center transition-colors duration-100 hover:bg-glass">
            <p className="text-[16px] font-semibold">Dépose ici les logos et les visuels</p>
            <p className="mt-1 text-[13.5px] text-muted-foreground">Glisse des fichiers sur la page, ou clique pour les choisir.</p>
          </button>
        )}
        {groups.map((g) => (
          <section key={g.folder}>
            <h2 className="mb-2.5 text-[20px] font-semibold">{g.folder} <span className="num ml-1 text-[12px] font-medium text-faint">{g.list.length}</span></h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {g.list.map((a) => (
                <li key={a.id} className="glass group relative flex min-w-0 flex-col overflow-hidden rounded-2xl">
                  <button type="button" onClick={() => void download(a)} title={`Télécharger ${a.name}`} className="relative grid aspect-square place-items-center bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {isImage(a) && urls[a.id]?.startsWith("http") ? (
                      // eslint-disable-next-line @next/next/no-img-element -- lien signé du stockage privé
                      <img src={urls[a.id]} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="flex flex-col items-center gap-1.5 text-muted-foreground"><FileText className="size-8" aria-hidden /><span className="num text-[11px]">{ext(a.name) || "FICHIER"}</span></span>
                    )}
                    <span className="absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 transition-opacity duration-100 group-hover:opacity-100"><Download className="size-6" aria-hidden /></span>
                  </button>
                  <div className="flex items-center gap-1 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium" title={a.name}>{a.name}</span>
                      <span className="num block text-[11px] text-faint">{[ext(a.name), weight(a.size)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <button type="button" onClick={() => void remove(a)} aria-label={`Supprimer ${a.name}`} title="Supprimer" className="grid size-7 shrink-0 place-items-center rounded-lg text-faint hover:bg-bad-soft hover:text-bad"><Trash2 className="size-3.5" aria-hidden /></button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
