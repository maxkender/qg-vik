import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages accessibles sans être connecté.
const PUBLIC_PATHS = ["/connexion", "/auth/", "/manifest.webmanifest", "/icon.png", "/apple-icon.png"];

/**
 * Rafraîchit la session Supabase et renvoie vers « Qui se connecte ? » si personne n'est connecté.
 * C'est un premier filtre : la vraie protection des données est la RLS dans la base.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));

  if (!url || !key) {
    return isPublic ? NextResponse.next({ request }) : redirectTo(request, "/connexion", "config");
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Ne rien intercaler entre la création du client et getClaims().
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublic) return withCookies(redirectTo(request, "/connexion"), response);
  if (signedIn && pathname === "/connexion") return withCookies(redirectTo(request, "/"), response);
  return response;
}

function redirectTo(request: NextRequest, path: string, erreur?: string) {
  const target = request.nextUrl.clone();
  target.pathname = path;
  target.search = erreur ? `?erreur=${erreur}` : "";
  return NextResponse.redirect(target);
}

/** Reporte sur la redirection les cookies de session rafraîchis. */
function withCookies(to: NextResponse, from: NextResponse) {
  from.cookies.getAll().forEach((c) => to.cookies.set(c));
  return to;
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques, les images et les fichiers de la PWA.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
