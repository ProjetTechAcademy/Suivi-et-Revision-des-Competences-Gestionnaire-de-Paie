import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campus PAÏA — Votre connaissance, éclairée",
  description: "Base de connaissances personnelle pour retrouver, comprendre et approfondir vos ressources privées.",
  icons: { icon: "/brand/04_PAIA_Circulaire_Icone.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
