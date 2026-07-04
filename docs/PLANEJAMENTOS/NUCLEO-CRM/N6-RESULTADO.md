# N6 — RESULTADO (módulo Logística: app de entrega + rota do dia + confirmar c/ GPS)

> Sprint N6 do plano NÚCLEO-CRM. Executado 05/07 na branch `claude/nucleo-crm`.
> **NÃO publicado.** Frente MAIS sensível (WhatsApp + cobrança) — os DOIS efeitos
> ficam atrás da flag `HBX_LOGISTICA_ENABLED` (default OFF) e INERTES enquanto OFF.
>
> ⚠️ Enquanto eu trabalhava, o DONO commitou o trabalho paralelo dele em
> `e665a20a "feat(vendas): Buscar empresas — radar enfeite + painelzão…"`
> (vendas/leads/filtro-avancado + doc VENDAS-REFAB). Eu NÃO toquei nesses arquivos;
> hoje eles estão commitados por ele. Meu commit é 100% disjunto.

## Arquivos tocados (14, todos meus — `git add` por caminho, nunca `-A`)

### Backend
| Arquivo | Mudança |
|---|---|
| `backend/prisma/schema.prisma` | **+3 colunas ADITIVAS** em `CustomerProfile` (CONTRATO por cliente): `modeloCobranca String?`, `diaFechamento Int?`, `precoPadrao Float?`. **Novo model `Entrega`** (ciclo agendada→em_rota→entregue→cancelada). Back-relations `entregas Entrega[]` em `CustomerProfile`, `Contato`, `Product`, `Company`. |
| `backend/prisma/migrations/20260705020000_logistica_entrega/migration.sql` | **NOVO.** Migração aditiva à mão (`IF NOT EXISTS`, sem DROP). NÃO aplicada em banco. |
| `backend/src/logistica/logistica.service.ts` | **NOVO.** `LogisticaService`: `listRota`, `createEntrega`, `confirmarEntrega`, `cancelarEntrega` + os 2 efeitos privados (WhatsApp/cobrança) atrás da flag. |
| `backend/src/logistica/logistica.controller.ts` | **NOVO.** `@Controller('logistica')` + `JwtAuthGuard`, company-scoped (companyId do JWT). |
| `backend/src/logistica/logistica.module.ts` | **NOVO.** Importa `MessagingModule` (exporta `ConversationsService`). |
| `backend/src/logistica/dto/logistica.dto.ts` | **NOVO.** `CreateEntregaDto`, `ConfirmarEntregaDto` (lat/lng), `CancelarEntregaDto`. |
| `backend/src/logistica/logistica.service.test.ts` | **NOVO.** Prova flag OFF = zero WhatsApp + zero cobrança; flag ON = 1 WhatsApp + 1 cobrança. |
| `backend/src/app.module.ts` | Registra `LogisticaModule`. |
| `backend/src/bootstrap/structural-defaults.json` | `SystemModule 'logistica'` (`defaultEnabled:true`, `companyAssignable:true`, `serviceUrl:/logistica`) — kill-switch do master. |

### Frontend
| Arquivo | Mudança |
|---|---|
| `frontend/src/app/(app)/logistica/page.tsx` | **NOVO.** Server page (metadata) → `LogisticaClient`. |
| `frontend/src/app/(app)/logistica/page.client.tsx` | **NOVO.** "Rota de hoje" mobile-first: lista de entregas + sheet de detalhe (endereço, **Navegar** deep-link, **Confirmar entrega** com `navigator.geolocation`). |
| `frontend/src/components/hbx/shell.tsx` | `ICONS.logistica` (caminhão — chave EXISTE, senão derruba a Sidebar), `NAV_LINKS` (+Logística após Produtos), `NAV_ENTITLEMENT.logistica=null`, `NAV_MODULE_KEY.logistica=null`. |
| `frontend/src/components/hbx/mobile-tab-bar.tsx` | Aba **"Rota"** aditiva — só aparece quando `isModuleVisible('logistica')` (não substitui as 4 abas fixas). |
| `frontend/src/app/hbx-theme/screens.css` | Bloco `.log-*` (badge de status, sheet de detalhe, botões Navegar/Confirmar) — reusa `.emp-*`/`.hbx-drawer-bottom`. Zero hex/inline. |

