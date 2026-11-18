import type { MetadataRoute } from "next";

// Rend le QG installable sur téléphone (icône sur l'écran d'accueil, plein écran).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QG Vik",
    short_name: "QG Vik",
    description: "Le QG privé de Vik Studios.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f6f6f7",
    theme_color: "#f6f6f7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "À faire", url: "/" },
      { name: "Horizons", url: "/horizons" },
      { name: "Dashboard", url: "/dashboard" },
    ],
  };
}
