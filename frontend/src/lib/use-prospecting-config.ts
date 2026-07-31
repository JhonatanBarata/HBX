"use client";

// useProspectingConfig — fonte ÚNICA da lógica de configuração do disparo frio
// (Prospecção). Usado pela guia real (<BotProspeccaoPanel>) E pelo tutofig
// (<BotTutofig>), pra não existir duas implementações da mesma coisa.
//
//   carrega via GET  /vendas/automation/live-status   (config sob `campaign` + status ao vivo)
//   salva   via PATCH /vendas/automation/prospecting/config   (só campos EDITADOS)
//
// PATCH só com campos editados: o backend mantém o resto pelo `existing`. Isso
// evita reescrever o `dailyLimit` — que o live-status devolve como CAPACIDADE
// EFETIVA (derivada de horário/ritmo, já capada em 80), não o valor cru.

import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch, type ApiError } from "@/lib/api";

// ── Config de disparo (espelha UpdateVendasProspectingConfigDto + serializeCampaign) ──
export type ProspCfg = {
  intervalMinutes: number;
  intervalVarianceMinutes: number;
  botReplyIntervalReductionPercent: number;
  typingSeconds: number;
  typingVarianceSeconds: number;
  dailyLimit: number;
  maxAttemptsPerLead: number;
  minLeadBuffer: number;
  desiredLeadBuffer: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  preMessageEnabled: boolean;
  preMessageVariants: string[];
  firstContactVariants: string[];
  positiveReplyVariants: string[];
  whatIsItReplyVariants: string[];
  scheduledReplyVariants: string[];
  optOutVariants: string[];
  neutralHandoffVariants: string[];
  positiveIntentKeywords: string[];
  negativeIntentKeywords: string[];
  whatIsItIntentKeywords: string[];
  callbackIntentKeywords: string[];
  humanHandoffIntentKeywords: string[];
};

// city/segment: alvo da campanha (Radar) — o backend devolve (serializeCampaign),
// mas não fazem parte do DTO de mensageria (ProspCfg); aqui só pra leitura (deriveBotAlert).
export type ProspCampaign = Partial<ProspCfg> & { id?: number; status?: string; city?: string | null; segment?: string | null };

export type ProspLive = {
  status: string;
  text?: string | null;
  active?: boolean;
  campaign: ProspCampaign | null;
  counters?: Record<string, number>;
  sentToday?: number;
  dailyLimit?: number;
  remainingToday?: number;
  nextScheduledAt?: string | null;
  nextAllowedSendAt?: string | null;
  cooldownActive?: boolean;
  nextEligibleLeadName?: string | null;
  // Freio anti-ban ao vivo (mesmo payload de /vendas/automation/live-status). A
  // linha de resumo da peça "Limite diário" prometia o número da campanha (17)
  // enquanto o freio entregava 10 — o vendedor planejava 17 e 7 morriam no envio.
  coldGate?: { enabled?: boolean; maxPerDay?: number; remainingToday?: number; minSpacingMinutes?: number } | null;
  // fila de contatos agendados/pendentes (buildLiveStatus) — usado pelo pop-up de aviso
  // pra detectar "fila vazia" sem reimplementar a soma de todayPending+overdue+future.
  pendingJobs?: number;
  lastError?: string | null;
};

// Defaults do motor (DEFAULT_* / scene) — usados só quando ainda não há campanha.
// As listas ficam vazias de propósito: o motor preenche com os textos padrão ao
// salvar (não invento texto na tela).
export const PROSP_DEFAULTS: ProspCfg = {
  intervalMinutes: 15,
  intervalVarianceMinutes: 30,
  botReplyIntervalReductionPercent: 0,
  typingSeconds: 8,
  typingVarianceSeconds: 12,
  dailyLimit: 10,
  maxAttemptsPerLead: 1,
  minLeadBuffer: 10,
  desiredLeadBuffer: 10,
  workingHoursStart: "08:00",
  workingHoursEnd: "18:00",
  preMessageEnabled: false,
  preMessageVariants: [],
  firstContactVariants: [],
  positiveReplyVariants: [],
  whatIsItReplyVariants: [],
  scheduledReplyVariants: [],
  optOutVariants: [],
  neutralHandoffVariants: [],
  positiveIntentKeywords: [],
  negativeIntentKeywords: [],
  whatIsItIntentKeywords: [],
  callbackIntentKeywords: [],
  humanHandoffIntentKeywords: [],
};

