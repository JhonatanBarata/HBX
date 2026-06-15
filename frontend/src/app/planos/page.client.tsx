"use client";

// /planos — agora dentro da CASCA ÚNICA (HbxScene): mesmo fundo (robô + cor
// ciclando) e a mesma nav com o marcador em "Planos". Aqui só vive o CONTEÚDO
// (os cards). Preço NÃO se hardcoda (PAGAMENTOS.md): vem do catálogo público.
// "Criar conta" leva ao /register (um dos processos dos planos).

import Link from "next/link";
import { useEffect, useState } from "react";

import { HbxScene } from "@/components/hbx/hbx-scene";
import { apiFetch } from "@/lib/api";

type CatalogPlan = {
  key: string;
  title: string;
  monthlyPrice: number | null;
  priceFrom?: boolean;
  headline?: string | null;
  badge?: string | null;
  trialDays?: number | null;
  features?: string[];
};

const ORDER: { key: string; cls: string; cta: string }[] = [
  { key: "hbx_lite", cls: "site-plan--list", cta: "Criar conta" },
  { key: "hbx_padrao", cls: "site-plan--lead", cta: "Testar grátis" },
  { key: "hbx_pro", cls: "site-plan--pro", cta: "Criar conta" },
  { key: "hbx_melhor", cls: "site-plan--company", cta: "Falar com a equipe" },
];

function precoLabel(p?: CatalogPlan | null) {
  if (!p || p.monthlyPrice == null || !Number.isFinite(p.monthlyPrice)) return null;
  const casas = p.monthlyPrice % 1 ? 2 : 0;
  const valor = `R$ ${p.monthlyPrice.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
  return p.priceFrom ? `a partir de ${valor}` : valor;
}

export function PlanosClient() {
  const [catalogo, setCatalogo] = useState<CatalogPlan[]>([]);

  useEffect(() => {
    let alive = true;
    apiFetch<{ plans?: CatalogPlan[] }>("/commercial-plans/public-catalog")
      .then(res => { if (alive && Array.isArray(res?.plans)) setCatalogo(res.plans); })
      .catch(() => {
        apiFetch<{ plans?: CatalogPlan[] }>("/commercial-plans/catalog")
          .then(res => { if (alive && Array.isArray(res?.plans)) setCatalogo(res.plans); })
          .catch(() => { /* vitrine sem preço */ });
      });
    return () => { alive = false; };
  }, []);

  const byKey = (k: string) => catalogo.find(p => p.key === k) || null;

  return (
    <HbxScene active="planos">
      <div className="scene-center scene-planos">
        <h2 className="site-h2">Comece grátis. Pague quando a esteira provar o valor.</h2>
        <p className="site-lead">Três planos self-service e o Company com implantação feita pela HBX. 14 dias grátis no Lead Plus, sem cartão.</p>
        <div className="site-plan-strip">
          {ORDER.map(({ key, cls, cta }) => {
            const p = byKey(key);
            const preco = precoLabel(p);
            const isLead = key === "hbx_padrao";
            return (
              <article key={key} className={"site-plan " + cls + (isLead ? " site-plan--hot" : "")}>
                <span className="site-plan__badge">{p?.badge || (isLead ? "14 dias grátis" : "Plano")}</span>
                <strong className="site-plan__name">{p?.title || key}</strong>
                {preco && <span className="site-plan__price">{preco}<span className="site-plan__per">/mês</span></span>}
                <span className="site-plan__tag">{p?.headline || ""}</span>
                <ul className="site-plan__feats">
                  {(p?.features || []).slice(0, 4).map(f => (
                    <li key={f}><svg className="site-ic" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>{f}</li>
                  ))}
                </ul>
                <Link href={`/register?plan=${key}`} className="site-plan__cta site-plan__cta--link">{cta}</Link>
              </article>
            );
          })}
        </div>
        <p className="site-annual">Contrato anual: <b>20% de desconto</b>. Cancele quando quiser.</p>
      </div>
    </HbxScene>
  );
}
