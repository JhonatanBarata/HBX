# 🔴 HANDOFF — RETOMAR AQUI (sessão nova, 30/06 noite)

> Abra isto primeiro. A memória (`MOTOR.md`) tem o detalhe; este arquivo é o "onde paramos + próximo passo".

## ⏩ ATUALIZAÇÃO 30/06 noite-2 (sessão orquestrador+workers) — leia isto primeiro
**Diagnóstico fechado + correção PRONTA no working tree (NÃO publicada). Decisão de publish = dono.**
1. **Passo 1 RESOLVIDO:** as 2 migrations (`BraveApiUsage`, `LeadContact`) **ESTÃO aplicadas no VPS** (constam no
   `_prisma_migrations`, `finished_at` ok). Disjuntor de CAP **PROTEGIDO, não falha aberto**. `npm run publish` roda
   `migrate deploy` sim — suspeita descartada. `HBX_BRAVE_MONTHLY_CAP` = default 900 (não setado no VPS).
2. **Fantasma CAÇADO — é BUG DE CÓDIGO, não caller externo.** O "Parar" seta `RadarFactoryCursor.enabled=false` +
   `emergencyStop=true`, mas isso só é LIDO na porta de **criação** de missão (`ensureNightFactoryWork`). Os **pumps de
   execução** (`processNextRadarCampaigns` setInterval 30s + recover de boot + auto-distributions) drenam campanhas já
   enfileiradas **sem reler o stop**; `searchBrave` (gargalo) nunca checava o Parar. `HBX_FACTORY_AUTONOMOUS_DISABLED`
   **não cobre** (só barra criação) e nem está setado. **Prova ao vivo:** contador Brave subindo **~4/min** (35→58 em 8min)
   com o painel "parado". (Gasto real = ZERO — Brave travado externamente; chamadas provavelmente falham mas incrementam.)
3. **FIX IMPLEMENTADO (working tree, typecheck verde, revisado):** 2 arquivos, só adições —
   `radar-web-enrichment.service.ts` (`searchBrave` ganha gate `factoryEmergencyStopped()`: lê `emergencyStop` do
   operational config `turbo_noturno`, cache 8s, fail-open igual ao CAP → corta Brave pra QUALQUER caller) +
   `radar-core-mass-data.mixin.ts` (`processNextRadarCampaigns` early-return quando `emergencyStop`||`enabled===false`).
   Sinal = `emergencyStop` porque `resumeFactorySchedule` o **limpa** no Start → não trava pra sempre.
4. **DECISÃO DO DONO (não feito):** **`npm run publish`** faz o Parar finalmente obedecer (= mata o fantasma). Nuance: se
   `emergencyStop` já está `true` no VPS agora, publicar corta na HORA; se `false`, clicar Parar depois. **Não confirmei o
   valor atual** — classificador bloqueou a leitura de prod (precisa o dono nomear o alvo). Tripwire `CAP=20` ficou
   **desnecessário** (caça já terminou) — manter 900.

---

## Onde paramos (1 frase)
Toda a base da **árvore final do HBX Owner + o disjuntor do Brave** foi construída, revisada por mim (Opus) e
**JÁ PUBLICADA no VPS** (commit `7464fe59`, `chore: publish 20260630_223323`, working tree limpo). Falta
**VERIFICAR que aterrissou certo no VPS**, **caçar um caller fantasma de Brave** e os itens que dependem do dono.

## O incidente que originou o disjuntor (contexto)
Brave avisou que **estourou 1000** (Brave é **pago acima de 1000** — o dono **travou externamente a tempo, gasto
real = ZERO**, sistema ainda sem clientes). **GRAVE:** o dono clicou "Parar" no painel e o Brave **NÃO respeitou o
stop** → existe um **caller fantasma** (provável autônomo no VPS) que o painel local NÃO para. Por isso o freio
certo é o **disjuntor no gargalo** (`searchBrave`), que corta independente de quem chama.

## O que foi PUBLICADO (está no VPS agora) — tudo aditivo, gates default OFF
| Peça | Arquivo(s) | Estado/env |
|---|---|---|
| **Disjuntor Brave** | `radar-web-enrichment.service.ts` (`searchBrave`) + tabela `BraveApiUsage` (migration `20260630213000`) | ATIVO por default. `HBX_BRAVE_MONTHLY_CAP` (default **900**, `<=0`=ilimitado). Estoura→devolve `[]`. Contador estático persistente. |
| **PR1** contatos | `LeadContact` (migration `20260630201409`) + `backfill-lead-contacts.js` + escrita dupla em `webscraping.service.ts` + endpoint `GET /modules/owner/radar/contacts/export` + botão no cockpit | tabela vazia até backfill rodar. **Presenter/front já exibiam contato — NÃO foi tocado.** |
| **PR2** interlock | `radar-core-factory-admin.mixin.ts` + `radar-core-mass-data.mixin.ts` (guard `onlineHealthyEngines<=0`→fábrica pausa) + `tree.js` (botão único de estado) | ativo (comportamental seguro) |
| **PR3** gate fábrica | `radar-core-factory-admin.mixin.ts` (`HBX_FACTORY_AUTONOMOUS_DISABLED`) + `scripts/cleanup-vps-autonomous-factory.js` (dry-run sem `--confirm`) | **env ainda NÃO setado no VPS** (default = fábrica autônoma ligada) |
| **PR4a** saneamento IA | `ai-saneamento.service.ts` + método `aiSaneamentoForMaster` + endpoint `POST /modules/owner/radar/ai-saneamento` | `HBX_AI_SANEAMENTO_ENABLED` **OFF** por default; modelo `HBX_AI_SANEAMENTO_MODEL` (default `qwen2.5:7b`) |

