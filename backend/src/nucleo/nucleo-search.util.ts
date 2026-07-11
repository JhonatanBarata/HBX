// NÚCLEO-CRM — BUG 1 (11/07): busca por nome ACENTUADO não encontrava o cliente.
//
// Causa: `{ name: { contains: query, mode: 'insensitive' } }` do Prisma vira ILIKE no
// Postgres, que é acento-SENSÍVEL ("Déia" não bate com "Deia"). A saída Prisma-native é
// manter uma coluna `searchName` SEM acento/caixa (gravada no write path) e comparar
// contra o MESMO normalizador aplicado no `query` de busca.
//
// `normalizeSearch` PRECISA produzir a MESMA saída que a função SQL `unaccent(lower(...))`
// usada na migration de backfill (CREATE EXTENSION unaccent) — senão linha antiga
// (backfillada via SQL) e busca nova (normalizada via JS) não casam. NFD + strip de
// diacríticos cobre o alfabeto PT-BR (á,ã,â,à,ç,é,ê,í,ó,ô,õ,ú...) igual o `unaccent` do
// Postgres pra este conjunto de caracteres.
export function normalizeSearch(s: string | null | undefined): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
