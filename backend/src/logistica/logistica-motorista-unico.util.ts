/**
 * PR29072026 — DIAGNÓSTICO do "motorista único" (bug relatado pelo dono, 29/07).
 *
 * Cena: ele indicou uma rota pra alguém, a pessoa aceitou e depois CANCELOU. A
 * tela passou a responder sempre a mesma frase — *"Atribua as entregas a
 * exatamente um motorista antes de iniciar a rota"* — e ele ficou, palavras
 * dele, **"preso, sem enxergar o q falta fazer"**.
 *
 * A frase estava MENTINDO. Medido no banco de produção (company 48, 29/07):
 * ZERO entregas abertas no dia (71 canceladas) e UM único motorista envolvido.
 * Não havia nada pra atribuir. A mesma frase saía de QUATRO estados diferentes:
 *
 *   1. dia VAZIO            → `drivers.length === 0`
 *   2. seleção da tela VELHA → `hasMissingSelection` (os ids que a tela mandou
 *      não estão mais abertos — é EXATAMENTE o que sobra depois de um cancelar)
 *   3. parada sem motorista  → `hasUnassigned`
 *   4. paradas divididas     → `drivers.length > 1`  ← o único caso que a frase
 *                                                      antiga realmente descrevia
 *
 * Só o caso 4 pedia "atribua a um motorista". Nos casos 1 e 2 o operador saía
 * caçando um problema de atribuição que não existia.
 *
 * Aqui a régua é a MESMA de antes (nada afrouxou: os 4 casos continuam
 * bloqueando) — o que muda é a tela saber QUAL é. Usado pelas duas cópias de
 * `resolveSingleDriver` (logistica-rota.service.ts e
 * logistica-custo-preview.service.ts), que existiam duplicadas de propósito e
 * agora pelo menos falam a mesma língua.
 */

export interface MotoristaUnicoRow {
  id: string;
  entregadorId: number | null;
}

/**
 * Formato PLANO de propósito: este projeto compila com `strict: false`, e sem
 * `strictNullChecks` o TypeScript não estreita união discriminada por
 * discriminante booleano — `if (!d.ok)` continuava vendo o ramo de sucesso.
 * Campo a campo não depende de estreitamento nenhum.
 */
export interface MotoristaUnicoDiagnostico {
  /** null = bloqueado; leia `mensagem`. */
  entregadorId: number | null;
  motivo: MotoristaUnicoMotivo | null;
  /** null = liberado. */
  mensagem: string | null;
}

export type MotoristaUnicoMotivo =
  | 'dia_vazio'
  | 'selecao_desatualizada'
  | 'sem_motorista'
  | 'motoristas_divididos';

function plural(n: number, singular: string, pluralPalavra: string): string {
  return `${n} ${n === 1 ? singular : pluralPalavra}`;
}

export function diagnosticarMotoristaUnico(
  rows: MotoristaUnicoRow[],
  selectedIds?: string[],
): MotoristaUnicoDiagnostico {
  const pedidos = Array.isArray(selectedIds) ? selectedIds.length : 0;

  // Ordem NÃO é estética: seleção velha vem primeiro porque, com a tela
  // desatualizada, qualquer outra contagem daqui pra baixo também está errada —
  // mandar o operador "atribuir motorista" seria mandá-lo consertar o que já
  // não existe. A cura é recarregar, e a frase precisa dizer isso.
  if (pedidos > 0 && rows.length !== pedidos) {
    const sumiram = Math.max(0, pedidos - rows.length);
    return {
      entregadorId: null,
      motivo: 'selecao_desatualizada',
      mensagem: `${plural(sumiram, 'parada desta tela não existe mais', 'paradas desta tela não existem mais')} (canceladas ou já entregues). Atualize a rota.`,
    };
  }

  if (!rows.length) {
    return {
      entregadorId: null,
      motivo: 'dia_vazio',
      mensagem: 'Nenhuma entrega aberta neste dia. Monte a rota antes de iniciar.',
    };
  }

  const semMotorista = rows.filter((row) => !Number.isInteger(row.entregadorId)).length;
  if (semMotorista > 0) {
    return {
      entregadorId: null,
      motivo: 'sem_motorista',
      mensagem: `${plural(semMotorista, 'parada sem motorista', 'paradas sem motorista')}. Atribua antes de iniciar.`,
    };
  }

  const motoristas = [
    ...new Set(rows.map((row) => row.entregadorId).filter((id): id is number => Number.isInteger(id))),
  ];
  if (motoristas.length > 1) {
    return {
      entregadorId: null,
      motivo: 'motoristas_divididos',
      mensagem: `As paradas do dia estão divididas entre ${motoristas.length} motoristas. Deixe só um para iniciar a rota.`,
    };
  }

  return { entregadorId: motoristas[0], motivo: null, mensagem: null };
}
