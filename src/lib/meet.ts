import "server-only";

/**
 * Google Meet : créer une salle (un lien) sans y entrer.
 * Trois variables Vercel, jamais dans le code ni dans la base :
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET : le client OAuth du projet Google de Vik Studios ;
 *   GOOGLE_MEET_REFRESH_TOKEN : l'autorisation donnée une fois par le compte Google qui possédera les salles.
 * Seul droit demandé : créer des salles Meet (meetings.space.created). Rien d'autre du compte n'est lisible.
 */
export const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";
export const meetClientReady = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const meetReady = () => meetClientReady() && Boolean(process.env.GOOGLE_MEET_REFRESH_TOKEN);
export const redirectUri = (origin: string) => `${origin}/api/meet/callback`;

async function token(params: Record<string, string>): Promise<{ access_token?: string; refresh_token?: string; error?: string; error_description?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  return (await res.json().catch(() => ({ error: `réponse ${res.status}` }))) as never;
}

/** Échange le code renvoyé par Google contre l'autorisation durable. */
export const exchangeCode = (code: string, origin: string) => token({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });

/** Crée une salle Meet et rend son adresse. Lève une erreur lisible sinon. */
export async function createMeetLink(): Promise<string> {
  const auth = await token({ grant_type: "refresh_token", refresh_token: process.env.GOOGLE_MEET_REFRESH_TOKEN! });
  if (!auth.access_token) {
    console.error("meet: jeton refusé", auth.error, auth.error_description);
    throw new Error("L'autorisation Google Meet a expiré ou a été retirée : il faut la redonner.");
  }
  // Accès ouvert : toute personne qui a le lien entre sans attendre d'être admise.
  const res = await fetch("https://meet.googleapis.com/v2/spaces", {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ config: { accessType: "OPEN" } }),
  });
  const json = (await res.json().catch(() => null)) as { meetingUri?: string; error?: { message?: string } } | null;
  if (!res.ok || !json?.meetingUri) {
    console.error("meet: création refusée", res.status, json?.error?.message);
    throw new Error(res.status === 403 ? "Google refuse la création : vérifie que l'API « Google Meet REST » est activée sur le projet." : "Google Meet n'a pas pu créer la salle.");
  }
  return json.meetingUri;
}
