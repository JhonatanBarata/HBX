/**
 * CURSOR DA OCORRÊNCIA (27/07, extraído do fix "a sexta que não volta") — as duas
 * funções que traduzem a `agendaOcorrenciaKey` (`agenda:<planoId>:<YYYY-MM-DD>`)
 * de/para a data civil de São Paulo. Moradas originalmente dentro de
 * `logistica-rota.service.ts` (só quem descartava/limpava usava); a frente F0
 * passou a precisar do MESMO par em `logistica.service.ts` (confirmar/cancelar
 * avançam o plano na ORIGEM da chave, não no dia da execução) — mover pra cá
 * evita reimplementar a mesma extração de data em dois lugares (e o risco de
 * uma cópia divergir da outra, que foi exatamente a causa-raiz do incidente).
 *
 * `logistica-rota.service.ts` reexporta as duas (mesmo caminho de import de
 * antes continua funcionando pros callers/testes existentes).
 */

/**
 * `agenda:<planoId>:<YYYY-MM-DD>` → "YYYY-MM-DD" (a data de ORIGEM da ocorrência,
 * já em dia civil de São Paulo — é assim que `generateDay` monta a chave).
 * Qualquer outro formato devolve null: sem data confiável, não se mexe em nada.
 */
export function sourceDateFromOccurrenceKey(key: string | null | undefined): string | null {
  const m = /^agenda:.+:(\d{4}-\d{2}-\d{2})$/.exec(String(key ?? '').trim());
  return m ? m[1] : null;
}

/**
 * `agenda:<planoId>:<YYYY-MM-DD>` → o `<planoId>`. Mesma régua da função acima, e
 * pelo mesmo motivo de morar aqui: desde 10/08 a prova de "esta ocorrência foi
 * cancelada por gente" não vem mais do CORPO da entrega (que agora some no
 * cancelar), e sim da TRILHA — e a trilha guarda plano + dia, nunca a chave
 * inteira. Sem plano não há trilha pra procurar.
 */
export function planIdFromOccurrenceKey(key: string | null | undefined): string | null {
  const m = /^agenda:(.+):\d{4}-\d{2}-\d{2}$/.exec(String(key ?? '').trim());
  return m ? m[1] : null;
}

/**
 * Meia-noite do dia civil de SÃO PAULO — o MESMO carimbo que a Agenda grava em
 * `proximaData` (`logistica-agenda.service.ts`, `startOfDay`). Usar a meia-noite
 * do fuso do processo (UTC no container) faz a Agenda ler o dia ANTERIOR.
 */
export function saoPauloMidnight(dayISO: string): Date {
  return new Date(`${dayISO}T00:00:00-03:00`);
}
