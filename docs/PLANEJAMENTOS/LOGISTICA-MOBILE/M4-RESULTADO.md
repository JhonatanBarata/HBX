# M4 — O app do entregador (o sprint do VISUAL) · RESULTADO

Data: 05/07 (base master `c18a0e10`, trabalhado direto no master, **NÃO publicado**).
Escopo: as 3 telas reais em `/entrega` (shell do M1) com dado REAL dos endpoints
N6/M3 + **pagamento condicional** (regra do dono 04/07). Só aditivo; N6/M2/M3 e o
dashboard intactos.

## As 3 telas (Design System Entrega, componentes `ent-*`, zero texto explicativo)

### "Hoje" — `frontend/src/app/entrega/page.client.tsx` (`ViewHoje`)
- `GET /logistica/rota` → progresso do dia (X/N + término previsto do `etaAt`), lista
  do dia (`ent-list`/`ent-row`): número da parada, nome do cliente, resumo dos itens
  previstos (soma dos `EntregaItem`, fallback p/ produto/qtd legado), status (ETA / ✓ / —).
- CTA "Iniciar rota" (`ent-actionbar`) → captura o GPS de origem (`navigator.geolocation`,
  1 leitura) e chama `POST /logistica/rota/iniciar`; sem GPS o backend começa pela 1ª
  parada com coord. Ativa **Screen Wake Lock** ao iniciar. Recarrega com `rotaOrdem`/`etaAt`.
- Estados honestos: `ent-spinner` (loading), `ent-empty` (sem entregas / erro com "Tentar de novo").

### "Rota" — `page.client.tsx` (`ViewRota`)
- Card cheio da parada atual (`ent-stop-card`): badge "Parada N", nome, endereço, número
  grande de itens, "chegada HH:MM" (do `etaAt`).
- **Swipe ←/→** (carrossel `ent-track`, `translateX` por índice + arraste em px, `pointer*`
  events; threshold 60px; `is-dragging` desliga a transição durante o arraste). **Dots**
  (`ent-dot`) clicáveis mostram posição; **progresso X/N + término** ao vivo no topo.
- **Navegar**: deep-link `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`
  (por coordenada; fallback por endereço quando sem coord) — `<a target="_blank">` estilizado
  como `ent-btn--secondary`.
- **Geofence foreground** (`useGeofence`): `watchPosition` + Haversine em metros < `raioChegadaM`
  (default 60m) → `navigator.vibrate([24,40,24])` + abre a folha de chegada. Rearma por
  parada (o id vira a chave; swiped p/ outra parada rearma). LGPD: posição contínua NÃO
  sobe pro servidor — só o ponto do confirmar vai (M3/N6). Botão "Cheguei" abre a folha manual.

### Folha de chegada — `frontend/src/app/entrega/ArrivalSheet.tsx` (`ent-sheet`)
- **Stepper por item** (`ent-stepper`), pré-preenchido com `qtdPrevista` de cada `EntregaItem`
  (fallback p/ o produto/qtd legado). "Entregue" em 1 toque (`POST /confirmar` com qtd + GPS).
- "Não entregue" → chips de motivo (`ausente | recusou | reagendar`) → "Confirmar" chama
  `POST /entregas/:id/cancelar` com o motivo (só habilita com motivo escolhido).
- `vibrate` no +/−, no Entregue e na chegada (Lei nº4).

## PAGAMENTO CONDICIONAL — os 3 casos (regra do dono, NÃO misturar)

A UI só **LÊ** `cliente.formaPagamento` + `rota.moduloFinanceiroAtivo`. NÃO cria charge (isso é M6).
Regra em `ArrivalSheet.mostrarChips(moduloFinanceiroAtivo, formaPagamento)`:

| Caso | Condição | Folha de chegada |
|---|---|---|
| **1** | `moduloFinanceiroAtivo` OFF | **Nenhum** chip de pagamento, nunca (só qtd + Entregue). |
| **2** | ON **e** `formaPagamento === 'aberto'` | **Mostra** chips (Dinheiro \| Pix \| Pendura); manda `receiptMethod` no confirmar. |
| **3** | ON **e** `formaPagamento !== 'aberto'` (costumeiro) | **Chips SOMEM** (tela mais simples): só qtd + Entregue. Cobrança segue a regra dele no backend (M6). |

