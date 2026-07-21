# S02 — Hub: cartões vivos, zero prosa

**Worker: Sonnet · Depende de: S01 · Front-only**

## Objetivo
O hub é a primeira impressão do módulo. Hoje: hero em prosa + 4 cartões com parágrafo.
Vira: 4 cartões que MOSTRAM o estado (padrão HubSpot: mini-diagrama + número + status).

## Arquivos
- EDITAR `frontend/src/app/(app)/automacao/page.client.tsx`
- EDITAR `frontend/src/app/hbx-theme/automacao.css`

## Tarefas
1. **Hero enxuto**: título "Automação" + chip de chip-WhatsApp (já existe) — REMOVER
   a frase "Uma superfície só, entrada por objetivo…" e a explicação à direita.
   O estado do chip fala sozinho (StatusChip `atencao` quando sem chip, tooltip com
   a ação).
2. **Cartões**: cada um vira — ilustração do objetivo (kit S01) + título ≤3 palavras
   + `MiniFluxo` compacto do que ele faz + 1 número-chave GRANDE (o que já vem do
   overview) + `StatusChip`. REMOVER os parágrafos descritivos ("Roteiro de menu ou
   IA respondendo…", etc.) — sem substituir por outra frase.
3. **A6 no cartão Cobrança**: hoje dot "Pausado" + número "Ligado" convivem. Regra
   nova de apresentação: o StatusChip mostra o estado da COBRANÇA da empresa
   (live/pausado); "Disparo automático" só aparece como linha secundária quando
   divergir do estado (e com rótulo humano, ex. "envio automático ativo") — nunca
   dois termos de status com o mesmo peso.
4. Preflight ruim (sem chip): aviso vira ícone+tooltip no cartão, não frase solta.
5. QA local (Chrome, localhost:3001): 4 cartões com dado real do overview; fail-soft
   ("Não carregou / Tentar novamente") preservado; gates por seção preservados
   (cartão some pra quem não tem o módulo — testar com perfil vendas-só se disponível).

## Aceite
- Nenhum parágrafo no hub (Lei 1); cartões com mini-visual + número + StatusChip.
- Overview continua sendo a ÚNICA fonte (zero chamada nova).
- lint + build + check-pele verdes.

## DoD
Commit local: `feat(automacao): S02 — hub com cartões vivos (mini-fluxo + número + status)`
