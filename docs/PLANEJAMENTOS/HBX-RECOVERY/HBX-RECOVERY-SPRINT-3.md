# HBX Recovery — Sprint 3: Executor de réguas (a receita)

> Arquitetura nº14. Depende dos Sprints 1 e 2. Executor: subagente Sonnet PODE editar,
> mas revisão do diff é obrigatória — este sprint dispara mensagem automática de cobrança
> (risco de ban + risco financeiro).

## Problema
`HbxRecoveryFlowStage.daysAfter` é preenchido, exibido e NUNCA executado — verificado: nenhum
cron/worker lê `daysAfter` (só CRUD e seed). O produto vende régua de cobrança; a régua não roda.
Automação real hoje é só reativa (devedor aperta botão) ou manual (humano clica).

## Solução — `RecoveryFlowRunnerService` (novo, dentro do módulo)
Padrão da casa: `setInterval` no `onModuleInit` (igual `processDueMessages`,
`messaging.service.ts:273`) — sem lib de cron nova, sem infra nova. Tick a cada 60s.

### Estado por cliente (migration)
`HbxRecoveryCustomer` += `flowStageIndex Int @default(0)`, `flowStageLastSentAt DateTime?`,
`flowAnchorAt DateTime?` (âncora = criação do débito ou último reset). Registrar cada disparo
via `appendInteractionEvent` (já existe) com `eventType: 'flow_stage_sent'`.

### Elegibilidade (TODAS precisam valer)
1. `company.recoveryBotLiveAt` setado (chavinha de /bot — já é gate do `startTemplateFlow`).
2. `customer.automationEnabled && openAmount > 0 && status = OVERDUE`.
3. Estágio `enabled` e `daysAfter` decorrido desde `flowAnchorAt`/último estágio.
4. Conversa NÃO está com humano atribuído, NÃO bloqueada (`recoveryBlocked` na metadata),
   sem inbound recente (<24h) — régua não atropela conversa viva.
5. Horário comercial da empresa (reusar janela do `shouldSendRecoveryHumanAck`).

### Envio
- 1º toque (fora da janela 24h): SÓ template Meta aprovado — reusar o caminho do
  `startTemplateFlow`/`resolveRecoveryStartTemplate`. Empresa sem `canUseTemplates` → não dispara.
- Estágios seguintes com janela aberta: `queueRecoveryWithFallback`.

### DISJUNTOR (obrigatório desde o dia 1 — lição jun/26: loop/massa = ban)
- `HBX_RECOVERY_FLOW_ENABLED` (default **0** — nasce desligado; liga por empresa piloto).
- Teto diário por empresa `HBX_RECOVERY_FLOW_DAILY_CAP` (default 30) + teto global.
- Espaçamento ≥8s entre envios da mesma empresa (mesmo espírito do boot escalonado do Webwhats).
- Falha de envio → backoff exponencial por cliente; 3 falhas → pausar cliente e marcar atenção.
- **Gate por provider: empresa em Webwhats (não-oficial) NÃO entra na régua automática no v1.**
  Cloud API com template aprovado apenas. Webwhats automático = decisão futura do dono, com
  teto próprio e opt-in explícito. Régua de cobrança em massa por canal não-oficial é a
  receita do chip banido.
- Kill-switch runtime: desligar `recoveryBotLiveAt` da empresa interrompe no próximo tick.

## Critérios de aceite
- [ ] Com flag OFF: zero comportamento novo (deploy seguro).
- [ ] Piloto: 1 empresa de teste, clientes com números descartáveis MEUS — régua percorre
      estágios respeitando `daysAfter` acelerado via env de teste (`HBX_RECOVERY_FLOW_TICK_MS`).
- [ ] Cap diário estoura → para e loga, não enfileira além do teto.
- [ ] Humano atribuído/bloqueado/inbound recente → pula e loga motivo.
- [ ] `npx tsc --noEmit` verde; teste unitário da função de elegibilidade (pura, sem IO).

## Guardrails
- JAMAIS testar com chip/número real do dono ou de cliente.
- NÃO disparar para os 20 clientes do seed demo (filtro: números `+55119100000xx` do
  `default-seed.ts` nunca recebem envio real — curto-circuito no runner).
- Correção de qualquer loop de envio = FREIO (teto/backoff/parar), nunca tapar sintoma.
