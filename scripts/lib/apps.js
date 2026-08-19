/**
 * O MAPA DOS ALVOS DA ESTEIRA — a fonte ÚNICA de "para qual app eu estou gerando".
 *
 *     const { APPS, resolverApp, nomesDeApp } = require('./lib/apps');
 *     const app = resolverApp(process.argv);   // `--app vendas`; sem flag = logistica
 *
 * POR QUE ISTO EXISTE (e por que nasce agora, e não "quando precisar"):
 * até hoje o caminho do flavor `logistica` estava CRAVADO em 6 scripts da
 * esteira (`casca-injetar`, `casca-conferir`, `casca-antes-e-depois`,
 * `casca-prova`, `ponte-costurar`, `ponte-conferir`) mais o `_regenerar` e dois
 * fiscais do lint. Alvo repetido em 8 lugares é alvo que DISCORDA de si mesmo no
 * dia seguinte: basta alguém acertar 7. E o modo como isso aparece é o pior que
 * existe neste repo — o portão fica VERDE medindo o app do motorista enquanto o
 * trabalho é no app novo. Verde que mede a coisa errada é pior que vermelho.
 *
 * 🔴 O QUE MORA AQUI, E POR QUÊ CADA CAMPO:
 * `titulo`, `themeColor` (o PAR claro/escuro), `scripts` e `connectSrc` ficam NO MAPA porque hoje
 * moram cravados no template do `index.html` dentro do `casca-injetar.js` — e o
 * `connect-src` desse template (o CORDÃO DE ATUALIZAÇÃO do APK) já se perdeu
 * DUAS vezes por ser escrito longe do lugar onde se decide. Com dois apps, um
 * template com `if (vendas) …` no meio seria a terceira perda esperando a vez.
 * O template passa a ser BURRO: ele só pergunta ao mapa.
 *
 * 🔴 O QUE NÃO MORA AQUI: as travas de FORMA do injetor (cromo do visualizador,
 * a caixa 412x940, o `body`, o modo claro, o token circular, `pintarRail`/
 * `#phone`/`#rail`). Aquilo é a LEI DA CASCA e vale IGUAL para todo alvo —
 * afrouxar uma delas "só pro app novo passar" é entregar casca quebrada com
 * portão verde. Elas continuam cravadas no injetor, sem parâmetro nenhum.
 *
 * 🔴 O DEFAULT É `logistica` DE PROPÓSITO: existem 25+ chamadores (as provas de
 * Playwright, o `_regenerar`, o `deploy-vps`) que nunca passaram `--app`. Nenhum
 * pode quebrar hoje — quem quiser o app novo pede por nome.
 */
'use strict';

const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');

/** sem `--app`, o alvo é o app do motorista — é o que os 25+ chamadores antigos esperam. */
const PADRAO = 'logistica';

/* 🔴 O CORDÃO DE ATUALIZAÇÃO, num lugar só e para os dois apps.
   `checkAppUpdate` (ponte.js) é a ÚNICA coisa do app que fala rede por `fetch`:
   todo o resto passa pela ponte nativa, que não sente CSP. Então `connect-src
   'self'` sozinho quebra SÓ o update, e quebra CALADO — "confira a internet"
   com a internet perfeita (medido no g15, APK 211, 09/08). Guardado por
   `tests/app-cordao-de-update.test.mjs`, que agora lê ESTA linha como fonte.
   `worker-src blob:` é do MAPA (maplibre desenha num Web Worker de blob); sem
   ela o mapa nasce cinza e o resto da tela sobe normal, então o defeito se
   disfarça de "mapa quebrado" em vez de "política bloqueou". */
const CORDAO_DE_UPDATE = "'self' https://www.hbxsystem.com.br https://api.hbxsystem.com.br";

