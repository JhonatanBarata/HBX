# Regras de disposição do card (pool × empresa × outras) — fonte única

**Pedido do dono (literal):** uma regra mestra que **deleta todas as outras regras** espalhadas.
Toda saída de card (exclusão em massa, exclusão unitária, finalização do vendedor) pergunta o
**motivo**, e o motivo decide o destino do card em 3 eixos: **volta pra pool / volta pra sua empresa /
volta pra outras empresas**.

## A matriz (pedido) — 3 eixos por motivo
| Motivo | pool | sua empresa | outras empresas | obs |
|---|---|---|---|---|
| **só excluir** | volta | **volta** | volta | libera geral |
| **resultado não satisfatório** | volta | não | volta | |
| **não atendeu** | volta | não | volta | |
| **caixa postal** | **não** | não | não | **bloqueia card** |
| **não quer produto** | volta | não | volta | |
| **fechou venda** | volta | não (prospecção) | volta | **vira cliente da empresa → cadastro OBRIGATÓRIO** |

Onde aparece cada um:
- Exclusão **em massa**: pergunta → `só excluir` / `resultado não satisfatório`.
- Exclusão **unitária** (card de Vendas): pergunta → `só excluir` / `resultado não satisfatório`.
- **Finalização do vendedor** (já existe): `não atendeu` / `caixa postal` / `não quer produto`.
- **Fechar venda**: `fechou venda`.

