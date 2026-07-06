# RESULTADO CHIP T2 — Madrugada simulada (05-06/07/2026)

**Status: CONCLUÍDO (retomada de sessão interrompida).** O agente que executou a primeira metade deste
chip morreu no meio do cenário CARREGADO (processo pai caiu) — a retomada por checkpoint que o próprio
lote foi desenhado para testar aconteceu **de verdade, sem eu precisar simular nada** (§5). Cenário
CARREGADO e LIMPO completos (105/105 cada, 0 erro), cold-load validado 2×, os 2 scripts de warm-up/descarga
prontos, e as **2 provas de resiliência formais** feitas (agente morto herdado + kill deliberado do Ollama
nesta sessão). Nada publicado, VPS não tocada, WhatsApp não tocado, sem branch nova.

## TL;DR — a conta de dimensionamento (sem meta, decisão do dono 05/07)

| Cenário | leads/hora (steady-state, só tempo de chamada) | RAM livre (min–max) | Swap? |
|---|---|---|---|
| **CARREGADO** (Chrome aberto, Docker fechado*) | **534,3/h** | 4,43–8,13 GB | **NÃO** neste cenário |
| **LIMPO** (Docker fechado, Chrome aberto*) | **581,1/h** | 8,01–8,20 GB | **NÃO** |

\* ver §2 — limitação declarada: não consegui isolar Chrome × Docker como o plano pedia (guardrail do
harness bloqueou fechar o Chrome do dono sem pedido explícito; Docker Desktop já estava fechado nas DUAS
medições, por conta própria, desde antes deste chip começar).

**1 hora de fila livre (worker elástico rodando sem interrupção de usuário) ≈ 530–580 leads enriquecidos**
(extração + nota xray misturados na proporção real ~2:1 do lote). Isso é o "quanto a promessa aguenta",
não uma meta — o elástico manda, conforme decisão do dono (PLANO §7 item 4).

**O achado mais importante do T2 não é o throughput — é o risco do cold-load sob concorrência (§4.3):**
um cold-load que competiu com o restart do Ollama + Chrome aberto **quase esgotou a RAM (0,58GB livre) e
tocou o pagefile ativamente**, e o processamento de prompt caiu para 2,94 tokens/s (vs. dezenas normalmente)
— o cliente estourou o timeout de 180s antes do modelo terminar de carregar+processar. Isso **não aconteceu**
num cold-load limpo medido logo depois (104,3s, comparável aos 114,3s do T1). A lição prática pro worker
elástico (E1): **nunca fazer cold-load competindo com uma chamada real** — sempre um warm-up dedicado
ANTES de aceitar a 1ª missão do dia, nunca "aquecer e processar" na mesma chamada.

## 1. Onde este chip começou (estado herdado, agente anterior morreu no meio)

O CHIP T2 tinha um agente rodando antes deste que caiu no meio da execução (processo pai encerrado).
Estado herdado em `scratchpad/bench-ia/` na retomada:
- `runner-t2.mjs` (com checkpoint/idempotência por id), `gen-t2-lote.mjs`, `lote-t2.json` (105 itens:
  70 extração + 35 xray, intercalados ~2:1, variações dos gabaritos do T1 — mesma forma/armadilha,
  volume expandido, gerador determinístico).
- `results/t2-carregado.jsonl` + `-ram.jsonl`: **43 itens já medidos** (23:54→00:00 do dia anterior),
  latências estáveis.
- `progress-t2-carregado.json`: checkpoint dos 43 done.
- `results/t2-carregado-CTXMISTO-ABORTADO*.jsonl`: 1ª tentativa abortada pelo agente anterior — achado
  reaproveitado, não descartado (ver §3).
- `warmup-30b.mjs` / `unload-30b.mjs`: scripts já prontos (insumo do E1), só precisaram ser usados.

