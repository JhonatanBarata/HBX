# PR28072026 — RADAR REFUNDAÇÃO

> Pedido do dono (28/07): "solução completa, nem que seja shift-delete". Análise feita em cima do
> código atual (master `12da4874` + tree da sessão paralela), das memórias do incidente 28/07 e das
> duas sessões de análise ("Webscraping radar filtros e erros" e "Pesquisa de empresas com webscraping").

## VEREDITO: demolição PARCIAL, não shift-delete

O motor tem um **kernel bom e caro de reconstruir** (RFB 28M no ar, pool/governor de motores com
elasticidade, SourceBudget fail-closed, LeadContact com gate anti-alucinação, pump server-side de
runs com auto-requeue). Jogar isso fora seria queimar 1 mês de trabalho que FUNCIONA.

O que está podre — e explica TODOS os sintomas do dono — são **3 camadas em volta do kernel**:

1. **A orquestração vive no navegador** (erro-mãe).
2. **O segmento do card é o carimbo da BUSCA, não o fato da EMPRESA.**
3. **A ordem do dinheiro está invertida** (pago primeiro, gasto na vitrine).

Demolir essas 3. Manter o kernel. Detalhe abaixo.

---

## OS 6 ERROS DE ARQUITETURA (com prova)

### E1 — Orquestração no navegador (erro-mãe) 🔴
A fila multi-cidade é um loop React dentro de `frontend/src/app/(app)/leads/page.client.tsx`
(3.358 linhas; `queueActiveRef`, serialização no cliente, ~linha 1671: "O backend continua
recebendo uma cidade por execução"). Consequências diretas:
- **Sair da tela = fila morre.** O componente desmonta, o loop morre, as cidades pendentes somem.
  Voltar pra tela re-hidrata só o "último run" (`search-runs/latest`) → estado quebrado → "buga a
  tela". É exatamente o "mais morto que o Silvio Santos".
- **F5/deploy/aba fechada = mesma morte.** O incidente das 645 runs (28/07) é filho disso: o front
  antigo disparava POST por cidade sem esperar; o fix de 12:01 (`22a7c4ac`) serializou NO CLIENTE —
  tapou o sintoma, a doença (fila no browser) continua.
- O backend JÁ tem um executor decente (`processNextQueuedSearchRun` no search-loop mixin: claim
  atômico, stale-requeue, retry) — mas ele só processa runs de UMA cidade. O conceito "o trabalho
  que o vendedor pediu" (N cidades, 1 segmento, teto de leads) **não existe em lugar nenhum do servidor**.

### E2 — Segmento = carimbo da busca, não fato da empresa 🔴
"Distribuidor de água" devolvendo imobiliária/igreja/partido tem 3 causas empilhadas:
- Match por OR de substring no `searchText` da RFB — **parcialmente corrigido hoje** (`979195de`:
  todas as palavras + palavra inteira + cidade fora do texto).
- **O card herda o segmento DA BUSCA**, não do CNAE real. "EDR Imobiliária" carimbada
  "distribuidora de água" na vitrine mesmo depois do fix — a sessão paralela está soldando
  `businessCategory` do candidato → card agora.
- **Lane web sem porta de realidade**: em cidade pequena o motor devolve lixo global (eBay, CBS
  Sports, Climatempo, Buser como "leads" em Zacarias) e a página de diretório vira lead. O gate
  atual (`radar-web-source-gate` + quality-gate) filtra formato, não filtra "essa empresa EXISTE
  nessa cidade nesse ramo?" — sendo que a resposta está do lado, na RFB 28M.

### E3 — Ordem do dinheiro invertida 🔴
Confirmado vivo em `radar-web-enrichment.service.ts` `searchWeb()` (~linha 1036): **Brave (pago)
é a PRIMEIRA fonte de toda query web**; bing/ddg são fallback. ddg e searxng = **0 chamadas no mês**
(bing sempre devolve algo). Brave 900/900 estourado. E o gatilho do gasto é a **prateleira**
(enrichment automático de todo card aprovado, até 4 queries/lead + perfil do sócio — dono puxou 7,
sistema enriqueceu ~240 no dia). O dinheiro é gasto na vitrine, não na venda — o inverso do
princípio track-first que já rege o crédito.

### E4 — Social por chute 🟡
`probeInstagramProfile` monta slug pelo nome e testa; merge herdava "social found" de resultado cuja
URL nem entrou. Resultado: handle inventado no card = pior que campo vazio (vendedor confia e erra).
**Em conserto AGORA na sessão paralela** (carimbo segue o link; sem URL = missing/0).

### E5 — Não existe "status vivo" nem freio de sessão 🔴
- `targetQuantity` por run funciona (para no alvo), mas **não existe teto do TRABALHO** ("ache 100
  no total dessas 8 cidades e me espera") — o freio "não sair procurando igual retardado" não tem
  onde morar hoje.
- O status global é o shell fazendo poll de `search-runs/latest` — reflete o ÚLTIMO run, não o
  trabalho. Pausado/retomando/2ª-de-5-cidades: invisível.
- O poll do front não distingue "servidor atualizando" (502 de deploy) de "busca falhou" — o
  publish de 13:45 virou "parou sozinho" na cara do dono.

### E6 — Monólito de mixins 🟡
`radar-core` é UMA classe montada por mixins gigantes: presentation 4.067 linhas, delivery 3.874,
shared 2.183, search-loop 1.599... 56 mil linhas no módulo. Efeitos reais: sessões Claude colidem
nos mesmos arquivos (guerra 27/07), `tx: any` já engoliu erro de Prisma em prod, e qualquer mudança
pequena exige entender um arquivo de 4 mil linhas. Não é o incêndio de hoje, mas é por que TODA
semana tem "refatoração número 1 milhão".

## O QUE FICA DE PÉ (proibido demolir)
- **RFB 28M** + `CnpjPublicDataset/BaseQuery` (fonte de verdade de existência/CNAE).
- **Engine pool + governor + elasticidade** (a "anarquia de motores" que o dono vê é o front
  mentindo estado — o pool em si tem lease atômico, cooldown, boot-heal comprovados).
- **SourceBudget** (pago fail-closed) e **LeadContact + gate anti-alucinação**.
- **Pump de runs** com stale-requeue — vira o executor da Sessão (F1), não se reescreve.

---

## O PLANO — 6 FRENTES

### F1 — `RadarSearchSession`: o trabalho vira cidadão do SERVIDOR (backbone) 🔴
Nova tabela (nome final a gosto):
```
RadarSearchSession {
  id, companyId, userId
  segment, filtrosJson            // 1 segmento por sessão
  citiesJson: [{city, state, status, runId?, foundCount}]  // cursor = 1º não-terminal
  targetTotal      // teto do TRABALHO (ex.: 100) — soma entregue nas cidades
  pauseAfterLeads  // freio: pausa a sessão a cada N entregues, espera o vendedor
  status: running | paused_by_target | paused_by_quota | completed | canceled
  deliveredCount, startedAt, finishedAt, updatedAt
}
```
- POST cria a sessão; um **reconciler server-side** (mesmo padrão do pump atual) cria 1 run por
  cidade EM SÉRIE, avança o cursor quando o run fecha, pausa quando `deliveredCount ≥ pauseAfterLeads`,
  completa quando `targetTotal` ou cidades acabam. Sobrevive a F5, logout, deploy e restart
  (o stale-requeue já cura o run do meio; o reconciler cura a sessão).
- Endpoints: `POST /radar/sessions` (cities[] — morre o loop no front), `GET /radar/sessions/active`
  (progresso agregado: cidade 3/8, 42/100 leads, estado), `POST :id/pause|resume|cancel`.
  Cancel cancela sessão + run vivo (1 clique, 1 alvo).
- Guard-rails que entram JUNTO: teto de criação de runs/min por empresa (nunca mais 645);
  `statement_timeout` nas queries de reconciliação RFB (família pool-storm, pendente desde 23/07).
- **Dono controla sozinho**: `pauseAfterLeads` e `targetTotal` são campos do formulário de busca,
  com default sensato (ex.: pausa a cada 30) — não env, não flag.

### F2 — Front vira ESPECTADOR 🔴
- `leads/page.client.tsx`: **deletar a fila cliente inteira** (queueActiveRef/token/loop). A tela
  passa a: (a) POST da sessão; (b) poll de `sessions/active`; (c) render. Voltar pra tela =
  1 GET re-hidrata TUDO (sessão, cidade atual, itens ao vivo) — mata o "buga a tela" na raiz.
- Chip de status global no shell (o poll do shell já existe — apontar pra sessão): "Radar: cidade
  3/8 · 42 leads · pausado — Continuar". O vendedor trabalha em outra tela e o Radar continua,
  visível, retomável. É o "vivo" que o dono pediu.
- Poll distingue 502/rede ("servidor atualizando…", mantém estado) de `failed` real (erro).
- Quebrar o arquivo de 3.358 linhas em 3 componentes (busca+sessão / vitrine / detalhe) — sem
  mudar visual, só cirurgia de arquivo (Leis do design system intactas).

### F3 — Verdade de segmento: CNAE-first + porta de realidade na lane web 🔴
- Card SEMPRE carrega `businessCategory` real (descrição do CNAE quando conhecido) e o motivo do
  match; a vitrine mostra a categoria REAL, nunca o texto digitado na busca. (Metade disso está
  em voo na sessão paralela — **fechar lá, não duplicar aqui**.)
- **Reconciliação web→RFB antes da prateleira**: candidato da lane web sem CNPJ tenta match
  nome+cidade na RFB 28M. Achou → herda CNAE/razão (e o segment-match decide com fato). Não achou →
  entra como "não confirmado" com categoria vazia — nunca com o carimbo da busca.
- Porta de realidade pro lixo global: blocklist de domínio (portais/notícia/e-commerce/TV) +
  exigência de sinal local (DDD da cidade OU cidade no conteúdo OU match RFB) em cidade <50k hab.
  Mata eBay/CBS Sports/Climatempo sem tocar no que funciona em capital.

### F4 — Dinheiro: cadeia invertida + pago-só-no-claim + SearXNG 🔴 (cirúrgica, pode sair primeiro)
- `searchWeb`: **bing → ddg → searxng → brave**. Brave vira REFINADOR (só quando grátis não fechou
  match E o lead justifica), com teto **diário** e **por run** além do mensal.
- **Pago só no CLAIM**: prateleira se contenta com HBX + grátis; Brave/BrasilAPI-premium rodam
  quando o cliente puxa o lead (7/dia, não 240/dia). Mesmo princípio track-first do crédito.
- **SearXNG self-host no VPS** (1 container no compose): buscador grátis ilimitado, já previsto no
  SourceBudget e nunca ligado. Maior retorno financeiro isolado do plano — derruba a dependência
  do Brave a quase zero.
- Cache de query persistente (tabela, não `Map` estático que morre no restart).
- **Painel /master**: gauge de uso por fonte + tetos EDITÁVEIS pelo dono (não env). Regra da casa:
  "o dono muda isso sozinho?" — hoje a resposta é não; passa a ser sim.

### F5 — Social honesto 🟡 (em voo na sessão paralela — fechar lá)
Regra única: **só grava social com URL verificada na fonte**; sem URL = campo vazio. Chute de slug
morre. Nada a fazer nesta frente aqui além de NÃO colidir com a outra sessão.

### F6 — Desmonte incremental do monólito 🟡 (contínuo, sem big-bang)
- O orquestrador de sessão (F1) já nasce **serviço Nest de verdade** (injetável, testável), fora
  dos mixins — é o modelo do desmonte.
- Regra de régua pra código novo: arquivo novo ≤ ~800 linhas; mixin não ganha método novo — método
  novo nasce em serviço; `tx` tipado sempre (lição 27/07).
- A cada frente que tocar um mixin, extrair o pedaço tocado (ex.: F2 força o presenter; F3 força o
  quality-enrichment). Em ~4 frentes o monólito emagrece sem nunca parar a produção.

---

## ORDEM DE EXECUÇÃO (proposta)

| Entrega | Frentes | Por quê primeiro |
|---|---|---|
| **1. Radar VIVO** | F1 + F2 | É a dor nº1 do produto (vendedor não consegue USAR). Mata "buga a tela", "morto", "sem status", "pausar e continuar" numa tacada. |
| **2. Dinheiro** | F4 | Cirúrgica e independente; Brave já está 900/900, todo dia sem isso é dinheiro/oportunidade queimada. Pode até sair antes da 1 se o dono preferir. |
| **3. Verdade** | F3 | Depende do que a sessão paralela fechar hoje (businessCategory + socials); completa com reconciliação web→RFB + porta de realidade. |
| contínuo | F5 (outra sessão) + F6 | — |

## COORDENAÇÃO E RISCOS
- **Sessão paralela ATIVA** ("Pesquisa de empresas com webscraping") editando
  `radar-segment-match.util.ts`, `radar-core-quality-enrichment.mixin.ts`, socials e testes.
  Regra: F3/F5 só começam depois que ela commitar; F1/F2/F4 não tocam nesses arquivos. Lote mínimo
  + commit imediato ([[guerra-de-sessoes-paralelas-add-a]]).
- Migration nova (RadarSearchSession) entra LIGADA na mesma entrega (regra entregar-ligado);
  rollback = sessão é aditiva, o caminho de 1 cidade continua existindo.
- Teste: repro local antes de publicar; fumaça na VPS só com pedido do dono ([[testar-no-vps]]).
