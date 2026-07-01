# W3 — Árvore 3107 nova (a PONTE) — resultado

> LOCAL / working tree / reversível (`git checkout`). SEM publish, SEM VPS.
> Objetivo: a árvore do HBX Owner (:3107) refletir "como vai ser agora" — o pipeline-ponte
> do MASTER-PLANO — mantendo intacta a plumbing (split-screen · poll 12s · ações reais).

## Pipeline-alvo (do 00-MASTER-PLANO)
`Alvo/ICP → Receita (grátis, identidade) → Base rica (Places/Serper pago só p/ contato faltante) →
CÉREBRO IA (30B local batch / 7B VPS realtime — saneia · extrai · nota ICP · escreve msg) →
Validação WhatsApp → Card na ordem da nota ICP`

## Arquivos tocados (3)
- `hbx-owner/local-agent/web/tree.js` — 1 nó novo + re-narração de 4 nós + `renderBranch` ganha status `idle`.
- `hbx-owner/local-agent/web/tree.css` — bloco novo só do nó `data-stage="brain"` (tokens de tema, sem hex solto).
- `hbx-owner/local-agent/web/index.html` — cache-bust `?v=20260630t4` → `?v=20260701t5` (css + js).

## Nó NOVO — 🧠 Cérebro IA (a ponte)
Inserido **entre Enriquecimento (6) e Resultado (7)** — ordem final dos nós:
`infra → services → source → engines → factory → enrichment → **brain** → result`.

- Mostra os **2 modelos** como branches informativas:
  - **30B LOCAL · `qwen3:30b-a3b`** (batch pesado quando o PC está ON).
  - **7B VPS · `qwen2.5:7b`** (realtime do cliente + fallback quando o PC está OFF).
- Título: "Cérebro IA · saneia · extrai · nota ICP · escreve msg".
- **Sem botão/ação** — nenhuma rota nova no backend (regra do brief). Puramente informativo.

### Como degrada SEM heartbeat (o ponto crítico)
O túnel Tailscale + heartbeat **não existe** (PR4, sessão ao vivo). O nó **não inventa** endpoint nem métrica:
- Reaproveita só sinal JÁ buscado: `enrichR` de `GET /owner/enricher/status` (o enricher já fala com o Ollama
  p/ saneamento). Lê defensivamente `aiSaneamentoEnabled`/`aiEnabled`/`ai.enabled` e `aiModel`/`ai.model`
  com `firstDefined()` — se o campo não existir, cai no placeholder.
- **Sem sinal de modelo** → status do nó = `idle` (azul-ocioso, **nunca** `blocked` nem `ok` fantasiado) e nota
  honesta: **"Aguardando túnel/heartbeat (PR4): o roteador 30B↔7B ainda não está plugado — sessão conjunta ao vivo."**
  As 2 branches ficam `idle` → pill **"aguardando"** (não "atenção"/"erro").
- **Se houver sinal** (`aiSaneamentoEnabled === true`) → o modelo do lado renderizado vira `ok` e a nota mostra
  "Cérebro parcialmente ativo (saneamento IA ligado) · modelo em uso: …".
- `idle` (não `blocked`) de propósito: uma ponte ainda-não-plugada **não** deve cascatear `flow=stopped` no
  Resultado abaixo (a regra "1º blocked → resto stopped" continua valendo pros nós que realmente travam).

## Nós RE-NARRADOS (mesma plumbing, só título/nota/desc)
1. **🔎 Fonte de busca · grátis primeiro, pago só reforço** — deixa explícito "IP residencial = fonte grátis
   durável (não toma ban)"; Places/Serper renomeados "(reforço)" com desc "só no lead que passou no score,
   nunca metralhar buscador". No lado VPS a branch grátis explica que o motor LOCAL é quem busca pelo IP de casa.
2. **⚙️ Motores (frota) · puxa missão do VPS** — nota ganha a **ponte pull local↔VPS** (conceitual, sem endpoint):
   local = "puxa missão da fila do VPS pelo IP residencial e devolve enriquecimento (pull, nunca push)";
   VPS = "orquestra a fila; o motor LOCAL puxa as missões daqui".
3. **✨ Enriquecimento · base rica (contato)** — nota "coleta o contato bruto que o Cérebro IA (abaixo) vai sanear
   e pontuar"; Tipo 2 renomeado p/ "crawl pelo IP residencial via Local Lab".
4. **🎯 Resultado final · card na ordem da nota ICP** — nota "card pronto após validação WhatsApp, ordenado
   pela nota ICP".

Nenhum nó re-narrado perdeu métrica, ação ou toggle — só texto.

## Plumbing preservada (verificado)
- **Split-screen LOCAL×VPS** intacto: o nó novo entra via `nodes.push()` no MESMO loop por escopo, os dois lados
  renderizam (com a narrativa certa por `isVps`). `loadScope`/`loadTree`/`seq`/`safe()` não tocados.
- **Poll 12s** intacto (`startPoll`/`stopPoll` não tocados).
- **`dispatchAct`**: 13 cases originais, **nenhum removido** (o nó novo não tem ação, então não precisa de case).
- **Zero `getElementById` novo** — o nó renderiza por `nodes.push`→`renderNode`, sem novo id no HTML.
- Ações reais preservadas: engines-toggle, vps-engines-toggle, factory-toggle/next/purge, lab-toggle,
  enricher-toggle, result-reload, tree-token-save.

## Checks
- 🟢 `node -c hbx-owner/local-agent/web/tree.js` → **SYNTAX_OK** (rodado 2× após as edições).
- 🟢 `dispatchAct` cases (13) intactos; `getElementById` = só os pré-existentes; ordem dos `stage:` correta.
- 🟢 CSS novo usa só padrão `tree-node[data-stage=...]`/`tbranch` + rgba já usado no arquivo (sem hex "solto"
  fora do padrão existente; o arquivo inteiro já usa `rgba()` pontual pros realces de status — segui o mesmo).
- 🟡 Preview do Claude não confiável aqui — **não** rodei navegador; validação real = dono abre :3107 no Chrome.

## Riscos / notas
- Baixo. Tudo aditivo e reversível. O nó 🧠 nunca fica `blocked`, então não pode "travar" a árvore visualmente.
- Se o `/owner/enricher/status` um dia expuser campos de IA com OUTRO nome, o nó só deixa de mostrar o "ativo"
  e continua no placeholder honesto — degradação segura, sem erro.
- Cache-bust bumpado (`t5`) p/ o Chrome do dono pegar css/js novos sem hard-refresh.

## Como o dono testa
1. Abrir **http://127.0.0.1:3107/** no Chrome, aba **"Árvore HBX"**.
2. Ver as **2 colunas** (LOCAL esquerda × VPS direita) carregando lado a lado (split-screen intacto).
3. Rolar até o novo nó **🧠 Cérebro IA** (entre Enriquecimento e Resultado): deve mostrar as 2 branches
   (30B LOCAL / 7B VPS) com pill **"aguardando"** e a nota **"Aguardando túnel/heartbeat (PR4)"** — porque o
   heartbeat ainda não existe. Isso é o comportamento correto (degradação honesta), não um bug.
4. Conferir que os botões antigos (motores, fábrica, enricher, lab, reler contagem, salvar token) seguem
   funcionando normalmente.