## PRÓXIMO PASSO IMEDIATO (fazer COM o dono)
1. **🔴 CRÍTICO — confirmar que as 2 migrations APLICARAM no VPS** (`LeadContact` + `BraveApiUsage`).
   Se o `npm run publish` NÃO roda `prisma migrate deploy` no VPS, as tabelas não existem →
   **o disjuntor FALHA ABERTO (sem proteção)** e o export/backfill quebram. Verificar via `scripts/vps-run.js`
   (SSH) ou ops-control: `SELECT to_regclass('"BraveApiUsage"'), to_regclass('"LeadContact"');`. Se faltar,
   rodar `cd /root/HBX/backend && npx prisma migrate deploy` no VPS.
2. **Tripwire:** setar `HBX_BRAVE_MONTHLY_CAP=20` no **`/root/HBX/backend/.env`** do VPS + **RECREATE** o
   `hbx-backend` (não restart — memória INFRA: env_file só vale em recreate; o `hbx-backend` é `docker run` cru
   com ~25 flags `-e`, ver método seguro em MOTOR.md/INFRA.md).
3. Dono **reabilita o Brave** (destravar externamente) — agora seguro (para em 20).
4. **Caçar o fantasma:** `SELECT * FROM "BraveApiUsage";` e observar o `count` subir. **Se subir com o painel
   dizendo "parado" → achamos o caller que não obedece** (para em 20, gasto real ≈ 0). Rastrear quem chama
   `searchBrave`/`cnpjBackfillForMaster` sem passar pelo stop do painel.
5. Consertar o "stop que não obedece" (controle tem que obedecer — regra dura do dono).
6. **Ligar o VPS-sem-fábrica:** `HBX_FACTORY_AUTONOMOUS_DISABLED=true` no `.env` do VPS + recreate + rodar
   `node scripts/cleanup-vps-autonomous-factory.js` (1º sem `--confirm` = diagnóstico, depois `--confirm`).
7. Voltar o `HBX_BRAVE_MONTHLY_CAP` pra 900 quando o teste fechar.

## DEFERIDO — só com o dono / ao vivo (NÃO construído ainda)
- **Nota ICP** (score 0–10): falta o **rubric de conversão** (decisão de negócio do dono — segmento que assina +
  tem WhatsApp + cidade-alvo). O dono adiou junto com "entregas/planos diferenciados".
- **Cérebro híbrido 30B/7B:** túnel **Tailscale** (PC↔VPS) + roteador (pesado→30B local se PC on, senão 7B/fila;
  realtime cliente→sempre 7B; VPS-origem→prioridade 30B) + heartbeat. Install ao vivo nas 2 máquinas. **NÃO EXISTE
  ainda** — não confundir com "publicado". (Dono vai comprar GPU → derruba o limite "batch-only".)
- **Freio-fino da elasticidade** (cursor que reenfileira cidade esgotada e segura 20 motores) — só ao vivo com carga
  (regra: motor não se conserta às cegas). Ver MOTOR.md "VPS 100% CPU" / "FREIO PENDENTE".

## GOTCHAS
- Disjuntor **fail-OPEN** se a tabela `BraveApiUsage` faltar (por isso o passo 1 é crítico).
- `migrate dev` está **quebrado** (shadow-DB por migration antiga `20260402_add_financeiro...`) → migrations feitas
  à mão + `migrate deploy` (é o que o PR1 e o disjuntor fizeram). Consertar o shadow-DB um dia.
- VPS: mudar `.env` = **RECREATE** container, não restart. `hbx-backend` = `docker run` com ~25 `-e` (recreate
  ingênuo quebra a frota — método seguro em MOTOR.md/INFRA.md).
- Presenter (`radar-core-presentation.mixin.ts:2233-2252`) + front (`detalhes-negocio.tsx:715-800`) **já exibem**
  CNPJ/dono/emails/phones do `metadataJson` — o gap era THROUGHPUT (quase nada enriquecido) + bulk export, não visibilidade.

## Ponteiros
- Plano completo por PR: [`arvore-final-owner-enriquecimento.md`](./arvore-final-owner-enriquecimento.md)
- Memória de domínio: `MOTOR.md` (entradas: disjuntor Brave, ÁRVORE FINAL decisões, "pipe de visibilidade JÁ EXISTE",
  DEFINIÇÃO de enriquecimento do dono, correção Brave=pago~1000).
