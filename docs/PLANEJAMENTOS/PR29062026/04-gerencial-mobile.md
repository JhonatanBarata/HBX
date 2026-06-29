# 04 — Gerencial: sem tratamento mobile

## Problema (visto ao vivo)
`/gerencial` no mobile (prints `B09-gerencial.png`, `D05-gerencial-produtos.png`, `D07-gerencial-equipe.png`):
1. As abas (Produtos / Comissões / Candidaturas / Visão geral / Equipe) **quebram em 2 linhas** em vez de
   rolar lateralmente.
2. As **tabelas transbordam o card** (colunas cortadas na direita: "Ofert…", "Cobrança únic…", "Perfil de…").

## Diagnóstico
`mobile.css` tem seção premium pra Configurações (`=== CONFIGURAÇÕES ===`) mas **NÃO tem seção pra Gerencial**.
Confirme as classes da tela em `app/(app)/gerencial/page.client.tsx` (nav de abas, wrapper de tabela `.tbl-wrap`/`.tbl`,
nome da página/raiz). O kit já tem `.tbl-wrap{overflow-x:auto}` (kit.css:516) e `.tbl td{white-space:nowrap}`.

## Objetivo
Gerencial no celular: abas em pills roláveis (mesmo padrão das pills de Configurações) e tabelas que NÃO
cortam — ou rolam lateralmente dentro do card (`.tbl-wrap{overflow-x:auto}`) OU viram cartões empilhados.
Escolha o que ficar mais limpo por tabela (Produtos é estreita → scroll horizontal resolve; Equipe pode
esconder colunas secundárias como Configurações faz: `mobile.css` ~1239 esconde `th/td:nth-child(2)`).
Desktop intocado.

## O que fazer
- Nova seção `=== GERENCIAL ===` em `mobile.css`, dentro de `@media (max-width:860px)`:
  - Nav de abas → pills roláveis (replicar o padrão de `.cfg-page .set-nav`/`.set-link` se as classes diferem,
    ajuste pro seletor real da tela do gerencial).
  - `.tbl-wrap` da tela → `overflow-x:auto; -webkit-overflow-scrolling:touch`; garantir que o card não deixe a
    tabela vazar (largura travada no wrapper).
  - Layout da página → coluna flex de altura como as outras (`display:flex;flex-direction:column;height:100%`)
    se a tela hoje sobra vazão embaixo.
- Se faltar classe-âncora na raiz/nav, adicione só `className` no TSX (sem estilo visual inline).
- Só token/var, ZERO hex. Estrutura pura.

## Verificar (ao vivo, obrigatório)
Prints de /gerencial mobile nas abas Produtos e Equipe: abas rolando numa linha, tabela sem corte.
(login + viewport 390 como nos outros briefs.) `cd frontend && npm run lint`. Remova este `.md` ao concluir.
