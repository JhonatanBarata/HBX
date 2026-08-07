# INVENTÁRIO — APP ANTIGO (produção) × APP NOVO (logistica2)

> **O que é:** lista item por item do que existe HOJE no app de produção (`logistica`), com o
> endereço no código, contra o que existe no app novo (`logistica2`).
> **As colunas `check` estão vazias de propósito** — a conferência é sua, em outro chat.
> **Nada aqui foi verificado nesta rodada:** a coluna "código novo" diz onde a peça está (ou que
> não existe), lido do código em 06/08/2026.
>
> **Legenda da 3ª coluna, só 3 estados:**
> `LIGADO` = existe e fala com o backend · `CASCA` = a tela existe no mock, sem fiação ·
> `NÃO EXISTE` = não há peça no app novo.
>
> **Base:** antigo = `EntregaShell/app/src/logistica/assets/app/app.js` (13.504 linhas) + Kotlin
> `app/src/main/java/.../*.kt` (51 arquivos). Novo = `EntregaShell/app/src/logistica2/assets/app/`
> (`mock.js` gerado do mock + `ponte.js` escrito à mão + `native.js` compartilhado).
> ⚠️ **O Kotlin é COMPARTILHADO** pelos dois apps: capacidade nativa existe nos dois; o que muda é
> se o JS do app novo CHAMA aquilo.

---

## 🔴 DECISÃO DO DONO — 06/08/2026: o que SOBE e o que NÃO SOBE

Combinado no chat, com os números medidos em produção (2 semanas de log do nginx + banco).
**Ritmo escolhido: piso + navegação completa** — a troca (FX) só acontece com tudo desta lista
ligado. **O corte é de 34 itens em 152 pendentes (22%)** — ou seja, a troca é praticamente
paridade; o que sai é o que ninguém usou.

### NÃO SOBE — 33 itens (ficam no app velho e morrem na troca)

| # | Item | Por que sai (medido) |
|---|---|---|
| 1-2 | **Comprovante foto** + **código 6 dígitos** (E) | **0 comprovantes na história inteira do produto** — `EntregaComprovante` tem 0 linhas. Decisão do dono: morre de vez (a vertical água/gás cobra na porta e não pede foto). |
| 3 | Tela de chegada nativa `ChegadaActivity` (E) | A folha do mock JÁ é a chegada; duas chegadas = duas peles. |
| 4-10 | **Modo Passeio inteiro** (K, 7 itens) | `POST /logistica/passeio/iniciar` = **2 chamadas em 2 semanas**, ambas teste do dono. |
| 11 | Passeio na entrada de Ajustes (J) | idem. |
| 12-17 | **Leitura de rota inteira** (L, 6 itens) | 17 sessões na história, **15 delas da company 48 — tenant do próprio dono**. Nenhum cliente usou. A caderneta 7 dias já cobriu a dor ("caderneta NÃO é reconhecimento de rota", GO de 05/08). |
| 18-21 | **Offline: prepare · sync · proofs · toggle** (O + J) | **0 chamadas em 2 semanas.** O desfecho sem rede já é coberto de graça pelo `interceptMutation` do Kotlin, que é LIGADO pra qualquer POST da ponte. `proofs` some junto com o comprovante. |
| 22 | **Tracking ao vivo** `TrackingSync` (R) | **0 chamadas do app.** Já está morto hoje — não é perda, é acerto de conta. |
| 23-24 | Baixar mapa offline + apagar mapa baixado (D) | Nunca gravou um tile (diagnóstico 04/08). O **PMTiles substitui e não tem botão**: o celular guarda 60 km e se vira sozinho. |
| 25 | Mapa offline em Ajustes (raio/baixar/apagar) (J) | idem — sobra 1 linha informativa. |
| 26-27 | **Missões / despertador** + **rota indicada (aceitar/negar)** (B) | 4 linhas de `LogisticaRotaIndicada` na história inteira, servidas por um poll de **2.981 chamadas**. 🔴 O poll morre junto (bateria + servidor). |
| 28-29 | Indicar rota pra alguém + aceitar/negar indicação (M) | mesma frente das missões. |
| 30-31 | Editor de modelo + criar/editar/apagar modelo (M) | **Lista e "gerar" SOBEM** (a caderneta 7 dias salva "Caderneta de \<dia\>" ali). Editar modelo é trabalho de admin → fica no desktop. |
| 32 | Gerar o dia — `POST /logistica/gerar-dia` (B) | **0 chamadas do app**: quem gera o dia é a agenda/cockpit. `dia-preview` (456 chamadas) sobe. |
| 33 | Voz do recado (I) | ⬜ *sobe de carona se o TTS já estiver ligado pela navegação — decidir na leva L8.* |

