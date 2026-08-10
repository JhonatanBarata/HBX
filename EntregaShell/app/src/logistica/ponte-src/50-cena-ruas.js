  /* ---- a cena ---------------------------------------------------------------- */

  /* 🔴 "NA TELA" NÃO É `isConnected`. O mapa que sai de cena não é destruído: ele
     vai pra garagem off-screen (`estacionarMapas`), que É parte do documento — ou
     seja, `alvo.isConnected` continua true com o mapa a mil pixels da tela. Quem
     diz a verdade é o PAI: mapa em cena mora dentro de um `.mapa-palco`. Com a
     régua errada, a cena da rota nova tocava inteira na garagem e o motorista
     chegava no mapa com tudo já desenhado — a cena acontecia pra ninguém.
     E ela também não pode ser `parentElement !== null` puro: no meio de um
     repinte o nó troca de pai no MESMO tique, e ninguém observa esse instante. */
  const mapaNaTela = (casa) => {
    const pai = casa && casa.alvo && casa.alvo.parentElement;
    if (!pai || !pai.classList || !pai.classList.contains('mapa-palco')) return false;
    /* 🔴 E TEM QUE SER A CAMADA VIVA — a régua que esta casa já tinha
       (`camadaViva`, lá em cima). Na troca de tela as DUAS `.tela` existem no
       DOM por alguns quadros, e o palco continua dentro da que está MORRENDO.
       Medido: abrir a Montagem É mandar montar (§ `ir('montagem')`), então o
       pedido de cena chegava exatamente durante essa transição — a cena inteira
       tocava na tela que estava saindo e o motorista voltava pro mapa com tudo
       já desenhado. Cena tocada pra ninguém é pior que cena nenhuma: gasta o
       pedido. */
    const viva = camadaViva();
    return !!(viva && viva.contains(pai));
  };

  /* 🔴 A CENA NÃO COMEÇA ATRÁS DE UMA TELA QUE ESTÁ SAINDO. Na troca, a camada
     nova (com o palco) entra ANTES de a antiga terminar de sair — na abertura
     isso é quase um segundo, porque o logo ainda está voando pro cabeçalho.
     MEDIDO na bancada: a cena nascia aos 3,74 s e as ruas partiam aos 4,54 s,
     com o splash na tela até 4,53 — ou seja, o pino nascia e a coordenada era
     escrita INTEIRA por trás do splash, e o motorista só pegava a cena no meio.
     Enquanto houver alguém saindo de cena, a cena espera. */
  const telaSaindo = () => !!document.querySelector('#app .tela.sai');

  /** de qual palco é cada cena — 'navegar' mora na tela de dirigir */
  const palcoDaCena = (motivo) => (motivo === 'navegar' ? 'gps' : 'geral');

  /** o pedido: a cena acontece quando o palco estiver na tela, nunca antes */
  function pedirCena(motivo) {
    if (semMovimento()) return;
    cenaPedido = { motivo, em: Date.now() };
    const casa = GARAGEM.get(palcoDaCena(motivo));
    if (mapaNaTela(casa)) atenderCena(casa);
  }

  function atenderCena(casa) {
    const p = cenaPedido;
    if (!p) return;
    // cada cena tem o palco dela: a da rota nova não pode ser servida pelo mapa
    // de dirigir que passou na frente, nem o contrário.
    if (!casa || casa.nome !== palcoDaCena(p.motivo)) return;
    // pedido velho não vira cena: montar a rota de manhã e abrir o mapa à tarde
    // não é "rota nova", é o dia em andamento.
    if (Date.now() - p.em > CENA_VALIDADE) { cenaPedido = null; return; }
    cenaPedido = null;
    chamarCena(casa, p.motivo);
  }

  function chamarCena(casa, motivo) {
    if (!casa || casa.nome !== palcoDaCena(motivo) || !casa.mapa) return;
    if (cena || semMovimento()) return;
    if (motivo === 'entrada') {
      if (cenaJaEntrou) return;
      cenaJaEntrou = true;
    }
    const mapa = casa.mapa;
    cena = {
      casa, motivo, mundo: null, t0: 0, ondas: [], nomes: [],
      cartao: null, eu: null, raf: 0, dedo: null, onda: CENA_ONDA,
      mundoVoltou: false, nomesSairam: false,
    };
    const daVez = cena;
    /* O mundo sai de cena assim que o estilo existir — ANTES do primeiro tile
       pintar. Escondê-lo no `load` deixaria a cidade aparecer por um quadro e
       sumir, que é a piscada que esta casa passou o dia 09/08 matando. */
    quandoEstiloPronto(mapa, () => {
      if (cena !== daVez) return;
      daVez.mundo = esconderMundo(mapa);
      if (!daVez.mundo) { encerrarCena('sem-estilo', true); return; }
      esperarChao(daVez);
    });
  }

  /** o teto que nunca falha: tile na mão (e o app entregue, na entrada) ou o relógio */
  function esperarChao(daVez) {
    const mapa = daVez.casa.mapa;
    const entrada = daVez.motivo === 'entrada';
    const prazo = Date.now() + (entrada ? CENA_TETO_ABERTURA : CENA_TETO_TILE);
    const olhar = () => {
      if (cena !== daVez) return;
      /* 🔴 A CENA DA ENTRADA ESPERA O APP SER ENTREGUE — e este é o defeito que
         nasceu do conserto anterior (10/08). Escondendo o mundo já no
         NASCIMENTO do mapa (que acontece aos 1,8 s, num palco FANTASMA fora da
         tela, § `prepararMapaCedo`), a cena passou a rodar ATRÁS do splash:
         MEDIDO no g15, quando a tela da Rota finalmente apareceu — aos 11,4 s,
         com a abertura nova do HBX — as ruas já estavam desenhadas e só os
         nomes chegaram depois. O efeito acontecia para ninguém.
         Esconder cedo continua certo (é o que mata a "cidade inteira" da fase
         1); quem tem que esperar é o COMEÇO. `bootAvisou` é a mesma luz verde
         que solta a abertura (§ 7a-ter), então cena e app aparecem juntos. */
      if (entrada && !bootAvisou && Date.now() < prazo) { setTimeout(olhar, 120); return; }
      /* Duas perguntas diferentes, e confundi-las custa a cena: quem SAIU da
         tela encerra; quem ainda não CHEGOU (a tela anterior está saindo por
         cima) espera. */
      if (telaSaindo() && Date.now() < prazo) { setTimeout(olhar, 120); return; }
      /* E na entrada o mapa mora no palco fantasma até o transplante: cobrar
         "está na tela" antes disso encerraria a cena por um motivo que ainda
         nem podia ser verdade. */
      if (entrada && !mapaNaTela(daVez.casa) && Date.now() < prazo) { setTimeout(olhar, 120); return; }
      if (!mapaNaTela(daVez.casa)) { encerrarCena('saiu', true); return; }
      let tile = true;
      try { tile = mapa.areTilesLoaded(); } catch (_) { tile = true; }
      /* 🔴 O FIX NÃO SEGURA MAIS AS RUAS (10/08). Ele segurava — e MEDIDO no
         g15 isso era 400 a 1400 ms de MAPA VAZIO entre o mundo apagar e a
         primeira rua nascer: a fase 2 do "3 telas" que o dono viu. O tile já
         estava na mão (a cidade tinha acabado de aparecer inteira); quem
         atrasava era o GPS. O cartão de coordenada continua esperando o fix —
         mas ele entra quando chegar, sem segurar a cidade. Sem rua não há cena
         nenhuma; sem fix há cena, só não há cartão. */
      if (!tile && Date.now() < prazo) { setTimeout(olhar, 120); return; }
      /* 🔴 ERRO NO MEIO DA CENA TAMBÉM DEVOLVE O MUNDO. Sem este laço, uma
         exceção aqui dentro deixaria a cidade escondida pelo resto do dia — e
         foi exatamente o que a prova pegou na primeira volta: um nome de função
         errado apagou o mapa inteiro e nada o trouxe de volta. */
      try { comecarCena(daVez); } catch (_) { encerrarCena('erro', true); }
    };
    setTimeout(olhar, 160);
  }

  function comecarCena(daVez) {
    const casa = daVez.casa;
    const mapa = casa.mapa;
    const ruas = ruasDaCena(mapa, daVez.motivo === 'navegar' ? CENA_MAX_RUAS_NAV : CENA_MAX_RUAS);
    /* Sem rua nenhuma não há cena — e isso é comum e normal: tile que não chegou,
       mapa fora da área coberta, aparelho sem o pacote. O mundo volta na hora. */
    if (!ruas.length) { encerrarCena('sem-rua', true); return; }
    ondasDasRuas(casa, ruas);
    // na tela de dirigir a cena é só a cidade nascendo: nome de rua ali brigaria
    // com a manobra, que desce no mesmo instante (§ CENA_PASSO_NAV).
    const nomes = daVez.motivo === 'navegar' ? [] : nomesDaCena(ruas);

    const corpo = tinta('--map-cena-rua', '#59677a');
    const cabeca = tinta('--map-cabeca', '#e8f4ff');
    const tintaNome = tinta('--map-cena-nome', '#8d9bad');
    /* O halo do nome é o CHÃO DO BASEMAP, lido do estilo que está no ar. Ele não
       vira token: a cor do chão mora no `style-*.json` e um token igual a ela
       seria a mesma verdade em dois arquivos — que é como eles discordam. */
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
      // `lineMetrics` é o que dá o `line-progress`: sem ele o gradiente não tem
      // régua e a rua não tem como crescer.
      mapa.addSource(CENA_FONTE, { type: 'geojson', lineMetrics: true, data: dado });
      mapa.addSource(CENA_NOMES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    } catch (_) { encerrarCena('sem-fonte', true); return; }

    // debaixo da fita da rota, sempre: a cena desenha a CIDADE, e cidade não
    // passa por cima do caminho do dia.
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
            'line-opacity': 0,
            'line-opacity-transition': { duration: 0, delay: 0 },
            'line-gradient': ['step', ['line-progress'], corpo, 0.001, CENA_INVISIVEL],
          },
        }, antesDe);
      } catch (_) { /* uma onda a menos não derruba a cena */ }
      daVez.ondas.push({ em: 0, acesa: false, pronta: false });
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
          // o nome está CRESCENDO letra a letra: deixar o motor de colisão
          // decidir a cada quadro faria o rótulo piscar dentro da própria
          // escrita. Quem garante que eles não se encavalam é o espaçamento de
          // 84 px lá no `nomesDaCena`.
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': tintaNome,
          'text-halo-color': halo,
          'text-halo-width': 1,
          'text-opacity-transition': { duration: 0, delay: 0 },
        },
      });
    } catch (_) { /* sem glyph: a cena roda só com as ruas */ }

    /* O relógio da cena sai daqui, e ele é POR MOTIVO: a da entrada espera o
       pino e a coordenada, a da rota nova entra quase junto, e a do Navegar
       corre — ela tem a descida da câmera esperando atrás. */
    const nav = daVez.motivo === 'navegar';
    const passo = nav ? CENA_PASSO_NAV : CENA_PASSO;
    const onda = nav ? CENA_ONDA_NAV : CENA_ONDA;
    daVez.onda = onda;
    let ruasEm = CENA_RUAS_ROTA;
    if (daVez.motivo === 'entrada') ruasEm = CENA_RUAS_ENTRADA;
    else if (nav) ruasEm = CENA_RUAS_NAV;
    daVez.ondas.forEach((o, i) => { o.em = ruasEm + (i * passo); });
    daVez.nomes = nomes.map((r) => ({
      nome: r.nome,
      pontos: r.pontos,
      // 🔴 A LETRA COMEÇA QUANDO A RUA FECHA — ordem literal do dono. A onda é
      // quem fecha, e o tremorzinho de 0 a 160 ms evita que doze nomes comecem
      // a ser escritos no mesmo quadro.
      em: ruasEm + (r.onda * passo) + onda + Math.round(Math.random() * 160),
      q: -1,
    }));

    /* O pino e o cartão: só na ENTRADA, e só com fix. Sem fix não há "onde eu
       estou" — e posição inventada é a pior mentira que esta tela conta. */
    const eu = ultimaPos || ultimoFix;
    if (daVez.motivo === 'entrada' && eu && pinoValido(eu.lat, eu.lng)) {
      moverEuNoPlano();
      try { daVez.eu = casa.eu ? casa.eu.getElement() : null; } catch (_) { daVez.eu = null; }
      if (daVez.eu) daVez.eu.classList.add('nascendo');
      const coordenada = `${grauDe(Number(eu.lat), 'N', 'S')}  ${grauDe(Number(eu.lng), 'E', 'W')}`;
      const endereco = ruaMaisPerto(mapa, ruas, eu);
      daVez.cartao = cartaoDaCena(casa, coordenada, endereco);
    }

    /* 🔴 O DEDO ENCERRA A CENA. Quem tocou o mapa quer o mapa, não o espetáculo
       — e cena que briga com o dedo é a mesma doença da câmera que desfazia o
       arrasto na navegação. */
    daVez.dedo = (e) => { if (e && e.originalEvent) encerrarCena('dedo'); };
    ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach((ev) => {
      try { mapa.on(ev, daVez.dedo); } catch (_) { /* versão sem o gesto */ }
    });

    daVez.t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    proximoQuadro(daVez);
  }

  /** o próximo quadro — e o laço que garante que a cena nunca morre calada */
  function proximoQuadro(daVez) {
    daVez.raf = requestAnimationFrame(() => {
      try { quadroDaCena(daVez); } catch (_) { encerrarCena('erro', true); }
    });
  }

  /* A COR DE VERDADE DA RUA sai do ESTILO, nunca de um token novo: ela mora no
     `style-*.json` e um token igual a ela seria a mesma verdade em dois
     arquivos — que é como eles discordam (a mesma lei do halo do nome). */
  const HEX = /^#([0-9a-f]{6})$/i;
  function corDaRuaReal(mapa, padrao) {
    let bruto;
    try { bruto = mapa.getPaintProperty('roads_minor', 'line-color'); } catch (_) { return padrao; }
    if (typeof bruto === 'string' && HEX.test(bruto)) return bruto;
    // expressão por zoom (`interpolate`): vale a cor do zoom mais FECHADO, que é
    // onde esta cena acontece — é o último literal de cor da lista.
    if (Array.isArray(bruto)) {
      for (let i = bruto.length - 1; i >= 0; i -= 1) {
        if (typeof bruto[i] === 'string' && HEX.test(bruto[i])) return bruto[i];
      }
    }
    return padrao;
  }

  /** mistura duas cores hex — `t` de 0 (a) a 1 (b) */
  function misturarCor(a, b, t) {
    const ma = HEX.exec(a); const mb = HEX.exec(b);
    if (!ma || !mb) return t >= 0.5 ? b : a;
    const ca = parseInt(ma[1], 16); const cb = parseInt(mb[1], 16);
    const q = Math.max(0, Math.min(1, t));
    const canal = (deslo) => {
      const x = (ca >> deslo) & 255; const y = (cb >> deslo) & 255;
      return Math.round(x + (y - x) * q);
    };
    const r = canal(16); const g = canal(8); const bl = canal(0);
    return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
  }

  /** o gradiente de uma onda no ponto `p` do crescimento (0..1) */
  function faixaDaOnda(p, corpo, cabeca) {
    if (p >= 1) return ['step', ['line-progress'], corpo, 0.999, corpo];
    const cab = Math.max(0.001, Math.min(0.985, p - 0.09));
    const ponta = Math.max(cab + 0.005, Math.min(0.999, p));
    return ['step', ['line-progress'], corpo, cab, cabeca, ponta, CENA_INVISIVEL];
  }

  function quadroDaCena(daVez) {
    if (cena !== daVez) return;
    const casa = daVez.casa;
    const mapa = casa.mapa;
    if (!mapaNaTela(casa)) { encerrarCena('saiu', true); return; }
    const agora = (window.performance && performance.now) ? performance.now() : Date.now();
    const t = agora - daVez.t0;
    if (t > CENA_TETO_VIDA) { encerrarCena('teto'); return; }

    const corpo = daVez.corpo || (daVez.corpo = tinta('--map-cena-rua', '#59677a'));
    const cabeca = daVez.cabeca || (daVez.cabeca = tinta('--map-cabeca', '#e8f4ff'));

    /* 🔴 O RESTO DO MUNDO VOLTA ENQUANTO A CENA AINDA CRESCE (10/08 — dono:
       *"não pode ter a impressão de pisca e pula de tela… acende as coisas,
       preenche os nomes e PARA NO ESTADO"*).

       Prédio, ponto de interesse, nome de bairro e o rótulo da rua a cena NÃO
       redesenha: eles só somem. Devolvendo tudo no fim, o último quadro da cena
       era o instante em que meia tela APARECIA de uma vez — e MEDIDO no g15 o
       assentamento arrastava 1,6 s, com a tela ainda mudando muito depois de a
       última rua fechar. Voltando aqui, junto com a última onda, quando a cena
       acaba não há mais nada por chegar: o que sobra é a linha da rua trocando
       de cor por baixo dela, que ninguém vê. */
    if (!daVez.mundoVoltou && daVez.ondas.length) {
      const ultima = daVez.ondas[daVez.ondas.length - 1];
      if (t >= ultima.em) {
        daVez.mundoVoltou = true;
        devolverMundo(mapa, fatiaDoMundo(daVez.mundo, false), CENA_VOLTA_RESTO);
        apagarNomesDaCena(mapa, CENA_VOLTA_RESTO, daVez);
      }
    }

    const corFim = daVez.corFim || (daVez.corFim = corDaRuaReal(mapa, corpo));
    let ruasProntas = true;
    for (let i = 0; i < daVez.ondas.length; i += 1) {
      const o = daVez.ondas[i];
      if (o.pronta) continue;
      const onda = daVez.onda || CENA_ONDA;
      const p = (t - o.em) / onda;
      if (p <= 0) { ruasProntas = false; continue; }
      const id = `${CENA_FONTE}-${i}`;
      /* 🔴 FECHOU A RUA, A COR ESCORREGA PRO TOM DE VERDADE. Sem isto a onda
         ficava acesa até o fim da cena e a linha caía do `#59677a` pro `#333333`
         no instante da troca — o "escurece" que o dono viu, e que nenhuma
         opacidade bem feita resolveria, porque o problema era a TINTA. */
      const q = (t - (o.em + onda)) / CENA_COR_ASSENTA;
      const tom = q > 0 ? misturarCor(corpo, corFim, q) : corpo;
      try {
        if (!o.acesa) { o.acesa = true; mapa.setPaintProperty(id, 'line-opacity', 1); }
        mapa.setPaintProperty(id, 'line-gradient', faixaDaOnda(Math.min(1, p), tom, cabeca));
      } catch (_) { o.pronta = true; continue; }
      // a onda só está PRONTA quando cresceu E assentou a cor: é isso que faz o
      // desfecho encontrar a mesma tinta dos dois lados da troca.
      if (p >= 1 && q >= 1) o.pronta = true; else ruasProntas = false;
    }

    let nomesProntos = true;
    let mudou = false;
    for (let i = 0; i < daVez.nomes.length; i += 1) {
      const n = daVez.nomes[i];
      const q = Math.max(0, Math.min(n.nome.length, Math.floor((t - n.em) / CENA_LETRA)));
      if (q !== n.q) { n.q = q; mudou = true; }
      if (q < n.nome.length) nomesProntos = false;
    }
    if (mudou) escreverNomes(daVez);

    if (ruasProntas && nomesProntos) { encerrarCena('fim'); return; }
    proximoQuadro(daVez);
  }

  function escreverNomes(daVez) {
    let fonte;
    try { fonte = daVez.casa.mapa.getSource(CENA_NOMES); } catch (_) { return; }
    if (!fonte) return;
    const features = [];
    daVez.nomes.forEach((n) => {
      if (n.q <= 0) return;
      features.push({
        type: 'Feature',
        properties: { txt: n.nome.slice(0, n.q) },
        geometry: { type: 'LineString', coordinates: n.pontos },
      });
    });
    try { fonte.setData({ type: 'FeatureCollection', features }); } catch (_) { /* fonte saindo */ }
  }

  /** tira as peças da cena do mapa — só as nossas, e sempre por nome */
  function limparCena(mapa) {
    if (!mapa) return;
    try {
      if (mapa.getLayer(CENA_NOMES_L)) mapa.removeLayer(CENA_NOMES_L);
      for (let i = 0; i < CENA_ONDAS; i += 1) {
        const id = `${CENA_FONTE}-${i}`;
        if (mapa.getLayer(id)) mapa.removeLayer(id);
      }
      if (mapa.getSource(CENA_NOMES)) mapa.removeSource(CENA_NOMES);
      if (mapa.getSource(CENA_FONTE)) mapa.removeSource(CENA_FONTE);
    } catch (_) { /* estilo trocou: foi tudo junto */ }
  }

  /* 🔴 UM SÓ DESFECHO, E ELE DEVOLVE O MUNDO. Toda saída da cena passa por aqui
     — fim, dedo, tela que trocou, teto, erro no meio. Cena que morre sem
     devolver a cidade deixaria o motorista com um mapa vazio pelo resto do dia,
     e isso é bem pior que não ter cena nenhuma. */
  function encerrarCena(motivo, seco) {
    const c = cena;
    if (!c) return;
    cena = null;
    if (c.raf) { try { cancelAnimationFrame(c.raf); } catch (_) { /* já passou */ } }
    const mapa = c.casa && c.casa.mapa;
    /* 🔴 O DEDO TEM PRESSA E O FIM NÃO. Quem tocou o mapa quer o mapa agora — um
       assentamento de 1,2 s ali seria a cena continuando depois de ser mandada
       embora. Fim natural assenta com calma; dedo assenta em 1/3 do tempo; seco
       (tela trocou, estilo novo, erro) é imediato. */
    /* 🔴 E A DO NAVEGAR ASSENTA RÁPIDO, PORQUE TEM FILA ATRÁS DELA: a descida
       pro 3D começa 400 ms depois do fim. Um assentamento de 700 ms ainda
       estaria subindo a cidade com a câmera já em movimento — dois efeitos se
       cruzando pela porta dos fundos. */
    let assenta = seco ? 0 : (motivo === 'dedo' ? CENA_ASSENTA_DEDO : CENA_ASSENTA);
    if (!seco && c.motivo === 'navegar' && motivo !== 'dedo') assenta = CENA_ASSENTA_NAV;
    /* 🔴 A RUA DE VERDADE ACENDE INSTANTÂNEA, POR BAIXO DA CENA — e é isto que
       mata o "escurece e fica ilegível" (dono, 10/08).
       O que havia era um CRUZAMENTO de opacidades: a rua da cena descendo e a
       real subindo em 700 ms, as duas em meio-caminho ao mesmo tempo, e os
       nomes da cena saindo 440 ms ANTES de os nomes reais chegarem. No meio
       desse vão a tela inteira fica em meia-tinta — que é exatamente a foto 3.
       Instantâneo aqui não pisca porque não se vê: a cena está 100% opaca em
       cima da MESMA geometria, com a mesma largura. O que o olho pega é só a
       troca de cor quando a cena sai, logo abaixo. */
    if (seco || motivo === 'dedo') devolverMundo(mapa, c.mundo, assenta);
    else {
      // o resto já voltou durante a cena (§ quadroDaCena); se não voltou — cena
      // cortada antes da última onda — ele vem junto, e aí com o fade dele.
      if (!c.mundoVoltou) devolverMundo(mapa, fatiaDoMundo(c.mundo, false), CENA_VOLTA_RESTO);
      devolverMundo(mapa, fatiaDoMundo(c.mundo, true), 0);
    }
    if (mapa && c.dedo) {
      ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach((ev) => {
        try { mapa.off(ev, c.dedo); } catch (_) { /* mapa morto */ }
      });
    }
    if (c.eu) { try { c.eu.classList.remove('nascendo'); } catch (_) { /* saiu do DOM */ } }
    if (c.cartao) {
      const el = c.cartao;
      if (seco) { try { el.remove(); } catch (_) { /* já saiu */ } }
      else { el.classList.add('saindo'); setTimeout(() => { try { el.remove(); } catch (_) { /* já saiu */ } }, CENA_SAI + 60); }
    }
    if (seco) { limparCena(mapa); return; }
    /* A cena sai com a rua de verdade JÁ ACESA embaixo (acima), então não há
       mais atraso nenhum a cumprir: o que sobra é a troca de cor, e ela é curta
       de propósito. No dedo é mais curta ainda — quem tocou quer o mapa. */
    const dura = motivo === 'dedo' ? 200 : CENA_TROCA;
    const espera = (seco || motivo === 'dedo') ? Math.round(assenta * 0.55) : 0;
    try {
      for (let i = 0; i < CENA_ONDAS; i += 1) {
        const id = `${CENA_FONTE}-${i}`;
        if (!mapa.getLayer(id)) continue;
        mapa.setPaintProperty(id, 'line-opacity-transition', { duration: dura, delay: espera });
        mapa.setPaintProperty(id, 'line-opacity', 0);
      }
      // os nomes da cena já saíram junto com a volta do resto do mundo; se a
      // cena foi cortada antes disso, eles saem aqui.
      if (!c.nomesSairam) apagarNomesDaCena(mapa, dura, c);
    } catch (_) { /* estilo trocando: o limpar abaixo resolve */ }
    setTimeout(() => limparCena(mapa), espera + dura + 90);
  }

  /* 🔴 OS NOMES DA CENA SAEM QUANDO OS DE VERDADE CHEGAM, no MESMO relógio — não
     antes. Eles saíam 440 ms na frente, e nesse vão a rua ficava sem nome
     nenhum enquanto o rótulo do basemap ainda subia de 0: é a metade "nomes
     quase ilegíveis" da queixa. Os dois no ar por um instante é o preço, e é o
     preço certo — rótulo dobrado por 400 ms lê como assentamento; rótulo
     nenhum lê como defeito. */
  function apagarNomesDaCena(mapa, ms, alvo) {
    if (alvo) alvo.nomesSairam = true;
    try {
      if (!mapa.getLayer(CENA_NOMES_L)) return;
      mapa.setPaintProperty(CENA_NOMES_L, 'text-opacity-transition', { duration: ms, delay: 0 });
      mapa.setPaintProperty(CENA_NOMES_L, 'text-opacity', 0);
    } catch (_) { /* estilo trocando */ }
  }


  /* ==========================================================================
     7a-ter. A CORRENTE DA ABERTURA — HBX, app carregado, cena, mapa. Nessa
     ordem, sem tela morta no meio.

     Dono (09/08, no g15): *"o HBX na hora q sobe para a tela está até ok, mas
     ele sempre trava, pq o celular está carregando tudo as coisas enquanto
     funciona"* · *"tente trabalhar em passos: aparece o HBX no começo, aguarda
     realmente ter carregado tudo a entrada, aí sim acontece o efeito"* · *"vai
     pesar demais se tiver tela piscando e coisa mal feita, tem q ser limpo,
     sensação profissional"*.

     🔴 O QUE ELE VIU (medido no boot do g15, APK 234): a abertura entregava o
     app num relógio cego e o mapa só COMEÇAVA A NASCER depois — a tela Rota
     entrava com o palco vivo e VAZIO (cinza chapado, com a seta e mais nada) por
     um segundo largo, e só então a cena das ruas tinha o que desenhar. Três
     coisas em fila, cada uma cortando a anterior: HBX → cinza → cena → mapa.

     🔴 A CURA É INVERTER QUEM ESPERA QUEM. O mapa passa a nascer DURANTE a
     abertura, numa garagem fora da tela (a mesma do `estacionarMapas`), e a
     abertura só entrega o app quando dado, mapa e primeiro fix estão na mão. Aí
     a tela Rota entra com tudo pronto e a cena começa no primeiro quadro — não
     existe mais o vão cinza, porque não existe mais espera depois da porta.

     🔴 E O MAPA NÃO NASCE NO PRIMEIRO QUADRO DA ABERTURA. As duas hastes voam de
     0,86 s a 1,80 s e são a parte mais bonita da cena; subir contexto WebGL e
     parsear tile no meio disso é gastar quadro justamente onde ele aparece.
     `ABERTURA_MAPA_EM` põe o mapa pra nascer depois que a marca se forma, no
     trecho de brilho e batida, que é barato.
     🔴 ESTE NÚMERO ANDA COM A CENA. Ele era 1300 quando as hastes voavam de 0,3 s
     a 1,41 s; em 10/08 a ordem virou "HB primeiro, X depois" (§ os 6 atos, no
     mock) e as hastes passaram a pousar em 1,80 s — 1300 caía bem no meio do voo,
     que é exatamente o quadro que este atraso existe pra proteger.

     🔴 O TETO DAQUI É MENOR QUE O DO MOCK (6 s contra 7 s), de propósito: quem
     decide a saída tem que ser o AVISO, não o socorro. Se o meu teto vencer
     primeiro, a abertura sai pela porta da frente ("pronto o que deu") em vez de
     ser arrancada pelo relógio de emergência do desenho.
     ========================================================================== */
  const ABERTURA_MAPA_EM = 1800;
  const ABERTURA_TETO_PONTE = 6000;
  const bootFalta = new Set(['dado', 'mapa', 'fix']);
  let bootAvisou = false;

  function avisarAbertura() {
    if (bootAvisou) return;
    bootAvisou = true;
    try { if (typeof window.aberturaPronta === 'function') window.aberturaPronta(); }
    catch (_) { /* mock velho sem a porta: o teto do desenho responde */ }
  }

  /** cada peça avisa quando chega; a última acende a luz verde da abertura */
  function bootChegou(peca) {
    if (!bootFalta.delete(peca)) return;
    if (!bootFalta.size) avisarAbertura();
  }

  /* 🔴 O PALCO FANTASMA É O TRUQUE INTEIRO, e ele não inventa nada: é um
     `.mapa-palco` de verdade, com o mesmo `data-mapa="geral"`, morando na
     garagem fora da tela. `montarMapa` roda nele sem uma linha de exceção, e
     quando a tela Rota nasce o TRANSPLANTE que já existe leva o mapa pronto pra
     ela — com câmera, seta e tiles no lugar.
     Ele tem o tamanho da JANELA e não os 360x640 da garagem: tile se pede pelo
     retângulo visível, e nascer pequeno seria pedir tudo de novo no transplante. */
  function prepararMapaCedo() {
    if (GARAGEM.get('geral') || MONTANDO.has('geral')) return;
    if (!BOX.isConnected) document.body.appendChild(BOX);
    const fantasma = document.createElement('div');
    fantasma.className = 'mapa-palco';
    fantasma.dataset.mapa = 'geral';
    fantasma.setAttribute('aria-hidden', 'true');
    const L = window.innerWidth || 412;
    const A = window.innerHeight || 800;
    fantasma.style.cssText = 'position:absolute;left:0;top:0;width:' + L + 'px;height:' + A + 'px';
    BOX.appendChild(fantasma);
    montarMapa(fantasma);
  }


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
    const casa = GARAGEM.get('geral');
    if (!casa || !casa.mapa || !mapaNaTela(casa) || semMovimento()) return 0;
    /* Uma cena por vez, sempre: se a de entrada ainda estiver no ar quando o
       motorista mandar fechar, ela sai SECA e a de volta assume. */
    if (cena) encerrarCena('saida', true);
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
      casa.mapa.once('styledata', () => desenharTraco(casa.mapa));
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
      if (nome === 'gps') { desenharTraco(casa.mapa); pedirCamera(); atenderCena(casa); return; }
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
    if (nome === 'geral') chamarCena(nova, 'entrada');
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
      sincronizarPinos(nova);
      // 🔴 A SETA É UMA SÓ. No palco "gps" quem mostra o motorista é o puck do
      // desenho, parado a 68% da tela — um marcador do maplibre no mesmo lugar
      // seria a segunda seta, e o V4 promete uma. No mapa "geral" (a rota
      // inteira, sem puck) o marcador é justamente o que diz onde ele está.
      // e a cena da entrada da navegação espera o mapa NASCER, não só o palco:
      // sem estilo no ar não há rua nenhuma pra crescer (§ `atenderCena`).
      if (nome === 'gps') { desenharTraco(mapa); pedirCamera(); atenderCena(nova); return; }
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
       cada fix e nunca mais seguiria ninguém. Só o palco da navegação: no mapa
       "geral" não há câmera automática pra brigar com o dedo. */
    if (nome === 'gps') {
      const doDedo = (e) => { if (e && e.originalEvent) soltarCamera(); };
      mapa.on('dragstart', doDedo);
      mapa.on('rotatestart', doDedo);
      mapa.on('pitchstart', doDedo);
      mapa.on('zoomstart', doDedo);
    } else {
      /* 🔴 "2D" É UMA TRAVA, NÃO UMA POSE INICIAL (dono, 08/08: *"mapa limpo,
         2d"*). Todo mapa do maplibre gira e inclina com dois dedos — quer dizer
         que a tela de PLANEJAR podia sair deitada e torta sem ninguém pedir, e
         sem bússola nenhuma pra dizer onde ficou o norte (a bússola é peça da
         tela de dirigir). Aqui a rotação e a inclinação são DESLIGADAS: arrastar
         e pinçar continuam, que é tudo o que se faz num mapa visto de cima. */
      try { mapa.dragRotate.disable(); } catch (_) { /* versão sem o gesto */ }
      try { mapa.touchZoomRotate.disableRotation(); } catch (_) { /* idem */ }
      try { mapa.touchPitch.disable(); } catch (_) { /* idem */ }
      try { mapa.keyboard.disableRotation(); } catch (_) { /* idem */ }
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
        if (camFase === 'solta') sincronizarPuckSolto(true);
      });
    };
    mapa.on('move', acompanharCamera);
    mapa.on('zoom', acompanharCamera);
    mapa.on('resize', acompanharCamera);
    mapa.on('load', acompanharCamera);
  }

