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
import { GlassPill, useGlassPill } from "@/components/hbx/glass-pill";
import { useHbxShell } from "@/lib/hbx-shell";

// PIX (PR22082026-CLIENTE-ME-ACHA) — dono de distribuidora paga Pix. 2 fases: POST gera o
// QR (cobrança pendente no backend), o painel faz poll a cada 4 s até o MP aprovar (ou o
// webhook chegar antes — quem chegar primeiro credita, idempotente). O QR vale 30 min.
type PixCreateResponse =
  | {
      ok: true;
      status: "pending" | "approved" | "cancelled";
      paymentId: string;
      packKey: string;
      credits: number;
      amount: number;
      qrCode: string | null;
      qrCodeBase64: string | null;
      ticketUrl: string | null;
      expiresAt: string | null;
      mock: boolean;
    }
  | { ok: false; code: string; message: string };

type PixStatusResponse = {
  ok: true;
  status: "pending" | "approved" | "cancelled";
  paymentId: string;
  credited: number;
  balanceAfter: number | null;
  expiresAt: string | null;
};

type PixState = {
  paymentId: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string | null;
  status: "pending" | "approved" | "cancelled";
  credited: number;
  mock: boolean;
};

const PIX_POLL_MS = 4000;

function fmtHora(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

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

  // PIX — método escolhido, o QR vivo e o relógio do poll. `pix` zera quando a intenção
  // (pagando) muda: QR é da intenção, não da tela.
  const [metodo, setMetodo] = useState<"pix" | "cartao">("pix");
  const [pix, setPix] = useState<PixState | null>(null);
  const [pixBusy, setPixBusy] = useState(false);
  const [pixErro, setPixErro] = useState<string | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const metodoPill = useGlassPill<HTMLButtonElement>(pagando ? metodo : null, pagando?.idempotencyKey);

  // Uma INTENÇÃO de recarga = 1 idempotencyKey. Abrir/trocar a intenção zera o QR (o QR é
  // da intenção, não da tela) — feito AQUI, no gesto, e não num efeito (lint react-hooks).
  function abrirIntencao(pack: CreditPackPublic) {
    setRecarregarMsg(null);
    setPix(null);
    setPixErro(null);
    setPixCopiado(false);
    setPagando({ pack, idempotencyKey: crypto.randomUUID() });
  }
  function fecharIntencao() {
    setPix(null);
    setPixErro(null);
    setPixCopiado(false);
    setPagando(null);
  }

  async function gerarPix() {
    if (!pagando || pixBusy) return;
    setPixBusy(true);
    setPixErro(null);
    setPixCopiado(false);
    try {
      const res = await apiFetch<PixCreateResponse>("/financeiro/credits/recharge/pix", {
        method: "POST",
        body: JSON.stringify({ packKey: pagando.pack.key, idempotencyKey: pagando.idempotencyKey }),
      });
      if (!res?.ok) {
        // QR expirado da MESMA intenção: a próxima tentativa nasce com intenção nova.
        if (res && "code" in res && res.code === "CHARGE_FAILED" && /expirou/i.test(res.message || "")) {
          setPagando({ pack: pagando.pack, idempotencyKey: crypto.randomUUID() });
        }
        throw new Error((res && "message" in res && res.message) || "Não consegui gerar o Pix agora.");
      }
      setPix({
        paymentId: res.paymentId,
        qrCode: res.qrCode,
        qrCodeBase64: res.qrCodeBase64,
        ticketUrl: res.ticketUrl,
        expiresAt: res.expiresAt,
        status: res.status,
        credited: 0,
        mock: res.mock,
      });
    } catch (err: unknown) {
      setPixErro(err instanceof Error ? err.message : "Não consegui gerar o Pix agora.");
    } finally {
      setPixBusy(false);
    }
  }

  async function copiarPix() {
    if (!pix?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pix.qrCode);
      setPixCopiado(true);
      window.setTimeout(() => setPixCopiado(false), 2500);
    } catch {
      setPixErro("Não consegui copiar automaticamente — selecione o código e copie.");
    }
  }

  // Poll enquanto pendente. Para sozinho em aprovado/cancelado ou quando a intenção some.
  const pixPaymentId = pix?.paymentId ?? null;
  const pixPendente = pix?.status === "pending";
  useEffect(() => {
    if (!pixPaymentId || !pixPendente) return;
    let vivo = true;
    const tick = async () => {
      try {
        const res = await apiFetch<PixStatusResponse>(`/financeiro/credits/recharge/pix/${encodeURIComponent(pixPaymentId)}`);
        if (!vivo || !res?.ok) return;
        if (res.status !== "pending") {
          setPix(prev => (prev ? { ...prev, status: res.status, credited: res.credited || 0 } : prev));
          if (res.status === "approved") {
            setRecarregarMsg(
              res.credited > 0
                ? `Pix confirmado — ${res.credited} créditos adicionados à carteira.`
                : "Pix confirmado — créditos adicionados à carteira.",
            );
            carregar();
          }
        }
      } catch {
        // rede caiu neste tick: o próximo tenta de novo (o QR continua válido)
      }
    };
    const id = window.setInterval(() => { void tick(); }, PIX_POLL_MS);
    void tick();
    return () => { vivo = false; window.clearInterval(id); };
  }, [pixPaymentId, pixPendente, carregar]);

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
            {/* MODO-SHELL: sem CTA de recarga na casca. NADA que nomeie um canal
                de compra (site/URL/preço) — política de pagamentos da Play proíbe
                até "steering" (apontar pagamento externo de bem digital). O hero
                segue mostrando saldo/validade; aqui não renderiza nada. */}
            {shellMode ? null : (
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
            <button className="btn-ghost" onClick={() => fecharIntencao()}>
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
                      {unit > 0 && <span className="cw-pack__unit">{brl(unit)} por crédito</span>}
                      {save > 0 && <span className="cw-pack__save">{save}% mais barato por crédito</span>}
                      <span className="cw-pack__life">Validade de {p.defaultExpiryDays} dias</span>
                      <button
                        className="btn-teal cw-pack__cta"
                        disabled={Boolean(p.paused)}
                        onClick={() => abrirIntencao(p)}
                      >
                        Recarregar
                      </button>
                    </div>
                  );
                })}
              </div>
            </React.Fragment>
          )}
          {pagando && (
            <div className="glass-pill-track cw-metodos" role="tablist" aria-label="Forma de pagamento">
              <GlassPill rect={metodoPill.rect} landing={metodoPill.landing} onSettled={metodoPill.onSettled} />
              {(["pix", "cartao"] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={metodo === m}
                  ref={metodoPill.itemRef(m)}
                  className={"glass-pill-item cw-metodo" + (metodo === m ? " active" : "")}
                  onClick={() => setMetodo(m)}
                >
                  {m === "pix" ? "Pix" : "Cartão"}
                </button>
              ))}
            </div>
          )}
          {pagando && metodo === "pix" && (
            <div className="cw-pix">
              <div className="cw-pix__head">
                <span className="cw-pix__title">Recarga — {pagando.pack.title} ({pagando.pack.credits} créditos)</span>
                <span className="cw-pix__total">{brl(pagando.pack.price)}</span>
              </div>
              {pixErro && <div className="reg-checkout__err">{pixErro}</div>}
              {!pix && (
                <div className="cw-pix__actions">
                  <button className="btn-teal" type="button" disabled={pixBusy} onClick={() => void gerarPix()}>
                    {pixBusy ? "Gerando QR Code…" : "Gerar QR Code Pix"}
                  </button>
                </div>
              )}
              {pix && pix.status === "pending" && (
                <div className="cw-pix__body">
                  <div className="cw-pix__qr">
                    {pix.qrCodeBase64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code Pix" />
                    ) : (
                      <span className="sc-note">Use o código copia-e-cola ao lado.</span>
                    )}
                  </div>
                  <div className="cw-pix__steps">
                    <div><b>1.</b> Abra o app do seu banco e escolha pagar com Pix.</div>
                    <div><b>2.</b> Leia o QR Code ou cole o código abaixo.</div>
                    <div><b>3.</b> Pagou? Pode deixar esta tela aberta — os créditos entram sozinhos.</div>
                    {pix.qrCode && (
                      <div className="cw-pix__code">
                        <textarea readOnly value={pix.qrCode} onFocus={e => e.currentTarget.select()} aria-label="Código Pix copia e cola" />
                        <div className="cw-pix__actions">
                          <button className="btn-ghost" type="button" onClick={() => void copiarPix()}>
                            {pixCopiado ? "Copiado ✓" : "Copiar código"}
                          </button>
                          {pix.ticketUrl && (
                            <a className="btn-ghost" href={pix.ticketUrl} target="_blank" rel="noreferrer">Abrir no Mercado Pago</a>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="cw-pix__status">
                      <span className="cw-pix__dot" aria-hidden="true" />
                      <span>Aguardando o pagamento{pix.expiresAt ? ` · válido até ${fmtHora(pix.expiresAt)}` : ""}{pix.mock ? " · (modo teste)" : ""}</span>
                    </div>
                  </div>
                </div>
              )}
              {pix && pix.status === "approved" && (
                <div className="cw-pix__status is-ok">Pix confirmado — créditos na carteira. Pode fechar esta etapa.</div>
              )}
              {pix && pix.status === "cancelled" && (
                <React.Fragment>
                  <div className="cw-pix__status is-bad">Este QR Code expirou ou foi cancelado. Nada foi cobrado.</div>
                  <div className="cw-pix__actions">
                    <button className="btn-teal" type="button" onClick={() => abrirIntencao(pagando.pack)}>
                      Gerar outro QR Code
                    </button>
                  </div>
                </React.Fragment>
              )}
              <p className="reg-checkout__safe">Pix e cartão são processados pelo Mercado Pago. A HBX não guarda dados bancários.</p>
            </div>
          )}
          {pagando && metodo === "cartao" && (
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
                fecharIntencao();
                setRecarregarMsg("Recarga concluída — créditos adicionados à carteira.");
                carregar();
              }}
            />
          )}
        </div>
      </section>
      )}

      {/* ── Extrato de lotes ────────────────────────────────────────── */}
      <section className="panel cfg-section">
        <div className="panel-head"><h2>Extrato</h2></div>
        <div style={{ padding: 18, display: "grid", gap: 14 }}>
          <div className="cw-faq">
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
