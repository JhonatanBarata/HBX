"use client";

// ============================================================
// MOBILE-CASCA/W1 — MobileShell: a MOLDURA única do celular.
//
// Quando NÃO é mobile → devolve `children` PURO (desktop 100% intocado — a
// casca nunca monta, nenhuma classe .casca-* entra no DOM do desktop).
//
// Quando é mobile e a rota é do grupo (app):
//   topo 1 linha (título) + SLOT de conteúdo (registry rota→tela, com transição
//   IR na troca de rota) + tab bar. Rota registrada → a tela; não registrada →
//   fallback central. /dashboard no mobile redireciona pra /vendas.
//
// /master e /entrega têm chrome próprio (o AppShell já passa /master direto; o
// /entrega vive FORA do grupo (app), então nem chega aqui). Este shell é
// montado DENTRO do AppShell (que já pulou /master).
// ============================================================

import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useRef } from "react";

import { useCascaMobile } from "@/lib/casca-mobile";
import { dismissCascaToast } from "@/lib/casca-toast";

import { CascaFallback } from "./fallback";
import { CascaLoading } from "./loading";
import { CascaTabBar } from "./tab-bar";
import { CascaToastHost } from "./toast-host";
import { CASCA_TITLES, renderCascaScreen } from "./registry";

// Título do topo: registry tem prioridade; senão um de-para mínimo (o AppShell
// tem o META completo, mas não o exporta — mantemos o que a casca conhece).
const TITLE_FALLBACK: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/agenda": "Agenda",
  "/automacoes": "Automações",
  "/contatos": "Contatos",
  "/produtos": "Produtos",
  "/logistica": "Logística",
  "/bot": "Bot",
  "/assistente": "Assistente IA",
  "/relatorios": "Relatórios",
  "/configuracoes": "Configurações",
  "/gerencial": "Gerencial",
};

function titleFor(pathname: string): string {
  return CASCA_TITLES[pathname] || TITLE_FALLBACK[pathname] || "HBX";
}

// Palco animado: remonta a cada troca de rota (key=pathname) e toca a transição
// IR (desliza da direita). O VOLTAR de sub-telas é do CascaView (sub-camada).
function CascaStage({ pathname }: { pathname: string }) {
  const screen = renderCascaScreen(pathname);
  return (
    <div className="casca-stage">
      <div className="casca-view casca-view--enter" key={pathname}>
        {screen ?? <CascaFallback title={titleFor(pathname)} />}
      </div>
    </div>
  );
}

export function MobileShell({ children }: { children: React.ReactNode }) {
  const isMobile = useCascaMobile();
  const pathname = usePathname() || "";
  const router = useRouter();

  // Redirect mobile /dashboard → /vendas (a aba inicial do celular é Vendas).
  useEffect(() => {
    if (isMobile && pathname === "/dashboard") router.replace("/vendas");
  }, [isMobile, pathname, router]);

  // Fecha qualquer toast pendente ao trocar de rota (não arrasta aviso de uma
  // tela pra outra).
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      dismissCascaToast();
    }
  }, [pathname]);

  // DESKTOP (e SSR): children puro. A casca não existe fora do celular.
  if (!isMobile) return <>{children}</>;

  // Enquanto o redirect do /dashboard não resolve, evita piscar o fallback.
  const redirecting = pathname === "/dashboard";

  return (
    <div className="casca">
      <div className="casca-top">
        <h1 className="casca-top__title">{titleFor(pathname)}</h1>
      </div>
      {redirecting ? (
        <div className="casca-stage"><CascaLoading /></div>
      ) : (
        <CascaStage pathname={pathname} />
      )}
      <CascaTabBar />
      <CascaToastHost />
    </div>
  );
}
