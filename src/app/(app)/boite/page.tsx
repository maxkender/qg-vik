import { Suspense } from "react";
import { MailboxView } from "@/components/agent/mailbox-view";

// Le récap de la boîte de Max : à lire, à traiter, et le reste compté en une ligne.
export default function MailboxPage() {
  return (
    <Suspense fallback={null}>
      <MailboxView />
    </Suspense>
  );
}
