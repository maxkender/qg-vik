const OS_PROJECT_REF = "mbikecieskoobeizixig"; // projet de l'OS : interdit ici

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sont requis.");
  }
  if (url.includes(OS_PROJECT_REF)) {
    throw new Error("Cette adresse est celle du Supabase de l'OS. Le QG a son propre projet.");
  }
  return { url, key };
}