### FX — só na hora da troca (não é piso, mas se esquecer quebra calado)

1. 🔴 **Push / Firebase religado.** Hoje `google-services` está DESLIGADO no flavor `logistica2`
   (o `google-services.json` só declara `br.com.hbxsystem` e `.logistica`). Quando o
   applicationId voltar a ser `.logistica` na troca, tem que religar o plugin — senão o push
   morre em silêncio (a chamada já vive dentro de `runCatching`).
2. 🔴 **Apagar `logistica2/assets/app/app.js` (13.688 linhas) e `app.css`.** O `index.html` não
   carrega nenhum dos dois — são **1,1 MB de peso morto** no APK e, pior, dão a impressão falsa de
   que "o código velho está lá de reserva". Não está.
3. applicationId → `br.com.hbxsystem.logistica` · sai o `-bancada` do versionName · piso do
   versionCode acima do publicado · `logistica2` volta pra digital do APK (`collectApkInputFiles`).

### SOBE — os outros 118 itens

Tudo o que **não** está nas duas listas acima. Em especial, três que não são "feature" e travam a
troca se faltarem:

- 🔴 **Aviso de atualização** (`appUpdateModal`, R). Sem ele **a troca é a última atualização que o
  celular do André recebe na vida** — arrebenta o cordão de entrega. Gate `HBX_V2` pendente.
- 🔴 **Pulso + Ver Tela + Erros do cliente** (Q, 3 itens). São 3.914 chamadas de espelho em 2
  semanas: é o suporte do dono ao único cliente vivo. Sem isso ele fica cego justamente na troca.
- 🔴 **Navegação completa** (D): voz, bússola, velocímetro, ETA ao vivo, retraço, traço OSRM,
  enquadrar, garagem, modo navegação, manter tela acesa. **Decisão do dono: entra no piso** — "o
  André já quer pular pro GPS".

> **Medida que ordenou a prioridade:** trilha de tela do André (pulso, hoje+ontem) —
> `clientes 138 · caderneta 108 · caderneta-venda 86 · ajustes 24 · cliente-ficha 20 · rota 17 ·
> montagem 8 · produtos 8 · chat 2`. A tela nº1 dele é **Clientes**, hoje 0% ligada (15 de 15
> itens faltando). Único cliente externo vivo = company 41 (Andre Barata); 46 e 47 sumiram em
> 19/07 e 25/07; 5, 39 e 48 são tenants do próprio dono.

---

## A. Casca, navegação e leis de tela

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Casca do app (cabeçalho + corpo + abas) — `app.js:2388 shell()` | | `mock.js` `hdr()` + `nav()` + `shellRota()` — LIGADO | |
| Render central / reconciliador — `app.js:7265 render()` + `native.js mount()` | | `mock.js pintar()` (camadas, transições) — LIGADO | |
| Troca de tela — `app.js:9287 navigateTo()` | | `mock.js ir()` — LIGADO | |
| 5 abas: route, clients, products, chat, settings — `app.js state.view` | | 6 abas no `nav()`: caderneta, clientes, rota, produtos, chat, ajustes — LIGADO | |
| Voltar do Android (Lei 10) — `app.js window.HBXApp.handleBack` | | `ponte.js` `HBXApp.handleBack` (trava obrigatória segura) — LIGADO | |
| Teclado não cobre campo (Lei 4) — `app.js:2701 syncKeyboardViewport()` + `2602 enhanceKeyboardFields()` | | `ponte.js` visualViewport → `--teclado` + `keyboard-open` — LIGADO (campos ainda sem `enhance`) | |
| Enter avança campo / confirma (Lei 5) — `app.js applyKeyboardHints` | | NÃO EXISTE | |
| Modal central (wizard/decisão) — `app.js:2560 centerModal()` | | `mock.js portao()` (aceita objeto) — LIGADO | |
| Bottom-sheet (operação de rua) — `app.js:9425 showSheet()` | | `mock.css .sheet` + telas do mock — CASCA | |
| Confirmação — `app.js:2405 confirmationOverlay()` | | `mock.js confirmar()` — CASCA (sem ação real) | |
| Toast único — `app.js:577 toast()` | | `mock.js avisar()` (cartão que chega) — CASCA | |
| Skeleton / carregando — `app.js:2876 showLoading()` | | `mock.js` estado `carregando` (esqueleto) — LIGADO (usado no montar) | |
| Estado vazio — `app.js:2544 empty()` | | `mock.css .vazio` + "Sem paradas hoje" — LIGADO | |
| Erro pra humano (Lei 6) — `app.js:509 humanApiError()` | | `ponte.js humano()` — LIGADO | |
| Segurar pressionado pra excluir (Lei 1) — `app.js is-hold-arming` | | `mock.js` tela `gestos` (demo) — CASCA | |
| Transições em tudo (Lei 9) — `app.css screen-enter-*` | | `mock.css` (6 padrões, tela `padroes`) — LIGADO | |
| Tema claro/escuro + virada de turno — `native.js applyTheme` | | `ponte.js` delega ao native (1 dono) — LIGADO | |
| Abertura (splash) — `OpeningActivity.kt` + `opening.html` | | `mock.js` tela `entrada` (abertura própria) — LIGADO | |
| Pareamento por código — `PairingActivity.kt` (nativo) | | Mesmo nativo, com a cara antiga — LIGADO (decisão aberta: vestir ou nascer no mock) | |