/** monta um alvo a partir do que muda de verdade entre um app e outro. */
function alvo({ nome, mockDir, mockArquivo, flavor, titulo, themeColor, viewport, scripts, connectSrc }) {
  const mockRel = `docs/mockups/${mockDir}/${mockArquivo}`;
  const cascasRel = `docs/mockups/${mockDir}/cascas`;
  const flavorRel = `EntregaShell/app/src/${flavor}`;
  const destinoRel = `${flavorRel}/assets/app`;
  const ponteSrcRel = `${flavorRel}/ponte-src`;
  const ponteRel = `${destinoRel}/ponte.js`;
  return {
    nome,
    rotulo: titulo,
    flavor,
    // --- a FONTE (o mock é o front, por ordem do dono de 06/08) ---
    mock: path.join(RAIZ, mockRel),
    mockRel,
    cascas: path.join(RAIZ, cascasRel),
    cascasRel,
    // --- o DESTINO dentro do APK ---
    destino: path.join(RAIZ, destinoRel),
    destinoRel,
    indice: path.join(RAIZ, destinoRel, 'index.html'),
    indiceRel: `${destinoRel}/index.html`,
    // --- o sourceSet do Gradle (`app/src/<flavor>/`) ---
    // 🔴 QUEM MANDA NA EXISTÊNCIA DESTA PASTA É O GRADLE, NÃO NÓS. O injetor
    // exige que ela já esteja no disco antes de criar `assets/app/`: sem esse
    // freio, um flavor digitado errado AQUI (`vedas`, `logisitca`) fazia o
    // `mkdirSync(recursive:true)` materializar uma árvore inteira de gerado
    // que o Gradle nunca empacota — injeção verde, APK sem front, calado.
    sourceSet: path.join(RAIZ, flavorRel),
    sourceSetRel: flavorRel,
    // --- a ponte (fonte fora de assets/, gerado dentro) ---
    pontePath: path.join(RAIZ, ponteRel),
    ponteRel,
    ponteSrc: path.join(RAIZ, ponteSrcRel),
    ponteSrcRel,
    // --- o que o template do index.html pergunta, em vez de cravar ---
    titulo,
    themeColor,
    viewport,
    scripts,
    connectSrc,
  };
}

