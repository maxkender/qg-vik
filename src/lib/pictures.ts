/** Une image prête à être envoyée à l'assistant. */
export type Picture = { mime: string; data: string };

/** Réduit une image (capture d'écran, photo) à 1 600 px de large au plus avant de l'envoyer. */
export async function shrink(file: File): Promise<Picture> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { mime: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1] };
}

/** Les images d'un lot de fichiers (glissés, collés ou choisis), 4 au plus en tout. */
export async function readPictures(files: Iterable<File>, already: number): Promise<Picture[]> {
  const images = [...files].filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, 4 - already));
  return Promise.all(images.map(shrink));
}
