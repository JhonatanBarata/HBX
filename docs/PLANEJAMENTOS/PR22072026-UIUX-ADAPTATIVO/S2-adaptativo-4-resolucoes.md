# S2 — Sistema adaptativo: 1368x768 / HD / Full HD / 4K (tokens fluidos)

> Depende da S1 (mexe nos mesmos arquivos de detalhes). Roda depois.

## Dor

O dono quer o SISTEMA adaptativo, não só o cockpit: em 1368x768 nada corta; em 4K o
conteúdo cresce e usa a tela ("sensação de alta resolução"), em vez de letra minúscula
ilhada num mar de espaço em branco.

## Onde mexer (Lei nº1 — métrica estrutural é ESQUELETO)

Tudo desta sprint nasce em `frontend/src/app/hbx-theme/skeleton.css`,
`typography.css` e `spacing.css`. Pele/casca NÃO declara font-size/altura/largura.

## Tarefas

1. **Escada fluida de tipografia.** Onde hoje há `font-size` px/rem fixos nos tokens
   estruturais, adotar `clamp(min, vw-based, max)` — calibrado pra: 1368 = tamanho atual
   ou levemente maior; 1920 = confortável; 3840 = escala clara (via
   `@media (min-width: 2200px)` bump nos tokens raiz se clamp sozinho não bastar).
   NÃO mexer no mobile (casca própria).
2. **Compactação por altura.** Ampliar o bloco `@media (max-height: 900px)` de
   `screens.css` (e criar `max-height: 800px` se necessário) cobrindo: `/vendas`
   (funhead + KPIs + painel), cockpit (folgas internas) e `/automacao` (hero + grid de
   cards). Ordem de redução: padding/gap → botão de navegação → font-size (último caso).
3. **Larguras de shell.** Conferir `--rail-width*`/`--context-width` em 1368: o painel
   lateral de detalhes (`.ctx`) não pode espremer a tabela a ponto de empilhar células.
   Se precisar, degrau `@media (max-width: 1440px)` nos tokens de shell.
4. **Varredura de px fixo estourando.** `grep -nE "width: ?[0-9]{3,}px|height: ?[0-9]{3,}px"`
   em `screens.css`/`kit.css`/`vendas-*.css` — cada achado ou vira `min()/clamp()` ou é
   justificado no RESULTADO. Foco nas telas das 3 frentes; não sair refatorando o app todo.
5. **Zero-scroll re-conferido** nas telas tocadas (lei do FRONTEND.md), nas 4 resoluções.

## NÃO-fazer

- NÃO usar `zoom`/`transform: scale` — é escada de token, não lupa.
- NÃO declarar métrica em `theme-*.css`/`casca-modern.css` (check-pele reprova).
- NÃO tocar na casca mobile nem no mundo-site (marketing.css/landing).

## Checks

- `npm run lint && npm run build` verdes.
- Nas 4 resoluções (Chrome DevTools), telas /vendas (lista + quadro), cockpit aberto e
  /automacao: sem corte, sem scroll de página, sem letra "de formiga" em 4K.
- Screenshot das 4 resoluções da /vendas no RESULTADO como prova.

## Pronto-quando

Tokens fluidos no esqueleto, compactação por altura cobrindo as 3 frentes, varredura de
px fixo concluída e prova visual nas 4 resoluções anexada.
