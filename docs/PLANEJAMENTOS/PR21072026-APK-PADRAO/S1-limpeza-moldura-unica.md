# S1 — Limpeza de código morto + estilo inline → classe + moldura/cabeçalho único

**Por quê primeiro:** código morto é a máquina de "erro que já foi corrigido voltar" — quem
edita o branch morto acha que consertou e o bug segue vivo no branch real.

## Evidências (conferidas 21/07)

1. **Código MORTO em `modal()`** (`app.js` ~2195-2207): os dois primeiros `if` retornam
   `clientEditorModal(false|true)` para `state.modal === "client-product"` e `"new-client"`;
   logo abaixo existem OUTROS dois `if` com as MESMAS condições contendo versões antigas
   inteiras dos dois modais (unreachable). O mesmo vale para `"new-client"` na linha ~2207.
2. **22 `style="` inline no app.js** — concentrados em `deliverySimpleSheet` (~2134) e
   `deliveryOfflineSheet` (~2142): nome gigante, "Deve R$", botões 64px, link "Ver detalhes",
   card de observações do `deliverySheet` (~2156), botão extra do `confirmationOverlay` (~442),
   `nextStopOverlay` actions (~435).
3. **`clientAddressText` duplica o número** quando `endereco` do cadastro já contém "nº X"
   (cosmético conhecido, memória `pr20072026-rota-salva`).
4. **Classe com nome mentiroso**: `.day-saved-delete` no CSS (~615) hoje veste o botão
   EDITAR (`day-saved-edit`) — a lixeira já morreu, mas o nome convida a recriá-la.

## Tarefas

1. Apagar os branches unreachable de `modal()` (as versões antigas de client-product e
   new-client). Conferir antes, por leitura, que NADA neles é exclusivo (qualquer detalhe só
   presente no morto → confirmar no aparelho que a versão viva cobre; se cobrir, apagar).
2. Migrar os inline styles ESTÁTICOS para classes no app.css (sugestão de nomes:
   `.delivery-hero-name`, `.delivery-deve`, `.delivery-big-btn`, `.delivery-detail-link`,
   `.delivery-obs-card`, `.app-confirm-extra`). Inline DINÂMICO fica (ex.:
   `stroke-dashoffset:${ringOffset}` do anel, width de progresso) — é valor, não estilo.
3. Fix do número duplicado: onde monta o texto de endereço da Leitura (buscar
   `clientAddressText` no app.js), se `endereco` já termina com o mesmo número, não repetir.
4. Renomear `.day-saved-delete.day-saved-edit` → só `.day-saved-edit` (CSS + app.js ~2518).
   Comentário curto no CSS: "editar; exclusão é segurar no card (Lei 1)".
5. Passada de olho nos 4 modais de formulário que seguem bottom-sheet (`new-product` ~2208,
   `new-delivery` ~2216, `new-oneoff` ~2221, `client-edit-modal` ~2193): manter sheet (form
   grande PODE ser sheet), mas garantir cabeçalho idêntico (`sheet-head` = avatar + h2 +
   subtitle opcional + `.close`) e CTA final `btn btn-primary btn-block`. Divergência = corrigir.

## NÃO fazer

- NÃO redesenhar nada visível — este sprint muda ZERO pixel (exceto o nº duplicado).
- NÃO tocar em `native.js`, `deliverySheet` além do combinado, lógica de negócio.
- NÃO usar hex novo: classe nova usa token existente.

## Checks

- `node --check app.js`; screenshot ADB de: chegada simples, chegada offline, chegada
  completa, Rotas Salvas, editar produto, novo cliente — comparar com antes (idênticos).
- `git diff --stat` coerente (só app.js/app.css).

**Pronto quando:** morto removido, ≤ 8 inline styles restantes (todos dinâmicos), telas
idênticas no aparelho, commit local `fix(apk): S1 limpeza+moldura`.
