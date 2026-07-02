# Sprint 1 MOTOR-RFB-FILA — Resultado (02/07/2026)

> Executado por Claude Fable 5 na branch `claude/cranky-volhard-ae62d6` (worktree).
> Plano-fonte: resumo do Sprint 1 (o .md original ficou na branch `claude/intelligent-proskuriakova-424a4c`
> e não existe neste worktree — o resumo do prompt foi usado como fonte, é completo).

## TL;DR

| Tarefa | Estado | Observação |
|---|---|---|
| 1. Fix do Parar (gate emergencyStop) | ✅ IMPLEMENTADO + validado funcionalmente | NÃO estava no código; 2 arquivos, só adições; tsc verde; teste ao vivo local: contador Brave congela com PARAR ativo |
| 2. VPS sem fábrica | 🟡 PREPARADO (env injetado, inerte) | Flag no `.env` do VPS (só vale no próximo recreate); dry-run do cleanup rodado (9 campanhas ativas); `--confirm` + recreate = sessão com o dono (G1) |
| 3. Freio-fino do cursor | ✅ JÁ EXISTIA — verificado + testes verdes | FREIO AUTO 1–3 + override manual já publicados; 4/4 e 63/63 testes passam |
| 4. Leases órfãos no boot | ✅ JÁ EXISTIA — validado AO VIVO | Órfão sintético + restart do backend local → curou sozinho |
| 5. Backfill de contatos | ✅ RODADO LOCAL + export testado | 9 contatos inseridos; `GET /contacts/export` HTTP 200 |

**PUBLICAR = decisão do dono (G1).** O código novo está pronto no worktree; nada foi publicado.

---

## 1. Fix do Parar — IMPLEMENTADO (não estava no código)

Verificação inicial: o gate `factoryEmergencyStopped()` NÃO existia em `searchBrave`, e o pump
`processNextRadarCampaigns` só olhava `RadarFactoryCursor.enabled` (gate PAINEL ABSOLUTO de 30/06),
sem olhar o `emergencyStop` do config operacional. Brecha real: `stopFactoryNow` grava
`emergencyStop=true` **mantendo `enabled=true`**, e `createMasterMassDataCampaign` religa o cursor
preservando o `emergencyStop` antigo do metadata → o pump voltava a drenar com o PARAR ativo. Além
disso, enriquecimento em voo continuava queimando cota Brave.

### Mudanças (só adições)

1. **[backend/src/webscraping/radar/03-enrichment/radar-web-enrichment.service.ts](../../../backend/src/webscraping/radar/03-enrichment/radar-web-enrichment.service.ts)**
   - `factoryEmergencyStopped()` estático: lê `emergencyStop` do `WebscrapingOperationalConfig`
     key `turbo_noturno` (via o mesmo PrismaClient estático do disjuntor mensal), **cache 8s**,
     fail-open em erro de banco (mesma regra do `braveBudgetExceeded`).
   - Gate dentro de `searchBrave` (dentro da fila serializada, antes do disjuntor mensal e do
     incremento): PARAR ativo → devolve `[]` sem bater na API e sem incrementar `BraveApiUsage`.
2. **[backend/src/webscraping/radar/01-search/mass-data/radar-core-mass-data.mixin.ts](../../../backend/src/webscraping/radar/01-search/mass-data/radar-core-mass-data.mixin.ts)**
   - Early-return em `processNextRadarCampaigns` quando `emergencyStop === true || enabled === false`
     no config operacional (logo após o gate do cursor). Row ausente cai nos defaults
     (`enabled=true`, `emergencyStop=false`) → banco virgem não trava.

### Checks

- `npx tsc --noEmit` no backend: **exit 0**.
- Suíte `webscraping.service.test.ts`: **120 pass / 0 fail / 1 skip**.
- **Teste funcional ao vivo (banco local, fetcher stub, sem tocar a API Brave):**
  - FASE 1 (PARAR ativo): `searchBrave` → `[]`, **0 chamadas fetch**, contador congelado (17→17). PASS.
  - FASE 2 (retomado + 8.6s de TTL): volta a chamar (1 fetch), contador incrementa (17→18). PASS.
  - Estado restaurado exatamente como estava (emergencyStop=true local, contador=17).
