# SPRINT4 — Estado da prospecção: JSON metadata → tabela tipada (P1)

> Depende do SPRINT1 (a máquina única é quem passa a ler/escrever a tabela — fazer antes seria
> escrever o dual-write em DOIS lugares).

## Problema

Estado comercial crítico vive em JSON `metadata` da `Conversation`, sem tipo, sem índice, sem trilha:
chaves `vendasAutomation` e `vendasAgendaQueue` (opt-out, blacklist, humanAssigned, stage,
preMessagePitchSent...), parseadas à mão em 3 módulos (`messaging`, `inbox`, `vendas`). Opt-out de
contato comercial como chave de JSON solto é fraco para LGPD (art. 18 — prova de respeito à
revogação) e um typo de chave vira bug silencioso de compliance.

Agravante descoberto na auditoria: `VendasCardComplaint` está no `schema.prisma` (L1448) mas **não
tem migration** — a tabela existe em produção só pelo runtime-ensure de
`vendas-complaints-runtime.ts` (CREATE TABLE IF NOT EXISTS no boot). Ou seja, o histórico de
migrations não reproduz o banco real.

## Objetivo

1. Novo model `ProspectingContactState` — fonte tipada do estado da máquina de inbound.
2. Regularizar a migration do `VendasCardComplaint` e matar o runtime-ensure.
3. JSON vira legado de leitura (não apagar dados neste sprint).

## Modelo proposto (ajustar nomes no diff funcional do SPRINT1)

```prisma
model ProspectingContactState {
  id                  String    @id @default(cuid())
  companyId           Int
  conversationId      Int?
  leadId              String?
  phoneNormalized     String?
  stage               String    // espelha os estágios hoje em vendasAutomation.status/queue.status
  lastClassification  String?
  optOutAt            DateTime?
  blacklistedAt       DateTime?
  humanAssignedAt     DateTime?
  preMessagePitchSent Boolean   @default(false)
  scheduledReturnAt   DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@unique([companyId, conversationId])
  @@index([companyId, phoneNormalized])
  @@index([companyId, optOutAt])
  @@index([leadId])
}
```

(Company/relations e onDelete seguindo o padrão dos models vizinhos. Campo a campo deve nascer do
inventário real de chaves do JSON — fazer `grep` de toda leitura de `vendasAutomation.` e
`vendasAgendaQueue.` e listar as chaves usadas antes de fechar o schema.)

## Passos

1. Inventário de chaves JSON lidas/escritas (entregável: tabela chave → onde lê → onde escreve →
   vira coluna? / morre?).
2. Migration Prisma de verdade (`prisma migrate dev` local). Na MESMA leva, migration idempotente do
   `VendasCardComplaint` (`CREATE TABLE IF NOT EXISTS` + índices, espelhando o runtime-ensure) — em
   produção ela precisa aplicar limpa sobre a tabela já existente. Testar contra banco local zerado E
   contra cópia com a tabela pré-criada.
3. Dual-write: máquina única (SPRINT1) escreve JSON + tabela. Backfill script para conversas com
   estado ativo (opt-out/blacklist SEMPRE backfillados — é o dado de compliance).
4. Trocar as LEITURAS da máquina para a tabela (JSON só fallback quando linha não existe).
5. Matar `vendas-complaints-runtime.ts` (ensure) depois que a migration estiver aplicada em produção.
6. Leituras fora da máquina (inbox L2185+, `isProspectionMetadataCandidate` etc.): migrar as que o
   inventário mostrar baratas; as demais ficam listadas como dívida — este sprint não precisa zerar.

## Guardrails

- Migration SÓ aditiva (CREATE/ALTER ADD). Nada de DROP/apagar metadata — proibido sem ordem do dono.
- Migrations rodam no container `hbx-backend` em produção (start-prod.sh), nunca `npx prisma` do host.
- Opt-out: durante o dual-write, a leitura considera OR (JSON diz opt-out OU tabela diz opt-out) —
  nunca "destrava" contato por divergência de fonte. Fail-closed.
- `npm run prisma:validate` + `npm run build` a cada passo.

## Checks e aceite

- Migration aplica em banco zerado e em banco com `VendasCardComplaint` pré-existente.
- Teste: inbound de opt-out grava `optOutAt` na tabela; automação recusa job para contato com
  `optOutAt` setado (mesmo sem JSON).
- Backfill roda idempotente (2ª execução = 0 mudanças).
- Runtime-ensure removido só após confirmação da migration em produção (passo explícito, não junto).

## Rollback

Código: `git revert`. Migration aditiva fica (tabela vazia é inofensiva); dual-write desligado
volta o sistema ao JSON puro.
