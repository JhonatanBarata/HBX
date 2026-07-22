# Worker D — RESULTADO (C4 — SVG à mão e `style=` inline fora do catálogo)

Arquivos autorizados (só estes dois):
- `EntregaShell/app/src/logistica/assets/app/app.js`
- `EntregaShell/app/src/vendas/assets/app/app.js`

**Nenhum commit gerado.** Depois de investigar cada item do inventário na fonte (posição de
byte/linha real, não estimativa), os 4 grupos do inventário resolveram em: 2 falsos-positivos de
contagem, 1 caso já excluído por instrução explícita, 2 casos de valor dinâmico legítimo (não é
"aparência decidida no lugar de uso"), e 5 casos reais em `vendas` que precisam de uma classe que
**não existe** em `app.css` — arquivo que não é meu. Segui a instrução ao pé da letra: "se realmente
não houver [classe], deixe o inline, anote no RESULTADO com a regra CSS exata que falta". Zero
pixel mudou. Detalhe de cada item abaixo, pro dono conferir minha conta.

---

## 1. `<svg` fora do `icon()` em `logistica/app.js` — inventário dizia 4

Contagem real de `<svg` no arquivo (via posição de char, não grep): **exatamente 4**, e são estas:

| Linha | O que é | Veredito |
|---|---|---|
| 359 | `return \`<svg class="hbx-icon" ...>${paths[iconName]}</svg>\`` | É o **próprio `icon()`**, a definição do catálogo. Não é "fora do catálogo" — é o catálogo. Não conta. |
| 1316 | `nextStopOverlay` — anel de contagem regressiva (`.next-stop-count`, viewBox 70×70, 2 `<circle>` track/progress) | Não é ícone — ver seção 2. |
| 3580 | `routeTransmuxControl` — disco play/gps/stop | **Excluído por instrução explícita** (já convertido hoje, commit `66a9c388`). Não toquei. |
| 3933 | `dayReview` — anel "Gerando rota…" (`.route-plan-count`, viewBox 70×70, 2 `<circle>` track/progress) | Não é ícone — ver seção 2. |

Ou seja: dos "4 fora do catálogo" do inventário, 1 é o catálogo em si (miscontagem de um grep cru
por `<svg` que não filtrou a própria definição) e 1 já foi resolvido por outro commit desta mesma
sessão. Sobram genuinamente **2** para eu avaliar — próxima seção.

## 2. Os 2 anéis de progresso (linha 1316 e 3933) — por que não viraram `icon()`

Os dois são a MESMA estrutura, duplicada: dois `<circle>` (`*-track` e `*-progress`) num
`viewBox="0 0 70 70"`, girado -90° em CSS, mais um `<i>` com o número/✓ no centro. É um **medidor de
progresso circular** (contagem regressiva "próxima parada" / "gerando rota"), não um pictograma.

Não força pro `icon()` porque:
- **Não existe glifo Lucide equivalente.** O catálogo guarda pictogramas fixos de 24×24 (seta,
  caixa, check...). Um anel de progresso não é um desenho fixo — é dois círculos concêntricos cujo
  preenchimento muda com o estado (`stroke-dashoffset`/`stroke-dasharray`). Substituir por um
  `icon("algumacoisa")` não seria "aparência diferente, mesmo desenho" — seria **apagar a função**
  do widget (a barra deixaria de mostrar o progresso).
- **Já não tem `fill=`/`stroke=`/`stroke-width=` cravado no path** (conferido linha a linha) — a cor
  vem 100% de classe (`.next-stop-track`, `.next-stop-progress`, `.route-plan-count-track`,
  `.route-plan-count-progress`, todas em `app.css` usando `var(--brand)`/`var(--brand-soft)`, sem
  hex). Ou seja, o pecado que o catálogo existe pra evitar (cor decidida no lugar de uso) **já não
  acontece aqui** — só a geometria em si não é um ícone.
- É exatamente a mesma categoria do disco de rota (linha 3580) que o próprio pedido excluiu de
  conversão nesta rodada — tratei os dois com a mesma régua.

**Não decidi sozinho não fazer nada com eles** — decidi não forçar uma substituição sem
equivalente, e documento aqui pro dono julgar. Se quiser, os dois pontos são candidatos a uma
função compartilhada (`progressRing(...)`) pra parar de duplicar a mesma marcação em dois lugares —
isso é DRY, não é "ícone", e fica fora do que este sprint pediu; registro como sugestão, não
implementei.

## 3. `<svg` fora do `icon()` em `vendas/app.js` — inventário dizia 1

Contagem real (via posição de char, não grep): **exatamente 1** `<svg` no arquivo inteiro — e é a
própria definição de `icon()` (linha 58). Não há nenhum outro `<svg`, `data:image/svg+xml`,
`createElementNS` ou construção de SVG por fora do helper. O item do inventário não se confirmou:
não há nada "fora do catálogo" pra converter em `vendas/app.js`. Registrando o achado, não inventei
uma conversão pra ter o que reportar.

## 4. `style=` inline em `logistica/app.js` — inventário dizia 3, todos revisados e mantidos