- Efeito colateral conhecido (aceito pelo escopo do plano): com PARAR ativo, o `searchWeb` degrada
  pro fallback Bing/DDG (scrape) — o gate pedido é especificamente no Brave (cota). Se o dono quiser
  "Parar corta TUDO de busca externa", é 1 linha a mais em `searchWeb` (anotado como decisão aberta).

**Aceite "Parar → contador BraveApiUsage congelado 10min":** comprovado no nível do mecanismo (zero
chamada sai com o gate ativo; TTL do cache = 8s < 10min). Validação de 10min corridos em produção só
faz sentido pós-publish.

## 2. VPS sem fábrica — PREPARADO (execução final = sessão com o dono)

### Estado encontrado (read-only, 02/07 ~00:55 BRT)

- **A fábrica estava VIVA no VPS**: engines 14–20 subindo (governor elástico, janela noturna),
  cursor `enabled=true` rodando `Bom Princípio/RS × refrigeração`.
- `HBX_FACTORY_AUTONOMOUS_DISABLED` **ausente** do container e do `.env`.
- `hbx-backend` = `docker run` cru (labels vazios, não é compose): imagem `hbx_backend:latest`,
  rede `hbx_net`, restart `unless-stopped`, 105 envs (`--env-file /root/HBX/backend/.env` + ~25 `-e`).
- Dry-run do cleanup (dentro do container, read-only): **9 campanhas mass_data ativas** (todas
  nacionais/autônomas, "segmentos internos"), 0 tarefas em fila.

### O que já foi feito (inerte, reversível)

- `HBX_FACTORY_AUTONOMOUS_DISABLED=true` **injetado em `/root/HBX/backend/.env` (linha 101)**, com
  backup em `/root/HBX/backend/.env.bak-sprint1-motor-rfb`. **Não afeta o container rodando** — só
  passa a valer no próximo recreate.
- O gate no código já existe e está publicado (`isFactoryAutonomousDisabled()` em
  `radar-core-factory-admin.mixin.ts`, PR3 30/06) — bloqueia só a fábrica AUTÔNOMA
  (`ensureNightFactoryWork`); on-demand do cliente não passa por ali.

### Sessão conjunta (roteiro pro dono)

**Caminho recomendado — publish (mata 2 coelhos):**
1. `npm run publish` → rebuilda o backend com o fix do Parar E recreta o `hbx-backend`, que herda a
   flag do `--env-file` automaticamente. (Sem cirurgia manual de docker; o recreate do publish é o
   método já provado.)
2. Conferir: `docker exec hbx-backend printenv HBX_FACTORY_AUTONOMOUS_DISABLED` → `true`.
3. `docker exec hbx-backend node scripts/cleanup-vps-autonomous-factory.js` (dry-run de novo, na hora).
4. `docker exec hbx-backend node scripts/cleanup-vps-autonomous-factory.js --confirm`
   → cancela as 9 campanhas autônomas + desliga o cursor. (Sem a flag no ambiente o
   `ensureNightFactoryWork` recriaria campanha em 60s — por isso a ordem env→cleanup.)
5. Validar: engines excedentes drenam; `RadarFactoryCursor.enabled=false`;
   log do backend mostra `reason=autonomous_disabled` a cada ciclo da fábrica.

**Caminho alternativo — sem publish (recreate manual):** só se o dono NÃO quiser publicar ainda.
Método: `docker inspect hbx-backend` → salvar `Config.Env` num env-file temporário →
`docker rm -f hbx-backend` → `docker run -d --name hbx-backend --restart unless-stopped --network
hbx_net --env-file <arquivo> -p 3000:3000 -v /usr/bin/docker:/usr/bin/docker:ro
-v /var/run/docker.sock:/var/run/docker.sock -v /root/HBX/backend/public/uploads:/app/public/uploads
hbx_backend:latest`. **NUNCA restart ingênuo/rm sem preservar envs.** (O caminho do publish é mais
seguro porque reconstrói pelo mesmo script de sempre — `start_hbx_backend` em
`scripts/deploy-hostinger.js:591`.)

