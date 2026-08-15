# LOTE 3 — CHEGADA: UMA PEÇA SÓ, IGUAL NOS 2 PALCOS (desenho executável)

Ordem do dono (15/08): *"a tela que é impressa ao chegar no cliente no 2d e 3d tem que ser
IGUAL"* + *"é para abrir na frente sim, se você está na rota 2d ou 3d, o 'você chegou' tem
que aparecer nos 2"*. O worker segue este documento sem decidir nada. Levantamento feito no
código de 15/08; **ancorar por STRING, nunca por linha** (os números andam).

## 0. PRÉ-VOO
- **Não começar com a árvore suja** nestes 2 caminhos: `docs/mockups/logistica2.0/logistica-2.0.html`
  e `EntregaShell/app/src/logistica/ponte-src/*` (`git status --porcelain`).
- Ler antes: no mock, `portao(chave)`, `remontarPortao`, `fechar(wrap)`, `pintar()` e o bloco
  `.portao-wrap`; na ponte, `carimbarChegada`, `abrirParada`, ouvinte `hbx:arrival`,
  `irDepoisDoDesfecho`; e os scripts `prova-chegada.js`, `prova-folha-sobe-uma-vez.js`.
- **FATO QUE AMPLIA O ESCOPO:** hoje `irDepoisDoDesfecho` faz `window.ir('rota')` **sempre** —
  quem confirmava dirigindo em 3D era cuspido no 2D. A ordem "o mapa continua onde estava"
  exige consertar isso aqui (item 3.5).
- Som, vibração e TTS da chegada são **nativos** (`RotaService`/`ChegadaActivity`) e **não
  entram no JS** — eco duplicado já foi defeito pago.

## 1. A PEÇA ÚNICA
### 1.1 Decisão de arquitetura (não negociar — é o que garante igualdade literal)
A peça **não** é renderizada por `T.rota` nem por `telaGps()`. É uma **camada imperativa
montada na camada viva**, irmã gêmea do `portao()`: uma função só, um nó só, montado na
**última `.tela`**. Não existe "versão 2D" e "versão 3D" para divergirem. Três razões (pôr no
comentário):
1. **Igualdade por construção** — duas chamadas em dois templates seriam "parecido", que é o
   que o dono proibiu.
2. **A precisão do GPS não pode passar pelo seam** — `±20 m` oscila e daria 1 repinte/s; na
   peça imperativa o texto nasce congelado, lido de `ultimoFix`.
3. **`numerarItens` não a alcança** — peça dentro do template ganharia `trItem` a cada
   repinte (o pisca de 08/08 pela porta dos fundos).

### 1.2 No HTML fonte
- **Funções novas**, logo após `function remontarPortao(nova,wrap){`: `cartaoChegada(d)` e
  `remontarChegada(nova,wrap)` (espelho literal do remontarPortao).
- `d = { id, n, nome, endereco, gps }` — **só DADO**; quem escapa é a ponte. COPY mora na
  função (`'Você chegou'`, `'Registrar entrega'`, `'Agora não'`), nunca no seam.
- Corpo = o corpo de `telaGps(true)` (ramo `if(chegou)`) fundido numa peça só: check + "Você
  chegou" + nome + endereço + `GPS ±N m`, mais os dois botões:
  - principal `class="act go full" data-acao="abrir-parada" data-parada="<id>"`
  - secundário `class="ghost" data-fechar="1" data-acao="chegada-dispensar"`
- **Lei do IF:** sem `d.id` a peça não é montada (nunca um verde grande que não abre folha).
  Campo sem fonte some inteiro, com separador (régua do `trilha()`).
- Idempotência dentro da função: remover `.chegou-wrap` existente antes de inserir.
- **CSS sem cor nova:** copiar as declarações de `.portao-wrap`/`.portao` trocando só o
  z-index; véu `rgba(4,7,13,.7)` + `mvScrim`; cartão `var(--card)`, `--line`, radius 17,
  sombra do portão, `mvConf`; check reusa `var(--lime-bg-2)/var(--lime)` (o par de
  `.portao.ok .ico`); tipografia trazida de `.gps-manobra` para o namespace novo (o
  `.gps-manobra` é `position:absolute` e brigaria com o `place-items:center`).
- **Modo claro em 2 linhas, ambas em regras existentes:** somar `.chegou-wrap` ao seletor de
  `[data-luz="claro"] .scrim,[data-luz="claro"] .portao-wrap,…` e `.chegou-cartao .seta` ao de
  `[data-luz="claro"] .portao.ok .ico{background:#f0f8e4;…}`. **Zero hex novo.**
