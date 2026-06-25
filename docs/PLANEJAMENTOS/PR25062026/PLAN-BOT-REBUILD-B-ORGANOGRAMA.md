# PLAN-BOT-REBUILD-B — Componente `BotFlowCanvas` (organograma que se monta ao vivo)

Ler `PLAN-BOT-REBUILD-00-INDICE.md` (contrato). Peça **independente** — cria SÓ estes arquivos:
`frontend/src/components/hbx/bot-flow-canvas.tsx` + `frontend/src/app/hbx-theme/bot-flow.css`. **NÃO** tocar
`bot/page.client.tsx` nem CSS compartilhado.

## Objetivo
Substituir o canvas decorativo fixo (hoje `NODES`/`EDGES` hardcoded em `page.client.tsx`) por um organograma
**derivado da config** que **se monta conforme o dono preenche as fases** — efeito "quebra-cabeça/jogo".

## Contrato (props)
```ts
export type BotFlowCanvasProps = {
  config: BotConfig;          // tipos no INDICE
  activeStep?: string;        // chave da fase em foco (ex.: 'mainMenuPrompt') p/ destacar o nó
};
export function BotFlowCanvas(props: BotFlowCanvasProps): JSX.Element
```

## Como derivar o grafo (não inventar dado)
- **Nós** = as fases/mensagens da config: `welcomeMessage` (Boas-vindas), `mainMenuPrompt` (Menu),
  `postActionPrompt` (Pós-ação), `humanAckMessage` (Humano), `closeTopicMessage` (Encerramento),
  `returningCustomerMessage` (Retorno), `blockedMessage` (Bloqueado).
- **Arestas** = botões → cada `BotButton.nextNodeId` aponta o próximo nó (mapeamento já existe no backend via
  `resolveDefaultAtendimentoNextNodeId`; o `nextNodeId` vem no payload). Botão de `welcomeButtons`/`mainMenuButtons`
  vira aresta do nó da fase pro nó destino.
- **Estado do nó (o "monta ao vivo"):** nó **aceso** quando a mensagem da fase está preenchida (e/ou tem botão);
  **apagado/fantasma** quando vazia. `activeStep` destaca o nó em edição.
- Auto-layout simples (colunas por profundidade ou grade fixa por fase) — não precisa editor arrastável.

## Visual / Leis
- Reaproveitar a linguagem do canvas atual (nós tipo `.node`, conectores SVG com fluxo) **mas** todo estilo em
  `bot-flow.css` com **token/classe central** — zero hex/inline color (check-pele). Pode usar `var(--hbx-*)`.
- Transição suave quando um nó acende (entra no grafo) — efeito jogo. Respeitar `prefers-reduced-motion`.

## Aceite
- Componente isolado renderiza um grafo a partir de uma `config` mock (nós acendem conforme campos preenchidos).
- `cd frontend && npm run lint` (check-pele limpo nos arquivos novos) e `npm run build` verdes.

## Reverter
Apagar `bot-flow-canvas.tsx` + `bot-flow.css` (não estão referenciados até a etapa E).
