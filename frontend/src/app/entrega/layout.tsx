import type { Metadata, Viewport } from "next";

// ================================================================
// SHELL DO APP DE ENTREGA (LOGISTICA-MOBILE M1)
// Rota FORA do grupo (app): NÃO renderiza AppShell/Sidebar/MobileTabBar
// — casca limpa, mobile. Tudo mora dentro de [data-skin="entrega"], que
// redefine as próprias CSS vars (entrega.css) e ISOLA das peles do
// dashboard (aurora/ember/...): o PeleSwitch troca [data-theme] no <html>,
// mas nada dele vaza pra dentro deste escopo.
//
// PWA PRÓPRIO: o `manifest` desta metadata sobrescreve, só nesta rota, o
// manifesto global "HBX System" do layout raiz — aponta pro /entrega/
// manifest.webmanifest ("HBX Entregas", start_url /entrega, standalone).
// O Service Worker (/hbx-sw.js) já registrado no layout raiz é reusado;
// NÃO criamos SW novo.
//
// Auth: reusa a sessão/JWT existente do app. O gate roda no client
// (page.client) pra não bloquear o boot da casca; deslogado → /login.
// ================================================================

export const metadata: Metadata = {
  title: "HBX Entregas",
  description: "Rota do dia, chegada e confirmação de entregas",
  manifest: "/entrega/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Entregas" },
};

// Barra do sistema: cobre o notch (viewport-fit=cover) e trava o zoom fora —
// é um app, não um site. A COR da barra (theme_color) vive no
// /entrega/manifest.webmanifest (JSON), NÃO aqui: hex em TSX é reprovado pela
// catraca check-pele (5 Leis), igual ao layout raiz.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function EntregaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div data-skin="entrega">{children}</div>;
}
