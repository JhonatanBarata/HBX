  /* ---- 6d. O RADAR (12/08, F2+F3 do PR12082026-RADAR-E-VELOCIDADE) --------

     O aparelho passa o dia inteiro com a rota do dia na memória e o pacote de
     radares fixos do Sudeste no disco. Juntar os dois é de graça — e é a única
     conta desta frente: nenhum serviço novo, nenhuma tabela nova, nenhuma
     chamada de rede por fix.

     🔴 A PERGUNTA É DE ORDEM, NUNCA DE DISTÂNCIA — a lição paga da MANOBRA
     FANTASMA (`49bc1235`): `metrosEntre` é MÓDULO, não tem sinal, e quem
     pergunta "está a 20 m?" recebe o mesmo sim pro radar que ficou pra trás e
     pro que vem na frente. Aqui a régua é a FITA: o corredor é caminhado
     segmento a segmento a partir da posição PRESA NA RUA (`presoNaRota`), e a
     distância de um radar é o quanto de asfalto falta até ele. Radar atrás a
     20 m simplesmente não existe pra esta função — ele não está em nenhum
     segmento à frente. Sem rota traçada não há corredor, e sem corredor não há
     aviso: o corredor é da ROTA, não do mundo.

     🔴 E O DADO CHEGA PELA MESMA PORTA DO MAPA. O bucket do R2 não tem CORS,
     então `fetch` cross-origin do WebView morre na origem. A saída é a que o
     `MapaOffline` já pagou: o pacote é servido em MESMA ORIGEM
     (`/radares/dados.json` no `appassets`), pelo `shouldInterceptRequest` da
     MainActivity, de `filesDir` — quem baixa do R2, confere o sha256,
     descompacta e guarda é o `RadaresOffline.kt`, 1× por dia operacional. Aqui
     dentro é um `fetch` local que ou responde ou não responde.

     🔴 FAIL-SILENT DE ENFEITE (a lei do "enfeite não derruba rota"): sem
     pacote, sem rede, JSON quebrado — a navegação segue INTEIRA e o motorista
     não vê um erro sequer. O chip fica apagado e ninguém fala nada. E o
     disjuntor é DURO: três tentativas no dia, e para. Aviso auxiliar que fica
     batendo na porta é a máquina de gastar bateria de quem está dirigindo. */

  /** o pacote do dia, servido em mesma origem pela ponte nativa */
  const RADAR_FONTE = '/radares/dados.json';
  /** 35 m de cada lado da fita: a largura de uma via com canteiro, não do mundo */
  const RADAR_CORREDOR_M = 35;
  /** o aviso sai a ~9 s de distância, com piso e teto (o mesmo miolo do plano) */
  const RADAR_AVISO_S = 9;
  const RADAR_AVISO_PISO_M = 300;
  const RADAR_AVISO_TETO_M = 600;
  /** a janela do F3: dentro dela a velocidade é comparada com o limite do radar */
  const RADAR_F3_M = 600;
  /** 🔴 1 m DE FOLGA, E ELE TEM DONO: a fita vem do roteador e o ponto do radar
     vem do pacote — duas contas diferentes pro mesmo metro. Sem esta folga o
     limite exato da janela (300,0000001 m contra 300) acende e apaga o chip no
     arredondamento, que é pisca na cara de quem dirige. */
  const RADAR_MARGEM_M = 1;
  /** até onde a fita é caminhada por fix — teto de trabalho, não de aviso */
  const RADAR_ALCANCE_M = 1200;
  /** 🔴 A MANOBRA MANDA NA VOZ. Depois de qualquer fala da navegação o radar
     espera isto; e se a próxima fala da manobra está a menos de
     RADAR_ANTECIPA_S segundos, ele nem começa — "vire à esquerda" nunca é
     atropelado por um aviso auxiliar. */
  const RADAR_FOLGA_MS = 2500;
  const RADAR_ANTECIPA_S = 6;
  /** silêncio por radar: cobre o tremor do corredor sem calar a volta pela
     mesma avenida meia hora depois (dedup eterno é radar que some do dia) */
  const RADAR_MUDO_MS = 10 * 60 * 1000;
  /** o disjuntor do pacote: repouso entre tentativas e TETO de tentativas/dia */
  const RADAR_REPOUSO_MS = 3 * 60 * 1000;
  const RADAR_TENTATIVAS_DIA = 3;
  /** teto de sanidade do pacote (o Sudeste inteiro tem ~5 mil pontos) */
  const RADAR_MAX_PONTOS = 100000;

  let radares = null;          // [{lat,lng,limite}] — null = ainda não chegou
  let radarDia = '';           // dia operacional do pacote que está na memória
  let radarPedindo = false;
  let radarPausaAte = 0;
  let radarTentativas = { dia: '', n: 0 };
  /** chave do radar → quando ele foi falado (Map, não Set: o silêncio expira) */
  const radarDitos = new Map();
  let radarVozTimer = null;
  /** quando a navegação falou pela última vez — quem escreve é `vozDaManobra` */
  let radarVozOutraEm = 0;

  /** a manobra acabou de falar: o radar cala pela folga (chamado do § da voz) */
  function radarOuviuAVoz() { radarVozOutraEm = Date.now(); }

  const chaveDoRadar = (r) => `${r.lat.toFixed(5)},${r.lng.toFixed(5)}`;

  /* ---- O PACOTE ----------------------------------------------------------
     Um pedido por dia operacional quando dá certo; no máximo três no dia
     quando não dá. O `radarDitos` zera junto com o pacote: dia novo, avisos
     novos. */
  function garantirRadares() {
    const dia = diaOperacional();
    if (radarDia === dia || radarPedindo || Date.now() < radarPausaAte) return;
    if (radarTentativas.dia !== dia) radarTentativas = { dia, n: 0 };
    if (radarTentativas.n >= RADAR_TENTATIVAS_DIA) return;
    radarTentativas.n += 1;
    radarPedindo = true;
    const desistir = () => {
      radarPedindo = false;
      radarPausaAte = Date.now() + RADAR_REPOUSO_MS;
    };
    let pedido = null;
    try { pedido = window.fetch(RADAR_FONTE, { cache: 'no-store' }); } catch (_) { pedido = null; }
    if (!pedido || typeof pedido.then !== 'function') { desistir(); return; }
    pedido
      .then((r) => (r && r.ok ? r.json() : null))
      .then((lista) => {
        if (!Array.isArray(lista)) { desistir(); return; }
        radares = [];
        for (let i = 0; i < lista.length && radares.length < RADAR_MAX_PONTOS; i += 1) {
          const p = lista[i] || {};
          const lat = Number(p.lat); const lng = Number(p.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          // limite ausente é ausente — 3.680 dos 5.093 pontos têm número, e
          // inventar um pros outros é o app multando o motorista de mentira.
          const lim = Number(p.limite);
          radares.push({ lat, lng, limite: Number.isFinite(lim) && lim > 0 ? lim : null });
        }
        radarDia = dia;
        radarPedindo = false;
        radarPausaAte = 0;
        radarDitos.clear();
      })
      .catch(desistir);
  }

  /* ---- O CORREDOR, CAMINHADO PRA FRENTE ----------------------------------
     Devolve `{ primeiro, comLimite }`: o radar mais perto à frente (o do chip)
     e o mais perto à frente QUE TEM LIMITE (o do velocímetro). Podem ser o
     mesmo, podem ser dois, pode não haver nenhum.

     A conta é O(segmentos à frente × radares por perto) e as duas pontas são
     pequenas: o pré-filtro em caixa joga fora o pacote inteiro menos os poucos
     pontos do quarteirão, e a fita é caminhada só até RADAR_ALCANCE_M. */
  function radarAdiante() {
    if (!Array.isArray(radares) || !radares.length) return null;
    const geo = navRota && navRota.geometria;
    const c = geo && geo.coordinates;
    if (!c || c.length < 2) return null;
    const preso = presoNaRota(ultimoFix);
    if (!preso) return null;                     // fora da rota: sem corredor, sem aviso

    const kx = 111320 * Math.cos((preso.lat * Math.PI) / 180);
    const ky = 110540;
    const px = preso.lng * kx; const py = preso.lat * ky;

    const perto = [];
    for (let i = 0; i < radares.length; i += 1) {
      const r = radares[i];
      const x = r.lng * kx; const y = r.lat * ky;
      if (Math.abs(x - px) > RADAR_ALCANCE_M || Math.abs(y - py) > RADAR_ALCANCE_M) continue;
      perto.push({ r, x, y });
    }
    if (!perto.length) return null;

    let primeiro = null;
    let comLimite = null;
    let ax = px; let ay = py; let andou = 0;
    for (let i = preso.i + 1; i < c.length && andou < RADAR_ALCANCE_M; i += 1) {
      const bx = c[i][0] * kx; const by = c[i][1] * ky;
      const dx = bx - ax; const dy = by - ay;
      const den = (dx * dx) + (dy * dy);
      const comprimento = Math.sqrt(den);
      if (den > 0) {
        for (let j = 0; j < perto.length; j += 1) {
          const cand = perto[j];
          let t = ((((cand.x - ax) * dx) + ((cand.y - ay) * dy)) / den);
          /* 🔴 AQUI MORA O FANTASMA, E ELE TEM DUAS CABEÇAS.
             `t < 0` no PRIMEIRO segmento (o pedaço que ainda falta do segmento
             em que o motorista está) quer dizer ATRÁS DELE: grampear em 0
             transformaria um radar 20 m às costas num radar "a 0 m à frente".
             Nos segmentos seguintes o grampe em 0 é CERTO — é o radar do lado
             de fora de um cotovelo, cujo ponto mais perto da fita é o vértice.
             `t > 1` NUNCA se grampeia, e isto custou uma rodada da prova: com o
             grampe, um radar 25 m ADIANTE do fim do segmento casava ali mesmo,
             com a distância LONGITUDINAL entrando no lugar da lateral — 35 m de
             corredor viravam 35 m de sobra pra frente, e o radar era anunciado
             um segmento cedo demais (medido: 255 m onde a rua tinha 280). Quem
             está além deste segmento é medido no próximo, que é o dono dele. */
          if (t > 1) continue;
          if (t < 0) { if (i === preso.i + 1) continue; t = 0; }
          const qx = ax + (t * dx); const qy = ay + (t * dy);
          if (Math.hypot(cand.x - qx, cand.y - qy) > RADAR_CORREDOR_M) continue;
          const achado = { radar: cand.r, distancia: andou + (t * comprimento) };
          if (!primeiro || achado.distancia < primeiro.distancia) primeiro = achado;
          if (Number.isFinite(cand.r.limite)
            && (!comLimite || achado.distancia < comLimite.distancia)) comLimite = achado;
        }
      }
      andou += comprimento;
      ax = bx; ay = by;
    }
    return (primeiro || comLimite) ? { primeiro, comLimite } : null;
  }

  /** km/h do fix, sem arredondar pra tela: aqui o número é de COMPARAÇÃO */
  const radarVelKmh = () => (ultimoFix && Number.isFinite(ultimoFix.velMps) && ultimoFix.velMps > 0
    ? ultimoFix.velMps * 3.6 : 0);

  /** ~9 s de estrada, entre 300 e 600 m: parado avisa cedo, na rodovia avisa antes */
  const janelaDoAviso = () => {
    const v = (ultimoFix && Number.isFinite(ultimoFix.velMps) && ultimoFix.velMps > 0)
      ? ultimoFix.velMps : 0;
    return Math.min(RADAR_AVISO_TETO_M, Math.max(RADAR_AVISO_PISO_M, v * RADAR_AVISO_S));
  };

  /* ---- A VOZ -------------------------------------------------------------
     Uma fala por radar, com a distância arredondada da MESMA régua da manobra
     (`emMetrosDaManobra`) — dois jeitos de dizer distância no mesmo aparelho é
     um deles mentindo. Sem limite no pacote, a frase não inventa número. */
  const radarMetrosFalados = (m) => {
    const t = emMetrosDaManobra(m);
    return t.indexOf(' km') > 0 ? t.replace(' km', ' quilômetros') : t.replace(/ m$/, ' metros');
  };
  const fraseDoRadar = (a) => (Number.isFinite(a.radar.limite)
    ? `Radar de ${Math.round(a.radar.limite)} a ${radarMetrosFalados(a.distancia)}`
    : `Radar a ${radarMetrosFalados(a.distancia)}`);

  /** quanto o radar ainda tem que esperar pra falar (ms). 0 = pode falar. */
  function esperaDaManobra() {
    const desde = Date.now() - radarVozOutraEm;
    if (desde < RADAR_FOLGA_MS) return RADAR_FOLGA_MS - desde;
    const m = manobraDaVez();
    if (!m || !m.passo || !(m.distancia >= 0)) return 0;
    // a próxima fala da manobra: o "prepara" (~300 m) ou, passado ele, o "agora" (~60 m)
    const faltaAteAFala = m.distancia > VOZ_PREPARA_M ? m.distancia - VOZ_PREPARA_M
      : (m.distancia > VOZ_AGORA_M ? m.distancia - VOZ_AGORA_M : 0);
    const v = (ultimoFix && Number.isFinite(ultimoFix.velMps) && ultimoFix.velMps > 0)
      ? ultimoFix.velMps : 0;
    if (!v) return faltaAteAFala <= 0 ? RADAR_FOLGA_MS : 0;
    const segundos = faltaAteAFala / v;
    if (segundos > RADAR_ANTECIPA_S) return 0;
    return Math.round(segundos * 1000) + RADAR_FOLGA_MS;
  }

  /* 🔴 O ADIAMENTO NÃO VIRA LAÇO. O timer tem UMA chance: se na hora dele a
     manobra ainda estiver mandando, ele desiste e quem re-arma é o próximo fix
     (vem um por segundo). Timer que se reagenda sozinho vira fila infinita de
     avisos velhos — e aviso velho fala uma distância que não existe mais. */
  function agendarVozRadar(ms) {
    if (radarVozTimer) clearTimeout(radarVozTimer);
    radarVozTimer = setTimeout(() => {
      radarVozTimer = null;
      const achado = radarAdiante();
      const alvo = achado && achado.primeiro;
      if (!alvo || alvo.distancia > janelaDoAviso() + RADAR_MARGEM_M) return;
      if (esperaDaManobra() > 0) return;
      dizerRadar(alvo);
    }, ms);
  }

  function dizerRadar(alvo) {
    const chave = chaveDoRadar(alvo.radar);
    const dito = radarDitos.get(chave);
    if (dito && Date.now() - dito < RADAR_MUDO_MS) return;
    radarDitos.set(chave, Date.now());
    falar(fraseDoRadar(alvo));
  }

  function vozDoRadar(alvo) {
    if (!alvo || !vozLigada()) return;
    const chave = chaveDoRadar(alvo.radar);
    const dito = radarDitos.get(chave);
    if (dito && Date.now() - dito < RADAR_MUDO_MS) return;
    const espera = esperaDaManobra();
    if (espera > 0) { agendarVozRadar(espera); return; }
    dizerRadar(alvo);
  }

  /* ---- O QUE A TELA MOSTRA ------------------------------------------------
     🔴 ESCRITA DIRETA NO NÓ, NUNCA NO SEAM (a lei que o pisca de 08/08 pagou):
     isto muda a cada fix, e o seam remonta a camada — seria a tela do mapa
     nascendo de novo uma vez por segundo. O `.gps-radar` e o `.gps-vel` são
     nós PERMANENTES do desenho; aqui só se troca classe e texto. Repinte
     devolve os dois no estado apagado, que é o estado seguro, e o fix seguinte
     os reacende. */
  function radarDaRota() {
    const chip = naCamada('.gps-radar');
    const vel = naCamada('.gps-vel');
    if (!chip && !vel) return;
    const achado = radarAdiante();
    const primeiro = achado && achado.primeiro;
    const naJanela = !!(primeiro && primeiro.distancia <= janelaDoAviso() + RADAR_MARGEM_M);

    if (chip) {
      chip.classList.toggle('on', naJanela);
      const lim = chip.querySelector('.lim');
      const texto = naJanela && Number.isFinite(primeiro.radar.limite)
        ? String(Math.round(primeiro.radar.limite)) : '';
      if (lim && lim.textContent !== texto) lim.textContent = texto;
    }

    /* F3 — o velocímetro avermelha contra o limite DO RADAR À FRENTE, que é o
       limite que custa dinheiro. Radar sem limite nunca acende nada. */
    if (vel) {
      const alvo = achado && achado.comLimite;
      const acima = !!(alvo && alvo.distancia <= RADAR_F3_M + RADAR_MARGEM_M
        && radarVelKmh() > alvo.radar.limite);
      vel.classList.toggle('acima', acima);
    }

    if (naJanela) vozDoRadar(primeiro);
  }
