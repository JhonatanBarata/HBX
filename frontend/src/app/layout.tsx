import type { Metadata } from "next";

import "./globals.css";

import { ThemeAttributes } from "@/components/hbx/theme-attributes";

export const metadata: Metadata = {
  title: "HBX System",
  description: "Radar → Vendas → WhatsApp → Retorno",
};

// Boot de PELE antes da pintura (sem flash) — espelho de
// components/hbx/theme-attributes.tsx (manter os dois em sincronia).
// hbx:pele = aurora|ember|rose (padrão aurora; skeleton.css é só a base);
// hbx:mode = claro/escuro global automático. Landing "/" = html puro.
const THEME_BOOT = `(function(){try{var p=location.pathname;var h=document.documentElement;h.removeAttribute("data-engine");if(p==="/"){h.removeAttribute("data-theme");h.removeAttribute("data-theme-mode");return;}var P=["aurora","ember","rose","hbx-cyber"];var k=localStorage.getItem("hbx:pele");if(P.indexOf(k)<0){k="aurora";}h.setAttribute("data-theme",k);var m=localStorage.getItem("hbx:mode");h.setAttribute("data-theme-mode",m==="dark"?"dark":"light");}catch(e){}})();`;

// Faxina do PWA antigo: desregistra qualquer service worker e apaga os
// caches do navegador em todo load. O SW "hbx-pwa-v1" do front antigo
// cacheava páginas inteiras e ressuscitava telas velhas (login Firebase,
// landing desbotada) mesmo sem servidor rodando. Par do kill-switch em
// public/sw.js. Não registrar SW novo sem ordem do dono.
const SW_KILL = `(function(){try{if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});}if(window.caches&&caches.keys){caches.keys().then(function(keys){keys.forEach(function(k){caches.delete(k);});}).catch(function(){});}}catch(e){}})();`;

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
        <script dangerouslySetInnerHTML={{ __html: SW_KILL }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <ThemeAttributes />
        {children}
      </body>
    </html>
  );
}
