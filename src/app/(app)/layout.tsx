import { AssistantBubble } from "@/components/assistant/bubble";
import { Logo } from "@/components/logo";
import { SearchDialog } from "@/components/app/search";
import { AppShell } from "@/components/app/shell";
import { ViewStateProvider } from "@/components/app/view-state";
import { PagesNav } from "@/components/pages/pages-nav";
import { ItemSheet } from "@/components/planner/item-sheet";
import { SessionProvider } from "@/components/session-provider";

function Loading() {
  return (
    <div className="grid flex-1 place-items-center" role="status" aria-label="Chargement du QG">
      <Logo className="h-7 animate-pulse" />
    </div>
  );
}

// Toutes les pages du QG (une fois connecté) vivent sous ce layout.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SessionProvider fallback={<Loading />}>
      <ViewStateProvider>
        <AppShell
          pagesNav={<PagesNav />}
          search={
            <>
              <SearchDialog />
              <ItemSheet />
              <AssistantBubble />
            </>
          }
        >
          {children}
        </AppShell>
      </ViewStateProvider>
    </SessionProvider>
  );
}
