# INVENTÁRIO — Uso real dos motores de automação (S02)

> Somente leitura. Banco e `.env` lidos direto na VPS (produção). Nenhuma escrita, nenhum
> restart, nenhum dump de `cnpj_public`. Todos os comandos abaixo são reproduzíveis.
> Coletado em 2026-07-20 (relógio da VPS ~3h à frente, logs aparecem como 07/21 de madrugada).

## 1. Contagens (banco `hbx_prod`, container `hbx-postgres`)

### AssistenteConfig
| total | published |
|---|---|
| 1 | 1 |

Único registro: `companyId=5`, `published=true`, criado 2026-07-13 16:17, atualizado 2026-07-14 05:41.

```
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT count(*) AS total, count(*) FILTER (WHERE published=true) AS published FROM \"AssistenteConfig\";"
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT id, \"companyId\", published, \"createdAt\", \"updatedAt\" FROM \"AssistenteConfig\";"
```

### ConversationAssistantRun
| total | últimos 30 dias | por status |
|---|---|---|
| 0 | 0 | (nenhuma linha — não há status pra agrupar) |

**Zero execuções, desde sempre**, mesmo com `AssistenteConfig.published=true` para a empresa 5 há 7 dias.
Bate com os logs (seção 4): nenhuma linha `conversation_assistant` no container atual.

```
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT count(*) AS total, count(*) FILTER (WHERE \"createdAt\" >= now() - interval '30 days') AS last30d FROM \"ConversationAssistantRun\";"
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT status, count(*) FROM \"ConversationAssistantRun\" GROUP BY status ORDER BY count(*) DESC;"
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT \"companyId\", count(*) FROM \"ConversationAssistantRun\" GROUP BY \"companyId\" ORDER BY count(*) DESC;"
```

### BotConfig por domain (maior version por empresa)
| domain | rows | empresas | maior version por empresa |
|---|---|---|---|
| `atendimento_bot` | 34 | 2 | company 5 → v33 (atualizado **2026-07-20 13:14:55**, hoje); company 45 → v1 (2026-07-18 22:37:27) |
| `bot_master_switch` | 37 | 2 | company 5 → v36 (2026-07-20 13:14:55, hoje); company 45 → v1 (2026-07-18 22:37:27) |
| `recovery_bot` | 1 | 1 | company 5 → v1 (2026-07-14 05:41:01) |

Company 5 está com **33 versões de config editadas no mesmo dia de hoje** — uso ativo (dono
testando/ajustando), não uso residual.

```
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT domain, count(*) AS rows, count(DISTINCT \"companyId\") AS companies FROM \"BotConfig\" GROUP BY domain ORDER BY domain;"
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT domain, \"companyId\", max(version) AS max_version, max(\"createdAt\") AS last_updated FROM \"BotConfig\" GROUP BY domain, \"companyId\" ORDER BY domain, \"companyId\";"
```

### Cadencia / CadenciaInscricao / CadenciaGatilho / CadenciaRotina
| tabela | total | detalhe |
|---|---|---|
| `Cadencia` | 9 | 9 `ativa=true`, 9 `isSeed=true`, 3 empresas (id 1, 5, 45) — cada uma com as MESMAS 3 personas seed (Confiável/Estratégico/Determinado). Nenhuma cadência criada manualmente. |
| `CadenciaInscricao` | 0 | **nunca houve um lead inscrito em cadência**, em nenhuma empresa, desde sempre |
| `CadenciaGatilho` | 0 | nenhum gatilho foi criado (logo `fireCount>0` também é 0 — nada disparou porque nada existe) |
| `CadenciaRotina` | 0 | nenhuma rotina foi criada (`lastRunAt` não-nulo também é 0) |

