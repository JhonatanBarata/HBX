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
// Lei 5 (design system): visual só via classe central (.sc-*, .kv, .tag, .btn-*).

import React, { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { CheckoutPanel } from "@/components/hbx/checkout-panel";

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

export function CreditsWalletSection({ userEmail = "", userName = "" }: { userEmail?: string; userName?: string } = {}) {
  const [data, setData] = useState<CreditsMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recarregarMsg, setRecarregarMsg] = useState<string | null>(null);
  // 1 intenção de recarga = 1 idempotencyKey (gerada AO ABRIR o pagamento e fixa até
  // fechar) — é ela que impede cobrança/crédito duplo em retry no backend.
  const [pagando, setPagando] = useState<{ pack: CreditPackPublic; idempotencyKey: string } | null>(null);

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

  const lots = data.lots || [];
  const packs = data.packs || [];
  const lotesAtivos = lots.filter(l => l.remaining > 0);

  return (
    <React.Fragment>
      <section className="panel cfg-section">
        <div className="panel-head">
          <h2>Créditos</h2>
          <div className="meta">
            <span className="tag teal">{data.balance ?? 0} crédito(s)</span>
          </div>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 14 }}>
          <span className="sc-note">1 crédito = 1 lead. O saldo cai conforme os leads são puxados pela equipe.</span>

          {recarregarMsg && <div className="sc-msg is-warn">{recarregarMsg}</div>}

          <div className="sc-field">
            <label className="field-label">Lotes</label>
            {lotesAtivos.length === 0 && <span className="sc-hint">Nenhum lote com saldo disponível.</span>}
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
          </div>
        </div>
      </section>

      <section className="panel cfg-section">
        <div className="panel-head">
          <h2>Recarregar créditos</h2>
          {pagando && (
            <button className="btn-ghost" onClick={() => setPagando(null)}>
              Voltar aos pacotes
            </button>
          )}
        </div>
        <div style={{ padding: 18, display: "grid", gap: 14 }}>
          {!pagando && packs.length === 0 && <span className="sc-note">Nenhum pacote disponível no momento.</span>}
          {!pagando && packs.length > 0 && (
            <div className="plan-grid">
              {packs.map(p => (
                <div key={p.key} className="panel sc-field" style={{ padding: 14 }}>
                  <div className="meta" style={{ justifyContent: "space-between" }}>
                    <strong>{p.title}</strong>
                    {p.recommended && <span className="tag teal">{p.badge || "Recomendado"}</span>}
                  </div>
                  <div className="kv">
                    <div className="row"><span className="k">Créditos</span><span className="v">{p.credits}</span></div>
                    <div className="row"><span className="k">Preço</span><span className="v">{brl(p.price)}</span></div>
                    <div className="row"><span className="k">Validade</span><span className="v">{p.defaultExpiryDays} dias</span></div>
                  </div>
                  <button
                    className="btn-teal"
                    onClick={() => {
                      setRecarregarMsg(null);
                      setPagando({ pack: p, idempotencyKey: crypto.randomUUID() });
                    }}
                  >
                    Recarregar
                  </button>
                </div>
              ))}
            </div>
          )}
          {pagando && (
            <CheckoutPanel
              planKey="hbx_padrao"
              email={userEmail}
              name={userName}
              title={`Recarga — ${pagando.pack.title} (${pagando.pack.credits} créditos)`}
              ctaLabel={`Pagar ${brl(pagando.pack.price)}`}
              amountOverride={pagando.pack.price}
              hideCycle
              reactivation
              submitOverride={async ({ cardTokenId, paymentMethodId, taxDocument }) => {
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
    </React.Fragment>
  );
}
