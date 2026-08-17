  /* ---- A PINTURA ---------------------------------------------------------
     Um lugar só escreve no seam do GPS, e ele escreve TUDO — inclusive o vazio.
     🔴 Escrever só o que eu sei deixaria o resto com o valor anterior: o seam é
     MERGE (a lei do §4.6.5), e campo que ninguém reescreve fica pra sempre. */
  function pintarNavegacao() {
    if (typeof window.usarDados !== 'function') return;
    const pendentes = paradasPendentes();
    const vez = pendentes[0] || null;
    const cliente = (vez && vez.item && vez.item.cliente) || {};
    const total = ENTREGAS.size;

    const m = manobraDaVez();
    const rumo = rumoDaTela();
    /* 🔴 O VELOCÍMETRO VAI EXATO — e agora PODE. Ele é o único número
       realmente contínuo da tela (a 40 km/h muda todo segundo), e por isso ia
       no seam em faixa de 5 em 5 enquanto o número de verdade era escrito
       direto no nó: duas verdades pro mesmo lugar, e a faixa aparecendo por um
       instante a cada repinte. Com o `data-vivo` a troca de texto não repinta
       nada, então o seam carrega o número certo e ele é o único.
       Abaixo de 3 km/h é ZERO: parado, o aparelho oscila 0-1-0 sozinho. */
    const velExata = ultimoFix && Number.isFinite(ultimoFix.velMps) && ultimoFix.velMps >= 0
      ? Math.round(ultimoFix.velMps * 3.6) : null;
    const velKmh = velExata == null ? '' : String(velExata < 3 ? 0 : velExata);
    /* 🔴 A PRECISÃO DO GPS SAIU DESTE SEAM NO LOTE 3 (15/08). `GPS ±20 m`
       sacode a cada fix (o aparelho mede 18, 21, 19 parado no mesmo lugar) —
       era exatamente por isso que ela só entrava aqui quando a tela era o
       "Você chegou" (`chegouPrecisao`), pra não repintar a navegação 1x/s de
       graça. Agora o "Você chegou" nem passa mais pelo seam: `cartaoChegada`
       lê `ultimoFix` direto na hora de montar (ver `desenharChegada`,
       D0-porta-entrega.js). Nada aqui precisa mais saber da precisão. */

    // chegada = agora + o que a rota disse que falta. Sem rota, sem hora — a
    // conta do relógio é do APARELHO, mas o tempo é do roteador.
    const chegada = navRota && navRota.totalS != null
      ? hora(new Date(Date.now() + navRota.totalS * 1000).toISOString()) : '';

    const cromo = {
      manobraIcone: m ? m.passo.icone : '',
      manobraDist: m ? emMetrosDaManobra(m.distancia) : '',
      manobraVerbo: m ? maiuscula(m.passo.verbo) : '',
      manobraRua: m ? (m.passo.rua || '') : '',
      // "depois, siga em frente por 1,2 km" do desenho = a PRÓXIMA manobra. Só
      // entra se ela existir de verdade; encadeada é o que separa um app com
      // mapa de um GPS (item 7 do app que já roda).
      manobraDepois: m && m.depois ? `depois, ${m.depois.verbo}` : '',
      rumo: cardeal(rumo),
      velocidade: velKmh,
      paradaN: vez ? String(vez.n) : '',
      paradaTotal: total ? String(total) : '',
      paradaNome: vez ? esc(cliente.nome) : '',
      chegada,
      restante: navRota ? emMinutos(navRota.totalS) : '',
      distancia: navRota ? emMetros(navRota.totalM) : '',
      // os 6 campos `chegou*` que moravam aqui (chegouId/Endereco/Precisao/
      // Faltam/FaltamVerbo/Km) saíram no LOTE 3 (15/08): o "Você chegou" não
      // é mais cromo desta tela — é a peça `.chegou-wrap`, montada à parte
      // por `cartaoChegada`/`desenharChegada` (D0-porta-entrega.js).
      // o botão da beirada mostra o estado REAL do aparelho, não um estado só
      // dele: quem silencia pelos Ajustes vê o botão apagado aqui também.
      vozMuda: vozLigada() ? '' : '1',
    };
    // texto que só trocou de valor entra pelo nó; o resto derruba a camada
    if (cromoNoNo(cromo)) return;
    window.usarDados('gps', cromo);
  }

  /* ---- 7d. O TRAÇO E A CÂMERA — a promessa visual do V4 -------------------
     O mock `gps-ruas-prospector-v4.html` promete um GPS: mundo INCLINADO
     girando pelo rumo, a seta parada a 68% da tela e a FITA VERDE saindo dela
     rua adentro. O app entregava um mapa plano, norte pra cima, parado no
     ponto onde foi montado, sem traço nenhum — mapa com pinos, não navegação.

     🔴 A GEOMETRIA JÁ VINHA NO FIO E O APP A JOGAVA FORA. O proxy do backend
     (`logistica-osrm.service.ts`) pede `overview=full&geometries=geojson` em
     TODA chamada: `routes[0].geometry` sempre esteve na resposta que o
     `pedirRota` já fazia. Desenhar o traço não custa uma requisição nova.

     🔴 WEBGL NÃO LÊ `var()` (a lei do §4 do guia): a cor sai do token por
     `getComputedStyle` na hora de pintar. A receita das 2 demãos é a do V4
     (`--map-rota-borda` embaixo, `--map-rota` em cima); o brilho de 3ª demão
     do mock não tem token no app e NÃO foi inventado aqui.

     🔴 A CÂMERA TEM UM DONO SÓ (a lei que custou a piscada do mapa): esta
     função é a única que mexe em centro, zoom, inclinação e giro na tela de
     dirigir. E ela só GIRA com rumo confiável (≥9 km/h) — parado, o rumo do
     aparelho é ruído puro e o mapa rodopiaria na cara de quem está na porta
     do cliente. */
  const TRACO = 'hbx-rota-traco';
  const NAV_ZOOM = 15.8;
  /* 51°, o número do V4 (`para={tilt:51,…}`) — era 55 aqui por chute. */
  const NAV_PITCH = 51;
  /* 🔴 A ÂNCORA DEIXOU DE SER NÚMERO GÊMEO (11/08): ela é MEDIDA na tela, ver
     `ancoraDoPuck`. Isto aqui é só o ÚLTIMO RECURSO — o quadro em que a câmera
     precisa se acertar e a seta ainda não está no DOM (mapa nascendo, camada
     trocando no repinte). Errar por um dedo aqui não vira defeito: o quadro
     seguinte já mede. Era 0,86 enquanto o mock ancorava a seta em `top:86%`;
     hoje o mock a pousa no `--gps-piso` + `--gps-puck-sobe` (16/08, a seta que
     saiu do amontoado do rodapé), que em aparelho comum dá ~0,77. */
  const NAV_ANCORA = 0.77;

  const mapaDaNavegacao = () => {
    const palco = naCamada(`[data-mapa="${PALCO}"]`);
    return (palco && palco.__hbxMapaObj) || null;
  };
  /* 🔴 A TINTA DO MAPA SAI DO `.app`, NÃO DA RAIZ — e isto era um pedaço da pele
     clara que nunca chegava no mapa. A pele clara do mock inteira mora em
     `[data-luz="claro"] .app{…}`: o `data-luz` está no `<html>`, mas o SELETOR
     exige o `.app`, então a raiz continua com os tokens do ESCURO. Lendo dali, a
     fita da rota saía com a lima de tela escura em cima do mapa claro — o
     "buraco clássico da troca de pele" que o próprio mock avisa duas linhas
     acima do token. A raiz fica de reserva: no mock, fora do `.app`, é ela que
     responde. */
  const tinta = (nome, padrao) => {
    try {
      const casca = document.querySelector('.app') || document.documentElement;
      return getComputedStyle(casca).getPropertyValue(nome).trim() || padrao;
    } catch (_) { return padrao; }
  };
  const geometriaDe = (rota) => {
    const g = rota && rota.geometry;
    return (g && g.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length > 1)
      ? g : null;
  };

  /* Espera o estilo SÓ pra DESENHAR — nunca pra decidir fluxo (a recaída de
     31/07: um `isStyleLoaded` na porta de uma função barrou o pedido da rota e
     o dono ficou "sem traço, sem voz, sem ETA"). Teto de 1,2 s porque mapa
     remontado pode nunca dizer "pronto". */
  /* 🔴 O TETO VIROU O DONO — e era ele quem segurava a cena das ruas (16/08).
     MEDIDO no ida-e-volta: em mapa TRANSPLANTADO o `isStyleLoaded()` sai false
     (o `resize()` do transplante suja as fontes) e o `styledata` só chega em
     1210 ms, ou seja, EXATAMENTE no teto — enquanto o mapa já tinha anunciado
     `idle` aos 345 ms. Resultado: ~865 ms de mapa pronto com a tela parada,
     todo ida-e-volta. O `idle` do maplibre é o sinal que já existe e que já
     dizia a verdade; só não tinha ninguém ouvindo. O latch `feito` já aceita
     vários sinais — quem chegar primeiro roda —, então o teto de 1,2 s volta a
     ser o que ele sempre quis ser: socorro, não caminho normal. */
  function quandoEstiloPronto(mapa, fn) {
    if (!mapa) return;
    if (mapa.isStyleLoaded && mapa.isStyleLoaded()) { fn(); return; }
    let feito = false;
    const roda = () => { if (feito) return; feito = true; try { fn(); } catch (_) { /* estilo trocou no meio */ } };
    try { mapa.once('styledata', roda); } catch (_) { /* mapa morto */ }
    try { mapa.once('idle', roda); } catch (_) { /* mapa morto */ }
    setTimeout(roda, 1200);
  }

  /* 🔴 A FITA SAI DA SETA, SEMPRE. Entre dois pedidos ao roteador o carro anda
     — e o traço ficava onde a rota foi CALCULADA, solto no meio da tela, longe
     do motorista (print das 00:38). Aqui ele é APARADO a cada fix: acha o
     ponto mais perto, joga fora o que ficou pra trás e começa no próprio fix.
     É de graça, a geometria já está no aparelho.
     Longe demais da linha (>200 m: saiu do caminho) devolve a fita inteira —
     costurar uma reta gigante do carro até a rota seria desenhar um caminho
     que não existe. */
  /* 🔴 A SETA NASCE NA RUA, NUNCA DENTRO DA CASA — cena do dono, 08/08: "da
     seta começar dentro da minha casa? ela tinha q começar pela rua, igual
     todo gps!!". O fix CRU do aparelho cai onde o aparelho acha que está (o
     quintal, o telhado, o quarto) e balança de metro em metro com o carro
     parado. Desenhar a fita e centrar a câmera nesse ponto é o que fazia a
     rota sair de dentro de casa e tremer o tempo todo.

     Todo GPS do mundo resolve isso do mesmo jeito: PRENDE a posição na linha
     da rota. A conta aqui é a projeção do fix no SEGMENTO mais perto — não no
     VÉRTICE mais perto, senão a seta pularia de esquina em esquina no meio da
     quadra. Em metros locais (equiretangular), que nesta escala é exato.

     🔴 E NÃO PRENDE DE QUALQUER JEITO: acima de 60 m da rota ele saiu do
     caminho de verdade, e aí a posição mostrada é a REAL. Prender sempre seria
     desenhar o motorista numa rua onde ele não está — mentira com cara de GPS. */
  const SNAP_MAX_M = 60;
  /* 🔴 A PROJEÇÃO DEVOLVE O ÍNDICE, E ELE É O QUE FALTAVA DO OUTRO LADO DA CASA
     (12/08). Esta conta era privada do traço, e o `i` — o segmento da fita em
     que o motorista está — morria aqui dentro. Quem escolhe a MANOBRA perguntava
     "quantos metros até a curva" e nunca "ela já ficou pra trás", que é pergunta
     de ORDEM e é este inteiro que responde. Ver o fantasma em `manobraDaVez`.

     `ateSegmento` corta a varredura: a fita é a rota do DIA INTEIRO e ela se
     cruza (rua de mão dupla, quarteirão dado duas vezes, cul-de-sac de entrega),
     e 60 m de snap cabem folgados na volta. Sem o corte, a projeção grudaria num
     pedaço que ainda VEM e declararia passada uma curva que está na frente. */
  function projetarNaFita(ponto, geo, ateSegmento) {
    const c = geo && geo.coordinates;
    if (!ponto || !Number.isFinite(ponto.lat) || !c || c.length < 2) return null;
    const kx = 111320 * Math.cos((ponto.lat * Math.PI) / 180);
    const ky = 110540;
    const px = ponto.lng * kx; const py = ponto.lat * ky;
    const teto = Number.isFinite(ateSegmento) && ateSegmento >= 1
      ? Math.min(c.length - 1, ateSegmento) : c.length - 1;
    let melhor = null;
    for (let i = 0; i < teto; i += 1) {
      const ax = c[i][0] * kx; const ay = c[i][1] * ky;
      const dx = (c[i + 1][0] * kx) - ax; const dy = (c[i + 1][1] * ky) - ay;
      const den = (dx * dx) + (dy * dy);
      let t = den > 0 ? ((((px - ax) * dx) + ((py - ay) * dy)) / den) : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const qx = ax + (t * dx); const qy = ay + (t * dy);
      const d = Math.hypot(px - qx, py - qy);
      if (!melhor || d < melhor.d) melhor = { d, i, lat: qy / ky, lng: qx / kx };
    }
    return melhor;
  }

  /* 🔴 UMA PROJEÇÃO POR FIX, E ELA É A MESMA PRA TODO MUNDO. Ela é O(n) sobre a
     geometria do dia e rodava 4 a 6 vezes no MESMO fix — traço, rumo, câmera,
     cartão e voz, cada um refazendo a conta. O CPU era o menor problema: eram
     CINCO respostas para a mesma pergunta, e régua repetida diverge calada.
     A memória é por IDENTIDADE: `aoFix` monta um objeto novo a cada posição e
     `pedirRota` troca o `navRota` inteiro, então não há o que invalidar na mão —
     e nada aqui pode ficar velho sem que um dos dois tenha trocado. */
  let presoMemo = { fix: undefined, rota: undefined, valor: null };
  function presoNaRota(fix) {
    if (fix === presoMemo.fix && navRota === presoMemo.rota) return presoMemo.valor;
    const p = projetarNaFita(fix, navRota && navRota.geometria,
      navRota ? navRota.fimDaPerna : null);
    const valor = (p && p.d <= SNAP_MAX_M) ? p : null;
    presoMemo = { fix, rota: navRota, valor };
    return valor;
  }

  /** onde a tela deve mostrar o motorista: na rua se der, no fix se não der */
  const posicaoDaTela = () => presoNaRota(ultimoFix) || ultimoFix || null;

  /* ---- PRA ONDE A TELA APONTA -------------------------------------------
     🔴 ORDEM DO DONO (08/08): "tem q ficar sempre apontando pro lugar onde tem
     q ir". O rumo do APARELHO só é confiável em movimento (≥9 km/h) — parado
     ele é ruído puro, e era por isso que a câmera ficava norte-acima com a
     fita saindo de lado: o motorista via a rota atravessando a tela em vez de
     subir na frente dele.

     Quem sabe pra onde ele vai, mesmo parado, é a ROTA. Dois degraus:
       1. ANDANDO: o rumo do aparelho — é a verdade do que está acontecendo;
       2. PARADO/LENTO: o rumo DA ROTA no ponto onde ele está, olhando 40 m de
          traço à frente (média vetorial, pra curva não fazer a tela pinotar).
     Sem rota, ou fora dela, NÃO gira: girar sem saber é pior que ficar quieto.

     🔴 E ISTO NÃO ENTRA NO PEDIDO AO ROTEADOR. O `bearings` do OSRM continua
     saindo só do rumo do aparelho — mandar a direção DA ROTA de volta pra ela
     mesma é conversa circular, e o `bearings` existe justamente pra impedir
     que o roteador invente um retorno no meio da avenida. */
  const RUMO_OLHAR_M = 40;

  function rumoDaRota() {
    const geo = navRota && navRota.geometria;
    const c = geo && geo.coordinates;
    const preso = presoNaRota(ultimoFix);
    if (!c || !preso) return null;
    const kx = 111320 * Math.cos((preso.lat * Math.PI) / 180);
    let ax = preso.lng * kx; let ay = preso.lat * 110540;
    let somaX = 0; let somaY = 0; let andou = 0;
    for (let i = preso.i + 1; i < c.length && andou < RUMO_OLHAR_M; i += 1) {
      const bx = c[i][0] * kx; const by = c[i][1] * 110540;
      const dx = bx - ax; const dy = by - ay;
      const d = Math.hypot(dx, dy);
      if (d > 0) { somaX += dx; somaY += dy; andou += d; }
      ax = bx; ay = by;
    }
    if (!andou) return null;
    return ((Math.atan2(somaX, somaY) * 180) / Math.PI + 360) % 360;   // 0° = norte
  }

  const rumoDaTela = () => {
    const doAparelho = rumoConfiavel(ultimoFix);
    return doAparelho != null ? doAparelho : rumoDaRota();
  };

  function tracoDaVez() {
    const geo = navRota && navRota.geometria;
    if (!geo) return null;
    const preso = presoNaRota(ultimoFix);
    if (!preso) return geo;                       // fora da rota: a fita inteira
    const resto = geo.coordinates.slice(preso.i + 1);
    if (!resto.length) return geo;
    return { type: 'LineString', coordinates: [[preso.lng, preso.lat]].concat(resto) };
  }

  /* 🔴 A FITA SE APAGA DE VERDADE, NÃO "DEIXA DE SER PINTADA". O mapa é UM só
     pela vida do app (a GARAGEM): fonte e camadas ficam nele mesmo depois que
     a tela repinta. Só parar de desenhar deixaria a fita da rota morta viva na
     tela pro dia inteiro — foi metade do print de 09/08. */
  function apagarTraco(mapa) {
    if (!mapa) return;
    try {
      if (mapa.getLayer(`${TRACO}-fita`)) mapa.removeLayer(`${TRACO}-fita`);
      if (mapa.getLayer(`${TRACO}-casca`)) mapa.removeLayer(`${TRACO}-casca`);
      if (mapa.getSource(TRACO)) mapa.removeSource(TRACO);
    } catch (_) { /* estilo trocando: a próxima passada limpa */ }
  }

  /* 🔴 A FITA TEM A LARGURA DO ZOOM, NÃO UMA LARGURA (dono, 09/08, olhando a
     rota montada de 56 paradas: *"arrumar esse visual, horrível"*).

     Ela era 7 px de fita sobre 11 px de casca, cravados, em qualquer zoom. No
     zoom de RUA isso está certo — a conta da projeção em Rio Claro (lat 22,4°)
     dá 2,2 m por pixel no z16, então a fita mede 15 m de chão: a largura de uma
     rua, que é o que ela promete ser. No zoom em que o DIA INTEIRO cabe na tela
     (z12, o do print), o mesmo pixel vale 35 m — e a mesma fita passa a cobrir
     uma faixa de 247 m de largura, com a casca em 388 m. Isso não é uma rota
     desenhada por cima da cidade: é a cidade apagada por baixo de um risco de
     doze quarteirões de largura.

     A cura é a régua do próprio mapa: largura em pixel INTERPOLADA pelo zoom,
     que é como todo navegador desenha rota. Longe ela é um fio; perto ela volta
     a ter 7/11 — os números de hoje, que no zoom de dirigir sempre foram bons.
     Os dois palcos usam a mesma escala: o da navegação vive em z16,5+, onde ela
     entrega exatamente o que já entregava. */
  const LARGURA_FITA = ['interpolate', ['linear'], ['zoom'],
    11, 2.2, 13, 3.2, 15, 5, 16.5, 7, 18, 8.5];
  const LARGURA_CASCA = ['interpolate', ['linear'], ['zoom'],
    11, 3.8, 13, 5, 15, 8, 16.5, 11, 18, 13];

  function desenharTraco(mapa) {
    // 🔴 A MESMA RÉGUA DOS PINOS (§ rotaMontada): sem rota montada o mapa não
    // desenha rota — e aqui isso quer dizer TIRAR o que já estava desenhado.
    if (!rotaMontada()) { apagarTraco(mapa); return; }
    const geo = tracoDaVez();
    if (!mapa || !geo) return;
    const dado = { type: 'Feature', geometry: geo, properties: {} };
    try {
      const fonte = mapa.getSource(TRACO);
      if (fonte) { fonte.setData(dado); return; }
      mapa.addSource(TRACO, { type: 'geojson', data: dado });
      mapa.addLayer({
        id: `${TRACO}-casca`,
        type: 'line',
        source: TRACO,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': tinta('--map-rota-borda', '#4f8f14'), 'line-width': LARGURA_CASCA },
      });
      mapa.addLayer({
        id: `${TRACO}-fita`,
        type: 'line',
        source: TRACO,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': tinta('--map-rota', '#78c900'), 'line-width': LARGURA_FITA },
      });
    } catch (_) { /* estilo ainda trocando: a próxima passada redesenha */ }
  }

  /* o traço chega pela rede; o mapa pode nascer depois dele, e vice-versa.
     🔴 E ELE É DOS DOIS MAPAS. Isto pintava só o palco da navegação — o mapa 2D
     da aba Rota, que desde 08/08 é a TELA PRINCIPAL, ficava com os pinos soltos
     e nenhum caminho entre eles. O caminho já estava no aparelho; faltava
     desenhá-lo na tela em que o motorista olha o dia. */
  /** os dois palcos que podem ter fita: o da navegação e o da tela Rota */
  const palcosDoTraco = () => [mapaDaNavegacao(), (GARAGEM.get(PALCO) || {}).mapa].filter(Boolean);

  function pintarTraco() {
    palcosDoTraco().forEach((mapa) => quandoEstiloPronto(mapa, () => desenharTraco(mapa)));
  }

  /* 🔴 ROTA CANCELADA NÃO DEIXA RASTRO (a lei que o dono já cravou em
     [[rota-pronta-frente]]: "rastro não é posse"). A geometria mora no
     APARELHO e sobrevive ao cancelamento: sem isto o `navRota` da rota morta
     continuava valendo — a fita seguia desenhada, a bússola parada ainda
     apontava pra ela (`rumoDaRota`) e o `tracoDoPlano` a daria por boa ("já
     serve a estas paradas") na entrada seguinte da tela. */
  function esquecerTraco() {
    navRota = null;
    palcosDoTraco().forEach(apagarTraco);
  }

  /* 🔴 O FLASH DO RETRAÇO (12/08, § 6c do selo): quando o caminho novo chega
     fora do traçado, a fita respira UMA vez — sobe pra `--map-cabeca` (a mesma
     ponta acesa da cobra da abertura) e volta pra cor dela. SÓ TINTA, nas
     camadas que JÁ existem: `setPaintProperty` com transição do próprio
     maplibre. addLayer/addSource/line-gradient aqui remontaria a fonte, e
     fonte remontada é o pisca de novo. Lei 7: sem movimento, sem flash. */
  function flashDaFita() {
    if (semMovimento()) return;
    const mapa = mapaDaNavegacao();
    if (!mapa || !mapa.getLayer || !mapa.getLayer(`${TRACO}-fita`)) return;
    try {
      const clarao = tinta('--map-cabeca', '#e8f4ff');
      [`${TRACO}-fita`, `${TRACO}-casca`].forEach((id) => {
        mapa.setPaintProperty(id, 'line-color-transition', { duration: 180 });
        mapa.setPaintProperty(id, 'line-color', clarao);
      });
      setTimeout(() => {
        try {
          [[`${TRACO}-fita`, tinta('--map-rota', '#78c900')],
            [`${TRACO}-casca`, tinta('--map-rota-borda', '#4f8f14')]].forEach(([id, cor]) => {
            mapa.setPaintProperty(id, 'line-color-transition', { duration: 450 });
            mapa.setPaintProperty(id, 'line-color', cor);
          });
        } catch (_) { /* a fita saiu de cena no meio do flash: nada a devolver */ }
      }, 220);
    } catch (_) { /* mapa trocando de estilo: fica sem flash, nunca sem fita */ }
  }

  /* ---- O 2D TAMBÉM TEM DIREITO DE PEDIR O CAMINHO ------------------------
     🔴 A ROTA PRONTA MOSTRAVA PONTOS SOLTOS (09/08). `pintarTraco` já é dos
     DOIS mapas desde 08/08, mas quem enche o `navRota` (e com ele a
     `geometria`) era só a tela de DIRIGIR: `pedirRota` só era chamado no
     `aoMover` e no `ir`, os dois travados em `telaAtual()==='mapa'`. Resultado
     na tela principal: o dono monta a rota, abre o mapa 2D e vê seis pinos
     numerados sem nada ligando um ao outro — o caminho só nascia depois de ele
     começar a dirigir.

     🔴 E ELE PEDE PELA MESMA PORTA. Nada de um segundo pedido de rota: é o
     `pedirRota` de sempre, com o teto do dia (`NAV_TETO_DIA`), o um-em-voo
     (`navPedindo`), o piso de 15 s e o backoff por falha. Rota é API PAGA —
     dois caminhos de pedido são duas contas, e só uma tem freio.

     🔴 UMA VEZ POR ENTRADA NA TELA, e é isto que o bilhete guarda. O mapa 2D
     não tem manobra pra recalcular: o traço dele é o mesmo o dia inteiro,
     então repetir a cada fix seria a tela Rota queimando pedido parada na
     garagem. O bilhete é GASTO na primeira tentativa de verdade, dê ou não dê:
     pedido recusado por um dos freios devolve a tela de hoje (os pinos, sem
     caminho), e enfeite que falha não vira laço (§ "enfeite lento não derruba
     a tela"). */
  let planoQuerTraco = false;

  function tracoDoPlano() {
    if (!planoQuerTraco || telaAtual() !== 'rota') return;
    /* 🔴 E SEM ROTA MONTADA NÃO SE PEDE CAMINHO (§ rotaMontada). Aqui isso é
       DINHEIRO: pedir ao roteador o caminho de uma agenda que ninguém montou é
       pagar por um traço que a régua do mapa vai recusar a desenhar. O
       bilhete FICA — quem montar a rota e voltar pra cá o gasta. */
    if (!rotaMontada()) return;
    /* Sem fix do GPS, ou sem parada com pino, não há o que pedir — e aí o
       bilhete FICA armado: numa garagem o 1º fix demora, e é ele que volta
       aqui sozinho (`aoFix`). */
    const coords = coordenadasDaNavegacao();
    if (!coords) return;
    planoQuerTraco = false;
    /* A MESMA régua que o `pedirRota` usa pra saber se a rota virou outra: as
       paradas SEM a origem. Traço que já serve a estas paradas não se repede —
       quem voltou de dirigir traz o caminho no bolso. */
    const alvos = coords.split(';').slice(1).join(';');
    if (navRota && navRota.geometria && navRota.alvos === alvos) { pintarTraco(); return; }
    pedirRota();
  }

  /* ---- 7d-bis. A DESCIDA: 2D → 3D, o efeito do V4 -------------------------
     🔴 O QUE ESTAVA FALTANDO (cena do dono, 08/08: *"a rota do antes e do
     depois, parece q foi removida"*). O `gps-ruas-prospector-v4.html` abre a
     navegação com UM movimento só, e é o espetáculo da tela:

         "O 2D é o mesmo mapa com inclinação 0°, norte pra cima e zoom aberto;
          o 3D é ele com 51°, rumo pra cima e zoom fechado. A DESCIDA é a
          inclinação, o zoom e a âncora ANDANDO — 2,4 s de movimento contínuo."

     O app não descia NADA. A câmera ia direto pro 3D no `load` do mapa, atrás
     do véu da cena; quando a cobra terminava e o véu abria, o mapa real já
     estava deitado. O motorista via um corte, não uma descida — e um corte
     entre um mapa desenhado de cima e um mapa de verdade já em perspectiva é
     exatamente o "efeito bosta".

     Aqui a descida volta, no MAPA DE VERDADE e sem tocar no desenho:

       1. VISTA DE CIMA — entrando na navegação a câmera é posta em pé
          (`pitch 0`, norte pra cima, zoom aberto) POR BAIXO da cena da cobra.
          Isso é de propósito: quando o véu abre, o mapa real está na MESMA
          pose do mapa desenhado que acabou de sair. A troca deixa de ser um
          corte e vira uma continuação.
       2. A DESCIDA — 2,4 s de `easeTo` levando inclinação, zoom e rumo até a
          pose de dirigir, com a MESMA curva do V4 (`suave`, cúbica nas duas
          pontas). Um movimento só, contínuo, sem véu e sem troca de peça.
       3. DIRIGINDO — a câmera de sempre, seguindo o motorista.

     🔴 A CÂMERA MORA NO MOTORISTA NAS DUAS VISTAS — é a correção que o V4
     documenta com o preço dela ("o ponteiro MERGULHAVA pra fora da tela e
     voltava"). Por isso o `offset` do puck é o MESMO nas três fases: só
     inclinação, zoom e rumo andam. O ponteiro não sai do lugar um quadro.

     🔴 UM DONO SÓ DA CÂMERA, e continua sendo esta função: durante a descida
     ela NÃO manda passo nenhum (o `easeTo` da descida está no ar e dois
     comandos brigando é a tela pinotando). Ela só segue aparando a fita, que é
     de graça e tem que continuar saindo da seta. */
  /* 🔴 2400 → 1800 (09/08). A coreografia inteira do toque no "Navegar" foi
     MEDIDA na bancada e dava 6,8 s até a tela virar GPS: 2,3 s de cena + 1,9 s
     de tela parada + 2,4 s de descida. Ninguém que aperta "Navegar" está
     pedindo sete segundos de espetáculo — ele está pedindo a rua. Os 1,8 s
     continuam sendo movimento (o corte, que é o que o V4 mata, seria zero) e
     agora fecham a entrada inteira em ~3,3 s. */
  const DESCIDA_MS = 1800;
  /* 🔴 A VISTA DE CIMA É A MOLDURA DA ROTA (08/08 — dono: "não mostra o mapa
     2d antes do 3d"). Ela era um DEGRAU FIXO de 1,8 nível, e o degrau tinha
     uma razão boa: dia real abre 8 km numa parada e 200 m na seguinte, e a
     mesma cena viraria foguete numa e cochilo na outra. A razão continua de
     pé — por isso o enquadramento vem CAPADO DOS DOIS LADOS: `cameraForBounds`
     da rota, e o zoom que sair dali é apertado entre um piso e um teto. O
     motorista vê o máximo de dia que dá pra ver, e a descida leva sempre o
     mesmo tempo.

     🔴 E ela agora FICA NA TELA. Antes existia só como pose de partida, atrás
     do véu da cena: tecnicamente havia 2D, na prática ninguém via — que é
     exatamente a queixa. `GERAL_MS` é quanto ela fica visível DEPOIS que a
     cena sai, antes de a descida começar. */
  const GERAL_ZOOM_TETO = NAV_ZOOM - 1.2;
  /* o piso deixou de ser freio de tile (a câmera não sai mais de cima do
     motorista, então não há região nova pra baixar) e virou só o limite de
     bom senso: abaixo disso a rota vira um risco e o mapa, um borrão. */
  const GERAL_ZOOM_PISO = 9.5;
  /* 🔴 2200 → 400 (09/08). Estes 2,2 s eram "tempo de leitura" da vista de
     cima — e MEDIDO na bancada eram 1,9 s de tela PARADA no meio da entrada,
     justamente onde os prédios do prospector ficavam mais visíveis (a tela sem
     movimento é onde o olho vai procurar o que se mexe). A vista de cima agora
     é lida DURANTE a cena das ruas, que dura 1,06 s e acontece nela: o que
     falta depois é só o respiro entre um movimento e o outro.
     🔴 E COM A FILA (17/08) ELE VIROU EXATAMENTE ISSO: A RESPIRAÇÃO DELA. É o vão
     entre a fase 2 (`ruas`, que fecha na última onda) e a fase 3 (`descida`) —
     o único lugar do roteiro em que nada se move, e é de propósito. O dono pediu
     *"um pouco mais devagar, um pouco mais organizado"*: organizado é isto, uma
     coisa por vez com um respiro entre elas, não a mesma pressa embaralhada. */
  const GERAL_MS = 400;
  /* a curva do V4, `suave` — cúbica nas duas pontas: sai devagar, ganha corpo
     no meio e assenta sem batida. É ela que faz "descer" em vez de "cortar". */
  const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (((-2 * t) + 2) ** 3) / 2);

  /* 'cima' = a moldura da rota, na tela · 'descendo' = o easeTo de 2,4 s está
     no ar · 'dirigindo' = a câmera de sempre · 'solta' = O DEDO É O DONO.

     🔴 'solta' É O ESTADO QUE FALTAVA (dono: "se vc movimenta o mapa, a seta
     fica travada"). Não existia jeito nenhum de a câmera calar a boca: o
     `easeTo` do próximo fix — e vem um por segundo — desfazia o arrasto no
     meio do gesto. MEDIDO no g15 antes do conserto: 2 s de arrasto, ZERO px
     de mundo andado. Todo mapa de rua do mercado tem esse estado; o nosso
     não tinha. */
  let camFase = 'dirigindo';
  let vigiaCena = null;
  let geralTimer = null;
  let voltaTimer = null;
  /* pose da moldura, calculada UMA vez por entrada: recalcular a cada fix
     faria a vista de cima tremer de leve enquanto o motorista a olha. */
  let poseGeral = null;
  /* 🔴 O DEDO NÃO SEGURA O MAPA PRA SEMPRE. Sem volta automática, quem
     encostou sem querer dirige o resto do dia com a câmera parada num
     quarteirão que ficou pra trás. 12 s é o repouso padrão do mercado. */
  const VOLTA_MS = 12000;
  /* (`emCena` mudou de casa em 17/08: ela é a pergunta "a casca abriu véu?" e
     agora quem a faz é a FILA — mora em `50-cena-ruas`, ao lado da cena.) */
  /* a cidade ainda está nascendo no mapa de dirigir? (§ 7a-bis, motivo 'navegar')
     🔴 A PERGUNTA ERA OUTRA (16/08). O comentário sempre prometeu medir "a
     cidade ainda está nascendo"; o código media "o objeto `cena` ainda existe" —
     e entre uma coisa e outra correm o assentamento de COR (420 ms por onda) e a
     saída da cena, que a própria casa declara invisíveis ("o que sobra é a linha
     da rua trocando de cor por baixo dela, que ninguém vê", 50-cena-ruas.js:338).
     MEDIDO: ~940 ms de descida represada esperando um efeito que ninguém enxerga.
     `mundoVoltou` é a marca que a CENA já levanta no instante em que a última
     onda partiu — quem decide quando a cidade nasceu passa a ser ela. */
  const cenaDasRuasNoAr = () => !!(cena && cena.casa && cena.casa.nome === PALCO && !cena.mundoVoltou);

  /* 🔴 A CÂMERA PERGUNTA PRA TELA ONDE A SETA ESTÁ (11/08). Ela guardava uma
     CÓPIA da âncora do desenho (`0.86`, o mesmo número que o mock escrevia em
     `top:86%`) — dois lugares dizendo a mesma coisa, e o próprio comentário
     antigo lembrava do dia em que eles discordaram e a câmera passou a mirar um
     palmo acima da seta. Agora o mock pousa a seta no `--gps-piso`, que é
     PIXEL contado a partir do rodapé: não existe fração pra copiar, e mesmo que
     existisse ela mudaria com a altura do aparelho.
     Então a fração se MEDE: onde o `.gps-puck` está dentro do palco do mapa.
     Vale porque `.mapa-palco`/`.mapa-vivo` são `inset:0` dentro do `.gps` — o
     palco e a tela têm a mesma altura, e o puck tem tamanho 0, então o retângulo
     dele É o ponto do motorista.
     🔴 SOLTA, NÃO SE MEDE: ali o puck deixou de ser posição de TELA e virou
     posição de MAPA (`sincronizarPuckSolto` escreve `--px/--py`), então o que
     se leria seria a projeção do ponto, não a âncora. A câmera nem anda nessa
     fase; a guarda existe pra ela não voltar torta no `voltarASeguir`. */
  const ANCORA_MIN = 0.3;
  const ANCORA_MAX = 0.99;
  const ancoraDoPuck = (mapa) => {
    try {
      const caixa = mapa && mapa.getContainer && mapa.getContainer();
      const puck = naCamada('.gps-puck');
      if (!caixa || !puck) return NAV_ANCORA;
      const gps = puck.closest('.gps');
      if (gps && gps.classList.contains('solta')) return NAV_ANCORA;
      const rc = caixa.getBoundingClientRect();
      if (!rc.height) return NAV_ANCORA;
      const f = (puck.getBoundingClientRect().top - rc.top) / rc.height;
      // fora da faixa = o puck não está onde deveria (tela trocando, palco
      // estacionado off-screen): o número de reserva erra menos que ele.
      return (f > ANCORA_MIN && f < ANCORA_MAX) ? f : NAV_ANCORA;
    } catch (_) { return NAV_ANCORA; }
  };

  /** o encaixe do puck é o mesmo nas três fases — por isso mora sozinho aqui */
  const recuoDoPuck = (mapa) => {
    const alto = (mapa.getContainer && mapa.getContainer().clientHeight) || 0;
    // -0,5 porque o `offset` do maplibre parte do CENTRO do palco, não do topo
    return [0, alto ? alto * (ancoraDoPuck(mapa) - 0.5) : 0];
  };

  /* 🔴 O 2D MOSTRA A ROTA INTEIRA — ordem do dono (09/08: "2d = todas rotas"),
     e é exatamente o que o V4 faz. O truque que eu tinha perdido está no
     `K2D` dele: **a câmera NÃO se muda pro meio do percurso, ela fica no
     MOTORISTA e só ABRE o zoom até a rota caber acima dele**. A diferença não
     é estética, é de funcionamento — a 1ª tentativa enquadrou a rota com
     `cameraForBounds`, a câmera pulou 30 km pro centro de um dia de 63,9 km e
     o mapa passou ~15 s CINZA baixando tile de uma região onde o motorista nem
     estava (medido no g15, APK 196). Ancorada nele, os tiles são os do lugar
     onde ele já está e só ficam mais grossos conforme abre.

     Devolve a maior distância, em metros, do motorista até um ponto da rota. */
  function alcanceDaRota() {
    const eu = posicaoDaTela();
    if (!eu) return 0;
    const kx = 111320 * Math.cos((eu.lat * Math.PI) / 180);
    let maior = 0;
    const medir = (lng, lat) => {
      const d = Math.hypot((lng - eu.lng) * kx, (lat - eu.lat) * 110540);
      if (d > maior) maior = d;
    };
    const geo = navRota && navRota.geometria;
    if (geo && Array.isArray(geo.coordinates)) {
      geo.coordinates.forEach((c) => {
        if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) medir(c[0], c[1]);
      });
    }
    if (!maior) {
      const paradas = (typeof PARADAS !== 'undefined' ? PARADAS : []) || [];
      paradas.forEach((p) => {
        const la = Number(p.lat); const ln = Number(p.lng);
        if (Number.isFinite(la) && Number.isFinite(ln)) medir(ln, la);
      });
    }
    return maior;
  }

  /* o cromo come tela: o cartão da manobra no topo e o rodapé embaixo. A rota
     tem que caber no que SOBRA, senão ela nasce por baixo da manobra. */
  const GERAL_MARGEM_TOPO = 150;
  const GERAL_MARGEM_LADO = 24;

  /* põe a câmera em pé (2D) com a rota INTEIRA acima do motorista.
     🔴 ELA É TAMBÉM A SUBIDA (16/08) — e virou uma sem ganhar código novo. O par
     do `descer()` não existia (`grep subir` = 0 no repo inteiro), e a tentação
     era escrever um: não precisa. A pose de cima já é calculada aqui, com o
     MESMO `recuoDoPuck` que a descida usa, e a curva `suave` já está pronta ali
     embaixo. O que faltava era um ARGUMENTO: com `ms > 0` esta função é o
     movimento de subir; com 0 (o padrão de todos os chamadores de hoje) ela
     continua o pulo instantâneo que o `offset` exige.
     E ela aceita o mapa por fora: na VOLTA pro 2D a camada viva já é a da rota,
     então `mapaDaNavegacao()` — que lê o palco da camada — devolve null bem na
     hora em que a subida precisa acontecer no mapa que está saindo. A garagem
     ainda o tem pelo nome, que é como `cenaAoContrario` alcança o dela. */
  function vistaGeral(ms, mapaDado) {
    const mapa = mapaDado || mapaDaNavegacao();
    if (!mapa) return;
    const eu = posicaoDaTela();
    if (!poseGeral && eu) {
      const alcance = alcanceDaRota();
      let zoom = GERAL_ZOOM_TETO;
      if (alcance > 30) {
        const caixa = (mapa.getContainer && mapa.getContainer()) || null;
        const larg = (caixa && caixa.clientWidth) || 360;
        const alt = (caixa && caixa.clientHeight) || 640;
        // espaço útil: do topo do mapa até a âncora do puck, e meia largura
        const pxAcima = Math.max(80, alt * ancoraDoPuck(mapa) - GERAL_MARGEM_TOPO);
        const pxLado = Math.max(80, larg / 2 - GERAL_MARGEM_LADO);
        const porPixel = alcance / Math.min(pxAcima, pxLado);     // metros por pixel
        const noZero = 156543.03392 * Math.cos((eu.lat * Math.PI) / 180);
        zoom = Math.log2(noZero / porPixel);
      }
      poseGeral = {
        center: [eu.lng, eu.lat],
        zoom: Math.min(GERAL_ZOOM_TETO, Math.max(GERAL_ZOOM_PISO, zoom)),
      };
    }
    if (!poseGeral) return;                     // sem fix ainda: a pose vem no próximo
    const passo = { pitch: 0, bearing: 0, offset: recuoDoPuck(mapa), ...poseGeral };
    /* 🔴 `easeTo` COM DURAÇÃO ZERO, e não `jumpTo` — porque o `jumpTo` do
       maplibre NÃO LÊ `offset` (conferido dentro do `vendor/maplibre-gl.js`: o
       corpo dele só olha zoom, center, elevation, bearing, pitch, roll e
       padding; `offset` é opção de ANIMAÇÃO, e só `easeTo`/`flyTo` a honram).
       Esta função vinha calculando o recuo do puck e o mapa jogava o número
       fora CALADO — medido no g15: o motorista caía no MEIO da tela enquanto a
       seta continuava desenhada colada no rodapé, 305px abaixo. Nos 400ms de
       vista de cima a fita verde nascia no meio do vidro, saindo do nada, e a
       descida escorregava esses 305px de tranco além do zoom e da inclinação —
       é o "dois efeitos se cruzando" e a "fita descolada da seta" que o dono já
       tinha reclamado. `duration:0` continua sendo um pulo instantâneo, e é a
       única forma de o offset valer. Com isto a promessa escrita lá em cima
       ("o offset é o MESMO nas três fases") passa a ser verdade. */
    const dur = Number(ms) > 0 ? Number(ms) : 0;
    try {
      mapa.easeTo(dur ? { ...passo, duration: dur, easing: suave } : { ...passo, duration: 0 });
    } catch (_) { /* mapa saindo de cena */ }
  }

  /* o movimento: inclinação, zoom e rumo andando juntos.
     🔴 A DURAÇÃO E O MAPA ENTRAM POR FORA (16/08), pelo mesmo motivo que já
     valia pro `vistaGeral`: a VOLTA da Panorâmica é a mesma descida com outro
     tempo (700 ms, o gesto) e acontece no mapa que ainda está sendo
     transplantado — `mapaDaNavegacao()` lê o palco da camada e devolveria null
     bem na hora. Sem argumento, é a entrada de sempre. */
  function descer(ms, mapaDado) {
    const mapa = mapaDado || mapaDaNavegacao();
    /* 🔴 A DESCIDA DA FILA É A QUE NÃO PEDE DURAÇÃO (17/08). Esta função serve
       dois donos: a ENTRADA na rota (sem argumento, 1,8 s — é a fase 3 da fila do
       montar) e o GESTO da Panorâmica (`descer(TROCA_MS, mapa)`, 700 ms,
       § 45-troca-de-modo). O gesto tem coreografia PRÓPRIA na casca
       (`modo-troca`/`troca-desce`) e o cromo dele acabou de entrar de cima:
       marcar `descida` ali esconderia justamente a peça que o gesto mostra. */
    const daFila = !(Number(ms) > 0);
    if (!mapa || telaAtual() !== 'mapa') {
      camFase = 'dirigindo';
      /* sem mapa (ou já fora da tela de dirigir) não existe descida pra esperar:
         a fila fecha AQUI, senão o cromo ficaria invisível pelo resto do dia. */
      if (daFila) faseDaCena('pronto');
      return;
    }
    camFase = 'descendo';
    poseGeral = null;               // a próxima entrada remede a moldura do dia
    const dur = Number(ms) > 0 ? Number(ms) : DESCIDA_MS;
    const passo = {
      zoom: NAV_ZOOM, pitch: NAV_PITCH, offset: recuoDoPuck(mapa),
      duration: dur, easing: suave,
    };
    const eu = posicaoDaTela();
    if (eu) passo.center = [eu.lng, eu.lat];
    const rumo = rumoDaTela();
    if (rumo != null) passo.bearing = rumo;
    try { mapa.easeTo(passo); } catch (_) { camFase = 'dirigindo'; if (daFila) faseDaCena('pronto'); return; }
    // a fase entra com o movimento JÁ mandado: anunciar antes seria a casca
    // vestindo uma descida que o mapa podia recusar (estilo trocando, mapa morto).
    if (daFila) faseDaCena('descida');
    // o relógio é o dono do fim, não o evento do mapa: `moveend` não chega se
    // o dedo arrastar o mapa no meio, e a câmera ficaria presa em "descendo".
    setTimeout(() => {
      if (camFase === 'descendo') camFase = 'dirigindo';
      /* 🔴 *"AO CONCLUIR APARECEM OS BOTÕES"* — a ordem do dono, na letra. Quem
         já era dono do fim da descida é este relógio (o `moveend` não chega se o
         dedo pegar o mapa no meio), então é ele que fecha a fila. Um segundo
         relógio pra dizer a mesma coisa é o jeito clássico de os dois
         discordarem no aparelho lento. */
      if (daFila) faseDaCena('pronto');
    }, dur + 80);
  }

  /* A cena da cobra dura até 2,2 s e a marca `cena` cai no relógio do mock —
     que a ponte não pode escutar (a camada é TROCADA a cada repinte, então
     guardar o nó não serve). Uma espiada de 90 ms por até 3 s resolve, custa
     nada e morre sozinha. Sem cena nenhuma (o app abrindo direto na navegação)
     a descida começa na hora: o efeito é o mesmo, só não tem cobra antes. */
  function entrarNaDescida() {
    /* 🔴 ENTRAR É UM VERBO SÓ, E ELE JÁ ESTAVA SENDO DITO DUAS VEZES. O toque
       do "Navegar" passa pelo `ir` (que chama isto) e a troca de tela passa
       pelo observador (que chama isto de novo, uma microtarefa depois) — as
       duas portas existem de propósito, porque o app também pode SUBIR direto
       na tela de dirigir. O que não podia é a segunda desmanchar a primeira:
       MEDIDO no maplibre, no clique, `jumpTo` em t=31 ms e outro em t=37 ms, e
       o vigia da cena recomeçando do zero no meio. Entrar de novo em quem já
       está entrando não é entrar — é gaguejar. */
    if (camFase === 'cima' && (vigiaCena || geralTimer)) return;
    if (vigiaCena) { clearInterval(vigiaCena); vigiaCena = null; }
    if (geralTimer) { clearTimeout(geralTimer); geralTimer = null; }
    camFase = 'cima';
    /* 🔴 ENTRAR NA NAVEGAÇÃO É A CIDADE NASCENDO NO MAPA DE VERDADE (09/08, no
       lugar da cobra). Pedido aqui e não no `ir` porque esta função é a porta
       única do "entrei na tela de dirigir" — vale pro toque do Navegar e pro
       app que sobe direto nela. Quem toca é o transplante, quando o palco do
       gps aparece: cena em palco fora da tela é cena que ninguém vê. */
    pedirCena('navegar');
    poseGeral = null;
    vistaGeral();
    const desistirEm = Date.now() + 3000;
    vigiaCena = setInterval(() => {
      if (camFase !== 'cima' || telaAtual() !== 'mapa') {
        clearInterval(vigiaCena); vigiaCena = null;
        if (telaAtual() !== 'mapa') camFase = 'dirigindo';
        return;
      }
      /* 🔴 A DESCIDA ESPERA A FILA, NÃO A CASCA (17/08). Ela esperava a marca
         `cena` da CAMADA (`emCena`) — e essa marca agora acompanha a fila
         INTEIRA (véu + ruas + descida + cromo), então esperar por ela seria a
         descida esperando por si mesma: represaria a fase 3 pra sempre e o teto
         de 3 s viraria o caminho normal.
         E não pode esperar SÓ `cenaDasRuasNoAr`: com o pedido de cena ainda na
         fila (tile por chegar) não existe objeto `cena` nenhum, a resposta seria
         "pode descer" e a câmera andaria ANTES das ruas — o cruzamento que esta
         leva inteira existe pra matar.
         A pergunta certa é a FASE: a descida é a 3, e a 3 espera a 1 e a 2.
         O `emCena() && !cenaFase` cobre o vão em que a casca já abriu o véu e a
         cena ainda não foi aceita (transplante que não veio na mesma passada). */
      const filaNaFrente = cenaFase === 'escurece' || cenaFase === 'ruas'
        || (emCena() && !cenaFase) || cenaDasRuasNoAr();
      if (filaNaFrente) {
        if (Date.now() < desistirEm) return;
        /* 🔴 QUEM DESISTE, DESISTE POR TODOS (17/08). Vencidos os 3 s a cena não
           manda mais na tela — é a lei de 09/08 ("a cena não espera o mapa") — e
           isso vale pra fila INTEIRA: descer com ela presa em `escurece` (tile que
           não chegou) deixaria o cromo invisível pelo resto do roteiro, porque a
           fase 3 nunca ia poder anunciar o fim de uma fase 2 que não aconteceu.
           Dois relógios de desistência com números diferentes é exatamente como
           eles discordam no aparelho lento. */
        faseDaCena('pronto');
      }
      clearInterval(vigiaCena); vigiaCena = null;
      // 🔴 A CENA SAIU: SÓ AGORA A VISTA DE CIMA É VISÍVEL. Descer aqui era o
      // defeito — a moldura vivia inteira atrás do véu e o motorista só via o
      // 3D pronto. O tempo de leitura começa quando a tela abre, não antes.
      geralTimer = setTimeout(() => {
        geralTimer = null;
        if (camFase === 'cima') descer();
      }, GERAL_MS);
    }, 90);
  }

  /* corta a descida e devolve a câmera pra quem dirige (dedo, ou troca de tela)
     🔴 SAIR TAMBÉM É UM GESTO (16/08 — dono: *"reverso bem feito sem travação
     alguma"*). Esta função era quatro linhas de `clearTimeout`: a ida tinha uma
     coreografia inteira e a volta tinha um cancelamento. Agora ela é o PAR da
     entrada, com as peças que já existiam:
     · manda a SUBIDA no mapa 3D — que continua vivo e renderizando dentro da
       `.tela.sai` durante os 520 ms do gesto de camada (medido: `estacionarMapas`
       só o recolhe DEPOIS da remoção). Ele é alcançado pela GARAGEM porque
       `mapaDaNavegacao()` lê o palco da camada VIVA, e na volta a camada viva já
       é a da rota — do jeito que `cenaAoContrario` alcança o mapa dela.
     · desarma o `voltaTimer` e o estado `solta`, que a entrada arma e a saída
       esquecia. Sem isto, arrastar o mapa 3D → Panorâmica → Dirigindo dentro dos
       12 s fazia o `voltarASeguir` disparar no meio da fase 'cima' e cravar
       'dirigindo': a descida seguinte nascia morta. */
  function pararDescida(msSubida) {
    if (vigiaCena) { clearInterval(vigiaCena); vigiaCena = null; }
    if (geralTimer) { clearTimeout(geralTimer); geralTimer = null; }
    if (voltaTimer) { clearTimeout(voltaTimer); voltaTimer = null; }
    /* 🔴 CORTAR A DESCIDA FECHA A FILA (17/08). No caminho normal quem devolve o
       cromo é a fase 3; se ela NÃO vai acontecer — dedo, troca de tela, gesto de
       modo por cima da cena — quem fecha é quem cortou. Sem isto o cromo ficava
       esperando o teto de socorro (5,2 s) por um `easeTo` que ninguém ia mandar,
       e cromo preso invisível é o pior desfecho desta tela. Fora de fila isto é
       uma linha morta: `faseDaCena` só escreve com fila aberta. */
    faseDaCena('pronto');
    if (Number(msSubida) > 0) {
      const casa = GARAGEM.get(PALCO);
      if (casa && casa.mapa) { poseGeral = null; vistaGeral(Number(msSubida), casa.mapa); }
    }
    marcarSolta(false);
    poseGeral = null;
    camFase = 'dirigindo';
  }

  /* ---- O DEDO NA CÂMERA ---------------------------------------------------
     🔴 A SETA PREGADA NO VIDRO. Seguindo, o puck é DESENHO parado logo acima do
     rodapé (o `--gps-piso` do mock) e quem gira é o mundo — é o certo, é o que o V4 promete e é uma seta
     só. Com o dedo levando o mapa embora, esse mesmo desenho vira mentira: a
     seta fica no meio da tela apontando pra um lugar onde o motorista não
     está.

     Então, solta, ela troca de sistema de coordenadas: deixa de ser posição de
     TELA e passa a ser posição de MAPA, projetada a cada quadro. **É o mesmo
     mecanismo do `posicionarEmpresas`** — que já roda nesta tela e é a peça
     mais provada daqui. Uma 1ª tentativa plantou um `maplibregl.Marker` com um
     clone da seta dentro: não apareceu na tela e falhou CALADA (o `catch`
     zerava o marcador e seguia). Mecanismo novo pra problema que o app já sabe
     resolver é um jeito caro de inventar um bug. */
  function marcarSolta(solta) {
    const gps = naCamada('.gps');
    if (gps) gps.classList.toggle('solta', !!solta);
    if (!solta) {
      const puck = naCamada('.gps-puck');
      if (puck) {
        puck.style.removeProperty('--px');
        puck.style.removeProperty('--py');
        puck.style.removeProperty('transform');
      }
    }
  }
  function sincronizarPuckSolto(ligado) {
    if (!ligado) return;
    const mapa = mapaDaNavegacao();
    const puck = naCamada('.gps-puck');
    if (!mapa || !puck) return;
    const eu = posicaoDaTela();
    if (!eu) return;
    // a marca vive na camada VIVA, e o repinte troca a camada: reafirmar aqui
    // (e não só no toque) é o que mantém a seta no chão depois de um repinte.
    const gps = puck.closest('.gps');
    if (gps && !gps.classList.contains('solta')) gps.classList.add('solta');
    let ponto;
    try { ponto = mapa.project([eu.lng, eu.lat]); } catch (_) { return; }
    puck.style.setProperty('--px', `${ponto.x.toFixed(1)}px`);
    puck.style.setProperty('--py', `${ponto.y.toFixed(1)}px`);
    /* 🔴 O RUMO AGORA É RELATIVO À TELA. Seguindo, a câmera gira junto com o
       motorista e a seta aponta pra cima sempre; solta, o mapa ficou parado no
       rumo que estava — então o bico tem que compensar a diferença, senão ele
       aponta pro norte da tela em vez da rua dele. */
    const rumo = rumoDaTela();
    let bussola = 0;
    try { bussola = mapa.getBearing() || 0; } catch (_) { bussola = 0; }
    if (rumo != null) puck.style.transform = `rotate(${(rumo - bussola).toFixed(1)}deg)`;
  }

  /** o dedo pegou o mapa: a câmera cala a boca até ele desistir ou pedir volta */
  function soltarCamera() {
    if (telaAtual() !== 'mapa') return;
    if (vigiaCena) { clearInterval(vigiaCena); vigiaCena = null; }
    if (geralTimer) { clearTimeout(geralTimer); geralTimer = null; }
    camFase = 'solta';
    marcarSolta(true);
    sincronizarPuckSolto(true);
    if (voltaTimer) clearTimeout(voltaTimer);
    voltaTimer = setTimeout(voltarASeguir, VOLTA_MS);
  }

  /** volta a seguir o motorista — pelo botão, ou sozinho depois do repouso */
  function voltarASeguir() {
    if (voltaTimer) { clearTimeout(voltaTimer); voltaTimer = null; }
    if (geralTimer) { clearTimeout(geralTimer); geralTimer = null; }
    poseGeral = null;
    camFase = 'dirigindo';
    marcarSolta(false);
    sincronizarPuckSolto(false);
    cameraDaNavegacao();
  }

  function cameraDaNavegacao() {
    if (telaAtual() !== 'mapa') return;
    const mapa = mapaDaNavegacao();
    if (!mapa) return;
    // a fita é aparada A CADA FIX pra continuar saindo da seta — nas três
    // fases, inclusive descendo: ela é desenho de fonte, não movimento de câmera
    if (navRota && navRota.geometria) {
      if (mapa.getSource(TRACO)) desenharTraco(mapa); else pintarTraco();
    }
    // durante a descida a câmera tem dono: o `easeTo` de 2,4 s
    if (camFase === 'descendo') return;
    // 🔴 E COM O DEDO NA TELA O DONO É ELE. Este `return` é o conserto do
    // "arrasta e não anda": sem ele, o fix seguinte (1 por segundo) reescrevia
    // a câmera por cima do gesto. A seta segue viva — mas no CHÃO, não no
    // vidro (`sincronizarPuckSolto`), senão ela mentiria a posição.
    if (camFase === 'solta') { sincronizarPuckSolto(true); return; }
    // 🔴 A VISTA DE CIMA NÃO ESPERA GPS. Ela é a POSE de partida da descida, e
    // o mapa pode chegar na tela antes do primeiro fix (na garagem ele demora).
    // Sem isto o mapa da garagem — estacionado deitado — abria já em 3D e a
    // descida descia de lugar nenhum.
    if (camFase === 'cima') { vistaGeral(); return; }
    if (!ultimoFix) return;
    // a câmera segue a posição PRESA NA RUA: com o fix cru ela tremia parada
    const eu = posicaoDaTela();
    const passo = {
      center: [eu.lng, eu.lat],
      zoom: NAV_ZOOM,
      pitch: NAV_PITCH,
      offset: recuoDoPuck(mapa),
      duration: 900,
    };
    // 🔴 A MESMA bússola da tela (§ rumoDaTela): andando é o aparelho, parado é
    // a ROTA. Deixar só o `rumoConfiavel` aqui era o que mantinha o mapa
    // norte-acima com a fita atravessando a tela — a bússola dizia uma coisa e
    // a câmera fazia outra. Sem rumo nenhum (fora da rota) NÃO gira.
    const rumo = rumoDaTela();
    if (rumo != null) passo.bearing = rumo;
    /* 🔴 REMANDAR A CÂMERA PRO LUGAR ONDE ELA JÁ ESTÁ INDO É UM SOLAVANCO. O
       `easeTo` não continua o movimento anterior: ele COMEÇA OUTRO, do ponto em
       que a interpolação estava, e com os 900 ms de novo. Com o carro parado no
       farol (o GPS balança metro pra cá, metro pra lá) isso era um easeTo por
       segundo pra ficar no mesmo lugar — a tremida que o dono lê como "pisca".
       Nada mudou de verdade? não se manda nada. */
    if (mesmaPose(mapa, passo)) return;
    try { mapa.easeTo(passo); } catch (_) { /* mapa saindo de cena */ }
  }

  /** true = a câmera já está (ou já vai) nesta pose — dentro do que o olho vê */
  const POSE_METRO = 1.5;      // o tremor do GPS parado
  const POSE_GRAU = 1;         // 1° de bússola não vira pixel nenhum
  function mesmaPose(mapa, passo) {
    let c; let z; let p; let b;
    try {
      c = mapa.getCenter(); z = mapa.getZoom(); p = mapa.getPitch(); b = mapa.getBearing();
    } catch (_) { return false; }
    if (!c || Math.abs(z - passo.zoom) > 0.01 || Math.abs(p - passo.pitch) > 0.5) return false;
    if (passo.bearing != null) {
      let dif = Math.abs(b - passo.bearing) % 360;
      if (dif > 180) dif = 360 - dif;
      if (dif > POSE_GRAU) return false;
    }
    return metrosEntre({ lat: c.lat, lng: c.lng }, { lat: passo.center[1], lng: passo.center[0] }) <= POSE_METRO;
  }

  /* 🔴 UM QUADRO = UMA ORDEM DE CÂMERA. São QUATRO portas que mandam a câmera
     se acertar (o fix, o transplante do mapa, o nascimento dele e a volta do
     dedo), e no fix elas coincidem: MEDIDO no maplibre, `jumpTo`/`easeTo` DOIS
     no mesmo milissegundo, uma vez por segundo, o segundo reiniciando a
     interpolação do primeiro. É a mesma cura do `acompanharCamera`: o rAF
     junta o que caiu no mesmo quadro numa ordem só. */
  let camQuadro = false;
  function pedirCamera() {
    if (camQuadro) return;
    camQuadro = true;
    requestAnimationFrame(() => { camQuadro = false; cameraDaNavegacao(); });
  }
