# Worker 03 — BLOCO E: chave geral do bot deixa de dar partida na frota

## Problema (provado)
No incidente, o dono clicou a chave geral do header às 13:13:51 (`bot_master_switch` off→false,
`byUserId=6`). `setMasterSwitch(on=true)` NÃO é só "permitir": ele **arma e sobe os 3 motores** que
passam no pré-voo. A campanha de prospecção (parada desde 17/07) foi religada e disparou 1 mensagem
em 29s (13:14:20). Um clique = frota disparando.

## ⚠️ CUIDADO CRÍTICO — o desligar É a chave de matar (NÃO mexer)
O worker de prospecção decide parar olhando `company.prospectingBotLiveAt`
(`vendas-automation.service.ts:2403` `getProspectingLiveAt`). O `setMasterSwitch(off)` **zera**
`prospectingBotLiveAt`/`recoveryBotLiveAt` (`bot-activation.service.ts:388-399`) — é ISSO que
efetivamente para a frota. **NÃO alterar o ramo de desligar.** Zerar no OFF continua sendo o freio.

## Mudança
Arquivo: `backend/src/bot/bot-activation.service.ts`, método `setMasterSwitch` (linhas ~373-431).

### E2 (núcleo) — LIGAR só remove o bloqueio, NÃO dá partida
Hoje o ramo `if (on)` (linhas ~403-430) faz um loop pelos 3 tipos e, se passam no pré-voo, seta
`recoveryBotLiveAt`/`prospectingBotLiveAt = new Date()` e liga o atendimento. **Remover esse
auto-arme.** Ligar a chave geral passa a só gravar a intenção (`bot_master_switch { off:false }`,
que o método já grava no início) e retornar `{ ok: true, on: true }`. Cada motor volta a ligar
**pelo próprio toggle** em `/bot` (`putActivation`, que já tem pré-voo por tipo). Resultado: o clique
do dono no header **liga zero disparo**.

Deixar comentário curto explicando: "Ligar = permitir (levanta o bloqueio geral). NÃO arma os
motores — cada tipo religa no próprio toggle de /bot, com pré-voo. Anti-'frota disparando em 1
clique' (incidente 20/07)."

### E1 — MANTER como está
O ramo `if (!on)` (desligar, ~388-400) continua zerando as colunas live e derrubando atendimento.
É o freio de verdade. **Não mexer.**

## E3 — confirmação no header ao LIGAR
Arquivo: `frontend/src/components/hbx/shell.tsx`, função `toggleBot` (~1268-1283).
Quando o clique for para **LIGAR** (`turningOn === true`), pedir confirmação antes do PUT, avisando
que **os motores não voltam sozinhos** — precisa ligar cada um em /bot. Ao desligar, sem confirmação
(desligar é sempre seguro). Usar o padrão de modal/confirm já existente no shell (não inventar UI
nova). **5 Leis do Design System:** zero cor/hex/inline solto — só token/classe central
(`frontend/src/app/hbx-theme/`). `check-pele.mjs` reprova hex/inline; deixar o lint limpo.
Se já houver um confirm/modal utilitário no shell, reusar; se não, um `window.confirm` textual é
aceitável como mínimo (sem estilo solto).

## Aceite
- `setMasterSwitch(on=true)` não seta nenhum `*LiveAt` nem liga atendimento; só grava a intenção.
- `setMasterSwitch(on=false)` INALTERADO (continua zerando e derrubando).
- Ligar pelo header pede confirmação; desligar não.
- Ajustar o teste `bot-activation.service.test.ts` (deve haver caso do master-switch ON armando os
  tipos — inverter a expectativa: ON não arma mais).
- `cd backend && npm run typecheck` verde; lint de pele do front limpo no arquivo tocado.

## Arquivos
- `backend/src/bot/bot-activation.service.ts` (só `setMasterSwitch`, ramo ON)
- `backend/src/bot/bot-activation.service.test.ts`
- `frontend/src/components/hbx/shell.tsx` (só `toggleBot`)

**Independente do Worker 01 e 02 (arquivos não colidem) — pode rodar em paralelo.**
