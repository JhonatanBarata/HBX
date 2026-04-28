"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";
import styles from "./page.module.css";

type CurrentUser = {
  username?: string | null;
  email?: string | null;
  isSystemMaster?: boolean;
  masterContext?: {
    active: boolean;
    companyName?: string | null;
  } | null;
};

const MASTER_SHORTCUTS = [
  {
    title: "Hostinger",
    eyebrow: "Produção",
    description: "VPS onde rodam backend, webscraping, HBX Scraping Engine, Postgres e processos operacionais.",
    href: "/dashboard/master/sistema",
    action: "Ver saúde Hostinger",
    tone: "hostinger",
    meta: "api.hbxsystem.com.br",
  },
  {
    title: "Operação MASTER",
    eyebrow: "Command Center",
    description: "Painel completo de empresas, contexto, módulos, cobrança, tokens e operação da base.",
    href: "/dashboard/master/operacao",
    action: "Abrir operação",
    tone: "master",
    meta: "Empresas e modulos",
  },
  {
    title: "Clientes",
    eyebrow: "Base",
    description: "Tabela dedicada de clientes com situação operacional, financeiro, WhatsApp e atividade.",
    href: "/dashboard/master/clientes",
    action: "Ver clientes",
    tone: "master",
    meta: "billingSituation + whatsappSituation",
  },
  {
    title: "Financeiro",
    eyebrow: "Cobrança",
    description: "Cockpit financeiro usando a leitura normalizada do billingSituation por cliente.",
    href: "/dashboard/master/financeiro",
    action: "Ver financeiro",
    tone: "hostinger",
    meta: "Receita, atraso e trials",
  },
  {
    title: "WhatsApp",
    eyebrow: "Operação",
    description: "Leitura dedicada de QR rápido, Meta oficial e Token Master sem expor secrets.",
    href: "/dashboard/master/whatsapp",
    action: "Ver WhatsApp",
    tone: "support",
    meta: "QR, Meta e Master Token",
  },
  {
    title: "Planos/Módulos",
    eyebrow: "Catálogo",
    description: "Preços, módulos vendáveis, padrão para empresas e uso por cliente.",
    href: "/dashboard/master/planos",
    action: "Ver módulos",
    tone: "master",
    meta: "Catálogo comercial",
  },
  {
    title: "Assistente Técnico",
    eyebrow: "Diagnóstico",
    description: "Analise páginas, erros, prompts e checklist de publicação antes de pedir uma correção.",
    href: "/dashboard/master/assistente-tecnico",
    action: "Abrir assistente",
    tone: "support",
    meta: "Codex e debug",
  },
  {
    title: "Exclusões",
    eyebrow: "Auditoria",
    description: "Área sensível para revisar remoções, impactos e rastros administrativos.",
    href: "/dashboard/master/exclusoes",
    action: "Abrir exclusões",
    tone: "danger",
    meta: "Acesso restrito",
  },
] as const;

function displayName(user: CurrentUser | null) {
  return String(user?.username || user?.email || "MASTER").trim();
}

export default function MasterHomeClientPage() {
  const hasToken = useRequireAuth();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasToken !== true) return;
    let mounted = true;

    async function loadUser() {
      setCheckingAccess(true);
      setError(null);
      try {
        const payload = await apiFetch<CurrentUser>("/profile/current-user");
        if (mounted) setUser(payload);
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Falha ao validar acesso MASTER.");
        }
      } finally {
        if (mounted) setCheckingAccess(false);
      }
    }

    void loadUser();
    return () => {
      mounted = false;
    };
  }, [hasToken]);

  if (hasToken === null || checkingAccess) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando home MASTER...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  const isSystemMaster = Boolean(user?.isSystemMaster);

  if (!isSystemMaster) {
    return (
      <DashboardScaffold title="Master" description="Entrada exclusiva do usuário MASTER.">
        <section className={styles.masterHomeAccess}>
          <h2>Acesso exclusivo do MASTER</h2>
          <p>Seu usuário autenticado não tem permissão para abrir esta central.</p>
          {error ? <p className={styles.masterHomeError}>{error}</p> : null}
          <Link href="/dashboard" className="btn btn-secondary btn-sm">
            Voltar ao painel
          </Link>
        </section>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold
      title="Master"
      description="Home simples para entrar nas áreas principais sem carregar a torre completa logo de início."
      actions={
        <div className={styles.heroActions}>
          <Link href="/dashboard/master/sistema" className="btn btn-primary btn-sm">
            Hostinger
          </Link>
          <Link href="/dashboard/master/clientes" className="btn btn-secondary btn-sm">
            Clientes
          </Link>
          <Link href="/dashboard/master/financeiro" className="btn btn-secondary btn-sm">
            Financeiro
          </Link>
          <Link href="/dashboard/master/whatsapp" className="btn btn-secondary btn-sm">
            WhatsApp
          </Link>
          <Link href="/dashboard/master/planos" className="btn btn-secondary btn-sm">
            Planos/Módulos
          </Link>
          <Link href="/dashboard/master/operacao" className="btn btn-secondary btn-sm">
            Operação MASTER
          </Link>
        </div>
      }
    >
      <div className={styles.masterHome}>
        {error ? <div className="alert alert-error">{error}</div> : null}

        <section className={styles.masterHomeHero}>
          <div>
            <span className={styles.masterHomeEyebrow}>Entrada MASTER</span>
            <h2>Escolha o que precisa abrir agora.</h2>
            <p>
              Olá, {displayName(user)}. Esta home mantém o Master direto: produção Hostinger,
              operação completa, diagnóstico técnico e áreas sensíveis.
            </p>
          </div>

          <aside className={styles.hostingerStatus}>
            <span>Hostinger visível</span>
            <strong>Produção na VPS</strong>
            <p>Backend, webscraping, HBX Scraping Engine e banco local da VPS ficam centralizados aqui.</p>
            <div className={styles.hostingerLinks}>
              <Link href="/dashboard/master/sistema">Saúde do sistema</Link>
              <a href="https://api.hbxsystem.com.br/health" target="_blank" rel="noreferrer">
                Health da API
              </a>
            </div>
          </aside>
        </section>

        <section className={styles.masterHomeGrid} aria-label="Atalhos MASTER">
          {MASTER_SHORTCUTS.map((item) => (
            <Link key={item.href} href={item.href} className={styles.masterHomeCard} data-tone={item.tone}>
              <span>{item.eyebrow}</span>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
              <small>{item.meta}</small>
              <b>{item.action}</b>
            </Link>
          ))}
        </section>

        <section className={styles.masterHomeNote}>
          <strong>Fluxo de publicação</strong>
          <p>
            O frontend segue na Vercel. O publish da Hostinger cobre backend, webscraping e HBX Scraping Engine.
          </p>
        </section>
      </div>
    </DashboardScaffold>
  );
}