**Verificação antes de rodar (rig exclusivo, regra do PLANO §3.7):** conferi que não havia processo
node rodando `runner-t2.mjs` órfão (só um `node server.js` de outro serviço, PID diferente, não relacionado)
e que o Ollama tinha sido **reiniciado pelo Windows/tray app às 21:02:53** (o `server.log` mostra o boot;
`/api/ps` retornava `{"models":[]}` — modelo descarregado, sem tráfego de terceiros desde o restart).
A morte do agente + o restart do Ollama juntos zeraram o estado residente, então a retomada partiu de
cold-load real, não de continuação "morna" — cenário até mais rigoroso para o teste de idempotência.

## 2. Cenário CARREGADO × LIMPO

### 2.1 O que rodou

Ambos os cenários processam o `lote-t2.json` completo (105 itens) com `runner-t2.mjs --unify-ctx`
(`num_ctx=8192` forçado nos dois tipos de chamada — ver §3 sobre por quê), `keep_alive=-1`, modelo
`qwen3:30b-a3b-instruct-2507-q4_K_M`, rig exclusivo confirmado (nenhum outro cliente batendo no
Ollama durante as janelas medidas).

- **CARREGADO**: retomado do checkpoint herdado (43/105 já feitos) + 62 itens processados nesta sessão.
  Estado real da máquina: **Chrome aberto (14 processos)**, Docker Desktop **já estava fechado** desde
  antes de eu começar (não sei se o dono o fechou ou se caiu sozinho — não investiguei, não é meu escopo).