const APPS = {
  logistica: alvo({
    nome: 'logistica',
    mockDir: 'logistica2.0',
    mockArquivo: 'logistica-2.0.html',
    flavor: 'logistica',
    titulo: 'HBX Logística',
    // 🔴 UM VALOR SÓ, E ESCURO — NÃO um par com `prefers-color-scheme`.
    // Tentou-se o par claro/escuro em 19/08 e ele MENTE: quem decide o modo de
    // luz deste app é `temaResolvido()` (native.js:951) — escolha manual do
    // dono, depois a virada de turno (noite ⇒ escuro), e só em ÚLTIMO caso o
    // `prefers-color-scheme`. Uma `<meta media>` enxerga apenas o último. À
    // noite o app fica escuro sozinho; com o Android no claro, a barra do
    // sistema pintaria CLARA sobre tela ESCURA — defeito pior que o de hoje.
    // A cura certa é o `applyTheme()` reescrever esta meta junto com o
    // `data-luz` (um dono só do tema); enquanto isso não nasce, o valor fixo
    // erra menos. Pendência anotada pro dono.
    themeColor: '#080d17',
    // O app do MOTORISTA está em PRODUÇÃO e ninguém pediu para mexer no teclado
    // dele: `interactive-widget` muda o layout quando o teclado abre, e este app
    // tem tela cheia de mapa com piso medido (`--gps-piso`). Fica como estava até
    // haver pedido e teste no aparelho.
    viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
    // ORDEM IMPORTA: native (ponte com o Kotlin) → mock (a casca) → ponte (o que
    // é do aparelho: API, Voltar, teclado, tema). O native vem ANTES porque
    // resolve o tema no load; a ponte DEPOIS porque se apoia no que o mock declarou.
    scripts: ['native.js', 'mock.js', 'ponte.js'],
    connectSrc: CORDAO_DE_UPDATE,
  }),
  vendas: alvo({
    nome: 'vendas',
    mockDir: 'vendas2.0',
    mockArquivo: 'vendas-2.0.html',
    flavor: 'vendas',
    titulo: 'HBX Vendas',
    // Mesma tinta do logística por enquanto (o mock do vendas nasce cópia dele).
    // Um valor só, e escuro, pelo mesmo motivo escrito no alvo do logística.
    themeColor: '#080d17',
    // 🔴 `interactive-widget=resizes-content` É O TECLADO DO ANDROID, e este app
    // é de FORMULÁRIO (busca, cadastro, escrever mensagem). Sem ela o teclado
    // EMPURRA a página (padrão `resizes-visual`): o campo focado some atrás do
    // próprio teclado e a barra de ação do rodapé sai da tela. Com ela o layout
    // RE-LAYOUTA no espaço que sobrou. A palavra existia no index.html do vendas
    // antes de ele virar gerado e se perdeu na virada — voltou aqui, e só aqui.
    viewport: 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
    // 🔴 `ponte.js` ENTROU EM 19/08 — a ponte do vendas nasceu
    // (`src/vendas/ponte-src/`, costurada por `scripts/ponte-costurar.js --app
    // vendas`). Até então esta lista tinha só `native.js` e `mock.js`, e o
    // comentário aqui dizia por quê: listar um arquivo que ninguém gera
    // embarcaria um <script> 404 no APK — falha muda, a categoria de defeito que
    // mais custou dinheiro neste app. A trava era o ARQUIVO NÃO EXISTIR, e não
    // uma decisão de produto; ela morreu junto com a maquete. O freio que cobra
    // o outro lado (casca embarcada SEM ponte = app que abre mostrando "Empresa
    // 1") é o `conferirCascaTemPonte()` do `scripts/ops/deploy-vps.js`, e ele
    // barrava o publish até esta linha existir.
    // ⚠️ A ORDEM É A MESMA DO OUTRO APP e não é estética: native (resolve o tema
    // no load) → mock (declara a casca) → ponte (se apoia no que o mock
    // declarou). Trocar a ordem faz a ponte não achar `usarDados`/`ir`/`atual`.
    // ⚠️ `native.js` AGORA EXISTE em `src/vendas/assets/app/` (cópia própria,
    // nascida do `logistica/` na mesma leva — o de `main/` estava 86 linhas
    // atrás e faltavam nele o fallback web do `whatsapp()`, o `modoNavegacao`, o
    // espelho de `data-luz` e o gancho do arrastar). O Gradle prefere a do
    // flavor; a de `main/` continua servindo o app antigo, intocada.
    scripts: ['native.js', 'mock.js', 'ponte.js'],
    connectSrc: CORDAO_DE_UPDATE,
  }),
};

/** os nomes conhecidos, na ordem em que a esteira deve tratá-los. */
const nomesDeApp = () => Object.keys(APPS);

/**
 * Lê `--app <nome>` de um argv. Sem o flag vale o PADRÃO (`logistica`) — é o que
 * mantém de pé os 25+ chamadores que nunca souberam que existe um segundo app.
 * Nome desconhecido REPROVA ALTO: errar o alvo em silêncio é gerar o app errado.
 */
function resolverApp(argv) {
  const lista = Array.isArray(argv) ? argv : process.argv;
  const i = lista.indexOf('--app');
  const pedido = i > -1 ? lista[i + 1] : PADRAO;
  if (!pedido || !Object.prototype.hasOwnProperty.call(APPS, pedido)) {
    throw new Error(
      `[apps] alvo desconhecido: ${JSON.stringify(pedido || '(vazio)')}.\n` +
      `   Conhecidos: ${nomesDeApp().join(', ')} — sem --app vale "${PADRAO}".`,
    );
  }
  return APPS[pedido];
}

/**
 * Tira `--app <nome>` de uma lista de argumentos. Os scripts que leem argumento
 * POSICIONAL (`casca-antes-e-depois <commit>`, `casca-prova <casca>`) precisam
 * disto: sem tirar, `--app` viraria o commit/a casca e o portão mediria outra coisa.
 */
function semFlagDeApp(argv) {
  const lista = (Array.isArray(argv) ? argv : process.argv).slice();
  const i = lista.indexOf('--app');
  if (i > -1) lista.splice(i, 2);
  return lista;
}

module.exports = { APPS, PADRAO, RAIZ, resolverApp, nomesDeApp, semFlagDeApp };
