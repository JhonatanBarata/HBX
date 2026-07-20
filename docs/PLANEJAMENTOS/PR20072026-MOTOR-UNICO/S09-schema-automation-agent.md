# S09 — Schema `AutomationAgent` + backfill ⚠

**Fase 2 · Worker: Sonnet · Depende de: S05 · Migration ADITIVA · Revisão adversarial: SIM**

## Objetivo
A dupla de stores do Atendente (AssistenteConfig + BotConfig atendimento) ganha o lar definitivo:
`AutomationAgent`, 1 por empresa, com os DOIS cérebros. Migration aditiva + backfill idempotente.
NADA é dropado (drop é S20, condicionado ao inventário).

## Arquivos
- EDITAR `backend/prisma/schema.prisma` (model novo)
- CRIAR migration SQL em `backend/prisma/migrations/` (padrão das migrations vizinhas)
- CRIAR `backend/src/automation/agent-backfill.service.ts` (+ test)
- EDITAR `backend/src/automation/automation.module.ts`

## Modelo (validar contra CONTRATO.md antes de escrever)
```prisma
model AutomationAgent {
  id           String   @id @default(cuid())
  companyId    Int      @unique
  nome         String   @default("Assistente")
  tom          String   @default("normal")     // formal | normal | descontraido
  perfil       String   @default("vendas")     // vendas | suporte
  produtos     String?
  empresaNome  String?
  brain        String   @default("roteiro")    // roteiro | ia
  roteiroJson  String   @default("{}")         // shape do BotConfig atendimento
  fluxoJson    String   @default("{}")         // shape do fluxo do assistente
  published    Boolean  @default(false)
  testCounter  Int      @default(0)
  migratedFrom String?                          // 'assistente' | 'bot' | 'ambos' | null(novo)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

## Tarefas
1. **Drift**: rodar `npx prisma migrate diff` / conferir estado ANTES. Há drift conhecido no schema
   (frente do dono, app entregador). A migration desta sprint contém SÓ o `CREATE TABLE` do
   AutomationAgent — escrever o SQL à mão se o generator tentar arrastar o drift alheio.
2. Backfill (service com método `runBackfill()`, idempotente, chamado por script node — NÃO
   automático no boot): para cada empresa com AssistenteConfig e/ou BotConfig(atendimento) mais
   recente: cria/atualiza AutomationAgent com identidade do AssistenteConfig (se houver, senão
   defaults), `fluxoJson` do assistente, `roteiroJson` do payload atual do bot-config-store,
   `brain` e `published` pela regra da S05, `migratedFrom` correto. Reexecutar não duplica nem
   regride edições manuais posteriores (guard por `updatedAt`/existência).
3. CRIAR `backend/scripts/automation-agent-backfill.js` (padrão dos scripts da casa) que chama o
   service — o orquestrador roda no VPS depois do publish final.
4. `prisma:validate` + `prisma:generate` + build verdes. Teste do backfill com prisma mock
   (empresa só-assistente, só-bot, ambos, nenhum).

## Critérios de aceite
- Migration aplicável em banco dev local sem tocar em NADA além da tabela nova.
- Backfill idempotente provado em teste.
- Stores antigos intocados; runtime continua lendo os antigos (troca é S10).

## Proibições
- NENHUM drop/alter em tabela existente. Não rodar migration no VPS (isso é do publish final).

## DoD
Commit local: `feat(automation): S09 — schema AutomationAgent + backfill idempotente`