- **Porta na galeria:** botão `▸ Chegou` no `#avdisparo` (ao lado de ▸ Erro/▸ Confirmar) e o
  handler vira mapa de 3; os literais de demonstração (`R. São Judas, 142` etc.) migram do
  seam para o `DEMO` do disparo. Somar `.chegou-wrap` ao fechador global
  (`fec.closest('.erro-wrap,.conf-wrap,.portao-wrap')`) — senão "Agora não" é botão morto.
- **Sobreviver ao repinte:** em `pintar()`, declarar `chegadaViva` junto de `portaoVivo` e
  chamar `remontarChegada(nova,chegadaViva)` logo após `remontarPortao(...)`, antes do
  `herdarFoco`; regra `.chegou-wrap.remontado,.chegou-wrap.remontado *:not(.saindo){animation:none}`.

### 1.3 T.rota e T.mapa não mudam
Nenhuma linha dos dois templates é tocada além da morte do ramo `if(chegou)`. **Não são duas
renderizações iguais — é uma renderização só**, e o palco embaixo é irrelevante.

## 2. CAMADA E Z-INDEX
Mapa vigente: `.body` 20 · `.veu-montar` 25 · dock/`.map-*`/`.plano-*` 30 · `.next-card` 35 ·
`.hdr` 40 · `.scrim`/`.sheet` 40/41 · `.nav` 45 · `.status` 50 · `.aula-wrap` 52 · `.aviso` 55
· `.conf-wrap` 58 · `.portao-wrap` 59 · `.erro-wrap` 60.
**A peça vale 56**: acima de todo cromo de tela (cumpre "abrir na frente") e **abaixo** de
conf/portão/erro — um portão legítimo (forma de pagamento, erro de rede, update obrigatório)
continua aparecendo por cima. O wrap é filho direto de `.tela`, então cobre os dois palcos,
inclusive o 3D em modo navegação (barras do Android fora) sem encostar em recorte/gesto —
mesma geometria do portão, que já vive nessa tela.
**Leis de animação:** a peça não tem regra presa a `.tela.entra` (ela é notícia, não entrada de
tela — igual ao portão); e ela **atravessa** o repinte (é movida e marcada `.remontado`, que
desliga animação) em vez de renascer nele. Nenhum `@keyframes` novo.

## 3. COMPORTAMENTO (tudo em `ponte-src/D0-porta-entrega.js`)
### 3.1 Estado (junto de `let aberta = null;`)
`chegada` (id com cartão aberto) · `chegadaPalco` ('rota'|'mapa') · `chegadasDispensadas` (Set).
### 3.2 Ouvinte `hbx:arrival`
Guardas atuais **ficam**: sem id; `aberta` (folha aberta não se troca); `estadoRota!=='rodando'`;
parada inexistente; já entregue/cancelada. Guardas **novos**, nesta ordem: mesma parada já
aberta; id em `chegadasDispensadas`; **`if (chegada) return;`** (2ª chegada com cartão aberto
não troca o cliente debaixo do dedo); tela fora de `rota`/`mapa` → **grava o estado e sai** (o
cartão nasce quando ele voltar ao mapa).
Corpo novo no lugar de `abrirParada(id)`: `carimbarChegada(id)` → grava `chegada`/`chegadaPalco`
→ `desenharChegada()`. **Ordem importa**: o carimbo repinta e troca a camada.
### 3.3 `desenharChegada()` — porta única de montagem
Sai se não há chegada (limpando o wrap), se a tela não é mapa (sem limpar estado), **se
`naCamada('.chegou-wrap')` já existe** (é isso que impede renascer 1×/s e reanimar), ou se a
parada sumiu. Monta com `gps` lido de `ultimoFix` na hora (sem fix, a linha some).
### 3.4 Onde mais é chamada
No observador de mutação de `80-gps-rotas-salvas.js` (após `montarMapa(palco)`): cobre volta de
Ajustes/Chat/folha, chegada recebida noutra tela e app subindo com pendência
(`drenarPendencias` do `onResume`). **Declarar como `function` (hoisting)** — a costura
concatena `80-` antes de `D0-`.
### 3.5 Ação principal e a volta pro palco
- "Registrar entrega" cai no roteador que já existe (`abrir-parada`) — **zero código novo**;
  `abrirParada` zera `chegada`.
- **`irDepoisDoDesfecho` muda**: a regra do fim do dia continua primeiro e intacta; o
  `return window.ir('rota')` vira `window.ir(chegadaPalco === 'mapa' ? 'mapa' : 'rota')` e
  zera `chegadaPalco`. Comentário: *"quem chegou dirigindo volta a dirigir; quem chegou
  olhando o dia volta pro dia"*.
