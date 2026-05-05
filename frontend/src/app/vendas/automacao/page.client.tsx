"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DashboardScaffold from "@/components/DashboardScaffold";
import { QR_PAIRED_EVENT } from "@/components/QrPairedNextStepPrompt";
import {
  getBotAiPlanRedirectFromError,
  hasBotAi,
  type CommercialPlansPayload,
} from "@/lib/commercial-plans";
import { getProviderCapabilitiesFromWhatsAppCenter } from "@/lib/provider-capabilities";
import type { UserModule } from "@/lib/hbx-modules";
import { dispatchModulesChanged } from "@/lib/module-events";
import {
  getWhatsAppModalPlanRedirect,
  type WhatsAppCenterPayload,
  type WhatsAppModalPayload,
} from "@/lib/whatsapp-center";
import { BRAZIL_CITIES_BY_STATE, BRAZIL_STATES } from "@/lib/brazil-locations";
import { apiFetch } from "@/app/_lib/api";
import { useRequireModule } from "@/app/_lib/useRequireModule";
import {
  DEFAULT_ATENDIMENTO_AGENDA_CONFIG,
  DEFAULT_ATENDIMENTO_BOT_CONFIG,
  normalizeAgendaConfig,
  normalizeBotConfig,
  type AtendimentoAgendaConfig,
  type AtendimentoBotConfig,
} from "../../atendimento/inbox-model";
import ConversationBuilder from "./_components/ConversationBuilder";
import BotQrWorkspace from "./_components/BotQrWorkspace";
import {
  type BotQrWorkspaceTab,
} from "./model";
import styles from "./page.module.css";

type NoticeState = {
  tone: "success" | "error" | "info";
  text: string;
};

type StoredDraft = {
  config: AtendimentoBotConfig;
  savedAt: string;
};

type ProspectingAutomationConfig = {
  city: string;
  state: string;
  segment: string;
  engine: "hbx" | "google";
  targetType: "pj" | "pf" | "agenda_pf";
  messageTemplate: string;
  intervalMinutes: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  dailyLimit: number;
  minLeadBuffer: number;
  desiredLeadBuffer: number;
  maxAttemptsPerLead: number;
  typingSeconds: number;
  typingVarianceSeconds: number;
  positiveIntentKeywords: string[];
  negativeIntentKeywords: string[];
  optOutMessage: string;
  optOutReplyEnabled: boolean;
  websiteFallbackEnabled: boolean;
};

type ProspectingAutomationLiveStatus = {
  status: "parado" | "buscando" | "importando" | "agendando" | "enviando" | "aguardando" | "pausado" | "erro";
  text: string;
  active: boolean;
  campaign: (ProspectingAutomationConfig & {
    id: string;
    status: string;
    filtersJson?: Record<string, unknown>;
    optOutReplyEnabled?: boolean;
    lastStatusText?: string | null;
    lastError?: string | null;
  }) | null;
  counters: {
    todayPending?: number;
    overdue?: number;
    future?: number;
    pending?: number;
    sent: number;
    positives?: number;
    interested?: number;
    archived: number;
    failed: number;
  };
  nextScheduledAt?: string | null;
  lastError?: string | null;
};

const DRAFT_STORAGE_KEY = "hbx.vendas.automacao.bot-qrcode.draft.v1";
const BOT_PLAN_HREF = "/planos?intent=bot_ia&from=vendas_automacao";
const PROSPECTING_SCENE_ID = "first_contact_rules_prospeccao";
const PROSPECTING_RULE_CONDITION = "first_contact_rules";
const SEGMENT_SUGGESTIONS = [
  "academias",
  "acessórios automotivos",
  "açougues",
  "advocacias",
  "agências de marketing",
  "agências de turismo",
  "agronegócios",
  "alarmes e segurança",
  "alimentos naturais",
  "aluguel de equipamentos",
  "auto elétricas",
  "auto escolas",
  "auto peças",
  "bares",
  "barbearias",
  "bicicletarias",
  "bijuterias",
  "borracharias",
  "buffets",
  "cafeterias",
  "calçados",
  "casa de carnes",
  "casas de festas",
  "centros automotivos",
  "chaveiros",
  "clínicas de estética",
  "clínicas médicas",
  "clínicas odontológicas",
  "clínicas veterinárias",
  "colégios",
  "comércio varejista",
  "concessionárias",
  "confeitarias",
  "construtoras",
  "contabilidades",
  "consultorias empresariais",
  "corretoras de seguros",
  "cosméticos",
  "coworkings",
  "cursos profissionalizantes",
  "dedetizadoras",
  "depósitos de bebidas",
  "despachantes",
  "distribuidoras",
  "docerias",
  "e-commerce",
  "educação infantil",
  "elétricas",
  "eletrodomésticos",
  "eletrônicas",
  "energia solar",
  "engenharias",
  "escolas",
  "escritórios administrativos",
  "escritórios de arquitetura",
  "estacionamentos",
  "estúdios de fotografia",
  "eventos",
  "farmácias",
  "ferragens",
  "financeiras",
  "floriculturas",
  "fornecedoras industriais",
  "funerárias",
  "gráficas",
  "hospedagens",
  "hotéis",
  "imobiliárias",
  "indústrias alimentícias",
  "indústrias metalúrgicas",
  "informática",
  "instaladoras",
  "joalherias",
  "laboratórios",
  "lanchonetes",
  "lava rápidos",
  "lavanderias",
  "lojas de brinquedos",
  "lojas de celulares",
  "lojas de colchões",
  "lojas de conveniência",
  "lojas de eletrônicos",
  "lojas de móveis",
  "lojas de roupas",
  "lojas de tintas",
  "lotéricas",
  "madeireiras",
  "manutenção predial",
  "marcenarias",
  "materiais de construção",
  "mercados",
  "metalúrgicas",
  "marmorarias",
  "mecânicas",
  "moda feminina",
  "moda masculina",
  "motéis",
  "oficinas mecânicas",
  "ótica",
  "panificadoras",
  "papelarias",
  "perfumarias",
  "pet shops",
  "pizzarias",
  "postos de combustível",
  "provedores de internet",
  "quadras esportivas",
  "químicas",
  "restaurantes",
  "revendas de veículos",
  "salões de beleza",
  "serralherias",
  "serviços contábeis",
  "serviços de limpeza",
  "serviços gráficos",
  "serviços jurídicos",
  "serviços médicos",
  "serviços odontológicos",
  "serviços terceirizados",
  "sistemas de segurança",
  "supermercados",
  "telecomunicações",
  "transportadoras",
  "turismo",
  "uniformes",
  "universidades",
  "usinagem",
  "vidraçarias",
  "vigilância",
  "vistorias veiculares",
  "web design",
  "xérox e copiadoras",
  "yoga e pilates",
  "zeladoria",
];
const CAMPAIGN_TYPES = [
  {
    id: "cnpj_local",
    label: "CNPJ local — vender HBX para empresas finais",
  },
  {
    id: "agencias_vendedores",
    label: "Agências/vendedores — achar quem vai usar HBX para prospectar para terceiros",
  },
  {
    id: "servicos_orcamento",
    label: "Serviços com orçamento — empresas que vivem de orçamento e follow-up",
  },
] as const;

type CampaignTypeId = (typeof CAMPAIGN_TYPES)[number]["id"];

