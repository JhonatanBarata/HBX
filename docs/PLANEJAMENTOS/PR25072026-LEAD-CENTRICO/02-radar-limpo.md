# S2 — Radar limpo: segmento explícito volta a ser filtro DURO + motivo de inclusão

## Problema (relato do dono 25/07)
"Selecionei distribuidoras no segmento e chegou cada lixo." Causa mapeada: em 03/07 a porta da
Receita foi amolecida — candidato com CNAE fora do segmento ATRAVESSA (só `logAdvisory`), ver
`backend/src/webscraping/radar/providers/cnpj-public/cnpj-public-provider.service.ts` ~136–141
(comentário FUTURO no local já prevê o retorno do filtro duro). A lane web (`free_pj`) também
entrega lixo de segmento (bug conhecido à parte). O dono MUDOU a decisão em 25/07: qualidade
de entrada vem antes de volume.

## Entrega
1. **Porta da Receita dura de novo quando há segmento explícito**: se o cliente pediu segmento,
   candidato sem match de CNAE/segmento é REJEITADO (`rejectedCount++` + `logRejected` com motivo
   `segmento_sem_match_cnae`). Sem segmento pedido → comportamento atual intacto.
2. **Exclusões vencem similaridade**: lista curta de CNAEs/termos proibidos por segmento pedido
   (começar por distribuidora: excluir transporte de carga, varejo puro, energia/água/combustível,
   serviços financeiros, empresa baixada). Estrutura de dados extensível (mapa segmento→exclusões),
   não hardcode espalhado.
3. **Mesmo critério na lane web**: quando há segmento explícito, aplicar o mesmo match/exclusões
   no gate de qualidade da lane web antes de persistir/entregar (onde hoje o `free_pj` passa
   batido). Não tocar no merger/fusão em si.
4. **Motivo de inclusão persistido e visível**: cada card entregue grava POR QUE entrou
   (ex.: `metadataJson.inclusionReasons: ["cnae_compativel", "cidade_uf_ok", ...]` — aditivo,
   sem migration se possível). Expor no `buildRadarLeadPublic` e mostrar no front como tooltip/
   badge discreto no card (reusar moldura de badge existente da vitrine/vendas — zero hex).
   Regra do PDF endossada pelo dono: "se o sistema não explica por que a empresa entrou, ele
   não sabe por que ela entrou".

## O que NÃO fazer
- Não mexer no gate de estoque (`vendas_stock_limit_start`) — bug conhecido SEPARADO.
- Não mexer em fusão/merger, fábrica de enriquecimento, governor de fontes.
- Não tocar em atendimento/recovery/Webwhats nem no trabalho paralelo não-commitado.

## Aceite
- Testes unitários: segmento pedido + CNAE errado = rejeitado; sem segmento = passa; exclusão
  vence nome parecido ("Distribuidora de Energia X" não entra em distribuidora).
- Suíte do radar tocada verde + typecheck. (Falhas PRÉ-existentes conhecidas: `cnpj_public
  provider filter` e `elastic engine sync` — conferir na baseline ANTES de mexer pra não
  confundir com regressão sua.)
- Commit local: `feat(radar): segmento explicito e filtro duro + motivo de inclusao (S2 LEAD-CENTRICO)`.
- Guardrails gerais: `00-FRENTE.md` desta pasta (branch master, add por caminho, sem publish).
