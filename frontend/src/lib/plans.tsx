"use client";

// Fonte única de dados de plano para o front (PR16062026030).
// NÚMERO vem do backend (/commercial-plans/public-catalog).
// Copy narrativa vive aqui — nunca duplicada em tela.

import type { ReactNode } from "react";

import { apiFetch } from "@/lib/api";

export type PublicPlan = {
  key: string;
  title: string;
  monthlyPrice: number | null;
  contactOnly: boolean;
  trialDays: number;
  includedUsers: number;
  annualDiscountPercent: number;
  cardsPerMonth: number;
  headline: string;
  description: string;
  badge: string | null;
  recommended: boolean;
  features: string[];
  // Self-Checkout (F2): master pausou o plano → card embaçado/inclicável.
  paused?: boolean;
};

export const FALLBACK_PLANS: PublicPlan[] = [
  { key: "hbx_lite",    title: "HBX List",     monthlyPrice: 49,   contactOnly: false, trialDays: 0,  includedUsers: 1, annualDiscountPercent: 20, cardsPerMonth: 880,  headline: "", description: "", badge: "Entrada",     recommended: false, features: [] },
  { key: "hbx_padrao",  title: "HBX Lead Plus", monthlyPrice: 99,   contactOnly: false, trialDays: 14, includedUsers: 2, annualDiscountPercent: 20, cardsPerMonth: 2200, headline: "", description: "", badge: "Mais vendido", recommended: true,  features: [] },
  { key: "hbx_pro",     title: "HBX Pro",       monthlyPrice: 249,  contactOnly: false, trialDays: 0,  includedUsers: 3, annualDiscountPercent: 20, cardsPerMonth: 3500, headline: "", description: "", badge: "Mais forte",  recommended: false, features: [] },
  { key: "hbx_melhor",  title: "Implantação",   monthlyPrice: null, contactOnly: true,  trialDays: 0,  includedUsers: 5, annualDiscountPercent: 20, cardsPerMonth: 5000, headline: "", description: "", badge: "Empresas",    recommended: true,  features: [] },
];

let _cache: PublicPlan[] | null = null;

export async function fetchPublicPlans(): Promise<PublicPlan[]> {
  if (_cache) return _cache;
  try {
    const data = await apiFetch<{ plans: PublicPlan[] }>("/commercial-plans/public-catalog");
    if (Array.isArray(data?.plans) && data.plans.length) {
      _cache = data.plans;
      return _cache;
    }
  } catch { /* usa fallback */ }
  return FALLBACK_PLANS;
}

