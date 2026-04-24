# RULE UI UX GLOBAL

Arquivo canonico para regras globais de UI/UX do HBX.

Observacao:
- este arquivo passa a ser o destino oficial das regras globais;
- o conteudo detalhado pode ser consolidado aqui gradualmente;
- evitar criar novas regras globais fora de `docs/rules/global`.

## Regra 1 — E proibido translinear palavras na UI

Nenhum card, botao, chip, metrica, label, menu ou titulo curto pode quebrar palavra no meio para caber no layout.

Quando o espaco nao comportar o texto, a solucao correta deve seguir esta ordem:
- reorganizar o layout para dar largura real ao conteudo;
- reduzir o rotulo para uma versao mais curta e clara;
- aplicar `white-space: nowrap` em textos curtos e semanticos;
- usar truncamento ou ajuste de bloco antes de aceitar quebra ruim.

Regras obrigatorias:
- nao usar `word-break: break-all` em elementos de interface;
- nao usar hifenizacao automatica para mascarar problema de layout em textos curtos;
- nao deixar CTA, tabs, badges, metricas e atalhos com palavras partidas entre linhas;
- em componentes compactos, preservar leitura limpa mesmo no light/dark e em todos os temas.

Se uma palavra so cabe quebrando no meio, o componente ainda nao esta resolvido visualmente.