| Linha | Trecho | Por que ficou |
|---|---|---|
| 1316 | `style="stroke-dashoffset:${ringOffset}"` | Valor **calculado por render** (contagem regressiva 5→1). `app.css` já declara `.next-stop-progress { transition: stroke-dashoffset 1s linear; }` — o inline é só o alvo numérico que dispara a transição CSS. Não tem como isso ser uma classe (mudaria a cada render). |
| 1853 | `style="width:${pct}%"` (progresso de download do APK) | Mesma categoria: `.app-update-progress i` já tem `transition: width .2s ease` em `app.css`; o inline só passa o número. |
| 3466 | `style="width:${progress}%"` (barra de progresso da rota) | Idem: `.progress i` em `app.css` só declara `background`/`border-radius`; a largura tem que vir de algum lugar dinâmico. |

Nenhum dos 3 é "aparência decidida no lugar de uso" (não há cor, borda, fonte ou radius solto) — são
valores de **estado calculado**, a única forma de alimentar uma transição CSS com um número que só
existe em tempo de execução. Forçar isso pra uma "classe" exigiria a folha injetar uma regra nova a
cada render (a própria anti-prática que o C3 está matando em `mobile-contract.js`/
`offline-controls.js`) — seria trocar um problema por outro pior. Mantive os 3, sem mudança.

## 5. `style=` inline em `vendas/app.js` — inventário dizia 5, todos confirmados, todos precisam de CSS que não existe

Os 5 são reais e são **decisões estáticas** (nunca mudam por estado) — ao contrário dos 3 de
`logistica`. Busquei em `app.css` inteiro por classe equivalente antes de decidir; nenhuma bate sem
efeito colateral (as únicas que já zeram `margin-top` — `.delivery-big-btn`, `.chegada-btn`,
`.route-plan-confirm-button`, `.client-editor-part > .section-title:first-of-type` — trazem junto
outras propriedades erradas pro contexto, ou usam valor diferente de 0). Como manda a regra ("se
realmente não houver, deixe o inline, anote a regra CSS exata"), **mantive os 5 sem alteração** —
aplicar uma classe sem CSS por trás quebraria o layout até o dono publicar o CSS, e isso seria pior
que o inline atual.

| Linha | Trecho atual | Classe proposta (pra eu aplicar depois que existir) | Regra CSS exata que falta em `app.css` |
|---|---|---|---|
| 105 | `<input ... style="text-transform:uppercase">` (campo UF do Radar) | `input-uppercase` | `.input-uppercase { text-transform: uppercase; }` |
| 119 | `<div class="section-title" style="margin-top:0">` ("Conversão · 30 dias", 1º elemento do card) | `section-title-flush` | `.section-title-flush { margin-top: 0; }` |
| 119 | `<div class="kpis" style="margin-bottom:0">` (mesmo card, último elemento) | `kpis-flush` | `.kpis-flush { margin-bottom: 0; }` |
| 120 | `<div class="section-title" style="margin-top:0">` ("Equipe", mesmo padrão do 119 — **mesma classe** `section-title-flush`, já é 2 usos, não 1) | `section-title-flush` (reaproveita a de cima) | (mesma regra acima — 2 usos, 1 classe) |
| 121 | `<p class="subtitle" style="text-align:center;margin-top:14px">` (rodapé de versão) | `subtitle-footer` | `.subtitle-footer { text-align: center; margin-top: 14px; }` (não é o mesmo valor de `.subtitle-gap`, que é 8px — não posso arredondar pro existente sem mudar o pixel) |

Assim que essas 3 regras existirem em `app.css`, é uma troca de 1 linha por ocorrência em
`vendas/app.js` (5 trocas, 2 delas reaproveitando a mesma classe) — aviso porque é trabalho
trivial, só está bloqueado por não ser meu arquivo.

## Ressalvas / achados fora do escopo pedido (não mexidos)

1. **`<i>${count || "✓"}</i>` nos dois anéis (linha 1316 e 3933)** usa o caractere Unicode "✓" solto
   em vez de `icon("check", ...)` (que existe no catálogo, linha 325). Não é `<svg>` nem
   `style=` — fora da lista exata deste sprint — mas é a mesma família de inconsistência (às vezes
   ícone do catálogo, às vezes glifo textual solto). Não troquei porque mudaria o resultado visual
   (tamanho/peso do check muda) sem estar no pedido; registrando pro dono decidir se entra num
   sprint futuro.
2. **Duplicação do anel de progresso** (seção 2) — candidato a virar 1 função só; não implementei
   por ser além do escopo ("SVG à mão → catálogo de ícone", não "extrair componente novo").
3. Nenhum `icon("nome")` chamado nos dois arquivos referencia uma chave ausente do catálogo
   `paths` — conferi todos os 26 nomes usados em `logistica` e os 10 em `vendas` contra as chaves
   definidas; nenhum cai no fallback silencioso (`box`/`more`). Não havia glifo faltando pra trazer
   do Lucide.

## Verificação

`node --check` nos dois arquivos, antes e depois (arquivos idênticos, nenhuma edição feita):
```
node --check EntregaShell/app/src/logistica/assets/app/app.js   → OK
node --check EntregaShell/app/src/vendas/assets/app/app.js      → OK
```

Não testei em aparelho (não houve mudança de código pra testar).
