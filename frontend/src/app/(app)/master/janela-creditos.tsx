"use client";

// Janela Créditos (MASTER-REFAB S2) — vira o CENTRO FINANCEIRO do modelo crédito.
// Absorve a antiga janela-pagamentos.tsx (guia "Recargas" abaixo) — aquele arquivo foi
// apagado neste sprint e a entrada "Pagamentos" saiu do menu em page.client.tsx.
//
// 5 guias:
//   Visão geral        — agregados de leitura (receita recarga 30d, circulação, expiração,
//                         empresas sem saldo). Nada clicável além de atalho pras outras guias.
//   Empresas            — saldo/lotes ativos/último consumo por empresa + "Conceder" inline.
//   Packs                — CRUD do catálogo de recarga (era a guia única "Pacotes" antes do S2).
//   Config                — CreditGlobalConfig (welcomeCredits/welcomeExpiryDays/defaultExpiryDays
//                         + GUARDRAILS S3: dailyDeliveryCapDefault). Renomeada de "Bônus de
//                         cadastro" (10/07) — já não é só bônus, é config global mesmo.
//                         + S4 (10/07): Política de indicação migrada da Self-Checkout morta
//                         (guia Política) — é a única parte dela viva no runtime (financeiro
//                         calcula desconto de indicação na cobrança). Desconto anual/trial/
//                         módulos-por-plano/assentos NÃO migraram — aposentados no backend (S7,
//                         escrita bloqueada 410; leitura legada preservada).
//   Recargas             — histórico de notificações de pagamento (ex-janela-pagamentos.tsx).
//
// Endpoints:
//   GET  /credits/master/overview                 → agregados (S2, novo)
//   GET  /credits/master/config                    → welcome*/defaultExpiryDays/dailyDeliveryCapDefault
//   GET/PUT  /credits/master/packs*                 → catálogo de pacotes (S3-PARTE1)
//   PUT  /credits/master/config/expiry-default      → prazo default global (S3-PARTE1)
//   PUT  /credits/master/config/welcome-batch       → bônus de cadastro (A3)
//   PUT  /credits/master/config/delivery-cap        → teto diário default anti-scraper (GUARDRAILS S3)
//   POST /credits/master/company/:id/grant          → concessão manual (S3-PARTE1)
//   GET  /master/payment-notifications/history       → guia Recargas (ex-janela-pagamentos.tsx)
//   GET  /modules/master/global-integrations         → lê referralDiscount* (ex-Self-Checkout)
//   PUT  /modules/master/billing-policy               → grava só os campos referralDiscount* daqui
//                                                        (annualPlanDiscountPercent: aposentado no
//                                                        S7, o backend ignora o campo na escrita)
//
// Idempotência OBRIGATÓRIA na concessão (Fix II do S3-PARTE1): usageKey UUID gerada 1x na
// abertura da intenção (double-click não duplica; 2 concessões legítimas usam tokens diferentes).
//
// "Créditos em circulação" e "empresas sem saldo" NÃO batem endpoint novo — são derivados de
// `companies` (creditsBalance, já carregado por MasterClient via /modules/master/companies, a
// MESMA fonte que a lista/ficha de Empresas usa) pra não duplicar a régua de saldo em 2 lugares.
//
// Lei 5 (design system): tokens hbx-theme; sem hex cru — os cards de Visão geral usam inline
// style com var(--hbx-*), mesmo padrão já usado em janela-pagamentos.tsx/janela-empresas.tsx.

import React, { useCallback, useEffect, useState } from "react";

import type { ApiError } from "@/lib/api";
import { apiFetch } from "@/lib/api";
import { reportError } from "@/lib/error-bus";
import { useTabParam } from "@/lib/use-tab-param";

import type { MasterCompany } from "./page.client";
import { accountTypeLabel, accountTypeTagClass, fmtDataHora } from "./page.client";

const GUIAS = ["Visão geral", "Empresas", "Packs", "Ações", "Rota", "Config", "Recargas"] as const;
type Guia = (typeof GUIAS)[number];

type CreditPack = {
  key: string;
  title: string;
  status: "available" | "paused";
  credits: number;
  price: number;
  defaultExpiryDays: number;
  observation: string;
  badge: string | null;
  recommended: boolean;
};

type PackForm = {
  title: string;
  observation: string;
  status: "available" | "paused";
  credits: string;
  price: string;
  defaultExpiryDays: string;
};

type GrantType = "paid" | "courtesy_internal" | "promo";

// MASTER-REFAB S6 (10/07 noite): cortesia morre como palavra na UI — o VALOR gravado
// (courtesy_internal) não muda (semântica fiscal fica), só o rótulo vira "Concessão interna".
const GRANT_TYPES: { value: GrantType; label: string }[] = [
  { value: "courtesy_internal", label: "Concessão interna" },
  { value: "paid", label: "Pago (fora do checkout)" },
  { value: "promo", label: "Promoção" },
];

type CreditsOverview = {
  enabled?: boolean;
  revenueRecharge30d?: number;
  revenueRecharge30dCount?: number;
  creditsExpiring30d?: number;
  creditsExpiring30dLots?: number;
  companies?: { companyId: number; activeLots: number; lastConsumptionAt: string | null }[];
};

type GlobalConfig = {
  defaultExpiryDays?: number;
  welcomeCredits?: number;
  welcomeExpiryDays?: number;
  dailyDeliveryCapDefault?: number;
};

// Catálogo de ações: todas são editáveis e só existem os modos Grátis/Débito.
type CreditActionMode = "free" | "debit";

type CreditActionItem = {
  actionKey: string;
  label: string;
  // 28/07 — ação de preço FIXO (a avulsa é absorvida pela rota). Vem do backend
  // pra tela não repetir a regra de negócio numa lista de chaves.
  locked?: boolean;
  lockedReason?: string | null;
  base: { mode: CreditActionMode; cost: number };
  override: { mode: CreditActionMode; cost: number } | null;
  effective: { mode: CreditActionMode; cost: number };
};

// 28/07 — uma linha do painel de controle por empresa: em que plano ela está e
// quanto da franquia já queimou no mês. É a resposta pra "quem está no crédito
// puro x quem está num plano fixo", que antes não existia em lugar nenhum.
type EmpresaPlanoItem = {
  companyId: number;
  nivel: "BASIC" | "ADVANCED" | "FULL";
  titulo: string;
  precoMensal: number;
  paradasInclusas: number;
  paradasUsadas: number;
  paradasRestantes: number;
};

// PR28072026 HÍBRIDO (28/07) — um nível vendável de Rota: mensalidade fixa +
// franquia de paradas do mês. `editado` = o master mexeu (dá pra restaurar).
type NivelRotaItem = {
  nivel: "BASIC" | "ADVANCED" | "FULL";
  titulo: string;
  slogan: string;
  precoMensal: number;
  franquiaParadasMes: number;
  franquiaBlocos: number;
  editado: boolean;
};

const MODE_OPTIONS: { value: CreditActionMode; label: string }[] = [
  { value: "free", label: "Grátis" },
  { value: "debit", label: "Débito" },
];

// Apoio curto embaixo do rótulo: só a UNIDADE de cobrança. É o que evita errar o
// preço — as duas rotas cobram por PARADA desde 28/07 (o bloco de 5 morreu).
const ACTION_UNIT_HINT: Record<string, string> = {
  lead_delivery: "cobrado na entrega do lead",
  logistica_essential_block: "cobra 1x por parada da rota",
  logistica_tracked_delivery: "cobra 1x por entrega concluída com rastreamento válido",
};

