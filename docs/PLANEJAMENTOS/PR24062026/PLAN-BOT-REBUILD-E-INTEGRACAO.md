# PLAN-BOT-REBUILD-E — Integração (sequencial, DEPOIS de A–D)

Ler `PLAN-BOT-REBUILD-00-INDICE.md`. Esta etapa roda **sozinha**, quando A/B/C/D já fecharam. Dona do arquivo grande:
`frontend/src/app/(app)/bot/page.client.tsx` (+ registrar os imports dos 3 CSS no tema).

## Pré-requisitos (entregues por A–D)
- A: GET devolve `providerCapabilities.canUseOfficialButtons` + catálogos garantidos.
- B: `BotFlowCanvas` (`components/hbx/bot-flow-canvas.tsx`).
- C: `BotButtonsEditor` (`components/hbx/bot-buttons-editor.tsx`).
- D: `BotVariablesDrawer` (`components/hbx/bot-variables-drawer.tsx`).

## O que fazer
1. **Tipos:** estender o `BotConfig` do front pra incluir `variableCatalog: VarDef[]`, `setup.provider`,
   `providerCapabilities`. 
2. **Carregamento robusto (mata o "Ação vazio"):** hoje `initCfgTipo`/`loadCfgTipo` engolem erro no `.catch` e
   deixam `cfgData=null` → form fantasma. Tratar: estado de erro visível + botão "tentar de novo"; não renderizar
   editor vazio como se fosse config válida.
3. **Aba Fluxo vira split-screen "tipo jogo":** esquerda = edição por fase (as mensagens) usando `BotButtonsEditor`
   (passando `canUseOfficialButtons` do `providerCapabilities`) e um botão **"Variáveis"** por campo que abre o
   `BotVariablesDrawer` (inserindo `{{key}}` no campo focado, na posição do cursor); direita = `<BotFlowCanvas config activeStep />`
   que se monta conforme as fases são preenchidas. Remover os `NODES/EDGES` hardcoded.
4. **Aba Configurações:** trocar o editor de botões inline pelo `BotButtonsEditor` e adicionar o botão "Variáveis"
   nas mensagens (mesmo `BotVariablesDrawer`). Manter Salvar/`salvarConfig` e o seletor de tipo.
5. **CSS:** registrar os imports de `bot-flow.css`, `bot-buttons.css`, `bot-variables.css` no ponto onde o tema
   carrega os CSS centrais (junto de `screens.css`/`kit.css`).
6. Não quebrar o que já funciona (chavinhas/pré-voo/chat de teste/`mark-tested`).

## Aceite
- "Ação…" deixa de vir vazio (catálogo carrega ou erro explícito). Botão Variáveis abre a gaveta da direita e
  insere `{{key}}`. Em QR aparece opção numerada; em Meta, botão. Organograma se monta ao preencher as fases.
- `cd frontend && npm run lint && npm run build` verdes.

## Reverter
`git checkout HEAD -- frontend/src/app/(app)/bot/page.client.tsx` + reverter o registro dos imports de CSS.