```
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT count(*) AS total, count(*) FILTER (WHERE ativa=true) AS ativas, count(*) FILTER (WHERE \"isSeed\"=true) AS seed, count(DISTINCT \"companyId\") AS companies FROM \"Cadencia\";"
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT \"companyId\", count(*), array_agg(nome) FROM \"Cadencia\" GROUP BY \"companyId\" ORDER BY \"companyId\";"
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT status, count(*) FROM \"CadenciaInscricao\" GROUP BY status ORDER BY count(*) DESC;"
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT count(*) AS total, count(*) FILTER (WHERE ativo=true) AS ativos, count(*) FILTER (WHERE \"fireCount\" > 0) AS with_fires, sum(\"fireCount\") AS total_fires FROM \"CadenciaGatilho\";"
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT count(*) AS total, count(*) FILTER (WHERE ativa=true) AS ativas, count(*) FILTER (WHERE \"lastRunAt\" IS NOT NULL) AS with_lastrun FROM \"CadenciaRotina\";"
```

### Company.botArmedAt não-nulo
| id | name | botArmedAt | botArmedByUserId | prospectingBotLiveAt | recoveryBotLiveAt |
|---|---|---|---|---|---|
| 5 | HBX | 2026-07-13 13:43:29 | 2 | **NULL** | **NULL** |

Só a empresa 5 (a do próprio dono) tem `botArmedAt`. **Nenhuma empresa, nunca**, teve
`prospectingBotLiveAt` ou `recoveryBotLiveAt` preenchido — ou seja, o motor de prospecção e o
recovery bot nunca foram colocados "ao vivo" de fato, mesmo com config existindo.

Total de empresas no banco: **8** (`SELECT count(*) FROM "Company"` = 8).

```
docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c "SELECT id, name, \"botArmedAt\", \"botArmedByUserId\", \"prospectingBotLiveAt\", \"recoveryBotLiveAt\" FROM \"Company\" WHERE \"botArmedAt\" IS NOT NULL OR \"prospectingBotLiveAt\" IS NOT NULL OR \"recoveryBotLiveAt\" IS NOT NULL;"
```

## 2. Flags no VPS (lidas do container `hbx-backend` ao vivo — fonte única da verdade)

| Flag | Valor no VPS | Observação |
|---|---|---|
| `HBX_ASSISTENTE_PUBLISH_ENABLED` | `true` | gateia `messaging.service.ts:438` — se ligado E published, a IA cala o bot de menu |
| `HBX_ASSISTENTE_TIMEOUT_MS` | `20000` | |
| `HBX_CADENCIA_RUNNER_ENABLED` | `true` | runner de cadência ligado (log confirma: "runner LIGADO — tick 60000ms") |
| `HBX_CADENCIA_EMAIL_ENABLED` | `true` | |
| `HBX_CADENCIA_TICK_MS` | **não setada** | default do código = `60000` (`cadencia-scheduler.service.ts:10`) |
| `HBX_CADENCIA_WHATS_DAILY_CAP` | **não setada** | default do código = `10`/dia/empresa (`cadencia.service.ts:40`) |
| `HBX_CADENCIA_EMAIL_DAILY_CAP` | **não setada** | default do código = `50`/dia/empresa (`cadencia.service.ts:44`) |
| `HBX_RECOVERY_AUTOMATION_WORKER_ENABLED` | `true` | worker do recovery ligado, mas sem empresa "live" (nada a fazer) |
| `HBX_ATENDIMENTO_NLU_ENABLED` | **não setada** | default off (`envOn`, `intent-engine.service.ts:150`) |
| `HBX_ATENDIMENTO_NLU_TIMEOUT_MS` / `_MIN_CONF` | **não setadas** | defaults `6000` / `0.75` |
| `HBX_COPILOTO_ENABLED` | **não setada** | default ON no código — mas essa flag é de uma feature **separada** (ver seção 3) |
| `HBX_VENDAS_AUTOMATION*` | **NÃO EXISTE** | grep no repo inteiro (`backend/src`, todo o resto) não encontra nenhuma flag com esse nome — o motor de prospecção não tem flag de liga/desliga dedicada, só o par `Company.prospectingBotLiveAt`/campanha |

