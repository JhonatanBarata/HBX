# PR10072026 — Módulos (teto do master × uso do admin) + Financeiro do cliente + mobile só-logística

Pedido do dono (10/07): (1) admin liga/desliga módulos em lugar SIMPLES — configurações no desktop e **Ajustes do /entrega** no celular ("um cliente da logística pode querer ativar o vendas/radar um dia — SIMPLES E FÁCIL"); teto = o que o master liberou, **nunca bypass**. (2) Mobile só-logística: cai direto no /entrega, sem marca HBX, avançado nos Ajustes. (3) Financeiro do cliente fase 1: extrato de entregas (data/hora/itens/valor/✓msg) + saldo + baixa manual de fiado. (4) Stats do dia FICAM na home do /entrega.

Auditoria-base (10/07, sessão Claude): bypass real do master via `POST /profile/module-categories` re-chamável sem auditoria; modelo tem 1 coluna só (`CompanyModule.enabled`); mobile só-logística cai em /vendas 403; HBX em 4 lugares no /entrega; /logistica sem gate de módulo em rota; suspensão apaga post-its do master.

## Modelo novo (W1)
`CompanyModule` ganha `masterEnabled Boolean @default(true)` (TETO — só o /master escreve). `enabled` vira a camada da EMPRESA (OOBE/admin escrevem). **Efetivo do override = `masterEnabled && enabled`**; ausência de linha continua = `SystemModule.defaultEnabled`. Backfill: `masterEnabled=true` em todas as linhas existentes (master re-trava pelo painel se quiser).
CORREÇÃO 11/07 (pós-revisão): o gate (`canUserAccessModule`) e o `/modules/me` honram de fato o "sem linha = defaultEnabled" pra chave FORA do universo do plano (logistica/empresas/contatos/produtos — `resolveModuleDefaultWithoutOverride`); antes o fallback era só a caixa do plano e empresa antiga sem post-it tomava 403 MODULE_ACCESS_DENIED no `/logistica` inteiro. Chave vendável por plano (atendimento/vendas/webscraping/cadastro) segue a caixa do plano, como antes.

## Categorias (fonte única `module-categories.ts`)
`radar→[webscraping]`, `vendas→[vendas]`, `whatsapp→[atendimento,bot]`, `logistica→[logistica]`, `website→[website]`.
Estado de categoria (CORREÇÃO 11/07, pós-revisão): `enabled` = ALGUM módulo dela com efetivo ON (semântica ANY — categoria parcial, ex. atendimento ON + bot OFF, conta como ligada; com a régua antiga "TODOS ON" a parcial sumia do POST e o save desligava módulo vivo por efeito colateral); `locked` = QUALQUER módulo dela com `masterEnabled=false`.

## API — contratos (W1 implementa; W3/W4 consomem)
1. **GET `/profile/module-categories/options`** (dono/admin, mesmo gate do POST):
   `{ categories: [{ key: 'radar'|'vendas'|'whatsapp'|'logistica'|'website', enabled: boolean, locked: boolean }] }`
   Categoria `locked` NUNCA vira ligável pelo tenant (front esconde ou mostra desabilitada com texto mínimo).
2. **POST `/profile/module-categories`** (existente) — agora: (a) respeita teto — módulo com `masterEnabled=false` NUNCA recebe `enabled=true` (skip silencioso + retorno lista o que foi pulado); (b) grava auditoria (mesmo mecanismo do MODULE_TOGGLED do master, ator = user do tenant); (c) segue re-chamável (mín. 1 categoria; continua atualizando `Company.moduleCategoriesJson`); (d) CORREÇÃO 11/07 — escrita por INTENÇÃO (`planCategoryModuleWrites`): categoria presente que já tem módulo ON não é reescrita (preserva mix parcial); categoria omitida só desliga se estava efetivamente ligada e NÃO travada (locked omitida = no-op, nunca mata módulo vivo).
3. **PUT `/modules/master/company/:companyId`** (existente) — passa a escrever `masterEnabled` (teto). Resposta/listagem do master expõe `masterEnabled` + `companyEnabled` (camada empresa) + `effective`.
4. **GET `/logistica/clientes/:id/entregas?limit=&cursor=`** (W2; tenant-scoped):
   `{ items: [{ id, scheduledAt, deliveredAt, status, valor, receiptMethod, cobrancaStatus, whatsappStatus, whatsappMotivo, itens: [{ produtoNome, qtd, valorUnit }] }], nextCursor }` — ordenado desc por `deliveredAt ?? scheduledAt`; usa índice `[companyId, customerProfileId, scheduledAt]`.
   CORREÇÃO 11/07 (pós-revisão): **ADMIN-only** (RolesGuard+@Admin) — LEI DO VENDEDOR (visão gerencial do dono; 'logistica' é company-level e não filtra por cargo, então sem o gate o vendedor USER puxaria o histórico com dinheiro). **Regra M4**: com `moduloFinanceiroAtivo=false`, `valor`/`valorUnit`/`cobrancaStatus` vêm `null` (data/itens/whatsapp ficam) — o dinheiro não aparece com o financeiro OFF.
5. **POST `/logistica/charges/:id/quitar`** (W2; ADMIN/dono): marca FinanceiroCharge `pending`→paga (`paidAt=now`), só charges `sourceModule` `logistica_*` da própria empresa; idempotente (já paga → devolve estado, 200). `{ id, status, paidAt }`.
6. **GET `/logistica/financeiro/saldos`** (W2; **ADMIN-only** RolesGuard+@Admin — CORREÇÃO 11/07, LEI DO VENDEDOR — + `moduloFinanceiroAtivo` fail-closed):
   `{ moduloFinanceiroAtivo, clientes: [{ customerProfileId, nome, saldoAberto, aguardandoFechamento }] }` (só quem tem valor > 0; reusa `saldoAbertoPorClientes`; OFF → lista vazia).

## Detecção "só-logística" (front, W4)
`soLogistica(mods) = logistica accessible && nenhum de {vendas, atendimento, webscraping, website, bot} accessible` (via `/modules/me` cacheado).

## Regras duras
- PT-BR; zero texto inventado em tela (label + campo, 1 tela, sem scroll — regra do dono).
- Frontend: 5 Leis do Design System — tudo em token/classe central (`hbx-theme/`), zero hex/inline; `check-pele.mjs` reprova. `/entrega` usa as classes `ent-*`/aliases `--hbx-*`.
- NUNCA criar branch/worktree; editar direto na working tree (master). NÃO commitar — o orquestrador commita após E2E.
- NÃO tocar em `Webwhats/`.
- Cuidado: `*/` dentro de comentário CSS derruba o app; `.next` cacheia "Can't resolve" (apagar `.next` se acontecer).
