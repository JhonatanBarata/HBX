# PR07082026 — FECHAR O LOGISTICA2: ligar o que falta e devolver pro VPS

> **Pra que serve:** este documento é o ÚNICO que a próxima sessão precisa ler pra
> terminar a frente. Ele diz o que está pronto, o que falta **endpoint por endpoint**,
> como rodar a bancada e como fazer a troca. Nada aqui depende do chat anterior.
>
> **Ordem do dono (07/08):** *"crie um plano do que falta aqui, incluindo ligar todos
> endpoints e voltar pro vps essa versão, 100% ela."*
>
> **Leia junto:** `PR06082026-RECOMECO-LOGISTICA2.md` (o plano-mãe, com as 4 leis e o
> mapa de fiação) e `INVENTARIO-APP-ANTIGO-VS-NOVO.md` (a lista item a item + o CORTE
> de 06/08, que diz o que NÃO sobe).

---

## 1. ESTADO MEDIDO — 07/08/2026

**14 commits locais, nada publicado.** `HEAD` = `267d8e06`.

> **Ordem do dono no mesmo dia, depois deste plano nascer:** *"centralize os dados
> no círculo do cliente"* · *"remova a abertura anterior e deixe essa nova que
> fizemos"* · *"pq os clientes não estão com transição das telas? combinamos
> igualdade na casca"*. **As três estão feitas e provadas** na §4.6 — sobra só o
> desfecho do pareamento (§6.1), que não se prova sem desvincular o aparelho.

| Leva | Estado | Prova |
|---|---|---|
| L1 rota do dia | ✅ | paradas reais no g15 |
| L2 montar → iniciar → encerrar | 🔶 | falta só o Iniciar que DEBITA (bancada sem crédito) |
| L3a mapa | ✅ | maplibre + PMTiles offline no aparelho |
| **L3b navegação** | 🔶 | cromo com fonte (seam + 3 portas) medido na bancada · §4.1 · falta o TRAÇO no mapa |
| L4 entregar / não entregar | ✅ | `arrivedAt`, `receiptMethod` e motivo medidos no banco |
| L5 caderneta + semana | ✅ | fechar o dia criou a "Caderneta de Sexta" |
| L6 clientes + ficha | ✅ | número, CPF, dias e o pino morto medidos |
| L7 produtos | ✅ | preço 9 → 9.5 medido |
| L8 chat e recados | ✅ | visto, resposta e "Entendi" medidos |
| L9 ajustes / recarga / consumo | ✅ | `modoCaderneta` t→f pela tela |
| L10 rotas salvas | ✅ | "Abrir" gerou a rota (entregas 0→1) |
| L10 rápida / gerenciador | ⬜ | **ver §4.2 e §4.3** |
| **Casca — círculo do cliente** | ✅ | folga 11,8/11,8/10/10 medida, 2 modos · §4.6.1 |
| **Casca — transição com dado real** | ✅ | 13 animações vivas com servidor em 200 ms · §4.6.2 |
| **Abertura única** | ✅ | app frio no g15, 12 quadros, uma cena só · §4.6.3 |
| **1ª pintura sem mentira** | ✅ | túnel derrubado no g15: aviso, não a lista de exemplo · §4.6.4 |
| **Cromo do GPS sem mentira** | ✅ | 17 campos DADO zerados, 8 COPY de pé; a tela abre com o Encerrar e nada mais · §4.6.6 |

### As 28 portas JÁ ligadas na `ponte.js`
```
/credits/me                          /logistica/produtos            /nucleo/clientes
/logistica/config                    /logistica/produtos/:id        /nucleo/clientes/:id
/logistica/rota                      /logistica/cliente-produtos    /nucleo/contas/:id
/logistica/rota/planejar             /logistica/rota-modelos        /nucleo/locais/:id
/logistica/rota/conferir             /logistica/rota-modelos/:id/gerar  /nucleo/telefones/:id
/logistica/rota/custo-preview        /logistica/recados/me
/logistica/rota/iniciar              /logistica/recados/portao
/logistica/rota/encerrar             /logistica/recados/visto
/logistica/entregas/:id/confirmar    /logistica/recados/responder
/logistica/entregas/:id/cancelar     /logistica/recados/:id/entendi
/logistica/caderneta/resumo          /logistica/creditos/extrato
/logistica/caderneta/finalizar       /logistica/clientes/:id/dias
```

### Portões (rodar SEMPRE antes de commitar)
```bash
node scripts/casca-injetar.js && node scripts/casca-conferir.js && node scripts/casca-antes-e-depois.js
```
- `casca-conferir` **66/66** = a pele é o mock, pixel a pixel. Ele também pega **erro de
  sintaxe que dá tela preta** (já pegou uma crase dentro de comentário HTML).
  🔴 Desde 07/08 ele **copia o `DADOS` do mock pro app antes das fotos**: o app apaga a
  demonstração no boot (§4.6.4) e o `native.js` responde ao `temPonte()` também no
  navegador — sem a cópia o portão media ESTADO, não casca, e acusava 20 telas legítimas.
- `casca-antes-e-depois` só deve acusar a tela que você mexeu de propósito.

---

## 2. A BANCADA — como rodar (sem isto nada anda)

