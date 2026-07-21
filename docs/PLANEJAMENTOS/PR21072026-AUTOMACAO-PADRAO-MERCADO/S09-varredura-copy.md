# S09 — Varredura final: copy, contraste, consistência

**Worker: Sonnet · Depende de: S02-S08 · Front-only**

## Objetivo
Pente-fino adversarial nas 5 telas (hub + 4 seções) contra as Leis 1-3 do README.
As sprints anteriores mexeram cada uma no seu quadrado; esta caça o que escapou e
o que ficou inconsistente ENTRE elas.

## Tarefas
1. **Auditoria de copy**: passar tela a tela listando TODO texto visível num
   relatório (`RELATORIO-S09.md` na pasta do plano): bloco, texto, chars, veredito
   (fica/encurta/vira tooltip/some). Aplicar os cortes. Teto: título ≤4 palavras,
   linha ≤70 chars, parágrafo só em tooltip.
2. **Auditoria de status**: grep por render de status fora do `StatusChip` nas 5
   telas — zero tolerância. Vocabulário final único: Ligado/Pausado/Rascunho/Atenção.
3. **Consistência de kit**: PhonePreview, EmptyState, MiniFluxo, card de template —
   conferir que nenhuma tela tem fork local dos componentes.
4. **Contraste** (regra do dono: contraste é VISUAL e SEMPRE): revisar os tokens
   usados pelos componentes novos nos DOIS temas (claro/escuro do toggle) — texto
   secundário sobre fundo de card, dots de status, traço das ilustrações. Ajustar
   via token central, nunca na tela.
5. **Jargão**: grep final por termos proibidos na UI (`skipped`, `preflight`,
   `executor`, `worker`, `flag`, nomes de env) — zero ocorrência visível.
6. QA local com screenshot das 5 telas nos 2 temas anexado ao relatório.

## Aceite
- `RELATORIO-S09.md` com a auditoria completa e o antes/depois.
- lint + build + check-pele verdes.

## DoD
Commit local: `polish(automacao): S09 — varredura de copy, contraste e consistência`