export function getPlanFallback(key: string): PublicPlan {
  return FALLBACK_PLANS.find((p) => p.key === key) ?? FALLBACK_PLANS[1];
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── SVG paths compartilhados ────────────────────────────────────────────────
export const IC_SNOW      = ["M12 2v20", "M3.34 7l17.32 10", "M20.66 7L3.34 17", "M2 12h20"];
export const IC_TARGET    = ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 12h.01"];
export const IC_BOLT      = ["M13 2 4 14h7l-1 8 10-12h-9l1-8Z"];
export const IC_CUBE      = ["M12 2 21 7v10l-9 5-9-5V7l9-5Z", "M3.3 7.2 12 12l8.7-4.8", "M12 12v10"];
export const IC_CHECK     = ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M8.4 12l2.4 2.4 4.8-5"];
export const IC_BARS      = ["M4 19V5", "M4 19h16", "M8 19v-6", "M13 19V9", "M18 19v-4"];
export const IC_LOGOS     = [
  ["M20 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"],
  ["M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z", "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M17 7h.01"],
  ["M3 16c0-5 2-9 4.5-9S11 16 12 16s2-9 4.5-9S21 11 21 16"],
  ["M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z", "M4 9h16", "M9 3v4", "M15 3v4"],
  ["M21 12a9 9 0 1 1-3-6.7", "M21 4v5h-5"],
];

// ── Copy estática por plano ─────────────────────────────────────────────────
export type PlanStaticCopy = {
  accent: string;
  ic: string[];
  tag: string;
  // feats de marketing — SEM linha de volume (vem do backend)
  feats: string[];
  cta: string;
  badge?: string;
  hot?: boolean;
  logos?: boolean;
  // Detalhes do painel lateral
  temp: string;
  pitch: string;
  how: string[];
  // points aceita includedUsers e cardsPerMonth pra exibir valores reais
  points: (includedUsers: number, cardsPerMonth: number) => string[];
  forWho: string;
  foot: string;
  // Copy do form de cadastro (register/page.client.tsx)
  formTitle: string;
  formSub: ReactNode;
  doneSub: string;
};

export const PLAN_STATIC: Record<string, PlanStaticCopy> = {
  hbx_lite: {
    accent: "List",
    ic: IC_SNOW,
    tag: "Você pede, o Radar entrega. Cards crus pra você esquentar e prospectar.",
    feats: ["Telefone, cidade, segmento e site", "Redes sociais quando encontradas"],
    cta: "Escolher plano",
    temp: "Lista Fria",
    pitch: "Pare de garimpar empresa no Google. Você escolhe o filtro — cidade, segmento, raio — e o HBX localiza empresas no perfil e te entrega prontas pra abordar.",
    how: [
      "Você define o alvo: cidade, segmento e até onde quer alcançar",
      "O HBX localiza empresas reais no seu perfil e abastece a sua lista",
      "Você toca o card e o WhatsApp ou a ligação já abrem prontos, sem copiar número",
    ],
    points: (_u, cards) => [
      "Seus contatos em cards, com agenda e aviso de retorno pra não perder a hora",
      "Telefone, endereço e segmento de cada empresa encontrada",
      "1 acesso, sem custos extras",
      `${cards.toLocaleString("pt-BR")} leads por mês`,
    ],
    forWho: "Pra quem precisa de volume de contato barato e faz a abordagem no braço.",
    foot: "Lista nova sempre · Você no controle",
    formTitle: "Criar sua conta",
    formSub: <>Você está ativando o <strong>HBX List</strong>. Cards com telefone, cidade, segmento e site para você esquentar e prospectar.</>,
    doneSub: "Sua conta HBX List está ativa. Acesse e peça sua primeira lista de leads no Radar.",
  },

  hbx_padrao: {
    accent: "Lead",
    ic: IC_TARGET,
    tag: "Leads inteligentes: você já sabe quem ligar e o que dizer.",
    feats: ["WhatsApp verificado pela HBX", "Score, motivo e canal recomendado", "Mensagem pronta por segmento"],
    cta: "Testar 14 dias grátis",
    badge: "Mais escolhido",
    hot: true,
    temp: "Lista Fria enriquecida",
    pitch: "Tudo do List, mas o HBX vai além do telefone: enriquece cada empresa e lê a oportunidade pra você saber por quem começar.",
    how: [
      "O HBX acha a empresa e ainda cava redes, CNPJ, e-mail e site",
      "A IA lê a oportunidade: te dá um score e o motivo por trás dele",
      "Você começa pelos melhores, com a mensagem pronta do segmento na mão",
    ],
    points: (n, cards) => [
      "Contexto que abre conversa: o que a empresa faz e por onde falar com ela",
      "Canal recomendado pra cada contato: ligar, WhatsApp ou rede social",
      `Painel com administrador + ${Math.max(n - 1, 1)} funcionário${n > 2 ? "s" : ""}`,
      `${cards.toLocaleString("pt-BR")} leads inteligentes por mês`,
    ],
    forWho: "Pra quem cansou de ligar no escuro e quer priorizar quem realmente vale.",
    foot: "14 dias grátis · Não cobramos nada antes",
    formTitle: "Comece seu teste de 14 dias",
    formSub: <>Você está ativando o <strong>HBX Lead</strong>. Não cobramos nada por 14 dias — cancele quando quiser.</>,
    doneSub: "Seu teste de 14 dias está ativo. Acesse e veja seus primeiros leads inteligentes.",
  },

  hbx_pro: {
    accent: "Full",
    ic: IC_BOLT,
    tag: "Atendimento no painel e Bot IA prospectando por você.",
    feats: ["Tudo do Lead", "Atendimento interno pelo painel", "Bot IA + prospecção pós-resposta"],
    cta: "Escolher plano",
    temp: "Lista Morna",
    pitch: "Tudo do Lead, e o WhatsApp passa pra dentro do HBX. Em até 7 dias a gente configura um Bot IA pra você (com acesso remoto).",
    how: [
      "Você conecta seu chip e o HBX lê suas conversas recentes de clientes",
      "A IA monta a árvore de respostas (URA) — ou você desenha do seu jeito",
      "O bot responde e qualifica sozinho, e passa pro humano quando aperta",
    ],
    points: (n, cards) => [
      "Prospecção e atendimento rodando dentro de um lugar só",
      "O bot reaquece quem respondeu antes do lead chegar em você",
      `Painel com gerencial e administrador + ${Math.max(n - 1, 2)} funcionário${Math.max(n - 1, 2) !== 1 ? "s" : ""}`,
      `${cards.toLocaleString("pt-BR")} leads inteligentes por mês`,
      "Configuração assistida: a HBX deixa tudo de pé com você",
    ],
    forWho: "Pra equipe que já não dá conta de responder todo mundo na mão.",
    foot: "Bot IA configurado em até 7 dias",
    formTitle: "Criar sua conta",
    formSub: <>Você está ativando o <strong>HBX Full</strong>. Atendimento no painel, Bot IA e prospecção automática na sua operação.</>,
    doneSub: "Sua conta HBX Full está ativa. Configure seu Bot IA e comece a prospectar no automático.",
  },

  hbx_melhor: {
    accent: "Implantação",
    ic: IC_CUBE,
    tag: "Tudo do Pro + Recovery e integração com o seu ERP, montado pela HBX.",
    feats: ["Recovery de inadimplentes", "Cobrança integrada ao seu ERP", "Implantação feita pela HBX"],
    cta: "Quero implantação",
    logos: true,
    temp: "Lista Quente",
    pitch: "Pro cliente que quer do jeito dele. A HBX estuda a sua empresa, integra ao que você já usa e traz lead QUENTE: quem te procurou nas redes e deixou o telefone.",
    how: [
      "A gente estuda sua empresa: altos, baixos, público e perfil de quem você atende",
      "Integra ao que você já tem: planilha do Google, Outlook ou ERP (TOTVS, SAP…)",
      "O inbound do Insta e Face vira conversa: o sistema fala, desenrola e passa pro humano",
    ],
    points: (_u, _c) => [
      "Lead que já te procurou: você entra pra fechar, não pra convencer",
      "Recovery de inadimplentes e cobrança ligada ao seu ERP",
      "Método montado com você, por um especialista de verdade",
      "Foco em cortar custo: menos tempo perdido, menos lead frio",
    ],
    forWho: "Pra quem quer escala e topa investir pra receber lead pronto pra fechar.",
    foot: "Falar com especialista",
    formTitle: "Falar com especialista",
    formSub: <>Deixe seus dados e um especialista HBX entra em contato pra montar o <strong>Company</strong> com você — Recovery, ERP e implantação.</>,
    doneSub: "Dados recebidos. Um especialista HBX vai falar com você pra montar seu plano.",
  },
};

// Ordem de exibição dos cards na casca
export const PLAN_ORDER = ["hbx_lite", "hbx_padrao", "hbx_pro", "hbx_melhor"] as const;