## B. Rota do dia

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Tela da rota — `app.js:5150 routeScreen()` | | `mock.js T.rota` (7 estados) — LIGADO | |
| Lista de paradas / cartão — `app.js stopCard()` | | `mock.js stop()` + `listaParadas()` — LIGADO | |
| Controle transmux (botão do meio + satélites) — `app.js:5256 routeTransmuxControl()` | | `mock.js transmux()` + `ROTA_ESTADOS` — LIGADO (montar/iniciar/cancelar) | |
| Carregar rota do dia — `GET /logistica/rota` | | `ponte.js carregarRota()` — LIGADO | |
| Prévia do dia — `GET /logistica/dia-preview` | | NÃO EXISTE | |
| Gerar o dia — `POST /logistica/gerar-dia` | | NÃO EXISTE | |
| KPIs do topo (paradas/entregues/saldo/dinheiro/pix) — `app.js routeScreen` | | `DADOS.rota` + `ponte.js` (`caderneta/resumo`) — LIGADO | |
| Barra do dia (X de N, % , marcado) — `app.js` | | `DADOS.rota.dia*` — LIGADO | |
| Filtro Fila/Entregue — `app.js` | | `DADOS.rota.filtro*` — LIGADO (número real, botão sem ação) | |
| Painel de créditos do dia — `app.js:5145 creditosDiaPanel()` | | `DADOS.rota.creditos` (`/credits/me`) — LIGADO | |
| Próxima parada (overlay + contagem) — `app.js:2404 nextStopOverlay()`, `9408 openNextStop()` | | NÃO EXISTE | |
| Banner "sem sinal" / "rota pausada" — `app.js` | | `mock.js` estados `semsinal`/`pausada` — CASCA | |
| Encaixar parada avulsa na rota — `app.js:1759 encaixarNaRota()` | | NÃO EXISTE | |
| Rota indicada pela Central (aceitar/negar) — `app.js:2443 rotaIndicadaOverlay()` | | `mock.js` satélite "Rotas recebidas" — CASCA | |
| Missões / despertador — `app.js:2469 missoesOverlay()` + `MissaoAlarme.kt` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |

## C. Montagem, conferência e dinheiro da rota

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Planejar rota — `POST /logistica/rota/planejar` | | `ponte.js montarRota()` — LIGADO | |
| Conferir (semáforo de endereço) — `POST /logistica/rota/conferir` | | `ponte.js montarRota()` (conta avisos) — LIGADO | |
| Tela de conferência de rota — `app.js:7720 rotaConferenciaModal()` | | Portão de aviso (contagem) — parcial; tela própria NÃO EXISTE | |
| Salvar montagem — `app.js:7061 montagemSalvarModal()` | | `mock.js T.montagem` botão "Salvar rota" — CASCA (gancho sem ação) | |
| Reordenar paradas (arrastar) — `app.js manualOrderParadas` / `setRouteOrdemManual` | | `mock.js` alça `.grip` na montagem — CASCA | |
| Otimizar ordem — `app.js` (motor de rota) | | `mock.js` botão "Otimizar ordem" — CASCA | |
| Portão "endereços com erro" — `POST /logistica/rota/checar-enderecos` + `app.js:6944 checagemModal()` | | Portão do mock com contagem real — parcial (sem a lista/edição) | |
| Tirar do dia — `POST /logistica/rota/tirar-do-dia` | | NÃO EXISTE | |
| Limpar dia — `POST /logistica/rota/limpar-dia` | | NÃO EXISTE | |
| Descartar montagem — `POST /logistica/rota/descartar-montagem` | | NÃO EXISTE | |
| Prévia de custo — `GET /logistica/rota/custo-preview` + `app.js custoPreviewBanner()` | | `ponte.js iniciarRota()` (portão com número do servidor) — LIGADO | |
| Iniciar rota (DEBITA) — `POST /logistica/rota/iniciar` | | `ponte.js iniciarRota()` — LIGADO no código; **débito não provado** (bancada sem crédito) | |
| Encerrar / cancelar rota — `POST /logistica/rota/encerrar` | | `ponte.js cancelarRota()` — LIGADO | |
| Pausar / continuar rota — `app.js pauseRouteOnDevice()` (estado local) | | `mock.js` estados `pausada`/`rodando` — CASCA | |
| Finalizar rota — `app.js finalizarRotaModal()` | | `mock.js` botão "Finalizar" — CASCA | |
| Trava de crédito (bloqueio) — `app.js creditsLockOverlay()` | | Portão "Créditos insuficientes" — LIGADO | |
| Sanitizador de endereço — `POST /logistica/rota/sanitizar` | | NÃO EXISTE | |

## D. Mapa e navegação GPS

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Montar mapa (maplibre) — `app.js:2298 mountRouteMap()` | | `ponte.js montarMapa()` — LIGADO | |
| Estilo com tiles do aparelho — `app.js mapaEstiloComTilesLocais()` | | `ponte.js estiloDoMapa()` (sprite/glyphs absolutos) — LIGADO | |
| Tiles offline PMTiles — `PmTilesReader.kt` + `MainActivity` `/tiles/` | | Mesmo Kotlin — LIGADO (60 km gravados no g15) | |
| Baixar mapa offline (Ajustes) — `app.js:5600 mapaOfflineDispararDownload()` + `5513 mapaOfflineSettingsSection()` | | NÃO EXISTE | |
| Apagar mapa baixado — `H.mapaOfflineApagar` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Pinos das paradas no mapa — `app.js applyRouteMarkers()` | | `ponte.js` markers numerados — LIGADO | |
| Enquadrar rota — `app.js:2740 fitRouteMap()` | | NÃO EXISTE | |
| Garagem / estacionar mapa (trocar de aba) — `app.js:596 garagemDoMapa()`, `606 estacionarRouteMap()` | | NÃO EXISTE | |
| Repintar mapa no tema — `app.js:758 repaintThemedMapLayers()` | | NÃO EXISTE (mapa nasce no tema atual) | |
| Traço da rota pelas ruas (OSRM) — `app.js:1998 drawNavLegLayers()` | | NÃO EXISTE | |
| Reta tracejada (sem trajeto) — `app.js:1962 desenharRetaTracejada()` | | NÃO EXISTE | |
| Voz da navegação — `app.js:1694 processNavVoice()` + `H.speak` | | NÃO EXISTE | |
| Manobra grande (distância + verbo + rua) — `app.js osrmStepInstrucao()` | | `mock.js` `.gps-manobra` com texto do MOCK — CASCA | |
| Chip de chegada/ETA ao vivo — `app.js:1636 atualizarChipEta()` | | `mock.js` rodapé com número do MOCK — CASCA | |
| Velocímetro — `app.js` faixa GPS | | `mock.js` `.gps-vel` com número do MOCK — CASCA | |
| Bússola / mapa girando pelo rumo — `app.js:1122 ligarBussola()` | | `mock.js` `.gps-bussola` — CASCA | |
| Faixa de GPS (precisão/estado) — `app.js:1386 atualizarFaixaGps()` | | NÃO EXISTE | |
| Retraço quando sai do caminho — `app.js:1922 checkNavOffPath()` + orçamento `navRecalcLimites` | | NÃO EXISTE | |
| Recentralizar — `app.js ensureRouteRecenterControl()` | | `mock.js` botão no vidro — CASCA | |
| Modo navegação (tela cheia, barras fora) — `H.modoNavegacao` → `MainActivity` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Manter tela acesa — `H.manterTelaAcesa` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Toque no mapa (pino/balão) — `app.js:2190 wireMapTap()`, `abrirBalaoLocal()` | | NÃO EXISTE | |
| Abrir navegação externa (Maps/Waze) — `app.js abrirNavegacao()` + `NavigationLauncher.kt` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Chegar de fora (`geo:`/link do Maps) — `DestinoCompartilhado.kt` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |

## E. Chegada e entrega

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Folha completa (stepper, motivos, comprovante) — `app.js:5894 deliverySheet()` | | `mock.js T.folha` — CASCA | |
| Folha simples (cobrança simples) — `app.js:5803 deliverySimpleSheet()` | | `mock.js T.venda` — CASCA | |
| Folha offline (financeiro OFF) — `app.js:5891 deliveryOfflineSheet()` | | `mock.js T.folha` (mesma) — CASCA | |
| Não entregue + motivo — `app.js deliverySheet` | | `mock.js T.folhanao` — CASCA | |
| Confirmar entrega — `POST /logistica/entregas/:id/confirmar` | | NÃO EXISTE | |
| Cancelar entrega — `POST /logistica/entregas/:id/cancelar` | | NÃO EXISTE | |
| Reabrir entrega — `POST /logistica/entregas/:id/reabrir` | | NÃO EXISTE | |
| Aviso "estou chegando" (~500 m) — `POST /logistica/entregas/:id/chegando` | | NÃO EXISTE | |
| Comprovante foto — `POST /logistica/entregas/:id/comprovantes` + `H.uploadProof` | | NÃO EXISTE | |
| Comprovante código 6 dígitos — `app.js` (⚠️ `prompt()` nativo não implementado) | | NÃO EXISTE | |
| Carimbo de chegada (`arrivedAt`) — desfecho | | NÃO EXISTE | |
| Tela de chegada nativa — `ChegadaActivity.kt` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Observações do cliente em destaque — `app.js` nas 3 folhas | | `mock.js` `.nota` no cartão — CASCA | |

## F. Caderneta

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Modo caderneta (toggle em Ajustes) — `app.js:12243 cadernetaSettingsSection()` | | NÃO EXISTE | |
| Tela da caderneta — `app.js:11980 cadernetaConteudo()` | | `mock.js T.caderneta` — CASCA | |
| Venda por toque no cliente — `app.js:12312 cadernetaVenderCliente()` + `POST caderneta/vender` | | NÃO EXISTE | |
| Apagar venda (segurar) — `POST caderneta/apagar-venda` | | NÃO EXISTE | |
| Fechamento por forma (dinheiro/pix/cartão/fiado) — `app.js cadernetaFechamento()` | | `mock.js` card de fechamento — CASCA (números reais já no topo da Rota) | |
| Finalizar o dia (qual dia registrar) — `app.js:12090 cadernetaFinalizarModal()` + `POST caderneta/finalizar` | | NÃO EXISTE | |
| Histórico da semana (7 páginas) — `app.js cadernetaHistorico()` | | `mock.js T.semana` — CASCA | |
| Filtros Todos/Devendo/Pago — `app.js cadernetaFiltroChips()` | | `mock.js` chips — CASCA | |
| Ordem por arrasto na caderneta — `app.js cadernetaArrasto*()` | | NÃO EXISTE | |
| Convite do GPS 1×/dia — `app.js:12073 cadernetaConviteGpsModal()` | | NÃO EXISTE | |
| Resumo/medidor do dia — `GET /logistica/caderneta/resumo` | | `ponte.js carregarRota()` (usa o fechamento) — LIGADO parcial | |
| Clientes "sumidos" (2 semanas) — `app.js cadernetaSumidos()` | | NÃO EXISTE | |

