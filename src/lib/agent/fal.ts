import "server-only";
import type { z } from "zod";
import { MODEL, callGemini } from "@/lib/assistant/gemini";

/**
 * Le modèle de langage, hébergé sur fal. Variables Vercel : FAL_API_KEY, FAL_LLM_MODEL (le modèle),
 * et au besoin FAL_LLM_ENDPOINT (par défaut « fal-ai/any-llm »). La réponse doit être un JSON, validé par zod.
 */
const falKey = () => (process.env.FAL_API_KEY ?? process.env.FAL_KEY ?? "").trim();
export const falReady = () => Boolean(falKey() || geminiKey());
export const FAL_MODEL = () => (falKey() ? process.env.FAL_LLM_MODEL || "google/gemini-2.5-flash" : MODEL);

const geminiKey = () => (process.env.GEMINI_API_KEY ?? "").trim();
/** Sans clé FAL, le classement passe par la clé Gemini du QG (celle de l'assistant). */
const viaGemini = () => !falKey() && Boolean(geminiKey());

async function ask(system: string, prompt: string): Promise<string> {
  if (viaGemini()) {
    const res = await callGemini(geminiKey(), "generateContent", { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } });
    if (!res.ok) throw new Error(`Gemini : réponse ${res.status} (${(await res.text()).slice(0, 160)})`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  }
  const res = await fetch(`https://fal.run/${process.env.FAL_LLM_ENDPOINT || "fal-ai/any-llm"}`, {
    method: "POST", cache: "no-store",
    headers: { Authorization: `Key ${falKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.FAL_LLM_MODEL || "google/gemini-2.5-flash", system_prompt: system, prompt }),
  });
  if (!res.ok) throw new Error(`FAL : réponse ${res.status} (${(await res.text()).slice(0, 160)})`);
  return ((await res.json()) as { output?: string }).output ?? "";
}

export async function llmJson<T>(schema: z.ZodType<T>, system: string, prompt: string): Promise<T> {
  const text = await ask(`${system}\nRéponds uniquement par un objet JSON valide, sans texte autour.`, prompt);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Modèle : pas de JSON dans la réponse");
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Modèle : JSON illisible");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(`Modèle : JSON refusé (${parsed.error.issues.slice(0, 2).map((i) => `${i.path.join(".")} ${i.message}`).join(" ; ")})`);
  return parsed.data;
}
