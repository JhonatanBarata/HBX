"use client";

// CRÉDITOS S6 — painel da carteira (audiência ADMIN/dono do tenant), seção
// "Créditos" de Configurações. Consome GET /credits/me — o shape que a API
// devolve já é role-gated no backend (LEI DO VENDEDOR, ver
// backend/src/credits/credits.service.ts):
//   - audiência de cobrança (master/dono): { enabled, balance, lots[], packs[] }
//   - audiência neutra (vendedor/gerente): { enabled, leadsDisponiveis }
// Este componente só é montado quando a régua canSeeBilling (mesma de "Plano e
// cobrança", isCompanySeller/canViewBilling) já autorizou a audiência — mas
// NUNCA reimplementa a régua de papel: ele RENDERIZA estritamente o shape que
// veio da API (se algum dia vier montado para um não-billing por engano, ainda
// assim não há como aparecer R$/pacote — a ausência de `balance`/`lots`/`packs`
// no payload impede o branch de cobrança).
// S3-PARTE2 (05/07): o CTA "Recarregar" virou fluxo REAL — CheckoutPanel (tokeniza o
// cartão) + POST /financeiro/credits/recharge (one-off, Regra de Ouro no backend:
// só credita com pagamento APROVADO). idempotencyKey = 1 UUID por intenção (gerado ao
// abrir o pagamento) — retry de rede não cobra 2x (X-Idempotency-Key do MP) nem
// credita 2x (usageKey do ledger).
// 07/07 — vitrine v2 (pedido do dono, referência CNPJ Biz): hero de saldo,
// pacotes com R$/lead + economia, "Como funcionam os créditos" e FAQ. Números
// de pacote continuam 100% do backend (catálogo overlay do master) — nada de
// preço cravado aqui. Visual só via classe central (.cw-*, creditos.css).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { CheckoutPanel } from "@/components/hbx/checkout-panel";
import { useHbxShell } from "@/lib/hbx-shell";
import { IC_CAL, IC_REFRESH, IC_SEARCH, IC_TARGET } from "@/lib/plans";

type CreditLot = {
  id: string;
  amount: number;
  remaining: number;
  expiresAt: string | null;
  grantType: string | null;
};

type CreditPackPublic = {
  key: string;
  title: string;
  credits: number;
  price: number;
  defaultExpiryDays: number;
  badge: string | null;
  recommended: boolean;
  paused?: boolean;
};

// Shape completo (audiência de cobrança). A audiência neutra recebe só
// { enabled, leadsDisponiveis } — os campos abaixo simplesmente não existem
// no payload dela, então o branch de leitura cai no fallback neutro sozinho.
type CreditsMeResponse = {
  enabled: boolean;
  balance?: number;
  lots?: CreditLot[];
  packs?: CreditPackPublic[];
  leadsDisponiveis?: number;
};

const GRANT_TYPE_LABEL: Record<string, string> = {
  paid: "Comprado",
  courtesy_internal: "Cortesia",
  promo: "Promoção",
};

