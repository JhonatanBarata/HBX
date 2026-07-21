# S05 — Prospecção: jargão fora, prévia dentro

**Worker: Sonnet · Depende de: S01 · Front-only**

## Objetivo
A seção mais suja de jargão interno vira vitrine: telemetria some, personas ganham
prévia real no telefone, copy no teto.

## Arquivos
- EDITAR `frontend/src/app/(app)/automacao/secao-prospeccao.tsx`
- EDITAR `frontend/src/app/hbx-theme/automacao.css`

## Tarefas
1. **REMOVER os chips de telemetria** `cadencia_steps · ligado · skipped` /
   `cadencia_rotinas · …` da tela (decisão do README: remover, não esconder).
   A linha "Prospecção fria e cadência de toques saem pelo mesmo canal — o motor
   abaixo mostra o ritmo real" sai junto. O que o usuário precisa saber é o estado
   humano: StatusChip "Disparo automático ativo" (já existe à direita) fica — via
   componente do kit.
2. **Personas com prévia**: os 3 cards de persona (Confiável/Estratégico/Determinado)
   mantêm a timeline de toques, mas ganham `PhonePreview` mostrando a mensagem de
   ABERTURA da persona (dados que a tela JÁ tem — `passos[0]`). Forma sugerida:
   prévia no drawer/foco do card, não os 3 telefones lado a lado (peso visual);
   worker decide dentro do padrão do kit.
3. **Grade do topo**: cards de status (Prospecção/personas) passam pro StatusChip;
   número-chave grande (leads na fila / leads dentro); rótulos ≤2 palavras.
4. Copy no teto na seção inteira ("Ritmo de toques — escolha uma personalidade…"
   → 1 linha ou some; descrições das personas ≤70 chars — cortar mantendo o
   sentido: "Toque leve e espaçado…" já está perto do teto).
5. **NÃO TOCAR**: `<BotProspeccaoPanel>` por dentro (motor de disparo frio com
   Termos+confirm — guardrail da S15 da frente-mãe segue valendo); toggles e
   fluxo de ativação intocados.
6. QA local: seção abre, personas com prévia, aplicar continua funcionando (S00 já
   deixou a mensagem honesta), drawer do disparo frio abre com o painel intacto.

## Aceite
- Zero jargão interno na tela (grep visual: `skipped`, `steps`, `rotinas` como
  termo cru não aparecem).
- Prévia de abertura visível por persona via PhonePreview.
- lint + build + check-pele verdes.

## DoD
Commit local: `feat(automacao): S05 — prospecção sem jargão + prévia por persona`
