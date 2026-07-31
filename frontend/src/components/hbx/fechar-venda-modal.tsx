"use client";

// ┌────────────────────────────────────────────────────────────────────────────┐
// │  FecharVendaModal — "É AQUI QUE FECHA"                                       │
// │                                                                              │
// │  UM modal de fechamento de venda, usado em DUAS telas (sem duplicar):       │
// │    • Atendimento (mode.kind = "conversation"): o vendedor falou com o        │
// │      cliente no WhatsApp e fecha ali mesmo o valor combinado.                │
// │    • Vendas (mode.kind = "lead"): fecha pelo card do pipeline.               │
// │                                                                              │
// │  Os dois caminhos batem no MESMO handoff do backend → gera o link de         │
// │  contratação, amarra a comissão ao vendedor que fechou e devolve um preview  │
// │  do quanto ele ganha. O passo-a-passo abaixo existe pra ele ENTENDER isso.   │
// │                                                                              │
// │  Visual: classes .fv-* em hbx-theme/fechar-venda.css (bloco pele-allow).    │
// └────────────────────────────────────────────────────────────────────────────┘

import React, { useEffect, useMemo, useState } from "react";

import { I, ICONS, WhatsAppMark } from "@/components/hbx/shell";
import { apiFetch } from "@/lib/api";
import { stampOnboardingEvent } from "@/lib/onboarding";
import { buildWaLink } from "@/lib/wa-link";

export type FecharVendaMode =
  | { kind: "lead"; leadId: string }
  | { kind: "conversation"; conversationId: number | string };

type Produto = {
  id: number;
  name: string;
  price?: number | null;
  priceCents?: number | null;
};

type CatalogPreco = { key: string; title: string; monthlyPrice: number | null };

type CommissionProfile = {
  commissionPercent: number;
  monthlyCap: number;
  setupCap: number;
  dueBusinessDays: number;
  sellsHbxPlans?: boolean;
};

type CommissionPreview = {
  hasOwner: boolean;
  ownerName: string | null;
  planLabel: string;
  planKey: string;
  percent: number;
  monthlyBase: number;
  monthlyCommission: number;
  setupValue: number;
  setupCommission: number;
  firstYearCommission: number;
  recurring: boolean;
  dueBusinessDays: number;
};

type LinkInfo = {
  registerUrl: string;
  message: string;
  planLabel: string;
  commissionPreview: CommissionPreview | null;
};

export type FecharVendaModalProps = {
  onClose: () => void;
  mode: FecharVendaMode;
  leadName?: string | null;
  phone?: string | null;
  sellsHbxPlans?: boolean;
  /** chamado depois de gerar o link (recarregar board/card) */
  onDone?: () => void;
};

