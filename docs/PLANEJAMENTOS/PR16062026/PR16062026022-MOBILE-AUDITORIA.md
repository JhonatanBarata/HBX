# PR16062026022 — MOBILE: auditoria ponta a ponta (#10)

> Migrado de `PR15062026000` #10. Memória: `mobile-app-responsivo-junho-2026`.

## ✅ JÁ FEITO (registro)
Responsivo + PWA: `responsive.css` central (tudo em `@media`), sidebar vira gaveta, grids
empilham, viewport-fit=cover; PWA instalável (manifest + `hbx-sw.js`); modelo travado
(shell 100dvh, `.work` rola por dentro); Atendimento = mestre-detalhe (lista→toca→conversa
+ voltar); Vendas kanban = colunas 85vw + scroll-snap; bot builder empilha. Verificado ao vivo
(375px tudo cabe; 1280px desktop idêntico). **Restrição: NÃO mudar nada no desktop.**

## ⛔ FALTA
Re-auditar 375px no preview **depois** das mudanças de cobrança/website/Radar (blocos 010–013):
confirmar que checkout, `/planos` com preço, a tela Radar fundida e os blocos novos não quebram
no celular. Dono instala no celular + olho final.

## Lição (não repetir o erro)
Limpar `.next` build antes do lint — senão o ESLint varre o `dist` e explode.

## Checks
Preview 375px nas telas tocadas; `cd frontend && npm run lint` → `npm run build`.

## Status
Base FEITA; auditoria final PLANEJADA (por último, baixo risco).
