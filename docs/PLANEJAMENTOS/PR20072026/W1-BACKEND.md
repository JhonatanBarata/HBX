# W1 — Backend: sessão de leitura de rota + nome único de rota-modelo

Ler ANTES: `00-ORQUESTRACAO.md` e `SPEC-LEITURA-DE-ROTA.md` (mesma pasta) + `docs/Rules/BACKEND.md`.
O contrato de endpoints do 00-ORQUESTRACAO é LEI — o app (W2/W3) será escrito contra ele.

## Escopo
Tudo em `backend/` apenas. NÃO tocar: `logistica-route-billing*`, `backend/src/credits`,
`logistica-tracking*` (não reusar TrackingSession — criar models próprios), `Webwhats/`, frontend,
EntregaShell.

## 1. Migration Prisma (ADITIVA)
Em `backend/prisma/schema.prisma` (perto dos models Logistica*, ~linha 1288+):

```prisma
model LogisticaLeituraSessao {
  id         String   @id @default(cuid())
  company    Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  companyId  Int
  userId     Int      // dono da sessão (req.user) — escopo por usuário
  modo       String   @default("LEITURA") // LEITURA | MANUAL
  status     String   @default("ABERTA")  // ABERTA | FINALIZADA | CANCELADA
  startedAt  DateTime @default(now())
  finishedAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  paradas    LogisticaLeituraParada[]
  @@index([companyId, userId, status])
}

model LogisticaLeituraParada {
  id                String   @id @default(cuid())
  sessao            LogisticaLeituraSessao @relation(fields: [sessaoId], references: [id], onDelete: Cascade)
  sessaoId          String
  clientKey         String   // idempotência do replay offline
  ordem             Int
  capturadoEm       DateTime
  lat               Float?
  lng               Float?
  accuracy          Float?
  customerProfile   CustomerProfile? @relation(fields: [customerProfileId], references: [id], onDelete: SetNull)
  customerProfileId String?
  localEntregaId    String?  // sem relation obrigatória? NÃO — ver regra abaixo
  itensJson         Json     // [{ productId, qtd, valorUnit }]
  telefoneConfirmado Boolean @default(false)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@unique([sessaoId, clientKey])
  @@index([sessaoId, ordem])
}
```
REGRA (memória 17/07 — FK órfã sem relation deu P2003): toda coluna que referencia outra tabela
tem relation Prisma de verdade. Para `localEntregaId`, criar relation opcional com `LocalEntrega`
(`onDelete: SetNull`) e a back-relation correspondente. Back-relations também em `Company` e
`CustomerProfile`. Rodar `prisma migrate dev --name pr20072026_leitura_rota` (nome com data no
padrão da pasta `backend/prisma/migrations/`) — migration SÓ CREATE TABLE/INDEX, nada destrutivo.

## 2. Service novo `backend/src/logistica/logistica-leitura.service.ts`
Implementar os endpoints do contrato (00-ORQUESTRACAO §Endpoints). Pontos críticos:
- **iniciar**: se existir sessão `ABERTA` de (companyId, userId), RETORNAR ela com paradas
  (idempotente). Se o `modo` pedido divergir da aberta, retornar a aberta mesmo assim (o app decide
  cancelar). Nunca 2 sessões abertas do mesmo usuário — a criação confere dentro de transação.
- **parada**: transação única. Idempotência: se `(sessaoId, clientKey)` já existe, retornar a
  existente SEM duplicar efeitos. `ordem` = max(ordem)+1 dentro da transação. Cliente novo:
  `CustomerProfile` com `companyId`, `name`, `isCliente: true`, telefone no campo que o
  `/nucleo/contas` usa (ESPIAR o service do nucleo — o app hoje cria cliente via
  `POST /nucleo/contas` com `{ nome, tipo:'pf', whatsapp, isCliente:true }`; REUSAR o mesmo service
  se exportável, senão replicar o mínimo com os mesmos campos), `lat/lng/geoFonte` quando vierem
  (`gps_cadastro` no fluxo GPS; `geocode` se veio de geocode; sem coords = sem geoFonte).
  `LocalEntrega` só quando houver lat/lng ou endereço. `atualizarPrecoAcordado: true` → upsert
  `ClienteProduto` do par cliente×produto setando `precoAcordado` = `valorUnit` do item (1º item).
  Validar: itens não-vazio, productId existe na empresa (`usaLogistica` se o campo existir no
  Product — ESPIAR), qtd ≥ 1, valorUnit ≥ 0.
