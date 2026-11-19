import { Suspense } from "react";
import { WeekView } from "@/components/week/week-view";

// La page de la réunion du lundi : comment la semaine s'est passée, et où sont les trous.
export default function WeekPage() {
  return (
    <Suspense fallback={null}>
      <WeekView />
    </Suspense>
  );
}
