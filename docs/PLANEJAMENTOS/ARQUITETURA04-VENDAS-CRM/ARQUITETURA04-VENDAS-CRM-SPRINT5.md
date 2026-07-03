# SPRINT5 — Fachada + split por domínio + frontend (contínuo, oportunista)

> Sem data: cada item entra quando alguém JÁ for mexer naquele domínio por outro motivo.
> 1 domínio por PR — nunca big-bang. Este .md é um trilho, não uma tarefa única.

## Backend — split do `vendas.service.ts` (9.719 linhas → fachada + domínios)

Regra do recorte: `VendasService` vira fachada fina (delega 1-linha); `vendas.controller.ts` e DTOs
NÃO mudam (backend é contrato). Cada extração leva seus testes junto.

| Novo service | Métodos de hoje (âncoras) |
|---|---|
| `crm/vendas-board.service` | `getBoardForUser` L7439, `syncTodayAgendaForUser` L6604, `getPendingSummaryForUser`, `updateLeadForUser` L8287, `registerAttemptForUser`, `negativarLeadForUser`, `deleteLead*`, timeline |
| `intake/lead-intake.service` | `createManualLeadForUser` L7746, `importWebscrapingLeadsForUser` L7811 + preview, `intakeAdvertisingLead` L7260 (Meta ads), dedupe/fingerprint |
| `outreach/vendas-outreach.service` | `enrichLeadForUser` L5107, e-mail de apresentação (draft L5240 / preview L5594 / send L5662) |
| `closing/vendas-closing.service` | `createHbxSalesHandoffForUser` L8615, `...FromConversation` L8920, `createHbxAssistedSignupForUser` L8927, `getHbxHandoffPrefill` L8843, `getHbxClosingPipelineForUser` L3341 |
| `reporting/vendas-reporting.service` | `getConversionReportForUser` L2503, `getSellerAuditForUser` L2751, `updateSellerGovernanceForUser`, `getCrmIntegrityForUser` L4124, export PDF L4924, master notices |
| `profile/sales-profile.service` | `getSalesProfileForUser` L2287, update L2340, sugestão semanal L4979–L5047 |

(Comissão já saiu no SPRINT3; prospecção/inbound no SPRINT1-2.)

### Junto com cada extração (só no código que está sendo movido)

- `user: any` → tipo `VendasActor` (companyId, userId, role, masterContext) resolvido UMA vez —
  hoje `resolveUserContext`/checks se repetem em ~50 métodos.
- Import cross-módulo de função vira injeção/interface onde for barato; alvo final: remover o
  `forwardRef(() => WebscrapingModule)` do `vendas.module.ts` (interface p/ radar disposition +
  pull de leads).

## Frontend — `app/(app)/vendas/page.client.tsx` (1.789 linhas)

- Quebrar em: `useVendasBoard` (fetch/estado do board), `useProspectingStatus` (live-status/controles),
  seções `board/`, `prospeccao/` como componentes — replicando o padrão que JÁ deu certo no Modo Foco
  (componente separado + `lib/vendas-agenda.ts` compartilhada).
- Parar de importar `LeadsClient` (página inteira de `../leads/page.client`) como componente — extrair
  o pedaço realmente usado para `components/hbx/`.
- Convergir fechamento de venda para `FecharVendaModal` (pendência já mapeada na memória FRONTEND).
- 5 Leis do Design System valem: todo visual em token/classe de `hbx-theme/`; `check-pele.mjs` passa.

## Guardrails

- Nenhuma rota/payload muda. Nenhum comportamento muda — extração mecânica.
- Bug achado no caminho: listar, não consertar de brinde.
- Frontend: testar em Chrome, localhost:3001 (credenciais `.test-login.local.md`); preview do Claude
  dá erro demais — usar navegador.

## Checks por PR

- Backend: `npm run build` + testes dos arquivos tocados.
- Frontend: build + check-pele + smoke da tela mexida.