function fmtData(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function diasAte(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function brl(v: number) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Ic({ paths }: { paths: string[] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// Copy única da mecânica (mesma história na carteira e no FAQ — honesta com o
// backend: débito on-success, refund on-failure, FIFO por validade, saldo
// nunca negativo, carteira é da EMPRESA).
const HOW_ITEMS = [
  { ic: IC_SEARCH, t: "Buscar é grátis", d: "Pesquise e filtre empresas à vontade no Radar. Procurar não gasta nada." },
  { ic: IC_TARGET, t: "1 crédito = 1 lead", d: "O crédito só sai quando um lead novo é entregue e validado na sua lista." },
  { ic: IC_REFRESH, t: "Falhou, voltou", d: "Entrega que falha é estornada na hora. O saldo nunca fica negativo." },
  { ic: IC_CAL, t: "Validade por lote", d: "Cada recarga tem prazo próprio e o sistema gasta primeiro o que vence antes." },
];

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "O que é 1 crédito?",
    a: "1 crédito libera 1 lead completo na sua lista — telefone, cidade e os dados da empresa validados. Cada lead é cobrado uma única vez: se ele voltar pra sua lista, não debita de novo.",
  },
  {
    q: "O que NÃO gasta crédito?",
    a: "Buscar e filtrar empresas, ver sua lista, mandar mensagem, agendar retorno e usar o funil — tudo grátis. O crédito só sai quando um lead novo entra pra você.",
  },
  {
    q: "Créditos expiram?",
    a: "Cada lote tem validade própria (mostrada no pacote e no extrato). O sistema consome primeiro os créditos que vencem primeiro, então nada morre na mão à toa.",
  },
  {
    q: "E se a entrega falhar?",
    a: "Se o lead não chegar, o crédito volta pro saldo automaticamente. E o saldo nunca fica negativo: sem crédito, a entrega simplesmente não acontece — nada de surpresa na fatura.",
  },
  {
    q: "Quem da equipe gasta os créditos?",
    a: "A carteira é da empresa: a equipe toda puxa dela. Vendedor não vê valores — só quantos leads ainda pode puxar. Se quiser, você define um teto por vendedor no Gerencial.",
  },
  {
    q: "Preciso de assinatura pra usar?",
    a: "Não. Crédito é o modelo padrão: adicionar gente na equipe é grátis e não existe mensalidade obrigatória — você recarrega quando quiser. Operação sob medida é conta empresarial, negociada direto com o nosso time.",
  },
];

export function CreditsWalletSection() {
  // MODO-SHELL (Play billing): dentro da casca Android NENHUMA superfície de
  // compra pode aparecer — some a vitrine de packs (preço/CTA) e o CheckoutPanel;
  // saldo e extrato FICAM (mostrar saldo é permitido; vender não). No navegador
  // comum nada muda.
  const shellMode = useHbxShell();
  const [data, setData] = useState<CreditsMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recarregarMsg, setRecarregarMsg] = useState<string | null>(null);
  // 1 intenção de recarga = 1 idempotencyKey (gerada AO ABRIR o pagamento e fixa até
  // fechar) — é ela que impede cobrança/crédito duplo em retry no backend.
  const [pagando, setPagando] = useState<{ pack: CreditPackPublic; idempotencyKey: string } | null>(null);
  const recargaRef = useRef<HTMLElement | null>(null);

  const carregar = useCallback(() => {
    apiFetch<CreditsMeResponse>("/credits/me")
      .then(res => { setData(res); setError(null); })
      .catch((err: unknown) => {
        // 404 = flag HBX_CREDITS_ENABLED OFF (padrão de módulo inerte) — trata
        // como "indisponível" em vez de erro vermelho.
        setData(null);
        setError(err instanceof Error ? err.message : "Falha ao carregar a carteira.");
      });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const packs = useMemo(() => data?.packs || [], [data]);
  const lotesAtivos = useMemo(() => (data?.lots || []).filter(l => l.remaining > 0), [data]);

  // Próxima validade a vencer (dos lotes com saldo) — vira o chip do hero.
  const proximaExpiracao = useMemo(() => {
    const datados = lotesAtivos
      .filter(l => l.expiresAt)
      .sort((a, b) => new Date(a.expiresAt as string).getTime() - new Date(b.expiresAt as string).getTime());
    return datados[0] || null;
  }, [lotesAtivos]);

  // R$ por lead + economia % — derivados do catálogo do backend (nunca cravados).
  const unitPrice = useCallback((p: CreditPackPublic) => (p.credits > 0 ? p.price / p.credits : 0), []);
  const worstUnit = useMemo(() => {
    const units = packs.filter(p => !p.paused && p.credits > 0 && p.price > 0).map(unitPrice);
    return units.length ? Math.max(...units) : 0;
  }, [packs, unitPrice]);

  if (data === null && !error) {
    return (
      <section className="panel cfg-section">
        <div className="panel-head"><h2>Créditos</h2></div>
        <div style={{ padding: 18 }}><span className="sc-loading">Carregando…</span></div>
      </section>
    );
  }

  if (!data || data.enabled === false) {
    return (
      <section className="panel cfg-section">
        <div className="panel-head"><h2>Créditos</h2></div>
        <div style={{ padding: 18 }}>
          <span className="sc-note">Recurso indisponível no momento.</span>
        </div>
      </section>
    );
  }

  // Audiência neutra chegou aqui por engano (ex.: mudança futura de gate) —
  // ainda assim não há balance/lots/packs no payload; não inventa nada.
  if (data.balance === undefined && data.lots === undefined && data.packs === undefined) {
    return (
      <section className="panel cfg-section">
        <div className="panel-head"><h2>Créditos</h2></div>
        <div style={{ padding: 18 }}>
          <div className="kv">
            <div className="row"><span className="k">Leads disponíveis</span><span className="v">{data.leadsDisponiveis ?? 0}</span></div>
          </div>
        </div>
      </section>
    );
  }

  const diasProx = diasAte(proximaExpiracao?.expiresAt);

  return (
    <React.Fragment>
      {/* ── Carteira: saldo em destaque ─────────────────────────────── */}
      <section className="panel cfg-section">
        <div className="panel-head">
          <h2>Créditos</h2>
          <div className="meta">
            <span className="tag teal">{lotesAtivos.length} lote(s) ativo(s)</span>
          </div>
        </div>
        <div className="cw-hero">
          <div className="cw-hero__main">
            <span className="cw-hero__num">{data.balance ?? 0}</span>
            <div className="cw-hero__sub">
              <span className="cw-hero__label">créditos disponíveis</span>
              <span className="cw-hero__hint">1 crédito = 1 lead entregue e validado. O saldo é da empresa: a equipe toda puxa dele.</span>
            </div>
          </div>
          <div className="cw-hero__side">
            <div className="cw-hero__chips">
              {proximaExpiracao && diasProx !== null && (
                <span className={diasProx <= 7 ? "tag warn" : "tag"}>
                  {diasProx <= 0 ? "Lote vencendo hoje" : `Próxima validade: ${fmtData(proximaExpiracao.expiresAt)}`}
                </span>
              )}
            </div>
            {/* MODO-SHELL: sem CTA de recarga na casca — UMA linha neutra no
                lugar da vitrine (sem link, sem URL, sem preço). */}
            {shellMode ? (
              <span className="sc-note">Recargas pelo site.</span>
            ) : (
              <button
                className="btn-teal"
                onClick={() => recargaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                Recarregar créditos
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Recarga: pacotes como vitrine ───────────────────────────── */}
      {/* MODO-SHELL: vitrine (preço/CTA) + CheckoutPanel NUNCA renderizam na
          casca Android — bem digital só via Play Billing; a linha neutra que
          substitui a vitrine vive no hero acima. */}
      {!shellMode && (
      <section className="panel cfg-section" ref={recargaRef}>
        <div className="panel-head">
          <h2>Recarregar</h2>
          {pagando && (
            <button className="btn-ghost" onClick={() => setPagando(null)}>
              Voltar aos pacotes
            </button>
          )}
        </div>
        <div style={{ padding: 18, display: "grid", gap: 14 }}>
          {recarregarMsg && <div className="sc-msg is-ok">{recarregarMsg}</div>}
          {!pagando && packs.length === 0 && <span className="sc-note">Nenhum pacote disponível no momento.</span>}
          {!pagando && packs.length > 0 && (
            <React.Fragment>
              <div className="cw-packs">
                {packs.map(p => {
                  const unit = unitPrice(p);
                  const save = !p.paused && worstUnit > 0 && unit > 0 ? Math.round((1 - unit / worstUnit) * 100) : 0;
                  return (
                    <div key={p.key} className={"cw-pack" + (p.recommended ? " is-best" : "") + (p.paused ? " is-paused" : "")}>
                      {p.paused && <span className="cw-pack__paused">Em breve</span>}
                      {p.badge && <span className="cw-pack__badge">{p.badge}</span>}
                      <span className="cw-pack__title">{p.title}</span>
                      <span className="cw-pack__credits"><b>{p.credits.toLocaleString("pt-BR")}</b><em>créditos</em></span>
                      <span className="cw-pack__price">{brl(p.price)}</span>
                      {unit > 0 && <span className="cw-pack__unit">{brl(unit)} por lead</span>}
                      {save > 0 && <span className="cw-pack__save">{save}% mais barato por lead</span>}
                      <span className="cw-pack__life">Validade de {p.defaultExpiryDays} dias</span>
                      <button
                        className="btn-teal cw-pack__cta"
                        disabled={Boolean(p.paused)}
                        onClick={() => {
                          setRecarregarMsg(null);
                          setPagando({ pack: p, idempotencyKey: crypto.randomUUID() });
                        }}
                      >
                        Recarregar
                      </button>
                    </div>
                  );
                })}
              </div>
              <span className="sc-note">Pagamento no cartão — os créditos entram na hora da aprovação. Sem assinatura e sem fidelidade: recarregue só quando precisar.</span>
            </React.Fragment>
          )}
          {pagando && (
            <CheckoutPanel
              title={`Recarga — ${pagando.pack.title} (${pagando.pack.credits} créditos)`}
              ctaLabel={`Pagar ${brl(pagando.pack.price)}`}
              amount={pagando.pack.price}
              onSubmit={async ({ cardTokenId, paymentMethodId, taxDocument }) => {
                const res = await apiFetch<{ ok?: boolean; message?: string; credited?: number }>(
                  "/financeiro/credits/recharge",
                  {
                    method: "POST",
                    body: JSON.stringify({
                      packKey: pagando.pack.key,
                      idempotencyKey: pagando.idempotencyKey,
                      cardTokenId,
                      paymentMethodId,
                      taxDocument,
                    }),
                  },
                );
                if (!res?.ok) throw new Error(res?.message || "Não foi possível concluir a recarga.");
              }}
              onSuccess={() => {
                setPagando(null);
                setRecarregarMsg("Recarga concluída — créditos adicionados à carteira.");
                carregar();
              }}
            />
          )}
        </div>
      </section>
      )}

      {/* ── Como funcionam os créditos ──────────────────────────────── */}
      <section className="panel cfg-section">
        <div className="panel-head"><h2>Como funcionam os créditos</h2></div>
        <div style={{ padding: 18 }}>
          <div className="cw-how">
            {HOW_ITEMS.map(item => (
              <div key={item.t} className="cw-how__item">
                <span className="cw-how__ic"><Ic paths={item.ic} /></span>
                <span className="cw-how__t">{item.t}</span>
                <span className="cw-how__d">{item.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ + extrato de lotes ──────────────────────────────────── */}
      <section className="panel cfg-section">
        <div className="panel-head"><h2>Perguntas frequentes</h2></div>
        <div style={{ padding: 18, display: "grid", gap: 14 }}>
          <div className="cw-faq">
            {FAQ_ITEMS.map(item => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
            <details className="cw-extrato">
              <summary>Extrato de lotes ({lotesAtivos.length} com saldo)</summary>
              {lotesAtivos.length === 0 && <p>Nenhum lote com saldo disponível.</p>}
              {lotesAtivos.length > 0 && (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Origem</th><th>Concedido</th><th>Restante</th><th>Validade</th></tr></thead>
                    <tbody>
                      {lotesAtivos.map(l => {
                        const dias = diasAte(l.expiresAt);
                        const expirandoLogo = dias !== null && dias <= 7;
                        return (
                          <tr key={l.id}>
                            <td>{GRANT_TYPE_LABEL[l.grantType || ""] || l.grantType || "—"}</td>
                            <td>{l.amount}</td>
                            <td>{l.remaining}</td>
                            <td>
                              {l.expiresAt ? (
                                <span className={expirandoLogo ? "tag warn" : undefined}>
                                  {fmtData(l.expiresAt)}{expirandoLogo ? ` · expira em ${Math.max(dias as number, 0)}d` : ""}
                                </span>
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          </div>
        </div>
      </section>
    </React.Fragment>
  );
}
