# PR14062026010 — HBX Owner: "painel de verdade" (consolidar TUDO no :3107)

> Ordem do dono (14/06): **tudo no HBX Owner** (`:3107`). O Ops Control (`:3099`) vira
> INVISÍVEL — o Owner já fala com ele por baixo (proxy); o dono nunca mais abre o `:3099`.
> Motivo raiz: dois painéis confundem, o export some no painel errado, e o sistema dá
> feedback MENTIROSO (ex.: "Filtro não encaminhado; verifique backend/DTO" quando é só
> turbo sem filtro = normal). O dono quer "um painel de verdade".

## Estado/fatos confirmados (lendo o código + DB ao vivo)
- Owner UI = `hbx-owner/local-agent/web/{index.html,app.js,styles.css}`; agent = `server.js`
  (http cru, dispatch manual; `backendRequest`→backend `:3000`, `opsRequest`→Ops Control).
- Boot hoje: `npm run up` = `scripts/start-all.ps1` (NÃO sobe o Owner). Owner sobe só via
  `npm run owner:app` (`hbx-owner/local-agent/start-owner.ps1`, que injeta os 3 tokens:
  `HBX_OWNER_LOCAL_TOKEN`, `HBX_OWNER_OPS_TOKEN` (do `.env.ops-control`), `HBX_OWNER_BACKEND_TOKEN`
  (JWT do master via `/auth/login`)).
- Engines locais hoje: CLI `npm run engines:up`/`engines:down` (`scripts/start-hbx-engines.ps1`/`stop`).
- Export local→VPS hoje: **só no Ops Control** (Email Lab → `/webscraping/lead-harvest/import`
  na VPS, dedup por telefone/placeId). NÃO existe na UI nem no agent do Owner. Por isso o dono
  não acha o botão no `:3107`.
- Turbo: `POST /api/opscontrol/turbo` (ops-control) → backend `POST /modules/master/webscraping/
  turbo-noturno/force-now`. `autonomousFillEnabled` defaulta **true** → motor enche a lagoa
  SOZINHO (mass-data), **sem precisar de encomenda/pedido**. ✅ Verificado ao vivo: **+30 leads
  na última 1h** (lagoa 299 clean + 70 sent_to_vendas). O motor TRABALHA.
- Bug de mensagem (já corrigido na fonte do ops-control `public/app.js`): `filterForwarded=false`
  mostrava "verifique backend/DTO" mesmo sem filtro pedido. Fix: distinguir "sem canal (normal)"
  de "canal pedido mas não encaminhado (real)". **Princípio:** o feed do Owner NUNCA inventa erro.

## O que construir (consolidar no Owner) — por dependência
1. **Owner sobe com `npm run up`** — plugar o agent no `scripts/start-all.ps1` (Start-Process
   hidden `node server.js`, esperar porta 3107, rastrear PID em `.orchestrator/pids.json`) +
   `stop-all.ps1` para no `down`. Reusar a lógica de tokens do `start-owner.ps1` (sem abrir
   navegador no `up`; flag `HBX_UP_OWNER=false` pra pular). **Owner já no ar = `:3107`.**
2. **Ligar/parar engines LOCAIS pelo Sistema** — rotas no agent `/owner/engines/local/start`
   e `/stop` que rodam `engines:up`/`engines:down` (via allowlist/exec já existente) + botões
   na coluna Localhost. (VPS já tem start/stop range — espelhar local.)
3. **Botão Exportar local→VPS no Owner** — rota `/owner/export` proxiando o caminho do Ops
   Control (turbo/email-lab export → `/webscraping/lead-harvest/import` na VPS, dedup). Botão
   embaixo da aba Sistema. Honesto: "enviados X, duplicados Y, só apaga local após VPS confirmar".
4. **Colunas Local | VPS SIMÉTRICAS** — mesmos blocos/ordem nos dois lados (Resumo → CPU/RAM/Disco
   → Motores(+controle do ambiente) → Veredito → Containers). Explicar o teto (VPS elástico até
   ~20; local = frota subida).
5. **CPU/RAM AO VIVO** — `setInterval` (~4s) re-buscando `/owner/system` + `/owner/vps/system`
   enquanto a aba Sistema está ativa (parar ao sair); barras já têm `transition: width .3s`.
6. **Feed de status HUMANO** ("achou 12 cards", "motor cedeu pra atender cliente", "RAM 78%",
   "+30 leads/h", erro REAL só quando for real). Derivar de deltas do snapshot + `cap.reason`
   + delta do banco; **nunca** texto alarmante pra estado normal.

## Travas
- Tudo LOCAL e seguro; NÃO toca produção. Deploy/VPS-env = só o dono (o Owner controla a VPS
  proxiando o Ops Control, mas não roda deploy/publish).
- 5 LEIS NÃO se aplicam aqui (o Owner é ferramenta interna, design system próprio em styles.css).
- Verificação: reiniciar o agent (`npm run owner:agent`) + abrir `:3107` + conferir as rotas.
