# SPRINT1 — Máquina de inbound da prospecção ÚNICA (P0)

## ✅ EXECUTADO 03/07 — DECISÃO DE EXECUÇÃO (pivô consciente do plano original)

O plano original mandava EXTRAIR a máquina para um `ProspectingInboundService` neutro e ligar os dois
lados. Ao inventariar o código real no master (`d0c3148d`), a máquina viva no `messaging.service.ts`
provou-se **intercalada** com 3 outros assuntos (e-mail HBX de apresentação L2529–2947, self-alert
L2106–2211, Atendimento L3754+): ~30 métodos em 3 clusters não-contíguos. Extrair isso num fôlego, no
código MAIS sensível a ban, é alto risco de mudar comportamento sutil — o oposto do objetivo.

**O valor-P0 real era a DE-DUPLICAÇÃO** ("fix de compliance atinge uma cópia, esquece a outra → ban").
Capturei isso pela via SEGURA: a cópia do `vendas-automation.service.ts` (`classifyProspectingInbound`
+ subárvore `markInterested/markNegative/markAutoReply/markNeutral/notifyInterestedLead/
sendPitchAfterPreMessage/accelerateNextJobAfterAutoReply` + helpers pre-message) provou-se **100%
MORTA** (só os testes chamavam; nenhuma referência viva no repo inteiro). **Código morto nunca roda →
deletar é NEUTRO em produção por definição**, e elimina a duplicação de vez. Cortei o bloco contíguo
morto (L4220→EOF = 806 linhas) + os 2 testes que o exercitavam. Restou UMA máquina (a viva no
messaging). `tsc` compila limpo quanto à minha mudança (único erro do build = WIP não-commitado do
dono em `integrations/external-webhook-ledger.service.ts`, intocado). Suíte `vendas-automation`:
**34/34 verde**.

**A extração elegante (messaging encolher ~1.5k linhas + máquina morar em `vendas/`) foi REBAIXADA
para a fase de split ([SPRINT5](ARQUITETURA04-VENDAS-CRM-SPRINT5.md))** — é limpeza arquitetural, não
risco-de-ban. O risco-de-ban morreu com a de-duplicação.

**⚠️ OBSERVAÇÃO PARA O DONO (não corrigida — decisão sua, código sensível):** a cópia MORTA de
`markNegative` chamava `markRadarDispositionForLead` ao negativar/opt-out (marca a disposição no Radar
= memória de leads, evita recontatar quem disse não). A cópia VIVA (`markVendasAutomationNegative` no
messaging) **não tem essa chamada no corpo**. Pode ser que a produção marque a disposição por OUTRO
caminho (ex.: CRM `negativarLeadForUser` → `markRadarContactDispositionForUser`) — a VERIFICAR. Se for
gap real, é um lead negativo do BOT que pode voltar à fila depois: retrabalho, não ban. Deletar o
código morto NÃO criou esse gap (o morto nunca rodou); só o tornou visível.

## Problema

A máquina que decide o que fazer quando o lead responde (interessado / negativo / **opt-out** /
auto-reply / neutro / reagendar) existe DUAS vezes:

- **Viva (produção)**: `backend/src/messaging/messaging.service.ts` — bloco ~L1810–3741.
  Entrada: `handleVendasAutomationInbound` (L2936), chamada no pipeline de inbound (L6751) com
  callback `setInboundMeta`. Métodos: `markVendasAutomationInterested/Negative/AutoReply/Neutral`,
  `handleVendasProspectionScheduleReply`, `sendVendasPitchAfterPreMessage`,
  `reduceNextVendasAutomationIntervalAfterBot` + listas default de keywords re-hard-coded.
- **Morta (só testes)**: `backend/src/vendas/vendas-automation.service.ts` —
  `classifyProspectingInbound` (L4359) + `markInterested/markNegative/markAutoReply/markNeutral/
  sendPitchAfterPreMessage/accelerateNextJobAfterAutoReply` (L4482–4933+). Nenhum call-site fora de
  `vendas-automation.service.test.ts`.

Elas **já divergiram**: o fluxo de reagendamento ("me chama amanhã" →
`handleVendasProspectionScheduleReply` + `parseProspectionScheduleRequest` +
`formatProspectionScheduleLabel`) só existe no messaging. É nessa máquina que mora o freio anti-ban
e o respeito ao opt-out — manutenção dupla aqui é risco existencial do canal WhatsApp.

