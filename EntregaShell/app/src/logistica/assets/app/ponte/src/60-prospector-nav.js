  /* ------------------------------------------------------------------------
     7b. L3b — AS EMPRESAS DO CORREDOR NO CHÃO (prospector).

     O desenho já sabe DESENHAR a empresa (prédio, três estados, a cena de
     acender). O que ele não pode saber é ONDE ela cai na tela: isso muda a
     cada quadro que a câmera se mexe. Então a divisão é essa e é limpa —
     **o DADO passa pelo seam, a GEOMETRIA não**:

       · `usarDados('mapa', {empresas:[…]})` diz QUAIS empresas existem e
         quais estão acesas → repinta a tela, como toda outra seção;
       · esta função escreve `--x`, `--y` e `--esc` direto no elemento, a cada
         `move`/`zoom`. Passar posição de mapa pelo repinte seria repintar a
         tela inteira 60 vezes por segundo — e, pior, recomeçaria a cena de
         acender a cada quadro.

     🔴 PROPORCIONAL — a regra de escala, que é o pedido literal do dono
     ("deixe proporcional as empresas q forem aparecendo"):

         esc = 2^(zoom − 16,5) × perto,   preso entre 0,55 e 1,80
         perto = 1 − 0,35 × min(1, distância_em_metros / 300)

     · `2^(zoom−16,5)` é a conta da própria projeção: um metro de chão ocupa o
       DOBRO de pixel a cada nível de zoom. É isso que faz o prédio se
       comportar como coisa que está na rua e não como adesivo colado no
       vidro. 16,5 é o zoom de rua, onde o prédio tem o tamanho do desenho.
     · PISO 0,55 (≈9×10 px): abaixo disso ele vira mancha — some debaixo do
       próprio dedo que ia tocar nele.
     · TETO 1,80 (≈29×32 px): acima disso ele TAMPA o traço da rota e a parada
       da vez. A rota é o trabalho; a empresa é a oferta — a oferta nunca
       cobre o trabalho.
     · `perto` faz empresa longe nascer menor (35% menor a 300 m ou mais). É o
       "empresa longe = menor" com o mapa ainda deitado: quando a câmera
       ganhar inclinação, a perspectiva soma, não briga.

     O RÓTULO não escala: prédio é mundo, nome é interface. Nome que encolhe
     com o zoom fica ilegível justo quando há mais deles na tela.
     ------------------------------------------------------------------------ */
  /* O CONTRATO DO SEAM, pra leva do backend não ter que adivinhar. Cada item
     de `usarDados('mapa', { empresas: [...] })`:

       id      obrigatório pro GANCHO — sem ele o prédio aparece e NÃO é
               clicável (é a lei "o gancho nasce do dado"), que é o certo
               enquanto não houver o que abrir;
       nome    o que é digitado em cima do prédio;
       lat/lng sem elas o prédio não é posicionado — a tela não inventa lugar;
       distM   metros até a parada (vem do `ProspectoRota.distM`) — é o que
               faz a de longe nascer menor;
       aceso   o prospector decidiu acender AGORA (o "3 a 5 vezes no dia");
       ordem   fila das 6 janelas, ex. [0,3,1,5,2,4] — uma por prédio, senão
               os prédios piscam em coro;
       atraso  escalona quem acende primeiro quando duas acendem juntas.

     Faltou campo? o desenho tem padrão pra todos MENOS nome/lat/lng — e sem
     esses três a empresa simplesmente não entra na tela. */
  const EMP_ZOOM_BASE = 16.5;
  const EMP_ESC_PISO = 0.55;
  const EMP_ESC_TETO = 1.8;
  const EMP_DIST_CHEIA = 300;

  /* ------------------------------------------------------------------------
     🔴 A EMPRESA NASCE PELO TEMPO DE VIAGEM, E SÓ COM O MUNDO JÁ DEITADO
     (ordem do dono, 09/08: *"as empresas do prospect não têm q aparecer nesse
     gráfico, elas aparecem quando CHEGA no 3d, e chega PERTO da empresa"*).

     O que havia aqui era meia régua: a empresa nascia no ar no MESMO quadro em
     que o dado chegava e a única pergunta era "já passou?". MEDIDO na bancada,
     no toque do Navegar: 16 prédios no DOM e **12 na tela aos 233 ms** — em
     cima da maquete da cena, com o mapa de verdade ainda invisível, e
     atravessando a vista de cima inteira e os 2,4 s da descida. Eram também
     **51 das 88 animações** do pico da entrada (sem eles: 37, e a tela assenta
     em 60 fps aos 1,4 s em vez de dar buracos de 0 fps).

     Agora são as DUAS travas que a V4 tem e a fusão não trouxe:

     1. A TRAVA DA CÂMERA (`cameraEntrando`) — com o mundo em pé ou descendo,
        NENHUM prédio existe. A moldura de tela sozinha nunca resolveria isto:
        na vista de cima o dia inteiro cabe na tela, então "quem está na
        moldura" é TODO MUNDO. O prospector é peça do 3D.
     2. A RÉGUA DE TEMPO (`REGUA`/`TRAVA`, cópia fiel da V4:784) — o prédio
        nasce ~34 s à frente, é varrido aos 22 s, ACENDE aos 20 s, se despede
        5 s depois de ficar pra trás e some aos 22 s. Em metros isso vira
        170-320 m (a `TRAVA`), que é o "chega perto da empresa" — parado ou a
        pé, o piso de 8 m/s faz a régua virar distância pura.

     A fase só ANDA PRA FRENTE e mora num Map por identidade, não no elemento:
     todo repinte troca o `.emp` por um nó novo, e estado guardado no nó morre
     junto (é a mesma lei do `empresasPassadas` que este bloco substitui).

     🔴 QUEM ACENDE CONTINUA SENDO O SERVIDOR. A régua decide QUANDO; o `aceso`
     do payload decide QUEM (§ `aplicarProspector`). Prédio sem `aceso` faz o
     caminho todo e fica no ar apagado — nunca ganha rótulo.
     ------------------------------------------------------------------------ */
  const REGUA = { nasce: 34, varre: 22, acende: 20, despede: -5, some: -22 };  // segundos
  const TRAVA = { min: 170, max: 320 };                                        // metros
  const EMP_VREF_MIN = 8;        // m/s — o piso da V4: parado, a régua é distância
  /** identidade da empresa → fase 0..5 (0 = nem nasceu, 5 = já sumiu) */
  const empresasFase = new Map();

  /** true = a câmera ainda está ENTRANDO na tela (em pé, ou descendo pro 3D) */
  function cameraEntrando() {
    // `camFase` é declarado adiante (§7d-bis): antes dele existir, ninguém
    // entrou em tela nenhuma — e a resposta honesta é "não estou entrando".
    try { return camFase === 'cima' || camFase === 'descendo'; } catch (_) { return false; }
  }

  /** os limiares desta passada — `null` quando não dá pra saber onde é a frente */
  function reguaDaViagem() {
    const fix = ultimoFix;
    if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return null;
    // 🔴 O RUMO É O DA TELA, não o `rumoConfiavel` cru: andando é o aparelho,
    // parado é a ROTA (§ rumoDaTela). Com o cru, o carro no farol perdia a
    // noção de frente e a régua congelava até ele arrancar.
    const rumo = rumoDaTela();
    if (rumo == null) return null;
    const v = Math.max(EMP_VREF_MIN, Number.isFinite(fix.velMps) && fix.velMps > 0 ? fix.velMps : 0);
    const lim = (s) => Math.max(TRAVA.min, Math.min(TRAVA.max, v * s));
    return {
      fix,
      rad: (rumo * Math.PI) / 180,
      kx: 111320 * Math.cos((fix.lat * Math.PI) / 180),
      nasce: lim(REGUA.nasce), varre: lim(REGUA.varre), acende: lim(REGUA.acende),
      // despedir e sumir têm régua própria na V4 (40-90 m e 150-320 m)
      despede: -Math.max(40, Math.min(90, v * -REGUA.despede)),
      some: -Math.max(150, Math.min(320, v * -REGUA.some)),
    };
  }

  /** a fase de agora — ela só ANDA PRA FRENTE, nunca volta */
  function faseDaEmpresa(el, lat, lng, r) {
    const chave = el.dataset.empresa || `${lat},${lng}`;
    let fase = empresasFase.get(chave) || 0;
    if (r) {
      // equiretangular basta nesta escala; `d` é a distância À FRENTE, com
      // sinal: positiva ainda por chegar, negativa já pra trás.
      const dx = (lng - r.fix.lng) * r.kx;
      const dy = (lat - r.fix.lat) * 110540;
      const d = (dx * Math.sin(r.rad)) + (dy * Math.cos(r.rad));
      /* 🔴 A FASE É A QUE A DISTÂNCIA MANDA, NÃO A PRÓXIMA DA FILA. A V4 anda um
         degrau por quadro porque lá toda empresa entra pela frente do corredor,
         sempre longe. Aqui a lista chega DE UMA VEZ, com metade já ao lado ou
         atrás — e subir de um em um fazia essas passarem por "acesa" durante um
         quadro cada antes de sumir. Um quadro de convite pra uma empresa que
         ficou pra trás é exatamente o pisca que esta leva veio matar. Quem vem
         de longe continua vendo os degraus na ordem: eles ficam segundos de
         distância um do outro. */
      let alvo = 0;
      if (d <= r.some) alvo = 5;
      else if (d <= r.despede) alvo = 4;
      else if (d <= r.acende) alvo = 3;
      else if (d <= r.varre) alvo = 2;
      else if (d <= r.nasce) alvo = 1;
      if (alvo > fase) fase = alvo;
      empresasFase.set(chave, fase);
    }
    return fase;
  }

  /* O `aceso` do servidor chega no elemento como a classe `on` do template, e
     a régua tira essa classe até a hora certa — então ele é lido UMA vez, no
     primeiro contato com o nó (que é sempre antes do primeiro quadro: o
     observador roda em microtarefa, antes de o navegador pintar). */
  function empresaAcesa(el) {
    if (!el.__hbxAceso) el.__hbxAceso = el.classList.contains('on') ? 1 : -1;
    return el.__hbxAceso === 1;
  }

  /** veste o prédio com o estado da fase — nada aqui pinta, só classifica */
  function vestirFase(el, fase, aceso) {
    el.classList.toggle('no-ar', fase >= 1 && fase < 5);
    el.classList.toggle('nasce', fase >= 1);
    el.classList.toggle('varrendo', fase >= 2);
    el.classList.toggle('on', fase >= 3 && aceso);
    el.classList.toggle('passou', fase >= 4);
  }

  /** tira TODO prédio da tela — a entrada da navegação não tem prospector */
  function recolherEmpresas(alvos) {
    alvos.forEach((el) => {
      /* 🔴 LER O `aceso` ANTES DE APAGAR A CLASSE QUE O CARREGA. O template
         escreve o `aceso` do servidor como a classe `on`, e é dela que sai o
         `__hbxAceso`. Recolhendo primeiro, o primeiro contato com o nó já o via
         sem `on` e o gravava como "não acende" PRA SEMPRE: a empresa fazia o
         caminho inteiro da régua e chegava muda na frente do motorista.
         Pego pela prova (1.4), não pela tela — na tela ela só some. */
      empresaAcesa(el);
      el.classList.remove('no-ar', 'nasce', 'varrendo', 'on', 'passou', 'mudo');
      if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
    });
  }

  /* ------------------------------------------------------------------------
     🔴 O RÓTULO NÃO PODE SUBIR EM CIMA DO VIZINHO (08/08, medido no print).

     O desenho do V4 tinha TRÊS empresas espalhadas na tela (30%, 61%, 78%). A
     rua real não é assim: as 8 empresas que o corredor achou em produção estão
     a 74 m umas das outras, e a 16,6 de zoom (`NAV_ZOOM`) 74 m são ~50 px.
     Chip de nome tem ~250 px. MEDIDO no primeiro print com dado de verdade: 4
     nomes empilhados, um por cima do outro, ILEGÍVEIS — e ilegível na tela de
     quem está dirigindo é pior que ausente, porque ainda ocupa o lugar.

     As duas alavancas já existiam na folha e ninguém escrevia nelas:
       · `--rx` — o empurrão que segura o chip dentro da tela na borda (o fio
         guia leva o empurrão INVERTIDO e continua apontando pro prédio);
       · `.mudo` — apaga SÓ o rótulo, o prédio fica aceso e clicável.
     Então isto é geometria de câmera, como o resto desta seção: nada de CSS
     novo, nada de tocar no desenho.

     A ORDEM DE PRIORIDADE é a mesma régua do servidor, mais o dedo na frente:
       1. quem o motorista ACABOU de tocar — o dedo ganha do algoritmo, senão
          encostar num prédio acenderia um nome que não aparece;
       2. a mais PERTO (é a régua do `ordenarParaAcender`, lá no backend);
       3. o CNPJ, pra empate não virar sorteio da ordem do DOM.
     ------------------------------------------------------------------------ */
  const ROTULO_CROMO = 34;     // padding + gap + ponto + borda do chip do nome
  const ROTULO_ALT = 26;       // altura do chip com folga
  const ROTULO_MARGEM = 8;     // respiro até a borda da tela
  const ROTULO_AR = 6;         // ar mínimo entre dois chips vizinhos
  /** quem o dedo tocou por último — prioridade 1 na hora de brigar por espaço */
  let empresaDoDedo = null;

  /* Largura do chip MEDIDA UMA VEZ por elemento e guardada nele.
     · `scrollWidth` do `.emp-nome` é imune à digitação (a animação mexe na
       largura VISÍVEL; o conteúdo continua inteiro por baixo do `overflow`) —
       medir o `offsetWidth` daria o nome pela metade no meio da cena.
     · Uma vez por elemento porque o repinte cria elementos NOVOS: medir a cada
       `move` do mapa seria layout síncrono 60 vezes por segundo. */
  function larguraDoRotulo(el) {
    if (el.__hbxRotuloW) return el.__hbxRotuloW;
    const nome = el.querySelector('.emp-nome');
    if (!nome) return 0;
    const w = nome.scrollWidth + ROTULO_CROMO;
    if (w > ROTULO_CROMO) el.__hbxRotuloW = w;
    return w;
  }

  function deconflitarRotulos(postos, largura) {
    // só briga por espaço quem MOSTRA rótulo: apagada e "passou" já são
    // opacidade 0 na folha, e marcá-las de `mudo` não mudaria nada na tela.
    const naFila = postos.filter((p) => p.el.classList.contains('on') && !p.el.classList.contains('passou'));
    postos.forEach((p) => {
      if (naFila.indexOf(p) !== -1) return;
      p.el.classList.remove('mudo');
      p.el.style.zIndex = '';
    });
    naFila.sort((a, b) => {
      const dedo = (p) => (String(p.el.dataset.empresa || '') === empresaDoDedo ? 0 : 1);
      if (dedo(a) !== dedo(b)) return dedo(a) - dedo(b);
      const dist = (Number(a.el.dataset.dist) || 0) - (Number(b.el.dataset.dist) || 0);
      if (dist) return dist;
      return String(a.el.dataset.empresa) < String(b.el.dataset.empresa) ? -1 : 1;
    });
    const ocupados = [];
    const bateEm = (a) => ocupados.some((o) => a.e < o.d + ROTULO_AR && a.d > o.e - ROTULO_AR
      && a.c < o.b + ROTULO_AR && a.b > o.c - ROTULO_AR);
    naFila.forEach((p, rank) => {
      const w = larguraDoRotulo(p.el);
      const meio = w / 2;
      // borda da tela primeiro: o empurrão MUDA a caixa, então tem que entrar
      // antes de perguntar se ela bate em alguém.
      let rx = 0;
      if (largura > 0) {
        if (p.x - meio < ROTULO_MARGEM) rx = ROTULO_MARGEM - (p.x - meio);
        else if (p.x + meio > largura - ROTULO_MARGEM) rx = largura - ROTULO_MARGEM - (p.x + meio);
      }
      const cx = p.x + rx;
      // o chip mora `56*esc + 8` ACIMA da âncora (a mesma conta do `bottom` da
      // folha) — a `.emp` tem altura 0, então a âncora é o pé do prédio.
      const cy = p.y - (56 * p.esc + 8) - ROTULO_ALT / 2;
      const caixa = { e: cx - meio, d: cx + meio, c: cy - ROTULO_ALT / 2, b: cy + ROTULO_ALT / 2 };
      const bate = bateEm(caixa);
      p.el.classList.toggle('mudo', bate);
      /* 🔴 O EMPILHAMENTO SEGUE A PRIORIDADE, e é isso que fecha o segundo
         defeito do print: os `.emp` são IRMÃOS no DOM, então quem vem depois
         pinta por cima — e a lista vem do servidor em ordem de distância, então
         o prédio da empresa mais LONGE tapava o nome da mais PERTO ("APARECIDO
         A███S DOS SANTOS", metade da razão social atrás de um telhado).
         Com z decrescendo por rank, o nome de quem tem prioridade fica acima de
         todo prédio que vier depois; e o contrário quase não existe, porque na
         câmera inclinada prédio mais perto é mais BAIXO na tela e nome mais
         longe é mais ALTO. O que sobra desse "quase" é o `ocupados` abaixo. */
      p.el.style.zIndex = bate ? '' : String(90 - rank);
      if (bate) return;
      ocupados.push(caixa);
      // O PRÉDIO DE QUEM JÁ FALOU TAMBÉM OCUPA LUGAR: ele tem z MAIOR que o dos
      // próximos da fila, então vai pintar por cima do rótulo deles. Quem vem
      // depois desvia — ou cala. (Os prédios de quem NÃO fala não entram: o
      // z-index levanta quem tem rótulo por cima deles, e prédio mudo tapado é
      // só profundidade.) Geometria do desenho: `.emp-obj` é `left:-30 top:-56
      // 60x64` escalado por `--esc` em cima da âncora.
      ocupados.push({
        e: p.x - 30 * p.esc, d: p.x + 30 * p.esc,
        c: p.y - 56 * p.esc, b: p.y + 8 * p.esc,
      });
      p.el.style.setProperty('--rx', `${rx.toFixed(1)}px`);
    });
  }

  function posicionarEmpresas() {
    const palco = naCamada('[data-mapa]');
    const mapa = palco && palco.__hbxMapaObj;
    const cena = palco && palco.parentElement;
    if (!mapa || !cena) return;
    // 🔴 `.emp[data-lat]`: sem coordenada não há o que projetar. O desenho
    // posiciona por porcentagem e não tem `data-lat` — por isso o mock não é
    // afetado por nada daqui, e o portão de pixel segue byte a byte.
    const alvos = cena.querySelectorAll('.emp[data-lat]');
    if (!alvos.length) return;
    /* 🔴 A RÉGUA DE VIAGEM É DE QUEM ESTÁ VIAJANDO. Ela vale no palco do GPS —
       lá existe rumo, velocidade e "à frente". No mapa de planejar (o palco
       `geral`, visto de cima e sem motorista) não existe frente nenhuma: quem
       manda ali continua sendo só a moldura da tela. Sem esta pergunta, uma
       empresa desenhada na tela da Rota nasceria em fase 0 e não apareceria
       nunca — sumida sem que nada na tela explicasse por quê. */
    const naNavegacaoAqui = palco.dataset && palco.dataset.mapa === 'gps';
    /* 🔴 A ENTRADA DA TELA NÃO TEM PROSPECTOR (dono, 09/08). Sai ANTES de
       projetar: a conta cara desta função não é a matemática, é medir chip,
       escrever estilo e brigar por rótulo — e nos 4,5 s de cena + vista de
       cima + descida isso rodava a cada quadro, por 16 prédios que nem podiam
       estar ali. */
    if (naNavegacaoAqui && cameraEntrando()) {
      recolherEmpresas(alvos);
      cromoDoProspector(cena, 0);
      return;
    }
    let zoom;
    try { zoom = mapa.getZoom(); } catch (_) { return; }
    if (!Number.isFinite(zoom)) return;
    /* 🔴 A MOLDURA DECIDE QUEM TRABALHA (item 9 do dono, 09/08: "carrega só o
       quadrado ao redor — jogos, placas fracas, carregam mais perto"; é a
       régua da V4:1315, que a fusão não trouxe). Projetar é matemática
       barata; o caro é medir chip, escrever estilo e brigar por rótulo — e
       isso só quem está na moldura paga. Folgas da V4 (±110 na largura,
       -70/+80 na altura): prédio meio-dentro ainda aparece, quem some não
       pisca na borda. Fora da moldura o elemento fica visibility:hidden — o
       estado de cena (aceso/passou) CONGELA e volta intacto com a câmera. */
    const larg = cena.clientWidth || 0;
    const alt = cena.clientHeight || 0;
    const dentroDaMoldura = [];
    const esconder = [];
    /* 🔴 A FASE É DA VIAGEM, NÃO DA TELA — e por isso ela anda pra TODO prédio,
       inclusive o que está fora da moldura. Amarrar a fase à moldura deixaria o
       prédio que ficou pra trás congelado em "aceso": ele voltaria pra tela
       numa curva ainda convidando, como se o motorista não tivesse passado. */
    const regua = naNavegacaoAqui ? reguaDaViagem() : null;
    alvos.forEach((el) => {
      const lat = Number(el.dataset.lat); const lng = Number(el.dataset.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (naNavegacaoAqui) {
        const fase = faseDaEmpresa(el, lat, lng, regua);
        vestirFase(el, fase, empresaAcesa(el));
        // o filtro da V4:1312 (`fase>0 && fase<5`): quem ainda não nasceu não
        // ocupa quadro nenhum. Quem já sumiu ainda é projetado UM ciclo — é o
        // fade de saída acontecendo no lugar certo, não um corte.
        if (fase === 0) { if (el.style.visibility !== 'hidden') esconder.push(el); return; }
      }
      let ponto;
      try { ponto = mapa.project([lng, lat]); } catch (_) { return; }
      const fora = ponto.x < -110 || ponto.x > larg + 110 || ponto.y < -70 || ponto.y > alt + 80;
      if (fora) { if (el.style.visibility !== 'hidden') esconder.push(el); return; }
      dentroDaMoldura.push({ el, ponto, lat, lng });
    });
    // LER ANTES DE ESCREVER, e só de quem vai aparecer: a medida do chip é a
    // única leitura de layout daqui, toda de uma vez antes da 1ª escrita.
    // Intercalar leitura e escrita aqui é reflow síncrono a cada quadro.
    dentroDaMoldura.forEach((p) => larguraDoRotulo(p.el));
    const porZoom = Math.pow(2, zoom - EMP_ZOOM_BASE);
    const postos = [];
    esconder.forEach((el) => { el.style.visibility = 'hidden'; });
    dentroDaMoldura.forEach(({ el, ponto, lat, lng }) => {
      if (el.style.visibility) el.style.visibility = '';
      const dist = Number(el.dataset.dist) || 0;
      const perto = 1 - 0.35 * Math.min(1, dist / EMP_DIST_CHEIA);
      const esc = Math.min(EMP_ESC_TETO, Math.max(EMP_ESC_PISO, porZoom * perto));
      el.style.setProperty('--x', `${ponto.x.toFixed(1)}px`);
      el.style.setProperty('--y', `${ponto.y.toFixed(1)}px`);
      el.style.setProperty('--esc', esc.toFixed(3));
      postos.push({ el, x: ponto.x, y: ponto.y, esc });
    });
    deconflitarRotulos(postos, larg);
    if (naNavegacaoAqui) cromoDoProspector(cena, postos.length);
  }

  /* 🔴 "EMPRESAS POR PERTO" SÓ EXISTE QUANDO HÁ EMPRESA POR PERTO. O chip, a
     linha de varredura e o radar do ponteiro nasciam de `empresas.length` — a
     LISTA do dia, que tem 16 e não muda o dia inteiro. Com a régua de viagem
     isso virou promessa falsa na cara do motorista: o app dizendo "por perto"
     com a tela vazia, porque as 16 ainda estavam a quilômetros. Agora os três
     seguem o mesmo fato que os prédios seguem — quantos estão NO AR. */
  function cromoDoProspector(cena, quantas) {
    const some = (el) => {
      if (!el) return;
      const alvo = quantas > 0 ? '' : 'hidden';
      if (el.style.visibility !== alvo) el.style.visibility = alvo;
    };
    some(cena.querySelector('.emp-chip'));
    some(cena.querySelector('.emp-scan'));
    some(cena.querySelector('.emp-radar'));
  }

  /* 🔴 REPINTE NÃO RECOMEÇA A CENA DE QUEM JÁ ACENDEU — é a Lei nº10 desta
     frente no tamanho desta tela. Acender a 2ª empresa repinta a seção, e a
     1ª nasceria de novo apagada pra re-digitar o nome do zero: o app com cara
     de que descobriu duas vezes a mesma coisa. Quem já estava aceso chega no
     FIM da cena. A respiração do halo é infinita e não se "termina" — ela
     fica rodando, que é o certo. */
  function encerrarCenaDe(jaAcesas) {
    if (!jaAcesas || !jaAcesas.size) return;
    document.querySelectorAll('.emp.on[data-empresa]').forEach((el) => {
      if (!jaAcesas.has(String(el.dataset.empresa))) return;
      let anims = [];
      try { anims = el.getAnimations({ subtree: true }); } catch (_) { return; }
      anims.forEach((a) => {
        try {
          if (a.effect && a.effect.getTiming().iterations === Infinity) return;
          a.finish();
        } catch (_) { /* animação que não termina fica onde está */ }
      });
    });
  }

  /* O GESTO. Encostar num prédio ACENDE ele na hora — é a "prioridade de
     usuário" do §F1 do plano do prospector, e é a única parte que não depende
     de servidor nenhum: a empresa já está na tela, o toque só antecipa o que
     o prospector faria sozinho.
     ⬜ A FALA (`HBX.speak`) e o "abrir lead" — que DEBITA 1 crédito e cria o
     lead na mesa do /vendas — são a leva seguinte, junto com o backend. Botão
     que cobra não nasce antes da porta que cobra. */
  function acenderEmpresa(id) {
    if (!id || typeof window.usarDados !== 'function') return;
    let lista;
    try { lista = ((DADOS.mapa || {}).empresas) || []; } catch (_) { return; }
    const antes = new Set(lista.filter((e) => e.aceso && e.id).map((e) => String(e.id)));
    /* 🔴 O DEDO GANHA DO ALGORITMO, e ANTES do atalho de baixo. Sem isto o
       prédio acendia e o nome dele podia sair `mudo` por causa de um vizinho
       mais perto — encostar e não ler nada é o pior desfecho possível deste
       gesto. Pior ainda no caso da empresa que JÁ ESTAVA acesa e calada: o
       `return` abaixo saía sem fazer NADA, e o toque virava um clique morto. */
    empresaDoDedo = String(id);
    /* 🔴 O DEDO TAMBÉM ADIANTA A RÉGUA. Sem esta linha, encostar num prédio que
       a viagem ainda não acendeu (fase 1 ou 2) mandava `aceso` pro seam e a
       fase seguinte tirava a classe `on` de volta no quadro seguinte: o toque
       acendia e apagava. Quem o motorista escolhe está aceso, ponto. */
    if ((empresasFase.get(String(id)) || 0) < 3) empresasFase.set(String(id), 3);
    if (antes.has(String(id))) {
      // já acesa: o toque não re-encena a cena (Lei nº10) — mas re-decide QUEM
      // fala, que é a única coisa que ele ainda pode entregar.
      posicionarEmpresas();
      return;
    }
    window.usarDados('mapa', {
      empresas: lista.map((e) => (String(e.id) === String(id) ? Object.assign({}, e, { aceso: true }) : e)),
    });
    requestAnimationFrame(() => { encerrarCenaDe(antes); posicionarEmpresas(); });
  }

  /* ------------------------------------------------------------------------
     7c. L3b — O CROMO DA NAVEGAÇÃO COM FONTE (§4.1 do PR07082026).

     O seam `DADOS.gps` já existe e já nasce VAZIO (ver `apagarDemonstracao`).
     Esta seção é quem o enche, das três fontes que o plano nomeia:

       · `navigator.geolocation` → velocidade, rumo e a precisão do GPS;
       · `ENTREGAS`             → parada N de M, nome, endereço e o que falta;
       · `/logistica/osrm/route` → a manobra (distância, verbo, rua, o depois)
                                   e o total (chegada, restante, distância).

     🔴 O QUE NÃO TEM FONTE NÃO É ESCRITO. Toda função daqui devolve '' quando
     não sabe, e o template do mock some com o pedaço. É a régua do §4.6.5, e
     é ela que faz esta tela poder abrir só com o mapa e o Encerrar.

     🔴 "VOCÊ ESTÁ NA PORTA" MORREU COM A DEMONSTRAÇÃO, DE PROPÓSITO. Era um
     VEREDITO (irmão do selo "Tudo certo!" que o §4.6.5 matou) e não tem porta
     que o emita. `chegouPrecisao` diz o fato que o aparelho mede — "GPS ±6 m"
     — e nada além. Quem já diz que chegou é o título da tela.
     ------------------------------------------------------------------------ */
  const R_TERRA = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  /** metros entre dois {lat,lng} */
  function metrosEntre(a, b) {
    if (!a || !b) return Infinity;
    const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2
      + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R_TERRA * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  /** 240 m · 1,2 km — a mesma régua do `distancia()` da lista de paradas */
  const emMetros = (m) => (!(m >= 0) ? ''
    : (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`));

  /* 🔴 A DISTÂNCIA DA MANOBRA É ARREDONDADA, E POR DUAS RAZÕES.
     1) HONESTIDADE: o GPS deste aparelho mede com ±20 m (medido: precisão 19,6 m).
        Escrever "89 m" é precisão falsa — todo GPS do mundo arredonda.
     2) O PISCA (cena do dono, 08/08: "a imagem está piscando, tá bugado"):
        `pintar()` do mock monta uma CAMADA NOVA a cada mudança do seam
        (`innerHTML = render()`), e a camada nova traz um palco de mapa novo,
        que obriga o transplante do mapa. Com a distância mudando de metro em
        metro, isso acontecia UMA VEZ POR SEGUNDO — medido no g15: 88 m -> 89 m
        -> 89 m, um repinte por segundo com a tela na cara de quem dirige.
     Degraus: 10 m perto, 50 m no quarteirão, 0,1 km na estrada. */
  const emMetrosDaManobra = (m) => {
    if (!(m >= 0)) return '';
    if (m >= 1000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
    const passo = m < 100 ? 10 : 50;
    return `${Math.max(passo, Math.round(m / passo) * passo)} m`;
  };
  /** 45 min · 1 h 20 — acima de uma hora "95 min" não é jeito de ler tempo */
  const emMinutos = (s) => {
    if (!(s >= 0)) return '';
    const min = Math.max(1, Math.round(s / 60));
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  };
  const maiuscula = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
  /* 8 rumos, em português: Leste é L e Oeste é O (N/S/L/O é o que está escrito
     em toda bússola daqui — E de "East" seria tradução pela metade). */
  const ROSA = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const cardeal = (g) => (Number.isFinite(g) ? ROSA[Math.round(((g % 360) + 360) % 360 / 45) % 8] : '');

  /* 🔴 A TABELA DE MANOBRA É A DO APP QUE JÁ RODA (`osrmStepInstrucao` do
     app.js, S5 21/07), COPIADA SEM UMA PALAVRA NOVA. Dois fronts do mesmo
     produto não podem falar dialetos diferentes na hora de mandar virar. E ela
     é MÍNIMA de propósito (Lei 8): manobra fora da tabela devolve NADA e o
     passo é descartado — inventar copy de navegação é pior que ficar quieto.
     O ícone vem do mesmo lugar da frase, senão a seta e o texto discordam. */
  function manobraDoPasso(passo) {
    const m = (passo && passo.maneuver) || {};
    const tipo = String(m.type || '');
    const mod = String(m.modifier || '');
    // 🔴 NOME DE RUA É TEXTO DE TERCEIRO (vem do OSM) e o template do mock
    // interpola CRU — mesma lei do nome de cliente lá em cima (§L1). Uma rua
    // com "<" quebraria a marcação e o cartão da manobra sumiria sem erro
    // nenhum, na tela de quem está dirigindo. Escapa na FONTE.
    const rua = esc(String((passo && passo.name) || '').trim());
    const saida = (verbo, icone) => ({ verbo, icone, rua });
    if (tipo === 'arrive') return saida('você chegou', 'check');
    if ((tipo === 'roundabout' || tipo === 'rotary') && Number.isFinite(Number(m.exit))) {
      return saida(`na rotatória, pegue a ${Math.trunc(Number(m.exit))}ª saída`, 'nav');
    }
    if (mod === 'slight left') return saida('mantenha-se à esquerda', 'curvaEsquerda');
    if (mod === 'slight right') return saida('mantenha-se à direita', 'curvaDireita');
    if (tipo === 'turn' && mod === 'left') return saida('vire à esquerda', 'curvaEsquerda');
    if (tipo === 'turn' && mod === 'right') return saida('vire à direita', 'curvaDireita');
    if (tipo === 'continue' || tipo === 'new name') {
      return saida(rua ? `continue na ${rua}` : 'continue', 'nav');
    }
    return null;
  }

  /* ---- A POSIÇÃO ---------------------------------------------------------
     O `watchPosition` que já existia guardava só lat/lng (o mapa precisava do
     centro). Agora ele guarda o fix INTEIRO, porque velocidade, rumo e
     precisão são three campos da tela — e são os únicos que não custam rede. */
  let ultimoFix = null;
  /* 🔴 RUMO PARADO É RUÍDO — a lição já paga no app que roda (`navBearingConfiavel`).
     No farol o aparelho reporta qualquer coisa; mostrar "SO" com o carro parado
     é a bússola mentindo, e o mesmo número ainda vai restringir a saída no
     pedido de rota. Abaixo de ~9 km/h não se fala em rumo. */
  const RUMO_VELOCIDADE_MIN_MPS = 2.5;
  const rumoConfiavel = (fix) => (fix && Number.isFinite(fix.velMps) && fix.velMps >= RUMO_VELOCIDADE_MIN_MPS
    && Number.isFinite(fix.rumoGraus) ? fix.rumoGraus : null);

  /* ---- O PEDIDO DE ROTA, COM FREIO ---------------------------------------
     🔴 O RETRAÇO É O QUE JÁ CUSTOU UMA MADRUGADA (§4.1). As três regras:

       1. o resultado guardado leva o CARIMBO da entrada que o gerou. Trocou a
          rota, trocou a assinatura — traço velho não sobrevive à troca;
       2. UM pedido em voo por vez, intervalo mínimo, e recalcula antes da hora
          só se o carro andou de verdade;
       3. orçamento: backoff quando a fonte falha e TETO POR DIA. Roteador em
          laço é conta de servidor e bateria de motorista.

     Entre dois pedidos a manobra NÃO congela: a distância até a curva é
     recalculada do fix atual contra o ponto da manobra, que já veio na
     resposta. É de graça e é o que faz a tela parecer um GPS em vez de um
     cartaz que troca de minuto em minuto. */
  const NAV_INTERVALO_MS = 15000;      // piso entre dois pedidos
  const NAV_ANDOU_M = 120;             // andou isto ⇒ pode pedir antes da hora
  const NAV_TETO_DIA = 400;            // teto por dia operacional
  const NAV_BACKOFF_MS = [2000, 5000, 15000, 60000];
  let navRota = null;                  // { assinatura, passos, totalM, totalS, em }
  let navPedindo = false;
  let navUltimoPedidoEm = 0;
  let navUltimaOrigem = null;
  let navFalhas = 0;
  let navGastoDia = { dia: '', n: 0 };

  const navGastar = () => {
    const dia = diaOperacional();
    if (navGastoDia.dia !== dia) navGastoDia = { dia, n: 0 };
    if (navGastoDia.n >= NAV_TETO_DIA) return false;
    navGastoDia.n += 1;
    return true;
  };

  /** as paradas que ainda faltam, na ordem, com pino */
  function paradasPendentes() {
    const lista = [];
    ENTREGAS.forEach((reg) => {
      const it = reg.item || {};
      const s = String(it.status || '');
      if (s === 'entregue' || s === 'cancelada') return;
      lista.push({ n: reg.n, item: it });
    });
    return lista.sort((a, b) => a.n - b.n);
  }
  const pinoDa = (it) => {
    const c = (it && it.cliente) || {};
    // mesma régua do resto do app: zero não é pino, meia coordenada não é pino.
    return pinoValido(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : null;
  };

  /* ---- O ANEL DO "TÔ CHEGANDO" -------------------------------------------
     🔴 A CHAVE EXISTIA E O AVISO NÃO SAÍA — a corrente estava CORTADA no meio.
     No app que já roda ela tem três elos: o geofence nativo dispara
     `hbx:arrival`, o `hbx:arrival` chama `POST /logistica/entregas/:id/chegando`
     e só então o servidor manda o WhatsApp pro cliente. O app novo não tem
     geofence nativo (a folha abre no TOQUE) e ninguém chamava o `chegando` —
     então `avisoChegandoEnabled` era uma chave que gravava no banco e não
     produzia aviso nenhum. Ligar a chave sem religar a corrente seria entregar
     a mentira com a cara arrumada.

     O anel é o que o backend PEDE ("o app só arma o anel de ~500m quando isto é
     true"): a cada fix do GPS, parada pendente com pino dentro do raio ganha UM
     POST. A marcação é feita ANTES da ida e nunca é desfeita — o servidor é a
     autoridade de idempotência (claim race-safe em `avisoChegandoAt`) e o
     controller responde `{ok:true}` sempre, de propósito, pra que o app não
     tenha o que reenviar. Cliente que reenvia é o começo de todo loop.
     ------------------------------------------------------------------------ */
  let avisoChegandoAtivo = false;
  let avisoChegandoRaioM = 500;
  const jaAvisados = new Set();

  function anelDeChegada() {
    if (!avisoChegandoAtivo || !ultimaPos || !temPonte()) return;
    paradasPendentes().forEach((p) => {
      const id = String((p.item && p.item.id) || '');
      if (!id || jaAvisados.has(id)) return;
      const pino = pinoDa(p.item);
      if (!pino || metrosEntre(ultimaPos, pino) > avisoChegandoRaioM) return;
      jaAvisados.add(id);
      // Best-effort de verdade: não trava a rota, não avisa a tela, não repete.
      window.API.post(`/logistica/entregas/${encodeURIComponent(id)}/chegando`, {}).catch(() => {});
    });
  }

  /** `lng,lat;lng,lat;…` — origem + as paradas que faltam, na ordem da rota */
  function coordenadasDaNavegacao() {
    if (!ultimoFix) return null;
    const pontos = [{ lat: ultimoFix.lat, lng: ultimoFix.lng }];
    paradasPendentes().forEach((p) => { const pino = pinoDa(p.item); if (pino) pontos.push(pino); });
    if (pontos.length < 2) return null;
    return pontos.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  }

  /* Direção no pedido — a lição de 30/07 do dono ("vc não retraça a rota"):
     sem `bearings` o roteador acha que dá pra sair do ponto pra qualquer lado e
     manda fazer o retorno no meio da avenida. Grau de 15 em 15 pra bússola
     tremendo não gerar assinatura nova a cada fix. */
  const BEARING_TOLERANCIA = 60;
  function bearingsDe(rumo, pontos) {
    if (rumo == null || pontos < 2) return '';
    const grau = ((Math.round(rumo / 15) * 15) % 360 + 360) % 360;
    return `${grau},${BEARING_TOLERANCIA}${';'.repeat(pontos - 1)}`;
  }

  async function pedirRota() {
    if (navPedindo || !temPonte()) return;
    const coords = coordenadasDaNavegacao();
    if (!coords) return;
    const rumo = rumoConfiavel(ultimoFix);
    const bearings = bearingsDe(rumo, coords.split(';').length);
    const assinatura = `${coords}#${bearings}`;
    const agora = Date.now();
    const andou = navUltimaOrigem ? metrosEntre(navUltimaOrigem, ultimoFix) : Infinity;
    const esperar = navFalhas ? NAV_BACKOFF_MS[Math.min(navFalhas - 1, NAV_BACKOFF_MS.length - 1)] : NAV_INTERVALO_MS;
    if (agora - navUltimoPedidoEm < esperar) return;
    /* 🔴 PARADO NÃO SE REPEDE ROTA — a cena do dono ("ela volta em outro
       estado"). O relógio sozinho mandava um pedido a cada 15 s, e o GPS de
       carro parado BALANÇA (medido no g15: 0 → 8 → 11 → 0 km/h sem sair do
       lugar). Origem tremida = rota tremida: a manobra ia de "91 m, vire à
       direita, Av. Nove" pra "161 m, vire à esquerda, Av. Treze" e VOLTAVA no
       pedido seguinte. Quem manda pedir de novo é ANDAR, não o relógio.
       As paradas são a exceção: mudou o alvo, a rota é outra e o pedido é
       obrigatório (é a ordem da rota, não o tremor do aparelho). */
    const alvos = coords.split(';').slice(1).join(';');
    const trocouAlvo = !navRota || navRota.alvos !== alvos;
    if (!trocouAlvo && andou < NAV_ANDOU_M) return;
    if (navRota && navRota.assinatura === assinatura && agora - navRota.em < NAV_INTERVALO_MS) return;
    if (!navGastar()) return;

    navPedindo = true;
    navUltimoPedidoEm = agora;
    navUltimaOrigem = { lat: ultimoFix.lat, lng: ultimoFix.lng };
    try {
      const alvo = `/logistica/osrm/route?coords=${encodeURIComponent(coords)}&steps=true`
        + (bearings ? `&bearings=${encodeURIComponent(bearings)}` : '');
      const r = await window.API.get(alvo);
      const rota = r && r.code === 'Ok' && r.routes && r.routes[0];
      if (!rota) throw new Error('Rota viária não encontrada.');
      // 🔴 CARIMBO. Sem ele, a resposta que voltou tarde escreve o traço de uma
      // rota que já não é a de agora — e o motorista segue a manobra da rota
      // anterior sem nada na tela dizendo que mudou.
      navRota = {
        assinatura,
        em: Date.now(),
        totalM: Number.isFinite(Number(rota.distance)) ? Number(rota.distance) : null,
        totalS: Number.isFinite(Number(rota.duration)) ? Number(rota.duration) : null,
        passos: passosDaPrimeiraPerna(rota),
        // a fita verde do V4 — vem de graça na mesma resposta (§7d)
        geometria: geometriaDe(rota),
        // as paradas SEM a origem: é o que decide se a rota virou outra
        alvos,
      };
      navFalhas = 0;
      // rota nova = manobras novas: o que já foi dito não vale mais. Sem isto,
      // uma curva que se repete na rota seguinte nasceria muda.
      if (trocouAlvo) vozDitas.clear();
      pintarTraco();
    } catch (_) {
      // 🔴 FALHOU: NÃO APAGA O QUE ESTÁ NA TELA. A manobra de 20 s atrás ainda
      // é melhor que uma tela em branco pra quem está no volante — e a
      // distância até a curva continua sendo recalculada do GPS, de graça.
      navFalhas += 1;
    } finally {
      navPedindo = false;
      pintarNavegacao();
    }
  }

  /** os passos com instrução da 1ª perna (origem → parada da vez) */
  function passosDaPrimeiraPerna(rota) {
    const perna = (rota.legs || [])[0] || {};
    return (perna.steps || []).map((passo) => {
      const m = manobraDoPasso(passo);
      const loc = passo && passo.maneuver && passo.maneuver.location;
      if (!m || !Array.isArray(loc) || loc.length < 2) return null;
      const lng = Number(loc[0]); const lat = Number(loc[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return Object.assign({ lat, lng }, m);
    }).filter(Boolean);
  }

  /* Qual manobra mandar agora: a 1ª ainda À FRENTE. "À frente" aqui é a que
     está a mais de 25 m — passou dela, ela já era, e insistir é o GPS falando
     de uma curva que ficou pra trás. */
  const MANOBRA_PASSOU_M = 25;
  function manobraDaVez() {
    if (!navRota || !ultimoFix) return null;
    // 🔴 a distância até a curva se mede da posição PRESA NA RUA: do fix cru,
    // ela oscilava metros pra cima e pra baixo com o carro parado, e era isso
    // que fazia a manobra trocar de "91 m" pra "161 m" e voltar.
    const eu = posicaoDaTela();
    const passos = navRota.passos || [];
    for (let i = 0; i < passos.length; i += 1) {
      const d = metrosEntre(eu, passos[i]);
      if (d > MANOBRA_PASSOU_M) return { passo: passos[i], distancia: d, depois: passos[i + 1] || null };
    }
    return null;
  }

  /* ---- O QUE MUDA A CADA SEGUNDO NÃO DERRUBA A TELA ----------------------
     🔴 A OUTRA METADE DA PISCADA (08/08). `usarDados` repinta a tela toda vez
     que um campo do seam muda — e repintar monta uma CAMADA NOVA (`innerHTML =
     render()`), que traz um palco de mapa novo, que obriga o transplante. Numa
     tela parada isso é invisível; na tela de DIRIGIR o seam muda o tempo todo:
     a distância da manobra cai de 90 m pra 80 m, o velocímetro anda, o relógio
     da chegada vira o minuto. Era a tela inteira sendo reconstruída na cara de
     quem está no volante.

     A divisão que já existia pro velocímetro e pras empresas do corredor
     ("o DADO passa pelo seam, o que muda a cada quadro NÃO") vira REGRA e ganha
     nome no desenho: `data-vivo`. Campo marcado é TEXTO PURO num nó só — trocar
     esse texto não muda a estrutura da tela, então a ponte escreve no nó e
     atualiza o seam SEM repintar.

     🔴 E SÓ NESSE CASO. Se qualquer outro campo mudou, ou se um campo marcado
     NASCEU (estava vazio) ou MORREU (esvaziou), a estrutura muda de verdade —
     a manobra que aparece, a bússola que sai de cena — e aí quem manda é o
     repinte de sempre. Remendar estrutura no nó é como o front se desencontra
     do desenho; é justamente o que esta casa não faz.

     Com isto a tela de dirigir passa a ser reconstruída quando a MANOBRA muda
     (uma vez por quarteirão), não uma vez por segundo. */
  const CROMO_VIVO = ['manobraDist', 'manobraVerbo', 'velocidade', 'rumo',
    'chegada', 'restante', 'distancia'];
  const comoTexto = (v) => (v == null ? '' : String(v));

  /** true = o seam já está atualizado e a tela não precisa ser repintada */
  function cromoNoNo(novo) {
    if (telaAtual() !== 'mapa') return false;
    const atual = (typeof DADOS !== 'undefined' && DADOS.gps) || null;
    if (!atual) return false;
    const mudou = Object.keys(novo).filter((k) => comoTexto(atual[k]) !== comoTexto(novo[k]));
    if (!mudou.length) return true;                       // nada mudou: nem nó, nem camada
    // campo de fora da lista, ou pedaço nascendo/morrendo ⇒ é estrutura
    if (mudou.some((k) => !CROMO_VIVO.includes(k) || !atual[k] || !novo[k])) return false;
    // os nós TODOS antes de escrever QUALQUER um: escrever meio caminho e
    // desistir deixaria a tela dizendo uma coisa e o seam outra.
    const nos = mudou.map((k) => naCamada(`[data-vivo="${k}"]`));
    if (nos.some((n) => !n)) return false;
    mudou.forEach((k, i) => {
      const t = comoTexto(novo[k]);
      if (nos[i].textContent !== t) nos[i].textContent = t;
    });
    Object.assign(DADOS.gps, novo);
    return true;
  }

