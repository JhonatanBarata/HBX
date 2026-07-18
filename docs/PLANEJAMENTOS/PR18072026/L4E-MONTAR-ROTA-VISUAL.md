# L4-E — Montar rota: visual novo (mockup APROVADO pelo dono)

Aplicar o mockup dark aprovado (3 telas) no fluxo real. Arquivos:
`EntregaShell/app/src/logistica/assets/app/app.js` (funções: modal "manage-day" ~linha 931-951,
`dayOrderChooseModal` ~994, `dayOrderManualModal` ~1003, `dayOrderSavedModal` ~1017) +
`EntregaShell/app/src/main/assets/app/app.css`.

## REGRA DE OURO
Manter TODAS as `data-action`/máquina de estados/handlers EXATAMENTE como estão
(day-chip `data-day`, choose-route-order, order-mode-app/manual/saved, manual-order-up/down,
toggle-manual-save, confirm-manual-order, apply-route-modelo, back-route-order,
confirm-managed-route, close-modal, busca `day-preview-search`). Só markup interno + CSS.

## Referência visual (mockup aprovado, adaptar cores pra TOKENS do app.css)
- **Passo 1 (dias + prévia)**: header ícone+título "Montar rota"/subtítulo "Escolha os dias";
  chips de dias; resumo destacado "N paradas em X dias" (número verde grande); busca; cards de
  cliente com avatar-iniciais + linha de itens ("2× Galão 20L · Ter, Sáb") + pill vermelha "GPS"
  quando sem localização (hoje é `day-preview-location-invalid`/"Localização"); CTA grande
  gradiente verde "Próximo ›".
- **Passo 2 (Como montar?)**: subtítulo "N paradas prontas"; 3 cards grandes com ícone colorido
  em caixinha: Automática/verde "O app traça o caminho mais curto" (= order-mode-app),
  Minha ordem/azul "Você arrasta e organiza as paradas" (= order-mode-manual),
  Rota salva/âmbar "Repetir uma ordem que você guardou" (= order-mode-saved).
  Textos do mockup valem (dono aprovou).
- **Passo 3 (Sua ordem)**: subtítulo "Toque nas setas para mover"; linhas com número em
  badge verde + nome + ▲▼ GRANDES (≥52px de alvo, lei do velho e do newbie — feedback
  explícito do dono: "minha ordem tem q ficar fácil de usar"); ao mover, feedback visual
  (flash/realce da linha que mudou); manter checkbox "Salvar como minha rota de {dia}" e
  botões Voltar/"Gerar agora" (CTA verde grande).
- **dayReview (prévia+countdown)**: só harmonizar com o novo visual (mesmos cards), sem
  mexer na lógica do countdown/mapa.

## CSS
Classes novas prefixadas `rp2-` (route-plan v2) no app.css usando var(--surface)/var(--line)/
var(--danger)/var(--accent...) — espiar os tokens no topo do arquivo. Gradiente verde do CTA:
reutilizar o padrão do `.route-transmux` (já existe gradiente verde lá). Sem hex novo onde
existir token. Dark é o tema base do app — conferir que light não quebra (tokens cuidam).

## Regras
- `node --check` no app.js. Screenshots/validação visual = orquestrador no celular.
- Não commitar.