```bash
adb -s ZF5255SMWF reverse tcp:3000 tcp:3000
adb -s ZF5255SMWF reverse tcp:3001 tcp:3001
cd EntregaShell && ./gradlew assembleLogistica2Debug
adb -s ZF5255SMWF install -r app/build/outputs/apk/logistica2/debug/app-logistica2-debug.apk
```
Empresa da bancada: **39 (Atlas Distribuidora)**, usuário `Ana Souza` (id 36).
Banco local: `docker exec app-db-1 psql -U admin -d jhonatan_dev`.

**Armadilhas da bancada, todas medidas:**
1. 🔴 **O backend local NÃO recompila sozinho.** Editou `backend/src`? `docker restart backend`
   e espere o `/health` responder 200. Perdi uma hora caçando um "bug" que era `dist` velho.
2. 🔴 **O `adb reverse` cai** quando o aparelho reconecta. Sintoma: tela sem dado, sem erro.
   Refaça antes de desconfiar do código.
3. 🔴 **O OSRM da bancada é o SERVIDOR PÚBLICO, e o nosso não.** Medido em 07/08:
   - VPS: `hbx-osrm` (`osrm/osrm-backend`) de pé há 8 dias, `OSRM_BASE_URL=http://172.18.0.1:5000`,
     resposta em **341 ms**;
   - bancada: o container local **não tem `OSRM_BASE_URL`** → cai no default do código
     (`router.project-osrm.org`), que responde ~1 s quase sempre e **às vezes estoura os 9 s**
     de timeout. **É ISSO — e só isso — o "OSRM dá timeout" que travou o L2 e o L3b.**
   - **Cura:** apontar a bancada pro nosso OSRM. Ele está preso ao bridge do Docker da VPS
     (`172.18.0.1:5000`, sem porta pública), então daqui só chega por **túnel SSH** — mesmo
     canal do `scripts/vps-run.js`, que já tem credencial. Depois: `OSRM_BASE_URL` no
     container local + `docker restart backend`.
   - ⚠️ **NÃO subir `UPSTREAM_TIMEOUT_MS` de 9 s.** Em produção o roteador é nosso e responde
     em 341 ms; 30 s ali seguraria a tela do motorista numa queda real.
4. Teste no celular é **por TOQUE** (`adb shell input tap`), não por script — a regra §1 do
   `hbxapk.md`. `adb shell input text` corta no espaço: use `%s` ou digite sem espaço.

---

## 3. AS LEIS QUE NASCERAM NESTA FRENTE (não re-quebrar)

1. 🔴 **FALHA DE REDE NÃO APAGA A TELA.** *"Vazio porque o servidor disse vazio"* e *"vazio
   porque a rede caiu"* são opostos. Chamada que falhou **não escreve no seam**. Já mordeu em
   3 lugares (recados, caderneta, crédito). E se a fonte de uma TRAVA falhar, mantém a trava.
2. 🔴 **A LEI DO IF: zero não é informação.** Todo RECORTE (forma de pagamento, contagem,
   bônus) some quando é zero — se todo mundo pagou no pix, aparece só Pix. **Limite de
   propósito:** vale pro recorte, **não** pra medida principal ("0 paradas hoje" fica).
3. 🔴 **O DIA É O DE SÃO PAULO** — nem o relógio do aparelho, nem o do servidor (os dois
   containers rodam **UTC**). Toda porta com data leva `?date=` do `diaOperacional()`.
4. 🔴 **O ENDEREÇO MATA O PINO.** Mudou rua/número/bairro/CEP → `lat/lng = null`. Sem
   coordenada a parada vira "sem trajeto" e a conferência acusa. Barulho > silêncio errado.
5. 🔴 **RASCUNHO NASCE DE TECLA, não de foto.** Fotografar os campos antes de repintar grava
   `""` como se fosse escolha do usuário e apaga o dado do servidor.
6. 🔴 **BEST-EFFORT QUE ENGOLE ERRO PRECISA DE ALARME** (`logger.warn`). Sem isso o recurso
   some da tela sem explicação.
7. 🔴 **CHAVE/BOTÃO SEM PORTA NÃO ENTRA NA TELA.** Pior que ausente.
8. 🔴 **O GANCHO NASCE DO DADO:** `data-acao` só sai no HTML quando o item tem `id` real —
   é o que mantém o mock byte-a-byte idêntico.
9. Copy: **"pino" é PROIBIDA em tela** (Lei 8 do `hbxapk.md`). Diga "local".
10. 🔴 **REPINTE DE DADO NÃO MATA A ENTRADA DA TELA.** O seam repinta sem animar —
    mas ele chega **no meio** da entrada, e a camada nova nascia sem papel nenhum.
    Medido: **13 animações vivas viravam 0** no instante do `usarDados`. A camada
    nova tem que HERDAR as marcas da que estava entrando e o relógio tem que
    CONTINUAR (`currentTime`), nunca recomeçar. Detalhe em §4.6.2.
11. 🔴 **COMPONENTE QUE UM SELETOR LARGO ALCANÇA SE DESARMA NO LUGAR EXATO.** Regra
    de linha do tipo `.cli span` tem 1 classe + 1 tipo e **vence** um componente de
    1 classe (`.ava`). Não se conserta afrouxando a regra larga — conserta-se
    redeclarando no componente. Já é a lei do `.gesto-item`; agora tem a segunda
    vítima medida. E **cascata se MEDE**: 4 propriedades roubadas de uma vez sem
    um erro no console (§4.6.1).

---

