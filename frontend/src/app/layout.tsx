import type { Metadata } from "next";
import {
  IBM_Plex_Mono,
  Manrope,
  Plus_Jakarta_Sans,
  Sora,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";
import { InterfaceTransitionProvider } from "../components/InterfaceTransitionProvider";
import PageTransition from "../components/PageTransition";
import TopBar from "../components/TopBar";
import { ThemeProvider } from "../components/ThemeProvider";

export const dynamic = "force-dynamic";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
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
        className={`${manrope.variable} ${plusJakartaSans.variable} ${sora.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable} antialiased app-root`}
      >
        <ThemeProvider>
          <InterfaceTransitionProvider>
            <TopBar />
            <PageTransition>{children}</PageTransition>
          </InterfaceTransitionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
