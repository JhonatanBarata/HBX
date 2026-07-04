# HBX Recovery — Sprint 6: ModuleConfig tipada + higiene

> Arquitetura nº14. Depende do Sprint 5 (templates já fora da tabela-sentinela).
> Executor: subagente Sonnet. Último da fila de propósito — é higiene, não risco nem receita.

## Problema A — `HbxRecoveryFlowStage` virou KV improvisado
Além das réguas reais, a tabela guarda por linha-sentinela (channel/title mágicos):
config do bot Recovery (`__HBX_RECOVERY_BOT_CONFIG__`), config do bot Atendimento, agenda do
Atendimento, e configs do bot-activation (mesmo padrão, `bot-activation.service.ts:51-80`).
Escrevem nela DIRETO: `hbx-recovery.service`, `messaging.service` (`:601`, `:4073`, `:4095`),
`inbox.service` (`:2407-2432`, `:2521`), `bot-activation.service`. Toda query de régua precisa
filtrar channels internos (`recoveryFlowStageWhere`).

### Solução
1. Nova tabela `CompanyModuleConfig { id, companyId, moduleKey, configKey, payload String,
   version Int @default(1), updatedAt, @@unique([companyId, moduleKey, configKey]) }` (migration).
2. Helper único `backend/src/common/module-config.store.ts` (`get/save(companyId, moduleKey,
   configKey, normalizer)`) — substitui os 4 pares getConfigRow/saveConfigRow espalhados.
3. Migração idempotente das linhas-sentinela → tabela nova; dual-read por 1 release;
   depois `deleteMany` das sentinelas (INCLUINDO as de templates já migradas no Sprint 5)
   e simplificação do `recoveryFlowStageWhere` para `{ companyId }`.
4. `inbox.service` criar `hbxRecoveryCustomer` direto (`:8336-8361`): trocar por método público
   do módulo recovery (`ensureCustomerFromConversation`) — fecha o último escritor externo.

## Problema B — higiene de protótipo
1. **Assinatura hardcoded**: `hbx-recovery.service.ts:112` — default
   `'Equipe Colsani Ar Condicionado e Manutenções'` (cliente específico!) na mensagem de
   pagamento aprovado de TODAS as empresas. Vira campo `approvedPaymentSignature` no bot config
   (default = nome da empresa cobradora), editável no painel do bot.
2. **`lastContact` string de apresentação** ("Hoje, 09:12") no banco: adicionar
   `lastContactAt DateTime?`, escrever os dois em paralelo (label continua pro frontend não
   quebrar), frontend migra pra formatar `lastContactAt` quando tocar nessas telas.
3. **Seed demo** (20 empresas fake, `default-seed.ts`): `POST customers/reset-seed` e o auto-seed
   só com `HBX_ALLOW_DEMO_SEED=1` (default off em produção). Runner do Sprint 3 já curto-circuita
   os números do seed; aqui fecha a porta de entrada.
4. **`user: any`**: tipo `AuthUser { id, companyId, role, isSystemMaster? }` em
   `backend/src/auth/` e assinatura dos métodos públicos do módulo recovery migrada.
5. **Decimal** (se foi adiado no Sprint 2): executar aqui conforme descrito lá.
6. Decisão pro dono (não executar sem resposta): acesso ao Recovery hoje é gate
   `ModuleAccess('atendimento')` — existe systemModule `hbx_recovery` mas o controller não usa.
   Recovery é vendido junto do atendimento (manter) ou vira módulo cobrável próprio (trocar guard)?
   Impacto direto em plano/preço.

## Critérios de aceite
- [ ] Zero acesso a `hbxRecoveryFlowStage` fora do módulo recovery (grep nos 4 services).
- [ ] Configs de bot (recovery, atendimento, agenda, activation) leem/escrevem idêntico pré/pós
      migração — testar painéis no chrome, localhost/3001.
- [ ] Nenhuma linha-sentinela restante na tabela; réguas listadas sem filtro de channel.
- [ ] Mensagem de pagamento aprovado usa assinatura da empresa, não "Colsani".
- [ ] `npx tsc --noEmit` verde; testes verdes.

## Guardrails
- Dual-read antes de deletar sentinela; deleção só com painéis validados.
- Item 6 é PERGUNTA pro dono, não tarefa.
