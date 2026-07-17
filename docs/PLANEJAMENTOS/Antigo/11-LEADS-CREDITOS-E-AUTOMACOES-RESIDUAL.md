# 11 — LEADS, CRÉDITOS E AUTOMAÇÕES: RESÍDUOS

## Prioridade comercial

- [ ] 1. Revalidar o payload de inteligência e aplicar gate real no backend; blur visual não é paywall.
- [ ] 2. Tornar falha de entitlement fechada para dados pagos.
- [ ] 3. Decidir um contrato de pesquisa salva: ligar o front nos endpoints dedicados ou remover os órfãos.
- [ ] 4. Se mantido, adicionar URL compartilhável e renomear pesquisa salva.

## Créditos

- [ ] 5. Criar scheduler idempotente para `expireLots`.
- [ ] 6. Revalidar necessidade do teto por vendedor antes de implementar.
- [ ] 7. Criar backfill seguro para valores negociados sobrescritos antes do fix.
- [ ] 8. Remover código morto de plano/tier somente após prova de zero call-sites vivos.
- [ ] 9. Definir preço de packs, percentual de comissão e regra de dois vendedores.

## Automações

F1 e-mail real e F3 ponte Bot ↔ Automações já existem; não refazer.

- [ ] 10. Ligar runner de cadência somente após teste com destinatário controlado.
- [ ] 11. Conectar gatilho ao Bot somente com decisão explícita do dono e teto de envio.
- [ ] 12. Adicionar estado operacional e auditoria antes de qualquer automação live.

## Resíduos menores

- [ ] 13. Criar backfill do Núcleo para leads anteriores à flag.
- [ ] 14. Exibir badge de cobrança Recovery na ficha logística.
- [ ] 15. Criar ação manual para item offline em `needs_attention`.
- [ ] 16. Exibir falhas de efeito logístico no cockpit Master.

## Regra

Cada checkbox é uma conversa independente. Não transformar este plano em refactor geral.