## G. Clientes

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Tela de clientes — `app.js:5420 clientsScreen()` | | `mock.js T.clientes` — CASCA | |
| Busca + carga automática — `app.js setupClientsAutoLoad()` | | `mock.js` `.search` — CASCA | |
| Chips de dia — `app.js clientsDiaChips()` | | `mock.js` chips — CASCA | |
| Ficha do cliente — `app.js:5920 clientEditorModal()` | | `mock.js T.ficha` — CASCA | |
| Dias de entrega (porta canônica) — `PATCH /logistica/clientes/:id/dias` | | NÃO EXISTE | |
| Financeiro do cliente — `PATCH /logistica/clientes/:id/financeiro` | | NÃO EXISTE | |
| Histórico do cliente — `GET /logistica/clientes/:id/historico` + `app.js:5727 historicoLinha()` | | NÃO EXISTE | |
| Extrato / score / entregas do cliente — `GET clientes/:id/extrato·score·entregas` | | NÃO EXISTE | |
| Criar cliente — `POST /nucleo/contas` | | NÃO EXISTE | |
| Editar endereço/telefone/local — `PATCH /nucleo/contas·locais·telefones` | | NÃO EXISTE | |
| Anti-duplicata de porta — `GET /nucleo/contas/por-endereco` + `app.js:7194 showDuplicateClient()` | | NÃO EXISTE | |
| Pedir DDD — `app.js:2416 dddPromptOverlay()` | | NÃO EXISTE | |
| CEP → endereço (ViaCEP) + pino — `app.js lerCepENumero()` / `setClientCepStatus()` | | NÃO EXISTE | |
| Gerenciador de dias (agenda) — `app.js:3702 openDayManager()` | | `mock.js T.gerenciador` — CASCA | |
| Produtos do cliente — `GET/POST/PATCH/DELETE /logistica/cliente-produtos` | | NÃO EXISTE | |

## H. Produtos

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Tela de produtos — `app.js:5435 productsScreen()` | | `mock.js T.produtos` — CASCA | |
| Catálogo / card — `app.js productCatalogCard()` | | `mock.js` cards — CASCA | |
| Criar/editar produto — `POST/PATCH /logistica/produtos` | | `mock.js T.fichaproduto` — CASCA | |
| Arquivar produto (segurar) — `app.js archiveProductByHold()` | | NÃO EXISTE | |
| Preço do dia / moeda estilo banco — `app.js salvarPrecoDeHoje()`, `attachMoneyInput()` | | NÃO EXISTE | |

## I. Chat e recados

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Tela de chat — `app.js:2493 chatScreen()` | | `mock.js T.chat` — CASCA | |
| Puxar recados — `POST /logistica/recados/puxar`·`pendentes` | | NÃO EXISTE | |
| Portão do recado (trava o Confirmar) — `app.js:2528 recadoPortaoOverlay()` + `GET recados/portao` | | `mock.js` cartão de recado com Entendi/Responder — CASCA | |
| Marcar visto / Entendi — `POST recados/visto`·`:id/entendi` | | NÃO EXISTE | |
| Responder — `POST /logistica/recados/responder` | | NÃO EXISTE | |
| Contador de não lidos (sino) — `app.js quantidadeRecadosNaoLidos()` | | `mock.js` selo no sino (número do mock) — CASCA | |
| Voz do recado — `app.js recadoFala()` + `H.speak` | | NÃO EXISTE | |
| Alarme nativo do recado — `MissaoAlarme.kt` / `MissaoAlarmeActivity.kt` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |

## J. Ajustes

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Tela de ajustes — `app.js:5456 settingsScreen()` | | `mock.js T.ajustes` — CASCA | |
| Ler/gravar config — `GET/PATCH /logistica/config` | | NÃO EXISTE (só leitura solta em `/logistica/config` na prova da ponte) | |
| Financeiro (chaves) — `app.js:6238 financeiroModal()` | | `mock.js T.financeiro` (⚠️ mock é PAINEL, app é CHAVES) — CASCA | |
| Avançado — `app.js:6245 avancadoModal()` | | `mock.js T.avancado` (⚠️ conteúdo diferente) — CASCA | |
| Sons (mestra + voz) — `app.js:6225 sonsModal()`, `6221 soundGroupSection()` | | `mock.js T.sons` (⚠️ mock tem 6 chaves, app tem 2) — CASCA | |
| Histórico — `app.js` modal `historico` | | `mock.js T.historico` (⚠️ mock é de ROTAS, app é do CLIENTE) — CASCA | |
| Consumo e bônus — `GET /logistica/creditos/extrato` | | `mock.js T.consumo` — CASCA | |
| Recarga — `app.js:6085 recargaModal()` + `6060 beginRecargaCheckout()` | | `mock.js T.recarga` — CASCA | |
| Modo offline (ligar/desligar) — `app.js:5666 offlineSettingsSection()` | | NÃO EXISTE | |
| Mapa offline (raio, baixar, apagar) — `app.js:5513 mapaOfflineSettingsSection()` | | NÃO EXISTE | |
| Passeio (entrada) — `app.js:12820 passeioSettingsSection()` | | NÃO EXISTE | |
| Caderneta (toggle) — `app.js:12243 cadernetaSettingsSection()` | | NÃO EXISTE | |
| Versão / info do app — `app.js:5677 versionSettingsRow()`, `3131 appInfo()` | | NÃO EXISTE | |
| Sair / logout — `H.logout` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |

## K. Modo Passeio

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Tela do passeio — `app.js:12828 passeioConteudo()` | | `mock.js T.passeio` — CASCA | |
| Ligar/desligar modo — `app.js passeioLigarModo()`/`passeioDesligarModo()` | | NÃO EXISTE | |
| Pino por toque no mapa + chips — `app.js passeioAddPonto()`, `passeioBuscaChips()` | | NÃO EXISTE | |
| Busca de lugar — `GET /logistica/geo/busca` | | NÃO EXISTE | |
| Iniciar passeio (DEBITA) — `POST /logistica/passeio/iniciar` | | NÃO EXISTE | |
| Alarme do tempo no lugar — `PasseioAlarme.kt` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Cartão do tour / progresso — `app.js passeioCartao()`, `passeioProgresso()` | | NÃO EXISTE | |

## L. Leitura de rota (reconhecimento)

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Sessão de leitura — `POST /logistica/leitura/iniciar` + `app.js:5119 leituraAtivaModal()` | | `mock.js T.leitura` — CASCA | |
| Registrar parada (wizard) — `POST leitura/:id/parada` + `app.js leitura*Step()` | | NÃO EXISTE | |
| Trilha GPS — `app.js:4336 leituraTrilhaIniciar()` + `POST leitura/:id/trilha` | | NÃO EXISTE | |
| Finalizar / cancelar sessão — `POST leitura/:id/finalizar`·`cancelar` | | NÃO EXISTE | |
| Fila local da leitura — `app.js leituraQueue*()` | | NÃO EXISTE | |
| Resumo da leitura — `GET leitura/:id/resumo` | | NÃO EXISTE | |

## M. Rotas salvas, modelos e indicadas

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Lista de rotas salvas — `GET /logistica/rota-modelos` | | `mock.js T.salvas` — CASCA | |
| Editor de modelo — `app.js:6325 routeModeloEditorModal()` | | NÃO EXISTE | |
| Criar/editar/apagar modelo — `POST/PATCH/DELETE rota-modelos` | | NÃO EXISTE | |
| Gerar rota do modelo — `POST rota-modelos/:id/gerar` | | NÃO EXISTE | |
| Indicar rota pra alguém — `POST rota-modelos/:id/indicar` | | NÃO EXISTE | |
| Aceitar/negar indicação — `POST rota-indicadas/:id/responder` | | NÃO EXISTE | |

## N. Rota rápida (cadastro na rua)

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Tela/modal da rota rápida — `app.js:6490 montagemRapidaModal()` | | `mock.js T.rapida` — CASCA | |
| Campo único (endereço escrito) — `GET /logistica/geo/busca` | | NÃO EXISTE | |
| CEP + número → pino — `GET /logistica/geo/cep` | | NÃO EXISTE | |
| Link do Maps colado — `GET /logistica/geo/link` | | NÃO EXISTE | |
| Reverse geocode — `GET /logistica/geo/reverse` | | NÃO EXISTE | |
| Cadastro anti-lixo (nome de gente, reusa conta) — `app.js nomeDeCadastroValido()` | | NÃO EXISTE | |
| Criar entrega avulsa — `POST /logistica/entregas` | | NÃO EXISTE (a ponte usou só em teste) | |

## O. Offline

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Preparar pacote offline — `POST /mobile/logistica/offline/prepare` | | NÃO EXISTE | |
| Sincronizar fila — `POST offline/sync` + `H.flushOffline` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Comprovantes offline — `POST offline/proofs` + `OperationalUploadJobService.kt` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Intercepta mutação e enfileira — `NativeApiClient.kt interceptMutation` | | Mesmo Kotlin — LIGADO (vale pra qualquer POST da ponte) | |
| Modo offline ligado/desligado — `H.setOfflinePreferences` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Banner/estado offline na tela — `app.js offlineModeActive()` | | `mock.js` estado `semsinal` — CASCA | |