- **resumo**: paradas ordenadas por `ordem`; `hora` = `capturadoEm` em HH:MM fuso America/Sao_Paulo;
  `clienteNome` resolvido; `subtotal` = Σ qtd×valorUnit; `total` = Σ subtotais; `count`.
- **finalizar**: `{ nome?, diaSemana, ordemParadaIds? }` (diaSemana 1..7 obrigatório).
  `ordemParadaIds` (modo manual) reordena antes de salvar: ids listados definem a ordem; ids da
  sessão ausentes da lista vão pro fim mantendo ordem relativa; id que não é da sessão → 400.
  ≥1 parada senão 400
  "Nenhuma parada registrada.". Nome: vazio → label do dia; validar unicidade (mesma regra do
  item 3); criar `LogisticaRotaModelo` `{ nome, diaSemana, paradasJson: [{ customerProfileId,
  localId?, horaRef: 'HH:MM' }] }` na ordem — chaves extras (`horaRef`) são ADITIVAS: conferir que
  `normalizeParadas` em `logistica-rota-modelo.service.ts` PRESERVA ou pelo menos não quebra com
  elas (se ele filtrar chaves, ajustar para preservar `horaRef`). Paradas sem `customerProfileId`
  (cliente deletado no meio) são puladas com aviso no retorno. Marcar sessão FINALIZADA na mesma
  transação. 409 de nome duplicado propaga com `code: 'ROTA_NOME_DUPLICADO'`.
- **cancelar**: status CANCELADA (mantém paradas para auditoria; clientes já criados FICAM —
  são cadastro legítimo).
- Multi-tenant: TODA query filtra `companyId` (padrão do módulo). Autorização: mesmo guard dos
  endpoints `rota-modelos` no controller (`logistica.controller.ts` linhas ~617-644) — driver
  comum PODE usar (sem @Admin).

## 3. Nome único no `logistica-rota-modelo.service.ts`
Em `create` e `update` (quando `nome` mudar): buscar modelo da MESMA empresa com
`nome` igual (case-insensitive, trim; usar `findFirst` + comparação em JS ou `mode: 'insensitive'`)
e id diferente → `ConflictException('Já existe uma rota com esse nome.')` com body contendo
`code: 'ROTA_NOME_DUPLICADO'` (seguir o padrão de code usado em `ENTREGA_EM_OUTRA_ROTA` no módulo).
NÃO adicionar constraint no banco.

## 4. Controller + DTOs
Rotas no `logistica.controller.ts` seguindo o padrão vizinho (rota-modelos): DTOs class-validator
em `backend/src/logistica/dto/` (ESPIAR onde os DTOs do módulo vivem e seguir), whitelist-safe
(lembrar: DTO com whitelist rejeita campo desconhecido — declarar TODOS os campos do contrato).

## 5. Testes (obrigatório, padrão dos vizinhos `*.service.test.ts`)
Novo `logistica-leitura.service.test.ts` com fakes no padrão do módulo:
1. iniciar idempotente (2ª chamada retorna a mesma sessão).
2. parada idempotente por clientKey (replay não duplica cliente nem parada).
3. cliente novo transacional (CustomerProfile + LocalEntrega criados; telefone gravado).
4. atualizarPrecoAcordado faz upsert do ClienteProduto.
5. finalizar preserva ordem + horaRef e marca FINALIZADA; sessão vazia → 400.
6. nome duplicado (case-insensitive) → 409 ROTA_NOME_DUPLICADO (create, update e finalizar).
7. multi-tenant: sessão de outra company → not found.
Rodar também a suite existente do módulo logistica inteira + `npm run typecheck` (ou `npx tsc
--noEmit` conforme scripts do backend). TUDO verde antes de encerrar.

## Entrega
NÃO commitar. Relatar: arquivos tocados, nome da migration, resultado dos testes (números), e
qualquer desvio do contrato (se precisar desviar, PARAR e relatar em vez de improvisar).
