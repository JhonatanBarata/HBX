# PR10082026 — A CHEGADA AUTOMÁTICA VOLTA (religar, não construir)

**Status: F1–F4 CONSTRUÍDOS E PROVADOS na bancada. ⬜ falta publish + prova no g15.**

| Fase | Estado | Onde |
|---|---|---|
| F1 · a precisão viaja no confirmar | ✅ **JÁ PUBLICADO** (o publish do dono das 03:04 levou) | `1ad75dea` |
| F2 · o geofence é armado/desarmado | ✅ commitado, **não publicado** | `f0ce9498` |
| F3 · a folha abre sozinha no `hbx:arrival` | ✅ commitado, **não publicado** | `f0ce9498` |
| F4 · a barra da navegação + "Registrar" | ✅ commitado, **não publicado** | `bdb4dff1` (a parte da ponte foi junto no `3e876313` de outra sessão) |

**Provas:** `node scripts/prova-chegada.js` → **29/29**, com GPS de verdade do
Playwright (accuracy real, não dublada). `casca-conferir` 62/62 · `prova-fluxo-rota`
61/61 · `prova-meus-clientes` 20/20 · `prova-navegar` 17/17. Contraste da barra
nova medido nos 2 modos: pior caso 7,91:1 (AA).

⚠️ **Ainda na mão do dono (knobs, não código):** `raioChegadaM` da 41 está em
**20 m** — com GPS de celular quase não dispara; o padrão é 60. E o
`avisoChegandoEnabled` da 41 segue **off** (decisão dele de 04/08).

## A cena (o critério de aceite)

> O André inicia a rota e dirige. Ao entrar no raio da porta do cliente, o celular
> apita e **a folha de venda abre sozinha** com o nome, o que entregar e quanto cobrar
> — mesmo com o app em segundo plano (aí vem notificação + alarme, e o toque abre a
> folha). Ele confirma como sempre; **o endereço do cliente se corrige sozinho** a
> cada entrega confirmada na porta. No fim do dia, o **Fechamento** bate o caixa —
> como hoje, sem tela nova.

Era assim que o app velho trabalhava. A fusão de 07/08 (`8a491ffe`) matou os
CHAMADORES e deixou o motor nativo inteiro — é o padrão conhecido de
`o-padrao-da-fusao` (capacidade viva, fio cortado).

## O que já existe e NÃO se toca

| Peça | Onde | Estado |
|---|---|---|
| Serviço de GPS + geofence + som + notificação + tela de alarme | `RotaService.kt`, `ChegadaActivity.kt`, `RotaState.kt` | vivo, intacto |
| Porta de entrada `H.activateRoute` / `H.stopRoute` | `native.js:440-441` → `HBXShellBridge.setRota/clearRota` | exposta, sem chamador |
| Pedido de permissão (localização + notificação, com explicação) | `MainActivity.solicitarAtivacaoRota` | vivo — roda sozinho no 1º `activateRoute` |
| Evento `hbx:arrival` quando chega | `MainActivity.entregarChegada:641` | disparado pra um ouvinte que não existe |
| Correção do pino no servidor (`gps_entrega`, teto 60 m) | `logistica.service.ts` `realimentarCoordenadaPorta` | vivo — mas nunca recebe `accuracy` |
| Folha de venda / folha completa | telas `venda`/`folha` do mock, `abrirParada()` em `ponte.js` | vivas — hoje só abrem no TOQUE |
| Fechamento do dia | tela `fechamento` | vivo — não muda NADA |

**Kotlin: zero mudança. Mock: zero mudança. Backend: zero mudança.**
Todo o trabalho é em `EntregaShell/app/src/logistica/assets/app/ponte.js`.

## O modo Fechamento — como entra nisso

Ele **já é** o destino do dinheiro. A chegada automática só troca o *gatilho* de
abrir a folha (toque → raio); o resto do rio é o de hoje:

```
chegou no raio → folha de VENDA abre (a mesma do toque)
→ confirma (pix/dinheiro/cartão/fiado) → soma no resumo do dia
→ fim do dia: tela FECHAMENTO bate o caixa (intocada)
```

Nenhuma tela nasce, nenhuma morre. O toque manual continua funcionando igual —
a chegada é um segundo caminho pra MESMA porta (`abrirParada`).

## F1 — A precisão viaja no confirmar (o maior retorno, a menor mudança)

**Defeito:** `confirmarEntrega` manda `lat/lng` sem `accuracy` (`ponte.js:10033`).
O servidor exige `accuracy <= 60` (`gpsDeOuro`) pra aceitar a coordenada — sem o
campo, **nenhuma entrega corrige endereço nenhum** desde a fusão. Na 41: só 10
pinos `gps_entrega`, o último de 05/08 (medido no VPS hoje).

**Cura:** onde vai `corpo.lat/lng`, vai junto `accuracy: ultimoFix.precisaoM`
(quando finito). O `ultimoFix` já guarda a precisão desde 07/08 — ela morre a um
passo do corpo.