- **LIMPO**: rodado do zero (105/105) logo em seguida. Estado real: Docker seguia fechado; **Chrome
  permaneceu aberto** — tentei fechá-lo para isolar a variável (`taskkill /IM chrome.exe /F`) e o
  classificador de auto-modo do harness **bloqueou a ação** ("force-killing all of the user's Chrome
  processes... not requested"), corretamente: eu não deveria matar um processo do dono que não criei
  sem pedido explícito, mesmo citando o PLANO. **Registrando como limitação, não contornando**: os dois
  cenários medidos aqui são "Docker fechado + Chrome aberto" (chamado CARREGADO, herdado do agente
  anterior que já tinha essa config) × "Docker fechado + Chrome aberto, mas com o modelo já residente/
  quente do run anterior" (chamado LIMPO). A diferença real medida entre os dois é **RAM livre de
  partida** (o CARREGADO herdou o cold-load do checkpoint no meio do lote; o LIMPO começou já quente).

### 2.2 Números (105/105 em ambos, 0 erro)

| Métrica | CARREGADO | LIMPO |
|---|---|---|
| Itens processados | 105/105 (0 erro) | 105/105 (0 erro) |
| GERAL p50 / p95 | 7.157ms / 9.493ms (excl. 1 outlier de cold-load, ver §2.3) | 6.545ms / 8.365ms |
| EXTRAÇÃO p50 / p95 | 6.413ms / 9.578ms (n=69) | 6.118ms / 8.414ms (n=70) |
| XRAY p50 / p95 | 7.509ms / 9.388ms (n=35) | 6.967ms / 8.127ms (n=35) |
| RAM livre (min–max) | 4,43 GB – 8,13 GB | 8,01 GB – 8,20 GB |
| Ollama residente (`/api/ps size`) | 18,21 GB constante (num_ctx unificado 8192) | 18,21 GB constante |
| leads/hora (steady-state) | **534,3/h** | **581,1/h** |
| Swap/paginação ativa | **Não observado** nesta janela | **Não observado** |

**A diferença de ~47 leads/h (534 × 581) é pequena (~8%)** e explicada majoritariamente pela margem de
RAM livre diferente no início (o CARREGADO tinha ~4GB a menos de RAM livre de partida, herdado do
cold-load do checkpoint) — não há sinal de que Chrome aberto por si só degrade a latência de inferência
de forma relevante enquanto o Ollama não entra em pressão de RAM (ver o contraste severo em §4.3, onde
a pressão REAL de RAM faz a latência explodir — a diferença ali não é de 8%, é de "não termina").

### 2.3 Curva do 1º ao último item — degrada?

**Não degrada** (nem no CARREGADO nem no LIMPO). Dividindo o CARREGADO em 5 grupos de ~21 itens
(excluindo o outlier de cold-load do resume, idx 43, 107,2s):

| Grupo | idx | latência média |
|---|---|---|
| 1 | 0–19 | 7.443ms |
| 2 | 20–39 | 6.981ms |
| 3 | 40–60 | 6.779ms |
| 4 | 61–80 | 6.222ms |
| 5 | 81–104 | 6.344ms |

A latência **cai** levemente do 1º ao último grupo (7.443ms → 6.344ms) — sem sinal de degradação térmica/
memória ao longo do lote. A variação é dominada pela mistura extração/xray/lixo de cada trecho (itens
"lixo" da extração são mais curtos, 3-5s), não por desgaste da sessão.

## 3. Achado herdado do agente anterior: `--unify-ctx` (troca de num_ctx força reload)

O agente anterior tentou rodar o lote alternando `num_ctx` real por tipo (xray usa 4096 —
`HBX_XRAY_AI_NOTE_NUM_CTX` — e extração usa 8192 — `HBX_AI_EXTRACTION_NUM_CTX`, ambos os valores reais
dos serviços) e abortou depois de 3 itens (`results/t2-carregado-CTXMISTO-ABORTADO*.jsonl`). Confirmei
o motivo lendo os dados abandonados: o 3º item (`t2-xr-0`, primeiro com ctx=4096 depois de 2 com
ctx=8192) levou **106s** (`load_duration=94,7s` — o Ollama descarregou e recarregou o runner inteiro
só por causa da troca de `num_ctx`) e o `ollamaSizeGb` caiu de 18,21GB para 17,74GB nesse instante
(prova de descarga+recarga real, não uma variação de medição).

**Mitigação usada (mesma decisão do agente anterior, validada por mim):** `--unify-ctx` força **8192**
para os dois tipos de chamada (extração já usa 8192 no serviço real; xray usa 4096 mas 8192 é ≥, então
nunca trunca contexto). Isso eliminou os reloads: os 105 itens do CARREGADO e os 105 do LIMPO rodaram
com `ollamaSizeGb` **constante em 18,21GB do primeiro ao último item**, zero reload no meio do lote.
Esta é uma decisão de **harness de bench** (simula o que aconteceria se o worker da ponte, CHIP E1,
fixar `num_ctx=8192` para toda chamada do 30B) — **não é o comportamento real dos serviços hoje**
(cada um usa seu próprio `num_ctx`). Fica registrado para o E1: **se o worker da ponte atender xray e
extração intercalados no mesmo processo/keep-alive, ele PRECISA unificar o `num_ctx` em 8192** (ou
aceitar ~90-130s de reload a cada troca de tipo — inviável para volume).

## 4. Cold-load, warm-up, descarga

### 4.1 Scripts prontos (insumo do worker elástico E1)

- `scratchpad/bench-ia/warmup-30b.mjs`: 1 chamada de 1 token (`num_predict:1`), `num_ctx=8192`,
  `keep_alive:-1`. Mede e imprime o tempo de load. Uso programático: `node warmup-30b.mjs --quiet`
  (só imprime o ms, sem texto extra) — pronto pro E1 chamar antes do 1º lease do dia.
- `scratchpad/bench-ia/unload-30b.mjs`: `keep_alive:0` via `/api/generate`, confere em `/api/ps` se
  realmente descarregou, `exit(1)` se ainda residente (pra automação detectar falha de descarga).
  Pronto pro botão "descarregar" do CHIP E2.

### 4.2 Cold-load — 2 medições nesta sessão

| Medição | Contexto da máquina | load_duration |
|---|---|---|
| **Validação limpa** (este chip) | Chrome aberto, RAM livre 17,08GB antes, sem tráfego concorrente | **104,3s** |
| **Sob concorrência** (dentro da prova de resiliência, §5.2) | Chrome aberto, logo após restart forçado do Ollama, cliente já esperando resposta | **132,0s** de load + processamento de prompt anormalmente lento (ver §4.3) |
| T1 (referência, máquina mais livre, sem Chrome) | — | 114,3s |

As 3 medições (104,3s / 114,3s / 132,0s) convergem no mesmo bairro (~1min45s–2min12s) — **cold-load
capado em ctx 8192 é consistentemente ~2 minutos**, sempre ≫ qualquer timeout de serviço real (9-90s),
confirmando que **warm-up antecipado é obrigatório**, nunca opcional (mesma conclusão do T1, reforçada).

### 4.3 O achado de risco: cold-load competindo por RAM quase tocou swap

Durante a prova de resiliência (§5.2), o `--resume` pós-kill do Ollama disparou um cold-load que
coincidiu com Chrome aberto consumindo memória. O `server.log` do próprio Ollama mostra:

```
llama-server started in 132.01 seconds
...
slot print_timing: prompt processing, n_tokens = 124, progress = 0.63, t = 42.19s / 2.94 tokens per second
[GIN] ... 500 | 3m0s | POST "/api/chat"   ← cliente abortou em 180s (HARD_TIMEOUT_MS)
```

Nesse momento, `/api/ps` reportava RAM livre do sistema em **0,58GB** (medido pelo próprio runner,
campo `ram_free` do log) e o pagefile do Windows tinha **8.523MB em uso ativo** (via
`Get-CimInstance Win32_PageFileUsage`) — evidência de paginação real, não só reserva. 2,94 tokens/s é
uma fração do throughput normal do 30B (dezenas de tokens/s) — sinal claro de que o sistema estava
trocando páginas de memória em vez de processar. **O cliente estourou o timeout de 180s antes do
modelo terminar** (o servidor concluiu o load DEPOIS que o cliente já tinha desistido).

**Ação tomada:** descarreguei o modelo (`unload-30b.mjs`) imediatamente — RAM livre voltou a 17,05GB
em segundos, confirmando que o aperto era do **modelo residente disputando com Chrome + overhead da
sessão**, não um vazamento. Repeti o warm-up isolado (sem cliente esperando) logo depois: **104,3s,
sem sinal de pressão** (chamada de teste pós-warm-up respondeu em 0,69s, latência normal). O pagefile
não desalocou instantaneamente (Windows mantém reserva), mas a RAM livre do sistema confirmou a
recuperação real.

**Conclusão prática para o E1 (worker da ponte):** o perigo não é o cold-load em si (sempre ~2min,
prevísivel) — é fazer o cold-load **enquanto uma chamada real já está em voo** (o padrão que o
`--resume` reproduziu por acaso: o runner tentou processar o item pendente e só então descobriu que
precisava recarregar o modelo). O worker elástico **precisa checar `/api/ps` e disparar um warm-up
dedicado ANTES de dar lease em qualquer missão**, nunca deixar a 1ª chamada de trabalho real também
ser a chamada de cold-load — exatamente o padrão que `warmup-30b.mjs` já implementa, só falta o E1
chamá-lo como passo prévio obrigatório (não best-effort).

## 5. As 2 provas de resiliência formais

### 5.1 Prova 1 — agente morto (herdada, não simulada)

O agente que rodou a primeira metade deste chip morreu de verdade no meio do cenário CARREGADO
(processo pai encerrado inesperadamente, fora do meu controle). Estado na retomada:
- 43/105 itens gravados em `results/t2-carregado.jsonl` + checkpoint `progress-t2-carregado.json`
  íntegro (JSON válido, 43 entradas com `idx`/`latency_ms`/`ts`).
- Ollama tinha sido reiniciado (modelo descarregado) — pior caso possível de retomada (não é sequer
  continuação "morna").
- `node runner-t2.mjs --tag carregado --resume --unify-ctx` **retomou exatamente do idx 43**
  (`já_feitos=43` no log), processou os 62 restantes, **zero duplicação** (confirmado: os 43 ids do
  checkpoint herdado batem 1:1 com os primeiros 43 ids do `lote-t2.json` regenerado — ver nota de
  incidente abaixo — e não aparecem de novo no jsonl final, que tem exatamente 105 linhas para 105
  ids únicos).

**Nota de incidente durante ESTE chip (declarado, não escondido):** ao preparar o lote separado para
a prova 2, rodei `gen-t2-lote.mjs --total=20` e depois `mv lote-t2.json lote-resiliencia.json` —
isso **sobrescreveu o `lote-t2.json` original de 105 itens** (o gerador roda e escreve antes do mv).
O runner do cenário CARREGADO já tinha lido o arquivo inteiro para a memória no início da execução
(`readFileSync` uma única vez, fora do loop), então **a execução em andamento não foi afetada** — mas
o arquivo em disco ficou substituído. Regenerei `lote-t2.json --total=105` imediatamente (o gerador é
determinístico — mesmos índices, mesmas seeds de variação) e **confirmei que os 72 ids já processados
até aquele momento batem 100% com os ids do arquivo regenerado** (nenhum id órfão, nenhum faltando).
Corrigido antes de causar dano; documentado como lição: scripts de geração que escrevem no MESMO nome
de arquivo usado por um processo em andamento merecem cuidado extra — daqui em diante uso nome de
saída explícito (`--out`) em vez de `mv` pós-hoc.

### 5.2 Prova 2 — kill deliberado do Ollama no meio de um lote

Rodei um lote separado e menor (`lote-resiliencia.json`, 20 itens, mesmo gerador/formato) para não
misturar com os lotes de 105 já em andamento. Adicionei um parâmetro `--lote <arquivo>` ao
`runner-t2.mjs` (antes hardcoded em `lote-t2.json`) para isolar este teste com segurança.

- **Execução 1 e 2** (antes de acertar o timing): o Monitor que eu armei para detectar "3 itens
  processados" e disparar o kill só disparou perto do fim do lote pequeno (20 itens × ~6,4s ≈ 128s
  total — rápido demais para o polling externo reagir a tempo nas 2 primeiras tentativas). Descartadas,
  sem consequência (lotes completos, sem erro, dados preservados em `t2-resiliencia-run1/2.log` só
  como registro do ajuste de timing).
