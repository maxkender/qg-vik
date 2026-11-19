import "server-only";

// Modèle Gemini. « gemini-flash-latest » suit la dernière version ; GEMINI_MODEL permet d'en choisir un autre.
export const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
export const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export type Part = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  [k: string]: unknown;
};
export type Content = { role: "user" | "model"; parts: Part[] };

/** Le message à montrer quand Gemini répond par une erreur. */
export function geminiError(status: number, detail: string): string {
  if (status === 400 && /API key/i.test(detail)) return "La clé GEMINI_API_KEY est refusée : vérifie-la dans Vercel.";
  if (status === 401 || status === 403) return "La clé GEMINI_API_KEY n'a pas accès à Gemini : vérifie que l'API « Generative Language » est activée et autorisée pour cette clé.";
  if (status === 404) return `Le modèle « ${MODEL} » est introuvable.`;
  if (status === 429) return "Quota Gemini atteint. Réessaie dans une minute.";
  return `L'assistant est indisponible (erreur ${status}).`;
}

export function callGemini(apiKey: string, method: "generateContent" | "streamGenerateContent", body: Record<string, unknown>) {
  return fetch(`${ENDPOINT}/${MODEL}:${method}${method === "streamGenerateContent" ? "?alt=sse" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
}

const IMAGE = /^image\/(png|jpeg|webp)$/;
/** Ne garde que de vraies images, de taille raisonnable (4 au plus). */
export function cleanImages(input: unknown): { mimeType: string; data: string }[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((i) => ({ mimeType: String((i as { mime?: unknown }).mime ?? ""), data: String((i as { data?: unknown }).data ?? "") }))
    .filter((i) => IMAGE.test(i.mimeType) && i.data.length > 0 && i.data.length < 4_000_000 && /^[A-Za-z0-9+/=]+$/.test(i.data))
    .slice(0, 4);
}
