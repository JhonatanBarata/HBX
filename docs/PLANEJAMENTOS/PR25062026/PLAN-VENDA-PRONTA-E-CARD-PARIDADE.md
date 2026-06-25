# E — Paridade do card DetalhesNegocio (passo final)

**Pedido:** o card do /atendimento tem que ser idêntico ao do /vendas (imagem 4), com a única diferença
do "sem interesse" (tratada no plano D).

## Por que por último
`DetalhesNegocio` já é UM componente nas 3 telas
([detalhes-negocio.tsx](../../../frontend/src/components/hbx/detalhes-negocio.tsx)). B (troca o modal de
fechar no /vendas) e D (botão sem-interesse + finalizadas) **mexem no card**. Igualar antes = retrabalho.
Bloqueado por B e D.

## Desenho
- Comparar render do card em `vendas/page.client.tsx` × `atendimento/page.client.tsx`: mesmas ações,
  mesma ordem, mesmo botão herói "Fechar venda" (o do /atendimento é o de referência visual).
- Fechar **gaps de dado por tela** (material do expurgo 21/06): o que aparece numa e não na outra por
  falta de dado, não por design. Onde o dado não existe naquela tela, esconder o campo (não inventar).
- Diferença única permitida: "sem interesse" no /atendimento (plano D).

## Verificar
- Abrir o mesmo tipo de card nas 2 telas → visual e ações idênticos (fora a diferença do D).
- lint + build.

## Reversão
- `git revert`. Só front (provável).
