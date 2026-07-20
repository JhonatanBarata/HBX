# S11 — Visão unificada dos "plays" proativos (adapter)

**Fase 2 · Worker: Sonnet · Depende de: S07 · Aditivo, sem DDL**

## Objetivo
Prospecção, cadências e rotinas são todos "plays" proativos (o sistema toma iniciativa). A S15
(tela fundida) precisa de UMA lista com estado uniforme. Sem schema novo: adapter de leitura +
ações roteadas pros services donos.

## Arquivos
- CRIAR `backend/src/automation/plays.service.ts` (+ test)
- EDITAR `backend/src/automation/automation.controller.ts`

## Tarefas
1. `GET /automation/plays` → `[{ id, tipo: 'prospeccao'|'cadencia'|'rotina', nome, ativo,
   resumo (ex.: "5 toques · 3 WhatsApp" | "toda segunda · até 50 leads" | config do disparo frio),
   contagem (inscritos/leads), ultimaExecucao {at, status, count}, fonte {savedSearchId?, persona?} }]`
   — compondo: `cadencia.service` (lista), `cadencia-rotina.service`, e live-status do
   vendas-automation (prospecção como play singleton da empresa).
2. Ações uniformes, roteando pro dono: `POST /automation/plays/:tipo/:id/toggle` (PATCH ativa),
   `POST /automation/plays/cadencia/:id/aplicar` (delega pro endpoint/service atual). Prospecção:
   toggle delega pro fluxo atual de live do tipo prospeccao (`bot-activation`). Validação/permissão
   (`canManage`) IGUAL à atual de cada domínio — reusar, não reimplementar.
3. Fail-soft por bloco (padrão S04). Teste unit com mocks (lista compõe os 3; toggle roteia certo;
   empresa sem módulo vendas → plays de vendas ausentes sem 500).

## Critérios de aceite
- Build + testes verdes; endpoints legados intactos; zero lógica de negócio duplicada.

## DoD
Commit local: `feat(automation): S11 — lista unificada de plays proativos`
