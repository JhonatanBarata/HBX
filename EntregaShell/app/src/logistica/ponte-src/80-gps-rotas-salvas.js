  /* ---- A VOZ DA MANOBRA --------------------------------------------------
     🔴 UM GPS QUE NÃO FALA É UM GPS QUE SE LÊ DIRIGINDO. O botão "Silenciar
     voz" já estava DESENHADO na tela de dirigir desde o V4 — e não silenciava
     nada, porque não havia voz nenhuma: `HBX.speak` existe (os recados da
     Central usam) e a navegação nunca o chamou. Mais um fio cortado na fusão,
     irmão do `locationPermissionChanged` e do `manterTelaAcesa`.

     DUAS falas por manobra, e só duas: a de PREPARAR (~300 m) e a da HORA
     (~60 m). As palavras são as MESMAS que já estão na tela — a tabela de
     manobra é mínima de propósito (Lei 8) e inventar copy de navegação é pior
     que ficar quieto.

     🔴 CADA FALA UMA VEZ SÓ. O fix chega de segundo em segundo; sem marca, o
     aparelho repetiria "vire à direita" o quarteirão inteiro. A marca é a
     manobra (o ponto dela) + o degrau. E quem entra na tela já colado na curva
     NÃO ouve o "em 300 metros" depois do "vire": o degrau pulado já nasce
     marcado.

     Quem manda na voz é o APARELHO (`soundPrefs`): a chave mestra e a chave
     `voz` que os Ajustes já tinham. Uma voz com dois donos discorda um dia. */
  const VOZ_PREPARA_M = 300;
  const VOZ_AGORA_M = 60;
  const vozDitas = new Set();

  const vozLigada = () => {
    try {
      const p = window.HBX.soundPrefs.get() || {};
      return p.master !== false && p.voz !== false;
    } catch (_) { return true; }
  };

  // o nome da rua vem ESCAPADO da fonte (§L1: é texto de terceiro e o mock
  // interpola cru). Falar "&amp;" seria o aparelho lendo marcação em voz alta.
  const paraFalar = (t) => String(t || '').replace(/&amp;/g, ' e ').replace(/&[a-z]+;/g, ' ').trim();

  function vozDaManobra(m) {
    if (!m || !m.passo || !vozLigada()) return;
    const verbo = m.passo.verbo || '';
    if (!verbo) return;
    const degrau = m.distancia <= VOZ_AGORA_M ? 'agora'
      : (m.distancia <= VOZ_PREPARA_M ? 'prepara' : '');
    if (!degrau) return;
    const onde = `${m.passo.lat.toFixed(5)},${m.passo.lng.toFixed(5)}`;
    if (vozDitas.has(`${onde}#${degrau}`)) return;
    vozDitas.add(`${onde}#prepara`);      // pulou o preparar? ele não volta atrás
    vozDitas.add(`${onde}#${degrau}`);
    const rua = paraFalar(m.passo.rua);
    // 🔴 A MANOBRA TEM PRIORIDADE NA VOZ (§ 6d): o radar escuta esta fala e
    // cala pela folga dele. Um aviso auxiliar por cima de "vire à esquerda"
    // faz o motorista perder a curva — e a curva não tem segunda chance.
    radarOuviuAVoz();
    falar(degrau === 'agora'
      ? (rua ? `${verbo} na ${rua}` : verbo)
      : `Em ${Math.round(m.distancia / 10) * 10} metros, ${verbo}`);
  }

  /* ---- O MODO DIRIGINDO --------------------------------------------------
     🔴 A TELA DO MOTORISTA APAGAVA NO MEIO DA ROTA. `H.manterTelaAcesa` e
     `H.modoNavegacao` existem em `native.js` desde o GPS FULL SCREEN e NINGUÉM
     os chamava — o comentário do Kotlin ainda diz "o app.js já tem UM dono do
     estado de navegação (syncNavWatch)", e esse `app.js` morreu na fusão de
     07/08. É o mesmo defeito do `locationPermissionChanged`: capacidade
     nativa viva, fio cortado no meio.

     O que cada uma faz, medido no Kotlin: `manterTelaAcesa` põe/tira
     FLAG_KEEP_SCREEN_ON (e o Android já limpa sozinho quando o app sai de
     cena, então não vaza bateria); `modoNavegacao` esconde as barras do
     sistema e deixa o mapa passar por baixo do recorte da câmera — é a tela
     cheia que o V4 desenha, sem a barra do Android comendo o topo e a barra de
     gestos comendo o pé.

     🔴 UM DONO SÓ, e ele é a TELA ATUAL: quem entra em `mapa` liga, quem sai
     desliga (`mapachegou` morreu no LOTE 3, 15/08 — ver `naNavegacao` logo
     abaixo). Chamado do repinte (e não só do `ir`) porque o app pode ABRIR
     direto na navegação, e aí o `ir` nunca correu. O guard de igualdade evita
     conversar com o nativo 12 vezes por segundo. */
  let dirigindoAgora = null;
  function modoDirigindo(ligado) {
    if (ligado === dirigindoAgora) return;
    dirigindoAgora = ligado;
    try { window.HBX.manterTelaAcesa(ligado); } catch (_) { /* sem ponte nativa */ }
  }

  /* as BARRAS do Android (a de status e a de navegação). Saíram de dentro do
     `modoDirigindo` porque deixaram de andar junto com ele: a tela cheia agora é
     dos DOIS modos do mapa, e a tela acesa continua sendo só de quem dirige.
     Mesmo guard de igualdade — sem ele, conversa com o nativo 12x por segundo. */
  let cheioAgora = null;
  function modoTelaCheia(ligado) {
    if (ligado === cheioAgora) return;
    cheioAgora = ligado;
    // a casca precisa saber pra tirar o cabeçalho e a barra de abas do 2D
    try { document.documentElement.dataset.cheio = ligado ? '1' : '0'; } catch (_) { /* sem DOM */ }
    try { window.HBX.modoNavegacao(ligado); } catch (_) { /* sem ponte nativa */ }
  }

  /* 🔴 A TELA CHEIA GANHOU INTERRUPTOR, E ELE MORA NO APARELHO (17/08, item 1 do
     PR17082026 — dono: *"um ícone desliga isso"*). Tela cheia com rota montada é
     o PADRÃO, porque o mapa É a tela; mas padrão sem recusa é imposição, e
     escolha que morre no fechar do app obriga o motorista a redecidir toda
     manhã. O mecanismo é o `HBX.cache` desta casa (§ 00-nucleo.js:202, o
     `update-avisado`) e o valor gravado é 1/0: número que o `Number()` lê de
     volta sem discutir com booleano de uma versão antiga.
     A casca NUNCA lê `localStorage` — ela lê o seam (§ D7 do contrato). */
  const CHAVE_CHEIO = 'mapa-cheio';
  let prefCheio = null;               // 1/0; null = ainda não li o aparelho
  function preferenciaCheio() {
    if (prefCheio === null) {
      let g = 1;                      // quem nunca escolheu abre em tela cheia
      try { g = Number(window.HBX.cache.get(CHAVE_CHEIO, 1)); } catch (_) { g = 1; }
      prefCheio = g === 0 ? 0 : 1;
    }
    return prefCheio === 1;
  }

  /* A régua da tela cheia num lugar só: TELA DO MAPA × DIA MONTADO × ESCOLHA
     DELE. Fora do laço do observador porque o TOQUE no interruptor tem de
     reavaliar na hora — esperar o próximo repinte deixaria as barras do Android
     entrando um quadro depois do dedo. */
  function avaliarTelaCheia() {
    const noMapa = naNavegacao() || telaAtual() === 'rota';
    const comRota = typeof rotaMontada === 'function' ? rotaMontada() : false;
    modoTelaCheia(noMapa && comRota && preferenciaCheio());
  }

  /* A preferência chega na casca pelo SEAM, e só quando MUDA: `usarDados` troca
     o DOM inteiro (§ o freio do pisca, no mock) e este valor é consultado no
     laço do GPS — escrever a cada fix seria a tela piscando pra sempre. Mesmo
     guard de igualdade do `modoTelaCheia`. */
  let cheioPublicado = null;
  function publicarTelaCheia() {
    if (typeof window.usarDados !== 'function') return;
    const v = preferenciaCheio();
    if (v === cheioPublicado) return;
    cheioPublicado = v;
    try { window.usarDados('rota', { telaCheia: v }); } catch (_) { /* sem seam */ }
  }

  /* O gancho `tela-cheia` (mapa de ações, D0) cai aqui: inverte, GRAVA no
     aparelho, repinta a casca e reavalia o nativo. DESLIGADO, as barras do
     Android voltam mesmo com a rota montada — é o que o interruptor promete. */
  function virarTelaCheia() {
    prefCheio = preferenciaCheio() ? 0 : 1;
    try { window.HBX.cache.set(CHAVE_CHEIO, prefCheio); } catch (_) { /* sem cache: vale a sessão */ }
    publicarTelaCheia();
    avaliarTelaCheia();
  }

  /* Só se mexe com a tela do GPS à vista. O `watchPosition` é único e vive o
     app inteiro (o mapa da rota também bebe dele); o que liga e desliga é o
     PEDIDO DE ROTA e o repinte — bateria e conta de roteador não são pagas por
     tela que ninguém está olhando. */
  // `mapachegou` morreu no LOTE 3 (15/08): a navegação é só a tela 'mapa' —
  // o "Você chegou" agora é a peça `.chegou-wrap` por cima dela, nunca outra
  // tela.
  const naNavegacao = () => telaAtual() === 'mapa';
  /* 🔴 O 2D COM ROTA MONTADA TAMBÉM É NAVEGAÇÃO (17/08 — item 2 do dono: a tira
     `restante · distância · chegada` nos DOIS modos). A peça já existe na casca
     desde hoje (§ `tiraDosIndicadores`), mas ela só nasce COM FONTE — e a fonte
     é este seam. Enquanto `aoMover` voltava na porta fora da tela 'mapa', o 2D
     era um mapa MUDO: pino, fita e posição, e nenhum número do dia. Quem achou
     foi a prova nova (`prova-mapa-uma-tela`), medindo a tira num 2D FRIO — o
     pouso do montar, que é exatamente onde o dono vai olhar primeiro.
     `telaMapa` é a régua dos DOIS; `naNavegacao` continua sendo a de QUEM DIRIGE
     — e é ela que manda no que é do 3D: a câmera inclinada, a VOZ e o radar. */
  const telaMapa = () => naNavegacao() || telaAtual() === 'rota';
  function aoMover() {
    if (!telaMapa()) return;
    pintarNavegacao();
    /* a rota do roteador é a MESMA nos dois modos (é o dia, não a câmera): sem
       ela não há restante, distância nem chegada — e é dela que a fita já vive.
       Os freios de repetição são do próprio `pedirRota` (§ 7d): entrar no 2D não
       compra pedido novo, ele reusa o mesmo que a navegação usaria. */
    pedirRota();
    if (naNavegacao()) {
      pedirCamera();
      // a voz mora AQUI, no fix — não no repinte: quem entra na tela não pode
      // levar um "vire à direita" na cara só por ter aberto o mapa.
      // 🔴 E ELA CONTINUA SÓ NO 3D: o 2D é a tela de OLHAR o dia. Falar a
      // manobra pra quem abriu a panorâmica é o app gritando fora de hora —
      // quem quer a voz está dirigindo, e dirigindo é a outra tela.
      vozDaManobra(manobraDaVez());
      // e o radar vem DEPOIS dela, sempre: a ordem das duas linhas é a
      // prioridade da manobra na voz (§ 6d).
      radarDaRota();
    }
  }

  /* ---- A ÚNICA ASSINATURA DO GPS -----------------------------------------
     Era um `watchPosition` que só guardava o centro do mapa. Vira o fix
     inteiro, e é dele que saem velocímetro, bússola e precisão.

     🔴 07/08 — O APP NUNCA PEDIA A PERMISSÃO, E A TELA DE DIRIGIR MORRIA
     CALADA. Medido no g15 com a rota de 97 paradas rodando:
     `ACCESS_FINE_LOCATION granted=false` → o `onGeolocationPermissionsShowPrompt`
     do Kotlin nega (ele só libera com a permissão do Android na mão) →
     `watchPosition` cai em "User denied Geolocation" → `ultimoFix` nunca
     existe → `coordenadasDaNavegacao()` devolve null → `pedirRota()` volta na
     porta → `navRota` fica null. Resultado na tela: SEM manobra, SEM chegada,
     SEM restante, SEM distância, SEM velocímetro e SEM bússola — o mapa mudo
     com "Parada 1 de 97" e o Encerrar, que é exatamente o que o dono viu.
     Quem pede a permissão do Android é o nativo (`H.requestLocationPermission`,
     que já existia) e NINGUÉM o chamava: o `iniciarRota` só fala com o servidor
     e o app novo não usa o `activateRoute` do app velho, que era quem pedia.

     🔴 E O ERRO ERA ENGOLIDO (`() => {}`) — a armadilha de [[cnefe-morto-por-cast-de-cep]]:
     best-effort que engole erro precisa de ALARME. Pior: o watch morre no
     "negado" e ninguém o rearma, então conceder a permissão DEPOIS não
     ressuscitava nada — só recarregar o app inteiro. Agora quem entra na
     navegação garante o GPS, o "negado" pede a permissão UMA vez e a resposta
     do Android (`locationPermissionChanged`, que o Kotlin já gritava pra um
     ouvinte que não existia) rearma a assinatura na hora. */
  const GPS_OPCOES = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 };
  let gpsWatch = null;
  let gpsPedido = false;   // já pedi a permissão nesta sessão (pedir 2× não abre 2 diálogos)
  let gpsNegado = false;   // o aparelho disse não

  function aoFix(p) {
    const c = p.coords || {};
    ultimoFix = {
      lat: c.latitude, lng: c.longitude,
      velMps: Number.isFinite(c.speed) ? c.speed : null,
      rumoGraus: Number.isFinite(c.heading) ? c.heading : null,
      precisaoM: Number.isFinite(c.accuracy) ? c.accuracy : null,
    };
    ultimaPos = { lat: c.latitude, lng: c.longitude };
    bootChegou('fix');           // § 7a-ter: a abertura espera o 1º fix
    /* O pacote de radares do dia é pedido AQUI, no 1º fix de qualquer tela, e
       não na entrada da navegação: quem abre o app na garagem dá ao nativo o
       tempo de baixar do R2 antes de a rua começar. Um pedido por dia quando
       responde, três no dia quando não responde (§ 6d, `garantirRadares`). */
    garantirRadares();
    /* 🔴 O 1º FIX QUASE SEMPRE CHEGA DEPOIS DA LISTA — numa garagem, bem
       depois. A montagem abre, busca o dia e pinta antes de existir GPS: se
       ninguém voltasse aqui, a tela ficaria na ordem do banco justamente na
       primeira vez que o motorista a abre no dia. Reencadeia com o que já está
       na memória (nada de rede) e só UMA vez — `previaComGps` fecha a porta;
       repintar a cada fix seria a lista tremendo debaixo do dedo dele. */
    if (!previaComGps && telaAtual() === 'montagem') publicarPrevia();
    // Chegou fix: a barra do mapa não tem mais o que dizer sobre GPS e cede a
    // linha pro fato do dia (§ publicarGps). É aqui e não no `armarGps` porque
    // "armado" não é "achou" — quem tira o "Procurando você…" da tela é a
    // posição de verdade.
    publicarGps();
    // A seta do mapa 2D anda aqui, e só aqui: é um `setLngLat` num marcador que
    // já existe — nem repinte, nem câmera, nem tile novo. A tela principal da
    // rota mostrando onde o motorista está AGORA custa isto.
    moverEuNoPlano();
    // ...e o CAMINHO entre os pinos, se a tela Rota tirou bilhete e ainda não
    // havia fix pra gastá-lo (§ tracoDoPlano). Gasto UMA vez: os fixes
    // seguintes batem na porta e voltam — não é laço, é um bilhete só.
    tracoDoPlano();
    // O anel roda em QUALQUER tela: o motorista chega perto do cliente
    // com o app na lista de paradas, não no GPS. `aoMover` é que é só da
    // navegação — por isso o anel vem antes, e fora dele.
    anelDeChegada();
    aoMover();
  }

  function armarGps() {
    if (!navigator.geolocation || gpsWatch !== null) return;
    try {
      gpsWatch = navigator.geolocation.watchPosition(aoFix, aoErroGps, GPS_OPCOES);
      gpsNegado = false;
    } catch (_) { gpsWatch = null; }
    publicarGps();
  }

  /* 🔴 DÁ PRA SABER SEM PERGUNTAR — e é essa a diferença entre ligar o GPS e
     dar um susto em quem abriu o app (09/08, dono na tela inicial da rota:
     *"não tem pino de onde estou"*).

     O que havia era `armarGps()` no BOOT, cru: um `watchPosition` disparado
     antes de qualquer tela existir. No aparelho isso não abre diálogo (o
     `onGeolocationPermissionsShowPrompt` do Kotlin nega sozinho quando a
     permissão do Android não está na mão), mas QUEIMA o estado — o erro de
     código 1 chega, `gpsNegado` vira true e o app passa o resto da sessão
     achando que foi recusado, sem ninguém ter perguntado nada. Num navegador
     comum é pior: é o diálogo do sistema na cara de quem só abriu o app.

     `navigator.permissions.query` responde "granted/prompt/denied" SEM abrir
     diálogo nenhum. Então a regra fica honesta: já concedida ⇒ liga o watch e o
     ponto anda sozinho; não concedida ⇒ NÃO se pede aqui — quem pede é o dedo,
     no botão-alvo ou na própria barra do mapa, que é onde o pedido tem assunto.
     Sem a API (WebView velho) ninguém arma no boot: o desfecho é a barra dizendo
     que a localização está desligada, e um toque resolve. Ficar sem pedir é
     recuperável com um toque; pedir fora de hora não tem desfazer. */
  /* 🔴 'prompt' NO WEBVIEW NÃO ENCERRA A PERGUNTA — medido no g15 (09/08):
     com ACCESS_FINE_LOCATION concedida e a Localização do aparelho LIGADA, o
     `permissions.query` respondia 'prompt' mesmo assim, porque o portão dele é
     o da ORIGEM da página (a camada que `onGeolocationPermissionsShowPrompt`
     responde), não o do Android. Confiar nele deixava o eu-pino morto num
     aparelho com tudo em ordem. Quando a resposta é 'prompt'/nula, quem decide
     é uma SONDA: no WebView um pedido de fix nunca abre diálogo (o Kotlin nega
     ou libera CALADO — medido em 08/08), então fix ou timeout = a permissão
     existe (2/3 são garagem e túnel, a régua do watch); código 1 = não existe,
     e a barra vira a porta. Na bancada a sonda também nunca abre nada. */
  function sondaDePermissao() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      try {
        navigator.geolocation.getCurrentPosition(
          () => res('granted'),
          (e) => res(e && e.code === 1 ? 'denied' : 'granted'),
          { maximumAge: 1 << 30, timeout: 3500 },
        );
      } catch (_) { res(null); }
    });
  }

  function estadoDaPermissao() {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return sondaDePermissao();
      return navigator.permissions.query({ name: 'geolocation' })
        .then((s) => {
          const estado = (s && s.state) || null;
          if (estado === 'granted' || estado === 'denied') return estado;
          return sondaDePermissao();
        }, () => sondaDePermissao());
    } catch (_) { return sondaDePermissao(); }
  }

  function armarGpsSeConcedido() {
    estadoDaPermissao().then((estado) => {
      if (estado === 'granted') armarGps();
      else publicarGps();
    });
  }

  /* 🔴 O ESTADO DO GPS ERA UMA CHAVE MORTA. O mock desenhou os três estados da
     barra do mapa (`DADOS.rota.gps`: '' / 'procurando' / 'negado', com a barra
     virando BOTÃO no 'negado') e ninguém deste lado do fio jamais escreveu o
     campo — casca prometendo pele em peça que não existe, a armadilha de
     [[chave-morta-vira-parede]]. Aqui ele passa a ser escrito, e por um dono só.
     A régua é o que o app REALMENTE tem, nunca o que ele gostaria de ter:
       tenho fix          → '' (nada a dizer: o ponto está na tela)
       watch ligado, sem fix → 'procurando' (informa, não alarma — passa sozinho)
       sem watch          → 'negado' (a barra vira a porta que resolve)
     "Nunca perguntei" cai no mesmo 'negado' de propósito: pro motorista o fato
     é o mesmo — o app não sabe onde ele está e o caminho de saída é a permissão
     do Android. Inventar um quarto estado seria explicar a nossa contabilidade
     interna pra quem só quer ver o próprio ponto. */
  function publicarGps() {
    if (typeof window.usarDados !== 'function') return;
    const estado = ultimoFix ? '' : (gpsWatch !== null ? 'procurando' : 'negado');
    try { window.usarDados('rota', { gps: estado }); } catch (_) { /* sem seam */ }
  }

  /* Só o NEGADO (código 1) desarma. Timeout e "posição indisponível" são a
     garagem, o túnel, o prédio — o watch continua vivo e o próximo fix chega
     sozinho; matá-lo ali deixaria o motorista sem GPS pelo resto do dia. */
  function aoErroGps(e) {
    if (!e || e.code !== 1) return;
    if (gpsWatch !== null) {
      try { navigator.geolocation.clearWatch(gpsWatch); } catch (_) { /* já morreu */ }
      gpsWatch = null;
    }
    gpsNegado = true;
    // A barra do mapa passa a dizer o que acabou de acontecer — e como ela é
    // BOTÃO no 'negado', o motorista sai dali com um toque em vez de ficar
    // olhando um mapa mudo (§ publicarGps).
    publicarGps();
    // Fora da navegação a permissão não é cobrada: diálogo de localização na
    // cara de quem abriu o app pra ver o chat é pedido fora de hora.
    if (naNavegacao()) garantirGps();
  }

  /* 🔴 O PEDIDO QUE NASCE DO DEDO. O botão-alvo do mapa 2D e a barra de
     "Localização desligada" são as duas portas por onde o motorista PEDE a
     própria posição — e pedido dele é a única hora em que o diálogo do Android
     não é invasão.
     Por que não reusar o `garantirGps` puro: ele só chama o nativo depois de já
     ter levado um "negado" (`gpsNegado`), e na tela do mapa esse negado pode
     ainda não ter chegado — o `aoErroGps` só reencaminha em NAVEGAÇÃO. O toque
     ficaria sem efeito nenhum na primeira vez, que é justamente a vez que
     importa. Aqui se pergunta o estado ANTES (sem diálogo) e se decide: já
     concedida, é só armar; não concedida, o nativo pede — uma vez por sessão. */
  function pedirGpsNoToque() {
    if (gpsWatch !== null) return;              // já ligado: não há o que pedir
    estadoDaPermissao().then((estado) => {
      if (estado === 'granted') { armarGps(); return; }
      if (gpsPedido) { avisarSemGps(); return; }
      gpsPedido = true;
      try { window.HBX.requestLocationPermission(); } catch (_) { avisarSemGps(); }
    });
  }

  function garantirGps() {
    if (!gpsNegado) { armarGps(); return; }
    if (gpsPedido) { avisarSemGps(); return; }
    gpsPedido = true;
    try { window.HBX.requestLocationPermission(); } catch (_) { avisarSemGps(); }
  }

  /* O ALARME. Só na tela que depende dele, e só depois que o Android já teve a
     chance de responder — senão vira aviso de problema que o toque seguinte
     resolveria. */
  function avisarSemGps() {
    if (typeof window.portao !== 'function' || !naNavegacao()) return;
    window.portao({
      tom: 'alerta', ico: 'gps', titulo: 'Sem localização',
      sub: 'Libere o GPS do HBX nos ajustes do Android.',
      acoes: [['Fechar', '']],
    });
  }

  // O Kotlin responde aqui depois do diálogo do Android (`MainActivity.
  // notificarPermissaoCadastroLocalizacao`). Sem este ouvinte, o "Permitir" do
  // motorista não acendia nada até ele fechar e abrir o app.
  window.HBXApp.locationPermissionChanged = function (concedida) {
    if (concedida) { gpsNegado = false; armarGps(); return; }
    publicarGps();
    avisarSemGps();
  };

  /* No boot só se LIGA o que já foi concedido — nunca se PEDE (§ estadoDaPermissao).
     Era `armarGps()` cru aqui, e era ele quem queimava o "negado" antes de
     qualquer tela existir. */
  armarGpsSeConcedido();

  /* O interruptor precisa nascer com o valor certo: o mock lê `DADOS.rota.telaCheia`
     e o default dele é o do DESENHO, não o do aparelho. Sem esta escrita única, o
     ícone nasceria ligado num app que o motorista deixou DESLIGADO ontem — botão
     mentindo sobre o próprio estado. Uma vez, no boot; depois só o dedo escreve. */
  publicarTelaCheia();

  /* A BUSCA É DE TECLA, NÃO DE CLIQUE — por isso não cabe no mapa de ações.
     Espera o dedo parar (350ms) antes de ir ao servidor: mandar a cada letra
     enfileira 8 requisições pra digitar "Larissa" e a última nem sempre é a
     que chega por último. O guard `__hbxBusca` é obrigatório: cada repinte
     traz um input NOVO, e sem ele o listener empilhava a cada tecla. */
  let buscaTimer = null;
  let buscaRapidaTimer = null;
  function ligarBusca() {
    const cli = naCamada('[data-campo="busca-cliente"]');
    if (cli && !cli.__hbxBusca) {
      cli.__hbxBusca = true;
      cli.addEventListener('input', () => {
        const valor = String(cli.value || '');
        clearTimeout(buscaTimer);
        buscaTimer = setTimeout(() => {
          filtroClientes.busca = valor;
          // O seam guarda o texto pra ele sobreviver ao repinte da lista — sem
          // isso o campo se apagava sozinho no meio da digitação.
          carregarClientes();
        }, 350);
      });
    }
    /* A busca da porta "Meus clientes" tem a MESMA espera de 350ms da lista de
       Clientes, e pelo mesmo motivo: uma ida ao servidor por letra enfileira 8
       pedidos pra digitar "Larissa" e o último a chegar nem sempre é o certo. */
    const cliRapida = naCamada('[data-campo="rapida-cliente-busca"]');
    if (cliRapida && !cliRapida.__hbxBusca) {
      cliRapida.__hbxBusca = true;
      cliRapida.addEventListener('input', () => {
        const valor = String(cliRapida.value || '');
        clearTimeout(buscaRapidaTimer);
        buscaRapidaTimer = setTimeout(() => {
          if (!rapida) return;
          rapida.buscaCliente = valor;
          rapida.listaCarregando = true;
          publicarRapida();
          carregarClientesDaRapida();
        }, 350);
      });
    }
    const prod = naCamada('[data-campo="busca-produto"]');
    if (prod && !prod.__hbxBusca) {
      prod.__hbxBusca = true;
      // Catálogo inteiro já está no aparelho: filtra na hora, sem espera e sem
      // ida ao servidor. O que justifica a diferença pro cliente é o TAMANHO.
      prod.addEventListener('input', () => {
        filtroProdutos.busca = String(prod.value || '');
        carregarProdutos();
      });
    }
  }

  /* Quem abre a tela é quem manda buscar. O mock chama `ir` NU dentro dele, e
     função declarada no topo vira propriedade do window — então trocar
     `window.ir` alcança os toques da barra também (mesmo pacto do `trocarLuz`). */
  if (typeof window.ir === 'function') {
    const irDoMock = window.ir;
    window.ir = function (tela) {
      // DE ONDE ELE VEIO, lido ANTES da troca: é o que a parada avulsa usa pro
      // Voltar apontar pra tela certa (mesma lei do `ficha.volta`). Depois do
      // `irDoMock` o `atual` já é o destino, e a origem estaria perdida.
      const veioDe = telaAtual();
      /* 🔴 JÁ ESTOU NESTA TELA ⇒ NÃO HOUVE ENTRADA (09/08, "TELA REMONTANDO
         TELA"). O `ir` do mock recusa o destino igual ao atual (`k===atual`) e
         não repinta nada — mas ESTE embrulho seguia rodando os efeitos de
         ABERTURA assim mesmo, e o de 'montagem' é o mais caro que existe aqui:
         ele RE-RODA o otimizador (`montarRota`, que fala com o servidor) e
         reenche a lista inteira. Um `ir('rota')` no fim do Iniciar, ou um
         `ir('montagem')` de quem já estava nela, virava trabalho de tela cheia
         sem tela nenhuma ter trocado.
         🔴 A CURA É DA FAMÍLIA, não deste chamador: efeito de ENTRADA é da
         entrada, e a régua mora na única porta por onde toda tela entra. Curar
         só o `iniciarRota` seria o bug trocando de endereço — a lei de 08/08
         ([[o-pisca-era-a-tela-entrando-de-novo]]).
         Quem precisa de dado fresco na tela em que já está pede pelo SEAM
         (`carregarRota`/`usarDados`), que é o caminho que MORFA o rodapé em vez
         de reconstruir a tela. */
      if (tela === veioDe) return irDoMock.apply(this, arguments);
      /* 🔴 SAIR DA MONTAGEM SEM MANDAR GRAVAR JOGA O RASCUNHO FORA (dono, 09/08:
         "eu ainda nem confirmei q queria nada"). As telas que CONTINUAM a mesma
         decisão — a porta de escolher gente, a ficha do cliente, o cadastro —
         não contam como desistir: o dedo ainda está montando o dia. */
      if (veioDe === 'montagem' && !MANTEM_RASCUNHO.has(tela)) descartarRascunho();
      const r = irDoMock.apply(this, arguments);
      if (tela === 'clientes') carregarClientes();
      if (tela === 'produtos') carregarProdutos();
      // A parada avulsa NASCE EM BRANCO, sempre — mesma lei do cadastro: campo
      // que guarda o endereço da vez passada é a receita de adicionar duas
      // vezes a mesma porta.
      // ...e a porta "Meus clientes" abre já buscando: ela é a porta padrão, e
      // lista que só carrega no 1º toque faz a tela nascer vazia por engano.
      if (tela === 'rapida') { rapidaEmBranco(veioDe); carregarClientesDaRapida(); }
      // A montagem é a tela de MONTAR: abrir já traz os chips (quem é admin) e
      // a lista do dia escolhido. Sem isto ela abriria com a lista da última
      // vez — e o motorista montaria a rota de ontem sem saber.
      // ...e relê quais dias TÊM cliente: cadastrar gente numa terça vazia tem
      // que devolver a terça pra fila de chips sem fechar o app. Dado igual não
      // repinta (o freio do `usarDados`), então reler aqui não pisca nada.
      // ...e GARANTE O GPS: a partir de 08/08 a lista da montagem é encadeada
      // pela posição do motorista, então aqui a localização passou a fazer
      // falta — é a mesma régua do "Navegar" (pedir no momento em que serve).
      // Negada, ninguém leva alerta nesta tela (`avisarSemGps` só fala na
      // navegação): a lista cai na ordem do servidor e a rota se monta como
      // antes. Montar rota nunca depende de permissão.
      if (tela === 'montagem') {
        garantirGps(); publicarMontarDias(); carregarDiasComCliente(); carregarEspacos(); encherMontagem(); carregarHistorico();
        /* 🔴 ENTRAR NÃO MONTA MAIS NADA (dono, 10/08: "montar rota, voltar.
           ROTA JÁ FOI GERADA. pq?" · "cancelo a rota, fica piscando").
           O auto-montar de 08/08 ("funcionar já no carregamento") gravava no
           servidor só de ABRIR a tela: o planejar carimbava `rotaOrdem` e — com
           o materialize de 10/08 — até RESSUSCITAVA um dia recém-cancelado, e
           cada volta repetia a cena de rota nova (o "piscando"). É a mesma
           regressão que o dono já matou em 29/07 ("estou apertando Cancelar…
           os clientes voltam!!!"), agora pela porta da agenda.
           A régua vigente é a do rascunho (09/08, "eu ainda nem confirmei q
           queria nada"): a Montagem MOSTRA e deixa mexer; quem GRAVA é o dedo —
           Iniciar (materializa + planeja + inicia), Salvar, "Meus clientes"/
           avulsa. Entrar e voltar deixa o servidor exatamente como estava. */
      }
      /* 🔴 A TELA PRINCIPAL DA ROTA É UM MAPA, E MAPA SEM "ONDE EU ESTOU" NÃO É
         MAPA (dono, 08/08: *"não mostra minha localização tbm"*). O watch do
         GPS só era armado dentro da NAVEGAÇÃO (`naNavegacao()`), então na aba
         Rota nunca chegava um fix: sem fix não há marcador, e sem marcador o
         `enquadrarGeral` também não tinha o motorista pra pôr na moldura. O
         "pedir fora de hora" que este arquivo evita é pedir no boot ou na tela
         de chat — numa tela que É um mapa, a localização é o assunto. Mesma
         régua do "Navegar" e da Montagem: cobra-se onde serve.

         🔴 MAS ABRIR A TELA NÃO É PEDIR (09/08). Aqui era `garantirGps()`, que
         chama o diálogo do Android — quer dizer que ENTRAR na aba Rota abria um
         pedido de permissão sem ninguém ter tocado em nada. `armarGpsSeConcedido`
         faz a metade que serve e nenhuma a mais: quem já concedeu ganha o ponto
         andando na hora, sem diálogo; quem não concedeu vê a barra dizer que a
         localização está desligada, e o pedido nasce do DEDO — no botão-alvo ou
         na própria barra (§ pedirGpsNoToque). */
      /* 🔴 ...E O CAMINHO ENTRE OS PINOS. Entrar aqui TIRA O BILHETE do traço
         (§ tracoDoPlano): um pedido, na mesma porta com os mesmos freios, pra
         a tela principal não mostrar mais ponto solto. Se o GPS ainda não deu
         fix, o bilhete espera o primeiro — não há relógio nenhum atrás disto. */
      /* 🔴 E O 2D JÁ NASCE COM OS NÚMEROS DO DIA (17/08, item 2). Mesma lei do
         `tela === 'mapa'` logo abaixo — "a navegação não espera o próximo fix":
         entrar na tela pinta o que se sabe SEM GPS (o que falta, a distância, a
         hora de chegada) e já pede a rota. Sem isto a tira só apareceria no
         primeiro `watchPosition`, que numa garagem demora — e o pouso do montar
         cai justamente aí. */
      if (tela === 'rota') {
        armarGpsSeConcedido(); planoQuerTraco = true; tracoDoPlano();
        pintarNavegacao(); pedirRota();
      }
      if (tela === 'chat') aoAbrirChat();
      // Cadastro NASCE EM BRANCO, sempre. Formulário que guarda o cliente
      // anterior é a receita de cadastrar duas vezes a mesma pessoa — e aqui
      // ninguém apaga campo por campo com o motor ligado.
      if (tela === 'novocliente') novoEmBranco();
      if (tela === 'ajustes') carregarAjustes();
      if (tela === 'salvas') carregarSalvas();
      // Créditos é UMA tela desde 09/08 e busca as DUAS portas de uma vez.
      if (tela === 'creditos') carregarCreditos();
      // A carteira do dono busca sozinha, como a Recarga: quem abrisse o
      // Financeiro via o dinheiro do DESENHO, viesse de onde viesse.
      if (tela === 'financeiro') carregarFinanceiro();
      // 🔴 A NAVEGAÇÃO NÃO ESPERA O PRÓXIMO FIX. Entrar na tela já pinta o que
      // se sabe SEM GPS nenhum (parada N de M, nome, endereço, o que falta) e
      // já pede a rota. Sem isto o rodapé nascia vazio e só se enchia no
      // primeiro `watchPosition` — que numa garagem pode demorar.
      // 🔴 E É AQUI QUE A PERMISSÃO DE LOCALIZAÇÃO SE COBRA: no toque do
      // "Navegar", que é o momento em que ela passa a fazer falta. Pedir no
      // boot do app seria pedir fora de hora; não pedir nunca era a tela muda.
      if (tela === 'mapa') {
        garantirGps(); pintarNavegacao();
        /* 🔴 ENTRAR NA NAVEGAÇÃO É DESCER (§7d-bis) — mas quem diz "entrei" é o
           OBSERVADOR, não este toque. Eram duas portas mandando a mesma coisa
           (medido: dois `jumpTo` com 6 ms de diferença), e só uma delas sabe de
           ONDE o motorista veio. Aqui fica só o pedido de rota, que é dado.
           🔴 `mapachegou` MORREU NO LOTE 3 (15/08): o "Você chegou" não é mais
           tela pra onde se navega — é a peça `.chegou-wrap`, por cima desta
           mesma tela de dirigir. O par `if (tela==='mapachegou') pararDescida()`
           que morava aqui saiu junto: ninguém chama `window.ir('mapachegou')`. */
        pedirRota();
      }
      return r;
    };
  }

  // toda pintura de tela pode trazer um palco novo: o mapa nasce junto.
  /* 🔴 QUEM ENTRA NA NAVEGAÇÃO DESCE — INCLUSIVE QUEM JÁ ABRE NELA. O `ir`
     alcança o toque do "Navegar", mas o app pode SUBIR direto na tela de
     dirigir (o motorista fechou o app no meio da rota e voltou), e aí `ir`
     nunca correu. A troca de tela vista daqui é a mesma porta, e ela é única:
     repinte não muda `telaAtual`, então isto não dispara duas descidas. */
  let telaVistaAqui = null;
  const observador = new MutationObserver(() => {
    // o gesto da troca de modo, decidido na virada de tela e executado depois do
    // transplante (§ mais abaixo). Nasce e morre DENTRO desta passada: gesto que
    // sobrevive ao repinte é câmera se mexendo fora de hora.
    let trocando = null;
    // a FASE da câmera antes do mapa: `montarMapa` já manda a câmera pro lugar,
    // e ela precisa saber que a tela está entrando (2D) e não dirigindo (3D).
    if (telaAtual() !== telaVistaAqui) {
      const veioDe = telaVistaAqui;
      telaVistaAqui = telaAtual();
      /* 🔴 VOLTAR DA FOLHA NÃO É ENTRAR NA ROTA (traduzido no LOTE 3, 15/08 —
         "a exceção mais perigosa" do plano). Até 14/08 isto testava
         `veioDe === 'mapachegou'`: a chegada era uma TELA própria, e voltar
         dela pro mapa não podia reencenar a cidade nascendo. Ela morreu —
         "Você chegou" agora é a peça `.chegou-wrap`, por cima do PRÓPRIO
         `T.mapa` — mas o cruzamento que esta exceção evita continua existindo,
         só que por outra porta: "Registrar entrega" no cartão abre a
         'folha' (ou 'folhanao', o desfecho sem entregar — a 'venda' morreu em
         24/08 com a folha simples), e confirmar
         devolve o motorista pro 'mapa' de onde o cartão nasceu
         (`irDepoisDoDesfecho`, lendo `chegadaPalco`). Sem esta tradução, cada
         parada resolvida enquanto dirigindo reencenaria a cidade nascendo +
         1,8 s de descida de câmera, dezenas de vezes por dia, no meio da rua —
         era exatamente o defeito que a exceção original existia pra matar. */
      if (telaVistaAqui === 'mapa') {
        if (veioDe === 'folha' || veioDe === 'folhanao') { camFase = 'dirigindo'; pedirCamera(); }
        /* 🔴 VOLTAR DA PANORÂMICA TAMBÉM NÃO É ENTRAR NA ROTA (16/08). Caía no
           `entrarNaDescida` — a coreografia de quem chega pela primeira vez:
           cena das ruas + 400 ms de vista de cima + 1,8 s de descida, MEDIDOS
           no g15 como 3 s de tela parada antes de a câmera se mexer. É a mesma
           exceção da 'folha' logo acima, pelo mesmo motivo (a cidade já
           nasceu) — só que aqui a câmera TEM que voltar, porque ela subiu. A
           pose do 2D é guardada agora, antes de o mapa ser estacionado, e a
           descida acontece depois do transplante (§ `descerDoPlano`). */
        else if (veioDe === 'rota') { trocando = 'descer'; }
        else entrarNaDescida();
      } else if (veioDe === 'mapa' && telaVistaAqui === 'rota') {
        /* 🔴 A VOLTA GANHOU O GESTO QUE A IDA SEMPRE TEVE (16/08 — dono:
           *"efeito subindo e descendo, reverso bem feito"* e *"ao assentar o
           efeito das ruas acendendo nos 2"*). Este `else` era um cancelamento
           seco: a Panorâmica saía do 3D sem uma ordem de câmera e sem cena
           nenhuma. As três peças abaixo já existiam — faltava CHAMADOR.
           1. A SUBIDA, no mapa que está saindo, com a janela do próprio gesto de
              camada (--mv-cheio, 520 ms): é o `descer()` com o sinal trocado.
           2. A cena viva do 3D sai SECA antes de pedir a de cima — é a lei "uma
              cena por vez" que `cenaAoContrario` já escreve. Sem ela, toda volta
              feita nos ~2 s da cena do 3D cairia no `if (cena) return` de
              `chamarCena` e o efeito nasceria intermitente.
           3. `pedirCena('rota')` — o motivo 'rota' JÁ existe, JÁ aponta pro palco
              'geral' e JÁ tem ritmo próprio declarado. Quem toca é o transplante,
              quando o palco de cima aparece.
           🔴 E A SUBIDA MUDOU DE MAPA (16/08, depois de VER a troca gravada no
           g15): subir o mapa que SAI é subir dentro de uma camada que está
           desaparecendo — invisível — enquanto o mapa que ENTRA aparece na
           câmera de outro lugar. Corte seco, que é a "travação" do dono. Agora o
           que sai fica PARADO (as duas camadas pintam a mesma imagem no
           cruzamento) e quem sobe é quem entra, a partir da pose guardada
           aqui (§ `subirNoPlano`). */
        pararDescida();
        if (typeof encerrarCena === 'function' && typeof cena !== 'undefined' && cena) encerrarCena('saida', true);
        /* o `pedirCena('rota')` que morava aqui foi pro fim do movimento
           (§ `subirNoPlano`): pedido no instante da troca punha a cena nascendo
           POR CIMA da subida, e a ordem do dono diz "AO ASSENTAR". */
        trocando = 'subir';
      } else pararDescida();
    }
    const palco = naCamada('[data-mapa]');
    if (palco) montarMapa(palco);
    /* 🔴 A CÂMERA DA TROCA VEM DEPOIS DO TRANSPLANTE, e essa ordem é a diferença
       entre mover o mapa e mover o mapa NO LUGAR CERTO: antes do `montarMapa` o
       palco que entra ainda não tem mapa nenhum, e o mapa que vai receber a
       ordem ainda está na garagem, com o tamanho DELA — o recuo do puck e a
       moldura sairiam calculados contra uma caixa que ninguém vê. */
    if (trocando) {
      const gesto = trocando;
      trocando = null;
      if (gesto === 'subir') subirNoPlano(); else descerDoPlano();
    }
    // 🔴 A PORTA ÚNICA DO CARTÃO "VOCÊ CHEGOU" (LOTE 3, 15/08). Cobre volta de
    // Ajustes/Chat/folha, chegada recebida noutra tela (guardada em `chegada`
    // sem ter montado ainda) e o app subindo com a pendência já carimbada. A
    // própria função decide se monta, se ignora (repinte com o nó já vivo) ou
    // se sai calada (fora de rota/mapa) — `function`, hoisted lá de baixo em
    // D0-porta-entrega.js.
    desenharChegada();
    // tela que saiu de cena não leva o mapa junto: ele vai pra garagem
    // off-screen e volta inteiro — com a câmera onde estava.
    estacionarMapas();
    // tela acesa + tela cheia enquanto dirige; ambas voltam ao sair
    /* 🔴 TELA CHEIA NOS DOIS MODOS (16/08 — dono: *"se tiver rota montada, 2d e
       3d no full screen"*). Era só a tela de dirigir: o 2D ficava espremido
       entre as duas barras do Android enquanto mostra o MESMO mapa. Quem manda
       agora é o par (tela do mapa) × (dia montado) — sem rota, o 2D volta a ser
       tela de app comum, com as barras no lugar.
       `manterTelaAcesa` continua SÓ dirigindo: o 2D é tela de olhar, não de
       rodar o dia inteiro com o aparelho torrando bateria.
       🔴 …E O TERCEIRO FATOR É O DEDO (17/08): a régua inteira mora em
       `avaliarTelaCheia` porque ela agora tem DOIS chamadores (este repinte e o
       toque no interruptor), e régua duplicada é como os dois discordam no
       primeiro estado novo. */
    avaliarTelaCheia();
    modoDirigindo(naNavegacao());
    // repinte traz elementos NOVOS, sem `--x/--y`: sem isto as empresas
    // nasciam empilhadas no canto até a câmera se mexer.
    posicionarEmpresas();
    ligarBusca();
    ligarCamposDaFicha();
    // O chat vive no PÉ. Qualquer repinte (o do fio, o da barra, o de outra
    // seção) nasce com a rolagem no zero — quem devolve o pé é isto, no mesmo
    // lugar onde o mapa já reencontra o palco dele.
    encostarNoPe();
  });
  observador.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });

  /* ------------------------------------------------------------------------
     L10 — ROTAS SALVAS (é aqui que a "Rota de <dia>" do L5 vai parar).

     Só LISTA e ABRIR: criar, duplicar, editar e indicar modelo saíram no corte
     de 06/08 — é trabalho de escritório e o desktop já faz. Por isso o par
     "Duplicar / três pontinhos" do desenho não é renderizado com dado real:
     botão que não leva a lugar nenhum é pior que botão ausente.
     ------------------------------------------------------------------------ */
  const MODELOS = new Map();

  async function carregarSalvas() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    let r;
    try { r = await window.API.get('/logistica/rota-modelos'); } catch (_) { return fonteCaiu('salvas'); }
    const lista = Array.isArray(r) ? r : [];
    MODELOS.clear();
    lista.forEach((m) => { if (m && m.id) MODELOS.set(String(m.id), m); });
    /* 🔴 A LISTA SE DIVIDE PELOS DIAS (dono, 08/08) — é a mesma mudança dos 2
       espaços da tela de montar, vista pelo outro lado: lá cabem 2 por dia, e
       AQUI é onde o dono enxerga tudo o que existe (inclusive o que sobrou de
       antes dos espaços, ou o que o "fechar o dia" salvou sozinho).
       Dentro do dia a ordem é a de NASCIMENTO, a mesma dos espaços — assim o
       1º da Segunda nesta tela é o Espaço 1 da Segunda lá. As sem dia fixo vão
       pro fim, agrupadas: elas existem (vêm do desktop) e sumir com elas seria
       a tela mentindo. */
    const ordenada = lista.slice().sort((a, b) => {
      const da = Number(a && a.diaSemana) || 99;
      const db = Number(b && b.diaSemana) || 99;
      if (da !== db) return da - db;
      return String((a && a.criadoEm) || '').localeCompare(String((b && b.criadoEm) || ''))
        || String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
    });
    let diaAnterior = null;
    window.usarDados('salvas', {
      ...fonteVoltou,
      busca: '',
      total: `${lista.length} ${lista.length === 1 ? 'rota salva' : 'rotas salvas'}`,
      // "Ordenar por" precisa de mais de uma ordem pra existir; o servidor
      // devolve uma lista só, na ordem dele.
      ordem: '',
      acoes: 0,
      lista: ordenada.map((m) => {
        const paradas = Array.isArray(m.paradas) ? m.paradas.length : 0;
        const dia = Number(m.diaSemana) || 0;
        const cab = dia === diaAnterior ? '' : (DIAS_SEMANA[dia] || 'Sem dia fixo');
        diaAnterior = dia;
        return [
          esc(m.nome),
          // A porta não devolve data de criação; o que ela tem é o DIA da
          // semana do modelo — que é justamente o que identifica a rota do dia.
          m.diaSemana ? DIAS_SEMANA[Number(m.diaSemana)] || '' : '',
          String(paradas),
          '',            // produtos: sem fonte
          '',            // marcado: sem fonte
          'route',
          0,
          String(m.id),
          cab,
        ];
      }),
    });
  }

  /** Abrir = GERAR a rota de hoje a partir do modelo. Cria entrega: confirma. */
  async function abrirSalva(id) {
    const m = MODELOS.get(String(id));
    if (!m || typeof window.portao !== 'function') return;
    const paradas = Array.isArray(m.paradas) ? m.paradas.length : 0;
    window.portao({
      tom: 'info', ico: 'play', titulo: 'Usar esta rota hoje?',
      sub: `${esc(m.nome)} · ${paradas} ${paradas === 1 ? 'parada' : 'paradas'}`,
      acoes: [['Agora não', ''], ['Usar', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      try { await window.API.post(`/logistica/rota-modelos/${encodeURIComponent(id)}/gerar`, { date: diaOperacional() }); }
      catch (e) { return avisoErro(e); }
      await carregarRota();
      window.ir('rota');
    }), { once: true });
  }

  /* ------------------------------------------------------------------------
     SALVAR A ROTA (P5 do roteiro) — o botão azul da montagem, que era MORTO.

     Salva o ROTEIRO (a lista de clientes na ordem), não as entregas do dia: é
     exatamente o que as "Rotas salvas" reaplicam depois (`rota-modelos/:id/gerar`).
     · O que salva depende do estado: rota montada salva as PARADAS REAIS (na
       ordem que o planejador deu); ainda por montar salva a PRÉVIA do dia.
     · Nome repetido não é erro: o servidor recusa duplicado (`assertNomeUnico`),
       então nome que já existe vira PATCH — salvar de novo ATUALIZA a rota do
       dia em vez de estourar 400 na cara do motorista. É o mesmo pacto do app
       antigo (`if (existing) PATCH else POST`).
     ------------------------------------------------------------------------ */
  const PARADAS_SALVAR = [];        // as paradas da rota MONTADA, em ordem

  const nomeCurto = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, NOME_MAX);

  /** o que o "Salvar" grava: rota montada manda; ainda por montar, a prévia */
  /* Salvar espaço salva O QUE ESTÁ NA TELA. Na Montagem isso é sempre a lista
     da prévia (a tela é uma só desde 08/08, e é ela que o dedo reordena); em
     qualquer outra, as paradas da rota carregada. Antes a chave era
     `estadoRota`, e com a rota montada ele salvava a ordem do SERVIDOR mesmo
     com o motorista olhando pra ordem dele. */
  const paradasParaSalvar = () => (telaAtual() === 'montagem' && PREVIA.length ? PREVIA : PARADAS_SALVAR)
    .filter((p) => p && p.customerProfileId);

  /* 🔴 O ESPAÇO VAZIO ENSINA (dono, 08/08: "clicou em cima ensina — abre o mini
     tutorial"). Os dois extremos são ruins: espaço que grava no primeiro toque
     salva rota por engano, espaço que não faz nada é botão morto. O tutorial
     explica em 3 passos e já deixa a saída no botão principal. */
  function tutorialDoEspaco(chave) {
    if (typeof window.portao !== 'function') return;
    const n = Math.max(1, idxDoModo(chave) + 1);
    const passo = (i, t, s) => `<div class="pt-passo"><b>${i}</b><span><strong>${t}</strong>${s}</span></div>`;
    window.portao({
      tom: 'info', ico: 'save', titulo: `Espaço ${n} — ainda vazio`,
      sub: `Cada dia da semana guarda ${MAX_ESPACOS} rotas suas, com o nome que você escolher.`,
      corpo: `${passo(1, 'Deixe a lista na ordem que você dirige', 'arraste as paradas pelo punho')}
        ${passo(2, 'Salve neste espaço', 'com um nome curto: Manhã, Centro, Bairro…')}
        ${passo(3, diaDosEspacos() > 0 ? `Na próxima ${ROTULO_DIA[diaDosEspacos()] || 'vez'}` : 'Na próxima rota avulsa', 'um toque no botão e a ordem volta')}`,
      acoes: [['Agora não', ''], ['Salvar aqui', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (botao) botao.addEventListener('click', () => pedirNome(n - 1), { once: true });
  }

  /* O nome é DIGITADO (o botão do seletor mostra o que ele escreveu) e tem teto
     de 10: cada posição leva 1/4 da largura da tela, e nome que não cabe vira
     reticência — o motorista deixaria de distinguir os espaços.
     `extra` é a versão OBRIGATÓRIA desta mesma tela (a trava da ordem alterada,
     § travaDaOrdem): mesma peça, outro texto e um `depois` — nunca uma segunda
     tela de salvar escrita à parte, que é como as duas passam a divergir. */
  function pedirNome(idx, extra) {
    if (typeof window.portao !== 'function') return;
    if (!paradasParaSalvar().length) return avisoErro(new Error('Esta rota não tem parada para salvar.'));
    const espaco = ESPACOS[idx];
    const dia = diaDosEspacos();
    const e = extra || {};
    /* Nome PREENCHIDO, sempre (dono, 10/08: "abra a tela de salvamento com nome
       preenchido"). Espaço com rota traz o nome dele; espaço vago traz o mesmo
       palpite que o salvar sem nome já usava — assim a tela obrigatória se
       resolve num toque só, que é o pedido dela. */
    const nomeInicial = nomeCurto((espaco && espaco.nome) || e.nomePadrao || '');
    window.portao({
      tom: 'info', ico: 'save',
      titulo: e.titulo || (espaco ? 'Regravar este espaço?' : `Salvar no Espaço ${idx + 1}`),
      sub: e.sub || (espaco
        ? `"${esc(espaco.nome)}" perde a ordem antiga e fica com a que está na tela.`
        : 'O nome curto é o que vai aparecer no botão.'),
      corpo: `<div class="campo"><label>Nome</label><input data-campo="nome-espaco" type="text"
        maxlength="${NOME_MAX}" autocomplete="off" placeholder="Manhã" value="${esc(nomeInicial)}"></div>`,
      acoes: [[e.escape || 'Agora não', ''], [e.rotulo || (espaco ? 'Regravar' : 'Salvar'), 'principal']], classe: 'duas',
    });
    const campo = naCamada('.portao-wrap [data-campo="nome-espaco"]');
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    if (campo) { try { campo.focus(); } catch (_) { /* teclado é enfeite aqui */ } }
    botao.addEventListener('click', () => {
      // Lido ANTES de qualquer await: o `data-fechar` do portão tira o campo da
      // tela assim que o toque sobe.
      const digitado = nomeCurto(campo ? campo.value : '');
      // Sem nome não fica sem saída: o dia + o número do espaço é curto, único
      // dentro do dia e diz de onde veio. Portão fechado com erro na cara seria
      // obrigar o motorista a começar tudo de novo.
      const nome = digitado || `${dia > 0 ? (ROTULO_DIA[dia] || 'Rota') : 'Avulsa'} ${idx + 1}`;
      /* 🔴 O `depois` CORRE FORA DA TRAVA. `comTrava` joga fora quem chega com
         ela levantada — e Montar/Iniciar levantam a sua própria. Chamado aqui
         dentro, o toque de montar morria em silêncio depois de um salvar que
         deu certo: o pior dos mundos, gravado e sem rota. */
      let salvou = false;
      comTrava(async () => { salvou = await salvarNoEspaco(idx, nome, !!e.depois); })
        .then(() => { if (salvou && typeof e.depois === 'function') e.depois(); });
    }, { once: true });
  }

  /** grava a ordem da tela no espaço: POST se está vago, PATCH se já tem rota */
  async function salvarNoEspaco(idx, nome, semRecibo) {
    const paradas = paradasParaSalvar();
    if (!paradas.length) return avisoErro(new Error('Esta rota não tem parada para salvar.'));
    const dia = diaDosEspacos();
    const espaco = ESPACOS[idx];
    let idSalvo = espaco ? String(espaco.id) : '';
    try {
      if (espaco) {
        await window.API.patch(`/logistica/rota-modelos/${encodeURIComponent(espaco.id)}`, { nome, diaSemana: diaNoServidor(dia), paradas });
      } else {
        const novo = await window.API.post('/logistica/rota-modelos', { nome, diaSemana: diaNoServidor(dia), paradas });
        idSalvo = novo && novo.id ? String(novo.id) : '';
      }
    } catch (e) { return avisoErro(e); }
    await carregarEspacos();
    /* 🔴 A POSIÇÃO QUEM DÁ É O NASCIMENTO, NÃO O BOTÃO TOCADO (achado na prova
       de 10/08). Salvar no "Espaço 3" com o 2 vazio cria o SEGUNDO modelo do
       dia — e a fileira, que ordena por `criadoEm`, o mostra na posição 2. O
       código acendia a posição do botão: ficava o Espaço 3 aceso e VAZIO, com a
       rota do dono desenhada no Espaço 2 ao lado. Agora o espaço é reencontrado
       pelo ID depois do recarregamento. */
    const pos = idSalvo ? ESPACOS.findIndex((m) => String(m.id) === idSalvo) : -1;
    const naFileira = pos >= 0 ? pos : idx;
    // Salvou o que estava vendo ⇒ é ESTE espaço que passa a valer, e o ponto de
    // "editado" apaga: a ordem da tela e a gravada voltaram a ser a mesma.
    modoSel = `s${naFileira + 1}`;
    // …e é ele que o dia lembra: salvar É a escolha mais forte que existe.
    lembrarEspaco(modoSel);
    previaDoDedo = false;
    publicarModos();
    // A lista de Rotas salvas fica fresca na hora: o dono vai OLHAR lá pra
    // conferir que "ficou salvo" — e lista velha diria que não ficou.
    await carregarSalvas();
    /* Salvou pra poder MONTAR (a trava da ordem alterada)? Então o recibo "Rota
       salva" fica de fora: ele seria um segundo "ok" entre o dedo e a rua, e o
       pedido era de UMA tela só. A prova de que salvou fica na fileira — o
       espaço acende com o nome dele. */
    if (!semRecibo) {
      window.portao({
        tom: 'ok', ico: 'check', titulo: 'Rota salva',
        sub: `${esc(nome)} é o Espaço ${naFileira + 1} de ${rotuloDoBalde(dia)}.`,
        acoes: [['Fechar', 'principal']],
      });
    }
    return true;
  }

  /* 2º toque no espaço que JÁ está aceso abre o que fazer com ele. Renomear e
     apagar não cabem num gesto novo (a lista já usa punho e deslize pra outra
     coisa), e o toque repetido num botão já ligado não tinha efeito nenhum —
     era o lugar vago mais barato da tela. */
  function gerirEspaco(idx) {
    const espaco = ESPACOS[idx];
    if (!espaco || typeof window.portao !== 'function') return;
    window.portao({
      tom: 'info', ico: 'route', titulo: esc(espaco.nome),
      sub: `Espaço ${idx + 1} de ${rotuloDoBalde(diaDosEspacos())} · ${(espaco.paradas || []).length} paradas`,
      acoes: [['Renomear e regravar', 'principal'], ['Apagar este espaço', 'perigo'], ['Fechar', '']],
    });
    const renomear = naCamada('.portao-wrap .principal');
    const apagar = naCamada('.portao-wrap .perigo');
    if (renomear) renomear.addEventListener('click', () => pedirNome(idx), { once: true });
    if (apagar) {
      apagar.addEventListener('click', () => comTrava(async () => {
        try { await window.API.del(`/logistica/rota-modelos/${encodeURIComponent(espaco.id)}`); }
        catch (e) { return avisoErro(e); }
        if (modoSel === `s${idx + 1}`) modoSel = 'dist';
        await carregarEspacos();
        await carregarSalvas();
        publicarPrevia();
      }), { once: true });
    }
  }

  /* O botão azul da montagem. Com um espaço aceso ele grava NAQUELE espaço; em
     "Distância" não há espaço escolhido — e escolher por ele podia apagar uma
     rota que ele não estava nem vendo. Então pergunta, e a pergunta já mostra
     o que tem dentro de cada um. */
  async function salvarRota() {
    if (typeof window.portao !== 'function') return;
    if (!paradasParaSalvar().length) return avisoErro(new Error('Esta rota não tem parada para salvar.'));
    if (idxDoModo(modoSel) >= 0) return pedirNome(idxDoModo(modoSel));
    const rotulo = (i) => (ESPACOS[i] ? `Espaço ${i + 1}: ${esc(ESPACOS[i].nome)}` : `Espaço ${i + 1} (vazio)`);
    /* Com 3 espaços a fileira de botões passou a ser desenhada em LAÇO — e a
       escuta também. Classe fixa por posição (`principal`/`azul`/…) não escala:
       o que identifica cada botão é a POSIÇÃO dentro de `.acoes`, que é a mesma
       ordem em que eles foram declarados aqui. */
    window.portao({
      tom: 'info', ico: 'save', titulo: 'Salvar em qual espaço?',
      sub: `${ROTULO_DIA[diaDosEspacos()] || 'Este dia'} guarda ${MAX_ESPACOS} rotas. Espaço com rota dentro é regravado.`,
      acoes: [...Array.from({ length: MAX_ESPACOS }, (_, i) => [rotulo(i), i ? 'azul' : 'principal']), ['Agora não', '']],
    });
    const caixa = naCamada('.portao-wrap .acoes');
    if (!caixa) return;
    for (let i = 0; i < MAX_ESPACOS; i += 1) {
      const b = caixa.children[i];
      if (b) b.addEventListener('click', ((n) => () => pedirNome(n))(i), { once: true });
    }
  }

