"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

/** Petites notifications en bas de l'écran, aux couleurs du QG. */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    className="toaster group"
    toastOptions={{
      classNames: {
        toast: "glass-strong !rounded-xl !text-foreground !text-[13px]",
        description: "!text-muted-foreground",
      },
    }}
    {...props}
  />
)

export { Toaster }
