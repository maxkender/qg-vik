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

const BINARY = /^(image\/(png|jpeg|webp)|application\/pdf|audio\/[a-z0-9.+-]+)$/;
/** Les fichiers joints, vérifiés : images, PDF et audio tels quels, le reste sous forme de texte. */
export function attachmentParts(input: unknown): Part[] {
  if (!Array.isArray(input)) return [];
  const parts: Part[] = [];
  let weight = 0;
  for (const raw of input.slice(0, 6)) {
    const a = raw as { name?: unknown; mime?: unknown; data?: unknown; text?: unknown };
    const name = String(a.name ?? "fichier").slice(0, 120);
    if (typeof a.text === "string" && a.text.trim()) {
      const text = a.text.slice(0, 200_000);
      weight += text.length;
      if (weight < 4_200_000) parts.push({ text: `Fichier joint « ${name} » :\n${text}` });
    } else if (typeof a.data === "string" && BINARY.test(String(a.mime)) && /^[A-Za-z0-9+/=]+$/.test(a.data)) {
      weight += a.data.length;
      if (weight < 4_200_000) parts.push({ text: `Fichier joint « ${name} » :` }, { inlineData: { mimeType: String(a.mime), data: a.data } });
    }
  }
  return parts;
}
