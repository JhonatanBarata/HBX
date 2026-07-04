# M6 — Financeiro do tenant (opt-in) — RESULTADO (05/07, RE-RUN)

Frente financeira. Charge atômico/idempotente; **nada dispara MercadoPago** (paymentMethod
sempre `MANUAL`; a baixa do "pago na hora" é MANUAL/local — sem preferência MP, sem webhook).
Caminho/flag do WhatsApp intocados. Não publicado. Commit no master.

## O "PAGO NA HORA" (para revisão do dono)
Arquivo: `backend/src/logistica/logistica.service.ts` — método privado `lancarCobranca`.
- **`logistica.service.ts:772`** — decide `pagoNaHora`:
  `forma !== 'pendura' && (receiptMethod === 'pix' || receiptMethod === 'dinheiro')`.
  Ou seja: só quita quando o cliente é `aberto`/`na_hora` (não-pendura) **E** o entregador
  marcou um método imediato na folha de chegada. `pendura` é fiado por definição → NUNCA
  quita, mesmo se vier `pix`. `receiptMethod='fiado'` também NÃO quita.
- **`logistica.service.ts:794-796`** — no `financeiroCharge.create`:
  `status: pagoNaHora ? 'approved' : 'pending'`, `lifecycle: pagoNaHora ? 'paid' : 'in_progress'`,
  `paidAt: pagoNaHora ? now : null`. `pendura`/sem método → `pending`/`in_progress` com `dueDate`
  (fiado; vencimento pela regra do cliente `diaFechamento`, senão hoje).
- **`logistica.service.ts:807-808`** — `providerPayload` audita `pagoNaHora` + `receiptMethod`.
- `receiptMethod` é passado do `confirmarEntrega` → `lancarCobranca` (novo 3º arg). O
  `confirmarEntrega` já normalizava `receiptMethod` (M4) e persistia `recebidoNaHora`/`receiptMethod`
  na Entrega; agora o mesmo valor decide o desfecho do charge.

### Idempotência (não paga 2×)
Intacta e reusada do R3: guarda por `cobrancaStatus` já-resolvido (camada 1) + guarda dura por
`entregaId` — `financeiroCharge.findFirst({ entregaId })` antes do create + índice UNIQUE PARCIAL
`FinanceiroCharge_entregaId_key` no banco (P2002 tratado como "já existe"). Confirmar 2× com `pix`
= 1 charge só (teste M6 (d)).

## Endpoints (backend)
`backend/src/logistica/logistica.controller.ts`:
- **`GET /logistica/resumo-dia?date=`** (company-scoped, qualquer usuário autenticado) → `{ date,
  entregues, recebidoHoje, aReceber }`. Read-only. `entregues` = entregas `entregue` com
  `deliveredAt` no dia; `recebidoHoje` = Σ charges da logística com `paidAt` no dia; `aReceber` =
  Σ charges `pending` da logística com `dueDate` no dia. Filtra `sourceModule` `logistica_entrega`/
  `logistica_fechamento` (a assinatura HBX NÃO entra).
- **`PATCH /logistica/clientes/:id/financeiro`** (ADMIN — RolesGuard + @Admin) → grava os 2 eixos:
  `formaPagamento` (aberto|mensal|na_hora|pendura), `metodoPadrao` (pix|dinheiro, p/ na_hora),
  `contabilizar`, `diaFechamento`. PATCH parcial. Reconcilia o `modeloCobranca` legado do N6
  (mensal↔mensal, resto=avulso). company-scoped; cliente de outra empresa → 404. Não dispara nada.

DTO novo: `UpdateFinanceiroClienteDto` em `dto/logistica.dto.ts` (whitelist; validação de conteúdo
no serviço). `fechar-mes` (R2) já existia — a UI só o consome.

## Serviço (backend)
`logistica.service.ts`: `resumoDia()` + `updateFinanceiroCliente()` novos; helpers `normalizeForma`/
`normalizeMetodoPadrao`/`clampDiaFechamento`; interfaces `ResumoDiaResult`/`UpdateFinanceiroClienteInput`/
`FinanceiroClienteDTO`. **Sem migração nova** — todas as colunas já existem no schema (M4/N6/R2).

## UI (frontend — hbx-theme normal, zero hex/inline)
- **Ficha do cliente** (`frontend/src/app/(app)/contatos/page.client.tsx`, drawer "Produtos do
  cliente", ADMIN): `FinanceiroEditor` (forma + método padrão p/ na_hora + toggle contabilizar +
  dia de fechamento p/ mensal — salva a cada mudança via PATCH) + `ExtratoPanel` (lê
  `GET /clientes/:id/extrato`, mostra pago/a receber, total pendente).
  Carga da forma = PATCH com body vazio (no-op idempotente; o backend M6 não expõe GET dedicado da
  forma — o echo do PATCH é a fonte).
- **Tela de Logística** (`frontend/src/app/(app)/logistica/page.client.tsx`, ADMIN):
  `ResumoDiaCard` (entregues / recebido hoje / a receber) + botão "Fechar mês" (chama
  `POST /logistica/fechar-mes` com `window.confirm`). Resumo é aditivo: se falhar, não polui a tela.
- CSS novo em `frontend/src/app/hbx-theme/screens.css` (`.log-resumo*`, `.cli-fin*`, `.cli-ext*`) —
  só tokens/`color-mix` (zero hex/rgba). Nenhum estilo visual inline em TSX.

## Checks
- `cd backend && npm run build` → **VERDE** (tsc estrito, Prisma gerado).
- `npx prisma validate` → **VERDE** (schema válido; M6 não precisou de migração).
- `node --test dist/logistica/logistica.service.test.js` → **20/20 VERDE** (5 testes M6 novos:
  (a) aberto+pix→approved/paid, (b) pendura→pending, (c) resumo-dia soma, (d) confirmar 2× = 1 charge,
  (e) editor grava os 2 eixos + validações).
- `cd frontend && npx tsc --noEmit` → **VERDE**.
- `cd frontend && npm run build` → **VERDE**.
- `check-pele` NOS MEUS ARQUIVOS → **0 violação** (grep confirmou: 0 hex/rgba/arbitrary/inline-visual
  nas minhas adições). O `node scripts/check-pele.mjs` global falha, mas **só em arquivos que NÃO
  toquei** (WIP do dono: `whatsapp.css`, `bot-builder.css`, `screens.css:1564/1579` pré-existentes).

## Decisões
- `cobrancaStatus` da Entrega segue `'lancada'` mesmo no pago-na-hora (o estado pago/pending vive no
  charge; manter `lancada` preserva a idempotência de `isCobrancaResolvida`). O marcador do ato
  (`recebidoNaHora`/`receiptMethod`) já é persistido na Entrega pelo `confirmarEntrega` (M4).
- `resumo-dia` é GET livre (qualquer usuário do tenant vê o card); a EDIÇÃO da forma e o fechar-mês
  são ADMIN. Consistente com o padrão do controller (config GET livre, PATCH admin).
- Nada de MP: o "pago" é uma baixa MANUAL/local; não há chamada, preferência ou webhook MP no caminho.
