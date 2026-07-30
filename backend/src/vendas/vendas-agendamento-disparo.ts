// ================================================================
// S1+S2 CORREÇÃO DO MODO NOTURNO (docs/PLANEJAMENTOS/DIA-VENDEDOR-NOTURNO/01-CORRECAO.md)
//
// Regras PURAS do "agendar disparo" — o que dá pra decidir sem tocar em banco.
// Ordem do dono depois do teste noturno reprovado: "não quero lembretes". O popup
// de agendar deixou de gravar `VendasLead.returnAt` (lembrete de CRM que nunca vira
// mensagem, B1) e passou a criar disparo com hora reservada pelo motor de slots.
//
// Aqui moram as três perguntas que o service faz ANTES de reservar o slot:
//   1. a data/hora pedida faz sentido? (passado / horizonte absurdo — B6/B7)
//   2. o texto que vai sair é carimbo repetido? (mesma régua do gate anti-ban, mas
//      cobrada NA HORA DE AGENDAR — o vendedor descobre hoje, não amanhã quando o
//      freio cancelar o envio; burla (e) do teste noturno)
//   3. como explicar pra tela o que o motor fez com o horário pedido?
//
// A régua de similaridade é IMPORTADA do gate (coldTextSimilarity) de propósito:
// duas réguas diferentes pra mesma pergunta é como nasce "passou no preparo e
// morreu no envio". Uma pergunta, uma função.
// ================================================================

import { coldTextSimilarity, normalizeColdText } from '../messaging/wa-cold-contact-gate.service';
import { dayKeyOf } from './business-hours.util';
import type { SlotConflictReason } from './agenda-disparo.service';

// Até onde faz sentido agendar. Passar disso quase sempre é dedo errado no ano.
export const HORIZONTE_AGENDAMENTO_DIAS = 60;

export interface ValidacaoAgendamento {
  ok: boolean;
  motivo?: string;
}

/**
 * A data/hora pedida é agendável? Passado (dia anterior) e horizonte absurdo são
 * recusados com texto legível; horário fora da janela NÃO é recusado aqui — o motor
 * de slots move pro próximo horário útil e a tela avisa (é conveniência, não erro).
 */
export function validarDesiredAt(desiredAt: Date, now: Date, horizonteDias = HORIZONTE_AGENDAMENTO_DIAS): ValidacaoAgendamento {
  if (!(desiredAt instanceof Date) || Number.isNaN(desiredAt.getTime())) {
    return { ok: false, motivo: 'Data e hora inválidas. Escolha o dia e a hora do disparo.' };
  }
  // Comparação por dia-negócio (fuso do dono), não por timestamp cru: escolher
  // "hoje 09:00" às 14h continua valendo (o motor joga pro próximo horário livre).
  if (dayKeyOf(desiredAt) < dayKeyOf(now)) {
    return { ok: false, motivo: 'Essa data já passou. Escolha hoje ou uma data futura.' };
  }
  const limite = new Date(now.getTime() + horizonteDias * 24 * 60 * 60 * 1000);
  if (desiredAt.getTime() > limite.getTime()) {
    return { ok: false, motivo: `Só dá pra agendar até ${horizonteDias} dias à frente. Confira o ano da data.` };
  }
  return { ok: true };
}

export interface AvaliacaoCopyAgendada {
  ok: boolean;
  similaridade: number;
  motivo?: string;
}

/**
 * O texto agendado é carimbo de um primeiro contato recente? Mesma régua do gate
 * (containment/Jaccard ≥ threshold) e mesmo piso de tamanho ("oi, tudo bem?" é
 * genérico demais pra ser assinatura de robô).
 *
 * `recentesNorm` já vem NORMALIZADO (é assim que o audit log guarda) — quem lê o
 * banco é o service; esta função não sabe o que é Prisma.
 */
export function avaliarCopyAgendada(input: {
  texto: string;
  recentesNorm: string[];
  threshold: number;
  minLen: number;
}): AvaliacaoCopyAgendada {
  const norm = normalizeColdText(input.texto || '');
  if (norm.length < Math.max(0, input.minLen)) return { ok: true, similaridade: 0 };
  let pior = 0;
  for (const outro of input.recentesNorm) {
    const alvo = String(outro || '').trim();
    if (!alvo) continue;
    const similaridade = coldTextSimilarity(norm, alvo);
    if (similaridade > pior) pior = similaridade;
    if (similaridade >= input.threshold) {
      return {
        ok: false,
        similaridade,
        motivo: `Esse texto está ${Math.round(similaridade * 100)}% igual a um primeiro contato recente. Repetir carimbo é o que expulsa o chip — varie a mensagem de verdade antes de agendar.`,
      };
    }
  }
  return { ok: true, similaridade: pior };
}

/** Texto do textNorm que vai pro audit log (mesmo corte do gate). */
export function textoNormalizadoParaAgenda(texto: string): string {
  return normalizeColdText(texto || '').slice(0, 600);
}

/**
 * O que dizer pro vendedor sobre o horário que ele PEDIU versus o que ele GANHOU.
 * Sem isso a tela mente por omissão ("agendado" quando na verdade virou outra hora).
 */
export function explicarSlot(input: {
  requested: Date;
  slot: Date;
  conflito: boolean;
  motivoConflito: SlotConflictReason;
}): string {
  const quando = formatarQuandoBr(input.slot);
  if (!input.conflito || input.slot.getTime() === input.requested.getTime()) {
    return `Disparo agendado para ${quando}.`;
  }
  const pedido = formatarHoraBr(input.requested);
  switch (input.motivoConflito) {
    case 'fora_da_janela':
      return `${pedido} está fora do horário comercial — ficou ${quando}.`;
    case 'teto_do_dia':
      return `O teto de disparos desse dia já estava cheio — ficou ${quando}.`;
    case 'intervalo_minimo':
      return `${pedido} estava ocupado — ficou ${quando}.`;
    default:
      return `Disparo agendado para ${quando}.`;
  }
}

const FUSO_DONO = 'America/Sao_Paulo';

export function formatarQuandoBr(date: Date): string {
  const dia = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_DONO,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(date);
  return `${dia.replace('.', '')} às ${formatarHoraBr(date)}`;
}

export function formatarHoraBr(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_DONO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
