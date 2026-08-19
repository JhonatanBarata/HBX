# A PONTE DO HBX VENDAS — a fonte é esta pasta

`../assets/app/ponte.js` (o que o `index.html` carrega e o que vai dentro do APK)
**é SAÍDA**, gerado por `scripts/ponte-costurar.js`. Quem se edita é
`ponte-src/NN-nome.js`.

🔴 **E esta pasta mora FORA de `assets/` de propósito.** Tudo que está em
`src/vendas/assets/**` é embarcado no APK: com a fonte lá dentro o vendedor
baixaria o dobro da ponte, de código que ninguém carrega. Aqui ela continua
contando na digital do APK (o `deploy-vps` varre `app/src` inteiro, então mexer
só na fonte já carimba versão nova) sem viajar junto.

| Quero | Rode |
|---|---|
| gerar o `ponte.js` a partir da fonte | `node scripts/ponte-costurar.js --app vendas` |
| provar que o embarcado É a costura da fonte | `node scripts/ponte-conferir.js --app vendas` |
| reinjetar a casca (mock → `assets/app/`) | `node scripts/casca-injetar.js --app vendas` |

---

## As três regras da costura

1. **O gerado não se edita.** Conserto feito em `ponte.js` some no próximo
   `costurar` — a mesma lição que já custou duas vezes o cordão de update no
   `index.html`. O `ponte-conferir` reprova exatamente esse caso, e ele roda no
   publish (`scripts/ops/deploy-vps.js`) antes do commit e antes da digital do APK.
2. **A costura é concatenação pura, na ordem do NOME** (`00`, `10`, … `A0`, `D0`).
   Sem wrapper, sem cabeçalho, sem `export`: os pedaços são fatias contíguas do
   MESMO IIFE, então o escopo léxico volta inteiro e os `const` de topo continuam
   se enxergando. Nome novo entra no lugar certo da ordem — nome torto embaralha
   o arquivo, e por isso o padrão `NN-nome.js` é conferido
   (regex `^[0-9A-Z]{2}-[a-z0-9-]+\.js$`).
3. **O primeiro ABRE o IIFE, o último FECHA.** Hoje: `00-nucleo.js` abre,
   `D0-acoes.js` fecha com `})();`. Um arquivo novo entra **no meio** — nunca
   antes do `00` nem depois do `D0`.

---

## O mapa de hoje

| Arquivo | De quem é | O que faz |
|---|---|---|
| `00-nucleo.js` | fundação | abre o IIFE · `chamar()`/`window.API` · `telaAtual`/`camadaViva`/`naCamada` · `usar()` (o seam) · os três **registros** · tema · Voltar do Android · teclado · aviso de versão nova · `esc`/`dinheiro`/`hora`/`diaOperacional`/`telefoneBonito`/`iniciais`/`local`/`tomDaEtapa` |
| `10-portao-fontes.js` | fundação | `fonteCaiu`/`fonteVoltou`/`retentar`/`blocoCaiu` · `apagarDemonstracao` · `anunciarTela` · a carga inicial e o relógio de módulos |
| `20-vendas.js` | fundação | o **FUNIL** (`/vendas/board` + `/vendas/pending-summary` + `/vendas/report`) |
| `30-radar.js` | **livre** | Radar (buscar/contar/puxar) |
| `40-agenda.js` | **livre** | Agenda (`/atividades/agenda`) |
| `50-conversas.js` | **livre** | Conversa do lead + `abrir-lead` + ficha |
| `60-empresas.js` | **livre** | Carteira de empresas (`/nucleo/empresas`) |
| `90-ajustes.js` | fundação | perfil · créditos · WhatsApp · módulos (**e a barra**) |
| `D0-acoes.js` | fundação | o despachante único de clique/digitação · fecha o IIFE |

---

## O CONTRATO: como pendurar um módulo **sem editar o `D0-acoes.js`**

Crie o seu arquivo (ex.: `30-radar.js`), abra com uma linha em branco (a costura
é concatenação: o arquivo anterior termina em `\n`) e registre o que é seu.
**Nada aqui exige tocar em arquivo de outra pessoa.**

```js

  /* ==== RADAR ==== */
  function carregarRadar() {
    if (!temPonte()) return Promise.resolve();
    return window.API.get('/webscraping/radar/leads')
      .then((r) => { usar('radar', Object.assign({}, fonteVoltou, { lista: (r.items || []).map(traduzir) })); })
      .catch(() => fonteCaiu('radar'));
  }

  registrarTelas({ radar: carregarRadar });          // a tela abriu → carrega

  registrarAcoes({
    'radar-buscar': (el) => { /* `el` é o NÓ TOCADO: dataset, aguarde, tudo */ },
    'radar-sugestao': (el) => escolher(el.dataset.segmento),
    'radar-recarregar': () => retentar('radar', carregarRadar),
  });

  registrarCampos({
    'radar-segmento': { espera: 180, ao: (valor) => usar('radar', { segmento: valor }),
                        aoEnter: () => carregarRadar() },
  });
```

### As quatro coisas que o `D0` garante pra você

