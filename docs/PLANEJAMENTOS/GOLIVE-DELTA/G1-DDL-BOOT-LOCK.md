# G1 — DDL no boot: advisory lock + short-circuit (P1.5)

## Contexto
`PrismaService.onModuleInit` roda **23 blocos de DDL** (`runRuntimeSchemaEnsure`) em sequência,
logo após `$connect()`, sem advisory lock, sem gate por env e sem pré-check de existência. O
array `RUNTIME_SCHEMA_ENSURES` marca **44** entradas `shouldBecomeMigration: true`. A maioria
usa `IF NOT EXISTS` (idempotente), mas alguns não (ex.: `ensureTutorialOnboardingColumn` roda
`ALTER COLUMN ... DROP DEFAULT` **todo boot**). Setup do dono é single-instance, então corrida
entre instâncias é risco baixo hoje — o objetivo aqui é **higiene de boot barata e aditiva**,
não a migração completa.

## Arquivos
- `backend/src/prisma/prisma.service.ts` — `onModuleInit` (~linhas 540-568), array
  `RUNTIME_SCHEMA_ENSURES` (~68), `ensureTutorialOnboardingColumn` (~691) e vizinhos sem
  `IF NOT EXISTS`.

## Escopo (mínimo seguro, tudo aditivo)
1. **Advisory lock transacional** envolvendo o bloco de ensures: abrir uma transação e chamar
   `SELECT pg_advisory_xact_lock(<chave inteira constante, ex. 918273>)` ANTES de rodar os
   ensures; soltar ao fim da tx. Serializa boots concorrentes. **Só Postgres** — se o provider
   for SQLite/teste, pular o lock (manter o comportamento atual).
2. **Short-circuit de existência** nos ensures que NÃO têm `IF NOT EXISTS` (começar por
   `ensureTutorialOnboardingColumn`): checar `information_schema.columns`/`.tables` e só
   executar o DDL se faltar. Não re-emitir ALTER já aplicado a cada boot.
3. **Kill-switch por env** `HBX_SKIP_RUNTIME_SCHEMA_ENSURES` (default OFF = roda como hoje):
   quando `true`, pula todos os ensures (para o dia em que virarem migrations formais). Aditivo,
   default preserva 100% do comportamento atual.

## Fora de escopo
- NÃO migrar as 44 ensures para `prisma/migrations` (grande, arriscado — outra frente).
- NÃO remover nenhum ensure nem alterar o schema resultante.

## Guardrails
- Aditivo: o schema final após o boot tem de ser **idêntico** ao de hoje.
- `pg_advisory_xact_lock` falhando → logar e **seguir** (fail-open; nunca travar o boot por causa
  do lock).
- "Build verde ≠ boot ok": validar que o backend **sobe** de fato (não só compila).

## Pronto quando
- Boot não re-emite DDL já aplicado (checar log/`information_schema`).
- Bloco de ensures envolto em advisory lock (Postgres) com fail-open.
- `cd backend && npm run build` + typecheck verdes; app sobe local sem erro de boot.
