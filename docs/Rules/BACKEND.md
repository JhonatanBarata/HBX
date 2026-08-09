# Regras — BACKEND

> NestJS + Prisma + PostgreSQL em `backend/`.
> Leia este arquivo antes de tocar em endpoint, serviço, schema ou migration.

## Princípios

- **Backend é contrato.** Refazer tela no frontend NUNCA muda endpoint, payload ou
  regra de negócio. Mudança de backend é trilha própria, planejada e explícita.
- O backend é a fonte de verdade de autorização comercial (ver docs/Rules/PAGAMENTOS.md).
- Radar é a memória de leads e oportunidades: **resultado negativo nunca é descartado
  casualmente** — ele protege o sistema de retrabalho.

## Pontos de entrada canônicos

- Estado de acesso/cobrança: `backend/src/modules/company-access-state.ts`
  (`resolveCompanyAccessState`) — todo o resto projeta dele.
- Política de módulos por plano: `backend/src/modules/module-access-policy.ts`
  (inclui `presentModuleBlockForRole`: vendedor nunca vê motivo financeiro).
- Catálogo comercial: `backend/src/commercial-plans/commercial-plan-catalog.ts`.
- Seeds estruturais: `backend/src/bootstrap/structural-defaults.json`
  (módulos globais, planos default, permissões de importação, seed local de dev).
- Superfície master-pura: `MASTER_SURFACE_MODULE_KEYS` em `modules.service.ts`
  (só `master` e `exclusoes`; superfície completa só ao "Operar" uma empresa).

## Rota — os 6 verbos e a tabela DONA de cada um (09/08, faxina `PR09082026-ROTA-SEIS-VERBOS.md`)

A logística tinha a agenda em 4 cópias e a ordem da rota em 4 números. Cada tela
lia uma cópia diferente — é a raiz de "a lista diz 107, o mapa diz sem paradas".
Depois da faxina, **cada pergunta tem UMA tabela que responde**:

| Verbo | Tabela dona |
|---|---|
| Agendar (quem recebe o quê, que dia) | `LogisticaPlanoEntrega` + `Item` |
| Fazer a rota | `Entrega` (+ `rotaOrdem`) — `materializeForRoute` é o único gerador |
| Limpar a rota | `Entrega.rotaOrdem = null` — limpar apaga ORDEM, nunca entrega/dinheiro |
| Usar a rota | `Entrega.status` + desfechos |
| Fechar a rota | fechamento-dia + `LogisticaRoute.operationalEndedAt` |
| Faturar | `LogisticaRoute` / `RouteStop` / claims — snapshot imutável |
| Histórico | `ClienteHistorico` + `LogisticaAgendaEvento` + snapshots da `Entrega` |

**Três ordens, três donos — nunca se misturam:**
`RotaModeloParada.ordem` = o molde salvo · `Entrega.rotaOrdem` = a operação do dia
· `RouteStop.snapshotOrder` = **dinheiro, NUNCA lido por tela**.

Regras que caem daí:
- `ClienteProduto` **não é agenda** — é PREÇO (`precoAcordado`). Quem pergunta
  "que dia o cliente recebe?" pergunta ao PLANO.
- Não existe mais flag `agendaV2Ativa`: a Agenda V2 é o sistema, não uma opção.
- Tela que precisar de uma 4ª lista de paradas está errada — o dado já existe.
- **Tabela vazia não prova ramo morto.** Ramo morto se prova por caminho de código
  inalcançável. `LogisticaCargaDia` está com 0 linhas e é a base do estoque ativo
  (nota fiscal) — não se toca.

## Banco e migrations

- Migration destrutiva ou operação destrutiva de dados: SÓ com ordem explícita do dono
  na tarefa atual.
- Migrations Prisma rodam dentro do container `hbx-backend` em produção
  (via `backend/scripts/start-prod.sh`) — nunca `npx prisma` no host contra produção.
- Local é descartável; produção só recebe código, migrations e bootstrap estrutural
  idempotente. Dado operacional real não nasce no banco local esperando subir.
- `npm run up` recusa `backend/.env` apontando para banco remoto (proteção contra
  Prisma Studio em produção por engano).

## Mensageria WhatsApp (Cloud API)

