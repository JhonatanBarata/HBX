# PR29072026 — RADAR ESTABILIZAÇÃO: por que "resolve um, cai outro" — e como parar

> **STATUS 29/07 (go executado, commits locais, SEM publish):**
> **E1 ✅** `348651c3` — tela aceita sessão terminal (janela 30min), filtro não apaga mais
> resultado (vira aviso "Resultado desatualizado"), botão "Mostrar leads disponíveis" no vazio.
> **E2 ✅ (interruptor)** `d5d914e1` — `segment_mismatch` BLOQUEIA na lane web; Receita isenta.
> Pendente do E2: bloco visível "Fora do segmento (N)" (reprovado novo não é persistido hoje;
> precisa decidir storage antes de UI).
> **E4 ✅ (torneira a)** `d5d914e1` — cidade na URL não é mais sinal local. Torneira (b)
> (exceção canal-próprio) ADIADA COM JUSTIFICATIVA: com E2 ligado o dano observado dela é
> zero (o caso solutudo era fora-de-segmento); fechar exige reordenar reconcile↔evaluate —
> só com caso falho real (que vira fixture primeiro).
> **E3 lote 1 ✅** `1eeaf9ca` — âncora por fone exige nome compatível (caso Mirão morto).
> Pendente do E3: cidade por evidência (matar o carimbo — o card de Campinas com DDD 19
> ainda passa) e sanidade anti-menu no nome extraído.
> **E5 parcial** — 12 regressões novas com os casos reais nos gates/reconcile; falta o
> replay coleta→apresentação de ponta a ponta como suíte do publish.
> Suítes: gates 45/45, reconcile 13/13, grande 136/141 (4 socials pré-existentes = master).

> Contexto: a REFUNDAÇÃO (PR28072026) entregou F1 sessão server-side, F2 front espectador,
> F4 ordem do dinheiro (Brave por último + teto diário) e F3 verdade de segmento — tudo em prod
> 28/07. No dia seguinte, a MESMA busca real ("distribuidora de agua", multi-cidade SP) expôs
> dois problemas novos: lixo fora de segmento entregue como lead, e a tela apagando o resultado
> ao fim da busca. Este plano explica a doença (não os sintomas) e fecha as duas frentes.

---

## PARTE 1 — ANÁLISE: o que está acontecendo de verdade

### Incidente A — o lixo continua passando (Analândia, 29/07)

Busca "distribuidora de agua" em Analândia/Araras/Artur Nogueira/Caconde. Entre os cards:
previsão do tempo (tiempo.com), página de categoria (querobrasil), cervejaria, engenharia,
e "Informática & Eletrônicos" (que é a Mirão Distribuidora com nome extraído do MENU do site
e CNAE colado de OUTRA empresa). Causas confirmadas no código:

1. **A lei única de segmento existe mas não é porta.** `buildSegmentTextMatcher`
   (radar-segment-match.util.ts) só sobe NOTA
   (radar-core-quality-enrichment.mixin.ts:394). A porta real é
   `nameConflictsWithRequestedSegment` (mixin:324), que depende de
   `VERTICAL_TOKEN_GROUPS` — **7 verticais hardcoded** (academia, barbearia, farmácia,
   imobiliária, moda, oficina, restaurante). "distribuidora de agua" → `requestedGroups`
   vazio → retorna `false` SEMPRE. A porta é inerte pra qualquer segmento fora dos 7.
2. **O gate sabe que o card é ruim e entrega mesmo assim.** Em
   radar-quality-gate.service.ts:286 os bloqueadores são `invalid`, `duplicate`,
   `generic_directory` — `segment_mismatch` fica de fora. O card recebe score 52–61,
   é rotulado ruim, e vai pra vitrine como "Aguardando liberação".
3. **"Sinal local" aprova por nome-da-cidade-na-URL.** `evaluateLocalReality`
   (radar-web-source-gate.service.ts:389) aceita cidade na URL como prova — qualquer
   portal com página por cidade (clima, categoria, cerveja gelada) passa.
4. **A exceção de "canal próprio" fura a blacklist.** solutudo.com.br ESTÁ na blacklist
   (web-source-gate:24) e passou pela exceção de telefone próprio (checkDomainBlacklist:348).
5. **Cidade é carimbo, não extração.** Todo card nasce com `city` = cidade da BUSCA.
   `checkGeoConflict` compara o carimbo com ele mesmo — nunca dispara. Prova: card vindo de
   URL `/sp/campinas/...` carimbado "Analândia".
