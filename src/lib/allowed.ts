import "server-only";
import { parseAllowedEmails, type Who } from "@/lib/members";

/** Les 2 emails autorisés, lus dans ALLOWED_EMAILS. Ne sort jamais du serveur. */
export function allowedEmails(): Partial<Record<Who, string>> {
  return parseAllowedEmails(process.env.ALLOWED_EMAILS);
}

/** Quel membre correspond à cet email ? (null = pas autorisé) */
export function memberForEmail(email: string | null | undefined): Who | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  const allowed = allowedEmails();
  return (Object.keys(allowed) as Who[]).find((w) => allowed[w] === e) ?? null;
}
