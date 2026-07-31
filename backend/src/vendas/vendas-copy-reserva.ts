// ================================================================
// RESERVA DE COPY DE ABERTURA (31/07/2026 — turno noturno 2)
//
// O bug que isto mata: "Agendar disparo" criava uma inscrição de cadência, e o
// runner mandava o `corpo` FIXO do passo. Agendar 10 disparos numa noite =
// 10 mensagens IDÊNTICAS saindo na manhã seguinte. Isso é carimbo de robô — a
// mesma assinatura que fez a Meta remover o dispositivo vinculado em 30/07 dois
// segundos depois do 3º disparo com copy quase igual.
//
// A regra aqui é uma só: **cada disparo agendado leva um texto que ninguém
// usou.** Quem agenda escolhe a variante mais DISTANTE do que já saiu/está
// agendado; se não sobrou nenhuma abaixo da régua, o agendamento é RECUSADO com
// um motivo que o dono entende ("gere mais variações") — em vez de aceitar hoje
// e o freio cancelar amanhã, um por um.
//
// A régua é a MESMA do gate anti-ban (coldTextSimilarity) de propósito: duas
// réguas pra mesma pergunta é como nasce "passou no preparo e morreu no envio".
// ================================================================

import { coldTextSimilarity, normalizeColdText } from '../messaging/wa-cold-contact-gate.service';

export interface VarianteAvaliada {
  variante: string;
  similaridade: number;
}

export type ReservaCopyResult =
  | { ok: true; variante: string; similaridade: number; avaliadas: VarianteAvaliada[] }
  | { ok: false; motivo: string; avaliadas: VarianteAvaliada[] };

export interface ReservaCopyInput {
  /** Variantes de 1º contato do dono, na ordem em que ele salvou. */
  variantes: string[];
  /** Textos já usados (enviados OU agendados) na janela, JÁ normalizados. */
  usadasNorm: string[];
  /** Mesma régua do gate (0..1). */
  threshold: number;
  /** Piso de tamanho: texto curto demais não é assinatura de robô. */
  minLen: number;
}

/**
 * Escolhe a variante mais distante do que já foi usado.
 *
 * - Texto abaixo de `minLen` conta como similaridade 0 (é genérico demais pra
 *   ser carimbo — mesma decisão do gate).
 * - Empate: vence a PRIMEIRA da lista (a ordem do dono importa).
 * - Nenhuma abaixo do threshold => recusa com motivo legível.
 */
export function reservarVarianteDeAbertura(input: ReservaCopyInput): ReservaCopyResult {
  const limpas = (input.variantes || [])
    .map((v) => String(v || '').trim())
    .filter((v) => v.length > 0);

  if (!limpas.length) {
    return { ok: false, motivo: 'Nenhuma mensagem de primeiro contato configurada.', avaliadas: [] };
  }

  const usadas = (input.usadasNorm || []).map((t) => String(t || '').trim()).filter(Boolean);
  const avaliadas: VarianteAvaliada[] = limpas.map((variante) => {
    const norm = normalizeColdText(variante);
    if (norm.length < Math.max(0, input.minLen) || !usadas.length) {
      return { variante, similaridade: 0 };
    }
    let pior = 0;
    for (const alvo of usadas) {
      const similaridade = coldTextSimilarity(norm, alvo);
      if (similaridade > pior) pior = similaridade;
    }
    return { variante, similaridade: pior };
  });

  let melhor: VarianteAvaliada | null = null;
  for (const item of avaliadas) {
    if (item.similaridade >= input.threshold) continue;
    if (!melhor || item.similaridade < melhor.similaridade) melhor = item;
  }

  if (!melhor) {
    const pct = Math.round(input.threshold * 100);
    return {
      ok: false,
      motivo:
        `Suas ${limpas.length} mensagem(ns) de primeiro contato já foram usadas nas últimas horas — ` +
        `repetir texto ${pct}% igual é o que expulsa o chip. Gere mais variações (IA) na Prospecção antes de agendar outro disparo.`,
      avaliadas,
    };
  }

  return { ok: true, variante: melhor.variante, similaridade: melhor.similaridade, avaliadas };
}

// ================================================================
// ESPAÇAMENTO HUMANO (mesmo turno)
//
// O motor de slots devolve horários no relógio: 08:00, 08:15, 08:30. Dez
// disparos nesse ritmo têm cara de máquina mesmo respeitando o intervalo
// mínimo. Este deslocamento SÓ ADIA (nunca antecipa) — nunca encurta a
// distância entre dois disparos, então não afrouxa o freio; só tira o texto do
// "minuto redondo".
//
// Determinístico por (inscrição, slot): a mesma reserva recalculada dá o mesmo
// minuto, então retomar o runner não embaralha a agenda.
// ================================================================
export const JITTER_MAX_MINUTOS = 4;

export function jitterHumanoMinutos(chave: string, maxMinutos = JITTER_MAX_MINUTOS): number {
  const teto = Math.max(0, Math.trunc(maxMinutos));
  if (!teto) return 0;
  const texto = String(chave || '');
  let hash = 0;
  for (let i = 0; i < texto.length; i += 1) {
    hash = (hash * 31 + texto.charCodeAt(i)) % 100000;
  }
  return hash % (teto + 1);
}
