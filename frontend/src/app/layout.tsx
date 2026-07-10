import type { Metadata, Viewport } from "next";

import "./globals.css";

import { ThemeAttributes } from "@/components/hbx/theme-attributes";
import { GlobalErrorHost } from "@/components/hbx/error-popup";
// SERVER Component: importa as constantes SÓ do -const (sem React). Importar de
// @/lib/casca-mobile puxaria o hook useSyncExternalStore (client) pro bundle do
// servidor → 500 em toda rota (Next recusa hook client em Server Component).
import { CASCA_BOOT_ATTR, QUERY as CASCA_MOBILE_QUERY } from "@/lib/casca-mobile-const";

export const metadata: Metadata = {
  title: "HBX System",
  description: "Radar → Vendas → WhatsApp → Retorno",
  // PWA: manifest (instalável) + identidade de app no iOS (abre em tela cheia,
  // ícone na home). Ícone Apple reaproveita o /icon.png (192²) já existente.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "HBX" },
  icons: { icon: "/icon.png", apple: "/icon.png" },
};

// Viewport mobile: encaixa em telas com notch (viewport-fit=cover) e mantém
// o zoom liberado (acessibilidade). Não muda nada no desktop.
// A cor da barra do sistema (theme_color) vive no manifest.webmanifest (JSON),
// não aqui — hex em TSX é reprovado pela catraca check-pele (5 Leis).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Boot de PELE antes da pintura (sem flash) — espelho de
// components/hbx/theme-attributes.tsx (manter os dois em sincronia).
// hbx:pele = uma das 4 opções "<cor>-mod" (aurora|ember|rose|hbx-cyber) —
// a casca MODERN é a única (dono 07/07: cascas/temas clássicos removidos);
// chave clássica salva de antes migra pra variante Mod da mesma cor.
// hbx:mode = claro/escuro global automático. 15/06: a landing "/" deixou de
// ser "html puro" — agora É o login (tokens + robô do tema), herda
// data-theme/mode.
const THEME_BOOT = `(function(){try{var h=document.documentElement;h.removeAttribute("data-engine");var B=["login","aurora","ember","rose","hbx-cyber"];var k=localStorage.getItem("hbx:pele")||"login-mod";if(!/-mod$/.test(k)){k=k+"-mod";}var base=k.slice(0,-4);if(B.indexOf(base)<0){k="login-mod";base="login";}h.setAttribute("data-theme",base);h.setAttribute("data-pele",k);h.setAttribute("data-casca","modern");var m=localStorage.getItem("hbx:mode");h.setAttribute("data-theme-mode",m==="dark"?"dark":"light");}catch(e){}})();`;

// Boot da CASCA MOBILE antes da pintura (07/07, queixa do dono: reload no
// celular piscava a sidebar desktop antes da moldura mobile aparecer) —
// mesmo padrão do THEME_BOOT acima: síncrono, roda no <head> ANTES do <body>
// ser parseado, então quando ".app-shell-root" (a sidebar desktop — o SSR
// sempre assume desktop) e ".casca-boot-loading" (o loader HBX) chegam no
// DOM, o CSS logo abaixo já sabe se é celular — zero espera pela hidratação
// do React (é ela, passiva, que causava o flash: ver nota BOOT em
// casca-mobile.ts). MobileShell mantém isto em sincronia depois (resize).
const CASCA_BOOT = `(function(){try{var h=document.documentElement;h.setAttribute(${JSON.stringify(CASCA_BOOT_ATTR)},window.matchMedia(${JSON.stringify(CASCA_MOBILE_QUERY)}).matches?"mobile":"desktop");}catch(e){}})();`;

// Companheiro de CSS do boot acima — só display/position/z-index, nenhuma cor
// (isso é da pele, mora em theme-*.css) — não conta pro fiscal check-pele
// (R1/R2 miram cor, R4 mira propriedade visual em style inline de TSX; nada
// disso aparece aqui). ".app-shell-root" é a marca só-de-CSS que app-shell.tsx
// põe na sidebar desktop; /master tem o PRÓPRIO ".app" (chrome à parte, fora
// da MobileShell) que este seletor NUNCA toca, de propósito.
const CASCA_BOOT_CSS = `.casca-boot-loading{position:fixed;inset:0;z-index:10000;display:none}html[${CASCA_BOOT_ATTR}="mobile"] .casca-boot-loading{display:block}html[${CASCA_BOOT_ATTR}="mobile"] .app-shell-root{display:none}`;

// PWA (ordem do dono 14/06: "Responsivo + PWA"). Substitui o kill-switch antigo:
// (1) APAGA todos os caches do navegador a cada load — defesa contra o PWA velho
//     "hbx-pwa-v1", que cacheava páginas e ressuscitava telas (o SW novo é
//     sem-cache, então isso só remove lixo antigo);
// (2) DESREGISTRA qualquer SW que NÃO seja o nosso (some o kill-switch /sw.js);
// (3) REGISTRA o /hbx-sw.js (sem cache de página) — torna o app instalável.
const SW_REGISTER = `(function(){try{if(!("serviceWorker" in navigator))return;if(window.caches&&caches.keys){caches.keys().then(function(keys){keys.forEach(function(k){caches.delete(k);});}).catch(function(){});}navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){var u=(r.active&&r.active.scriptURL)||"";if(u.indexOf("/hbx-sw.js")<0){r.unregister();}});}).catch(function(){});window.addEventListener("load",function(){navigator.serviceWorker.register("/hbx-sw.js").catch(function(){});});}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Webfonts do handoff (tokens/fonts.css): o @import remoto é
            descartado pelo bundler de CSS — carregar via <link> garante a
            Plus Jakarta Sans / IBM Plex Mono em todas as telas. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- app router: este layout raiz cobre TODAS as rotas */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500&family=IBM+Plex+Mono:wght@400;500;600;700&family=Sora:wght@400;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Lora:wght@500;600;700&display=swap"
        />
        <style dangerouslySetInnerHTML={{ __html: CASCA_BOOT_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: CASCA_BOOT }} />
      </head>
      <body>
        <ThemeAttributes />
        {children}
        <GlobalErrorHost />
      </body>
    </html>
  );
}
