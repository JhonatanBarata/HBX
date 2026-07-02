# F2v2 — Fábrica de ENRIQUECIMENTO: lê a lista RFB e enriquece TUDO (local, grátis-absoluto)

> Worker Opus. RE-ESCOPADO 02/07 noite pelo dono (substitui o escopo anterior deste arquivo).
> Leia ANTES: `docs/PLANEJAMENTOS/ARVORE-MESTRA/PLANO-FECHAMENTO.md` (F2 + adendo 02/07),
> `docs/PLANEJAMENTOS/MOTOR-RFB-FILA/sprint4-fila-missoes-RESULTADO.md` (fila S4),
> `docs/PLANEJAMENTOS/MOTOR-RFB-FILA/sprint5-RESULTADO.md` (gate anti-alucinação),
> `docs/Rules/MOTOR.md`. Pré-requisito: F0 demoliu a fábrica de descoberta.

## As 3 leis do dono (invioláveis, custam o trabalho inteiro se quebradas)
1. **LOCALHOST NUNCA ACESSA NADA PAGO.** Não é config, é FÍSICA: implementar `HBX_ROLE`
   (`local`|`vps`); todo provider pago (Places, Serper, qualquer `HBX_ENRICH_ALLOW_PAID`)
   **recusa em código** quando `HBX_ROLE=local` (throw/log, teste cobrindo). Além disso:
   backup `.env.bak-f2` e REMOVER as chaves pagas do `.env` LOCAL (nunca tocar o da VPS).
2. **Pago = só reforço, só no VPS, só pós-score.** M4 não roda local: a fábrica marca o lead
   que passou no score e ainda ficou sem contato → fila de reforço que SÓ o backend da VPS
   consome (atrás do governor fail-closed). Implementar a marcação + o consumo VPS-side
   (flag própria, default OFF — liga no recreate final do orquestrador).
3. **A fábrica NÃO descobre** — ela lê a lista gigante da RFB (base local de 28M, carga do F1)
   e completa o lead com TUDO que for grátis.

## O que a fábrica enche por lead (contato é 1ª classe — N por lead via `LeadContact`)
telefone 1..3 · email 1..3 · instagram · facebook · site · avaliações (nota/qtd do scraping
google) · sócio/dono. Tudo pelo caminho ÚNICO `LeadContactWriteService` (gate anti-alucinação).

## Estágios (missão `enrich_lead` sobre a fila S4 — reusar lease/heartbeat/backoff/dead-letter)
- M1 crawl profundo do site · M2 caça-contato web (searxng/ddg/bing grátis; respeita
  emergencyStop) · M3 sociais (probe insta/fb) · M3b avaliações via scraping google
  (**motor de risco de IP**: ver controles abaixo) · M5 extração 30b + nota ICP 7b
  (`saneiaComNota`; nota ≤3 → quarentena W2) · M6 zap-gate (freio W4 cobre).
- M4 (pago) local NÃO EXISTE — vira a marcação da lei 2.

## Alimentador por DEMANDA
Lê a base RFB local (cidade×cnae) priorizando: buscas recentes × `RadarCoverage` fraco ×
estoque baixo. Cap de fila (`HBX_ENRICH_QUEUE_CAP` default 200). Nunca varre em ordem cega.

## Controles operacionais (contrato com o Owner v2 — EXATAMENTE estas rotas, no backend LOCAL)
- `GET  /modules/owner/fabrica/status` → `{running, budget, processed, remaining, currentLead,
  errors, lastError, ipRiskEngineOn}`
- `POST /modules/owner/fabrica/start` body `{budget: N}` → roda até N leads e PARA SOZINHO
  ("só scrapear X" do dono; sem budget = recusa).
- `POST /modules/owner/fabrica/stop` → para AGORA (congela missões em curso com segurança).
Guards das rotas owner existentes. O painel (outro worker) consome via proxy — se as rotas
divergirem do contrato, o painel quebra: NÃO divergir.

## Validação AO VIVO obrigatória (o dono começa os testes em cima disso)
Local, Ollama vivo, flags locais ON: start com budget=5 → 5 leads da RFB enriquecidos de ponta
a ponta (contatos gravados via gate, nota, zap-gate, estoque/quarentena), custo R$ 0 comprovado
(nenhuma chamada paga nem tentativa — provar pelo log da trava), stop no meio congela e start
retoma sem duplicar. Registrar ids/logs no relatório.

## Regras duras
- Único autorizado a tocar `backend/prisma/schema.prisma` (aditivo mínimo, se precisar; justifique).
- NÃO tocar: `Webwhats/`, reconexão, internals do governor/freios (só consumir), fusão, planner
  e entrega do cliente, `hbx-owner/` (painel é de outro worker).
- Testes que leem env: SEMPRE pinar. Junction node_modules:
  `New-Item -ItemType Junction -Path .\backend\node_modules -Target C:\Users\Jhonatan\Desktop\App\backend\node_modules`.
- Validação: `cd backend && npm run build` + `node --test dist/...` dos módulos + validação viva.
- Commit na branch do worktree. Relatório: arquitetura (1 parágrafo), rotas do contrato,
  flags+defaults, evidência da validação viva, prova da trava anti-pago, migration se houve, pendências.
