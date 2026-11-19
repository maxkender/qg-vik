import { cookies } from "next/headers";
import { exchangeCode, meetClientReady } from "@/lib/meet";
import { requireMember } from "@/lib/sync/guard";

const page = (title: string, body: string) =>
  new Response(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title>
<body style="font:15px/1.5 system-ui,sans-serif;max-width:640px;margin:10vh auto;padding:0 20px;color:#111">
<h1 style="font-size:22px">${title}</h1>${body}<p><a href="/reunions">Retour au QG</a></p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

/**
 * Retour de Google. L'autorisation durable est affichée une seule fois, pour être rangée dans Vercel :
 * elle n'est écrite ni dans la base, ni dans le code, ni dans les journaux.
 */
export async function GET(request: Request) {
  const denied = await requireMember();
  if (denied) return denied;
  const url = new URL(request.url);
  const jar = await cookies();
  const state = jar.get("qg_meet_state")?.value;
  const code = url.searchParams.get("code");
  if (!meetClientReady() || !code || !state || state !== url.searchParams.get("state")) return page("Autorisation interrompue", "<p>Recommence depuis la page Réunions.</p>");
  const out = await exchangeCode(code, url.origin);
  if (!out.refresh_token) return page("Google n'a pas donné d'autorisation durable", "<p>Retire l'accès du QG dans ton compte Google (Sécurité → Accès tiers), puis recommence.</p>");
  return page(
    "Dernière étape",
    `<p>Copie cette valeur dans Vercel (projet qg-vik → Settings → Environment Variables), sous le nom <code>GOOGLE_MEET_REFRESH_TOKEN</code>, puis redéploie. Elle ne s'affichera plus : ferme cet onglet ensuite.</p>
<textarea readonly rows="4" style="width:100%;font:13px ui-monospace,monospace;padding:10px" onclick="this.select()">${out.refresh_token.replace(/[<>&"]/g, "")}</textarea>`,
  );
}
