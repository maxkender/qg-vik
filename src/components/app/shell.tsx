"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Moon, Plus, Search, Sun } from "lucide-react";
import { useView, type WhoFilter } from "@/components/app/view-state";
import { PersonAvatar } from "@/components/person-avatar";
import { QuickAdd } from "@/components/planner/quick-add";
import { logout, useMe } from "@/components/session-provider";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { itemsStore } from "@/lib/data";
import { DAYS_SHORT, MONTHS_SHORT, isoWeek } from "@/lib/dates";
import { NAV_ALL, NAV_PILOTAGE, NAV_PLANNING, type NavItem } from "@/lib/nav";
import { useRows, useSync } from "@/lib/store";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children, pagesNav, search }: { children: ReactNode; pagesNav?: ReactNode; search?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { quickAddOpen, setQuickAddOpen, setSearchOpen } = useView();

  // Raccourcis : N = nouvelle tâche, 1 à 9 = changer de vue, / = recherche.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          setSearchOpen(true);
        }
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("[role=dialog],[role=menu]")) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setQuickAddOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
      } else {
        const target = NAV_ALL.find((n) => n.key === e.key);
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, setQuickAddOpen, setSearchOpen]);

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <Rail pathname={pathname} pagesNav={pagesNav} />
      <TopBar pathname={pathname} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>

      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent showCloseButton={false} className="glass-strong top-[22%] translate-y-0 gap-0 rounded-3xl border-0 p-2 sm:max-w-xl">
          <DialogTitle className="sr-only">Nouvelle tâche</DialogTitle>
          <DialogDescription className="sr-only">
            Tape la tâche. Tu peux ajouter !urgent, @adrien ou une date comme demain.
          </DialogDescription>
          <QuickAdd autoFocus onDone={() => setQuickAddOpen(false)} className="border-0 bg-transparent shadow-none backdrop-blur-none" />
        </DialogContent>
      </Dialog>
      {search}
    </div>
  );
}

// ----------------------------------------------------------------- le rail
function Rail({ pathname, pagesNav }: { pathname: string; pagesNav?: ReactNode }) {
  const { today, setQuickAddOpen, setSearchOpen } = useView();
  const items = useRows(itemsStore);
  const { sees } = useView();
  const urgent = items.filter((i) => !i.parent_id && !i.done && i.prio === "urgent" && sees(i.owner)).length;

  return (
    <aside className="glass m-2 mr-0 hidden w-[232px] shrink-0 flex-col rounded-2xl md:flex">
      <div className="px-4 pt-4 pb-3">
        <Link href="/" className="font-heading text-[21px] leading-none font-extrabold tracking-[-0.02em]">
          QG Vik<span className="text-now">.</span>
        </Link>
        <p className="num mt-1.5 text-[11px] text-muted-foreground">
          {DAYS_SHORT[today.getDay()]} {today.getDate()} {MONTHS_SHORT[today.getMonth()]} · S{isoWeek(today)[1]}
        </p>
      </div>

      <div className="flex gap-1.5 px-2.5 pb-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line px-2.5 text-[12.5px] text-muted-foreground transition-colors duration-100 hover:border-line-strong hover:text-foreground"
        >
          <Search className="size-3.5 shrink-0" aria-hidden />
          <span className="flex-1 truncate text-left">Rechercher</span>
          <kbd className="num text-[10.5px] text-faint">/</kbd>
        </button>
        <button
          type="button"
          onClick={() => setQuickAddOpen(true)}
          title="Nouvelle tâche (N)"
          aria-label="Nouvelle tâche"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background transition-opacity duration-100 hover:opacity-85"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>

      <nav aria-label="Sections" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-2">
        <NavGroup label="Planning" items={NAV_PLANNING} pathname={pathname} badge={{ "/": urgent }} />
        <NavGroup label="Pilotage" items={NAV_PILOTAGE} pathname={pathname} />
        {pagesNav}
      </nav>

      <RailFooter />
    </aside>
  );
}

function NavGroup({ label, items, pathname, badge }: { label: string; items: NavItem[]; pathname: string; badge?: Record<string, number> }) {
  return (
    <>
      <p className="px-2 pt-3 pb-1 text-[10.5px] font-semibold tracking-[0.1em] text-faint uppercase">{label}</p>
      {items.map((n) => {
        const active = isActive(pathname, n.href);
        const count = badge?.[n.href];
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13.5px] font-medium transition-colors duration-100",
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <n.icon className={cn("size-4 shrink-0", active ? "text-now" : "text-faint group-hover:text-muted-foreground")} aria-hidden />
            <span className="flex-1 truncate">{n.label}</span>
            {count ? <span className="num rounded-md bg-bad-soft px-1.5 text-[11px] leading-[18px] text-bad">{count}</span> : null}
            {!count && n.key && <kbd className="num text-[10.5px] text-faint opacity-0 group-hover:opacity-100">{n.key}</kbd>}
          </Link>
        );
      })}
    </>
  );
}

const WHO_OPTIONS: { value: WhoFilter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "max", label: "Max" },
  { value: "adrien", label: "Adrien" },
];