## 4. O QUE FALTA LIGAR — endpoint por endpoint

> Ordem sugerida: **4.1 → 4.4 → 4.2 → 4.3**. O 4.4 tem o BLOQUEADOR da troca. A
> **4.5** não é trabalho: é o que ficou de fora. A **4.6** (os 3 pedidos de 07/08)
> já está feita — sobra dela só o desfecho do pareamento, que virou item da §6.1.

### 4.1 — L3b: A NAVEGAÇÃO (🔶 o CROMO está ligado; falta o TRAÇO)

Hoje o mapa é real (L3a) e **o cromo em volta deixou de ser literal do mock**
(07/08, §4.6.6): manobra, velocímetro, ETA, bússola e "Parada N de M" passam
pelo seam `DADOS.gps` e vêm das três fontes marcadas ✅ abaixo. Telas: `T.mapa` /
`T.mapachegou` (`telaGps()` no mock); a fiação mora na **§7c da `ponte.js`**.

| O que ligar | Porta / fonte | Estado |
|---|---|---|
| Traço da rota pelas ruas | `GET /logistica/osrm/route?coords=…&steps=1` → `routes[0].geometry` (GeoJSON) numa layer do maplibre | ⬜ a resposta já chega e já é usada pelo cromo; falta DESENHAR |
| Reta tracejada (sem trajeto) | quando o OSRM falhar — é o fallback honesto, não pode ficar sem linha | ⬜ |
| Manobra (distância + verbo + rua) | `legs[].steps[].maneuver` + `.name` do mesmo `route` | ✅ tabela do `app.js` (S5 21/07) copiada sem palavra nova |
| ETA · restante · distância (rodapé) | `routes[0].duration` / `.distance` + relógio do aparelho | ✅ |
| "Parada N de M" | já existe em `DADOS.rota` / `ENTREGAS` | ✅ + nome, endereço, o que falta |
| Velocímetro | `navigator.geolocation` → `coords.speed` (m/s → km/h) | ✅ |
| Bússola | `coords.heading` (o mapa já gira pelo rumo no mock) | ✅ só ANDANDO (≥2,5 m/s) |
| Faixa de GPS (precisão) | `coords.accuracy` | ✅ |
| Voz da navegação | `HBX.speak` (Kotlin JÁ existe, sem chamador) | ⬜ |
| Manter tela acesa / modo navegação | `HBX.manterTelaAcesa` / `HBX.modoNavegacao` (Kotlin JÁ existe) | ⬜ |
| Enquadrar rota / recentralizar / garagem | maplibre — **uma função só decide a câmera** | ⬜ |
| Aviso "estou chegando" (~500 m) | `POST /logistica/entregas/:id/chegando` (allowlist ok) | ⬜ |

**O freio do retraço, como ficou (as 3 regras da caixa abaixo, medidas):** 1 pedido
em voo, piso de 15 s entre pedidos, recálculo antecipado só com **120 m andados**,
teto de **400/dia** e backoff 2→5→15→60 s. Medido na bancada: **10 fixes seguidos
(≈22 m andados) = 1 ida ao roteador**, e a distância até a curva caiu de 240 m pra
220 m **sem rede** — ela é recalculada do fix atual contra o ponto da manobra, que
já veio na resposta. Falha de rede **não apaga** a manobra que está na tela.

🔴 **`curvaEsquerda` entrou no dicionário de ícones** (espelho exato do
`curvaDireita`: `x → 24−x` e o arco troca o sweep). Sem ela, "vire à esquerda"
sairia com a seta apontando pra **direita** — mentira pior que a que a §4.6.6 veio
matar. Nenhuma das 31 telas usa o ícone novo, então os dois portões seguiram
limpos.

🔴 **RETRAÇO (saiu do caminho) — o que já custou uma madrugada:**
- resultado de rede guardado em memória leva **carimbo da entrada que o gerou** (assinatura
  da fila); sem isso o traço velho sobrevive a uma troca de rota;
- orçamento **SEPARADO** por assinatura: 1 em voo, backoff, teto por dia;
- **`isStyleLoaded()` NUNCA como portão de fluxo** — mapa remontado fica "não pronto" por
  tempo indeterminado e mata o pedido E o desenho. Use `once('styledata')` + teto de 1,2 s.

### 4.2 — L10 `rapida` (cadastro na rua) — é do tamanho da L6, não é resto de leva

| O que ligar | Porta |
|---|---|
| Campo único (endereço escrito) | `GET /logistica/geo/busca` |
| CEP + número → local | `GET /logistica/geo/cep` |
| Link do Maps colado | `GET /logistica/geo/link` |
| Reverse geocode | `GET /logistica/geo/reverse` |
| Anti-duplicata de porta | `GET /nucleo/contas/por-endereco` (**fail-closed**) |
| Criar cliente | `POST /nucleo/contas` |
| Criar entrega avulsa | `POST /logistica/entregas` |

⚠️ Ler antes: `endereco-identidade-e-numero-nao-o-ponto` — **mesmo CEP/ponto não prova
duplicata**; a régua é `mesmaPorta` (número + apartamento).

### 4.3 — L10 `gerenciador`

| O que ligar | Porta |
|---|---|
| Tirar do dia | `POST /logistica/rota/tirar-do-dia` |
| Limpar dia | `POST /logistica/rota/limpar-dia` |
| Descartar montagem | `POST /logistica/rota/descartar-montagem` |
| Sanitizar endereço | `POST /logistica/rota/sanitizar` |
| Reordenar a agenda | `PATCH /logistica/agenda/dias/:dia/ordem` |

