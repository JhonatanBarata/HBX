  /* ------------------------------------------------------------------------
     7b — A TROCA DE MODO: 3D ⇄ 2D EM UM MOVIMENTO SÓ (16/08).

     Dono, com o aparelho na mão: *"clicar em panorâmica trava tudo, faça um
     efeito bem feito! entregue algo q não seja uma travação nojenta"* e
     *"visual 2d: deve aproximar, e acompanhar bem feito — mas cadê os pontos,
     os 'V'? as numerações?"*.

     🔴 A CAUSA, MEDIDA NO g15 (gravação de 20 quadros/s, APK 284): a troca não
     tinha movimento NENHUM. São DOIS mapas (o palco 'gps' e o palco 'geral',
     cada um com maplibre próprio e câmera própria) e a Panorâmica trocava a
     TELA: o mapa que saía dava uma subida de 520 ms dentro da camada que já
     estava sumindo — invisível — e o mapa que entrava aparecia na câmera em que
     estava parado desde a última vez, o dia inteiro visto de longe. Na
     gravação: 3 quadros de tela igual, um quadro de mistura, tela nova. Corte
     seco. "Travação" é o nome certo pro que se vê: nada se move, e de repente é
     outro lugar.

     A cura é uma frase só: **quem entra começa na pose de quem saiu.** Com os
     dois mapas na mesma pose, o cruzamento das camadas deixa de ser corte (as
     duas pintam a MESMA imagem) e o movimento inteiro passa a acontecer no mapa
     que entra — que é o que fica na tela. Nenhum efeito novo nasceu aqui: a
     subida é o `easeTo` que o enquadramento já mandava (agora com duração), e a
     descida é o `descer()` de sempre (agora com duração própria).

     🔴 E A VOLTA DEIXOU DE SER UMA ENTRADA. `Dirigindo` caía em
     `entrarNaDescida`, a coreografia de quem chega na navegação pela primeira
     vez: cena das ruas nascendo + 400 ms de vista de cima + 1,8 s de descida.
     MEDIDO no g15: 3 s parado na vista de cima antes de a câmera se mexer.
     Voltar da Panorâmica não é entrar na rota — é a mesma exceção que
     'venda'/'folha' já tinham, e pelo mesmo motivo: a cidade já nasceu.
     ------------------------------------------------------------------------ */
  /* 700 ms e não os 1.800 da entrada: a entrada é um espetáculo de uma vez por
     rota, a troca de modo é um gesto que o motorista repete na rua. O gesto de
     camada dura 520 (`--mv-cheio`) e a câmera termina LOGO DEPOIS dele — assim o
     mundo ainda está se mexendo quando a camada assenta, e os dois leem como um
     movimento só em vez de dois eventos emendados. */
  const TROCA_MS = 700;

  /* 🔴 A "POSE DA TROCA" MORREU E ISSO É A CURA, NÃO UMA PERDA (16/08). Ela
     existia pra copiar a câmera de um mapa no outro — remendo de um problema
     que só existia porque eram dois. Com um palco só a continuidade é de
     graça: a imagem na tela é a mesma antes e depois do toque. */
  function poseDoMapa(mapa) {
    try {
      const c = mapa.getCenter();
      return {
        center: [c.lng, c.lat], zoom: mapa.getZoom(),
        bearing: mapa.getBearing(), pitch: mapa.getPitch(),
      };
    } catch (_) { return null; }
  }

  /* ---- A MOLDURA DO 2D, SEPARADA DE QUEM A APLICA ---------------------------
     Devolve a pose (centro + zoom) que põe o dia inteiro na tela, ou null quando
     não há um ponto sequer. `cameraForBounds` é a conta que o `fitBounds` faz
     por dentro — usá-la direto é o que permite ANIMAR até ela em vez de só pular
     (o `fitBounds` deleta o padding e manda sozinho). E ela é medida com o mapa
     ainda DEITADO: pedir moldura com o mapa inclinado devolveria zoom de uma
     perspectiva que a tela de planejar não tem. */
  function molduraDeCaixa(casa, pontos, teto) {
    if (!pontos.length) return null;
    if (pontos.length === 1) return { center: pontos[0], zoom: Math.min(15, teto) };
    const o = pontos[0].slice(); const n = pontos[0].slice();
    pontos.forEach((c) => {
      o[0] = Math.min(o[0], c[0]); o[1] = Math.min(o[1], c[1]);
      n[0] = Math.max(n[0], c[0]); n[1] = Math.max(n[1], c[1]);
    });
    try {
      const cam = casa.mapa.cameraForBounds([o, n], {
        padding: PLANO_PAD, maxZoom: teto, bearing: 0,
      });
      if (cam && cam.center) return { center: cam.center, zoom: cam.zoom };
    } catch (_) { /* mapa saindo de cena */ }
    return null;
  }

  function molduraDoPlano(casa) {
    // a MESMA lista dos pinos (§ paradasDoMapa): sem rota montada ela vem
    // vazia, e a moldura passa a ser só o motorista — enquadrar uma rota que
    // ninguém montou levaria a câmera pra um dia que não existe.
    const pontos = paradasDoMapa().map((p) => [Number(p.lng), Number(p.lat)]);
    // mesma régua das paradas (§ paradasDoMapa): fix zerado é ponto no oceano,
    // e um só deles estica a moldura do dia inteiro pra outro continente.
    const eu = ultimaPos || ultimoFix;
    if (eu && pinoValido(eu.lat, eu.lng)) pontos.push([eu.lng, eu.lat]);
    return molduraDeCaixa(casa, pontos, PLANO_ZOOM_TETO);
  }

  /* ---- ONDE A PANORÂMICA POUSA ---------------------------------------------
     🔴 COM A ROTA NA RUA ELA POUSA NO QUE VEM PELA FRENTE, não no dia inteiro
     (16/08 — dono: *"deve aproximar, e acompanhar bem feito, mas cadê os pontos,
     os 'V'? as numerações?"*). São duas queixas com uma causa só: o dia inteiro
     numa cidade é zoom ~11,5, cada pixel vale ~50 m, e as 51 portas viram anéis
     encostados um no outro — sem número, sem ✓, sem nada.
     A moldura passou a ser o MOTORISTA + AS PRÓXIMAS PARADAS. É o que todo
     navegador do mercado mostra quando se pede a visão geral no meio da viagem
     (o que falta, não o que já foi), e é o enquadramento que faz o pino caber
     numerado: seis portas de um bairro cabem num zoom em que 300 m valem ~50 px.
     🔴 E ELA FOI MEDIDA NO g15, NÃO ESCOLHIDA NO PAPEL: a 1ª tentativa pousava
     centrada NO MOTORISTA com zoom fixo — e com ele a 3 km da primeira porta a
     tela virou mapa de rua sem pino nenhum. Zoom bonito, zero informação.
     O dia inteiro continua a UM toque: é o botão da beirada (`mapa-enquadrar`),
     que está bem ali e não mudou. Fora da rua — dia só montado, ou nenhum — a
     moldura do dia continua sendo o pouso, que é o que aquela tela promete. */
  const PANO_PROXIMAS = 6;
  function alvoDaPanoramica(casa) {
    const eu = ultimaPos || ultimoFix;
    const naRua = typeof rotaNaRua === 'function' ? rotaNaRua() : false;
    if (naRua && eu && pinoValido(eu.lat, eu.lng)) {
      const pontos = paradasDoMapa()
        .filter((p) => p.st !== 'entregue' && p.st !== 'cancelada')
        .slice(0, PANO_PROXIMAS)
        .map((p) => [Number(p.lng), Number(p.lat)]);
      pontos.push([eu.lng, eu.lat]);
      // o teto é o mesmo da vista de cima da entrada: com a próxima porta a 50 m
      // uma moldura livre colaria o mapa no capô.
      const m = molduraDeCaixa(casa, pontos, GERAL_ZOOM_TETO);
      if (m) return m;
    }
    return molduraDoPlano(casa);
  }

  /* 🔴 "AO ASSENTAR, O EFEITO DAS RUAS ACENDENDO NOS 2" — a ordem do dono, ao pé
     da letra, e ela diz QUANDO: ao ASSENTAR. A cena das ruas era pedida no
     instante da troca e nascia POR CIMA do movimento — dois efeitos se cruzando,
     a queixa mais antiga desta tela. Aqui ela espera o mapa parar.
     Quem manda é o SINAL (`moveend`, que o próprio mapa emite); o relógio fica
     de socorro, nunca de caminho normal — a lei que a medição de 16/08 deixou. */
  function aoAssentar(mapa, entao) {
    let feito = false;
    const disparar = () => {
      if (feito) return;
      feito = true;
      try { mapa.off('moveend', disparar); } catch (_) { /* mapa morto */ }
      entao();
    };
    try { mapa.once('moveend', disparar); } catch (_) { /* versão sem evento */ }
    setTimeout(disparar, TROCA_MS + 260);
  }

  /* 🔴 A TRAVA DO 2D LIGA E DESLIGA (16/08). Com dois mapas, a rotação e a
     inclinação eram desligadas de vez no mapa de planejar. Com um mapa só, isso
     travaria a tela de dirigir — que É inclinada. Então a trava virou estado:
     no 2D o dedo arrasta e pinça (e nada mais); dirigindo, ele pode tudo. */
  function travarGestos2D(mapa, travar) {
    if (!mapa) return;
    const par = (peca, ligar) => {
      try { if (mapa[peca] && mapa[peca][ligar ? 'enable' : 'disable']) mapa[peca][ligar ? 'enable' : 'disable'](); } catch (_) { /* versão sem o gesto */ }
    };
    par('dragRotate', !travar);
    par('touchPitch', !travar);
    try {
      if (mapa.touchZoomRotate) {
        if (travar) mapa.touchZoomRotate.disableRotation();
        else mapa.touchZoomRotate.enableRotation();
      }
    } catch (_) { /* idem */ }
    try {
      if (mapa.keyboard) {
        if (travar) mapa.keyboard.disableRotation();
        else mapa.keyboard.enableRotation();
      }
    } catch (_) { /* idem */ }
  }

  /* SUBIR — o 3D vira 2D NO MESMO MAPA: a inclinação cai, o rumo volta ao norte
     e a câmera abre até o pouso da Panorâmica, tudo num `easeTo` só.
     🔴 NENHUM EFEITO SE PERDEU AQUI (ordem do dono, 16/08: *"não é para regredir
     nada, muito menos perder efeito"*). O que sumiu foi o CORTE: com um palco só
     não existe mais "o mapa que entra" chegando frio de outra câmera — a imagem
     na tela é a mesma, e o movimento acontece nela. */
  function subirNoPlano() {
    const casa = GARAGEM.get(PALCO);
    if (!casa || !casa.mapa) return;
    travarGestos2D(casa.mapa, true);
    const alvo = alvoDaPanoramica(casa);
    // a régua dos 30 m recomeça daqui: o pouso é o novo ponto de partida.
    rearmarPlanoZoom();
    if (!alvo) { pedirCena('rota'); return; }
    porNoPlano(casa, alvo, TROCA_MS);
    aoAssentar(casa.mapa, () => { if (telaAtual() === 'rota') pedirCena('rota'); });
  }

  /** DESCER — a volta da Panorâmica: o movimento primeiro, a cena no pouso */
  function descerDoPlano() {
    const casa = GARAGEM.get(PALCO);
    if (!casa || !casa.mapa) { entrarNaDescida(); return; }
    travarGestos2D(casa.mapa, false);
    // limpa vigias, relógio da vista de cima e o estado 'solta' — é o mesmo
    // desarme da saída, e sem ele a descida nasce morta (ver `pararDescida`).
    pararDescida();
    descer(TROCA_MS, casa.mapa);
    aoAssentar(casa.mapa, () => { if (telaAtual() === 'mapa') pedirCena('navegar'); });
  }

  /* 🔴 PINO FORA DA TELA NÃO É PINO — é enfeite encostado na moldura. Com a
     câmera de dirigir inclinada, parada a 7,9 km projeta ALÉM do horizonte e o
     maplibre planta o marcador na beirada: foi o "1 2 3 4" enfileirado na
     direita que o dono viu. Ele não diz onde a parada está — diz só que ela
     não cabe. Some. (Só no palco "gps": no mapa "geral" a moldura é a rota
     inteira, e ali todo pino está, por construção, dentro da tela.) */
  function pinosVisiveis(casa) {
    if (!casa || !casa.pinos) return;
    /* 🔴 O ESCONDIDO TEM QUE VOLTAR (16/08). Isto só valia no palco de dirigir e
       o outro mapa nunca escondia nada — com um palco só, sair do 3D sem
       DESFAZER deixaria pinos invisíveis no 2D pra sempre. Fora da navegação a
       régua não é "some": é "todos aparecem". */
    if (!naNavegacao()) {
      casa.pinos.forEach((marcador) => {
        try { marcador.getElement().style.visibility = ''; } catch (_) { /* já saiu */ }
      });
      return;
    }
    let larg; let alt;
    try { const c = casa.mapa.getContainer(); larg = c.clientWidth; alt = c.clientHeight; }
    catch (_) { return; }
    casa.pinos.forEach((marcador) => {
      let p;
      try { p = casa.mapa.project(marcador.getLngLat()); } catch (_) { return; }
      const dentro = p && p.x >= -18 && p.x <= larg + 18 && p.y >= 0 && p.y <= alt + 18;
      marcador.getElement().style.visibility = dentro ? '' : 'hidden';
    });
  }

  /* ---- O PINO SÓ PERDE O NÚMERO QUANDO O NÚMERO NÃO CABE -------------------
     🔴 A RÉGUA ERA CONTAGEM + ZOOM CRAVADO (09/08: "mais de 12 paradas e zoom
     abaixo de 13,6 ⇒ vira ponto") e ela reprovava o dia inteiro do dono: 51
     paradas com o mapa em qualquer zoom de cidade viravam 51 anéis anônimos,
     inclusive nos zooms em que sobrava espaço de sobra entre eles. Zoom cravado
     é palpite sobre densidade — e densidade é DADO: dia espremido num bairro e
     dia espalhado por 70 km cabem no mesmo 13,6 e não têm nada em comum.
     Hoje a pergunta é direta e é POR PINO: **quantos PIXELS separam ESTE pino do
     vizinho mais próximo dele, neste zoom?** Se cabe o pino (30 px) com respiro,
     o número fica. Quem está no meio do aperto do centro vira ponto; quem tem
     rua sozinha continua dizendo quem é.
     🔴 A MEDIANA DO DIA NÃO SERVIA, e isso foi MEDIDO no g15: com 51 portas,
     metade delas coladas no centro, a mediana puxava o dia inteiro pra baixo e
     apagava o número até de quem estava sozinho num bairro — inclusive na
     Panorâmica nova, onde só 6 pinos espalhados aparecem na tela. Régua de
     conjunto pra decidir peça individual sempre acaba assim.
     A faixa de baixo continua valendo por cima de tudo: até 12 paradas nunca
     rebaixa, em zoom nenhum — três pontinhos anônimos num mapa vazio era o
     outro lado deste mesmo defeito. */
  const PINOS_NUMERADOS_ATE = 12;
  const PINO_ESPACO_PX = 24;

  /** distância ao vizinho mais próximo, em metros, POR PARADA (id → m) */
  function espacoDosPinos(paradas) {
    const fora = new Map();
    const n = paradas.length;
    if (n < 2) return fora;
    const kx = 111320 * Math.cos((Number(paradas[0].lat) * Math.PI) / 180);
    for (let i = 0; i < n; i += 1) {
      let menor = Infinity;
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const d = Math.hypot(
          (paradas[i].lng - paradas[j].lng) * kx,
          (paradas[i].lat - paradas[j].lat) * 110540,
        );
        if (d < menor) menor = d;
      }
      fora.set(String(paradas[i].id), menor);
    }
    return fora;
  }

  /* O rebaixamento, aplicado a cada zoom. Só mexe em CLASSE — nada de recriar
     marcador ao girar a pinça, que seria o mapa remontando a rota inteira a
     cada quadro do gesto. */
  function acertarPinos(casa) {
    if (!casa || !casa.pinos.size) return;
    const poucos = casa.pinos.size <= PINOS_NUMERADOS_ATE;
    let mpp = 0;
    if (!poucos) {
      let lat = 0;
      try { lat = casa.mapa.getCenter().lat; } catch (_) { return; }
      mpp = metrosPorPixel(casa, lat) || 0;
    }
    casa.pinos.forEach((marcador, id) => {
      let el;
      try { el = marcador.getElement(); } catch (_) { return; }
      // sem espaço medido ainda (lista nunca sincronizada) o seguro é NUMERAR:
      // pino sem número não diz nada, e pino apertado ainda diz quem é.
      const d = casa.espacos ? casa.espacos.get(String(id)) : null;
      const min = !poucos && !!mpp && Number.isFinite(d) && (d / mpp) < PINO_ESPACO_PX;
      el.classList.toggle('min', min);
    });
  }

  /* SONDA DE PROVA, no padrão do `window.HBXCena.pendente()`: a troca de modo é
     câmera, e câmera só se prova medindo. Devolve a pose do palco pedido e se
     ainda há pose guardada — é o que o portão `prova-ir-e-vir` pergunta pra
     saber se o mapa que entrou começou onde o outro parou. */
  window.HBXTroca = {
    pose(nome) {
      const casa = GARAGEM.get(PALCO);
      return (casa && casa.mapa) ? poseDoMapa(casa.mapa) : null;
    },
    palco() { return PALCO; },
    pinos(nome) {
      const casa = GARAGEM.get(PALCO);
      if (!casa || !casa.pinos.size) return null;
      const fora = [];
      casa.pinos.forEach((marcador, id) => {
        let el;
        try { el = marcador.getElement(); } catch (_) { return; }
        fora.push({
          id: String(id), min: el.classList.contains('min'), texto: el.textContent,
          espaco: casa.espacos ? casa.espacos.get(String(id)) : null,
        });
      });
      return fora;
    },
  };