### 3.6 Dispensar
`chegada-dispensar` no roteador: entra em `chegadasDispensadas`, zera estado. **Não** apaga
`chegada:<id>` do cache, **não** apaga o pino âmbar, **não** fala com o servidor.
### 3.7 Botão voltar do Android
Somar `'.chegou-wrap'` a `POR_CIMA` em `00-nucleo.js`, **entre `.conf-wrap` e `.aviso`** (a
lista é z-index decrescente). O back aperta o secundário e o estado morre junto.
### 3.8 O que NÃO muda (escrever no comentário)
Som/vibração/voz nativos · `carimbarChegada` · `arrivedAt` viajando no desfecho · `is-delivered`
só no confirmado · folha aberta não se troca · chegada sem rota rodando não abre nada ·
geofence/raio/anel de 500 m fora do lote.

## 4. MORTE DE `T.mapachegou`
No mock: `telaGps(chegou)` perde o parâmetro e o ramo `if(chegou)`; `T.mapa` passa a
`telaGps()`; **apagar `T.mapachegou`**; tirar `'mapachegou'` da `ORDEM` e de `TELA_CHEIA`;
apagar os 8 campos `chegou*` do seam `gps`; atualizar as listas DADO/COPY do comentário; mover
e apagar as 3 regras `.gps-manobra.chegou *`; reescrever comentários que citam a tela — em
especial o que promete "CHEGOU → volta o mapa de VISÃO GERAL" (**essa regra morreu**: o cartão
abre sobre o palco em que ele está).
⚠️ **Nome órfão na `ORDEM` = TypeError = tela preta** (o rail faz `T[k].grupo` sem guarda), e as
provas `casca-*` iteram a ORDEM. As duas edições vão no mesmo commit.
Na ponte, trocar o vocabulário em `80-gps-rotas-salvas.js` (`naNavegacao`, observador),
`70-traco-camera.js` (apagar o cálculo de precisão e os campos `chegou*` do cromo),
`10-geofence-montagem.js` (`apagarDemonstracao`) e comentários de `60-prospector-nav.js`.
🔴 **A exceção mais perigosa:** `if (veioDe === 'mapachegou') { camFase='dirigindo'; pedirCamera(); }`
**não se apaga — se traduz** para `venda|folha|folhanao`. Sem ela, cada volta ao 3D reencena a
cidade nascendo + 1,8 s de descida de câmera, dezenas de vezes por dia, no meio da rua.
Em `scripts/prova-navegar.js`, o CASO 2 não morre: troca `ir('mapachegou')` por `ir('venda')`,
mantendo as asserções. Em `scripts/prova-chegada.js`, F3.1/F3.2 mudam de contrato (a chegada
abre o **cartão**, não a folha); o resto fica.
Portões `casca-*` não quebram: a contagem de telas é derivada do mock (33 → 32) e o
`antes-e-depois` deve acusar **só** `mapa` (2 modos) — qualquer outra tela diferente é
regressão.

## 5. O PORTÃO DE IGUALDADE — `scripts/prova-chegada-igual.js` (entregável principal)
**Mecânica:** regenerar os gerados antes de medir (`ponte-costurar` + `casca-injetar`, senão a
prova mede código velho); servidor estático + pele do mock-fonte (sob `file://` o estilo do mapa
quebra); Playwright 412×940 com `geolocation` e `accuracy` reais (é o que enche o "GPS ±N m");
dublê de `window.HBX` **após o boot** (copiar de `prova-chegada.js`); chegada via
`dispatchEvent('hbx:arrival')`.
**Laço:** 2 modos de luz × 2 palcos (`rota`, `mapa`).
**Três camadas de régua:** (A) `outerHTML` do `.chegou-wrap` **byte a byte, sem normalização**
— a única tolerância é formatar o diff para leitura; (B) pintura resolvida
(`getComputedStyle` + retângulo) nó a nó — HTML igual com pintura diferente é o defeito que o
`casca-conferir` existe pra pegar; (C) screenshot do cartão → sha1 (por isso o fundo é opaco).
**Asserções (nomes no log):** existe nos 2 palcos · não troca de tela nos 2 · HTML/pintura/foto
idênticos entre palcos · estrutura igual entre modos de luz · fica acima de dock/abas/rodapé e
**abaixo** de um portão legítimo · repinte não reencena nem derruba · nasce com entrada uma vez ·
ação principal abre a folha pela porta de hoje · **confirmar volta ao palco de origem (3D e
2D)** · dispensar não apaga a chegada · 2ª chegada não troca o cliente · chegada com folha
aberta segue ignorada · `T.mapachegou` não existe mais · contraste do texto ≥4,5 (≥3,0 grande)
nos 2 modos + borda legível sobre o mapa + ícone ≥3,0 · zero `pageerror`.
🔴 **Armadilha nº1 do portão: `null === null` é verdade.** Escrever a asserção de igualdade como
`!!html2D && !!html3D && html2D === html3D` — senão ela passa VERDE hoje, com zero cartão.
**RED-FIRST esperado hoje:** ~6 verdes / ~20 vermelhos (existência, não-troca-de-tela,
igualdade, camada, animação, volta ao 3D, morte da tela e contraste reprovam). Anotar o placar
vermelho na mensagem do commit.
**Portões vizinhos, nesta ordem:** `ponte-conferir` · `casca-conferir` · `casca-antes-e-depois`
· `prova-chegada` · `prova-chegada-igual` · `prova-navegar` · `prova-fluxo-rota` ·
`prova-encaixe-gps` · `prova-folha-sobe-uma-vez` · `prova-mapa-2d`.

