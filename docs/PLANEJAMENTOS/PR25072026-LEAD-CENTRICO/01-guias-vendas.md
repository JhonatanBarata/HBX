# S1 — 5 guias de etapa na LISTA do /vendas + renome do quadro (LEAD-CÊNTRICO)

## Contexto (já mapeado pelo orquestrador — confira ao vivo antes de editar)
Arquivo único de tela: `frontend/src/app/(app)/vendas/page.client.tsx`.
- Modo funil tem `view = "list" | "board"` (useTabParam linha ~533; toggle Lista/Quadro ~1262).
- Quadro: `STAGE_ORDER` (~linhas 245–251) com rótulos velhos Prospecção/Qualificação/Proposta/
  Negociação/Fechamento sobre as chaves PERSISTIDAS `novo/contato/retorno/qualificado/encerrado`.
  `STAGE_LABEL` (~252) alimenta a etiqueta do card e a coluna "Etapa" da grade.
  `normalizeStage` (~255) normaliza status cru → chave.
- Lista: planilha `GRID_COLUMNS` SEM guias de etapa (só coluna "Etapa" ordenável).
- Cards do quadro: `attemptCount` já existe no lead (coluna "Contatos" da grade usa).
- CSS da tela: classes `vnd-*` em `screens.css` do hbx-theme — só tokens, ZERO hex/inline
  (check-pele reprova).

## Entrega (SÓ isto — nada de backend, nada de migração)
1. **Renomear as etapas** em `STAGE_ORDER` (chaves e ORDEM intocadas; muda rótulo+sub):
   - `novo` → **Planejar** — sub: "Lead novo — leia, planeje e ligue Automação"
   - `contato` → **Robô trabalhando** — sub: "Em cadência — contatos em andamento"
   - `retorno` → **Te chamou** — sub: "Respondeu ou pediu retorno — sua vez"
   - `qualificado` → **Negociação** — sub: "Você assumiu — proposta e follow-up"
   - `encerrado` → **Fechado** — sub: "Contrato e compromissos"
2. **Alinhar `STAGE_LABEL`** às mesmas palavras (Planejar, Robô trabalhando, Te chamou,
   Negociação, Fechado) — a coluna "Etapa" da grade e a etiqueta do card falam a mesma língua
   das guias.
3. **5 guias (tabs) na LISTA**, acima da planilha, uma por etapa, com CONTAGEM por guia
   (derivada de `normalizeStage` sobre os leads carregados — a mesma conta das colunas do
   quadro). Clicar filtra a planilha pela etapa; clicar de novo na guia ativa limpa o filtro
   (mostra tudo). O filtro COMPÕE com a busca (`searchQuery`) e o filtro de equipe existentes.
   Acessibilidade: `role="tablist"`/`role="tab"`/`aria-selected`. Visual: reusar padrão existente
   da tela (ex.: `seg-toggle`/chips `vnd-*`); se precisar classe nova, nasce em `screens.css`
   com tokens (Lei nº1). Estado local basta (não persistir).
4. **Selo de tentativa no card do quadro**: quando `attemptCount > 0`, chip discreto
   "1º contato"/"2º contato"/"Nº contato" (ordinal de `attemptCount`). NÃO duplicar o chip de
   agenda (o "próximo" já é o chip `agendaInfo` existente). Reusar moldura de chip existente.

## O que NÃO fazer
- Não tocar em backend, status persistidos, drag-and-drop do quadro, PATCH de status.
- Não tocar em atendimento/recovery/Webwhats.
- Não inventar texto além dos rótulos/subs especificados (regra do dono: só o texto pedido).
- Não criar branch/worktree — trabalhar DIRETO na master, working tree atual.
- Não reverter/estagiar trabalho paralelo (logística/backend têm mexidas não-commitadas):
  `git add` SÓ dos arquivos que você tocou, caminho por caminho. NUNCA `git add -A`.

## Aceite
- `npm run lint` (ou o check equivalente do frontend, incluindo check-pele) e typecheck verdes
  no que foi tocado.
- Contagem das guias bate com as colunas do quadro pros mesmos dados.
- Commit LOCAL na master (sem push, sem publish):
  `feat(vendas): 5 guias de etapa na lista + etapas lead-cêntricas (S1 LEAD-CENTRICO)`.
- Relatório curto no final: arquivos tocados, o que mudou, prova dos checks.