6. **Nome extraído sem sanidade + reconciliação colando CNAE errado.** Categoria de menu
   virou razão social; a âncora RFB por telefone colou CNAE de outra empresa no card.

### Incidente B — a tela apaga o resultado (29/07, diagnóstico da sessão "Análise VPS")

Os 15 leads ESTÃO no banco (30 disponíveis no pool das 4 cidades). A tela esconde:

- Backend guarda sessão terminal por 30 min de propósito (`FINISHED_VISIBILITY_MS`,
  radar-search-session.service.ts:186-191) — pra tela que volta encontrar o resultado.
- O front joga fora na porta: a re-hidratação (leads/page.client.tsx:1285) só aceita
  `running`/`paused` → sessão `completed` é descartada → `hasSearched` nunca liga.
- O restaurador de filtros do localStorage (page.client.tsx:1379) liga `historyHidden=true`
  quando há filtro salvo.
- `hideHistory = shelf && !hasSearched && historyHidden` (≈:1970) força `items=[]` MESMO
  com a lista carregada. O contador da aba não passa pelo filtro → **número na aba, lista
  vazia embaixo** (a assinatura do bug).
- `markFiltersDirty()` (18 pontos de chamada) zera `hasSearched` + liga `historyHidden` +
  apaga itens ao vivo → encostar em qualquer filtro durante/após a busca apaga a tela.
- Não existe ação inversa na UI — a única saída é buscar de novo (gastando cota pra rever
  o que já está no banco).

### A DOENÇA (por que resolve um e cai outro)

Os dois incidentes são o mesmo padrão em camadas diferentes:

**D1 — Conhecimento e decisão moram em lugares diferentes.** O pipeline CALCULA a verdade
(score, mismatch, status; sessão terminal guardada 30 min) mas quem ENTREGA/EXIBE não é
obrigado a obedecer (gate entrega mismatch; front descarta a sessão terminal). Cada fix novo
vira um remendo no ponto do sintoma, não no ponto da decisão.

**D2 — Duas leis pro mesmo assunto, e a velha ganha na porta.** A lei universal
(matcher + CNAE-first, F3) convive com a lei velha de 7 verticais — a velha é quem bloqueia.
No front igual: a verdade do servidor (sessão) convive com a máquina local de visibilidade
(`hasSearched`/`historyHidden`/`liveItems`/tab) — a local ganha e esconde.

**D3 — Campos com vários escritores e fallback silencioso.** cidade = carimbo da busca;
nome = texto raspado sem sanidade; CNAE = reconciliação que pode colar errado. Fallback
ressuscita lixo sem deixar rastro (foi exatamente a fábrica do "EDR Imobiliária" no F3).

**D4 — Exceção heurística é buraco futuro.** "Canal próprio" fura blacklist; "cidade na
URL" aprova portal. Cada exceção criada pra salvar 1 caso real abre porta pra N casos falsos.

**D5 — Teste verde por estágio, pipeline furado.** 143/143 verdes no F3 e o lixo passou no
dia seguinte — porque nenhum teste roda a busca REAL de ponta a ponta e afirma o resultado
FINAL visível. Cada estágio cumpre seu contrato; o conjunto mente.

---

## PARTE 2 — O PLANO (E1–E6)

Princípio único: **decisão computada é decisão OBRIGATÓRIA — 1 porta, 1 lei, 1 escritor por
campo, e prova de ponta a ponta.** Proibido resolver qualquer item abaixo adicionando entrada
de blocklist ou exceção nova — é o motor do whack-a-mole.

