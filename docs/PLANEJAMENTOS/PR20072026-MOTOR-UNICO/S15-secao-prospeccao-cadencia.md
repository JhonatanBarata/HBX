# S15 — Seção Prospecção & Cadência (fundidas)

**Fase 3 · Worker: Sonnet · Depende de: S11, S12 · Frontend**

## Objetivo
As DUAS caras do outbound frio (guia Prospecção do /bot + aba Cadências do /automacoes) viram UMA
seção "Buscar clientes" (`?secao=prospeccao`), alimentada pela lista unificada de plays (S11).
Fim da duplicidade que confundia: era o MESMO canal de saída com duas telas.

## Arquivos
- CRIAR `frontend/src/app/(app)/automacao/secao-prospeccao.tsx`
- REUSAR: `BotProspeccaoPanel` (importar; refatorar SÓ o necessário pra viver fora do /bot),
  cards de persona + `AplicarModal` (padrões do /automacoes — reimplantar na seção, mantendo classes)
- EDITAR `frontend/src/app/(app)/automacao/page.client.tsx` + `automacao.css`

## Tarefas
1. Topo: lista de plays (`GET /automation/plays`) — grade única com tipo (badge Prospecção/
   Cadência/Rotina — rotina aparece AQUI só como leitura, gestão fica na S16), estado, resumo,
   última execução, toggle (`POST /automation/plays/:tipo/:id/toggle`).
2. "Disparo frio" (prospecção): abrir o painel real (`BotProspeccaoPanel`) em drawer/subseção —
   config continua nos endpoints atuais `/vendas/automation/*`. Aviso de proativo + Termos mantidos.
3. "Ritmo de toques" (cadência): cards de persona + aplicar (lista de leads | pesquisa salva) —
   comportamento atual, visual integrado.
4. Chip de motor: estado do runner (overview S07 `motor.executores`) visível na seção — "Disparo
   em espera / ATIVO" como hoje na /automacoes, agora com telemetria por executor.
5. Sem R$ na tela (LEI DO VENDEDOR intocada — tela de vendedor não mostra valores).
6. QA local: aplicar cadência a lead de teste; toggle play; abrir config de prospecção; console limpo.

## Critérios de aceite
- 1 seção opera os dois motores; zero chamada nova de negócio (só plays + endpoints atuais);
  lint+build verdes.

## DoD
Commit local: `feat(automation): S15 — prospecção e cadência fundidas na seção Buscar clientes`
