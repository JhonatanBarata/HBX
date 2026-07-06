# RESULTADO CHIP E2 — :3107 vira o cockpit do Cérebro 30B (05-06/07/2026)

**Status: CONCLUÍDO.** O painel :3107 (HBX Owner) agora mostra o worker da ponte (CHIP E1) como um
cockpit real: modelo residente/frio, fila, throughput, últimos N jobs, disjuntor em vermelho com o
motivo, e o "aquecimento elástico VISÍVEL" que o dono pediu — o painel explica O PORQUÊ de cada
estado (fila com trabalho → aquecendo; usuário logado → cedendo a vez; fila vazia → ocioso). Os 3
consertos do PLANO §3 foram aplicados (tag da allowlist, msg "~12min"→"~2min", 7b fora do warm).
Validado AO VIVO com o 30B real (não mock) numa instância isolada (porta 3108), sem tocar no
processo do dono (:3107, PID 11020) nem no VPS/WhatsApp/backend. Testes existentes (47/47)
seguem verdes — nenhuma lógica pura nova foi criada no `lib/` (E2 é composição/apresentação em
cima do `status()` que o E1 já expõe).

## TL;DR

O gauge lê `GET /owner/ponte/status` (a mesma rota que o E1 já tinha exposto) e mostra: pill de
estado (desligado/frio/residente/disjuntor), 8 métricas (modelo, fila, usuários ativos,
throughput, leaseados, concluídos, falhados, cold-loads), um "verdict" com o motivo textual do
estado atual (`lastReason` do worker), um banner vermelho quando o disjuntor abre (com botão
"Rearmar"), e uma tabela dos últimos 10 jobs (tipo, ok/fail, latência, nota do erro). 3 botões:
Aquecer / Descarregar / Rearmar disjuntor (só aparece com o circuito aberto). Todos os 6 estados
centrais do pedido foram reproduzidos AO VIVO contra o 30B real (não simulados na cabeça):
desligado, residente+processando, ocioso, frio/aquecendo, cedendo a vez (freia), disjuntor
aberto+rearme.

## 1. Os 3 consertos do PLANO §3 (server.js)

| Antes | Depois | Por quê |
|---|---|---|
| `AI_MODEL_30B = "qwen3:30b-a3b"` | `"qwen3:30b-a3b-instruct-2507-q4_K_M"` | tag velha nunca batia no `/api/tags` real (`readAiStatus().has30b`/`warm30b` sempre dependiam do `find()` com prefixo, mas a allowlist do `/owner/ai/warm` comparava **igualdade exata** — o botão "Aquecer 30b" da seção IA LOCAL preexistente rejeitava silenciosamente a tag certa antes desta correção) |
| `AI_MODEL_ALLOWLIST` continha `qwen2.5:7b` | 7b REMOVIDO da allowlist | PLANO §1: "7b MORTO em todo lugar… Não puxar 7b em lugar nenhum". `has7b`/`warm7b` do `readAiStatus()` continuam existindo (leitura informativa — achado da memória "7b/3b órfãos em disco, 6,6GB"), mas não decidem nada e não aquecem |
| msg `"o 30B leva ~12min em CPU"` | `"cold-load capado leva ~2min em CPU (T1/T2: 104-132s)"` | T1 mediu 114,3s, T2 mediu 104,3s/132,0s — a msg de "12min" era do cold-load SEM cap de ctx (swap-morte, §3.1 do plano), não do regime real |
| `/owner/ai/warm` chamava `options:{num_predict:1}` **sem `num_ctx`** | `options:{num_predict:1, num_ctx:8192}` (`PONTE_NUM_CTX_WARM`) | achado extra durante a implementação: o botão "Aquecer 30b" pré-existente (seção IA LOCAL) era o **único lugar do painel que ainda não capava `num_ctx`** — o worker da ponte (E1) já capava desde sempre. Sem o cap, esse botão manual teria acionado exatamente o GOTCHA #1 do plano (default 262k → ~45,7GB KV) se clicado. Corrigido por consistência/segurança, não pedido explicitamente no texto do E2 mas coberto por "consertos mapeados no plano §3" |

Verificado por chamada HTTP direta (instância de teste, allowlist real):
```
POST /owner/ai/warm {"model":"qwen3:30b-a3b"}                          → modelo_nao_permitido (tag velha, correto)
POST /owner/ai/warm {"model":"qwen2.5:7b"}                             → modelo_nao_permitido (7b morto, correto)
POST /owner/ai/warm {"model":"qwen3:30b-a3b-instruct-2507-q4_K_M"}     → ok:true, mensagem corrigida, respondeu em 39ms (fire-and-forget confirmado)
```

