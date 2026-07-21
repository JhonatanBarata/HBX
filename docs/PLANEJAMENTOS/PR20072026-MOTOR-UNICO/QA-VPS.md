# QA-VPS — roteiro pós-publish da fusão MOTOR-ÚNICO (S22)

> Só roda DEPOIS que o dono publicar do HEAD completo (`npm run publish`, a partir de
> um estado com S15→S21 no local — ver `RELATORIO-FINAL.md` pro porquê). Ordem
> estrita: cada passo assume o anterior verde. Ambiente: VPS (produção) —
> `docker exec`/`docker logs` locais aqui rodam via `node scripts/vps-run.js "<comando>"`
> a partir da raiz do repo (mesmo padrão usado na S02, `INVENTARIO.md`).

---

## (a) Boot limpo — `docker ps` + logs do backend

```bash
node scripts/vps-run.js "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'"
node scripts/vps-run.js "docker logs --tail 300 hbx-backend"
```

Conferir no log:
- Nenhum erro de DI (Nest sobe todos os módulos, incluindo `AutomationModule`).
- Rotas mapeadas (grep rápido):
  ```bash
  node scripts/vps-run.js "docker logs hbx-backend 2>&1 | grep -E 'automation/(overview|agent|plays)'"
  ```
  Esperado: `/automation/overview`, `/automation/agent`, `/automation/agent/sandbox`,
  `/automation/agent/publish`, `/automation/plays`,
  `/automation/plays/:tipo/:id/toggle`, `/automation/plays/cadencia/:id/aplicar`.
- Executores do orquestrador registrados (log do `OutboundOrchestratorService`):
  ```bash
  node scripts/vps-run.js "docker logs hbx-backend 2>&1 | grep 'automation-orchestrator'"
  ```
  Esperado uma linha `[automation-orchestrator] iniciado — tick <ms>ms — executores
  registrados: <chaves>` (inclui o executor de cadência). Prospecção
  (`vendas-automation`) **não** aparece nessa lista de propósito — tem timer próprio,
  ver `CONTRATO.md` §8.5.
- `docker ps` mostra `hbx-backend`/`hbx-postgres`/frontend saudáveis (`Up`, sem
  `Restarting`).

Se boot não fechar (`P1001`/DI quebrado): **parar aqui**, não seguir pros próximos
passos — ver `docs/Rules/deploy-build-verde-nao-e-boot-ok` (memória do dono, 08/07).

---

## (b) Backfill do `AutomationAgent` (idempotente)

Roda DENTRO do container (`scripts/`+`dist/` já vêm na imagem — `backend/Dockerfile`
faz `COPY . .` + `npm run build`, `WORKDIR /app`):

```bash
# 1. Dry-run primeiro (só reporta, não grava) — todas as empresas
node scripts/vps-run.js "docker exec hbx-backend node scripts/automation-agent-backfill.js --dry-run"

# 2. Conferir o resumo, então aplicar de verdade
node scripts/vps-run.js "docker exec hbx-backend node scripts/automation-agent-backfill.js"
```

- Idempotente: rodar de novo não duplica nem regride config já sincronizada — pode
  reexecutar sem medo se algo parecer errado.
- Sem rodar isso, `AgentRuntimeResolver` cai em `{source:'legacy'}` pra TODA empresa
  (nenhuma tem linha em `AutomationAgent`) — comportamento idêntico ao de hoje, nada
  quebra, só a config ainda não aparece pela leitura nova.
- Pra conferir uma empresa específica sem afetar as outras: `--company-id 5`
  (combinado com `--dry-run` se só quiser olhar).

---

## (c) Fumaça funcional — login empresa de teste

Login: usar as credenciais de `.test-login.local.md` (gitignored, raiz do repo) — se
não indicar qual empresa, perguntar ao dono antes de mexer na empresa 5 (é a conta
REAL dele, com `BotConfig`/`AssistenteConfig` editados ativamente — ver
`INVENTARIO.md` §1). URL: `https://www.hbxsystem.com.br`.

1. Entrar em **Automação** (item único da sidebar, grupo Facilidades) → confirmar
   que abre `/automacao` com o painel de status (4 cartões-objetivo) carregado a
   partir de `GET /automation/overview` — sem erro, sem cartão travado em loading.
2. Passar pelas **4 seções** (`?secao=atendente|cobranca|prospeccao|regras`):
   - **Atendente** — trocar entre os 2 cérebros (`roteiro`/`ia`), confirmar que o
     sandbox responde (Ollama local, nunca toca chip) pros dois.
   - **Cobrança** — abrir a config do recovery reembalado.
   - **Prospecção** — confirmar que a seção funde prospecção + cadência (persona,
     campanha).
   - **Regras** — abrir gatilhos e rotinas.
3. **Criar 1 gatilho e 1 rotina de teste** (dados de teste, apagar depois se quiser
   manter o ambiente limpo) — confirmar que salva e aparece na listagem.
4. **Aplicar 1 cadência** a um lead de teste — confirmar que `POST
   /automation/plays/cadencia/:id/aplicar` retorna sucesso e o lead aparece
   inscrito.
5. **Redirects das 3 URLs velhas** — navegar direto (ou colar na barra) para:
   - `/bot` → deve cair em `/automacao?secao=atendente`
   - `/automacoes` → deve cair em `/automacao?secao=prospeccao`
   - `/assistente` → deve cair em `/automacao?secao=atendente`
   Confirmar que `/assistente/copiloto` (painel do lead) **continua funcionando
   direto**, sem redirect — é feature separada, preservada intacta.