1. **`registrarAcoes({ chave: fn })`** — toque em `[data-acao="chave"]`.
   `fn(noTocado, evento)`. O **de dentro vence**: um botão dentro de uma linha
   clicável responde pelo botão. Ação desenhada na casca e **sem dono** grita no
   console com o nome da chave que falta — é assim que você descobre o que ainda
   não plugou.
2. **`registrarCampos({ nome: fn })`** ou `{ espera, ao, aoEnter }` — digitação
   em `[data-campo="nome"]`. `ao(valor, no)`. **Use `espera`** em qualquer campo
   que fale com a rede: sem ela é um pedido por letra e um repinte por letra.
3. **`registrarTelas({ tela: fn })`** — a tela ABRIU (por `data-ir`, `data-nav`,
   `data-tela` ou por `window.ir()` chamado de dentro da ponte). É o gancho de
   carregar. Dispara **uma vez por entrada** na tela.
   ⚠️ Uma exceção, e ela é do Funil: o app POUSA nele quando a abertura termina,
   e o boot já o carregou. Por isso `vendas` nasce marcada como anunciada
   (`TELA_DE_POUSO`, em `10-portao-fontes.js`) — sem essa linha todo boot pagava
   DUAS varreduras de 240 leads. Nenhuma outra tela tem esse tratamento.
4. **Nome repetido reprova alto** no console e o segundo dono é ignorado. Dois
   donos pra mesma ação foi o defeito que a chave do tema pagou no app do
   motorista (dois handlers viravam a luz no mesmo clique e ela "não fazia nada").

### O que já é seu de graça (não reescreva)

- `window.API.get/post/patch/del` — erro já chega em **português de gente**, com
  `erro.status` e `erro.body` preservados pra quem quiser a frase daquele caso.
- `usar(secao, {…})` — o seam, com o **freio de repinte** do mock (dado igual não
  repinta). Lista sempre DENTRO de `DADOS`; lista fora do seam precisa de digital
  própria, senão o freio engole o repinte e a tela mente.
- `fonteCaiu(secao)` / `fonteVoltou` / `retentar(secao, fn)` / `blocoCaiu(...)`.
- `esc`, `dinheiro`, `hora`, `diaOperacional`, `diaEmSp`, `diaCurto`,
  `dataPorExtenso`, `quandoDoToque`, `iniciais`, `telefoneBonito`, `local`,
  `tomDaEtapa`, `avisoErro`, `naCamada`, `camadaViva`, `telaAtual`.

---

## As leis que você **não** pode quebrar aqui

1. 🔴 **Endpoint novo = allowlist no Kotlin, no MESMO commit.**
   `EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/NativeApiClient.kt`,
   ramo `vendasEndpoint`. Caminho fora dela **morre DENTRO do aparelho** com o
   backend 100% verde e o log do servidor limpo — a armadilha que já custou
   quatro diagnósticos errados nesta casa. Cada linha nova ganha assertion em
   `NativeApiClientPathPolicyTest.kt` no mesmo commit.
2. 🔴 **Falha de rede só apaga tela na PRIMEIRA carga.** Com dado real já
   desenhado, o tique de fundo que não respondeu avisa e **deixa o que estava**.
   É o que `fonteCaiu` já faz — não escreva `catch` que zera lista.
3. 🔴 **Vazio do servidor ≠ vazio da rede.** São cenas diferentes e nunca dividem
   a mesma tela: a primeira é o `.vazio` do desenho, a segunda é o
   "Não consegui carregar" com o Tentar de novo.
4. 🔴 **Traduzir ≠ decidir.** Campo sem fonte vai VAZIO e o slot some sozinho.
   Número inventado em tela de dinheiro é mentira com cara de app pronto.
5. 🔴 **Escape na FONTE.** Todo texto de terceiro (razão social da RFB, nome de
   contato, mensagem) passa por `esc()` antes do seam — o template do mock
   interpola cru, e um `<` some com o cartão inteiro sem erro nenhum.
6. 🔴 **A demonstração morre no boot.** Se você acrescentar seção nova em
   `DADOS`, acrescente-a também no `apagarDemonstracao` (`10-portao-fontes.js`) —
   e zere **inteira**, não os campos que você lembrou.

---

## Pendências conhecidas (não são bug seu)

- **Sem canal de atualização.** O `deploy-vps` publica só `version-logistica.json`
  e sobe só o `Loghbx.apk`; o `Salehbx.apk` é construído e não viaja. Enquanto
  isso o `version-vendas.json` responde 404 e a ponte diz a verdade em vez de
  "confira a internet".
- **O instalador nativo é do outro flavor.** `updateInstallAllowed`,
  `openInstallPermission` e `downloadAndInstall` no `NativeAppBridge` abrem com
  `if (APP_MODE != "logistica") return`. Por isso aqui o update **anuncia** e não
  instala.
- **Sem som.** `setSoundPrefs`/`playSound`/`previewSound` têm o mesmo gate, então
  a chave "Sons e avisos" **não é desenhada** (`sons: null`) em vez de nascer
  morta.
- **Tutorial obrigatório não dispara sozinho.** A casca sabe rodá-lo
  (`window.TUTOR.obrigatorio()`), a memória já está ligada (aparelho), mas ninguém
  o chama: prender o primeiro acesso num tour de 1 minuto é decisão do dono, não
  efeito colateral desta leva.
