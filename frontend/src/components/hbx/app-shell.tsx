"use client";

// Shell PERSISTENTE do app (ordem do dono 14/06): o menu lateral e a barra de
// topo vivem AQUI, no layout do grupo (app), e não remontam ao trocar de módulo.
// Só o slot de conteúdo (.app-page) é remontado por navegação (key=pathname) e
// desliza pra dentro (hbx-theme/transitions.css). Antes cada tela renderizava o
// próprio <Sidebar>/<Topbar> e o template raiz remontava tudo — por isso o app
// "piscava" a cada clique. As 5 leis seguem: zero visual aqui, só estrutura.

import { usePathname } from "next/navigation";
import React from "react";

import { ICONS, RAIL_KEY_MORTA, Sidebar, Topbar } from "@/components/hbx/shell";
import { useCostasLigado } from "@/components/hbx/costas-panel";
import { SoLogisticaGate } from "@/components/hbx/so-logistica-gate";
import { TutorialCoachHost } from "@/components/hbx/tutorial-coach-host";
import { SellersBrainsHost } from "@/components/hbx/sellers-brains-host";
import { ConquistaHost } from "@/components/hbx/conquista-host";
import { ActivationChecklist } from "@/components/hbx/activation-checklist";
import { WelcomeCreditPhoneBanner } from "@/components/hbx/welcome-credit-phone-banner";
import { ConviteEquipeBanner } from "@/components/hbx/convite-equipe-banner";
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
  // FISCAL DO TENANT (F1a): mesma armadilha do financeiro — sem esta linha a rota
  // cai no fallback title:"HBX" e a pílula da sidebar não acende.
  "/fiscal": { active: "fiscal", title: "Fiscal", crumbs: crumb("Fiscal") },
  // 2 lugares, não 3 ilhas (27/06): VENDAS = funil (caçar+fechar numa tela só, o
  // Radar é a boca dele) e CONVERSAS = a caixa de WhatsApp. /leads é a boca do funil
  // ("Buscar empresas"), acessada de dentro de Vendas — não é mais irmã no menu.
  "/leads": { active: "vendas", title: "Buscar empresas", crumbs: crumb("Buscar empresas", "Vendas") },
  "/vendas": { active: "vendas", title: "Vendas", crumbs: crumb("Vendas") },
  // WORM-12: agenda do vendedor ("Hoje") — realça o próprio item na sidebar.
  "/agenda": { active: "agenda", title: "Agenda", crumbs: crumb("Agenda") },
  // S12 (MOTOR-ÚNICO): casca única /automacao (hub por objetivo + status) —
  // sem esta linha a rota caía no fallback active:"" (pill da sidebar apagada
  // e título "HBX" vazando, mesmo bug documentado abaixo pro NÚCLEO-CRM).
  "/automacao": { active: "automacaoHub", title: "Automação", crumbs: crumb("Automação") },
  // S17: /automacoes, /bot e /assistente saíram daqui — viraram redirect puro
  // pra /automacao (page.tsx client, sem tela própria); mesmo tratamento que
  // /workspace (sem entrada em META, fallback "HBX" cobre o instante do replace).
  "/conversas": { active: "atend", title: "Conversas", crumbs: crumb("Conversas") },
  // Alias legado preservado enquanto /atendimento redireciona para a URL canônica.
  "/atendimento": { active: "atend", title: "Conversas", crumbs: crumb("Conversas") },
  // NÚCLEO-CRM N3-N6: faltavam aqui → caíam no fallback active:"" e o item
  // correspondente nunca acendia na sidebar (nenhum highlight, sem transição).
  "/empresas": { active: "empresas", title: "Empresas", crumbs: crumb("Empresas") },
  "/contatos": { active: "contatos", title: "Contatos", crumbs: crumb("Contatos") },
  "/produtos": { active: "produtos", title: "Estoque", crumbs: crumb("Estoque") },
  "/logistica": { active: "logistica", title: "Logística", crumbs: crumb("Logística") },
  // Logística → Clientes (07/07): reusa a gestão de clientes de Contatos (modo
  // clientesOnly). Match é EXATO aqui, então a sub-rota precisa da própria linha
  // pra o item "Clientes" acender na sidebar (sem isso cairia no active:"" mudo).
  "/clientes": { active: "clientes", title: "Clientes", crumbs: crumb("Clientes", "Logística") },
  // Alias legado preservado enquanto /logistica/clientes redireciona para /clientes.
  "/logistica/clientes": { active: "clientes", title: "Clientes", crumbs: crumb("Clientes", "Logística") },
  "/relatorios": { active: "relat", title: "Relatórios", crumbs: crumb("Relatórios") },
  "/dashboard/website": { active: "website", title: "Website", crumbs: crumb("Website") },
  "/configuracoes": { active: "config", title: "Configurações", crumbs: crumb("Configurações") },
  "/configuracoes/aplicativo": { active: "config", title: "Aplicativo móvel", crumbs: crumb("Aplicativo móvel", "Configurações") },
  "/gerencial": { active: "gerencial", title: "Gerencial", crumbs: crumb("Gerencial") },
  "/tutorial": { active: "dash", title: "Tutorial", crumbs: crumb("Tutorial") },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  // A barra tem dois estados e UM dono: o pino da marca (hbx:costas).
  //  · solta  → data-rail="min": trilho de ícones que abre no hover (CSS puro);
  //  · FIXA   → data-rail="expanded": aberta de verdade, ocupando espaço, com
  //             o painel do módulo na frente.
  // Os nomes dos valores ficaram os de antes de propósito: todo o CSS de rail
  // colapsado (kit.css, 06/07) continua valendo sem uma linha reescrita.
  const fixado = useCostasLigado();

  // Enterro da chave antiga do rail (06/07–04/08). Sem isto ela fica no
  // navegador de todo mundo guardando uma escolha que ninguém mais lê — e
  // qualquer código futuro que a encontrasse ressuscitaria um estado de julho.
  React.useEffect(() => {
    try { localStorage.removeItem(RAIL_KEY_MORTA); } catch { /* sem storage */ }
  }, []);

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
        <div className="app app-shell-root" data-rail={fixado ? "expanded" : "min"}>
          <Sidebar active={meta.active} />
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
          {/* MODO PUXAR (02/08): convite de equipe pendente pro e-mail logado —
              aceitar troca a sessão pra empresa. Sem convite, não renderiza. */}
          <ConviteEquipeBanner />
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
