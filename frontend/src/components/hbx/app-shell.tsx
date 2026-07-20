"use client";

// Shell PERSISTENTE do app (ordem do dono 14/06): o menu lateral e a barra de
// topo vivem AQUI, no layout do grupo (app), e não remontam ao trocar de módulo.
// Só o slot de conteúdo (.app-page) é remontado por navegação (key=pathname) e
// desliza pra dentro (hbx-theme/transitions.css). Antes cada tela renderizava o
// próprio <Sidebar>/<Topbar> e o template raiz remontava tudo — por isso o app
// "piscava" a cada clique. As 5 leis seguem: zero visual aqui, só estrutura.

import { usePathname } from "next/navigation";
import React from "react";

import { ICONS, Sidebar, Topbar, toggleRailState, useRailState } from "@/components/hbx/shell";
import { SoLogisticaGate } from "@/components/hbx/so-logistica-gate";
import { TutorialCoachHost } from "@/components/hbx/tutorial-coach-host";
import { SellersBrainsHost } from "@/components/hbx/sellers-brains-host";
import { ConquistaHost } from "@/components/hbx/conquista-host";
import { ActivationChecklist } from "@/components/hbx/activation-checklist";
import { WelcomeCreditPhoneBanner } from "@/components/hbx/welcome-credit-phone-banner";
import { MobileDeviceTopbarBridge } from "@/components/hbx/mobile-device-topbar";
import { MobileActionBridgeHost } from "@/components/hbx/mobile-action-bridge-host";
import { ImpersonationBanner } from "@/components/hbx/impersonation-banner";
import { MobileShell } from "@/components/casca/mobile-shell";

// FINANCEIRO-UNIVERSAL: o id da navegação precisa de um glifo no registry do shell.
// Reusa o ícone monetário central e preserva um futuro desenho dedicado.
ICONS.financeiro ??= ICONS.money;

type Meta = { active: string; title: string; crumbs: React.ReactNode };

function crumb(last: string, mid?: string): React.ReactNode {
  return mid
    ? <React.Fragment>Home &rsaquo; {mid} &rsaquo; <b>{last}</b></React.Fragment>
    : <React.Fragment>Home &rsaquo; <b>{last}</b></React.Fragment>;
}

