import { createElement, type ComponentProps } from "react";
import { FileText } from "lucide-react";
import { PAGE_ICONS } from "@/lib/pages";

/** L'icône d'une page (choisie parmi PAGE_ICONS). */
export function PageIcon({ icon, ...props }: { icon: string | null | undefined } & ComponentProps<typeof FileText>) {
  return createElement(PAGE_ICONS[icon ?? "file"] ?? FileText, { "aria-hidden": true, ...props });
}