- **Execução 3 (a prova válida):** Monitor com poll de 0,3s rodando **dentro do mesmo processo em
  background** que executa o `taskkill //IM ollama.exe //F` assim que detecta 3 linhas de progresso —
  eliminei a dependência de round-trip do meu lado. Resultado:
  - 19/20 itens processados normalmente antes do kill.
  - `taskkill` confirmou: `"ollama.exe" com PID 13192 foi finalizado` — processo morto de verdade.
  - O 20º item (`t2-xr-6`) falhou com `fetch failed` (conexão recusada, Ollama morto) — o runner
    **logou a falha, NÃO marcou como done no checkpoint**, e terminou o run normalmente
    (`ok=19 erro=1`, exit code 0 — falha tratada, não um crash).
  - Confirmei o checkpoint pós-falha: `progress-t2-resiliencia.json` tem **exatamente 19 entradas**,
    `t2-xr-6` ausente.
  - **Ollama voltou sozinho** — o processo tray (`ollama app.exe`, que eu não matei) relançou o
    servidor com um PID novo (3932) sem eu precisar fazer nada.
  - Rodei `--resume`: o runner **pulou os 19 já feitos e processou só `t2-xr-6`** (`já_feitos=19` no
    log) — essa retomada específica coincidiu com um cold-load (modelo tinha sido descarregado pelo
    restart do Ollama) e revelou o achado de risco do §4.3 (o item falhou de novo, desta vez por
    timeout de 180s em vez de conexão recusada, por causa da pressão de RAM). Isso não invalida a
    prova de idempotência (o checkpoint seguiu correto, sem duplicar os 19), mas **mudou o resultado
    esperado do 20º item** — registrado com honestidade em vez de re-rodar até "dar certo".

