import { Suspense } from "react";
import { ControlView } from "@/components/control/control-view";

// Control : recrutement, paie et autres problèmes de l'OS, relevés toutes les heures.
export default function ControlPage() {
  return (
    <Suspense fallback={null}>
      <ControlView />
    </Suspense>
  );
}
