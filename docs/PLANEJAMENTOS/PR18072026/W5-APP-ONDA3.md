# W5 — app.js Onda 3: minha ordem, rotas salvas, limpar dia (Sonnet)

Arquivo ÚNICO: `EntregaShell/app/src/logistica/assets/app/app.js` (W3+W4 já mexeram — leia o
estado ATUAL). Contratos: `00-ORQUESTRACAO.md`. Público-alvo: usuário leigo — botões grandes,
zero jargão, cada passo óbvio.

## Tarefas

1. **Modo de montagem no "Montar rota"** (`manage-day` modal): após escolher os dias, passo de
   ordem com 3 opções (cards grandes): **"Ordem do app"** (default, fluxo atual intocado),
   **"Minha ordem"**, **"Rota salva"**.
   - *Minha ordem:* lista da prévia com botões ▲▼ grandes por linha (e drag por toque se ficar
     simples; ▲▼ é o obrigatório). A ordem final vira `ordemManual` (array de deliveryIds — na
     prévia os ids são de clientes: montar o mapeamento após gerar-dia devolver as entregas;
     se o fluxo atual só conhece ids após "Gerar agora", reordene ANTES por cliente e traduza
     para deliveryIds na resposta do gerar-dia antes de chamar planejar/iniciar com ordemManual).
   - *Rota salva:* lista `GET /logistica/rota-modelos` (nome + dia). Escolher um pré-ordena a
     prévia conforme o modelo (clientes fora do modelo vão pro fim); segue o fluxo normal com
     `ordemManual`.

2. **Salvar modelo:**
   - No modo "Minha ordem", antes de gerar: checkbox "Salvar como minha rota de {dia}" →
     POST (ou PATCH se já existir modelo com o mesmo diaSemana) `/logistica/rota-modelos`
     com `paradas` = [{customerProfileId, localId?}] na ordem final.
   - **Ao ENCERRAR rota** (fluxo do finish-route, após sucesso do encerrar): se houve rota com
     2+ paradas hoje, perguntar 1 vez: "Salvar a ordem de hoje como sua rota de {dia da semana}?"
     [Salvar] [Agora não]. Ordem real = entregues por ordem de conclusão (deliveredAt asc, se
     disponível no estado; senão rotaOrdem) + não entregues por rotaOrdem. Upsert por diaSemana.

3. **"Minhas rotas"** nos Ajustes (admin): lista dos modelos (nome, dia, nº de paradas),
   renomear (prompt simples) e excluir (confirmação 2 toques, padrão `state.confirmation`).

4. **Limpar dia:** no popup do "Cancelar planejamento" (`cancel-route` confirmation), adicionar
   botão secundário perigoso "Limpar o dia (cancelar entregas de hoje)" → segunda confirmação
   ("As entregas de hoje serão canceladas. As recorrentes voltam no próximo dia normal.") →
   `POST /logistica/rota/limpar-dia` → refresh + toast com o nº canceladas.

## Regras
- `node --check` ao final. NÃO commitar. Não tocar em outros arquivos. Não quebrar W3/W4.
- Relatório: mudanças por tarefa, paths de API novos (allowlist!), decisões de UX tomadas,
  pendências.