Lista completa das 68 variáveis `HBX_*` presentes no container `hbx-backend` foi conferida
(nomes apenas, sem valores, pra não repetir o incidente de vazamento abaixo) — fora as listadas
acima, nenhuma outra cita bot/assistente/cadencia.

⚠️ **Incidente durante a coleta**: um grep amplo (`HBX_.*BOT`) bateu acidentalmente dentro do
valor de `HBX_FIREBASE_SERVICE_ACCOUNT_JSON` (a palavra "**robot**" dentro de uma URL do Google
contém "bot" como substring), imprimindo a chave privada do service account no output do
comando. **A chave NÃO foi salva em nenhum arquivo nem reproduzida neste documento.** Os
comandos abaixo já usam âncora `^HBX_NOME=` pra não repetir o erro.

```
docker exec hbx-backend printenv | grep -E '^HBX_(ASSISTENTE|CADENCIA|BOT|VENDAS_AUTOMATION)' | sort
docker exec hbx-backend printenv | grep -E '^HBX_RECOVERY_AUTOMATION_WORKER_ENABLED='
docker exec hbx-backend printenv | grep -E '^HBX_ATENDIMENTO_NLU'
docker exec hbx-backend printenv | grep -E '^HBX_CADENCIA_(WHATS|EMAIL)_DAILY_CAP='
docker exec hbx-backend printenv | cut -d= -f1 | grep -E '^HBX_' | sort   # nomes only, auditoria completa
```

## 3. Referências legadas fora das 3 telas (`/bot`, `/automacoes`, `/assistente`)

| Endpoint | Consumidores encontrados | Fora das 3 telas? |
|---|---|---|
| `/inbox/bot-config` | `frontend/src/components/hbx/bot-onboarding.tsx:135,155`; `frontend/src/components/hbx/bot-prospeccao-panel.tsx:44`; `frontend/src/app/(app)/bot/page.client.tsx:134` | Não — tudo dentro da tela `/bot` |
| `/hbx-recovery/bot-config` | `frontend/src/app/(app)/bot/page.client.tsx:135` | Não — dentro da tela `/bot` |
| `/assistente` (GET) e `/assistente/templates` | `frontend/src/app/(app)/assistente/page.client.tsx:73,154` | Não — dentro da tela `/assistente` |
| `/cadencia`, `/cadencia/gatilhos`, `/cadencia/rotinas` | `frontend/src/app/(app)/automacoes/page.client.tsx` (linhas 85, 89, 93, 206, 414, 418, 532, 593, 597, 720) | Não — tudo dentro da tela `/automacoes` |
| `/assistente/copiloto`, `/assistente/copiloto/rascunho`, `/assistente/copiloto/resumo`, `/assistente/copiloto/sugestao` | `frontend/src/components/hbx/lead-cockpit-modal.tsx:362`; `frontend/src/app/(app)/leads/[id]/copiloto-panel.tsx:93,117,141` | **SIM — fora das 3 telas** (tela de Leads) |

**Achado importante**: o `Copiloto` (`backend/src/assistente/copiloto.controller.ts`) só
compartilha o prefixo de URL `/assistente` por acidente histórico. O próprio código documenta
(comentário linha 10-17): *"Superficie da IA local ja em prod, exposta na pagina do lead...
Gate: apenas usuario autenticado do tenant — o Copiloto é acessorio da tela do lead
(Radar/Vendas), nao do modulo 'bot'"*. Tem flag própria (`HBX_COPILOTO_ENABLED`), service
próprio (`copiloto.service.ts`), e **não toca** `AssistenteConfig`, `BotConfig` nem
`ConversationAssistantRun`. **Não é parte do escopo desta fusão** (bot/assistente conversacional
com o cliente final) — é uma ferramenta de redação assistida pro vendedor humano. Precisa
sobreviver intacto quando `/assistente` virar redirect (S12/S17): só a rota/tela de config do
bot conversacional é candidata a redirect, não o sub-recurso `copiloto`.