## 3. Freio-fino do cursor — JÁ IMPLEMENTADO (verificado, não repliquei)

O plano pedia "código novo", mas os 3 itens já estão no código da branch (implantados 01/07,
publicados no `chore: publish 20260702_002115`):

- **(a) Cidade esgotada nunca repete:** memória durável de combo morto no histórico de tasks —
  `dead: attempted && approved===0` faz o planner PULAR o combo
  ([radar-core-campaign-planner.mixin.ts:581](../../../backend/src/webscraping/radar/01-search/radar-core-campaign-planner.mixin.ts));
  `exhaustDeadMassDataTasks` marca `exhausted` na hora (FREIO AUTO 2); `shouldAbandonMassDataCampaign`
  + avanço do cursor (FREIO AUTO 3, com gate anti-timeout pra não matar cidade virgem);
  `enforceMassDataCampaignCap` mantém 1 missão ativa (FREIO AUTO 1). Mesmo quando o cursor dá a
  volta completa, os combos mortos continuam pulados (histórico nunca é apagado — regra de ouro).
- **(b) Cap de tentativas respeitado:** por task, `attempt >= maxAttempts` (default 3) → `exhausted`/
  `failed` ([radar-core-mass-data.mixin.ts:1514](../../../backend/src/webscraping/radar/01-search/mass-data/radar-core-mass-data.mixin.ts));
  por campanha, `reachedAttempts` nas linhas 1703/1754; combo com 0 aprovado exaure na 1ª (linha 1478).
- **(c) Stop manual vira override:** `stopEngine(manual=true)`/`stopAllEngines` gravam
  `status='stopped' + manualPaused=true`, e `applyElasticDesiredStates` PULA linha `isEnginePaused`
  ([hbx-engine-pool.service.ts:1719](../../../backend/src/webscraping/hbx-engine-pool.service.ts)) —
  a elástica não re-promove parada manual do dono.
- O pump do "todos busy" reagenda em 8s sem varrer (backoff anti-spin,
  [radar-core-mass-data.mixin.ts:1240](../../../backend/src/webscraping/radar/01-search/mass-data/radar-core-mass-data.mixin.ts)) — confirmado no código.

### Checks

- `radar-core-factory-admin.abandon.test.ts`: **4/4 pass** (inclui o caso Acarape esgotada e o caso
  São Paulo virgem-com-timeout que NÃO esgota).
- `hbx-engine-pool.service.test.ts`: **63/63 pass** (inclui elástica × manualPaused × caps).
- Validação ao vivo com frota (`npm run engines:up` + fábrica ligada raspando de verdade): **não
  rodada nesta sessão** — a fábrica local está com PARAR ativo (estado do dono) e ligá-la de madrugada
  pra raspar de verdade é decisão operacional do dono. Os freios estão cobertos por teste unitário
  real e leitura de código; o comportamento pump-backoff/"Parar fica parado" ao vivo entra na sessão
  conjunta de validação (mesma janela do publish).

## 4. Leases órfãos se curam no boot — JÁ IMPLEMENTADO (validado AO VIVO local)

Já existiam DOIS mecanismos de boot (nenhum código novo foi preciso):

- `releaseOrphanedEngineLocksOnBoot()` no `onModuleInit` do pool
  ([hbx-engine-pool.service.ts:503](../../../backend/src/webscraping/hbx-engine-pool.service.ts)):
  todo `HbxEngineLock` busy/lockedRunId vira `online` + lock nulo.