/** Filtre « Voir » : Tous / Max / Adrien. */
export function WhoSwitch({ className }: { className?: string }) {
  const { who, setWho } = useView();
  return (
    <div role="group" aria-label="Voir les tâches de" className={cn("flex rounded-[10px] border border-line bg-glass p-[3px]", className)}>
      {WHO_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={who === o.value}
          onClick={() => setWho(o.value)}
          className={cn(
            "h-[26px] flex-1 rounded-[7px] px-2.5 text-[12.5px] font-medium transition-colors duration-100",
            who === o.value ? "bg-accent text-foreground shadow-[0_0_0_1px_var(--line-strong)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SyncDot({ withLabel }: { withLabel?: boolean }) {
  const s = useSync();
  const state = !s.online
    ? { tone: "bg-warn", label: "Hors ligne" }
    : s.error
      ? { tone: "bg-bad", label: s.error }
      : s.pending > 0
        ? { tone: "bg-info animate-pulse", label: "Enregistrement…" }
        : s.live
          ? { tone: "bg-good", label: "Synchronisé" }
          : { tone: "bg-faint", label: "Connexion…" };
  return (
    <span role="status" title={state.label} className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-faint">
      <span className={cn("size-1.5 shrink-0 rounded-full", state.tone)} aria-hidden />
      <span className={cn("truncate", !withLabel && "sr-only")}>{state.label}</span>
    </span>
  );
}

export function ThemeToggle() {
  // Rendu uniquement dans le navigateur (après la connexion) : on peut lire la page.
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("qg-theme", next ? "dark" : "light");
    } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next ? "#101113" : "#f6f5f2");
  }
  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Passer en thème clair" : "Passer en thème sombre"}
      aria-label={dark ? "Passer en thème clair" : "Passer en thème sombre"}
      className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground"
    >
      {dark ? <Sun className="size-3.5" aria-hidden /> : <Moon className="size-3.5" aria-hidden />}
    </button>
  );
}

function RailFooter() {
  const me = useMe();
  return (
    <div className="flex flex-col gap-2.5 border-t border-line p-2.5">
      <div>
        <p className="px-1.5 pb-1.5 text-[10.5px] font-semibold tracking-[0.1em] text-faint uppercase">Voir</p>
        <WhoSwitch />
      </div>
      <div className="flex items-center gap-2 px-1">
        <PersonAvatar who={me.short} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-tight font-medium">{me.name}</p>
          <SyncDot withLabel />
        </div>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => void logout()}
          title="Se déconnecter"
          aria-label="Se déconnecter"
          className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground"
        >
          <LogOut className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------ la barre sur mobile
function TopBar({ pathname }: { pathname: string }) {
  const me = useMe();
  const { setQuickAddOpen, setSearchOpen } = useView();
  return (
    <header className="glass sticky top-0 z-30 shrink-0 rounded-none border-x-0 border-t-0 pt-[env(safe-area-inset-top)] md:hidden">
      <div className="flex items-center gap-2 px-4 pt-2.5">
        <Link href="/" className="font-heading text-[19px] font-extrabold tracking-[-0.02em]">
          QG Vik<span className="text-now">.</span>
        </Link>
        <SyncDot />
        <span className="flex-1" />
        <button type="button" onClick={() => setSearchOpen(true)} aria-label="Rechercher" className="grid size-9 place-items-center rounded-lg text-muted-foreground">
          <Search className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={() => setQuickAddOpen(true)} aria-label="Nouvelle tâche" className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
          <Plus className="size-4" aria-hidden />
        </button>
        <ThemeToggle />
        <button type="button" onClick={() => void logout()} aria-label={`${me.name}, se déconnecter`} title="Se déconnecter">
          <PersonAvatar who={me.short} />
        </button>
      </div>
      <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
        {NAV_ALL.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap",
                active ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <n.icon className={cn("size-3.5", active && "text-now")} aria-hidden />
              {n.label}
            </Link>
          );
        })}
        <Link
          href="/pages"
          aria-current={pathname.startsWith("/pages") ? "page" : undefined}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-lg px-2.5 text-[13px] font-medium",
            pathname.startsWith("/pages") ? "bg-accent text-foreground" : "text-muted-foreground",
          )}
        >
          Pages
        </Link>
        <Link
          href="/a-lire"
          aria-current={pathname === "/a-lire" ? "page" : undefined}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap",
            pathname === "/a-lire" ? "bg-accent text-foreground" : "text-muted-foreground",
          )}
        >
          À lire
        </Link>
      </nav>
    </header>
  );
}

/** En-tête d'une vue : titre, sous-titre, actions à droite. */
export function ViewHeader({ title, sub, children, eyebrow }: { title: ReactNode; sub?: ReactNode; children?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-3 px-4 pt-4 pb-4 md:px-6 md:pt-6">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 font-heading text-[14px] font-extrabold text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-[28px] leading-[1.05] font-extrabold md:text-[32px]">{title}</h1>
        {sub && <p className="mt-1.5 text-[13.5px] text-muted-foreground">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
