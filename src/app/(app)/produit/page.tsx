import { Suspense } from "react";
import { ProduitView } from "@/components/produit/produit-view";

// Le produit vu de l'intérieur des apps : onboarding, réponses, rétention, paywall.
export default function ProduitPage() {
  return (
    <Suspense fallback={null}>
      <ProduitView />
    </Suspense>
  );
}
