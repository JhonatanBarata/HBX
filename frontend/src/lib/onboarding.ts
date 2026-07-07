"use client";

// Ativação / onboarding (28/06, Camada 1). Ponto único que o app chama nos
// MOMENTOS de valor do vendedor (puxou lead, mandou 1ª msg, fechou venda):
//   stampOnboardingEvent("lead_pulled")
// → carimba no backend (idempotente), avisa o checklist pra recarregar e, se for
// a PRIMEIRA vez de um marco celebrável, dispara o momento de conquista.
//
// É best-effort: rede caiu = ninguém quebra (o GET /onboarding/checklist deriva
// o estado real depois). Nunca lança.

import { apiFetch } from "@/lib/api";
import { fireConquista, type ConquistaKind } from "@/lib/conquista-store";

export type OnboardingEvent =
  // Camada 1 — vendedor (e admin solo, que reusa a jornada do vendedor)
  | "lead_pulled"
  | "whatsapp_connected"
  | "first_conversation_started"
  | "first_deal_closed"
  // Camada 4 — admin/dono (1º login solo|time)
  | "company_identity_set"
  | "first_module_confirmed"
  | "first_seller_invited"
  | "first_conversation"
  // Camada 4 — gerente
  | "first_seller_released";

// Carimbos de configuração do onboarding (NÃO são marcos celebráveis): a escolha
// solo|time do admin no 1º login + o interesse em configurar IA/Bot perguntado
// no tutorial. Aceitos pelo POST /onboarding/event.
export type OnboardingConfigEvent =
  | "admin_mode:solo"
  | "admin_mode:team"
  | "ai_bot_interest:yes"
  | "ai_bot_interest:no";

// Texto da celebração por marco. Tom: vitória concreta e adulta — sem cara de
// joguinho. O backend confirma se é milestone; aqui mora a copy.
const CELEBRATION: Partial<Record<OnboardingEvent, { title: string; subtitle: string; kind: ConquistaKind; badge: string }>> = {
  lead_pulled: {
    title: "Primeiro lead na sua carteira",
    subtitle: "Agora é com você: chame no WhatsApp, converse e feche.",
    kind: "vitoria",
    badge: "Vitória #1",
  },
  first_conversation_started: {
    title: "Você está ativado",
    subtitle: "Primeira conversa iniciada — é assim que toda venda começa.",
    kind: "ativado",
    badge: "Ativado",
  },
  first_deal_closed: {
    title: "Primeira venda fechada",
    subtitle: "Comissão amarrada no seu nome. Bora pra próxima.",
    kind: "venda",
    badge: "Fechou!",
  },
  // Camada 4 — admin/dono
  first_seller_invited: {
    title: "Seu time começou",
    subtitle: "Primeiro vendedor a bordo — agora a operação ganha braço.",
    kind: "vitoria",
    badge: "Time #1",
  },
  first_conversation: {
    title: "Sua empresa está ativada",
    subtitle: "Primeira conversa com cliente acontecendo. É assim que tudo começa.",
    kind: "ativado",
    badge: "Ativado",
  },
  // Camada 4 — gerente
  first_seller_released: {
    title: "Primeiro vendedor liberado",
    subtitle: "Acesso aprovado — a equipe pode operar. Esse é o seu papel.",
    kind: "marco",
    badge: "Liberado",
  },
};

// Sinal leve pro checklist recarregar assim que um marco é carimbado (sem poll).
const bumpListeners = new Set<() => void>();
export function subscribeChecklistBump(cb: () => void) {
  bumpListeners.add(cb);
  return () => { bumpListeners.delete(cb); };
}
export function bumpChecklist() { for (const l of bumpListeners) l(); }

export async function stampOnboardingEvent(event: OnboardingEvent): Promise<void> {
  try {
    const res = await apiFetch<{ ok?: boolean; firstTime?: boolean; milestone?: boolean }>(
      "/onboarding/event",
      { method: "POST", body: JSON.stringify({ event }) },
    );
    bumpChecklist();
    if (res?.firstTime && res?.milestone) {
      const c = CELEBRATION[event];
      if (c) fireConquista(c);
    }
  } catch {
    /* best-effort: o checklist deriva o estado real no próximo GET */
  }
}

// Grava o interesse em configurar IA/Bot perguntado no tutorial (07/07). Carimbo
// de configuração puro: não celebra, não entra no checklist. Devolve true se subiu.
export async function setAiBotInterest(value: "yes" | "no"): Promise<boolean> {
  try {
    await apiFetch("/onboarding/event", {
      method: "POST",
      body: JSON.stringify({ event: `ai_bot_interest:${value}` }),
    });
    bumpChecklist();
    return true;
  } catch {
    return false;
  }
}

// Grava a escolha solo|time do admin no 1º login (Camada 4). Não celebra — é
// configuração, não marco. Devolve true se o carimbo subiu (pra o portão soltar o
// app só quando a escolha persistiu; sem isso o gate poderia reaparecer no F5).
export async function setAdminOnboardingMode(mode: "solo" | "team"): Promise<boolean> {
  try {
    await apiFetch("/onboarding/event", {
      method: "POST",
      body: JSON.stringify({ event: `admin_mode:${mode}` }),
    });
    bumpChecklist();
    return true;
  } catch {
    return false;
  }
}
