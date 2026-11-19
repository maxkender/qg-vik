import { Suspense } from "react";
import { MeetingsView } from "@/components/meetings/meetings-view";

// Les réunions : les planifier, les préparer, les enregistrer à la voix, garder le compte rendu.
export default function MeetingsPage() {
  return (
    <Suspense fallback={null}>
      <MeetingsView />
    </Suspense>
  );
}
