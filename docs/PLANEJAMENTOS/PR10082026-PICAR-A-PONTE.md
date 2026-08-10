# PR10082026 — PICAR A PONTE: o app sai de UM arquivo pra módulos com DONO

> Ordem do dono (10/08): *"vc criou um código imenso, ponte.js. pode começar picando ele,
> refaça inteira a arquitetura. eu clico em montagem ele já puxa coisa, eu tiro um simples
> 'carregar segunda automaticamente' ele já quebra o carregamento do dia. toda essa linhagem
> de pensamento em um arquivo imenso de 10.000 linhas é o problema."*

---

## §0 — A DOENÇA, MEDIDA (10/08, no arquivo de produção)

| Medida | Valor |
|---|---|
| Linhas do `ponte.js` | **10.858** |
| Funções | **~505** |
| Variáveis de estado soltas no escopo do arquivo (`let` ambientais) | **79** |
| Escopos | **1 IIFE** — toda função enxerga as 79 variáveis |

**O espécime da doença — a regressão desta noite, commit por commit:**

1. `fe10cbb3` — "Iniciar é um gesto só" (ordem do dono). Certo.
2. `3e876313` — "a Montagem abre sem dia" (ordem do dono). Mudou `let montarDia = -1`. Certo.
3. `41f5f034` — "chip desligado = rota avulsa" (ordem do dono). `const avulsa = montarDia === -1`. Certo.

Os três certos SOZINHOS. Juntos: o **Iniciar do mapa** (tela Rota) leu `montarDia` — que é
estado da tela **Montagem**, que o dono nunca abriu — concluiu "rota avulsa vazia" e morreu
com **51 paradas agendadas** no servidor. Erro na tela: *"A rota avulsa está vazia."*

A causa não é o botão. É que **`-1` significa duas coisas** ("Montagem abriu limpa" e
"o dono desligou o dia de propósito") e **duas portas** (Iniciar do mapa, Iniciar da
Montagem) adivinham a intenção lendo a mesma variável ambiente. Num arquivo de 10.858
linhas, TODA variável é ambiente. Cada ordem nova reprograma portas que ninguém tocou.

É a mesma doença que o PR09082026-ROTA-SEIS-VERBOS mediu no banco ("a agenda em 4 cópias"),
agora medida no app: **estado sem dono**.

---

## §1 — AS TRÊS LEIS DA ARQUITETURA NOVA

1. **ESTADO TEM UM DONO.** Cada variável mora num módulo, e só o dono escreve nela.
   Quem é de fora LÊ por função com nome (`Rota.estado()`), nunca pela variável crua.
   Escrita de fora **não compila** — não é disciplina, é parede.

2. **INTENÇÃO VIAJA COMO ARGUMENTO.** Porta não adivinha. O Iniciar do mapa chama
   `iniciar({escopo:'dia'})`. O Iniciar da Montagem chama `iniciar({escopo:'avulsa',
   ids:[...]})` ou `{escopo:'dia'}` conforme o chip DELA. O verbo executa o que
   recebeu — nunca fareja em que tela o dedo estava nem que variável ficou no ar.
   *Com esta lei, a regressão desta noite é IMPOSSÍVEL de escrever.*

3. **ESTADO DE TELA MORRE COM A TELA.** Chip do dia, prévia, rascunho, espaço escolhido:
   nascem quando a Montagem abre, morrem quando ela fecha sem gravar. Nenhuma outra tela
   consegue lê-los porque eles nem existem mais. (Exceção que já é lei do domínio: o
   RASCUNHO sobrevive nas 3 telas de escolher gente — `rapida`/`ficha`/`novocliente`.)

---

## §2 — O DESENHO

