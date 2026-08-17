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

  /* 🔴 A CASCA ESTÁ EM CENA? A marca `cena` da camada é o gatilho de "há véu na
     tela", e quem a põe é o mock ENTRANDO na tela cheia — nunca na troca de modo
     (o mock proíbe isso de propósito desde 17/08). Ela morava em
     `70-traco-camera` porque quem esperava por ela era a câmera; mudou de casa
     hoje porque quem PERGUNTA agora é a fila, e a fila é assunto da cena. */
  const emCena = () => !!document.querySelector('#app .tela.cena');

  /* ==========================================================================
     🔴 A FILA DA CENA — UMA COISA POR VEZ, ANUNCIADA POR QUEM SABE (17/08).

     Ordem do dono, com o g15 na mão: *"efeito de troca entre 2d e 3d tem q ser
     um pouco mais devagar, um pouco mais organizado. Mesma coisa ao montar a
     rota, organize isso! montou rota? Carregou? Escurece, preencher com cor do
     mapa, comece o efeito, desce até o ponto, faz todos efeitos, ao concluir
     aparecem os botões. está travando no celular, pq tem muita coisa
     acontecendo ao mesmo tempo!! FAÇA UM ROTEIRO, LEVE SEU TEMPO"*.

     O diagnóstico é dele, e é de ORQUESTRA e não de máquina: o véu abrindo
     (casca, 0,22–0,62 s), as ruas crescendo no mapa de verdade (aqui, ~1,06 s),
     o cromo entrando (casca, 0,48–0,58 s) e a descida da câmera (§ 70, 1,8 s)
     caíam todos no mesmo punhado de quadros. No g15 isso é WebGL desenhando +
     17 animações de cromo + um `easeTo` no mesmo frame.

     São QUATRO fases, nesta ordem, e a marca mora na RAIZ (`<html data-cena>`):

         escurece → ruas → descida → pronto        ('' = não há cena nenhuma)

     Na RAIZ e não na camada porque a camada é TROCADA a cada repinte do seam
     (1×/s dirigindo): marca em camada morre no meio da cena.

     QUEM ESCREVE É A PONTE, e o motivo é que só ela sabe — quando o tile chegou,
     quando a última onda partiu, quando o `easeTo` terminou. Quem VESTE é a
     casca, em `:root[data-cena="…"]`. E o anúncio sai no EVENTO, nunca no
     relógio: relógio aqui é só socorro (`FASE_TETO`).

     🔴 AUSÊNCIA DE MARCA = CROMO NORMAL, e esta é a trava de segurança do
     contrato inteiro. Cena recusada (`prefers-reduced-motion`, cena já no ar,
     mapa sem estilo, troca de modo) não marca fase nenhuma — e nesse caso a tela
     tem que ser a de sempre. Cromo preso invisível é pior que cena nenhuma: é a
     lei de 09/08 ("a cena não espera o mapa"), agora escrita como TETO.
     ========================================================================== */
  const FASE_ORDEM = ['escurece', 'ruas', 'descida', 'pronto'];
  /* quanto o véu leva pra encher a tela na cor do mapa (§ a folha). A 1ª onda
     não parte antes disso — "escurece, preencher com cor do mapa, COMECE o
     efeito" é uma ordem, e era exatamente esse cruzamento que travava o g15. */
  const FASE_ESCURECE_MS = 420;
  /* 🔴 O TETO VENCE DEPOIS DO CAMINHO NORMAL, SEMPRE — senão ele PASSA A SER o
     caminho normal (a lei que a medição de 16/08 deixou no `quandoEstiloPronto`).
     · `escurece` espera o CHÃO: `quandoEstiloPronto` gasta até 1,2 s e o
       `esperarChao` até `CENA_TETO_TILE` — os dois somados, mais folga.
     · `ruas` acaba na ÚLTIMA onda: 1,16 s no ritmo da rota e 0,66 s no do
       navegar (§ `CENA_PASSO`/`CENA_ONDA`) — 5,2 s é folga de 4×.
     · `descida` é o `easeTo` de `DESCIDA_MS` (1,8 s, § 70-traco-camera) + folga.
       Número literal e não a constante: ela nasce num arquivo POSTERIOR da
       costura, e ler `const` de arquivo posterior aqui no topo é TDZ na cara. */
  const FASE_TETO = { escurece: CENA_TETO_TILE + 1600, ruas: 5200, descida: 2600 };
  /* e o `pronto` é TETO, não duração: os 420 ms de entrada do cromo mais a folga
     da travada de thread — a mesma folga que o `CENA_CHEIA` do mock documenta. */
  const FASE_PRONTO_MS = 1400;

  let cenaFase = '';           // a fase no ar — o espelho do que está na raiz
  let cenaFaseEm = 0;          // quando ela foi escrita (o piso do véu lê daqui)
  let cenaFaseRelogio = null;  // o socorro
  let cenaFilaAberta = false;  // 🔴 só o `escurece` abre; só o `pronto` fecha

  /** o ÚNICO lugar que escreve a marca da fila na raiz */
  function faseDaCena(nome) {
    const fase = nome || '';
    /* 🔴 `escurece` ABRE A FILA, `pronto` FECHA, e no meio ela só anda PRA
       FRENTE. Sem este latch o teto não seria teto: empurrada a fila até
       `pronto`, um `descida` atrasado (o `easeTo` que ainda ia sair) esconderia
       de novo o cromo que acabou de entrar — o socorro virando o defeito.
       E fase repetida não se escreve: reescrever a raiz reencena a animação da
       casca no meio dela (a mesma lei da marca `entra`, no mock). */
    if (fase === 'escurece') cenaFilaAberta = true;
    else if (fase && !cenaFilaAberta) return;
    else if (fase && FASE_ORDEM.indexOf(fase) <= FASE_ORDEM.indexOf(cenaFase)) return;
    if (fase === cenaFase) return;
    cenaFase = fase;
    cenaFaseEm = (window.performance && performance.now) ? performance.now() : Date.now();
    if (cenaFaseRelogio) { clearTimeout(cenaFaseRelogio); cenaFaseRelogio = null; }
    try {
      const raiz = document.documentElement;
      if (fase) raiz.dataset.cena = fase; else delete raiz.dataset.cena;
    } catch (_) { /* documento indo embora: a fila não é dona de ninguém */ }
    /* a outra metade do latch: a fila fecha no `pronto` E no vazio. Depois de
       qualquer um dos dois, anúncio atrasado não veste mais nada. */
    if (!fase || fase === 'pronto') cenaFilaAberta = false;
    const teto = FASE_TETO[fase];
    if (teto) {
      cenaFaseRelogio = setTimeout(() => { cenaFaseRelogio = null; faseDaCena('pronto'); }, teto);
      return;
    }
    /* 🔴 E O `pronto` TAMBÉM SAI DA RAIZ. Fase que fica pendurada é fase que a
       casca pode reencenar no repinte seguinte, e "não há cena nenhuma" é um
       estado de verdade desta tela — o mais comum deles, na maior parte do dia. */
    if (fase === 'pronto') {
      cenaFaseRelogio = setTimeout(() => { cenaFaseRelogio = null; faseDaCena(''); }, FASE_PRONTO_MS);
    }
  }

  /** de qual palco é cada cena — 'navegar' mora na tela de dirigir */
  /* 🔴 UM PALCO SÓ (16/08): as cenas continuam DUAS ('navegar' na tela de
     dirigir, 'rota'/'entrada' no 2D) — o que deixou de existir são dois lugares
     onde elas acontecem. O motivo continua mandando em QUANDO e COMO; o palco é
     o mesmo mapa. */
  const palcoDaCena = () => PALCO;

  /* o pedido: a cena acontece quando o palco estiver na tela, nunca antes.

     🔴 `semApagar` — A TROCA DE MODO NÃO APAGA A CIDADE (17/08, dono com o g15 na
     mão: *"ao alternar de 2d para 3d e vice versa, apaga as ruas para refazer o
     efeito brilhando… não apagar as ruas neste caso. É só para acontecer o
     brilho"*).
     A cena SEMPRE começou escondendo o mundo (§ `esconderMundo`) porque ela É a
     cidade NASCENDO: no Montar rota o motorista chega por trás de um véu escuro e
     não existe mapa nenhum pra apagar — o mundo escondido é o palco em branco em
     que as ruas se desenham. Na troca de modo existe mapa, assentado e na cara
     dele: apagar as ruas pra redesenhá-las é o app desfazendo o que já estava
     certo, e é exatamente o que a gravação do g15 mostra (1,5 s de mapa vazio com
     só o traço verde antes de as ruas voltarem crescendo).
     Com este sinal o brilho passa POR CIMA da cidade viva: mesma geometria, mesma
     largura, mesma tinta assentando no tom real (§ `CENA_COR_ASSENTA`) — a onda
     acende sobre a rua de verdade em vez de no vazio, e quando a cena sai não há
     nada a devolver porque nada saiu.
     🔴 E ISTO NÃO ENCOSTA NO MONTAR ROTA (regra literal do dono: *"NÃO ALTERAR O
     EFEITO AO MONTAR ROTA"*): quem pede com este sinal são só os chamadores da
     troca (§ 45-troca-de-modo). `montarRota` e `entrarNaDescida` continuam
     pedindo a cena inteira — escurece, cidade fora, ruas nascendo, descida. */
  function pedirCena(motivo, semApagar) {
    if (semMovimento()) return;
    cenaPedido = { motivo, em: Date.now(), semApagar: !!semApagar };
    const casa = GARAGEM.get(palcoDaCena(motivo));
    if (mapaNaTela(casa)) atenderCena(casa);
  }

  /* 🔴 CANCELAR ESQUECE O PEDIDO (11/08). O pedido de "rota nova" vive 60 s
     esperando o palco — e o cancelar mata a rota nesse meio tempo. Sem isto,
     o repinte do cancelar cobrava o pedido órfão e a cena de rota nascendo
     tocava por cima de uma rota que acabou de morrer. */
  function esquecerCenaPedida() { cenaPedido = null; }
  /* a sonda da prova (`prova-fluxo-rota`): `cenaPedido` é fechadura de IIFE e
     sem isto a asserção "cancelar não deixa pedido vivo" não teria o que ler.
     Mesmo precedente do `window.HBXRota`.
     🔴 `fase()` ENTRA JUNTO (17/08): a fila é uma ORDEM de quatro tempos, e ordem
     só se prova lendo o tempo em que ela está. A prova pode ler a raiz direto,
     mas aí ela mediria a SAÍDA e não a decisão — e é a decisão que tem dono. */
  /* a sonda ganhou DIAGNÓSTICO (17/08): a fila fechava cedo e "quem fechou" não
     se lê da tela. `motivo` é o da cena viva, `fim` o último desfecho e `descida`
     a promessa da câmera — três perguntas, três campos, medidos no aparelho. */
  let cenaUltimoFim = '';
  window.HBXCena = {
    pendente: () => !!cenaPedido,
    fase: () => cenaFase,
    diag: () => ({
      fase: cenaFase,
      motivo: cena ? cena.motivo : '',
      fim: cenaUltimoFim,
      descida: (typeof filaEsperaDescida === 'function') ? filaEsperaDescida() : null,
      pedido: cenaPedido ? cenaPedido.motivo : '',
    }),
  };

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
    chamarCena(casa, p.motivo, p.semApagar);
  }

  function chamarCena(casa, motivo, semApagar) {
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
      mundoVoltou: false, nomesSairam: false, ruasPartiram: false,
      ruasFecharam: false, semApagar: !!semApagar,
    };
    const daVez = cena;
    /* 🔴 A FILA COMEÇA AQUI, NO INSTANTE EM QUE A CENA É ACEITA — e ela só nasce
       onde existe VÉU (§ `emCena`). "Aceita" e não "mundo escondido": o
       `quandoEstiloPronto` logo abaixo pode gastar até 1,2 s, e escurecer DEPOIS
       de esconder a cidade seria mostrar o mapa sumindo na cara do motorista.
       Assim a ordem é a que o dono ditou — escurece na cor do mapa, ENTÃO o mundo
       sai por trás do véu, ENTÃO as ruas nascem.
       As outras duas cenas que este arquivo toca NÃO são fila, e não por
       esquecimento:
       · a da TROCA DE MODO (`aoAssentar` → `pedirCena`, § 45-troca-de-modo) — o
         mock proíbe a marca `cena` no `modo-troca` de propósito, e o cromo que a
         fila esconderia é justamente a peça que o gesto está mostrando;
       · a da ENTRADA do app — ela roda num palco fantasma atrás do splash, onde
         véu não existe; quem manda no ritmo ali é a abertura (§ 7a-ter). */
    if (emCena()) faseDaCena('escurece');
    /* O mundo sai de cena assim que o estilo existir — ANTES do primeiro tile
       pintar. Escondê-lo no `load` deixaria a cidade aparecer por um quadro e
       sumir, que é a piscada que esta casa passou o dia 09/08 matando. */
    quandoEstiloPronto(mapa, () => {
      if (cena !== daVez) return;
      /* 🔴 A CIDADE FICA NA TELA (§ `semApagar`, no `pedirCena`). `mundo` segue
         null, e isso atravessa a casa inteira SEM exceção nova: `fatiaDoMundo`
         de null é null e `devolverMundo` com null não faz nada — não há o que
         devolver porque nada saiu de cena. */
      if (daVez.semApagar) { esperarChao(daVez); return; }
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
    /* 🔴 E NA TROCA DE MODO TAMBÉM NÃO HÁ LETRA (§ `semApagar`): o rótulo do
       basemap continua NA TELA — é o mesmo nome, no mesmo lugar. Escrevê-lo de
       novo letra a letra seria a mesma rua com dois nomes por cima um do outro.
       A cena do Montar pode escrever porque lá o mundo saiu de cena e a letra
       nascendo é a única que existe. */
    const nomes = (daVez.motivo === 'navegar' || daVez.semApagar) ? [] : nomesDaCena(ruas);

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
    /* 🔴 A 1ª ONDA ESPERA O VÉU ENCHER — e só o que FALTA dele (17/08, ordem do
       dono: *"Escurece, preencher com cor do mapa, comece o efeito"*, nesta
       ordem). Com o tile já na mão o `esperarChao` chega aqui ~300 ms depois da
       marca, e as ruas nasciam com a tela AINDA escurecendo: são as "muitas
       coisas acontecendo ao mesmo tempo" no ponto exato. Fila é ORDEM, não pausa
       inventada — véu já cheio, este piso é zero e nada atrasa.
       (O relógio da cena, `t0`, nasce poucas linhas abaixo: a diferença entre
       ler o tempo aqui e lá é o custo do cartão, abaixo de um quadro.) */
    if (cenaFase === 'escurece') {
      const agora = (window.performance && performance.now) ? performance.now() : Date.now();
      ruasEm = Math.max(ruasEm, Math.round(FASE_ESCURECE_MS - (agora - cenaFaseEm)));
    }
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

    /* 🔴 `ruas` SE ANUNCIA QUANDO A 1ª ONDA PARTE DE VERDADE, e não quando a cena
       começa: entre uma coisa e outra corre o `ruasEm`, que carrega o piso do véu
       (§ `comecarCena`) — é ele que faz a fase 1 ACABAR antes de a fase 2 começar.
       A régua é a MESMA que o laço abaixo usa pra acender a onda (`p > 0`): duas
       réguas pro mesmo instante divergem caladas. */
    if (!daVez.ruasPartiram && daVez.ondas.length && t > daVez.ondas[0].em) {
      daVez.ruasPartiram = true;
      faseDaCena('ruas');
    }

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
        /* 🔴 O POUSO NO 2D NÃO TEM FASE 3 (contrato de 17/08): não existe descida
           nenhuma pra esperar ali, então a última onda É o fim da fila e o cromo
           entra aqui. No 3D quem fecha é o `descer` — a câmera ainda tem 1,8 s de
           trabalho, e *"ao concluir aparecem os botões"* quer dizer AO CONCLUIR. */
        /* 🔴 QUEM DIZ SE AINDA HÁ DESCIDA É A CÂMERA, NÃO O MOTIVO DA CENA
           (17/08, MEDIDO no g15 com a fita da fila). Esta linha perguntava
           `motivo !== 'navegar'` — e a fila fechou em `pronto` 55 ms ANTES de a
           câmera começar a descer, então os botões entraram e a descida
           aconteceu por baixo deles. O motivo mente porque há DOIS verbos que
           entram na rota: `montarRota` (pede a cena com motivo 'navegar', pelo
           `entrarNaDescida`) e `iniciarRota` (pede com motivo 'rota' e TAMBÉM
           cai no `entrarNaDescida` pelo observador). Mesmo destino, dois nomes.
           `camFase === 'cima'` é o estado que o `entrarNaDescida` acabou de
           armar: enquanto ele estiver de pé, a descida está na fila e quem fecha
           é o `descer` (§ 70-traco-camera). Sem descida armada — o pouso no 2D —
           a última onda É o fim da fila, como o contrato manda. */
        /* 🔴 E O `pronto` SAIU DAQUI (17/08 — dono: *"depois de carregar tá uma
           tela desesperada… dê um tempo de um transition acabar para entrar em
           outro"*). Este ponto é a última onda PARTINDO, não chegando: os botões
           entravam com as ruas ainda crescendo por baixo deles, que é a "muita
           coisa ao mesmo tempo" pela última porta que faltava fechar. Quem
           anuncia agora é o fim do CRESCIMENTO (§ `ruasCresceram`, no laço das
           ondas, poucas linhas abaixo). O que continua morando aqui é a volta do
           resto do mundo, que é o que esta marca sempre foi. */
      }
    }

    const corFim = daVez.corFim || (daVez.corFim = corDaRuaReal(mapa, corpo));
    // 🔴 CRESCEU ≠ ASSENTOU. `ruasProntas` (abaixo) só é verdade quando a onda
    // cresceu E a tinta escorregou pro tom do basemap (`CENA_COR_ASSENTA`) — 420
    // ms em que a tela já está parada. Quem manda nos botões é o DESENHO ter
    // acabado; esperar a cor seria segurar o cromo por uma troca que ninguém vê.
    let ruasCresceram = true;
    let ruasProntas = true;
    for (let i = 0; i < daVez.ondas.length; i += 1) {
      const o = daVez.ondas[i];
      if (o.pronta) continue;
      const onda = daVez.onda || CENA_ONDA;
      const p = (t - o.em) / onda;
      if (p <= 0) { ruasProntas = false; ruasCresceram = false; continue; }
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
      if (p < 1) ruasCresceram = false;
      if (p >= 1 && q >= 1) o.pronta = true; else ruasProntas = false;
    }

    /* 🔴 OS BOTÕES ENTRAM QUANDO O DESENHO ACABA (17/08 — *"dê um tempo de um
       transition acabar para entrar em outro, tudo SMOOTHLY"*). Antes o anúncio
       saía junto com a ÚLTIMA ONDA PARTINDO (§ `mundoVoltou`), ~0,8 s antes de a
       cidade fechar: o cromo nascia por cima de rua ainda crescendo.
       A guarda da descida é a mesma de sempre e pelo mesmo motivo: no 3D ainda
       há 1,8 s de câmera pela frente, e quem fecha a fila lá é o `descer`. */
    if (!daVez.ruasFecharam && ruasCresceram && daVez.ondas.length) {
      daVez.ruasFecharam = true;
      if (typeof filaEsperaDescida !== 'function' || !filaEsperaDescida()) faseDaCena('pronto');
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
    cenaUltimoFim = String(motivo || '') + '/' + String(c.motivo || '');
    cena = null;
    /* 🔴 E A FILA NÃO MORRE PRESA (17/08). Todo desfecho passa por aqui — fim,
       dedo, teto, erro no meio, tela que trocou, `sem-rua`, `sem-estilo`,
       `sem-fonte` — e em NENHUM deles o cromo pode ficar invisível esperando um
       anúncio que não vem mais. Vem antes do trabalho todo lá embaixo de
       propósito: exceção no meio da devolução do mundo não pode levar a fila.
       A única saída que não fecha é o fim natural da cena do 3D: ali a fase 3
       ainda VAI acontecer, e quem fecha é ela (§ `descer`, 70-traco-camera). */
    if (!(motivo === 'fim' && c.motivo === 'navegar')) faseDaCena('pronto');
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
    if (GARAGEM.get(PALCO) || MONTANDO.has(PALCO)) return;
    if (!BOX.isConnected) document.body.appendChild(BOX);
    const fantasma = document.createElement('div');
    fantasma.className = 'mapa-palco';
    fantasma.dataset.mapa = PALCO;
    fantasma.setAttribute('aria-hidden', 'true');
    const L = window.innerWidth || 412;
    const A = window.innerHeight || 800;
    fantasma.style.cssText = 'position:absolute;left:0;top:0;width:' + L + 'px;height:' + A + 'px';
    BOX.appendChild(fantasma);
    montarMapa(fantasma);
  }
