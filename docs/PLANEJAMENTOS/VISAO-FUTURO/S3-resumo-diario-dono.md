# S3 — RESUMO DIÁRIO DO DONO NO WHATSAPP (DORMENTE — flag OFF + toggle por tenant OFF)

> Frente VISAO-FUTURO, 11/07/2026. Toda manhã o dono do tenant recebe no WhatsApp dele um
> resumo do negócio: vendeu X ontem, Y entregas hoje, Z clientes devendo. O chip que envia
> é o DA PRÓPRIA EMPRESA. Retenção pura, custo ~zero.

## O que construir
1. **Scheduler** novo `backend/src/logistica/resumo-diario.service.ts` (anatomia clone de
   `backend/src/contabil/obligation-scheduler.service.ts`: OnModuleInit/OnModuleDestroy, setInterval,
   guard `running`, tick ~10min que checa hora-alvo por empresa). Provider registrado em
   `backend/src/logistica/logistica.module.ts` (NÃO em app.module.ts — arquivo quente de sessão paralela).
2. **Conteúdo do resumo** (só dados que os serviços já expõem — reusar métodos existentes, ex.
   `resumoDia` em `logistica.service.ts:1593`, `saldosFinanceiro:1956`; NÃO criar query pesada nova):
   - Entregas de hoje (agendadas/na rota) e de ontem (entregues).
   - Recebido ontem (charges pagas) e total em aberto ("quem me deve") — só se `moduloFinanceiroAtivo`.
   - Mensagem PT-BR curta, sem textão (3-6 linhas), sem valores se o módulo financeiro do tenant estiver OFF.
3. **Destino**: `Company.contactPhone` SOMENTE com `contactPhoneVerifiedAt != null` (campos já existem,
   schema.prisma:34,38). Sem telefone verificado → pula empresa em silêncio (log debug).
4. **Envio**: EXCLUSIVAMENTE `conversations.queueOutboundForCompany(companyId, { to, body,
   sourceModule:'resumo_diario', senderType:'system' })` — nunca bridge cru.
5. **Idempotência dura**: 1 resumo por empresa/dia — persistir marca (campo `resumoDiarioUltimoEnvio DateTime?`
   na LogisticaConfig cobre: só envia se `ultimoEnvio` < hoje 00:00). Restart não reenvia.
6. **Toggles**: flag global `HBX_RESUMO_DIARIO_ENABLED` (arquivo `backend/src/logistica/resumo-diario.flags.ts`,
   formato de credits.flags.ts) **default OFF** + por tenant `LogisticaConfig.resumoDiarioAtivo Boolean @default(false)`
   + `LogisticaConfig.resumoDiarioHora Int @default(7)` (hora local 0-23).
7. **UI mínima**: card "Resumo do dia no WhatsApp" nos Ajustes da entrega
   (`frontend/src/app/entrega/ajustes/page.client.tsx`), admin-only: toggle + seletor de hora.
   Expor via GET/PATCH /logistica/config existente (whitelist no service). Aparecer só se o config
   derivado disser que a feature global está disponível (mesmo padrão do S2).

## Regras duras
- Teto: 1 mensagem/empresa/dia POR CONSTRUÇÃO (a marca de idempotência é o teto). Sem retry, sem loop:
  falhou o envio → loga, marca tentativa NO MÁXIMO 1 retry no tick seguinte do MESMO dia, depois desiste até amanhã.
  (Implementar retry simples: só marcar `ultimoEnvio` quando o queueOutbound aceitar; limitar tentativas/dia a 2 em memória.)
- Fuso: usar o relógio do servidor (VPS = America/Sao_Paulo; conferir se há helper de data no repo e usar o padrão da casa).
- LEI DO VENDEDOR: valores financeiros só vão na mensagem porque o DESTINO é o dono (ADMIN/USERMASTER).
  Nunca enviar para User comum.

## Schema (migration FORMAL, arquivo só — o dono aplica)
- `LogisticaConfig.resumoDiarioAtivo Boolean @default(false)`
- `LogisticaConfig.resumoDiarioHora Int @default(7)`
- `LogisticaConfig.resumoDiarioUltimoEnvio DateTime?`
⚠️ A sprint S2 (rodou ANTES) também mexeu em LogisticaConfig — puxe o schema.prisma ATUAL antes de editar
e crie migration própria com timestamp posterior.

## O que NÃO fazer
- NÃO tocar app.module.ts, shell.tsx, globals.css, arquivos da frente Financeiro (financeiro-tenant/), nem vendas/*.
- NÃO enviar para número não-verificado; NÃO inventar fallback pro telefone do User.
- NÃO commitar; NÃO criar branch.

## Testes (node:test co-locado, Prisma mock)
`resumo-diario.service.test.ts`: (1) flag global OFF → no-op; (2) tenant OFF → pula; (3) telefone não-verificado → pula;
(4) idempotência por dia (2 ticks, 1 envio); (5) hora-alvo respeitada (tick antes da hora não envia).

## Critérios de aceite
1. Sem a env: deploy 100% inerte.
2. tsc backend verde; testes novos verdes; lint front verde se tocou front.
3. Mensagem exemplo (PT-BR, curta):
   "Bom dia! Resumo de hoje: 8 entregas na rota. Ontem: 12 entregues, R$ 340 recebidos. Em aberto: R$ 1.250 (9 clientes)."
