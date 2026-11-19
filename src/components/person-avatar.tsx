"use client";

import { profilesStore } from "@/lib/data";
import type { Owner } from "@/lib/members";
import { useRows } from "@/lib/store";
import { cn } from "@/lib/utils";

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
const PHOTO = { xs: "size-5 rounded-md", sm: "size-7 rounded-lg", lg: "size-14 rounded-2xl" } as const;

/** Pastille d'une personne : sa photo si elle en a mis une, sinon son initiale (Max en teal, Adrien en rose). */
export function PersonAvatar({
  who,
  size = "sm",
  className,
}: {
  who: Owner;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const photo = useRows(profilesStore).find((p) => p.short === who)?.avatar;
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element -- petite image déjà dans la page, rien à optimiser
    return <img src={photo} alt="" aria-hidden className={cn("shrink-0 object-cover", PHOTO[size], className)} />;
  }
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