O `web/app.js` (botão "🔥 Aquecer 30b" da seção IA LOCAL pré-existente) também foi atualizado para
mandar a tag nova (`aiWarmClick()`), senão o próprio botão do painel teria continuado batendo na
tag rejeitada depois da correção da allowlist.

## 2. O gauge novo (`web/index.html` + `web/app.js`)

Seção `#cerebro-30b` inserida logo abaixo de "IA LOCAL · Ollama" (mesma coluna local do OWNERV2).
100% em cima de tokens/classes que já existiam no `styles.css` — nenhum CSS novo foi escrito
(`.pill`/`.pill-ok`/`.pill-bad`/`.pill-amber`, `.verdict-line` + variantes `.ok`/`.tight`/`.buy`,
`.cockpit-table`, `.btn-blue`/`.btn-amber`/`.btn-red`, `.hidden`, `.grid-4`, `.metric`).

`ponteRender()` (novo, `app.js`) lê `GET /owner/ponte/status` a cada 8s (`setInterval`) + 1x no
boot, e faz **só apresentação** — nenhum cálculo de estado novo (`decideNextAction` já existe no
worker desde o E1; o painel só formata `lastAction`/`lastReason`/`totals`/`lastJobs` que o
`status()` já devolvia). Throughput é uma extrapolação informativa (`leads/hora` a partir da
latência média dos últimos jobs OK) — rotulado "(últimos jobs)" para não parecer meta (decisão do
dono 05/07, PLANO §7 item 4: sem meta).

Degradação: se `/owner/ponte/status` não existir (server.js antigo ainda no ar, pré-E1) ou o
worker não tiver rodado nenhum ciclo, o painel mostra "sem leitura" / "Aguardando 1º ciclo…" — não
trava o resto da tela (mesmo padrão do `readAiStatus`/`treeCardsRender` já existentes).

## 3. Validação AO VIVO — os 6 estados, com dados reais do 30B

Rodei uma instância **isolada** do local-agent (`HBX_OWNER_LOCAL_AGENT_PORT=3108`,
`HBX_OWNER_LOCAL_TOKEN` próprio) para não tocar no processo do dono (:3107, PID 11020, que está
numa versão pré-E1 do server.js — ver §5). Para os estados que dependem do worker processando de
verdade, usei um backend FAKE minúsculo (`scratchpad/e2-fake-backend/fake-backend.js`, Node puro,
só implementa o contrato `lease/heartbeat/complete/fail`) — o **Ollama é o 30B real** em todos os
casos (nenhuma chamada ao modelo foi mockada). Isso evita subir o NestJS inteiro (mesma preocupação
de RAM que o T2 §4.3 registrou) enquanto ainda exercita o worker de produção de ponta a ponta.

| # | Estado | Como reproduzi | O que o painel mostrou |
|---|---|---|---|
| 1 | **Desligado (flag OFF)** | `HBX_PONTE_WORKER_ENABLED=off` (default) | pill cinza "desligado (flag OFF)", verdict "Worker desligado — HBX_PONTE_WORKER_ENABLED não está ligado — a fila espera no VPS/backend (estado, não erro)" |
| 2 | **Residente (quente) + processando** | worker ON, fake backend devolvendo missões `xray_note` reais | pill verde "residente (quente)", verdict "✓ processando — fila com trabalho e ninguém ativo — processando", throughput "~440-463/h (p50 7.8-8.2s, n=3-6)" — **latências reais do 30B**: 6.6s/7.3s/7.9s/8.1s/8.3s/8.4s, mesmo bairro do p50 7.285ms/p95 8.800ms do T1 |
| 3 | **Ocioso** | fake backend esgota as missões (fila chega a 0) | pill continua "residente" mas verdict muda pra "• ocioso — fila vazia — nada a processar"; leaseados=6/concluídos=6/falhados=0 |
| 4 | **Frio + aquecendo** | descarreguei o 30B (`unload`) e reiniciei o worker com fila não-vazia | pill âmbar "frio (descarregado)", verdict âmbar "• aquecendo — 30B frio — aquecer antes de leasear (lei anti-swap)"; warm-check real levou a instância pro estado "work" ~1min45s depois (mesmo bairro dos 104-132s medidos por T1/T2) |
| 5 | **Cedendo a vez (freia)** | fake backend simulando `activity.activeUsers=2` | pill âmbar "frio (descarregado)" (correto — nunca chegou a aquecer, pois freia acontece ANTES do warm-check), verdict âmbar "• cedendo a vez — cedendo a vez — 2 usuário(s) ativo(s)", fila (pendentes)=12, usuários ativos=2 |
| 6 | **Disjuntor aberto + Rearmar** | fake backend rejeitando `complete` (`{ok:false}`), `HBX_PONTE_MAX_CONSECUTIVE_FAILURES=2` | pill vermelha "disjuntor aberto", banner vermelho "✕ DISJUNTOR ABERTO — teto de 2 falhas consecutivas — worker PARADO, requer intervenção", botão "⟲ Rearmar disjuntor" aparece (`hidden` toggled certo); clicar nele fechou o circuito (pill voltou a "residente"); como a causa simulada continuava ativa, o circuito **reabriu sozinho** 2 falhas depois — comportamento correto (o reset não corrige a causa raiz, só reabilita) |

