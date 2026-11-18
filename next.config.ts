import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Le QG est une app privée rendue dans le navigateur, derrière la connexion :
    // rien à valider pour le pré-rendu des pages.
    instantInsights: { validationLevel: "manual-warning" },
    // Le cache disque de compilation resservait une vieille feuille de style après un changement de CSS.
    turbopackFileSystemCacheForBuild: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
