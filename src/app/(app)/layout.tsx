import { AppShell } from "@/components/app/shell";
import { ViewStateProvider } from "@/components/app/view-state";
import { SessionProvider } from "@/components/session-provider";

function Loading() {
  return (
    <div className="grid flex-1 place-items-center" role="status" aria-label="Chargement du QG">
      <span className="font-heading text-2xl font-extrabold tracking-[-0.02em] text-faint">
        QG Vik<span className="animate-pulse text-now">.</span>
      </span>
    </div>
  );
}

// Toutes les pages du QG (une fois connecté) vivent sous ce layout.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SessionProvider fallback={<Loading />}>
      <ViewStateProvider>
        <AppShell>{children}</AppShell>
      </ViewStateProvider>
    </SessionProvider>
  );
}