```
ANDROID (Kotlin)  →  native.js  →  mock.js (GERADO da casca — NÃO MUDA NADA)
                                        ↓ pinta telas, lê DADOS/PARADAS
                     ┌──────────────────┴───────────────────────────────┐
                     │            PONTE PICADA (assets/app/ponte/)      │
                     │                                                  │
   00-nucleo.js      │  API · telaAtual · camadaViva · trava(ocupado)   │
                     │  fila · esc() · avisoErro · RASTRO (auditoria)   │
                     ├──────────────────────────────────────────────────┤
   10-rota-estado.js │  A MÁQUINA DE 5 ESTADOS (PR09082026, já com GO)  │
                     │  DONO DE: estadoRota · ENTREGAS · PARADAS do dia │
                     │  · diaNaTela · virada do dia · carregarRota      │
                     │  Toda transição tem NOME e entra no RASTRO.      │
                     ├──────────────────────────────────────────────────┤
   20-rota-verbos.js │  materializar · planejar · iniciar(escopo!) ·    │
                     │  cancelar · salvar · fecharDia                   │
                     │  SEM ESTADO PRÓPRIO. Recebe argumento, fala com  │
                     │  o servidor, manda a máquina transicionar.       │
                     ├──────────────────────────────────────────────────┤
   30-montagem.js    │  DONO DE: montarDia(chip) · PREVIA · RASCUNHO ·  │
                     │  ESPACOS · modoSel · diasComCliente              │
                     │  Nasce ao entrar, morre ao sair. Chama os verbos │
                     │  com argumento — nunca exporta variável.         │
                     ├──────────────────────────────────────────────────┤
   40-mapa-cenas.js  │  GARAGEM(palcos) · cenas · camFase · traço/pinos │
                     │  CONSULTA a máquina (rotaMontada()) — não decide.│
                     ├──────────────────────────────────────────────────┤
   50-gps-nav.js     │  gpsWatch · ultimoFix · navRota+tetos · geofence │
                     │  · aviso "tô chegando"                           │
                     ├──────────────────────────────────────────────────┤
   60-entrega.js     │  folha de chegada · confirmar · não-entregue ·   │
                     │  caderneta/fechamento                            │
                     ├──────────────────────────────────────────────────┤
   70-clientes.js    │  ficha · novo cliente · busca · porta "rapida" · │
                     │  MODELOS                                         │
                     ├──────────────────────────────────────────────────┤
   80-plataforma.js  │  update/CSP · sons · tema · Voltar · teclado ·   │
                     │  barra de módulos · tutorial                     │
                     └──────────────────────────────────────────────────┘
```

**Como os módulos conversam** — um objeto só, explícito e auditável:

```js
window.PONTE = { nucleo, rota, verbos, montagem, mapa, gps, entrega, clientes };
```

- Cada arquivo REGISTRA o que exporta; leitura cruzada é sempre `PONTE.rota.estado()` —
  greppável, com dono na cara. `let` ambiental compartilhado DEIXA DE EXISTIR.
- **RASTRO** (no núcleo): as últimas 50 transições de estado com ATOR
  (`"montagem/iniciar-rota → planejar(avulsa, 3 ids)"`). É a lei do "evento com ator"
  da LEI DO DESAPARECER aplicada ao app: quando algo regredir, o rastro diz QUEM foi
  em 10 segundos, não em 3 horas de arqueologia.
- Carregamento: `index.html` lista os arquivos NA ORDEM (00→80). Sem bundler, sem build
  novo — a CSP `'self'` já cobre. ⚠️ `index.html` é GERADO: a lista nasce no
  `scripts/casca-injetar.js` (o cordão de update já morreu 2× por editar o gerado à mão).

**O que a picada NÃO toca:** a casca (mock HTML → `casca-injetar` → mock.js/mock.css)
continua exatamente como é — fonte no HTML, 32 telas, portões `casca-*`. O backend
(seis verbos, PR próprio) é outra frente. O nativo (Kotlin) não muda.

---

## §3 — AS FASES (cada uma termina PUBLICADA e testável no celular)

### F0 — ESTANCAR O SANGUE (minutos, antes de tudo)
O bug na mão do dono não espera refatoração:
- `iniciarRota`: o escopo vem da PORTA. Mapa (`iniciar`) = dia. Montagem
  (`iniciar-rota`) = avulsa só se o chip DELA está desligado. Fim do palpite por
  `montarDia` ambiente.
- A barra do mapa fala a verdade do dia por montar: **"51 paradas agendadas"** + a dica
  de montar — nunca mais "Sem paradas hoje" com 51 esperando (mexe na casca, via
  pipeline `casca-*`; tela mudada de propósito acusada no antes-e-depois).
