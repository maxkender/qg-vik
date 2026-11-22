import { Suspense } from "react";
import { AppView } from "@/components/apps/app-view";

// La fiche d'une app : ses chiffres, ses pays, ses labels, ses décisions et ses tâches.
export default function AppPage() {
  return (
    <Suspense fallback={null}>
      <AppView />
    </Suspense>
  );
}
