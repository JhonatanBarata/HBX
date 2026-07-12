# 07 — SEGURANÇA FINANCEIRA E ISOLAMENTO DE TENANT

## Regra de execução

Uma linha por conversa. Começar por teste que demonstra o risco; corrigir; rodar gate; parar.

## P0

- [ ] Tornar reversão do Recovery atômica e com clamp contra repetição.
- [ ] Restringir marcar pago e refund do Recovery a permissão financeira explícita.
- [ ] Corrigir lifecycle `paid` para a notificação aprovada disparar uma vez.
- [ ] Proteger o handoff público de Vendas que expõe PII/CPF com sessão curta ou autenticação.
- [ ] Criar inbox durável/reconciliação para webhook que hoje pode retornar 200 sem processar.

## P1

- [ ] Adicionar idempotency key e lock em refund.
- [ ] Validar concorrência real dos grants de crédito; criar chave estrutural onde faltar.
- [ ] Tirar tokens MP de texto puro, com migração e rotação.
- [ ] Migrar novos cálculos de dinheiro de Float para centavos, sem big-bang.
- [ ] Modelar ledger master que ainda dependa de DDL/runtime sem unique estrutural.

## Tenant guard

- [ ] Rodar em `report` e classificar cada ocorrência legítima.
- [ ] Envolver pool global/Radar em bypass explícito e auditável.
- [ ] Ampliar cobertura para operações hoje fora do guard.
- [ ] Só depois pilotar `enforce` em ambiente controlado.

## Configuração live

- [ ] Observar assinatura MP em modo log com webhook real.
- [ ] Mudar `MP_WEBHOOK_SIGNATURE_MODE=enforce` em janela própria.
- [ ] Monitorar rejeições e manter rollback imediato.

## Legado

- [ ] Provar se preapproval/proração/alteração de plano ainda executam.
- [ ] Se mortos, remover em fatias com testes; se vivos, tratar como sistema financeiro ativo.

