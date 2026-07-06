# W7 — QA mobile + porta de entrada

> Ler PLANO.md + docs/Rules/FRONTEND.md + todos os W*-RESULTADO.md. Último worker da frente.

## Entregas
1. **Landing + login mobile:** a tela inicial (marketing, `src/app/page.client.tsx` — mundo-site,
   visual próprio permitido) e o `/login` precisam ficar dignos no celular: sem corte, sem overflow,
   CTA alcançável. Não redesenhar o desktop — passe mobile.
2. **Playwright viewport iPhone (375×812):** fluxo completo — login → Vendas (funil + buscar) →
   lead em sheet → Conversas (abrir chat, voltar) → Empresas (ficha + 3 ações) → Mais/Config →
   Rota (entrar, voltar pelo ícone HBX). Asserts: tab bar presente, transições aplicam classe,
   fallback aparece em rota não registrada (ex.: /relatorios), fullscreen emite aviso.
3. **Varredura visual** (Chrome mobile viewport) em TODAS as telas da casca + screenshots no
   RESULTADO. Conferir a régua: cromo ≤140px, ≥8 linhas por lista, nada abre/fecha seco.
4. **Desktop regression:** 1366×768 nas mesmas rotas — zero mudança visual (zero-scroll ok).
5. `check-pele` verde no repo; catraca (`pele-baseline.json`) NÃO sobe.
6. Lista final de sobras/pendências pro dono no RESULTADO.

## Checks
lint+tsc+build + Playwright verde. Commit `test(mobile-casca): W7 qa`.
Gravar `W7-RESULTADO.md`, apagar este arquivo.