// De-para rota → identidade da tela (espelha o que cada page passava ao Topbar).
const META: Record<string, Meta> = {
  "/dashboard": { active: "dash", title: "Dashboard", crumbs: crumb("Dashboard") },
  // FINANCEIRO-UNIVERSAL: sem esta linha a rota caía no fallback title:"HBX"
  // (topo mudo e pill da sidebar apagada) — vazava "HBX" até no modo distribuidora.
  "/financeiro": { active: "financeiro", title: "Financeiro", crumbs: crumb("Financeiro") },
  // 2 lugares, não 3 ilhas (27/06): VENDAS = funil (caçar+fechar numa tela só, o
  // Radar é a boca dele) e CONVERSAS = a caixa de WhatsApp. /leads é a boca do funil
  // ("Buscar empresas"), acessada de dentro de Vendas — não é mais irmã no menu.
  "/leads": { active: "vendas", title: "Buscar empresas", crumbs: crumb("Buscar empresas", "Vendas") },
  "/vendas": { active: "vendas", title: "Vendas", crumbs: crumb("Vendas") },
  // WORM-12: agenda do vendedor ("Hoje") — realça o próprio item na sidebar.
  "/agenda": { active: "agenda", title: "Agenda", crumbs: crumb("Agenda") },
  // WORM-13: automações (cadência com persona + gatilhos + rotinas).
  "/automacoes": { active: "automacao", title: "Automações", crumbs: crumb("Automações", "Vendas") },
  "/atendimento": { active: "atend", title: "Conversas", crumbs: crumb("Conversas") },
  // NÚCLEO-CRM N3-N6: faltavam aqui → caíam no fallback active:"" e o item
  // correspondente nunca acendia na sidebar (nenhum highlight, sem transição).
  "/empresas": { active: "empresas", title: "Empresas", crumbs: crumb("Empresas") },
  "/contatos": { active: "contatos", title: "Contatos", crumbs: crumb("Contatos") },
  "/produtos": { active: "produtos", title: "Produtos", crumbs: crumb("Produtos") },
  "/logistica": { active: "logistica", title: "Logística", crumbs: crumb("Logística") },
  // Logística → Clientes (07/07): reusa a gestão de clientes de Contatos (modo
  // clientesOnly). Match é EXATO aqui, então a sub-rota precisa da própria linha
  // pra o item "Clientes" acender na sidebar (sem isso cairia no active:"" mudo).
  "/logistica/clientes": { active: "clientes", title: "Clientes", crumbs: crumb("Clientes", "Logística") },
  "/bot": { active: "bot", title: "Bot", crumbs: crumb("Construtor", "Bot") },
  "/assistente": { active: "assistente", title: "Assistente IA", crumbs: crumb("Assistente IA") },
  "/relatorios": { active: "relat", title: "Relatórios", crumbs: crumb("Relatórios") },
  "/dashboard/website": { active: "website", title: "Website", crumbs: crumb("Website") },
  "/configuracoes": { active: "config", title: "Configurações", crumbs: crumb("Configurações") },
  "/configuracoes/aplicativo": { active: "config", title: "Aplicativo móvel", crumbs: crumb("Aplicativo móvel", "Configurações") },
  "/gerencial": { active: "gerencial", title: "Gerencial", crumbs: crumb("Gerencial") },
  "/tutorial": { active: "dash", title: "Tutorial", crumbs: crumb("Tutorial") },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  // Rail colapsável (LEADS-FINAL/01, 06/07): mesma store/padrão do tema
  // (useSyncExternalStore, shell.tsx) — default EXPANDIDA, SSR-safe.
  const rail = useRailState();

  // /master tem chrome PRÓPRIO (janelas do master + topbar própria): passa direto,
  // sem o shell padrão por cima (senão viraria menu duplicado).
  if (pathname.startsWith("/master")) return <>{children}</>;

  const meta = META[pathname] || { active: "", title: "HBX", crumbs: crumb("HBX") };

  // CASCA MOBILE (MOBILE-CASCA/W1): no celular a MobileShell substitui TODO o
  // chrome desktop pela moldura própria (topo/tab bar) + registry de telas. No
  // desktop ela devolve `children` puro — o shell abaixo fica 100% intocado.
  //
  // BOOT (07/07): "app-shell-root" é só um HOOK de CSS (zero estilo próprio,
  // não mexe em nada que kit.css já faz com ".app") — o <style> pré-hidratação
  // em layout.tsx usa ele pra esconder ESTA sidebar num reload mobile antes do
  // React sequer hidratar. Precisa ser uma classe A MAIS (não trocar ".app"
  // pela nova) porque /master tem o SEU PRÓPRIO ".app" (master/page.client.tsx,
  // chrome à parte, fora da MobileShell) que não pode ser afetado.
  return (
    <>
      <MobileShell>
        <div className="app app-shell-root" data-rail={rail}>
          <Sidebar active={meta.active} rail={rail} onToggleRail={toggleRailState} />
          <div className="main">
            {/* MASTER "entrar como": faixa de retorno acima do topo, visível em
                toda tela enquanto o master vê o app como outro usuário. */}
            <ImpersonationBanner />
            <Topbar title={meta.title} crumbs={meta.crumbs} />
            <MobileDeviceTopbarBridge />
            {/* S1 MODO DISTRIBUIDORA: empresa só-logística no desktop —
                /dashboard e rota de módulo desligado voltam pro /entrega; rotas
                neutras ganham título de documento = nome da empresa. Fica FORA
                do key=pathname (gate persistente, sem remontar por navegação). */}
            <SoLogisticaGate>
              <div className="app-page" key={pathname}>{children}</div>
            </SoLogisticaGate>
          </div>
          {/* Tour guiado (coachmark) — vive aqui pra sobreviver à navegação entre
              módulos; portala pro <body> e só aparece quando a store está ligada. */}
          <TutorialCoachHost />
          {/* Sellers Brains (17/06): escurece a tela e dispara recados vivos pro vendedor. */}
          <SellersBrainsHost />
          {/* F3 (CONFIRMACAO-TELEFONE): confirme o WhatsApp pra liberar o brinde.
              Dormant por default (só renderiza com o gate ON no backend). */}
          <WelcomeCreditPhoneBanner />
          <ConquistaHost />
          <MobileActionBridgeHost />
        </div>
      </MobileShell>
      {/* Fica fora da substituição da MobileShell: o mesmo concierge de
          configuração atende desktop e celular sem duplicar a jornada. */}
      <ActivationChecklist />
    </>
  );
}