function toForm(p: CreditPack | null): PackForm {
  return {
    title: p?.title || "",
    observation: p?.observation || "",
    status: p?.status === "paused" ? "paused" : "available",
    credits: p ? String(p.credits) : "",
    price: p ? String(p.price) : "",
    defaultExpiryDays: p ? String(p.defaultExpiryDays) : "",
  };
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback defensivo (browsers antigos/contexto não-seguro) — ainda assim
  // estável por abertura do form, só não é RFC4122 estrito.
  return `grant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function n0(value: number) {
  return value.toLocaleString("pt-BR");
}

// Feature flag OFF (ou sem permissão) devolve 403/404 — mesma dica em todo o módulo créditos:
// não é "erro", é "recurso desligado". Erro de rede/500 real segue mostrando a mensagem.
function isFeatureFlagStatus(status: unknown) {
  return status === 403 || status === 404;
}

export function JanelaCreditos({ companies, reload }: {
  companies: MasterCompany[] | null;
  reload?: () => Promise<void> | void;
}) {
  const [guia, setGuia] = useTabParam<Guia>("guia", "Visão geral", GUIAS);

  // ── Overview (Visão geral + guia Empresas: lotes ativos/último consumo) ────────────────────
  const [overview, setOverview] = useState<CreditsOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const carregarOverview = useCallback(() => {
    return apiFetch<CreditsOverview>("/credits/master/overview")
      .then(res => { setOverview(res); setOverviewError(null); })
      .catch((err: unknown) => {
        setOverview(null);
        const status = (err as ApiError)?.status;
        setOverviewError(isFeatureFlagStatus(status) ? null : ((err as ApiError)?.message || "Falha ao carregar a visão geral."));
      });
  }, []);

  useEffect(() => { carregarOverview(); }, [carregarOverview]);

  const overviewByCompany = new Map((overview?.companies || []).map(c => [c.companyId, c]));
  const circulacaoTotal = (companies || []).reduce((sum, c) => sum + (c.creditsBalance || 0), 0);
  const empresasSemSaldo = (companies || []).filter(c => (c.creditsBalance ?? 0) <= 0).length;

  // ── Conceder crédito inline (guia Empresas) ─────────────────────────────────────────────────
  const [grantOpenFor, setGrantOpenFor] = useState<number | null>(null);
  const [grantAmount, setGrantAmount] = useState("");
  const [grantType, setGrantType] = useState<GrantType>("courtesy_internal");
  const [grantExpiresAt, setGrantExpiresAt] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  // Idempotência OBRIGATÓRIA (Fix II S3-PARTE1): 1 UUID por ABERTURA de intenção de concessão —
  // double-click/retry de rede reusam a MESMA chave (backend dedupa); nova intenção = nova chave.
  const [usageKey, setUsageKey] = useState<string>(() => newIdempotencyKey());

  function abrirConceder(companyId: number) {
    setGrantOpenFor(companyId);
    setGrantAmount("");
    setGrantType("courtesy_internal");
    setGrantExpiresAt("");
    setGrantMsg(null);
    setUsageKey(newIdempotencyKey());
  }

  function fecharConceder() {
    setGrantOpenFor(null);
    setGrantMsg(null);
  }

  async function conceder(companyId: number) {
    if (grantBusy) return;
    const amount = Number(grantAmount);
    if (!Number.isInteger(amount) || amount <= 0) { setGrantMsg("Informe uma quantidade inteira positiva de créditos."); return; }

    setGrantBusy(true);
    setGrantMsg(null);
    try {
      const body: Record<string, unknown> = { amount, grantType, usageKey };
      if (grantExpiresAt) body.expiresAt = new Date(`${grantExpiresAt}T00:00:00`).toISOString();
      const res = await apiFetch<{ ok?: boolean; balanceAfter?: number; expiresAt?: string | null; alreadyProcessed?: boolean }>(
        `/credits/master/company/${companyId}/grant`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setGrantMsg(res?.alreadyProcessed
        ? "✓ Concessão já havia sido processada antes (idempotência) — nada foi duplicado."
        : `✓ Créditos concedidos. Saldo após: ${res?.balanceAfter ?? "—"}.`);
      // Nova intenção a partir daqui — gera nova chave (double-click do botão "Conceder"
      // de novo não reusa a mesma).
      setUsageKey(newIdempotencyKey());
      await Promise.all([reload?.(), carregarOverview()]);
    } catch (e) {
      reportError(e);
      setGrantMsg(e instanceof Error ? e.message : "Falha ao conceder crédito.");
    } finally {
      setGrantBusy(false);
    }
  }

  // ── Packs ────────────────────────────────────────────────────────────────────────────────
  const [packs, setPacks] = useState<CreditPack[] | null>(null);
  const [packKey, setPackKey] = useState<string | null>(null);
  const [packForm, setPackForm] = useState<PackForm>(toForm(null));
  const [packBusy, setPackBusy] = useState(false);
  const [packMsg, setPackMsg] = useState<string | null>(null);
  // Lista vazia real (flag ligada, catálogo zerado) × erro de rede/500 do endpoint contam
  // histórias diferentes pro dono — não podem cair na mesma dica de "confira a flag".
  const [packsLoadError, setPacksLoadError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- setPackKey é setter de useState (identidade estável); deps `[]` já corretas
  const carregarPacks = useCallback(() => {
    apiFetch<{ packs?: CreditPack[] }>("/credits/master/packs")
      .then(res => {
        const list = Array.isArray(res?.packs) ? res.packs : [];
        setPacks(list);
        setPacksLoadError(null);
        setPackKey(prev => prev && list.some(p => p.key === prev) ? prev : (list[0]?.key || null));
      })
      .catch((err: unknown) => {
        setPacks([]);
        const status = (err as ApiError)?.status;
        setPacksLoadError(isFeatureFlagStatus(status) ? null : ((err as ApiError)?.message || "Falha ao carregar os pacotes de crédito."));
      });
  }, []);

  useEffect(() => { carregarPacks(); }, [carregarPacks]);

  useEffect(() => {
    const atual = (packs || []).find(p => p.key === packKey) || null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resincroniza o form ao trocar de pack/recarregar a lista; efeito legítimo
    setPackForm(toForm(atual));
  }, [packKey, packs]);

  async function salvarPack() {
    if (packBusy || !packKey) return;
    setPackBusy(true);
    setPackMsg(null);
    try {
      const body = {
        title: packForm.title.trim(),
        observation: packForm.observation,
        status: packForm.status,
        credits: Number(packForm.credits),
        price: Number(String(packForm.price).replace(",", ".")),
        defaultExpiryDays: Number(packForm.defaultExpiryDays),
      };
      const res = await apiFetch<{ pack?: CreditPack }>(`/credits/master/packs/${encodeURIComponent(packKey)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (res?.pack) {
        setPacks(prev => (prev || []).map(p => p.key === res.pack!.key ? res.pack! : p));
      }
      setPackMsg("✓ Pacote salvo. Reflete na carteira de todas as empresas.");
    } catch (e) {
      reportError(e);
      setPackMsg(e instanceof Error ? e.message : "Falha ao salvar o pacote.");
    } finally {
      setPackBusy(false);
    }
  }

  const pausado = packForm.status === "paused";

  // ── Painel por empresa: plano + consumo do mês + débito manual (28/07) ────────────────────
  // Pedido do dono: "é importante eu ter controle sem depender de vc". Aqui ele
  // troca o plano da empresa, vê a franquia queimando e ajusta saldo — sem
  // abrir ficha por ficha e sem me pedir nada.
  const [planos, setPlanos] = useState<EmpresaPlanoItem[] | null>(null);
  const [planoBusy, setPlanoBusy] = useState<number | null>(null);
  const [planoMsg, setPlanoMsg] = useState<string | null>(null);

  const carregarPlanos = useCallback(() => {
    apiFetch<{ empresas?: EmpresaPlanoItem[] }>("/logistica/master/niveis/empresas")
      .then(res => setPlanos(Array.isArray(res?.empresas) ? res.empresas : []))
      .catch(() => setPlanos([]));
  }, []);

  useEffect(() => { carregarPlanos(); }, [carregarPlanos]);

  const planoPorEmpresa = new Map((planos || []).map(p => [p.companyId, p]));

  async function trocarPlano(companyId: number, nivel: string) {
    if (planoBusy) return;
    setPlanoBusy(companyId);
    setPlanoMsg(null);
    try {
      await apiFetch(`/logistica/master/company/${companyId}/nivel`, {
        method: "PUT",
        body: JSON.stringify({ nivel }),
      });
      setPlanoMsg(`✓ Empresa #${companyId} agora é ${nivel}.`);
      carregarPlanos();
    } catch (e) {
      reportError(e);
      setPlanoMsg(e instanceof Error ? e.message : "Falha ao trocar o plano.");
    } finally {
      setPlanoBusy(null);
    }
  }

  // ── Débito manual: o botão que faltava (o backend já existia) ──────────────
  // Contrato do backend: amount inteiro > 0, motivo obrigatório e idempotencyKey
  // por INTENÇÃO (double-click não debita 2×). O débito clampa no saldo — nunca
  // negativa a carteira.
  const [debitOpenFor, setDebitOpenFor] = useState<number | null>(null);
  const [debitAmount, setDebitAmount] = useState("");
  const [debitReason, setDebitReason] = useState("");
  const [debitToken, setDebitToken] = useState("");
  const [debitBusy, setDebitBusy] = useState(false);
  const [debitMsg, setDebitMsg] = useState<string | null>(null);

  function abrirDebito(companyId: number, saldo: number | null | undefined) {
    setDebitOpenFor(companyId);
    setDebitAmount("");
    setDebitReason("");
    setDebitMsg(null);
    // Token novo a cada ABERTURA da intenção — MESMO helper do conceder (fora do
    // componente de propósito: Date.now/random dentro do render é impuro).
    setDebitToken(newIdempotencyKey());
    setGrantOpenFor(null);
    void saldo;
  }

  function fecharDebito() {
    setDebitOpenFor(null);
    setDebitAmount("");
    setDebitReason("");
    setDebitMsg(null);
  }

  async function debitar(companyId: number) {
    if (debitBusy) return;
    const amount = Math.trunc(Number(debitAmount));
    if (!Number.isFinite(amount) || amount <= 0) { setDebitMsg("Quantidade deve ser um inteiro maior que zero."); return; }
    if (!debitReason.trim()) { setDebitMsg("Motivo é obrigatório (fica no extrato e na trilha do master)."); return; }
    setDebitBusy(true);
    setDebitMsg(null);
    try {
      await apiFetch(`/credits/master/company/${companyId}/debit`, {
        method: "POST",
        body: JSON.stringify({ amount, reason: debitReason.trim(), idempotencyKey: debitToken }),
      });
      setDebitMsg("✓ Débito aplicado.");
      // `reload` é opcional na assinatura do componente (mesmo contrato do conceder).
      await reload?.();
    } catch (e) {
      reportError(e);
      setDebitMsg(e instanceof Error ? e.message : "Falha ao debitar.");
    } finally {
      setDebitBusy(false);
    }
  }

  // ── Rota: os 3 níveis vendáveis (PR28072026 HÍBRIDO — 28/07) ──────────────────────────────
  // Modelo híbrido decidido pelo dono: mensalidade FIXA + franquia de paradas
  // inclusa; o que passar disso consome crédito (guia Ações ao lado). Preço e
  // franquia editáveis aqui — a base de fábrica vive no backend e "Restaurar"
  // volta pra ela.
  const [niveis, setNiveis] = useState<NivelRotaItem[] | null>(null);
  const [niveisErro, setNiveisErro] = useState<string | null>(null);
  const [nivelForms, setNivelForms] = useState<Record<string, { precoMensal: string; franquiaParadasMes: string }>>({});
  const [nivelBusy, setNivelBusy] = useState<string | null>(null);
  const [nivelMsg, setNivelMsg] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- setters de useState têm identidade estável; deps [] corretas
  const carregarNiveis = useCallback(() => {
    apiFetch<{ niveis?: NivelRotaItem[] }>("/logistica/master/niveis")
      .then(res => {
        const list = Array.isArray(res?.niveis) ? res.niveis : [];
        setNiveis(list);
        setNiveisErro(null);
        setNivelForms(prev => {
          const next = { ...prev };
          for (const n of list) next[n.nivel] = { precoMensal: String(n.precoMensal), franquiaParadasMes: String(n.franquiaParadasMes) };
          return next;
        });
      })
      .catch((err: unknown) => {
        setNiveis([]);
        const status = (err as ApiError)?.status;
        setNiveisErro(isFeatureFlagStatus(status) ? null : ((err as ApiError)?.message || "Falha ao carregar os níveis de Rota."));
      });
  }, []);

  useEffect(() => { carregarNiveis(); }, [carregarNiveis]);

  function aplicarNivel(item: NivelRotaItem) {
    setNiveis(prev => (prev || []).map(n => (n.nivel === item.nivel ? item : n)));
    setNivelForms(prev => ({ ...prev, [item.nivel]: { precoMensal: String(item.precoMensal), franquiaParadasMes: String(item.franquiaParadasMes) } }));
  }

  async function salvarNivel(nivel: string) {
    if (nivelBusy) return;
    const form = nivelForms[nivel];
    const preco = Number(form?.precoMensal);
    const franquia = Number(form?.franquiaParadasMes);
    if (!Number.isFinite(preco) || preco < 0) { setNivelMsg("Mensalidade inválida."); return; }
    if (!Number.isFinite(franquia) || franquia < 0) { setNivelMsg("Franquia inválida."); return; }
    setNivelBusy(nivel);
    setNivelMsg(null);
    try {
      const res = await apiFetch<{ nivel?: NivelRotaItem }>(`/logistica/master/niveis/${encodeURIComponent(nivel)}`, {
        method: "PUT",
        body: JSON.stringify({ precoMensal: preco, franquiaParadasMes: Math.trunc(franquia) }),
      });
      if (res?.nivel) aplicarNivel(res.nivel);
      setNivelMsg("✓ Nível salvo.");
    } catch (e) {
      reportError(e);
      setNivelMsg(e instanceof Error ? e.message : "Falha ao salvar o nível.");
    } finally {
      setNivelBusy(null);
    }
  }

  async function restaurarNivel(nivel: string) {
    if (nivelBusy) return;
    setNivelBusy(nivel);
    setNivelMsg(null);
    try {
      const res = await apiFetch<{ nivel?: NivelRotaItem }>(`/logistica/master/niveis/${encodeURIComponent(nivel)}`, { method: "DELETE" });
      if (res?.nivel) aplicarNivel(res.nivel);
      setNivelMsg("✓ Nível restaurado para o padrão.");
    } catch (e) {
      reportError(e);
      setNivelMsg(e instanceof Error ? e.message : "Falha ao restaurar o nível.");
    } finally {
      setNivelBusy(null);
    }
  }

  // ── Ações (catálogo de ações de crédito — PR11072026 W1) ───────────────────────────────────
  const [actions, setActions] = useState<CreditActionItem[] | null>(null);
  const [actionsLoadError, setActionsLoadError] = useState<string | null>(null);
  const [actionForms, setActionForms] = useState<Record<string, { mode: CreditActionMode; cost: string }>>({});
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- setActionForms é setter de useState (identidade estável); deps `[]` já corretas
  const carregarAcoes = useCallback(() => {
    apiFetch<{ actions?: CreditActionItem[] }>("/credits/master/action-catalog")
      .then(res => {
        const list = Array.isArray(res?.actions) ? res.actions : [];
        setActions(list);
        setActionsLoadError(null);
        setActionForms(prev => {
          const next = { ...prev };
          for (const a of list) next[a.actionKey] = { mode: a.effective.mode, cost: String(a.effective.cost) };
          return next;
        });
      })
      .catch((err: unknown) => {
        setActions([]);
        const status = (err as ApiError)?.status;
        setActionsLoadError(isFeatureFlagStatus(status) ? null : ((err as ApiError)?.message || "Falha ao carregar o catálogo de ações."));
      });
  }, []);

  useEffect(() => { carregarAcoes(); }, [carregarAcoes]);

  function aplicarAcaoAtualizada(item: CreditActionItem) {
    setActions(prev => (prev || []).map(a => (a.actionKey === item.actionKey ? item : a)));
    setActionForms(prev => ({ ...prev, [item.actionKey]: { mode: item.effective.mode, cost: String(item.effective.cost) } }));
  }

  async function salvarAcao(actionKey: string) {
    if (actionBusyKey) return;
    // Ação travada nem chega a ter botão; guarda só pra nunca disparar 400.
    if ((actions || []).some(a => a.actionKey === actionKey && a.locked)) return;
    const form = actionForms[actionKey];
    const cost = Number(form?.cost);
    if (!Number.isFinite(cost) || cost < 0 || cost > 1000) { setActionMsg("Custo deve ficar entre 0 e 1000 créditos."); return; }
    if (form.mode === "debit" && cost <= 0) { setActionMsg("Ação em Débito precisa ter custo maior que zero."); return; }
    setActionBusyKey(actionKey);
    setActionMsg(null);
    try {
      const res = await apiFetch<{ action?: CreditActionItem }>(`/credits/master/action-catalog/${encodeURIComponent(actionKey)}`, {
        method: "PUT",
        body: JSON.stringify({ mode: form.mode, cost }),
      });
      if (res?.action) aplicarAcaoAtualizada(res.action);
      setActionMsg("✓ Ação salva.");
    } catch (e) {
      reportError(e);
      setActionMsg(e instanceof Error ? e.message : "Falha ao salvar a ação.");
    } finally {
      setActionBusyKey(null);
    }
  }

  async function restaurarAcao(actionKey: string) {
    if (actionBusyKey) return;
    setActionBusyKey(actionKey);
    setActionMsg(null);
    try {
      const res = await apiFetch<{ action?: CreditActionItem }>(`/credits/master/action-catalog/${encodeURIComponent(actionKey)}`, {
        method: "DELETE",
      });
      if (res?.action) aplicarAcaoAtualizada(res.action);
      setActionMsg("✓ Ação restaurada ao padrão.");
    } catch (e) {
      reportError(e);
      setActionMsg(e instanceof Error ? e.message : "Falha ao restaurar a ação.");
    } finally {
      setActionBusyKey(null);
    }
  }

  // ── Config global (welcomeCredits/welcomeExpiryDays/defaultExpiryDays) ─────────────────────
  const [welcomeCredits, setWelcomeCredits] = useState("");
  const [welcomeExpiryDays, setWelcomeExpiryDays] = useState("");
  const [defaultExpiryDays, setDefaultExpiryDays] = useState("");
  const [configBusy, setConfigBusy] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);
  const [configLoadError, setConfigLoadError] = useState<string | null>(null);
  // GUARDRAILS S3 (10/07) — teto diário default de leads (anti-scraper), aplicado a toda
  // empresa sem override próprio (ficha, janela-empresas.tsx). Validação PRÓPRIA (0 = sem teto
  // é um valor válido aqui, diferente dos 3 campos acima que exigem positivo) -> botão separado.
  const [dailyCapDefaultForm, setDailyCapDefaultForm] = useState("");
  const [dailyCapBusy, setDailyCapBusy] = useState(false);
  const [dailyCapMsg, setDailyCapMsg] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- os 4 setters usados são de useState (identidade estável); deps `[]` já corretas
  const carregarConfig = useCallback(() => {
    apiFetch<GlobalConfig>("/credits/master/config")
      .then(res => {
        setWelcomeCredits(res?.welcomeCredits != null ? String(res.welcomeCredits) : "");
        setWelcomeExpiryDays(res?.welcomeExpiryDays != null ? String(res.welcomeExpiryDays) : "");
        setDefaultExpiryDays(res?.defaultExpiryDays != null ? String(res.defaultExpiryDays) : "");
        setDailyCapDefaultForm(res?.dailyDeliveryCapDefault != null ? String(res.dailyDeliveryCapDefault) : "");
        setConfigLoadError(null);
      })
      .catch((err: unknown) => {
        const status = (err as ApiError)?.status;
        setConfigLoadError(isFeatureFlagStatus(status) ? null : ((err as ApiError)?.message || "Falha ao carregar a configuração."));
      });
  }, []);

  useEffect(() => { carregarConfig(); }, [carregarConfig]);

  async function salvarConfig() {
    if (configBusy) return;
    const wc = Number(welcomeCredits);
    const wed = Number(welcomeExpiryDays);
    const ded = Number(defaultExpiryDays);
    if (!Number.isFinite(wc) || wc <= 0 || !Number.isFinite(wed) || wed <= 0 || !Number.isFinite(ded) || ded <= 0) {
      setConfigMsg("Informe números positivos nos 3 campos.");
      return;
    }
    setConfigBusy(true);
    setConfigMsg(null);
    try {
      await Promise.all([
        apiFetch("/credits/master/config/welcome-batch", {
          method: "PUT",
          body: JSON.stringify({ welcomeCredits: wc, welcomeExpiryDays: wed }),
        }),
        apiFetch("/credits/master/config/expiry-default", {
          method: "PUT",
          body: JSON.stringify({ defaultExpiryDays: ded }),
        }),
      ]);
      setConfigMsg("✓ Configuração salva.");
      carregarConfig();
    } catch (e) {
      reportError(e);
      setConfigMsg(e instanceof Error ? e.message : "Falha ao salvar a configuração.");
    } finally {
      setConfigBusy(false);
    }
  }

  // GUARDRAILS S3 (10/07) — teto diário default (0 = sem teto global; empresas sem override
  // próprio ficam sem teto). "" no campo = mantém o valor atual (não força um número).
  async function salvarDailyCapDefault() {
    if (dailyCapBusy) return;
    const value = dailyCapDefaultForm.trim() === "" ? NaN : Number(dailyCapDefaultForm);
    if (!Number.isFinite(value) || value < 0) {
      setDailyCapMsg("Informe um número >= 0 (0 = sem teto).");
      return;
    }
    setDailyCapBusy(true);
    setDailyCapMsg(null);
    try {
      await apiFetch("/credits/master/config/delivery-cap", {
        method: "PUT",
        body: JSON.stringify({ dailyDeliveryCapDefault: value }),
      });
      setDailyCapMsg("✓ Teto diário default salvo.");
      carregarConfig();
    } catch (e) {
      reportError(e);
      setDailyCapMsg(e instanceof Error ? e.message : "Falha ao salvar o teto diário default.");
    } finally {
      setDailyCapBusy(false);
    }
  }

  // ── Política de indicação (S4 — migrada da Self-Checkout morta) ────────────────────────────
  // Único pedaço da guia "Política" com efeito vivo no runtime: financeiro.service calcula o
  // desconto de indicação na cobrança de empresas com assinatura/ciclo ativo (buildReferralSnapshot).
  // O desconto anual (mesmo endpoint) NÃO migrou e foi aposentado no S7 — o backend ignora
  // annualPlanDiscountPercent na escrita (leitura legada em financeiro.service preservada).
  const [refActive, setRefActive] = useState(false);
  const [refPercent, setRefPercent] = useState("");
  const [refMode, setRefMode] = useState("ONCE");
  const [refBusy, setRefBusy] = useState(false);
  const [refMsg, setRefMsg] = useState<string | null>(null);
  const [refLoadError, setRefLoadError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- os 3 setters usados são de useState (identidade estável); deps `[]` já corretas
  const carregarPoliticaIndicacao = useCallback(() => {
    apiFetch<{ referralDiscountActive?: boolean; referralDiscountPercent?: number; referralDiscountMode?: string }>(
      "/modules/master/global-integrations",
    )
      .then(res => {
        setRefActive(Boolean(res?.referralDiscountActive));
        setRefPercent(res?.referralDiscountPercent != null ? String(res.referralDiscountPercent) : "");
        setRefMode(String(res?.referralDiscountMode || "ONCE"));
        setRefLoadError(null);
      })
      .catch((err: unknown) => {
        const status = (err as ApiError)?.status;
        setRefLoadError(isFeatureFlagStatus(status) ? null : ((err as ApiError)?.message || "Falha ao carregar a política de indicação."));
      });
  }, []);

  useEffect(() => { carregarPoliticaIndicacao(); }, [carregarPoliticaIndicacao]);

  async function salvarPoliticaIndicacao() {
    if (refBusy) return;
    setRefBusy(true);
    setRefMsg(null);
    try {
      const body: Record<string, unknown> = { referralDiscountActive: refActive, referralDiscountMode: refMode };
      if (refPercent !== "") body.referralDiscountPercent = Number(String(refPercent).replace(",", ".")) || 0;
      await apiFetch("/modules/master/billing-policy", { method: "PUT", body: JSON.stringify(body) });
      setRefMsg("✓ Política de indicação salva.");
    } catch (e) {
      reportError(e);
      setRefMsg(e instanceof Error ? e.message : "Falha ao salvar a política de indicação.");
    } finally {
      setRefBusy(false);
    }
  }

  const empresasOrdenadas = (companies || [])
    .slice()
    .sort((a, b) => (a.creditsBalance ?? 0) - (b.creditsBalance ?? 0)); // sem saldo primeiro

  return (
    <React.Fragment>
      <section className="panel">
        <div className="panel-head">
          <h2>Créditos — centro financeiro</h2>
          <div className="meta">1 crédito = 1 lead</div>
        </div>
        <div className="tabs sc-tabs">
          {GUIAS.map(g => (
            <button key={g} className={"tab" + (guia === g ? " active" : "")} onClick={() => setGuia(g)}>
              {g}
            </button>
          ))}
        </div>
      </section>

      {guia === "Visão geral" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Visão geral</h2>
            <div className="meta">últimos 30 dias</div>
          </div>
          {overviewError && (
            <div className="sc-intro"><div className="sc-msg is-warn">{overviewError}</div></div>
          )}
          {overview === null && !overviewError && (
            <div className="sc-intro"><span className="sc-loading">Carregando…</span></div>
          )}
          {overview && (
            <div className="sc-tiles">
              <button type="button" onClick={() => setGuia("Recargas")} className="btn-ghost sc-tile">
                <span className="sc-tile-label">Receita de recarga (30d)</span>
                <strong className="sc-tile-value">{brl(overview.revenueRecharge30d || 0)}</strong>
                <span className="sc-tile-sub">{overview.revenueRecharge30dCount || 0} recarga(s) aprovada(s)</span>
              </button>
              <button type="button" onClick={() => setGuia("Empresas")} className="btn-ghost sc-tile">
                <span className="sc-tile-label">Créditos em circulação</span>
                <strong className="sc-tile-value">{n0(circulacaoTotal)}</strong>
                <span className="sc-tile-sub">{(companies || []).length} empresa(s) na base</span>
              </button>
              <button type="button" onClick={() => setGuia("Empresas")} className="btn-ghost sc-tile">
                <span className="sc-tile-label">Expirando em 30 dias</span>
                <strong className="sc-tile-value">{n0(overview.creditsExpiring30d || 0)}</strong>
                <span className="sc-tile-sub">{overview.creditsExpiring30dLots || 0} lote(s)</span>
              </button>
              <button type="button" onClick={() => setGuia("Empresas")} className="btn-ghost sc-tile">
                <span className="sc-tile-label">Empresas sem saldo</span>
                <strong className="sc-tile-value">{n0(empresasSemSaldo)}</strong>
                <span className="sc-tile-sub">abrir na guia Empresas</span>
              </button>
            </div>
          )}
        </section>
      )}

      {guia === "Empresas" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Empresas ({(companies || []).length})</h2>
            <div className="meta">sem saldo primeiro</div>
          </div>
          {planoMsg && <div className="sc-intro"><div className={"sc-msg " + (planoMsg.startsWith("✓") ? "is-ok" : "is-warn")}>{planoMsg}</div></div>}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Empresa</th><th>Conta HBX</th><th>Plano de Rota</th><th>Franquia do mês</th><th>Saldo</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {companies === null && (
                  <tr><td colSpan={6} className="muted-note">Carregando…</td></tr>
                )}
                {companies !== null && companies.length === 0 && (
                  <tr><td colSpan={6} className="muted-note">Nenhuma empresa na base.</td></tr>
                )}
                {empresasOrdenadas.map(c => {
                  const meta = overviewByCompany.get(c.id);
                  const isOpen = grantOpenFor === c.id;
                  const isDebitOpen = debitOpenFor === c.id;
                  const plano = planoPorEmpresa.get(c.id);
                  const franquiaAcabou = !!plano && plano.paradasInclusas > 0 && plano.paradasRestantes === 0;
                  return (
                    <React.Fragment key={c.id}>
                      <tr>
                        <td>
                          <div className="co">
                            <strong>{c.name}</strong>
                            <span className="sub2">#{c.id}</span>
                          </div>
                        </td>
                        <td>
                          <span className={accountTypeTagClass(c.accountType)}>{accountTypeLabel(c.accountType)}</span>
                        </td>
                        <td>
                          {plano ? (
                            <div className="co">
                              <select className="field-dark" style={{ maxWidth: 130 }} value={plano.nivel}
                                disabled={planoBusy === c.id}
                                onChange={e => trocarPlano(c.id, e.target.value)}>
                                <option value="BASIC">Basic</option>
                                <option value="ADVANCED">Advanced</option>
                                <option value="FULL">Full</option>
                              </select>
                              <span className="sub2">{brl(plano.precoMensal)}/mês</span>
                            </div>
                          ) : <span className="muted-note">—</span>}
                        </td>
                        <td>
                          {plano && plano.paradasInclusas > 0 ? (
                            <div className="co">
                              <strong>{n0(plano.paradasUsadas)} / {n0(plano.paradasInclusas)}</strong>
                              <span className="sub2">
                                {franquiaAcabou ? "esgotada — consumindo crédito" : n0(plano.paradasRestantes) + " paradas restantes"}
                              </span>
                            </div>
                          ) : <span className="muted-note">sem franquia</span>}
                        </td>
                        <td>
                          <div className="co">
                            <span className={c.creditsBalance != null && c.creditsBalance <= 0 ? "tag red" : "tag teal"}>
                              {c.creditsBalance != null ? n0(c.creditsBalance) : "—"}
                            </span>
                            {/* lotes + último consumo continuam aqui (viraram sub-linha
                                pra caber as colunas de plano sem perder informação). */}
                            <span className="sub2">
                              {(meta?.activeLots ?? 0)} lote(s) · {fmtDataHora(meta?.lastConsumptionAt) || "sem consumo"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.66rem" }}
                              onClick={() => (isOpen ? fecharConceder() : abrirConceder(c.id))}>
                              {isOpen ? "Cancelar" : "Conceder"}
                            </button>
                            <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.66rem" }}
                              disabled={!c.creditsBalance || c.creditsBalance <= 0}
                              onClick={() => (isDebitOpen ? fecharDebito() : abrirDebito(c.id, c.creditsBalance))}>
                              {isDebitOpen ? "Cancelar" : "Debitar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="sel">
                          <td colSpan={6}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", padding: "10px 2px" }}>
                              <div className="sc-field" style={{ minWidth: 120 }}>
                                <label className="field-label">Quantidade</label>
                                <input className="field-dark" inputMode="numeric" value={grantAmount}
                                  onChange={e => setGrantAmount(e.target.value)} placeholder="0" />
                              </div>
                              <div className="sc-field" style={{ minWidth: 180 }}>
                                <label className="field-label">Tipo</label>
                                <select className="field-dark" value={grantType} onChange={e => setGrantType(e.target.value as GrantType)}>
                                  {GRANT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                              </div>
                              <div className="sc-field" style={{ minWidth: 160 }}>
                                <label className="field-label">Expiração (opcional)</label>
                                <input className="field-dark" type="date" value={grantExpiresAt}
                                  onChange={e => setGrantExpiresAt(e.target.value)} />
                              </div>
                              <button className="btn-teal" disabled={grantBusy || !grantAmount} onClick={() => conceder(c.id)}>
                                {grantBusy ? "Concedendo…" : "Conceder crédito"}
                              </button>
                            </div>
                            {grantMsg && <div className={"sc-msg " + (grantMsg.startsWith("✓") ? "is-ok" : "is-warn")} style={{ paddingBottom: 8 }}>{grantMsg}</div>}
                          </td>
                        </tr>
                      )}
                      {isDebitOpen && (
                        <tr className="sel">
                          <td colSpan={6}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", padding: "10px 2px" }}>
                              <div className="sc-field" style={{ minWidth: 120 }}>
                                <label className="field-label">Quantidade</label>
                                <input className="field-dark" inputMode="numeric" value={debitAmount}
                                  onChange={e => setDebitAmount(e.target.value)} placeholder="0" />
                              </div>
                              <div className="sc-field" style={{ minWidth: 260, flex: 1 }}>
                                <label className="field-label">Motivo (obrigatório)</label>
                                <input className="field-dark" value={debitReason}
                                  onChange={e => setDebitReason(e.target.value)} />
                              </div>
                              <button className="btn-ghost" disabled={debitBusy}
                                onClick={() => setDebitAmount(String(Math.trunc(Number(c.creditsBalance) || 0)))}>
                                Zerar saldo
                              </button>
                              <button className="btn-teal" disabled={debitBusy || !debitAmount || !debitReason.trim()}
                                onClick={() => debitar(c.id)}>
                                {debitBusy ? "Debitando…" : "Debitar crédito"}
                              </button>
                            </div>
                            {debitMsg && <div className={"sc-msg " + (debitMsg.startsWith("✓") ? "is-ok" : "is-warn")} style={{ paddingBottom: 8 }}>{debitMsg}</div>}
                            <div className="sc-hint" style={{ paddingBottom: 8 }}>
                              O débito nunca deixa o saldo negativo (para no que existe) e fica registrado no extrato da empresa com este motivo.
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {guia === "Packs" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Packs de recarga</h2>
            <div className="meta">
              <select className="field-dark" value={packKey || ""} onChange={e => setPackKey(e.target.value)} aria-label="Pacote">
                {(packs || []).map(p => <option key={p.key} value={p.key}>{p.title}</option>)}
              </select>
              <button className="btn-teal" disabled={packBusy || !packKey} onClick={salvarPack}>{packBusy ? "Salvando…" : "Salvar pacote"}</button>
            </div>
          </div>
          <div className="sc-intro">
            <span className="sc-note">
              Preço e tamanho são definidos por você; o que estiver &quot;available&quot; aparece na vitrine pública.
            </span>
          </div>
          <div className="sc-body">
            {packs === null && <span className="sc-loading">Carregando…</span>}

            {packs !== null && packs.length === 0 && (
              <span className="sc-note">
                {packsLoadError || "Nenhum pacote encontrado — confira se o recurso de créditos está habilitado."}
              </span>
            )}

            {packs !== null && packs.length > 0 && (
              <React.Fragment>
                {packMsg && <div className={"sc-msg " + (packMsg.startsWith("✓") ? "is-ok" : "is-warn")}>{packMsg}</div>}
                <div className="sc-field">
                  <label className="field-label">Nome do pacote</label>
                  <input className="field-dark" maxLength={60} value={packForm.title}
                    onChange={e => setPackForm(f => ({ ...f, title: e.target.value }))} placeholder="Nome exibido na carteira" />
                </div>
                <div className="sc-field">
                  <label className="field-label">Observação</label>
                  <textarea className="field-dark sc-textarea" rows={3} maxLength={400} value={packForm.observation}
                    onChange={e => setPackForm(f => ({ ...f, observation: e.target.value }))}
                    placeholder="Texto que acompanha o pacote" />
                </div>
                <div className="sc-field">
                  <label className="field-label">Créditos no pacote</label>
                  <input className="field-dark" inputMode="numeric" value={packForm.credits}
                    onChange={e => setPackForm(f => ({ ...f, credits: e.target.value }))} placeholder="0" />
                </div>
                <div className="sc-field">
                  <label className="field-label">Preço (R$)</label>
                  <input className="field-dark" inputMode="decimal" value={packForm.price}
                    onChange={e => setPackForm(f => ({ ...f, price: e.target.value }))} placeholder="0,00" />
                </div>
                <div className="sc-field">
                  <label className="field-label">Validade do crédito (dias)</label>
                  <input className="field-dark" inputMode="numeric" value={packForm.defaultExpiryDays}
                    onChange={e => setPackForm(f => ({ ...f, defaultExpiryDays: e.target.value }))} placeholder="90" />
                </div>
                <div className="sc-field sc-field--sep">
                  <label className="field-label">Disponibilidade</label>
                  <label className="sc-check">
                    <input type="checkbox" checked={pausado}
                      onChange={e => setPackForm(f => ({ ...f, status: e.target.checked ? "paused" : "available" }))} />
                    Pausar este pacote
                  </label>
                  <span className={"sc-hint" + (pausado ? " is-warn" : "")}>
                    {pausado ? "Pausado: some da vitrine de recarga da empresa." : "Ativo: aparece na vitrine de recarga."}
                  </span>
                </div>
              </React.Fragment>
            )}
          </div>
        </section>
      )}

      {guia === "Ações" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Catálogo de ações</h2>
            <div className="meta">Custos por uso · até 3 casas decimais</div>
          </div>
          {actionsLoadError && <div className="sc-intro"><div className="sc-msg is-warn">{actionsLoadError}</div></div>}
          {actionMsg && <div className="sc-intro"><div className={"sc-msg " + (actionMsg.startsWith("✓") ? "is-ok" : "is-warn")}>{actionMsg}</div></div>}
          <div className="tbl-wrap">
            {/* --acoes: cada linha é DINHEIRO — nome e unidade de cobrança nunca truncam. */}
            <table className="tbl tbl--acoes">
              <thead>
                <tr><th>Ação</th><th>Modo</th><th>Custo</th><th>Status</th><th aria-label="Editar"></th></tr>
              </thead>
              <tbody>
                {actions === null && (
                  <tr><td colSpan={5} className="muted-note">Carregando…</td></tr>
                )}
                {actions !== null && actions.length === 0 && (
                  <tr><td colSpan={5} className="muted-note">{actionsLoadError || "Nenhuma ação encontrada."}</td></tr>
                )}
                {(actions || []).map(a => {
                  const form = actionForms[a.actionKey] || { mode: a.effective.mode, cost: String(a.effective.cost) };
                  const busy = actionBusyKey === a.actionKey;
                  // Desativada = o master editou a ação para Grátis (não cobra mais).
                  // Grátis de fábrica (sem override) segue como "padrão".
                  const desativada = !!a.override && a.effective.mode === "free";
                  // 28/07 (dono) — ação de preço FIXO some com campo e botão: a tela
                  // deixava editar o que o backend recusa, e o master só descobria
                  // no erro do "Salvar". Agora a linha explica antes de tentar.
                  const hint = a.locked ? (a.lockedReason || "Preço fixo — não aceita débito próprio.") : ACTION_UNIT_HINT[a.actionKey];
                  if (a.locked) {
                    return (
                      <tr key={a.actionKey}>
                        <td>
                          <div className="co">
                            <strong>{a.label}</strong>
                            {hint && <span className="sub2">{hint}</span>}
                          </div>
                        </td>
                        <td>{MODE_OPTIONS.find(o => o.value === a.effective.mode)?.label || "Grátis"}</td>
                        <td>—</td>
                        <td><span className="tag">fixo</span></td>
                        <td><span className="muted-note">sem edição</span></td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={a.actionKey}>
                      <td>
                        <div className="co">
                          <strong>{a.label}</strong>
                          {hint && <span className="sub2">{hint}</span>}
                        </div>
                      </td>
                      <td>
                        <select className="field-dark" value={form.mode}
                          onChange={e => setActionForms(prev => ({ ...prev, [a.actionKey]: { ...form, mode: e.target.value as CreditActionMode, cost: e.target.value === "free" ? "0" : form.cost } }))}>
                          {MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <input className="field-dark" style={{ maxWidth: 96 }} type="number" min={0} max={1000} step={0.1}
                          disabled={form.mode === "free"} value={form.mode === "free" ? "0" : form.cost}
                          onChange={e => setActionForms(prev => ({ ...prev, [a.actionKey]: { ...form, cost: e.target.value } }))} />
                      </td>
                      <td>
                        <span className={desativada ? "tag warn" : a.override ? "tag teal" : "tag"}>
                          {desativada ? "desativada" : a.override ? "editado" : "padrão"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn-teal" style={{ minHeight: 28, fontSize: "0.66rem" }} disabled={busy}
                            onClick={() => salvarAcao(a.actionKey)}>{busy ? "…" : "Salvar"}</button>
                          <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.66rem" }} disabled={busy || !a.override}
                            onClick={() => restaurarAcao(a.actionKey)}>Restaurar padrão</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {guia === "Rota" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Níveis de Rota</h2>
            <div className="meta">Mensalidade fixa + paradas inclusas · o excedente consome crédito</div>
          </div>
          {niveisErro && <div className="sc-intro"><div className="sc-msg is-warn">{niveisErro}</div></div>}
          {nivelMsg && <div className="sc-intro"><div className={"sc-msg " + (nivelMsg.startsWith("✓") ? "is-ok" : "is-warn")}>{nivelMsg}</div></div>}
          <div className="tbl-wrap">
            {/* --acoes: cada linha é DINHEIRO — nome e unidade nunca truncam. */}
            <table className="tbl tbl--acoes">
              <thead>
                <tr><th>Nível</th><th>Mensalidade</th><th>Paradas inclusas/mês</th><th>Status</th><th aria-label="Editar"></th></tr>
              </thead>
              <tbody>
                {niveis === null && (
                  <tr><td colSpan={5} className="muted-note">Carregando…</td></tr>
                )}
                {niveis !== null && niveis.length === 0 && (
                  <tr><td colSpan={5} className="muted-note">{niveisErro || "Nenhum nível encontrado."}</td></tr>
                )}
                {(niveis || []).map(n => {
                  const form = nivelForms[n.nivel] || { precoMensal: String(n.precoMensal), franquiaParadasMes: String(n.franquiaParadasMes) };
                  const busy = nivelBusy === n.nivel;
                  return (
                    <tr key={n.nivel}>
                      <td>
                        <div className="co">
                          <strong>{n.titulo}</strong>
                          <span className="sub2">{n.slogan}</span>
                        </div>
                      </td>
                      <td>
                        <input className="field-dark" style={{ maxWidth: 110 }} type="number" min={0} step={1} inputMode="decimal"
                          value={form.precoMensal}
                          onChange={e => setNivelForms(prev => ({ ...prev, [n.nivel]: { ...form, precoMensal: e.target.value } }))} />
                      </td>
                      <td>
                        <div className="co">
                          <input className="field-dark" style={{ maxWidth: 110 }} type="number" min={0} step={5} inputMode="numeric"
                            value={form.franquiaParadasMes}
                            onChange={e => setNivelForms(prev => ({ ...prev, [n.nivel]: { ...form, franquiaParadasMes: e.target.value } }))} />
                          <span className="sub2">{n.franquiaBlocos} blocos de 5 paradas</span>
                        </div>
                      </td>
                      <td>
                        <span className={n.editado ? "tag teal" : "tag"}>{n.editado ? "editado" : "padrão"}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn-teal" style={{ minHeight: 28, fontSize: "0.66rem" }} disabled={busy}
                            onClick={() => salvarNivel(n.nivel)}>{busy ? "…" : "Salvar"}</button>
                          <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.66rem" }} disabled={busy || !n.editado}
                            onClick={() => restaurarNivel(n.nivel)}>Restaurar padrão</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="sc-intro">
            <span className="sc-hint">
              A empresa gasta a franquia do mês primeiro; ao estourar, cada bloco de 5 paradas
              (ou cada entrega rastreada) volta a consumir crédito pelo custo da guia Ações.
              O nível de cada empresa é escolhido na ficha dela, aba Comercial.
            </span>
          </div>
        </section>
      )}

      {guia === "Config" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Config</h2>
            <div className="meta">config global</div>
          </div>
          <div className="sc-intro">
            <span className="sc-note">
              Lote grátis concedido no cadastro self-service + prazo default de validade usado quando uma concessão manual não informa data.
            </span>
          </div>
          <div className="sc-body">
            {configLoadError && <div className="sc-msg is-warn">{configLoadError}</div>}
            {configMsg && <div className={"sc-msg " + (configMsg.startsWith("✓") ? "is-ok" : "is-warn")}>{configMsg}</div>}
            <div className="sc-field">
              <label className="field-label">Créditos de boas-vindas</label>
              <input className="field-dark" inputMode="numeric" value={welcomeCredits}
                onChange={e => setWelcomeCredits(e.target.value)} placeholder="50" />
            </div>
            <div className="sc-field">
              <label className="field-label">Validade do bônus de cadastro (dias)</label>
              <input className="field-dark" inputMode="numeric" value={welcomeExpiryDays}
                onChange={e => setWelcomeExpiryDays(e.target.value)} placeholder="30" />
            </div>
            <div className="sc-field sc-field--sep">
              <label className="field-label">Prazo default de expiração (dias)</label>
              <input className="field-dark" inputMode="numeric" value={defaultExpiryDays}
                onChange={e => setDefaultExpiryDays(e.target.value)} placeholder="90" />
            </div>
            <button className="btn-teal" disabled={configBusy} onClick={salvarConfig}>
              {configBusy ? "Salvando…" : "Salvar configuração"}
            </button>
          </div>
          {/* GUARDRAILS S3 (10/07) — teto diário default anti-scraper; botão próprio (validação
              diferente: 0 é valor válido aqui). */}
          <div className="sc-body">
            {dailyCapMsg && <div className={"sc-msg " + (dailyCapMsg.startsWith("✓") ? "is-ok" : "is-warn")}>{dailyCapMsg}</div>}
            <div className="sc-field sc-field--sep">
              <label className="field-label">Teto diário de leads (default)</label>
              <input className="field-dark" inputMode="numeric" value={dailyCapDefaultForm}
                onChange={e => setDailyCapDefaultForm(e.target.value)} placeholder="500" />
            </div>
            <button className="btn-teal" disabled={dailyCapBusy} onClick={salvarDailyCapDefault}>
              {dailyCapBusy ? "Salvando…" : "Salvar teto diário default"}
            </button>
          </div>
          {/* S4 (10/07) — Política de indicação, migrada da Self-Checkout morta. Desconto anual
              (mesmo endpoint) não migrou e foi aposentado no S7 (backend ignora a escrita). */}
          <div className="sc-body">
            {refLoadError && <div className="sc-msg is-warn">{refLoadError}</div>}
            {refMsg && <div className={"sc-msg " + (refMsg.startsWith("✓") ? "is-ok" : "is-warn")}>{refMsg}</div>}
            <div className="sc-field sc-field--sep">
              <label className="sc-check">
                <input type="checkbox" checked={refActive} onChange={e => setRefActive(e.target.checked)} />
                Desconto por indicação ativo
              </label>
            </div>
            <div className="sc-field">
              <label className="field-label">Desconto da indicação (%)</label>
              <input className="field-dark" inputMode="decimal" value={refPercent}
                onChange={e => setRefPercent(e.target.value)} placeholder="0" />
            </div>
            <div className="sc-field">
              <label className="field-label">Modo da indicação</label>
              <select className="field-dark" value={refMode} onChange={e => setRefMode(e.target.value)}>
                <option value="ONCE">Uma vez</option>
                <option value="RECURRING">Recorrente</option>
              </select>
            </div>
            <button className="btn-teal" disabled={refBusy} onClick={salvarPoliticaIndicacao}>
              {refBusy ? "Salvando…" : "Salvar política de indicação"}
            </button>
          </div>
        </section>
      )}

      {guia === "Recargas" && <GuiaRecargas />}
    </React.Fragment>
  );
}

// ── Guia Recargas — conteúdo migrado literalmente da antiga janela-pagamentos.tsx (apagada
// neste sprint). Mesmo endpoint (histórico de notificações de pagamento aprovado via WhatsApp);
// nenhum caminho de escrita de dinheiro tocado.

type NotificationRow = {
  id: string;
  companyId?: number;
  companyName?: string | null;
  target?: string;
  text?: string;
  status?: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
};

type HistoryResponse = {
  ok?: boolean;
  notifications?: NotificationRow[];
  message?: string | null;
} | null;

const STATUS_OPCOES = [
  { value: "", label: "Todos" },
  { value: "sent", label: "Enviados" },
  { value: "failed", label: "Falharam" },
];

function GuiaRecargas() {
  const [status, setStatus] = useState("");
  const [data, setData] = useState<HistoryResponse>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);

  const carregar = useCallback((st: string) => {
    const q = new URLSearchParams();
    if (st) q.set("status", st);
    q.set("take", "200");
    apiFetch<HistoryResponse>(`/master/payment-notifications/history?${q.toString()}`)
      .then(res => { setData(res); setLoadError(null); })
      .catch((err: unknown) => {
        setData({ ok: false, notifications: [] });
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar o histórico.");
      });
  }, []);

  useEffect(() => { carregar(status); }, [status, carregar]);

  function trocarStatus(st: string) {
    setStatus(st);
    setData(null);
    setSelId(null);
    setLoadError(null);
  }

  const linhas = data?.notifications || [];
  const sel = linhas.find(n => n.id === selId) || null;

  return (
    <React.Fragment>
      <section className="panel">
        <div className="panel-head">
          <h2>Recargas — notificações de pagamento (WhatsApp)</h2>
          <div className="meta">
            {data?.notifications ? `${linhas.length} disparo(s)` : ""}
            <button className="btn-ghost" style={{ minHeight: 28, fontSize: "0.66rem" }} onClick={() => carregar(status)}>Atualizar</button>
          </div>
        </div>
        <div style={{ padding: "12px 16px 4px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUS_OPCOES.map(o => (
            <button key={o.value} className="btn-ghost" onClick={() => trocarStatus(o.value)}
              style={{ minHeight: 28, fontSize: "0.66rem", ...(o.value === status ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)", background: "var(--hbx-brand-soft)" } : {}) }}>
              {o.label}
            </button>
          ))}
        </div>
        {loadError && <div style={{ padding: "8px 16px 12px", fontSize: "0.74rem", fontWeight: 600, color: "var(--hbx-danger)" }}>{loadError}</div>}
        {data?.ok === false && data?.message && (
          <div style={{ padding: "8px 16px 12px", fontSize: "0.72rem", color: "var(--text-muted)" }}>{data.message}</div>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Empresa</th><th>Destinatário</th><th>Status</th><th>Mensagem</th><th>Disparado em</th></tr>
            </thead>
            <tbody>
              {data === null && !loadError && (
                <tr><td colSpan={5} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>
              )}
              {data !== null && linhas.length === 0 && !loadError && (
                <tr><td colSpan={5} style={{ color: "var(--text-muted)" }}>
                  Nenhum disparo registrado ainda — o histórico nasce nos próximos avisos de pagamento aprovado.
                </td></tr>
              )}
              {linhas.map(n => (
                <tr key={n.id} className={n.id === selId ? "sel" : ""} onClick={() => setSelId(n.id === selId ? null : n.id)}>
                  <td>
                    <div className="co">
                      <strong>{n.companyName || "—"}</strong>
                      <span className="sub2">#{n.companyId}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>{n.target || "—"}</td>
                  <td><span className={n.status === "sent" ? "tag teal" : "tag red"}>{n.status === "sent" ? "enviado" : "falhou"}</span></td>
                  <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>{(n.text || "").slice(0, 60)}{(n.text || "").length > 60 ? "…" : ""}</td>
                  <td>{fmtDataHora(n.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "8px 16px 14px", fontSize: "0.62rem", color: "var(--text-muted)" }}>
          O disparo continua máquina-a-máquina (webhook Mercado Pago → WhatsApp via Webwhats). Esta guia é o histórico.
        </div>
      </section>

      {sel && (
        <section className="panel">
          <div className="panel-head">
            <h2>Disparo {sel.status === "sent" ? "enviado" : "com falha"}</h2>
            <div className="meta">{fmtDataHora(sel.createdAt)}</div>
          </div>
          <div style={{ padding: "12px 16px 16px", display: "grid", gap: 10, fontSize: "0.74rem" }}>
            <p style={{ margin: 0, lineHeight: 1.55, whiteSpace: "pre-line", padding: "9px 11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)" }}>{sel.text || "—"}</p>
            <div style={{ display: "grid", gap: 6 }}>
              {[
                ["Empresa", sel.companyName ? `${sel.companyName} (#${sel.companyId})` : `#${sel.companyId}`],
                ["Destinatário", sel.target],
                ["ID no provedor", sel.providerMessageId],
                ["Erro", sel.errorMessage],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{value || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </React.Fragment>
  );
}
