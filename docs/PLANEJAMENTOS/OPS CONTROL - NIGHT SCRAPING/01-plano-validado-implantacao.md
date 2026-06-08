# Ops Control Night Scraping - plano validado

Data: 2026-06-07
Status: planejamento, sem implementacao aplicada.

## Veredito sobre o patch-notes existente

O arquivo `hbx-opscontrol-consolidation-patch-notes.md` esta alinhado com a conversa e com o norte do HBX:

- centralizar o controle em `HBX Owner > Ops Control`;
- remover motores do `/bancodedados` e do fluxo visual Master;
- acabar com a aba separada `Radar Motores` no Windows app;
- manter scraping noturno/forcado em `engine: "hbx"`;
- permitir turbo local, VPS ou ambos;
- fazer `requiredChannels: ["email"]` funcionar como hard filter quando `channelMatchMode: "all_required"`;
- preservar a regra do Radar: card salvo precisa representar empresa/oportunidade real, e negativo/rejeitado protege contra repeticao.

O plano precisa de tres ajustes antes de virar patch:

1. Os DTOs e tipos de `preferredChannels`, `requiredChannels`, `channelMatchMode` e `freshness` ja existem em pontos importantes do backend. A tarefa nao deve duplicar esses campos sem necessidade.
2. O risco central no backend e a propagacao desses campos nas campanhas/fabrica ate a execucao do motor, alem do stub `candidateHasRequiredChannels` que hoje retorna sempre `true`.
3. O contrato Local/VPS precisa ficar fechado: o `local-agent` hoje controla motores Docker locais em `/radar/engines/*`; o `ops-control` ja tem caminho de auditoria VPS via SSH. A implementacao deve decidir se o Windows app chama apenas `local-agent`, apenas `ops-control`, ou um agregador local unico.

## Estado atual validado no repo

Arquivos verificados:

- `frontend/src/app/bancodedados/page.client.tsx`
- `hbx-owner/windows-app/hbx_owner_app.py`
- `hbx-owner/local-agent/server.js`
- `ops-control/server.js`
- `backend/src/webscraping/webscraping.controller.ts`
- `backend/src/webscraping/radar/shared/radar-core-shared.ts`
- `backend/src/webscraping/radar/03-enrichment/radar-core-quality-enrichment.mixin.ts`
- `backend/src/webscraping/radar/01-search/mass-data/radar-core-mass-data.mixin.ts`
- `backend/src/webscraping/radar/01-search/radar-core-factory-admin.mixin.ts`

Confirmado:

- `/bancodedados` ainda possui `TabId` com `"motores"`, item `Motores`, `fetchElasticStatus`, KPI `Motores` e render de `ElasticEnginePanel`.
- O Windows app ainda possui `TAB_NAMES` com `"Radar Motores"` e chama `_build_radar_engines_tab(frame)`.
- `_build_radar_engines_tab` possui botao `Abrir painel Master` que chama `open_radar_owner_panel()` e usa `webbrowser.open(...)`.
- `_build_ops_control_tab` ainda e um painel tecnico separado, com acoes de abrir/iniciar/reiniciar painel, containers e logs.
- O `local-agent` expoe status, logs, start e stop dos motores locais em `/radar/engines/*`, com validacao de nome `hbx-engine-N` e sem comando livre pelo body.
- O `ops-control` ja tem base para VPS via SSH, mas isso nao esta consolidado como contrato de cockpit do Windows app.
- `candidateHasRequiredChannels` em `radar-core-quality-enrichment.mixin.ts` esta como stub e retorna sempre `true`.
- DTOs/tipos para canais e freshness ja existem em `webscraping.controller.ts` e `radar-core-shared.ts`.
- Trechos da fabrica/mass-data montam `normalizeSearchInput({ engine: 'hbx', ... })`, mas nao carregam `requiredChannels`, `preferredChannels`, `channelMatchMode` e `freshness` nesses pontos.

## Sequencia proposta de aplicacao

### Passo 1 - Backend hard filter

Objetivo: garantir que filtro obrigatorio seja regra de salvamento, nao preferencia fraca.

Acoes:

- Substituir o stub `candidateHasRequiredChannels` pela validacao real usando:
  - `requiredChannelsForInput(input)`;
  - `normalizeChannelMatchMode(...)`;
  - `candidateHasRequiredChannel(...)`;
  - `any_required` como `some`;
  - `all_required` como `every`;
  - `prefer` sem bloqueio.
- Adicionar ou ajustar teste unitario para:
  - `requiredChannels=["email"]` + `all_required` rejeita candidato sem email valido;
  - `requiredChannels=["email"]` + `all_required` aceita candidato com email comercial valido;
  - `prefer` nao bloqueia por ausencia de canal.

Observacao: a validacao de canal individual ja existe e inclui email via `normalizeBusinessEmail(...)`.

### Passo 2 - Propagacao em campanhas e fabrica

Objetivo: fazer o payload do cockpit chegar ate a execucao real.

Acoes:

- Revisar criacao de campanha automatica/forcada para propagar:
  - `engine: 'hbx'`;
  - `requiredChannels`;
  - `preferredChannels`;
  - `channelMatchMode`;
  - `freshness: 'live'`.
