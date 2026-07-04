# HBX-OWNER — Sprint 2: Sondar a VPS e matar as muletas (20/pág + lotes 15 KB)

> **STATUS 03/07 (execução ARQ9):**
> - ✅ FEITO (zero-regressão, sem depender de sonda ao vivo): `runTransferPull` agora usa **página
>   adaptativa** — pede 500/página; se a 1ª página vier ≤20 com mais no banco, degrada sozinho pra
>   20 o resto (contíguo, pois a página 1 tem offset 0). VPS novo = ~25× menos chamadas; VPS velho =
>   idêntico a antes. 7/7 casos de borda testados. Commit na branch ARQ9.
> - ⏸️ ADIADO pra sonda ao vivo (mexem no caminho MAIS usado do painel / têm risco de 413): cirurgia
>   no agregador do cockpit (`vpsReadCardsAggregated` + `/owner/vps/radar/cards`) e o aumento do
>   `chunkLeadsBySize` (15 KB→80 KB). O plano abaixo é o roteiro dessa sessão de sonda.


> Arquitetura nº9 (HBX Owner). Escopo: sondagem read-only na VPS + `hbx-owner/local-agent/server.js`.
> **REVISÃO IMPORTANTE (01/07):** o plano original mandava "consertar o backend". O código ATUAL
> do backend JÁ está consertado: `listMasterDatabaseCards` honra `limit` até 2000
> (`radar-core-factory-admin.mixin.ts:1684`) e `/webscraping/lead-harvest/import` é rota NestJS
> nativa (`importBatchForUser`), não proxy pro motor legado — body default do Nest ≈100 KB.
> As sondagens de 25–26/06 (cap 20/pág, 413 a ~25 KB) eram da versão deployada ANTIGA; houve
> publish em 30/06, 01/07 e 03/07. Ou seja: o sprint é SONDAR e, confirmando, APAGAR a muleta do agent.
>
> **RE-VERIFICADO no master `d0c3148d` (03/07):** `listMasterDatabaseCards` honra limit até 2000 em
> `radar-core-master-database.mixin.ts:363` (o arquivo mudou de nome desde a 1ª revisão) e o import
> `POST /webscraping/lead-harvest/import` é rota Nest nativa (`importBatchForUser`,
> webscraping.controller.ts:927), body default ~100 KB. Premissa mantida.

## Por quê (ROI)
Pull de ~5.900 cards hoje = ~295 chamadas HTTP-sobre-SSH (20 por página) com retry/reclique.
A 500/página = 12 chamadas (~25×). Cada chamada a menos é uma janela de falha a menos.

## Tarefas
1. **Sondar (read-only, sem escrever nada em produção):**
   - `GET /api/radar/vps/database-cards?limit=500&page=1` via Ops Control → contar `items.length`.
   - Import: mandar lote de teste ~50 KB via `/api/email-lab/vps/import` com 30–40 leads de
     sondagem marcados `sourceMode:"imported_lab"`, `requestedBy:"sonda-sprint2"` → esperar 200
     (depois apagar os leads de sonda pelo batch delete, se aceitos).
   - Registrar o resultado NESTE arquivo antes de mexer em código.
2. **Se a VPS honrar `limit` grande** (esperado após os publishes):
   - `runTransferPull`: `pageSize` 20 → 500.
   - `vpsReadCardsAggregated` + `VPS_CAP` + agregação em `/owner/vps/radar/cards`: substituir por
     chamada direta com `limit` pedido. **Manter defensivo barato:** se a página vier com menos
     itens que o pedido E `total` indicar que há mais, degradar pro modo 20 e logar aviso — a
     muleta morre, o paraquedas fica.
3. **Se o import aceitar ~100 KB:** `chunkLeadsBySize(maxBytes)` 15 KB → 80 KB (manter o chunker —
   é higiene válida — só subir o teto). `maxCount` 30 → 150.
4. Atualizar os comentários-sondagem do server.js (são memória institucional: registrar
   "re-sondado em DD/MM, cap removido").

## Critérios de aceite
- Sonda registrada neste .md com números reais (itens retornados com limit=500; status do
  import de 50 KB).
- "Trazer tudo" e "Mandar tudo" completam com contagem reconciliada (otherTotal bate) e o
  número de páginas cai na proporção esperada (~25×).
- Nenhum lead de sonda sobra em produção.

## Guardrails
- VPS = produção com Mercado Pago LIVE. Sondagem é leitura + 1 lote de teste pequeno e removido.
- Se a sondagem mostrar que a VPS AINDA trava em 20: **PARAR e reportar** — o fix vira tarefa de
  backend (deploy), e deploy só com ordem explícita do dono (docs/Rules/INFRA.md).
- Não tocar em Webwhats/chips em hipótese alguma.
