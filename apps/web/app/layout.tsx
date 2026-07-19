import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nutrição & Fitness",
  description: "Diario alimentar brasileiro com metas, macros e progresso."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