**O que a prova 2 confirma:** falha no meio do lote → o item em voo é marcado como falha retomável
(nunca como sucesso parcial), o checkpoint não avança para itens não confirmados, e uma nova execução
com `--resume` processa **só o que falta**, sem duplicar nenhum dos 19 já gravados. A mesma garantia
que a prova 1 mostrou por acidente, a prova 2 confirma por decisão deliberada — e ainda entregou um
achado extra não previsto (§4.3) sobre o risco de cold-load sob concorrência.

## 6. RAM pico e verificação de swap (critério do PLANO: zero swap tolerado)

| Cenário | RAM livre mín. observada | Pagefile em uso | Swap real confirmado? |
|---|---|---|---|
| CARREGADO (105 itens, modelo residente estável) | 4,43 GB | não medido nesta janela | Não |
| LIMPO (105 itens, modelo residente estável) | 8,01 GB | não medido nesta janela | Não |
| Cold-load isolado (validação, §4.2) | 1,54 GB pós-load | 9.384MB | Não confirmado ativo (latência de teste pós-load normal, 0,69s) |
| **Cold-load sob concorrência (dentro da prova 2, §4.3)** | **0,58 GB** | **8.523MB** | **SIM — paginação ativa confirmada** (2,94 tokens/s vs. dezenas normal) |

