# MULTILOCAL 10/07 — 1 cliente com N endereços + N telefones, cobrança única

Pedido do dono (10/07, sessão card-de-clientes): (1) toggle pra LIGAR o financeiro do /entrega;
(2) merge NUNCA pode perder telefone; (3) 1 cliente pode receber em 2 endereços e ser **cobrado 1
vez só**; (4) adicionar outro telefone e outro endereço do mesmo cliente na ficha.

Estado já feito nesta sessão (fora deste plano): flag `moduloFinanceiroAtivo` LIGADA no banco da
empresa 5 (teste). Falta o toggle na UI (W-E).

## Princípio-mestre (o que dá o "cobra 1 vez só" de graça)
A **cobrança é da CONTA** (`FinanceiroCharge.customerProfileId`), nunca do endereço. `saldoAbertoPorClientes`
agrupa por `customerProfileId`. Então N locais de entrega convergem em 1 saldo SEM tocar em nada de
cobrança. **NINGUÉM altera a lógica de FinanceiroCharge/saldo.** Multi-local é só ONDE se entrega; a
conta e o dinheiro continuam um só.

Telefones já são modelados: `Contato` ("uma Conta tem N Contatos", schema:1006), cada um com
whatsapp/phone; o gerar-dia já resolve o Contato principal pro aviso (`resolvePrincipalContatoId`,
logistica-recorrencia.service.ts:347). Multi-telefone = expor `Contato` na ficha + merge preservar.
Endereços NÃO têm modelo → é o único schema novo: `LocalEntrega`.

## SCHEMA (W-A implementa; todos os outros codam contra isto)

Novo model (aditivo, isolado):
```prisma
model LocalEntrega {
  id                String   @id @default(cuid())
  company           Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  companyId         Int
  customerProfile   CustomerProfile @relation(fields: [customerProfileId], references: [id], onDelete: Cascade)
  customerProfileId String
  apelido           String?  // "Casa" | "Loja" | "Depósito" — rótulo curto, opcional
  endereco          String?
  numero            String?
  bairro            String?
  cidade            String?
  uf                String?
  cep               String?
  lat               Float?
  lng               Float?
  geoFonte          String?  // geocode | gps_cadastro | gps_entrega (mesma convenção do perfil)
  isPrincipal       Boolean  @default(false)
  ativo             Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  entregas          Entrega[]
  clienteProdutos   ClienteProduto[]

  @@index([companyId, customerProfileId])
  @@index([companyId, customerProfileId, isPrincipal])
}
```
Aditivos nos models existentes:
- `CustomerProfile`: `locais LocalEntrega[]` (back-relation).
- `Entrega`: `local LocalEntrega? @relation(fields: [localId], references: [id], onDelete: SetNull)` + `localId String?`.
- `ClienteProduto`: `local LocalEntrega? @relation(fields: [localId], references: [id], onDelete: SetNull)` + `localId String?`.

Migration `migration.sql` à mão (o dono aplica no deploy; padrão do repo). CREATE TABLE + 2 colunas +
FKs + índices, e **backfill idempotente em SQL puro** (Postgres 13+, `gen_random_uuid()::text` p/ id —
misturar com cuid é ok, ambos são texto único):
```sql
-- 1 local principal por cliente que já tem endereço/geo
INSERT INTO "LocalEntrega" (id,"companyId","customerProfileId",apelido,endereco,numero,bairro,cidade,uf,cep,lat,lng,"geoFonte","isPrincipal",ativo,"createdAt","updatedAt")
SELECT gen_random_uuid()::text,"companyId",id,NULL,endereco,numero,bairro,cidade,uf,cep,lat,lng,"geoFonte",true,true,now(),now()
FROM "CustomerProfile" WHERE "isCliente"=true AND (endereco IS NOT NULL OR lat IS NOT NULL);
-- vínculos e entregas apontam pro local principal do próprio cliente
UPDATE "ClienteProduto" cp SET "localId"=le.id FROM "LocalEntrega" le
  WHERE le."customerProfileId"=cp."customerProfileId" AND le."isPrincipal"=true AND cp."localId" IS NULL;
UPDATE "Entrega" e SET "localId"=le.id FROM "LocalEntrega" le
  WHERE le."customerProfileId"=e."customerProfileId" AND le."isPrincipal"=true AND e."localId" IS NULL;
```
Depois do schema: **rodar `cd backend && npx prisma generate`** (senão W-B/W-C não compilam). W-A NÃO
roda migrate deploy (o dono aplica no VPS); só valida `npx prisma validate` + generate.

## CONTRATOS DE API (W-B/W-C implementam; W-D consome)

Ficha (nucleo):
- **GET `/nucleo/clientes/:id`** passa a incluir `locais: LocalEntregaDTO[]` (principal primeiro) e
  `telefones: {id, nome, whatsapp, phone, isPrincipal}[]` (dos `Contato`).
