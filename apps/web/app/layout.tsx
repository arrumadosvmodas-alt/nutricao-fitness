import type { Metadata, Viewport } from "next";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nutricao-fitness-web.vercel.app"),
  title: "Nutrição & Fitness",
  description: "Diário alimentar brasileiro com metas, macros e progresso.",
  applicationName: "Nutrição & Fitness",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Nutrição & Fitness",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: "/apple-touch-icon.png"
  },
  openGraph: {
    title: "Nutrição & Fitness",
    description: "Controle alimentação, metas e progresso em um app leve e instalável.",
    images: ["/marketing/app-marketing-banner.png"]
  }
};

export const viewport: Viewport = {
  themeColor: "#0066ee",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}

