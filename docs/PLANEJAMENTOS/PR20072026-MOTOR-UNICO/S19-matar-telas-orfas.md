# S19 — Matar telas, componentes e CSS órfãos

**Fase 4 · Worker: Sonnet · Depende de: S18 · DESTRUTIVO (autorizado)**

## Objetivo
Apagar os arquivos inteiros que a casca nova tornou órfãos. Depois desta sprint, o produto de
automação tem UMA implementação.

## Alvos
1. `frontend/src/app/(app)/bot/page.client.tsx` (1009 linhas) — o `page.tsx` fica como redirect (S17).
2. `frontend/src/app/(app)/automacoes/page.client.tsx` (778 linhas) — idem.
3. `frontend/src/app/(app)/assistente/page.client.tsx` (640 linhas) — idem.
4. CSS órfão: varrer `screens.css` (blocos bot-*), `concierge.css`/`assistente.css` (blocos ia-*
   NÃO usados pela seção nova — a S13 reusa classes; só matar o que o grep provar morto),
   blocos `auto-*`/`persona-*` que a S15/S16 não reusaram.
5. Componentes `components/hbx/bot-*` que ficaram sem importador após S18 (grep um a um).
6. Imports/exports quebrados residuais (build acusa).

## Método
Por alvo: `grep -r "<nome>" frontend/src` → zero uso → deletar → build. CSS: grep pela classe em
todo tsx antes de cada bloco removido. Rodar `npm run lint` (check-pele) + `npm run build` +
smoke local completo das 4 seções + hub ao final.

## Critérios de aceite
- 3 page.client velhos deletados; zero componente/CSS morto referenciado; lint+build verdes;
  QA local: hub + 4 seções + redirects funcionando.

## Proibições
- Não deletar componentes compartilhados vivos (lista FICAM da S18).
- Não tocar backend nesta sprint.

## DoD
Commit local: `chore(automation): S19 — remoção das telas antigas e CSS órfão`
