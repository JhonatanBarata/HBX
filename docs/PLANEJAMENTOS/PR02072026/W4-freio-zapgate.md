# W4 — Freio físico do zap-gate (cache TTL + rate limit + disjuntor)

> Worker Sonnet. Leia ANTES: `docs/Rules/MOTOR.md` (L5: "risco ban → NÃO mexer na reconexão") e
> `docs/Rules/WHATSAPP.md`. Contexto: já perdemos chip em jun/26 por volume anômalo. O zap-gate
> vai virar porta obrigatória da entrega (W2 em paralelo) + M6 da fábrica → milhares de checks.
> O Governor freia DINHEIRO; ninguém freia o zap-gate hoje. Você constrói esse freio.

## Âncora no código
- Caminho do check: `applyRadarWhatsappCheck` (chamado em
  `backend/src/webscraping/radar/05-delivery/radar-core-delivery.mixin.ts`) → seguir até o serviço
  que fala HTTP com o Webwhats. O freio mora NO SERVIÇO (camada única), não no mixin — o W2 está
  mexendo no mixin em paralelo, não conflitar.
- Contatos: model `LeadContact` (prisma linha ~1816) — verificar se já guarda status/data de
  verificação de WhatsApp.

## Tarefas
1. **Cache com TTL**: número já checado há menos de `HBX_ZAP_CHECK_TTL_HOURS` (default 168) não
   re-checa — responde do cache. Persistir resultado+timestamp; usar coluna existente se houver.
   **Você é o ÚNICO worker autorizado a tocar `backend/prisma/schema.prisma`** — se precisar,
   migration ADITIVA mínima (coluna nullable em `LeadContact`), `npx prisma generate` + migration
   com nome claro. Nada destrutivo.
2. **Rate limit**: teto global de checks `HBX_ZAP_CHECK_MAX_PER_MIN` (default 20), fila com espera
   (não descartar) — em memória basta (1 instância de backend).
3. **Disjuntor próprio**: `HBX_ZAP_CHECK_BREAKER_THRESHOLD` erros consecutivos (default 5) → abre
   por `HBX_ZAP_CHECK_BREAKER_COOLDOWN_MIN` (default 10). Aberto = check "indisponível" (quem chama
   trata como unverified, sem retry-loop). Meio-aberto: 1 tentativa de prova após cooldown.
4. **TTL de frescor do estoque** (se couber sem migration extra): card no pool com validação mais
   velha que `HBX_ZAP_STOCK_REVALIDATE_DAYS` (default 30) re-checa antes de entregar (o cache do
   item 1 absorve o custo). Se o caminho não for claro, relatar em vez de forçar.

## Regras duras
- **NÃO tocar** `Webwhats/`, conexão/reconexão de chip, nem o mixin de delivery (W2 está nele).
- O freio NUNCA derruba chip nem loga fora do padrão; erro = degrade silencioso (unverified).
- Testes: `cd backend && npm run build` + `node --test dist/...` (cache hit/miss, TTL vencido,
  breaker abre/fecha, rate limit enfileira).
- Commit na branch do worktree. Relatório final: branch, arquivos, migration (se houver), testes.
