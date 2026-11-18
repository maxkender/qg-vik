"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Check, Undo2 } from "lucide-react";
import { ViewHeader } from "@/components/app/shell";
import { PersonAvatar } from "@/components/person-avatar";
import { useMe } from "@/components/session-provider";
import { pagesStore, profilesStore, readsStore } from "@/lib/data";
import { MEMBERS, type Who } from "@/lib/members";
import { ago, pageHref, pageTitle } from "@/lib/pages";
import { PageIcon } from "@/components/pages/page-icon";
import { useRows } from "@/lib/store";
import type { ReadRow } from "@/lib/types";
import { cn } from "@/lib/utils";

// Les documents que l'autre m'a envoyés, et ceux que je lui ai envoyés.
export default function ToReadPage() {
  const me = useMe();
  const reads = useRows(readsStore);
  const pages = useRows(pagesStore);
  const profiles = useRows(profilesStore);
  const other: Who = me.short === "max" ? "adrien" : "max";

  const alive = useMemo(() => reads.filter((r) => pages.some((p) => p.id === r.page_id && !p.archived_at)), [reads, pages]);
  const mine = alive.filter((r) => r.for_who === me.short).sort((a, b) => Number(Boolean(a.read_at)) - Number(Boolean(b.read_at)) || b.created_at.localeCompare(a.created_at));
  const sent = alive.filter((r) => r.for_who === other && r.sent_by === me.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const unread = mine.filter((r) => !r.read_at).length;

  const Row = (r: ReadRow, incoming: boolean) => {
    const page = pages.find((p) => p.id === r.page_id)!;
    const from = profiles.find((p) => p.id === r.sent_by);
    return (
      <li key={r.id} className={cn("flex items-start gap-3 py-3", r.read_at && incoming && "opacity-55")}>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><PageIcon icon={page.icon} className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <Link href={pageHref(page.id)} className="block truncate text-[14.5px] font-semibold hover:underline">{pageTitle(page)}</Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
            {incoming ? (
              <><PersonAvatar who={from?.short ?? "both"} size="xs" /> {from?.name ?? "Quelqu'un"} · {ago(r.created_at)}</>
            ) : (
              <>Envoyé {ago(r.created_at)} · {r.read_at ? `lu ${ago(r.read_at)}` : "pas encore lu"}</>
            )}
          </p>
          {r.note && <p className="mt-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-[13px] whitespace-pre-wrap">{r.note}</p>}
        </div>
        {incoming && (
          <button
            type="button"
            onClick={() => void readsStore.update(r.id, { read_at: r.read_at ? null : new Date().toISOString() })}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground"
          >
            {r.read_at ? <><Undo2 className="size-3.5" aria-hidden /> Non lu</> : <><Check className="size-3.5" aria-hidden /> Lu</>}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ViewHeader title="À lire" sub={unread ? `${unread} document${unread > 1 ? "s" : ""} à lire.` : "Tu es à jour."} />
      <div className="grid items-start gap-3 px-4 pb-16 md:px-6 lg:grid-cols-2">
        <section className="glass rounded-2xl p-4 sm:p-5">
          <h2 className="font-sans text-[14.5px] font-semibold tracking-normal">Pour moi</h2>
          {mine.length ? <ul className="divide-y divide-line">{mine.map((r) => Row(r, true))}</ul> : (
            <p className="mt-2 text-[13.5px] text-muted-foreground">Rien pour l&apos;instant. Quand {MEMBERS[other].nick} t&apos;envoie un document, il arrive ici.</p>
          )}
        </section>
        <section className="glass rounded-2xl p-4 sm:p-5">
          <h2 className="font-sans text-[14.5px] font-semibold tracking-normal">Envoyés à {MEMBERS[other].nick}</h2>
          {sent.length ? <ul className="divide-y divide-line">{sent.map((r) => Row(r, false))}</ul> : (
            <p className="mt-2 text-[13.5px] text-muted-foreground">Dans une page, clique sur « Envoyer à {MEMBERS[other].nick} ».</p>
          )}
        </section>
      </div>
    </div>
  );
}