**Causa-raiz da cópia**: ciclo de módulos. `VendasModule` importa `MessagingModule` (usa
`ConversationsService`/`WebwhatsBridgeService`); messaging não pode importar `VendasModule` de volta,
então só importa `AiIntentClassifierModule`. A versão morta já recebe tudo por parâmetro/callback
(`setInboundMeta`) — foi desenhada pra ser a fonte única.

## Objetivo

Uma única implementação da máquina, comportamento **bit-a-bit igual ao do messaging atual** (é o que
roda em produção). A cópia do messaging morre (~1.9k linhas); a versão morta do vendas-automation
morre também — nasce um service novo e enxuto.

## Desenho

Novo `backend/src/vendas/prospecting-inbound.service.ts` + `prospecting-inbound.module.ts`:

- Dependências DIRETAS mínimas: `PrismaService`, `AiIntentClassifierService`, código puro de
  `prospecting-safety.ts`. **Nada de messaging/inbox** — tudo que hoje a cópia viva faz via
  `this.conversations`/`this.inboxRealtime`/`this.webwhatsBridge` entra por **callbacks/params** no
  input (o padrão `setInboundMeta` já existe; estender: `sendOutbound`, `publishRealtime`,
  `updateConversationState`, o que o diff mostrar).
- `MessagingModule` e `VendasModule` importam `ProspectingInboundModule` (sem ciclo: o módulo novo
  não importa nenhum dos dois).
- `messaging.service.ts` (L6751) passa a montar o input (com os callbacks apontando pros seus próprios
  services) e delegar. `vendas-automation.service.ts` usa o mesmo service no lugar da versão morta
  (o simulate/sandbox `simulateProspectingForUser` L1799 continua usando `classifyIntentWithFallback`
  direto — não tocar).

Decisão registrada: **callbacks/params, NÃO event-bus** — `@nestjs/event-emitter` não está no
package.json e introduzir bus é escopo extra sem necessidade aqui.

## Passos

1. **Diff funcional** (entregável nº1, commit separado ou nota neste .md): tabela método-a-método
   messaging × vendas-automation. Para cada comportamento: existe nos dois? igual? divergente como?
   Divergências conhecidas de partida: ScheduleReply (só messaging); comparar com lupa
   `markVendasAutomationNegative` × `markNegative` (opt-out! radar disposition!),
   `reduceNextVendasAutomationIntervalAfterBot` × `accelerateNextJobAfterAutoReply`, e as listas de
   keywords default (messaging re-hard-coda; vendas usa `DEFAULT_*` importados).
2. Criar `ProspectingInboundService` a partir da versão do messaging (a viva manda), preservando os
   pontos onde a versão do vendas for igual. Portar o fluxo de ScheduleReply.
3. Ligar messaging → delegação (input + callbacks). Rodar testes do messaging SEM mudá-los primeiro
   (garantia de comportamento); depois movê-los.
4. Ligar vendas-automation → apagar `classifyProspectingInbound` e os `mark*` mortos.
5. Unificar testes: casos de `messaging.service.test.ts` (máquina) + `vendas-automation.service.test.ts`
   (classify) viram testes do service novo. Nenhum caso deletado sem equivalente.
6. Apagar o bloco morto do messaging (~L1810–3741, só o que era da máquina).

## Guardrails

- Comportamento de produção = o do messaging. Se o diff revelar bug óbvio (ex.: opt-out que não marca
  disposition), NÃO consertar de brinde — listar aqui e decidir com o dono.
- Semântica de opt-out/disjuntores/blacklist intocável.
- Nenhum endpoint/payload muda. Nada aqui conecta chip; sem teste live.

## Checks e aceite

- `cd backend && npm run build` verde; testes de messaging + vendas-automation + service novo verdes.
- `grep -rn "markVendasAutomation" src/messaging` → zero resultados (fora de testes legados removidos).
- `grep -rn "classifyProspectingInbound" src` → só o service novo e seus testes.
- Contagem de linhas do messaging.service.ts cai ~1.5–2k.
- Tabela de diff funcional entregue (com divergências e destino de cada uma).

## Rollback

Refactor puro de código: `git revert` do(s) commit(s). Nenhuma migration, nenhum dado tocado.
