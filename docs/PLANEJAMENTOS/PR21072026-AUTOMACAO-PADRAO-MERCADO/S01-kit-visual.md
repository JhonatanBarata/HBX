# S01 — Kit visual central (componentes, nenhuma tela)

**Worker: Sonnet · Depende de: nada (paralelizável com S00) · Front-only**

## Objetivo
Nasce a caixa de ferramentas que TODAS as sprints seguintes usam. Sem ela, cada tela
inventaria a sua versão — é exatamente o vício que a frente veio matar.

## Arquivos
- CRIAR `frontend/src/app/(app)/automacao/kit/` (pasta de componentes da frente):
  `status-chip.tsx`, `empty-state.tsx`, `mini-fluxo.tsx`, `phone-preview.tsx`
- EDITAR `frontend/src/app/hbx-theme/automacao.css` (classes novas `.aut-chip-*`,
  `.aut-empty-*`, `.aut-minifluxo-*` — 5 Leis: só token/var, zero hex)
- EDITAR `secao-atendente.tsx` e `secao-cobranca.tsx` APENAS o suficiente pra
  extrair o telefone de prévia duplicado pro `phone-preview.tsx` compartilhado
  (mesma aparência, zero mudança visual nesta sprint)

## Tarefas
1. **`StatusChip`** — 4 estados: `ligado` (dot verde), `pausado` (dot neutro),
   `rascunho` (dot outline), `atencao` (dot âmbar). Label ≤2 palavras, componente
   único, tamanho s/m. É O status do módulo — nenhuma tela renderiza status fora dele.
2. **`EmptyState`** — slot de ilustração (SVG inline `currentColor`) + título ≤4
   palavras + 1 linha ≤70 chars + CTA. Sem prop pra parágrafo: o componente NÃO
   aceita texto longo (a API força a Lei 1).
3. **`MiniFluxo`** — mini-diagrama horizontal de 2–4 nós (ícone+rótulo curto) com
   conectores, CSS puro. Usos: cartões do hub, cards de template (S08), empty de
   Regras (S07). Variante compacta (só dots) pros cartões.
4. **`PhonePreview`** — extrair o telefone que hoje vive duplicado em
   `secao-atendente.tsx` e `secao-cobranca.tsx` pra componente único com slots
   (header nome/avatar, bolhas, botões, input opcional). Prospecção passa a poder
   usá-lo na S05. Aparência final IDÊNTICA à atual — commit desta sprint não muda
   pixel de tela.
5. Ilustrações dos 4 objetivos (atender/cobrar/buscar/reagir) como SVGs inline
   `currentColor` num `kit/ilustracoes.tsx` — traço simples, sem hex, sem binário.

## Aceite
- 4 componentes exportados e usados em pelo menos 1 lugar (PhonePreview substituindo
  os 2 duplicados; screenshot antes/depois idêntico).
- lint + build + check-pele verdes.

## DoD
Commit local: `feat(automacao): S01 — kit visual (StatusChip, EmptyState, MiniFluxo, PhonePreview)`
