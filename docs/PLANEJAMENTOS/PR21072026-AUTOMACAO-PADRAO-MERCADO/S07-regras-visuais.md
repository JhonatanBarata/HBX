# S07 — Regras: diagramas no lugar de aulas

**Worker: Sonnet · Depende de: S01 · Front-only**

## Objetivo
Os empty states de Gatilhos e Rotinas são parágrafos didáticos — o oposto da ordem
do dono ("as imagens têm que falar por si"). E a rotina sem pesquisa salva é beco
sem saída (A5).

## Arquivos
- EDITAR `frontend/src/app/(app)/automacao/secao-regras.tsx`
- EDITAR `frontend/src/app/hbx-theme/automacao.css`

## Tarefas
1. **Empty de Gatilhos**: os pills atuais ("Lead responde → mover p/ retorno →
   notificar vendedor") já são o embrião certo — promover a `MiniFluxo` grande
   (3 nós com ícone) + título ≤4 palavras + 1 linha + CTA. DELETAR o parágrafo
   ("Gatilho é o reflexo do funil: … Nada de lead respondido ficar esquecido.").
2. **Empty de Rotinas**: idem — MiniFluxo "Toda segunda → Pesquisa salva → 50 no
   funil" + 1 linha + CTA. Parágrafo fora.
3. **A5 — rotina destravada**: no modal, quando a empresa NÃO tem pesquisa salva:
   combo dá lugar a um mini-EmptyState inline com CTA "Criar pesquisa" levando pro
   lugar REAL onde se cria (VERIFICAR a rota atual — Radar/vendas — e apontar
   certo; testar o caminho de volta). Com pesquisas: combo normal.
4. Cards de gatilho/rotina existentes: QUANDO/ENTÃO viram forma (ícones + setas do
   MiniFluxo compacto), StatusChip pro ativo/pausado, contador de disparos como
   número — sem frases.
5. Linhas-guia sob as tabs ("Quando o lead responde no WhatsApp, dispara ações no
   funil — sem enviar mensagem automática." / "Recorrência sobre uma pesquisa
   salva…") → encurtar pro teto (≤70 chars) — a de gatilhos carrega a informação
   de SEGURANÇA "sem enviar mensagem automática", ela FICA (encurtada), é a única
   frase com valor que forma não carrega.
6. QA local: criar/ativar/desativar/remover gatilho; modal de rotina nos 2 estados
   (com e sem pesquisa salva — sem pesquisa é o estado real da empresa 5 hoje);
   apagar o gatilho de QA "QA teste 21-07 (apagar)" se ainda existir (limpeza
   combinada com o dono).

## Aceite
- Zero parágrafo na seção; empties são diagrama+1 linha+CTA.
- Sem pesquisa salva: caminho claro pra criar, ida e volta funcionando.
- lint + build + check-pele verdes.

## DoD
Commit local: `feat(automacao): S07 — regras com diagramas e rotina destravada`
