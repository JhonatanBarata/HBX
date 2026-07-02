# W2 — P2: IA 7b como etapa 7 (só-aditiva) + zap-gate como porta 8 da entrega

> Worker Sonnet. Leia ANTES: `docs/PLANEJAMENTOS/ARVORE-MESTRA/ARVORE-MESTRA.md` (lane pesquisa,
> P2) e `docs/Rules/MOTOR.md` (regras absolutas de cards + L5 whatsapp-check "risco ban — NÃO
> mexer na reconexão").

## Missão
Soldar o cérebro no pipe (o `AiSaneamentoService` está ÓRFÃO) e fazer o zap-gate virar a porta 8
da entrega. Semântica decidida (resolve a contradição 7↔8 do desenho): **pós-entrega SÓ-ADITIVA**
— card entregue nunca some nem piora; nota baixa só bloqueia ANTES de entrar no estoque.

## Âncoras no código
- IA órfã: `backend/src/webscraping/radar/03-enrichment/ai-saneamento.service.ts` (Ollama local via
  `HBX_LLM_CLASSIFIER_URL`, degrade gracioso já implementado — REUSAR, não duplicar).
- Entrega: `backend/src/webscraping/radar/05-delivery/` — `radar-core-delivery.mixin.ts` chama
  `applyRadarWhatsappCheck` (linhas ~1131/1415/1826/1940), `radar-delivery-orchestrator.service.ts`,
  `radar-post-delivery-update.service.ts` (padrão de update pós-entrega JÁ EXISTE — seguir).
- Estoque/fábrica: `RadarLeadPool` no prisma (só leitura de modelo; NÃO mudar schema).

## Tarefas
1. **Etapa 7 — IA 7b pós-entrega só-aditiva**: após o card ser entregue, disparo assíncrono curto
   (padrão do `radar-post-delivery-update.service.ts`) roda o saneamento: nome limpo + nota 0-10 +
   razão. O card só GANHA campos (opcionais); nunca é removido/rebaixado na mão do vendedor.
   Flag `HBX_RADAR_AI_SANEAMENTO_ENABLED` **default OFF** (VPS não tem Ollama garantido; dono liga
   local pros testes ao vivo). Timeout curto e falha silenciosa (badge discreto, nunca erro no card).
2. **Quarentena pré-estoque**: no caminho que abastece ESTOQUE (fábrica/night_factory → pool), lead
   com nota ≤3 NÃO entra como pronto — marcar status de quarentena usando campo/status existente do
   pool. Se não houver status viável sem migration, apenas não promover + logar; relatar.
3. **Zap-gate porta 8 (`HBX_RADAR_ZAP_GATE_REQUIRED`, default true)**: na entrega, card só é
   entregue se o fone passou no check de WhatsApp. Semântica precisa:
   - check respondeu "NÃO tem WhatsApp" → card bloqueado da entrega (vai pra enriquecimento/pool,
     não é descartado — histórico negativo nunca se apaga);
   - checker indisponível/timeout → NÃO bloqueia (entrega com `whatsappStatus` `unverified` — regra
     absoluta: `confirmed` só vem do Webwhats);
   - flag false → comportamento atual (rollback barato).
   Ajustar testes.

## Regras duras
- **NÃO tocar** `backend/prisma/schema.prisma`, `Webwhats/`, nem conexão/reconexão de chip. O check
  é só o caminho HTTP existente.
- Cards: campos novos OPCIONAIS; card antigo renderiza sem eles; social/IA pendente nunca vira erro.
- Testes: `cd backend && npm run build` + `node --test dist/...` dos módulos tocados.
- Commit na branch do worktree. Relatório final: branch, arquivos, decisões, testes.