### E1 — A tela para de esconder o que o banco tem (P0 — front, sem risco de motor)
- Re-hidratação aceita sessão TERMINAL dentro da janela de 30 min: liga `hasSearched`,
  mostra o fecho honesto ("Busca concluída: 15 leads em 4 cidades — 2 novos, 13 já estavam
  na prateleira") em vez de tela branca. É o outro lado do `FINISHED_VISIBILITY_MS`, que já
  foi escrito pra isso.
- `hideHistory` NUNCA mais força `[]` com lista carregada. Estado vazio vira tela explícita
  com ação inversa ("Mostrar leads disponíveis") — hoje só existe o botão que esconde.
- `markFiltersDirty` para de apagar: com sessão viva/recente, mexer em filtro marca
  "resultado desatualizado — clique Buscar" e NÃO zera `hasSearched`/itens.
- Contador da aba e lista derivam da MESMA fonte — fim do "número na aba, lista vazia".

### E2 — UMA porta de segmento (a lei única vira lei de verdade)
- `nameConflictsWithRequestedSegment`/`VERTICAL_TOKEN_GROUPS` DEIXAM de ser a porta
  (grupos viram no máximo sinal de nota; idealmente morrem).
- O gate passa a emitir veredito universal com 3 saídas, pra QUALQUER segmento:
  **aderente** (CNAE real casa o pedido, ou matcher completo casa) · **não confirmado**
  (sem evidência — segue vivo, honesto) · **mismatch** (evidência POSITIVA de outro
  segmento: CNAE conflitante ou nome/conteúdo de outro ramo).
- `segment_mismatch` entra nos bloqueadores do quality-gate (radar-quality-gate:286).
  Mismatch NÃO vai pra vitrine como "Aguardando liberação".
- **Decisão de produto (tomada aqui, reversível):** vitrine mostra a lista curta e
  verdadeira; os reprovados por segmento aparecem num bloco separado e recolhido
  ("Fora do segmento (N)") — visíveis pra auditoria e resgate de falso negativo, NUNCA
  misturados. Cidade de 4,5 mil hab. com 3 distribuidoras mostra 3 — esse é o número real.

### E3 — Verdade de campo: um escritor por campo
- **Cidade:** fim do carimbo. `city` do card só nasce de evidência (cidade na URL/endereço/
  conteúdo, ou âncora RFB); sem evidência → "cidade não confirmada". `checkGeoConflict`
  passa a comparar EVIDÊNCIA × cidade pedida (o card de Campinas carimbado Analândia morre
  ou se assume de Campinas).
- **Nome:** sanidade de extração — nome com cara de categoria/menu ("Informática &
  Eletrônicos", cabeças genéricas sem cara de razão social) não passa como nome de empresa;
  com âncora RFB, a razão social REAL substitui o texto raspado.
- **CNAE/reconciliação:** colar CNAE exige âncora inequívoca E compatibilidade de nome —
  o caso Mirão (telefone bateu, empresa errada) vira teste de regressão; na dúvida, o card
  fica "não confirmado", nunca fantasiado.

### E4 — Fechar as torneiras de exceção (sem criar outras)
- Exceção de "canal próprio" na blacklist: só vale pra domínio numa allowlist explícita de
  agregadores-com-schema.org (o caso de delivery pra qual foi criada) OU com âncora RFB.
  Blacklist sem allowlist = morte, como a camada dura já faz.
- `evaluateLocalReality`: cidade-na-URL sozinha DEIXA de aprovar (é o padrão exato de
  portal com página por cidade). Sinal local = conteúdo/endereço, DDD real ou âncora RFB.

### E5 — Prova de PIPELINE (a vacina do whack-a-mole)
- Suíte golden E2E: fixtures das buscas reais que quebraram (Analândia c/ tiempo.com,
  solutudo, querobrasil, cervejaria24h, mirao+menu, qualotelefone/Campinas; Zacarias c/
  eBay; EDR/Galmare; padaria SC) rodando coleta→gate→enriquecimento→apresentação, com
  assert na LISTA FINAL de cards — não no estágio.
- Regra permanente: bug de qualidade novo → vira fixture ANTES do fix. A suíte roda no
  caminho do publish (junto do typecheck estrito).

### E6 — Disciplina de execução
- **1 sessão executa** este plano; a sessão "Análise VPS distribuidora" fica SÓ diagnóstica
  (as descobertas dela já estão incorporadas aqui — duas sessões editando radar = guerra
  de `add -A`, já deu errado em 28/07).
- Lote mínimo + commit imediato por etapa; publish só quando o dono mandar.
- Ordem: **E1 → E2+E4 (mesmos arquivos, 1 lote) → E3 → E5 acompanha cada etapa**.

### Fica FORA (backlog consciente, não esquecimento)
- SearXNG self-host, tetos de fonte editáveis no /master, pago-só-no-claim (restos da
  REFUNDAÇÃO) — só depois da estabilização.
- GTM dois nichos (PR28072026-GTM-DOIS-NICHOS.md) — depende desta limpeza: demo com card
  de clima na frente do prospect mata a venda; este plano é pré-requisito do nicho 2.

### Riscos declarados
- E2/E3 encolhem resultado em cidade pequena (9→~3). É o número verdadeiro; o bloco
  "Fora do segmento" dá o resgate sem deploy.
- E3 (cidade por evidência) mexe no coração do save-loop — é a etapa de maior risco;
  entra DEPOIS de E1/E2/E4 e coberta pela suíte E5 desde o primeiro commit.
