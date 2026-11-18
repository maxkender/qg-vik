import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500"],
});

export const metadata: Metadata = {
  title: { default: "QG Vik", template: "%s · QG Vik" },
  description: "Le QG privé de Vik Studios.",
  // App privée : rien à indexer.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "QG Vik", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#101113",
  colorScheme: "dark light",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${bricolage.variable} ${inter.variable} ${jetbrains.variable} dark h-full antialiased`}
    >
      <head>
        {/* Applique le thème choisi avant le premier affichage (pas de flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("qg-theme")==="light"){document.documentElement.classList.remove("dark");document.querySelector('meta[name="theme-color"]')?.setAttribute("content","#f6f5f2")}}catch(e){}`,
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
