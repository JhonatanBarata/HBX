import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "HBX Music",
  description: "Modulo mobile-first do HBX com trial, biblioteca e recomendacoes premium.",
  appleWebApp: {
    capable: true,
    title: "HBX Music",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#050816",
};

export default function HbxMusicLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
