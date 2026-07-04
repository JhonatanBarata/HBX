# HBX-OWNER — Sprint 1: Estado durável + faxina (só agent, zero risco pra produção)

> Arquitetura nº9 (HBX Owner). Escopo: `hbx-owner/local-agent/server.js` APENAS.
> Não toca backend, não toca VPS, não toca Webwhats. Regras: docs/Rules/INFRA.md.
> Revisado em 01/07/2026 contra o código real (worktree sweet-panini-795bc6).

## Por quê (ROI)
O agent guarda `enricherJob` (cursor de varredura) e `transferJob` (progresso/lote) só em RAM.
Crash/restart = enricher recomeça da página 1 (re-crawl de sites já visitados → throughput
desperdiçado e desgaste do IP local) e transferência precisa de reclique manual do dono.
Além disso: `readVpsSystem` NÃO tem cache → cada poll do painel/árvore dispara SSH real;
`execRead` usa `spawnSync` (docker stats trava o event loop 1–2 s); há ~70 linhas mortas.

## Tarefas
1. **Journal em disco** — `hbx-owner/local-agent/state/` (gitignored, criar `.gitkeep`):
   - `enricher.json`: `{ cursorPage, types, aggressive, metrics, domainsCrawled: [últimos N] }`,
     gravado ao fim de cada ciclo (`enricherCycle`). No `startEnricher`, se existir journal e
     `opts.fresh !== true`, retomar do cursor. Botão religa = retoma; novo início limpo só com flag.
   - `transfer.json`: gravar `direction, page, sentIds (push), pulled/sent/imported` a cada página
     OK. No boot do agent, se existir journal `running:true` não-finalizado → expor em
     `/owner/transfer/status` como `resumable:true` (a UI já faz polling desse endpoint; basta o
     front mostrar "retomar" chamando a rota de start de novo — o import já é idempotente por
     `externalId`). No fim OK, apagar o arquivo.
   - Escrita atômica: `writeFileSync` em `.tmp` + `renameSync` (crash no meio não corrompe).
2. **Cache do snapshot VPS** — em `readVpsSystem`, cache em memória de 30 s (mesmo padrão de
   `vpsLeadsCache`). Botão ⟳ do painel passa `force=1` e fura o cache.
3. **Docker sem travar o event loop** — trocar `spawnSync` de `readContainers`/`runningEngineSet`
   por `spawn` assíncrono (promisificado) OU manter sync mas com cache de 5 s para
   `docker ps`/`docker stats`. Escolher o mais simples que elimine a trava no polling.
4. **Faxina**:
   - Apagar `createRun`, `runCommandArray`, `appendLog`, `finishRun` e o Map `runs` — nenhuma
     rota chama (confirmado por grep 01/07). Ajustar `/health` (remove `runs: runs.size`).
   - Remover `Access-Control-Allow-Origin/Headers/Methods` do `sendJson` (bind 127.0.0.1 +
     Bearer token bastam; CORS `*` só aumenta superfície).
   - `hbx-owner/automations/catalog.example.json`: não é referenciado por código nenhum
     (herança do app tkinter morto). **Apagar** e registrar no commit; se o dono quiser registry
     de automações no futuro, nasce de novo com runner de verdade.

## Critérios de aceite
- Matar o agent no meio de um enriquecimento e religar → cursor continua de onde parou
  (ver `cursorPage` no `/owner/enricher/status`).
- Matar o agent no meio de um "Mandar tudo" pequeno (lote de teste) e religar → status expõe
  retomada; reclicar completa sem duplicar (conferir totais dos dois lados no painel).
- Painel aberto: leitura de pressão local não congela mais o agent (endpoints respondem
  durante `docker stats`).
- `node --check server.js` verde; painel abre e todos os cards pintam.

## Não fazer
- NÃO adicionar dependência npm (zero-dep é requisito).
- NÃO tocar em rota do backend nem em nada da VPS.
- NÃO mudar contrato dos endpoints existentes (a UI atual continua funcionando sem mudança).
