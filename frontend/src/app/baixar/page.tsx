import type { Metadata, Viewport } from "next";

import { TelaBaixarApp } from "@/components/hbx/tela-baixar-app";

// /baixar — a porta pública dos aplicativos (06/08). Mesma tela que a
// ParedeCelular mostra por dentro do sistema; aqui ela vive sozinha, sem
// login, pra ser link de divulgação e destino do QR do painel de logística.
export const metadata: Metadata = {
  title: "Baixe o aplicativo — HBX",
  description: "HBX Logística e HBX Vendas para Android. No computador, o sistema completo abre no navegador.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function BaixarPage() {
  return <TelaBaixarApp />;
}
