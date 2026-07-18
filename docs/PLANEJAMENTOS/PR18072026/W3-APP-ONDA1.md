# W3 — app.js Onda 1: erro humano, produtos editáveis, preço por cliente, observação (Sonnet)

Arquivo ÚNICO a editar: `EntregaShell/app/src/logistica/assets/app/app.js` (webview do APK;
IIFE vanilla, template strings, `H.api`, `state`, `render()` — siga o estilo à risca).
Leia `00-ORQUESTRACAO.md` (contratos). Backend pode ainda estar em voo (W1) — programe contra
o contrato, não contra o servidor.

## Tarefas

1. **Erros humanos:** criar helper `humanApiError(err)` usado em todos os `catch` que exibem
   toast/mensagem: remove ids cuid (regex `/\bc[a-z0-9]{20,}\b/g` → "essa entrega"), e mapeia
   `code:'ENTREGA_EM_OUTRA_ROTA'` → "Uma entrega ficou presa em outra rota. Encerre a rota
   antiga ou tente montar de novo." Nunca mostrar id cru na tela.

2. **Produtos editáveis (tela Produtos, `productsScreen` ~:637):** card vira clicável (admin):
   abre modal editar — nome, unidade, preço, estoque, botão "Arquivar"/"Reativar"
   (`PATCH /logistica/produtos/:id`, arquivar = `ativo:false`). Produto inativo: card
   dessaturado + badge "Arquivado", some do picker de vínculos/entregas. Manter FAB criar.

3. **Preço por cliente:** nos forms de vínculo cliente-produto (novo e editar,
   `clientEditorModal`/`persistClientProduct` ~:1337): campo opcional "Preço para este cliente"
   (number, step 0.01; vazio = null) → enviar `precoAcordado` no POST/PATCH
   `/logistica/cliente-produtos`. Na lista "Produtos já salvos", exibir `R$ X,XX` quando setado
   (senão nada — preço do catálogo vale).

4. **Observações do cliente:** textarea "Observações" (max 500, placeholder "Ex.: entregar só
   depois das 14h, portão azul") na ficha do cliente (cadastro novo + edição — junto do bloco
   de endereço), salva via campo `observacoes` no POST/PATCH de contas já usado pelo form.
   Exibir: no `stopCard` (~:625) linha pequena destacada quando existir; no `deliverySheet`
   (~:650) bloco visível no topo (abaixo do endereço). Escapar com `H.escape` SEMPRE.

## Regras
- `node --check` no app.js ao final. NÃO commitar, NÃO tocar em outros arquivos.
- Se precisar de endpoint fora dos contratos do 00-ORQUESTRACAO.md: NÃO invente — anote no relatório.
- Relatório: o que mudou por tarefa, paths de API chamados (para a allowlist do APK), pendências.
