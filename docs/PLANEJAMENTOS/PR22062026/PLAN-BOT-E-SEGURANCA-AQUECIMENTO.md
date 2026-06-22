# PLAN-BOT-E — Segurança + aquecimento (anti-ban de chip)

Ler [PLAN-BOT-00-INDICE.md](PLAN-BOT-00-INDICE.md). A dor do dono: "não começar disparos imbecis bloqueando
chips". Boa notícia: a base já é conservadora. Este bloco garante os defaults e o aquecimento, e expõe a revisão.

## O que JÁ existe (reusar, não recriar)
- `inbox/atendimento-config.ts → DEFAULT_FIRST_CONTACT_SCENE_RULES`: por tipo (atendimento/prospeccao/recovery)
  já traz `canInitiateConversation`, `maxFirstContactsPerHour`, `quietHoursStart/End`, `replyDelaySeconds`,
  `typingSeconds`, `maxFollowUps`, `followUpDelayHours`, `requireOptIn`, `stopIntentKeywords`, `optOutMessage`.
- `vendas/prospecting-safety.ts`: classificador de intenção, strip de link no 1º contato, detector de auto-reply,
  `isExplicitProspectingNegativeReply`, opt-out. Variantes de 1º contato SEM link (`SAFE_FIRST_CONTACT_VARIANTS`).

## O que FALTA / garantir
1. **Proativos nascem OFF** (já no modelo de ativação — PLAN-BOT-A/B): default `recoveryBotLiveAt`/`prospectingBotLiveAt` = null.
2. **Aquecimento gradual:** ao ligar a Prospecção, o teto de disparos começa BAIXO e sobe com os dias sem
   bloqueio. Implementar como rampa sobre `maxFirstContactsPerHour` (ex.: dia 1 = 5, sobe gradual até o teto
   configurado). Onde: na fila de prospecção (`vendas-automation.service.ts`, ponto que respeita o teto/hora).
3. **Painel de revisão das travas** na config de Prospecção/Recovery (PLAN-BOT-C): mostrar horário silencioso,
   teto/hora atual (com a rampa), opt-out e palavras de parada — editáveis, com defaults conservadores.
4. **Kill-switch imediato:** desligar a chavinha do tipo PARA novos disparos na hora (pausa a fila, não só "não enfileira mais").

## Princípios (não violar)
- Nunca uma "chave geral" que ligue os 3 juntos. Sempre por tipo, com o reativo (atendimento) separado dos proativos.
- Opt-out e "não tenho interesse" sempre encerram sem nova tentativa (já no `prospecting-safety` — não enfraquecer).
- Quiet hours respeitado mesmo com fila cheia.

## Aceite
- Ligar Prospecção começa com teto baixo (logar o teto efetivo do dia).
- Resposta "pare/remover" encerra o contato e não reenfileira.
- Desligar a chavinha pausa a fila na hora (nenhum disparo novo sai).
