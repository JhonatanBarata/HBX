  /* ==========================================================================
     A CENA AO CONTRÁRIO — o mapa desfaz o que desenhou.

     Ordem do dono (09/08): *"o efeito reverso tem q começar pelo mapa"*. A saída
     é a entrada de trás pra frente, e a entrada TERMINA no mapa: então a saída
     COMEÇA nele. As ruas recolhem pela ponta por onde cresceram, os nomes se
     apagam letra a letra, e só quando a cidade sumiu é que o HBX desce do
     cabeçalho pra se desmontar (§ `T.saida`, no mock).

     🔴 É A MESMA CENA, COM O SINAL TROCADO. Mesma geometria (`ruasDaCena`),
     mesmas ondas (`ondasDasRuas`), mesmos nomes (`nomesDaCena`), mesma régua de
     66 ms por letra. O que muda são três coisas: o gradiente anda de 1 pra 0, a
     fila das ondas é a INVERSA (a última que fechou é a primeira que abre) e a
     letra é retirada em vez de posta. Cena de saída com desenho próprio seria
     uma segunda cidade — e duas cidades discordam.

     🔴 A TROCA DE TINTA TAMBÉM É O INVERSO DO ASSENTAMENTO. Lá o mundo de
     verdade SOBE por baixo das ruas da cena; aqui as ruas da cena sobem por cima
     do mundo e ele DESCE. Nos dois casos é a mesma geometria com a mesma
     largura, então o que a tela mostra é troca de cor — nunca vão nem dobra.
     ========================================================================== */
  const VOLTA_TROCA = 240;      // as ruas da cena entram por cima do mundo
  const VOLTA_MUNDO = 420;      // e o mundo de verdade desce
  const VOLTA_ESPERA = 380;     // quando a primeira onda começa a recolher
  const VOLTA_PASSO = 90;
  const VOLTA_ONDA = 420;
  const VOLTA_LETRA_EM = 260;   // as letras somem antes das ruas: inverso exato
  const VOLTA_TETO = 1200;      // o mapa devolve a tela pro HBX aqui

  let volta = null;

  /** o mapa desfaz o desenho; devolve quanto tempo isso vai levar */
  function cenaAoContrario() {
    const casa = GARAGEM.get(PALCO);
    if (!casa || !casa.mapa || !mapaNaTela(casa) || semMovimento()) return 0;
    /* Uma cena por vez, sempre: se a de entrada ainda estiver no ar quando o
       motorista mandar fechar, ela sai SECA e a de volta assume. */
    if (cena) encerrarCena('saida', true);
    /* 🔴 E A FILA DA CHEGADA NÃO SOBREVIVE À SAÍDA (17/08). A marca da raiz é
       ESTADO, não evento: sem apagá-la aqui o app fecharia com o `data-cena` da
       entrada pendurado, e quem voltasse — fechamento abortado, que a própria
       `limparVolta` documenta logo abaixo — acharia a casca vestindo uma fase que
       não tem cena nenhuma atrás. A saída é o inverso da entrada em TUDO,
       inclusive nisto: aqui a fila não anda, ela deixa de existir. */
    faseDaCena('');
    if (volta) return VOLTA_TETO;
    const mapa = casa.mapa;
    const ruas = ruasDaCena(mapa);
    if (!ruas.length) return 0;
    ondasDasRuas(casa, ruas);
    const nomes = nomesDaCena(ruas);
    const corpo = tinta('--map-cena-rua', '#59677a');
    const cabeca = tinta('--map-cabeca', '#e8f4ff');
    const tintaNome = tinta('--map-cena-nome', '#8d9bad');
    let halo = tinta('--map-fundo', '#1f1f1f');
    try { const c = mapa.getPaintProperty('earth', 'fill-color'); if (typeof c === 'string') halo = c; } catch (_) { /* estilo sem chão */ }

    const dado = {
      type: 'FeatureCollection',
      features: ruas.map((r) => ({
        type: 'Feature',
        properties: { w: r.onda, c: r.classe },
        geometry: { type: 'LineString', coordinates: r.pontos },
      })),
    };
    try {
      mapa.addSource(CENA_FONTE, { type: 'geojson', lineMetrics: true, data: dado });
      mapa.addSource(CENA_NOMES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    } catch (_) { return 0; }

    let antesDe;
    try { antesDe = mapa.getLayer(`${TRACO}-casca`) ? `${TRACO}-casca` : undefined; } catch (_) { antesDe = undefined; }
    for (let i = 0; i < CENA_ONDAS; i += 1) {
      try {
        mapa.addLayer({
          id: `${CENA_FONTE}-${i}`,
          type: 'line',
          source: CENA_FONTE,
          filter: ['==', ['get', 'w'], i],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-width': CENA_LARGURA,
            // ela ENTRA desbotando por cima do mundo: é o assentamento ao inverso
            'line-opacity': 0,
            'line-opacity-transition': { duration: VOLTA_TROCA, delay: 0 },
            'line-gradient': faixaDaOnda(1, corpo, cabeca),
          },
        }, antesDe);
      } catch (_) { /* uma onda a menos não derruba a saída */ }
    }
    try {
      mapa.addLayer({
        id: CENA_NOMES_L,
        type: 'symbol',
        source: CENA_NOMES,
        layout: {
          'symbol-placement': 'line-center',
          'text-font': ['Noto Sans Regular'],
          'text-field': ['get', 'txt'],
          'text-size': 12,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': tintaNome, 'text-halo-color': halo, 'text-halo-width': 1 },
      });
    } catch (_) { /* sem glyph: só as ruas recolhem */ }

    volta = {
      casa,
      t0: (window.performance && performance.now) ? performance.now() : Date.now(),
      ondas: [],
      nomes: nomes.map((r) => ({ nome: r.nome, pontos: r.pontos, q: -1 })),
      mundo: null,
      raf: 0,
    };
    // a fila INVERSA: a última onda que fechou na entrada é a primeira que abre
    for (let i = 0; i < CENA_ONDAS; i += 1) {
      volta.ondas.push({ em: VOLTA_ESPERA + ((CENA_ONDAS - 1 - i) * VOLTA_PASSO), pronta: false });
    }
    // os nomes nascem escritos POR INTEIRO e vão sendo retirados
    volta.nomes.forEach((n) => { n.q = n.nome.length; });
    escreverNomesDaVolta();

    // 1º quadro: as ruas da cena acendem por cima. 2º: o mundo desce por baixo.
    requestAnimationFrame(() => {
      if (!volta) return;
      try {
        for (let i = 0; i < CENA_ONDAS; i += 1) {
          const id = `${CENA_FONTE}-${i}`;
          if (mapa.getLayer(id)) mapa.setPaintProperty(id, 'line-opacity', 1);
        }
      } catch (_) { /* estilo trocando */ }
      setTimeout(() => {
        if (!volta) return;
        volta.mundo = esconderMundoDesbotando(mapa);
      }, VOLTA_TROCA - 60);
    });
    volta.raf = requestAnimationFrame(quadroDaVolta);
    return VOLTA_TETO;
  }

  /* o mundo DESCE — o inverso exato do `devolverMundo`: mesma lista de camadas,
     mesma opacidade, só que indo pra zero. Ele não usa `visibility`: sumir de um
     quadro pro outro é o pisca que esta casa matou hoje de manhã. */
  function esconderMundoDesbotando(mapa) {
    let camadas = [];
    try { camadas = (mapa.getStyle().layers || []); } catch (_) { return null; }
    const antes = new Map();
    camadas.forEach((l) => {
      if (!cenaEscondeCamada(l)) return;
      const op = {};
      (CENA_OPACIDADE[l.type] || []).forEach((p) => {
        try { op[p] = mapa.getPaintProperty(l.id, p); } catch (_) { op[p] = undefined; }
      });
      antes.set(l.id, { vis: (l.layout && l.layout.visibility) || 'visible', op });
      try {
        Object.keys(op).forEach((p) => {
          mapa.setPaintProperty(l.id, p + '-transition', { duration: VOLTA_MUNDO, delay: 0 });
          mapa.setPaintProperty(l.id, p, 0);
        });
      } catch (_) { /* estilo trocando */ }
    });
    return antes.size ? antes : null;
  }

  function escreverNomesDaVolta() {
    if (!volta) return;
    let fonte;
    try { fonte = volta.casa.mapa.getSource(CENA_NOMES); } catch (_) { return; }
    if (!fonte) return;
    const features = [];
    volta.nomes.forEach((n) => {
      if (n.q <= 0) return;
      features.push({
        type: 'Feature',
        properties: { txt: n.nome.slice(0, n.q) },
        geometry: { type: 'LineString', coordinates: n.pontos },
      });
    });
    try { fonte.setData({ type: 'FeatureCollection', features }); } catch (_) { /* fonte saindo */ }
  }

  function quadroDaVolta() {
    if (!volta) return;
    const mapa = volta.casa.mapa;
    const agora = (window.performance && performance.now) ? performance.now() : Date.now();
    const t = agora - volta.t0;
    const corpo = tinta('--map-cena-rua', '#59677a');
    const cabeca = tinta('--map-cabeca', '#e8f4ff');

    for (let i = 0; i < volta.ondas.length; i += 1) {
      const o = volta.ondas[i];
      if (o.pronta) continue;
      const p = 1 - ((t - o.em) / VOLTA_ONDA);
      if (p >= 1) continue;
      const id = `${CENA_FONTE}-${i}`;
      try { mapa.setPaintProperty(id, 'line-gradient', faixaDaOnda(Math.max(0, p), corpo, cabeca)); }
      catch (_) { o.pronta = true; continue; }
      if (p <= 0) o.pronta = true;
    }

    let mudou = false;
    volta.nomes.forEach((n) => {
      const fora = Math.floor((t - VOLTA_LETRA_EM) / CENA_LETRA);
      const q = Math.max(0, Math.min(n.nome.length, n.nome.length - Math.max(0, fora)));
      if (q !== n.q) { n.q = q; mudou = true; }
    });
    if (mudou) escreverNomesDaVolta();

    if (t > VOLTA_TETO + 400) { limparVolta(); return; }
    volta.raf = requestAnimationFrame(quadroDaVolta);
  }

  /* 🔴 A SAÍDA TAMBÉM TEM UM SÓ DESFECHO. O app está fechando, mas "está
     fechando" não é licença pra deixar o mapa sem cidade: se o fechamento for
     abortado (o sistema decide não matar a tarefa), quem volta pro app tem que
     achar o mapa inteiro. */
  function limparVolta() {
    const v = volta;
    if (!v) return;
    volta = null;
    if (v.raf) { try { cancelAnimationFrame(v.raf); } catch (_) { /* já passou */ } }
    const mapa = v.casa && v.casa.mapa;
    limparCena(mapa);
    devolverMundo(mapa, v.mundo, 0);
    if (v.mundo && mapa) {
      // e a opacidade volta ao que o estilo pedia (o `devolverMundo` seco só
      // acerta a visibilidade; aqui quem foi a zero foi a TINTA).
      v.mundo.forEach((d, id) => {
        try {
          if (!mapa.getLayer(id)) return;
          Object.keys(d.op).forEach((p) => {
            mapa.setPaintProperty(id, p + '-transition', undefined);
            mapa.setPaintProperty(id, p, d.op[p]);
          });
        } catch (_) { /* estilo trocando */ }
      });
    }
  }

  /* A LUZ agora é do MAPA, não do nascimento dele. Antes o tema trocava porque
     o mapa era refeito; com um mapa só pela vida do app, quem troca a pele do
     mapa é `setStyle` — e o traço, que mora numa fonte do estilo, volta depois. */
  function acertarLuz(casa) {
    const luz = luzDeAgora();
    if (casa.luz === luz) return;
    casa.luz = luz;
    estiloDoMapa(luz !== 'claro').then((estilo) => {
      try { casa.mapa.setStyle(estilo); } catch (_) { return; }
      // pele nova = chão novo: o carimbo anda junto com o estilo, senão o véu
      // escureceria na cor do tema anterior (§ `carimbarChao`).
      casa.mapa.once('styledata', () => { desenharTraco(casa.mapa); carimbarChao(casa.mapa); });
    }).catch(() => { /* sem estilo novo: fica o de agora */ });
  }

  /** põe o mapa do palco visível no ar — criando UMA vez, transplantando sempre */
  async function montarMapa(palco) {
    if (!palco) return;
    const nome = nomeDoPalco(palco);
    const casa = GARAGEM.get(nome);

    if (casa) {
      if (casa.alvo.parentElement !== palco) {
        /* 🔴 A CLASSE `pronto` VEM ANTES DO ENXERTO, E ESSA ORDEM ERA A PISCADA
           (medido 08/08). O palco novo nasce SEM `pronto`, e a folha diz:
               .mapa-palco .mapa-vivo   → o mapa DE VERDADE, opacidade 0
               .mapa-palco.pronto ...   → opacidade 1, com transição de .32 s
           O `resize()` logo abaixo lê `clientHeight` — e ler tamanho OBRIGA o
           navegador a calcular o estilo ali, com o palco ainda sem `pronto`.
           O estilo intermediário fica CARIMBADO: mapa apagado sobre o chão do
           palco. Quando a classe entrava depois, a transição rodava e a tela
           fazia um fundido de 300 ms até o mapa reaparecer. Uma vez por
           repinte, e o repinte era por SEGUNDO — é isso que o dono via como "a
           imagem está piscando". Pondo a classe primeiro, o primeiro cálculo de
           estilo do palco já nasce com o valor final: transição não roda em
           estilo inicial. */
        palco.classList.add('pronto');
        palco.appendChild(casa.alvo);              // 🔴 O TRANSPLANTE
        try { casa.mapa.resize(); } catch (_) { /* mapa morto */ }
      }
      palco.__hbxMapa = true;
      palco.__hbxMapaObj = casa.mapa;
      palco.classList.add('pronto');
      // 🔴 O PALCO NOVO TAMBÉM É "COM MAPA". A folha desliga o "você está aqui"
      // de DESENHO quando existe mapa de verdade (`.mapa-palco.com-mapa>.eu-puck`)
      // — sem esta linha o transplante levava o mapa pra um palco que ainda se
      // dizia vazio, e as duas peças podiam aparecer juntas.
      palco.classList.add('com-mapa');
      acertarLuz(casa);
      sincronizarPinos(casa);
      /* 🔴 QUEM MANDA AQUI DEIXOU DE SER O NOME DO PALCO — é o ESTADO da tela
         (16/08). Com um maplibre só, `gps` e `geral` não existem mais como
         lugares: existe o MESMO mapa em dois estados, e quem sabe qual é a tela
         viva. Nada mudou de comportamento: dirigindo continua sendo traço +
         câmera + cena; no 2D continua sendo traço + a bolinha do "eu". */
      if (naNavegacao()) { desenharTraco(casa.mapa); pedirCamera(); atenderCena(casa); return; }
      // 🔴 O TRANSPLANTE NÃO MEXE NA CÂMERA, e é assim que fica: voltar pra aba
      // Rota devolve o mapa exatamente onde ele estava. Só o traço e a seta se
      // acertam — os dois são DADO, e dado velho na tela principal é mentira.
      desenharTraco(casa.mapa);
      moverEuNoPlano();
      /* 🔴 A CENA DA ROTA NOVA ESPERA O PALCO APARECER. Quem monta a rota está
         na tela de Montagem: tocar a cena ali seria desenhar a cidade num mapa
         que ninguém está olhando, e chegar na aba Rota com tudo já pronto. O
         pedido fica guardado e é ATENDIDO aqui, no mesmo tique em que o mapa
         volta pra tela — antes de qualquer quadro pintar. */
      atenderCena(casa);
      return;
    }

    if (MONTANDO.has(nome)) return;   // criação em voo: o próximo repinte transplanta
    MONTANDO.add(nome);
    let gl; let estilo;
    try {
      gl = await carregarMaplibre();
      estilo = await estiloDoMapa(luzDeAgora() !== 'claro');
    } catch (_) { MONTANDO.delete(nome); return; }  // sem mapa, fica o desenho
    if (!palco.isConnected) { MONTANDO.delete(nome); return; }

    const alvo = document.createElement('div');
    alvo.className = 'mapa-vivo';
    palco.appendChild(alvo);

    const paradas = (typeof PARADAS !== 'undefined' ? PARADAS : []).filter((p) => p.lat && p.lng);
    const centro = ultimaPos || (paradas[0] ? { lat: paradas[0].lat, lng: paradas[0].lng } : null);
    const mapa = new gl.Map({
      container: alvo,
      style: estilo,
      center: centro ? [centro.lng, centro.lat] : [-47.5863, -22.4226],
      zoom: centro ? 15 : 12,
      maxZoom: 18,
      attributionControl: false,
    });
    const nova = { nome, gl, mapa, alvo, pinos: new Map(), chave: null, luz: luzDeAgora(), eu: null };
    GARAGEM.set(nome, nova);
    MONTANDO.delete(nome);
    /* 🔴 A CENA DE ENTRADA É CHAMADA AQUI, NO NASCIMENTO DO MAPA — e não no
       `load`. É a diferença entre a cidade nunca aparecer e ela aparecer por um
       quadro antes de sumir: quem esconde o mundo é o `styledata`, que vem antes
       do primeiro tile pintar, e no `load` já é tarde. A cena é UMA por vida do
       app (`cenaJaEntrou`) — voltar pra aba Rota é voltar, não é ligar de novo. */
    /* 🔴 A CENA DA ENTRADA É CHAMADA DIRETO, NÃO PELO `pedirCena` — e isto é a
       fase 1 do defeito que o dono viu ("o estado final é brevemente exibido").
       MEDIDO no g15, gravando a tela: a cidade INTEIRA ficava 300 ms na tela e
       só então apagava pra cena começar. A causa é o pedido passar por
       `mapaNaTela()`: na abertura as DUAS telas estão no ar (a que sai e a que
       entra), a resposta é "ainda não", o pedido fica guardado — e quando o
       transplante seguinte o atende, o `load` já pintou a cidade.
       Aqui o `esconderMundo` acontece no `styledata`, que vem ANTES do primeiro
       tile. A espera pela tela continua existindo, dentro de `esperarChao`, que
       é o lugar dela: lá ela espera SEM deixar o mundo aparecer. */
    // a cena de ENTRADA é a da abertura do app (a cidade nascendo na aba Rota):
    // ela nunca foi da tela de dirigir, e continua não sendo — quem chega
    // dirigindo cai no motivo 'navegar'. Com um palco só, a pergunta é o ESTADO.
    if (!naNavegacao()) chamarCena(nova, 'entrada');
    palco.__hbxMapa = true;
    palco.__hbxMapaObj = mapa;
    // existe mapa de verdade: o "você está aqui" de DESENHO sai de cena (ver
    // `.mapa-palco.com-mapa>.eu-puck` na folha). Posição inventada é a pior
    // mentira que esta tela pode contar, e esta é a 2ª das duas travas.
    palco.classList.add('com-mapa');

    /* O ZOOM MEXE EM DUAS PEÇAS, e as duas por serem MEDIDA e não enfeite: o
       rebaixamento dos pinos (a régua da quantidade × zoom) e o halo do "eu"
       (precisão em metros vale pixels diferentes em cada zoom). Só troca de
       classe e de variável de CSS — nada aqui recria marcador durante a pinça. */
    mapa.on('zoom', () => {
      const casa = GARAGEM.get(nome);
      if (!casa) return;
      acertarPinos(casa);
      vestirEu(casa);
    });

    mapa.on('load', () => {
      palco.classList.add('pronto');             // o desenho de espera se apaga
      // a cor do chão do estilo vira `--map-chao` pra casca (§ `carimbarChao`):
      // é ela que a fase 1 da cena usa pra escurecer NA COR DO MAPA.
      carimbarChao(mapa);
      sincronizarPinos(nova);
      // 🔴 A SETA É UMA SÓ. No palco "gps" quem mostra o motorista é o puck do
      // desenho, parado a 68% da tela — um marcador do maplibre no mesmo lugar
      // seria a segunda seta, e o V4 promete uma. No mapa "geral" (a rota
      // inteira, sem puck) o marcador é justamente o que diz onde ele está.
      // e a cena da entrada da navegação espera o mapa NASCER, não só o palco:
      // sem estilo no ar não há rua nenhuma pra crescer (§ `atenderCena`).
      if (naNavegacao()) { desenharTraco(mapa); pedirCamera(); atenderCena(nova); return; }
      // 🔴 O PALCO "geral" É A TELA PRINCIPAL DA ROTA desde 08/08, e ele nascia
      // com pino e mais nada: sem traço (o caminho existia e ninguém desenhava)
      // e no zoom de nascimento, com o resto do dia fora da tela. As três peças
      // do que a tela promete entram juntas aqui.
      desenharTraco(mapa);
      moverEuNoPlano();
      enquadrarGeral(nova);
      // a abertura está segurando o app por causa desta linha (§ 7a-ter)
      bootChegou('mapa');
    });
    // as empresas do corredor não são marcador do maplibre: elas são a peça
    // do desenho, e quem as coloca no chão é a câmera. Ver `posicionarEmpresas`.
    /* 🔴 QUEM COMEÇOU O MOVIMENTO: O DEDO OU NÓS? `originalEvent` só existe
       quando veio de gesto humano — o nosso próprio `easeTo` dispara os mesmos
       eventos e, sem esta pergunta, a câmera se declararia "solta" sozinha a
       cada fix e nunca mais seguiria ninguém.
       🔴 E AGORA OS DOIS PALCOS PRECISAM DISSO (16/08). Este comentário dizia
       "só o palco da navegação: no mapa geral não há câmera automática pra
       brigar com o dedo" — e a frase acabou de deixar de ser verdade: o 2D
       ganhou a aproximação por movimento (os 30 m do dono, em
       `aproximarAoAndar`). Câmera automática sem freio de gesto é o mapa
       desfazendo o arrasto de quem estava olhando o dia — exatamente o defeito
       que a fase 'solta' curou na navegação. O que muda entre os dois é só o
       QUE o gesto desarma: no 'gps', a câmera que segue (com volta por tempo);
       no 'geral', a régua dos 30 m, que só volta pelo botão de enquadrar —
       aqui não existe "voltar sozinho", porque quem abriu o mapa de cima pra
       olhar o dia inteiro não quer a tela se mexendo debaixo do dedo. */
    /* 🔴 O MESMO MAPA, DOIS FREIOS — e quem escolhe é o ESTADO, no instante do
       dedo (16/08). Antes eram dois mapas, então cada um pendurava o freio dele
       no nascimento; hoje é um só e a pergunta se faz na HORA: dirigindo, o
       dedo solta a câmera que segue (com volta por tempo); no 2D, ele desarma a
       régua dos 30 m até o botão de enquadrar. Nada mudou pro motorista. */
    {
      const doDedo = (e) => {
        if (!e || !e.originalEvent) return;
        if (naNavegacao()) soltarCamera(); else soltarPlano();
      };
      mapa.on('dragstart', doDedo);
      mapa.on('rotatestart', doDedo);
      mapa.on('pitchstart', doDedo);
      mapa.on('zoomstart', doDedo);
      /* 🔴 "2D" É UMA TRAVA, NÃO UMA POSE INICIAL (dono, 08/08: *"mapa limpo,
         2d"*). Todo mapa do maplibre gira e inclina com dois dedos — quer dizer
         que a tela de PLANEJAR podia sair deitada e torta sem ninguém pedir, e
         sem bússola nenhuma pra dizer onde ficou o norte (a bússola é peça da
         tela de dirigir). A trava continua existindo — só que agora ela LIGA E
         DESLIGA com o estado (§ `travarGestos2D`), porque o mapa é o mesmo e
         dirigir precisa de inclinação. */
      travarGestos2D(mapa, !naNavegacao());
    }
    /* 🔴 O PUCK SOLTO ANDA COM O MAPA, NÃO COM O GPS. Sincronizá-lo só no fix
       (1 por segundo) deixaria a seta escorregando um quadro atrás do dedo
       durante o arrasto inteiro. Ele entra aqui, junto com os prédios, que é
       exatamente o mesmo problema já resolvido. */
    /* 🔴 UM QUADRO DE TELA = UMA CONTA (item 9 do dono, 09/08: "não tem tempo
       pro celular de baixa qualidade pensar"). O maplibre dispara 'move' várias
       vezes POR QUADRO durante easeTo/gesto — e cada disparo varria todas as
       empresas e pinos de novo, no mesmo quadro que o anterior já tinha
       varrido. O rAF coalesce: N eventos no mesmo quadro viram UMA passada, e
       o último quadro depois que a câmera para ainda roda (cada evento arma o
       bilhete de novo). É a mesma régua da V4, onde o loop é 1×/quadro por
       construção. */
    let quadroArmado = false;
    const acompanharCamera = () => {
      if (quadroArmado) return;
      quadroArmado = true;
      requestAnimationFrame(() => {
        quadroArmado = false;
        posicionarEmpresas();
        pinosVisiveis(nova);
      });
    };
    mapa.on('move', acompanharCamera);
    mapa.on('zoom', acompanharCamera);
    mapa.on('resize', acompanharCamera);
    mapa.on('load', acompanharCamera);
    /* 🔴 A SETA NÃO ESPERA O rAF, E ESTA É A ÚNICA EXCEÇÃO À REGRA DE CIMA
       (17/08). O `acompanharCamera` coalesce porque o que mora nele é O(n) — 51
       pinos e as empresas do corredor. O ponteiro é UMA projeção: um multiplicar
       de matriz, o mesmo custo de ler o zoom. E ele é a peça que o dono está
       olhando: MEDIDO no g15, dentro do rAF ela ficava 145 px atrás no primeiro
       quadro do `easeTo` (a câmera arranca rápido, curva de saída) — o "encaixa
       depois" voltando pela janela em escala menor. Fora do rAF: 0 px em 25 de 25
       amostras. Ver `puckNaRua`, em 70-traco-camera. */
    mapa.on('move', () => puckNaRua());
  }

