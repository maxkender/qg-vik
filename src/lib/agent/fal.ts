import "server-only";
import type { z } from "zod";

/**
 * Le modèle de langage, hébergé sur fal. Variables Vercel : FAL_API_KEY, FAL_LLM_MODEL (le modèle),
 * et au besoin FAL_LLM_ENDPOINT (par défaut « fal-ai/any-llm »). La réponse doit être un JSON, validé par zod.
 */
const falKey = () => (process.env.FAL_API_KEY ?? process.env.FAL_KEY ?? "").trim();
export const falReady = () => Boolean(falKey());
export const FAL_MODEL = () => process.env.FAL_LLM_MODEL || "google/gemini-2.5-flash";

export async function llmJson<T>(schema: z.ZodType<T>, system: string, prompt: string): Promise<T> {
  const res = await fetch(`https://fal.run/${process.env.FAL_LLM_ENDPOINT || "fal-ai/any-llm"}`, {
    method: "POST", cache: "no-store",
    headers: { Authorization: `Key ${falKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: FAL_MODEL(), system_prompt: `${system}\nRéponds uniquement par un objet JSON valide, sans texte autour.`, prompt }),
  });
  if (!res.ok) throw new Error(`FAL : réponse ${res.status} (${(await res.text()).slice(0, 160)})`);
  const data = (await res.json()) as { output?: string; error?: string };
  const text = data.output ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`FAL : pas de JSON dans la réponse${data.error ? ` (${data.error})` : ""}`);
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("FAL : JSON illisible");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(`FAL : JSON refusé (${parsed.error.issues.slice(0, 2).map((i) => `${i.path.join(".")} ${i.message}`).join(" ; ")})`);
  return parsed.data;
}
