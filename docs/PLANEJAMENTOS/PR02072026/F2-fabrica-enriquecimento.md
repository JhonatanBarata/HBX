# F2 — Fábrica de ENRIQUECIMENTO (missão `enrich_lead` M1-M6 sobre a fila S4, roda LOCAL)

> Worker Opus. Leia ANTES: `docs/PLANEJAMENTOS/ARVORE-MESTRA/PLANO-FECHAMENTO.md` (F2),
> `docs/PLANEJAMENTOS/MOTOR-RFB-FILA/sprint4-fila-missoes-RESULTADO.md` (a fila que você usa),
> `docs/PLANEJAMENTOS/MOTOR-RFB-FILA/sprint5-RESULTADO.md` (gate anti-alucinação/30b),
> `docs/Rules/MOTOR.md`. Pré-requisito já aterrissado: F0 demoliu a fábrica de descoberta —
> você constrói a substituta. A fábrica NÃO descobre nada: pega lead SEM contato quente e completa.

## Missão
Missão `enrich_lead` de ponta a ponta, alimentador por DEMANDA, validada AO VIVO local com R$ 0.

## Estágios (REUSAR serviços existentes — você solda, não reinventa)
- **M1 crawl profundo**: site inteiro do lead (base: radar-web-enrichment crawl; nível estático).
- **M2 caça-contato web**: nome+cidade → fone/insta/site (`searchWeb` L3: Brave→ddg/bing, respeitando
  governor e emergencyStop).
- **M3 sociais**: probe direto insta/fb (04-socials).
- **M4 pagos — último recurso**: SÓ se M1-M3 não acharam contato E `SourceBudgetService` tem saldo
  (fail-closed; Serper continua OFF por env; Places teto 200/dia). Registrar uso no gauge.
- **M5 extração 30b + nota ICP**: extração via caminho `HBX_AI_EXTRACTION_ENABLED` com gate
  anti-alucinação (`LeadContactWriteService` é o ÚNICO caminho de escrita de contato) + nota ICP
  pela 7b (`saneiaComNota` do AiSaneamento — já existe). Nota ≤3 → quarentena W2
  (`rejected`/`ai_score_low`) antes do estoque.
- **M6 zap-gate**: validação via `WebwhatsBridge.checkWhatsappNumbers` (freio W4 já cobre:
  cache/rate/disjuntor). Resultado: estoque pronto (card esperando vendedor).

## Alimentador por DEMANDA (não varrer a base!)
Prioriza cidade×nicho por: buscas recentes (runs) × `RadarCoverage` fraco/esgotado × estoque baixo.
Seleciona leads do pool SEM contato quente (sem `LeadContact` válido/fresco) → cria missões
`enrich_lead` com cap de fila (ex.: `HBX_ENRICH_QUEUE_CAP`, default 200 pendentes) — nunca inunda.
CPU local é o ativo escasso: enriquecer o que VENDE.

## Execução (PONTE — decisão do S4)
O processamento roda no backend LOCAL puxando da fila (padrão pull `/modules/owner/missions/*` do
S4, adaptando o executor que o S4 deixou atrás de `HBX_MISSION_QUEUE_ENABLED`). Lease TTL +
heartbeat + backoff + dead-letter: JÁ EXISTEM — use. PARAR pausa fila E estágios (cursor do S4).
Documente como o dono liga/desliga o worker local (script npm claro, ex. `npm run fabrica`).

## Validação ao vivo (obrigatória antes de commitar como pronto)
Local, com Ollama vivo e flags locais ON (`HBX_MISSION_QUEUE_ENABLED`, `HBX_AI_EXTRACTION_ENABLED`,
`HBX_RADAR_AI_SANEAMENTO_ENABLED` no `.env` local — cuidado: só o LOCAL, jamais VPS):
1 missão real de ponta a ponta: lead sem contato → M1-M3 (→M4 só se saldo) → M5 (contato via gate,
nota) → M6 → estoque, com custo R$ 0, PARAR congelando no meio e retomando. Registre a evidência
no relatório (ids, logs). VPS: flags ficam OFF — o recreate final é do orquestrador.

## Regras duras
- Você é o ÚNICO desta fase autorizado a tocar `backend/prisma/schema.prisma` — e SÓ migration
  aditiva mínima se a `RadarMission`/pool realmente não comportar (justifique; provavelmente não precisa).
- NÃO tocar: `Webwhats/`, reconexão de chip, internals do governor/freio (só consumir), fusão,
  planner do cliente, entrega do cliente.
- Testes que leem env: SEMPRE pinar (worktree não tem `.env`; host tem — lição de hoje).
- Validação: `cd backend && npm run build` + `node --test dist/...` (missions, estágios novos,
  alimentador) + a validação ao vivo acima.
- Commit na branch do worktree. Relatório: arquitetura final (1 parágrafo), arquivos, flags e
  defaults, evidência da validação ao vivo, migration (se houve), pendências.