Botão **Descarregar** testado via clique real no painel + confirmação por API
(`totals.unloads` incrementou de 0→2 nas duas chamadas). Botão **Aquecer** (da ponte) e o preexistente
**Aquecer 30b** (seção IA LOCAL) testados via API com a tag nova — ambos aceitam, ambos rejeitam a
tag velha e o 7b.

### Nota sobre "não forçar aquecimento só pra print"
A missão pedia não forçar aquecimento se a máquina estivesse carregada. Na hora de validar, o 30B
estava FRIO de verdade (ninguém tinha usado desde o T2) — o primeiro print (estado 1, worker
desligado) captura esse frio legítimo. Os warm-checks que rodaram depois (estados 4 e 6) foram
**consequência do teste do worker ligado** (que já ia acontecer pelo próprio fluxo elástico), não
aquecimentos forçados isolados — e ao final da sessão o 30B foi descarregado de novo
(`keep_alive:0` via `/api/generate`), devolvendo a RAM (~19GB) à máquina do dono, mesma prática que
o T2 registrou.

## 4. Interlock informativo (worker OFF = estado, não erro)

Coberto pelo mesmo ramo que trata "desligado": quando `p.enabled` é falso, o verdict imprime
"Worker desligado… a fila espera no VPS/backend (estado, não erro)" em vez de qualquer cor de
alarme — a pill fica cinza (`pill-muted`), não vermelha. Falhas de REDE no lease (backend/VPS fora)
também não pintam a pill de vermelho: aparecem só no rodapé (`#ponte-feedback`, "último aviso: …"),
coerente com a distinção que o E1 já fazia entre falha de rede (backoff) e falha de missão
(disjuntor) — o painel não inventou uma categoria nova, só refletiu a que já existia.

## 5. Achado: o processo do dono em :3107 está numa versão PRÉ-E1

Ao investigar antes de mexer em qualquer coisa, descobri que o processo já rodando em `:3107`
(PID 11020) responde `"Endpoint nao encontrado"` para `/owner/ponte/status` — ou seja, está
rodando um `server.js` de antes do commit `0c295397` (E1), mesmo o working tree já tendo o E1+E2
prontos (`git status` limpo, HEAD em cima do E1). **Não reiniciei esse processo** (não foi pedido,
e reiniciar o painel do dono sem aviso não é uma decisão minha) — toda a validação deste chip
rodou numa instância isolada (porta 3108). **Para o dono ver o cockpit novo no :3107 real, o
local-agent precisa ser reiniciado** (`Ctrl+C` + `node server.js`, ou re-rodar
`start-owner.ps1`) — isso não é destrutivo (mesmo padrão de start idempotente que o script já tem),
mas decidi não fazer sozinho porque é o processo do dono, ao vivo, fora do escopo desta missão
(que era "código + validação", não "publicar/reiniciar produção local").

## 6. Decisões tomadas sozinho (declaradas, não escondidas)

1. **Capei `num_ctx` no botão "Aquecer 30b" pré-existente** (`/owner/ai/warm`), que não estava no
   pedido literal do E2 mas é claramente coberto por "consertos mapeados no plano §3" — sem o cap,
   esse botão manual (que já existia antes do E1/E2) dispararia o GOTCHA #1 do plano na próxima vez
   que alguém clicasse nele.
2. **Mantive `has7b`/`warm7b` no `readAiStatus()`** como leitura informativa (não removido do
   payload), só desacoplado da allowlist de warm — decisão de manter visibilidade sobre o "7b
   órfão em disco" que a própria memória já registra como achado pendente, sem reviver o 7b em
   nenhum fluxo de decisão/aquecimento.
3. **Throughput é informativo, não meta** — rotulado "(últimos jobs)" e calculado só a partir da
   amostra pequena e recente (`lastJobs`, até 20 entradas), nunca uma projeção de "leads/noite"
   (isso já foi decidido como SEM META pelo dono, PLANO §7 item 4; o T2 tem a conta de
   dimensionamento formal se precisar).