const MESSAGE_PRESETS = [
  {
    id: "local_general",
    group: "cnpj_local",
    label: "Empresa local - geral",
    segment: "serviços locais",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} no Google em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. Tenho uma ferramenta chamada HBX que busca possíveis clientes na sua cidade, organiza os contatos e lembra os retornos pelo WhatsApp. Estou liberando 30 dias grátis para empresas testarem. Quer que eu te mostre em 5 minutos?",
  },
  {
    id: "auto_socorro",
    group: "cnpj_local",
    label: "Auto socorro / guincho",
    segment: "auto socorro",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. O HBX ajuda empresas como auto socorro a encontrar mais clientes locais, organizar contatos e controlar retornos pelo WhatsApp. Estou liberando 30 dias grátis. Quer que eu te mostre rapidinho?",
  },
  {
    id: "energia_solar",
    group: "cnpj_local",
    label: "Energia solar",
    segment: "energia solar",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. Tenho uma ferramenta que ajuda empresas de energia solar a buscar possíveis clientes, organizar oportunidades e não esquecer retorno no WhatsApp. Posso te mostrar em 5 minutos?",
  },
  {
    id: "limpeza_piscina",
    group: "cnpj_local",
    label: "Limpeza de piscina",
    segment: "limpeza de piscina",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. O HBX pode ajudar empresas de limpeza de piscina a achar novos contatos na região, organizar orçamentos e lembrar retornos pelo WhatsApp. Quer testar 30 dias grátis?",
  },
  {
    id: "clinica_estetica",
    group: "cnpj_local",
    label: "Clínica estética",
    segment: "clínicas de estética",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. Tenho uma ferramenta que ajuda clínicas a captar contatos locais, organizar interessados e controlar retornos pelo WhatsApp. Estou liberando 30 dias grátis. Quer ver uma demonstração rápida?",
  },
  {
    id: "ar_condicionado",
    group: "cnpj_local",
    label: "Ar condicionado",
    segment: "ar condicionado",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. O HBX ajuda empresas de ar condicionado a encontrar possíveis clientes, organizar pedidos de orçamento e lembrar retornos pelo WhatsApp. Faz sentido eu te mostrar em 5 minutos?",
  },
  {
    id: "oficina_mecanica",
    group: "servicos_orcamento",
    label: "Oficina mecânica",
    segment: "oficinas mecânicas",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. Tenho uma ferramenta que ajuda oficinas a captar contatos locais, organizar orçamentos e acompanhar retornos pelo WhatsApp. Quer testar 30 dias grátis?",
  },
  {
    id: "orcamento_vidracaria",
    group: "servicos_orcamento",
    label: "Vidraçaria / serralheria / marcenaria",
    segment: "vidraçarias",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. O HBX ajuda empresas que vivem de orçamento a organizar contatos, lembrar retornos e buscar novos possíveis clientes na cidade. Quer que eu te mostre rápido?",
  },
  {
    id: "seguranca_eletronica",
    group: "servicos_orcamento",
    label: "Segurança eletrônica",
    segment: "sistemas de segurança",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. Tenho uma ferramenta que ajuda empresas de segurança eletrônica a encontrar possíveis clientes locais e controlar follow-up pelo WhatsApp. Quer ver em 5 minutos?",
  },
  {
    id: "odontologia_saude",
    group: "cnpj_local",
    label: "Odontologia / saúde",
    segment: "clínicas odontológicas",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. O HBX ajuda clínicas a organizar contatos, interessados e retornos pelo WhatsApp, sem deixar lead perdido. Estou liberando 30 dias grátis. Quer que eu te mostre?",
  },
  {
    id: "imobiliaria",
    group: "cnpj_local",
    label: "Imobiliária",
    segment: "imobiliárias",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. Tenho uma ferramenta que ajuda imobiliárias a organizar contatos, possíveis clientes e retornos pelo WhatsApp. Posso te mostrar em 5 minutos?",
  },
  {
    id: "provedor_internet",
    group: "cnpj_local",
    label: "Provedor de internet",
    segment: "provedores de internet",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. O HBX ajuda provedores a organizar contatos, oportunidades e retornos pelo WhatsApp, além de buscar possíveis clientes locais. Quer ver uma demonstração rápida?",
  },
  {
    id: "escola_curso",
    group: "cnpj_local",
    label: "Escola / curso profissionalizante",
    segment: "cursos profissionalizantes",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. Tenho uma ferramenta que ajuda escolas e cursos a organizar interessados, contatos e retornos pelo WhatsApp. Estou liberando 30 dias grátis. Quer ver?",
  },
  {
    id: "loja_moveis",
    group: "servicos_orcamento",
    label: "Loja de móveis / colchões / planejados",
    segment: "lojas de móveis",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. O HBX ajuda lojas que vendem por orçamento ou atendimento consultivo a organizar contatos e lembrar retornos pelo WhatsApp. Quer que eu te mostre em 5 minutos?",
  },
  {
    id: "agencia_marketing",
    group: "agencias_vendedores",
    label: "Agência de marketing",
    segment: "agências de marketing",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi que a {{cliente}} trabalha com marketing em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. Tenho uma ferramenta que busca empresas por cidade e segmento, joga tudo em um CRM e ajuda a controlar contato e retorno pelo WhatsApp. Pode ser útil para vocês venderem prospecção para clientes. Quer ver uma demonstração rápida?",
  },
  {
    id: "gestor_trafego",
    group: "agencias_vendedores",
    label: "Gestor de tráfego / freelancer",
    segment: "gestores de tráfego",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. O HBX pode ajudar gestores de tráfego e freelancers a achar empresas por nicho, organizar leads em CRM e vender prospecção como serviço. Quer que eu te mostre em 5 minutos?",
  },
  {
    id: "agencia_revenda",
    group: "agencias_vendedores",
    label: "Agência que quer revender prospecção",
    segment: "agências de marketing",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Aqui é {{funcionario}} da {{empresa}}. Vi a {{cliente}} em {{cidade}} e pensei numa oportunidade: o HBX busca empresas por cidade/segmento, organiza no CRM e facilita contato pelo WhatsApp. Vocês poderiam usar isso para vender prospecção para os clientes de vocês. Quer ver como funciona?",
  },
  {
    id: "representante_comercial",
    group: "agencias_vendedores",
    label: "Vendedor autônomo / representante comercial",
    segment: "representantes comerciais",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. Tenho uma ferramenta para vendedores que precisam achar empresas novas, organizar contatos e controlar retorno pelo WhatsApp. Quer testar 30 dias grátis?",
  },
  {
    id: "consultoria_comercial",
    group: "agencias_vendedores",
    label: "Consultoria comercial",
    segment: "consultorias empresariais",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. O HBX ajuda consultorias a montar listas de empresas por nicho, organizar oportunidades em CRM e acompanhar retornos pelo WhatsApp. Pode ser útil para entregar prospecção aos clientes. Quer ver?",
  },
  {
    id: "software_house",
    group: "agencias_vendedores",
    label: "Software house / web design",
    segment: "web design",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. Tenho uma ferramenta que busca empresas por cidade e segmento, organiza em CRM e ajuda no contato pelo WhatsApp. Pode ser útil para vocês venderem sites, sistemas ou prospecção. Quer ver uma demonstração rápida?",
  },
  {
    id: "servicos_limpeza",
    group: "servicos_orcamento",
    label: "Serviços de limpeza",
    segment: "serviços de limpeza",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. O HBX ajuda empresas de limpeza a organizar pedidos de orçamento, buscar novos contatos locais e lembrar retornos pelo WhatsApp. Quer que eu te mostre em 5 minutos?",
  },
  {
    id: "materiais_construcao",
    group: "servicos_orcamento",
    label: "Materiais de construção",
    segment: "materiais de construção",
    targetType: "pj",
    messageTemplate:
      "Oi, tudo bem? Vi a {{cliente}} em {{cidade}}. Aqui é {{funcionario}} da {{empresa}}. O HBX ajuda lojas de materiais de construção a organizar orçamentos, contatos e retornos pelo WhatsApp, sem deixar oportunidade perdida. Quer testar 30 dias grátis?",
  },
] as const;
const PROSPECTING_VARIABLES = [
  { token: "cliente", label: "Cliente" },
  { token: "empresa", label: "Empresa" },
  { token: "funcionario", label: "Funcionário" },
  { token: "cidade", label: "Cidade" },
  { token: "estado", label: "Estado" },
  { token: "segmento", label: "Segmento" },
];

const DEFAULT_PROSPECTING_CONFIG: ProspectingAutomationConfig = {
  city: "",
  state: "",
  segment: "madeireiras",
  engine: "hbx",
  targetType: "pj",
  messageTemplate:
    "Oi, tudo bem? Aqui é {{funcionario}} da {{empresa}}. Vi a {{cliente}} em {{cidade}} e queria te explicar em 1 minuto uma solução para {{segmento}}. Faz sentido eu te mandar?",
  intervalMinutes: 12,
  workingHoursStart: "09:00",
  workingHoursEnd: "17:30",
  minLeadBuffer: 15,
  desiredLeadBuffer: 60,
  maxAttemptsPerLead: 1,
  typingSeconds: 8,
  typingVarianceSeconds: 6,
  positiveIntentKeywords: ["tenho interesse", "pode mandar", "quero saber", "me explica", "quanto custa"],
  dailyLimit: 30,
  negativeIntentKeywords: ["não tenho interesse", "sem interesse", "pare", "remover", "spam", "não me chame"],
  optOutMessage: "Entendi. Vou arquivar este contato e não chamaremos novamente.",
  optOutReplyEnabled: false,
  websiteFallbackEnabled: false,
};