## CONFERÊNCIA contra o código atual (o "confira isso")
O modelo já existe e quase bate. Dois motores reimplementam a MESMA lógica "leve vs dura":
- `releaseRadarLeadBackToPool` ([vendas.service.ts:9121](../../../backend/src/vendas/vendas.service.ts#L9121)) — usado na exclusão (massa/unitária/`negativar`/`report`).
- `markRadarLeadNegativeForUser` ([radar-core-distribution.mixin.ts:2038](../../../backend/src/webscraping/radar/05-delivery/radar-core-distribution.mixin.ts#L2038)) — usado nas finalizações/disposition (e bot).

Hoje a regra é binária:
- **LEVE** (`discarded`): companyState=`discarded` (some pra sua empresa) + pool=`clean` (volta pros outros).
- **DURA** (globalKill): companyState protegido + pool=status protegido (some pra TODAS).

Visibilidade = duas camadas: `RadarLeadCompanyState.status` controla a SUA empresa; `RadarLeadPool.status`
controla TODAS. (`RADAR_PROTECTED_STATUSES` em [radar-core-shared.ts:208](../../../backend/src/webscraping/radar/shared/radar-core-shared.ts#L208).)

### Achados (divergências que precisam virar trabalho)
1. **3 motivos colapsam na MESMA regra de roteamento** (`volta pool / não sua / volta outras`):
   `resultado não satisfatório`, `não atendeu`, `não quer produto`. A diferença entre eles é só o
   **rótulo/relatório**, não o destino. ⇒ tecnicamente 1 comportamento ("soltar pros outros") com 3 etiquetas.
2. **`não atendeu` HOJE mata global** — `no_answer` está em todas as listas globalKill/protected
   ([vendas.service.ts:9183](../../../backend/src/vendas/vendas.service.ts#L9183),
   [distribution:2034](../../../backend/src/webscraping/radar/05-delivery/radar-core-distribution.mixin.ts#L2034)).
   A matriz quer `não atendeu` voltando pros outros. ⇒ **tirar `no_answer` do globalKill** (passa a LEVE).
3. **`caixa postal` precisa de status próprio.** Hoje `voicemail` é mapeado → `no_answer`, então cai junto.
   Na matriz, `caixa postal` é o ÚNICO outcome de ligação que BLOQUEIA tudo. ⇒ status `voicemail` entra no
   globalKill; `no_answer` sai.
4. **`só excluir` volta pra SUA empresa = NOVO.** Hoje toda exclusão vira `discarded` (some pra você). Pra
   reaparecer pra você precisa companyState **limpo/visível** (status `released`/`new`, não `discarded`) + pool `clean`.
5. **`fechou venda` = NOVO.** companyState=`won` (vira cliente, fica pra empresa) + pool=`clean` (outros veem) +
   **cadastro obrigatório** (amarra no fluxo de [PLAN-FECHAR-VENDA-ATENDIMENTO](PLAN-FECHAR-VENDA-ATENDIMENTO.md) /
   [VENDA-PRONTA-D](PLAN-VENDA-PRONTA-D-FINALIZADAS.md)).
6. **Sem migration:** `status` é `String` livre no Prisma (não enum) → novos status NÃO exigem migration de schema. ✅

### Precisa o dono confirmar (ambiguidades reais)
- **A) `caixa postal` mais grave que `não atendeu`?** É contraintuitivo (caixa postal = caiu na caixa 1×).
  Assumo a intenção: caixa postal = linha não recebe ligação humana (morta) → queima; não atendeu = tenta de novo/outro.
  Confirmar que é isso.
- **B) Status automáticos do bot** (`no_whatsapp`, `invalid_whatsapp`, `invalid_phone`, `opt_out`,
  `do_not_contact`, `complaint`) — a matriz não os cita (são automáticos, não escolha do vendedor).
  **Recomendo manter DURA** (número/contato morto não serve a ninguém; opt-out/reclamação é lei). Confirmar.
- **C) `só excluir` reaparece pra você:** limpar o companyState **preserva** histórico/notas (status `released`)
  ou zera de vez? Recomendo `released` (visível de novo, mantém eventos). Confirmar.

## Desenho — fonte única (a regra que "deleta as outras")
Criar UM módulo central (ex.: `radar/shared/radar-disposition-rules.ts`):

```
CARD_DISPOSITION_RULES = {
  excluir:        { pool: 'clean',   ownCompany: 'release', others: 'release' },               // só excluir
  unsatisfactory: { pool: 'clean',   ownCompany: 'hide',    others: 'release' },               // resultado não satisfatório
  no_answer:      { pool: 'clean',   ownCompany: 'hide',    others: 'release' },               // não atendeu
  voicemail:      { pool: 'blocked', ownCompany: 'hide',    others: 'block'   },               // caixa postal
  not_interested: { pool: 'clean',   ownCompany: 'hide',    others: 'release' },               // não quer produto
  won:            { pool: 'clean',   ownCompany: 'customer',others: 'release', requiresRegistration: true }, // fechou venda
  // automáticos (recomendado, item B): no_whatsapp/invalid_whatsapp/invalid_phone/opt_out/do_not_contact/complaint → pool:'blocked', others:'block'
}
```
Dois conjuntos derivados deste mapa (substituem TODAS as listas hoje duplicadas):
- **BLOCK_GLOBAL** (pool protegido / some pra todas) = motivos com `others:'block'`.
- **HIDE_OWN** (companyState protegido / some pra você) = motivos com `ownCompany:'hide'`.
- **RELEASE_OWN** (volta pra você) = `ownCompany:'release'`.
A diferença-chave vs hoje: `no_answer` fica só em HIDE_OWN, **sai** de BLOCK_GLOBAL.

Listas a aposentar e fazer apontarem pro mapa central:
- `RADAR_PROTECTED_STATUSES` ([shared:208](../../../backend/src/webscraping/radar/shared/radar-core-shared.ts#L208))
- `globalKillStatuses` ([vendas:9183](../../../backend/src/vendas/vendas.service.ts#L9183)) + a de `negativarLeadForUser` (~9308)
- `isRadarGlobalKillStatus` ([distribution:2034](../../../backend/src/webscraping/radar/05-delivery/radar-core-distribution.mixin.ts#L2034))
- `NEGATIVE_RADAR_STATUSES` ([lead-harvest:54](../../../backend/src/webscraping/lead-harvest/lead-harvest-import.service.ts#L54))
- `negativeStatuses` ([factory-admin:1029](../../../backend/src/webscraping/radar/01-search/radar-core-factory-admin.mixin.ts#L1029))

## Blocos de implementação (workers, DEPOIS dos 2 atuais fecharem)
- **Bloco 1 — Fonte única (backend, núcleo):** criar `radar-disposition-rules.ts`; os 2 motores
  (`releaseRadarLeadBackToPool`, `markRadarLeadNegativeForUser`) e as listas passam a derivar do mapa.
  Comportamento idêntico ao de hoje EXCETO `no_answer` (vira leve) e `voicemail` (vira o "bloqueio de ligação").
  ⚠️ Não muda dado histórico — só o roteamento dos novos.
- **Bloco 2 — `só excluir` volta pra você:** status `released` no companyState (visível) + pool `clean`;
  garantir que a vitrine trata `released` como visível.
- **Bloco 3 — UI de motivo:** modal de motivo na exclusão **massa** e **unitária** (`só excluir` /
  `resultado não satisfatório`); finalização do vendedor mapeada (`não atendeu` / `caixa postal` /
  `não quer produto`); remapear o atual "some pra você / some pra todo mundo" pra esses rótulos.
- **Bloco 4 — `fechou venda`:** companyState=`won` + pool `clean` + **cadastro obrigatório** (costura com
  o modal de fechar venda já existente; não duplicar a comissão).

## Guardrails / nada quebrar
- **Tudo reversível** (status é String; sem migration). `git revert` desfaz.
- **Visibilidade é dado de TODAS as empresas** — errar BLOCK_GLOBAL vaza/esconde lead pra clientes reais.
  Implementar com teste por eixo: marcar cada motivo e conferir, no DB local, companyState (sua) + pool (outras).
- **Não tocar a conversa do WhatsApp** — finalização aqui é disposição do CARD no pool; o SOFT-hide da
  conversa é o [PLAN-VENDA-PRONTA-D](PLAN-VENDA-PRONTA-D-FINALIZADAS.md) (complementar, não duplicar).
- **Conflito de workers:** este plano toca `vendas.service.ts`, `radar-core-distribution.mixin.ts`,
  `radar-core-shared.ts`, `detalhes-negocio.tsx`, `vendas/page.client.tsx`. Os 2 workers atuais mexem em
  `radar-core-delivery.mixin.ts` + `leads/page.client.tsx`. Pouco overlap — mas só começar **depois** deles fecharem.