- Envio via padrão Outbox com retry (backoff exponencial + jitter) e integração
  por webhook. Não trocar o mecanismo sem plano próprio (ver docs/Rules/WHATSAPP.md).

## Automação — bot + IA + cadência (motor único, fusão 20-21/07)

`/bot` + `/automacoes` + `/assistente` viraram **1 módulo**, `backend/src/automation/`.
Vocabulário/contratos completos: `docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/CONTRATO.md`.

- **Espinha**: `AgentService` (config única do Atendente — 2 cérebros, `roteiro` OU
  `ia`, nunca terceiro sem decisão do dono) · `InboundRouterService` (decide quem
  responde um inbound: `interruptForInbound` → cadência fire-and-forget → assistente
  IA → atendimento/menu → recovery — extração LITERAL da precedência antiga; JUIZ é
  `automation/characterization/*.test.ts`, qualquer mudança de ordem tem que continuar
  passando neles) · `OutboundOrchestratorService` (1 scheduler, N executores
  registrados rodando em SÉRIE — nunca paralelo, chip é recurso único) ·
  `EventRuleService` (gatilhos generalizados, motor de execução continua em
  `cadencia-gatilho.service.ts`).
- **O agente é DA EMPRESA, não do usuário** (regra de produto, dono 20/07): 1
  `AutomationAgent` por `companyId` (`@unique`). Só Admin/USERMASTER configura
  (`canManage`, `PUT/POST /automation/agent*`); vendedor herda — só lê e testa no
  sandbox. Nunca criar config por vendedor aqui (vira bagunça de marca).
- `queueOutboundForCompany` continua a ÚNICA porta de saída WhatsApp — o
  orquestrador novo decide QUEM dispara e QUANDO, nunca substitui a porta nem o
  disjuntor/teto/warmup que já existem nela.
- Flags novas nascem na família `HBX_AUTOMATION_*` e SEMPRE caem pra flag legada
  como fallback — usar `automationFlag(nova, legada)` de
  `backend/src/automation/automation-flags.ts`, nunca reimplementar o fallback
  inline. `HBX_AUTOMATION_AGENT` é a única flag default **ON** em código
  (kill-switch = valor explicitamente `0`/`false`/`no`/`off`; ausente/vazio/qualquer
  outro valor = ON e volta tudo pro legado byte a byte se a empresa não tiver linha
  em `AutomationAgent`).
- `Copiloto` (`backend/src/assistente/copiloto.controller.ts`, prefixo
  `/assistente/copiloto`) **NÃO faz parte desta fusão** — feature separada de
  redação assistida pro vendedor (tela do Lead), flag própria
  `HBX_COPILOTO_ENABLED`, preservada intacta mesmo com `/assistente` virando
  redirect.
- `prisma/migrations-hold/` guarda o DDL destrutivo (drop de `AssistenteConfig` +
  `BotConfig`) **fora** do caminho de deploy (`prisma migrate deploy` não a
  enxerga) — tem guarda de paridade própria, mas **NUNCA mover essa migration pra
  `prisma/migrations/` sem antes**: (1) rodar
  `backend/scripts/automation-pre-drop-dump.sh` (dump seletivo, NUNCA
  `cnpj_public*`), e (2) remover as leituras legadas que ainda são o kill-switch e
  o dual-write em runtime (`messaging.service.ts`, `vendas.service.ts`,
  `conversation-assistant-runtime.service.ts`, `assistente.service.ts`) — a
  paridade da migration pode passar e o runtime quebrar do mesmo jeito (P1-2,
  `docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/RELATORIO-S21.md`).

## Proibido sem ordem explícita do dono

Vale a lista única de segurança do [CLAUDE.md](../../CLAUDE.md): auth/autorização,
secrets, env de produção, deploy/publish/restart, migration destrutiva e refactor
amplo fora de escopo.

## Checks padrão (menor conjunto relevante aos arquivos tocados)

- `cd backend && npm run prisma:validate`
- `cd backend && npm run build`
- Testes direcionados do `backend/package.json` quando a área tocada bater com eles.
- `npm run test:e2e` (raiz) só quando um caminho end-to-end mudou e o ambiente está pronto.