type CurrentUserProfile = {
  id: number;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  company?: {
    id?: number | null;
    name?: string | null;
  } | null;
  masterContext?: {
    active?: boolean | null;
    companyName?: string | null;
  } | null;
};

type ProspectingPreviewVariables = {
  funcionario: string;
  empresa: string;
};

function renderProspectingPreview(
  template: string,
  config: ProspectingAutomationConfig,
  variables: ProspectingPreviewVariables,
) {
  const values: Record<string, string> = {
    cliente: "Madeireira Modelo",
    empresa: variables.empresa,
    funcionario: variables.funcionario,
    cidade: config.city || "sua região",
    estado: config.state || "BR",
    segmento: config.segment || "seu segmento",
  };
  return String(template || "")
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token) => values[token] || `[${token}]`)
    .trim();
}

function shouldLoadModalQr(nextPayload: WhatsAppModalPayload | null, includeQr: boolean) {
  if (!includeQr || !nextPayload?.data.available) return false;
  return nextPayload.status !== "connected";
}

function mergeModalPayload(
  statusPayload: WhatsAppModalPayload,
  qrPayload: WhatsAppModalPayload,
): WhatsAppModalPayload {
  if (qrPayload.data.qrCodeDataUrl || qrPayload.status === "connected") {
    return {
      ...qrPayload,
      data: {
        ...statusPayload.data,
        ...qrPayload.data,
      },
    };
  }

  return {
    ...statusPayload,
    data: {
      ...statusPayload.data,
      updatedAt: qrPayload.data.updatedAt || statusPayload.data.updatedAt,
      lastError: qrPayload.data.lastError || statusPayload.data.lastError,
      qrCodeDataUrl: qrPayload.data.qrCodeDataUrl || null,
    },
  };
}