- Prova nova no `prova-fluxo-rota`: **Iniciar do mapa com a Montagem nunca aberta e
  estado dela sujo** — a vacina desta noite.
- Publica. Dono testa. Só então começa a picada.

### F1 — O ESQUELETO (1 noite)
- Nasce `assets/app/ponte/` com os 9 arquivos; `casca-injetar` passa a emitir a lista.
- Mudança de código = **só transporte** (mover função inteira, byte a byte). Zero
  comportamento novo. O arquivão morre no MESMO commit (lei da chave morta: nada de
  `ponte.js` velho "de reserva" pra alguém carregar sem querer).
- Portões: casca 32/64 intocada · `prova-fluxo-rota` 60/60 · `prova-abertura` ·
  `prova-navegar` · `prova-cena-ruas` — todos verdes ANTES e DEPOIS.

### F2 — A MÁQUINA E OS VERBOS (1 noite)
- `10-rota-estado`: os 5 estados viram transições NOMEADAS + RASTRO ligado.
- `20-rota-verbos`: `iniciar/planejar/custo` recebem `{escopo, ids}` — a Lei 2 vira
  código. Os aliases de ação (`iniciar`, `iniciar-rota`) passam a declarar a intenção.
- Morrem aqui: os estados `pausada`/`semsinal` que o servidor NUNCA produz
  (PR 5-ESTADOS §4 já condenou) e todo `if` que pergunta "em que tela estou?" pra
  decidir verbo.

### F3 — A MONTAGEM VIRA DONA DE SI (1 noite, a fase que mata a classe do bug)
- `montarDia`, PREVIA, RASCUNHO, ESPACOS, memória de espaço → presos no módulo 30.
- Entrar não grava, entrar não carrega (as duas leis de hoje) — e agora sair LIMPA.
- Prova de porta suja vira geral: toda porta do mapa roda com o estado da Montagem
  aleatório — nenhuma pode mudar de comportamento.

### F4 — MAPA/CENAS + GPS/NAV (1 noite)
- Módulos 40 e 50. `rotaMontada()` passa a ser A consulta pública da máquina —
  os 3 pontos que hoje a chamam continuam, mas ninguém mais lê `estadoRota` cru.

### F5 — ENTREGA, CLIENTES, PLATAFORMA + DEMOLIÇÃO (1 noite)
- Módulos 60/70/80 por transporte.
- **As linhas vermelhas** (cada corte confere o FIO antes — função, passo de tutorial e
  portão que a peça dirigia, a lei do "remover peça varre o tour"):
  | Candidato | Tamanho | Fio a conferir |
  |---|---|---|
  | `mobile-contract.js` | 12 KB | `index.html` não carrega; era o gerar-dia do app velho |
  | `offline-controls.js` | 7,6 KB | idem — ninguém referencia no flavor |
  | `opening.html` | 35 KB | não roda sob V2 (medido, APK 259); `OpeningActivity` FICA |
  | `matriz.js` | 11 KB | conferir quem carrega |
  | código morto interno achado no transporte | — | lista fecha na própria F5 |

**Total: 4–5 noites.** A classe de bug "mexi ali, quebrou aqui" morre na F3 — o resto
das noites é acabar a mudança, não conviver com app quebrado.

---

## §4 — OS PORTÕES DE TODA FASE (inegociáveis)

1. `node scripts/casca-injetar.js && node scripts/casca-conferir.js` — 32 telas, 100%.
2. `prova-fluxo-rota` (60+1 novas) · `prova-abertura` · `prova-navegar` · `prova-cena-ruas`.
3. Console limpo no boot (bancada) + teste de TELA no g15 após cada publish.
4. Commit local por fase; publish por fase (lei: terminar e testar no celular).
5. Nenhuma fase deixa duas cópias vivas da mesma função (lei da chave morta).

## §5 — DECISÕES QUE SÃO DO DONO (responder no GO)

1. **GO do F0 já?** (o conserto do Iniciar + barra verdadeira sobe em minutos, hoje.)
2. **Ordem das noites F1→F5 como está**, ou priorizar alguma frente?
3. Na demolição da F5: além dos 4 arquivos da tabela, **quer que o corte seja agressivo**
   (tudo que o transporte provar morto morre na hora) ou lista antes, corta depois?
