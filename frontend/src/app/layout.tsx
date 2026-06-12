import type { Metadata } from "next";

import "./globals.css";

import { ThemeAttributes } from "@/components/hbx/theme-attributes";

export const metadata: Metadata = {
  title: "HBX System",
  description: "Radar → Vendas → WhatsApp → Retorno",
};

// Boot de tema antes da pintura (sem flash): mesma regra do handoff —
// corporate escuro padrão (claro = data-theme-mode="light"), friendly
// claro padrão (escuro = data-theme-mode="dark").
const THEME_BOOT = `(function(){try{var p=location.pathname;var h=document.documentElement;var ws=p==="/workspace"||p.indexOf("/workspace/")===0;var mkt=p==="/";var auth=["/login","/register","/reset-password","/confirm-email"].some(function(r){return p===r||p.indexOf(r+"/")===0;});function friendly(){h.removeAttribute("data-theme");if(localStorage.getItem("hbx:friendly-mode")==="dark"){h.setAttribute("data-theme-mode","dark");}else{h.removeAttribute("data-theme-mode");}}function corporate(){h.setAttribute("data-theme","corporate");if(localStorage.getItem("hbx:corporate-mode")==="light"){h.setAttribute("data-theme-mode","light");}else{h.removeAttribute("data-theme-mode");}}if(mkt){h.removeAttribute("data-theme");h.removeAttribute("data-theme-mode");}else if(ws){friendly();}else if(auth){if(localStorage.getItem("hbx:ws-theme")==="friendly"){friendly();}else{corporate();}}else{corporate();}}catch(e){}})();`;

// Faxina do PWA antigo: desregistra qualquer service worker e apaga os
// caches do navegador em todo load. O SW "hbx-pwa-v1" do front antigo
// cacheava páginas inteiras e ressuscitava telas velhas (login Firebase,
// landing desbotada) mesmo sem servidor rodando. Par do kill-switch em
// public/sw.js. Não registrar SW novo sem ordem do dono.
const SW_KILL = `(function(){try{if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});}if(window.caches&&caches.keys){caches.keys().then(function(keys){keys.forEach(function(k){caches.delete(k);});}).catch(function(){});}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-theme="corporate" suppressHydrationWarning>
      <head>
        {/* Webfonts do handoff (tokens/fonts.css): o @import remoto é
            descartado pelo bundler de CSS — carregar via <link> garante a
            Plus Jakarta Sans / IBM Plex Mono em todas as telas. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- app router: este layout raiz cobre TODAS as rotas */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
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
