# MASTER PLANO — 01/07/2026 (orquestração Opus + workers Opus)

> **Fonte da verdade da sessão.** Cada worker lê ESTE arquivo + o seu brief. Orquestrador (Opus)
> planeja e analisa; **workers Opus editam**. Tudo LOCAL / working tree, **reversível** (`git checkout`).
> **SEM publish, SEM VPS** nesta rodada — entrega é "pronto para teste" (`{X} solicitação OK. seguir para teste`).

## Arquitetura travada ("como vai ser agora") — a PONTE
Decisão consolidada (msg do dono + [arvore-final-owner-enriquecimento.md](../PR30062026/arvore-final-owner-enriquecimento.md) + [HANDOFF](../PR30062026/HANDOFF-continuar.md)):

**Cérebro híbrido, borda barata, pago só como reforço.**
- **Motor de enriquecimento roda no LOCAL (IP residencial)** — não toma ban como IP de VPS. Fonte grátis E mais durável.
- **VPS orquestra** e mantém a fila; o nó local **puxa** missões (pull, nunca push — sem abrir porta em casa).
- **Cérebro IA em 2 níveis:**
  - **30B local (`qwen3:30b-a3b`)** = trabalho PESADO/batch quando o PC está ON (extração, saneamento, nota ICP, mensagem).
  - **7B VPS (`qwen2.5:7b`)** = realtime do cliente + fallback quando o PC está OFF.
  - Roteador: pesado→30B se túnel up, senão 7B/fila; realtime→sempre 7B; VPS-origem→prioridade no 30B. (Túnel Tailscale + heartbeat = sessão conjunta ao vivo, PR4 — **não** nesta rodada.)
- **API paga (Places/Serper/Brave)** = só reforço, em lead que passou no score, e como fallback quando o motor local não achou. Nunca metralhar buscador pelo IP de casa (queima o ativo residencial).

**Pipeline do lead (ordem):**
`Alvo/ICP → Receita (grátis, identidade) → Base rica (Places/Serper pago só p/ contato que falta) → CÉREBRO IA (saneia nome+segmento · extrai email/tel/dono · nota ICP · escreve 1ª msg) → Validação WhatsApp (motor Webwhats) → Card pronto na ordem da nota ICP`

## Modelos disponíveis (verificado hoje, Ollama local `:11434`)
- `qwen3:30b-a3b` — 18.5GB, Q4_K_M, MoE, **thinking+tools**. **Mandar `think:false` sempre** (é param da API no qwen3, não `/no_think` no prompt).
- `qwen2.5:7b` — 4.6GB, Q4_K_M, tools, **não-reasoning**. É o modelo do VPS (cabe nos ~11GB livres; 30B NÃO cabe no VPS = OOM).
- Padrão de chamada de referência: `backend/src/webscraping/radar/03-enrichment/ai-saneamento.service.ts` (`think:false`, `format:"json"`, timeout, degrade gracioso).

## Frota desta sessão (3 workers Opus, paralelos — sem conflito de arquivo)
| Worker | Brief | Arquivos | Escreve resultado em |
|---|---|---|---|
| **W1 — Benchmark IA 7B×30B** | roda os 2 modelos LOCAL nas 4 tarefas (extração · saneamento · nota ICP · mensagem), pontua e recomenda | script em scratchpad; NÃO toca `src/` | `10-benchmark-ia-7b-x-30b.md` |
| **W2 — Card enriquecendo** | estado visual "enriquecendo" no card da direita (skeleton/pulse + reveal progressivo por campo) | `frontend/src/components/hbx/detalhes-negocio.tsx` + CSS `hbx-theme/` | `20-frontend-card-enriquecendo.md` |
| **W3 — Árvore 3107 nova** | estende a árvore p/ refletir a PONTE (nó cérebro 30B/7B + pipeline novo), mantém split-screen e contratos | `hbx-owner/local-agent/web/{tree.js,tree.css,index.html}` | `30-arvore-3107-nova.md` |

## Regras duras p/ todo worker
1. **LOCAL só.** Nada de `npm run publish`/`new`, nada de SSH/VPS, nada de tocar `.env` do VPS.
2. **Aditivo e reversível.** Não remover/renomear o que já funciona sem necessidade.
3. **Frontend = 5 Leis do Design System:** cor/borda/sombra/fonte/radius nascem em token/classe (`frontend/src/app/hbx-theme/`); nada solto; `node frontend/scripts/check-pele.mjs` (lint de pele) tem que passar.
4. **Fechar com sanidade:** frontend → typecheck + build + check-pele; árvore → abrir no navegador mentalmente / validar JS sem erro de sintaxe; benchmark → os 2 modelos responderam de verdade.
5. **Documentar SEMPRE** (mesmo se falhar): o `.md` de resultado leva "o que foi feito · arquivos · checks (verde/vermelho) · erros · como testar". Bloqueou? Documenta o bloqueio, não improvisa fora do escopo.
6. **Não confundir alvo:** W2 mexe só no card da direita; W3 só na árvore do Owner; W1 não toca `src/`.

