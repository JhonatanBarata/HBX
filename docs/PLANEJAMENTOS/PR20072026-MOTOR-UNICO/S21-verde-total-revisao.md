# S21 — Verde total + revisão adversarial do diff completo ⚠

**Fase 5 · Worker: Sonnet (verificação) + Orquestrador (revisão) · Depende de: S01-S20**

## Objetivo
Prova de que o pacote inteiro está são ANTES do publish do dono. Nada de "verde técnico" — verde
de verdade, com olho adversarial no diff acumulado.

## Tarefas (worker)
1. Backend: `npm run prisma:validate` + `npm run build` + `test:automation` + toda suite `test:*`
   que toque messaging/assistente/cadencia/vendas/bot + smoke `start:dev` (sobe sem erro de DI —
   lembrete: build verde ≠ boot ok, caso 04/07).
2. Frontend: `npm run lint` (eslint + check-pele) + `npm run build` (apagar `.next` antes — cache
   engana) + `npm run dev` e navegar: hub, 4 seções, redirects, login/logout.
3. Diff review sistemático: `git diff 127b9166..HEAD --stat` — para CADA arquivo tocado fora de
   `automation/`/`automacao/`, justificar em 1 linha por que mudou (relatório). Arquivo mudado sem
   justificativa = investigar.
4. Greps de segurança: nenhuma flag nova ligada por default (exceto a decisão S20 item 2);
   nenhum `console.log` esquecido; nenhum hex/inline novo (check-pele); nenhum import de Webwhats.
5. Gerar `docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/RELATORIO-S21.md`: resultado de cada check,
   diff-stat justificado, pendências conhecidas.

## Tarefas (orquestrador, após o worker)
6. Revisão adversarial do diff completo com foco em: precedência inbound (S01 ainda é juiz),
   porta única de saída, claims idempotentes, gates fail-closed, migrations (aditivas aplicáveis,
   destrutivas em hold), fallbacks de flag.
7. Sanidade de restauração: conferir que `git reset --hard 127b9166` + backup Desktop cobrem tudo
   (nenhum arquivo novo fora do repo além do planejado).

## Critérios de aceite
- TODOS os checks verdes documentados no relatório; zero mudança órfã no diff; boot local ok.

## DoD
Commit local: `test(automation): S21 — verificação total pré-publish`