export const ABSOLUTE_DAILY_SEND_CAP = 80;

export const STATUS_LABEL: Record<string, string> = {
  parado: "Parada", pausado: "Pausada", erro: "Erro", dormindo: "Fora do horário",
  buscando: "Buscando leads", importando: "Importando", agendando: "Agendando",
  enviando: "Enviando", aguardando: "Aguardando",
};

export type PieceKey = "ritmo" | "digitacao" | "limite" | "alvo" | "mensagens" | "palavras";

export const PIECES: { key: PieceKey; label: string; hint: string; icon: string; tone: string }[] = [
  { key: "ritmo",     label: "Ritmo de disparo",    hint: "Tempo entre cada contato",                 icon: "clock",  tone: "var(--hbx-brand)" },
  { key: "digitacao", label: "Digitação humana",    hint: "Simula a pessoa digitando",                icon: "bolt",   tone: "var(--hbx-info)" },
  { key: "limite",    label: "Limite diário",       hint: "Proteção contra banimento",                icon: "bell",   tone: "var(--hbx-warning)" },
  { key: "alvo",      label: "Alvo & horário",      hint: "Janela de trabalho e estoque de leads",    icon: "mapin",  tone: "var(--hbx-success)" },
  { key: "mensagens", label: "Mensagens alternadas", hint: "O motor rotaciona pra fugir de padrão",   icon: "msg",    tone: "var(--hbx-secondary)" },
  { key: "palavras",  label: "Detecção por IA",     hint: "A IA lê a resposta; palavras são reforço",  icon: "bot",    tone: "var(--hbx-secondary)" },
];

// Campos numéricos/strings por peça (pra detectar "editado" — só leitura do draft).
export const PIECE_FIELDS: Record<"ritmo" | "digitacao" | "limite" | "alvo", (keyof ProspCfg)[]> = {
  ritmo: ["intervalMinutes", "intervalVarianceMinutes", "botReplyIntervalReductionPercent"],
  digitacao: ["typingSeconds", "typingVarianceSeconds"],
  limite: ["dailyLimit", "maxAttemptsPerLead"],
  alvo: ["workingHoursStart", "workingHoursEnd", "minLeadBuffer", "desiredLeadBuffer"],
};

// Listas de variantes da peça "Mensagens alternadas" (cada lista = um grupo).
export const VARIANT_LISTS: { key: keyof ProspCfg; label: string; hint: string; max: number }[] = [
  { key: "firstContactVariants",  label: "Primeiro contato (frio)",        hint: "Abertura do disparo. O motor reveza entre as variantes.", max: 20 },
  { key: "positiveReplyVariants", label: "Quando responde com interesse",  hint: "Resposta quando o lead demonstra interesse.",            max: 20 },
  { key: "whatIsItReplyVariants", label: "Quando pergunta “o que é?”",     hint: "Explicação curta quando o lead quer entender.",          max: 20 },
  { key: "scheduledReplyVariants", label: "Quando pede pra falar depois",  hint: "Confirmação de retorno agendado.",                       max: 20 },
  { key: "optOutVariants",        label: "Quando pede pra parar",          hint: "Descadastro educado (opt-out).",                          max: 20 },
];

export function fmtWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // O primeiro job pode ser criado como imediatamente elegível (scheduledAt <= agora).
  // Não apresente esse estado técnico como um horário "no passado" para o usuário.
  if (d.getTime() <= Date.now() + 15_000) return "Pronto para enviar agora";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// "Incompleta" de forma HONESTA: sem campanha, OU sem nenhuma variante de 1º
