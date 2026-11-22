import { cookies } from "next/headers";
import { BOXES, googleToken, isBox } from "@/lib/agent/gmail";
import { requireMember } from "@/lib/sync/guard";

const page = (title: string, body: string) =>
  new Response(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title>
<body style="font:15px/1.5 system-ui,sans-serif;max-width:640px;margin:10vh auto;padding:0 20px;color:#111">
<h1 style="font-size:22px">${title}</h1>${body}<p><a href="/sante">Retour au QG</a></p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

/** Retour de Google. L'autorisation est affichée une seule fois pour être rangée dans Vercel : ni base, ni code, ni journaux. */
export async function GET(request: Request) {
  const denied = await requireMember();
  if (denied) return denied;
  const url = new URL(request.url);
  const state = (await cookies()).get("qg_gmail_state")?.value;
  const code = url.searchParams.get("code");
  const box = state?.split(".")[0];
  if (!code || !state || state !== url.searchParams.get("state") || !isBox(box)) return page("Autorisation interrompue", "<p>Recommence depuis la page Santé de l'agent.</p>");
  const out = await googleToken({ grant_type: "authorization_code", code, redirect_uri: `${url.origin}/api/gmail/callback` });
  if (!out.refresh_token) return page("Google n'a pas donné d'autorisation durable", "<p>Retire l'accès du QG dans le compte Google (Sécurité → Accès tiers), puis recommence.</p>");
  return page(
    `Boîte ${BOXES[box].email}`,
    `<p>Copie cette valeur dans Vercel (projet qg-vik → Settings → Environment Variables), sous le nom <code>${BOXES[box].env}</code>, puis redéploie. Elle ne s'affichera plus : ferme cet onglet ensuite.</p>
<textarea readonly rows="4" style="width:100%;font:13px ui-monospace,monospace;padding:10px" onclick="this.select()">${out.refresh_token.replace(/[<>&"]/g, "")}</textarea>`,
  );
}
