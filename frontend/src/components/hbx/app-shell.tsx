"use client";

// Shell PERSISTENTE do app (ordem do dono 14/06): o menu lateral e a barra de
// topo vivem AQUI, no layout do grupo (app), e não remontam ao trocar de módulo.
// Só o slot de conteúdo (.app-page) é remontado por navegação (key=pathname) e
// desliza pra dentro (hbx-theme/transitions.css). Antes cada tela renderizava o
// próprio <Sidebar>/<Topbar> e o template raiz remontava tudo — por isso o app
// "piscava" a cada clique. As 5 leis seguem: zero visual aqui, só estrutura.

import { usePathname } from "next/navigation";
import React from "react";

import { Sidebar, Topbar } from "@/components/hbx/shell";
import { TutorialCoachHost } from "@/components/hbx/tutorial-coach-host";

type Meta = { active: string; title: string; crumbs: React.ReactNode };

function crumb(last: string, mid?: string): React.ReactNode {
  return mid
    ? <React.Fragment>Home &rsaquo; {mid} &rsaquo; <b>{last}</b></React.Fragment>
    : <React.Fragment>Home &rsaquo; <b>{last}</b></React.Fragment>;
}

// De-para rota → identidade da tela (espelha o que cada page passava ao Topbar).
const META: Record<string, Meta> = {
  "/dashboard": { active: "dash", title: "Dashboard", crumbs: crumb("Dashboard") },
  "/leads": { active: "leads", title: "Leads", crumbs: crumb("Leads") },
  "/webscraping": { active: "scrape", title: "Radar", crumbs: crumb("Radar") },
  "/vendas": { active: "vendas", title: "Vendas", crumbs: crumb("Pipeline", "Vendas") },
  "/atendimento": { active: "atend", title: "Atendimento", crumbs: crumb("Atendimento") },
  "/bot": { active: "bot", title: "Bot", crumbs: crumb("Construtor", "Bot") },
  "/relatorios": { active: "relat", title: "Relatórios", crumbs: crumb("Relatórios") },
  "/configuracoes": { active: "config", title: "Configurações", crumbs: crumb("Configurações") },
  "/gerencial": { active: "gerencial", title: "Gerencial", crumbs: crumb("Gerencial") },
  "/tutorial": { active: "dash", title: "Tutorial", crumbs: crumb("Tutorial") },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  // Gaveta do menu no celular (data-mobile-nav no .app). No desktop o atributo
  // existe mas o CSS que reage a ele mora em @media — então não muda NADA lá.
  const [navOpen, setNavOpen] = React.useState(false);

  // /master tem chrome PRÓPRIO (janelas do master + topbar própria): passa direto,
  // sem o shell padrão por cima (senão viraria menu duplicado).
  if (pathname.startsWith("/master")) return <>{children}</>;

  const meta = META[pathname] || { active: "", title: "HBX", crumbs: crumb("HBX") };

  return (
    <div className="app" data-mobile-nav={navOpen ? "open" : "closed"}>
      {/* Tocar em qualquer item do menu fecha a gaveta (o <Link> navega; o wrapper
          é display:contents, não cria caixa nem altera o grid). No desktop é inócuo. */}
      <div style={{ display: "contents" }} onClick={() => setNavOpen(false)}>
        <Sidebar active={meta.active} />
      </div>
      {/* Véu da gaveta — só renderiza aberto; no desktop é display:none (responsive.css). */}
      {navOpen && <button className="mobile-nav-veil" aria-label="Fechar menu" onClick={() => setNavOpen(false)} />}
      <div className="main">
        <Topbar title={meta.title} crumbs={meta.crumbs} onMenu={() => setNavOpen(o => !o)} />
        <div className="app-page" key={pathname}>{children}</div>
      </div>
      {/* Tour guiado (coachmark) — vive aqui pra sobreviver à navegação entre
          módulos; portala pro <body> e só aparece quando a store está ligada. */}
      <TutorialCoachHost />
    </div>
  );
}
