# PLAN-BOT-REBUILD-C — Componente `BotButtonsEditor` (botões maleáveis QR × Meta)

Ler `PLAN-BOT-REBUILD-00-INDICE.md` (contrato). Peça **independente** — cria SÓ:
`frontend/src/components/hbx/bot-buttons-editor.tsx` + `frontend/src/app/hbx-theme/bot-buttons.css`. **NÃO** tocar
`bot/page.client.tsx` nem CSS compartilhado.

## Objetivo
Editor de botões de um grupo (ex.: boas-vindas, menu) que **se adapta ao canal**:
- **Meta** (`canUseOfficialButtons=true`) → **botões interativos**: cada item = Texto (até 60) + Ação (select do `actionCatalog`). (É o comportamento atual, isolado num componente.)
- **QR/evolution** (`canUseOfficialButtons=false`) → **sem botão**: o WhatsApp não-oficial não tem botão. Vira lista de **opções numeradas** (1, 2, 3…) — cada opção = Texto + Ação; o bot injeta "1) …  2) …" no corpo da mensagem e o cliente responde o número. Mostrar **aviso do modo** ("Sua conexão é QR — usamos opções numeradas, sem botão clicável").

## Contrato (props)
```ts
export type BotButtonsEditorProps = {
  buttons: BotButton[];              // grupo atual (BotButton no INDICE)
  actionCatalog: BotAction[];        // ações disponíveis (filtrar enabled !== false)
  canUseOfficialButtons: boolean;    // de providerCapabilities (Parte A)
  label?: string; hint?: string;
  onChange: (next: BotButton[]) => void;
};
export function BotButtonsEditor(props: BotButtonsEditorProps): JSX.Element
```
- Adicionar/editar/remover item; no modo QR exibir o índice numérico (1,2,3) à frente; no modo Meta exibir como botão.
- O `actionId` continua sendo escolhido do `actionCatalog` nos DOIS modos (a numeração QR é só apresentação).
- Reaproveitar a lógica de edição já existente em `page.client.tsx` (`addBotao`/`editarBotao`/`removerBotao`) como base, mas encapsulada e dirigida por `onChange` (sem estado global da página).

## Leis
Estilo em `bot-buttons.css`, token/classe central, zero hex/inline (check-pele). Reusar classes de campo do tema
(ex.: `.field-dark`, `.btn-ghost`) quando existirem; não recriar visual.

## Aceite
- Com `canUseOfficialButtons=false` o editor mostra opções numeradas + aviso; com `true`, botões interativos.
- Editar dispara `onChange` com o array novo. `cd frontend && npm run lint && npm run build` verdes.

## Reverter
Apagar `bot-buttons-editor.tsx` + `bot-buttons.css` (não referenciados até E).