### 4.4 — O RESTO DO PISO (pequenos, mas um deles é BLOQUEADOR)

| O que ligar | Porta / fonte | Nota |
|---|---|---|
| 🔴 **Aviso de atualização** | `GET /downloads/version-logistica.json` + `HBX` update | **BLOQUEADOR DA TROCA** — sem ele, a troca é a ÚLTIMA atualização que o celular recebe na vida. Gate `HBX_V2` pendente |
| Pulso (tela a cada 5 s) | `POST /logistica/recados/pendentes` com `{tela}` | é o mesmo poll do chat: leva o pulso de carona |
| Ver Tela (espelho) | `POST /logistica/espelho/quadro` | 3.914 chamadas em 2 semanas — é o suporte do dono |
| Erros do cliente | buffer de 20, de carona no poll | |
| Prévia do dia | `GET /logistica/dia-preview` | 456 chamadas em produção |
| Próxima parada (overlay) | estado local + `ENTREGAS` | |
| Banner "sem sinal" / "pausada" | estado local | |
| Salvar montagem / reordenar / otimizar | `POST /logistica/rota/planejar` + ordem manual | |
| Pausar / continuar / finalizar rota | estado local + `rota/encerrar` | |
| Tela de conferência (com a LISTA) | `POST /logistica/rota/checar-enderecos` | hoje só o portão com a contagem |
| Criar cliente pela ficha | `POST /nucleo/contas` | hoje só edita |
| CEP → endereço (ViaCEP) + DDD | `GET /logistica/geo/cep` | |
| Arquivar produto (segurar) | `PATCH /logistica/produtos/:id {ativo:false}` | |
| Preço do dia / **moeda estilo banco** | — | ⬜ a máscara não existe; hoje o freio é o portão que lê o preço de volta |
| Sons / vibração / voz | `HBX.sound` · `HBX.vibrate` · `HBX.speak` | Kotlin pronto, sem chamador |
| Permissão de localização | `HBX.requestLocationPermission` | |
| Ligar / WhatsApp / Maps | `HBX.call` · `whatsapp` · `maps` | |
| Leis de casca (A) | Enter avança campo, bottom-sheet, confirmação, toast, **segurar pra excluir** | 5 itens, baratos |
| 4 sub-telas de Ajustes | `financeiro` · `avancado` · `sons` · `historico` | ⚠️ **decisão do dono pendente** — ver §5 |

### 4.5 — O QUE **NÃO** ENTRA (corte do dono, 06/08 — não reabrir sem ordem)

Comprovante foto/código · Modo Passeio (8) · Leitura de rota (6) · pacote offline
`prepare/sync/proofs` (4) · tracking ao vivo · mapa offline antigo (3) · missões e rota
indicada (4, **e o poll de 2.981 chamadas morre junto**) · editor/duplicar modelo (2) ·
`gerar-dia` · tela de chegada nativa.

### 4.6 — A CASCA: o que o dono apontou em 07/08

#### 4.6.1 — ✅ FEITO · O círculo do cliente estava com os dados no canto

**O defeito, medido com `getComputedStyle` (não lido):**

| Propriedade | Devia ser | Estava | Efeito na tela |
|---|---|---|---|
| `display` | `grid` | `block` | `place-items:center` fica **inerte** — as iniciais colam no canto de cima |
| `font-size` | 12px | 11px | letra menor que o resto da lista |
| `color` | cor da marca | `--ink-2` | o círculo apagava, parecia desligado |
| `margin-top` | 0 | 1px | o círculo inteiro descia 1px da linha |

**Quem roubava:** `.cli span` e `.item-linha span` — regra de linha com 1 classe +
1 tipo (0,1,1), que **vence** `.ava` (0,1,0) e ainda vem depois na folha. Quatro
propriedades de uma vez, **sem um erro no console**.

**A cura** (no mock, que é a fonte): `.cli .ava, .item-linha .ava` redeclara as
quatro, com `.lime` junto, **antes** do bloco do modo claro — lá a cor é
redesenhada de propósito e continua mandando.

**Prova:** folga medida nos 4 lados do círculo = **11,8 / 11,8 / 10 / 10** (era
`display:block`, sem centro nenhum), nos **dois modos**, e a mesma medida vale no
`index.html` do app, não só no mock. Grade de prints em
`outputs/prova-circulo-cliente.png`. O `casca-antes-e-depois` acusou **exatamente
6** — `clientes`, `ficha` e `financeiro` × 2 modos — e nada mais: o conserto não
vazou. `casca-conferir` seguiu **66/66**.

#### 4.6.2 — ✅ FEITO · Clientes não tinha transição: o dado do servidor matava

Não era a casca. **A casca estava certa** — medido no mock: entrar em Clientes
acende **13 animações** (`trXItem`, escalonadas por `--i`).

**O assassino:** `ponte.js` embrulha o `window.ir`; abrir a tela dispara
`carregarClientes()`, e quando o servidor responde vem `usarDados(...)` →
`pintar(false)`. O `pintar(false)` fazia `app.innerHTML=''` e criava a camada
**sem papel nenhum**. Medido: **13 animações → 0**. Na bancada a lista volta em
~60 ms, então o dono via a tela **sem transição alguma**.

