# 04 — FINANCEIRO: DIREÇÃO DA RECEITA E PAINEL DE COBRANÇA

## O que já existe

- Recarga de créditos usa credencial da plataforma.
- Trava anti-fallback impede link do cliente final sem conta MP própria.
- Motor de cobrança logística por WhatsApp já existe dormente.

## O que falta

Resolver com segurança o contexto MP legado de assinatura/refund e criar transparência na tela antes de ampliar a automação.

## Microetapas

- [ ] 1. Mapear os call-sites de `resolveFinanceContext` por finalidade: assinatura HBX, recarga, cobrança do tenant e refund.
- [ ] 2. Provar quais caminhos de assinatura legada ainda executam em produção.
- [ ] 3. Escrever testes de caracterização para cobrança e estorno criados com token antigo.
- [ ] 4. Definir matriz de credencial por finalidade; receita HBX nunca usa token do lojista.
- [ ] 5. Implementar a menor mudança no helper, sem trocar a credencial de refund histórico.
- [ ] 6. Criar painel somente leitura em `/financeiro`: pendentes, vencidas, pagas, falhas e origem da cobrança.
- [ ] 7. Expor o toggle existente de cobrança WhatsApp sem duplicar motor.
- [ ] 8. Adicionar ações somente depois do painel estar validado.

## Guardrails

- Não gerar link com token master para dívida do cliente final.
- Não estornar em credencial diferente da cobrança original.
- Não ativar disparos enquanto o painel ainda divergir do backend.

## Pronto quando

Toda cobrança exibe origem e estado corretos, receita da plataforma não vaza para o tenant e refunds históricos continuam alcançáveis.

