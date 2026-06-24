# PLAN-BOT-REBUILD-D — Componente `BotVariablesDrawer` (o castelo de variáveis)

Ler `PLAN-BOT-REBUILD-00-INDICE.md` (contrato). Peça **independente** — cria SÓ:
`frontend/src/components/hbx/bot-variables-drawer.tsx` + `frontend/src/app/hbx-theme/bot-variables.css`. **NÃO** tocar
`bot/page.client.tsx` nem CSS compartilhado.

## Objetivo
Uma gaveta que **desliza da direita** com o catálogo de variáveis; clicar numa variável insere `{{key}}` no campo
que estava em foco; clicar fora (no véu) recolhe com o efeito reverso.

## Reusar (NÃO criar animação solta)
As classes centrais já existem em `frontend/src/app/hbx-theme/kit.css`:
- `className="hbx-veil to-right"` → véu fixo que alinha o conteúdo à direita (`justify-content:end`).
- `.hbx-drawer` → o painel (borda esquerda, sombra), com keyframe `hbx-drawer-in` (entra deslizando da direita).
- Clicar no `.hbx-veil` (fora do `.hbx-drawer`) chama `onClose` = efeito reverso (sai do jeito que entrou).
Seguir o padrão dos drawers existentes (ex.: como o `modelo-atendimento-panel` usava véu/drawer). Só o conteúdo
(lista de variáveis) é novo, estilizado em `bot-variables.css` com token/classe central.

## Contrato (props)
```ts
export type BotVariablesDrawerProps = {
  open: boolean;
  variableCatalog: VarDef[];   // VarDef no INDICE: { key, label, example, description, scope, required }
  onClose: () => void;
  onInsert: (token: string) => void;   // chama com '{{key}}'
};
export function BotVariablesDrawer(props: BotVariablesDrawerProps): JSX.Element | null
```
- Quando `open=false` → retorna `null` (não renderiza o véu).
- Lista cada variável: `label`, o token `{{key}}` em mono, `example` e `description`; agrupar por `scope`
  (shared/atendimento/recovery) com um título por grupo. Item clicável → `onInsert('{{' + v.key + '}}')`.
- Acessível: fechar no Esc; foco inicial no painel.

## Leis
`bot-variables.css` só token/classe central, zero hex/inline (check-pele).

## Aceite
- Abre deslizando da direita; lista as variáveis do catálogo; clicar chama `onInsert('{{key}}')`; clicar no véu/Esc chama `onClose`.
- `cd frontend && npm run lint && npm run build` verdes.

## Reverter
Apagar `bot-variables-drawer.tsx` + `bot-variables.css` (não referenciados até E).
