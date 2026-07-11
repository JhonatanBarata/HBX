// deriveBotAlert — detecta os 4 problemas do Motor de disparo frio (Prospecção)
// que merecem POP-UP (não só o badge inline de status). Lê o mesmo `live`/`loadErr`
// que o BotProspeccaoPanel já carrega via useProspectingConfig (poll de 10s) —
// nenhuma chamada de rede nova, é derivação pura.
//
// Precedência (de cima pra baixo — a primeira que bater vence):
//   1. not_configured — falta alvo (cidade/segmento) ou config de mensageria
//      incompleta, OU a carga falhou (loadErr, ex.: bot sem entitlement).
//      É a ÚNICA que ignora o "não incomodar quando parado/pausado de propósito",
//      porque uma campanha nunca criada também fica com status 'parado'.
//   2. no_credit — status de erro cujo texto fala de crédito/saldo.
//   3. no_leads — campanha rodando, fila de contatos pendentes zerada.
//   4. error — qualquer outro erro genérico do motor.
//
// Fora dessas 4 condições (ou bot parado/pausado por escolha do dono), retorna null.

import { isProspConfigComplete, type ProspLive } from "@/lib/use-prospecting-config";

export type BotAlertKind = "not_configured" | "no_credit" | "no_leads" | "error";
export type BotAlertCta = "configure" | "credits" | "adjust_filter";

export type BotAlert = {
  kind: BotAlertKind;
  title: string;
  message: string;
  ctaLabel?: string;
  cta?: BotAlertCta;
};

const CREDIT_RE = /cr[ée]dito|saldo/i;

// Status em que o bot está parado por ESCOLHA do dono — não é "problema", é intenção.
// not_configured é a exceção (ver precedência acima): campanha nunca criada também
// aparece como 'parado', e isso PRECISA avisar.
const INTENTIONALLY_STOPPED = new Set(["parado", "pausado", "done", "canceled"]);

// shellMode: na casca Android (Play), o aviso de "sem crédito" NÃO pode orientar
// recarga nem oferecer CTA de compra — bem digital só via Play Billing e a política
// proíbe até apontar canal externo (steering). O aviso ainda APARECE (é informativo:
// o motor parou), só sai sem a copy de recarga e sem o botão.
export function deriveBotAlert(
  live: ProspLive | null,
  loadErr: string | null,
  shellMode = false,
): BotAlert | null {
  if (!live) return null; // sem live: o painel já mostra a tela cheia "Prospecção indisponível"

  const campaign = live.campaign;
  const status = live.status || "parado";
  const lastError = live.lastError ?? null;
  const combinedText = [live.text, lastError].filter(Boolean).join(" — ");

  // ── 1. Não configurado (bypassa o "não incomodar parado/pausado") ──
  const missingTargeting = !!campaign && (!campaign.city || !campaign.segment);
  if (loadErr || missingTargeting || !isProspConfigComplete(live)) {
    return {
      kind: "not_configured",
      title: "Bot não configurado",
      message: loadErr
        || "Faltam informações essenciais pra rodar o disparo: cidade, segmento ou a mensagem de 1º contato. Configure antes de iniciar.",
      ctaLabel: "Configurar",
      cta: "configure",
    };
  }

  // A partir daqui, config está completa — se o dono parou por escolha, não incomoda.
  if (INTENTIONALLY_STOPPED.has(status)) return null;

  const pendingJobs = live.pendingJobs ?? live.counters?.pendingJobs ?? 0;
  const isError = status === "erro";

  // ── 2. Sem crédito ──
  if ((isError || !!lastError) && CREDIT_RE.test(combinedText)) {
    return shellMode
      ? {
          kind: "no_credit",
          title: "Sem créditos",
          message: "A busca de novos leads está pausada por falta de créditos.",
        }
      : {
          kind: "no_credit",
          title: "Sem créditos",
          message: "A busca de novos leads parou por falta de créditos. Recarregue para o motor voltar a prospectar.",
          ctaLabel: "Ver créditos",
          cta: "credits",
        };
  }

  // ── 3. Fila de leads vazia ──
  const campaignActive = live.active === true || status === "aguardando";
  const isSending = status === "enviando";
  const hasTarget = !!campaign?.city && !!campaign?.segment;
  if (
    campaignActive
    && !isSending
    && pendingJobs === 0
    && hasTarget
    && status !== "erro"
    && status !== "dormindo"
  ) {
    return {
      kind: "no_leads",
      title: "Fila de leads vazia",
      message: "O motor não encontrou novos contatos pra fila. Amplie o filtro (cidade, segmento ou raio) pra manter o disparo ativo.",
      ctaLabel: "Ajustar filtro",
      cta: "adjust_filter",
    };
  }

  // ── 4. Erro genérico ──
  if (isError) {
    return {
      kind: "error",
      title: "O motor encontrou um erro",
      message: combinedText || "Algo deu errado no disparo. Tente recarregar; se persistir, revise a configuração.",
    };
  }

  return null;
}
