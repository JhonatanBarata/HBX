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
      // `padDoPlano` e não `PLANO_PAD`: a folga é MEDIDA contra o cromo que
      // está no ar (o painel flutuante do 2D cobre 133 px do mapa) — ver a nota
      // em 40-mapa-palcos.js. Sem isso a rota "cabia" atrás do rodapé.
      const cam = casa.mapa.cameraForBounds([o, n], {
        padding: padDoPlano(casa), maxZoom: teto, bearing: 0,
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
  /* 🔴 …E O "PARADO" DESFAZ ESSA EXCEÇÃO (17/08 — dono, com o 2D na mão:
     *"enquadramento 2d parado tem q exibir rota toda, ao notar movimentação no
     gps aí sim aproxima 30%"*).
     A moldura das PRÓXIMAS (a nota acima, 16/08) resolvia um problema real —
     o dia inteiro numa cidade some os números dos pinos —, mas ela resolvia
     esse problema O TEMPO TODO, inclusive com o caminhão parado na garagem. E
     aí ela custa o que a tela promete: MEDIDO no g15 agora, com 10 paradas e o
     motorista parado, o 2D pousava mostrando 9 pinos e cortava a parada 10 fora
     da tela, com o traço saindo pelas duas beiradas. Quem está parado está
     PLANEJANDO — é a hora de ver o dia todo, não o que vem pela frente.
     A régua de "parado" é a MESMA dos 30 m (§ `andouNoPlano`), nunca uma
     segunda opinião. Então a sequência que o dono descreve fica literal:
       parado           → rota TODA (esta função cai no `molduraDoPlano`)
       andou 30 m       → `acompanharNoPlano` aproxima 30% (até 2 passos)
       andando + Panorâmica → as próximas, que é quando elas fazem falta.
     O dia inteiro continua a UM toque em qualquer caso: o botão da beirada
     (`mapa-enquadrar`) não mudou. */
  const PANO_PROXIMAS = 6;
  function alvoDaPanoramica(casa) {
    const eu = ultimaPos || ultimoFix;
    const naRua = typeof rotaNaRua === 'function' ? rotaNaRua() : false;
    const andou = typeof andouNoPlano === 'function' ? andouNoPlano() : true;
    if (naRua && andou && eu && pinoValido(eu.lat, eu.lng)) {
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

  /* ---- O MODO LEMBRADO (item 5 do contrato de 17/08) -----------------------
     Dono, sobre onde a rota recém-montada deve pousar: *"é o próprio
     Panorâmica/Direção"*. Quer dizer que o pouso não é uma preferência à parte
     numa tela de Ajustes — é o ÚLTIMO GESTO do motorista, e o único lugar que
     sabe dele é aqui, onde a troca acontece. Este arquivo só CARIMBA; quem lê é
     o pouso do montar (§ `pousarNaRota`, 32-verbos-montar-iniciar).
     🔴 E NÃO VAI PRO SEAM DE PROPÓSITO. Escrever em `DADOS` é pedir repinte, e
     ninguém na tela muda por causa deste carimbo — repintar as duas camadas a
     cada toque de Panorâmica seria a tela piscando por uma preferência que só
     vai ser lida no dia seguinte. Aparelho guarda no aparelho (`HBX.cache`). */
  function lembrarModo(modo) {
    if (modo !== 'rota' && modo !== 'mapa') return;
    try {
      if (window.HBX && window.HBX.cache) window.HBX.cache.set('mapa-modo', modo);
    } catch (_) { /* sem cache: o pouso cai no default do montar */ }
  }

  /* 🔴 QUEM CARIMBA O MODO É O DEDO, NUNCA A CÂMERA (17/08 — dono, com o
     aparelho na mão: *"ficou combinado de: se eu estou na rota em 3d, eu continuo
     no 3d ao montar. Não está acontecendo isso"*).

     A 1ª escrita deste carimbo morava dentro do `subirNoPlano`/`descerDoPlano` —
     e ISSO ESTAVA ERRADO, porque essas duas funções não são o gesto: elas são a
     CÂMERA, e a câmera roda em toda virada de tela, inclusive nas que o motorista
     não pediu. MEDIDO no g15: cancelar a rota estando no 3D leva o app pro 2D
     (`ir('rota')` do cancelar) → o observador chama `subirNoPlano` → carimbava
     `'rota'`. Ou seja: o gesto de CANCELAR reescrevia a preferência de CÂMERA, e
     o Montar seguinte pousava no 2D contra a ordem do dono. Voltar de uma folha,
     abrir a lista, subir o app na tela da rota: tudo escrevia.

     A cura é ler a INTENÇÃO, e a intenção tem um lugar só na tela: o botão do
     meio do rodapé, o que transmuxa entre Panorâmica e Direção (§ `transmux` no
     mock, marca `data-modo` com o DESTINO). Um ouvinte em captura, no documento,
     porque a camada é trocada a cada repinte — ouvinte pendurado no nó morre com
     ele. O clique continua o caminho normal (`data-ir`/`data-estado`); aqui só se
     anota que ele existiu. */
  document.addEventListener('click', (ev) => {
    const alvo = ev.target && ev.target.closest ? ev.target.closest('[data-modo]') : null;
    if (alvo) lembrarModo(alvo.dataset.modo);
  }, true);

  /* SUBIR — o 3D vira 2D NO MESMO MAPA: a inclinação cai, o rumo volta ao norte
     e a câmera abre até o pouso da Panorâmica, tudo num `easeTo` só.
     🔴 NENHUM EFEITO SE PERDEU AQUI (ordem do dono, 16/08: *"não é para regredir
     nada, muito menos perder efeito"*). O que sumiu foi o CORTE: com um palco só
     não existe mais "o mapa que entra" chegando frio de outra câmera — a imagem
     na tela é a mesma, e o movimento acontece nela. */
  function subirNoPlano() {
    /* 🔴 SEM CARIMBO AQUI. Esta função é a CÂMERA subindo, e ela roda em toda
       virada pra tela 'rota' — cancelar, voltar de folha, app subindo no 2D.
       Quem carimba é o dedo no botão que transmuxa (§ o ouvinte de `data-modo`,
       logo acima do `lembrarModo`). */
    const casa = GARAGEM.get(PALCO);
    if (!casa || !casa.mapa) return;
    travarGestos2D(casa.mapa, true);
    /* 🔴 O DEGRAU DO NOME NÃO ESPERA O ZOOM MEXER (17/08). Quem reavalia os
       pinos é o evento `zoom` do mapa (§ 55-cena-reversa) — e o nome também
       depende do ESTADO (só no 2D), que acabou de virar sem o zoom ter mudado
       um milímetro. Troca de modo com a mesma altura de câmera (motorista que
       subiu e voltou sem tocar na pinça) deixaria o 2D sem nome nenhum até o
       próximo gesto. Uma passada de classe em 51 pinos, aqui, resolve. */
    acertarPinos(casa);
    /* 🔴 E O PONTO AZUL VOLTA AQUI, PELO MESMO MOTIVO DA LINHA DE CIMA: o ESTADO
       virou sem o zoom mexer um milímetro, e quem desfaz o esconde do 3D é uma
       chamada explícita. Esperar o próximo fix seria até 1 s de mapa 2D sem
       motorista nenhum na tela — o defeito espelhado do print de 17/08. */
    euVisivel(casa);
    const alvo = alvoDaPanoramica(casa);
    // a régua dos 30 m recomeça daqui: o pouso é o novo ponto de partida.
    rearmarPlanoZoom();
    /* 🔴 O SEGUNDO ARGUMENTO É "NÃO APAGUE A CIDADE" (17/08 — dono: *"ao alternar
       de 2d para 3d e vice versa, apaga as ruas para refazer o efeito brilhando…
       não apagar as ruas neste caso. É só para acontecer o brilho"*). O brilho é
       o mesmo, com o mesmo ritmo; o que sai é o esconde-e-redesenha, que aqui não
       tem motivo nenhum: o mapa está assentado na cara do motorista. Ver
       `semApagar` em § 50-cena-ruas — e o Montar rota, que continua com a cena
       inteira, escurece incluído. */
    if (!alvo) { pedirCena('rota', true); return; }
    porNoPlano(casa, alvo, TROCA_MS);
    aoAssentar(casa.mapa, () => { if (telaAtual() === 'rota') pedirCena('rota', true); });
  }

  /** DESCER — a volta da Panorâmica: o movimento primeiro, a cena no pouso */
  function descerDoPlano() {
    // (o carimbo do modo é do DEDO, não da câmera — ver `subirNoPlano`)
    const casa = GARAGEM.get(PALCO);
    if (!casa || !casa.mapa) { entrarNaDescida(); return; }
    travarGestos2D(casa.mapa, false);
    // o nome sai ANTES do movimento: rótulo de cadastro descendo junto com a
    // câmera é enfeite viajando por cima da manobra que está nascendo.
    acertarPinos(casa);
    /* 🔴 O PONTO AZUL SAI ANTES DO MOVIMENTO, pela mesma razão do rótulo acima: a
       descida dura 700 ms, e nem por um quadro o dono pode ver os dois símbolos
       juntos (*"não é para ter os 2 no mapa"*). Quem sai de cena sai primeiro. */
    euVisivel(casa);
    // limpa vigias, relógio da vista de cima e o estado 'solta' — é o mesmo
    // desarme da saída, e sem ele a descida nasce morta (ver `pararDescida`).
    pararDescida();
    descer(TROCA_MS, casa.mapa);
    // (o mesmo "não apague a cidade" da subida — a troca é um gesto só, nos 2
    // sentidos, e o que o dono vê tem que ser o mesmo brilho nos dois)
    aoAssentar(casa.mapa, () => { if (telaAtual() === 'mapa') pedirCena('navegar', true); });
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

  /* ---- UM SÍMBOLO POR ESTADO: O "EU" TRANSMUXA -----------------------------
     🔴 DUAS PEÇAS DIZIAM "VOCÊ ESTÁ AQUI" NA MESMA TELA (17/08 — dono, com o
     print da tela de dirigir na mão: *"esse símbolo tem q transmuxar entre 2d e
     3d, não é para ter os 2 no mapa"*).

     A CAUSA é a MESMA economia que curou a piscada de 16/08: 2D e 3D dividem um
     palco só (`PALCO`) e um maplibre só (`GARAGEM`) — o nó do mapa apenas muda de
     pai. O ponto azul do motorista (`casa.eu`, § `moverEuNoPlano` em
     40-mapa-palcos) é peça do MAPA, então ele ATRAVESSA a troca de modo e fica na
     tela de dirigir colado na seta verde do desenho (`.gps-puck`, com o facho da
     manobra), que é quem representa o motorista ali. Nenhuma das duas está errada
     no lugar dela; erradas são as duas JUNTAS — e no print elas estão a poucos
     pixels uma da outra, o que é pior que longe: lê como falha de render.

     "Transmuxar" é exatamente isto: uma peça por estado, sem nada nascer nem
     morrer. Dirigindo, o ponto do mapa fica INVISÍVEL — não removido. Recriar
     marcador na troca de modo é o mapa remontando peça, e é a lei que
     `sincronizarPinos` e `acertarPinos` já escrevem nesta casa: quem já existe
     muda de classe.

     🔴 E ELE TEM QUE VOLTAR — a mesma armadilha que `pinosVisiveis` documenta
     logo acima. Esconder num estado sem DESFAZER no outro deixaria o 2D sem o
     "você está aqui" pra sempre, e no 2D ele é a peça mais importante da tela:
     dia sem rota montada é "mapa com MINHA SETA na minha localização", literal
     (§ `paradasDoMapa`). Fora da navegação a régua não é "some": é "aparece". */
  function euVisivel(casa) {
    if (!casa || !casa.eu) return;
    let el;
    try { el = casa.eu.getElement(); } catch (_) { return; }
    // mesmo mecanismo do `pinosVisiveis`: `visibility` guarda o lugar da peça no
    // mapa (o vendor continua escrevendo `transform` nela) e não custa layout.
    el.style.visibility = naNavegacao() ? 'hidden' : '';
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

  /* ---- O TERCEIRO DEGRAU: O NOME (17/08) -----------------------------------
     Dono: *"Mapa 2d ao se aproximar exibe o numero, ao dar zoom + ainda exibe o
     nome do cliente"*. São três degraus na MESMA régua — quantos pixels separam
     ESTE pino do vizinho mais próximo dele, neste zoom:
       · `min`      — não cabe nem o pino (30px): vira ponto anônimo.
       · normal     — cabe o pino com respiro: o número aparece.
       · `com-nome` — cabe o pino MAIS o rótulo: o cliente aparece.

     🔴 OS 96 px SÃO O RÓTULO, NÃO UM PALPITE. O nome é escrito na fonte do pino
     (12px Inter, § `.map-pino` na folha), ~6 px por letra, aparado em 16 letras
     na ponte (`PINO_NOME_MAX`, § 40-mapa-palcos) = ~96 px de tarja. Exigir 96 px
     de vizinho é exigir exatamente a largura da peça que vai nascer: nome nunca
     encosta em nome, porque o vão medido é o próprio rótulo. Dá 4× o respiro do
     número — e é por isso que ele é escrito como `PINO_ESPACO_PX * 4`: os dois
     números são o MESMO acoplamento com a folha, e mexer num sem o outro é o
     defeito voltando por dentro.

     🔴 E TEM PISO DE ZOOM, porque "ao dar zoom +" é uma ORDEM DE GESTO. Sem
     piso, um dia rural com duas portas a 5 km ganharia nome no zoom da cidade
     inteira (z≈11,5: 50 m por pixel ⇒ 100 px de vão) — nome flutuando a
     quilômetros da porta que ele descreve, exatamente a queixa "cadê os pontos"
     ao contrário. O piso é z=15: em Rio Claro (lat −22,4) isso é ~4,4 m/px, a
     escala em que a QUADRA enche a tela — o zoom em que o nome de uma porta
     ainda quer dizer aquela porta. De z=15 pra cima o vão exigido encolhe
     sozinho (z=17 ⇒ 106 m entre vizinhos; z=18 ⇒ 53 m), que é o nome aparecendo
     aos poucos conforme o dedo aproxima, e não um interruptor.

     🔴 O NOME É PEÇA DO 2D. Dirigindo, a tela é a MANOBRA (a rua, a seta, a
     distância): rótulo de cadastro ali é enfeite competindo com a única coisa
     que o motorista precisa ler a 60 km/h — e a lei desta casa é que enfeite
     não derruba rota. Por isso `!naNavegacao()`.

     🔴 A FAIXA DOS 12 NÃO VALE PRO NOME. "Até 12 paradas nunca rebaixa" existe
     pra não deixar três pontinhos anônimos num mapa vazio — é uma exceção do
     NÚMERO. Nome é tarja larga: dois clientes colados numa rua, mesmo num dia de
     3 paradas, escreveriam um por cima do outro. Aqui a medida manda sempre. */
  const PINO_NOME_PX = PINO_ESPACO_PX * 4;
  const PINO_NOME_ZOOM = 15;

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
    /* A câmera é lida UMA vez por passada, e agora SEMPRE: o degrau do nome
       precisa dela mesmo em dia curto, onde a faixa dos 12 dispensava a conta.
       É um `getZoom` + um `getCenter` por zoom — o custo desta função são os 51
       pinos do laço, não isto. Câmera que não responde é mapa saindo de cena:
       sem régua ninguém mexe em classe (mexer seria decidir no escuro). */
    let mpp = 0; let zoom = null;
    try {
      zoom = casa.mapa.getZoom();
      mpp = metrosPorPixel(casa, casa.mapa.getCenter().lat) || 0;
    } catch (_) { return; }
    const podeNome = !naNavegacao() && !!mpp
      && Number.isFinite(zoom) && zoom >= PINO_NOME_ZOOM;
    casa.pinos.forEach((marcador, id) => {
      let el;
      try { el = marcador.getElement(); } catch (_) { return; }
      // sem espaço medido ainda (lista nunca sincronizada) o seguro é NUMERAR:
      // pino sem número não diz nada, e pino apertado ainda diz quem é.
      const d = casa.espacos ? casa.espacos.get(String(id)) : null;
      // o vão até o vizinho, em PIXELS desta tela — null quando não há vizinho
      // (parada única) nem medida: aí não há com quem colidir.
      const vao = (!!mpp && Number.isFinite(d)) ? (d / mpp) : null;
      const min = !poucos && vao !== null && vao < PINO_ESPACO_PX;
      el.classList.toggle('min', min);
      /* O nome só entra onde ele CABE INTEIRO, e nunca em cima do rebaixado:
         pino que perdeu o número por aperto não ganha uma tarja de 96 px. E só
         onde a peça EXISTE (`__hbxNome`) — cliente sem nome no cadastro não tem
         rótulo nenhum pra acender (§ `vestirPino`, 40-mapa-palcos). */
      const comNome = podeNome && !min && !!el.__hbxNome
        && (vao === null || vao >= PINO_NOME_PX);
      el.classList.toggle('com-nome', comNome);
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
    /* 🔴 `existe` E `visivel` SÃO PERGUNTAS DIFERENTES, DE PROPÓSITO (17/08). A
       cura do "dois símbolos no mapa" é ESCONDER, nunca remover — uma prova que
       só olhasse `existe` daria verde justamente pra quem quebrasse a lei da casa
       (marcador recriado a cada troca de modo). Então a sonda devolve os dois:
       dirigindo espera-se `{existe:true, visivel:false}`; no 2D, os dois `true`. */
    eu() {
      const casa = GARAGEM.get(PALCO);
      let el = null;
      try { el = (casa && casa.eu) ? casa.eu.getElement() : null; } catch (_) { el = null; }
      return { existe: !!el, visivel: !!el && el.style.visibility !== 'hidden' };
    },
    pinos(nome) {
      const casa = GARAGEM.get(PALCO);
      if (!casa || !casa.pinos.size) return null;
      const fora = [];
      casa.pinos.forEach((marcador, id) => {
        let el;
        try { el = marcador.getElement(); } catch (_) { return; }
        /* 🔴 `texto` É O NÚMERO, E ELE MUDOU DE ENDEREÇO (17/08). Era
           `el.textContent` do pino inteiro — com o rótulo do cliente dentro,
           isso passou a devolver "1Ana Souza" e a prova mediria uma coisa que
           não existe na tela. O número mora no `.n`; o nome, no `.nome`; e cada
           um se mede onde mora. Sem o `.n` (pino de um APK anterior a este,
           vivo numa camada antiga) a sonda cai no pai — medir errado é ruim,
           medir NADA é pior. */
        const noN = el.__hbxN || el.querySelector('.n');
        const noNome = el.__hbxNome || el.querySelector('.nome');
        fora.push({
          id: String(id),
          min: el.classList.contains('min'),
          comNome: el.classList.contains('com-nome'),
          texto: noN ? noN.textContent : el.textContent,
          nome: noNome ? noNome.textContent : '',
          espaco: casa.espacos ? casa.espacos.get(String(id)) : null,
        });
      });
      return fora;
    },
  };