function formatLabel(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return "-";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readStoredDraft(): StoredDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { config?: AtendimentoBotConfig; savedAt?: string };
    if (!parsed?.config) return null;
    return {
      config: normalizeBotConfig(parsed.config),
      savedAt: String(parsed.savedAt || new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

function writeStoredDraft(config: AtendimentoBotConfig) {
  if (typeof window === "undefined") return null;
  const savedAt = new Date().toISOString();
  window.localStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify({ config: normalizeBotConfig(config), savedAt }),
  );
  return savedAt;
}

function clearStoredDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
}

function normalizeTextList(value: unknown, fallback: string[]) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : fallback;
  return Array.from(
    new Set(
      source
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeSearchText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function requiresProspectingCity(config: Pick<ProspectingAutomationConfig, "engine" | "targetType">) {
  return config.engine === "google" || config.targetType === "pj";
}

function getProspectingSceneRule(config: AtendimentoBotConfig) {
  return (config.sceneRules || []).find(
    (rule) => rule.sceneId === PROSPECTING_SCENE_ID && rule.conditionType === PROSPECTING_RULE_CONDITION,
  ) || null;
}

function getProspectingRulesFromBot(config: AtendimentoBotConfig) {
  const metadata = (getProspectingSceneRule(config)?.metadata || {}) as Record<string, unknown>;
  return {
    intervalMinutes: Number(metadata.nextContactDelayMinutes || DEFAULT_PROSPECTING_CONFIG.intervalMinutes),
    typingSeconds: Number(metadata.typingSeconds || DEFAULT_PROSPECTING_CONFIG.typingSeconds),
    typingVarianceSeconds: Number(metadata.typingVarianceSeconds || DEFAULT_PROSPECTING_CONFIG.typingVarianceSeconds),
    positiveIntentKeywords: normalizeTextList(
      metadata.positiveIntentKeywords,
      DEFAULT_PROSPECTING_CONFIG.positiveIntentKeywords,
    ),
    negativeIntentKeywords: normalizeTextList(
      metadata.negativeIntentKeywords || metadata.stopIntentKeywords,
      DEFAULT_PROSPECTING_CONFIG.negativeIntentKeywords,
    ),
    optOutMessage: String(metadata.optOutMessage || DEFAULT_PROSPECTING_CONFIG.optOutMessage),
    optOutReplyEnabled: Boolean(metadata.optOutReplyEnabled),
  };
}

function mergeProspectingConfigFromStatus(
  status: ProspectingAutomationLiveStatus | null,
  botConfig: AtendimentoBotConfig,
): ProspectingAutomationConfig {
  const rules = getProspectingRulesFromBot(botConfig);
  const campaign = status?.campaign;
  const campaignFilters = campaign?.filtersJson && typeof campaign.filtersJson === "object" ? campaign.filtersJson : {};
  return {
    ...DEFAULT_PROSPECTING_CONFIG,
    ...rules,
    city: String(campaign?.city || DEFAULT_PROSPECTING_CONFIG.city),
    state: String(campaign?.state || DEFAULT_PROSPECTING_CONFIG.state),
    segment: String(campaign?.segment || DEFAULT_PROSPECTING_CONFIG.segment),
    engine: campaign?.engine === "google" ? "google" : "hbx",
    targetType:
      campaign?.targetType === "pf" || campaign?.targetType === "agenda_pf"
        ? campaign.targetType
        : "pj",
    messageTemplate: String(campaign?.messageTemplate || DEFAULT_PROSPECTING_CONFIG.messageTemplate),
    intervalMinutes: Number(campaign?.intervalMinutes || rules.intervalMinutes || DEFAULT_PROSPECTING_CONFIG.intervalMinutes),
    workingHoursStart: String(campaign?.workingHoursStart || DEFAULT_PROSPECTING_CONFIG.workingHoursStart),
    workingHoursEnd: String(campaign?.workingHoursEnd || DEFAULT_PROSPECTING_CONFIG.workingHoursEnd),
    dailyLimit: Number(campaign?.dailyLimit || DEFAULT_PROSPECTING_CONFIG.dailyLimit),
    minLeadBuffer: Number(campaign?.minLeadBuffer || DEFAULT_PROSPECTING_CONFIG.minLeadBuffer),
    desiredLeadBuffer: Number(campaign?.desiredLeadBuffer || DEFAULT_PROSPECTING_CONFIG.desiredLeadBuffer),
    maxAttemptsPerLead: Math.max(1, Number(campaign?.maxAttemptsPerLead || DEFAULT_PROSPECTING_CONFIG.maxAttemptsPerLead)),
    typingSeconds: Number(campaign?.typingSeconds || rules.typingSeconds || DEFAULT_PROSPECTING_CONFIG.typingSeconds),
    typingVarianceSeconds: Number(campaign?.typingVarianceSeconds || rules.typingVarianceSeconds || DEFAULT_PROSPECTING_CONFIG.typingVarianceSeconds),
    positiveIntentKeywords: normalizeTextList(campaign?.positiveIntentKeywords, rules.positiveIntentKeywords),
    negativeIntentKeywords: normalizeTextList(campaign?.negativeIntentKeywords, rules.negativeIntentKeywords),
    optOutMessage: String(campaign?.optOutMessage || rules.optOutMessage || DEFAULT_PROSPECTING_CONFIG.optOutMessage),
    optOutReplyEnabled: Boolean(campaign?.optOutReplyEnabled ?? campaignFilters.optOutReplyEnabled ?? rules.optOutReplyEnabled),
    websiteFallbackEnabled: false,
  };
}

function toProspectingRequestPayload(config: ProspectingAutomationConfig): ProspectingAutomationConfig {
  return {
    city: config.city,
    state: config.state,
    segment: config.segment,
    engine: config.engine,
    targetType: config.targetType,
    messageTemplate: config.messageTemplate,
    intervalMinutes: config.intervalMinutes,
    workingHoursStart: config.workingHoursStart,
    workingHoursEnd: config.workingHoursEnd,
    dailyLimit: config.dailyLimit,
    minLeadBuffer: config.minLeadBuffer,
    desiredLeadBuffer: config.desiredLeadBuffer,
    maxAttemptsPerLead: config.maxAttemptsPerLead,
    typingSeconds: config.typingSeconds,
    typingVarianceSeconds: config.typingVarianceSeconds,
    positiveIntentKeywords: config.positiveIntentKeywords,
    negativeIntentKeywords: config.negativeIntentKeywords,
    optOutMessage: config.optOutMessage,
    optOutReplyEnabled: config.optOutReplyEnabled,
    websiteFallbackEnabled: false,
  };
}

function upsertProspectingRules(
  config: AtendimentoBotConfig,
  prospecting: ProspectingAutomationConfig,
): AtendimentoBotConfig {
  const sceneRules = [...(config.sceneRules || [])];
  const currentIndex = sceneRules.findIndex(
    (rule) => rule.sceneId === PROSPECTING_SCENE_ID && rule.conditionType === PROSPECTING_RULE_CONDITION,
  );
  const current = currentIndex >= 0 ? sceneRules[currentIndex] : null;
  const nextRule = {
    ...(current || {
      sceneId: PROSPECTING_SCENE_ID,
      conditionType: PROSPECTING_RULE_CONDITION,
      enabled: true,
    }),
    metadata: {
      ...((current?.metadata || {}) as Record<string, unknown>),
      guideId: "prospeccao",
      nextContactDelayMinutes: prospecting.intervalMinutes,
      typingSeconds: prospecting.typingSeconds,
      typingVarianceSeconds: prospecting.typingVarianceSeconds,
      positiveIntentKeywords: prospecting.positiveIntentKeywords,
      negativeIntentKeywords: prospecting.negativeIntentKeywords,
      optOutMessage: prospecting.optOutMessage,
      optOutReplyEnabled: prospecting.optOutReplyEnabled,
    },
  };
  if (currentIndex >= 0) sceneRules[currentIndex] = nextRule;
  else sceneRules.push(nextRule);
  return normalizeBotConfig({ ...config, sceneRules });
}

function ProspectingAutomationPanel({
  config,
  liveStatus,
  loading,
  actionLoading,
  previewVariables,
  onChange,
  onSave,
  onStart,
  onPause,
  onResume,
  onCancel,
}: {
  config: ProspectingAutomationConfig;
  liveStatus: ProspectingAutomationLiveStatus | null;
  loading: boolean;
  actionLoading: string | null;
  previewVariables: ProspectingPreviewVariables;
  onChange: (updater: (current: ProspectingAutomationConfig) => ProspectingAutomationConfig) => void;
  onSave: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const counters = liveStatus?.counters || { todayPending: 0, overdue: 0, future: 0, sent: 0, positives: 0, archived: 0, failed: 0 };
  const todayPending = counters.todayPending ?? counters.pending ?? 0;
  const positives = counters.positives ?? counters.interested ?? 0;
  const campaignStatus = liveStatus?.campaign?.status || "paused";
  const canPause = campaignStatus === "running";
  const canResume = campaignStatus === "paused";
  const [positiveKeywordsDraft, setPositiveKeywordsDraft] = useState(config.positiveIntentKeywords.join(", "));
  const [negativeKeywordsDraft, setNegativeKeywordsDraft] = useState(config.negativeIntentKeywords.join(", "));
  const [variableTarget, setVariableTarget] = useState<"messageTemplate" | "optOutMessage">("messageTemplate");
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [segmentMenuOpen, setSegmentMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [selectedCampaignTypeId, setSelectedCampaignTypeId] = useState<CampaignTypeId>("cnpj_local");
  const [selectedMessagePresetId, setSelectedMessagePresetId] = useState("");
  const messageTemplateRef = useRef<HTMLTextAreaElement | null>(null);
  const optOutMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const filteredSegmentSuggestions = useMemo(() => {
    const query = normalizeSearchText(config.segment);
    if (!query) return SEGMENT_SUGGESTIONS;
    const filtered = SEGMENT_SUGGESTIONS.filter((segment) => normalizeSearchText(segment).includes(query));
    return filtered.length ? filtered : SEGMENT_SUGGESTIONS;
  }, [config.segment]);
  const filteredMessagePresets = useMemo(
    () => MESSAGE_PRESETS.filter((preset) => preset.group === selectedCampaignTypeId),
    [selectedCampaignTypeId],
  );
  const cityRequired = requiresProspectingCity(config);
  const selectedState = String(config.state || "").trim().toUpperCase();
  const cityOptions = useMemo(() => BRAZIL_CITIES_BY_STATE[selectedState] || [], [selectedState]);

  useEffect(() => {
    // Keep textarea drafts aligned when a saved campaign replaces the local config.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositiveKeywordsDraft(config.positiveIntentKeywords.join(", "));
  }, [config.positiveIntentKeywords]);

  useEffect(() => {
    // Keep textarea drafts aligned when a saved campaign replaces the local config.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNegativeKeywordsDraft(config.negativeIntentKeywords.join(", "));
  }, [config.negativeIntentKeywords]);

  const setField = <K extends keyof ProspectingAutomationConfig,>(field: K, value: ProspectingAutomationConfig[K]) => {
    onChange((current) => ({ ...current, [field]: value }));
  };
  const setStateField = (state: string) => {
    const nextState = state.toUpperCase();
    onChange((current) => ({
      ...current,
      state: nextState,
      city: String(current.state || "").trim().toUpperCase() === nextState ? current.city : "",
    }));
  };
  const setNumberField = (
    field:
      | "intervalMinutes"
      | "dailyLimit"
      | "minLeadBuffer"
      | "desiredLeadBuffer"
      | "maxAttemptsPerLead"
      | "typingSeconds"
      | "typingVarianceSeconds",
    value: string,
    min = 0,
  ) => {
    const parsed = Math.max(min, Math.trunc(Number(value) || 0));
    onChange((current) => ({ ...current, [field]: parsed }));
  };
  const setListField = (field: "positiveIntentKeywords" | "negativeIntentKeywords", value: string) => {
    onChange((current) => ({ ...current, [field]: normalizeTextList(value, current[field]) }));
  };
  const applyMessagePreset = (presetId: string) => {
    setSelectedMessagePresetId(presetId);
    const preset = MESSAGE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedCampaignTypeId(preset.group);
    onChange((current) => ({
      ...current,
      segment: preset.segment,
      targetType: preset.targetType,
      messageTemplate: preset.messageTemplate,
    }));
  };
  const applyCampaignType = (campaignTypeId: CampaignTypeId) => {
    setSelectedCampaignTypeId(campaignTypeId);
    const preset = MESSAGE_PRESETS.find((item) => item.group === campaignTypeId);
    if (!preset) {
      setSelectedMessagePresetId("");
      return;
    }
    setSelectedMessagePresetId(preset.id);
    onChange((current) => ({
      ...current,
      segment: preset.segment,
      targetType: preset.targetType,
      messageTemplate: preset.messageTemplate,
    }));
  };
  const insertVariable = (token: string) => {
    const field = variableTarget;
    const ref = field === "messageTemplate" ? messageTemplateRef.current : optOutMessageRef.current;
    const currentValue = String(config[field] || "");
    const start = ref?.selectionStart ?? currentValue.length;
    const end = ref?.selectionEnd ?? currentValue.length;
    const insert = `{{${token}}}`;
    const nextValue = `${currentValue.slice(0, start)}${insert}${currentValue.slice(end)}`;
    setField(field, nextValue as ProspectingAutomationConfig[typeof field]);
    setVariablesOpen(false);
    window.setTimeout(() => {
      ref?.focus();
      ref?.setSelectionRange(start + insert.length, start + insert.length);
    }, 0);
  };

  return (
    <section className={styles.prospectingShell}>
      <div className={styles.prospectingStatusBar}>
        <div>
          <span className={styles.sectionEyebrow}>Prospecção automática</span>
          <h3 className={styles.cardTitle}>{liveStatus?.text || "Motor contínuo"}</h3>
        </div>
        <div className={styles.prospectingStatusMetrics}>
          <span>Pendentes hoje <strong>{todayPending}</strong></span>
          <span>Enviados <strong>{counters.sent}</strong></span>
          <span>Positivos <strong>{positives}</strong></span>
          <span title="Negativos, sem resposta, pulados ou cancelados pela campanha">Encerrados <strong>{counters.archived}</strong></span>
          <span>Falhas <strong>{counters.failed}</strong></span>
        </div>
      </div>

      <div className={styles.prospectingGrid}>
        <section className={styles.prospectingPanel}>
          <div className={styles.editorSectionHeader}>
            <div>
              <strong>Pesquisa base</strong>
              <span>{loading ? "Carregando status..." : campaignStatus}</span>
            </div>
          </div>
          <div className={styles.prospectingFormGrid}>
            <label className={styles.hbxDropdownContainer} onBlur={() => window.setTimeout(() => setOpenDropdown((prev) => (prev === "state" ? null : prev)), 120)}>
              <span>Estado</span>
              <div className={styles.hbxDropdown}>
                <select
                  className={styles.selectField}
                  value={selectedState}
                  onChange={(event) => setStateField(event.target.value)}
                  onFocus={() => setOpenDropdown("state")}
                  onClick={() => setOpenDropdown("state")}
                  onBlur={() => window.setTimeout(() => setOpenDropdown((prev) => (prev === "state" ? null : prev)), 120)}
                >
                  <option value="">Selecione</option>
                  {BRAZIL_STATES.map((item) => (
                    <option key={item.uf} value={item.uf}>{item.uf} - {item.name}</option>
                  ))}
                </select>
                {openDropdown === "state" ? <div className={styles.hbxDropdownOpeningNotice}>Abrindo os dados...</div> : null}
              </div>
            </label>
            <label className={styles.hbxDropdownContainer} onBlur={() => window.setTimeout(() => setOpenDropdown((prev) => (prev === "city" ? null : prev)), 120)}>
              <span>Cidade</span>
              <div className={styles.hbxDropdown}>
                <input
                  className={`${styles.inputField} ${styles.hbxDropdownInput}`}
                  value={config.city}
                  onFocus={() => setOpenDropdown("city")}
                  onChange={(event) => {
                    setField("city", event.target.value);
                    setOpenDropdown("city");
                  }}
                  placeholder={
                    !selectedState
                      ? "Selecione o estado primeiro"
                      : cityRequired
                        ? "Obrigatório para Google/PJ"
                        : "Opcional"
                  }
                  disabled={!selectedState}
                  required={cityRequired}
                  autoComplete="off"
                />
                <button type="button" className={styles.hbxDropdownToggle} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpenDropdown((prev) => (prev === "city" ? null : "city"))} aria-label="Abrir lista de cidades">
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L7 7L13 1" stroke="#0B1720" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                {openDropdown === "city" ? (
                  <div className={styles.hbxDropdownMenu} role="listbox" aria-label="Cidades sugeridas">
                    {cityOptions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        role="option"
                        className={styles.segmentSuggestionOption}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setField("city", item);
                          setOpenDropdown(null);
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>
            <label className={styles.segmentPickerField} onBlur={() => window.setTimeout(() => setSegmentMenuOpen(false), 120)}>
              <span>Segmento</span>
              <input
                className={styles.inputField}
                value={config.segment}
                onFocus={() => setSegmentMenuOpen(true)}
                onChange={(event) => {
                  setField("segment", event.target.value);
                  setSegmentMenuOpen(true);
                }}
                placeholder="Digite ou escolha um segmento"
                autoComplete="off"
              />
              {segmentMenuOpen ? (
                <div className={styles.segmentSuggestionMenu} role="listbox" aria-label="Segmentos sugeridos">
                  {filteredSegmentSuggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="option"
                      className={styles.segmentSuggestionOption}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setField("segment", item);
                        setSegmentMenuOpen(false);
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <datalist id="prospecting-city-list">
              {cityOptions.map((item) => <option key={item} value={item} />)}
            </datalist>
            <label>
              <span>Engine</span>
              <select className={styles.selectField} value={config.engine} onChange={(event) => setField("engine", event.target.value as "hbx" | "google")}>
                <option value="hbx">HBX</option>
                <option value="google">Google</option>
              </select>
            </label>
            <label>
              <span>Tipo</span>
              <select className={styles.selectField} value={config.targetType} onChange={(event) => setField("targetType", event.target.value as ProspectingAutomationConfig["targetType"])}>
                <option value="pj">PJ</option>
                <option value="pf">PF</option>
                <option value="agenda_pf">Agenda PF</option>
              </select>
            </label>
            <label>
              <span>Limite diário</span>
              <input className={styles.inputField} type="number" min={1} value={config.dailyLimit} onChange={(event) => setNumberField("dailyLimit", event.target.value, 1)} />
            </label>
          </div>
        </section>

        <section className={styles.prospectingPanel}>
          <div className={styles.editorSectionHeader}>
            <div>
              <strong>Envio seguro</strong>
              <span>Máx. {config.maxAttemptsPerLead} tentativa por lead</span>
            </div>
          </div>
          <div className={styles.prospectingFormGrid}>
            <label>
              <span>Intervalo</span>
              <input className={styles.inputField} type="number" min={1} value={config.intervalMinutes} onChange={(event) => setNumberField("intervalMinutes", event.target.value, 1)} />
            </label>
            <label>
              <span>Início</span>
              <input className={styles.inputField} type="time" value={config.workingHoursStart} onChange={(event) => setField("workingHoursStart", event.target.value)} />
            </label>
            <label>
              <span>Fim</span>
              <input className={styles.inputField} type="time" value={config.workingHoursEnd} onChange={(event) => setField("workingHoursEnd", event.target.value)} />
            </label>
            <label>
              <span>Estoque mínimo</span>
              <input className={styles.inputField} type="number" min={1} value={config.minLeadBuffer} onChange={(event) => setNumberField("minLeadBuffer", event.target.value, 1)} />
            </label>
            <label>
              <span>Estoque desejado</span>
              <input className={styles.inputField} type="number" min={1} value={config.desiredLeadBuffer} onChange={(event) => setNumberField("desiredLeadBuffer", event.target.value, 1)} />
            </label>
            <label>
              <span>Tentativas</span>
              <input className={styles.inputField} type="number" min={1} max={3} value={config.maxAttemptsPerLead} onChange={(event) => setNumberField("maxAttemptsPerLead", event.target.value, 1)} />
            </label>
            <label>
              <span>Typing</span>
              <input className={styles.inputField} type="number" min={0} value={config.typingSeconds} onChange={(event) => setNumberField("typingSeconds", event.target.value, 0)} />
            </label>
            <label>
              <span>Variação</span>
              <input className={styles.inputField} type="number" min={0} value={config.typingVarianceSeconds} onChange={(event) => setNumberField("typingVarianceSeconds", event.target.value, 0)} />
            </label>
          </div>
        </section>
      </div>

      <section className={styles.prospectingPanel}>
        <div className={styles.prospectingMessageWorkbench}>
          <div className={styles.prospectingMessageEditorStack}>
            <label className={styles.messagePresetField} onBlur={() => window.setTimeout(() => setOpenDropdown((prev) => (prev === "campaignType" ? null : prev)), 120)}>
              <span>Tipo de campanha</span>
              <div className={styles.hbxDropdown}>
                <select
                  className={styles.selectField}
                  value={selectedCampaignTypeId}
                  onChange={(event) => applyCampaignType(event.target.value as CampaignTypeId)}
                  onFocus={() => setOpenDropdown("campaignType")}
                  onClick={() => setOpenDropdown("campaignType")}
                  onBlur={() => window.setTimeout(() => setOpenDropdown((prev) => (prev === "campaignType" ? null : prev)), 120)}
                >
                  {CAMPAIGN_TYPES.map((campaignType) => (
                    <option key={campaignType.id} value={campaignType.id}>
                      {campaignType.label}
                    </option>
                  ))}
                </select>
                {openDropdown === "campaignType" ? <div className={styles.hbxDropdownOpeningNotice}>Abrindo os dados...</div> : null}
              </div>
            </label>
            <label className={styles.messagePresetField} onBlur={() => window.setTimeout(() => setOpenDropdown((prev) => (prev === "messagePreset" ? null : prev)), 120)}>
              <span>Modelo de abordagem</span>
              <div className={styles.hbxDropdown}>
                <select
                  className={styles.selectField}
                  value={selectedMessagePresetId}
                  onChange={(event) => applyMessagePreset(event.target.value)}
                  onFocus={() => setOpenDropdown("messagePreset")}
                  onClick={() => setOpenDropdown("messagePreset")}
                  onBlur={() => window.setTimeout(() => setOpenDropdown((prev) => (prev === "messagePreset" ? null : prev)), 120)}
                >
                  <option value="">Personalizado</option>
                  {filteredMessagePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                {openDropdown === "messagePreset" ? <div className={styles.hbxDropdownOpeningNotice}>Abrindo os dados...</div> : null}
              </div>
            </label>
            <div className={styles.prospectingMessageGrid}>
              <label>
                <span>Mensagem inicial</span>
                <textarea
                  ref={messageTemplateRef}
                  className={styles.editorTextarea}
                  value={config.messageTemplate}
                  onFocus={() => setVariableTarget("messageTemplate")}
                  onChange={(event) => {
                    setSelectedMessagePresetId("");
                    setField("messageTemplate", event.target.value);
                  }}
                />
              </label>
              <label>
                <span>Encerramento negativo</span>
                <textarea
                  ref={optOutMessageRef}
                  className={styles.editorTextarea}
                  value={config.optOutMessage}
                  disabled={!config.optOutReplyEnabled}
                  onFocus={() => setVariableTarget("optOutMessage")}
                  onChange={(event) => setField("optOutMessage", event.target.value)}
                />
              </label>
            </div>
            <label className={styles.toggleCard}>
              <span>
                <strong>Responder encerramento negativo</strong>
                <small>Desligado por padrão. Mesmo desligado, resposta negativa arquiva e bloqueia recontato automático.</small>
              </span>
              <input type="checkbox" checked={config.optOutReplyEnabled} onChange={(event) => setField("optOutReplyEnabled", event.target.checked)} />
            </label>
            {config.optOutReplyEnabled ? (
              <div className={styles.riskNotice}>
                Responder depois de uma negativa pode aumentar risco de bloqueio no WhatsApp. Use apenas uma mensagem curta, sem insistência e sem link.
              </div>
            ) : null}
            <div className={styles.prospectingKeywordGrid}>
              <label>
                <span>Palavras positivas</span>
                <input
                  className={styles.inputField}
                  value={positiveKeywordsDraft}
                  placeholder="tenho interesse, pode mandar, quero saber"
                  onChange={(event) => {
                    setPositiveKeywordsDraft(event.target.value);
                  }}
                  onBlur={(event) => setListField("positiveIntentKeywords", event.target.value)}
                />
              </label>
              <label>
                <span>Palavras negativas</span>
                <input
                  className={styles.inputField}
                  value={negativeKeywordsDraft}
                  placeholder="não tenho interesse, pare, remover, spam"
                  onChange={(event) => {
                    setNegativeKeywordsDraft(event.target.value);
                  }}
                  onBlur={(event) => setListField("negativeIntentKeywords", event.target.value)}
                />
              </label>
            </div>
          </div>

          <aside className={styles.prospectingWhatsAppPreview}>
            <div className={styles.prospectingPreviewHeader}>
              <div>
                <span>WhatsApp</span>
                <strong>Prévia ao vivo</strong>
              </div>
              <button
                type="button"
                className={styles.previewHeaderButton}
                onClick={() => setVariablesOpen(true)}
              >
                Variáveis
              </button>
            </div>
            <div className={styles.prospectingPhoneFrame}>
              <div className={styles.prospectingPhoneTopbar}>
                <span className={styles.prospectingPhoneAvatar}>HBX</span>
                <div>
                  <strong>{previewVariables.empresa}</strong>
                  <small>online agora</small>
                </div>
                <i aria-hidden="true" />
              </div>
              <div className={styles.prospectingPhoneBody}>
                <span className={styles.prospectingPhoneDate}>Hoje</span>
                <div className={styles.prospectingCustomerBubble}>Contato recebido na fila.</div>
                <div className={styles.prospectingBotBubble} data-tone="typing">
                  <small>Digitando</small>
                  <p>typing por {config.typingSeconds}s, com variação humana de até {config.typingVarianceSeconds}s.</p>
                </div>
                <div className={styles.prospectingBotBubble}>
                  <small>Disparo inicial</small>
                  <p>{renderProspectingPreview(config.messageTemplate, config, previewVariables)}</p>
                </div>
                <div className={styles.prospectingCustomerBubble}>Não tenho interesse, remova meu contato.</div>
                {config.optOutReplyEnabled ? (
                  <div className={styles.prospectingBotBubble}>
                    <small>Encerramento negativo</small>
                    <p>{renderProspectingPreview(config.optOutMessage, config, previewVariables)}</p>
                  </div>
                ) : (
                  <div className={styles.prospectingSystemBubble}>Arquiva, marca opt-out e não envia resposta.</div>
                )}
              </div>
              <div className={styles.prospectingPhoneComposer}>
                <span>Mensagem</span>
                <strong>+</strong>
              </div>
            </div>
          </aside>
        </div>
        <div className={styles.variablePreviewCard} aria-label="Valores atuais das variáveis">
          <div>
            <span>{"{{funcionario}}"}</span>
            <strong>{previewVariables.funcionario}</strong>
            <small>nome do usuário logado</small>
          </div>
          <div>
            <span>{"{{empresa}}"}</span>
            <strong>{previewVariables.empresa}</strong>
            <small>nome da empresa</small>
          </div>
        </div>
        {variablesOpen ? (
          <div className={styles.variablePopover} role="dialog" aria-modal="true">
            <div className={styles.variablePopoverCard}>
              <header>
                <strong>Variáveis</strong>
                <button type="button" className={styles.ghostButton} onClick={() => setVariablesOpen(false)}>Fechar</button>
              </header>
              <div className={styles.variableGrid}>
                {PROSPECTING_VARIABLES.map((variable) => (
                  <button key={variable.token} type="button" className={styles.inlineGhostButton} onClick={() => insertVariable(variable.token)}>
                    {variable.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div className={styles.prospectingActionRow}>
        <button type="button" className={styles.secondaryButton} onClick={onSave} disabled={Boolean(actionLoading)}>
          {actionLoading === "save" ? "Salvando..." : "Salvar configuração"}
        </button>
        <button type="button" className={styles.primaryButton} onClick={onStart} disabled={Boolean(actionLoading)}>
          {actionLoading === "start" ? "Iniciando..." : "Iniciar campanha"}
        </button>
        {canPause ? (
          <button type="button" className={styles.ghostButton} onClick={onPause} disabled={Boolean(actionLoading)}>
            {actionLoading === "pause" ? "Pausando..." : "Pausar"}
          </button>
        ) : canResume ? (
          <button type="button" className={styles.ghostButton} onClick={onResume} disabled={Boolean(actionLoading)}>
            {actionLoading === "resume" ? "Retomando..." : "Retomar"}
          </button>
        ) : null}
        {liveStatus?.campaign ? (
          <button type="button" className={styles.ghostButton} onClick={onCancel} disabled={Boolean(actionLoading)}>
            {actionLoading === "cancel" ? "Cancelando..." : "Cancelar"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default function VendasAutomationClientPage() {
  const hasToken = useRequireModule("vendas");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [, setConnectionLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [activeTab, setActiveTab] = useState<BotQrWorkspaceTab>("flow");
  const [connectionPaired, setConnectionPaired] = useState(false);
  const [draftConfig, setDraftConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [publishedConfig, setPublishedConfig] = useState<AtendimentoBotConfig>(DEFAULT_ATENDIMENTO_BOT_CONFIG);
  const [prospectingConfig, setProspectingConfig] = useState<ProspectingAutomationConfig>(DEFAULT_PROSPECTING_CONFIG);
  const [prospectingStatus, setProspectingStatus] = useState<ProspectingAutomationLiveStatus | null>(null);
  const [prospectingLoading, setProspectingLoading] = useState(false);
  const [prospectingAction, setProspectingAction] = useState<string | null>(null);
  const [agendaConfig, setAgendaConfig] = useState<AtendimentoAgendaConfig>(DEFAULT_ATENDIMENTO_AGENDA_CONFIG);
  const [centerPayload, setCenterPayload] = useState<WhatsAppCenterPayload | null>(null);
  const [modalPayload, setModalPayload] = useState<WhatsAppModalPayload | null>(null);
  const [commercialPlans, setCommercialPlans] = useState<CommercialPlansPayload | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfile | null>(null);
  const [userModules, setUserModules] = useState<UserModule[]>([]);
  const [, setDraftSavedAt] = useState<string | null>(null);
  const [, setPublishedAt] = useState<string | null>(null);
  const previousConnectionStatusRef = useRef<WhatsAppModalPayload["status"] | null>(null);
  const prospectingDirtyRef = useRef(false);
  const prospectingConfigRef = useRef<ProspectingAutomationConfig>(DEFAULT_PROSPECTING_CONFIG);

  const draftSignature = useMemo(() => JSON.stringify(draftConfig), [draftConfig]);
  const publishedSignature = useMemo(() => JSON.stringify(publishedConfig), [publishedConfig]);
  const hasUnsavedChanges = draftSignature !== publishedSignature;
  const providerCapabilities = useMemo(
    () => getProviderCapabilitiesFromWhatsAppCenter(centerPayload),
    [centerPayload],
  );
  const botAiActive = hasBotAi(commercialPlans);
  const previewVariables = useMemo<ProspectingPreviewVariables>(() => {
    const funcionario = String(currentUserProfile?.name || "").trim() || "time comercial";
    const empresa =
      String(
        currentUserProfile?.masterContext?.active
          ? currentUserProfile.masterContext.companyName
          : currentUserProfile?.company?.name,
      ).trim() || "nossa empresa";
    return { funcionario, empresa };
  }, [
    currentUserProfile?.company?.name,
    currentUserProfile?.masterContext?.active,
    currentUserProfile?.masterContext?.companyName,
    currentUserProfile?.name,
  ]);
  const recoveryEnabled = useMemo(() => {
    const trialModule = String(centerPayload?.company.trialModuleSelection || "").trim().toLowerCase();
    if (trialModule === "recovery") return true;
    return userModules.some((module) => module.accessible && module.key === "hbx_recovery");
  }, [centerPayload?.company.trialModuleSelection, userModules]);

  useEffect(() => {
    prospectingConfigRef.current = prospectingConfig;
  }, [prospectingConfig]);

  const openBotPlans = useCallback(() => {
    router.push(BOT_PLAN_HREF);
  }, [router]);

  const handleModalPlanRedirect = useCallback(
    (payload: WhatsAppModalPayload | null) => {
      const redirectTo = getWhatsAppModalPlanRedirect(payload);
      if (!redirectTo) return false;
      setNotice({
        tone: "error",
        text: "Este WhatsApp já utilizou o trial. Para continuar usando o HBX com este número, escolha um plano.",
      });
      router.push(redirectTo);
      return true;
    },
    [router],
  );

  const setWorkspaceTab = useCallback(
    (tab: BotQrWorkspaceTab) => {
      if (tab === "connection") {
        router.push("/whatsapp?focus=qr");
        return;
      }
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set("tab", tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadConnection = useCallback(async (background = false, includeQr = true) => {
    if (!background) setConnectionLoading(true);
    try {
      const centerData = await apiFetch<WhatsAppCenterPayload>("/companies/me/whatsapp-center");
      const statusData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/status");
      let nextModal = statusData;

      if (shouldLoadModalQr(statusData, includeQr)) {
        const qrData = await apiFetch<WhatsAppModalPayload>("/companies/me/whatsapp-modal/qr");
        nextModal = mergeModalPayload(statusData, qrData);
      }

      setCenterPayload(centerData);
      setModalPayload(nextModal);
      handleModalPlanRedirect(nextModal);
    } catch {
      setModalPayload(null);
    } finally {
      if (!background) setConnectionLoading(false);
    }
  }, [handleModalPlanRedirect]);

  const loadAutomation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansPayload, agendaPayload] = await Promise.all([
        apiFetch<CommercialPlansPayload>("/commercial-plans/me"),
        apiFetch<AtendimentoAgendaConfig>("/vendas/automation/agenda"),
      ]);
      setCommercialPlans(plansPayload);
      const normalizedAgenda = normalizeAgendaConfig(agendaPayload);
      setAgendaConfig(normalizedAgenda);

      if (!hasBotAi(plansPayload)) {
        setPublishedConfig(DEFAULT_ATENDIMENTO_BOT_CONFIG);
        setDraftConfig(DEFAULT_ATENDIMENTO_BOT_CONFIG);
        setPublishedAt(null);
        setDraftSavedAt(null);
        return;
      }

      const botPayload = await apiFetch<AtendimentoBotConfig>("/vendas/automation/bot-config");
      const normalizedBot = normalizeBotConfig(botPayload);
      const storedDraft = readStoredDraft();

      setPublishedConfig(normalizedBot);
      setPublishedAt(new Date().toISOString());

      if (storedDraft) {
        setDraftConfig(storedDraft.config);
        setDraftSavedAt(storedDraft.savedAt);
        prospectingDirtyRef.current = true;
        setProspectingConfig(mergeProspectingConfigFromStatus(null, storedDraft.config));
        setNotice({
          tone: "info",
          text: "Rascunho local carregado para continuar a edicao da automacao WhatsApp.",
        });
      } else {
        setDraftConfig(normalizedBot);
        prospectingDirtyRef.current = false;
        setProspectingConfig(mergeProspectingConfigFromStatus(null, normalizedBot));
        setDraftSavedAt(null);
      }
    } catch (loadError) {
      const redirectTo = getBotAiPlanRedirectFromError(loadError, BOT_PLAN_HREF);
      if (redirectTo) {
        setNotice({
          tone: "info",
          text: "Bot de atendimento está disponível no HBX Melhor.",
        });
        router.push(redirectTo);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a automacao WhatsApp.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadProspectingStatus = useCallback(async (background = false, botForMerge?: AtendimentoBotConfig) => {
    if (!background) setProspectingLoading(true);
    try {
      const payload = await apiFetch<ProspectingAutomationLiveStatus>("/vendas/automation/live-status");
      setProspectingStatus(payload);
      setProspectingConfig((current) => {
        if (prospectingDirtyRef.current || background || (!payload.campaign && !botForMerge)) return current;
        return {
          ...current,
          ...mergeProspectingConfigFromStatus(payload, botForMerge || DEFAULT_ATENDIMENTO_BOT_CONFIG),
        };
      });
      return payload;
    } catch {
      return null;
    } finally {
      if (!background) setProspectingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasToken !== true) return;
    void loadAutomation();
    void loadConnection(false, true);
    void apiFetch<CurrentUserProfile>("/profile/current-user")
      .then((profile) => setCurrentUserProfile(profile))
      .catch(() => setCurrentUserProfile(null));
    void apiFetch<UserModule[]>("/modules/me")
      .then((modules) => setUserModules(Array.isArray(modules) ? modules : []))
      .catch(() => setUserModules([]));
  }, [hasToken, loadAutomation, loadConnection]);

  useEffect(() => {
    if (hasToken !== true) return;
    if (!commercialPlans || !hasBotAi(commercialPlans)) return;
    void loadProspectingStatus(false);
    const timer = window.setInterval(() => {
      void loadProspectingStatus(true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [commercialPlans, hasToken, loadProspectingStatus]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "connection") {
      router.replace("/whatsapp?focus=qr");
      return;
    }
    if (requestedTab === "atendimento" || requestedTab === "flow" || requestedTab === "prospeccao" || requestedTab === "recovery") {
      setActiveTab(requestedTab);
      return;
    }
    if (requestedTab === "publish") {
      setWorkspaceTab("flow");
    }
  }, [router, searchParams, setWorkspaceTab]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const currentStatus = modalPayload?.status || null;
    const previousStatus = previousConnectionStatusRef.current;
    previousConnectionStatusRef.current = currentStatus;

    if (currentStatus !== "connected" || previousStatus === "connected") return;

    dispatchModulesChanged({ reason: "whatsapp_connected" });
    if (!previousStatus) return;

    setConnectionPaired(true);
    window.dispatchEvent(new Event(QR_PAIRED_EVENT));
    const timer = window.setTimeout(() => setConnectionPaired(false), 3200);
    return () => window.clearTimeout(timer);
  }, [modalPayload?.status]);

  useEffect(() => {
    if (!modalPayload?.data.available) return;
    const interval = window.setInterval(() => {
      void loadConnection(true, modalPayload.status !== "connected");
    }, modalPayload.status === "connected" ? 20000 : 8000);
    return () => window.clearInterval(interval);
  }, [loadConnection, modalPayload?.data.available, modalPayload?.status]);

  const handleSaveDraft = useCallback(() => {
    const savedAt = writeStoredDraft(draftConfig);
    setDraftSavedAt(savedAt);
    setNotice({ tone: "success", text: "Rascunho salvo localmente nesta automacao." });
  }, [draftConfig]);

  const saveBotConfig = useCallback(async (nextConfig: AtendimentoBotConfig, successText: string) => {
    if (!botAiActive) {
      setNotice({
        tone: "info",
        text: "Bot de atendimento está disponível no HBX Melhor.",
      });
      openBotPlans();
      return false;
    }
    setPublishing(true);
    setError(null);
    try {
      const payload = await apiFetch<AtendimentoBotConfig>("/vendas/automation/bot-config", {
        method: "PATCH",
        body: JSON.stringify(nextConfig),
      });
      const normalized = normalizeBotConfig(payload);
      setDraftConfig(normalized);
      setPublishedConfig(normalized);
      setPublishedAt(new Date().toISOString());
      clearStoredDraft();
      setDraftSavedAt(null);
      setNotice({ tone: "success", text: successText });
      return true;
    } catch (publishError) {
      const redirectTo = getBotAiPlanRedirectFromError(publishError, BOT_PLAN_HREF);
      if (redirectTo) {
        setNotice({
          tone: "info",
          text: "Bot de atendimento está disponível no HBX Melhor.",
        });
        router.push(redirectTo);
        return false;
      }
      const message =
        publishError instanceof Error ? publishError.message : "Falha ao salvar a automacao WhatsApp.";
      setError(message);
      setNotice({ tone: "error", text: message });
      return false;
    } finally {
      setPublishing(false);
    }
  }, [botAiActive, openBotPlans, router]);

  const updateProspectingConfigState = useCallback(
    (updater: (current: ProspectingAutomationConfig) => ProspectingAutomationConfig) => {
      setProspectingConfig((current) => {
        const next = updater(current);
        prospectingConfigRef.current = next;
        prospectingDirtyRef.current = true;
        setDraftConfig((botCurrent) => upsertProspectingRules(botCurrent, next));
        return next;
      });
    },
    [],
  );

  const saveProspectingConfig = useCallback(async () => {
    if (!botAiActive) {
      openBotPlans();
      return;
    }
    const currentProspectingConfig = prospectingConfigRef.current;
    const nextBotConfig = upsertProspectingRules(draftConfig, currentProspectingConfig);
    setProspectingAction("save");
    setError(null);
    try {
      const payload = await apiFetch<ProspectingAutomationLiveStatus>("/vendas/automation/prospecting/config", {
        method: "PATCH",
        body: JSON.stringify(toProspectingRequestPayload(currentProspectingConfig)),
      });
      setProspectingStatus(payload);
      prospectingDirtyRef.current = false;
      const mergedConfig = mergeProspectingConfigFromStatus(payload, nextBotConfig);
      prospectingConfigRef.current = mergedConfig;
      setProspectingConfig(mergedConfig);
      await saveBotConfig(nextBotConfig, "Configuração de prospecção salva.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Falha ao salvar a prospecção automática.";
      setError(message);
      setNotice({ tone: "error", text: message });
    } finally {
      setProspectingAction(null);
    }
  }, [botAiActive, draftConfig, openBotPlans, saveBotConfig]);

  const runProspectingAction = useCallback(
    async (action: "start" | "pause" | "resume" | "cancel") => {
      if (!botAiActive) {
        openBotPlans();
        return;
      }
      const currentProspectingConfig = prospectingConfigRef.current;
      if (
        action === "start" &&
        requiresProspectingCity(currentProspectingConfig) &&
        !currentProspectingConfig.city.trim()
      ) {
        const message = "Informe a cidade para buscar empresas.";
        setError(message);
        setNotice({ tone: "error", text: message });
        return;
      }
      const nextBotConfig = upsertProspectingRules(draftConfig, currentProspectingConfig);
      setProspectingAction(action);
      setError(null);
      try {
        if (action === "start") {
          const configPayload = await apiFetch<ProspectingAutomationLiveStatus>("/vendas/automation/prospecting/config", {
            method: "PATCH",
            body: JSON.stringify(toProspectingRequestPayload(currentProspectingConfig)),
          });
          setProspectingStatus(configPayload);
          const botSaved = await saveBotConfig(nextBotConfig, "Bot sincronizado para a prospecção.");
          if (!botSaved) return;
        }
        const payload = await apiFetch<ProspectingAutomationLiveStatus>(`/vendas/automation/prospecting/${action}`, {
          method: "POST",
          body: action === "start" ? JSON.stringify(toProspectingRequestPayload(currentProspectingConfig)) : undefined,
        });
        setProspectingStatus(payload);
        if (action === "start") prospectingDirtyRef.current = false;
        const mergedConfig = mergeProspectingConfigFromStatus(payload, nextBotConfig);
        prospectingConfigRef.current = mergedConfig;
        setProspectingConfig(mergedConfig);
        setNotice({
          tone: "success",
          text:
            action === "start"
              ? "Campanha de prospecção iniciada."
              : action === "pause"
                ? "Campanha pausada."
                : action === "resume"
                  ? "Campanha retomada."
                  : "Campanha cancelada.",
        });
        if (action === "start") {
          router.push("/atendimento?atendimentoQueue=bot");
        }
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Falha ao controlar a prospecção automática.";
        setError(message);
        setNotice({ tone: "error", text: message });
      } finally {
        setProspectingAction(null);
      }
    },
    [botAiActive, draftConfig, openBotPlans, router, saveBotConfig],
  );

  const renderBotPlanPaywall = () => (
    <section className={styles.botPlanPaywall}>
      <span className={styles.sectionEyebrow}>Plano necessário</span>
      <h3>Bot de atendimento está disponível no HBX Melhor</h3>
      <p>Para configurar ou ativar o bot, escolha o plano que mostra o valor antes da ativação.</p>
      <button type="button" className={styles.primaryButton} onClick={openBotPlans}>
        Ver planos
      </button>
    </section>
  );

  if (hasToken === null) {
    return (
      <DashboardScaffold title="Automacao WhatsApp" description="Carregando automacao do modulo Vendas." hideHeader={true}>
        <section className={styles.loadingCard}>Carregando Automacao WhatsApp...</section>
      </DashboardScaffold>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Automacao WhatsApp" hideHeader={true}>
      <div className={styles.shell}>
        <div className={styles.backdrop} />
        <div className={styles.page}>
          {notice ? <section className={styles.notice} data-tone={notice.tone}>{notice.text}</section> : null}
          {error ? <section className={styles.notice} data-tone="error">{error}</section> : null}
          {loading ? (
            <section className={styles.loadingCard}>Carregando configuracao atual da Automacao WhatsApp...</section>
          ) : (
            <BotQrWorkspace
              activeTab={activeTab}
              onTabChange={setWorkspaceTab}
              connectionPaired={connectionPaired}
              connectionPanel={
                <section className={styles.connectionRedirectPanel}>
                  <span className={styles.sectionEyebrow}>Conexão</span>
                  <h3>Use a central WhatsApp para QR e WebWhats</h3>
                  <p>{modalPayload?.data.phone ? `Número conectado: ${modalPayload.data.phone}` : "Abrindo painel de conexão QR."}</p>
                  <button type="button" className={styles.primaryButton} onClick={() => router.push("/whatsapp?focus=qr")}>
                    Abrir conexão
                  </button>
                </section>
              }
              atendimentoPanel={
                botAiActive ? (
                  <ConversationBuilder
                    botConfig={draftConfig}
                    agendaConfig={agendaConfig}
                    providerCapabilities={providerCapabilities}
                    activeGuide="atendimento"
                    publishing={publishing}
                    recoveryEnabled={recoveryEnabled}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onConfigChange={setDraftConfig}
                    onSaveDraft={handleSaveDraft}
                    onSave={(nextConfig) => void saveBotConfig(nextConfig, "Bot publicado.")}
                  />
                ) : renderBotPlanPaywall()
              }
              flowPanel={
                botAiActive ? (
                  <ConversationBuilder
                    botConfig={draftConfig}
                    agendaConfig={agendaConfig}
                    providerCapabilities={providerCapabilities}
                    activeGuide="prospeccao"
                    publishing={publishing}
                    recoveryEnabled={recoveryEnabled}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onConfigChange={setDraftConfig}
                    onSaveDraft={handleSaveDraft}
                    onSave={(nextConfig) => void saveBotConfig(nextConfig, "Bot publicado.")}
                  />
                ) : renderBotPlanPaywall()
              }
              prospectingPanel={
                botAiActive ? (
                  <ProspectingAutomationPanel
                    config={prospectingConfig}
                    liveStatus={prospectingStatus}
                    loading={prospectingLoading}
                    actionLoading={prospectingAction}
                    previewVariables={previewVariables}
                    onChange={updateProspectingConfigState}
                    onSave={() => void saveProspectingConfig()}
                    onStart={() => void runProspectingAction("start")}
                    onPause={() => void runProspectingAction("pause")}
                    onResume={() => void runProspectingAction("resume")}
                    onCancel={() => void runProspectingAction("cancel")}
                  />
                ) : renderBotPlanPaywall()
              }
              recoveryPanel={
                botAiActive ? (
                  <ConversationBuilder
                    botConfig={draftConfig}
                    agendaConfig={agendaConfig}
                    providerCapabilities={providerCapabilities}
                    activeGuide="recovery"
                    publishing={publishing}
                    recoveryEnabled={recoveryEnabled}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onConfigChange={setDraftConfig}
                    onSaveDraft={handleSaveDraft}
                    onSave={(nextConfig) => void saveBotConfig(nextConfig, "Bot publicado.")}
                  />
                ) : renderBotPlanPaywall()
              }
            />
          )}
        </div>
      </div>
    </DashboardScaffold>
  );
}