function brl(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function brl0(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function applyCap(amount: number, cap: number) {
  return cap > 0 ? Math.min(amount, cap) : amount;
}

// Monte SÓ quando for abrir (o pai controla com `{aberto && <FecharVendaModal/>}`).
// Cada abertura é uma montagem nova → estado já nasce limpo, sem reset em effect.
export function FecharVendaModal({ onClose, mode, leadName, phone, sellsHbxPlans = false, onDone }: FecharVendaModalProps) {
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [planos, setPlanos] = useState<CatalogPreco[] | null>(null);
  const [profile, setProfile] = useState<CommissionProfile | null>(null);

  const [prodId, setProdId] = useState("");
  const [planSel, setPlanSel] = useState("");
  const [valor, setValor] = useState("");
  const [setupValor, setSetupValor] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [copied, setCopied] = useState(false);

  // Pré-cadastro do cliente (confere/completa no fechamento) — alimenta o prefill
  // do checkout (PLAN-VENDA-PRONTA-A/B). Nome/telefone já vêm do card/conversa;
  // e-mail/CPF o vendedor completa quando o cliente passa. CPF→CustomerProfile.
  const [cliName, setCliName] = useState(leadName || "");
  const [cliPhone, setCliPhone] = useState(phone || "");
  const [cliEmail, setCliEmail] = useState("");
  const [cliCpf, setCliCpf] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Carrega catálogos + perfil de comissão na montagem (= ao abrir).
  useEffect(() => {
    apiFetch<Produto[] | { items?: Produto[] }>("/products?status=active")
      .then(res => setProdutos(Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : []))
      .catch(() => setProdutos([]));
    apiFetch<{ plans?: CatalogPreco[] }>("/commercial-plans/public-catalog")
      .then(res => setPlanos(Array.isArray(res?.plans) ? res.plans : []))
      .catch(() => setPlanos([]));
    apiFetch<CommissionProfile>("/vendas/me/commission-profile")
      .then(res => setProfile(res || null))
      .catch(() => setProfile(null));
  }, []);

  // Fecha com ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function precoDoProduto(p?: Produto | null) {
    if (!p) return null;
    if (p.priceCents != null && Number.isFinite(p.priceCents)) return p.priceCents / 100;
    if (p.price != null && Number.isFinite(p.price)) return p.price;
    return null;
  }

  function escolherProduto(id: string) {
    setProdId(id);
    const p = (produtos || []).find(x => String(x.id) === id) || null;
    const preco = precoDoProduto(p);
    if (preco != null) setValor(String(preco));
  }
  function escolherPlano(key: string) {
    setPlanSel(key);
    const p = (planos || []).find(x => x.key === key) || null;
    if (p?.monthlyPrice != null) setValor(String(p.monthlyPrice));
  }

  // sellsHbxPlans é autoritativo no perfil do backend; o prop é só uma dica vinda
  // da tela. Assim o Atendimento não precisa saber disso — o modal resolve sozinho.
  const sellsHbx = Boolean(sellsHbxPlans || profile?.sellsHbxPlans);
  const percent = profile?.commissionPercent ?? 0;
  const valorNum = Number(valor) || 0;
  const setupNum = Number(setupValor) || 0;

  // Estimativa AO VIVO (antes de gerar). Depois de gerar, mostramos o número
  // confirmado que veio do backend (commissionPreview).
  const estMonthly = applyCap((valorNum * percent) / 100, profile?.monthlyCap ?? 0);
  const estSetup = applyCap((setupNum * percent) / 100, profile?.setupCap ?? 0);

  const preview = link?.commissionPreview ?? null;
  const showMonthly = preview ? preview.monthlyCommission : estMonthly;
  const showSetup = preview ? preview.setupCommission : estSetup;
  const showPercent = preview ? preview.percent : percent;
  const showBase = preview ? preview.monthlyBase : valorNum;
  const hasCommission = showPercent > 0 && showMonthly > 0;

  const planosComPreco = useMemo(() => (planos || []).filter(p => p.monthlyPrice != null && p.monthlyPrice > 0), [planos]);
  // Fechar venda = o lead vira CLIENTE da empresa → cadastro OBRIGATÓRIO (matriz de
  // disposição PR24062026, motivo `won`). Identidade mínima pra registrar o cliente:
  // nome + telefone. E-mail/CPF seguem opcionais (o cliente completa no link/cartão).
  const cadastroOk = cliName.trim().length >= 2 && cliPhone.replace(/\D/g, "").length >= 10;
  const podeGerar = !busy && cadastroOk && valorNum > 0 && (!sellsHbx || Boolean(planSel));

  // Grava o pré-cadastro (CustomerProfile, linka por telefone): persiste e-mail/CPF
  // do cliente ANTES de gerar o link, pra o prefill do checkout puxar. Não bloqueia
  // o fechamento se falhar (best-effort) — o cliente completa no cartão se faltar.
  async function persistCadastro() {
    const name = cliName.trim();
    const phoneV = cliPhone.trim();
    const emailV = cliEmail.trim();
    const cpfV = cliCpf.trim();
    if (!name && !phoneV && !emailV && !cpfV) return;
    await apiFetch("/cadastros/customer-profiles", {
      method: "POST",
      body: JSON.stringify({
        name: name || undefined,
        phone: phoneV || undefined,
        email: emailV || undefined,
        document: cpfV || undefined,
      }),
    }).catch(() => { /* best-effort: não trava o fechamento */ });
  }

  // Cadastro-em-corpo do handoff: preenche GAPS do lead (nome/telefone/email) —
  // o backend nunca sobrescreve valor existente.
  function cadastroBody(): Record<string, unknown> {
    return {
      ...(cliName.trim() ? { name: cliName.trim() } : {}),
      ...(cliPhone.trim() ? { phone: cliPhone.trim() } : {}),
      ...(cliEmail.trim() ? { email: cliEmail.trim() } : {}),
      ...(cliCpf.trim() ? { cpf: cliCpf.trim() } : {}),
    };
  }

  async function gerarLink() {
    if (!podeGerar) return;
    setBusy(true);
    setError(null);
    try {
      await persistCadastro();
      const body: Record<string, unknown> = {
        saleValue: valorNum,
        ...(setupNum > 0 ? { setupValue: setupNum } : {}),
        ...(prodId ? { productId: Number(prodId) } : {}),
        ...(sellsHbx && planSel ? { salePlanKey: planSel } : {}),
        ...cadastroBody(),
        origin: window.location.origin,
      };
      const path = mode.kind === "lead"
        ? `/vendas/lead/${encodeURIComponent(mode.leadId)}/hbx-handoff`
        : `/vendas/conversation/${encodeURIComponent(String(mode.conversationId))}/hbx-handoff`;
      const res = await apiFetch<{ registerUrl?: string; registerPath?: string; message?: string; planLabel?: string; commissionPreview?: CommissionPreview }>(
        path,
        { method: "POST", body: JSON.stringify(body) },
      );
      setLink({
        registerUrl: res?.registerUrl || res?.registerPath || "",
        message: res?.message || "",
        planLabel: res?.planLabel || "",
        commissionPreview: res?.commissionPreview || null,
      });
      void stampOnboardingEvent("first_deal_closed"); // marco: 1ª venda fechada (Camada 1)
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o link de contratação.");
    } finally {
      setBusy(false);
    }
  }

  // Salvar produto/valor no card SEM gerar link (só pelo pipeline do Vendas, modo
  // lead). Persiste o pré-cadastro junto. No Atendimento (conversa) não existe.
  async function salvarNoCard() {
    if (mode.kind !== "lead" || busy) return;
    setBusy(true);
    setError(null);
    setSavedMsg(null);
    try {
      await persistCadastro();
      await apiFetch(`/vendas/lead/${encodeURIComponent(mode.leadId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(prodId ? { productId: Number(prodId) } : {}),
          ...(sellsHbx && planSel ? { salePlanKey: planSel } : {}),
          ...(valorNum > 0 ? { saleValue: valorNum } : {}),
          ...(setupNum > 0 ? { setupValue: setupNum } : {}),
        }),
      });
      setSavedMsg("✓ Produto e valor salvos no card.");
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar no card.");
    } finally {
      setBusy(false);
    }
  }

  // FINANCEIRO-UNIVERSAL (Fase 1): gera uma conta-a-receber no Financeiro central
  // a partir do card (só modo lead). Persiste o valor no card ANTES (pra a cobrança
  // ler o valor certo) e chama o endpoint idempotente. Admin-only no backend.
  async function gerarCobranca() {
    if (mode.kind !== "lead" || busy) return;
    if (!(valorNum > 0)) { setError("Informe o valor combinado antes de gerar a cobrança."); return; }
    setBusy(true);
    setError(null);
    setSavedMsg(null);
    try {
      await persistCadastro();
      await apiFetch(`/vendas/lead/${encodeURIComponent(mode.leadId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(prodId ? { productId: Number(prodId) } : {}),
          ...(sellsHbx && planSel ? { salePlanKey: planSel } : {}),
          ...(valorNum > 0 ? { saleValue: valorNum } : {}),
          ...(setupNum > 0 ? { setupValue: setupNum } : {}),
        }),
      });
      const res = await apiFetch<{ chargeId: string; amount: number; alreadyExists: boolean }>(
        `/vendas/lead/${encodeURIComponent(mode.leadId)}/gerar-cobranca`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setSavedMsg(res?.alreadyExists ? "✓ Cobrança já existia — atualizada no Financeiro." : "✓ Cobrança gerada no Financeiro.");
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar a cobrança.");
    } finally {
      setBusy(false);
    }
  }

  function copiar() {
    if (!link) return;
    navigator.clipboard?.writeText(link.message || link.registerUrl).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => setError("Copie manualmente o texto do link."),
    );
  }
  function enviarWhats() {
    if (!link || !phone) return;
    const target = buildWaLink(phone, { text: link.message });
    if (target) window.open(target, "_blank", "noopener");
  }

  const step = link ? 3 : valorNum > 0 ? 2 : 1;

  return (
    <div className="fv-veil" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fv-modal" role="dialog" aria-modal="true" aria-label="Fechar venda">

        {/* ── Cabeçalho ───────────────────────────────────────────────── */}
        <div className="fv-head">
          <div className="fv-head-top">
            <h2 className="fv-title">Fechar venda{leadName ? ` — ${leadName}` : ""}</h2>
            <button className="fv-x" onClick={onClose} aria-label="Fechar">✕</button>
          </div>

          <div className="fv-rail" aria-hidden="true">
            <div className={"fv-step" + (step > 1 ? " is-done" : " is-active")}>
              <span className="fv-step-dot">{step > 1 ? <I d={ICONS.check} size={13} /> : "1"}</span>
              <span className="fv-step-lbl">Valor</span>
            </div>
            <span className="fv-rail-line" />
            <div className={"fv-step" + (step === 2 ? " is-active" : step > 2 ? " is-done" : "")}>
              <span className="fv-step-dot">{step > 2 ? <I d={ICONS.check} size={13} /> : "2"}</span>
              <span className="fv-step-lbl">Link</span>
            </div>
            <span className="fv-rail-line" />
            <div className={"fv-step" + (step === 3 ? " is-active" : "")}>
              <span className="fv-step-dot">3</span>
              <span className="fv-step-lbl">Comissão</span>
            </div>
          </div>
        </div>

        {/* ── Corpo ───────────────────────────────────────────────────── */}
        <div className="fv-body">
          {error && <div className="fv-error">{error}</div>}

          {!link && (
            <React.Fragment>
              {/* Pré-cadastro do cliente — confere/completa; alimenta o prefill do link */}
              <div className="fv-field">
                <label className="fv-label">Dados do cliente <span className="fv-req">obrigatório</span></label>
                <input className="fv-input" placeholder="Nome do cliente" value={cliName} onChange={e => setCliName(e.target.value)} />
                <input className="fv-input" placeholder="Telefone com DDD" value={cliPhone} onChange={e => setCliPhone(e.target.value)} inputMode="tel" />
                <input className="fv-input" type="email" placeholder="E-mail (opcional)" value={cliEmail} onChange={e => setCliEmail(e.target.value)} />
                <input className="fv-input" placeholder="CPF/CNPJ (opcional)" value={cliCpf} onChange={e => setCliCpf(e.target.value)} inputMode="numeric" />
              </div>

              {/* Plano (HBX admin) ou Produto (tenant comum) */}
              {sellsHbx ? (
                <div className="fv-field">
                  <label className="fv-label">Plano HBX a contratar</label>
                  <select className="fv-select" value={planSel} onChange={e => escolherPlano(e.target.value)}>
                    <option value="">Escolha o plano…</option>
                    {planosComPreco.map(p => (
                      <option key={p.key} value={p.key}>{p.title} — {brl0(p.monthlyPrice)}/mês</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="fv-field">
                  <label className="fv-label">Produto</label>
                  {produtos !== null && produtos.length === 0 ? (
                    <span className="fv-warn">Nenhum produto cadastrado — dá pra fechar só com o valor combinado.</span>
                  ) : (
                    <select className="fv-select" value={prodId} onChange={e => escolherProduto(e.target.value)}>
                      <option value="">Sem produto (só valor)</option>
                      {(produtos || []).map(p => {
                        const preco = precoDoProduto(p);
                        return <option key={p.id} value={String(p.id)}>{p.name}{preco != null ? ` — ${brl0(preco)}` : ""}</option>;
                      })}
                    </select>
                  )}
                  {planosComPreco.length > 0 && (
                    <div className="fv-plans">
                      <span className="fv-plans-h">Mensalidade por plano (referência)</span>
                      {planosComPreco.map(p => (
                        <div className="fv-plan-row" key={p.key}>
                          <span className="fv-plan-name">{p.title}</span>
                          <span className="fv-plan-price">{brl0(p.monthlyPrice)}/mês</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="fv-field">
                <label className="fv-label">Mensalidade combinada</label>
                <div className="fv-input-money">
                  <span className="fv-currency">R$</span>
                  <input className="fv-input" type="number" min={0} step="0.01" inputMode="decimal" placeholder="0,00"
                    value={valor} onChange={e => setValor(e.target.value)} autoFocus />
                </div>
              </div>

              <div className="fv-field">
                <label className="fv-label">Implantação (opcional)</label>
                <div className="fv-input-money">
                  <span className="fv-currency">R$</span>
                  <input className="fv-input" type="number" min={0} step="0.01" inputMode="decimal" placeholder="0,00"
                    value={setupValor} onChange={e => setSetupValor(e.target.value)} />
                </div>
              </div>
            </React.Fragment>
          )}

          {/* ── Estado de sucesso: link gerado ─────────────────────────── */}
          {link && (
            <div className="fv-success-burst">
              <div className="fv-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
              <div className="fv-badge"><I d={ICONS.check} size={30} /></div>
              <h3 className="fv-success-title">Pronto! Link de contratação gerado</h3>
              <p className="fv-success-sub">
                Manda no WhatsApp do cliente. Quando ele ativar, a venda entra sozinha no seu card{link.planLabel ? ` — ${link.planLabel}` : ""}.
              </p>
            </div>
          )}

          {/* ── Holofote da comissão (sempre visível) ──────────────────── */}
          <div className="fv-spot">
            <span className="fv-spot-h">
              <span className="fv-spot-coin"><I d={ICONS.money} size={15} /></span>
              {link ? "Sua comissão garantida nesta venda" : "Sua comissão nesta venda"}
            </span>
            {hasCommission ? (
              <React.Fragment>
                <div className={"fv-spot-amount" + (link ? " fv-pop" : "")} key={`${showMonthly}-${Boolean(link)}`}>
                  {brl(showMonthly)}<span className="fv-per">/mês</span>
                </div>
                <div className="fv-spot-meta">
                  <span>Base <b>{brl(showBase)}</b></span>
                  <span>Comissão <b>{showPercent}%</b></span>
                  {showSetup > 0 && <span>Implantação <b>{brl(showSetup)}</b></span>}
                </div>
                <span className="fv-spot-chip">
                  <I d={ICONS.check} size={11} /> Recorrente — todo mês que o cliente pagar
                </span>
                {/* Cascata (Camada 2): só o ganho DELE em destaque; esta linha sutil
                    reconhece que a venda alimenta a cadeia, sem expor valores alheios. */}
                <span className="fv-spot-cascade">Uma parte do valor da venda também remunera sua empresa e o HBX.</span>
              </React.Fragment>
            ) : (
              <div className="fv-spot-zero">
                {percent > 0
                  ? "Informe o valor combinado acima para ver quanto você ganha."
                  : "Seu percentual de comissão ainda é 0%. Peça ao gestor para definir o seu % — aí o valor aparece aqui."}
              </div>
            )}
          </div>

          {/* ── Ações ──────────────────────────────────────────────────── */}
          {!link ? (
            <div className="fv-actions">
              <button className="fv-btn fv-btn-primary" onClick={gerarLink} disabled={!podeGerar}>
                {busy ? "Gerando link…" : !cadastroOk ? "Preencha nome e telefone do cliente" : sellsHbx && !planSel ? "Escolha o plano acima" : valorNum <= 0 ? "Informe o valor combinado" : (<>Gerar link de contratação <I d={ICONS.arrow} size={15} /></>)}
              </button>
              {mode.kind === "lead" && (
                <button className="fv-btn fv-btn-ghost" onClick={salvarNoCard} disabled={busy}>
                  {sellsHbx ? "Salvar plano/valor no card" : "Salvar produto/valor no card"}
                </button>
              )}
              {mode.kind === "lead" && (
                <button
                  className="fv-btn fv-btn-ghost"
                  onClick={gerarCobranca}
                  disabled={busy || valorNum <= 0}
                  title={valorNum <= 0 ? "Informe o valor combinado" : "Gera uma conta a receber no Financeiro"}
                >
                  Gerar cobrança no Financeiro
                </button>
              )}
              {savedMsg && <p className="fv-foot-note">{savedMsg}</p>}
            </div>
          ) : (
            <div className="fv-actions">
              <div className="fv-linkbox">
                <span className="fv-linkbox-h">Link do cliente</span>
                <span className="fv-linkbox-url">{link.registerUrl}</span>
              </div>
              <div className="fv-btn-row">
                <button className="fv-btn fv-btn-ghost" onClick={copiar}>
                  <I d={ICONS.doc} size={14} /> {copied ? "Copiado!" : "Copiar mensagem"}
                </button>
                <button className="fv-btn fv-btn-wa" onClick={enviarWhats} disabled={!phone} title={phone ? "Abrir conversa com a mensagem pronta" : "Card sem telefone"}>
                  <WhatsAppMark size={15} /> Enviar no WhatsApp
                </button>
              </div>
              <button className="fv-btn fv-btn-ghost" onClick={onClose}>
                Concluir — acompanhar ativação no card
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
