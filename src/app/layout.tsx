import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Les polices du site vikstudios.com.
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "QG Vik", template: "%s · QG Vik" },
  description: "Le QG privé de Vik Studios.",
  // App privée : rien à indexer.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "QG Vik", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f6f6f7",
  colorScheme: "light dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Applique le thème choisi avant le premier affichage (pas de flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("qg-theme")==="dark"){document.documentElement.classList.add("dark");document.querySelector('meta[name="theme-color"]')?.setAttribute("content","#0f1012")}}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
