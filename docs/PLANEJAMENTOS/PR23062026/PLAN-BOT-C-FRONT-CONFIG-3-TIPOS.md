# PLAN-BOT-C — Frontend: editor de config dos 3 tipos na `/bot`

Ler [PLAN-BOT-00-INDICE.md](PLAN-BOT-00-INDICE.md). Hoje a aba Configurações da `/bot` só edita **Atendimento**
(`PATCH /inbox/bot-config`). Abrir os outros 2 tipos reusando os endpoints que já existem. Design System: só classes centrais.

## Objetivo
Na `/bot`, um **seletor de tipo** (Atendimento / Recovery / Prospecção) que troca a fonte da config editada,
mantendo o editor estruturado atual (mensagens / botões / regras). **Não** construir grafo livre (decisão de produto pendente).

## Fontes por tipo (já existem no backend)
- **Atendimento:** `GET/PATCH /inbox/bot-config` (full-replace; mandar config completa + edições — como já é hoje).
- **Recovery:** `GET/PATCH /hbx-recovery/bot-config` (campos em `recovery-bot-config.ts`: startTemplates, mainMenu,
  value/installment/followup, mensagens). Editor: mensagens + botões + templates de início.
- **Prospecção:** `GET /vendas/automation/bot-config` + `PATCH /vendas/automation/bot-config` (mesma DTO do atendimento)
  e `PATCH /vendas/automation/prospecting/config`. Editor foca no 1º contato seguro (`prospecting-safety` — variantes
  sem link) + regras de ritmo (ver PLAN-BOT-E).

## Onde mexer
`frontend/src/app/(app)/bot/page.client.tsx`, aba "Configurações". Hoje os campos (`BOT_MSG_FIELDS`,
`BOT_BTN_GROUPS`, `BOT_RULES`) são fixos do atendimento. Generalizar: o seletor define qual conjunto de campos e
qual endpoint usar. Manter o full-replace (partir da config carregada + sobrepor edições, senão zera campos fora do form).

## Cuidado
- Cada tipo tem catálogo de ações/botões próprio (atendimento × recovery diferem). Carregar o `actionCatalog` do
  tipo selecionado pra popular o `<select>` de ação dos botões.
- Não quebrar o que já funciona no Atendimento (é o caminho testado). Recovery/Prospecção entram ao lado, não por cima.

## Aceite
- Trocar o seletor recarrega a config certa e salva no endpoint certo.
- Salvar Atendimento continua idêntico ao comportamento atual.
- Recovery/Prospecção: editar uma mensagem + salvar persiste (confirmar via GET).
- `lint` + `build` (frontend) verdes; sem hex/inline novo.
