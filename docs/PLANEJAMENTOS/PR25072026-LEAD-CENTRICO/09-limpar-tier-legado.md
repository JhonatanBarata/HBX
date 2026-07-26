# S9 — Limpar o esqueleto list/lead/full (paywall por tier, morto desde a Fase 2 dos CRÉDITOS)

## Ordem do dono (26/07)
"Só remove isso, sem legado, limpa tudo." O paywall por tier foi aposentado DE PROPÓSITO no
commit `bacb2725` ("crédito vira modelo único"): `getCommercialPlanTier()` sempre devolve
'full' (ignora o plano) e `getCommercialPlanCapabilities()` devolve tudo true. Toda checagem
em cima disso é código morto que sempre responde "pode". Remover o esqueleto inteiro.

## Remover (o fantasma)
- `commercial-plan-catalog.ts`: tipo `CommercialPlanTier`, `getCommercialPlanTier`,
  `CommercialPlanCapabilities`, `getCommercialPlanCapabilities` — e TODOS os call sites.
- `commercial-plans.service.ts`: `tier`, `canSeeLeadIntelligence`, `canSeeCompanyData`
  derivados/retornados (~349-355, 396-398) — sincronizar consumidores da resposta.
- `vendas.service.ts`: `buildPlanAccess`/`VendasPlanAccess`/`capabilities.*` (as checagens
  colapsam pra "permitido" — remover o if, manter o ramo do sim); `preVoo.locked` e o gate
  do `getLeadPreVooForUser`/inscrição de cadência; `hasManualLeadEnrichmentUnlock` (bypass
  de paywall que não fecha mais); paywalls mortos tipo `ForbiddenException('... disponível
  no HBX Lead Plus')` gated em capability sempre-true (conferir um a um que a capability é
  das sempre-true ANTES de remover o throw).
- `decorateManualEnrichmentIntelligence`: avaliar — se só existe pro bypass, remove; se
  adiciona informação REAL de exibição (proveniência do enriquecimento no card), manter a
  informação e matar só o vínculo com o paywall. Registrar a decisão no relatório.
- Front: `shell.tsx` (campos `canSeeLeadIntelligence`/`tier` do entitlements e o fallback
  `tier !== 'list'`), `lead-cockpit-modal.tsx` e `detalhes-negocio.tsx` (`canSeeIntelligence`
  e ramos de "locked") — remover os gates, manter o ramo liberado.
- Testes que asseguravam capabilities/tier: atualizar pra nova forma (não deletar cobertura
  de comportamento real).

## NÃO tocar (o que está VIVO — fronteira crítica)
- Catálogo/preço/billing dos planos (PADRAO/LITE/PRO/MELHOR, títulos "HBX List/Pro/Lead
  Plus", `billingBreakdown`, trial, grace, `creditsAccount`) — NOMES de plano e cobrança
  ficam; o que morre é o TIER como régua de acesso.
- RBAC/política de time (`UserTeamPolicy`, `canEditCards`) e LEI DO VENDEDOR (só Admin vê
  valores) — é a camada substituta, viva.
- Sistema de créditos inteiro. Gates do S8 (config Admin + WhatsApp). Supressão S7.
- `platform_infra` e `accessPaused`/estado de acesso (isso é inadimplência, não tier).

## Guardrails
- Os do `00-FRENTE.md` (master direto, add por caminho, sem publish, atendimento/recovery/
  Webwhats intocados, tokens no front).
- ⚠️ O dono roda publish A QUALQUER MOMENTO (aconteceu no S8): NUNCA deixar o tree sem
  compilar entre saves; refatorar em passos coerentes; commitar cedo quando fechar coerente.
- Comportamento observável NÃO pode mudar pra nenhuma empresa (tudo já respondia "pode") —
  esse é o teste de mesa da limpeza inteira.

## Aceite
- `grep -r "CommercialPlanTier\|canSeeLeadIntelligence\|getCommercialPlanCapabilities\|hasManualLeadEnrichmentUnlock" backend/src frontend/src` → zero ocorrências (fora de testes de
  regressão da nova forma, se houver).
- Typecheck backend+front, lint/check-pele, suítes tocadas verdes.
- Commit LOCAL: `chore(plans): remover tier list-lead-full e paywall morto (S9 LEAD-CENTRICO)`.
- Relatório: tabela do que saiu, decisão do `decorateManualEnrichmentIntelligence`, prova de
  comportamento inalterado (testes antes/depois).
