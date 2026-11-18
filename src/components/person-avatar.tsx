import { cn } from "@/lib/utils";
import type { Owner } from "@/lib/members";

const LABEL: Record<Owner, string> = { max: "M", adrien: "A", both: "M+A" };
const TONE: Record<Owner, string> = {
  max: "bg-max-soft text-max",
  adrien: "bg-adrien-soft text-adrien",
  both: "bg-both-soft text-both",
};
const SIZE = {
  xs: "h-5 min-w-5 rounded-md px-1 text-[10px]",
  sm: "h-7 min-w-7 rounded-lg px-1.5 text-[12px]",
  lg: "size-14 rounded-2xl text-[26px]",
} as const;

/** Pastille d'une personne : Max en teal, Adrien en rose, les deux en gris. */
export function PersonAvatar({
  who,
  size = "sm",
  className,
}: {
  who: Owner;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center font-heading font-semibold select-none",
        TONE[who],
        SIZE[size],
        className,
      )}
    >
      {LABEL[who]}
    </span>
  );
}
