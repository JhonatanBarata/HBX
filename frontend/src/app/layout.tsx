import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";
import PageTransition from "../components/PageTransition";
import TopBar from "../components/TopBar";
import ThemeInit from "../components/ThemeInit";

export const dynamic = "force-dynamic";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "HBX Solutions",
  description: "Plataforma corporativa de operacao e atendimento",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${ibmPlexMono.variable} antialiased app-root`}
      >
        <ThemeInit />
        <TopBar />
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