## Model `Entrega` (novo)
`id` cuid · `companyId Int` (Company, Cascade) · `customerProfileId String` (a Conta/cliente, Cascade) ·
`contatoId String?` (quem recebe, SetNull) · `productId Int?` (SetNull) · `quantidade Int @default(1)` ·
`valor Float @default(0)` · `status String @default("agendada")` (agendada|em_rota|entregue|cancelada) ·
`scheduledAt/startedAt/deliveredAt DateTime?` · `deliveredLat/deliveredLng Float?` ·
`cobrancaStatus String @default("pendente")` (pendente|lancada|isenta|falhou) · `notes String?` · timestamps.
Índices: `[companyId, status, scheduledAt]`, `[companyId, customerProfileId]`.

## ONDE está o GATE da flag (o que o dono deve revisar de perto)
Flag: `HBX_LOGISTICA_ENABLED` (default OFF). Getter `effectsEnabled` em
`logistica.service.ts` (~linha 46).

- **`confirmarEntrega`** (`logistica.service.ts` ~linha 190): SEMPRE grava status/GPS
  (Passo 1, seguro). Os efeitos externos só rodam dentro de
  `if (this.effectsEnabled && !jaEntregue) { … }` (~linha 216). **Com a flag OFF,
  nada externo dispara.** `!jaEntregue` evita reconfirmação disparar 2×.
- **WhatsApp** (efeito 1): `dispararWhatsappEntregue` (~linha 246). Disparo SÓ via
  `this.conversations.queueOutboundForCompany(...)` (~linha 288) — o MESMO caminho
  blindado da cadência (disjuntor, 1-número=1-conexão, outbox+retry, gate de conexão
  viva). **UMA mensagem, on-success, acabou.** ZERO API-crua, ZERO socket novo, ZERO
  reconexão/retry/loop próprio. Sem telefone = no-op silencioso.
- **Cobrança** (efeito 2): `lancarCobranca` (~linha 305). Lê `modeloCobranca` do
  cliente e cria um `FinanceiroCharge` (MESMO model do sistema, não é caminho
  paralelo) com `paymentMethod='MANUAL'`, `status='pending'`, `lifecycle='in_progress'`
  — **nada dispara MercadoPago**. `mensal`/`avulso` = lança a entrega; `assinatura`
  ou sem modelo = marca `isenta` (não gera avulsa); valor 0 = `isenta`. Idempotente
  por `cobrancaStatus` (não relança).

## SQL da migração
```sql
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "modeloCobranca" TEXT;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "diaFechamento"  INTEGER;
ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "precoPadrao"    DOUBLE PRECISION;
CREATE TABLE IF NOT EXISTS "Entrega" ( … 16 colunas … );  -- + 2 índices + 4 FKs
```
100% aditivo/idempotente (`IF NOT EXISTS`), sem DROP. FKs: company+conta = CASCADE;
contato+product = SET NULL (a entrega sobrevive se apagarem o contato/produto).
**NÃO aplicada em banco vivo por este worker** (Postgres não conferido).

## Endpoints (company-scoped, companyId sempre do JWT)
- `GET  /logistica/rota?date=YYYY-MM-DD` → `{ date, total, effectsEnabled, items[] }`
  (entregas do dia; sem `date` = hoje). Também inclui entregas sem data ainda abertas.
- `POST /logistica/entregas` → `{ id }` (agenda; valor = explícito > preço do produto
  > `precoPadrao` do cliente > 0).
- `POST /logistica/entregas/:id/confirmar` `{lat?,lng?}` → `{ status:'entregue', effectsEnabled, whatsappSent, cobrancaLancada }`.
- `POST /logistica/entregas/:id/cancelar` `{motivo?}` → `{ id }` (bloqueia cancelar entregue).

## Frente Logística — mobile (o app do entregador)
- **Rota de hoje:** lista de paradas (cliente · endereço · produto · badge de status).
- **Detalhe (sheet):** endereço + **Navegar** (`<a href="https://www.google.com/maps/dir/?api=1&destination=LAT,LNG">`
  por coordenada, ou por endereço textual se sem lat/lng — deep-link NATIVO, custo R$0)
  + **Confirmar entrega** → `navigator.geolocation.getCurrentPosition` posta lat/lng no
  `/confirmar` (se o usuário negar o GPS, confirma sem coordenada — backend aceita).
  Feedback "Entrega confirmada!".