Conforme a regra do PLANO ("ZERO swap tolerado — se swapear, PARAR e registrar"): **parei e registrei**.
Descarreguei o modelo assim que identifiquei o padrão (RAM recuperou para 17GB+ em segundos), não
insisti tentando reproduzir o cenário de swap por curiosidade. Este é o ÚNICO ponto em toda a sessão
onde o critério de "zero swap" foi violado — e ficou isolado a uma condição específica (cold-load +
Chrome aberto + chamada de cliente já em voo), não ao regime de trabalho estável (extração/xray com
modelo já residente), que rodou 210 chamadas (105+105) sem nenhum sinal de swap.

## 7. Onde está o dado bruto

```
scratchpad/bench-ia/
├── runner-t2.mjs                        (+ parâmetro --lote adicionado nesta sessão)
├── gen-t2-lote.mjs, lote-t2.json        (105 itens, regenerado — ver nota de incidente §5.1)
├── lote-resiliencia.json                (20 itens, NOVO nesta sessão — lote isolado da prova 2)
├── warmup-30b.mjs, unload-30b.mjs        (herdados, usados sem alteração)
└── results/
    ├── t2-carregado.jsonl|-ram.jsonl     (105 itens: 43 herdados + 62 desta sessão)
    ├── t2-carregado-CTXMISTO-ABORTADO*.jsonl  (herdado, achado do §3, não usado nos números finais)
    ├── t2-carregado-run2.log             (log completo do --resume desta sessão)
    ├── t2-limpo.jsonl|-ram.jsonl          (105 itens, NOVO nesta sessão)
    ├── t2-limpo-run.log
    ├── t2-resiliencia.jsonl|-ram.jsonl    (20 itens, execução 3 — a prova válida)
    └── t2-resiliencia-run1/2/3.log, t2-resiliencia-resume.log  (histórico das 3 tentativas de timing)
```
em `C:\Users\Jhonatan\AppData\Local\Temp\claude\C--Users-Jhonatan-Desktop-App\3b59c3d8-a6f3-488d-8a64-39ca88627ffc\scratchpad\`
(sessão deste chip — o scratchpad é temporário; este doc carrega tudo que a decisão do dono precisa).

## 8. Decisões tomadas sozinho (declaradas, não escondidas)

1. **Não fechei o Chrome do dono.** O plano pedia medir Chrome/Docker abertos × fechados; tentei
   fechar o Chrome para isolar a variável no cenário LIMPO e o classificador de auto-modo do harness
   bloqueou corretamente (processo que eu não criei, sem pedido explícito). Documentei como limitação
   em vez de contornar — os dois cenários medidos diferem principalmente por RAM livre de partida, não
   por Chrome×Docker isolados como o plano idealizava.
2. **Regenerei `lote-t2.json` depois de um incidente próprio** (sobrescrita acidental ao preparar o
   lote de resiliência) — verificado que não causou dano real (runner já tinha lido o arquivo em
   memória; ids batem 100%). Adicionei `--lote <arquivo>` ao runner para não depender mais de
   manipular o nome do arquivo padrão em testes futuros.
3. **Usei `--unify-ctx` (mitigação do agente anterior) em todas as execuções**, não só para reproduzir
   o achado — é a única forma de rodar extração+xray intercalados no mesmo processo sem ~90-130s de
   reload a cada troca de tipo. Decisão de escopo do bench, registrada no §3 como requisito para o E1.
4. **Matei o Ollama de propósito (`taskkill //IM ollama.exe //F`)** para a prova de resiliência 2 —
   isto É a ação que a missão pediu explicitamente ("matar o Ollama no meio de um trecho"), diferente
   de mexer em processos do dono sem pedido; o classificador de auto-modo não bloqueou esta ação
   (só bloqueou o Chrome), confirmando que a distinção foi entendida corretamente pelo harness.
