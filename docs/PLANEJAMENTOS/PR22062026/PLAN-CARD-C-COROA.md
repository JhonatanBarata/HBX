# PLAN-CARD-C — Coroa de "enriquecido"

> Projeto noturno 21/06. Worker. Roda DEPOIS do A (slot da coroa existe) e junto/depois do B (flag no payload).
> Pedido do dono: "uma coroa pra eu saber se foi enriquecido ou não". Slot já reservado no header pelo A.

## ACHADO (consultei o repo — importante pro dono ver de manhã)
- O **flag de enriquecido EXISTE** no backend: pipeline de enrichment do radar (`buildRadarLeadEnrichment`,
  `RADAR_LEAD_ENRICHMENT_VERSION`) e, no payload, `leadIntelligence.enrichmentStatus` / `enrichedAt` /
  `visibilityTier`. Confirmar o campo canônico e expor um booleano simples (ex.: `enriched`/`isEnriched`) nas 3 telas.
- O **ícone da coroa NÃO existe** em lugar nenhum: só os 6 webp de canais em `/Icones` e ZERO referência a
  "coroa/crown" no código. → **CRIAR** o ícone (não há asset pronto, ao contrário do que o dono lembrava).

## O que fazer
1. Backend: expor um booleano `enriched` no payload das 3 telas (derivado de enrichmentStatus/enrichedAt — confirmar
   o campo real). Aditivo. (Coordenar com o B — mesmo serializer.)
2. Front: criar o ícone da coroa pelo sistema central — preferir um path no set `ICONS` (shell.tsx) OU classe
   central (`.crown-ico` em kit.css) seguindo o padrão dos `.chan-ico`. Nada de hex/inline (5 Leis / check-pele).
3. Mostrar a coroa no **slot do header** (perto do nome / fileira dos 6 ícones): **acesa quando `enriched`**, 
   apagada/ausente quando só sketch. Tooltip "Lead enriquecido" × "Só sketch do Radar".
4. Checks: lint + build verdes (front e back).

## RISCO p/ o dono (RISCOS.md)
- A coroa foi **criada do zero** (não existia). Se você tem um asset de coroa em outro lugar que eu não achei,
  é só trocar o arquivo/icone — a ligação no flag fica pronta. Confirme de manhã.
- Confirmar que `enrichmentStatus`/`enrichedAt` é mesmo o sinal certo de "enriquecido" (vs. visibilityTier/tier premium).
