# R4 — Falha visível (RESULTADO, 05/07)

Sprint R4 do `PLANO-ROBUSTEZ.md`. BACKEND-ONLY. Commit local no master, NÃO publicado.
Objetivo: tornar a falha de efeito do confirmar entrega VISÍVEL (persistida, não só log).

## a) Desfecho persistido (não só logado)
Em `LogisticaService.confirmarEntrega` (`backend/src/logistica/logistica.service.ts`), depois de
rodar os efeitos (só com `HBX_LOGISTICA_ENABLED` ON), o desfecho vai pra `Entrega`:

- `dispararWhatsappEntregue` deixou de devolver `boolean` → devolve `WhatsappResult { status, motivo }`:
  - `'enviado'` (motivo `null`) — enfileirado no caminho blindado.
  - `'pulado'` + `'aviso_off'` — aviso global/cliente OFF.
  - `'pulado'` + `'sem_telefone'` — cliente/contato sem número.
  - `'falhou'` + `'erro'` — exceção do caminho blindado (tratada no catch do caller).
- `lancarCobranca` deixou de devolver `boolean` → devolve `CobrancaResult { lancada, outcome }`,
  com `outcome ∈ {lancada, aguardando_fechamento, nao_contabilizado, isenta, falhou}`.
- `persistirDesfecho(...)` grava (best-effort) `Entrega.whatsappStatus`, `Entrega.whatsappMotivo`
  e `Entrega.cobrancaOutcome`. Falha ao gravar o desfecho NÃO reverte o `status='entregue'`
  (o núcleo do confirmar já caiu antes, em transação — R3).

**Caminho blindado intacto:** o disparo continua SÓ via `queueOutboundForCompany`. A flag
`HBX_LOGISTICA_ENABLED` (default OFF) não foi tocada — OFF = zero efeito, zero persistência de desfecho.

## b) Reenviar aviso — endpoint ADMIN, TETO DURO de 1
- `POST /logistica/entregas/:id/reenviar-aviso` (controller: `JwtAuthGuard + RolesGuard + @Admin`).
- `LogisticaService.reenviarAviso`: só entrega já `'entregue'`; reenvia SÓ pelo caminho blindado
  (reusa `dispararWhatsappEntregue` → `queueOutboundForCompany`). **UMA mensagem, ZERO loop/retry.**
- **Teto = coluna aditiva `Entrega.avisoReenviado Boolean @default(false)`.** O claim é ATÔMICO:
  `updateMany({ where: { id, companyId, avisoReenviado: false }, data: { avisoReenviado: true } })`
  ANTES de disparar. Segundo clique (ou corrida) → `count=0` → `400` "já foi reenviado", sem chamar
  `queueOutbound` de novo. Atualiza `whatsappStatus`/`whatsappMotivo` com o desfecho do reenvio.

## c) MasterEvent no cockpit master (backend)
Quando um efeito FALHA (`whatsappStatus='falhou'` OU `cobrancaOutcome='falhou'`), `emitirFalhaEfeito`
emite UM `MasterEvent` pela trilha existente (`emitMasterEvent`, `backend/src/common/master-event.ts`):
- `type='logistica.efeito_falhou'`, `severity='attention'`, `companyId`.
- `dedupKey='logistica.efeito_falhou:<entregaId>'` (1 fato de falha por entrega, não metralha a trilha).
- `payload` com `entregaId`, `state` (resumo wa/cob), flags de qual efeito falhou + motivo.
- Best-effort por contrato (nunca lança). **Cockpit-UI = frontend → ADIADO** (dono no front); só o evento foi emitido.

## SQL (migração à mão — NÃO aplicada; padrão N1/R2/R3, o dono aplica no deploy)
`backend/prisma/migrations/20260705080000_entrega_aviso_reenvio/migration.sql`:
```sql
ALTER TABLE "Entrega"
  ADD COLUMN IF NOT EXISTS "whatsappMotivo" TEXT,
  ADD COLUMN IF NOT EXISTS "avisoReenviado" BOOLEAN NOT NULL DEFAULT false;
```
`whatsappStatus`/`cobrancaOutcome` JÁ existiam (M2, migration `20260705020000_logistica_entrega`) —
só passam a ser preenchidos agora. ADITIVO, `IF NOT EXISTS`, ZERO drop.

## Checks
- `npm run build` (tsc) → VERDE.
- `npx prisma validate` → VERDE ("schema is valid").
- `npx prisma generate` → VERDE (client com as colunas novas).
- `NODE_ENV=test node --test dist/logistica/logistica.service.test.js` → **14/14 VERDE**
  (10 pré-existentes + 4 R4 obrigatórios + 1 bônus): (a) aviso OFF → `whatsappStatus='pulado'/'aviso_off'`
  persistido sem enviar; (b) envio OK → `whatsappStatus='enviado'` + `cobrancaOutcome='lancada'`;
  (c) reenviar 1× envia 1×, 2× barrado pelo teto (não re-chama `queueOutbound`) + só entrega concluída;
  (d) falha → 1 `MasterEvent logistica.efeito_falhou`.
- Suites irmãs (config/rota/recorrencia/recovery/master-event) → **34/34 VERDE** (nada quebrado).

## Decisões p/ o dono
- **Cockpit-UI da contagem de falhas fica PENDENTE** (é frontend; dono está reformando o front). O
  backend já EMITE o `MasterEvent` — a tela do cockpit só precisa ler `type='logistica.efeito_falhou'`.
- Vocabulário do `whatsappStatus` persistido = PT-BR (`enviado|falhou|pulado`), conforme o plano R4
  (o comment antigo do schema dizia `queued|sent|failed`; ajustado o comentário, coluna é `String?` livre).
- Migração NÃO aplicada (Postgres do dev desligado / padrão N1) — aplicar no deploy junto com as demais.
- Arquivos backend meus: `schema.prisma` (só a região Entrega), migration nova,
  `logistica.service.ts`, `logistica.controller.ts`, `logistica.service.test.ts`. Nada em `frontend/**`.