## 6. ARMADILHAS (todas com endereço no código)
1. **Mapa é transplantado, nunca recriado** (garagem por NOME de palco) — é isso que faz "o
   mapa continua onde estava" sair de graça. **Não encostar.**
2. **`pintar()` monta camada nova a cada seam** — quem não for carregado morre calado; sem o
   `remontarChegada`, o cartão some no primeiro fix do GPS (1×/s no 3D). Risco nº1 de
   "funcionou na bancada e sumiu no g15".
3. **Não ancorar por `bottom`** — `--gps-rodape-h` é medido à mão e já deixou peça atrás do
   rodapé por um mês; usar a geometria centrada do portão.
4. **Traduzir, não apagar, a exceção do "voltar do chegou"** (item 4).
5. **Trocar de tela continua fechando a peça** — é desejado: ela morre ao ir pra folha e
   renasce pelo observador na volta.
6. **Observador re-entrante:** montar altera o DOM → dispara o observador → chama de novo. A
   guarda `naCamada('.chegou-wrap')` é o que impede o laço infinito.
7. **`function`, não `const`**, por causa da ordem da costura.
8. **Véu escurece o mapa** (decisão tomada: mesmo véu do portão, zero cor nova, evita toque
   acidental no dock por baixo). Se o dono quiser o mapa visível, é uma linha — deixar escrito.

## 7. ORDEM DE EDIÇÃO
1. `scripts/prova-chegada-igual.js` (novo) → **rodar e guardar o placar vermelho**.
2. `docs/mockups/logistica2.0/logistica-2.0.html` (CSS, funções, galeria, seam, telaGps,
   T.mapachegou, ORDEM, TELA_CHEIA, pintar, fechador global).
3. Ponte: `D0-porta-entrega.js` · `80-gps-rotas-salvas.js` · `70-traco-camera.js` ·
   `10-geofence-montagem.js` · `00-nucleo.js` · `60-prospector-nav.js` (comentário).
4. Provas vizinhas: `prova-navegar.js` (caso 2) · `prova-chegada.js` (F3.1/F3.2).
5. `node scripts/ponte-costurar.js` + `node scripts/casca-injetar.js` → rodar os 10 portões.

**NÃO TOCAR:** gerados (`ponte.js`, `mock.js`, `mock.css`, `index.html`) · `40-mapa-palcos.js`
(pino/garagem) · `55-cena-reversa.js` (transplante) · Kotlin (som/geofence/pendências — mudança
nativa exigiria rebuild) · backend · `confirmarEntrega`/`registrarNaoEntregue`/`carimbarChegada`
(só o destino do `irDepoisDoDesfecho` muda) · `T.venda`/`T.folha` · demos e cópias históricas.

## 8. CENA DE TESTE DO DONO (g15)
1. Na tela 2D, chegar numa parada: som de sempre e o **"Você chegou" abre na frente**, sobre o
   2D, sem trocar de tela.
2. "Registrar entrega" → folha de sempre → confirmar → **volta pro 2D**, ✓ lima no pino, mapa
   no mesmo lugar.
3. "Navegar" → 3D → chegar na próxima: **o mesmo cartão, mesma cara**, por cima do 3D.
4. Confirmar → **volta pro 3D dirigindo**, câmera onde estava, sem a cidade renascendo.
5. "Agora não" → cartão sai, **pino continua âmbar**.
6. Modo claro → legível nos dois palcos.