- Revisar execucao de tarefas em `radar-core-mass-data.mixin.ts`, especialmente os pontos que chamam `normalizeSearchInput` com `engine: 'hbx'`, para carregar filtros salvos da campanha/tarefa.
- Validar se `WebscrapingCampaign`, `WebscrapingCampaignTask` ou `metadataJson/rawJson` ja guardam esses filtros. Se nao houver campo direto, preferir reaproveitar metadata existente antes de migration.
- Manter `engine: 'hbx'` no caminho noturno/forcado para nao cair em provider pago.

### Passo 3 - Contrato Ops Control Local/VPS

Objetivo: fechar a API antes de mexer na UI.

Contrato desejado:

```json
{
  "scope": "local",
  "intensity": "turbo",
  "engine": "hbx",
  "requiredChannels": ["email"],
  "channelMatchMode": "all_required",
  "freshness": "live",
  "targetTotal": 300
}
```

Escopos:

- `local`: aciona somente backend/motores locais.
- `vps`: aciona somente VPS quando estiver configurada e online.
- `both`: tenta local e VPS; se um alvo estiver offline, o outro continua.

Acoes:

- Definir se o endpoint unico ficara em `hbx-owner/local-agent/server.js` ou em `ops-control/server.js`.
- Evitar comando livre pelo body.
- Usar allowlist/config existente para qualquer acao operacional.
- Retornar status seguro quando VPS nao estiver configurada.
- Nao expor segredo, token, senha, env real ou comando sensivel em log/API.

Endpoints candidatos:

```txt
GET  /opscontrol/cockpit
POST /opscontrol/turbo
POST /opscontrol/force-filter
POST /opscontrol/scrape
POST /opscontrol/cancel
```

### Passo 4 - Windows app, cockpit unico

Objetivo: `Ops Control` vira a unica tela do Owner para motores, turbo, filtro e logs.

Acoes:

- Remover `"Radar Motores"` de `TAB_NAMES`.
- Remover branch que chama `_build_radar_engines_tab(frame)`.
- Remover/deprecar uso de `open_radar_owner_panel()` no fluxo de motores.
- Migrar tabela, metricas e acoes de `_build_radar_engines_tab` para `_build_ops_control_tab`.
- Adicionar controles:
  - escopo `local`, `vps`, `both`;
  - canal obrigatorio `email`, `whatsapp`, `instagram`, `website`, `phone`, `facebook`;
  - modo `all_required` para filtro forcado;
  - botoes `Turbo LOCAL`, `Turbo VPS`, `Turbo ambos`, `Forcar filtro`, `Cancelar scraping`, `Atualizar cockpit`.

Regra de UX: cockpit operacional, sem abrir navegador Master para controlar motor.

### Passo 5 - Frontend `/bancodedados`

Objetivo: banco de dados volta a ser banco/cards/excluidos/reclamacoes/distribuicao, sem motores.

Acoes:

- Remover `"motores"` de `TabId`.
- Remover item `Motores` de `TABS`.
- Fazer `normalizeTab()` rejeitar `motores`.
- Remover `fetchElasticStatus`, `loadElasticStatus`, estado de elastic e chamadas no `loadAll`.
- Remover KPI `Motores`.
- Remover render de `ElasticEnginePanel`.
- Remover CSS local relacionado a `elastic*` se ficar sem uso.
- Garantir que `/bancodedados?tab=motores` caia em uma guia valida, preferencialmente `pesquisas`.

### Passo 6 - Testes e checks

Checks minimos planejados:

- Backend:
  - teste do hard filter por email;
  - teste de propagacao dos filtros em campanha/fabrica quando aplicavel;
  - `cd backend && npm run build`;
  - `cd backend && npm run prisma:validate`, se touched area exigir.
- Frontend:
  - teste ou assercao de que `/bancodedados?tab=motores` nao renderiza `ElasticEnginePanel`;
  - `cd frontend && npm run lint`;
  - `cd frontend && npm run build`.
- Local/Owner:
  - `node --check hbx-owner/local-agent/server.js`, se alterado;
  - checagem sintatica Python do Windows app, se alterado;
  - teste manual local do cockpit quando token/agent estiverem configurados.

## Ordem recomendada de commits pequenos

1. `backend: enforce radar required channel filter`
2. `backend: propagate night scraping channel filters`
3. `owner: add opscontrol local vps contract`
4. `owner: merge radar engines into ops control`
5. `frontend: remove database engines tab`
6. `tests: cover opscontrol night scraping flow`

## Pontos que nao devem entrar sem decisao explicita

- Deploy, publish, release ou restart de producao.
- Secrets de VPS, token local, senha SSH ou rotacao de credenciais.
- Migration de banco, salvo se ficar provado que metadata existente nao resolve.
- Uso de Google Places ou API paga no fluxo noturno/forcado.
- Mudanca em cobranca, planos, quota ou entitlement.
- Refatoracao ampla de Radar, Vendas ou Master fora do escopo.

## Perguntas abertas antes de implementar

1. O Windows app deve chamar o `local-agent` como agregador unico, ou deve chamar o `ops-control` para a parte Local/VPS?
2. Quando `scope="both"` e um alvo falhar, o retorno deve ser `ok: true` parcial ou `ok: false` com detalhes por alvo?
3. O filtro forcado inicial sera somente `email`, ou ja precisamos deixar multi-canal ativo na primeira versao?
4. O cancelamento deve cancelar apenas a campanha forcada atual ou tambem drenar motores automaticos da fabrica?