4. **Validação usou backend FAKE, não o NestJS real** — mesma decisão que o E1 tomou no Degrau 1
   (harness fiel), pela mesma razão (T2 §4.3: cold-load competindo com serviços pesados é risco de
   RAM real). O Ollama nunca foi mockado — todas as latências reportadas na tabela acima são
   chamadas reais ao `qwen3:30b-a3b-instruct-2507-q4_K_M`.
5. **Não reiniciei o processo `:3107` do dono** (PID 11020, versão pré-E1) — decisão de não tocar
   em processo ao vivo que não criei sem necessidade estrita da missão; documentado no §5 para o
   dono decidir quando reiniciar.
6. **Não criei testes novos em `lib/`** — o E2 não introduziu lógica pura nova (é composição sobre
   o `status()` que o E1 já expõe e já testou com 17 casos); as funções de formatação do `app.js`
   (`ponteFmtMs`, `ponteFmtAgo`, `ponteThroughputLabel`) seguem o padrão do resto do arquivo
   (vanilla, sem harness de teste de DOM/browser no projeto — nenhuma outra função de apresentação
   do `app.js`, como `xrayStatusPillClass`, tem teste isolado). A cobertura real ficou na validação
   HTTP ao vivo (6 estados, 30B real) descrita no §3.
7. **Não toquei VPS, WhatsApp, `backend/`, não criei branch, não publiquei** — conforme restrição
   da missão.

## 7. Checks

- **Suíte do local-agent** (`node --test test/**/*.test.js`): **47/47 verde**, antes e depois das
  edições (nenhuma regressão; nenhum teste novo necessário — ver decisão §6.6).
- **Sintaxe**: `node --check server.js` e `node --check web/app.js` — ambos OK.
- **Allowlist funcional**: tag velha (`qwen3:30b-a3b`) e 7b (`qwen2.5:7b`) rejeitados por
  `/owner/ai/warm`; tag real (`qwen3:30b-a3b-instruct-2507-q4_K_M`) aceita — verificado por chamada
  HTTP direta contra instância isolada.
- **6 estados do gauge validados AO VIVO** contra o 30B real (§3): desligado, residente+processando,
  ocioso, frio+aquecendo, freia (cedendo a vez), disjuntor aberto+rearme.
- **Botões testados de verdade**: Aquecer (ponte + IA LOCAL), Descarregar (clique real no painel +
  API), Rearmar disjuntor (clique real, fechou e depois reabriu sozinho quando a causa persistiu —
  comportamento correto, não bug).
- **Limpeza**: processos de teste (instância :3108, fake-backend :3999) encerrados; 30B descarregado
  da RAM ao final (`keep_alive:0`); processo do dono (:3107, PID 11020) intacto, nunca tocado.

## 8. Arquivos

Tocados:
- `hbx-owner/local-agent/server.js` — allowlist com a tag real (só 30B), 7b fora do warm (mantido
  como leitura informativa em `readAiStatus`), msg "~12min"→"~2min", `num_ctx` capado no
  `/owner/ai/warm`.
- `hbx-owner/local-agent/web/index.html` — seção nova `#cerebro-30b` (gauge, botões, tabela de
  jobs) logo abaixo de "IA LOCAL · Ollama"; tooltip do botão preexistente atualizado.
- `hbx-owner/local-agent/web/app.js` — `ponteRender()` + `ponteRenderCircuit()` +
  `ponteRenderJobs()` + `ponteThroughputLabel()` + `ponteFmtMs()`/`ponteFmtAgo()` (formatação),
  `ponteWarmClick()`/`ponteUnloadClick()`/`ponteResetClick()` (ações), listeners registrados,
  `setInterval(ponteRender, 8000)`; tag do botão "Aquecer 30b" pré-existente corrigida.

Novos (fora do código de produção, só ferramenta de validação desta sessão):
- `scratchpad/e2-fake-backend/fake-backend.js` — backend HTTP fake (Node puro) simulando o
  contrato de missões pra exercitar os 6 estados do painel contra o 30B real sem subir o NestJS.

Dado bruto da validação (prints, logs, respostas HTTP cruas): sessão do CHIP E2, scratchpad em
`C:\Users\Jhonatan\AppData\Local\Temp\claude\C--Users-Jhonatan-Desktop-App\3b59c3d8-a6f3-488d-8a64-39ca88627ffc\scratchpad\e2-fake-backend\`
(⚠️ scratchpad é de sessão — este doc carrega os números e a descrição de cada estado que a
decisão do dono precisa).
