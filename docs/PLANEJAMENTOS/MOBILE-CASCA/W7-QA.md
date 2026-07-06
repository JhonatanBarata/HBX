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

## Polimento pós-auditoria (worker POLIMENTO, 06/07 — commit `7ddfb1fd`)

Auditoria visual em prod (viewport 412px, www.hbxsystem.com.br) achou 3 desvios do
mockup aprovado. Os 3 foram corrigidos — **W7 deve RE-VERIFICAR em prod** após o
próximo publish (esta correção está commitada local, ainda não publicada):

1. **RESOLVIDO — Funil, nome do card cortava seco.**
   `frontend/src/components/casca/screens/vendas-funil.tsx` (sem mudança de TSX) +
   `frontend/src/app/hbx-theme/screens.css` (`.vnd-m__row-name`): faltava
   `min-width: 0` no flex item — por isso o `white-space:nowrap` +
   `text-overflow:ellipsis` já presentes nunca agiam (o item não encolhia).
   Adicionado `min-width: 0`; agora trunca com reticências.
2. **RESOLVIDO — Buscar, sem avatar de iniciais.**
   `frontend/src/components/casca/screens/vendas-buscar.tsx`: adicionado `<Av>`
   central (`components/hbx/shell.tsx`, círculo, tokens `--hbx-avatar-from`/
   `--hbx-brand-contrast` — mesmo componente do W3 Conversas) 30px à esquerda da
   linha de resultado. Linha continua em `--casca-row-h` (60px), densidade
   preservada (≥8 visíveis).
3. **RESOLVIDO — Conversas, título duplicado.**
   `frontend/src/components/casca/screens/conversas-lista.tsx` +
   `screens.css`: removido o cabeçalho interno `.cvs-m__head`/`.cvs-m__title`
   (o `MobileShell` já mostra "Conversas" no topo da casca, `casca-top__title`).
   O pontinho de status do chip (`.cvs-m__dot`) migrou pra faixa de chips de
   filtro (`.cvs-m__chips`, 1º item); a ação "+" (`.cvs-m__tool-btn`) migrou pro
   lado direito da linha de busca (`.cvs-m__searchbar`, mesmo alvo ≥28px de
   antes — `--casca-action-max`). Cromo total da lista CAIU ~36px (uma linha
   inteira a menos), não subiu.

**Checks rodados pelo worker POLIMENTO:** `check-pele` sem violação NOVA (497
antes e depois — as 2 acima do teto são pré-existentes em
`janela-empresas.tsx`, fora de escopo); `npx tsc --noEmit` limpo; `npm run build`
verde (Turbopack, 42 rotas). Localhost não foi usado como veredito visual
(regra do dono) — validado por medida de token/CSS, não screenshot local.
