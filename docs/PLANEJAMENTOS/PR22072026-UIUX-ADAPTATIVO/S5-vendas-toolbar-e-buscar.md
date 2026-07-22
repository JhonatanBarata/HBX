# S5 — Toolbar de ações no lugar do "N cards" + select-all no Buscar empresas

> Depende da S4 (mesmo `vendas/page.client.tsx`).

## Evidência

- `vendas/page.client.tsx:1173` — depois de "Pipeline de vendas" há um `<span>` inline
  com "`{N} cards`". O dono mandou REMOVER e preencher com ações de planilha, "botões
  igualados, sem bagunça".
- Buscar empresas (LeadsClient embutido, `frontend/src/app/(app)/leads/`) tem lista com
  checkbox por linha mas SEM select-all no cabeçalho — implantar a mesma ideia da S4
  (foto 3 do dono: 1º quadrado marca todos).

## Tarefas

1. **Toolbar da planilha** no panel-head da Lista, no lugar do contador: grupo ÚNICO de
   botões do MESMO tamanho (classe central, ex. `.vnd-gridbar` em `screens.css`;
   botões = `btn-ghost`/`icon-ghost` do kit, todos com label curta + ícone):
   - **Colunas** (chooser da S4 muda de casa pra cá)
   - **Ordenar** (estado atual da S4, aqui só o atalho)
   - **Exportar CSV** (client-side, colunas visíveis, respeitando `canViewValues`)
   - **Excluir selecionados** (fluxo de motivo já existente; só habilita com seleção)
   - **Reiniciar layout** (S4)
   A contagem vira discreta: "N selecionados" só quando houver seleção; o total de cards
   pode viver como `title` do título — não mais como texto solto.
2. **Alinhar o resto do `meta`** (Lista/Quadro, agenda, equipe, Novo lead) na mesma
   régua de altura — nada de botões de 3 alturas diferentes na mesma linha.
3. **Buscar empresas — select-all**: no LeadsClient, adicionar checkbox no cabeçalho da
   lista com o MESMO comportamento (marca/desmarca todos os visíveis) e a mesma classe
   central; remover barra equivalente de "selecionar todos" se existir lá.
4. **Uma linha também no Buscar**: se a lista do Buscar ainda empilha
   Empresa→Cidade→Status (foto 3), aplicar o mesmo tratamento de colunas separadas da
   S4 (sem levar edição inline pro Buscar — lá é leitura/puxar).

## NÃO-fazer

- NÃO criar dropdown "Mais ações" escondendo tudo — os 5 botões cabem; testar em 1368.
- NÃO adicionar export XLSX/integrações — CSV resolve a v1.
- NÃO mexer no fluxo de puxar lead do Radar.

## Checks

- `npm run lint && npm run build` verdes.
- 1368x768: toolbar inteira visível sem quebrar em 2 linhas tortas (pode quebrar em 2
  linhas LIMPAS se precisar — decidir e anotar).
- Exportar CSV abre com acentuação certa (BOM UTF-8) e só colunas visíveis.
- Buscar: cabeçalho marca todos, contagem certa, e linhas em 1 linha só.

## Pronto-quando

"N cards" morto, toolbar igualada funcionando (colunas/ordenar/exportar/excluir/reiniciar),
select-all e linha única também no Buscar, lint/build verdes.