---

## (d) Flags — o que injetar e a decisão pendente

Nenhuma flag é OBRIGATÓRIA pra subir — todas as `HBX_AUTOMATION_*` novas caem no
fallback da flag velha (`automationFlag()`), então o VALOR EFETIVO no VPS não muda
sozinho com este publish. Confirmar o que está setado hoje:

```bash
node scripts/vps-run.js "docker exec hbx-backend printenv | grep -E '^HBX_(AUTOMATION|ASSISTENTE|CADENCIA|RECOVERY_AUTOMATION|ATENDIMENTO_NLU)_' | sort"
```

- **A ÚNICA decisão real do dono**: `HBX_AUTOMATION_AGENT` — a flag nasce
  **default ON em código** (S20). Ausente no `.env` = runtime já tenta ler o
  schema novo (`AutomationAgent`) pra toda empresa que tiver passado pelo backfill
  do passo (b); empresa sem linha cai em legado sozinha (fail-soft, não quebra).
  - **Deixar ON (não setar nada)** = comportamento recomendado, já que o
    fail-soft cobre empresa não migrada.
  - **Se quiser travar no legado por enquanto** (ex.: pra isolar variável durante
    o QA): setar `HBX_AUTOMATION_AGENT=0` no `.env` da VPS e reiniciar o
    `hbx-backend`.
- As demais `HBX_AUTOMATION_*` (family da seção (A) do `CONTRATO.md`) são
  opcionais — só setar se quiser ligar/desligar algo especificamente pelo nome
  novo. **Antes de trocar o nome no VPS para `HBX_AUTOMATION_COBRANCA_WORKER_ENABLED`**,
  corrigir o P1-1 da `RELATORIO-S21.md` (o worker real ainda lê só a flag velha —
  trocar o nome no `.env` sem corrigir o código faz o painel mentir sobre o
  worker).

---

## (e) Teste de chip — só se o dono mandar, só em número descartável

- **NUNCA** o chip do dono. Testar conexão/reconexão/envio real só em número
  descartável, seguindo `Webwhats/AGENTS.md` + `docs/Rules/WHATSAPP.md`.
- Este passo só acontece se o dono pedir explicitamente — não é parte automática
  do roteiro. Guardrails desta frente (disjuntor, 1 número=1 conexão) foram
  conferidos intocados na S21 (`git diff 127b9166..HEAD --stat -- Webwhats/` vazio)
  — o teste aqui é só pra confirmar que uma mensagem real, enfileirada por
  `queueOutboundForCompany` a partir do fluxo novo (ex.: sandbox publicado,
  cadência aplicada), sai igual a antes.

---

## (f) Se um dia mover a migration do hold

`prisma/migrations-hold/pending_drop_assistente_config_and_atendimento_botconfig/`
tem o DDL destrutivo (drop de `AssistenteConfig` + `BotConfig`), fora do caminho de
deploy (`prisma migrate deploy` não a vê). **Pré-requisitos, nesta ordem, antes de
mover pra `prisma/migrations/`:**

1. Rodar o dump seletivo (NUNCA pula este passo):
   ```bash
   node scripts/vps-run.js "bash /root/HBX/backend/scripts/automation-pre-drop-dump.sh"
   ```
   Guarda `AssistenteConfig` + `BotConfig` + `AutomationAgent` (allowlist, nunca
   `cnpj_public*`) em `/root/HBX/backup-motor-unico/db/` no host do VPS — baixar
   uma cópia pra `Desktop\Backup 20-07 alteracaomotor\db\` depois.
2. **Fazer a limpeza das leituras legadas** (P1-2 da `RELATORIO-S21.md`) — a
   migration tem guarda de paridade própria, mas ela pode PASSAR e o runtime
   quebrar do mesmo jeito, porque hoje ainda leem `AssistenteConfig`/`BotConfig`
   de propósito (kill-switch + dual-write):
   - `backend/src/messaging/messaging.service.ts:444` (gate de cancelamento do
     outbound da assistente)
   - `backend/src/vendas/vendas.service.ts:8113`
   - `backend/src/assistente/conversation-assistant-runtime.service.ts:79` (ramo
     legado)
   - `backend/src/assistente/assistente.service.ts` (CRUD que o `AgentService`
     usa por baixo)
   - `backend/src/automation/agent-backfill.service.ts`
   Essa limpeza é uma SPRINT PRÓPRIA (fora do escopo desta frente) — não fazer
   apressado só pra destravar a migration.
3. Só depois de (1) e (2): mover o arquivo de `migrations-hold/` pra
   `prisma/migrations/`, deploy normal, e confirmar boot limpo de novo (repetir
   passo (a)).

---

## Checklist rápido (resumo pra colar num chat)

- [ ] (a) `docker ps` verde + boot sem erro de DI + executores registrados no log
- [ ] (b) backfill rodado (dry-run conferido, depois aplicado)
- [ ] (c) login teste → 4 seções → sandbox 2 cérebros → gatilho/rotina criados →
      cadência aplicada → 3 redirects OK → copiloto intocado
- [ ] (d) flags conferidas; decisão sobre `HBX_AUTOMATION_AGENT` tomada
      (recomendação: deixar ON)
- [ ] (e) teste de chip real — só se o dono pedir, só em número descartável
- [ ] (f) — fora de escopo deste publish; só quando uma sprint futura limpar o P1-2
