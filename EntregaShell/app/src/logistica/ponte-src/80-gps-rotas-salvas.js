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

     🔴 UM DONO SÓ, e ele é a TELA ATUAL: quem entra em `mapa`/`mapachegou`
     liga, quem sai desliga. Chamado do repinte (e não só do `ir`) porque o app
     pode ABRIR direto na navegação, e aí o `ir` nunca correu. O guard de
     igualdade evita conversar com o nativo 12 vezes por segundo. */
  let dirigindoAgora = null;
  function modoDirigindo(ligado) {
    if (ligado === dirigindoAgora) return;
    dirigindoAgora = ligado;
    try { window.HBX.manterTelaAcesa(ligado); } catch (_) { /* sem ponte nativa */ }
    try { window.HBX.modoNavegacao(ligado); } catch (_) { /* idem */ }
  }

  /* Só se mexe com a tela do GPS à vista. O `watchPosition` é único e vive o
     app inteiro (o mapa da rota também bebe dele); o que liga e desliga é o
     PEDIDO DE ROTA e o repinte — bateria e conta de roteador não são pagas por
     tela que ninguém está olhando. */
  const naNavegacao = () => telaAtual() === 'mapa' || telaAtual() === 'mapachegou';
  function aoMover() {
    if (!naNavegacao()) return;
    pintarNavegacao();
    if (telaAtual() === 'mapa') {
      pedirRota(); pedirCamera();
      // a voz mora AQUI, no fix — não no repinte: quem entra na tela não pode
      // levar um "vire à direita" na cara só por ter aberto o mapa.
      vozDaManobra(manobraDaVez());
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
      if (tela === 'rota') { armarGpsSeConcedido(); planoQuerTraco = true; tracoDoPlano(); }
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
      if (tela === 'mapa' || tela === 'mapachegou') {
        garantirGps(); pintarNavegacao();
        /* 🔴 ENTRAR NA NAVEGAÇÃO É DESCER (§7d-bis) — mas quem diz "entrei" é o
           OBSERVADOR, não este toque. Eram duas portas mandando a mesma coisa
           (medido: dois `jumpTo` com 6 ms de diferença), e só uma delas sabe de
           ONDE o motorista veio — que é o que separa entrar na rota de voltar
           do "Você chegou". Aqui fica só o pedido de rota, que é dado. */
        if (tela === 'mapa') pedirRota();
        // saindo de "dirigindo" a câmera volta a ter dono nenhum esperando
        if (tela === 'mapachegou') pararDescida();
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
    // a FASE da câmera antes do mapa: `montarMapa` já manda a câmera pro lugar,
    // e ela precisa saber que a tela está entrando (2D) e não dirigindo (3D).
    if (telaAtual() !== telaVistaAqui) {
      const veioDe = telaVistaAqui;
      telaVistaAqui = telaAtual();
      /* 🔴 VOLTAR DO "VOCÊ CHEGOU" NÃO É ENTRAR NA ROTA. A tela de chegada é um
         degrau DENTRO da navegação: o motorista entrega, confirma e volta pro
         mapa — e repetir ali a cidade nascendo + a descida de 1,8 s seria o
         show inteiro a cada parada, dezenas de vezes por dia, sempre no meio da
         rua. Ele já está dirigindo; a câmera continua de onde estava. */
      if (telaVistaAqui === 'mapa') {
        if (veioDe === 'mapachegou') { camFase = 'dirigindo'; pedirCamera(); }
        else entrarNaDescida();
      } else pararDescida();
    }
    const palco = naCamada('[data-mapa]');
    if (palco) montarMapa(palco);
    // tela que saiu de cena não leva o mapa junto: ele vai pra garagem
    // off-screen e volta inteiro — com a câmera onde estava.
    estacionarMapas();
    // tela acesa + tela cheia enquanto dirige; ambas voltam ao sair
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
        ${passo(3, `Na próxima ${ROTULO_DIA[diaDosEspacos()] || 'vez'}`, 'um toque no botão e a ordem volta')}`,
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
      const nome = digitado || `${ROTULO_DIA[dia] || 'Rota'} ${idx + 1}`;
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
        await window.API.patch(`/logistica/rota-modelos/${encodeURIComponent(espaco.id)}`, { nome, diaSemana: dia, paradas });
      } else {
        const novo = await window.API.post('/logistica/rota-modelos', { nome, diaSemana: dia, paradas });
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
        sub: `${esc(nome)} é o Espaço ${naFileira + 1} de ${ROTULO_DIA[dia] || 'hoje'}.`,
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
      sub: `Espaço ${idx + 1} de ${ROTULO_DIA[diaDosEspacos()] || 'hoje'} · ${(espaco.paradas || []).length} paradas`,
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