- **POST `/nucleo/clientes/:id/locais`** `{apelido?, endereco?, numero?, bairro?, cidade?, uf?, cep?, lat?, lng?, isPrincipal?}` → cria local; se `isPrincipal` desmarca os outros; 1º local do cliente nasce principal.
- **PATCH `/nucleo/locais/:id`** mesmos campos (parcial); trocar principal move a flag atômico.
- **DELETE `/nucleo/locais/:id`** soft (ativo=false); não deixar excluir o único local ativo se houver `ClienteProduto` ativo apontando (400 curto); se excluir o principal, promove o próximo ativo.
- **POST `/nucleo/clientes/:id/telefones`** `{nome?, whatsapp?, phone?, isPrincipal?}` → cria Contato.
- **PATCH `/nucleo/telefones/:id`** parcial; **DELETE `/nucleo/telefones/:id`** (não deixar zerar o principal se for o único). Todos company-scoped via JWT; SEM @Admin (o entregador cadastra cliente).

Logística:
- **POST `/logistica/entregas`** e o create manual aceitam `localId?` (opcional; valida que o local é do mesmo cliente+empresa).
- **GET `/logistica/rota`** cada item ganha `localApelido: string|null` e passa a usar o endereço/geo do
  LOCAL da entrega quando `localId` presente (fallback = perfil). `cliente.id/nome/saldoAberto` SEGUEM do
  perfil (saldo por CONTA — inalterado).

## MUDANÇAS DE COMPORTAMENTO (as 2 arriscadas — Opus revisa o diff)
1. **gerar-dia agrupa por (cliente, LOCAL), não só por cliente** (logistica-recorrencia.service.ts).
   Idempotência vira **[companyId, customerProfileId, localId, dia]** (hoje é só cliente+dia → pularia o
   2º local). Cliente com 1 local (todos após backfill) = comportamento idêntico ao de hoje. A Entrega
   criada recebe `localId` do vínculo. Preservar a agregação multi-item TASK 5 DENTRO de cada local.
2. **merge NUNCA perde telefone** (nucleo-cadastro.service.ts mergeContas): hoje, quando os 2 têm phone,
   o do perdedor é descartado (só sobra no snapshot). Fix: antes de apagar o perdedor, se o phone dele
   não existir no vencedor (nem como `CustomerProfile.phone`, nem como `Contato`), criar um `Contato`
   não-principal no vencedor carregando esse telefone. + mover `LocalEntrega` do perdedor pro vencedor
   (somar na lista de `updateMany`). Nada de dado sumindo.

## Card de pendências (nucleo — ajuste)
`endereco`/`numero`/`gps` passam a checar o **local principal** do cliente (após backfill = o antigo
endereço do perfil). Cliente sem NENHUM local ativo → pendências `endereco`+`numero`+`gps` acesas.
`dia`/`whatsapp` inalterados. Regras aditivas — não quebrar o contrato do card (W6/`c8ba0f0f`).

## Regras duras (todos os workers)
- PT-BR mínimo em tela; zero texto inventado (label + campo). Visual só em token/classe `ent-*`/`hbx-theme`;
  zero hex/inline (check-pele reprova).
- NUNCA criar branch; editar DIRETO na working tree (master). **NÃO commitar** — o orquestrador (Opus) commita.
- **A árvore tem trabalho NÃO-COMMITADO do dono** (tela `entrega/financeiro/`, módulos S8, de-HBX, voz).
  Editar SEMPRE aditivo; LER o arquivo antes; **JAMAIS `git checkout`/reset/stash** nem reescrever arquivo
  inteiro. Arquivos sujos que encostam nesta frente: `entrega/clientes/page.client.tsx`,
  `entrega/clientes-api.ts`, `entrega/ajustes/page.client.tsx`. Preservar as linhas do dono.
- NÃO tocar em `Webwhats/`, `backend/src/modules/*`, `backend/src/financeiro/*`, `entrega/financeiro/*`,
  `EntregaScaffold.tsx`, `mobile-shell.tsx` (dono live neles).
- `*/` em comentário CSS derruba o app; `.next` cacheia "Can't resolve" de arquivo novo (apagar `.next`).

## Divisão de workers (pipeline: A bloqueia; B/C/D/E paralelos, arquivos DISJUNTOS)
- **W-A** schema+migration+backfill+`prisma generate` (`backend/prisma/*`). SEQUENCIAL, primeiro.
- **W-B** logística: gerar-dia por local + rota lê geo do local + create aceita localId + confirmar
  realimenta geo do local (`backend/src/logistica/*`).
- **W-C** núcleo: CRUD locais + CRUD telefones (Contato) + merge preserva telefone + move locais +
  ficha GET inclui locais/telefones + card pendências pelo principal (`backend/src/nucleo/*`).
- **W-D** front ficha: multi-telefone + multi-endereço + "entregar em [local]" por produto
  (`entrega/clientes/page.client.tsx`, `entrega/clientes-api.ts`) — SUJO, aditivo.
- **W-E** front: toggle "Financeiro do cliente" nos Ajustes (admin) + apelido do local no card da rota
  (`entrega/ajustes/page.client.tsx`, `entrega/page.client.tsx`) — SUJO, aditivo.

Checks por worker: `cd backend && npx tsc --noEmit` (B/C, ignorar erro fora do seu dir) / `cd frontend &&
npx tsc --noEmit` + check-pele (D/E). Retornar JSON `{status, filesTouched[], checks, pendencias[], notas[]}`.
