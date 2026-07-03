# INTENTENGINE — Sprint 2: NLU no atendimento com trava (catálogo fechado)

> Plano auto-contido. Editar código = subagente Sonnet (1 por .md); Opus planeja.
> Depende do Sprint 1 (IntentEngine + IntentDecision no ar). É a alavanca de RECEITA
> da arquitetura: "bot que entende texto livre" com custo por mensagem ZERO (IA local).

## Objetivo
Cliente final escreve frase natural ("meu ar tá vazando, tem horário amanhã?") e o bot
executa a ação certa do catálogo (`schedule_service`), em vez de devolver menu numerado.
O LLM NUNCA gera texto — só ESCOLHE uma ação já configurada pelo dono. Pior caso = menu
de hoje (fallback atual é o piso).

## ESTADO ATUAL (verificado 01/07/2026)
Resolução de ação em `backend/src/messaging/messaging.service.ts`:
- `handleAtendimentoInbound` ~6695: `resolveDynamicMenuActionKey` → `normalizeAtendimentoActionId`.
- `normalizeAtendimentoActionId` ~4258, cadeia atual: (1) buttonId interativo direto →
  (2) aliasMap do texto do payload → (3) número do menu (`pickNumberedButtonAction`) →
  (4) aliasMap do texto normalizado → (5) `''` (vazio → fluxo cai no menu/welcome).
- `buildAtendimentoActionAliasMap` ~4217: match EXATO de texto contra títulos de botões +
  aliases fixos (atendente/humano/menu/voltar/encerrar/debito). Ou seja: já existe um nível 2
  léxico; o que falta é o nível 3 SEMÂNTICO pra frase natural.
- Catálogo de ações por tenant: `actionCatalog` em `backend/src/inbox/atendimento-config.ts`
  (kinds: reply, human_handoff, recovery_handoff, close, show_menu, agenda), já sanitizado por
  provider/plano (`sanitizeAtendimentoBotConfigForTenant`).
- VPS: Ollama `qwen2.5:7b` em `172.18.0.1:11434`, `OLLAMA_NUM_PARALLEL=1` — o NLU divide a
  fila com o classificador de prospecção.

## O QUE FAZER (em ordem)
1. No `IntentEngine`, novo método `classifyAtendimentoAction(input)`:
   - Recebe texto + lista das ações HABILITADAS do tenant (`actionId`, `title`, `description`
     do catálogo sanitizado — nunca a lista bruta).
   - Prompt: devolver SOMENTE JSON `{"acao":"<actionId>","confianca":0..1}`. Rótulo fora da
     lista enviada → descarta (retorna null). Reusar padrão do prompt atual (gírias BR, JSON
     forçado, temperature baixa).
   - Timeout próprio `HBX_ATENDIMENTO_NLU_TIMEOUT_MS` (default 6000 — resposta de atendimento
     não pode esperar 9s). Erro/timeout/JSON inválido → null.
2. Plugar em `handleAtendimentoInbound` (~6695): SÓ quando `actionId` resolveu vazio E há
   texto livre E flag ligada → chamar NLU. `confianca >= HBX_ATENDIMENTO_NLU_MIN_CONF`
   (default 0.75) → usa o actionId como se fosse clique de botão (mesmo caminho de execução).
   Abaixo do limiar ou null → comportamento atual intacto (menu).
3. Flags: `HBX_ATENDIMENTO_NLU_ENABLED` (default OFF — dormente igual à Etapa 1 do
   classificador) + `HBX_ATENDIMENTO_NLU_MIN_CONF`. Gate comercial: mesmo gate atual do bot
   (`hasCommercialBotAiEntitlementForCompany`) — sem inventar entitlement novo neste sprint.
4. Toda decisão logada em `IntentDecision` com `flow='atendimento'` (inclusive as descartadas
   por confiança baixa — é o dataset pra calibrar o limiar depois).
5. Testes unit: classifier mockado — casos: frase→ação, confiança baixa→menu, timeout→menu,
   actionId fora do catálogo→menu, flag off→menu, ação desabilitada não é oferecida ao LLM.

## GUARDRAILS
- LLM NUNCA gera mensagem. Só escolhe `actionId`. Toda mensagem enviada continua sendo
  template do dono. Zero mudança no perfil anti-ban (mesmas mensagens, mesmo ritmo).
- Nenhum envio autônomo novo — o NLU só substitui "mostrar menu" por "executar ação".
- Validação ao vivo em número DESCARTÁVEL (regra dura do CLAUDE.md), jamais chip do dono.
- Vigiar RAM/latência do VPS quando ligar (mesma mitigação do classificador: flag off = 
  desliga instantâneo, fallback assume).
- Áudio fica FORA deste sprint (Whisper local é etapa futura; hoje áudio segue caindo no menu).

## PRONTO QUANDO
- tsc estrito 0 erros; testes verdes.
- Em dev com flag ON: 10 frases naturais de teste mapeando pra ações corretas; 3 frases
  ambíguas caindo no menu (trava funcionando).
- `IntentDecision` populado com flow='atendimento'; flag OFF por default no VPS até o dono
  mandar ligar.
