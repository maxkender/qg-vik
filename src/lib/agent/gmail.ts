import "server-only";

/**
 * Gmail : lire les nouveaux mails, poser un brouillon, et envoyer une réponse quand un membre clique « Envoyer ».
 * Variables Vercel : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, et une autorisation par boîte
 * (GMAIL_REFRESH_TOKEN_MAX, GMAIL_REFRESH_TOKEN_SUPPORT). Rien n'est écrit dans la base ni dans le code.
 */
export const BOXES = {
  max: { email: "maximilien@vikstudios.com", env: "GMAIL_REFRESH_TOKEN_MAX" },
  support: { email: "support@vikstudios.com", env: "GMAIL_REFRESH_TOKEN_SUPPORT" },
} as const;
export type Box = keyof typeof BOXES;
export const isBox = (v: unknown): v is Box => v === "max" || v === "support";
export const GMAIL_SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose";
export const googleClientReady = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const gmailReady = (box: Box) => googleClientReady() && Boolean(process.env[BOXES[box].env]);
export const gmailUrl = (box: Box, threadId: string) => `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(BOXES[box].email)}#all/${threadId}`;

export async function googleToken(params: Record<string, string>): Promise<{ access_token?: string; refresh_token?: string; error?: string; error_description?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  return (await res.json().catch(() => ({ error: `réponse ${res.status}` }))) as never;
}

const tokens = new Map<Box, { value: string; until: number }>();
async function access(box: Box): Promise<string> {
  const cached = tokens.get(box);
  if (cached && cached.until > Date.now()) return cached.value;
  const out = await googleToken({ grant_type: "refresh_token", refresh_token: process.env[BOXES[box].env]! });
  if (!out.access_token) throw new Error(`Gmail ${box} : autorisation refusée (${out.error ?? "?"}), à redonner`);
  tokens.set(box, { value: out.access_token, until: Date.now() + 45 * 60_000 });
  return out.access_token;
}

async function api<T>(box: Box, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: init?.method ?? "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${await access(box)}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`Gmail ${box} : réponse ${res.status} (${(await res.text()).slice(0, 160)})`);
  return (await res.json()) as T;
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
type Raw = { id: string; threadId: string; internalDate: string; labelIds?: string[]; payload?: Part & { headers?: { name: string; value: string }[] } };
export type Mail = { id: string; threadId: string; at: number; from: string; fromEmail: string; subject: string; text: string; messageId: string | null };

const decode = (data: string) => Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function bodyOf(part: Part | undefined, type: string): string {
  if (!part) return "";
  if (part.mimeType === type && part.body?.data) return decode(part.body.data);
  return (part.parts ?? []).map((p) => bodyOf(p, type)).find(Boolean) ?? "";
}
const stripHtml = (html: string) => html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"');

export function readMail(raw: Raw): Mail {
  const header = (name: string) => raw.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  const from = header("from");
  const email = (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
  const text = (bodyOf(raw.payload, "text/plain") || stripHtml(bodyOf(raw.payload, "text/html"))).replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  return { id: raw.id, threadId: raw.threadId, at: Number(raw.internalDate), from: from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || email, fromEmail: email, subject: header("subject"), text: text.slice(0, 6000), messageId: header("message-id") || null };
}

/** Les mails reçus depuis `sinceMs`, du plus ancien au plus récent, sans ceux déjà connus. */
export async function newMails(box: Box, sinceMs: number, known: Set<string>, max = 50): Promise<Mail[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ q: `in:inbox after:${Math.floor(sinceMs / 1000)}`, maxResults: "100", ...(pageToken ? { pageToken } : {}) });
    const page = await api<{ messages?: { id: string }[]; nextPageToken?: string }>(box, `messages?${q}`);
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < 500);
  const fresh = ids.filter((id) => !known.has(id)).reverse().slice(0, max);
  const mails: Mail[] = [];
  for (const id of fresh) mails.push(readMail(await api<Raw>(box, `messages/${id}?format=full`)));
  return mails.filter((m) => m.fromEmail !== BOXES[box].email).sort((a, b) => a.at - b.at);
}

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
function mime(box: Box, r: { to: string; subject: string; text: string; inReplyTo: string | null }) {
  const subject = /^re\s*:/i.test(r.subject) ? r.subject : `Re: ${r.subject}`;
  return b64url([
    `From: ${BOXES[box].email}`, `To: ${r.to}`, `Subject: ${word(subject)}`,
    ...(r.inReplyTo ? [`In-Reply-To: ${r.inReplyTo}`, `References: ${r.inReplyTo}`] : []),
    "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", Buffer.from(r.text, "utf8").toString("base64"),
  ].join("\r\n"));
}
export type Reply = { to: string; subject: string; text: string; threadId: string; inReplyTo: string | null };

/** Pose (ou remplace) le brouillon de réponse dans la boîte. N'envoie rien. */
export async function saveDraft(box: Box, r: Reply, draftId?: string | null): Promise<string> {
  const body = { message: { raw: mime(box, r), threadId: r.threadId } };
  const out = await api<{ id: string }>(box, draftId ? `drafts/${draftId}` : "drafts", { method: draftId ? "PUT" : "POST", body });
  return out.id;
}
/** Envoie la réponse. Appelé seulement sur un clic « Envoyer » (ou par l'envoi automatique, désactivé par défaut). */
export async function sendReply(box: Box, r: Reply, draftId?: string | null): Promise<void> {
  if (draftId) {
    try {
      await saveDraft(box, r, draftId);
      await api(box, "drafts/send", { method: "POST", body: { id: draftId } });
      return;
    } catch {
      // Le brouillon a pu être supprimé à la main dans Gmail : on envoie directement.
    }
  }
  await api(box, "messages/send", { method: "POST", body: { raw: mime(box, r), threadId: r.threadId } });
}
export async function messageIdOf(box: Box, id: string): Promise<string | null> {
  const raw = await api<Raw>(box, `messages/${id}?format=metadata&metadataHeaders=Message-ID`);
  return raw.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value ?? null;
}
