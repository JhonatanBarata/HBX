# Passo 11 - Enriquecimento gratis antes de salvar

## Problema

O cockpit podia mostrar muitos cards processados em 24h e `EMAIL 24H = 0` porque o card era salvo/contado antes do enriquecimento web procurar email publico.

Tambem havia um problema de DTO: `requiredChannels` e `channelMatchMode` eram normalizados como vazios, entao o backend nao sabia que o filtro "Email obrigatorio" tinha sido pedido.

## Decisao

Quando o filtro exigir `email`, `website`, `instagram` ou `facebook`, o backend deve tentar enriquecimento gratuito antes de salvar o item do run.

O motor HBX continua recebendo uma chamada limpa, sem `requiredChannels`, porque esse filtro e regra de decisao do backend. O backend guarda o filtro no run, usa para enriquecer/contar, mas nao transforma isso em contrato bruto do motor.

## Sem API paga

O caminho usa fontes gratuitas ja existentes:

- buscas via HBX scraping engine;
- probes publicos de site/rede social;
- crawler leve de website quando as flags existentes estiverem ligadas.

Nenhuma API paga foi adicionada.

## Resultado esperado

Em novos runs com "Email obrigatorio", um card encontrado sem email deve passar por enriquecimento gratuito antes do save. Se o email publico for encontrado, o item e salvo com `email` e `emailStatus`, e passa a contar como match do filtro.

Cards antigos ja salvos sem email nao mudam sozinhos. Para corrigir historico, precisa reprocessar/backfill de enriquecimento.