Vale pra **toda** tela que carrega ao abrir — `clientes`, `produtos`, `chat`,
`ajustes`, `consumo`, `salvas`. Clientes foi só onde apareceu primeiro.

**A cura,** em `pintar()` (mock):
- `herdando = !animar && antiga.classList.contains('entra')`;
- herdando, a camada nova **veste as marcas** da que estava entrando (`entra`,
  `cheio`, `voltando`, `abertura`) e o `--dir`;
- troca **só ela** (`replaceWith`), sem varrer a camada que SAI nem cancelar o
  relógio de limpeza — 🔴 é isso que salva a **abertura**, onde a camada que sai é
  o show inteiro (o logo voando pro cabeçalho);
- `currentTime` põe cada animação onde a anterior estava. **Continuar, não
  recomeçar** — recomeçar pisca quando o servidor demora.

**Prova medida:** dado chegando em 200 ms → **13 animações vivas**, relógio em
**209 ms** (continuou), as duas camadas com papel (`sai` + `entra`) e o dado real
já na tela. E na abertura: repinte no meio e o `.splash-logo` **segue com
`mvLogoVoa` rodando** — antes ele era destruído.

#### 4.6.4 — ✅ FEITO · A 1ª pintura: esqueleto, nunca demonstração

Mesma origem do 4.6.2, e o dono escolheu **esqueleto** (07/08).

O mock é o front, e o front traz o dado de exemplo do desenho. Até o servidor
responder, o motorista lia **João da Silva, Mercadinho Bom Preço** e um caixa que
não era dele. 60 ms na bancada; segundos numa rede ruim.

**Como ficou:**
- `carregando` e `semFonte` nascem **ausentes** em `DADOS` — o mock, que é o
  DESENHO, não muda em nada (os dois portões seguiram 66/66);
- no boot, e só com ponte, `apagarDemonstracao()` apaga o exemplo e liga o
  esqueleto de `rota`, `clientes`, `produtos`, `salvas`, `chat` e `consumo`,
  numa pintura só. 🔴 A trava é no BOOT e não em cada carregador de propósito:
  quando `ir('clientes')` pinta, `carregarClientes` ainda nem começou — ligar lá
  deixaria um quadro de exemplo passar. E na ABERTURA não repinta: ela é uma
  cena com relógio;
