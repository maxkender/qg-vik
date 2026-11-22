import "server-only";
import { createSign } from "node:crypto";

/**
 * Avis App Store (API App Store Connect, Customer Reviews) et Google Play (API Android Publisher).
 * Lecture pendant la synchro ; la réponse à un avis n'est publiée que sur un clic « Publier ».
 * Variables Vercel : ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.
 */
export type Review = { id: string; store: "app_store" | "play"; appRef: string; author: string | null; title: string | null; text: string; rating: number; at: string; country: string | null; lang: string | null; url: string };

const b64 = (v: object | string) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
const pem = (raw: string) => raw.replace(/\\n/g, "\n").trim();
function jwt(header: object, payload: object, key: string, alg: "ES256" | "RS256") {
  const data = `${b64(header)}.${b64(payload)}`;
  const signer = createSign("SHA256").update(data);
  const sig = alg === "ES256" ? signer.sign({ key: pem(key), dsaEncoding: "ieee-p1363" }) : signer.sign(pem(key));
  return `${data}.${sig.toString("base64url")}`;
}
async function call<T>(label: string, url: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${label} : réponse ${res.status} (${(await res.text()).slice(0, 160)})`);
  return (res.status === 204 ? {} : await res.json()) as T;
}

// ------------------------------------------------------------------ App Store
export const ascReady = () => Boolean(process.env.ASC_ISSUER_ID && process.env.ASC_KEY_ID && process.env.ASC_PRIVATE_KEY);
const ascToken = () => {
  const now = Math.floor(Date.now() / 1000);
  return jwt({ alg: "ES256", kid: process.env.ASC_KEY_ID, typ: "JWT" }, { iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 900, aud: "appstoreconnect-v1" }, process.env.ASC_PRIVATE_KEY!, "ES256");
};
const ASC = "https://api.appstoreconnect.apple.com/v1";

/** Toutes les apps du compte : identifiant App Store Connect et bundle id. */
export async function ascApps(): Promise<{ id: string; bundleId: string; name: string }[]> {
  const out = await call<{ data: { id: string; attributes: { bundleId: string; name: string } }[] }>("App Store Connect", `${ASC}/apps?limit=200&fields[apps]=bundleId,name`, ascToken());
  return out.data.map((a) => ({ id: a.id, bundleId: a.attributes.bundleId, name: a.attributes.name }));
}
export async function ascReviews(appId: string, since: string): Promise<Review[]> {
  type Page = { data: { id: string; attributes: { rating: number; title: string | null; body: string | null; reviewerNickname: string | null; createdDate: string; territory: string | null } }[]; links?: { next?: string } };
  const reviews: Review[] = [];
  let url: string | undefined = `${ASC}/apps/${appId}/customerReviews?sort=-createdDate&limit=200`;
  for (let page = 0; url && page < 5; page++) {
    const out: Page = await call<Page>("App Store Connect", url, ascToken());
    for (const r of out.data) {
      if (r.attributes.createdDate <= since) return reviews;
      reviews.push({ id: r.id, store: "app_store", appRef: appId, author: r.attributes.reviewerNickname, title: r.attributes.title, text: r.attributes.body ?? "", rating: r.attributes.rating, at: r.attributes.createdDate, country: r.attributes.territory, lang: null, url: `https://appstoreconnect.apple.com/apps/${appId}/distribution/reviews` });
    }
    url = out.links?.next;
  }
  return reviews;
}
export const ascPublish = (reviewId: string, text: string) =>
  call("App Store Connect", `${ASC}/customerReviewResponses`, ascToken(), { data: { type: "customerReviewResponses", attributes: { responseBody: text }, relationships: { review: { data: { type: "customerReviews", id: reviewId } } } } });

// ---------------------------------------------------------------- Google Play
export const playReady = () => Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
let playCache: { value: string; until: number } | null = null;
async function playToken(): Promise<string> {
  if (playCache && playCache.until > Date.now()) return playCache.value;
  let account: { client_email?: string; private_key?: string };
  try {
    account = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON!);
  } catch {
    throw new Error("Google Play : GOOGLE_PLAY_SERVICE_ACCOUNT_JSON n'est pas un JSON valide");
  }
  if (!account.client_email || !account.private_key) throw new Error("Google Play : compte de service incomplet");
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt({ alg: "RS256", typ: "JWT" }, { iss: account.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3000 }, account.private_key, "RS256");
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const out = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!out.access_token) throw new Error(`Google Play : jeton refusé (${out.error ?? res.status})`);
  playCache = { value: out.access_token, until: Date.now() + 45 * 60_000 };
  return out.access_token;
}
const PLAY = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
/** Les avis récents d'une app Android (Google ne rend que ceux de la dernière semaine). */
export async function playReviews(pkg: string, since: string): Promise<Review[]> {
  type Out = { reviews?: { reviewId: string; authorName?: string; comments?: { userComment?: { text?: string; starRating?: number; reviewerLanguage?: string; lastModified?: { seconds?: string } } }[] }[] };
  const out = await call<Out>("Google Play", `${PLAY}/${pkg}/reviews?maxResults=100`, await playToken());
  return (out.reviews ?? []).flatMap((r) => {
    const c = r.comments?.[0]?.userComment;
    const at = c?.lastModified?.seconds ? new Date(Number(c.lastModified.seconds) * 1000).toISOString() : null;
    if (!c || !at || at <= since || !c.starRating) return [];
    const lang = c.reviewerLanguage ?? null;
    return [{ id: r.reviewId, store: "play" as const, appRef: pkg, author: r.authorName ?? null, title: null, text: (c.text ?? "").trim(), rating: c.starRating, at, country: lang?.split("_")[1] ?? null, lang: lang?.split("_")[0] ?? null, url: `https://play.google.com/store/apps/details?id=${pkg}&reviewId=${encodeURIComponent(r.reviewId)}` }];
  });
}
export const playPublish = async (pkg: string, reviewId: string, text: string) => call("Google Play", `${PLAY}/${pkg}/reviews/${encodeURIComponent(reviewId)}:reply`, await playToken(), { replyText: text.slice(0, 350) });
