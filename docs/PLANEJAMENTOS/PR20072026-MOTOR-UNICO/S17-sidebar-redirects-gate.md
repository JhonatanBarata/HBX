# S17 — Sidebar 1 item + redirects + gate unificado ⚠

**Fase 4 · Worker: Sonnet · Depende de: S13-S16 completas · Revisão adversarial: SIM**

## Objetivo
O corte público: some "Bot / Automações / Assistente IA" da sidebar, entra SÓ "Automação".
Rotas velhas viram redirect. É a sprint que muda o que o cliente vê — só roda com as 4 seções prontas.

## Arquivos
- EDITAR `frontend/src/components/hbx/shell.tsx`
- EDITAR `frontend/src/app/(app)/bot/page.tsx`, `automacoes/page.tsx`, `assistente/page.tsx`
  (viram redirect — client `router.replace`, padrão de redirect já usado no app; manter o arquivo
  `page.client.tsx` velho intacto até a S19)
- EDITAR telas que LINKAM pras rotas velhas (buscar `href="/bot"`, `"/automacoes"`, `"/assistente"`
  em TODO o frontend — inclusive `lead-cockpit-modal`, `copiloto-panel`, `tutorial-coach-steps`,
  `so-logistica-gate`, `public-entry`, mobile-casca `configuracoes.tsx`) → apontar pra
  `/automacao?secao=...` correspondente.

## Tarefas
1. NAV: remover ids `bot`, `automacao`(velho /automacoes) e `assistente` dos itens; item único
   `automacaoHub` "Automação" (S12) permanece, grupo Facilidades. ATENÇÃO às armadilhas documentadas
   no shell: todo nav id PRECISA de ícone em ICONS (P0 de 02/07) e entrada EXPLÍCITA nos mapas
   `NAV_ENTITLEMENT`/`NAV_MODULE_KEY` (fail-closed) — atualizar os DOIS mapas, removendo as chaves
   velhas e registrando a nova com o gate OR de 3 chaves (`atendimento`|`bot`|`vendas` — decisão nº2
   revisada pós-S03) implementado em `isModuleVisible` sem quebrar o fail-closed dos demais itens.
   NOTA: `NAV_MODULE_KEY` hoje mapeia 1 nav→1 chave; o OR de 3 chaves exige lógica dedicada pra este
   item (não força os outros a mudar de forma).
2. Redirects com secao certa: `/bot` → `/automacao?secao=atendente` · `/automacoes` →
   `/automacao?secao=prospeccao` · `/assistente` → `/automacao?secao=atendente&cerebro=ia`.
   ⚠️ O redirect de `/assistente` é SÓ da página raiz — NÃO capturar `/assistente/copiloto*` nem
   qualquer subrota do Copiloto (feature separada viva, achado S02). Conferir que o redirect é exato.
3. Varredura de links: TODOS os `Link`/`href` do frontend atualizados (grep obrigatório nos 16
   arquivos que citam as rotas — lista de partida no relatório da S02 item 3).
4. `sellerOnlyNav` (shell:862): substituir as 3 chaves velhas pela nova, preservando a regra de
   vendedor.
5. Tutorial (`tutorial-coach-steps.ts`): passos que apontam pra telas velhas → atualizar rota/seletor
   (mínimo: rota certa; retexto fino é S22).
6. QA local Chrome: menu mostra 1 item; as 3 URLs velhas redirecionam; navegação por todos os links
   atualizados; usuário SEM módulo bot e COM vendas vê o item e só as seções de vendas (e vice-versa);
   sem módulo nenhum → item some.

## Critérios de aceite
- Zero referência viva às rotas velhas (grep limpo, exceto redirects e page.client morto-vivo até S19).
- Gates fail-closed comprovados nos 3 perfis (bot-só, vendas-só, nenhum). Lint+build verdes.

## DoD
Commit local: `feat(automation): S17 — sidebar única, redirects e gate OR`
