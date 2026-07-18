# L4-B — Voltar do Android: fix clobber HBXApp + handleBack completo

## Causa raiz (provada no aparelho)
`EntregaShell/app/src/vendas/assets/app/app.js:298` faz `window.HBXApp = { refresh };`.
No index.html da logística esse script embutido carrega DEPOIS de logistica/app.js →
sobrescreve o HBXApp inteiro e mata `handleBack`, `routeActivated` e
`locationPermissionChanged`. Voltar em QUALQUER tela caía no "Pressione voltar novamente
para sair" (MainActivity.confirmarSaida).

## Entrega
1. **vendas/app.js:298**: não clobberar — `if (!window.HBXApp) window.HBXApp = { refresh };`
   com comentário curto do porquê (embutido na logística ele NÃO pode substituir o objeto).
   No APK standalone de vendas continua funcionando (lá não existe HBXApp antes).
2. **logistica/app.js `handleBack()`** (linha ~2020) — regra do dono: "voltar sempre fecha
   popup; senão vai pra Rota; na Rota sai do app". Ordem:
   - `state.confirmation` → limpa e `return true` (como hoje).
   - `state.modal === "manage-day"`:
     - `state.dayReview` ativo → abortar prévia (clearInterval(dayReviewTimer);
       state.dayReview = false; render()) → volta pros dias; `return true`.
     - `state.dayOrderStep === "manual" || "saved"` → voltar 1 passo (espelhar o handler
       existente de `data-action="back-route-order"`); `return true`.
     - `state.dayOrderStep === "choose"` → voltar pros dias (mesmo espelho); `return true`.
   - `state.modal` (qualquer) → `void closeOverlay("modal")` (fecha com animação);
     `return true` SÍNCRONO (o nativo só precisa do boolean).
   - `state.deliveryProductPicker` → fecha o picker; `return true`.
   - `state.selected` (sheet de entrega — hoje o código checa `state.sheet`, chave que NÃO
     existe; trocar por `state.selected`) → `void closeOverlay("sheet")`; `return true`.
   - `state.screen !== "route"` → `navigateTo("route", "back")`; `return true`.
   - senão `return false` (nativo mostra "pressione novamente para sair").
3. Envolver o corpo em try/catch devolvendo `false` no catch (exceção nunca pode virar
   fechamento silencioso do app... na real exceção viraria saída — catch devolve TRUE se
   deu pra tratar algo? Não: catch → console + return false, comportamento honesto).

## Regras
- Só esses 2 arquivos JS. Zero Kotlin.
- Gate: `node --check` nos dois app.js.
- Não commitar.