// contato (frio), OU sem ritmo/limite definidos. É o que o tutofig usa pra
// abrir sozinho. Lê o `campaign` (config CRUA), não o dailyLimit efetivo do live.
export function isProspConfigComplete(live: ProspLive | null): boolean {
  const c = live?.campaign;
  if (!c) return false;
  const firstContact = Array.isArray(c.firstContactVariants)
    ? c.firstContactVariants.filter(s => typeof s === "string" && s.trim().length > 0).length
    : 0;
  if (firstContact === 0) return false;
  if (typeof c.intervalMinutes !== "number") return false;
  if (typeof c.dailyLimit !== "number") return false;
  return true;
}

export type ProspConfigApi = ReturnType<typeof useProspectingConfig>;

export function useProspectingConfig(opts?: { onLive?: (live: ProspLive) => void }) {
  const [live, setLive] = useState<ProspLive | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ProspCfg>>({});
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const campaign = live?.campaign ?? null;

  // callback "ao carregar" via ref: mantém loadLive estável (não reinscreve o poll
  // a cada render) e roda só no .then assíncrono (sem setState síncrono em effect).
  // Atualização do ref vai num effect (atualizar ref no render é proibido).
  const onLiveRef = useRef(opts?.onLive);
  useEffect(() => { onLiveRef.current = opts?.onLive; });

  // setState só em callback assíncrono (regra react-hooks/set-state-in-effect).
  const loadLive = useCallback(() => {
    return apiFetch<ProspLive>("/vendas/automation/live-status")
      .then(res => { setLive(res); setLoadErr(null); if (res) onLiveRef.current?.(res); })
      .catch((err: unknown) => {
        const e = err as ApiError;
        setLoadErr(e?.status === 402
          ? (e?.message || "Ative o bot pelo Suporte para configurar a Prospecção.")
          : e?.message || "Não foi possível carregar a configuração de Prospecção.");
      });
  }, []);

  useEffect(() => {
    let alive = true;
    loadLive();
    // poll leve: mantém o resumo ao vivo sem atropelar o que o dono edita
    // (o draft sempre vence na leitura).
    const t = setInterval(() => { if (alive) loadLive(); }, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [loadLive]);

  // ── Leitura: draft vence; senão campanha; senão default ──
  const numVal = useCallback((key: keyof ProspCfg): number => {
    if (key in draft) return Number(draft[key as keyof ProspCfg] as number);
    const real = campaign?.[key] as number | undefined;
    return typeof real === "number" ? real : (PROSP_DEFAULTS[key] as number);
  }, [draft, campaign]);

  const boolVal = useCallback((key: keyof ProspCfg): boolean => {
    if (key in draft) return Boolean(draft[key]);
    const real = campaign?.[key];
    return typeof real === "boolean" ? real : Boolean(PROSP_DEFAULTS[key]);
  }, [draft, campaign]);

  const strVal = useCallback((key: keyof ProspCfg): string => {
    if (key in draft) return String(draft[key]);
    const real = campaign?.[key];
    return typeof real === "string" && real ? real : String(PROSP_DEFAULTS[key]);
  }, [draft, campaign]);

  const listVal = useCallback((key: keyof ProspCfg): string[] => {
    if (key in draft) return (draft[key] as string[]) || [];
    const real = campaign?.[key];
    return Array.isArray(real) ? (real as string[]) : (PROSP_DEFAULTS[key] as string[]);
  }, [draft, campaign]);

  // "Tem valor de verdade?" (persistido OU editado) — usado pra marcar peça feita.
  const hasReal = useCallback((key: keyof ProspCfg): boolean => {
    if (key in draft) {
      const v = draft[key];
      return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "";
    }
    const real = campaign?.[key];
    if (Array.isArray(real)) return real.length > 0;
    return real !== undefined && real !== null && real !== "";
  }, [draft, campaign]);

  const setField = useCallback(<K extends keyof ProspCfg>(key: K, value: ProspCfg[K]) => {
    setDraft(d => ({ ...d, [key]: value }));
  }, []);

  // input numérico → inteiro com clamp (espelha os limites do DTO)
  const setNum = useCallback((key: keyof ProspCfg, raw: string, min: number, max: number) => {
    const n = Math.round(Number(raw));
    const safe = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
    setDraft(d => ({ ...d, [key]: safe as never }));
  }, []);

  const dirty = Object.keys(draft).length > 0;
  const canSave = !busy;

  const salvar = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setSaveMsg(null);
    try {
      const res = await apiFetch<ProspLive>("/vendas/automation/prospecting/config", {
        method: "PATCH",
        body: JSON.stringify(draft),
      });
      if (res) { setLive(res); setLoadErr(null); onLiveRef.current?.(res); }
      setDraft({});
      setSaveMsg("✓ Configuração de disparo salva.");
      return res;
    } catch (err) {
      const e = err as ApiError;
      setSaveMsg(e?.message || "Não foi possível salvar.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [draft, busy]);

  const ciclo = useCallback(async (path: "start" | "pause" | "resume" | "cancel") => {
    if (busy) return;
    if (path === "cancel" && !window.confirm("Cancelar a campanha de prospecção? A fila de contatos pendentes é descartada (os leads voltam pro funil).")) return;
    setBusy(true);
    setSaveMsg(null);
    try {
      await apiFetch(`/vendas/automation/prospecting/${path}`, { method: "POST", body: JSON.stringify({}) });
      const shouldBeLive = path === "start" || path === "resume";
      setSaveMsg(shouldBeLive ? "✓ Prospecção ligada." : "✓ Prospecção pausada.");
      await loadLive();
    } catch (err) {
      const e = err as ApiError;
      setSaveMsg(e?.message || "Ação não concluída.");
    } finally {
      setBusy(false);
    }
  }, [busy, loadLive]);

  // ── Pré-visualização (linha de resumo) por peça ──
  const piecePreview = useCallback((key: PieceKey): string => {
    switch (key) {
      case "ritmo":
        return `a cada ~${numVal("intervalMinutes")} min · variação ${numVal("intervalVarianceMinutes")} min`;
      case "digitacao":
        return `${numVal("typingSeconds")}s digitando · variação ${numVal("typingVarianceSeconds")}s`;
      case "limite": {
        // O resumo diz o que REALMENTE sai: com o freio ligado, o teto é o menor
        // entre a config do dono e o que o freio libera (10/dia hoje).
        const freio = live?.coldGate?.enabled ? Number(live.coldGate?.maxPerDay) : NaN;
        const pedido = numVal("dailyLimit");
        const efetivo = Number.isFinite(freio) ? Math.min(pedido, freio) : pedido;
        const teto = Number.isFinite(freio) ? `freio ${freio}` : `teto ${ABSOLUTE_DAILY_SEND_CAP}`;
        return `até ${efetivo}/dia · ${teto} · ${numVal("maxAttemptsPerLead")} tentativa(s)/lead`;
      }
      case "alvo":
        return `${strVal("workingHoursStart")}–${strVal("workingHoursEnd")} · estoque ${numVal("minLeadBuffer")}–${numVal("desiredLeadBuffer")}`;
      case "mensagens": {
        const n = listVal("firstContactVariants").length;
        return n > 0 ? `${n} variante(s) de 1º contato` : "mensagens padrão do motor";
      }
      case "palavras": {
        const total =
          listVal("positiveIntentKeywords").length +
          listVal("whatIsItIntentKeywords").length +
          listVal("callbackIntentKeywords").length +
          listVal("negativeIntentKeywords").length;
        return total > 0 ? `IA decide · +${total} palavra(s) de reforço` : "IA decide · palavras padrão de reforço";
      }
      default:
        return "";
    }
  }, [numVal, strVal, listVal, live]);

  return {
    live, loadErr, campaign, draft, dirty, busy, saveMsg, canSave,
    numVal, boolVal, strVal, listVal, hasReal,
    setField, setNum, loadLive, salvar, ciclo, piecePreview,
    setSaveMsg,
  };
}