## P. Créditos e recarga

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Saldo de créditos — `GET /credits/me` | | `ponte.js carregarRota()` — LIGADO | |
| Pacotes / preço — `GET /financeiro/payments-config` | | NÃO EXISTE | |
| Comprar crédito (checkout nativo) — `H.openRechargeCheckout` + `RechargeCheckoutActivity.kt` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Extrato de consumo — `GET /logistica/creditos/extrato` | | NÃO EXISTE | |

## Q. Pulso, Ver Tela e erros do cliente

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Pulso (tela atual a cada 5 s) — `app.js:12501 telaAtualDoPulso()` | | NÃO EXISTE | |
| Espelho da tela (Ver Tela) — `app.js:12555 espelhoSincronizar()` + `POST logistica/espelho/quadro` | | NÃO EXISTE | |
| Erros do cliente (buffer de 20) — `app.js:12684 registrarErroDoCliente()` | | NÃO EXISTE | |

## R. Nativo (Kotlin) — compartilhado pelos dois apps

| Código (app antigo) | check | Código novo (logistica2) | check |
|---|---|---|---|
| Ponte JS↔Kotlin — `NativeAppBridge.kt` / `HBXAndroid` | | Mesmo Kotlin + `ponte.js window.API` — LIGADO | |
| Allowlist de endpoint — `NativeApiClient.kt isMobileEndpointAllowed` | | Mesmo Kotlin — LIGADO (⚠️ `DELETE /logistica/entregas` fora dela) | |
| Aviso de atualização (1× por versionCode) — `app.js:3180 appUpdateModal()`, `3215 startAppUpdate()` | | NÃO EXISTE (⚠️ gate `HBX_V2` pendente) | |
| Sons do app — `HbxSoundEngine.kt` + `H.playSound` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Vibração — `H.vibrate` | | `native.js` disponível; sem chamador — NÃO EXISTE (no JS) | |
| Voz (TTS) — `H.speak` / `speakStop` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Push / Firebase — `HbxFirebaseMessagingService.kt` | | ⚠️ google-services DESLIGADO no flavor — NÃO EXISTE | |
| Permissão de localização — `H.requestLocationPermission` | | `ponte.js` usa `navigator.geolocation` — LIGADO parcial | |
| Tracking ao vivo (sessão/posições/eventos) — `TrackingSync.kt` + `POST mobile/logistica/tracking/*` | | Kotlin existe; sem chamador — NÃO EXISTE (no JS) | |
| Ligar / WhatsApp / Maps — `H.call`·`whatsapp`·`maps` | | `native.js` disponível; sem chamador — NÃO EXISTE (no JS) | |
| Pareamento do aparelho — `PairingActivity.kt` + `POST /mobile/devices/pair` | | Mesmo nativo — LIGADO | |
| Sessão / credencial — `DeviceCredentialStore.kt`, `MobileEntrySession.kt` | | Mesmo Kotlin — LIGADO | |
| Saída do app (2× voltar) — `MainActivity confirmarSaida()` | | Mesmo Kotlin + `handleBack` — LIGADO | |
| Fechamento (ClosingActivity) — `ClosingActivity.kt` | | Mesmo Kotlin — LIGADO | |

---

## S. O que existe no APP NOVO e não vem do app antigo

| Código (app novo) | check | O que é | check |
|---|---|---|---|
| `scripts/casca-injetar.js` | | Gera `mock.css`/`mock.js`/`index.html` a partir do mock; 5 adaptações declaradas | |
| `scripts/casca-conferir.js` | | Prova que a casca sobe e pinta 66/66 igual ao mock | |
| `scripts/casca-antes-e-depois.js` | | Portão: refatoração no mock não pode mover pixel (33 telas × 2 modos) | |
| `scripts/casca-prova.js` | | Mede alcance da casca + contraste WCAG, separando herdado de novo | |
| `docs/mockups/logistica2.0/cascas/ferro.css` | | Casca de prova: 1 arquivo troca as 66 telas×modos | |
| `mock.js DADOS` + `usarDados()` | | Seam de dados: o único lugar por onde dado real entra | |
| `ponte.js camadaViva()` | | Lê sempre a camada viva (a última), nunca a que está morrendo | |
| 33 telas do mock | | Vocabulário visual completo, incluindo telas-especificação (gestos, portões, padrões) | |
