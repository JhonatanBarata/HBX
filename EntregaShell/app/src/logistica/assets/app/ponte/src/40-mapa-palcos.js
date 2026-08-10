  /* ------------------------------------------------------------------------
     7. L3a — O MAPA DE VERDADE DENTRO DA CASCA DO MOCK.
     O mock ILUSTRA o mapa em SVG: serve pra decidir a casca, não pra guiar
     ninguém. Aqui o palco (`[data-mapa]`) recebe o maplibre com o estilo e os
     tiles que o PRÓPRIO APARELHO serve (`/tiles/{z}/{x}/{y}.pbf`, mesma origem
     — por isso CSP e CORS deixam de existir em vez de serem contornados). Todo
     o cromo em volta (seta, manobra, bússola, velocímetro, rodapé) continua o
     do mock, intocado. No palco 2D o fundo de espera é a COR do palco — a
     maquete SVG morreu em 09/08 (ver `mapa()` no mock: ela inventava um dia e
     piscava ao cruzar com o mapa vivo). O palco da navegação continua com o
     desenho dele, que ali é CENA, não substituto de mapa.
     ------------------------------------------------------------------------ */
  const MAPA_TILES = 'https://appassets.androidplatform.net/tiles/{z}/{x}/{y}.pbf';
  // 🔴 O basemap acaba no z14. Sem declarar o teto, o maplibre pede z15+, não
  // acha nada e a tela fica VAZIA justo no zoom de rua — que é onde o motorista
  // olha. Com o teto, o z14 estica (overzoom), que é o certo.
  const MAPA_ZOOM_MAX = 14;
  let maplibrePromessa = null;
  /* 🔴 A BIBLIOTECA TEM DUAS METADES E O APP NOVO CARREGAVA UMA (09/08 — dono,
     no mapa 2D da rota montada: *"cadê os pontos os checkpoints?"*).

     MEDIDO no harness (`scripts/prova-mapa-2d.js`), 3 paradas, viewport
     412x940: os três pinos NASCEM (26x26, textos "1","2","3") e mesmo assim
     nenhum aparece — `getComputedStyle('.maplibregl-marker').position` devolvia
     `static` e o bounding box caía em y=1095, 1214 e 1333. Ou seja: FORA DA
     TELA, empilhados um embaixo do outro DEPOIS do canvas de 754px.

     A causa é uma linha que nunca existiu neste app: o `index.html` linka só o
     `mock.css`, e o `vendor/maplibre-gl.css` — que é onde mora
     `.maplibregl-marker{position:absolute}` — não é carregado por ninguém. Sem
     essa regra o marcador é um `div` comum: entra no fluxo normal do container,
     e o `transform` que o maplibre escreve a cada quadro passa a deslocá-lo a
     partir da posição errada. O app VELHO carregava o arquivo (`app.js`, a
     linha `link.href = "vendor/maplibre-gl.css"`); o app novo perdeu isso na
     fusão e o defeito ficou MUDO, porque a fita verde é WebGL (desenhada no
     canvas, não precisa de CSS nenhum) e continuou aparecendo. Fita sem pino é
     exatamente o print do dono.

     Por que AQUI e não no `index.html`: o `index.html` é GERADO pela injeção da
     casca, e conserto escrito nele tem validade de uma injeção (foi assim que o
     cordão de update se perdeu duas vezes — ver o comentário lá). O lugar de
     quem depende do maplibre é junto de quem o carrega. E por que não copiar a
     regra pro mock: a folha do vendor é o contrato de LAYOUT da biblioteca (não
     é pele nossa) — duplicá-la no mock seria a mesma regra morando em dois
     lugares, que é como elas passam a discordar. A PELE do pino continua sendo
     nossa e mora no mock (`.map-pino`). */
  const cssDoMaplibre = () => {
    if (document.getElementById('maplibre-css')) return;
    const l = document.createElement('link');
    l.id = 'maplibre-css';
    l.rel = 'stylesheet';
    l.href = 'vendor/maplibre-gl.css';
    /* 🔴 O VENDOR ENTRA ANTES DA FOLHA DA CASA — medido no g15 (09/08, APK 226):
       appendChild punha esta folha DEPOIS do mock.css, e `.maplibregl-map
       {position:relative}` (vendor) empata em especificidade com `.mapa-vivo
       {position:absolute;inset:0}` (casa) — empate se decide por ORDEM, o
       vendor vencia, o alvo do mapa virava `relative` de altura 0 e a cidade
       inteira pintava num retângulo invisível (canvas vivo, 71 camadas, tela
       cinza). Vendor é BASE: a casa tem que ter a última palavra em qualquer
       empate — por isso a folha dele entra antes da primeira folha nossa. */
    const casa = document.querySelector('link[rel="stylesheet"]');
    if (casa && casa.parentNode) casa.parentNode.insertBefore(l, casa);
    else document.head.appendChild(l);
  };

  const carregarMaplibre = () => {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (maplibrePromessa) return maplibrePromessa;
    maplibrePromessa = new Promise((ok, falha) => {
      // A folha ANTES do script: o primeiro marcador pode nascer no mesmo
      // quadro em que o mapa fica pronto, e marcador que nasce sem a regra de
      // posição já entra no lugar errado.
      cssDoMaplibre();
      const s = document.createElement('script');
      s.src = 'vendor/maplibre-gl.js';
      s.onload = () => (window.maplibregl ? ok(window.maplibregl) : falha(new Error('Mapa indisponível.')));
      s.onerror = () => falha(new Error('Mapa indisponível.'));
      document.head.appendChild(s);
      setTimeout(() => falha(new Error('Mapa indisponível.')), 9000);
    });
    return maplibrePromessa;
  };
  const estiloCache = {};
  async function estiloDoMapa(escuro) {
    const nome = escuro ? 'dark' : 'light';
    if (!estiloCache[nome]) {
      const r = await fetch(`mapa/style-${nome}.json`);
      estiloCache[nome] = await r.text();
    }
    // objeto NOVO a cada mapa: o maplibre mexe no que recebe, e dois mapas
    // dividindo o mesmo objeto é um contaminando o estilo do outro.
    const estilo = JSON.parse(estiloCache[nome]);
    const fonte = estilo.sources && estilo.sources.protomaps;
    if (!fonte) throw new Error('Estilo do mapa sem a fonte protomaps.');
    delete fonte.url;                 // era o marcador __HBX_TILES__
    fonte.type = 'vector';
    fonte.tiles = [MAPA_TILES];
    fonte.minzoom = 0;
    fonte.maxzoom = MAPA_ZOOM_MAX;
    // 🔴 SPRITE E GLYPHS PRECISAM SER ABSOLUTOS. O maplibre recusa caminho
    // relativo no sprite ("must be absolute") e o erro só aparece no console:
    // o mapa sobe, mas SEM ícone e — no caso dos glyphs — sem NOME DE RUA, que
    // é metade da utilidade do mapa pra quem dirige.
    const base = `${location.origin}/assets/app/`;
    if (estilo.sprite && !/^https?:/.test(estilo.sprite)) estilo.sprite = base + estilo.sprite;
    if (estilo.glyphs && !/^https?:/.test(estilo.glyphs)) estilo.glyphs = base + estilo.glyphs;
    return estilo;
  }

  /* O centro do mapa. Quem o escreve é a ÚNICA assinatura do GPS, lá embaixo
     na §7c — havia um `watchPosition` aqui só pra isto, e um segundo pro cromo
     da navegação seria o mesmo aparelho pedindo posição duas vezes, pagando
     bateria dobrada pra ter dois fixes que discordam. */
  let ultimaPos = null;

  /* ------------------------------------------------------------------------
     🔴 UM MAPA POR PALCO, PELA VIDA DO APP — E ELE É TRANSPLANTADO, NUNCA
     RECRIADO. (08/08, cena do dono: "ela volta em outro estado, e fica
     repetindo 2Dx3D".)

     O guard antigo (`palco.__hbxMapa`) era por ELEMENTO, e o elemento morre a
     cada repinte: a tela de dirigir repinta a cada fix do GPS (a distância da
     manobra muda de 89 m pra 88 m e o seam repinta, como deve). Resultado
     MEDIDO no g15, 8 amostras em 7 s: **3 mapas diferentes**, cada um nascendo
     na câmera de montagem — plano, zoom 15 — e sendo puxado de volta pro 3D
     pela navegação. É exatamente o "2D×3D" que o dono viu, mais tile baixado
     de novo a cada 5 segundos.

     Esta é a lei que o app velho já tinha (`el.__hbxMap`) e o app novo perdeu
     na fusão. Aqui ela volta com nome: a GARAGEM guarda um mapa por NOME de
     palco ('gps', 'geral'); quando o repinte troca o palco, o mesmo nó de mapa
     MUDA DE PAI e a câmera continua exatamente onde estava.
     ------------------------------------------------------------------------ */
  const GARAGEM = new Map();     // nome do palco → { gl, mapa, alvo, pinos, chave, luz }
  const MONTANDO = new Set();    // nome em criação (carregar o maplibre é async)

  const nomeDoPalco = (p) => String((p && p.dataset && p.dataset.mapa) || 'geral');
  const luzDeAgora = () => (document.documentElement.dataset.luz === 'claro' ? 'claro' : 'escuro');

  /* A garagem off-screen: tela que sai de cena não leva o mapa junto. Nó
     desconectado perde o contexto WebGL em alguns aparelhos — e perder o
     contexto é a piscada voltando pela porta dos fundos. */
  const BOX = document.createElement('div');
  BOX.setAttribute('aria-hidden', 'true');
  BOX.style.cssText = 'position:absolute;left:-9999px;top:0;width:360px;height:640px;pointer-events:none';

  function estacionarMapas() {
    GARAGEM.forEach((casa) => {
      if (casa.alvo.isConnected) return;
      if (!BOX.isConnected) document.body.appendChild(BOX);
      BOX.appendChild(casa.alvo);
      try { casa.mapa.resize(); } catch (_) { /* mapa morto */ }
    });
  }

  /* 🔴 O QUE O MAPA DESENHA TEM UM DONO SÓ — esta função (09/08). Sem rota
     montada ela devolve LISTA VAZIA, e é por isso que os pinos e o
     enquadramento somem juntos: "Montar rota vazio = mapa com MINHA SETA na
     minha localização", literal.
     🔴 E NÃO SE MEXE NO `PARADAS` GLOBAL pra conseguir isso: ele alimenta
     também a lista da tela `rotalista`, que continua mostrando o dia inteiro.
     A régua é do MAPA — zerar a fonte seria apagar uma tela que ninguém
     pediu. */
  /* 🔴 ZERO É UM NÚMERO FINITO — E FOI ISSO QUE MANDOU O MAPA PRA ÁFRICA
     (medido no g15, APK 206, 09/08 02:06). O filtro daqui nasceu como
     `Number.isFinite(lat) && Number.isFinite(lng)`, mais "correto" que o
     `p.lat && p.lng` que ele substituiu — e mais ERRADO, porque `0` passa no
     finito e não passa no truthy. Uma parada com (0,0) no cadastro virou um
     ponto no Golfo da Guiné, e "enquadrar a rota" abriu a câmera de Rio Claro
     até o SENEGAL: um oceano na tela com três pinos grudados em São Paulo.
     `pinoValido` é a régua que esta casa já tinha (rejeita 0,0 e o que sai da
     faixa) — a mesma que a parada avulsa usa pra aceitar coordenada digitada.
     LEI: trocar um filtro por outro "mais rigoroso" exige perguntar o que o
     antigo barrava DE GRAÇA. `truthy` barrava o zero; `isFinite` não. */
  function paradasDoMapa() {
    if (!rotaMontada()) return [];
    return ((typeof PARADAS !== 'undefined' ? PARADAS : []) || [])
      .filter((p) => p && pinoValido(p.lat, p.lng));
  }

  /* 🔴 QUEM DECIDE O TAMANHO DO PINO É A QUANTIDADE, NÃO SÓ O ZOOM (09/08).
     O rebaixamento por zoom nasceu pra um dia de 56 paradas, onde 56 bolas de
     26px no zoom da cidade viram uma mancha sem leitura — e essa parte continua
     certa. Errado era ele valer pra TODO dia: com 3 paradas no mesmo zoom não há
     amontoado nenhum pra desfazer, e rebaixar transformava a única informação da
     tela ("onde são minhas paradas, na ordem") em três pontinhos anônimos.
     Régua nova, em duas faixas:
     · até 12 paradas → NUMERADO SEMPRE, em qualquer zoom. Doze é o corte onde
       o dia inteiro ainda cabe na tela sem os pinos se tocarem: no zoom em que
       Rio Claro cabe nos 412px (z12), cada pixel vale ~19 m, então dois pinos
       de 26px só encostam se as portas estiverem a menos de ~500 m — o que num
       dia de 12 paradas espalhadas pela cidade é a exceção, não a regra.
     · acima de 12 → abaixo do zoom de bairro o pino vira PONTO. Mas ponto que
       se LÊ: o rebaixado não é o pino encolhido, é outra peça (`.map-pino.min`,
       com anel próprio) medida contra a fita verde e contra o chão do mapa nos
       dois modos — ponto de 10px sem anel some sobre a fita, que era o outro
       lado do mesmo defeito. */
  const PINOS_NUMERADOS_ATE = 12;
  const PINOS_ZOOM_CORTE = 13.6;

  /** os pinos numerados: só se refaz quando a LISTA muda, não a cada repinte */
  function sincronizarPinos(casa) {
    const paradas = paradasDoMapa();
    const chave = paradas.map((p) => `${p.n}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
    if (chave === casa.chave) return;
    casa.chave = chave;
    /* 🔴 O PINO É REAPROVEITADO POR NÚMERO (item 9, 09/08). Derrubar os N e
       recriar os N a cada mudança de lista era pagar N remoções + N nós novos
       + N marcadores re-registrados no maplibre pra trocar, às vezes, UMA
       coordenada. Agora: quem continua, `setLngLat`; quem entrou, nasce; quem
       saiu, sai. */
    const vivos = new Set();
    paradas.forEach((p) => {
      const k = String(p.n);
      vivos.add(k);
      const ja = casa.pinos.get(k);
      if (ja) {
        try { ja.setLngLat([p.lng, p.lat]); } catch (_) { /* mapa saindo de cena */ }
        return;
      }
      const pino = document.createElement('div');
      pino.textContent = k;
      /* A PELE SAIU DO INLINE (Lei 1: nada de cor solta em tela). Era um
         `cssText` com as cores escritas aqui dentro, invisível pro fiscal e
         impossível de trocar junto com o resto da casca. Agora é a classe
         `.map-pino` do mock, que é onde toda peça deste app veste. */
      pino.className = 'map-pino';
      casa.pinos.set(k, new casa.gl.Marker({ element: pino })
        .setLngLat([p.lng, p.lat]).addTo(casa.mapa));
    });
    [...casa.pinos.keys()].forEach((k) => {
      if (vivos.has(k)) return;
      try { casa.pinos.get(k).remove(); } catch (_) { /* já saiu */ }
      casa.pinos.delete(k);
    });
    acertarPinos(casa);
    pinosVisiveis(casa);
    // rota OUTRA = enquadramento outro. Aqui dentro é o único lugar automático
    // que reenquadra, e de propósito: este bloco só roda quando a lista muda.
    enquadrarGeral(casa);
  }

  /* O rebaixamento, aplicado a cada zoom. Só mexe em CLASSE — nada de recriar
     marcador ao girar a pinça, que seria o mapa remontando a rota inteira a
     cada quadro do gesto. */
  function acertarPinos(casa) {
    if (!casa || !casa.pinos.size) return;
    // Poucas paradas nunca rebaixam: a régua é a QUANTIDADE primeiro, e só
    // depois o zoom. Sem esta linha, 3 paradas no zoom-cidade viravam 3 pontos.
    const muitas = casa.pinos.size > PINOS_NUMERADOS_ATE;
    let z;
    try { z = casa.mapa.getZoom(); } catch (_) { return; }
    const min = muitas && z < PINOS_ZOOM_CORTE;
    casa.pinos.forEach((marcador) => {
      let el;
      try { el = marcador.getElement(); } catch (_) { return; }
      el.classList.toggle('min', min);
    });
  }

  /* ---- O ENQUADRAMENTO DO MAPA 2D --------------------------------------------
     🔴 O PALCO "geral" VIROU A TELA PRINCIPAL DA ROTA (08/08 — dono: *"a tela
     principal do rota, mapa limpo, 2d"*), e ele não estava pronto pro cargo:
     nascia centrado na PRIMEIRA parada com zoom 15 e deixava o resto do dia
     fora da tela. Mapa que mostra um pino de seis não é "a rota vista de cima",
     é um pedaço de rua com um número em cima. Quem enquadra é a caixa de TUDO o
     que a tela promete: as paradas e o motorista.

     🔴 E ELE NÃO REENQUADRA A CADA REPINTE. Esta tela repinta por segundo (fix
     do GPS, seam da lista); mandar câmera ali seria o mapa se recusando a ficar
     onde o dedo o deixou — exatamente o defeito que a fase 'solta' curou na
     navegação. São DUAS as horas de enquadrar, e só elas: quando a ROTA muda
     (a digital dos pinos é outra) e quando o DEDO PEDE (`mapa-enquadrar`).

     🔴 O CROMO COME TELA e a rota tem que caber no que sobra. Aqui é UMA peça
     só: a barra de vidro do topo (47 + 9 de respiro + 18 pro pino não encostar
     nela). O transmux e as abas NÃO entram nesta conta porque o palco já para
     em cima deles (`.plano.com-dock`) — descontá-los de novo seria enquadrar a
     rota num retângulo menor que o mapa, com meia tela sobrando embaixo. */
  const PLANO_PAD = { top: 74, right: 34, bottom: 34, left: 34 };
  const PLANO_ZOOM_TETO = 16;

  function enquadrarGeral(casa) {
    if (!casa || casa.nome !== 'geral') return;
    // a MESMA lista dos pinos (§ paradasDoMapa): sem rota montada ela vem
    // vazia, e a moldura passa a ser só o motorista — enquadrar uma rota que
    // ninguém montou levaria a câmera pra um dia que não existe.
    const pontos = paradasDoMapa().map((p) => [Number(p.lng), Number(p.lat)]);
    // mesma régua das paradas (§ paradasDoMapa): fix zerado é ponto no oceano,
    // e um só deles estica a moldura do dia inteiro pra outro continente.
    const eu = ultimaPos || ultimoFix;
    if (eu && pinoValido(eu.lat, eu.lng)) pontos.push([eu.lng, eu.lat]);
    // Sem um ponto sequer não há o que enquadrar — e a câmera fica onde está.
    // Pular pra lugar nenhum seria o mapa "corrigindo" pro meio do oceano.
    if (!pontos.length) return;
    const achatar = () => {
      /* 🔴 2D É REQUISITO, NÃO PREFERÊNCIA. Dois dedos inclinam e giram qualquer
         mapa do maplibre; enquadrar tem que DEVOLVER a vista de cima, senão o
         botão devolve o dia numa perspectiva que esta tela não deveria ter. */
      try {
        if (casa.mapa.getPitch() || casa.mapa.getBearing()) casa.mapa.jumpTo({ pitch: 0, bearing: 0 });
      } catch (_) { /* mapa saindo de cena */ }
    };
    if (pontos.length === 1) {
      try { casa.mapa.jumpTo({ center: pontos[0], zoom: 15 }); } catch (_) { return; }
      achatar();
      return;
    }
    const o = pontos[0].slice(); const n = pontos[0].slice();
    pontos.forEach((c) => {
      o[0] = Math.min(o[0], c[0]); o[1] = Math.min(o[1], c[1]);
      n[0] = Math.max(n[0], c[0]); n[1] = Math.max(n[1], c[1]);
    });
    try {
      casa.mapa.fitBounds([o, n], { padding: PLANO_PAD, maxZoom: PLANO_ZOOM_TETO, duration: 0 });
    } catch (_) { return; }
    achatar();
  }

  /** o botão da beirada do mapa 2D: devolve a rota inteira pra tela */
  function enquadrarPlano() { enquadrarGeral(GARAGEM.get('geral')); }

  /* 🔴 "ONDE EU ESTOU" NÃO É UM CARIMBO DE BOOT. O marcador do mapa 2D era
     criado UMA vez, no `load` do mapa, com a posição daquele instante — e nunca
     mais andava. Passava batido enquanto isto era a tela do botão "Ver mapa"
     (uma olhada de dois segundos); agora que é A TELA PRINCIPAL DA ROTA, seta
     parada num quarteirão que ficou pra trás é a tela mentindo o dia inteiro.
     Aqui ele é UM marcador pela vida do mapa, movido a cada fix — sem repinte,
     sem câmera, sem nada que brigue com o dedo. */
  /* 🔴 EU NÃO SOU UM PINO — e era exatamente isso que a tela desenhava. O
     marcador do motorista era `new Marker({ color })` com um azul cravado no
     código: a gota PADRÃO
     do maplibre, a mesma forma e o mesmo tamanho do que marca uma PARADA, com a
     cor escrita solta aqui dentro (a Lei 1 proíbe hex em tela; este passou
     porque não está em folha nenhuma). Num dia com rota ele se perdia no meio
     dos numerados; num dia SEM rota era a única coisa na tela e mesmo assim não
     dizia "você" — dizia "tem um ponto aqui". Pino é COISA QUE ESTÁ LÁ; eu sou
     QUEM OLHA, e todo mapa de rua do mundo desenha isso como um PONTO com halo.

     A casca disso já existia no mock desde 09/08 (`.eu-puck`, com o comentário
     "ver `moverEuNoPlano`") e este arquivo nunca a vestiu: a folha prometia
     halo de precisão e cone de rumo pra um marcador que continuava sendo a gota
     padrão. Aqui a promessa passa a ser verdade, e ela é DADO, não enfeite:
     · `--halo` é a PRECISÃO do fix em metros, convertida em pixels pelo zoom da
       hora. Dentro de um galpão ele incha e conta a verdade; no meio da rua
       encolhe. Halo de tamanho fixo seria desenho fingindo medida.
     · `--cone`/`--rumo` só existem quando o fix TEM rumo. Parado, o GPS não
       sabe pra onde a pessoa aponta — e apontar pra um lado inventado é pior
       que não apontar (Lei do IF aplicada a desenho). */
  const EU_HALO_MIN = 26;    // abaixo disto o halo some atrás do próprio ponto
  const EU_HALO_MAX = 220;   // fix ruim de 2 km não pode virar mancha na tela

  /** metros por pixel na latitude e no zoom da hora — a régua do maplibre */
  function metrosPorPixel(casa, lat) {
    let z;
    try { z = casa.mapa.getZoom(); } catch (_) { return null; }
    if (!Number.isFinite(z)) return null;
    return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
  }

  /* A pele do "eu" a cada fix E a cada zoom: o halo é medida de CHÃO, então
     aproximar a pinça tem que engordá-lo na tela — senão ele mentiria a
     precisão em todo zoom que não fosse aquele em que o fix chegou. */
  function vestirEu(casa) {
    if (!casa || !casa.eu) return;
    let el;
    try { el = casa.eu.getElement(); } catch (_) { return; }
    const fix = ultimoFix || {};
    const mpp = metrosPorPixel(casa, Number(fix.lat != null ? fix.lat : (ultimaPos || {}).lat) || 0);
    // Sem precisão no fix o halo fica no tamanho de repouso da folha: some
    // melhor um halo padrão que um halo que diz um número que ninguém mediu.
    if (mpp && Number.isFinite(fix.precisaoM) && fix.precisaoM > 0) {
      const px = Math.min(EU_HALO_MAX, Math.max(EU_HALO_MIN, (fix.precisaoM * 2) / mpp));
      el.style.setProperty('--halo', `${Math.round(px)}px`);
    }
    const temRumo = Number.isFinite(fix.rumoGraus);
    el.style.setProperty('--cone', temRumo ? '1' : '0');
    if (temRumo) el.style.setProperty('--rumo', `${Math.round(fix.rumoGraus)}deg`);
  }

  function moverEuNoPlano() {
    const casa = GARAGEM.get('geral');
    const eu = ultimaPos || ultimoFix;
    if (!casa || !eu || !Number.isFinite(eu.lat) || !Number.isFinite(eu.lng)) return;
    if (!casa.eu) {
      try {
        const ponto = document.createElement('i');
        ponto.className = 'eu-puck';
        ponto.setAttribute('aria-label', 'Você está aqui');
        casa.eu = new casa.gl.Marker({ element: ponto })
          .setLngLat([eu.lng, eu.lat]).addTo(casa.mapa);
      } catch (_) { casa.eu = null; return; }
      vestirEu(casa);
      /* 🔴 O PRIMEIRO FIX ENQUADRA — UMA VEZ. O mapa nasce antes de existir GPS
         (numa garagem, bem antes) e nasce onde dá: no fallback da cidade, zoom
         12. Sem isto o motorista ganhava o marcador dele num mapa apontado pra
         outro lugar — a seta existia e estava FORA DA TELA. Só na criação do
         marcador, nunca nos fixes seguintes: aí seria a câmera desfazendo o
         arrasto uma vez por segundo, que é o defeito que a fase 'solta' curou. */
      enquadrarGeral(casa);
      return;
    }
    try { casa.eu.setLngLat([eu.lng, eu.lat]); } catch (_) { /* mapa saindo de cena */ }
    // o ponto andou; o halo e o farol contam o fix NOVO — precisão velha
    // desenhada em cima de posição nova é a tela mentindo devagar.
    vestirEu(casa);
  }

  /* 🔴 PINO FORA DA TELA NÃO É PINO — é enfeite encostado na moldura. Com a
     câmera de dirigir inclinada, parada a 7,9 km projeta ALÉM do horizonte e o
     maplibre planta o marcador na beirada: foi o "1 2 3 4" enfileirado na
     direita que o dono viu. Ele não diz onde a parada está — diz só que ela
     não cabe. Some. (Só no palco "gps": no mapa "geral" a moldura é a rota
     inteira, e ali todo pino está, por construção, dentro da tela.) */
  function pinosVisiveis(casa) {
    if (!casa || casa.nome !== 'gps') return;
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

  /* ==========================================================================
     7a-bis. A CENA DAS RUAS — o mapa se desenhando.

     Ordem do dono (09/08): *"entrada do app, ao ligar, era pras ruas virem
     surgindo, um efeito bem legal na entrada dele, e este efeito se repete
     sempre que uma rota é criada — não remonte coisas, crie dentro do mapa
     mesmo"*. E o roteiro, na letra dele: carrega escuro (ou claro, conforme o
     tema), nasce o pino centralizado onde a pessoa está, escreve a coordenada e
     o endereço em que ela possivelmente está, aí as ruas vão surgindo de vários
     pontos aleatórios até se formar a rua do mapa de onde ela está, e quando a
     rua FECHA começam a escrever as letras.

     🔴 "DENTRO DO MAPA MESMO" É O PROJETO INTEIRO, não um detalhe de gosto. A
     cena da navegação (§ "A COBRA", no mock) desenha um SVG e depois cruza com
     o mapa vivo — ali é CENA, dura 1,36 s e some. Repetir aquilo aqui traria de
     volta exatamente o que morreu em 09/08 com a maquete do 2D: um desenho que
     inventa uma cidade e pisca ao encontrar a de verdade. Então aqui não há
     desenho nenhum. As ruas que crescem SÃO as ruas dos tiles:
     `querySourceFeatures` devolve a geometria que o mapa já baixou, ela vira uma
     fonte GeoJSON com `lineMetrics`, e o crescimento é `line-gradient` andando
     de 0 a 1 em cima do próprio comprimento de cada rua. No fim a camada da cena
     se apaga por cima da MESMA geometria que fica — não há cruzamento possível
     porque não há duas cidades.

     🔴 UM QUADRO = UMA CONTA (a lei do item 9). O que roda a cada quadro é UMA
     linha de tinta por onda em voo (no máximo três ao mesmo tempo): trocar o
     gradiente é reenviar uma rampa de cor, não relayoutar a fonte. Nada de
     `setData` por quadro na geometria (seria a cidade inteira reserializada 60
     vezes por segundo) e nada de `setFilter` por quadro (que manda o worker
     refazer o tile). O único `setData` de repetição é o dos NOMES, e só quando
     uma letra muda: 16 pontinhos, no máximo 15 vezes por segundo.

     🔴 O RELÓGIO MANDA, O DADO NÃO SEGURA. A cena espera o tile e o primeiro fix
     com TETO (2,2 s / 1,4 s, os mesmos números da cena da navegação). Vencido o
     teto, ou sem rua nenhuma pra desenhar, o mundo volta na hora e a tela é a de
     sempre. Enfeite não derruba tela — e enfeite não segura motorista: o
     primeiro toque no mapa encerra tudo e devolve o mapa pronto.
     ========================================================================== */
  const CENA_FONTE = 'hbx-cena-ruas';
  const CENA_NOMES = 'hbx-cena-nomes';
  const CENA_NOMES_L = 'hbx-cena-nomes-txt';
  /** quantas frentes de crescimento; cada uma parte `CENA_PASSO` depois da outra */
  const CENA_ONDAS = 7;
  /** 66 ms por letra — a régua de escrita desta casa (`empDigita`, no mock) */
  const CENA_LETRA = 66;
  /* 🔴 MAIS DEVAGAR — ordem do dono (09/08): *"o certo é o efeito acontecer mais
     devagar"*. Os números de antes vinham de uma cena que precisava caber no vão
     entre a abertura e o mapa; agora ela NÃO cabe em vão nenhum, ela É a entrada
     do mapa (§ 7a-ter), e pode respirar. Onda mais longa (0,82 s) e passo maior
     (0,17 s) — a frente inteira leva 1,84 s em vez de 1,34 s. */
  const CENA_PASSO = 170;
  const CENA_ONDA = 820;
  /** quando a primeira onda parte: na entrada, depois do pino e da coordenada */
  const CENA_RUAS_ENTRADA = 700;
  /** na rota nova o mapa JÁ está na cara do motorista: nada de tela parada */
  const CENA_RUAS_ROTA = 140;
  /* 🔴 O RITMO DO NAVEGAR É OUTRO, E É POR ORQUESTRA (09/08). Na tela da Rota a
     cena é o assunto e pode respirar 1,84 s; na tela de DIRIGIR ela é só a
     entrada — depois dela ainda vem a descida pro 3D, e quem está no volante
     está esperando o GPS, não um show. Passo 90 e onda 520 fecham a frente
     inteira em ~1,06 s, que é o mesmo relógio da camada (`CENA_CHEIA` = 1,2 s):
     as duas acabam juntas e a câmera desce em seguida, sem tela parada.
     🔴 E ELA NÃO ESCREVE NOME DE RUA. As letras são da tela que se apresenta;
     aqui elas seriam texto nascendo no exato momento em que a manobra desce —
     dois textos disputando o olho de quem vai dirigir. */
  const CENA_PASSO_NAV = 90;
  const CENA_ONDA_NAV = 520;
  const CENA_RUAS_NAV = 120;
  const CENA_TETO_FIX = 1400;
  const CENA_TETO_TILE = 2200;
  /* 🔴 O TETO DA ENTRADA É O DA ABERTURA, não o do tile. A cena de entrada
     espera o app ser ENTREGUE (§ `esperarChao`), e a abertura tem teto próprio
     de 6 s na ponte / 7 s no desenho. 9 s cobre os dois com folga — e se nem
     assim a luz verde acender, a cena começa mesmo, que é melhor que sumir. */
  const CENA_TETO_ABERTURA = 9000;
  const CENA_TETO_VIDA = 9000;
  /* 🔴 130 → 260 NA ENTRADA (10/08 — dono: *"nem todas ruas são preenchidas"*).
     O teto era um freio de custo, e ele estava cortando CIDADE: a cena
     escondia o mapa inteiro e redesenhava as 130 maiores, então as outras
     apareciam de uma vez no fim — o "pula" da fase 3. O custo real de uma rua a
     mais é uma linha num GeoJSON que já existe (o desenho por quadro é 1
     `setPaintProperty` por ONDA, não por rua: 7 no total, tetos iguais). O que
     encarece é a varredura do tile, e ela tem freio próprio (`varredura`).
     Na tela de dirigir continua baixo: lá o mapa está em perspectiva, cabe
     menos rua na tela e a cena tem a descida esperando atrás. */
  const CENA_MAX_RUAS = 260;
  /** e na tela de dirigir, bem menos (ver o comentário do `maxRuas`) */
  const CENA_MAX_RUAS_NAV = 70;
  const CENA_MAX_NOMES = 16;
  const CENA_VALIDADE = 60000;
  const CENA_SAI = 520;
  /** o assentamento: quanto o mundo de verdade leva pra subir por baixo da cena */
  const CENA_ASSENTA = 700;
  /** quanto leva o resto do mundo (prédio, nome, POI) voltando DURANTE a cena */
  const CENA_VOLTA_RESTO = 420;
  /** e quanto leva a cena a sair, já com a rua de verdade acesa embaixo */
  const CENA_TROCA = 260;
  /* 🔴 QUANTO A RUA LEVA PRA ASSENTAR NA COR DE VERDADE (10/08). Esta é a
     SEGUNDA metade do "as ruas escurecem" — e a que sobrou depois de eu matar o
     cruzamento de opacidades. MEDIDO no `style-dark.json`: a rua do basemap é
     `#333333`–`#474747` e a tinta da cena é `#59677a` — o DOBRO do brilho. A
     troca no fim, por mais bem feita que fosse, sempre ia ler como "escureceu",
     porque as duas cores nunca foram a mesma.
     A largura já era igualada classe por classe justamente por isso (§
     `CENA_LARGURA`); faltava a cor. Agora a rua nasce acesa — que é o efeito —
     e ESCORREGA até a cor final assim que a onda fecha. Quando a cena sai, a
     linha por baixo já tem exatamente o tom que está por cima: não há troca. */
  const CENA_COR_ASSENTA = 420;
  /** e quando é o dedo que encerra, ele sobe em 1/3 disso */
  const CENA_ASSENTA_DEDO = 260;
  /** no Navegar o mundo assenta antes de a câmera começar a descer */
  const CENA_ASSENTA_NAV = 300;
  const CENA_INVISIVEL = 'rgba(0,0,0,0)';
  /* A largura é a MESMA do basemap (`roads_*` no style), classe por classe. Não
     é capricho: no fim a camada da cena se apaga por cima da rua de verdade, e
     um pixel de diferença viraria a rua "engordando" no último quadro. */
  const CENA_LARGURA = ['interpolate', ['exponential', 1.6], ['zoom'],
    11, ['match', ['get', 'c'], 'a', 1.6, 'b', 1.3, 0.2],
    15, ['match', ['get', 'c'], 'a', 5, 'b', 3, 2],
    18, ['match', ['get', 'c'], 'a', 15, 'b', 13, 11]];

  let cena = null;          // a cena EM CURSO (uma por vez, sempre)
  let cenaPedido = null;    // { motivo, em } — pedido esperando o palco aparecer
  let cenaJaEntrou = false; // a de ENTRADA é uma por vida do app

  /* Lei 7: quem pediu menos movimento não ganha cena nenhuma — e não é um
     "modo degradado", é a tela pronta, que é o que essa pessoa pediu. */
  const semMovimento = () => {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (_) { return false; }
  };

  /* 🔴 O QUE SAI DE CENA É O QUE A CENA VAI DESENHAR, e só. Chão, água e área
     verde FICAM: eles são o papel em que as ruas se desenham (e no claro são a
     diferença entre "mapa apagado" e "tela branca quebrada"). Sai o que a cena
     conta: rua, prédio, ponto de interesse e todo nome de lugar. */
  const cenaEscondeCamada = (l) => {
    const sl = l && l['source-layer'];
    return sl === 'roads' || sl === 'buildings' || sl === 'pois' || sl === 'places';
  };

  /* A opacidade de cada tipo de camada — é por ela que o mundo VOLTA subindo, em
     vez de aparecer de uma vez. Ligar `visibility` devolve a cidade inteira num
     quadro só: casca de rua, prédio, ponto de interesse e todo rótulo aparecem
     juntos, e é EXATAMENTE isso que o dono chamou de pisca no fim da cena. */
  const CENA_OPACIDADE = {
    line: ['line-opacity'], fill: ['fill-opacity'],
    symbol: ['text-opacity', 'icon-opacity'],
    circle: ['circle-opacity'], 'fill-extrusion': ['fill-extrusion-opacity'],
  };

  /** apaga o mundo e DEVOLVE o que cada camada era — visibilidade E opacidade.
      Restaurar "visible" (ou opacidade 1) em cima de camada que o estilo já
      escondia seria a cena ligando peça que ninguém pediu. */
  /* 🔴 QUEM A CENA REDESENHA É SÓ A LINHA DA RUA. Tudo o mais que ela apaga —
     prédio, ponto de interesse, nome de bairro e o próprio RÓTULO da rua — some
     e não tem substituto no palco. Essa diferença é o que decide QUANDO cada
     camada volta (ver `devolverParte`), e por isso ela é carimbada aqui. */
  const ehLinhaDeRua = (l) => l.type === 'line' && l['source-layer'] === 'roads';

  function esconderMundo(mapa) {
    let camadas = [];
    try { camadas = (mapa.getStyle().layers || []); } catch (_) { return null; }
    const antes = new Map();
    camadas.forEach((l) => {
      if (!cenaEscondeCamada(l)) return;
      const op = {};
      (CENA_OPACIDADE[l.type] || []).forEach((p) => {
        try { op[p] = mapa.getPaintProperty(l.id, p); } catch (_) { op[p] = undefined; }
      });
      antes.set(l.id, { vis: (l.layout && l.layout.visibility) || 'visible', op, rua: ehLinhaDeRua(l) });
      try { mapa.setLayoutProperty(l.id, 'visibility', 'none'); } catch (_) { /* estilo trocando */ }
    });
    return antes.size ? antes : null;
  }

  /** o pedaço do mundo que interessa agora — o resto fica escondido */
  function fatiaDoMundo(antes, querRua) {
    if (!antes) return null;
    const fatia = new Map();
    antes.forEach((v, id) => { if (!!v.rua === !!querRua) fatia.set(id, v); });
    return fatia.size ? fatia : null;
  }

  /* 🔴 O MUNDO VOLTA POR BAIXO, DESBOTANDO — e a ordem aqui é o assentamento
     inteiro (dono, 09/08: *"assim q termina, ele pisca tbm... o certo é o efeito
     já ser o efeito no MAPA, não efeito, depois entra o mapa"*).

     São dois quadros e uma conta:
     1º quadro — a camada ACENDE já transparente (opacidade 0 com transição 0).
        Nada muda na tela: ninguém vê ligar o que está invisível.
     2º quadro — a transição de verdade sobe cada opacidade até o valor que ela
        tinha no estilo. As ruas de verdade sobem DEBAixo das ruas da cena, que
        ainda estão opacas por cima: não há dobra de tinta, não há vão.
     No fim, a folha volta a ser a do estilo (transição e valor originais) — cena
     que deixa `-transition` cravado envenena todo repinte seguinte do mapa. */
  function devolverMundo(mapa, antes, ms) {
    if (!mapa || !antes) return;
    if (!ms) {
      antes.forEach((v, id) => {
        try { if (mapa.getLayer(id)) mapa.setLayoutProperty(id, 'visibility', v.vis); } catch (_) { /* já foi */ }
      });
      return;
    }
    antes.forEach((v, id) => {
      try {
        if (!mapa.getLayer(id)) return;
        Object.keys(v.op).forEach((p) => {
          mapa.setPaintProperty(id, p + '-transition', { duration: 0, delay: 0 });
          mapa.setPaintProperty(id, p, 0);
        });
        mapa.setLayoutProperty(id, 'visibility', v.vis);
      } catch (_) { /* estilo trocando */ }
    });
    requestAnimationFrame(() => {
      antes.forEach((v, id) => {
        try {
          if (!mapa.getLayer(id)) return;
          Object.keys(v.op).forEach((p) => {
            mapa.setPaintProperty(id, p + '-transition', { duration: ms, delay: 0 });
            mapa.setPaintProperty(id, p, v.op[p] === undefined ? 1 : v.op[p]);
          });
        } catch (_) { /* estilo trocando */ }
      });
    });
    setTimeout(() => {
      antes.forEach((v, id) => {
        try {
          if (!mapa.getLayer(id)) return;
          Object.keys(v.op).forEach((p) => {
            mapa.setPaintProperty(id, p + '-transition', undefined);
            mapa.setPaintProperty(id, p, v.op[p]);
          });
        } catch (_) { /* estilo trocando */ }
      });
    }, ms + 90);
  }

  /* ---- a geometria de verdade ------------------------------------------------
     Uma rua do tile vem em pedaço e em duplicata (o mesmo trecho aparece na
     borda de dois tiles). Aqui ela vira uma peça de cena: aparada no que cabe na
     tela, medida em PIXEL (é em pixel que se decide se vale desenhar), reduzida
     a no máximo 14 pontos e carimbada com nome e classe. */
  function aparar(mapa, coords, L, A) {
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const tela = [];
    let dentro = 0;
    for (let i = 0; i < coords.length; i += 1) {
      const c = coords[i];
      if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
      let t;
      try { t = mapa.project(c); } catch (_) { return null; }
      tela.push(t);
      if (t.x > -80 && t.x < L + 80 && t.y > -80 && t.y < A + 80) dentro += 1;
    }
    if (!dentro) return null;
    let px = 0;
    for (let i = 1; i < tela.length; i += 1) {
      px += Math.hypot(tela[i].x - tela[i - 1].x, tela[i].y - tela[i - 1].y);
    }
    if (px < 30) return null;                    // risco de 30 px não é rua, é ruído
    const passo = Math.max(1, Math.ceil((coords.length - 1) / 13));
    const pontos = []; const tp = [];
    for (let i = 0; i < coords.length; i += passo) { pontos.push([coords[i][0], coords[i][1]]); tp.push(tela[i]); }
    const fim = coords[coords.length - 1];
    const ult = pontos[pontos.length - 1];
    if (ult[0] !== fim[0] || ult[1] !== fim[1]) { pontos.push([fim[0], fim[1]]); tp.push(tela[tela.length - 1]); }
    if (pontos.length < 2) return null;
    const meio = tp[Math.floor(tp.length / 2)];
    return {
      pontos, tp, px, mx: meio.x, my: meio.y,
      x0: tp[0].x, y0: tp[0].y, x1: tp[tp.length - 1].x, y1: tp[tp.length - 1].y,
    };
  }

  function ruasDaCena(mapa, teto) {
    let L; let A;
    try { const c = mapa.getContainer(); L = c.clientWidth; A = c.clientHeight; } catch (_) { return []; }
    if (!L || !A) return [];
    let brutas = [];
    try { brutas = mapa.querySourceFeatures('protomaps', { sourceLayer: 'roads' }) || []; }
    catch (_) { return []; }
    const vistas = new Set();
    const ruas = [];
    /* quantas ruas a cena aceita. 🔴 A DE DIRIGIR PEDE MENOS, e é medição: com
       130 ruas o `comecarCena` (varrer o tile, criar a fonte, sete camadas)
       custou uma TAREFA LONGA de 372 ms na entrada da navegação — a tela mais
       cara do app engasgando justo no toque do dono. Com 70 a cidade continua
       fechada (o corte é pelas MAIORES, ver o sort abaixo) e o quadro volta. */
    const maxRuas = teto || CENA_MAX_RUAS;
    // teto de varredura: o zoom da cidade traz milhares de feições e a conta é
    // por PONTO. Este laço roda UMA vez na vida da cena e mesmo assim tem freio.
    const varredura = Math.min(brutas.length, 2600);
    for (let i = 0; i < varredura; i += 1) {
      const f = brutas[i];
      const g = f && f.geometry;
      if (!g) continue;
      const partes = g.type === 'LineString' ? [g.coordinates]
        : (g.type === 'MultiLineString' ? g.coordinates : null);
      if (!partes) continue;
      const p = f.properties || {};
      const nome = String(p['name:pt'] || p.name || p['pgf:name'] || '').trim();
      const classe = p.kind === 'highway' ? 'a' : (p.kind === 'major_road' ? 'b' : 'c');
      for (let k = 0; k < partes.length; k += 1) {
        const rua = aparar(mapa, partes[k], L, A);
        if (!rua) continue;
        // a duplicata da borda do tile tem as MESMAS pontas: arredondar em 7 px
        // mata a cópia sem matar duas ruas paralelas de verdade.
        const chave = `${Math.round(rua.x0 / 7)},${Math.round(rua.y0 / 7)}|${Math.round(rua.x1 / 7)},${Math.round(rua.y1 / 7)}`;
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        rua.nome = nome.slice(0, 34); rua.classe = classe;
        ruas.push(rua);
      }
      if (ruas.length >= maxRuas * 3) break;
    }
    // as maiores primeiro: se houver corte, que sobre o desenho da cidade e não
    // um punhado de vielas.
    ruas.sort((a, b) => b.px - a.px);
    return ruas.slice(0, maxRuas);
  }

  /* ---- de vários pontos aleatórios -------------------------------------------
     🔴 "DE VÁRIOS PONTOS ALEATÓRIOS" É O PEDIDO LITERAL, e um dos pontos não é
     aleatório: onde a pessoa está. É isso que faz o labirinto se fechar
     EM VOLTA DELA e não num canto qualquer da tela.
     Cada rua entra na onda da sua DISTÂNCIA até o foco mais perto — é a onda
     que carrega o tempo, não a rua, e é por isso que a cena inteira custa sete
     linhas de tinta por quadro em vez de cento e trinta. */
  function ondasDasRuas(casa, ruas) {
    const mapa = casa.mapa;
    let L = 412; let A = 800;
    try { const c = mapa.getContainer(); L = c.clientWidth || L; A = c.clientHeight || A; } catch (_) { /* fora de cena */ }
    const focos = [];
    const eu = ultimaPos || ultimoFix;
    if (eu && pinoValido(eu.lat, eu.lng)) {
      try { const t = mapa.project([eu.lng, eu.lat]); focos.push([t.x, t.y]); } catch (_) { /* sem projeção */ }
    }
    while (focos.length < 4) focos.push([Math.random() * L, Math.random() * A]);
    let maior = 1;
    ruas.forEach((r) => {
      let d = Infinity; let perto = focos[0];
      focos.forEach((f) => {
        const q = Math.hypot(r.mx - f[0], r.my - f[1]);
        if (q < d) { d = q; perto = f; }
      });
      r.dist = d; r.foco = perto;
      if (d > maior) maior = d;
    });
    ruas.forEach((r) => {
      const t = Math.min(1, r.dist / maior);
      // o tremor de meia onda desmancha a fileira: sem ele as ruas nascem em
      // anéis concêntricos perfeitos, que é desenho de radar, não de cidade.
      const bruto = Math.round((t * (CENA_ONDAS - 1)) + ((Math.random() - 0.5) * 0.9));
      r.onda = Math.max(0, Math.min(CENA_ONDAS - 1, bruto));
      // e ela cresce PRA LONGE do foco: começando pela ponta errada, a rua
      // pareceria correr de volta pra dentro do que já foi desenhado.
      const dIni = Math.hypot(r.x0 - r.foco[0], r.y0 - r.foco[1]);
      const dFim = Math.hypot(r.x1 - r.foco[0], r.y1 - r.foco[1]);
      if (dFim < dIni) { r.pontos.reverse(); r.tp.reverse(); }
    });
  }

  /** os nomes que cabem: um por rua, um por NOME, e nunca dois em cima do outro */
  function nomesDaCena(ruas) {
    const usados = new Set();
    const postos = [];
    const escolhidos = [];
    ruas.forEach((r) => {
      if (escolhidos.length >= CENA_MAX_NOMES) return;
      if (!r.nome || r.px < 90) return;          // nome não cabe em rua curta
      const chave = r.nome.toLowerCase();
      if (usados.has(chave)) return;
      if (postos.some((p) => Math.hypot(p[0] - r.mx, p[1] - r.my) < 84)) return;
      usados.add(chave); postos.push([r.mx, r.my]);
      escolhidos.push(r);
    });
    return escolhidos;
  }

  /* ---- o cartão do "onde eu estou" -------------------------------------------
     🔴 O ENDEREÇO SAI DO MAPA QUE JÁ ESTÁ NO APARELHO, não da rede. Pedir o
     reverso ao servidor na abertura seria pôr a cena de entrada — e com ela a
     primeira tela do dia — dependendo de sinal de celular em galpão. A rua mais
     perto do fix é o que o próprio mapa sabe responder, na hora e offline, e é
     exatamente o que o dono pediu: o endereço em que a pessoa POSSIVELMENTE
     está. Sem rua com nome por perto, a linha não existe — nada de inventar. */
  function ruaMaisPerto(mapa, ruas, eu) {
    let alvo;
    try { alvo = mapa.project([eu.lng, eu.lat]); } catch (_) { return ''; }
    let melhor = ''; let dm = 260;              // além de 260 px não é "onde estou"
    ruas.forEach((r) => {
      if (!r.nome) return;
      r.tp.forEach((t) => {
        const d = Math.hypot(t.x - alvo.x, t.y - alvo.y);
        if (d < dm) { dm = d; melhor = r.nome; }
      });
    });
    return melhor;
  }

  const grauDe = (v, pos, neg) => `${Math.abs(v).toFixed(4).replace('.', ',')}° ${v >= 0 ? pos : neg}`;

  function cartaoDaCena(casa, coordenada, endereco) {
    const eu = ultimaPos || ultimoFix;
    let ponto;
    try { ponto = casa.mapa.project([eu.lng, eu.lat]); } catch (_) { return null; }
    const cartao = document.createElement('div');
    cartao.className = 'cena-eu';
    cartao.setAttribute('aria-hidden', 'true');
    // ele nasce COLADO no pino, não no meio do palco: com rota montada a câmera
    // enquadra o dia inteiro e o meio da tela não é onde a pessoa está.
    cartao.style.left = `${Math.round(ponto.x)}px`;
    cartao.style.top = `${Math.round(ponto.y)}px`;
    const linha = (tag, texto, atraso) => {
      const el = document.createElement(tag);
      el.textContent = texto;
      // `--n` é o número de letras: é ele que faz o `empDigita` andar de letra em
      // letra (steps) em vez de varrer a caixa.
      el.style.setProperty('--n', String(Math.max(1, texto.length)));
      if (atraso) el.style.setProperty('--atraso', atraso);
      cartao.appendChild(el);
    };
    linha('b', coordenada, '');
    if (endereco) linha('i', endereco, '.18s');
    try { casa.alvo.appendChild(cartao); } catch (_) { return null; }
    return cartao;
  }

