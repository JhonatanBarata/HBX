# HBX Recovery — Sprint 4: Bot engine volta pro módulo (strangler)

> Arquitetura nº14. Depende do Sprint 2 (pagamento unificado). Executor: subagente Sonnet.
> ~100 call sites vivos no messaging → strangler em fatias, NUNCA big-bang. Cada fatia
> deixa os testes verdes e o comportamento idêntico.

## Problema
A máquina de estados do bot Recovery mora em `backend/src/messaging/messaging.service.ts`
(~9k linhas): mapa de botões `hbx_recovery_*` (`:884-946`), interactive payloads (`:741-771`),
`handleRecoveryInbound` (`:6081+`), roteamento atendimento↔recovery (`:5234`, `:6880`, `:7186`),
`getRecoveryBotConfig` DUPLICADO (`:601` vs `hbx-recovery.service.ts:911`), escrita direta em
`hbxRecoveryCustomer` (`:696`, `:6029`). Mexer no bot = mexer no transporte de 3 produtos.

## Solução — registry de handlers (quebra o ciclo de dependência)
`HbxRecoveryModule` já importa `MessagingModule`; messaging chamar o recovery direto criaria
ciclo. Padrão: **registro em runtime**.

1. **Fatia 0 — contrato:** criar `backend/src/messaging/bot-flow-registry.service.ts` no
   MessagingModule: `register(handler: BotFlowHandler)` /
   `resolve(input): BotFlowHandler | null`. Interface:
   `BotFlowHandler { key: string; canHandle(ctx): boolean; handleInbound(ctx): Promise<{handled}> ;
   handleButton(ctx): Promise<{handled}> }`. `canHandle` decide por prefixo de botão
   (`hbx_recovery_`), `sourceModule` e estado da conversa (`RECOVERY_FLOW_ID`).
2. **Fatia 1 — helpers puros:** mover mapas de botão/ação, aliases e interactive payloads para
   `backend/src/hbx-recovery/recovery-bot-flow.ts` (arquivo puro, sem IO — vizinho do
   `recovery-bot-config.ts` que já existe). Messaging importa daqui (import de arquivo puro
   não cria ciclo de módulo NestJS). Deletar as cópias no messaging.
3. **Fatia 2 — engine:** criar `backend/src/hbx-recovery/recovery-bot-engine.service.ts`;
   mover `handleRecoveryInbound`, transições de passo, ack humano, followups. O engine se
   registra no `BotFlowRegistry` no `onModuleInit`. Messaging: onde hoje tem `if recovery...`,
   vira `registry.resolve(ctx)?.handleInbound(ctx)`.
4. **Fatia 3 — escrita única:** toda escrita em `hbxRecoveryCustomer`/`hbxRecoveryFlowStage`
   a partir do messaging passa a chamar método do módulo recovery (ex.:
   `updateRecoveryTemplateLastContact` vira método do engine). `getRecoveryBotConfig` do
   messaging morre; fica só o do módulo.
5. **Fatia 4 — limpeza:** remover wrappers do Sprint 2 no messaging; `grep -c hbx_recovery`
   no messaging.service deve sobrar só o dispatcher (~5 hits, não ~100).

## Critérios de aceite (por fatia — commit por fatia)
- [ ] Comportamento idêntico: fluxo completo do bot (menu → parcelas → link → pago) testado em
      número descartável MEU antes e depois de cada fatia.
- [ ] `messaging.service.test.ts` e `hbx-recovery.service.test.ts` verdes em toda fatia.
- [ ] Zero import direto `messaging → hbx-recovery.service` (só registry/arquivo puro).
- [ ] `npx tsc --noEmit` verde.

## Guardrails
- Conversas em voo durante deploy: estados vivem em `CompanyConversation.metadata` — o engine
  novo LÊ o mesmo formato de metadata; não migrar formato de estado neste sprint.
- Se uma fatia travar, PARAR e entregar as anteriores — cada fatia é shippável sozinha.
- Conexão/reconexão de chip: fora de escopo; não encostar no WebwhatsBridge.