Todos os 3 **provados no Chrome** (localhost:3001, mock de fetch só no browser — DB local vazia,
migration não aplicada): Caso 2 = "Padaria Pão Quente" (aberto) mostrou os chips; Caso 3 = "Dona
Maria (mensal)" NÃO mostrou; Caso 1 é o default do schema (`moduloFinanceiroAtivo=false`).

## Backend (aditivo)
- **Schema** `CustomerProfile` ganhou 2 eixos: `formaPagamento String @default("aberto")`,
  `metodoPadrao String?`, `contabilizar Boolean @default(true)`.
- **`GET /logistica/rota`** agora expõe, por entrega: `cliente.formaPagamento`, `cliente.metodoPadrao`,
  `itens[]` (multi-produto, com fallback p/ produto/qtd legado) e, no topo, `moduloFinanceiroAtivo`
  (lido do `LogisticaConfig`, best-effort com default seguro `false`).
- **`POST /entregas/:id/confirmar`** (DTO + service): aceita `receiptMethod` (pix|dinheiro|fiado,
  normalizado; só chega quando 'aberto'+módulo ON) e `itens[]` (qtd do stepper → grava `qtdEntregue`
  do `EntregaItem`, isolado por `entregaId`, best-effort). `recebidoNaHora=true` quando pago no ato.
  A CRIAÇÃO de charge continua sendo M6 — aqui só registra o desfecho. FREIO N6 intacto (flag OFF).

### SQL da migração (`20260705040000_cliente_forma_pagamento`, à mão, NÃO aplicada em banco vivo)
```sql
ALTER TABLE "CustomerProfile"
  ADD COLUMN IF NOT EXISTS "formaPagamento" TEXT NOT NULL DEFAULT 'aberto',
  ADD COLUMN IF NOT EXISTS "metodoPadrao" TEXT,
  ADD COLUMN IF NOT EXISTS "contabilizar" BOOLEAN NOT NULL DEFAULT true;
```
Idempotente (`IF NOT EXISTS`), defaults seguros, ZERO drop.

## Arquivos
- Backend: `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260705040000_cliente_forma_pagamento/migration.sql`,
  `backend/src/logistica/logistica.service.ts`, `backend/src/logistica/logistica.controller.ts`,
  `backend/src/logistica/dto/logistica.dto.ts`.
- Frontend: `frontend/src/app/entrega/page.client.tsx` (reescrito — vitrine → app real),
  `frontend/src/app/entrega/ArrivalSheet.tsx` (novo), `frontend/src/app/entrega/entrega-api.ts` (novo),
  `frontend/src/app/entrega/entrega-hooks.ts` (novo), `frontend/src/app/hbx-theme/entrega.css` (+classes M4).

## Checks (todos verdes)
- Backend: `npx prisma validate` ✅ · `npx prisma generate` ✅ · `npm run build` ✅ ·
  logistica tests `18/18` ✅ (freio N6 flag OFF/ON intacto).
- Frontend: `npx tsc --noEmit` ✅ · `npm run build` ✅ (rota `/entrega` no output) ·
  `check-pele` **0 violação nos arquivos do M4** (as violações restantes são pré-existentes
  em `whatsapp.css`/`screens.css`/`bot-builder.css`, não tocados por mim; `entrega.css` é isento).
- QA Chrome (localhost:3001): fluxo Hoje→Rota(swipe)→Chegada→Entregue completo, avançou de parada,
  0 erro no console. Screenshots capturados na sessão. GPS foi mockado (permissão negada no desktop);
  o geofence real precisa de dispositivo com GPS — QA de campo é M9.

## Decisões p/ o dono
- **DB local vazia** (0 entregas / 0 clientes; 14 empresas) e a **migration não aplicada** →
  o fluxo real com dado de verdade só roda depois de (a) aplicar a migration e (b) semear
  entregas/clientes. A prova visual foi feita com mock de fetch SÓ no browser (não tocou DB).
- **Master sem companyId**: logado como platform-master (`jhonatan`) sem entrar em contexto de
  empresa, `GET /logistica/rota` responde "Empresa não identificada" (regra do controller). A UI
  trata isso como erro honesto. Pra QA real: entrar no contexto de uma empresa (impersonar) OU
  logar como usuário de tenant.
- Botão da parada é **"Cheguei"** (abre a folha manualmente) além do geofence automático — no
  desktop/sem GPS o entregador não fica preso esperando o geofence.
- `contabilizar` já existe no schema/migração, mas **quem cria charge é o M6** — M4 não usa esse
  eixo (só `formaPagamento` pros chips). Deixei pronto pro M6 não precisar de outra migração.
