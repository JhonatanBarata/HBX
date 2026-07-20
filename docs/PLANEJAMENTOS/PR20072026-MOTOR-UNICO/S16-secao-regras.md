# S16 — Seção Gatilhos & Rotinas ("Reagir e abastecer")

**Fase 3 · Worker: Sonnet · Depende de: S12 · Frontend**

## Objetivo
Última seção da casca (`?secao=regras`): Gatilhos (reagir quando lead responde) + Rotinas
(abastecer o funil) — reembalagem das abas atuais do /automacoes, endpoints intocados.

## Arquivos
- CRIAR `frontend/src/app/(app)/automacao/secao-regras.tsx`
- PORTAR padrões de `GatilhosTab`/`RotinasTab`/`NovoGatilhoModal`/`NovaRotinaModal` de
  `frontend/src/app/(app)/automacoes/page.client.tsx` (reimplantar na seção com as MESMAS classes
  css — a tela velha morre na S19, então copiar-e-adaptar aqui é aceitável e esperado)
- EDITAR `frontend/src/app/(app)/automacao/page.client.tsx` + `automacao.css`

## Tarefas
1. Sub-abas "Gatilhos" e "Rotinas" (GlassPill, padrão atual) com os MESMOS contratos:
   `GET/POST/PATCH/DELETE /cadencia/gatilhos` e `/cadencia/rotinas`; estados vazios-vitrine
   mantidos (são bons); criação/toggle/remoção idênticos.
2. Rótulo do quando-então preparado pro futuro (S08): o texto do evento vem de um mapa
   `EVENTO_LABEL` extensível, não hardcoded inline.
3. Aviso do runner (só roda com motor ligado) mantido, lendo do overview.
4. QA local: criar gatilho, criar rotina, toggle, remover; console limpo.

## Critérios de aceite
- Paridade 100% com as abas velhas; lint+build verdes.

## DoD
Commit local: `feat(automation): S16 — seção Gatilhos & Rotinas na casca única`