Buscas confirmadas sem resultado (portanto sem referência) em: `EntregaShell/` (mobile casca +
APK), `hbx-owner/`, `ops-control/`, `tests/` (exceto `tests/e2e/mobile-no-overflow.spec.ts`, que
é teste — excluído pelo contrato).

```
grep -rn "/inbox/bot-config" --include=*.ts --include=*.tsx .
grep -rn "/hbx-recovery/bot-config" --include=*.ts --include=*.tsx .
grep -rn "apiFetch.*['\"\`]/assistente" frontend
grep -rn "apiFetch.*['\"\`]/cadencia" frontend
```

## 4. Uso vivo (`docker logs hbx-backend`)

⚠️ **NÃO MEDIDO integralmente — motivo**: o container `hbx-backend` foi reiniciado em
`2026-07-20T23:01:58Z` (`docker inspect --format '{{.State.StartedAt}}'`), então `docker logs`
só tem **~3h10min** de histórico disponível, não as 48h pedidas — logs de containers anteriores
não são preservados (sem agregador externo tipo Loki/ELK encontrado no VPS). O que segue é a
totalidade do log disponível no momento da coleta.

| Termo | Ocorrências (janela disponível) | O que é |
|---|---|---|
| `conversation_assistant` | **0** | Bate com `ConversationAssistantRun`=0 no banco — nunca rodou de fato |
| `cadencia` (case-insensitive) | 21 | 15 linhas são mapeamento de rotas no boot; 1 é `"[cadencia] runner LIGADO (HBX_CADENCIA_RUNNER_ENABLED=1) — tick 60000ms"`; 2 são falha de tick |
| `atendimento` | 0 | (fora do nome da env var, que não conta) |

As 2 falhas de tick de cadência (`02:00:15` e `02:02:15`, madrugada de 21/07) foram parte de um
**pico geral de esgotamento do connection pool do Prisma** que também derrubou, no mesmo minuto:
`MessagingService` (outboundMessage), `MetaLeadAdsWorker`, `RecoveryAutomationWorkerService` e
`VendasAutomationService` — todos com o mesmo erro `Timed out fetching a new connection from
the connection pool (...connection limit: 10)`. **Não é bug específico da cadencia** — é o
incidente de connection-pool-storm já mapeado na memória do dono
(`prisma-storm-fk-orfa-governor-17-07`). Fora desse pico, o runner de cadência não gera NENHUM
log de processamento real (silencioso quando não há `CadenciaInscricao` pra processar — bate com
a contagem 0 da seção 1).

**Achado extra (fora do que foi pedido, mas relevante pra decisão de demolição)**: o motor de
prospecção `VendasAutomationService` gerou **1480 linhas em ~3h** (tick a cada ~15s), sempre a
mesma dupla de mensagens:
```
[vendas-automation] no eligible leads campaignId=cmr0pn32g00h332nrdsdxa2ij skippedThisCycle=0 pending=10 needsReview=0 noWhatsapp=0
[vendas-automation] prospecting_not_live — refill bloqueado campaignId=cmr0pn32g00h332nrdsdxa2ij
```
Ou seja: o motor está **rodando ativamente** (ciclo vivo, 10 leads pendentes prontos), mas
**100% bloqueado** porque nenhuma empresa tem `prospectingBotLiveAt` setado (confirma seção 1).
É trabalho de CPU/DB desperdiçado, não um motor morto — o código funciona, só falta alguém
apertar "ao vivo" nessa campanha.

`RecoveryAutomationWorkerService` só aparece nas 3 linhas do pico de pool-storm — nunca loga
sucesso nem falha fora dali, consistente com `recoveryBotLiveAt=NULL` em todas as empresas
(nada pra fazer).

```
docker logs --since 48h hbx-backend 2>&1 | grep -iE 'conversation_assistant|cadencia|atendimento'
docker logs hbx-backend 2>&1 | grep -ic 'conversation_assistant'
docker logs hbx-backend 2>&1 | grep -c 'vendas-automation'
docker logs hbx-backend 2>&1 | grep -c 'RecoveryAutomationWorkerService'
docker inspect hbx-backend --format '{{.State.StartedAt}}'
```

