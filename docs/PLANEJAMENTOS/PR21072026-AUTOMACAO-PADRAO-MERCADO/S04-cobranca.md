# S04 — Cobrança: status coerente + copy

**Worker: Sonnet · Depende de: S01 · Front-only**

## Objetivo
Seção mais madura visualmente (canvas + prévia) — o trabalho aqui é coerência:
StatusChip único, vocabulário sem contradição (A6) e copy no teto.

## Arquivos
- EDITAR `frontend/src/app/(app)/automacao/secao-cobranca.tsx`
- EDITAR `frontend/src/app/hbx-theme/automacao.css` (se precisar)

## Tarefas
1. Substituir todo status ad-hoc da seção pelo `StatusChip` (kit S01). Um estado
   por vez, hierarquia clara: estado da cobrança da empresa em cima; detalhe
   secundário (worker/disparo automático) como linha menor com rótulo humano —
   mesma regra de apresentação definida no cartão do hub (S02 item 3).
2. Copy no teto: header da seção ("Recovery: lembra o cliente que ficou devendo,
   no ritmo certo, sem constrangimento") → 1 linha ≤70 chars ou some (a prévia no
   telefone já mostra o que é). Legenda do rodapé da prévia ("Recovery não tem
   cérebro de IA — a prévia só mostra o que a config vai enviar, não simula
   resposta") → tooltip no header da prévia.
3. Prévia usa o `PhonePreview` compartilhado (S01 já extraiu — conferir que a
   seção está no componente, sem fork local).
4. Aviso "Sem chip": ícone + StatusChip `atencao`, tooltip com a ação — não frase.
5. QA local: canvas 7 peças navegável, prévia espelhando as peças prontas, salvar/
   publicar sem regressão (não publicar de verdade — conta do dono; só até o modal).

## Aceite
- Um único vocabulário de status na seção inteira; zero parágrafo.
- lint + build + check-pele verdes.

## DoD
Commit local: `feat(automacao): S04 — cobrança com status único e copy enxuta`