## O que NÃO é desta rodada (deferido p/ sessão conjunta ao vivo)
- Túnel Tailscale + roteador 30B/7B + heartbeat real (install nas 2 máquinas).
- Rubric DEFINITIVO da nota ICP (decisão de negócio do dono — W1 usa rubric PROVISÓRIO só p/ testar capacidade do modelo).
- Publish / limpeza VPS / freio-fino ao vivo.

## Status (preenchido pelo orquestrador ao fim)
- W1: **✅ ENTREGUE** (worker morreu antes do relatório; orquestrador colheu e escreveu). Benchmark 7B×30B em 4 leads. **Veredito que contraria o óbvio:** 30B só ganha CLARO em **extração** (100% vs 67%); empata em saneamento (→7B mais barato); em ICP raciocina melhor mas comprime em 9-10 (7B "espalha" mas com motivo ALUCINADO — diz "sem dono" onde há dono); em **mensagem o 30B falha 100%** (runaway sem `max_tokens` cap) e tem **cold-load de ~12min**. **Roteamento:** 30B batch-local só p/ extração; 7B VPS realtime p/ saneamento/ICP/mensagem. Simplifica a ponte. Doc: [10-benchmark-ia-7b-x-30b.md](10-benchmark-ia-7b-x-30b.md).

## Fecho da sessão (orquestrador)
As 3 frentes entregues e verificadas, tudo LOCAL / working tree / reversível. **Nada publicado, nada no VPS.**
**Deferido p/ sessão conjunta ao vivo:** (1) rubric ICP definitivo + leads ruins de controle p/ re-testar 30B; (2) `max_tokens` cap no 30B p/ mensagem; (3) túnel Tailscale + roteador 30B/7B + heartbeat (aí o nó 🧠 da árvore acende de verdade); (4) backend surfacar `enrichmentStatus:pending/partial` p/ o card acender o estado "enriquecendo" em prod; (5) publish. **Débito achado:** 14 violações `check-pele` pré-existentes em `bot-builder/screens/whatsapp.css`.
- W2: **✅ ACEITO** (verificado). Estado "enriquecendo" no card: selo pulsante `✨ Enriquecendo…`, shimmer por campo pendente, 3 estados mutuamente exclusivos (`isEnriching = enriching && !loading && !n.enriched`). Prop nova `enriching?: boolean` default `false` → card sem a prop = **idêntico a hoje** (zero risco em prod). Ligado no call-site de Leads forward-compatible (acende sozinho quando o backend surfacer `enrichmentStatus: pending/partial`). Arquivos: `detalhes-negocio.tsx`, `kit.css`, `transitions.css`, `leads/page.client.tsx` — **146 add / 4 del, sem hex solto** (verificado no diff). Checks: **typecheck VERDE (0)**, build Next verde. **check-pele:** 14 violações são PRÉ-EXISTENTES em `bot-builder/screens/whatsapp.css` (W2 não tocou — diff vazio nesses); nenhuma nos 4 arquivos de W2. Doc: [20-frontend-card-enriquecendo.md](20-frontend-card-enriquecendo.md).
- **Débito pré-existente detectado:** `check-pele` reprova 14 hex/rgba soltos em `bot-builder.css`/`screens.css`/`whatsapp.css` (não desta sessão). Não bloqueia o build Next, mas fura a Lei do Design System — candidato a faxina separada.
- W3: **✅ ACEITO** (verificado pelo orquestrador). Nó 🧠 Cérebro IA (30B local / 7B VPS) inserido, degrada honesto sem heartbeat (idle "aguardando túnel/heartbeat PR4"). 4 nós re-narrados. **Fix de brinde:** `index.html` estava com DOM single-column (`#tree-flow`) enquanto `tree.js` já era split-screen → columns não renderizariam; W3 alinhou o DOM ao contrato split-screen (decisão travada do dono). Checks: `node -c` verde, 13 ações intactas, `.tree-split`+brain CSS com tokens de tema (sem hex solto), cache-bust `t5`. Doc: [30-arvore-3107-nova.md](30-arvore-3107-nova.md).
