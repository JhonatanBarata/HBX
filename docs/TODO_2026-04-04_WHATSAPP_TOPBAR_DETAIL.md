# PRIORIDADE — 2026-04-04 — WhatsApp no topo e detalhe sob clique

## Problema

A tela do vínculo e QR ficou interessante visualmente, mas ainda tem informação demais no corpo da tela.

O botão de QR aparenta não executar a ação esperada.

## Direção desejada

Menos texto fixo na tela principal e mais status clicável no topo.

## Regra

O motor de WhatsApp deve aparecer na barra superior de status operacional.

Ao clicar nele, abrir o detalhe operacional.

## O que mostrar no topo

- WhatsApp
- Meta
- Token

## O que deve acontecer ao clicar em WhatsApp

Abrir painel, modal ou drawer com:

- status do vínculo
- QR Code
- pairing code, se existir
- número temporário
- última sincronização
- ações de conectar, atualizar leitura e desconectar

## O que mudar na tela principal

- remover guia longo e excesso de explicação
- manter só o essencial
- deixar o detalhe sob demanda

## Revisar amanhã

- se o botão de QR está realmente ligado ao fluxo
- se o backend gera QR real
- se existe QR ou pairing code disponível
- se o problema é UI, configuração ou motor ausente
- se no celular a experiência piora ou esconde a ação

## Resultado esperado

- topo com motor visível
- clique abrindo detalhe útil
- QR funcionando ou explicando claramente por que não funciona
- menos poluição
- operação melhor no celular
