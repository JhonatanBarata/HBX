"use client";

// Página pública /planos (ordem do dono 12/06/2026: entrada trial-first,
// coerente com a landing e o /register). Linguagem .mkt da landing.
// Preços: SEM hardcode (PAGAMENTOS.md) — consome o catálogo da API quando
// disponível (vitrine pública está na fila do backend, PLAN12062026001);
// até lá os cards vendem o teste grátis e o empresarial sob consulta.

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

type CatalogPlan = {
  key: string;
  title: string;
  monthlyPrice: number | null;
  headline?: string | null;
  badge?: string | null;
  trialDays?: number | null;
  features?: string[];
};

function preco(p?: CatalogPlan | null) {
  if (!p || p.monthlyPrice == null || !Number.isFinite(p.monthlyPrice)) return null;
  return `R$ ${p.monthlyPrice.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}/mês`;
}

export function PlanosClient() {
  const [catalogo, setCatalogo] = useState<CatalogPlan[]>([]);

  useEffect(() => {
    let alive = true;
    // vitrine pública (fila E1 aplicada); fallback para o catálogo
    // autenticado caso o backend ainda seja um build antigo (VPS)
    apiFetch<{ plans?: CatalogPlan[] }>("/commercial-plans/public-catalog")
      .then(res => { if (alive && Array.isArray(res?.plans)) setCatalogo(res.plans); })
      .catch(() => {
        apiFetch<{ plans?: CatalogPlan[] }>("/commercial-plans/catalog")
          .then(res => { if (alive && Array.isArray(res?.plans)) setCatalogo(res.plans); })
          .catch(() => { /* segue vitrine sem preço */ });
      });
    return () => { alive = false; };
  }, []);

  const byKey = (k: string) => catalogo.find(p => p.key === k) || null;
  const list = byKey("hbx_lite");
  const lead = byKey("hbx_padrao");

  return (
    <div className="mkt">
      <div className="wrap">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">HBX</span>
            <span><strong>HBX System</strong><small>Leads, esteira mobile e recovery</small></span>
          </div>
          <nav className="nav">
            <Link href="/">Início</Link>
            <Link href="/register">Criar conta</Link>
            <Link href="/login" className="enter">Entrar</Link>
          </nav>
        </header>

        <section className="section" style={{ paddingTop: 28 }}>
          <div className="head">
            <span className="eyebrow">Planos HBX</span>
            <h2>Comece grátis. Pague quando a esteira provar o valor.</h2>
            <p>14 dias de teste no plano Lead, sem cartão. Você cria a conta, a esteira busca leads do seu segmento e da sua cidade — e aí você decide.</p>
          </div>
          <div className="plans">
            <article className="plan">
              <span className="eyebrow">{list?.badge || "Entrada para volume"}</span>
              <h3>{list?.title || "HBX List"}</h3>
              {preco(list) && <p style={{ fontFamily: "var(--font-mono)", fontSize: "1.2rem", fontWeight: 700, margin: "4px 0" }}>{preco(list)}</p>}
              <p>{list?.headline || "Listas de empresas por segmento e cidade, com os canais de contato encontrados."}</p>
              <ul>
                {(list?.features?.slice(0, 4) || [
                  "Listas por segmento e cidade",
                  "Telefone, site e redes encontrados",
                  "Fila simples para abordagem",
                ]).map(f => <li key={f}>{f}</li>)}
              </ul>
              <Link href="/register" className="cta cta-success" style={{ textDecoration: "none", textAlign: "center" }}>Criar conta</Link>
            </article>

            <article className="plan featured">
              <span className="eyebrow">14 dias grátis · sem cartão</span>
              <h3>{lead?.title || "HBX Lead"}</h3>
              {preco(lead) && <p style={{ fontFamily: "var(--font-mono)", fontSize: "1.2rem", fontWeight: 700, margin: "4px 0" }}>{preco(lead)}</p>}
              <p>{lead?.headline || "Lead qualificado com prioridade, canal recomendado e mensagem pronta — direto na sua esteira."}</p>
              <ul>
                {(lead?.features?.slice(0, 4) || [
                  "Leads priorizados e enriquecidos",
                  "WhatsApp verificado pela HBX",
                  "Esteira mobile de prospecção",
                  "Canal recomendado e próxima ação",
                ]).map(f => <li key={f}>{f}</li>)}
              </ul>
              <Link href="/register" className="cta cta-success" style={{ textDecoration: "none", textAlign: "center" }}>Testar grátis por 14 dias</Link>
            </article>

            <article className="plan company">
              <span className="eyebrow">Empresas · sob consulta</span>
              <h3>Recovery + Atendimento</h3>
              <p>Cliente sumido, parcela atrasada, orçamento parado: a HBX entra com régua de cobrança, atendimento automatizado e implantação assistida — desenhados para a sua operação.</p>
              <ul>
                <li>Recovery via WhatsApp</li>
                <li>Bot de atendimento com handoff humano</li>
                <li>Implantação acompanhada pela equipe HBX</li>
              </ul>
              <Link href="/register" className="cta cta-warning" style={{ textDecoration: "none", textAlign: "center" }}>Criar conta e falar com a equipe</Link>
            </article>
          </div>
        </section>

        <section className="proof">
          <span>Teste de 14 dias sem cartão de crédito</span>
          <span>Leads do seu segmento, na sua cidade</span>
          <span>Cancele quando quiser</span>
          <span>Empresas entram por implantação sob consulta</span>
        </section>

        <section className="final">
          <div>
            <span className="eyebrow">Sem enrolação</span>
            <h2 style={{ marginTop: 12 }}>Entre, peça leads do seu segmento e veja com seus olhos.</h2>
          </div>
          <div className="actions">
            <Link href="/register" className="btn-white" style={{ textDecoration: "none" }}>Começar teste grátis</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
