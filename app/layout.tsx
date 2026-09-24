import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corpus Campus PAÏA — Votre connaissance, éclairée",
  description: "Base de connaissances privée pour rechercher, comprendre, réviser et exploiter vos ressources personnelles.",
  icons: { icon: "/brand/04_PAIA_Circulaire_Icone.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr" suppressHydrationWarning><body>{children}</body></html>;
}