## 5. Veredito por item do README

### SALVAR (README linha 55-67) — confronto com o dado

| Item | Veredito | Por quê |
|---|---|---|
| `queueOutboundForCompany` (porta de saída) | INCERTO | Fora do escopo de tabelas desta sprint (é pipeline de mensageria, não tem contador dedicado aqui); sem medição direta nesta coleta |
| `interruptForInbound` | INCERTO | Idem — não há tabela própria pra contar disparos; precisa de instrumentação extra pra medir (fora do escopo S02) |
| Claim idempotente `ConversationAssistantRun` | EM USO — mas nunca testado em produção real | Estrutura pronta e config `published=true` há 7 dias, porém **0 execuções reais desde sempre** — só existe caminho de sandbox hoje. Crítico preservar mesmo sem tráfego, porque o dono está configurando ativamente (33 versões hoje) |
| Motor de prospecção `vendas-automation.service` | EM USO — migrar preservando o freio | Ticking ativo (1480 logs/3h), 10 leads prontos, único motivo de não disparar é a trava de negócio `prospecting_not_live` — a trava é a feature funcionando, não bug |
| Runner de cadência (`runDueSteps`) | CÓDIGO em uso, DADOS não | Runner ligado e "tickando" de verdade, mas `CadenciaInscricao`=0 desde sempre em produção — não há inscrição real pra processar. Preservar o motor (README manda), mas as 9 `Cadencia` atuais são só seed, sem histórico de uso de cliente |
| Sandbox do assistente (Ollama local) | INCERTO — não instrumentado | Por design não grava em `ConversationAssistantRun`; não dá pra confirmar uso real por essa via nesta coleta |
| Fundação IA Concierge | Fora de escopo (frente separada, S05B) | Não inventariado aqui por instrução do README/S02 |
| Pino `bot-activation` / gates fail-closed | EM USO | `Company.botArmedAt` setado pra empresa 5 confirma o pino sendo usado de verdade |
| Guardrails WhatsApp | Intocável (fora de escopo) | Não avaliado — regra dura da frente |

### DESCARTAR (README linha 69-76) — confronto com o dado

| Item | Veredito | Por quê |
|---|---|---|
| 3 modos de montagem do /bot (Tabuleiro/Trilha/Bandeja) | INCERTO | É decisão de UI sem rastro em banco/log — não medível por esta sprint; decidir por inspeção de código na S13 |
| Chat de teste FAKE do /bot (simulação hardcoded) | **LIVRE PRA DEMOLIR** | Por definição não chama backend (hardcoded no front) — zero pegada de dado; substituto real (`AssistenteConfig.published=true`) já está em produção pra empresa 5 |
| `BotOnboarding` (wizard duplicado) | EM USO — migrar antes | Consome `/inbox/bot-config`, que tem tráfego real confirmado (v33 hoje). O dado da tabela não distingue se veio do wizard ou da tela direta, mas o endpoint que ele usa está vivo — não apagar sem migrar quem grava lá |
| Telas `/bot`, `/automacoes`, `/assistente` | EM USO — migrar antes | Todas as 3 têm dado ativo: `BotConfig` v33/v36 hoje, `AssistenteConfig` published, `Cadencia` seed em 3 empresas |
| Duplicidade `BotConfig`-atendimento × `AssistenteConfig` | EM USO — migrar com cuidado | Os DOIS estão ativos SIMULTANEAMENTE pra empresa 5 hoje (bot config sendo editado E assistente published) — a S09/S10 precisa fazer os dois coexistirem até o flip, não pode escolher um e descartar o outro de cara |
| Flags soltas por motor → `HBX_AUTOMATION_*` | EM USO — migrar com alias | `HBX_ASSISTENTE_PUBLISH_ENABLED=true` gateia código real (`messaging.service.ts:438`) agora mesmo; renomear exige alias/fallback, não dá pra apagar a flag antiga direto |