## Checks (resultado)
- **Backend `npx prisma validate`:** ✅ valid.
- **Backend `npx prisma generate`:** ✅ client v5.22.0.
- **Backend `npm run build` (tsc estrito):** ✅ VERDE, 0 erro.
- **Backend teste `dist/logistica/logistica.service.test.js`:** ✅ **2/2 pass**
  (flag OFF NÃO chama `queueOutboundForCompany` nem cria charge; flag ON chama 1× + lança).
- **Frontend `tsc --noEmit`:** ✅ VERDE, 0 erro.
- **Frontend `run-next-build`:** ✅ "Compiled successfully"; rota `/logistica` no manifesto (static ○).
- **`check-pele.mjs`:** meus arquivos = **0 violações** (grep confirma: nenhuma linha
  `log-*`/`/logistica/` flagrada). ⚠️ REPROVA só por PRÉ-EXISTENTES não-minhas
  (`screens.css:1555/1572`, `box-shadow rgba` — as MESMAS de N3/N4/N5). N6 não adiciona nova.

## Decisões pro dono revisar (frente financeira — TUDO que toca $/WhatsApp)
1. **DINHEIRO — cobrança:** `lancarCobranca` cria `FinanceiroCharge` com
   `paymentMethod='MANUAL'`, `status='pending'`, `lifecycle='in_progress'` — **não
   chama MercadoPago, não cobra ninguém sozinho**; é um lançamento de conta a
   receber. `mensal` e `avulso` lançam por-entrega. **NÃO implementei o "fechar o
   mês" no `diaFechamento`** (mensal hoje lança 1 charge por entrega; o agrupamento
   por competência/`diaFechamento` fica pra uma sprint de faturamento). Confirma esse
   recorte ou quer que mensal ACUMULE e feche 1 fatura no dia?
2. **DINHEIRO — modelo:** `modeloCobranca` vive no cliente (`CustomerProfile`): `mensal`
   | `avulso` | `assinatura` | null. `assinatura`/null = entrega marcada `isenta` (não
   gera avulsa). Confirma os 3 rótulos + o comportamento "sem modelo = isenta"?
3. **WHATSAPP:** disparo SÓ via `queueOutboundForCompany` (caminho blindado), 1
   mensagem on-success, `sourceModule='logistica_entrega'`, `senderType='system'`,
   `botActive:false`. ZERO reconexão/loop/socket/API-crua. Mensagem fixa
   ("Sua entrega foi concluída. Obrigado…"). Quer template configurável por empresa depois?
4. **FLAG:** `HBX_LOGISTICA_ENABLED` default OFF → confirmar só muda status/GPS.
   Provado no teste. Ligar a flag é o gate LIVE (só depois da tua revisão + QA no Chrome
   + chip descartável pra ver o WhatsApp sair sem loop).
5. **Preço da entrega:** resolvido por explícito > preço do produto > `precoPadrao` do
   cliente > 0. `precoPadrao` é o fallback por cliente. Confirma a precedência?
6. **Migração NÃO aplicada** (Postgres não conferido) — aplicar em ordem quando subir.
7. **Reconfirmação:** `!jaEntregue` impede que reconfirmar dispare WhatsApp/cobrança 2×.

## Guardrails respeitados
- **NÃO publiquei.** Branch `claude/nucleo-crm`. **NÃO usei `git stash`.**
- **`git add` arquivo-a-arquivo** (14 caminhos), NUNCA `-A`/`.`.
- **Trabalho paralelo do dono preservado:** `vendas/page.client.tsx`,
  `leads/page.client.tsx`, `filtro-avancado-modal.tsx`, doc VENDAS-REFAB — NÃO toquei;
  o dono os commitou ele mesmo (`e665a20a`) enquanto eu trabalhava. Meu commit é disjunto.
- **WhatsApp:** só caminho blindado, flag OFF, zero reconexão/loop/socket/API-crua.
