# S4 — /vendas Lista vira planilha Excel (editável, colunas por usuário, densa)

> Depende da S3 (contrato de prefs + PATCH inline + channels). Mexe em
> `vendas/page.client.tsx` — S5 espera esta terminar.

## Evidência (o que o dono reclamou)

- `vendas/page.client.tsx:1310` — célula Empresa EMPILHA nome + cidade (`sub2`) + badge.
  O dono quer **1 linha por lead, tudo em colunas separadas**.
- `:1266-1284` — barra "Selecionar todos"/excluir ocupa uma linha inteira acima da tabela.
  Sai; o checkbox do `<th>` (`:1289-1292`, que JÁ funciona) assume o select-all sozinho.
- Letra pequena + espaço em branco: a tabela atual usa `.tbl` genérica com `sub2`
  minúsculo — falta densidade de planilha de verdade.

## Tarefas

1. **Catálogo de colunas** (constante única no arquivo): tudo que o Detalhes mostra e o
   `VendasLead` já carrega — Empresa, Cidade, UF, Segmento, Etapa, Status/agenda,
   Engajamento, Valor (gate `canViewValues`), Próximo passo, Nota, Responsável, Data,
   Telefone, E-mail, CNPJ, Razão social, Sócio, Score, Temperatura, Origem, Criado em —
   **+ coluna "Canais"**: a fileira de 6~7 ícones tri-cor do Buscar (`CanalIcon`,
   consumindo o campo `channels` novo do board/S3). Cada coluna: `key`, label, largura
   default, `editable?`, render.
2. **Colunas por usuário**: chooser (pop `.hbx-pop` a partir do botão "Colunas" — a
   toolbar em si é da S5, aqui pode ficar no `meta` do panel-head): liga/desliga e
   reordena (drag simples ou setas). Estado persiste via
   `GET/PATCH /profile/ui-preferences` (screen `vendas-grid`) com fallback default.
   **Botão "Reiniciar layout"** → `{reset:true}` + volta o default na hora.
3. **Edição inline estilo Excel** nas colunas `editable` (name, phone, email, segment,
   city, nextAction, shortNote, saleValue): duplo clique (ou F2/Enter com a célula
   focada) vira input NA célula; `Enter` salva (PATCH inline da S3, otimista com
   rollback em erro), `Esc` cancela, `Tab` salva e vai pra próxima editável. Máscaras BR
   pelo helper central (`lib/format.ts` — telefone/data, Lei do FRONTEND.md). Célula não
   editável (score, etapa, engajamento) não abre input.
   ⚠️ duplo clique HOJE abre o cockpit (`:1305`) — mover cockpit pra ação explícita na
   linha (ícone expandir, 1º da coluna de ações) pra não brigar com a edição.
4. **1 linha por lead**: matar o empilhamento da célula Empresa; cidade/estado/status em
   colunas próprias; `white-space:nowrap` + ellipsis com `title`. Badge IA vira coluna
   pequena própria (ou some da lista — decidir pelo espaço, anotar no RESULTADO).
5. **Densidade "alta resolução"**: linha `--row-height` cheia (≥9 linhas visíveis em
   1080p continua lei), fonte da célula = corpo normal (não `sub2`), zebra sutil e
   cabeçalho fixo (sticky) — TUDO por token/classe central (estrutura nova de grade em
   `screens.css`, ex. `.vnd-grid*`; cor só de token).
6. **Select-all**: remover a barra inteira `:1266-1284`; o checkbox do thead marca/
   desmarca todos; contagem de selecionados + excluir em lote migram pra toolbar (S5) —
   nesta sprint podem morar provisoriamente no `meta`.
7. **Ordenação por coluna** no cabeçalho (asc/desc, indicador ▲▼) substituindo o botão
   A→Z atual; escolha persiste nas prefs.

## NÃO-fazer

- NÃO tocar no modo Quadro nem no modo Buscar (S5 cuida do Buscar).
- NÃO inventar undo/redo multi-célula — v1 é salvar por célula com rollback de erro.
- NÃO exibir Valor pra quem `canViewValues=false` (nem coluna visível no chooser).
- NÃO quebrar o clique simples na linha (continua abrindo o painel lateral).

## Checks

- `npm run lint && npm run build` verdes.
- Chrome localhost: editar nome/telefone/valor inline e ver persistido após F5; trocar
  colunas, relogar e ver o layout mantido; "Reiniciar layout" volta o default; checkbox
  do cabeçalho seleciona todos; 1368x768 sem corte e sem célula empilhada.
- Com o 2º usuário de teste: layout dele é independente.

## Pronto-quando

A Lista opera como planilha (inline edit + colunas por usuário + 1 linha + densidade),
prefs sobrevivem a relogin, select-all no cabeçalho, lint/build verdes.