- `recoverRadarCampaignWork({ force: true })` 1s após o boot do Radar core
  ([radar-webscraping-core.service.ts:275](../../../backend/src/webscraping/radar/radar-webscraping-core.service.ts)):
  toda task `running` → `queued` + `lockedByEngineId=NULL` (é exatamente o UPDATE pedido no plano),
  campanhas running/sleeping re-enfileiradas.
- Complemento contínuo: `cleanupExpiredLocks()` roda nos caminhos de acquire e no loop da elástica
  (lock vencido solto sem esperar boot).

### Validação ao vivo (aceite "kill no meio de lote → boot recupera")

Simulação real no ambiente local: lock `hbx-engine-1` forçado a `busy` com `lockedRunId` fake e
`lockedUntil` +15min (lease "no futuro", que sem o force levaria 15min pra expirar), task `running`
órfã com os mesmos locks → `docker restart backend` → **no boot, sem intervenção**: lock voltou a
`online` com `lockedRunId=NULL` e a task voltou a `queued` com `lockedByEngineId=NULL` e
`lastError='Lock liberado na retomada.'`. ✅ Dados sintéticos removidos depois do teste.

## 5. Backfill de contatos + export — RODADO LOCAL

- `node scripts/backfill-lead-contacts.js` (banco local): 51 leads varridos, **9 contatos inseridos**
  (todos `phone` — o pool local tem pouco metadata de enriquecimento), 0 erros. Idempotente.
- `SELECT count(*) FROM "LeadContact"` → **9 > 0** ✅ (aceite).
- `GET /modules/owner/radar/contacts/export?limit=10` (JWT do SYSTEM MASTER local): **HTTP 200**,
  `total=9`, items com `radarLeadId/kind/value/rank/source`. Filtro `kind=phone` e `limit` OK.
- Nota de rota: o login de teste (`.test-login.local.md`, user 36) NÃO é `isSystemMaster` → 403 no
  guard MASTER; o export foi testado com o usuário `Jhonatan` (id 35, SYSTEM_MASTER do `.env`).
- VPS: backfill lá fica pra sessão conjunta (mesma regra do cleanup — "roda contra qualquer
  DATABASE_URL", mas produção só com o dono).

## Estado dos aceites

| Aceite | Estado |
|---|---|
| Parar → contador BraveApiUsage congelado 10min | ✅ mecanismo comprovado ao vivo local (0 chamadas com gate ativo; falta só a observação de 10min em produção pós-publish) |
| Cursor nunca reapresenta cidade esgotada | ✅ código verificado + 4/4 testes (combo morto tem memória durável) |
| Kill do backend no meio de lote → boot recupera sozinho | ✅ validado AO VIVO local (órfão sintético + restart → curado no boot) |
| `SELECT count(*) FROM "LeadContact" > 0` | ✅ 9 (local) |

## Regras duras — conformidade

- Webwhats/reconexão: **não tocado**.
- Migrations: **nenhuma criada/rodada** (as tabelas necessárias — LeadContact, BraveApiUsage — já
  existiam local e no VPS).
- Tudo aditivo/reversível: 2 arquivos editados (só adições); flag no `.env` do VPS com backup
  (`.env.bak-sprint1-motor-rfb`) e inerte até recreate; dados de teste sintéticos removidos.
- Publicação: **não publicada** — gate G1 do dono.

## Pendências pra próxima sessão (com o dono)

1. **G1**: `npm run publish` (leva o fix do Parar + ativa a flag no recreate do hbx-backend).
2. Cleanup no VPS: dry-run de novo → `--confirm` (roteiro na seção 2).
3. Validação ao vivo dos freios com frota ligada (pump-backoff, "Parar fica parado" 10min corridos).
4. Backfill de contatos no VPS (`docker exec hbx-backend node scripts/backfill-lead-contacts.js`).
5. HANDOFF 30/06 continua pendente (2 migrations VPS + tripwire Brave — fora do escopo deste sprint).
6. Decisão aberta: PARAR também deve cortar o fallback Bing/DDG do `searchWeb`? (1 linha, se sim.)
