# S18 — Matar código morto do construtor antigo (front)

**Fase 4 · Worker: Sonnet · Depende de: S17 · DESTRUTIVO (autorizado)**

## Objetivo
Demolir o que a casca nova substituiu DENTRO dos componentes que sobrevivem — antes de apagar
arquivos inteiros (S19). Guiado pelo relatório da S02 e pelo que S13-S16 efetivamente reusaram.

## Alvos confirmados (do diagnóstico 20/07)
1. **Modos Trilha e Bandeja** do construtor (S13 manteve só Tabuleiro): remover `MONTAGEM_MODOS`,
   estados de drag, blocos de render dos 2 modos e classes css `bot-trail*`/`bot-tray*`/`bot-drop*`
   de `screens.css` (conferir uso zero por grep antes de cada remoção).
2. **Chat de teste fake** (CHAT0/reply/step hardcoded do bot velho): o sandbox real (S13) o
   substituiu. Remover a simulação local e os EMOJIS/hhmm órfãos SE nenhum sobrevivente usar.
3. **`BotOnboarding`**: wizard duplicado — o wizard do Atendente (S13) é o único. Remover componente
   + auto-open + css, SE grep confirmar zero uso restante.
4. **`BotProspeccaoPanel`**: NÃO matar (reusado na S15). Só remover props/estados que existiam
   exclusivamente pro contexto do /bot velho, se houver.

## Método (por alvo, nesta ordem)
grep de uso → zero uso fora do morto → remover código → remover css → `npm run lint && npm run build`
→ smoke local da seção afetada. Um commit por alvo NÃO — um commit da sprint (mas cada alvo
verificado individualmente).

## Critérios de aceite
- Alvos 1-3 removidos; nenhum import quebrado; check-pele verde; build verde; QA local das 4
  seções sem regressão visual.

## Proibições
- Não remover NADA que o grep mostre em uso (na dúvida, listar no relatório da sprint e deixar).
- `WhatsAppPreview`, `BotFlowCanvas`, `BotPhaseEditor`, `BotVariablesDrawer`, `BotTermsModal` FICAM.

## DoD
Commit local: `chore(automation): S18 — demolição do construtor antigo (modos, chat fake, onboarding)`