### Achado adicional (não estava na lista do README)

| Item | Veredito | Por quê |
|---|---|---|
| `Copiloto` (`/assistente/copiloto*`, `copiloto.controller.ts`/`copiloto.service.ts`) | **EM USO — NÃO faz parte desta fusão, preservar intocado** | Feature separada (redação assistida pro vendedor na tela de Leads), flag própria, não toca nenhuma tabela desta frente. Só compartilha prefixo de URL com `/assistente` por acaso histórico. Ver seção 3 |

## Resumo executivo

- **Nenhum motor tem uso real de "cliente final" em produção hoje** — `ConversationAssistantRun`,
  `CadenciaInscricao`, `CadenciaGatilho`, `CadenciaRotina` estão todos zerados, sempre.
- **Mas há uso ativo de configuração/admin**: empresa 5 (a do dono) está sendo editada AO VIVO
  hoje (`BotConfig` v33/v36) e tem `AssistenteConfig.published=true` há 7 dias — ou seja, isso
  não é código morto, é código em fase de setup/teste antes de ir ao ar de verdade. Demolir sem
  migrar quebraria o trabalho de configuração em andamento.
- **O motor de prospecção está vivo mas travado de propósito** (freio de negócio, não bug) —
  1480 ciclos em 3h sem produzir nada porque nenhuma empresa está "ao vivo".
- **Achado extra fora do pedido**: incidente de connection-pool-storm às 02:00-02:02 (21/07,
  hora do servidor) afetou cadencia + recovery + prospecção + mensageria simultaneamente — sinal
  de um problema de infra mais amplo, não desta frente; não investigado além do log (fora de
  escopo da S02).
- **Achado extra fora do pedido**: `Copiloto` compartilha URL com `/assistente` mas é feature
  separada e ativa — cuidado pra não demolir junto na S12/S17.

## O que NÃO foi medido (e por quê)

- **Logs de 48h completos**: só ~3h10min disponíveis — container reiniciado antes da coleta, sem
  agregador de log externo encontrado no VPS.
- **`queueOutboundForCompany` / `interruptForInbound`**: sem tabela dedicada de contagem no
  escopo desta sprint; precisaria de instrumentação adicional (fora do pedido da S02).
- **Sandbox do assistente**: por design não deixa rastro em `ConversationAssistantRun`; não
  medido diretamente.
- **Uso por `CompanyModule`/gates de acesso `bot`/`vendas`**: não pedido explicitamente no
  contrato, não coletado (evitar escopo extra).

## Comandos usados (reproduzibilidade)

Todos rodados via `node scripts/vps-run.js "<comando>"` a partir da raiz do repo. Credenciais
do Postgres lidas de `/root/HBX/.env` na VPS (`POSTGRES_USER=hbx_user`,
`POSTGRES_DB=hbx_prod`) — não reproduzidas aqui por não serem segredo crítico de app (senha
interna do container, já rotativa por deploy), mas por princípio não coladas em texto solto além
do necessário pra descoberta inicial.

```bash
# Descoberta do ambiente
node scripts/vps-run.js "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'"
node scripts/vps-run.js "grep -n 'POSTGRES_' /root/HBX/.env"
node scripts/vps-run.js "docker exec hbx-postgres psql -U hbx_user -d hbx_prod -c 'SELECT 1;'"

# Contagens — ver seção 1 (cada bloco de SQL reproduzido lá)

# Flags — ver seção 2
docker exec hbx-backend printenv | grep -E '^HBX_(ASSISTENTE|CADENCIA|BOT|VENDAS_AUTOMATION)' | sort
docker exec hbx-backend printenv | cut -d= -f1 | grep -E '^HBX_' | sort

# Referências legadas — ver seção 3 (greps locais no repo)

# Logs — ver seção 4
docker logs --since 48h hbx-backend 2>&1 | grep -iE 'conversation_assistant|cadencia|atendimento'
docker inspect hbx-backend --format '{{.State.StartedAt}}'
```