- Só no `confirmar` (é ele que realimenta; o `cancelar` não corrige pino).
- Fila offline: `logistica-offline.service.ts` repassa por LISTA BRANCA — conferir
  que `accuracy` está na lista; se não estiver, é 1 linha ADITIVA no backend (a
  única exceção ao "backend zero" deste plano, e só se a medição mandar).

## F2 — Religar o geofence (o sync mora no `carregarRota`)

**Um ponto só de sincronização**, dentro do `carregarRota` — ele já roda no boot,
em todo toque, em todo desfecho e na virada do dia. Fonte única, sempre verdade:

- `estadoRota` **rodando/pausada** e há pendente com pino →
  `H.activateRoute({ raioM, paradas, routeId, mode, trackingSessionId })`
  - `paradas` = pendentes com `pinoValido` (id, nome, lat, lng) — a régua de pino
    que o app já usa (`pinoDa`)
  - `raioM` = `config.raioChegadaM` (o `config` já vive na ponte via
    `carregarBarra`; ausente → 60; o Kotlin clampa 20–1000)
  - `routeId`/`trackingSessionId` = do payload do `GET /logistica/rota` (já vêm);
    `mode` = `trackingRequired ? 'TRACKED' : 'ESSENTIAL'` — a MESMA régua do app
    velho; TRACKED sem routeId o Kotlin rebaixa sozinho pra ESSENTIAL
- Qualquer outro estado → `H.stopRoute()` (mata o serviço; rota encerrada no
  desktop não pode deixar GPS ligado no bolso — o `requestStop` do Kotlin tem
  debounce, rajada não pisca)

**Ordem no Iniciar:** o `activateRoute` acontece via `carregarRota` que roda ANTES
do `ir('mapa')` no fim do `iniciarRota` — o diálogo nativo de permissão
(localização + notificação) resolve primeiro, e o `armarGps` do WebView encontra a
permissão já na mão. Um pedido só, na hora certa.

**Desfecho re-sincroniza de graça:** confirmar/não-entregue já chamam
`carregarRota` → a parada fechada sai dos alvos sozinha. O dedupe de disparo é do
`RotaState` (`disparados`), não nosso — reabrir parada não re-apita, por desenho.

## F3 — O ouvinte do `hbx:arrival` (a folha abre sozinha)

```js
document.addEventListener('hbx:arrival', (ev) => { ... });
```

- Acha a entrega em `ENTREGAS` pelo `deliveryId`. Não achou, ou status já
  fechado → **ignora calado** (chegada atrasada de parada morta).
- Já tem folha aberta (`aberta != null`) → ignora — nunca roubar a tela no meio
  de outra venda; o alvo continua nos `disparados` do nativo e a notificação fica.
- Rota não está na rua → ignora.
- Passou pelos portões → `abrirParada(id)`: é a MESMA função do toque — carimba a
  chegada (`arrivedAt`), escolhe venda × folha pela config e navega. Zero caminho
  novo de dinheiro.
- **Sem `H.speak` no JS**: o `RotaService.falar()` já diz "Chegou: Fulano" — duas
  vozes é eco (armadilha documentada dos sons do Iniciar).

## F4 — "Registrar local" na navegação (ideia do dono, 10/08)

> *"registrar local teria q ser aqui, com GPS ativo. O André q se adapte nesse
> sentido!!"* — na tela de dirigir, botão na ESQUERDA da barra de baixo
> (espelho do "Sair").

**Fato medido antes do desenho:** a tela Fechamento de hoje é SÓ dinheiro
(formas + total + Fechar o dia) — o roster saiu de lá por ordem do próprio dono.
As opções pedidas existem TODAS, cada uma na sua tela: **avulsa** (vender pra
quem não está no dia — "conta no fechamento" é copy do próprio app),
**novocliente** (o "+", com "Usar meu local" → CEP/rua/bairro do GPS) e
**ficha** (editor completo com Salvar real). O botão abre ESSAS portas; o
dinheiro cai no fechamento sozinho, como hoje.

**O gesto:** toque em "Registrar local" → **carimba o fix NA HORA** (GPS ativo,
parado na porta = precisão de ouro) → portão com 3 saídas, todas existentes:

1. **Vender aqui** → fluxo da avulsa, semeado com o fix
2. **Cadastrar cliente** → novocliente com endereço JÁ preenchido pelo fix
   (`geo/reverse`, o mesmo do "Usar meu local" — sem toque extra)