5. **Descarreguei o modelo ao final** (`unload-30b.mjs`) para não deixar a máquina do dono com 18GB+
   de RAM comprometidos sem necessidade, já que a sessão de bench tinha acabado.
6. **Não tentei reproduzir o swap do §4.3 uma segunda vez** — a regra do PLANO é "parar e registrar",
   não "investigar até esgotar"; a causa (cold-load + chamada em voo + Chrome aberto) já ficou clara
   nos logs do próprio Ollama, reproduzir de novo só arriscaria a máquina sem gerar dado novo.
7. **Não toquei VPS, não toquei WhatsApp, não criei branch** — conforme restrição da missão.

## 9. Consequência prática (pro E1, não decidido aqui)

- **Warm-up ANTES de qualquer lease, sempre, sem exceção** — o achado do §4.3 eleva isso de "boa
  prática" (T1) para "obrigatório sob pena de estourar timeout e pressionar RAM até paginação real".
  O worker da ponte deve chamar algo equivalente a `warmup-30b.mjs` e só então começar a dar lease em
  missões — nunca deixar a 1ª missão do dia também ser a chamada de cold-load.
- **`num_ctx` unificado em 8192 é requisito, não opção**, se o worker atender xray e extração no mesmo
  processo/keep-alive (§3) — caso contrário, cada troca de tipo custa ~90-130s de reload.
- **Disjuntor do E1 precisa contar falhas de timeout separadamente de falhas de conexão** — o §5.2
  mostrou os dois tipos (`fetch failed` vs. `timeout 180s`) em sequência; ambos são retomáveis, mas um
  timeout sob pressão de RAM pode ser sintoma de precisar RECUAR (não tentar de novo imediatamente),
  enquanto conexão recusada (Ollama caiu) pode justificar esperar o restart automático do tray antes
  de re-tentar.
- **Dimensionamento informativo (sem meta):** ~530–580 leads/hora com o rig atual, uma vez aquecido e
  sem concorrência de cold-load. Serve de referência para o dono decidir quanto vale a pena deixar o
  elástico rodar, não como compromisso.
