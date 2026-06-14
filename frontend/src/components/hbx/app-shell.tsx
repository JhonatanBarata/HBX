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

  // /master tem chrome PRÓPRIO (janelas do master + topbar própria): passa direto,
  // sem o shell padrão por cima (senão viraria menu duplicado).
  if (pathname.startsWith("/master")) return <>{children}</>;

  const meta = META[pathname] || { active: "", title: "HBX", crumbs: crumb("HBX") };

  return (
    <div className="app">
      <Sidebar active={meta.active} />
      <div className="main">
        <Topbar title={meta.title} crumbs={meta.crumbs} />
        <div className="app-page" key={pathname}>{children}</div>
      </div>
    </div>
  );
}
