"use client";

import { FileText, Paperclip, X } from "lucide-react";
import type { Attachment } from "@/lib/attachments";

/** Les fichiers joints, avant l'envoi : une vignette par image, une étiquette par document. */
export function AttachmentChips({ files, onRemove, className }: { files: Attachment[]; onRemove: (index: number) => void; className?: string }) {
  if (!files.length) return null;
  return (
    <div className={className}>
      {files.map((f, i) => (
        <span key={i} className="relative">
          {f.mime.startsWith("image/") && f.data ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu d'une image locale
            <img src={`data:${f.mime};base64,${f.data}`} alt={f.name} className="size-12 rounded-lg object-cover" />
          ) : (
            <span className="flex h-12 max-w-[150px] items-center gap-1.5 rounded-lg border border-line px-2 text-[12px]">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{f.name}</span>
            </span>
          )}
          <button type="button" onClick={() => onRemove(i)} aria-label={`Retirer ${f.name}`} className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-foreground text-background">
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}

/** Le trombone : choisir un ou plusieurs fichiers. */
export function AttachButton({ onFiles, label }: { onFiles: (files: File[]) => void; label: string }) {
  return (
    <label title="Joindre un fichier (ou colle-le, ou glisse-le ici)" className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-foreground">
      <Paperclip className="size-4" aria-hidden />
      <input
        type="file"
        multiple
        aria-label={label}
        className="sr-only"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </label>
  );
}