3. **Corrigir {parada da vez}** → a ficha do cliente da parada atual, com o
   pino do fix oferecido — é a inteligência antiga ("chegou → corrija o
   endereço"), no gesto dele

**Por que compõe com F1–F3 (e não compete):** o geofence cobre o cliente
CONHECIDO com pino bom; o botão cobre os buracos — cliente novo, venda
improvisada e **pino errado** (o caso em que o geofence nunca dispara; 83
clientes da 41 sem fonte de pino nenhuma, medido 10/08). Cada uso converge a
base.

### O desenho, como o dono pediu (10/08) — FEITO

> *"abaixo de chegada, restante e distancia crie os botoes, 3 opcoes"*

Os números sobem pra uma linha própria; embaixo fica só o que se aperta.
**Numero se LÊ, botão se APERTA** — misturar os dois na mesma fila (era o caso:
o "Sair" espremido ao lado de três números com que não tem nada a ver) põe o
polegar decidindo entre coisas de natureza diferente. O **Sair fica na direita**,
no mesmo canto do polegar de sempre: a tela mudou, o gesto que ele já tem na
memória não.

```
 👣 Parada 1 de 51 · Gislaine
 05:08          2 h 10        73,5 km
 chegada        restante      distância
 [ ◎ Registrar ] [ ▤ Fechamento ] [ Sair ]
```

Os nomes são os que o dono deixou a meu critério, e ele edita fino depois.
"Registrar" é o verbo curto de *registrar o local onde eu estou*.

**Como ficou por dentro:** o `portao()` do mock ganhou **ação por botão** (4º
campo da ação). O `acaoPrincipal` que já existia resolve o portão que
*pergunta* (um sim, um não); não resolve o que **oferece três portas**, onde
nenhuma é "a principal". É aditivo — todos os portões de antes seguem byte a
byte, e o `casca-conferir` (62/62) é quem prova isso.

**Prova F4 (bancada, 11 cenas):** as três opções existem · os números ficam na
linha de cima · o Sair continua à direita · **nenhum dos três é botão morto** ·
o Registrar abre a escolha com a precisão do GPS na frente · cada saída cai numa
tela que já existe (`novocliente` com o endereço da porta preenchido, `rapida`,
e a `ficha` do cliente da vez — provado pelo NOME dentro do campo, não pelo
texto solto da tela).

⬜ **Falta a prova no g15** (§1 do hbxapk): publicar → parado na porta com rota
rodando → o alarme toca e a folha abre sem toque → confirmar → conferir
`geoFonte='gps_entrega'` no banco.

## O que NÃO entra (de propósito)

- **Aviso WhatsApp "estou chegando" da 41** — desligado pelo dono em 04/08
  (decisão registrada). O anel de 500 m (`anelDeChegada`) já obedece a chave;
  nada a fazer.
- **Raio da 41 = 20 m** — knob do dono no desktop (`raioChegadaM`). Com GPS de
  celular, 20 m quase não dispara; **recomendo 60**. Ele muda sozinho no /logistica,
  não é código.
- **Telas novas / Kotlin / endpoints** — nada.

## Riscos e freios

| Risco | Freio |
|---|---|
| Folha abrindo em cima de venda em andamento | portão `aberta != null` (F3) |
| GPS ligado pra sempre com rota fechada | `H.stopRoute()` no ramo "não rodando" do sync (F2) |
| Voz dupla na chegada | JS não fala; só o nativo (F3) |
| Rota de 97 paradas | teto nativo `MAX_STOPS = 100` — cabe; acima disso o corte é do Kotlin |
| `routeActivated()` do Kotlin gritando pra ninguém | sem ouvinte JS = no-op seguro (era fonte de som duplo no app velho — NÃO criar ouvinte) |
| Chegada com app fechado | já resolvido pelo nativo (notificação + `ChegadaActivity`); o `hbx:arrival` chega quando o app volta à frente |

## Provas (portões antes do publish)

1. **Bancada (Playwright, padrão `casca-conferir`):** stub de `window.HBX` conta
   chamadas — rota rodando → 1 `activateRoute` com os pendentes certos; desfecho →
   alvos encolhem; rota encerrada → `stopRoute`; `dispatchEvent('hbx:arrival')` →
   tela vira `venda` do cliente certo, 1 vez; com folha aberta → nada.
2. **g15, build real:** parada de teste com pino NO MEU local (company 39/bancada)
   → Iniciar → diálogo de permissão → parado dentro do raio, o alarme toca e a
   folha abre sem toque. Confirmar → conferir no banco `geoFonte='gps_entrega'`
   com o accuracy chegando.
3. **Regressão:** toque manual continua abrindo folha; Fechamento intocado
   (mesmos números antes/depois); `cd Webwhats`-style não se aplica — gates são
   typecheck do repo + provas acima.

## Fases e entrega

- F1 → F2 → F3 → F4, **um commit por fase**, prova antes do seguinte (menor
  caminho até resultado visível). F1–F3 são só `ponte.js`; F4 toca o mock
  (pipeline pele20) e por isso vem por último, com o `pele20-antes-e-depois`
  como portão.
- Publish sobe o piso do APK sozinho (ponte.js entra na digital) — motoristas
  recebem pelo aviso. Depois do publish: prova no g15 NO BUILD PUBLICADO (§1 do
  hbxapk).
