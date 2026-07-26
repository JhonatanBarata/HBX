# S3 — Pré-voo no detalhes do lead: entender ANTES de disparar

## Conceito (decisão do dono 25/07)
Fim do "pesquisei, disparou, foda-se". O vendedor abre o detalhes, LÊ o que o sistema entendeu,
planeja (persona/objetivo) e só depois libera o robô (a liberação em si é o S4 — aqui o botão
nasce DESABILITADO com dica "em breve"). Nada dispara neste sprint.

## Entrega
1. **Backend `GET /vendas/lead/:id/pre-voo`** (controller de vendas, mesma autz do detalhes):
   - **Entendimento**: empresa (nome/razão/CNPJ/segmento/cidade), contato provável — buscar
     `ownerName`/sócios na base RFB local (`CnpjPublicCompany`/`CnpjPublicPartner` por CNPJ; a
     base tem 25M sócios) e nos `LeadContact` existentes, com grau de confiança da fonte;
     canais disponíveis (zap confirmado? email? telefone?) derivados do que o lead já tem.
   - **Prontidão**: lista de dados confirmados, duvidosos e FALTANTES (ex.: "sem email — passo
     de e-mail da cadência será pulado"); veredicto simples: pronto / falta X.
   - **Recomendação**: persona sugerida entre as 3 seeds existentes
     (`backend/src/cadencia/cadencia-personas.ts` — Confiável/Estratégico/Determinado) por
     heurística simples (ex.: lead com zap confirmado e dono conhecido → Estratégico). SEM IA
     neste sprint — campo `recommendation.source: 'heuristica'` pra IA plugar depois.
   - **Regra do nome (dura)**: nome de contato só entra na mensagem se confiança alta
     (fonte QSA/LeadContact confirmado). Senão o preview usa abertura NEUTRA ("Olá, tudo bem?
     Estou tentando falar com o responsável pela [empresa]...") — NUNCA inventar nome nem
     "Boa tarde Empresa X".
2. **Painel "Planejar" no detalhes do lead** (front): o detalhes de /vendas é o cockpit modal
   de 1 clique (`frontend/src/components/hbx/lead-cockpit-modal.tsx` — confirmar ao vivo).
   Painel/aba compacta com: entendimento + prontidão (dados faltantes em destaque), escolha de
   persona (3 cards curtos, descrição das seeds) + objetivo, e REVISÃO: passos da cadência
   escolhida com as mensagens que serão enviadas (corpo real da seed, placeholders resolvidos
   pela regra do nome). Botão "Ligar robô" desabilitado (S4 liga). 1 tela, sem scroll infinito,
   sem textão inventado — copy mínima, marcada `<!-- copy provisória: dono revisa -->` no código
   NÃO (sem comentário de PR): listar as strings novas no relatório final pro dono revisar.
3. **Enriquecer sob demanda (mínimo)**: se faltar contato, botão "Buscar dados" que dispara o
   caminho de enriquecimento EXISTENTE mais barato (base RFB local primeiro; nada de fonte paga
   sem budget — respeitar governor/LEI Nº1). Se o caminho exigir infra da fábrica/fila, deixar o
   botão atrás de flag `HBX_PREVOO_ENRICH_ENABLED` default OFF e registrar no relatório.

## O que NÃO fazer
- NÃO redesenhar o cockpit inteiro (frontend grande = último passo, decisão do dono).
- NÃO disparar nada, NÃO criar inscrição de cadência (S4).
- NÃO chamar IA/LLM neste sprint. NÃO tocar atendimento/recovery/Webwhats.

## Aceite
- Testes do endpoint (lead com CNPJ+QSA acha dono; lead sem dado confiável → abertura neutra;
  dados faltantes listados). Typecheck + lint (check-pele) verdes.
- Commit local: `feat(vendas): pre-voo do lead — entendimento, prontidao e plano (S3 LEAD-CENTRICO)`.
- Relatório final: strings de UI novas (pro dono revisar), decisões de implementação, flags.
- Guardrails gerais: `00-FRENTE.md`.