- fonte fora do ar ⇒ **aviso** ("Não consegui carregar · Sem resposta do servidor
  agora · Tentar de novo"), nunca lista vazia fingindo base vazia. E **só na 1ª
  carga**: com dado do servidor já na tela, rede ruim não apaga nada (Lei nº1).

**Dois defeitos que a própria prova achou, no g15, e já corrigidos:**
1. 🔴 **`dinheiro` e `pix` vazavam do mock.** Eu tinha zerado só `saldo`, e a tela
   mostrou **"Dinheiro R$ 132,00 · Pix R$ 52,00"** com o servidor fora — porque a
   ponte só escreve esses dois quando o `caderneta/resumo` responde, e **o que
   ela não escreve fica**. A régua virou: em `DADOS.rota`, o que é DADO zera; o
   que é COPY (`vazioTitulo`, `vazioSub`) fica.
2. 🔴 **"Iniciar debita 12" nunca veio do servidor** — era o número do MOCK, em
   dinheiro, na tela principal. Agora `carregarRota` pede o `custo-preview` junto
   (a MESMA porta que o portão do Iniciar usa pra cobrar) e, se ela falhar, o
   campo fica vazio e a linha some.

**Prova no g15** (`outputs/prova-sem-mentira.png`), túnel derrubado e app frio:
rota com as paradas do pacote offline e **sem** o caixa de mentira · clientes com
o aviso · túnel de volta + um toque em "Tentar de novo" ⇒ os **11 clientes reais**
da empresa 39. Grade dos 3 estados × 5 telas em `outputs/prova-esqueleto.png`.

#### 4.6.5 — ✅ FEITO · A varredura das outras seções (07/08, ordem "termine agora")

O critério do 4.6.4 virou uma **varredura campo a campo** de todas as seções que
a ponte alimenta: pra cada campo do `DADOS`, quem escreve — **SEMPRE**,
**CONDICIONAL** (dentro de `...(x.status==='fulfilled' ? … : {})` ou de um `if`)
ou **NUNCA** — e se é DADO ou COPY. Campo DADO que é CONDICIONAL ou NUNCA é
mentira esperando a rede cair.

**Limpas, nada a fazer:** `venda` (12/12 SEMPRE) · `fichaproduto` (7/7 SEMPRE) ·
`ficha` (14/14 SEMPRE). Em `montagem`, os 2 NUNCA são COPY legítimo (título e a
dica do gesto).

🔴 **A raiz de tudo, que vale escrever:** `usarDados` é **merge**, não
substituição (`DADOS[s]=Object.assign({},DADOS[s],valor)`). **O que a ponte não
escreve fica com o valor do desenho pra sempre.** Todos os oito defeitos abaixo
são a mesma frase.

**O que a varredura achou, e já está corrigido:**

1. 🔴 **`ajustes` — a pior das mentiras, porque é CLICÁVEL.** A tela nascia com o
   exemplo: "Modo caderneta LIGADO", "240 créditos", e o grupo **"Baixando o mapa
   · 62%"** — recurso **cortado em 06/08, que não existe mais**. O motorista lia
   a chave, tocava pra desligar e achava que desligou (o `virarChave` sai no
   `if (!config) return`, então o toque não fazia nada). **Nem ligada nem
   desligada é o estado honesto de uma chave que não chegou** — então nenhuma
   aparece até chegar. Medido: esqueleto com **0 chaves** na tela, sem o mapa
   cortado e sem o crédito de exemplo.
2. 🔴 **`recarga` — tela de DINHEIRO, e era a mais exposta.** Catálogo inteiro do
   desenho (R$ 49 / 129 / 239 / 449, "+8% grátis", "melhor preço") e um botão
   **"Recarregar 300 créditos · R$ 129,00" que não fazia nada** — sem pacote
   escolhido de verdade a ação sai no `if (!pacoteEscolhido) return`. Preço
   inventado com botão de pagar em cima. Pior: ela **só era preenchida de carona
   no `carregarAjustes`** — quem abrisse a Recarga direto via o catálogo falso.
   Agora ela **carrega sozinha** (`carregarRecarga`, no `ir('recarga')`) e nasce
   em esqueleto. Medido: **0 pacotes, 0 botão de pagar**, nenhum preço.
3. 🔴 **`montagem` abria com as 6 paradas de exemplo e "R$ 336,00"** quando o
   `/logistica/rota` falhava: o `carregarRota` volta no catch **antes** de
   escrever no seam, e o `montarRota` navegava mesmo assim. O `carregarRota`
   passou a **devolver se entrou**, e a montagem só abre se entrou — falhou,
   avisa e fica onde está. Dinheiro de exemplo numa tela de decisão.
4. 🔴 **`caderneta` + `semana` — 11 campos de dinheiro presos a UMA chamada.** As
   duas são 100% DADO e só são escritas se o `caderneta/resumo` responder
   (`if (caixaR.status === 'fulfilled')`). Com ela no chão a **Caderneta — que é
   ABA da barra de baixo, alcançável a qualquer momento** — mostrava o
   fechamento do desenho: **Dinheiro R$ 132,00 · Pix R$ 52,00 · Cartão R$ 84,00 ·
   Caderneta R$ 68,00**, total **R$ 336,00**, e o selo **"Tudo certo!"** — um
   veredito que o app não tem como emitir. A Semana mostrava **6 dias inventados
   e R$ 2.648,00**. (É o MESMO par 132/52 que já tínhamos matado em `rota`: ele
   estava vivo aqui do lado.) Medido depois: zero valor de exemplo nas duas.
5. 🔴 **A tela mostrava um motivo e o servidor gravava outro.** `abrirParada`
   zerava a variável `motivo` mas **não o seam**: marcar "Endereço não
   encontrado" na parada 3 e abrir o "não entregue" da parada 5 deixava esse
   motivo **marcado na tela**, enquanto o `registrarNaoEntregue` mandava
   `motivo || motivos[0]` = **"Ninguém atendeu"** pro `entregas/:id/cancelar`.
   Agora o seam recebe exatamente o que vai ser enviado, inclusive o padrão da
   1ª abertura.
6. A copy do custo: com a rota montada e o `custo-preview` fora do ar, a faixa
   dizia *"monte a rota pra saber"* (mentira, ela está montada). Agora diz
   **"não consegui o custo agora"**.

**Prova no g15, túnel derrubado** (`outputs/prova-sem-mentira-2.png`): Ajustes
com **zero chave** na tela e o aviso · Caderneta com as paradas do pacote offline
e **nenhum** valor de fechamento inventado.

⬜ **Fica aberto, com endereço:** `folha.motivos` (a lista de 5 motivos) é COPY do
mock que **vira payload** — o texto escolhido vai como está pro servidor no
cancelamento. Funciona, mas o dia que existir lista de motivos no servidor, é
essa chave que passa a ser alimentada.

#### 4.6.6 — ✅ FEITO · A tela do GPS, que tinha ficado de fora da varredura

A §4.6.5 varreu as seções que a ponte alimenta. **A navegação não era uma delas**
— a fiação dela (L3b, §4.1) não existia —, então ela ficou de fora e seguiu
mentindo sozinha, **na única tela em que o motorista está dirigindo**:

> "Parada **3 de 8** · **Mercado São Judas**" · "**240 m** · Vire à direita" ·
> "R. São Judas · depois, siga em frente por 1,2 km" · "**12:26** chegada ·
> **45 min** restante · **8,2 km** distância" · "**38** km/h" · "N" — e, na de
> chegada, "Você chegou · **Mercado São Judas**" e "R. São Judas, 142 · GPS ±6 m,
> **você está na porta**".

Todos literais do desenho cravados em `telaGps()`. Nome de cliente que não existe,
com uma seta mandando virar numa rua que ninguém escolheu.

**Como ficou** — seção `gps` no seam, mesma régua do §4.6.5:
- **17 campos DADO** zeram em `apagarDemonstracao()`; **8 COPY** ficam;
- 🔴 **o pedaço sem fonte SOME INTEIRO** — com rótulo, unidade e separador. O
  " · " nasce de um `join`, nunca do template: separador órfão boiando no mapa é
  a mesma mentira, só que mais feia. Sem manobra, o cartão inteiro sai de cena;
  sem rumo, a bússola sai; sem velocidade, o velocímetro sai;
- 🔴 **o `Encerrar` é COPY e NUNCA zera** — é a porta de saída da navegação, e
  motorista preso nesta tela é defeito pior que qualquer número faltando;
- 🔴 **"você está na porta" morreu de propósito.** Era um VEREDITO, irmão do selo
  "Tudo certo!" que a §4.6.5 matou, e não há porta que o emita. `chegouPrecisao`
  diz o fato medido — "GPS ±6 m" — e nada além. Quem já diz que chegou é o título.

**Um defeito que a própria prova achou:** com 1 pendente a tela dizia **"faltam 1
parada"**. O verbo concorda com um número que só a ponte conhece — virou
`chegouFaltamVerbo`, e as duas formas são do desenho (a plural estava lá só
porque o exemplo tinha 5).

**Prova medida** (`outputs/prova-gps-sem-mentira.png`, grade mock × app, 2 telas ×
2 modos): app frio, o texto INTEIRO da tela de dirigindo é **"Encerrar"**, e o da
chegada é **"Você chegou · Registrar entrega"**. Nenhum dos 14 literais sobreviveu.

Os dois portões: `casca-conferir` **62/62 idênticas** e `casca-antes-e-depois`
**62/62 idênticas — nem uma tela acusada**. É essa segunda linha que prova o que
importa: com o dado de demonstração, a marcação das duas telas do GPS sai **byte a
byte igual** à de antes. Foi mudança de **LUGAR**, não de desenho.

*(62 e não 66 porque o mock passou a ter 31 telas — corte de `gestos` e `padroes`.)*

#### 4.6.3 — ✅ FEITO · A abertura anterior saiu; ficou a que fizemos

O motorista via **DUAS aberturas em sequência**:

1. a **anterior** — `OfflineLauncherActivity` → **`OpeningActivity`**: logo nativo
   viajando (1,07 s) + uma WebView própria com `opening.html` (**35 KB**) + o
   sonic logo;
2. a **nova** — já dentro do app: `T.entrada` do mock (as hastes, o cometa, a
   marca, o brilho, a batida) e o logo voando pro cabeçalho.

A cortina antiga que ficava **dentro** da MainActivity já tinha morrido no flavor
(`if (!BuildConfig.HBX_V2) mountOpeningOverlay(...)`, com `HBX_V2=true` no
`logistica2`). **O que sobrava de pé era a Activity inteira, antes dela.**

🔴 **E ela não é enfeite: é o PORTEIRO DA SESSÃO.** Foi o que mudou o desenho —
o 1º rascunho deste plano mandava mover a autenticação pra MainActivity, e isso
estava **caro e errado**. O que a Activity decide, e ninguém mais decide:

| Decisão | Por que não pode cair |
|---|---|
| token salvo → `MobileEntrySession.authenticate` → `entryUri` | é o `ticket` que a MainActivity lê de `intent.data` |
| **sem token** → `PairingActivity` | sem isso o aparelho novo **abre o app e fica preso** — a 1ª chamada dá 401 e a ponte, pela Lei 1, trata como queda de rede e não apaga a tela: o motorista fica olhando dado de demonstração |
| **401** → limpa o token → `PairingActivity` | idem, no aparelho desvinculado |
| falha que não é da API + `offlineResume` | é o que salva rota preparada com o VPS fora |
| repassa `intent.data` e `EXTRA_DESTINO` (WhatsApp/Maps) | destino que veio de fora |

**A cura foi tirar o SHOW, não a Activity.** Sob `HBX_V2` ela não monta WebView,
não faz o logo nativo viajar e não toca som: fica um **fundo liso `#050713`** — a
mesma cor com que a abertura nova começa — enquanto decide, e entrega a
MainActivity. O olho não vê corte, vê o app abrindo **uma vez**.

Dois detalhes que derrubariam o app se passassem batido:
- `sequenceReady` vinha do JS do `opening.html`. Sem a cena, `continueWhenReady`
  esperaria pra sempre um aviso que não vem → é posto na mão sob V2.
- `transitionToPairing` chamava `webView` (`lateinit`). Sem a WebView isso
  **derrubaria o app justo no aparelho ainda não vinculado** — o caminho do
  pareamento foi separado (`irParaPareamento`) e entra na hora, sem os 700 ms
  que existiam só pra fechar a cena.

`opening.html` **apagado** do `logistica2/assets/app/` (35 KB de peso morto) —
o `logistica/` e o `vendas/` seguem com o deles, intocados.

**Prova por toque, app FRIO no g15** (`outputs/prova-abertura-unica.png`, 12
quadros): toque no ícone → fundo liso → **a abertura nova** (cometa, hastes,
marca, "Água Rio Claro", barra de carga) → rota do dia com dado real. Nenhum logo
nativo antes, nenhuma segunda cena. `logcat` sem `FATAL`, app a **55 fps**.

⬜ **O único desfecho não provado no aparelho: o pareamento.** Provar exige
desvincular o g15 do flavor `logistica2`, e re-parear depende do dono. O código
está com o caminho separado e sem a chamada que derrubava — mas **teste verde não
é prova, a tela é**. Fica na §6.1 como item da troca.

---

## 5. DECISÕES DO DONO AINDA PENDENTES

1. **As 4 sub-telas de Ajustes** (`financeiro`, `avancado`, `sons`, `historico`): o mock
   desenhou conteúdo DIFERENTE do que o app tem (mock `financeiro` é painel de cobrança, o
   app é lista de chaves; mock `historico` é de ROTAS, o app é do CLIENTE). Vestir a função
   atual com a cara do mock, ou o desenho vira feature nova?
2. **Semana — "produtos por dia" e "recebido por dia"**: o `caderneta/resumo` só manda o
   total. Ou 7 chamadas (uma por página), ou 2 campos aditivos no `historicoDias`.
3. **`nucleo-r5.crosstenant`** falha 1 de 2 — **medido com stash: PRÉ-EXISTENTE**, a metade
   que quebra é a de logística. Investigar em leva própria ou deixar anotado?
4. **`Product.stock` legado**: o `PATCH /logistica/produtos {estoque}` escreve NELE, não no
   estoque fiscal. O app novo nunca manda, mas a porta segue aberta.
5. ~~A 1ª pintura antes do servidor responder~~ — **DECIDIDO 07/08: esqueleto.**
   Feito e provado no g15 (§4.6.4). Restam as 3 pontas anotadas lá.
6. **O sonic logo** (§4.6.3): ele tocava — o `logistica2` mantém `APP_MODE`
   `"logistica"` de propósito, e o `playOpeningSound` vinha junto da cena que
   saiu. **Hoje o app abre calado.** Toca junto da abertura nova (`HBX.sound`, que
   já existe e não tem chamador) ou fica assim?

---

## 6. FX — A TROCA: devolver esta versão pro VPS

> Só com ordem explícita do dono. **A troca é irreversível pro aparelho do André:**
> mesmo `applicationId`, mesma assinatura, ele atualiza sozinho pelo aviso.

### 6.1 — Antes de trocar (checklist duro)
- [ ] Tudo do §4 ligado e **provado por toque no g15** (regra §1 do `hbxapk.md`).
- [ ] 🔴 **O PAREAMENTO**, o único desfecho da §4.6.3 que ficou sem prova de tela:
      aparelho sem token e aparelho com 401 têm que cair na `PairingActivity`, não
      num app aberto e oco. Provar exige desvincular — fazer numa instalação
      limpa, **antes** de encostar no aparelho do André.
- [ ] 🔴 **Aviso de atualização funcionando** — sem ele o cordão de entrega arrebenta.
- [ ] `casca-conferir` 66/66 · `casca-antes-e-depois` limpo · `tsc` back e front limpos.
- [ ] Rodar contra o **VPS** (não a bancada) e repetir a cena do dia inteiro.
- [ ] Iniciar rota com **crédito real** numa empresa de TESTE — o débito nunca foi provado.

### 6.2 — Os 3 que quebram CALADO se esquecer
1. 🔴 **Religar `google-services` no flavor.** Hoje está desligado (o `google-services.json`
   só declara `br.com.hbxsystem` e `.logistica`). Quando o applicationId voltar pro
   `.logistica`, religar — senão o **push morre em silêncio** (a chamada vive dentro de
   `runCatching`).
2. 🔴 **Apagar `logistica2/assets/app/app.js` (13.688 linhas) e `app.css`.** O `index.html`
   não carrega nenhum dos dois: são **1,1 MB de peso morto** no APK e uma "reserva" que não
   existe. O `opening.html` (35 KB) **já saiu** na §4.6.3 — ⚠️ só o do
   `logistica2/`: o `logistica/` e o `vendas/` seguem usando o deles.
   🔴 **Na troca, o `HBX_V2` do flavor volta a valer pro app de produção** — e é
   ele que decide a abertura única e o porteiro liso. Conferir que ele fica
   **`true`** no flavor que vai pro André, senão a abertura anterior ressuscita.
3. 🔴 **Devolver `logistica2` à digital do APK** (`collectApkInputFiles` em
   `scripts/ops/deploy-vps.js`) — ele está FORA de propósito, pra bancada não carimbar
   versão nova em produção. Depois da troca, tem que voltar.

### 6.3 — A troca em si
- assets do `logistica2` viram os do `logistica`;
- `applicationId` volta pra `br.com.hbxsystem.logistica`;
- sai o `-bancada` do `versionName`; **piso do `versionCode` acima do publicado**;
- `npm run publish` (o publish **aborta fora do master** e **apaga branch não-master**);
- ⚠️ conferir o tree antes: `publish` faz `git add -A` e leva junto o que estiver sujo.

### 6.4 — Depois de publicar
- [ ] A **1ª prova é o aviso de atualização aparecendo sozinho** no celular — `adb install`
      NÃO é entrega (regra §6 do `hbxapk.md`).
- [ ] Conferir o SHA do APK público e a versão instalada.
- [ ] Abrir a ficha da empresa 41 no `/master` e usar o **Ver Tela** no e13 do André.

---

## 7. SUJEIRA DE TESTE DEIXADA NA BANCADA (empresa 39, não é produção)

- `modoCaderneta` da 39 ficou **false** (desligado ao testar o toggle).
- 2 recados de teste (`teste-l8-normal`, `teste-l8-urgente`) e uma resposta do motorista.
- Bruno Pereira com CPF `12345678909`, número 32, dia SEG e **pino nulo** (foi o teste do
  endereço que mata o pino).
- Produto 35 com preço **9,50** (era 9).
- Entregas de 06/08 e 07/08 confirmadas em dinheiro/pix/cartão/fiado.
