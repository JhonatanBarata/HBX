import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PublicEntry } from "@/components/hbx/public-entry";
import mobileStyles from "./mobile/mobile-ui.module.css";

export const metadata: Metadata = {
  title: "HBX System — Prospecção conectada",
  description: "Radar, vendas, WhatsApp, entrega e cobrança em uma única esteira.",
};

// Boot de AUTENTICAÇÃO antes da pintura (W1/PR10072026, mesmo molde do
// THEME_BOOT do layout): logado entra DIRETO no app, sem nunca ver a landing.
// Roda síncrono ANTES do DOM da landing ser parseado — acha token (mesmas
// chaves do getToken em lib/api.ts, manter em sincronia), marca o <html>
// (public-entry.css esconde a casca → zero flash) e navega pro seletor que
// direciona Vendedor/Entregador sem conceder nenhuma permissão.
// Token inválido não é problema daqui: o fluxo 401 do api.ts derruba de volta.
// Só cobre carga de documento (script inline não roda em navegação client-side)
// — o efeito de guarda do PublicEntry cobre o resto.
const AUTH_BOOT = `(function(){try{var t=localStorage.getItem("token")||localStorage.getItem("access_token")||localStorage.getItem("accessToken")||sessionStorage.getItem("token")||sessionStorage.getItem("access_token")||sessionStorage.getItem("accessToken");if(t){document.documentElement.setAttribute("data-hbx-authed","1");location.replace("/workspace");}}catch(e){}})();`;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = typeof params.ver === "string" ? params.ver : null;
  // "?ver=planos" era a porta antiga do funil → vira o card de cadastro NA
  // landing, PRESERVANDO o resto da query (o backend manda /?ver=planos&resume=1
  // na retomada — o resume tem que chegar no card).
  if (view === "planos") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "ver" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
    }
    const rest = query.toString();
    redirect(rest ? `/?criar&${rest}` : "/?criar");
  }
  // "/?entrar" abre o card de login NA landing (1 login só — W1); "/?criar"
  // abre o card de cadastro (W5 — mesma porta única). "?ver=entrar" segue vivo
  // como alias do fluxo antigo.
  const openCriar = params.criar !== undefined;
  const openLogin = params.entrar !== undefined || view === "entrar";
  const androidApkUrl = String(process.env.NEXT_PUBLIC_ANDROID_APK_URL || "").trim();

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: AUTH_BOOT }} />
      <PublicEntry initialScreen={openCriar ? "criar" : openLogin ? "login" : "home"} />
      {openLogin && androidApkUrl && (
        <a
          href={androidApkUrl}
          target="_blank"
          rel="noreferrer"
          className={mobileStyles.downloadLink}
        >
          Baixar aplicativo Android (teste)
        </a>
      )}
    </>
  );
}
