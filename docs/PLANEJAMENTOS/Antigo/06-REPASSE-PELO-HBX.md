# 06 — RECEBER PELO HBX E CONTROLAR REPASSE

## Objetivo

Oferecer modo opcional em que o HBX recebe e o dono repassa manualmente ao lojista, com comissão, prazo, aceite e trilha completa.

## Dependência

Plano 05 concluído. Não misturar com o modo de conta MP própria.

## Microetapas

- [ ] 1. Fechar contrato de dados em centavos: bruto, comissão, líquido, prazo, limite e status.
- [ ] 2. Criar configuração por empresa no Master: habilitado, comissão e prazo.
- [ ] 3. Versionar termo; lojista aceita pela própria tela.
- [ ] 4. Criar ledger de repasse idempotente a partir de pagamento aprovado.
- [ ] 5. Exibir ao lojista valor e data prevista.
- [ ] 6. Exibir ao Master fila ordenada por vencimento.
- [ ] 7. Criar ação auditada “marcar pago”; o Pix continua manual.
- [ ] 8. Criar e-mail idempotente ao Master na data limite.
- [ ] 9. Tratar refund/chargeback antes e depois do repasse.
- [ ] 10. Pilotar em sandbox e depois em uma empresa.

## Guardrails

- Nunca esconder bruto, comissão ou prazo.
- Alterar comissão/prazo cria nova versão de aceite; não reescreve repasse antigo.
- Scheduler nasce OFF e com deduplicação estrutural.

## Pronto quando

Pagamento aprovado gera uma única obrigação, o lojista vê o líquido, o Master recebe o aviso e o histórico fecha inclusive com estorno.

