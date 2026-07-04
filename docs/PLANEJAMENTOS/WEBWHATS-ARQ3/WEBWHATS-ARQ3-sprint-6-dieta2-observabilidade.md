# WEBWHATS-ARQ3 — Sprint 6: Dieta do fork fase 2 + observabilidade de frota

> Continua a dieta que o GATEWAY-WA S4 parou (integrações acopladas ao `ChannelStartupService`)
> e fecha a lacuna de "zero métrica agregada". Depende do Sprint 5 (desacoplamento que a dieta 2
> exige). Índice: [sprint 0](WEBWHATS-ARQ3-sprint-0-visao.md).

## Problema ($)
1. **Superfície morta:** o fork Evolution ainda carrega openai/dify/typebot/chatwoot/S3, que a
   dieta S4 NÃO removeu porque estão instanciados direto no `ChannelStartupService` (o motor faz
   `new`/usa `this.openaiService.speechToText`, `s3Service`). Código não usado = superfície de
   ataque + RAM + risco em cada upgrade do fork. (`ss`/`systemctl show` mediu ~120 MB hoje, base
   ok, mas cada integração morta é dívida.)
2. **Cegueira operacional:** diagnóstico hoje é `journalctl -u webwhats.service`. Não há série
   temporal de RAM, lag da outbox, taxa de reconexão por chip, envios/hora. O dono descobre
   problema por sintoma no cliente, não por painel. Altíssimo porte NUNCA opera assim.

## Fatos verificados
| Fato | Onde |
|---|---|
| Dieta S4 removeu 4 chatbots + 5 event providers (−32 arq/9 pastas) | WHATSAPP.md (GATEWAY-WA S4) |
| PULOU openai/typebot/dify/chatwoot/S3 (acoplados ao canal Baileys) | idem |
| `ChannelStartupService` instancia direto → precisa injeção opcional ANTES de remover | idem |
| `grafana-dashboard.json.example` + `prometheus.yml.example` já existem no fork | `Webwhats/` raiz |
| Telemetria S1 (`ConnectionEvent`) + fleet-health já dão a matéria-prima | Sprint 1/2 |

## Entregas
### Parte A — Dieta 2 (depende do desacople do Sprint 5)
1. Tornar as integrações do `ChannelStartupService` **injeção opcional** (já desenhado como
   pré-requisito no GATEWAY-WA S4). Sem isso, remover quebra o boot.
2. Remover as que o HBX comprovadamente NÃO usa. **Cuidado:** OpenAI `speechToText` pode estar no
   caminho real de transcrição de áudio — CONFERIR uso vivo antes (grep + log) e, se usado, manter
   ou substituir por Whisper local (já é ideia no MEMORY.md) em vez de arrancar cego.
3. Cada remoção: `npm run typecheck` do motor verde + smoke do fluxo de mensagem.

### Parte B — Observabilidade (independe da dieta, pode vir antes)
4. **Métricas de frota** expostas pelo motor (endpoint `/metrics` Prometheus-compat OU push pro
   backend): RAM do processo, nº de sockets open/close, reconexões por chip (da telemetria S1),
   lag da outbox (max id − cursor), idade de cada sessão.
5. **Dashboard** (reusar `grafana-dashboard.json.example` do fork OU um painel Master simples no
   app — decidir por custo: se não há Grafana rodando, um painel HBX no /master é mais barato).
6. **Alertas** via MasterAlertService (já existe, gate por CNPJ): chip flapando (N reconexões/h),
   outbox travada (lag > limiar), motor sem heartbeat, RAM subindo anômala.

## Aceite
- [ ] Parte A: cada integração removida some do build sem quebrar boot/mensagem; contagem de
      dependências e superfície cai; áudio (se usado) segue funcionando.
- [ ] Parte B: painel mostra RAM, sockets, reconexões/chip, lag da outbox em tempo nQuase real.
- [ ] Alerta dispara em teste dirigido (forçar lag / derrubar chip descartável).
- [ ] Documentar no INFRA.md como ler o painel e o que cada alerta significa.

## Riscos / rollback
- Arrancar integração usada quebra transcrição/mídia: a regra é PROVAR não-uso antes (grep + log
  de produção), nunca presumir. Rollback de dieta = revert do commit.
- Endpoint `/metrics` novo no motor NÃO pode expor à internet (Sprint 1 fechou a porta — manter
  interno; se for `/metrics` público, some com o ganho de segurança).
- Observabilidade é aditiva e read-only — risco baixo; priorizar Parte B se o tempo apertar
  (diagnóstico vale mais que magreza do fork).
