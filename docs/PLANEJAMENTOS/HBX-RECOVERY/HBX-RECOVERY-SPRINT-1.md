# HBX Recovery — Sprint 1: Blindar o caixa

> Arquitetura nº14. Plano auditado em 01/07/2026 (worktree `claude/frosty-lewin-645f40`).
> **Frente financeira** → pela âncora do dono: Opus edita DIRETO + revisão obrigatória do diff (não delegar a Sonnet).
> Pré-requisito dos demais sprints. Nada aqui muda rota HTTP nem contrato com o frontend.

## Por quê primeiro
O Sprint 3 (executor de réguas) multiplica o volume de pagamentos. Ligar volume em cima de
saldo com corrida e webhook aberto amplifica o defeito. Blindar antes de escalar.

## Problema A — webhook Mercado Pago fail-open
`backend/src/hbx-recovery/hbx-recovery.webhook.controller.ts` (e o irmão
`backend/src/financeiro/financeiro.webhook.controller.ts`): assinatura só é validada se
`MERCADO_PAGO_WEBHOOK_SECRET` estiver setada; sem a env, aceita qualquer POST com warning.
`company_id` vem da query string.

### Correção em 2 FASES (fail-closed mal feito derruba confirmação de pagamento = pior que hoje)
1. **Fase 1 — observar:** configurar `MERCADO_PAGO_WEBHOOK_SECRET` no VPS (painel MP → Webhooks
   → assinatura secreta). Deploy com modo `log-only`: valida, loga `valid/invalid`, mas NÃO rejeita.
   Env de controle: `MP_WEBHOOK_SIGNATURE_MODE=log|enforce` (default `log`).
   ATENÇÃO INFRA: mudança de env_file no VPS = **RECREATE** do container, não restart.
2. **Fase 2 — enforce:** após ≥48h de logs 100% `valid` em webhook real, trocar para `enforce`.
   Em produção sem secret configurada + modo enforce → rejeitar com 403 e logar ERRO (nunca aceitar).
3. Validação cruzada do tenant: após o fetch no MP, conferir que `external_reference` começa com
   `hbx-recovery-{companyId}-` (ou `hbx-recovery-auto-{companyId}-`) OU que
   `metadata.company_id === companyId`. Divergiu → não processar, logar.

## Problema B — saldo com corrida (read-modify-write sem transação)
`backend/src/hbx-recovery/hbx-recovery.service.ts:3066` (`applyPayment`) e `:3091`
(`reversePayment`): `findCustomer` → cálculo em JS → `update` com valores absolutos.
Webhook MP e `markPaid` manual simultâneos corrompem `openAmount`/`totalPaid`.

### Correção
1. Envolver cada um em `this.prisma.$transaction(async (tx) => { ... })` com leitura e escrita
   no mesmo `tx`, e lock otimista: `updateMany({ where: { id, updatedAt: row.updatedAt }, ... })`;
   `count === 0` → retry (máx 3) relendo o row. (Alternativa aceita: `SELECT ... FOR UPDATE` via
   `$queryRaw` dentro do tx — escolher UMA abordagem e aplicar nas duas funções.)
2. `syncMercadoPagoPayment` (`:3162`): a sequência update-payment → applyPayment → update-payment
   também entra no tx OU vira idempotente por checagem de `appliedToCustomerAmount` (já é delta-based,
   manter, mas dentro da transação).
3. NÃO mexer na lógica de negócio (score, averageDelay etc.) — só atomicidade.

## Critérios de aceite
- [ ] Modo `log` default; `enforce` rejeita assinatura inválida/ausente com 403; ambos controllers MP.
- [ ] Teste: 2 chamadas concorrentes de `applyPayment` no mesmo cliente → `openAmount` final correto
      (adicionar caso em `hbx-recovery.service.test.ts`).
- [ ] `cd backend && npx tsc --noEmit` verde; testes existentes do módulo verdes.
- [ ] Nenhuma rota/contrato alterado.

## Guardrails
- NÃO ligar `enforce` no mesmo deploy que introduz a validação.
- NÃO tocar em conexão de chip WhatsApp (fora de escopo).
- Migration nenhuma neste sprint (zero mudança de schema).
