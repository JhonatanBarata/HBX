/* ==========================================================================
   PONTE — o único lugar onde a casca do mock encosta no APARELHO.

   Escrito à mão (NÃO é gerado): `mock.css`/`mock.js` saem do mock e não podem
   ser editados, então tudo que é do aparelho — API, Voltar do Android, teclado,
   tema — mora aqui. Carrega DEPOIS do mock, e só se apoia no que o mock já
   expõe no escopo global (`ir`, `atual`, `T`).

   F2 do PR06082026-RECOMECO-LOGISTICA2. Nesta leva a ponte NÃO busca dado
   nenhum: ela abre a porta. A fiação por cena entra a partir da L1.
   ========================================================================== */
(function () {
  'use strict';

  const temPonte = () => typeof window.HBX !== 'undefined' && typeof window.HBX.api === 'function';

  /* 🔴 `let`/`const` de topo NÃO viram propriedade de `window` — só `var` e
     `function` viram. O mock declara `let atual`, então `window.atual` é
     SEMPRE undefined, e quem ler assim vai achar que não tem tela nenhuma
     (foi o que fez o Voltar devolver "não tratei" no aparelho, medido no g15).
     Referência NUA resolve pelo escopo léxico global, que os dois scripts
     compartilham — é assim que se lê o estado do mock. */
  const telaAtual = () => { try { return atual; } catch (_) { return null; } };

  /* 🔴 A CAMADA VIVA É A ÚLTIMA, NUNCA A PRIMEIRA. Durante a troca de tela
     existem DUAS `.tela` no DOM: a que entra e a que morre. `querySelector`
     devolve a PRIMEIRA — a moribunda — e quem procurar botão ali acha nada (ou
     acha o botão errado, que some no instante seguinte). O mock já aprendeu
     isso no `pintar()`; a ponte tem que falar a mesma língua. */
  const camadaViva = () => {
    const camadas = document.querySelectorAll('#app .tela');
    return camadas.length ? camadas[camadas.length - 1] : null;
  };
  const naCamada = (sel) => {
    const c = camadaViva();
    return c ? c.querySelector(sel) : null;
  };

  /* ------------------------------------------------------------------------
     1. TEMA COM UM DONO SÓ.
     O `native.js` já resolve o tema com três entradas (escolha do dono, virada
     de turno e o aparelho) e espelha em `data-luz`. O mock tem o `trocarLuz`
     dele. Dois donos do tema um dia discordam — e quem perde é a tela, que
     fica clara com o app escuro. Aqui o mock passa a OBEDECER o native: manda
     a escolha pra ele e só repinta quando ele avisa.
     ------------------------------------------------------------------------ */
  if (temPonte() && typeof window.trocarLuz === 'function') {
    const doMock = window.trocarLuz;
    window.trocarLuz = function (escolha) {
      // vocabulário do mock (escuro/claro/sistema) → o do native (dark/light/system)
      const mapa = { escuro: 'dark', claro: 'light', sistema: 'system' };
      if (mapa[escolha]) { window.HBX.theme.set(mapa[escolha]); return; }
      doMock(escolha);
    };
    // o native mexeu no tema (turno virou, aparelho mudou): a tela acompanha.
    document.addEventListener('hbx:theme', () => {
      if (typeof window.pintar === 'function') window.pintar(false);
    });
  }

  /* ------------------------------------------------------------------------
     2. VOLTAR DO ANDROID (Lei 10 do app).
     O Kotlin pergunta `window.HBXApp.handleBack()`: `true` = eu tratei,
     `false` = pode sair do app. A ordem é a de sempre: primeiro fecha o que
     está POR CIMA, depois volta pra Rota, e só na Rota é que sair vale.
     Camada nova do mock entra AQUI, não em outro lugar.
     ------------------------------------------------------------------------ */
  /* 🔴 A LISTA É A DO MOCK, NA ORDEM DO Z-INDEX — de cima pra baixo:
     aula(70) · erro(60) · portão(59) · confirmação(58) · aviso(55).
     Duas coisas estavam erradas aqui e as duas se viam na tela:
     · `.aula-wrap` NÃO EXISTIA nesta lista. A aula é a camada MAIS ALTA do app
       e o Voltar passava por baixo dela — com a aula aberta, Voltar trocava a
       tela ATRÁS do holofote (ou saía do app), deixando o furo apontando pro
       nada. E `.sheet-wrap`/`.modal-wrap` são nomes do app ANTIGO: não existem
       em nenhuma tela do 2.0, eram duas voltas de laço procurando fantasma.
     · portão e confirmação estavam TROCADOS. Com os dois na tela, o Voltar
       fechava o de baixo e o de cima continuava na cara do motorista. */
  const POR_CIMA = ['.aula-wrap', '.erro-wrap', '.portao-wrap', '.conf-wrap', '.aviso'];
  window.HBXApp = window.HBXApp || {};
  window.HBXApp.handleBack = function () {
    const camada = camadaViva();
    if (camada) {
      for (const sel of POR_CIMA) {
        const peca = camada.querySelector(sel);
        if (!peca) continue;
        // 🔴 TRAVA É TRAVA — mas quem diz se trava é o ESCAPE, não o tom.
        // Escape = o botão que sai SEM resolver. O portão marca (`data-escape`);
        // erro e confirmação não marcam, e ali o escape é o `data-fechar` que
        // NÃO é o principal ("Fechar", "Não"). Camada sem escape nenhum é
        // obrigatória (atualização obrigatória, por ex.) e Voltar não pode ser
        // a porta dos fundos: engole o Voltar (`true` sem fechar) e a trava
        // continua de pé, com o app aberto.
        // ⚠️ Medido no g15: "Créditos acabaram" TEM "Fechar" — tom vermelho não
        // é obrigação, e tratar tom como trava prenderia o dono numa tela.
        const escape = peca.querySelector('[data-escape], [data-fechar]:not(.principal):not(.azul)');
        const eEnfeite = sel === '.aviso';   // aviso passa sozinho; não é decisão
        if (!escape && !eEnfeite) return true;
        /* 🔴 VOLTAR APERTA O BOTÃO DE SAIR — não arranca a peça do DOM.
           Arrancar fechava a caixa e deixava o RASTRO de quem a abriu: o "Não"
           da exclusão é quem tira o `pronto` do cartão (sem ele a parada ficava
           aberta no vermelho do deslize, para sempre), e o "Pular" da aula é
           quem a marca como vista. Apertar o escape roda o fechamento de
           verdade — o MESMO caminho do dedo, e nenhum estado meio-fechado. */
        if (escape) escape.click();
        // Aviso não tem botão: ele sai como sai sozinho (`sai` + 280ms), que é
        // a saída que o mock desenhou. `fechar()` aqui animaria o ÍCONE, porque
        // o aviso não tem wrap — ele É o cartão.
        else if (eEnfeite) { peca.classList.add('sai'); setTimeout(() => peca.remove(), 280); }
        return true;
      }
    }
    // O degrau do meio (dono, 07/08: "primeiro fecha por partes... aí volta").
    // A tela que se entra por dentro carrega a própria volta no cabeçalho ou no
    // × da folha — o Voltar do Android CASA com ele: Financeiro→Ajustes,
    // Semana→Fechamento, Ficha→Clientes.
    //
    // 🔴 QUEM RESPONDE É `[data-voltar]`, NUNCA "o primeiro `data-ir`".
    // `.hdr [data-ir]` pegava o PRIMEIRO link do cabeçalho — e o cabeçalho só
    // começa com a volta nas telas que TÊM volta. Nas outras (Rota, Chat,
    // Venda, Ajustes, Folha, Conferência…) o primeiro é o "+", que é
    // `data-ir="novocliente"`. Medido: **na Rota, o Voltar do aparelho abria
    // "Cadastrar cliente"** — o degrau de sair nunca era alcançado e o app não
    // fechava por Voltar em lugar nenhum. Voltar deduzido por POSIÇÃO anda pra
    // frente no dia em que alguém troca a ordem dos ícones; marcado, não.
    const tela = telaAtual();
    /* 🔴 NA MONTAGEM, O 1º VOLTAR SOLTA O DIA (dono, 10/08). Com um chip aceso a
       tela está mostrando a agenda daquele dia; o Voltar desfaz ESSA escolha
       antes de desfazer a tela — mesmo degrau do portão que fecha antes de a
       tela trocar. Sem dia aceso ele não tem o que soltar e cai pro caminho de
       sempre (Montagem → Rota → sair). */
    if (tela === 'montagem' && soltarDia()) return true;
    if (camada && typeof window.ir === 'function') {
      const volta = camada.querySelector('[data-voltar][data-ir]');
      const destino = volta && volta.dataset ? volta.dataset.ir : '';
      if (destino && destino !== tela) {
        window.ir(destino);
        // `ir()` RECUSA calado (módulo desligado pelo admin, destino que não
        // existe mais). Sem conferir, o Voltar virava tecla morta na mão do
        // motorista: some a tela não muda e o Kotlin acha que foi tratado.
        // Não mudou? cai pro degrau de baixo, que é sempre a Rota.
        if (telaAtual() !== tela) return true;
      }
    }
    if (tela && tela !== 'rota' && typeof window.ir === 'function') {
      window.ir('rota');
      if (telaAtual() === 'rota') return true;
    }
    return false;   // na Rota, Voltar sai do app — um toque só (Kotlin)
  };

  /* ------------------------------------------------------------------------
     2b. O CORDÃO DE ENTREGA — aviso de atualização (F4 do app antigo, portado
     na noite de 07/08). A fusão apagou o app.js e levou o checkAppUpdate
     junto: o servidor publicava o APK novo e o celular NUNCA perguntava — a
     troca teria sido a última atualização da vida do aparelho. O contrato
     nativo é o de sempre (HBXAndroid.appInfo / updateInstallAllowed /
     openInstallPermission / downloadAndInstall + window.HBXUpdate).
     Avisa TODA versão nova, UMA vez por versionCode (memória no cache);
     obrigatória avisa sempre e o portão nasce SEM escape — o handleBack já
     engole o Voltar de portão sem escape, então a trava fecha sozinha.
     ------------------------------------------------------------------------ */
  const bridgeCru = () => (typeof window.HBXAndroid !== 'undefined' ? window.HBXAndroid : null);
  let updateInfo = null;
  let updateBusy = false;
  let updateCheckEm = 0;
  let updateAguardaPermissao = false;

  function portaoUpdate() {
    if (!updateInfo || typeof window.portao !== 'function') return;
    // A abertura é uma cena com relógio; portão em cima dela morre na troca
    // de camada. Espera a casa (Rota) estar de pé.
    if (telaAtual() === 'entrada') { setTimeout(portaoUpdate, 2500); return; }
    const b = bridgeCru();
    const podeInstalar = b && typeof b.updateInstallAllowed === 'function' ? !!b.updateInstallAllowed() : true;
    const acoes = [];
    if (!updateInfo.obrigatoria && !updateBusy) acoes.push(['Agora não', '']);
    acoes.push([updateBusy ? 'Baixando…' : (podeInstalar ? 'Atualizar agora' : 'Abrir permissão'), 'principal', false]);
    window.portao({
      tom: 'info', ico: 'download', titulo: 'Atualizar app',
      sub: updateBusy ? 'Baixando…'
        : `Versão ${updateInfo.versionName || ''} pronta.${podeInstalar ? '' : ' O Android vai abrir uma tela: ligue "Permitir desta fonte" e volte.'}`,
      acoes, classe: acoes.length === 2 ? 'duas' : '',
    });
    if (updateBusy) return;
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    /* 🔴 A MEMÓRIA SÓ VALE DEPOIS QUE O PORTÃO NASCEU (09/08). O carimbo
       `update-avisado` era posto no `checkAppUpdate`, ANTES de pintar — e o
       portão mora na camada VIVA, que qualquer repinte do boot (`carregarRota`
       chega junto) leva embora. Resultado medido no aparelho do dono: versão
       nova no servidor, pop-up morto no berço, versão marcada como "já avisada"
       e nenhum caminho de volta. Carimbo de "eu avisei" só depois que o aviso
       está DE PÉ na tela. */
    if (!updateInfo.obrigatoria && window.HBX && window.HBX.cache) {
      window.HBX.cache.set('update-avisado', updateInfo.versionCode);
    }
    botao.addEventListener('click', () => {
      if (!podeInstalar) {
        updateAguardaPermissao = true;
        try { const bb = bridgeCru(); if (bb && bb.openInstallPermission) bb.openInstallPermission(); } catch (_) { /* sem tela de permissão: o instalador pede */ }
        return;
      }
      iniciarDownloadUpdate();
    }, { once: true });
  }

  function iniciarDownloadUpdate() {
    const b = bridgeCru();
    if (!updateInfo || !updateInfo.url || !updateInfo.sha256
      || !b || typeof b.downloadAndInstall !== 'function') {
      return avisoErro(new Error('Atualização indisponível agora.'));
    }
    window.HBXUpdate = {
      onProgress: (p) => {
        const v = Math.max(0, Math.min(100, Number(p) || 0));
        if (v >= 100) { updateBusy = false; return; }
        const wrap = naCamada('.portao-wrap');
        const sub = wrap ? wrap.querySelector('.sub') : null;
        if (sub) sub.textContent = `Baixando… ${v}%`;
      },
      onError: (msg) => { updateBusy = false; avisoErro(new Error(msg || 'Falha ao atualizar.')); },
    };
    updateBusy = true;
    portaoUpdate();
    try { b.downloadAndInstall(updateInfo.url, updateInfo.sha256, updateInfo.versionName || ''); }
    catch (_) { updateBusy = false; avisoErro(new Error('Não consegui iniciar a atualização.')); }
  }

  /* Toque manual (`forcado`) SEMPRE responde — é o contrato do app antigo, que
     a fusão perdeu. Silêncio num botão que o dono acabou de tocar é botão morto:
     ele fica sem saber se o app está atualizado, se a rede caiu ou se o toque
     nem chegou. Checagem automática continua CALADA quando não há novidade. */
  const respostaSeco = (titulo, sub) => {
    if (typeof window.portao !== 'function') return;
    window.portao({ tom: 'info', ico: 'download', titulo, sub, acoes: [['Entendi', 'principal', true]] });
  };

  /* 🔴 O CATCH QUE CHUTA A CAUSA MENTE (09/08, medido no aparelho do dono no APK
     211). `fetch` barrado pela CSP e `fetch` sem internet chegam aqui com a
     MESMA cara ("Failed to fetch"), e a frase "confira a internet" mandou o dono
     olhar o wi-fi enquanto o problema era a POLÍTICA do próprio app — o
     `connect-src` do index.html, perdido numa injeção do gerador. O navegador
     conta a verdade num evento à parte; quem escuta, sabe qual das duas é. */
  let cspBarrouEm = 0;
  document.addEventListener('securitypolicyviolation', (e) => {
    const alvo = String((e && e.blockedURI) || '');
    const regra = String((e && e.violatedDirective) || '');
    if (alvo.includes('version-logistica') || regra.indexOf('connect-src') === 0) cspBarrouEm = Date.now();
  });

  async function checkAppUpdate(forcado) {
    if (!forcado && Date.now() - updateCheckEm < 1800000) return;   // 30 min
    const b = bridgeCru();
    if (!b || typeof b.downloadAndInstall !== 'function') {         // nativo antigo: sem auto-update
      if (forcado) respostaSeco('Atualização', 'Esta versão do aplicativo não atualiza sozinha. Fale com a Central.');
      return;
    }
    const info = (window.HBX && window.HBX.info && window.HBX.info()) || {};
    const base = String(info.webBaseUrl || '').replace(/\/+$/, '');
    const meu = Number(info.versionCode || 0);
    if (!base || !meu) {
      if (forcado) respostaSeco('Atualização', 'Não consegui identificar a versão instalada agora.');
      return;
    }
    updateCheckEm = Date.now();
    let v;
    try {
      const r = await fetch(`${base}/downloads/version-logistica.json`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      v = await r.json();
    } catch (_) {
      if (forcado) {
        avisoErro(new Error(Date.now() - cspBarrouEm < 5000
          ? 'Esta versão do app não consegue procurar atualização. Baixe a nova em hbxsystem.com.br e avise a Central.'
          : 'Não consegui verificar agora. Confira a internet e tente de novo.'));
      }
      return;
    }
    if (!v || !(Number(v.versionCode) > meu)) {
      // Já está na mais recente: some com o rastro de uma versão que ele já
      // instalou (senão a linha dos Ajustes continuaria oferecendo o que não
      // existe mais) e responde a quem perguntou.
      updateInfo = null;
      pintarLinhaVersao();
      if (forcado) respostaSeco('Tudo certo', 'Você já está na versão mais recente.');
      return;
    }
    updateInfo = {
      versionName: v.versionName || '', versionCode: Number(v.versionCode),
      url: v.url || '', sha256: v.sha256 || '', obrigatoria: !!v.obrigatoria,
    };
    // A linha dos Ajustes passa a ANUNCIAR — ela é a porta que sobrevive ao
    // pop-up perdido, então precisa saber que há versão nova mesmo se o portão
    // nascer e morrer num repinte.
    pintarLinhaVersao();
    // avisa 1x por versionCode; obrigatória e toque manual furam a memória
    const jaAvisado = Number((window.HBX.cache && window.HBX.cache.get('update-avisado', 0)) || 0);
    if (!updateInfo.obrigatoria && !forcado && updateInfo.versionCode <= jaAvisado) return;
    portaoUpdate();
  }

  const retomarPosPermissao = () => {
    if (!updateAguardaPermissao) return;
    const b = bridgeCru();
    const ok = b && typeof b.updateInstallAllowed === 'function' ? !!b.updateInstallAllowed() : true;
    if (ok) { updateAguardaPermissao = false; iniciarDownloadUpdate(); }
  };
  window.addEventListener('focus', () => { retomarPosPermissao(); checkAppUpdate(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { retomarPosPermissao(); checkAppUpdate(); }
  });
  /* 🔴 EVENTO QUE NÃO DISPARA NÃO É GARANTIA (09/08) — mesma lei que já vale
     pra `carregarBarra` neste arquivo: MEDIDO no g15, `visibilitychange` NÃO
     dispara neste app (a Activity fica viva, a WebView nunca é pausada), e o
     `focus` da janela segue o mesmo destino. Ou seja: o único momento em que a
     checagem realmente acontecia era o boot FRIO — e o motorista deixa o app
     aberto o dia inteiro. Publicava-se versão nova e o aparelho não olhava mais.
     Quem garante é o RELÓGIO; os dois eventos ficam como atalho. A trava de 30
     min lá dentro é que manda no custo, então o tique pode ser barato. */
  setInterval(() => checkAppUpdate(), 600000);   // 10 min de tique, 30 min de trava

  /* A linha "Versão" dos Ajustes fala por si: ela diz o que está instalado e,
     quando há versão nova, ANUNCIA. É a porta manual — o pop-up é conveniência,
     esta linha é a garantia. */
  function linhaDaVersao() {
    const info = (window.HBX && window.HBX.info && window.HBX.info()) || {};
    const meu = Number(info.versionCode || 0);
    // 🔴 O versionNAME NÃO IDENTIFICA BUILD (mesma lição do `HbxMobileBridge`):
    // ele é "alpha1" e não muda entre publicações. Sem o versionCODE do lado, o
    // dono olha a tela e não tem como saber se o aparelho pegou a publicação de
    // agora ou a de três dias atrás.
    const nome = info.versionName ? `Versão ${esc(info.versionName)}${meu ? ` (${meu})` : ''}` : '';
    const nova = updateInfo && updateInfo.versionCode > meu;
    return {
      versao: nome,
      versaoSub: nova
        ? `Versão ${esc(updateInfo.versionName || '')} pronta — toque para instalar`
        : 'toque para procurar atualização',
      versaoTag: nova ? 'Atualizar' : '',
    };
  }
  function pintarLinhaVersao() {
    if (typeof window.usarDados !== 'function' || !temPonte()) return;
    window.usarDados('ajustes', linhaDaVersao());
  }

  /* ------------------------------------------------------------------------
     3. TECLADO NUNCA COBRE CAMPO NEM BOTÃO (Lei 4).
     O WebView não encolhe sozinho: quem sabe a altura real é a `visualViewport`.
     A folha usa `--teclado` pra empurrar o que precisa; a classe é o sinal.
     ------------------------------------------------------------------------ */
  const vv = window.visualViewport;
  if (vv) {
    const sincronizar = () => {
      const tomado = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--teclado', `${Math.round(tomado)}px`);
      document.body.classList.toggle('keyboard-open', tomado > 120);
    };
    vv.addEventListener('resize', sincronizar);
    vv.addEventListener('scroll', sincronizar);
    sincronizar();
  }

  /* ------------------------------------------------------------------------
     4. A PORTA DOS DADOS.
     `API.get/post/patch/del` é o que as levas de fiação vão usar. Erro chega
     em PORTUGUÊS de gente (Lei 6): id cru de backend nunca vai pra tela.
     Sem ponte (mock aberto no navegador), a porta REJEITA em vez de inventar
     dado — número inventado em tela de dinheiro é mentira com cara de app.
     ------------------------------------------------------------------------ */
  const humano = (e) => {
    const msg = String((e && e.message) || e || '');
    if (/Failed to fetch|NetworkError|ERR_/i.test(msg)) return 'Sem conexão agora.';
    if (/demorou/i.test(msg)) return 'O servidor demorou. Tente de novo.';
    if (/401|403|sessão|token/i.test(msg)) return 'Sua sessão expirou. Abra o app de novo.';
    if (/Abra esta tela pelo HBX/i.test(msg)) return msg;
    return msg || 'Não consegui agora.';
  };
  /* 🔴 O TRADUTOR APAGAVA O QUE O SERVIDOR DISSE (08/08). O `native.js` entrega
     `error.status` (o código HTTP) e `error.body` (o corpo já lido) — e este
     `catch` jogava os dois no lixo ao trocar de Error. Quem chama ficava sem
     como distinguir "409 porque o cliente tem dívida" de "500 qualquer": a
     mensagem que sobrava era o `Falha 409` cru do envelope. A tradução em
     português continua a mesma (é ela que vai pra tela por padrão); o status e
     o corpo viajam JUNTO pra quem quiser dizer a frase certa daquele caso. */
  const chamar = (metodo, caminho, corpo) => {
    if (!temPonte()) return Promise.reject(new Error('Abra esta tela pelo HBX Logística.'));
    return window.HBX.api(caminho, { method: metodo, body: corpo }).catch((e) => {
      const erro = new Error(humano(e));
      erro.status = Number((e && e.status) || 0);
      erro.body = (e && e.body) || null;
      throw erro;
    });
  };
  window.API = {
    ponte: temPonte,
    get: (c) => chamar('GET', c),
    post: (c, corpo) => chamar('POST', c, corpo),
    patch: (c, corpo) => chamar('PATCH', c, corpo),
    del: (c) => chamar('DELETE', c),
  };

  /* ------------------------------------------------------------------------
     5. L1 — A ROTA DO DIA COM DADO REAL.
     A ponte TRADUZ o que o servidor mandou pro vocabulário do mock e entrega
     no seam (`usarDados`). Ela não decide nada: campo sem fonte vai VAZIO,
     nunca com número de enfeite.
     ------------------------------------------------------------------------ */
  const dinheiro = (n) => (typeof n === 'number' && isFinite(n)
    ? `R$ ${n.toFixed(2).replace('.', ',')}`
    : '');
  const hora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isFinite(d.getTime())
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : '';
  };
  /* 🔴 O DIA DA OPERAÇÃO É O DE SÃO PAULO — nem o do relógio do aparelho, nem o
     do servidor. O servidor roda em UTC (sem TZ, medido nos dois containers) e
     o aparelho pode estar em qualquer fuso; se cada ponta escolher o seu, o
     motorista vê a rota de ontem ou de amanhã dependendo da HORA. Mesma conta
     do `operationalDate()` do app que já roda em produção. */
  const diaOperacional = () => {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    return partes;   // en-CA já formata como AAAA-MM-DD
  };

  /* 🔴 EXTRATO É DOCUMENTO, E DOCUMENTO NÃO MUDA DE HORA CONFORME O APARELHO.
     O `hora()` lá de cima lê o relógio do celular — serve pro que está
     acontecendo agora, na mão do motorista. Aqui não: a mesma entrega tem que
     carimbar a mesma hora em qualquer aparelho, então o relógio é o da operação
     (São Paulo), igual ao `diaOperacional`. Sem isto, o dono viajando vê o
     extrato inteiro deslocado e acha que foi cobrado no dia errado. */
  const diaAnterior = (ymd) => {
    const [a, m, d] = String(ymd).split('-').map(Number);
    if (!a || !m || !d) return '';
    const x = new Date(Date.UTC(a, m - 1, d) - 86400000);
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
  };
  /** AAAA-MM-DD do instante, no fuso da operação. Vazio se a data não presta. */
  const diaEmSp = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  };
  /* "Domingo, 9 de agosto" — o subtítulo da lista/agenda. Sai do dia
     OPERACIONAL (`diaOperacional`, fuso de São Paulo), nunca do relógio do
     aparelho: das 21h à meia-noite o `new Date()` local e o dia da operação já
     divergem, e a tela escreveria a data de amanhã em cima da rota de hoje.
     Montado a partir do AAAA-MM-DD com `Date.UTC` pelo mesmo motivo de sempre —
     `new Date('2026-08-09')` é meia-noite UTC, que no Brasil ainda é o dia 8. */
  const dataPorExtenso = (ymd) => {
    const [a, m, d] = String(ymd || '').split('-').map(Number);
    if (!a || !m || !d) return '';
    const x = new Date(Date.UTC(a, m - 1, d));
    if (!isFinite(x.getTime())) return '';
    const txt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
    }).format(x);
    return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : '';
  };
  /** "12/09" — a data curta que se lê num aviso de vencimento. */
  const diaCurto = (iso) => {
    const ymd = diaEmSp(iso);
    return ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '';
  };
  /** "hoje 06:12" · "ontem 17:40" · "05/08" — o quando de uma linha do extrato. */
  const quandoDoExtrato = (iso) => {
    const ymd = diaEmSp(iso);
    if (!ymd) return '';
    const hoje = diaOperacional();
    if (ymd !== hoje && ymd !== diaAnterior(hoje)) return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
    const hm = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
    return `${ymd === hoje ? 'hoje' : 'ontem'} ${hm}`;
  };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  /* "agosto" — e "dezembro/2025" quando o ano NÃO é o corrente. O bônus é do mês
     anterior: em janeiro, "dezembro" sozinho é o dezembro errado. */
  const mesRotulo = (ym) => {
    const s = String(ym || '');
    const nome = MESES[Number(s.slice(5, 7)) - 1];
    if (!nome) return '';
    return s.slice(0, 4) === diaOperacional().slice(0, 4) ? nome : `${nome}/${s.slice(0, 4)}`;
  };

  const distancia = (m, s) => {
    if (!(m > 0)) return '';
    const km = m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`;
    const min = s > 0 ? ` · ${Math.max(1, Math.round(s / 60))} min` : '';
    return km + min;
  };

  /* estado da rota, no vocabulário do transmux do mock.
     🔴 O VOCABULÁRIO É O DO SERVIDOR, MEDIDO — não o que eu achei que era. O
     `LogisticaRoute.status` vale `PLANNED | INITIALIZING | ACTIVE | COMPLETED |
     REFUNDING | FAILED`, e o tracking troca por `ENCERRADA` quando o dia foi
     encerrado operacionalmente. Eu comparava com 'em_rota'/'iniciada', que não
     existem: rota INICIADA (ACTIVE, conferido no banco de produção) caía no
     `if (routeId)` e a tela mostrava "Iniciar" numa rota que já estava rodando.
     Tocar de novo dava erro — mais um passo sem sequência. */
  function estadoDaRota(r) {
    const s = String(r.routeStatus || '').toUpperCase();
    if (s === 'ACTIVE' || s === 'INITIALIZING') return 'rodando';
    // Encerrada/concluída NÃO é rodando: o dia fechou. Se ainda sobrou parada
    // aberta com ordem, o estado é "pronta" (dá pra reiniciar no mesmo dia).
    if (s === 'PLANNED') return 'pronta';
    /* 🔴 SEM `routeId` A ROTA AINDA PODE ESTAR MONTADA — e foi isto que quebrou
       a sequência inteira (dono, 07/08: "cliquei em iniciar rota → monte a rota
       antes"; e depois "não tem sequência, não tem vida"). O `routeId` é a rota
       OPERACIONAL do rastreamento, e ela só nasce no INICIAR. Quem prova que o
       dia foi PLANEJADO é a ordem gravada em cada parada (`rotaOrdem`), que é
       exatamente o que o `rota/planejar` grava. Lendo só o routeId, montar não
       mudava nada na tela: o botão continuava "Montar rota" pra sempre e o
       "Iniciar" ficava num botão fixo, disponível antes da hora. */
    const itens = Array.isArray(r.items) ? r.items : [];
    const abertas = itens.filter((it) => {
      const st = String((it && it.status) || '');
      return st !== 'entregue' && st !== 'cancelada';
    });
    const montadas = abertas.filter((it) => it.rotaOrdem !== null && it.rotaOrdem !== undefined);
    // TODAS as abertas com ordem = dia planejado. Uma parada nova entrou depois
    // (sem ordem)? Volta pra "montar" — é verdade: falta planejar de novo.
    if (abertas.length && montadas.length === abertas.length) return 'pronta';
    return 'montar';
  }

  /* 🔴 SEM ROTA MONTADA, O MAPA NÃO DESENHA ROTA NENHUMA (dono, 09/08 — print
     do g15 com o rodapé em "Montar rota"). Ele havia CANCELADO a rota e mesmo
     assim via 6 pinos numerados, a fita verde ligando eles e "52 paradas · 0
     entregues" na barra. Medido no banco de produção (company 48, dia 09/08):
     52 entregas `agendada`, **0 com `rotaOrdem`** — ou seja, a tela estava
     vestindo de ROTA aquilo que é só AGENDA. Pino numerado é a SEQUÊNCIA da
     visita; sem ninguém ter montado, esse número é invenção.

     A régua mora AQUI, num lugar só, e as três telas que ela governa (os
     pinos, o enquadramento e a fita) a CONSULTAM — espalhar `if (estadoRota…)`
     por três arquivos é como as regras desta casa se contradizem no primeiro
     estado novo.

     🔴 E O CORTE É PELO ESTADO DA ROTA, NUNCA PELO STATUS DA PARADA. Parada
     `cancelada` é o "Não entregue" do motorista: com a rota RODANDO ela
     continua no mapa, com a cor dela. Filtrar por status apagaria da tela
     justamente a parada que ele precisa reencontrar. */
  const rotaMontada = () => {
    const e = (typeof estadoRota !== 'undefined' ? String(estadoRota) : '');
    // `consulta` desenha a fotografia exata da pendência (pinos/fita), mas os
    // eventos de mutação continuam bloqueados nas portas de ordem e entrega.
    return e === 'pronta' || e === 'rodando' || e === 'pausada' || e === 'consulta';
  };

  /* 🔴 O TEMPLATE DO MOCK INTERPOLA CRU (`${…}`), como toda maquete. Enquanto o
     dado era do mock isso não tinha dono; com dado REAL passa a ter: um nome de
     cliente com `<` quebra a marcação e o cartão some da lista sem erro nenhum.
     Escapa-se na FONTE (aqui), nunca no template — assim vale pra toda tela que
     ler o seam, e o literal do mock (que tem `<b>` de propósito) continua vivo. */
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /* 🔴 A LINHA DE ENDEREÇO SE MONTA NUMA RÉGUA SÓ (09/08, dono: "o q for regra
     no celular é desktop tbm"). Espelho fiel de `linhaEnderecoDaFonte`
     (backend/src/logistica/logistica-geo-fonte.util.ts): sem rua devolve
     "nº 123"; número já escrito dentro do texto da rua não é repetido, senão
     o legado "Rua X, 123 - Centro" viraria "Rua X, 123 - Centro, 123".

     Medido na empresa 41: 44 dos 225 clientes têm o número SÓ na coluna
     `numero`. As listas que montavam a linha com o `endereco` cru mostravam
     "Rua M-7" onde o computador mostra "Rua M-7, 897" — 20% da base com dois
     endereços dependendo da tela. Endereço é DADO; dado não muda de valor
     conforme a tela.

     🔴 ELA SÓ ENTRA ONDE O SERVIDOR NÃO MANDOU A LINHA PRONTA — hoje, só a
     porta "Meus clientes" (`/nucleo/clientes` manda `endereco` e `numero`
     separados). Agenda (`dia-preview`) e histórico (`rota/historico`) já vêm
     com `enderecoLinha` montada lá: recalcular a linha de quem já a tem é
     criar a segunda régua de novo, com outro nome. */
  function linhaDeEndereco(endereco, numero) {
    const rua = String(endereco == null ? '' : endereco).trim();
    const num = String(numero == null ? '' : numero).trim();
    if (!rua) return num ? `nº ${num}` : '';
    if (!num) return rua;
    const numEsc = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^0-9])${numEsc}([^0-9]|$)`).test(rua) ? rua : `${rua}, ${num}`;
  }

  /* 🔴 RÉGUA ÚNICA DE PINO (09/08). "Esta linha tem porta marcada?" era a mesma
     pergunta escrita de SEIS jeitos neste arquivo: umas cópias só checavam
     `typeof === 'number'`, outras somavam `isFinite`, e as duas primeiras da
     lista da montagem deixavam o par (0,0) passar. Cópia de régua é exatamente
     como duas telas do mesmo app voltam a discordar.

     · 0,0 é o Golfo da Guiné, não a porta do cliente — coluna zerada por
       importação é AUSÊNCIA de pino, e foi ela que abriu a câmera de Rio Claro
       até o Senegal (medido no g15, APK 206). Zero é finito: `isFinite`
       sozinho não barra o que o `truthy` barrava de graça.
     · faixa (|lat|<=90, |lng|<=180) porque lat/lng trocados desenham pino no
       mar em silêncio, em vez de a linha dizer que não sabe onde fica. */
  function pinoValido(lat, lng) {
    const a = Number(lat);
    const b = Number(lng);
    return Number.isFinite(a) && Number.isFinite(b)
      && Math.abs(a) <= 90 && Math.abs(b) <= 180
      && !(a === 0 && b === 0);
  }

  /* 🔴 A IDENTIDADE DE UMA PARADA É `cliente|porta` (09/08). O mesmo cliente
     em duas portas no mesmo dia são DUAS paradas legítimas, e toda lista que
     deduplicava só pelo cliente apagava a segunda em silêncio. Agenda, rota e
     histórico mandam `localId` — a chave fecha nas três, e sem porta ela é o
     cliente no endereço do perfil, que é o que o legado sempre foi. */
  const chaveDaPorta = (cid, localId) => `${String(cid || '')}|${String(localId || '')}`;

  /* 🔴 O STATUS DA PARADA FALA UMA LÍNGUA SÓ (09/08). A pílula era escrita
     DENTRO do `traduzirParada`, e por isso existia só na lista da rota: a
     montagem — que mostra as MESMAS paradas quando o dia já está montado —
     nascia sem status nenhum, e o dono a viu muda ("os botões do status não
     está aparecendo"). Duas telas escrevendo o mesmo desfecho em dois lugares
     é a receita de dizerem coisas diferentes no primeiro estado novo.

     🔴 CANCELADA NÃO É PENDENTE. Caía no `else` e a parada que o motorista já
     resolveu ("não entregue", com motivo) voltava pra lista com cara de coisa
     por fazer — ele bateria na mesma porta de novo. Visto no g15.
     `mute` + número apagado, e NÃO um vermelho novo: a casca só tem
     blue/lime/amber/mute, e "não entregue" é desfecho FECHADO, não bloqueio
     (Lei 2c: vermelho só quando trava). Inventar `.pill.red` aqui seria criar
     variante que o mock não tem — o oposto de casca única. */
  function pilulaDaParada(statusCru) {
    const status = String(statusCru || '');
    if (status === 'entregue') return ['Entregue', 'lime', 'check'];
    if (status === 'cancelada') return ['Não entregue', 'mute', 'close'];
    if (status === 'em_rota') return ['A caminho', 'blue', 'nav'];
    return ['Pendente', 'mute', 'clock'];
  }
  /* 🔴 A PÍLULA SÓ FALA QUANDO HÁ DESFECHO (12/08, ordem do dono sobre a
     Montagem: *"esse campo não deveria representar o status atual da parada.
     Ele deve representar histórico do cliente"*).

     Na ROTA a pílula continua inteira — lá a linha É uma entrega de hoje, e
     "Pendente" é a notícia. Na MONTAGEM a linha é um CLIENTE do dia: antes de
     montar, TODO mundo é "Pendente", e uma coluna inteira repetindo a mesma
     palavra não informa nada — foi exatamente o que o dono viu na foto.
     O que fica ali é o ÚLTIMO REGISTRO dele (abaixo); a pílula reaparece assim
     que existe desfecho de verdade, que é quando ela volta a ser notícia — e
     com isso a ordem de 09/08 ("os botões do status não estão aparecendo" na
     rota já montada) continua valendo, sem exceção escrita à mão. */
  function pilulaDeDesfecho(statusCru) {
    const status = String(statusCru || '');
    if (status === 'entregue' || status === 'cancelada' || status === 'em_rota') return pilulaDaParada(status);
    return null;
  }

  /* 🔴 ÚLTIMO REGISTRO = A ÚLTIMA ENTREGA CONCLUÍDA DAQUELE CLIENTE (12/08).
     A data vem PRONTA do servidor (`ultimaEntregaAt`, régua única em
     `logistica-ultima-entrega.util`: status `entregue` + `deliveredAt`), nunca
     de uma conta desta tela — derivar "quando foi a última vez" do status da
     parada de hoje era justamente o defeito.
     Sem registro nenhum a palavra é "Pendente": é o que a tela já dizia, e é
     honesto — cliente novo não tem histórico. Data inventada aqui poria na mão
     do motorista uma visita que nunca aconteceu. */
  const ROTULO_ULTIMO_REGISTRO = 'Ult. Registro';
  const ultimoRegistro = (iso) => [ROTULO_ULTIMO_REGISTRO, diaCurto(iso) || 'Pendente'];

  /** o tom do NÚMERO da parada — o par visual da pílula acima */
  function corDaParada(statusCru) {
    const status = String(statusCru || '');
    if (status === 'entregue') return 'lime';
    if (status === 'cancelada') return 'off';
    return undefined;
  }

  /* 🔴 "00:00" EM 107 CARTÕES NÃO É HORA, É A DATA (dono, 09/08 — a lista das
     107 canceladas, todas marcando meia-noite). `scheduledAt` de entrega sem
     horário combinado é a MEIA-NOITE do dia operacional (medido em produção:
     as 107 da company 41 têm `2026-08-09 03:00:00Z`, que é 00:00 em São Paulo).
     Imprimir isso põe um compromisso na tela do motorista que ninguém marcou.

     A hora de verdade tem duas origens e só duas: a `etaAt`, que o planejador
     calcula quando a rota é MONTADA, e um `scheduledAt` com hora de fato
     escolhida. Meia-noite vinda do agendamento é "sem hora" — some, e o `.hh`
     do cartão fica vazio como já fica na Montagem. É a Lei do IF aplicada a um
     campo que ninguém tinha olhado: zero não é informação, meia-noite também
     não. */
  /* 🔴 …E MEIA-NOITE TEM DUAS CONVENÇÕES NESTE BANCO (medido 09/08, company 41).
     A maioria das entregas do dia 9 tem `2026-08-09T03:00:00Z` — meia-noite de
     São Paulo, o carimbo certo. Mas 30 delas, criadas pelo `rota-modelo gerar`,
     têm `2026-08-09T00:00:00Z` — meia-noite UTC —, e o aparelho as imprimia
     como **21:00**: uma hora de compromisso, com cara de horário combinado, num
     lote inteiro em que ninguém combinou nada. Cortar só o "00:00" do relógio
     do aparelho pegaria uma convenção e deixaria a outra passando.
     Hora combinada de verdade neste produto mora na JANELA do plano
     (`janelaInicio`/`janelaFim`), campo próprio; o horário de `scheduledAt` é
     marcador de DIA em qualquer um dos dois carimbos. Então: meia-noite em São
     Paulo OU meia-noite em UTC = sem hora. */
  const ehMarcadorDeDia = (iso) => {
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return true;
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return true;
    const hm = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
    return hm === '00:00' || hm === '24:00';
  };
  function horaDaParada(item) {
    if (item && item.etaAt) return hora(item.etaAt);
    if (!item || !item.scheduledAt || ehMarcadorDeDia(item.scheduledAt)) return '';
    return hora(item.scheduledAt);
  }

  /** uma parada do servidor → uma linha do mock */
  function traduzirParada(item, i, anterior) {
    const c = item.cliente || {};
    const status = String(item.status || '');
    const tags = [];
    if (item.quantidade > 0) tags.push([`${item.quantidade}x`, 'blue']);
    const pill = pilulaDaParada(status);
    return {
      // 🔴 O ID É O QUE FAZ A PARADA VIRAR BOTÃO. O `stop()` do mock só põe o
      // gancho quando ele existe — parada de maquete continua inerte.
      id: item.id,
      /* 🔴 O DESFECHO CRU, PRA LISTA PODER SE SEPARAR (dono, 09/08: "isso é a
         agenda? separe o q foi agendado"). Sem rota montada a folha agrupa as
         paradas por status (`listaParadasSeparada`) — e agrupar lendo a PALAVRA
         da pílula amarraria a separação à copy: trocar "Não entregue" por
         qualquer outra coisa desmontaria a lista sem um erro sequer. A pílula
         TRADUZ este campo; ela não é a fonte dele. */
      st: status,
      mapStatus: String(item.mapStatus || ''),
      chegou: !!item.arrivedAt || !!(window.HBX && window.HBX.cache && window.HBX.cache.get(`chegada:${item.id}`, null)),
      // 🔴 O NÚMERO DA TELA É A ORDEM DA VISITA, e gente conta do 1. O servidor
      // grava `rotaOrdem` começando em ZERO — usar o campo cru punha "0, 1, 2"
      // na frente do motorista (visto no g15). A ordem do servidor decide a
      // SEQUÊNCIA; o número que aparece é a posição na fila.
      n: i + 1,
      hora: horaDaParada(item),
      cor: corDaParada(status),
      nome: esc(c.nome),
      // A MESMA linha da Montagem (`enderecoLinha`, montada no servidor pela régua
      // única) — aqui se lia `c.endereco` cru, e "Rua M-7" sem o 897 é outro
      // endereço. Duas listas do mesmo app não podem escrever a mesma porta de
      // dois jeitos (dono, 09/08).
      rua: esc(c.enderecoLinha || ''),
      bairro: esc(c.bairro || c.cidade || ''),
      /* o pino do mapa sai daqui; sem coordenada a parada existe na lista e
         NÃO aparece no mapa (é o que "sem trajeto" já conta pro motorista).
         🔴 OS DOIS EIXOS ANDAM JUNTOS, pela régua única: cada campo com o seu
         próprio teste deixava passar meia coordenada (lat boa, lng nula) —
         é o "pino Frankenstein" que o util do servidor nasceu pra matar. */
      lat: pinoValido(c.lat, c.lng) ? Number(c.lat) : null,
      lng: pinoValido(c.lat, c.lng) ? Number(c.lng) : null,
      nota: c.observacoes ? esc(c.observacoes) : undefined,
      tags,
      // valorHoje só existe com o financeiro ligado — sem ele, sem número.
      marcado: typeof item.valorHoje === 'number' ? item.valorHoje.toFixed(2).replace('.', ',') : '',
      pill,
      // parada sem pino não tem trajeto: o mock já pinta isso como ALERTA.
      perna: item.semCoordenada
        ? 'sem trajeto — não sei onde fica'
        : (anterior ? distancia(item.legDistanceM, item.legDurationS) : ''),
    };
  }

  const centavos = (c) => (typeof c === 'number' && isFinite(c) ? dinheiro(c / 100) : '');
  /* 🔴 LEI DO IF (ordem do dono, 07/08): NADA aparece sem informação.
     Zero NÃO é informação numa quebra por forma de pagamento — se todo mundo
     pagou no pix, a tela mostra só Pix. Estes dois convertem "nada" em VAZIO,
     e o vazio faz o slot sumir no template. Cuidado deliberado: isto vale pra
     RECORTE (quanto entrou em cada forma), não pra medida principal — "0
     paradas hoje" continua sendo um fato que o motorista precisa ler. */
  const seTiver = (v) => (v ? String(v) : '');
  const centavosSeTiver = (c) => (typeof c === 'number' && isFinite(c) && c !== 0 ? dinheiro(c / 100) : '');

  /* 🔴 O DEDO MEXE NA TELA POR FORA DO SEAM. Quando o motorista arrasta um
     cartão, quem muda a lista é o DOM — `DADOS` e `PARADAS` continuam iguais.
     Aí o freio do `usarDados` (que compara DADO com DADO) conclui "nada mudou"
     e engole o repinte: com o servidor RECUSANDO a gravação, a tela ficava na
     ordem que o dedo largou, com um avisinho de erro por cima. Medido na
     bancada: pedido recusado, aviso "Sem conexão agora" e a lista ainda em
     `beta → alfa`, mentindo que gravou.
     Este contador é a mão levantada do gesto: "mexi na tela na unha, o próximo
     repinte tem que acontecer DE VERDADE". Ele entra na digital lá embaixo. */
  let gestoSujouATela = 0;

  /* ------------------------------------------------------------------------
     PROSPECTOR CNPJ — AS EMPRESAS DO CORREDOR CHEGAM NA TELA (08/08).

     🔴 O DEFEITO QUE ISTO FECHA. O servidor achava as empresas, gravava em
     `ProspectoRota` e mandava tudo na resposta do `POST /rota/iniciar` — e esta
     ponte JOGAVA A RESPOSTA FORA (`await window.API.post(...)`, sem destino) e
     nascia com `mapa:{empresas:[]}` cravado, com um comentário dizendo que "o
     prospector ainda não tem servidor". O servidor nasceu no MESMO dia, sete
     horas depois do comentário. Medido em produção em 08/08: 8 empresas
     embarcadas na company 41, ZERO prédios na tela de navegação.

     🔴 DUAS PORTAS, UMA FUNÇÃO. A lista chega no `iniciar` (a resposta do
     clique) E no `GET /logistica/rota` (a releitura do dia). Precisa das duas:
     só a primeira e a lista morre quando o app fecha, troca de tela ou a
     bateria acaba; só a segunda e o motorista dirige um poll inteiro sem
     empresa nenhuma logo depois de iniciar. Mesma tradução nos dois lugares —
     dado em dois caminhos que traduzem diferente é bug de produto.

     🔴 AUSENTE ≠ VAZIO. Sem a chave `prospector` a função volta SEM ESCREVER: é
     "não sei" (prospector desligado, ator sem permissão, migration pendente), e
     não "hoje não tem empresa". Escrever `[]` aqui apagaria da tela, no meio da
     rua, a lista que já estava certa.

     🔴 QUEM DECIDE QUEM ACENDE É O SERVIDOR (`aceso`, ver `ordenarParaAcender`
     no backend). A ponte não escolhe: se ela sorteasse, reabrir o app trocaria
     os prédios acesos sem nada ter acontecido na rua.
     ------------------------------------------------------------------------ */
  /* A fila das 6 janelas de UM prédio ([0,3,1,5,2,4]) — uma por prédio, senão
     todos piscam em coro. DETERMINÍSTICA a partir do CNPJ, nunca sorteada: o
     `usarDados` compara o dado com o de antes, então fila nova a cada volta do
     polling seria dado novo a cada 5 s — a cena de acender recomeçaria sozinha,
     pra sempre, na tela de quem está dirigindo. */
  function filaDeJanelas(id) {
    const fila = [0, 1, 2, 3, 4, 5];
    let semente = 7;
    for (let i = 0; i < id.length; i += 1) semente = (semente * 31 + id.charCodeAt(i)) >>> 0;
    for (let i = fila.length - 1; i > 0; i -= 1) {
      semente = (semente * 1103515245 + 12345) >>> 0;
      const j = semente % (i + 1);
      const troca = fila[i]; fila[i] = fila[j]; fila[j] = troca;
    }
    return fila;
  }

  /* ------------------------------------------------------------------------
     O RAIO-X DO PROSPECTOR (12/08) — a pendência da "dirigida instrumentada".

     🔴 POR QUE UM OBJETO E NÃO UM LOG. Em 12/08 mediu-se: 24 empresas embarcadas
     no servidor e ZERO prédios na tela do g15 (memória:
     prospector-servidor-verde-cliente-mudo). Servidor verde + tela muda é um
     defeito que só se acha comparando QUATRO números que hoje ninguém consegue
     ver juntos: quantas chegaram, quantas são do tipo, quantas estão no ar e em
     que fase a régua parou. Log de cada quadro é impossível — `posicionarEmpresas`
     roda a 60 fps na tela de quem está dirigindo, e logar ali é o próprio
     defeito (a memória do "conferidor media a si mesmo"). Então: um objeto que
     é ESCRITO a cada passada e LIDO quando alguém pergunta (`window.__hbxProspector`
     no console do WebView, ou o Ver Tela do master). Escrever campo em objeto é
     de graça; imprimir não é.

     O ÚNICO log é o do `aplicarProspector`: ele acontece por CHEGADA DE DADO
     (uma vez por poll), não por quadro. */
  window.__hbxProspector = {
    recebidas: 0,      // quantas o servidor mandou
    escolhidas: 0,     // quantas são do TIPO da semana (as verdes)
    noAr: 0,           // quantas estão desenhadas AGORA (fase 1..4 e na moldura)
    fase0: 0,          // quantas a régua ainda não deixou nascer
    reguaNula: false,  // true = sem rumo/fix: a régua não decide nada, ninguém nasce
    tipo: null,        // o slug do que a pessoa escolheu (null = quieto)
    atualizadoEm: null,
  };

  function aplicarProspector(resp) {
    if (typeof window.usarDados !== 'function') return;
    const p = resp && resp.prospector;
    if (!p || !Array.isArray(p.empresas)) return;   // ausente = NÃO SEI (ver acima)
    const empresas = p.empresas
      // 🔴 SEM NOME OU SEM PINO A EMPRESA NÃO ENTRA — é o contrato do seam:
      // "a tela não inventa lugar". Prédio no meio do mapa sem coordenada de
      // verdade seria um convite pra um endereço que ninguém apurou.
      .filter((e) => e && e.nome && Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lng)))
      .map((e, i) => {
        // O id é o GANCHO (`data-acao="abrir-empresa"`) e é o CNPJ: só dígitos.
        const id = String(e.id || e.cnpj || '').replace(/\D/g, '');
        return {
          id,
          // 🔴 RAZÃO SOCIAL É TEXTO DE TERCEIRO (vem da RFB) e o template do
          // mock interpola CRU — mesma lei do nome de cliente e do nome de rua.
          // "COMÉRCIO & CIA" ou um "<" perdido apagariam o prédio da tela sem
          // erro nenhum. Escapa na FONTE.
          nome: esc(e.nome),
          lat: Number(e.lat),
          lng: Number(e.lng),
          distM: Number(e.distM) || 0,
          /* 🔴 AS DUAS CORES (12/08). `escolhida` é do SERVIDOR: o CNAE dela
             bateu no TIPO que a pessoa escolheu pra semana. Verde fala, azul é
             ambiente. A ponte não recalcula nada — ela nem tem a curadoria. */
          escolhida: !!e.escolhida,
          // 🔴 E `aceso` NUNCA sobrevive sozinho: prédio azul aceso seria o app
          // pedindo pro motorista parar por uma empresa que ele não escolheu.
          // O servidor já garante isso; aqui é a segunda trava (a terceira é o
          // `vestirFase`). Trava barata em cima de estrago caro.
          aceso: !!e.aceso && !!e.escolhida,
          ordem: filaDeJanelas(id || String(i)),
          // escalona quem acende primeiro: as três da cena do desenho entram
          // com respiro entre elas, não todas no mesmo quadro.
          atraso: `${(i * 0.75).toFixed(2)}s`,
        };
      });
    const raio = window.__hbxProspector;
    raio.recebidas = p.empresas.length;
    raio.escolhidas = empresas.filter((e) => e.escolhida).length;
    raio.tipo = p.tipo || null;
    raio.atualizadoEm = new Date().toISOString();
    /* O ÚNICO log desta frente, e ele é por CHEGADA DE DADO (uma vez por poll),
       nunca por quadro. É a linha que responde "o servidor mandou e a tela
       recebeu?" — a pergunta que ficou sem resposta no g15 em 12/08. */
    try {
      console.log(
        `[prospector] recebidas=${raio.recebidas} escolhidas=${raio.escolhidas} desenhaveis=${empresas.length} tipo=${raio.tipo || '-'}`,
      );
    } catch (_) { /* console fechado não é motivo pra derrubar a rota */ }
    window.usarDados('mapa', { empresas });
  }

  /* Qual DIA está desenhado na tela agora. É a metade que faltava pra fechar a
     virada da meia-noite: sem guardar isto, ninguém tem como perceber que a
     tela envelheceu. Ver `viradaDoDia`. */
  let diaNaTela = null;
  let continuidadeAtiva = '';
  let rotaRefAtual = '';
  let refsDoAtor = [];
  let pendenciasDaRota = [];
  let pendenciasSemConexao = false;

  const escopoLocalDaSessao = () => {
    try {
      const info = window.HBX && window.HBX.info ? window.HBX.info() : {};
      return String((info && info.sessionScope) || '').trim();
    } catch (_) { return ''; }
  };
  const chavePendencias = (scope) => `rota-pendencias:${String(scope || '').trim()}`;
  function recuperarPendencias() {
    const scope = escopoLocalDaSessao();
    if (!scope || !window.HBX || !window.HBX.cache) return;
    const cached = window.HBX.cache.get(chavePendencias(scope), null);
    if (cached && cached.scopeKey && Array.isArray(cached.items)) {
      vestirPendencias(cached, { persistir: false, semConexao: true });
    }
  }

  const dataDaRotaNaTela = () => diaNaTela || diaOperacional();
  function refDaResposta(r, itens) {
    if (r && r.continuityRef) return String(r.continuityRef);
    if (r && r.routeId) return `route:${String(r.routeId)}`;
    const comDono = (itens || []).find((it) => it && it.entregador && it.entregador.id
      && it.rotaOrdem !== null && it.rotaOrdem !== undefined);
    return comDono ? `draft:${Number(comDono.entregador.id)}:${String((r && r.date) || dataDaRotaNaTela())}` : '';
  }

  function vestirPendencias(resp, opcoes = {}) {
    if (!resp || !Array.isArray(resp.items)) return false;
    const localScope = escopoLocalDaSessao();
    const serverScope = String(resp.scopeKey || '').trim();
    if (!localScope || !serverScope) return false;
    const cacheKey = chavePendencias(localScope);
    const anterior = window.HBX && window.HBX.cache ? window.HBX.cache.get(cacheKey, null) : null;
    if (anterior && anterior.scopeKey && String(anterior.scopeKey) !== serverScope) {
      try { window.HBX.cache.remove(cacheKey); } catch (_) {}
    }
    refsDoAtor = Array.isArray(resp && resp.ownedRefs) ? resp.ownedRefs.map(String) : [];
    pendenciasDaRota = (Array.isArray(resp && resp.items) ? resp.items : []).map((p) => ({
      ref: String(p.ref || ''),
      date: String(p.date || ''),
      dateLabel: diaCurto(p.date) || String(p.date || ''),
      owner: esc(p.owner && p.owner.name ? p.owner.name : 'Funcionário'),
      ownerId: Number(p.owner && p.owner.id) || 0,
      remaining: Number(p.remaining) || 0,
      state: String(p.state || 'planned'),
      canOpen: p.canOpen !== false,
      canContinue: !!p.canContinue,
      canPull: !!p.canPull,
      canCancel: !!p.canCancel,
      active: String(p.ref || '') === continuidadeAtiva,
    })).filter((p) => p.ref && p.remaining > 0);
    // A pele mostra no máximo dois cartões para não cobrir o mapa. O servidor
    // conta apenas o que ficou fora do lote dele; some também o que chegou no
    // lote mas ficou sob esse teto visual, senão 5 pendências viravam 2 sem voz.
    const ocultasNoServidor = Number(resp.hiddenCount) || 0;
    const ocultas = Math.max(0, pendenciasDaRota.length - 2) + ocultasNoServidor;
    if (ocultas > 0) pendenciasDaRota.push({ more: ocultas });
    pendenciasSemConexao = !!opcoes.semConexao;
    if (opcoes.persistir !== false && window.HBX && window.HBX.cache) {
      try {
        window.HBX.cache.set(cacheKey, {
          scopeKey: serverScope,
          ownedRefs: refsDoAtor,
          items: Array.isArray(resp.items) ? resp.items : [],
          // Guarda o contrato cru. Na restauração, a conta visual é refeita e
          // não dobra as que já estavam dentro de `items`.
          hiddenCount: ocultasNoServidor,
        });
      } catch (_) {}
    }
    return true;
  }
  recuperarPendencias();
  /* ---- O GEOFENCE NATIVO: quem arma é a rota que está NA RUA ---------------
     🔴 O MOTOR SEMPRE ESTEVE INTEIRO; O QUE MORREU FOI O CHAMADOR (10/08).
     `RotaService` (GPS em segundo plano), `ChegadaActivity` (o alarme na tela
     apagada) e o `hbx:arrival` do `MainActivity` atravessaram a fusão de 07/08
     sem um arranhão — mas quem entregava as paradas ao Android era o
     `activateRoute` do `iniciarRota` do app VELHO, e o app novo não o portou.
     Medido: de 07/08 até aqui a folha só abria no TOQUE, e o motorista com o
     celular no bolso não era avisado de nada. É o padrão da fusão de sempre
     (capacidade nativa viva, fio cortado).

     O sync mora AQUI, e não no toque do Iniciar, de propósito: `carregarRota`
     é a ÚNICA porta por onde a rota do dia entra na tela — boot, cada desfecho,
     virada da meia-noite, volta do foco. Pendurado no Iniciar, o serviço
     nasceria desarmado em todo caminho que não passa por ele, e "reabri o app
     no meio do turno" é o caso comum, não a exceção.

     🔴 E ELE TAMBÉM DESARMA. Rota encerrada no desktop, dia virado, última
     parada fechada: sem o `stopRoute` o GPS segue ligado no bolso de quem já
     terminou o dia — bateria e ruído, com a tela dizendo que acabou.

     Re-armar não faz parada repetir apito: o `RotaState.setRota` do Kotlin faz
     `disparados.retainAll(ids)`, que só esquece quem SAIU da lista (parada
     reaberta é visita nova, e aí apitar é certo). O freio por assinatura abaixo
     é só pra não pedir `startForegroundService` a cada foco da janela. */
  let geofenceAssinatura = '';

  function raioDaChegada() {
    /* `config` chega pelo `carregarBarra` e a `let` dele mora bem mais abaixo
       neste arquivo — no boot isto pode cair em TDZ, e é o mesmo motivo dos
       outros `try` desta função. 60 m é o padrão do servidor E do Kotlin (que
       ainda clampa entre 20 e 1000), então errar pra cá não inventa nada. */
    try {
      const v = Number(config && config.raioChegadaM);
      return Number.isFinite(v) && v > 0 ? v : 60;
    } catch (_) { return 60; }
  }

  function sincronizarGeofence(r, itens) {
    if (!temPonte() || typeof window.HBX.activateRoute !== 'function') return;
    /* 🔴 DESARMA SEMPRE, E O FREIO É DO OUTRO LADO. A 1ª versão pulava o
       `stopRoute` quando a assinatura já estava vazia ("nada a desarmar") — e
       isso é falso justamente no caso que importa: `RotaService` é START_STICKY
       e o `RotaState` é PERSISTIDO, então o serviço sobrevive ao app fechado.
       Quem encerrasse o dia, fechasse o app e abrisse de novo caía numa
       assinatura vazia (módulo novo) com o GPS ainda rodando no bolso.
       Quem sabe se há algo a parar é o Kotlin, e ele já responde: o
       `requestStop` começa com `if (!isRunning) return`. Pedir é barato;
       presumir é que sai caro. */
    const desarmar = () => {
      geofenceAssinatura = '';
      try { if (typeof window.HBX.stopRoute === 'function') window.HBX.stopRoute(); } catch (_) { /* ponte velha */ }
    };
    /* SÓ 'rodando'. Pausada é pausa DELIBERADA (almoço, imprevisto) — apitar
       ali é ruído em cima de quem escolheu parar. E 'pronta'/'montar' é rota
       que ainda não saiu: geofence antes de sair é alarme na garagem. */
    let naRua = false;
    try { naRua = estadoRota === 'rodando'; } catch (_) { return; }
    if (!naRua) return desarmar();

    /* Alvo é PARADA ABERTA COM PORTA. Sem pino não há o que vigiar (a régua é a
       mesma `pinoValido` do resto do app: zero não é pino, meia coordenada não
       é pino) — mandar um alvo sem coordenada faria o Kotlin descartar calado,
       e o motorista acharia que o cliente sem pino também apita. */
    const alvos = [];
    (itens || []).forEach((it) => {
      const st = String((it && it.status) || '');
      if (st === 'entregue' || st === 'cancelada') return;
      const c = (it && it.cliente) || {};
      if (!it || !it.id || !pinoValido(c.lat, c.lng)) return;
      alvos.push({
        id: String(it.id),
        nome: String(c.nome || 'Cliente'),
        lat: Number(c.lat),
        lng: Number(c.lng),
      });
    });
    // Rota rodando sem nenhuma porta aberta = dia cumprido: desarma igual.
    if (!alvos.length) return desarmar();

    const raioM = raioDaChegada();
    const routeId = (r && r.routeId) ? String(r.routeId) : null;
    /* O modo é do SERVIDOR, nunca inferido aqui — é ele que decide se a rota é
       rastreada. E TRACKED sem `routeId` o próprio Kotlin rebaixa pra
       ESSENTIAL: telemetria nunca liga por engano. */
    const mode = (r && r.trackingRequired) ? 'TRACKED' : 'ESSENTIAL';
    const trackingSessionId = (r && r.trackingSessionId) ? String(r.trackingSessionId) : null;
    const assinatura = `${raioM}|${mode}|${routeId || ''}|${trackingSessionId || ''}|`
      + alvos.map((a) => `${a.id}:${a.lat.toFixed(5)},${a.lng.toFixed(5)}`).join(';');
    if (assinatura === geofenceAssinatura) return;
    geofenceAssinatura = assinatura;
    try {
      window.HBX.activateRoute({ raioM, paradas: alvos, routeId, mode, trackingSessionId });
    } catch (_) {
      // Ponte fora do ar não pode derrubar a rota da tela — e a assinatura
      // volta pra vazio pra próxima carga tentar de novo.
      geofenceAssinatura = '';
    }
  }

  async function carregarRota() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const dia = diaOperacional();
    let r;
    const continuidadePedido = window.API.get('/logistica/rota/continuidade').catch(() => null);
    // 🔴 A DATA VIAJA SEMPRE. Sem ela o servidor usa o dia DELE — e ele roda em
    // UTC (medido: nem o container local nem o da VPS têm TZ). Das 21h à
    // meia-noite de Brasília o UTC já é amanhã, então a rota do motorista
    // aparecia VAZIA justo no fim do turno. Achado no g15 às 23:28 (defeito meu
    // da L1: o app velho sempre mandou `?date=`).
    const rotaNormal = () => window.API.get(`/logistica/rota?date=${encodeURIComponent(dia)}`);
    try {
      r = continuidadeAtiva
        ? await window.API.get(`/logistica/rota/continuidade/abrir?ref=${encodeURIComponent(continuidadeAtiva)}`)
        : await rotaNormal();
    } catch (erroRota) {
      // A pendência pode ter sido concluída noutro aparelho entre dois polls.
      // Só 404/409 prova que o ref morreu. Falha de rede preserva a fotografia
      // já aberta/cartão — nunca troca silenciosamente para outra rota.
      const statusErro = Number(erroRota && (erroRota.status || erroRota.statusCode
        || (erroRota.body && erroRota.body.statusCode))) || 0;
      if (continuidadeAtiva && (statusErro === 404 || statusErro === 409)) {
        continuidadeAtiva = '';
        try { r = await rotaNormal(); } catch (_) { r = null; }
      }
      if (continuidadeAtiva && !r) {
        pendenciasSemConexao = true;
        if (typeof window.usarDados === 'function') {
          window.usarDados('rota', { pendencias: pendenciasDaRota, pendenciasSemConexao });
        }
        return;
      }
      if (!r) {
      // A rota tem estado próprio e o desenho já previa os dois: o esqueleto
      // (`carregando`) e o aviso com "Tentar de novo" (`vazia`). Só na PRIMEIRA
      // carga — com a rota do dia já na tela, rede ruim não apaga o dia.
      try { if (estadoRota === 'carregando') { estadoRota = 'vazia'; pintar(false); } } catch (_) { /* sem seam */ }
      return;
      }
    }
    // Só depois que o servidor RESPONDEU: rede caída não pode carimbar o dia,
    // senão o vigia da virada acharia que já cuidou de um dia que nunca chegou.
    diaNaTela = String(r.date || dia);
    const continuidadeResp = await continuidadePedido;
    if (continuidadeResp) vestirPendencias(continuidadeResp);

    // Crédito e caixa do dia vêm de OUTRAS portas — pedidos em paralelo, e
    // cada um que falhar deixa o SEU campo vazio, sem derrubar a tela.
    const [creditoR, caixaR, custoR] = await Promise.allSettled([
      window.API.get('/credits/me'),
      // ⚠️ é `date`, não `data` (conferido no controller): o nome errado não dá
      // erro nenhum — o servidor ignora e responde o dia DELE, em UTC.
      window.API.get(`/logistica/fechamento/resumo?date=${encodeURIComponent(dia)}`),
      // 🔴 "Iniciar debita N" no cabeçalho vinha do MOCK e de mais lugar nenhum
      // — o app prometia 12 créditos porque era o número do desenho. É a MESMA
      // porta que o portão do Iniciar usa pra cobrar, então o cabeçalho passa a
      // dizer o que o servidor vai debitar de verdade. Falhou: campo vazio, e
      // pela Lei do IF a linha do custo some — número de crédito inventado é
      // dinheiro errado na tela principal.
      // 🔴 A DATA VIAJA AQUI TAMBÉM (medido em produção, 07/08 23h): sem `date`
      // o servidor usa o dia DELE, e ele roda em UTC — das 21h à meia-noite de
      // Brasília o UTC já é amanhã. As 96 entregas do dia (scheduledAt
      // 2026-08-07T03:00Z) ficavam FORA da janela e a porta respondia "Nenhuma
      // entrega aberta neste dia. Monte a rota antes de iniciar" — foi ESTE o
      // erro que o dono levou na cara depois de montar a rota. Mesmo remendo
      // que o `/logistica/rota` já tinha; faltava nas duas do custo.
      window.API.get(`/logistica/rota/custo-preview?date=${encodeURIComponent(dia)}`),
    ]);
    const custo = custoR.status === 'fulfilled' ? custoR.value : null;
    const credito = creditoR.status === 'fulfilled' ? creditoR.value : null;
    const caixa = caixaR.status === 'fulfilled' ? caixaR.value : null;
    const formas = (caixa && caixa.fechamento && caixa.fechamento.formas) || null;
    /* 🔴 CANCELADA SEM ORDEM NUNCA ESTEVE NESTA ROTA (09/08, MEDIDO em produção).
       A lei de cima continua de pé — cancelada É o "não entregue" do motorista e
       tem que ficar no mapa com a cor dela —, mas ela vale pra quem foi MONTADO
       aqui. `GET /logistica/rota` devolve tudo que cai no DIA, sem filtro de
       status, e limpeza administrativa carimba o dia de hoje em massa: na
       company 41 eram 137 canceladas das 09h24, todas com `rotaOrdem` NULO.
       Bastava montar qualquer rota pra elas entrarem — a tela dizia "140
       paradas" com 3 paradas de verdade, e o motorista rolava 137 cartões
       mortos antes de achar a primeira porta.
       A régua é a MESMA que o `estadoDaRota` já usa duas telas acima: quem prova
       que a parada é desta rota é a ORDEM gravada. Cancelada COM ordem fica
       (é o desfecho do dia); cancelada SEM ordem nunca foi parada, é resíduo. */
    const itens = (Array.isArray(r.items) ? r.items : []).filter((it) => {
      if (!it || String(it.status || '') !== 'cancelada') return true;
      return it.rotaOrdem !== null && it.rotaOrdem !== undefined;
    });
    rotaRefAtual = refDaResposta(r, itens);
    const paradas = itens.map((it, i) => traduzirParada(it, i, i > 0));
    // L4 — a folha de chegada precisa da entrega INTEIRA (itens, débito,
    // método padrão), não da linha resumida da lista. Guardada por id, que é o
    // que o cartão carrega no `data-parada`.
    ENTREGAS.clear();
    itens.forEach((it, i) => { if (it && it.id) ENTREGAS.set(String(it.id), { item: it, n: i + 1 }); });
    // As paradas do "Salvar rota", na ORDEM que o planejador deu (o servidor já
    // devolve por `rotaOrdem`): salvar o roteiro é salvar essa sequência.
    PARADAS_SALVAR.length = 0;
    itens.forEach((it) => {
      const id = it && it.cliente && it.cliente.id;
      if (id) PARADAS_SALVAR.push({ customerProfileId: String(id) });
    });
    // O nível do financeiro vem no MESMO payload da rota (não é chute nem
    // pedido extra): é ele que decide qual das duas folhas abre na porta.
    if (typeof r.moduloFinanceiroAtivo === 'boolean') financeiroAtivo = r.moduloFinanceiroAtivo;
    /* O ANEL DO "TÔ CHEGANDO" vem armado do servidor, no mesmo payload: ele já
       manda `avisoChegandoAtivo` (a trava tripla dele resolvida) e o raio. O
       contrato do backend é explícito sobre de quem é a vez — "o app só arma o
       anel de ~500m quando isto é true (evita POST inútil com o recurso OFF)". */
    avisoChegandoAtivo = !!r.avisoChegandoAtivo;
    if (typeof r.avisoChegandoDistanciaM === 'number' && r.avisoChegandoDistanciaM > 0) {
      avisoChegandoRaioM = r.avisoChegandoDistanciaM;
    }
    const entregues = itens.filter((it) => String(it.status || '') === 'entregue').length;
    const marcado = itens.reduce((s, it) => s + (typeof it.valorHoje === 'number' ? it.valorHoje : 0), 0);
    const temValor = itens.some((it) => typeof it.valorHoje === 'number');

    if (typeof window.PARADAS !== 'undefined') window.PARADAS = paradas;
    else try { PARADAS = paradas; } catch (_) { /* seam ausente: nada a fazer */ }
    try { estadoRota = continuidadeAtiva ? 'consulta' : estadoDaRota(r); } catch (_) { /* idem */ }
    /* O geofence anda JUNTO com a rota que acabou de chegar — depois do
       `estadoRota` (é ele quem diz se está na rua) e antes de pintar, porque
       armar o serviço não depende de tela nenhuma. Best-effort de verdade:
       tudo lá dentro é try/catch, e falha aqui nunca segura a rota do dia. */
    sincronizarGeofence(
      continuidadeAtiva ? { ...r, routeStatus: 'ENCERRADA', trackingRequired: false } : r,
      itens,
    );

    window.usarDados('rota', {
      /* 🔴 A LISTA PRECISA CABER NO FREIO. `usarDados` só repinta quando um
         CAMPO muda — e a lista de paradas viaja por FORA dele (`PARADAS` é
         variável do mock, não campo de `DADOS`). Quando só a SEQUÊNCIA muda,
         todos os KPIs ficam idênticos e o repinte era engolido: a tela
         continuava na ordem que o dedo arrastou mesmo quando o servidor
         recusou a gravação — o erro aparecia num aviso e a mentira ficava na
         tela. Vale igual pro desfecho de uma parada (pendente → não entregue),
         que também não mexe em KPI nenhum.
         Esta digital não é desenhada em lugar nenhum: ela existe só pra o
         freio enxergar que a lista é OUTRA. */
      digitalDaLista: `${gestoSujouATela}|${itens.map((it) => `${it.id}:${it.status || ''}:${it.mapStatus || ''}:${it.arrivedAt || ''}`).join('|')}`,
      pendencias: pendenciasDaRota,
      pendenciasSemConexao,
      /* O subtítulo do nome da tela. Escrito a cada carga da rota (e não uma vez
         no boot) porque o app do motorista ATRAVESSA a meia-noite ligado — quem
         vira o dia é a `viradaDoDia`, e ela recarrega por aqui. */
      dataLonga: dataPorExtenso(dia),
      /* 🔴 ESTE CAMPO É O TOTAL DO DIA, E NÃO SE ESVAZIA (09/08). A barra do
         mapa dizia "52 paradas · 0 entregues" no estado `montar` — a AGENDA
         vestida de rota — e a 1ª cura foi mandar o campo VAZIO daqui. Errado, e
         medido: `kpiParadas` é lido por mais quatro telas (lista, foto,
         fechamento, semana), onde ele é o total do dia e É pra aparecer; esvaziar
         na fonte deixava o rótulo "paradas" sem número em todas elas.
         A régua de "sem rota montada não se conta parada" ficou onde ela nasce:
         na barra do `T.rota`, que já tem o estado da rota na mão. Régua de uma
         superfície não se aplica na fonte que serve cinco. */
      kpiParadas: String(itens.length),
      kpiEntregues: String(entregues),
      kpiEntreguesParado: String(entregues),
      // saldo/dinheiro/pix = o CAIXA do dia (fechamento do dia), em
      // centavos na origem. Financeiro OFF ⇒ campo vazio (é resposta, não
      // falha). ⚠️ Já a fonte FORA DO AR mantém o que estava: apagar o caixa
      // por causa de rede ruim é pior que mostrar o número de um minuto atrás.
      ...(caixaR.status === 'fulfilled' ? {
        saldo: caixa && caixa.fechamento ? centavosSeTiver(caixa.fechamento.totalCents) : '',
        dinheiro: formas ? centavosSeTiver(formas.dinheiroCents) : '',
        pix: formas ? centavosSeTiver(formas.pixCents) : '',
      } : {}),
      // crédito é NÚMERO INTEIRO, nunca moeda (lei da casa) — e também não
      // apaga por falha de rede.
      ...(creditoR.status === 'fulfilled' ? {
        creditos: credito && typeof credito.balance === 'number' ? String(credito.balance) : '',
      } : {}),
      creditosDebita: custo && typeof custo.creditosAIniciar === 'number' ? String(custo.creditosAIniciar) : '',
      diaFeitas: String(entregues),
      diaTotal: String(itens.length),
      diaPct: itens.length ? `${Math.round((entregues / itens.length) * 100)}%` : '0%',
      diaMarcado: temValor ? dinheiro(marcado) : '',
      filtroFila: String(itens.length - entregues),
      filtroEntregue: String(entregues),
      somaProdutos: String(itens.reduce((s, it) => s + (Number(it.quantidade) || 0), 0)),
      somaMarcado: temValor ? dinheiro(marcado) : '',
    });

    // As empresas do corredor viajam no MESMO payload da rota (o servidor as
    // relê de `ProspectoRota`): é isto que faz elas sobreviverem a fechar o app.
    aplicarProspector(r);

    // L5 — o fechamento e a semana bebem do MESMO resumo que já veio acima.
    // Só quando ele REALMENTE respondeu: resumo que falhou não pode zerar o
    // caixa do dia (mesma lei do fio de recados, ver L8).
    if (caixaR.status === 'fulfilled') encherFechamento(caixa, itens, entregues);

    // 🔴 A MONTAGEM SE ENCHE AQUI, não só no toque de "Montar rota". Quem chega
    // nela por outro caminho via a lista do MOCK — João da Silva, R$ 336,00 —
    // com o dado real na tela de trás. Dado de enfeite numa tela de dinheiro é
    // o defeito que esta frente inteira existe pra matar (visto no g15).
    /* 🔴 A MONTAGEM TEM UM DONO SÓ, E NÃO É AQUI (dono, 08/08: "o prévia vai
       ser a montagem única").
       Este `else` era a tela "de depois": com a rota montada ele reescrevia a
       MESMA lista com outra fonte — sem o seletor de modos, sem o arrasto,
       trocando só a hora do lado do nome. Era o "próximo que não serve pra
       nada visualmente", e ele custava caro: o motorista arrastava, mandava
       montar, e o repinte devolvia a lista do servidor por cima do gesto dele.
       Agora a lista da Montagem sai SEMPRE do `publicarPrevia`. O que a rota
       montada faz é dar a ORDEM e a HORA de cada parada (ver
       `ordemDaRotaMontada`) — mandar no conteúdo, não na pintura. */
    if (previaCrua) publicarPrevia();
    // Quem chama precisa saber se a rota REALMENTE entrou: o `montarRota`
    // navegava pra montagem mesmo com a chamada no chão, e a tela abria com as
    // paradas de exemplo. Sem este retorno não dá pra distinguir.
    return true;
  }

  // 1ª carga assim que a casca subiu, e recarga toda vez que a Rota reaparece.
  // O sino é do CABEÇALHO, que aparece em toda tela: o fio dos recados carrega
  // no boot junto com a rota, senão o contador só ficaria certo depois de o
  // motorista abrir o chat — que é exatamente quem ele deveria chamar.
  window.HBXRota = { carregar: carregarRota };

  /* 🔴 A CENA DE SAÍDA É DO APP, NÃO DE UMA TELA NATIVA (ordem do dono, 09/08:
     *"remova o efeito de sair, é o antigo, e faça o inverso do q foi feito no
     1"*). O Kotlin pedia uma página só pra fechar (`opening.html?mode=exit`) e
     ali morava OUTRA marca, com OUTRO desenho — a saída não era o inverso da
     entrada, era outra cena. Agora quem toca é o próprio app, com a mesma marca
     e as mesmas animações ao contrário (§ `T.saida` no mock).
     O Kotlin chama isto e fecha no relógio dele: se esta função não existir (app
     velho dentro de casca nova), ele fecha do mesmo jeito — a saída nunca pode
     depender de a cena dar certo. */
  window.HBXSaida = function () {
    try {
      if (typeof window.ir !== 'function') return 0;
      /* 🔴 O REVERSO COMEÇA PELO MAPA (ordem do dono, 09/08). A entrada TERMINA
         no mapa desenhado; então a saída começa desfazendo ele — as ruas
         recolhem, os nomes se apagam letra a letra — e só depois o HBX desce do
         cabeçalho. Sem mapa na tela (o motorista fechou o app no Chat ou nos
         Ajustes) a conta dá zero e a marca desce na hora: a saída nunca espera
         por uma cena que não tem palco. */
      const mapaEm = cenaAoContrario();
      // os 200 ms de sobreposição são de propósito: a marca começa a descer
      // enquanto as últimas ruas ainda recolhem, senão a saída tem um vão morto.
      if (mapaEm) setTimeout(() => { try { window.ir('saida'); } catch (_) { /* fechando */ } }, Math.max(0, mapaEm - 200));
      else window.ir('saida');
      return 1;
    } catch (_) { return 0; }
  };

  /* ------------------------------------------------------------------------
     🔴 NO APARELHO, A DEMONSTRAÇÃO NÃO EXISTE.

     O mock é o front, e o front traz o dado de exemplo do desenho. Até o
     servidor responder, o motorista via João da Silva, Mercadinho Bom Preço e
     um saldo que não é dele — 60 ms na bancada, mas segundos numa rede ruim.
     Nome de cliente que não existe é mentira com cara de app pronto.

     Então, no boot: apaga o exemplo e liga o ESQUELETO das telas que buscam.
     UMA pintura só no fim (`usarDados` repinta a cada chamada; sete chamadas
     seriam sete repintes no quadro mais caro do app, o da abertura).

     A trava do 1º quadro é aqui e não em cada carregador de propósito: quando
     `ir('clientes')` pinta, `carregarClientes` ainda nem começou — ligar o
     esqueleto lá deixaria um quadro de exemplo passar.
     ------------------------------------------------------------------------ */
  function apagarDemonstracao() {
    if (!temPonte()) return;
    try { estadoRota = 'carregando'; } catch (_) { /* seam ausente */ }
    try {
      if (typeof window.PARADAS !== 'undefined') window.PARADAS = [];
      else PARADAS = [];
    } catch (_) { /* idem */ }
    const zerar = {
      /* A rota tem estado próprio (`estadoRota`), acima; aqui vai o CABEÇALHO
         dela — e vai INTEIRO, não os campos que eu lembrei.
         🔴 Medido no g15 com o túnel derrubado: eu tinha zerado só `saldo`, e a
         tela mostrou "Dinheiro R$ 132,00 · Pix R$ 52,00" — os números do mock,
         com cara de caixa do dia. É que a ponte só escreve esses dois quando o
         `fechamento/resumo` responde (`...(caixaR.status === 'fulfilled' ...)`),
         e o que ela não escreve FICA. Campo de dinheiro que sobrou do exemplo é
         a pior mentira desta tela.
         A régua: o que é DADO zera; o que é COPY (`vazioTitulo`, `vazioSub`)
         fica, porque é texto do desenho e não vem do servidor. */
      rota: {
        kpiParadas: '', kpiEntregues: '', kpiEntreguesParado: '',
        saldo: '', dinheiro: '', pix: '',
        diaFeitas: '', diaTotal: '', diaPct: '', diaMarcado: '',
        filtroFila: '', filtroEntregue: '',
        creditos: '', creditosDebita: '',
        somaProdutos: '', somaMarcado: '',
      },
      /* A MONTAGEM É TELA DE DECISÃO E DE DINHEIRO: ela mostrava João da Silva
         e "R$ 336,00" (o desenho) pra quem entrasse antes do servidor
         responder. Nasce vazia, com esqueleto. `pronta:1` porque o pé desta
         tela é UM só — "Iniciar rota" (o 2º "Montar rota" morreu em 08/08); e
         com a lista vazia o pé nem é desenhado.

         🔴 ESTA CHAVE ESTAVA ESCRITA DUAS VEZES NESTE MESMO OBJETO (09/08). A
         segunda — lá embaixo, entre o `financeiro` e o `fechamento`, acrescentada
         depois pro caso do `/logistica/rota` no chão — repetia cinco campos e
         SOBRESCREVIA este bloco inteiro: em objeto literal quem vence é a
         última. Os cinco repetidos tinham valor idêntico (por isso as 6 paradas
         de exemplo e o "R$ 336,00" morriam mesmo assim), mas `carregando`,
         `vazio`, `pronta`, `dias` e `diaSel` NUNCA chegavam ao seam. O que se
         via: a Montagem nascia SEM ESQUELETO, com o vazio do desenho na cara —
         "Nenhum cliente nesse dia" por um quadro em toda abertura da tela (o
         `ir('montagem')` pinta ANTES de o `encherMontagem` ligar o `carregando`).
         É a Lei nº1 desta frente invertida: dizia "não tem ninguém" quando o
         certo era "estou buscando". Chave repetida é bug MUDO — nem o `node
         --check` nem os portões reclamam. UMA chave só, e o caso da rota no chão
         está coberto aqui dentro, não numa segunda cópia. */
      montagem: {
        carregando: true, linhas: [], pronta: 1, iniciarSub: '',
        // COPY que o ESTADO decide não é copy do desenho: no boot o dia é HOJE,
        // e o "nesse dia" do mock não se refere a dia nenhum sem chip aceso.
        vazio: textoVazio(0),
        somaParadas: '', somaProdutos: '', somaValor: '', dias: [], diaSel: 0,
        // o HISTÓRICO demo do mock morre aqui como todo dado de exemplo —
        // "Sáb · 95 paradas" inventado numa tela de decisão é a mentira de
        // sempre com roupa nova (09/08).
        historico: [],
      },
      clientes: { carregando: true, lista: [], total: '', semEndereco: '', marcadoHoje: '', subtitulo: '' },
      produtos: { carregando: true, lista: [], categorias: [], ativos: '', estoqueBaixo: '', valorEstimado: '' },
      salvas: { carregando: true, lista: [], total: '' },
      // `sino` zera JUNTO: o "2" do desenho ficava no cabeçalho de TODA tela
      // até os recados responderem — badge de exemplo com cara de recado real.
      chat: { carregando: true, conversa: [], recado: '', sino: '' },
      /* 🔴 CRÉDITOS — a tela única (09/08), e DOIS pares de bandeira porque são
         DUAS portas de rede: `carregando`/`semFonte` cobrem `/credits/me`
         (saldo + pacotes, a espinha da tela) e `movCarregando`/`movSemFonte`
         cobrem `/logistica/creditos/extrato` (o movimento). Com um par só, o
         extrato no chão apagaria a recarga — que é o que a pessoa veio fazer
         aqui. Tudo nasce VAZIO: catálogo de demonstração numa tela de dinheiro
         é preço inventado com botão de cobrar em cima. */
      creditos: {
        carregando: true, saldo: '', vence: '', pacotes: [], cta: '',
        movCarregando: true, mes: '', gastosHoje: '', gastosMes: '', bonus: '', linhas: [],
      },
      // Ajustes é o pior lugar pra exemplo: o motorista lê a CHAVE no estado do
      // desenho, toca, e acha que mudou o que nem tinha carregado. Também é a
      // tela que mostrava "Baixando o mapa · 62%" — recurso CORTADO em 06/08.
      ajustes: {
        carregando: true, creditosLinha: '',
        painelCreditos: '', grupoOffline: 0, empresa: '',
        /* A VERSÃO NÃO ZERA: ela não vem do servidor, vem do APK (ponte nativa,
           leitura síncrona). Nasce preenchida pra não piscar vazia entre o boot
           e a resposta do `/logistica/config`. (O miolo dos Ajustes ainda é
           esqueleto enquanto `carregando` — a linha só APARECE quando a tela
           inteira aparece; o que se ganha aqui é que ela já chega certa.) */
        ...linhaDaVersao(),
        // Papel é DADO, e sem resposta do servidor não se sabe qual é. O desenho
        // nasce admin (é a tela cheia); o aparelho nasce SEM, e só o `config`
        // liga. Errar pro lado de mostrar administração é vazar dinheiro.
        admin: 0,
      },
      // As chaves de dinheiro. Todas nascem 0 e a tela nem desenha: chave no
      // estado do desenho é o motorista achando que desligou o que nem carregou.
      avancado: {
        carregando: true, admin: 0, financeiro: 0, cobrancaSimples: 0,
        precoPorCliente: 0, naHora: 0, mensal: 0, fiado: 0,
        avisarChegada: 0, avisarChegadaDist: '',
        // A chave do prospector nasce DESLIGADA e INDISPONÍVEL: até o servidor
        // dizer, a linha nem é desenhada. Oferecer no boot um recurso que a
        // empresa pode não ter é a mesma mentira das outras chaves.
        prospector: 0, prospectorDisponivel: 0,
      },
      /* O TUTORIAL NASCE SEM SABER DE NADA. `carregando:1` é o que segura o
         motor do tour: capítulo escondido antes de a config chegar seria
         esconder por IGNORÂNCIA, e "não sei" nunca apaga nada (a mesma lei do
         módulo que não some por rede ruim). E `obrigatorioVisto` nasce 1 —
         "não sei" responde JÁ VIU, senão o 0 do DESENHO viraria fato e o
         obrigatório (que não tem X) dispararia por ignorância. Só um "nunca
         visto" dito pelo servidor o zera. */
      tutorial: { carregando: 1, obrigatorioVisto: 1 },
      /* A ABERTURA NÃO ENTRA AQUI — e o motivo é o que torna ela especial. Ela
         dizia "Água Rio Claro" (nome do desenho) na PRIMEIRA tela que o
         motorista vê, com o aparelho logado na Atlas. Zerar um slot não
         resolveria: o `pintar(false)` do fim do mock.js já pintou a abertura
         quando esta função roda, e ela não repinta a abertura de propósito
         (`telaAtual() !== 'entrada'`, logo abaixo) porque é uma cena com
         relógio. O nome da empresa também não tem porta no aparelho —
         `hbx:logistica-company-name` não existe no localStorage do app novo
         (medido no g15) e quem gravava essa chave era o `app.js`, que o
         `index.html` não carrega mais. Sem porta e sem repinte, a linha
         saiu do DESENHO (o porquê inteiro está em cima do `.splash-barra`, na
         folha do mock). */
      // (A `recarga:` morava AQUI e foi fundida na `creditos:` lá de cima, que é
      // a tela única desde 09/08. O motivo de zerar continua o mesmo: o catálogo
      // era do desenho — R$ 49/129/239/449, "+8% grátis" — e o botão anunciava
      // "Recarregar 300 créditos · R$ 129,00" sem pacote escolhido de verdade.)
      /* 🔴 AJUSTES · FINANCEIRO — a última tela que ainda não tinha SEAM NENHUM.
         As outras eu já zerava aqui; esta não tinha o que zerar, porque os
         números moravam CRAVADOS no template do mock. Então ela passava por
         este apagador calada e chegava inteira no aparelho: medido por toque no
         g15 com a bancada (company 39, UMA entrega de R$ 20,00) ela dizia
         "Recebido hoje R$ 336,00", "Em aberto R$ 257,00", a quebra por forma
         completa, TRÊS devedores com nome e sobrenome (Maria Aparecida R$
         74,00, Bar do Zé R$ 96,00, Mercado Estrela R$ 87,00) e a semana em
         R$ 2.648,00. Cobrança de gente que não existe, dentro da Administração
         — o dono lê isso e liga pro cliente.
         Nasce VAZIO como as irmãs, e `carregando` liga o esqueleto: quem enche
         é o `carregarFinanceiro`, no `ir('financeiro')`. */
      financeiro: {
        carregando: true, recebido: '', emAberto: '', formas: [], marcou: '', devedores: [],
        semanaRecebido: '', semanaMarcado: '', semanaPendencia: '',
      },
      // (A 2ª `montagem:` morava AQUI — o caso do `/logistica/rota` no chão, em
      // que `carregarRota` volta no catch antes de escrever e o `montarRota`
      // navegava mesmo assim. Fundida na chave lá de cima, que já zerava os
      // mesmos cinco campos com os mesmos valores; o porquê está escrito lá.)
      /* 🔴 O CAIXA DO DIA — 11 campos de dinheiro presos a UMA chamada.
         `encherFechamento` só roda se o `fechamento/resumo` responder; as duas
         seções são 100% DADO e nenhuma nascia limpa. Com a chamada no chão a
         Fechamento (alcançável a qualquer momento pelo caixa da Rota)
         mostrava o fechamento do desenho: Dinheiro R$ 132,00 · Pix R$ 52,00 ·
         Cartão R$ 84,00 · Marcado R$ 68,00, total R$ 336,00 — e o selo
         "Tudo certo!", um veredito que o app não tem como emitir. A Semana
         mostrava 6 dias inventados e R$ 2.648,00. */
      fechamento: { entregues: '', selo: '', formas: [], formaTotal: '', clientes: '', produtos: '' },
      semana: { dias: [], marcado: '', recebido: '', pendencia: '' },
      /* O recibo do fim do dia (12/08). Zera DADO e só dado: `quando` e `sobra`
         são o retrato do momento em que ESTE aparelho fechou o dia — nascer com
         "Fechado às 19:12" do desenho seria carimbar hora num dia que ninguém
         terminou. `titulo` NÃO entra: é COPY, texto fixo da tela. */
      terminou: { quando: '', sobra: '' },
      /* 🔴 AS EMPRESAS DO CORREDOR SÃO A MENTIRA MAIS CARA DESTA TELA. O
         desenho traz "Mercado São Judas", "Padaria Avenida" e "Restaurante
         Sabor" com nome, ramo e posição — e o destino delas, no produto, é
         virar LEAD e MENSAGEM DE WHATSAPP. Empresa de exemplo aqui não é um
         número errado num canto: é o motorista tocando num prédio que não
         existe. Zera INTEIRO; só o `chip` fica, que é COPY do desenho e some
         sozinho junto com a lista.
         🔴 ESTE COMENTÁRIO JÁ MENTIU UMA VEZ. Ele dizia "o prospector ainda não
         tem servidor (F0)" — e o servidor nasceu SETE HORAS depois, no mesmo dia
         07/08. O comentário ficou, a ponte nunca foi ligada, e o app passou um
         dia inteiro com 8 empresas embarcadas no banco e ZERO prédios na tela.
         Hoje quem enche a lista é o `aplicarProspector`, nas DUAS portas
         (iniciar e releitura da rota). O que sobra aqui é só o apagador: até o
         servidor responder, a tela de navegação abre SEM empresa nenhuma, sem
         chip, sem varredura e sem radar — que continua sendo o certo. */
      mapa: { empresas: [] },
      /* 🔴 O CROMO DO GPS — a última mentira da varredura, e a pior de todas
         pelo LUGAR: é a tela em que o motorista está DIRIGINDO. Enquanto rota,
         clientes, ajustes, recarga, fechamento e semana já nasciam limpas, esta
         seguia dizendo "Parada 3 de 8 · Mercado São Judas" (cliente que não
         existe), "240 m · Vire à direita" (curva que ninguém escolheu, com a
         seta apontando) e "12:26 chegada · 45 min restante · 8,2 km". Todos
         literais do desenho, cravados no template — nenhum saía de porta
         nenhuma. Na de chegada era ainda mais direto: "Você chegou · Mercado
         São Judas · R. São Judas, 142 · GPS ±6 m, você está na porta".

         A fiação (§4.1 do PR07082026-FECHAR-LOGISTICA2) ainda não existe;
         então, como nas empresas do corredor, o campo fica VAZIO e o pedaço
         some da tela — a tela de navegação abre com o mapa de verdade (L3a),
         a seta do motorista e o Encerrar, e nada mais. Honesto.

         Zera o que é DADO. NÃO zera o que é COPY: `velocidadeUnidade`,
         `chegadaRotulo`, `restanteRotulo`, `distanciaRotulo`, `chegouTitulo`,
         `chegouAcao` e — o que mais importa — `encerrar`, que é a PORTA DE
         SAÍDA desta tela. Motorista preso na navegação é defeito pior que
         qualquer número faltando. */
      gps: {
        manobraIcone: '', manobraDist: '', manobraVerbo: '',
        manobraRua: '', manobraDepois: '',
        rumo: '', velocidade: '',
        paradaN: '', paradaTotal: '', paradaNome: '',
        chegada: '', restante: '', distancia: '',
        // 🔴 `chegouId` É DADO, e dado ZERA. Ele é o id da entrega que o botão
        // verde abre: sobrevivendo ao boot, o "Você chegou" abriria a folha de
        // uma parada de ONTEM — a mesma família de mentira que este bloco
        // existe pra matar, só que com o toque do dedo por cima.
        chegouId: '',
        chegouEndereco: '', chegouPrecisao: '', chegouFaltam: '', chegouKm: '',
      },
    };
    try {
      Object.keys(zerar).forEach((s) => { DADOS[s] = Object.assign({}, DADOS[s], zerar[s]); });
      // Na ABERTURA não se repinta: ela é uma cena com relógio (o logo viaja
      // pro cabeçalho) e a camada seria recriada do zero. Nenhuma destas telas
      // está à vista agora — quem pinta com o valor novo é o `ir('rota')` que
      // encerra a abertura.
      if (telaAtual() !== 'entrada') pintar(false);
    } catch (_) { /* sem seam: a casca não subiu, e aí não há o que apagar */ }
  }

  /** Fonte fora do ar: some o esqueleto, entra o aviso — nunca lista vazia,
   *  que mentiria dizendo que a base do motorista está vazia.
   *  🔴 SÓ NA PRIMEIRA CARGA (`carregando` ainda ligado). Com dado do servidor
   *  já na tela, rede ruim NÃO apaga nada — é a Lei nº1 desta frente. */
  const fonteCaiu = (secao) => {
    if (typeof window.usarDados !== 'function') return;
    let primeira = false;
    try { primeira = !!(DADOS[secao] && DADOS[secao].carregando); } catch (_) { return; }
    if (!primeira) return;
    window.usarDados(secao, { carregando: false, semFonte: true });
  };
  /** Respondeu: sai o esqueleto E o aviso, no MESMO repinte do dado. */
  const fonteVoltou = { carregando: false, semFonte: false };
  /** "Tentar de novo": devolve o esqueleto e pede de novo. */
  const retentar = (secao, carregador) => {
    if (typeof window.usarDados === 'function') window.usarDados(secao, { carregando: true, semFonte: false });
    carregador();
  };

  /* ------------------------------------------------------------------------
     ITEM 9 DO DONO (07/08) — A BARRA DO MOTORISTA OBEDECE O ADMIN.

     *"deixar os módulos do motorista na mão do ADMIN (não dentro do app, no
     desktop)... Se o admin montar, deixar mastigado e liberar o rota para o
     motorista, ele tem q receber a rota, iniciar e go!"*

     O desktop grava um CSV em `appModulosDesativados` e o `GET
     /logistica/config` o entrega a TODO ator — inclusive ao motorista. Aqui a
     ponte só TRADUZ pro seam; quem some com o botão, com o atalho e com o
     arrastar é a casca (`nav`/`ir`/`podarDesligados`/`arrastarModulo`).

     🔴 REDE CAÍDA NÃO ESCONDE MÓDULO. O `catch` volta SEM escrever: o campo
     fica como estava (vazio no boot = os 6 na tela). É o contrário do resto
     desta ponte, onde fonte fora do ar vira aviso — porque aqui o silêncio
     não pode TIRAR nada do motorista.
     ------------------------------------------------------------------------ */
  function aplicarBarra(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (typeof window.usarDados !== 'function') return;
    // Backend antigo (campo ausente) e "nada desligado" (null) caem no mesmo
    // lugar de propósito: string vazia, barra inteira. Traduzir ≠ decidir.
    const csv = typeof cfg.appModulosDesativados === 'string' ? cfg.appModulosDesativados : '';
    window.usarDados('barra', { desligados: csv });
    // Se o motorista estava JUSTAMENTE no módulo que acabou de ser desligado,
    // a barra fica sem botão aceso e ele fica preso. A casca o devolve à Rota.
    try {
      if (typeof window.resgatarModuloDesligado === 'function') window.resgatarModuloDesligado();
    } catch (_) { /* casca sem a função: barra velha, nada a resgatar */ }
    // A MESMA resposta diz quem é admin, o que a empresa tem e o que o admin
    // desligou — que é exatamente o que o tour precisa pra saber qual capítulo
    // existe. De carona: nenhuma chamada nova (ver a seção TUTORIAL).
    publicarTutorial();
  }

  let barraLidaEm = 0;
  async function carregarBarra() {
    if (!temPonte()) return;
    // Três gatilhos podem cair juntos (voltou pro foco + foco da janela +
    // relógio). Uma leitura por vez basta; o resto é chamada repetida à toa.
    const agora = Date.now();
    if (agora - barraLidaEm < 3000) return;
    barraLidaEm = agora;
    let cfg;
    try { cfg = await window.API.get('/logistica/config'); } catch (_) { return; }
    // A MESMA resposta diz quem é admin (ehAdmin lê o `config`) — sem isso os
    // chips de dia do montar só nasciam depois de passar pelos Ajustes.
    config = cfg;
    aplicarBarra(cfg);
    publicarMontarDias();
    // A medida dos dias que têm cliente vem UMA vez, aqui, e não na abertura da
    // montagem: chip que nasce com 7 e encolhe pra 4 meio segundo depois pisca
    // na cara de quem está escolhendo. Esta função já roda no boot (e a cada
    // minuto, mas só a 1ª pergunta) — quando a tela abrir, a conta já existe.
    if (!diasComCliente) carregarDiasComCliente();
  }

  /* O admin desliga o módulo com o app do motorista ABERTO — é o caso normal,
     não a exceção. Sem reler durante o turno a barra só obedeceria no próximo
     boot, e "desliguei no desktop e não sumiu no celular" é exatamente a queixa
     que este item veio resolver.

     🔴 MEDIDO NO g15 (07/08): `visibilitychange` NÃO dispara neste app. Sair
     pelos recentes e voltar mantém a Activity viva, a WebView nunca é pausada
     (`webView.onPause()` não é chamado) e o documento nunca fica `hidden` — a
     barra ficou 1 minuto mostrando a configuração velha na minha cara. Evento
     que eu não vi disparar não é garantia, é esperança.

     Então a GARANTIA é o relógio, no mesmo padrão que o app já usa pro modo
     noturno (`native.js`, 1 checagem por minuto): uma leitura da config por
     minuto — a linha mais barata do app, uma só. Os dois eventos ficam como
     ATALHO: onde dispararem, obedece na hora; onde não, o relógio pega. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') carregarBarra();
  });
  window.addEventListener('focus', carregarBarra);
  /* 🔴 TIQUE DE RELÓGIO NÃO PODE DERRUBAR O TOUR (09/08). Todo `usarDados`
     monta uma camada NOVA (é o `pintar` que faz isso), e o tutorial guiado vive
     DENTRO da camada, como a aula: um tique de fundo no meio de um passo
     arrancaria o furo da tela sem ninguém ter encostado no aparelho. O freio do
     `usarDados` engole o que não mudou, mas o obrigatório roda justamente no
     BOOT, quando ainda está tudo chegando.
     Espera só o que é RELÓGIO. O que é DEDO continua passando — é o clique do
     próprio passo `fazer` que abre a montagem de verdade. E o pulso dos recados
     NÃO espera, de propósito: recado é trava e alarme, e atrasar alarme por
     causa de tutorial seria trocar segurança por enfeite.
     Quem publica `window.TUTOR` é o motor da casca (ver a seção TUTORIAL). */
  const tourRodando = () => {
    try {
      return !!(window.TUTOR && typeof window.TUTOR.rodando === 'function' && window.TUTOR.rodando());
    } catch (_) { return false; }   // motor de casca velha: nada a respeitar
  };
  setInterval(() => { if (!tourRodando()) carregarBarra(); }, 60000);

  /* 🔴 A MEIA-NOITE DEIXAVA A TELA NUM DIA E OS BOTÕES NOUTRO — e foi ISTO que o
     dono levou na cara em 09/08 às 00:37: a tela dizia "52 paradas" com o
     Iniciar verde, e o servidor respondia *"Nenhuma entrega aberta neste dia.
     Monte a rota antes de iniciar."* Os DOIS estavam certos. A tela era de
     ONTEM — carregada antes da meia-noite e nunca mais relida; o `hojeISO()` de
     todo botão já era HOJE, e hoje ainda não tinha entrega nenhuma. O banco de
     produção fecha o caso: as 52 de 08/08 foram canceladas e as 52 de 09/08
     nasceram às 03:40:25 UTC — três minutos DEPOIS do erro.

     Nada recarregava sozinho: `carregarRota` roda no boot e nos toques, e mais
     nada. Só que app de entrega fica horas aberto num apoio — atravessar a
     meia-noite é o caso NORMAL dele, não a exceção.

     A garantia é o RELÓGIO, mesmo padrão da `carregarBarra` logo acima. Neste
     app `focus`/`visibilitychange` comprovadamente não disparam (custou uma
     leva inteira de "checagem só no boot frio"), então eles entram como
     ATALHO — quem garante é o tique. Custa uma comparação de string por minuto
     e só vai à rede quando a data VIROU de verdade. */
  const viradaDoDia = () => {
    // Uma rota antiga aberta para conferência continua na tela até o motorista
    // escolher Continuar ou Cancelar. A meia-noite nunca a apaga por trás.
    if (!continuidadeAtiva && diaNaTela && diaNaTela !== diaOperacional()) carregarRota();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') viradaDoDia();
  });
  window.addEventListener('focus', viradaDoDia);
  // Mesma espera do tique acima: a virada de um minuto atrasada não custa nada,
  // o tour arrancado da tela custa o passo inteiro.
  setInterval(() => { if (!tourRodando()) viradaDoDia(); }, 60000);

  async function atualizarContinuidades() {
    if (!temPonte()) return;
    let resp;
    try { resp = await window.API.get('/logistica/rota/continuidade'); } catch (_) {
      // Rede ruim preserva o último retrato, mas ele precisa dizer que é um
      // retrato — silêncio aqui fazia cartão velho parecer informação ao vivo.
      pendenciasSemConexao = true;
      if (typeof window.usarDados === 'function') {
        window.usarDados('rota', { pendencias: pendenciasDaRota, pendenciasSemConexao });
      }
      return;
    }
    vestirPendencias(resp);
    if (typeof window.usarDados === 'function') window.usarDados('rota', { pendencias: pendenciasDaRota, pendenciasSemConexao });
    // Se outra pessoa puxou esta rota, o aparelho antigo perde a posse no
    // próximo tique/foco e desarma o geofence. Offline de verdade não permite
    // revogação instantânea; ao reconectar esta é a primeira ação.
    if (!continuidadeAtiva && rotaRefAtual && paradasAbertasNaTela() > 0 && !refsDoAtor.includes(rotaRefAtual)) {
      try { if (window.HBX && typeof window.HBX.stopRoute === 'function') window.HBX.stopRoute(); } catch (_) {}
      await carregarRota();
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') atualizarContinuidades();
  });
  window.addEventListener('focus', atualizarContinuidades);
  setInterval(() => { if (!tourRodando()) atualizarContinuidades(); }, 60000);

  const cargaInicial = () => {
    apagarDemonstracao(); carregarBarra(); carregarRecados(); checkAppUpdate();
    /* 🔴 A ABERTURA ESPERA ESTA LINHA (§ 7a-ter). O `carregarRota` era chamado
       solto aqui; agora o FIM dele — dando certo ou dando errado — é uma das três
       peças que liberam a primeira tela. Falhar também é "carregou": app que não
       abre porque o servidor caiu é pior que app aberto sem a lista. */
    Promise.resolve(carregarRota())
      .catch(() => {})
      .then(() => bootChegou('dado'));
    // o mapa nasce fora da tela enquanto o HBX ainda está no ar
    setTimeout(prepararMapaCedo, ABERTURA_MAPA_EM);
    // e o teto: sem GPS, sem tile, sem rede, a abertura sai mesmo assim
    setTimeout(avisarAbertura, ABERTURA_TETO_PONTE);
    // O estado do tutorial é do USUÁRIO e vem em porta PRÓPRIA — pendurar no
    // `/logistica/config` custaria uma consulta por minuto por aparelho pra um
    // dado que só interessa no boot.
    carregarTutorial();
    // O que chegou com o app fechado alerta AGORA — o motorista abre o app e
    // descobre o recado das 6h, em vez de esperar o próximo tique.
    pulsoRecados();
    // O app pode ter sido aberto PELA tela do alarme: a resposta dela chega
    // antes de qualquer evento, guardada no aparelho.
    drenarRespostaDoAlarme();
  };
  document.addEventListener('DOMContentLoaded', cargaInicial);
  if (document.readyState !== 'loading') setTimeout(cargaInicial, 0);

  /* ------------------------------------------------------------------------
     6. L2 — MONTAR → MONTAGEM → INICIAR (DEBITA) → ENCERRAR.
     Regras que valem dinheiro, todas do domínio e nenhuma inventada aqui:
     · quem DEBITA é o Iniciar, e só ele;
     · o número do portão é o MESMO que o servidor vai cobrar (custo-preview),
       nunca uma conta minha na tela;
     · toque repetido não cobra duas vezes (trava de reentrância);
     · Cancelar não perde entrega: as abertas voltam pra agenda (encerrar).
     ------------------------------------------------------------------------ */
  /* --------------------------------------------------------------------
     O DIA DA ROTA A MONTAR (dono, 07/08): "não estamos conseguindo se
     adiantar, ou voltar um dia". 0 = hoje (fluxo de sempre); chip só pra admin.

     🔴 O CHIP ESCOLHE GENTE, NÃO DATA (dono, 10/08, com a foto do portão "Rota
     de Qua montada · Ela abre sozinha quando o dia chegar"): *"se eu clicar no
     'qua', e hoje for segunda, ele monta e inicia a rota normalmente"* · *"se
     for uma segunda, e eu quiser entregar clientes de domingo, qual
     problema?"*. Tocar outro dia é dizer QUEM entra na rota de HOJE — nunca
     agendar um dia futuro. Quem agenda dia futuro é o computador (a mesa de
     despacho); no celular quem está com o carro na rua entrega HOJE.

     ⚰️ AQUI MORREU O `/logistica/admin-route/prepare` DO CELULAR. Ele nasceu
     em 07/08 como "o mesmo trilho do desktop" e em 09/08 virou "a rota nasce no
     dia dela" (a torneira: 50 clientes de segunda viravam entrega de domingo
     porque escolher o dia GRAVAVA calado). Os três perigos que o justificavam
     morreram na madrugada de 10/08 — entrar não grava (só o dedo grava), o
     não-processado expira sozinho (Lei do Desaparecer) e `paradaAbertaDaConta`
     impede a porta de entrar 2× no mesmo dia. O que sobrou dele era só a
     PAREDE: um portão dizendo "volte quarta-feira" pra quem tem o carro na rua
     hoje. Ver a cena M do `prova-fluxo-rota`.

     🔴 OS CHIPS SAÍRAM E VOLTARAM EM 09/08, e a lição fica escrita aqui: eles
     são a ÚNICA porta deste valor. Sem eles `montarDia` nasce e morre em 0 —
     `diaDosEspacos` e o recorte do dia escolhido ficam de pé e inalcançáveis.
     Quem for tirar o chip da tela de novo está tirando "montar a rota com a
     gente de outro dia" junto.
     -------------------------------------------------------------------- */
  /* 🔴 A MONTAGEM ABRE SEM DIA (dono, 10/08, com a foto da tela: "ao entrar no
     montagem de rota, não carregar o dia automaticamente, deixe nessa tela").
     -1 = nenhum chip aceso = a ROTA AVULSA: a tela mostra a semana ("Os dias que
     você entrega"), o histórico e o "Adicionar parada" — e nenhuma lista chega do
     servidor até o dedo escolher um dia. É o par do que foi feito hoje de manhã
     ("entrar não GRAVA nada"): agora entrar também não CARREGA nada. 0 continua
     sendo HOJE, e é pra ele que o chip de hoje leva. */
  let montarDia = -1;

  /* ------------------------------------------------------------------------
     🔴 ESCOLHER CLIENTE É RASCUNHO ATÉ ALGUÉM MANDAR GRAVAR (dono, 09/08: "se
     eu apertar voltar ele já abre a tela inicial com as 3 rotas avulsas, eu
     ainda nem confirmei q queria nada — está cobrando créditos?").

     A porta "Meus clientes" gravava no toque: MEDIDO na prova, três
     `POST /logistica/entregas` mais um `planejar` saíam antes de o dono
     confirmar coisa nenhuma. Decidir e GRAVAR eram o mesmo gesto, e o Voltar
     não desfazia nada — a tela inicial já abria com as paradas dentro.

     Agora, com a rota AINDA NÃO INICIADA, o que sai da porta é RASCUNHO: mora
     aqui no aparelho, aparece na lista da Montagem junto com a prévia do dia, e
     só vira entrega quando o dedo manda — "Salvar rota", "Montar rota" ou
     "Iniciar rota". Voltar sem mandar joga fora.

     🔴 DUAS EXCEÇÕES, E AS DUAS SÃO DO DOMÍNIO, NÃO CONVENIÊNCIA MINHA:
     1. ROTA VIVA NA RUA. Quem entrou pela Rota / Rota·lista está dirigindo, e a
        rota já existe: adicionar A ELA é o propósito do gesto, e não há nenhum
        momento "salvar" depois pra segurar o rascunho até lá. Ali a parada
        continua imediata, exatamente como sempre foi.
     2. CADASTRO DE CLIENTE NOVO. Cadastro é cadastro: a CONTA continua nascendo
        na hora (porta Endereço, modo Cadastro). O que virou rascunho é a
        PARADA, nunca o cliente.
     ------------------------------------------------------------------------ */
  /* {id, localId?, nome, enderecoLinha, bairro, lat?, lng?, resolveSozinho}
     🔴 A LINHA JÁ CHEGA MONTADA, e o rascunho NÃO guarda `endereco` cru
     (09/08): quem enche este array é quem sabe de onde o dado veio — do
     servidor, que manda `enderecoLinha` pronta (histórico), ou das partes,
     que passam por `linhaDeEndereco` na porta "Meus clientes". Guardar a rua
     crua aqui convidaria a próxima tela a montar a linha do jeito dela. */
  const RASCUNHO = [];
  /** a rota está viva na rua? então nada aqui é rascunho */
  const rotaNaRua = () => estadoRota === 'rodando' || estadoRota === 'pausada';
  /** as telas em que o rascunho SOBREVIVE: elas são a própria escolha de gente */
  // 'fichavinculo' entra pela mesma razão da 'ficha' (12/08): ela é uma tela DE
  // DENTRO do cadastro, e atravessá-la não é desistir da gente já escolhida.
  const MANTEM_RASCUNHO = new Set(['rapida', 'ficha', 'novocliente', 'fichavinculo']);
  function descartarRascunho() {
    if (!RASCUNHO.length) return;
    RASCUNHO.length = 0;
    // o chip de HOJE pode ter nascido só por causa do rascunho — ver `publicarMontarDias`
    publicarMontarDias();
  }

  /** a data (SP) da próxima ocorrência do dia n (1=Seg…7=Dom), hoje inclusive */
  const dataDoDia = (n) => {
    const [a, m, d] = diaOperacional().split('-').map(Number);
    const base = new Date(Date.UTC(a, m - 1, d, 12));
    const dow = base.getUTCDay() === 0 ? 7 : base.getUTCDay();
    base.setUTCDate(base.getUTCDate() + (((n - dow) + 7) % 7));
    return base.toISOString().slice(0, 10);
  };
  /* 🔴 SÓ ENTRA DIA QUE TEM CLIENTE — e "Hoje" não é um dia (dono, 08/08: "não
     pode ter os dias q não tem cliente, nem o hoje... só carregar e ficar
     selecionado o dia atual").
     Antes eram 8 chips: "Hoje" mais os outros 6 dias da semana. Dois defeitos
     num só: (1) o dia de hoje aparecia com nome falso — sábado se chamava
     "Hoje" e "Sáb" sumia da fila; (2) terça, quarta e domingo, dias em que esta
     empresa não entrega, convidavam pra uma lista vazia. Hoje o chip do dia
     atual É o dia dele (Sáb), já aceso, e o valor dele continua sendo 0 — o
     resto do fluxo (montar, prepare, salvar) lê 0 como "o dia de hoje, o
     caminho de sempre", e dinheiro não muda de trilho por causa de rótulo.
     🔴 QUEM DIZ QUE O DIA TEM GENTE É O SERVIDOR: `GET /logistica/agenda` traz
     `totalClientesDia` por dia da semana — a MESMA conta do chip do desktop, de
     propósito (dois fronts do mesmo produto não podem discordar sobre quem
     entrega na terça). `totalParadas` NÃO serve: ele zera sozinho quando o dia
     já foi gerado ou a cadência é quinzenal, e o dia sumiria da tela com os
     clientes todos lá dentro (é o FIX 27/07 do próprio backend). Medido no g15
     em 08/08: agenda e prévia concordam nos 7 dias (Seg 52·52, Ter 0·0,
     Qua 0·0, Qui 72·72, Sex 4·1, Sáb 98·98, Dom 0·0).
     -------------------------------------------------------------------- */
  let diasComCliente = null;      // Set de 1..7; null = ainda não medi
  let diasEmVoo = false;
  /* 🔴 A MESMA RESPOSTA JÁ TRAZIA A CONTA, E ELA ERA JOGADA FORA. O `/logistica/
     agenda` devolve `totalClientesDia` por dia e este loader guardava só o
     CONJUNTO de dias que têm gente — o suficiente pros chips ("Seg, Qua, Qui"),
     nada pro que o dono pediu em 09/08 ("os dias q foram agendados e
     quantidades"). Zero pedido novo ao servidor: o número já estava no pacote.

     🔴 E O FETCH SAIU DO PORTÃO DE ADMIN. Ele estava lá porque o único cliente
     era o chip da MONTAGEM, que é tela de admin — mas a semana é da tela do
     motorista também, e "em que dia eu entrego?" não é dado de dono. O
     endpoint não tem `@Admin` (conferido no controller); quem continua atrás do
     portão é a PUBLICAÇÃO dos chips (`publicarMontarDias`), que é o que
     realmente pertence ao admin. */
  async function carregarDiasComCliente() {
    if (typeof window.API === 'undefined' || diasEmVoo) return;
    diasEmVoo = true;
    let r;
    // Fonte no chão fica com o que já sabia — e, se nunca soube, com os 7 dias.
    // Sumir com um dia por IGNORÂNCIA tira o acesso ao dia; mostrar um dia a
    // mais custa um toque. O erro tem que cair pro lado que não prende ninguém.
    try { r = await window.API.get('/logistica/agenda'); } catch (_) { return; } finally { diasEmVoo = false; }
    const dias = Array.isArray(r && r.dias) ? r.dias : [];
    if (!dias.length) return;
    diasComCliente = new Set(dias
      .filter((d) => Number(d && d.totalClientesDia) > 0)
      .map((d) => Number(d.diaSemana)));
    publicarSemana(dias);
    publicarMontarDias();
  }

  /* A SEMANA DA AGENDA na tela da lista: `[[dia, 'Segunda', 53, ehHoje]]`.
     🔴 OS SETE DIAS ENTRAM, INCLUSIVE OS ZERADOS — ao contrário dos chips, que
     escondem o dia vazio de propósito (chip é CONVITE: levar pra uma lista sem
     ninguém é botão morto). Aqui a linha é RESPOSTA, não convite: quem abre a
     tela num domingo está perguntando "e nos outros dias?", e um domingo que
     some da semana deixa a pergunta sem resposta. Domingo com 0 é a resposta.
     Só o dia da semana entra — `totalClientesDia` é a LISTA DE GENTE do dia,
     estável; `totalParadas` zera sozinho quando o dia já foi gerado e faria a
     semana inteira piscar pra zero ao longo do turno (é o FIX 27/07 do backend). */
  const NOME_DIA = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  function publicarSemana(dias) {
    if (typeof window.usarDados !== 'function') return;
    const hoje = diaDaSemana();
    const porDia = new Map(dias.map((d) => [Number(d && d.diaSemana), d]));
    const semana = [1, 2, 3, 4, 5, 6, 7].map((n) => {
      const d = porDia.get(n);
      return [n, NOME_DIA[n], Number((d && d.totalClientesDia) || 0), n === hoje ? 1 : 0];
    });
    // Empresa que não agendou NINGUÉM em dia nenhum não ganha um quadro de sete
    // zeros: aí o bloco todo é ruído, e o vazio da tela já diz o que precisa.
    window.usarDados('rota', { semana: semana.some((x) => x[2] > 0) ? semana : [] });
  }

  /** os chips de dia da tela de MONTAGEM — sem admin, nada entra */
  function publicarMontarDias() {
    if (typeof window.usarDados !== 'function') return;
    if (!ehAdmin()) return;
    const hoje = diaDaSemana();
    // 🔴 A REGRA É UMA SÓ, E VALE PRO HOJE TAMBÉM (dono, 08/08: "se o dia não
    // tem nada: nada a exibir hoje"). Eu tinha aberto exceção pro dia atual —
    // ele ficaria de pé mesmo vazio, pra não sobrar seleção sem chip. Errado:
    // chip de um dia que não tem ninguém é convite pra lista vazia, e o dia
    // atual não é diferente dos outros. Quem explica a tela quando hoje está
    // vazio é o TEXTO ("Nada a exibir hoje"), não um chip mentindo que há o que
    // montar.
    /* 🔴 CHIP DE DIA É DA AGENDA, E SÓ DELA (dono, 09/08: "vc meio q criou um
       'dom' como se tivesse cliente de domingo, totalmente fora de semantica…
       isso aqui é AVULSO, crie uma parte avulsa"). A 1ª cura da "porta de
       volta" fez rascunho e parada aberta acenderem o chip de HOJE — e num
       domingo sem agenda nasceu um "Dom" mentindo que havia cliente de
       domingo. O chip conta a AGENDA; o avulso vive na PARTE AVULSA da lista
       de HOJE (etiqueta `avulsa` no somarRascunho/somarAvulsas), e a volta de
       um dia espiado é o 2º toque no chip aceso — regra que os chips já têm. */
    const temHoje = !!(diasComCliente && diasComCliente.has(hoje));
    const dias = [1, 2, 3, 4, 5, 6, 7]
      .filter((n) => (n === hoje ? temHoje : (!diasComCliente || diasComCliente.has(n))))
      .map((n) => [n === hoje ? 0 : n, ROTULO_DIA[n]]);
    window.usarDados('montagem', { dias, diaSel: montarDia });
  }

  /* O recado da lista vazia. Hoje sem ninguém não tem chip pra explicar a tela
     (a regra acima o tirou da fila), então quem explica é esta linha — texto
     literal do dono. Outro dia continua com o recado que já existia: ali o chip
     está aceso e o "nesse dia" tem a quem se referir. Um dia da semana pode vir
     vazio mesmo tendo gente: a cadência (quinzenal, de N em N) decide se ele
     cai NESTA semana. */
  const textoVazio = (dia) => (dia === -1 ? 'Rota avulsa — adicione as paradas'
    : dia ? 'Nenhum cliente nesse dia' : 'Nada a exibir hoje');

  /* 🔴 O CHIP DE DIA TEM QUE TROCAR A LISTA (dono, 07/08: "alterno entre dias
     e só aparece o mesmo cliente"). Antes o chip só mudava a SELEÇÃO — a lista
     continuava a mesma, e escolher Sábado parecia quebrado. Agora a MONTAGEM
     mostra a prévia do dia escolhido (`GET /logistica/dia-preview`, a mesma
     porta do app antigo): quem VAI entrar na rota, antes de materializar nada.
     Rota já montada tem prioridade: aí a montagem mostra a rota de verdade
     (escrita pelo `carregarRota`) e o botão do pé vira "Iniciar rota". */
  let previaSeq = 0;
  const PREVIA = [];                  // as paradas da prévia, pro Salvar rota
  /* ------------------------------------------------------------------------
     🔴 A LISTA JÁ CHEGA NA ORDEM DE QUEM VAI DIRIGIR (dono, 08/08: "montar
     rota — carregar em ordem de distância, já carregar montado pelo GPS").

     A prévia vinha na ordem do BANCO (a varredura dos vínculos vencidos), que
     não é ordem nenhuma pra quem está com o carro na rua: o cliente da esquina
     podia ser o nº 40 da lista e o do outro bairro o nº 1. Montar era a única
     forma de ver uma sequência — e mesmo assim (ver `origemGps`) ela nascia a
     partir da 1ª parada da lista, não de onde o motorista está.

     Aqui a tela se antecipa: vizinho-mais-próximo a partir do GPS, em linha
     reta (Haversine, o mesmo `metrosEntre` do anel de chegada). É PRÉ-ordem, e
     de propósito não tenta ser o motor: quem manda na rota final continua sendo
     o servidor, que roda NN + 2-opt por RUA (OSRM) a partir da MESMA origem —
     por isso as duas ordens se parecem, e a segunda é sempre melhor.

     Sem fix, ou sem pino, ninguém inventa distância: a lista sai na ordem que o
     servidor mandou e quem não tem coordenada vai pro FIM (não some — some é
     que seria mentira). ------------------------------------------------------ */
  function encadearPorDistancia(itens, de) {
    const temPino = (c) => pinoValido(c && c.lat, c && c.lng);
    const semPino = itens.filter((c) => !temPino(c));
    if (!de) return itens.filter(temPino).concat(semPino);
    const fila = itens.filter(temPino);
    const saida = [];
    let atual = de;
    while (fila.length) {
      let melhor = 0;
      let menor = Infinity;
      for (let i = 0; i < fila.length; i += 1) {
        const d = metrosEntre(atual, fila[i]);
        if (d < menor) { menor = d; melhor = i; }
      }
      const p = fila.splice(melhor, 1)[0];
      saida.push(p);
      atual = { lat: p.lat, lng: p.lng };
    }
    return saida.concat(semPino);
  }

  /* O que o servidor mandou fica guardado CRU: o primeiro fix do GPS costuma
     chegar depois da lista (numa garagem, bem depois), e reordenar não pode
     custar outra ida à rede. `previaComGps` é o que garante UM repinte só —
     encadear de novo a cada fix seria a tela piscando na mão do motorista, e o
     dedo dele pode já ter arrastado um cartão. */
  let previaCrua = null;
  let previaAlvo = 0;
  let previaComGps = false;
  /* O dedo já mandou nesta lista? Então nem o GPS a reordena de novo. Um fix
     novo chegando depois do arrasto refaria a corrente e desfaria a decisão
     dele — o mesmo pecado do otimizador que esta frente inteira está matando. */
  let previaDoDedo = false;

  async function encherMontagem() {
    if (typeof window.usarDados !== 'function') return;
    /* 🔴 UMA TELA SÓ (dono, 08/08: "o prévia vai ser a montagem única").
       Aqui havia um portão que devolvia a tela pro `carregarRota` assim que a
       rota ficava montada — e era ELE o "próximo" que o dono mandou apagar: a
       mesma tela repintada por outra fonte, sem os modos e sem o arrasto, só
       pra mostrar a mesma gente com hora do lado. Agora a lista da Montagem
       tem UM dono do começo ao fim; quem muda com a rota montada é a ORDEM
       dela (ver `ordemDaRotaMontada`), não quem a escreve. */
    const alvo = montarDia;
    const seq = ++previaSeq;
    /* ROTA AVULSA (`montarDia === -1`): nenhum dia aceso — a agenda fica FORA
       da tela de propósito. O que sobra é o que o dedo pôs: as avulsas abertas
       de hoje e o rascunho. Nada de rede: a prévia do dia não é consultada. */
    if (alvo === -1) {
      previaCrua = [];
      previaDoDedo = false;
      previaAlvo = -1;
      somarAvulsas(hojeISO());
      somarRascunho(hojeISO());
      publicarPrevia();
      return;
    }
    const data = alvo ? dataDoDia(alvo) : hojeISO();
    // A lista velha morre ANTES da rede: um fix que chegasse no meio da busca
    // acharia a prévia do chip anterior na memória e a republicaria na tela.
    previaCrua = null;
    previaDoDedo = false;      // lista nova, decisão de dedo nenhuma ainda
    window.usarDados('montagem', { carregando: true, semFonte: false });
    let prev;
    try {
      prev = await window.API.get(`/logistica/dia-preview?date=${encodeURIComponent(data)}`);
    } catch (_) {
      // Prévia no chão com chip aceso mostraria a lista de outro dia com Sáb
      // selecionado — a mentira que este conserto existe pra matar.
      if (seq !== previaSeq) return;
      PREVIA.length = 0;
      previaCrua = null;
      return window.usarDados('montagem', {
        carregando: false, semFonte: true, linhas: [], somaParadas: '', somaProdutos: '', somaValor: '',
      });
    }
    // trocou de chip enquanto a rede respondia: resposta velha não escreve.
    if (seq !== previaSeq) return;
    previaCrua = Array.isArray(prev && prev.clientes) ? prev.clientes : [];
    previaAlvo = alvo;
    somarAvulsas(data);
    somarRascunho(data);
    publicarPrevia();
    // A cura do endereço roda DEPOIS de a lista estar na tela — ver `sanitizarPrevia`.
    void sanitizarPrevia(seq, data, alvo || diaDaSemana());
  }

  /* ------------------------------------------------------------------------
     🔴 A MONTAGEM VOLTOU A SANITIZAR O ENDEREÇO (dono, 09/08: "não está
     sanitizando endereço, você tem todo o mecanismo, religue").

     O mecanismo nunca morreu — ele mudou de porta e o app novo não bateu nela.
     Desde 27/07 ("tudo automático, sem telas sem botões, deixe tudo backend") a
     cura CNEFE não tem pop-up: ela roda DENTRO de quem lê o dia. São duas
     portas, e cada uma lê uma coisa:
       · `POST /logistica/rota/conferir` — cura as ENTREGAS já materializadas.
         Esta o app chama, no `montarRota`. Ou seja: só cura DEPOIS de montar.
       · `POST /logistica/rota/checar-enderecos` — cura o ROSTER DO DIA, lendo a
         MESMA fonte da lista desta tela (`getDayPreview`, o dia da agenda) e
         ANTES de materializar entrega nenhuma. Esta ninguém chamava no app novo
         (o inventário da fusão já registrava o sanitizador como "NÃO EXISTE").

     Como a Montagem virou a tela única e ela sai do `dia-preview`, o buraco era
     exatamente este: o dono abria a lista e via "sem trajeto — não sei onde
     fica" num cliente que o CNEFE resolve sozinho em milissegundos, e o pino só
     aparecia depois de montar. Agora a 2ª porta é chamada aqui.

     TRÊS CUIDADOS, porque cura é cara e a tela é de decisão:
     1. NUNCA ANTES DA LISTA. O orçamento da cura é de 12 s no servidor; segurar
        a Montagem por ela seria trocar um pino faltando por uma tela parada.
        Publica primeiro, cura depois, republica se mudou.
     2. UMA TENTATIVA POR DIA, POR SESSÃO. É o mesmo espírito do carimbo
        `sanitizadoEm` do servidor ("não sanitizar 2x"): trocar de chip pra lá e
        pra cá não paga ViaCEP+CNEFE de novo pelos mesmos endereços.
     3. REPINTE SÓ SE CUROU, E SÓ SE O DEDO NÃO MANDOU. Repintar sem pino novo é
        pisca à toa; repintar por cima de um arrasto é desfazer decisão humana —
        o pecado que a frente inteira está matando.
     ------------------------------------------------------------------------ */
  const semPinoNaPrevia = (c) => !pinoValido(c && c.lat, c && c.lng);
  const SANITIZADO = new Set();       // datas já tentadas nesta sessão

  async function sanitizarPrevia(seq, data, dia) {
    if (!temPonte() || !Array.isArray(previaCrua)) return;
    // Ninguém sem pino = nada a curar. Sai ANTES de marcar a data: o dia pode
    // ganhar um cliente novo daqui a pouco, e aí a cura ainda tem o que fazer.
    const antes = previaCrua.filter(semPinoNaPrevia).length;
    if (!antes || SANITIZADO.has(data)) return;
    SANITIZADO.add(data);
    let r;
    try {
      r = await window.API.post('/logistica/rota/checar-enderecos', { dias: [dia], dates: [data] });
    } catch (_) {
      return;   // cura é best-effort: fonte no chão nunca derruba a lista da tela
    }
    if (seq !== previaSeq || previaDoDedo) return;
    // O que SOBROU sem mapa depois da cura. Menos do que entrou = o servidor
    // gravou pino em alguém, e a lista na tela está velha.
    const restam = (Array.isArray(r && r.problemas) ? r.problemas : [])
      .filter((p) => Array.isArray(p.campos) && p.campos.some((c) => c && c.campo === 'localizacao')).length;
    if (restam >= antes) return;
    let prev;
    try {
      prev = await window.API.get(`/logistica/dia-preview?date=${encodeURIComponent(data)}`);
    } catch (_) { return; }
    // Sem `carregando` aqui, de propósito: a lista já está de pé e correta; o
    // que muda é o pino de quem estava sem — esqueleto seria a tela sumindo
    // debaixo do dedo dele por causa de um enfeite que chegou atrasado.
    if (seq !== previaSeq || previaDoDedo) return;
    const clientes = Array.isArray(prev && prev.clientes) ? prev.clientes : [];
    if (!clientes.length) return;
    previaCrua = clientes;
    somarAvulsas(data);
    somarRascunho(data);
    publicarPrevia();
  }

  /* ------------------------------------------------------------------------
     🔴 A PARADA AVULSA TEM QUE APARECER NA TELA DE MONTAR (09/08).

     A lista da montagem sai do `/logistica/dia-preview`, e ele lê a AGENDA —
     os vínculos de `ClienteProduto` que vencem no dia. Ele NÃO lê `Entrega`.
     Uma parada criada à mão pelo "+" não tem vínculo nenhum, então ela nascia
     INVISÍVEL aqui mesmo já estando na rota: no domingo do dono — dia sem
     agenda — a tela seguiria dizendo "Nenhum cliente nesse dia" logo depois de
     ele adicionar um endereço, e o rodapé nem apareceria.

     A cura não é só da minha frente: TODA entrega que nasce fora da agenda
     sofria disto (o painel web agendando uma avulsa é o outro caso). Então o
     que entra aqui são as entregas ABERTAS do dia que não casam com ninguém da
     prévia. As que casam já estão na lista — somá-las de novo poria o mesmo
     cliente em duas linhas, que é bug de produto pela lei desta casa.

     Só vale pro DIA DE HOJE: `ENTREGAS` é a rota de hoje, e enfiá-la na prévia
     de uma quarta-feira futura seria mentir sobre o dia que ele está olhando.

     🔴 E AVULSA É `origem`, NÃO "TUDO QUE SOBROU" (dono, 09/08: domingo, chip
     nenhum aceso, "tem 51 clientes carregados... era pra estar 0").
     Eu tinha escrito o filtro ao contrário: entrava toda entrega aberta que não
     casasse com a prévia. Num dia SEM agenda a prévia é vazia por definição, e
     aí a peneira não peneira nada — TODA entrega pendurada no dia vira "avulsa".
     Medido em produção: `dia-preview?date=2026-08-09` devolveu lista vazia (35
     bytes, o servidor está certo) e a tela mostrou 51 clientes; 50 deles são de
     SEGUNDA. Vieram do `admin-route/prepare` das 03:02 — montar o dia de outro
     dia materializa as entregas no dia operacional de HOJE — e o `encerrar` as
     devolve VIVAS ('agendada'), de propósito. Resíduo de um domingo.
     Era a "agenda vestida de rota" de novo, a mesma que a régua `rotaMontada`
     matou na barra do mapa hoje de manhã: a barra aprendeu, esta lista não.
     A régua honesta já existe e é vocabulário desta casa: `origem`. Quem nasce
     à mão é 'avulsa' (`POST /logistica/entregas`, pedido público, rota salva
     materializada); quem nasce da agenda é 'recorrente' — e de quem nasce da
     agenda quem manda é a AGENDA, ou seja o `dia-preview`. Legado grava null, e
     null o app já lê como recorrente (contrato do próprio `listRota`).
     ------------------------------------------------------------------------ */
  function somarAvulsas(data) {
    if (data !== hojeISO() || !ENTREGAS.size || !Array.isArray(previaCrua)) return;
    const jaTem = new Set(previaCrua.map((c) => String((c && c.customerProfileId) || '')));
    paradasAbertas().forEach((p) => {
      const it = p.item || {};
      if (String(it.origem || 'recorrente') !== 'avulsa') return;
      const c = it.cliente || {};
      const cid = String(c.id || '');
      if (!cid || jaTem.has(cid)) return;
      jaTem.add(cid);
      previaCrua.push({
        customerProfileId: cid,
        ...(it.localId ? { localId: String(it.localId) } : {}),
        nome: c.nome || '',
        /* A avulsa fala a MESMA língua da prévia do servidor (09/08): quem
           desenha o cartão lê `enderecoLinha`.
           🔴 E A LINHA É A DO SERVIDOR, não a rua crua. Aqui se lia
           `c.endereco` — o campo do `listRota` que traz SÓ a rua — e a mesma
           parada aparecia "Rua M-7" na montagem e "Rua M-7, 897" na lista da
           rota logo abaixo, que já lê `enderecoLinha`. O servidor manda o
           campo pronto em `/logistica/rota`; ler outro é escolher divergir. */
        enderecoLinha: c.enderecoLinha || '',
        bairro: c.bairro || c.cidade || '',
        observacoes: c.observacoes || '',
        // Sem produto: a avulsa é uma PARADA, não uma venda montada. Item
        // inventado aqui viraria contagem falsa no rodapé da tela.
        itens: [],
        // "Ult. Registro" (12/08): o `/logistica/rota` manda o campo no cliente.
        ...(c.ultimaEntregaAt ? { ultimaEntregaAt: String(c.ultimaEntregaAt) } : {}),
        ...(pinoValido(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : {}),
        // a PARTE AVULSA da lista (dono, 09/08: "isso aqui é AVULSO, crie uma
        // parte avulsa") — a tela agrupa por esta etiqueta, nunca por chip.
        avulsa: true,
      });
    });
  }

  /* ------------------------------------------------------------------------
     O RASCUNHO NA LISTA DA MONTAGEM — mesma porta do `somarAvulsas` logo acima,
     e pelo mesmo motivo: o `dia-preview` lê a AGENDA, e quem foi escolhido na
     mão não tem vínculo nenhum pra ele achar. Sem isto o dono marcava 3 clientes
     e voltava pra uma tela que não os mostrava — a escolha dele viraria fé.

     Só HOJE: rascunho é do dia que se está montando, e empurrá-lo pra prévia de
     uma quarta-feira futura seria mentir sobre o dia que está na tela.

     Quem já está na prévia — ou já virou parada de verdade — não entra 2×.

     🔴 E "2×" SE MEDE POR PORTA, NÃO POR CLIENTE (09/08). A mesma dupla
     `cliente|localId` que o espaço salvo (`ordenarPeloEspaco`) e a PREVIA já
     usam: o mesmo cliente em duas portas no mesmo dia são duas paradas
     legítimas, e a chave por cliente apagava a segunda em silêncio.

     🔴 DUAS CHAVES, PORQUE AS DUAS FONTES SABEM COISAS DIFERENTES — e chutar
     porta em cima de quem não a informa é inventar dado. O `dia-preview` manda
     `localId` em toda linha, então a prévia se compara por PORTA. O `listRota`
     NÃO manda (medido: o item expõe `localApelido`, nunca o id do local), e
     ali a única verdade disponível é a CONTA — comparar por porta contra
     `undefined` faria toda parada já aberta virar "porta diferente" e a lista
     mostraria o mesmo cliente duas vezes.
     ------------------------------------------------------------------------ */
  function somarRascunho(data) {
    if (data !== hojeISO() || !RASCUNHO.length || !Array.isArray(previaCrua)) return;
    const jaTem = new Set(previaCrua.map((c) => chaveDaPorta(c && c.customerProfileId, c && c.localId)));
    const jaEhParada = new Set();
    paradasAbertas().forEach((p) => {
      const cid = String((((p.item || {}).cliente) || {}).id || '');
      if (cid) jaEhParada.add(cid);
    });
    RASCUNHO.forEach((c) => {
      const cid = String(c.id || '');
      const porta = chaveDaPorta(cid, c.localId);
      if (!cid || jaTem.has(porta) || jaEhParada.has(cid)) return;
      jaTem.add(porta);
      previaCrua.push({
        customerProfileId: cid,
        ...(c.localId ? { localId: String(c.localId) } : {}),
        nome: c.nome || '',
        // fala a MESMA língua da prévia do servidor: quem desenha o cartão lê
        // `enderecoLinha` — e a linha já vem MONTADA no rascunho, pela régua
        // única (a do servidor quando ele a mandou, `linhaDeEndereco` quando
        // só chegaram as partes). Remontar aqui seria a terceira régua.
        enderecoLinha: c.enderecoLinha || '',
        bairro: c.bairro || '',
        // Sem produto: rascunho é uma PARADA escolhida, não uma venda montada.
        itens: [],
        ...(pinoValido(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : {}),
        // "Ult. Registro" (12/08) — vem do rascunho, que já o carrega das 3 portas.
        ...(c.ultimaEntregaAt ? { ultimaEntregaAt: String(c.ultimaEntregaAt) } : {}),
        // a MESMA bagagem da linha da agenda — a régua é uma só (ver o push
        // do rascunho): sem isto a avulsa era a única linha "sem trajeto".
        resolveSozinho: !!c.resolveSozinho,
        // a PARTE AVULSA da lista (dono, 09/08) — mesma etiqueta do somarAvulsas.
        avulsa: true,
      });
    });
  }

  /* ------------------------------------------------------------------------
     O HISTÓRICO DA MONTAGEM (dono, 09/08: "criar um histórico, salva por 14
     dias. SIMPLES E FÁCIL, sem inventar moda. E tem como reutilizar a rota
     salva"). O servidor DERIVA os dias de Entrega — nada novo se grava, então
     "salvar" nunca falha e os 14 dias são só a janela da pergunta.
     Reutilizar = encher o RASCUNHO com os clientes daquele dia: o mesmo fluxo
     do escolher na mão — nada persiste até o Salvar/Iniciar, e o Voltar
     descarta, como toda escolha desta tela.
     ------------------------------------------------------------------------ */
  async function carregarHistorico() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    let resp;
    try { resp = await window.API.get('/logistica/rota/historico'); } catch (_) { return; }
    const dias = Array.isArray(resp && resp.dias) ? resp.dias : [];
    window.usarDados('montagem', {
      historico: dias.slice(0, 14).map((h) => {
        const [a, m, d] = String(h.data || '').split('-').map(Number);
        const dt = new Date(a, (m || 1) - 1, d || 1, 12);
        const dow = dt.getDay() === 0 ? 7 : dt.getDay();
        /* 🔴 O DIA DIZ O QUE NÃO FOI COMPLETADO (10/08, dono: "tem q ficar
           registrado rotas que eu criei e cancelei… ambas ficam vermelhas").
           Quem decide o desfecho é o SERVIDOR (`h.desfecho`) — a tela só veste.
           Servidor velho não manda o campo: aí a linha nasce como sempre foi
           (Lei do IF), nunca vermelha por dedução minha. */
        const paradas = Number(h.paradas) || 0;
        const naoFeitas = Number(h.naoCompletadas) || 0;
        const desfecho = String(h.desfecho || '');
        const entregues = Number(h.entregues) || 0;
        const linha = `${paradas} ${paradas === 1 ? 'parada' : 'paradas'}`;
        return {
          data: String(h.data || ''),
          dia: ROTULO_DIA[dow] || '',
          titulo: `${ROTULO_DIA[dow] || ''} · ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
          // "7 paradas · cancelada" / "32 paradas · 28 entregues" / "95 paradas"
          sub: desfecho === 'cancelada' ? `${linha} · cancelada`
            : desfecho === 'incompleta' ? `${linha} · ${entregues} ${entregues === 1 ? 'entregue' : 'entregues'}`
              : linha,
          tom: desfecho && desfecho !== 'completa' ? 'red' : '',
          naoFez: naoFeitas ? `${naoFeitas} não ${naoFeitas === 1 ? 'feita' : 'feitas'}` : '',
        };
      }),
    });
  }

  async function usarHistorico(data) {
    if (!data || !temPonte()) return;
    if (rotaNaRua()) {
      return window.portao({
        tom: 'info', ico: 'route', titulo: 'A rota já está em andamento',
        sub: 'Finalize ou cancele antes de reutilizar outra.', acoes: [['Fechar', '']],
      });
    }
    let resp;
    try { resp = await window.API.get(`/logistica/rota/historico?date=${encodeURIComponent(data)}`); }
    catch (_) {
      return window.portao({
        tom: 'trava', ico: 'route', titulo: 'Não consegui abrir esse dia',
        sub: 'Tente de novo.', acoes: [['Fechar', '']],
      });
    }
    const clientes = Array.isArray(resp && resp.clientes) ? resp.clientes : [];
    /* 🔴 A CHAVE É A PORTA, NÃO O CLIENTE (09/08). O servidor manda UMA LINHA
       POR PORTA — o mesmo cliente em dois `localId` no mesmo dia são duas
       paradas de verdade — e a chave por cliente engolia a segunda calada.
       Mesma dupla `cliente|localId` do espaço salvo e da PREVIA. */
    const jaNoRascunho = new Set(RASCUNHO.map((c) => chaveDaPorta(c.id, c.localId)));
    let novos = 0;
    clientes.forEach((c) => {
      const id = String(c.customerProfileId || '');
      const porta = chaveDaPorta(id, c.localId);
      if (!id || jaNoRascunho.has(porta) || paradaAbertaDaConta(id)) return;
      jaNoRascunho.add(porta);
      /* 🔴 A BAGAGEM INTEIRA VIAJA (09/08). O que sai daqui senta no MESMO
         cartão da linha da agenda e é lido pela MESMA régua, então tem que
         chegar com tudo que ela tem:
         · `localId` — sem ele, reutilizar um dia cria a entrega na porta
           ERRADA (no perfil) sabendo qual porta era. Medido na empresa 41:
           31 linhas de 187 nasciam sem pino e 22 com o pino de outra porta;
         · `enderecoLinha` DO SERVIDOR, nunca a rua crua — 44 dos 225 clientes
           têm o número só na coluna `numero`, e remontar a linha aqui seria a
           segunda régua que este dia inteiro está matando;
         · pino pela régua única (zero não é pino) e `resolveSozinho` de
           `recorrente`, senão a linha grita "não sei onde fica" pra cliente
           com porta marcada. */
      RASCUNHO.push({
        id,
        ...(c.localId ? { localId: String(c.localId) } : {}),
        nome: String(c.nome || 'Cliente'),
        enderecoLinha: String(c.enderecoLinha || ''),
        bairro: String(c.bairro || c.cidade || ''),
        ...(pinoValido(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : {}),
        resolveSozinho: !!c.recorrente,
        // o "Ult. Registro" do cartão viaja com o cliente pelas TRÊS origens da
        // lista; sem isto quem reutiliza um dia do histórico via "Pendente" numa
        // gente que a tela acabou de dizer que ele atendeu.
        ...(c.ultimaEntregaAt ? { ultimaEntregaAt: String(c.ultimaEntregaAt) } : {}),
      });
      novos += 1;
    });
    /* Volta pro estado SEM DIA: quem reutilizou um dia do histórico quer AQUELA
       gente, não a agenda de hoje misturada com ela. O rascunho aparece igual (a
       lista sem dia é feita dele + das avulsas de hoje), e o chip aceso de outro
       dia mostraria a lista errada com o recibo certo. */
    montarDia = -1;
    window.usarDados('montagem', { diaSel: -1 });
    // ESPERA a lista chegar antes do recibo — portão aberto antes do repinte
    // morre com a camada (armadilha 2 da parada avulsa, 09/08).
    await encherMontagem();
    const q = `${novos} ${novos === 1 ? 'parada' : 'paradas'}`;
    window.portao({
      tom: novos ? 'ok' : 'info', ico: novos ? 'check' : 'route',
      titulo: novos ? `${q} na lista` : 'Todo mundo desse dia já está na lista',
      sub: novos ? 'Nada gravado ainda — Salvar ou Iniciar é que gravam.' : '',
      acoes: [['Fechar', '']],
    });
  }

  /* ------------------------------------------------------------------------
     🔴 OS 3 ESPAÇOS DO DIA (dono, 08/08; o 3º entrou em 10/08 — "crie mais um
     slot, vai ser 1 2 e 3, igualzinho os outros") — o botão do MEIO da tela.

     Quatro posições e uma só valendo: `dist` (a ordem automática por distância,
     que a lista já nasce tendo) e `s1`/`s2`/`s3`, as três rotas salvas DAQUELE
     dia da semana. O rótulo é o nome que o motorista digitou: "Manhã" no sábado
     é o Manhã do sábado, sempre — é `diaSemana` do rota-modelo que carrega
     isso, coluna que já existia.

     A ORDEM DOS ESPAÇOS É A DE NASCIMENTO (`criadoEm`), nunca a alfabética: o
     1º salvo do dia é o Espaço 1 pra sempre. Ordenar por nome faria renomear
     "Manhã" pra "Tarde" trocar o espaço de lugar embaixo do dedo dele.

     Escolher um espaço REORDENA o dia — não corta o dia em dois. Quem decide
     QUEM entra na rota é o `planejar` do servidor (ele monta tudo o que está
     aberto hoje); o espaço diz em que SEQUÊNCIA. Por isso o que não está no
     espaço não some: vai pro fim, na ordem de distância que já tinha.
     ------------------------------------------------------------------------ */
  const ESPACOS = [];          // até 3 rota-modelos do dia, em ordem de nascimento
  const MAX_ESPACOS = 3;
  let modoSel = 'dist';        // 'dist' | 's1' | 's2' | 's3'
  const NOME_MAX = 10;         // teto do nome: o botão tem 1/4 da largura da tela

  /** 's2' → 1 · 'dist' → -1. Uma conta só: o número do espaço mora no nome. */
  const idxDoModo = (chave) => {
    const m = /^s([1-9])$/.exec(String(chave || ''));
    return m ? Number(m[1]) - 1 : -1;
  };
  const modeloDoModo = () => ESPACOS[idxDoModo(modoSel)] || null;
  // -1 (rota avulsa) não é um dia: os espaços mostrados seguem os de hoje.
  const diaDosEspacos = () => (montarDia > 0 ? montarDia : diaDaSemana());

  /* ------------------------------------------------------------------------
     🔴 A ÚLTIMA ESCOLHA DO DIA FICA LEMBRADA (dono, 10/08: "sempre q abrir essa
     tela, quando a pessoa clicar no dia da semana, lembrar qual foi a última
     escolha — a pessoa sempre usa o slot 2, já carrega ele").

     A memória é POR DIA DA SEMANA (decisão do dono na mesma conversa): segunda
     lembra o espaço da segunda, quarta o da quarta. Ela mora no aparelho, então
     sobrevive a fechar o app — é hábito de motorista, não estado de sessão.

     E a regra de qual ordem a lista abre, nas palavras dele:
     · sem histórico naquele dia ⇒ "Distância", calculada do GPS pra todos;
     · com histórico ⇒ o espaço lembrado ganha (e a distância continua sendo
       calculada: ela é a BASE por cima da qual a sequência salva se aplica).
     Sem memória nenhuma (1ª vez naquele dia) e com espaço salvo, entra o
     Espaço 1 — "se existir histórico, ele vai carregar o histórico".
     ------------------------------------------------------------------------ */
  const CHAVE_MEMORIA = 'montagem-espaco-do-dia';
  let memoriaEspaco = null;         // { '1': 's2', '3': 'dist', … }
  function lerMemoriaEspaco() {
    if (memoriaEspaco) return memoriaEspaco;
    let bruto = null;
    try { bruto = window.HBX.cache.get(CHAVE_MEMORIA, null); } catch (_) { bruto = null; }
    memoriaEspaco = (bruto && typeof bruto === 'object') ? bruto : {};
    return memoriaEspaco;
  }
  /** grava a escolha do dia — 'dist' também é escolha, e é por isso que ela
   *  entra: sem isso, quem pediu Distância veria o espaço voltar no próximo dia */
  function lembrarEspaco(chave) {
    const mem = lerMemoriaEspaco();
    mem[String(diaDosEspacos())] = String(chave || 'dist');
    try { window.HBX.cache.set(CHAVE_MEMORIA, mem); } catch (_) { /* sem cache: vale a sessão */ }
  }
  const espacoLembrado = (dia) => String(lerMemoriaEspaco()[String(dia)] || '');

  /** a fileira do seletor — e o ponto âmbar de "editado" mora no modo ATIVO */
  function publicarModos() {
    if (typeof window.usarDados !== 'function') return;
    /* 🔴 SÓ APARECE ONDE TEM O QUE REORDENAR. Com a rota de hoje JÁ MONTADA a
       tela mostra as paradas REAIS e a sequência virou dado do servidor
       (`rotaOrdem`) — quem manda nela é o arrasto da lista, não este botão.
       A fileira ali trocaria de aceso sem mudar linha nenhuma: toque mudo, que
       nesta casa é defeito. Mesma condição do `encherMontagem`, de propósito —
       o seletor existe exatamente quando a PRÉVIA existe.
       Salvar continua funcionando na rota montada: o botão azul pergunta em
       qual espaço gravar (ver `salvarRota`). */
    if (!montarDia && estadoRota !== 'montar' && estadoRota !== 'carregando') {
      return window.usarDados('montagem', { modos: [], modoSel: '' });
    }
    const modos = ['dist', 's1', 's2', 's3'].map((chave, i) => {
      const m = i ? ESPACOS[i - 1] : null;
      // `previaDoDedo` já é o "o dedo mandou nesta lista" da montagem — o ponto
      // é a LEITURA dele, não um estado novo pra sair de sincronia depois.
      return [chave, i ? esc(String((m && m.nome) || '')) : 'Distância', (modoSel === chave && previaDoDedo) ? 1 : 0];
    });
    window.usarDados('montagem', { modos, modoSel });
  }

  /** os 3 espaços do dia escolhido, do servidor */
  async function carregarEspacos() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const dia = diaDosEspacos();
    let r;
    // Fonte no chão FICA COM O QUE JÁ SABIA: zerar a fileira por causa de uma
    // rede ruim faria os espaços do motorista sumirem — e salvar por cima de um
    // espaço "vazio" que na verdade tem rota é perda de trabalho dele.
    try { r = await window.API.get('/logistica/rota-modelos'); } catch (_) { return publicarModos(); }
    ESPACOS.length = 0;
    (Array.isArray(r) ? r : [])
      .filter((m) => m && Number(m.diaSemana) === dia)
      .sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || ''))
        || String(a.id || '').localeCompare(String(b.id || '')))
      .slice(0, MAX_ESPACOS)
      .forEach((m) => ESPACOS.push(m));
    /* 🔴 O DIA CHEGA COM A ESCOLHA DELE JÁ ACESA (dono, 10/08). Antes daqui saía
       só a queda pra "Distância" quando o espaço não existia naquele dia — o
       resto era memória de sessão, e trocar de chip apagava o hábito.
       Agora quem manda é a memória DO DIA: o espaço lembrado se ele ainda
       existe; "Distância" se foi ela a última escolha; e, sem memória nenhuma,
       o Espaço 1 quando o dia tem histórico. Sem histórico, Distância — que é a
       ordem calculada do GPS, a lei do item 1 do mesmo pedido. */
    const lembrado = espacoLembrado(dia);
    if (lembrado === 'dist') modoSel = 'dist';
    else if (lembrado && ESPACOS[idxDoModo(lembrado)]) modoSel = lembrado;
    else if (ESPACOS[0]) modoSel = 's1';
    else modoSel = 'dist';
    publicarModos();
    /* 🔴 E A LISTA SE REPINTA COM O QUE ACABOU DE CHEGAR. O toque no chip dispara
       DUAS idas à rede em paralelo (esta e a `dia-preview`), e nada garante a
       ordem de chegada: com a prévia primeiro, a lista era publicada com os
       espaços do dia ANTERIOR na mão — o botão acendia com o nome certo e as
       paradas embaixo dele na ordem de outro dia. `publicarPrevia` volta na hora
       se ainda não há lista, e o freio do `usarDados` engole o repinte igual. */
    publicarPrevia();
  }

  /* A ordem gravada num espaço, aplicada por cima da lista de hoje. O elo é
     cliente+porta (a mesma dupla que o `idsNaOrdemDaTela` usa lá embaixo); sem a
     porta bater, vale o cliente. Quem não está no espaço vai pro FIM mantendo a
     ordem que tinha — o índice de origem no desempate é o que garante isso sem
     depender de `sort` estável. */
  function ordenarPeloEspaco(clientes, modelo) {
    const paradas = modelo && Array.isArray(modelo.paradas) ? modelo.paradas : [];
    if (!paradas.length) return clientes;
    const porPorta = new Map();
    const porCliente = new Map();
    paradas.forEach((p, i) => {
      const cid = String((p && p.customerProfileId) || '');
      if (!cid) return;
      const porta = chaveDaPorta(cid, p && p.localId);
      if (!porPorta.has(porta)) porPorta.set(porta, i);
      if (!porCliente.has(cid)) porCliente.set(cid, i);
    });
    /* 🔴 A PORTA CERTA GANHA DA PORTA IRMÃ (achado na prova). Com o mesmo
       cliente em dois endereços e só UM salvo no espaço, os dois empatavam no
       índice do espaço — e o desempate por posição de origem entregava o lugar
       pra porta ERRADA (a que não estava salva). O peso vira par/ímpar do mesmo
       índice: acerto de porta é PAR, acerto só de cliente é o ímpar logo
       depois. A ordem entre índices diferentes não muda; o empate acabou. */
    const FIM = Number.MAX_SAFE_INTEGER;
    const peso = (c) => {
      const cid = String((c && c.customerProfileId) || '');
      const porta = chaveDaPorta(cid, c && c.localId);
      if (porPorta.has(porta)) return porPorta.get(porta) * 2;
      return porCliente.has(cid) ? porCliente.get(cid) * 2 + 1 : FIM;
    };
    return clientes
      .map((c, i) => ({ c, p: peso(c), i }))
      .sort((a, b) => (a.p - b.p) || (a.i - b.i))
      .map((x) => x.c);
  }

  /** trocar de posição no seletor: a lista se repinta na ordem escolhida */
  function escolherModo(chave) {
    const alvo = String(chave || 'dist');
    const idx = idxDoModo(alvo);
    // Espaço vazio não troca nada: ENSINA.
    if (idx >= 0 && !ESPACOS[idx]) return tutorialDoEspaco(alvo);
    // 2º toque no que já está aceso abre renomear/apagar (ver `gerirEspaco`).
    if (idx >= 0 && alvo === modoSel) return gerirEspaco(idx);
    modoSel = alvo;
    // O dedo escolheu: é ESTA a escolha que o dia lembra da próxima vez.
    lembrarEspaco(alvo);
    // Escolher uma ordem gravada é DESFAZER o arrasto de propósito — ele some
    // aqui, e com ele o ponto de "editado". Sem isto `previaDoDedo` venceria a
    // escolha e o toque seria mudo.
    previaDoDedo = false;
    publicarModos();
    publicarPrevia();
  }

  /* ------------------------------------------------------------------------
     🔴 O TRECHO ENTRE UM CLIENTE E O OUTRO, NA MONTAGEM (dono, 09/08: "colocar
     uma seta bem bonita, e a distância entre um cliente e outro").

     A lista da rota já tinha o conector — ela recebe do servidor a perna REAL,
     por RUA (`legDistanceM`/`legDurationS`, calculada pelo OSRM no planejar). A
     montagem não tinha nada, e é justamente ali que o dono decide a ordem.

     DUAS FONTES, E A DIFERENÇA IMPORTA:
     · Rota JÁ MONTADA e nesta MESMA sequência ⇒ a perna do servidor, por rua,
       com os minutos. Só quando o vizinho de cima é o vizinho de cima DELE
       também (`pos` exatamente anterior): reaproveitar a perna com a lista
       reordenada pelo dedo seria mostrar a distância de outro par de portas.
     · Qualquer outro caso ⇒ LINHA RETA entre os dois pinos, e SEM minutos.
       Linha reta é a mesma régua que ordenou a lista (`encadearPorDistancia`),
       então ela explica a ordem que está na tela. Minuto, não: tempo só existe
       com rua, e inventar "4 min" de um voo de pássaro é dinheiro e hora
       errados na decisão de quem monta o dia.
     Sem pino dos dois lados não há trecho — e sem pino NENHUM a linha já diz o
     que é: "sem trajeto", em tom de alerta (é pino faltando, não distância a
     menos).
     ------------------------------------------------------------------------ */
  function pernaDaPrevia(atual, anterior, naRota, anteriorNaRota) {
    const temPino = (c) => pinoValido(c && c.lat, c && c.lng);
    /* 🔴 A MESMA RÉGUA DO PAINEL DO COMPUTADOR (dono, 09/08: "quero ver erro
       apenas nos 4, igual está no desktop do Andre"; e a lei geral: "o que for
       regra no celular é regra no desktop também").
       O painel `/logistica?visao=enderecos` só põe em "Corrigir" quem o dono
       precisa ver: cliente SEM PINO mas COM recorrência ativa vai pra "Revisar",
       porque a 1ª entrega grava a porta pelo GPS do entregador — é a regra
       `resolveSozinho`, escrita em logistica-base-saude.service.ts por ordem dele
       em 06/08. Medido hoje na company 41: o computador mostra 4 e o app gritava
       "não sei onde fica" em 34 — a mesma base, duas réguas.
       Quem vem da AGENDA já chega com `resolveSozinho` do servidor. A parada
       AVULSA não vem, e continua avisando: ali não há entrega recorrente pra
       gravar a porta sozinha. */
    if (!temPino(atual)) return atual && atual.resolveSozinho ? '' : 'sem trajeto — não sei onde fica';
    if (!anterior) return '';
    if (naRota && anteriorNaRota && naRota.pos === anteriorNaRota.pos + 1
      && typeof naRota.legDistanceM === 'number') {
      const real = distancia(naRota.legDistanceM, naRota.legDurationS);
      if (real) return real;
    }
    if (!temPino(anterior)) return '';
    return emMetros(metrosEntre(anterior, atual));
  }

  /** a prévia na tela — encadeada pelo GPS quando existe fix */
  function publicarPrevia() {
    if (typeof window.usarDados !== 'function' || !previaCrua) return;
    const alvo = previaAlvo;
    // Ordem do dedo > ordem do ESPAÇO > ordem do GPS > ordem do servidor.
    previaComGps = previaDoDedo || !!ultimaPos;
    const espaco = modeloDoModo();
    // uma leitura só da rota montada por pintura: ordem E hora saem dela.
    const daRota = pesosDaRotaMontada();
    const clientes = previaDoDedo
      ? previaCrua.slice()
      : (espaco
        ? ordenarPeloEspaco(encadearPorDistancia(previaCrua, ultimaPos), espaco)
        /* 🔴 SEM ESPAÇO, MANDA O GPS — SEMPRE (dono, 10/08: "o carregamento, ao
           clicar no dia da semana, sempre organizar por ordem de distância do
           ponto atual do seu GPS SEMPRE"; e na dúvida: "se não existir
           histórico sempre vai calcular e carregar Distância entre todos").
           A ordem da rota JÁ MONTADA continua valendo num caso só: quando não
           há fix nenhum. Ali `encadearPorDistancia` devolve a ordem do servidor
           do mesmo jeito (não há de onde encadear), então preferir a sequência
           que o otimizador cravou não contraria o GPS — não há GPS.

           ⚰️ AQUI MORREU "quem ordena é o otimizador assim que ele responde"
           (08/08). A ordem da rota montada vinha na frente do encadeado por
           distância — e era ela que fazia o dono clicar no dia e ver uma
           sequência que não é a de quem está com o carro na rua. */
        : ((!ultimaPos && ordemDaRotaMontada(previaCrua, daRota))
          || encadearPorDistancia(previaCrua, ultimaPos)));
    /* 🔴 A PARTE AVULSA VEM PRIMEIRO (dono, 09/08: "crie uma parte avulsa").
       Antes do Iniciar a ordem da tela é prévia — quem crava a sequência é o
       otimizador na saída. Então o avulso, que é o trabalho da vez, senta no
       TOPO como grupo próprio, e a agenda do dia segue abaixo. A partição
       preserva a ordem relativa de cada grupo, e roda ANTES do `previaCrua =`
       pra pernas, arrasto e PREVIA andarem no MESMO índice da tela. */
    const clientesOrdenados = [...clientes.filter((c) => c && c.avulsa), ...clientes.filter((c) => !(c && c.avulsa))];
    /* Esta lista JÁ É a rota de hoje? Pergunta feita à rota montada, uma vez
       por pintura: todo mundo da tela tem entrega aberta hoje. É o que decide o
       verbo do pé quando o chip é de outro dia (ver `pronta`, logo abaixo) —
       estado nenhum guardado, então cancelar a rota devolve o "Montar" sozinho. */
    const montadaNaTela = !!clientesOrdenados.length
      && clientesOrdenados.every((c) => naRotaMontada(daRota, c));
    // 🔴 O QUE FOI PUBLICADO VIRA A VERDADE. Guardar a ordem CRUA do servidor
    // depois de pintar outra deixaria dois donos da mesma lista — e o próximo
    // repinte escolheria um deles no escuro. Daqui pra frente `previaCrua` e
    // `PREVIA` andam no mesmo índice, que é o que faz o arrasto ser mapeável.
    previaCrua = clientesOrdenados;
    PREVIA.length = 0;
    let produtos = 0;
    let total = 0;
    let temPreco = false;
    const linhas = clientesOrdenados.map((c, i) => {
      const itens = Array.isArray(c.itens) ? c.itens : [];
      const qtdCliente = itens.reduce((s, it) => s + Math.max(1, Number(it.qtd) || 1), 0);
      produtos += qtdCliente;
      const somaCliente = itens.reduce((s, it) => (typeof it.valorUnit === 'number'
        ? s + it.valorUnit * Math.max(1, Number(it.qtd) || 1) : s), 0);
      if (itens.some((it) => typeof it.valorUnit === 'number')) temPreco = true;
      total += somaCliente;
      PREVIA.push({
        customerProfileId: String(c.customerProfileId || ''),
        ...(c.localId ? { localId: String(c.localId) } : {}),
      });
      const naRota = naRotaMontada(daRota, c);
      // a linha da montagem é o MESMO objeto do `.stop` da rota (ver T.montagem)
      return {
        /* 🔴 AQUI A LINHA É UM CLIENTE, NÃO UMA ENTREGA. A entrega só nasce no
           "Montar rota" — então o gancho do toque é `cliente`, e é ele que abre
           a ficha. Enquanto este campo não existiu, o cartão da montagem não
           tinha porta nenhuma (dono, 09/08). */
        cliente: String(c.customerProfileId || ''),
        /* A etiqueta `avulsa` NÃO viaja mais na linha (dono, 09/08: "remover
           'Rota avulsa' o escrito"). Ela servia ao cabeçalho do grupo, que saiu
           do desenho — e campo que ninguém desenha some do seam junto, senão
           daqui a um mês alguém lê a linha e acha que a tela agrupa por ele.
           O que a etiqueta faz de verdade continua acontecendo logo acima: a
           PARTIÇÃO (`clientesOrdenados`) põe o avulso na frente. */
        // a POSIÇÃO de origem: é por ela que o arrasto desta lista fala
        // (`hbx:ordem` → `{previa}`), já que não há id de entrega pra mandar.
        previa: i,
        n: i + 1,
        hora: naRota ? naRota.hora : '',
        nome: esc(c.nome),
        /* 🔴 O ENDEREÇO DO CARTÃO É O ENDEREÇO (dono, 09/08: "celular tem que
           espelhar os mesmos dados que o desktop tem").
           Aqui se lia `localApelido` — o APELIDO do local ("Casa", "Loja"), não a
           rua. Medido em prod na empresa 41: dos 51 clientes de segunda, 51 têm
           apelido VAZIO e 51 têm rua preenchida; a montagem listava a lista
           inteira com o endereço em branco enquanto o mesmo cliente aparecia com
           "Rua M-7, 897" no computador.
           UMA FONTE, SEM MULETA (dono, 09/08: "não deixe legados do que era antes
           no celular"): quem monta a linha é `linhaEnderecoDaFonte`, no servidor,
           da MESMA fonte que deu o pino. Cadeia de `||` com o campo velho seria
           uma segunda régua escondida — e é assim que as duas telas voltam a
           divergir. Sem endereço, a linha fica vazia e o cartão diz a verdade. */
        rua: esc(c.enderecoLinha || ''),
        bairro: esc(c.bairro || c.cidade || ''),
        nota: c.observacoes ? esc(c.observacoes) : undefined,
        tags: itens.map((it) => [`${Math.max(1, Number(it.qtd) || 1)}x ${esc(it.nome)}`, 'blue']),
        marcado: somaCliente ? somaCliente.toFixed(2).replace('.', ',') : '',
        /* 🔴 ISTO NÃO É "MARCADO" (12/08, ordem do dono: *"o valor está correto,
           mas o significado/rótulo está errado"*). `somaCliente` é
           quantidade × valorUnit — QUANTO VALE A ENTREGA que está sendo montada
           pra este cliente. "Marcado" é a palavra do FIADO nesta casa (o
           `debitoAtual`, a dívida em aberto que a tela Clientes mostra); as duas
           coisas na mesma palavra é o motorista lendo dívida onde há venda.
           O cálculo não mudou uma vírgula — mudou o RÓTULO, que viaja agora em
           vez de ficar cravado no desenho do `stop()`. */
        marcRot: 'Valor',
        // o histórico do cliente, no lugar onde vivia um "Pendente" repetido
        reg: ultimoRegistro(c.ultimaEntregaAt),
        cor: corDaParada(naRota && naRota.status),
        pill: pilulaDeDesfecho(naRota && naRota.status),
        perna: pernaDaPrevia(c, clientesOrdenados[i - 1], naRota, naRotaMontada(daRota, clientesOrdenados[i - 1])),
      };
    });
    window.usarDados('montagem', {
      carregando: false,
      semFonte: false,
      linhas,
      /* 🔴 O PÉ DIZ O QUE FALTA FAZER COM ESTA LISTA — e quem responde é a
         PRÓPRIA lista, não o calendário.
         Dia de hoje e rota avulsa (-1): "Iniciar rota", o gesto único de 10/08.
         Chip de outro dia: enquanto aquela gente é só PRÉVIA (nenhuma entrega
         de hoje ainda), o verbo é "Montar rota" — montar é o que falta. Depois
         do montar as mesmas pessoas já são a rota de hoje, e aí o pé vira
         "Iniciar" sozinho, sem precisar apagar o dia da tela.
         ⚰️ Aqui morreu "chip de outro dia ⇒ Montar, sempre" (09/08). Ele era o
         par do `admin-route/prepare`: como a rota nascia NOUTRA data, o Iniciar
         de hoje ficava vazio e o verde seria promessa falsa. Com o dia
         escolhido entregando HOJE a promessa é verdadeira — e cobrar um 2º
         toque depois da rota montada é o "botão que muda de nome" que o dono
         mandou matar no mesmo dia. */
      pronta: previaAlvo > 0 ? (montadaNaTela ? 1 : 0) : 1,
      // Hoje: quem vem primeiro, que é pra onde ele vai agora. Dia futuro: o
      // DIA, porque é ele que responde "montar o quê?".
      iniciarSub: previaAlvo > 0
        ? esc(ROTULO_DIA[previaAlvo] || '')
        : esc((clientes[0] && clientes[0].nome) || ''),
      vazio: textoVazio(alvo),
      somaParadas: String(linhas.length),
      somaProdutos: String(produtos),
      somaValor: temPreco ? dinheiro(total) : '',
    });
  }

  /* ------------------------------------------------------------------------
     CONTINUIDADE DA ROTA — dono, virada do dia e handoff exato.

     Esta frente nunca chama a limpeza ampla do dia. Toda ação leva o `ref`
     validado pelo servidor e só depois recarrega a fonte. A fila offline fecha
     o portão: rota não troca de mãos nem é cancelada enquanto este aparelho
     ainda guarda entrega/comprovante sem ACK.
     ------------------------------------------------------------------------ */
  const refDoAlvo = (alvo) => String((alvo && alvo.dataset && alvo.dataset.ref) || '');
  const ownerDoAlvo = (alvo) => Number(alvo && alvo.dataset && alvo.dataset.owner) || undefined;

  async function filaOfflinePronta() {
    try {
      const ler = () => (window.HBX && window.HBX.offline && window.HBX.offline.status
        ? window.HBX.offline.status() : { pendingOperations: 0, pendingProofs: 0 });
      let st = ler() || {};
      if ((Number(st.rejected) || 0) > 0) {
        window.portao({
          tom: 'alerta', ico: 'alert', titulo: 'Há itens que precisam de revisão',
          sub: 'Uma entrega ou comprovante foi recusado na sincronização. Atualize a rota e resolva esse item antes de mover ou cancelar.',
          acoes: [['Fechar', '']],
        });
        return false;
      }
      if ((Number(st.pendingOperations) || 0) + (Number(st.pendingProofs) || 0) <= 0) return true;
      if (window.HBX.offline && window.HBX.offline.flush) window.HBX.offline.flush();
      await new Promise((resolve) => setTimeout(resolve, 1600));
      st = ler() || {};
      if ((Number(st.rejected) || 0) > 0) {
        window.portao({
          tom: 'alerta', ico: 'alert', titulo: 'Há itens que precisam de revisão',
          sub: 'A sincronização terminou com item recusado. Atualize a rota antes de mover ou cancelar.',
          acoes: [['Fechar', '']],
        });
        return false;
      }
      if ((Number(st.pendingOperations) || 0) + (Number(st.pendingProofs) || 0) <= 0) return true;
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'Sincronize antes de mover',
        sub: 'Este aparelho ainda guarda entregas ou comprovantes. Conecte à internet e toque em Sincronizar.',
        acoes: [['Fechar', '']],
      });
      return false;
    } catch (_) {
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'Não consegui conferir a fila',
        sub: 'Por segurança, conecte à internet e toque em Sincronizar antes de mover ou cancelar esta rota.',
        acoes: [['Fechar', '']],
      });
      return false;
    }
  }

  async function abrirRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    if (!ref) return;
    continuidadeAtiva = ref;
    await carregarRota();
    if (typeof window.ir === 'function') window.ir('rota');
  }

  async function continuarRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    const expectedOwnerId = ownerDoAlvo(alvo);
    if (!ref) return;
    await comTravaFila(async () => {
      if (!(await filaOfflinePronta())) return false;
      let resposta;
      try { resposta = await window.API.post('/logistica/rota/continuidade/retomar', { ref, expectedOwnerId }); }
      catch (e) { avisoErro(e); return false; }
      continuidadeAtiva = '';
      esquecerRotaCarregada();
      await carregarRota();
      if (resposta && resposta.planningPending) avisoErro(new Error(resposta.message));
      if (typeof window.ir === 'function') window.ir('rota');
      return true;
    });
  }

  function puxarRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    const expectedOwnerId = ownerDoAlvo(alvo);
    if (!ref || typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'route', titulo: 'Puxar esta rota?',
      sub: 'As paradas ainda não iniciadas passam para você. A rota da outra pessoa não é apagada.',
      acoes: [['Não', ''], ['Puxar', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTravaFila(async () => {
      if (!(await filaOfflinePronta())) return false;
      let resposta;
      try { resposta = await window.API.post('/logistica/rota/continuidade/puxar', { ref, expectedOwnerId }); }
      catch (e) { avisoErro(e); return false; }
      continuidadeAtiva = '';
      esquecerRotaCarregada();
      await carregarRota();
      if (resposta && resposta.planningPending) avisoErro(new Error(resposta.message));
      if (typeof window.ir === 'function') window.ir('rota');
      return true;
    }), { once: true });
  }

  function cancelarRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    const expectedOwnerId = ownerDoAlvo(alvo);
    if (!ref || typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'close', titulo: 'Cancelar esta rota?',
      sub: 'Só as paradas abertas desta rota serão canceladas.',
      acoes: [['Não', ''], ['Sim, cancelar', 'principal']], classe: 'duas', perigo: true,
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTravaFila(async () => {
      if (!(await filaOfflinePronta())) return false;
      try { await window.API.post('/logistica/rota/continuidade/cancelar', { ref, expectedOwnerId }); }
      catch (e) { avisoErro(e); return false; }
      if (continuidadeAtiva === ref) continuidadeAtiva = '';
      esquecerRotaCarregada();
      await carregarRota();
      if (typeof window.ir === 'function') window.ir('rota');
      return true;
    }), { once: true });
  }
  /* ------------------------------------------------------------------------
     A ROTA MONTADA VISTA PELA LISTA DA MONTAGEM.

     O elo é cliente+porta — o mesmo par que o espaço usa. `ENTREGAS` guarda as
     entregas na ordem que o servidor devolveu (que é a `rotaOrdem`), então a
     posição dentro dele É a sequência do otimizador.

     Devolve `null` quando não há rota montada ou quando ela não fala da mesma
     gente (dia trocado no chip, prévia de outro dia): sem casamento, a lista
     segue no encadeado por distância em vez de aceitar uma ordem alheia.
     ------------------------------------------------------------------------ */
  function pesosDaRotaMontada() {
    if (!ENTREGAS.size) return null;
    const porPorta = new Map();
    const porCliente = new Map();
    let i = 0;
    ENTREGAS.forEach((e) => {
      const it = e && e.item;
      const cid = String((it && it.cliente && it.cliente.id) || '');
      const pos = i; i += 1;
      if (!cid) return;
      /* 🔴 A MONTAGEM PRECISA DA PARADA INTEIRA, NÃO SÓ DA HORA (09/08). Com a
         rota já montada, a lista de lá mostra as MESMAS pessoas que a lista da
         rota — e mostrava todas como "Pendente", sem trecho nenhum, porque
         daqui só saía `hora`. `status` é o que acende a pílula; `legDistanceM`
         /`legDurationS` são a perna REAL, por rua, que o motor já calculou. */
      const dado = {
        pos,
        hora: hora(it.etaAt || it.scheduledAt),
        status: String((it && it.status) || ''),
        legDistanceM: typeof it.legDistanceM === 'number' ? it.legDistanceM : null,
        legDurationS: typeof it.legDurationS === 'number' ? it.legDurationS : null,
      };
      const porta = chaveDaPorta(cid, it && it.localId);
      if (!porPorta.has(porta)) porPorta.set(porta, dado);
      if (!porCliente.has(cid)) porCliente.set(cid, dado);
    });
    if (!porCliente.size) return null;
    return { porPorta, porCliente };
  }

  const naRotaMontada = (mapas, c) => {
    if (!mapas) return null;
    const cid = String((c && c.customerProfileId) || '');
    return mapas.porPorta.get(chaveDaPorta(cid, c && c.localId)) || mapas.porCliente.get(cid) || null;
  };

  function ordemDaRotaMontada(clientes, mapas) {
    if (!mapas) return null;
    // Casou pouco? Então a rota no servidor é de outro dia/outro conjunto e
    // ordenar por ela seria pior que não ordenar.
    const casou = clientes.filter((c) => naRotaMontada(mapas, c)).length;
    if (casou < Math.min(2, clientes.length) || casou * 2 < clientes.length) return null;
    const FIM = Number.MAX_SAFE_INTEGER;
    return clientes
      .map((c, i) => ({ c, p: (naRotaMontada(mapas, c) || { pos: FIM }).pos, i }))
      .sort((a, b) => (a.p - b.p) || (a.i - b.i))
      .map((x) => x.c);
  }

  /* ------------------------------------------------------------------------
     SOLTAR O DIA — o mesmo gesto por três portas: o 2º toque no chip aceso, o
     Voltar do Android e a seta do cabeçalho (dono, 10/08: "ao clicar em voltar
     1x, se tiver algum dia selecionado, ele remove a seleção; caso não tenha
     nada selecionado, só sai").
     Sem dia (`-1`) a Montagem é a ROTA AVULSA — o estado em que ela abre desde
     10/08. Escrito UMA vez porque as três portas têm que soltar o dia do mesmo
     jeito: chip apagado com a lista do dia ainda na tela é a tela mentindo.
     ------------------------------------------------------------------------ */
  function soltarDia() {
    if (montarDia === -1) return false;
    montarDia = -1;
    if (typeof window.usarDados === 'function') window.usarDados('montagem', { diaSel: -1 });
    carregarEspacos();
    encherMontagem();
    return true;
  }

  /** o botão do meio da Rota: abre a tela de montar, sem tocar no servidor */
  function abrirMontagem() {
    // Os espaços do dia entram junto com a tela — quem os busca é o guarda de
    // `tela === 'montagem'`, o mesmo lugar que já enche a lista.
    if (typeof window.ir === 'function') window.ir('montagem');
  }

  let ocupado = false;
  const comTrava = async (fn) => {
    if (ocupado) return undefined;
    ocupado = true;
    /* 🔴 O RESULTADO DE `fn` VIAJA DE VOLTA (10/08) — sem ele, `depoisDaTrava`
       (mais abaixo, o "refaz a ação original" do 409/402 novos) não tem como
       saber se o gesto deu certo antes de repetir o montar/iniciar. */
    try { return await fn(); } finally { ocupado = false; }
  };
  /* 🔴 O "SIM" DE UM PORTÃO NÃO PODE SER DESCARTADO (09/08). `comTrava` protege
     do toque duplo JOGANDO FORA o segundo — o que é certo pro botão de uma tela
     (ele continua ali, dá pra tocar de novo) e errado pra uma confirmação: ela
     FECHA no toque, e toque descartado numa peça que sumiu não tem repeteco.
     Se o app estiver ocupado no instante do "Iniciar" (a Montagem monta sozinha
     ao abrir, e a rede pode estar devolvendo isso agora), o dono via o diálogo
     fechar e nada acontecer. Aqui o toque ESPERA a vez; e se a vez não chegar,
     ele FALA — nunca morre calado. */
  const comTravaFila = async (fn) => {
    const limite = Date.now() + 12000;
    while (ocupado && Date.now() < limite) {
      await new Promise((r) => { setTimeout(r, 60); });
    }
    if (ocupado) return avisoErro(new Error('O app ainda está terminando a ação anterior. Toque de novo.'));
    return comTrava(fn);
  };
  /* 🔴 O PÉ DA MONTAGEM RESPONDE NO MESMO QUADRO DO TOQUE (12/08 — dor do
     dono: toca em "Montar rota" e NADA acontece por segundos; o primeiro
     recibo visual, o `montando(1)` do montarRota, só sai DEPOIS do
     materializarRascunho — que é rede — e gente fica tocando de novo até
     aparecer algo). Duas peças, cada uma com um papel:

       · a CLASSE `aguarde` entra no botão vivo AINDA NO TOQUE, antes de
         qualquer await — a mesma cara do `.ocupado` + pointer-events (cromo
         direto no nó, nunca pelo seam: repinte de seam pisca e chega tarde);
       · a TRAVA é variável DA PONTE, não do DOM: o repinte do meio do fluxo
         (o `carregarRota` de dentro do materializar) troca o nó, e nó novo
         nasce sem a classe — quem segura o toque nesse vão é isto aqui. O
         `comTrava` já descartava o toque duplo (medido na cena Y da prova:
         2 toques = 1 planejar, antes mesmo disto); esta camada soma o recibo
         visual e devolve o botão em ERRO — coisa que o comTrava não faz
         porque não sabe qual nó tocou.

     No fim (sucesso OU erro) a trava solta e a classe sai do nó que ainda
     estiver na mão: em sucesso o repinte já levou a tela embora (nó novo
     nasce limpo, e o "Montando…" do seam assume); em erro o botão volta
     INTEIRO pra tentativa seguinte — aguarde pendurado é promessa falsa. */
  let verboDoPeEmVoo = false;
  function aguardeNoToque(alvo, seguir) {
    if (verboDoPeEmVoo) return;
    verboDoPeEmVoo = true;
    if (alvo && alvo.classList) alvo.classList.add('aguarde');
    const soltar = () => {
      verboDoPeEmVoo = false;
      if (alvo && alvo.classList) alvo.classList.remove('aguarde');
    };
    Promise.resolve().then(seguir).then(soltar, soltar);
  }
  /* 🔴 O CORPO DO ERRO TEM DADO, E ELE ESTAVA SENDO JOGADO FORA (10/08 — o
     beco que travou o dono: toque em Montar/Iniciar morrendo em "Não deu
     certo" quando o servidor já sabia dizer QUEM montou a rota, ou QUEM
     ficou de fora do dia vazio). Contrato novo do servidor: o corpo do erro
     pode trazer `code` (409 `ROTA_DE_OUTRO_MOTORISTA`, 402
     `ASSENTOS_ESGOTADOS`), e o materialize desta MESMA tentativa pode ter
     guardado `avisos` nomeados. `avisoErro` lê os dois ANTES de cair na
     frase genérica — e recebe, opcional, QUEM refaz a ação depois de
     resolver (`contexto.repetir`). */
  let ultimosAvisosMaterialize = [];
  /* 🔴 REFAZER DEPOIS NÃO PODE FICAR PRESO NA MESMA TRAVA. "Forçar
     cancelamento e puxar" e "Liberar hoje" prometem refazer o montar/iniciar
     sozinhos — e refazer é outro gesto, com a MESMA `comTrava` por dentro.
     Chamado ainda DENTRO da trava do gesto que abriu o portão, ele veria
     `ocupado=true` e morreria calado — o toque mudo que esta casa já matou
     uma vez (ver a nota do `comTrava`, acima). `depoisDaTrava` espera a
     trava soltar (o `.then()` só corre depois do `finally` de `comTrava`) e
     só chama `depois` quando `fn` terminou OK. */
  const depoisDaTrava = (fn, depois) => {
    comTravaFila(fn).then((sucesso) => {
      if (sucesso && typeof depois === 'function') depois();
    });
  };
  const avisoErro = (e, contexto) => {
    const body = (e && e.body) || null;
    const code = String((body && body.code) || '');
    if (code === 'ROTA_DE_OUTRO_MOTORISTA') return portaoOutroMotorista(body);
    if (code === 'ASSENTOS_ESGOTADOS') {
      const repetir = contexto && typeof contexto.repetir === 'function' ? contexto.repetir : null;
      return portaoAssentosEsgotados(body, repetir);
    }
    const msg = humano(e);
    // A MESMA frase genérica ("Nenhuma entrega aberta") vira RECADO NOMEADO
    // quando o materialize DESTA tentativa guardou por quem ela passou vazia.
    if (/Nenhuma entrega aberta/i.test(msg) && ultimosAvisosMaterialize.length) {
      return portaoAvisosMaterialize(ultimosAvisosMaterialize);
    }
    if (typeof window.portao === 'function') {
      window.portao({ tom: 'trava', ico: 'alert', titulo: 'Não deu certo', sub: msg, acoes: [['Fechar', '']] });
    }
  };
  const hojeISO = () => diaOperacional();

  /* 🔴 A CONFIRMAÇÃO PADRÃO DA CASA, NUM LUGAR SÓ (10/08) — o mesmo "Tem
     certeza que deseja cancelar? Não/Sim" que o Cancelar já usava (lei do
     dono, 29/07) passa a ser também o "Forçar cancelamento e puxar" do 409
     de outro motorista. `depoisDaTrava`, não `comTrava` direto: este é o
     "Sim" de um portão — ele FECHA no toque, então toque descartado por app
     ocupado não tem repeteco, e `depois` só roda DEPOIS que a trava soltou
     e a limpeza deu certo. Confirma, limpa o dia no servidor, esquece a
     rota carregada deste lado do fio (a fita, a geometria, a lista — ANTES
     do `carregarRota`, senão o repinte passaria com a rota morta ainda
     desenhada), recarrega — e só então `depois` decide o que vem: sair pra
     Rota (o Cancelar) ou remontar sozinho (o Forçar). */
  function confirmarLimparDia(depois) {
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'close', titulo: 'Tem certeza que deseja cancelar?',
      acoes: [['Não', ''], ['Sim', 'principal']], classe: 'duas', perigo: true,
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => depoisDaTrava(async () => {
      if (!rotaRefAtual) {
        avisoErro(new Error('Atualize a rota antes de cancelar.'));
        return false;
      }
      if (!(await filaOfflinePronta())) return false;
      try { await window.API.post('/logistica/rota/continuidade/cancelar', { ref: rotaRefAtual }); }
      catch (e) { avisoErro(e); return false; }
      esquecerRotaCarregada();
      await carregarRota();
      return true;
    }, depois), { once: true });
  }

  /* 409 ROTA_DE_OUTRO_MOTORISTA — fala quem montou e oferece o handoff exato.
     Nada é apagado: só as paradas abertas do dono/data informados no conflito
     podem mudar de mãos. */
  function portaoOutroMotorista(body) {
    if (typeof window.portao !== 'function') return;
    const podeForcar = !!(body && body.podeForcar);
    const sub = String((body && body.message) || 'Essa rota já foi montada por outro motorista.');
    if (!podeForcar) {
      window.portao({ tom: 'trava', ico: 'alert', titulo: 'Rota já montada', sub, acoes: [['Fechar', '']] });
      return;
    }
    window.portao({
      tom: 'trava', ico: 'alert', titulo: 'Rota já montada', sub,
      acoes: [['Fechar', ''], ['Puxar rota', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', async () => {
      let resp;
      try { resp = await window.API.get('/logistica/rota/continuidade'); } catch (e) { return avisoErro(e); }
      const ids = new Set((Array.isArray(body && body.montadores) ? body.montadores : [])
        .map((m) => Number(m && m.userId)).filter((id) => id > 0));
      const data = String((body && body.date) || hojeISO());
      const alvo = (resp && Array.isArray(resp.items) ? resp.items : []).find((p) => p && p.canPull
        && ids.has(Number(p.owner && p.owner.id)) && String(p.date || '') === data);
      if (!alvo) return avisoErro(new Error('Não há paradas abertas e transferíveis nesta rota.'));
      puxarRotaPendente({ dataset: { ref: String(alvo.ref), owner: String(alvo.owner && alvo.owner.id || '') } });
    }, { once: true });
  }

  /* 🔴 402 ASSENTOS_ESGOTADOS — mesma língua: o corpo é a frase do servidor,
     e a única ação (comprar o passe do dia) só nasce quando ele autoriza
     (`podeComprarPasse`). Comprado, refaz a AÇÃO ORIGINAL — montar ou
     iniciar, quem chamou decide (`repetir`, vindo do `contexto` do
     `avisoErro`). */
  function portaoAssentosEsgotados(body, repetir) {
    if (typeof window.portao !== 'function') return;
    const podeComprar = !!(body && body.podeComprarPasse);
    const sub = String((body && body.message) || 'Assentos esgotados hoje.');
    if (!podeComprar) {
      window.portao({ tom: 'trava', ico: 'card', titulo: 'Assentos esgotados', sub, acoes: [['Fechar', '']] });
      return;
    }
    const n = Number(body && body.passeCreditos);
    const rotulo = `Liberar hoje (${Number.isFinite(n) ? String(n).replace('.', ',') : '0'} créditos)`;
    window.portao({
      tom: 'trava', ico: 'card', titulo: 'Assentos esgotados', sub,
      acoes: [['Fechar', ''], [rotulo, 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => depoisDaTrava(async () => {
      try { await window.API.post('/logistica/rota/passe-do-dia', {}); } catch (e) { avisoErro(e); return false; }
      return true;
    }, repetir), { once: true });
  }

  /* 🔴 O RECADO NOMEADO DO DIA VAZIO (10/08 — a madrugada que travou o dono:
     "Nenhuma entrega aberta neste dia" na cara de quem só precisava saber
     QUEM ficou de fora e por quê). Quando o materialize DESTA tentativa
     guardou avisos, eles trocam de lugar com a frase genérica: até 5, um
     por linha, no `corpo` do portão (não no `sub` — é lista, não frase). */
  function portaoAvisosMaterialize(avisos) {
    if (typeof window.portao !== 'function') return;
    const linhas = avisos.slice(0, 5).map((a) => esc(a));
    window.portao({
      tom: 'trava', ico: 'alert', titulo: 'Não deu certo',
      sub: 'Ninguém entrou na rota:', corpo: linhas.join('<br>'), acoes: [['Fechar', '']],
    });
  }

  /* 🔴 O PONTO DE PARTIDA DA ROTA É ONDE O MOTORISTA ESTÁ — e o app nunca
     mandava (dono, 08/08: "já carregar montado pelo GPS").
     O servidor SEMPRE soube receber isto: `origemLat/origemLng` está no
     PlanejarRotaDto ("GPS do entregador (ponto de partida)"), no ConferirRotaDto,
     no IniciarRotaDto e no prepare do admin. Sem ele, `coordFromInput` devolve
     null e o `nearestNeighbor` faz o que está escrito no próprio código: "sem
     origem: a 1ª parada da LISTA é o ponto de partida" — ou seja, a rota nascia
     encadeada a partir de um cliente sorteado pela varredura do banco, com o
     carro do motorista em outro bairro. Este objeto é o conserto inteiro.

     Vai nos QUATRO caminhos que rodam o motor, e não em um só: planejar (montar),
     conferir (o semáforo roda o MESMO motor em dry-run — origem diferente daria
     um aviso sobre uma rota que não é a montada), prepare (o dia puxado pra hoje)
     e iniciar — que RE-PLANEJA ("re-planeja a partir da origem atual"). Faltando
     no iniciar, a ordem que ele acabou de ver na montagem seria reescrita no
     toque seguinte, e o motorista sairia com uma sequência que ninguém mostrou.
     Sem fix, o objeto é VAZIO e tudo volta a ser exatamente o que era. */
  const origemGps = () => (ultimaPos ? { origemLat: ultimaPos.lat, origemLng: ultimaPos.lng } : {});

  /* ------------------------------------------------------------------------
     🔴 A ORDEM É DO OTIMIZADOR — SALVO QUANDO GENTE DECIDE (dono, 08/08).

     A regra tem duas metades, e a 1ª versão desta seção errou por só ter uma:
       · SEM decisão humana → quem ordena é o servidor, a partir do GPS. Ele
         roda no montar e RE-RODA no iniciar ("re-planeja a partir da origem
         atual"), que é justamente o que o dono quer: a rota sai encadeada de
         onde ele está NA HORA DE SAIR, não de onde ele estava ao montar.
       · COM decisão humana → arrasto do dedo ou um ESPAÇO escolhido. Aí a
         sequência é dele e o motor não tem o direito de refazê-la: entra o
         `ordemManual` ("os ids recebem rotaOrdem NA ORDEM DADA e o motor pula
         o NN+2-opt"), o mesmo contrato que o Gerenciador do desktop usa.

     Mandar `ordemManual` SEMPRE — como esta seção fazia — é desligar o
     otimizador com outro nome. Ele volta a mandar por padrão.

     💰 Re-planejar o mesmo conjunto não cria parada nem debita (claim único por
     empresa+motorista+data+bloco).
     ------------------------------------------------------------------------ */

  /** o dedo ou um espaço mandaram nesta lista? então a ordem é DELES */
  const ordemDeGente = () => previaDoDedo || modoSel !== 'dist';

  /* ⚰️ `pularMontarAoAbrir` morreu em 10/08 junto com o auto-montar da entrada
     (a chave existia só pra proteger a decisão humana DELE — sem o mecanismo,
     a proteção é a regra geral: entrar não grava nada). Chave morta varrida no
     mesmo commit, pela lei da casa. */

  /* Casa a lista da tela (clientes) com as entregas do dia (ids) e devolve a
     sequência em ids — o formato que o servidor entende. O elo é o CLIENTE:
     mesmo cliente com duas portas vira duas entregas, consumidas na ordem em
     que aparecem. Entrega fora da tela não se perde: vai pro fim, explícita.
     `null` = não deu pra casar, e aí ninguém crava nada. */
  function idsNaOrdemDaTela() {
    if (!ENTREGAS.size || !PREVIA.length) return null;
    const porCliente = new Map();
    ENTREGAS.forEach((e, id) => {
      const cid = String((e && e.item && e.item.cliente && e.item.cliente.id) || '');
      if (!cid) return;
      const fila = porCliente.get(cid);
      if (fila) fila.push(String(id));
      else porCliente.set(cid, [String(id)]);
    });
    const ids = [];
    PREVIA.forEach((p) => {
      const fila = porCliente.get(String((p && p.customerProfileId) || ''));
      if (fila && fila.length) ids.push(fila.shift());
    });
    if (ids.length < 2) return null;
    const atual = [...ENTREGAS.keys()].map(String);

    return ids.concat(atual.filter((id) => ids.indexOf(id) < 0));
  }

  /* O RECORTE DA ROTA AVULSA: os ids de entrega de quem está NA TELA — e só
     deles. Mesmo casamento por cliente do `idsNaOrdemDaTela`, com duas
     diferenças de propósito: só entrega ABERTA entra (cancelada com ordem vive
     em ENTREGAS pra lista, mas não sai pra rua), e não existe piso de 2 nem
     rabo com o resto do dia — o resto do dia é exatamente o que a avulsa
     deixou de fora. */
  function idsDaPrevia() {
    if (!ENTREGAS.size || !PREVIA.length) return null;
    const porCliente = new Map();
    ENTREGAS.forEach((e, id) => {
      const st = String((e && e.item && e.item.status) || '');
      if (st === 'entregue' || st === 'cancelada') return;
      const cid = String((e && e.item && e.item.cliente && e.item.cliente.id) || '');
      if (!cid) return;
      const fila = porCliente.get(cid);
      if (fila) fila.push(String(id));
      else porCliente.set(cid, [String(id)]);
    });
    const ids = [];
    PREVIA.forEach((p) => {
      const fila = porCliente.get(String((p && p.customerProfileId) || ''));
      if (fila && fila.length) ids.push(fila.shift());
    });
    return ids;
  }

  /* Crava no servidor a ordem que a gente decidiu. Só é chamada quando
     `ordemDeGente()` — em modo Distância isto NUNCA roda, e o otimizador segue
     dono da sequência. Devolve false só quando tentou e o servidor recusou. */
  async function cravarOrdemDaTela() {
    const alvo = idsNaOrdemDaTela();
    if (!alvo) return true;
    if (alvo.join('|') === [...ENTREGAS.keys()].map(String).join('|')) return true;
    try {
      await window.API.post('/logistica/rota/planejar', {
        date: hojeISO(), ordemManual: alvo, ...origemGps(),
      });
    } catch (_) {
      return false;
    }
    await carregarRota();
    return true;
  }

  /* ------------------------------------------------------------------------
     O RASCUNHO VIRA ENTREGA — e este é o ÚNICO lugar onde isso acontece.

     Três chamadores, todos com o dedo do dono em cima: "Salvar rota", "Montar
     rota" e "Iniciar rota". Um lugar só de propósito: enquanto criar a parada
     morava dentro da porta de escolher gente, escolher e gravar eram a mesma
     coisa — que é o defeito inteiro que esta frente mata.

     🔴 UMA DE CADA VEZ, e não `Promise.all`: cinco POSTs em paralelo disputam a
     mesma rota no servidor, e o que eu ganharia em segundos eu perderia em não
     saber QUEM entrou quando um falha. Aqui a falha é por NOME (mesma lei da
     porta "Meus clientes", de onde este laço veio).

     🔴 RESPEITA O QUE JÁ EXISTE: quem já tem parada aberta hoje não nasce de
     novo (a mesma porta não entra 2× na rota do dia), e `paraMinhaRota` continua
     sendo o que dá MOTORISTA à entrega — sem ele o Iniciar recusa o dia inteiro.

     O rascunho sai da memória ANTES dos POSTs (`splice`): se a rede cair no
     meio, o que entrou está no servidor e o que não entrou é dito por nome —
     segurar a lista aqui faria o toque seguinte tentar criar tudo de novo.
     ------------------------------------------------------------------------ */
  async function materializarRascunho() {
    if (!RASCUNHO.length) return { falharam: [], entraram: 0 };
    const fila = RASCUNHO.splice(0, RASCUNHO.length);
    const falharam = [];
    let entraram = 0;
    for (const c of fila) {
      if (paradaAbertaDaConta(String(c.id))) continue;
      try {
        await window.API.post('/logistica/entregas', {
          customerProfileId: String(c.id),
          /* 🔴 A PORTA VIAJA JUNTO (09/08). Sem `localId` a entrega nasce no
             ENDEREÇO DO PERFIL mesmo quando o rascunho sabe de qual porta o
             dia veio — reutilizar um dia do histórico mandava o motorista pra
             porta errada com a lista dizendo a certa. O DTO já aceita o campo
             e o servidor valida que o local é do mesmo cliente+empresa. */
          ...(c.localId ? { localId: String(c.localId) } : {}),
          quantidade: 1,
          scheduledAt: `${hojeISO()}T12:00:00.000Z`,
          paraMinhaRota: true,
        });
        entraram += 1;
      } catch (_) { falharam.push(c.nome || 'Cliente'); }
    }
    // A rota é relida ANTES de quem chamou seguir: é dela que sai a lista de
    // abertas que o planejar vai ordenar.
    if (entraram) await carregarRota();
    publicarMontarDias();      // o chip de HOJE pode ter mudado de fonte
    return { falharam, entraram };
  }

  /** monta a rota do dia: planeja (grava a ordem) e confere (semáforo). */
  /* 🔴 MONTAR TEM QUE MATERIALIZAR A AGENDA — o app novo não tinha ESTA porta
     (10/08, madrugada em que o dono ficou preso). O `planejar` só ORDENA o que
     existe; quem CRIA a entrega do dia a partir da agenda é o
     `materializeForRoute` do servidor, e no app novo ninguém o chamava: o
     app velho falava `/logistica/gerar-dia` via mobile-contract.js, que morreu
     na fusão sem herdeiro (o padrão "capacidade viva, fio cortado"). Sobrava o
     cron de 1×/dia — e um `limpar-dia` às 00:44 deixou a segunda-feira com
     102 canceladas e ZERO abertas, com a tela mostrando a prévia da agenda e o
     Iniciar respondendo "Nenhuma entrega aberta neste dia. Monte a rota antes
     de iniciar" — monte COMO, se nenhum botão materializava?
     A porta já existia no servidor E na allowlist do Kotlin
     (`POST /logistica/mobile/materialize`); é idempotente (gerar o mesmo dia
     2× cria uma vez) e ainda puxa a vassoura dos dias anteriores
     (`encerrarDiasAnteriores`), que o cron pula.
     Falhar aqui NÃO derruba o montar: o planejar segue ordenando o que já
     existe — o dia normal (entregas já criadas) nunca fica refém desta ida. */
  async function materializarDia() {
    try {
      const resp = await window.API.post('/logistica/mobile/materialize', {
        operationalDate: hojeISO(), sourceDates: [hojeISO()],
      });
      const avisos = Array.isArray(resp && resp.avisos) ? resp.avisos.map(String) : [];
      // 🔴 O ESTADO FICA GUARDADO PRA QUEM VIER DEPOIS (`avisoErro`, 10/08): se
      // o planejar/custo-preview seguinte morrer em "Nenhuma entrega aberta",
      // é ESTE recado — nomeado, cliente a cliente — que substitui a frase
      // genérica no portão de erro.
      ultimosAvisosMaterialize = avisos;
      return {
        ok: true,
        criadas: Number((resp && resp.criadas) || 0),
        puladas: Number((resp && resp.puladas) || 0),
        avisos,
      };
    } catch (_) {
      ultimosAvisosMaterialize = [];
      return { ok: false, criadas: 0, puladas: 0, avisos: [] };
    }
  }

  /* ------------------------------------------------------------------------
     🔴 O DIA ESCOLHIDO ENTREGA HOJE (dono, 10/08) — e este é o único lugar onde
     a lista de outro dia vira trabalho de verdade.

     `montarDia > 0` e não é hoje: a tela está mostrando a gente de outra
     data. Montar/Iniciar então fazem exatamente o que fariam com o dedo: a
     lista da tela vira RASCUNHO e o rascunho vira entrega DE HOJE, pela mesma
     porta de sempre (`materializarRascunho`). Nada de dia futuro, nada de
     `prepare`, nenhum portão pedindo pra ele voltar quarta-feira.

     A BAGAGEM INTEIRA VIAJA — a mesma do `usarHistorico`, e pelo mesmo motivo:
     o que sai daqui senta no MESMO cartão da linha da agenda e é lido pela
     MESMA régua (`localId` pra nascer na porta certa, `enderecoLinha` do
     servidor, pino pela régua única, `resolveSozinho` pra não gritar "não sei
     onde fica" em cliente com porta marcada).

     Quem JÁ tem parada aberta hoje não nasce de novo — e não sai da conta: o
     recorte é medido por CLIENTE (`idsDaPrevia`), então ele continua na rota,
     com a entrega que já existia. É o caso do cliente que entrega na segunda e
     na quarta com o cron já tendo criado a de hoje.
     ------------------------------------------------------------------------ */
  const diaDeOutroDia = () => montarDia > 0 && montarDia !== diaDaSemana();

  function previaViraRascunho() {
    const fonte = Array.isArray(previaCrua) ? previaCrua : [];
    const jaNoRascunho = new Set(RASCUNHO.map((c) => chaveDaPorta(c.id, c.localId)));
    let novos = 0;
    fonte.forEach((c) => {
      const id = String((c && c.customerProfileId) || '');
      const porta = chaveDaPorta(id, c && c.localId);
      if (!id || jaNoRascunho.has(porta) || paradaAbertaDaConta(id)) return;
      jaNoRascunho.add(porta);
      RASCUNHO.push({
        id,
        ...(c.localId ? { localId: String(c.localId) } : {}),
        nome: String(c.nome || 'Cliente'),
        enderecoLinha: String(c.enderecoLinha || ''),
        bairro: String(c.bairro || c.cidade || ''),
        ...(pinoValido(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : {}),
        resolveSozinho: !!c.resolveSozinho,
        // "Ult. Registro" (12/08): a prévia já traz o campo — perdê-lo aqui faria
        // o MESMO cartão trocar a data por "Pendente" só por virar rascunho.
        ...(c.ultimaEntregaAt ? { ultimaEntregaAt: String(c.ultimaEntregaAt) } : {}),
      });
      novos += 1;
    });
    return novos;
  }

  async function montarRota() {
    await comTrava(async () => {
      // Cada tentativa começa com a memória limpa: avisos de uma volta
      // anterior não podem vazar pro portão de erro desta (ver `avisoErro`).
      ultimosAvisosMaterialize = [];
      // O dia escolhido no chip entra como escolha de GENTE (ver
      // `previaViraRascunho`): a lista da tela vira rascunho antes de tudo.
      const outroDia = diaDeOutroDia();
      if (outroDia) previaViraRascunho();
      // O rascunho vira parada ANTES de planejar: planejar ordena o que EXISTE,
      // e o que só está no aparelho não existe pro servidor.
      const mat = await materializarRascunho();
      // 🔴 TOQUE MUDO É DEFEITO — mas o recibo é do BOTÃO, não da tela inteira.
      // Montar são 3 idas ao servidor (planejar, conferir, recarregar) e passa
      // de 2 s. O sinal disto era `estadoRota='carregando'`, e ele mentia nas
      // duas telas: na Rota trocava tudo pelo esqueleto — que vai SEM rodapé,
      // então o botão sumia no meio do próprio toque; na Montagem não mudava
      // nada (ela não lê `estadoRota`), só repintava. Agora quem responde ao
      // dedo é o botão tocado, no lugar dele: "Montando…", sem aceitar toque.
      const montando = (v) => {
        try { window.usarDados('rota', { montando: v }); } catch (_) { /* sem seam */ }
      };
      /* a ETAPA do véu de montar (11/08 — dono: "coloque um carregando aí,
         altíssima qualidade"): o texto é o passo REAL do trabalho, não teatro
         de relógio. Escreve DIRETO no nó (regra do `data-vivo` do velocímetro
         — o que anda rápido não repinta a tela) e espelha no seam sem
         repintar, pro repinte que chegar no meio renascer com a etapa certa. */
      const etapa = (pct, texto) => {
        try {
          if (typeof DADOS !== 'undefined' && DADOS.rota) Object.assign(DADOS.rota, { etapaMontar: texto, etapaMontarPct: pct });
          const rotulo = naCamada('[data-etapa-montar]');
          if (rotulo && rotulo.textContent !== texto) rotulo.textContent = texto;
          const barra = naCamada('[data-barra-montar]');
          if (barra) barra.style.width = pct + '%';
        } catch (_) { /* o véu é enfeite; a rota não depende dele */ }
      };
      montando(1);
      etapa(8, 'Organizando as paradas…');
      const devolverEstado = () => montando(0);

      /* 🔴 A ROTA SAI COM O QUE ESTÁ NA TELA — o RECORTE (`deliveryIds`) é a
         mesma lei da rota avulsa (10/08): com um dia de outra data na tela, a
         agenda de HOJE que o cron já materializou não pode ser varrida pra
         dentro da rota que o dono acabou de escolher. Ele lê a tela, e a tela
         mostra a quarta-feira.
         O recorte é medido DEPOIS do `materializarRascunho` de propósito: é lá
         que as entregas de hoje nascem, e `idsDaPrevia` casa a lista da tela
         com elas. */
      const recorte = outroDia ? { deliveryIds: idsDaPrevia() || [] } : {};
      let plano;
      try {
        // A agenda do dia vira entrega ANTES de ordenar (ver `materializarDia`).
        // Nunca na avulsa nem com o dia de outra data: nos dois a agenda de hoje
        // ficou de fora de propósito — trazê-la de volta é encher a rota com
        // gente que a tela não está mostrando.
        if (montarDia !== -1 && !outroDia) await materializarDia();
        etapa(38, 'Calculando o melhor trajeto…');
        plano = await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...recorte, ...origemGps() });
      } catch (e) { devolverEstado(); return avisoErro(e, { repetir: () => montarRota() }); }
      const paradas = Array.isArray(plano && plano.stops) ? plano.stops
        : (Array.isArray(plano && plano.items) ? plano.items
          : (Array.isArray(plano && plano.paradas) ? plano.paradas : []));

      // semáforo dos endereços: só ATRASA a montagem se o servidor acusar algo.
      // Confere HOJE, sempre: o dia da rota é hoje mesmo quando a gente dela
      // veio de outra data (é a lei do chip — ver `diaDeOutroDia`).
      let conf = null;
      try {
        etapa(66, 'Conferindo os endereços…');
        conf = await window.API.post('/logistica/rota/conferir', { date: hojeISO(), ...origemGps() });
      } catch (_) { /* aviso é enfeite, não portão */ }
      const comAviso = conf && Array.isArray(conf.items)
        ? conf.items.filter((i) => Array.isArray(i.motivosVisiveis) && i.motivosVisiveis.length).length
        : 0;

      /* 🔴 O CHIP FICA ACESO, E ISSO É O CONSERTO (10/08). Aqui a escolha de dia
         era APAGADA (`montarDia = -1`) porque o dia tinha sido montado noutra
         data — a lista de hoje era outra coisa, e o chip aceso mentiria.
         Agora a lista da tela É a rota que acabou de nascer: apagar o dia
         trocaria a lista debaixo do dedo dele, e o pé diria "Iniciar" sobre uma
         lista que não é a que ele montou. Quem solta o dia continua sendo o
         gesto de soltar (`soltarDia`) e o Iniciar, quando a rota já saiu. */
      // 🔴 SÓ ABRE A MONTAGEM SE A ROTA ENTROU. Com o `/logistica/rota` no chão
      // o `carregarRota` volta no catch antes de escrever no seam, e a tela de
      // montagem abria com as 6 paradas do desenho e "R$ 336,00" — dinheiro de
      // exemplo numa tela de decisão. Falhou, avisa e fica onde está.
      etapa(88, 'Trazendo a rota…');
      if (!(await carregarRota())) {
        devolverEstado();
        return avisoErro(new Error('Não consegui montar agora. Tente de novo.'));
      }
      /* 🔴 O ARRASTO E O ESPAÇO SOBREVIVEM AO MONTAR. Sem esta linha o motorista
         arrastava, mandava montar, e o otimizador devolvia a ordem DELE por
         cima — o gesto virava enfeite. Em modo Distância isto nem roda: lá a
         sequência é do servidor, de propósito. */
      if (ordemDeGente()) await cravarOrdemDaTela();
      /* 🔴 ROTA NOVA REPETE A CENA DA ENTRADA — ordem do dono: *"este efeito se
         repete sempre que uma rota é criada"*. Aqui é só o PEDIDO: quem monta
         está na tela de Montagem, e a cena acontece quando o mapa voltar pra
         frente (ver `atenderCena` no transplante). Cena tocada num palco fora da
         tela é cena que ninguém vê. */
      pedirCena('rota');
      devolverEstado();          // o "Montando…" sai com o dado já na tela
      /* 🔴 UM STATUS SÓ, NA TELA DO MAPA (dono, 11/08: "esse iniciar rota eu
         quero aqui [no mapa], quero um status só, mesma tela") — reverte o
         "Não navega" de 10/08, por ordem dele. Montar POUSA na Rota: a rota
         verde no mapa com o "Iniciar" único, e a cena das ruas pedida acima
         toca no pouso. Só navega quem AINDA está na Montagem — o cabeçalho e
         as abas ficam vivos por cima do véu, e o fim do montar não teleporta
         quem já foi pra outra tela. Os portões abaixo vêm DEPOIS do `ir` de
         propósito: troca de tela fecha portão; nascendo na camada nova eles
         sobrevivem à transição e os repintes os remontam. */
      if (telaAtual() === 'montagem' && typeof window.ir === 'function') window.ir('rota');
      /* Quem não conseguiu virar parada é dito por NOME, e antes do semáforo de
         endereço: "o Alfredo não entrou" vale mais pra quem vai sair pra rua do
         que "2 endereços com aviso". Nunca "não deu certo" — o resto entrou. */
      if (mat.falharam.length && typeof window.portao === 'function') {
        return window.portao({
          tom: 'alerta', ico: 'alert', titulo: 'Rota montada sem todos',
          sub: `Não consegui adicionar: ${mat.falharam.join(', ')}.`,
          acoes: [['Entendi', 'principal']],
        });
      }
      if (comAviso && typeof window.usarDados === 'function') {
        window.usarDados('montagem', { iniciarSub: `${comAviso} com aviso` });
      }
      if (comAviso && typeof window.portao === 'function') {
        window.portao({
          tom: 'alerta', ico: 'gps', titulo: `${comAviso} ${comAviso === 1 ? 'endereço com aviso' : 'endereços com aviso'}`,
          // "Entendi", não "Ver a rota": desde 11/08 o montar já pousa NELA
          sub: 'Dá pra sair assim, mas confira antes.', acoes: [['Entendi', 'principal']],
        });
      }
    });
  }

  /* ------------------------------------------------------------------------
     🔴 A INTENÇÃO VIAJA COMO ARGUMENTO — a porta declara, o verbo obedece
     (10/08). Este era o defeito medido em produção hoje: `iniciarRota` decidia
     se a rota era AVULSA lendo `montarDia`, que é estado da tela MONTAGEM. Só
     que a Montagem abre SEM dia (`montarDia = -1` é o default desde 10/08), e
     esse -1 fica de pé mesmo pra quem nunca abriu a Montagem. Resultado: o
     Iniciar do MAPA, com 51 paradas agendadas no servidor, morria dizendo "A
     rota avulsa está vazia" — com o dia CHEIO do outro lado do fio. E quando a
     Montagem tinha sido aberta antes, era pior: o Iniciar do mapa saía
     RECORTADO pela prévia dela, calado.

     Agora cada porta diz o que quer, e o verbo NUNCA mais lê `montarDia`:

       · `{ escopo: 'dia' }`      — o dia inteiro (o Iniciar do dock do MAPA).
                                    Materializa a agenda, planeja tudo, inicia.
       · `{ escopo: 'avulsa' }`   — só o que está na tela (chip do dia apagado).
       · `{ escopo: 'outroDia' }` — a gente de outra data entregando HOJE.

     Estado de tela morre com a tela: quem lê a prévia e o chip é a MONTAGEM, no
     instante do toque (ver o mapa de ações). Com esta lei a regressão de hoje
     é impossível de escrever.
     ------------------------------------------------------------------------ */
  /** iniciar: mostra o custo REAL e só então cobra. */
  async function iniciarRota(intencao) {
    const escopo = String((intencao && intencao.escopo) || 'dia');
    await comTrava(async () => {
      /* 🔴 O VÉU NASCE ANTES DO PRIMEIRO PEDIDO (13/08). Rota grande pode
         materializar, planejar, consultar custo, iniciar e reler antes de
         abrir o mapa. O botão já acusava o toque, mas a tela inteira parecia
         congelada. Reutilizamos o mesmo véu da montagem e só mudamos a etapa
         REAL; nenhuma regra de rota, ordem ou cobrança mora aqui. */
      let esperaInicioAtiva = true;
      const fecharEsperaInicio = () => {
        if (!esperaInicioAtiva) return;
        esperaInicioAtiva = false;
        try { window.usarDados('rota', { montando: 0 }); } catch (_) { /* sem seam */ }
      };
      const etapaInicio = (pct, texto) => {
        if (!esperaInicioAtiva) return;
        try {
          if (typeof DADOS !== 'undefined' && DADOS.rota) Object.assign(DADOS.rota, { etapaMontar: texto, etapaMontarPct: pct });
          const rotulo = naCamada('[data-etapa-montar]');
          if (rotulo && rotulo.textContent !== texto) rotulo.textContent = texto;
          const barra = naCamada('[data-barra-montar]');
          if (barra) barra.style.width = pct + '%';
        } catch (_) { /* o véu é enfeite; iniciar não depende dele */ }
      };
      const falharInicio = (e, contexto) => {
        fecharEsperaInicio();
        return avisoErro(e, contexto);
      };
      try {
        window.usarDados('rota', {
          montando: 1,
          etapaMontar: 'Preparando a rota…',
          etapaMontarPct: 8,
        });
      } catch (_) { /* sem seam: a rota continua funcionando */ }
      try {
      // Mesma memória limpa do montar: avisos de uma tentativa anterior não
      // podem vazar pro portão de erro desta (ver `avisoErro`).
      ultimosAvisosMaterialize = [];
      /* 🔴 UMA TELA SÓ ⇒ O INICIAR TAMBÉM MONTA (dono: "MONTAR ROTA → MONTAGEM
         DE ROTA (BOTÃO INICIAR)"). O 2º "Montar rota" morreu, então o dia pode
         chegar aqui sem ordem gravada — e o servidor responderia "monte a rota
         antes de iniciar" no toque que devia sair pra rua. Planejar de novo o
         mesmo conjunto não cria parada nem debita. */
      // O dia de outra data vira gente de HOJE antes de tudo — o mesmo gesto do
      // montar (ver `previaViraRascunho`). Quem já é parada aberta é pulado lá,
      // então tocar Iniciar numa lista já montada não cria nada de novo.
      const outroDia = escopo === 'outroDia';
      if (outroDia) previaViraRascunho();
      // O rascunho vira parada ANTES de tudo: é o dedo mandando gravar, e é
      // daqui que sai o conjunto que o planejar vai ordenar e o servidor cobrar.
      etapaInicio(22, 'Organizando as paradas…');
      const mat = await materializarRascunho();
      /* 🔴 A ROTA SAI SÓ COM O QUE ESTÁ NA TELA (dono, 10/08: o chip do dia
         desligado É a rota avulsa; e o chip de OUTRO dia é a gente daquele dia
         entregando hoje). Sem o recorte, o planejar varria as entregas da
         agenda — que o cron já criou no servidor — pra dentro da rota que ele
         acabou de escolher na tela. `deliveryIds` já existe nas três portas
         (planejar, custo-preview, iniciar); aqui ele carrega a tela ao pé da
         letra.
         🔴 QUEM DIZ QUE É AVULSA É A PORTA, nunca o `montarDia` (ver o bloco
         da INTENÇÃO acima): o escopo 'dia' sai INTEIRO, sem recorte nenhum. */
      const avulsa = escopo === 'avulsa';
      const recortada = avulsa || outroDia;
      const idsAvulsa = recortada ? idsDaPrevia() : null;
      if (avulsa && (!idsAvulsa || !idsAvulsa.length)) {
        return falharInicio(new Error('A rota avulsa está vazia. Adicione uma parada antes de iniciar.'));
      }
      const recorte = idsAvulsa && idsAvulsa.length ? { deliveryIds: idsAvulsa } : {};
      if (estadoRota === 'montar' || !ENTREGAS.size || recortada) {
        try {
          // O MESMO remédio do montar: sem materializar, um dia cancelado em
          // massa batia aqui e morria no "Nenhuma entrega aberta neste dia".
          // Na avulsa e no dia de outra data NÃO: materializar traria a agenda
          // de hoje de volta pra tela que mostra outra gente.
          if (!recortada) await materializarDia();
          etapaInicio(42, 'Calculando o melhor trajeto…');
          await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...recorte, ...origemGps() });
        } catch (e) { return falharInicio(e, { repetir: () => iniciarRota(intencao) }); }
        if (!(await carregarRota())) return falharInicio(new Error('Não consegui montar agora. Tente de novo.'));
        if (ordemDeGente()) await cravarOrdemDaTela();
      }
      let custo = null;
      // a data vai JUNTO — sem ela o servidor cobra pelo dia UTC dele (ver a
      // nota no `carregarRota`): das 21h em diante o portão nem abria. E na
      // avulsa o recorte viaja aqui também: o preço tem que ser DESSA rota.
      try {
        etapaInicio(62, 'Conferindo a saída…');
        const qIds = idsAvulsa && idsAvulsa.length ? `&deliveryIds=${encodeURIComponent(idsAvulsa.join(','))}` : '';
        custo = await window.API.get(`/logistica/rota/custo-preview?date=${encodeURIComponent(hojeISO())}${qIds}`);
      } catch (e) { return falharInicio(e, { repetir: () => iniciarRota(intencao) }); }
      // 🔴 NOME DE CAMPO DE DINHEIRO NÃO SE CHUTA. A 1ª versão adivinhou
      // (`custo`/`total`/`creditos`) e a tela mostrou "Debita 0" com o servidor
      // dizendo 4,8 — mentira com cara de app pronto. Estes são os nomes
      // MEDIDOS na resposta, e quem decide se pode sair é o servidor
      // (`saldoCobre`), não uma conta minha na tela.
      const debita = Number(custo && custo.creditosAIniciar);
      const saldo = Number(custo && custo.saldoAtual);
      const temSaldo = custo && typeof custo.saldoCobre === 'boolean'
        ? custo.saldoCobre
        : (isFinite(saldo) && isFinite(debita) ? saldo >= debita : true);
      const num = (v) => (isFinite(v) ? String(v).replace('.', ',') : '');
      /* 🔴 SALDO QUE COBRE NÃO PERGUNTA NADA (dono, 09/08: "apertei iniciar, não
         tem q perguntar nada já inicia").
         O portão "Iniciar a rota? · Debita X · você tem Y" nasceu pra pôr o
         preço na frente da decisão — e ele continua existindo exatamente onde
         DECIDE alguma coisa: sem saldo, é a trava que impede a saída, e trava
         bloqueia por natureza. Com saldo, ele não decidia nada: era um "sim" a
         mais entre o dedo e a rua, na única tela em que o motorista já tinha
         dito o que queria. Um gesto, uma reação.
         O preço não sumiu — ele virou RECIBO, depois, sem travar ninguém (ver o
         `avisar` no fim). E o custo-preview continua sendo consultado, porque é
         ele quem diz se cobre: quem decide se pode sair é o servidor. */
      if (!temSaldo) {
        fecharEsperaInicio();
        return window.portao({
          tom: 'trava', ico: 'card', titulo: 'Créditos insuficientes',
          sub: isFinite(saldo)
            ? `Debita ${num(debita)} · você tem ${num(saldo)}`
            : `Debita ${num(debita)}`,
          acoes: [['Fechar', '']],
        });
      }
      try {
        // 🔴 A RESPOSTA DO INICIAR TEM DADO DENTRO. Ela era descartada, e
        // com ela iam embora as empresas do corredor (`prospector`) que o
        // servidor acabou de embarcar pro dia. Ver `aplicarProspector`.
            /* 🔴 AQUI O OTIMIZADOR TEM A ÚLTIMA PALAVRA — de propósito. O
               iniciar "re-planeja a partir da origem atual": é o único momento
               em que o servidor sabe de ONDE o motorista está saindo de fato
               (montou na base às 7h, saiu às 8h de outro lugar). Por isso NÃO
               vai `ordemManual` no caso comum.
               A exceção é a ordem de gente: arrasto ou espaço escolhido. Aí a
               sequência viaja junto, senão o toque de sair desfaria a decisão
               dele — que foi o defeito que este trecho já teve. */
        const minha = ordemDeGente() ? idsNaOrdemDaTela() : null;
        etapaInicio(82, 'Iniciando a rota…');
        aplicarProspector(await window.API.post('/logistica/rota/iniciar', {
          date: hojeISO(), ...recorte, ...(minha ? { ordemManual: minha } : {}), ...origemGps(),
        }));
      } catch (e) {
        // 🔴 NUNCA MORRER CALADO (dono, §1.3): primeiro a verdade do
        // servidor — se a rota JÁ ESTÁ em andamento, a resposta certa é
        // levar o motorista pra ela, não um erro genérico.
        await carregarRota();
        if (estadoRota === 'rodando' || estadoRota === 'pausada') {
          // Já está em andamento? Cai direto NELA — a navegação, não uma tela
          // intermediária com mais um botão (a mesma lei do sucesso, abaixo).
          fecharEsperaInicio();
          if (typeof window.ir === 'function') window.ir('mapa');
          return;
        }
        return falharInicio(e, { repetir: () => iniciarRota(intencao) });
      }
      etapaInicio(94, 'Abrindo a navegação…');
      await carregarRota();
      // A escolha de dia morre no Iniciar: a rota (avulsa ou com a gente de
      // outra data) virou A rota em andamento, e a Montagem seguinte volta a
      // abrir sem dia — o estado em que ela nasce desde 10/08.
      // Só o escopo recortado chega aqui, e recortado só vem da MONTAGEM: é
      // limpeza da tela que mandou, nunca leitura de estado alheio (o dock do
      // mapa manda 'dia' e não encosta no chip de ninguém).
      if (recortada) { montarDia = -1; window.usarDados('montagem', { diaSel: -1 }); }
      /* 🔴 ROTA NOVA, RECIBO NOVO (12/08). A marca de "já mostrei o fim deste
         dia" (ver `irDepoisDoDesfecho`) é carimbada pelo DIA, e o mesmo dia
         pode ter uma 2ª leva — o servidor devolve `operationalEndedAt` pra
         null justamente pra isso. Sem apagar aqui, quem sai pra rua de novo
         terminaria a 2ª rota no mapa mudo, com o app achando que já tinha
         avisado. Quem abre a rota é quem limpa o fim dela. */
      try { window.HBX.cache.remove(`fim-visto:${hojeISO()}`); } catch (_) { /* sem cache: nada a limpar */ }
      /* 🔴 INICIAR É UM GESTO SÓ (dono, 10/08: "clico em iniciar, o botão muda
         para navegar NÃO QUERO — é iniciar de uma vez só, ou navegar de uma vez
         só"). Antes o toque deixava o motorista na tela Rota com o dock
         morfado pra "Navegar" — um segundo toque pra fazer o que ele acabou de
         mandar. Agora o Iniciar entra DIRETO na navegação (a mesma porta do
         botão Navegar: `ir('mapa')` cobra GPS na hora certa e toca a descida
         2D→3D). O "Sair" do 3D continua devolvendo pra Rota com o dock
         Navegar·Cancelar·Finalizar — sair de propósito é outro verbo. */
      fecharEsperaInicio();
      if (typeof window.ir === 'function') window.ir('mapa');
      /* 🔴 O RECIBO FALA DEPOIS QUE A TELA PAROU DE SE PINTAR (mesma armadilha
         que o portão da parada avulsa já pagou, 09/08). `avisar` monta na camada
         VIVA, e o `carregarRota` acima repinta: falar antes é falar pra uma
         camada que já morreu. Navega, espera o dado, e só então fala.
         🔴 DÉBITO ZERO NÃO VIRA AVISO NENHUM. Recibo de coisa que não aconteceu
         é ruído na cara de quem está saindo pra rua — e no modo free (ou com a
         franquia do plano cobrindo o dia) o débito é 0 de verdade.
         Quem falhou em virar parada é dito aqui também: o dono mandou iniciar e
         tem o direito de saber que saiu sem o Alfredo. */
      if (typeof window.avisar === 'function') {
        if (mat.falharam.length) {
          window.avisar({
            ico: 'alert', cls: 'alerta', titulo: 'Rota iniciada sem todos',
            sub: `Ficou de fora: ${mat.falharam.join(', ')}`,
          });
        } else if (isFinite(debita) && debita > 0) {
          window.avisar({ ico: 'card', cls: 'ok', titulo: 'Rota iniciada', sub: `Debitou ${num(debita)}` });
        }
      }
      } finally {
        fecharEsperaInicio();
      }
    });
  }

  /* ------------------------------------------------------------------------
     🔴 CANCELAR É CANCELAR — UM VERBO SÓ (lei do dono, 29/07; regressão que a
     fusão trouxe de volta e ele pegou ao vivo em 09/08: "estou apertando
     Cancelar, eu clico em montar rota, os clientes voltam!!!").

     Eu tinha apontado este botão pro `rota/encerrar` — o verbo do "guarda o
     resto pra depois": ele devolve as entregas abertas VIVAS ('agendada'). E
     abrir a Montagem chama `rota/planejar`, que lê justamente as entregas
     ABERTAS do dia. Então o ciclo se fechava sozinho: cancelo → as entregas
     ficam vivas → monto → o planejador acha as mesmas → os clientes voltam. O
     botão nunca cancelou nada; ele DESMONTAVA.

     O verbo certo já existia inteiro do outro lado do fio, e até na allowlist
     do Kotlin: `POST /logistica/rota/limpar-dia`. Só faltava alguém chamar —
     o mesmo padrão de sempre desta fusão (a capacidade viva, o chamador morto
     junto com o `app.js`). Ele mata o que não foi feito ('cancelada'), não
     encosta no que já foi entregue, solta o motorista da entrega morta e —
     detalhe que só o `limpar-dia` faz — DESFAZ a ocorrência recorrente, isto é,
     devolve o `proximaData` do plano; sem isso o dia virava pedra (o FIX 25/07
     dele).

     Palavras do dono na lei: "eu bati a porra do caminhão, não vai ter entrega,
     limpa pendência". E a pergunta é a mesma em todo caminho destrutivo:
     "Tem certeza que deseja cancelar?" → Não / Sim. Sem parágrafo, sem 3º
     botão, sem resumo — por isso a legenda saiu (ela ainda dizia "voltam pra
     agenda", que era verdade do `encerrar` e vira MENTIRA aqui).

     `perigo` continua (09/08): o "Sim" é vermelho. Vestido do verde do
     "Iniciar", no mesmo lugar da tela, ele me fez encerrar a rota do dono três
     vezes sem querer — provado no log do servidor.
     ------------------------------------------------------------------------ */

  /* 🔴 CANCELOU? O APARELHO NÃO GUARDA CÓPIA (dono, 09/08: "cancelar tem q
     limpar toda a rota já carregada… fica limpinho para montar rota do zero").

     A rota carregada mora em SEIS lugares deste lado do fio, e o `carregarRota`
     só reescreve os dois primeiros — e só se a rede responder. Sem esta faxina
     o dono cancelava e ainda via: a lista da Montagem com os mesmos clientes
     (`previaCrua`/`PREVIA`, que a tela republica sem ir à rede), a folha de
     chegada de uma parada morta (`ENTREGAS`), e o "Salvar rota" oferecendo o
     roteiro que acabou de ser apagado (`PARADAS_SALVAR`).

     O `previaSeq` sobe junto porque a Montagem monta sozinha ao abrir: uma
     busca em VOO no instante do cancelamento voltaria depois e republicaria o
     dia cancelado por cima da tela limpa — resposta velha não escreve.

     E vem tudo ANTES do `carregarRota`: se a rede cair no meio, o servidor já
     cancelou e a tela TEM que estar limpa do mesmo jeito. Rota que sobrevive na
     tela depois do cancelar é a mesma mentira que esta seção existe pra matar. */
  function esquecerRotaCarregada() {
    esquecerTraco();
    // pedido de cena de "rota nova" não sobrevive à rota: cancelada a rota,
    // a cena dela morre junto (senão o próximo repinte a tocava por cima do
    // dia limpo — parente do pisca do cancelar)
    esquecerCenaPedida();
    previaSeq += 1;
    previaCrua = null;
    previaDoDedo = false;
    previaComGps = false;
    previaAlvo = 0;
    PREVIA.length = 0;
    PARADAS_SALVAR.length = 0;
    ENTREGAS.clear();
    if (typeof window.PARADAS !== 'undefined') window.PARADAS = [];
    else try { PARADAS = []; } catch (_) { /* sem seam: nada a fazer */ }
    // `semFonte: false` de propósito: o dia está vazio porque o dono MANDOU
    // esvaziar, não porque a rede caiu — são opostos, e a folha tem uma peça
    // pra cada um. `vazio` vem do mesmo escritor do boot: "nesse dia" sem chip
    // aceso não se refere a dia nenhum.
    if (typeof window.usarDados === 'function') {
      window.usarDados('montagem', {
        carregando: false, semFonte: false, linhas: [], vazio: textoVazio(0), iniciarSub: '',
        somaParadas: '', somaProdutos: '', somaValor: '',
      });
    }
  }

  /* 🔴 A CONFIRMAÇÃO E A LIMPEZA MORAM EM `confirmarLimparDia` (10/08) — o
     mesmo botão "Sim" que o 409 de outro motorista passou a usar no "Forçar
     cancelamento e puxar". Só o DEPOIS muda: aqui é sair pra Rota; lá é
     montar de novo sozinho. */
  async function cancelarRota() {
    confirmarLimparDia(() => { if (typeof window.ir === 'function') window.ir('rota'); });
  }
  /* ------------------------------------------------------------------------
     6b. O DEDO QUE MEXE NA ROTA — reordenar e retirar, gravados DE VERDADE.

     Os dois gestos da lista (arrastar pelo punho, deslizar pra retirar) eram
     só DOM: o `renumerar()` reescrevia os números na tela, ninguém gravava, e
     o primeiro repinte devolvia a ordem do servidor — provado reiniciando o
     app, a ordem arrastada sumia. Gesto que promete e não cumpre é pior que
     gesto que não existe: o motorista sai pra rua confiando numa sequência
     que só existia na tela dele.

     A casca ANUNCIA (`hbx:ordem` / `hbx:retirar`), esta seção GRAVA. Quem
     assume chama `preventDefault()` — é o contrato que faz a casca parar de
     mexer no DOM e esperar o dado real. Sem ponte (mock no navegador)
     ninguém assume e a maquete continua se virando sozinha.
     ------------------------------------------------------------------------ */

  /* Uma fila SÉRIE pros dois gestos: eles mexem na MESMA rota, e dois toques
     rápidos numa rede ruim mandariam duas ordens concorrentes — a última a
     chegar venceria por acaso. Enfileirando, a última ordem do DEDO vence,
     que é a que o motorista está vendo. (O `comTrava` global não serve aqui:
     ele DESCARTA o segundo toque calado, e gesto descartado em silêncio é a
     mesma mentira que esta seção existe pra matar.) */
  let filaRota = Promise.resolve();
  const naFila = (fn) => {
    filaRota = filaRota.then(fn, fn);
    return filaRota;
  };

  /* 🔴 O DEDO MANDOU NA PRÉVIA — e agora o DADO sabe na hora. Antes disto o
     arrasto da montagem vivia só no DOM até o "Montar rota" ler a tela, e
     qualquer repinte no meio o desfazia calado (o fix de GPS que chega da
     garagem é o caso real). Nada vai ao servidor: a entrega ainda não existe.
     Confere tudo antes de aplicar — uma lista de posições torta reescreveria a
     prévia com buraco, e prévia com buraco vira rota com cliente faltando. */
  function reordenarPrevia(idx) {
    if (!Array.isArray(idx) || idx.length < 2) return;
    if (!previaCrua || previaCrua.length !== idx.length) return;
    if (idx.some((n) => !Number.isInteger(n) || n < 0 || n >= previaCrua.length)) return;
    if (new Set(idx).size !== idx.length) return;
    if (!idx.some((n, i) => n !== i)) return;      // soltou no mesmo lugar
    previaCrua = idx.map((n) => previaCrua[n]);
    previaDoDedo = true;
    publicarModos();     // acende o ponto de "editado" no espaço que está aceso
    publicarPrevia();
  }

  /* 🔴 ARRASTOU = "MINHA ORDEM". `ordemManual` é o contrato que já existe no
     servidor (o mesmo que o desktop manda ao arrastar no Gerenciador): os ids
     listados recebem `rotaOrdem` NA ORDEM DADA e o motor pula o NN+2-opt —
     a ordem do motorista não é uma sugestão que o otimizador possa desfazer.
     Sem `deliveryIds`: quem decide o CONJUNTO continua sendo o servidor (as
     abertas do dia); eu só digo a SEQUÊNCIA. Id que ele não conhece (parada
     já entregue, que viaja na lista) é ignorado — medido no teste do
     `planRouteManual`.
     💰 Dinheiro: reordenar não cria parada. O snapshot da rota é append-only
     e o bloco cobrável tem claim ÚNICO por (empresa+motorista+data+bloco),
     então re-planejar o mesmo conjunto não debita nem reconta — inclusive com
     a rota ACTIVE, que é justamente quando o motorista arrasta. */
  document.addEventListener('hbx:ordem', (ev) => {
    if (!temPonte()) return;
    if (continuidadeAtiva) {
      ev.preventDefault();
      return avisoErro(new Error('Esta rota está em modo de consulta. Continue ou puxe antes de alterar a ordem.'));
    }
    // A MONTAGEM fala por POSIÇÃO: lá a entrega ainda não existe, então não há
    // id pra mandar ao servidor — e não há servidor pra chamar. Sai antes.
    if (ev.detail && Array.isArray(ev.detail.previa)) {
      ev.preventDefault();
      return reordenarPrevia(ev.detail.previa.map(Number));
    }
    const ids = ev.detail && Array.isArray(ev.detail.ids) ? ev.detail.ids.map(String).filter(Boolean) : [];
    if (ids.length < 2) return;
    ev.preventDefault();          // eu assumo: a casca não mexe mais na lista
    gestoSujouATela += 1;         // o DOM saiu do que o dado diz: o repinte vale
    naFila(async () => {
      try {
        // A origem entra aqui também: `planRouteManual` não reordena nada (a
        // ordem é a do dedo), mas é ela que dá a PERNA real da 1ª parada — sem
        // origem o trecho até o primeiro cliente sai zerado na tela.
        // A lista inteira vai como conjunto E sequência: escolher o cliente 3
        // não puxa para este planejamento uma parada alheia que entrou no dia
        // por outro aparelho enquanto o motorista tocava no mapa.
        await window.API.post('/logistica/rota/planejar', {
          date: dataDaRotaNaTela(), deliveryIds: ids, ordemManual: ids, ...origemGps(),
        });
      } catch (e) {
        // A tela está mostrando a ordem NOVA e o servidor ficou com a velha.
        // Repintar primeiro DESFAZ a mentira; o aviso vem depois, senão o
        // motorista fecha o alerta e continua olhando pra ordem que não é.
        await carregarRota();
        return avisoErro(e);
      }
      await carregarRota();
    });
  });

  /* 🔴 RETIRAR É CANCELAR — o app tem UM verbo destrutivo só (lei do dono,
     29/07). Não nasce aqui um segundo caminho de exclusão: a parada retirada
     é uma entrega DECIDIDA (ele resolveu não passar lá hoje), e é o
     `entregas/:id/cancelar` que fecha o desfecho, anda o cursor da agenda e
     cancela a cobrança dela — o cliente volta na recorrência dele, intacta.
     O motivo viaja escrito: no extrato fica "Cancelada: retirada da rota pelo
     motorista", que é o que o escritório precisa ler depois pra saber que
     ninguém bateu na porta. */
  document.addEventListener('hbx:retirar', (ev) => {
    if (!temPonte()) return;
    const id = String((ev.detail && ev.detail.id) || '');
    if (!id) return;
    ev.preventDefault();
    gestoSujouATela += 1;         // mesma régua do arrastar: repinte garantido
    naFila(async () => {
      try {
        await window.API.post(`/logistica/entregas/${encodeURIComponent(id)}/cancelar`, {
          motivo: 'retirada da rota pelo motorista',
        });
      } catch (e) {
        // Rede caída NÃO apaga parada: a casca não removeu o cartão (nós
        // assumimos o gesto), então basta repintar pra tela voltar a ser o
        // que o servidor tem — a parada continua lá, viva.
        await carregarRota();
        return avisoErro(e);
      }
      await carregarRota();
    });
  });
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

  function vestirPino(el, p, proximoId) {
    const estado = String(p.mapStatus || '');
    el.classList.remove('is-next', 'is-arrived', 'is-delivered', 'is-failed', 'is-cancelled');
    if (String(p.id) === String(proximoId)) el.classList.add('is-next');
    if (estado === 'delivered' || p.st === 'entregue') el.classList.add('is-delivered');
    else if (estado === 'failed') el.classList.add('is-failed');
    else if (estado === 'cancelled' || p.st === 'cancelada') el.classList.add('is-cancelled');
    else if (estado === 'arrived' || p.chegou) el.classList.add('is-arrived');
    const sinal = el.classList.contains('is-delivered') ? '✓'
      : el.classList.contains('is-failed') ? '!'
        : el.classList.contains('is-cancelled') ? '×' : String(p.n);
    el.textContent = sinal;
    el.dataset.parada = String(p.id || '');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `${p.nome || 'Parada'} · ${sinal === '✓' ? 'entregue' : sinal === '!' ? 'não entregue' : `parada ${p.n}`}`);
    if (!el.__hbxClique) {
      el.__hbxClique = true;
      const abrir = (ev) => {
        ev.stopPropagation();
        const id = String(el.dataset.parada || '');
        if (id) document.dispatchEvent(new CustomEvent('hbx:mapa-parada', { detail: { id } }));
      };
      el.addEventListener('click', abrir);
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') abrir(ev); });
    }
  }

  /** os pinos numerados: só se refaz quando a LISTA muda, não a cada repinte */
  function sincronizarPinos(casa) {
    const paradas = paradasDoMapa();
    const proximo = paradas.find((p) => p.st !== 'entregue' && p.st !== 'cancelada');
    const chave = paradas.map((p) => `${p.id}:${p.n}:${p.mapStatus || ''}:${p.chegou ? 1 : 0}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
    if (chave === casa.chave) return;
    casa.chave = chave;
    /* O pino é reaproveitado pela IDENTIDADE da entrega. O número muda quando
       o motorista escolhe "Ir agora"; casar pelo número trocaria dois clientes
       de marcador e deixaria o ✓ no lugar errado. Derrubar os N e
       recriar os N a cada mudança de lista era pagar N remoções + N nós novos
       + N marcadores re-registrados no maplibre pra trocar, às vezes, UMA
       coordenada. Agora: quem continua, `setLngLat`; quem entrou, nasce; quem
       saiu, sai. */
    const vivos = new Set();
    paradas.forEach((p) => {
      const k = String(p.id);
      vivos.add(k);
      const ja = casa.pinos.get(k);
      if (ja) {
        try { ja.setLngLat([p.lng, p.lat]); } catch (_) { /* mapa saindo de cena */ }
        try { vestirPino(ja.getElement(), p, proximo && proximo.id); } catch (_) {}
        return;
      }
      const pino = document.createElement('div');
      /* A PELE SAIU DO INLINE (Lei 1: nada de cor solta em tela). Era um
         `cssText` com as cores escritas aqui dentro, invisível pro fiscal e
         impossível de trocar junto com o resto da casca. Agora é a classe
         `.map-pino` do mock, que é onde toda peça deste app veste. */
      pino.className = 'map-pino';
      vestirPino(pino, p, proximo && proximo.id);
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

  /* 🔴 CANCELAR ESQUECE O PEDIDO (11/08). O pedido de "rota nova" vive 60 s
     esperando o palco — e o cancelar mata a rota nesse meio tempo. Sem isto,
     o repinte do cancelar cobrava o pedido órfão e a cena de rota nascendo
     tocava por cima de uma rota que acabou de morrer. */
  function esquecerCenaPedida() { cenaPedido = null; }
  /* a sonda da prova (`prova-fluxo-rota`): `cenaPedido` é fechadura de IIFE e
     sem isto a asserção "cancelar não deixa pedido vivo" não teria o que ler.
     Mesmo precedente do `window.HBXRota`. */
  window.HBXCena = { pendente: () => !!cenaPedido };

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

  /* 🔴 VERDE OU AZUL (PROSPECTOR v2, 12/08). A classe `escolhida` vem do
     template, escrita a partir do payload do servidor, e — ao contrário do `on`
     — ela NÃO é mexida pela régua: o prédio é do tipo escolhido o tempo todo,
     desde antes de nascer até depois de passar. Por isso ela pode ser lida
     direto do elemento a qualquer momento, sem o cache que o `aceso` precisa
     (o `on` é apagado pelo `recolherEmpresas`; o `escolhida` não). */
  function empresaEscolhida(el) {
    return el.classList.contains('escolhida');
  }

  /** veste o prédio com o estado da fase — nada aqui pinta, só classifica */
  function vestirFase(el, fase, aceso) {
    el.classList.toggle('no-ar', fase >= 1 && fase < 5);
    el.classList.toggle('nasce', fase >= 1);
    el.classList.toggle('varrendo', fase >= 2);
    /* 🔴 AZUL NUNCA GANHA `on`, mesmo que o servidor erre. As três travas desta
       frente terminam aqui, e esta é a última linha de defesa: o servidor decide
       (`aceso` só cai em escolhida), o seam confirma (`aplicarProspector` faz o
       E lógico) e a régua se recusa a vestir. Um `aceso:true` errado numa azul
       viraria rótulo, halo e convite pra parar o carro — barato demais checar
       uma classe pra deixar isso depender de um só lugar estar certo. */
    el.classList.toggle('on', fase >= 3 && aceso && empresaEscolhida(el));
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
    /* O RAIO-X DESTA PASSADA (ver `window.__hbxProspector` no 00-nucleo). Só
       CONTA aqui e ESCREVE uma vez no fim — nada de log por quadro, que é o
       próprio defeito que a instrumentação veio investigar. `reguaNula` é a
       resposta pra "servidor verde, tela muda": sem rumo ou sem fix a régua não
       decide nada e TODO prédio fica na fase 0, invisível, sem erro nenhum. */
    let contaFase0 = 0;
    alvos.forEach((el) => {
      const lat = Number(el.dataset.lat); const lng = Number(el.dataset.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (naNavegacaoAqui) {
        const fase = faseDaEmpresa(el, lat, lng, regua);
        if (fase === 0) contaFase0 += 1;
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
    // ESCREVER, não imprimir: 4 campos num objeto por passada é ruído zero.
    try {
      const raio = window.__hbxProspector;
      if (raio) {
        raio.noAr = postos.length;
        raio.fase0 = contaFase0;
        raio.reguaNula = naNavegacaoAqui && !regua;
        raio.atualizadoEm = new Date().toISOString();
      }
    } catch (_) { /* instrumentação NUNCA derruba a tela de quem está dirigindo */ }
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
    /* 🔴 O DEDO SÓ MANDA DENTRO DO QUE A PESSOA ESCOLHEU (12/08). AZUL é
       AMBIENTE: ele existe pra rua ter mundo, não pra ser tocado. Sem esta
       guarda, encostar num prédio azul o acenderia — e aí a régua das duas
       cores viraria sugestão, com o gesto abrindo pela lateral exatamente o que
       a escolha da semana fecha. Quem quer caçar outro ramo troca o TIPO nos
       Ajustes; é um toque, e é honesto. */
    const alvo = lista.find((e) => String(e.id) === String(id));
    if (!alvo || !alvo.escolhida) return;
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
    /* 🔴 `arrive` NÃO É MANOBRA (12/08). Ele nunca aparecia porque o fantasma da
       curva anterior ocupava a vaga o trecho inteiro; com a catraca no lugar o
       cursor CHEGA nele — e aí a tela diria "300 m · Você chegou", que é mentira
       com cara de instrução. Chegada não é curva: quem diz que chegou é a tela
       `mapachegou`, e o quanto falta já está no rodapé. Sem manobra, o desenho
       some com o cartão (a Lei do IF) e o motorista vê o mapa — que é o fato. */
    if (tipo === 'arrive') return null;
    if ((tipo === 'roundabout' || tipo === 'rotary') && Number.isFinite(Number(m.exit))) {
      return saida(`na rotatória, pegue a ${Math.trunc(Number(m.exit))}ª saída`, 'nav');
    }
    // a origem não é manobra. Ficava de fora por acaso (não tinha linha na
    // tabela); agora é por escrito, senão um `depart` com modifier cai nas
    // regras de baixo e o app manda virar antes de o motorista sair do lugar.
    if (tipo === 'depart') return null;
    /* 🔴 O RETORNO VINHA COMO "CONTINUE" (12/08). O OSRM manda meia-volta em
       `continue`+`uturn`, e o ramo do `continue` lá embaixo nunca testou o
       modifier: com o roteador mandando VOLTAR, o app dizia "continue na Rua X".
       Isto é pior que manobra fora da tabela — é a tabela mentindo com palavra
       da casa. Vem antes de todo mundo porque `uturn` aparece em vários tipos. */
    if (mod === 'uturn') return saida('faça o retorno', 'nav');
    if (mod === 'slight left') return saida('mantenha-se à esquerda', 'curvaEsquerda');
    if (mod === 'slight right') return saida('mantenha-se à direita', 'curvaDireita');
    /* 🔴 O T DA ESQUINA NÃO TINHA PALAVRA. `end of road` é o que o OSRM manda em
       toda rua que morre em outra — pão de cada dia na grade de Rio Claro — e
       ele caía no `return null` lá embaixo: o passo sumia e o cartão anunciava a
       curva DEPOIS do T. `sharp` é a mesma dobra, mais fechada. As palavras são
       as que já estavam na tabela: o que faltava era a manobra chegar nelas. */
    const dobra = tipo === 'turn' || tipo === 'end of road';
    if (dobra && (mod === 'left' || mod === 'sharp left')) return saida('vire à esquerda', 'curvaEsquerda');
    if (dobra && (mod === 'right' || mod === 'sharp right')) return saida('vire à direita', 'curvaDireita');
    // entrar numa via que já corre: o gesto é ENTRAR, não virar (aprovado 12/08)
    if (tipo === 'merge' && mod === 'left') return saida('entre à esquerda', 'curvaEsquerda');
    if (tipo === 'merge' && mod === 'right') return saida('entre à direita', 'curvaDireita');
    // cruzamento em que o caminho segue reto e o roteador ainda marca manobra
    if (mod === 'straight' && (dobra || tipo === 'fork'
      || tipo === 'exit roundabout' || tipo === 'exit rotary')) return saida('siga em frente', 'nav');
    if (tipo === 'continue' || tipo === 'new name') {
      return saida(rua ? `continue na ${rua}` : 'continue', 'nav');
    }
    /* 🔴 O QUE SOBRA CONTINUA MUDO, DE PROPÓSITO (Lei 8): `on ramp`/`off ramp`
       (alça de rodovia) e `fork` sem `slight`. O passo é descartado, mas com a
       catraca isso não ressuscita mais nada — o `vi` é contado sobre a lista
       CRUA, então quem sai da lista continua gastando fita. Antes de 12/08 essa
       queda era a outra porta do fantasma. */
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
  // `avisou` = o alarme do teto já saiu hoje (zera junto na virada do dia)
  let navGastoDia = { dia: '', n: 0 };
  // resposta sem geometria já foi alarmada nesta sessão (§ pedirRota)
  let geoNulaAvisada = false;

  const navGastar = () => {
    const dia = diaOperacional();
    if (navGastoDia.dia !== dia) navGastoDia = { dia, n: 0 };
    if (navGastoDia.n >= NAV_TETO_DIA) {
      /* 🔴 O TETO NÃO RECUSA CALADO (12/08). Estourado, isto aqui devolvia
         false e pronto: a rota parava de se recalcular pelo RESTO DO DIA e
         nada na tela dizia por quê — a armadilha de
         [[cnefe-morto-por-cast-de-cep]], best-effort que engole erro precisa
         de ALARME. Uma vez por dia, no canal de aviso da casa. */
      if (!navGastoDia.avisou) {
        navGastoDia.avisou = true;
        try { console.warn(`[nav] teto diário de rotas atingido (${NAV_TETO_DIA})`); } catch (_) { /* sem console */ }
        if (typeof window.portao === 'function') {
          window.portao({
            tom: 'trava', ico: 'alert', titulo: 'O mapa parou de recalcular',
            sub: 'O limite diário de cálculos de rota acabou. O caminho na tela continua valendo, mas não se ajusta mais hoje.',
            acoes: [['Entendi', '']],
          });
        }
      }
      return false;
    }
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

    /* 🔴 O RETRAÇO SE ANUNCIA (12/08, § 6c): saiu do traçado e o pedido vai
       MESMO sair (todos os freios já passaram) ⇒ o selo acende. Parada
       entregue (`trocouAlvo`) é rota nova, não retraço — segue calada. */
    const retraco = !!(navRota && navRota.geometria && !trocouAlvo && !presoNaRota(ultimoFix));
    if (retraco) acenderSeloRedir();
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
      // a fita verde do V4 — vem de graça na mesma resposta (§7d)
      const geometria = geometriaDe(rota);
      /* 🔴 SEM FITA NÃO HÁ CATRACA, E MANOBRA SEM CATRACA É O FANTASMA DE VOLTA
         (12/08). O proxy sempre pede `geometries=geojson`, então isto é motor
         trocado/quebrado no VPS — mas se acontecer, guardar os passos deixaria
         o cartão PRESO na 1ª manobra o dia inteiro (`vi` nulo nunca avança).
         Cartão mudo (a Lei do IF) diz mais verdade; chegada, restante e
         distância não dependem da fita e continuam. E não continua calado:
         alarme uma vez por sessão, no canal da casa. */
      if (!geometria && !geoNulaAvisada) {
        geoNulaAvisada = true;
        try { console.warn('[nav] OSRM respondeu sem geometria — navegação sem manobras'); } catch (_) { /* sem console */ }
        if (typeof window.portao === 'function') {
          window.portao({
            tom: 'trava', ico: 'alert', titulo: 'O caminho veio sem desenho',
            sub: 'O servidor de rotas respondeu sem o traçado. A rota continua pela lista de paradas, mas o mapa fica sem o traço e sem as instruções de curva.',
            acoes: [['Entendi', '']],
          });
        }
      }
      const perna = geometria ? lerPrimeiraPerna(rota, geometria) : { passos: [], fim: 0 };
      navRota = {
        assinatura,
        em: Date.now(),
        totalM: Number.isFinite(Number(rota.distance)) ? Number(rota.distance) : null,
        totalS: Number.isFinite(Number(rota.duration)) ? Number(rota.duration) : null,
        passos: perna.passos,
        geometria,
        // onde a 1ª perna acaba. A fita é do dia INTEIRO e os passos são só desta
        // perna: sem o corte, a projeção gruda num pedaço que ainda vem (§ `projetarNaFita`)
        fimDaPerna: perna.fim,
        // a catraca do cartão: só ANDA PRA FRENTE, e zera junto com a rota (§ `manobraDaVez`)
        passoDaVez: 0,
        // as paradas SEM a origem: é o que decide se a rota virou outra
        alvos,
      };
      navFalhas = 0;
      // rota nova = manobras novas: o que já foi dito não vale mais. Sem isto,
      // uma curva que se repete na rota seguinte nasceria muda.
      if (trocouAlvo) vozDitas.clear();
      pintarTraco();
      // o caminho novo chegou: a fita dá UM flash e o selo sai logo atrás —
      // juntos, é o flash que diz do que o "Redirecionando…" estava falando.
      if (retraco) { flashDaFita(); apagarSeloRedir(SELO_REDIR_SUCESSO_MS); }
    } catch (_) {
      // 🔴 FALHOU: NÃO APAGA O QUE ESTÁ NA TELA. A manobra de 20 s atrás ainda
      // é melhor que uma tela em branco pra quem está no volante — e a
      // distância até a curva continua sendo recalculada do GPS, de graça.
      // O SELO, sim, apaga JÁ: o backoff pode ser 60 s (§ 6c, promessa falsa).
      if (retraco) apagarSeloRedir(0);
      navFalhas += 1;
    } finally {
      navPedindo = false;
      pintarNavegacao();
    }
  }

  /* 🔴 O ÍNDICE DO VÉRTICE VEM DE GRAÇA, E MESMO ASSIM ELE É CONFERIDO. Cada
     passo do OSRM traz a própria `geometry` (o proxy devolve o corpo CRU do
     motor), e somar os vértices dos passos anteriores dá exatamente o ponto da
     fita em que aquela manobra acontece — o `vi`, que é como `manobraDaVez` sabe
     o que já ficou pra trás. Motor de outra versão, ou `overview` simplificado,
     e a soma desanda em SILÊNCIO: aí o cartão apagaria manobra que ainda VEM,
     que é pior que o defeito que este conserto veio matar. Então o vértice
     contado é conferido contra o `maneuver.location` e, se não bate, quem decide
     é a projeção — a mesma conta que o traço já usa. */
  const VI_TOLERANCIA_M = 2;
  function viDaManobra(contado, ponto, geo, ateSegmento) {
    const c = geo && geo.coordinates;
    if (!c) return null;
    const v = c[contado];
    if (v && metrosEntre({ lat: v[1], lng: v[0] }, ponto) <= VI_TOLERANCIA_M) return contado;
    // o plano B projeta SÓ dentro da perna — a fita é do dia inteiro e se
    // cruza; sem a janela, a manobra do começo podia ganhar o `vi` de um
    // pedaço lá da frente e nascer "já passada".
    const p = projetarNaFita(ponto, geo, ateSegmento);
    return p ? p.i : null;
  }

  /** quantos segmentos de fita os passos de uma perna somam */
  const fitaDaPerna = (crus) => crus.reduce((s, passo) => {
    const g = passo && passo.geometry && passo.geometry.coordinates;
    return s + (Array.isArray(g) && g.length > 1 ? g.length - 1 : 0);
  }, 0);

  /** os passos com instrução da 1ª perna (origem → parada da vez), cada um com o
      `vi` da sua manobra; e `fim`, o vértice em que a 1ª perna acaba */
  function lerPrimeiraPerna(rota, geo) {
    const crus = ((rota.legs || [])[0] || {}).steps || [];
    // o fim vem ANTES dos passos: é ele a janela do plano B de `viDaManobra`
    const fim = fitaDaPerna(crus);
    const passos = [];
    let vi = 0;
    crus.forEach((passo) => {
      const m = manobraDoPasso(passo);
      const loc = (passo && passo.maneuver && passo.maneuver.location) || [];
      const lng = Number(loc[0]); const lat = Number(loc[1]);
      if (m && Number.isFinite(lat) && Number.isFinite(lng)) {
        passos.push(Object.assign({ lat, lng, vi: viDaManobra(vi, { lat, lng }, geo, fim) }, m));
      }
      /* 🔴 O CONTADOR ANDA MESMO COM O PASSO DESCARTADO. Quem não tem frase na
         tabela (Lei 8) some da lista, mas continua gastando fita: pular o
         incremento jogaria todos os índices seguintes pra trás, e índice
         atrasado é o fantasma entrando pela porta dos fundos. */
      const g = passo && passo.geometry && passo.geometry.coordinates;
      vi += Array.isArray(g) && g.length > 1 ? g.length - 1 : 0;
    });
    return { passos, fim };
  }

  /* 🔴 O FANTASMA DA CURVA JÁ FEITA (12/08 — print do dono: no topo "60 m, vire
     à esquerda", embaixo "Rua 23 · depois, vire à direita", e o traço verde
     desenhando a DIREITA. *"a voz acompanha o q está errado"*).

     Isto varria os passos do zero e devolvia o primeiro a mais de 25 m. A
     comparação não tinha SINAL — `metrosEntre` é módulo —, então "a menos de
     25 m" era o único jeito de um passo contar como passado. Duas metades, as
     duas ruins:

       · 26 m DEPOIS da curva ela voltava a ser "à frente" e RESSUSCITAVA no
         cartão, com a distância crescendo. Até a rota se recalcular, o que exige
         120 m de LINHA RETA (`NAV_ANDOU_M`, e num trajeto em L 130 m de asfalto
         medem ~98). Parado, nunca: congela na tela, que é o print;
       · nos 25 m ANTES da curva ela era pulada e o cartão já mostrava a
         SEGUINTE — a três segundos de virar, e com a voz junto, porque
         `VOZ_AGORA_M` é 60 e é maior que 25.

     E as duas se somam numa terceira: com um fantasma na vaga, a curva certa
     nunca chega em `vozDaManobra`, então a chave dela fica POR ANUNCIAR — e
     quando o recálculo mata o fantasma velho, quem fala é a curva já feita, do
     outro lado da esquina. Não é o GPS que emudece: é ele anunciando cada curva
     uma curva atrasada.

     🔴 "JÁ PASSOU" É PERGUNTA DE ORDEM, NÃO DE METROS — e quem responde é a
     FITA, que já respondia: `tracoDaVez` apara o traço em `preso.i + 1` desde
     08/08. Era o mesmo índice, calculado do lado de lá e jogado fora aqui. Agora
     o passo carrega o `vi` dele e a conta é um inteiro contra um inteiro.

     🔴 E É CATRACA, NÃO GATILHO. O passo da vez mora no `navRota` e só ANDA PRA
     FRENTE. Sem isso, o fix que sai 60 m da fita (`presoNaRota` devolve null, de
     propósito) desligaria o freio justo quando o GPS está pior, e o tremor de ±1
     no `preso.i` derrubaria a camada INTEIRA na esquina — `manobraIcone`,
     `manobraRua` e `manobraDepois` estão fora do `CROMO_VIVO`. O app que já
     rodava tinha esta peça (`voice.stepIndex += 1`, um cursor) e a fusão de
     07/08 a perdeu: o cursor virou varredura. É a mesma classe de
     [[peca-copiada-perde-tudo-que-a-original-ganha]]. */
  function manobraDaVez() {
    if (!navRota || !ultimoFix) return null;
    const passos = navRota.passos || [];
    const preso = presoNaRota(ultimoFix);
    // a fita passou do ponto da manobra ⇒ ela já era, por mais longe que esteja
    if (preso) {
      while (navRota.passoDaVez < passos.length) {
        const vi = passos[navRota.passoDaVez].vi;
        if (vi == null || vi > preso.i) break;
        navRota.passoDaVez += 1;
      }
    }
    const passo = passos[navRota.passoDaVez];
    if (!passo) return null;
    // 🔴 a distância até a curva se mede da posição PRESA NA RUA: do fix cru,
    // ela oscilava metros pra cima e pra baixo com o carro parado, e era isso
    // que fazia a manobra trocar de "91 m" pra "161 m" e voltar.
    return {
      passo,
      distancia: metrosEntre(posicaoDaTela(), passo),
      depois: depoisDe(passos, navRota.passoDaVez),
    };
  }

  /* 🔴 O "DEPOIS" TEM TETO, E ELE TAMBÉM SE PERDEU NA FUSÃO. 420 m é o número do
     app que já rodava (*"quem dirige precisa saber que vêm DUAS curvas seguidas
     antes de entrar na primeira"*): passada essa distância, a curva seguinte não
     é do agora, e anunciá-la no meio de uma reta é a linha de baixo discordando
     do traço. */
  const DEPOIS_TETO_M = 420;
  function depoisDe(passos, i) {
    const daVez = passos[i]; const proximo = passos[i + 1];
    if (!daVez || !proximo) return null;
    return metrosEntre(daVez, proximo) <= DEPOIS_TETO_M ? proximo : null;
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

  /* ------------------------------------------------------------------------
     7b-ter. A BRIGA POR ESPAÇO DOS RÓTULOS DO PROSPECTOR.

     Saiu de `60-prospector-nav.js` em 12/08, quando aquele arquivo passou do
     teto de 1000 linhas (ordem do dono, 10/08). O corte é numa fronteira limpa:
     tudo aqui é GEOMETRIA DE CHIP (medir, ordenar por prioridade, empurrar da
     borda, calar quem sobrepõe) e nada aqui sabe de mapa, de régua de viagem ou
     de fase. Quem chama é o `posicionarEmpresas`, no arquivo vizinho.

     A ordem dos arquivos costurados não importa pra isto funcionar: declaração
     de função IÇA no escopo da costura, e as constantes abaixo só são LIDAS
     quando alguém chama (muito depois de todos os arquivos terem sido avaliados).
     ------------------------------------------------------------------------ */

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
  /* ------------------------------------------------------------------------
     7b-bis. A ESCOLHA DA SEMANA (PROSPECTOR v2, 12/08 — decisão do dono).

     🔴 O QUE MUDOU NO PRODUTO. O prospector nascia ligado pra empresa inteira e
     acendia o que a cesta achasse. Agora ele nasce DESLIGADO pra todo mundo: só
     acorda quando a PESSOA aciona e diz que TIPO de empresa interessa a ela
     NESTA SEMANA. Sem escolha, o servidor nem manda a chave `prospector` — a rua
     fica sem prédio nenhum, que é o estado certo de quem não pediu nada.

     🔴 DUAS PORTAS, E SÓ ELAS:
       · GET  /logistica/prospector/semana  → { tipo, rotulo, semana, tipos[] }
       · POST /logistica/prospector/semana  → { tipo } | { tipo:null } (desligar)
     A CURADORIA (quais tipos existem) mora no SERVIDOR. A tela NÃO tem uma
     segunda cópia da lista: é a mesma lei da cesta de CNAE — duas listas
     escritas à mão divergem no primeiro ajuste, e aí o chip diz "Padarias" e o
     servidor procura outra coisa.

     🔴 A ESCOLHA É DA PESSOA, NÃO DA EMPRESA. O servidor lê pelo ator do JWT;
     aqui não viaja id nenhum de usuário. Dois motoristas da mesma distribuidora
     escolhem coisas diferentes na mesma segunda-feira.

     🔴 SEM OTIMISMO NA TELA. O chip só fica marcado depois que o POST voltou —
     mesma régua das 6 chaves dos Ajustes (§ `virarChave`). Marcar antes seria a
     tela prometendo uma caçada que o servidor pode ter recusado, e a pessoa
     dirigiria o dia inteiro esperando prédio verde que nunca vem.
     ------------------------------------------------------------------------ */

  /* O que o servidor respondeu por último. Guardado aqui (e não só no seam) por
     UM motivo: a linha dos Ajustes precisa do RÓTULO, e ela é repintada pelo
     `carregarAjustes`, que roda em outra hora e por outro caminho. Sem esta
     memória, a linha voltaria a dizer "Escolher o que procurar" toda vez que os
     Ajustes recarregassem — a tela esquecendo o que a pessoa acabou de decidir. */
  let escolhaDaSemana = null;

  /** O rótulo pra linha dos Ajustes ('' = ninguém escolheu / ainda não sei). */
  function rotuloDoProspector() {
    return (escolhaDaSemana && escolhaDaSemana.rotulo) || '';
  }

  /* Escreve o seam da folha. `tipos` vem SEMPRE do servidor; lista vazia é um
     estado honesto (a folha diz que não carregou e oferece a saída), nunca uma
     lista inventada aqui. */
  function pintarFolhaDoProspector() {
    if (typeof window.usarDados !== 'function') return;
    const e = escolhaDaSemana || {};
    window.usarDados('prospectortipo', {
      tipo: e.tipo || '',
      tipos: Array.isArray(e.tipos) ? e.tipos : [],
    });
  }

  /**
   * Busca a escolha e a curadoria. Best-effort COM VOZ: falhou, a folha abre
   * sem tipo nenhum e diz isso — nunca trava a tela de Ajustes por causa de uma
   * porta de preferência.
   */
  async function carregarProspectorSemana() {
    if (!temPonte() || !window.API || typeof window.API.get !== 'function') return null;
    try {
      const r = await window.API.get('/logistica/prospector/semana');
      if (r && typeof r === 'object') {
        escolhaDaSemana = {
          tipo: r.tipo || '',
          rotulo: r.rotulo || '',
          semana: r.semana || '',
          tipos: Array.isArray(r.tipos) ? r.tipos : [],
        };
      }
    } catch (erro) {
      /* 🔴 NÃO ZERA A MEMÓRIA NO ERRO. "Não consegui perguntar" ≠ "a resposta é
         não" (memória: start-process-nao-devolve-exitcode). Apagar aqui faria a
         linha dos Ajustes dizer "Escolher o que procurar" pra quem já escolheu,
         só porque o Wi-Fi caiu no meio do estacionamento. */
      try { console.log(`[prospector] semana: leitura falhou (${String((erro && erro.message) || erro)})`); } catch (_) {}
    }
    pintarFolhaDoProspector();
    return escolhaDaSemana;
  }

  /** Abre a folha JÁ COM DADO — tela de escolha que nasce vazia é tela que mente. */
  async function abrirFolhaDoProspector() {
    await carregarProspectorSemana();
    if (typeof window.ir === 'function') window.ir('prospectortipo');
  }

  /**
   * Grava a escolha (ou desliga, com `slug` vazio) e repinta as duas telas que
   * dependem dela: a folha (o chip marcado) e o Avançado (o rótulo da linha).
   *
   * DEPOIS DE GRAVAR, A RUA MUDA SOZINHA: o próximo `GET /logistica/rota` já vem
   * com `escolhida` recomputado contra a escolha nova, e o `aplicarProspector`
   * repinta os prédios. Nada aqui mexe em cor de prédio — a cor é do servidor.
   */
  async function escolherTipoProspector(slug) {
    if (!temPonte() || !window.API || typeof window.API.post !== 'function') return;
    const alvo = String(slug || '');
    // `comTrava` é a MESMA da `virarChave`: dedo rápido em dois chips não pode
    // virar duas gravações correndo, com a última resposta a chegar vencendo.
    await comTrava(async () => {
      let r;
      /* Botão que não faz nada e não avisa é pior que botão que dá erro. No erro
         a tela NÃO muda (sem otimismo) e a pessoa lê o que houve — mesmo aviso
         das 6 chaves de cima (`avisoErro`). */
      try { r = await window.API.post('/logistica/prospector/semana', { tipo: alvo || null }); }
      catch (e) { return avisoErro(e); }
      escolhaDaSemana = {
        tipo: (r && r.tipo) || '',
        rotulo: (r && r.rotulo) || '',
        semana: (r && r.semana) || '',
        // A lista de tipos não muda no POST; se ela não vier, fica a que já veio
        // do GET (perder a curadoria deixaria a folha vazia depois de um acerto).
        tipos: (r && Array.isArray(r.tipos) && r.tipos.length)
          ? r.tipos
          : ((escolhaDaSemana && escolhaDaSemana.tipos) || []),
      };
      pintarFolhaDoProspector();
      // A linha do Avançado mostra o rótulo — ela tem que saber na mesma hora.
      await carregarAjustes();
      /* 🔴 E A RUA TEM QUE MUDAR JUNTO. A cor é do servidor: sem reler a rota, os
         prédios só trocariam de cor no próximo poll — e quem acabou de escolher
         "Padarias" merece ver a rua responder ao toque, não daqui a 5 s. Mesma
         razão do `carregarRota()` no fim da `virarChave`. */
      await carregarRota();
    });
  }

  /** "Desligar esta semana" — a MESMA porta, sem tipo. Ausência é o desligado. */
  function desligarProspectorSemana() {
    return escolherTipoProspector('');
  }
  /* ------------------------------------------------------------------------
     6c. O SELO DO RETRAÇO — "Redirecionando…" (12/08).

     Fora do traçado, o caminho novo demora o que a rede demorar — e nesse
     meio tempo a tela parada parece o app perdido: a fita aponta um caminho
     que o motorista acabou de abandonar e nada diz que o recálculo já está
     em curso. O selo é esse aviso, e ele tem TRÊS leis:

       · só acende COM PEDIDO EM VOO, e só no retraço (`pedirRota` decide —
         rota nova de parada entregue NÃO é retraço, é a ordem do dia);
       · apaga com a RESPOSTA: no sucesso ~700 ms depois do flash da fita
         (tempo de ligar o aviso ao caminho novo que acabou de pintar), na
         falha NA HORA — o backoff pode ser 60 s e selo pendurado é promessa
         falsa, a lição de [[confirmacao-decorativa-virou-promessa-falsa]];
       · e tem TETO DURO de 4 s que apaga de qualquer jeito — timer perdido,
         resposta que nunca vem, repinte no meio: nada deixa o selo eterno.

     🔴 CROMO VIVO, NUNCA SEAM: isto muda no meio da tela de dirigir e passar
     pelo `usarDados` remontaria a camada e PISCARIA (a lição paga de
     [[o-pisca-era-a-tela-entrando-de-novo]]). É classe direta no nó da camada
     viva, o mesmo mecanismo do `cromoDoProspector` e do `marcarSolta`. O nó
     `.gps-redir` é permanente e inerte no template (irmão do `.gps-veu`);
     repinte troca o nó e o novo nasce apagado — estado seguro, e o teto acima
     garante que os timers não ressuscitam nada. */
  const SELO_REDIR_TETO_MS = 4000;
  const SELO_REDIR_SUCESSO_MS = 700;
  let seloRedirTeto = null;    // o teto duro
  let seloRedirTarde = null;   // o apagar adiado do sucesso

  /** escreve o estado no nó da camada viva — e só nele */
  function seloRedir(liga) {
    const el = naCamada('.gps-redir');
    if (el) el.classList.toggle('on', !!liga);
  }

  /** apaga: já (0) ou daqui a pouco (>0). Sempre desarma os dois timers. */
  function apagarSeloRedir(aposMs) {
    if (seloRedirTeto) { clearTimeout(seloRedirTeto); seloRedirTeto = null; }
    if (seloRedirTarde) { clearTimeout(seloRedirTarde); seloRedirTarde = null; }
    if (aposMs > 0) {
      seloRedirTarde = setTimeout(() => { seloRedirTarde = null; seloRedir(false); }, aposMs);
      return;
    }
    seloRedir(false);
  }

  /** acende e arma o teto — chamado por `pedirRota`, nunca por conta própria */
  function acenderSeloRedir() {
    apagarSeloRedir(0);          // pedido novo não herda timer do anterior
    seloRedir(true);
    seloRedirTeto = setTimeout(() => { seloRedirTeto = null; seloRedir(false); }, SELO_REDIR_TETO_MS);
  }
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
  /* 🔴 O DISJUNTOR DAQUI NÃO É O DA REDE — e confundir os dois deixava o dia
     inteiro sem radar. Este pedido é LOCAL (a ponte nativa responde de
     `filesDir`); quem fala com o R2 é o `RadaresOffline`, e é lá que mora o
     freio de rede de verdade (30 min de pausa, 3 tentativas no dia, e tentativa
     nenhuma é gasta sem sinal validado). Se este lado desistisse em 3 vezes,
     bastava o turno começar numa zona morta pra o nativo nunca mais ser
     cutucado — pacote pronto às 10h e ninguém pra pedir. Então: uma batida a
     cada 5 min, teto de 40 no dia (≈3,3 h de cobertura, 40 requisições locais
     que não tocam na rede). Isso não é tempestade: o GPS entrega 3.600 fixes na
     mesma hora em que isto bate 12 vezes numa porta que já está na casa. */
  const RADAR_REPOUSO_MS = 5 * 60 * 1000;
  const RADAR_TENTATIVAS_DIA = 40;
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
    // a chave de som é a do APARELHO, e ela é conferida NA HORA DE FALAR: quem
    // silenciou durante a espera da manobra não pode levar a fala adiada na cara
    if (!vozLigada()) return;
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
    const alvo = achado && achado.comLimite;
    const naJanela = !!(primeiro && primeiro.distancia <= janelaDoAviso() + RADAR_MARGEM_M);

    if (chip) {
      chip.classList.toggle('on', naJanela);
      const txt = chip.querySelector('.txt');
      const metros = naJanela ? Math.max(0, Math.round(primeiro.distancia / 10) * 10) : 0;
      const distancia = metros >= 1000
        ? `${(metros / 1000).toFixed(1).replace('.', ',')} km`
        : `${metros} m`;
      const aviso = naJanela ? `Radar · ${distancia}` : 'Radar';
      if (txt && txt.textContent !== aviso) txt.textContent = aviso;
    }

    const lim = vel && vel.querySelector('.limite-via');
    const limite = alvo && alvo.distancia <= RADAR_F3_M + RADAR_MARGEM_M
      ? String(Math.round(alvo.radar.limite)) : '';
    if (lim && lim.textContent !== limite) lim.textContent = limite;

    /* F3 — o velocímetro avermelha contra o limite DO RADAR À FRENTE, que é o
       limite que custa dinheiro. Radar sem limite nunca acende nada. */
    if (vel) {
      const acima = !!(alvo && alvo.distancia <= RADAR_F3_M + RADAR_MARGEM_M
        && radarVelKmh() > alvo.radar.limite);
      vel.classList.toggle('acima', acima);
    }

    if (naJanela) vozDoRadar(primeiro);
  }
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

    // o que falta de estrada: soma das pernas ainda por dirigir
    const faltaM = pendentes.reduce((s, p) => {
      const m = Number(p.item && p.item.legDistanceM);
      return s + (Number.isFinite(m) && m > 0 ? m : 0);
    }, 0);

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
    /* 🔴 A PRECISÃO SÓ É ESCRITA NA TELA QUE A DESENHA. `GPS ±20 m` sacode a
       cada fix (o aparelho mede 18, 21, 19 parado no mesmo lugar) e a tela de
       DIRIGIR nem a mostra — ela é do "Você chegou". Escrevê-la no seam ali era
       um repinte por segundo de graça: o `manobraDist` foi arredondado em
       07/08 pra matar a piscada e ela continuou, porque quem derrubava a
       camada era ESTE campo invisível. */
    const precisao = telaAtual() === 'mapachegou'
      ? (ultimoFix && Number.isFinite(ultimoFix.precisaoM) ? `GPS ±${Math.round(ultimoFix.precisaoM)} m` : '')
      : ((typeof DADOS !== 'undefined' && DADOS.gps && DADOS.gps.chegouPrecisao) || '');

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
      /* 🔴 O BOTÃO VERDE DO "VOCÊ CHEGOU" ERA MORTO POR FALTA DE ID (09/08).
         O desenho monta a porta com `data-acao="abrir-parada" data-parada=…`,
         e `abrirParada` só sabe abrir o que está em `ENTREGAS` — a chave é o id
         da ENTREGA, o MESMO que o cartão da lista carrega (`traduzirParada.id`),
         nunca o do cliente. Sem parada da vez sai VAZIO de propósito: a Lei do
         IF apaga o botão, e vaga vazia é melhor que verde grande que não leva
         a lugar nenhum. */
      chegouId: vez && vez.item && vez.item.id ? String(vez.item.id) : '',
      chegouEndereco: vez ? esc(cliente.endereco) : '',
      chegouPrecisao: precisao,
      // "faltam N paradas" conta as que sobram DEPOIS desta — quem está na
      // porta da 3ª quer saber o que vem pela frente, não recontar a de agora.
      // O VERBO CONCORDA: uma parada FALTA, cinco FALTAM. Medido: com 1 pendente
      // a tela dizia "faltam 1 parada". A ponte escolhe a forma porque só ela
      // sabe o número; as duas palavras são do desenho.
      chegouFaltam: pendentes.length > 1
        ? `${pendentes.length - 1} parada${pendentes.length - 1 > 1 ? 's' : ''}` : '',
      chegouFaltamVerbo: pendentes.length === 2 ? 'falta' : 'faltam',
      chegouKm: faltaM > 0 ? emMetros(faltaM) : '',
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
     hoje o mock a pousa no `--gps-piso`, que em aparelho comum dá ~0,83. */
  const NAV_ANCORA = 0.83;

  const mapaDaNavegacao = () => {
    const palco = naCamada('[data-mapa="gps"]');
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
  function quandoEstiloPronto(mapa, fn) {
    if (!mapa) return;
    if (mapa.isStyleLoaded && mapa.isStyleLoaded()) { fn(); return; }
    let feito = false;
    const roda = () => { if (feito) return; feito = true; try { fn(); } catch (_) { /* estilo trocou no meio */ } };
    try { mapa.once('styledata', roda); } catch (_) { /* mapa morto */ }
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
  const palcosDoTraco = () => [mapaDaNavegacao(), (GARAGEM.get('geral') || {}).mapa].filter(Boolean);

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
     falta depois é só o respiro entre um movimento e o outro. */
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
  const emCena = () => !!document.querySelector('#app .tela.cena');
  /** a cidade ainda está nascendo no mapa de dirigir? (§ 7a-bis, motivo 'navegar') */
  const cenaDasRuasNoAr = () => !!(cena && cena.casa && cena.casa.nome === 'gps');

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

  /** põe a câmera em pé (2D) com a rota INTEIRA acima do motorista */
  function vistaGeral() {
    const mapa = mapaDaNavegacao();
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
    try { mapa.easeTo({ ...passo, duration: 0 }); } catch (_) { /* mapa saindo de cena */ }
  }

  /** o movimento: 2,4 s de inclinação, zoom e rumo andando juntos */
  function descer() {
    const mapa = mapaDaNavegacao();
    if (!mapa || telaAtual() !== 'mapa') { camFase = 'dirigindo'; return; }
    camFase = 'descendo';
    poseGeral = null;               // a próxima entrada remede a moldura do dia
    const passo = {
      zoom: NAV_ZOOM, pitch: NAV_PITCH, offset: recuoDoPuck(mapa),
      duration: DESCIDA_MS, easing: suave,
    };
    const eu = posicaoDaTela();
    if (eu) passo.center = [eu.lng, eu.lat];
    const rumo = rumoDaTela();
    if (rumo != null) passo.bearing = rumo;
    try { mapa.easeTo(passo); } catch (_) { camFase = 'dirigindo'; return; }
    // o relógio é o dono do fim, não o evento do mapa: `moveend` não chega se
    // o dedo arrastar o mapa no meio, e a câmera ficaria presa em "descendo".
    setTimeout(() => { if (camFase === 'descendo') camFase = 'dirigindo'; }, DESCIDA_MS + 80);
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
      /* 🔴 SÃO DUAS CENAS ESPERANDO, E ELAS TERMINAM QUASE JUNTAS: a da CAMADA
         (o véu e as folhas entrando, marca `cena`, teto de 1,2 s) e a das RUAS
         crescendo DENTRO do mapa (~1,06 s). Descer com a cidade ainda nascendo
         seria a câmera se mexendo por cima de um desenho em curso — o cruzamento
         que esta leva inteira existe pra matar. Quem chegar por último manda. */
      if ((emCena() || cenaDasRuasNoAr()) && Date.now() < desistirEm) return;
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

  /** corta a descida e devolve a câmera pra quem dirige (dedo, ou troca de tela) */
  function pararDescida() {
    if (vigiaCena) { clearInterval(vigiaCena); vigiaCena = null; }
    if (geralTimer) { clearTimeout(geralTimer); geralTimer = null; }
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
    // 🔴 A MANOBRA TEM PRIORIDADE NA VOZ (§ 6d): o radar escuta esta fala e
    // cala pela folga dele. Um aviso auxiliar por cima de "vire à esquerda"
    // faz o motorista perder a curva — e a curva não tem segunda chance.
    radarOuviuAVoz();
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
      // e o radar vem DEPOIS dela, sempre: a ordem das duas linhas é a
      // prioridade da manobra na voz (§ 6d).
      radarDaRota();
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
    /* O pacote de radares do dia é pedido AQUI, no 1º fix de qualquer tela, e
       não na entrada da navegação: quem abre o app na garagem dá ao nativo o
       tempo de baixar do R2 antes de a rua começar. Um pedido por dia quando
       responde, três no dia quando não responde (§ 6d, `garantirRadares`). */
    garantirRadares();
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

  /* ------------------------------------------------------------------------
     🔴 A TRAVA DA ORDEM ALTERADA (dono, 10/08: "caso a pessoa fazer alterações e
     tentar montar rota, barre e peça para salvar — 1 tela apenas: 'Foi alterado
     a ordem, necessário salvar para montar rota'").

     Arrastar a lista é permitido (item 2 do mesmo pedido: "vc pode alterar as
     sequências"). O que não é permitido é a ordem nova sair pra rua sem estar
     GRAVADA em espaço nenhum: no toque seguinte no dia ela não teria como
     voltar, e o trabalho do dedo morreria no primeiro repinte.

     UMA TELA. O alvo já vem decidido daqui — o espaço aceso, ou o primeiro
     vago —, então o dono digita (ou aceita) o nome e a rota monta na sequência.
     Com os ${MAX_ESPACOS} ocupados e nenhum aceso não há alvo pra decidir
     sozinho, e é o único caso em que existe uma pergunta antes: apagar o MAIS
     ANTIGO (o Espaço 1, que é o mais velho por nascimento) e gravar no lugar.
     ------------------------------------------------------------------------ */
  const ordemAlteradaSemSalvar = () => telaAtual() === 'montagem'
    && previaDoDedo && paradasParaSalvar().length > 0;

  /** o 1º espaço sem rota dentro; -1 quando os três estão ocupados */
  function primeiroVago() {
    for (let i = 0; i < MAX_ESPACOS; i += 1) if (!ESPACOS[i]) return i;
    return -1;
  }
  /** o espaço que recebe a gravação obrigatória: o aceso, senão o 1º vago */
  function alvoDaTrava() {
    const aceso = idxDoModo(modoSel);
    return aceso >= 0 ? aceso : primeiroVago();  // -1 = cheio, quem decide é o dono
  }

  /** embrulha Montar/Iniciar: sem ordem gravada, a tela de salvar vem antes */
  function comOrdemSalva(seguir) {
    if (!ordemAlteradaSemSalvar() || typeof window.portao !== 'function') return seguir();
    const dia = diaDosEspacos();
    const idx = alvoDaTrava();
    const abrirSalvar = (n) => pedirNome(n, {
      titulo: 'Foi alterado a ordem',
      sub: 'Necessário salvar para montar rota.',
      rotulo: 'Salvar e montar',
      nomePadrao: `${ROTULO_DIA[dia] || 'Rota'} ${n + 1}`,
      depois: seguir,
    });
    if (idx >= 0) return abrirSalvar(idx);
    const velho = ESPACOS[0];
    window.portao({
      tom: 'alerta', ico: 'save', titulo: 'Foi alterado a ordem',
      sub: `Os ${MAX_ESPACOS} espaços de ${ROTULO_DIA[dia] || 'hoje'} estão cheios. Apagar "${esc(velho.nome)}", o mais antigo?`,
      acoes: [['Agora não', ''], ['Apagar e salvar', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      try { await window.API.del(`/logistica/rota-modelos/${encodeURIComponent(velho.id)}`); }
      catch (e) { return avisoErro(e); }
      // A fileira encolhe: quem era Espaço 2 vira 1, e o vago é o ÚLTIMO. O
      // alvo aqui é o VAGO e não `alvoDaTrava()`: o `carregarEspacos` acabou de
      // reacender um espaço pela memória do dia, e regravar ELE seria apagar a
      // segunda rota logo depois de o dono ter apagado a primeira.
      await carregarEspacos();
      const vago = primeiroVago();
      if (vago < 0) return avisoErro(new Error('Não consegui liberar um espaço agora.'));
      abrirSalvar(vago);
    }), { once: true });
  }

  /* ------------------------------------------------------------------------
     L9 — AJUSTES, RECARGA E CONSUMO.

     🔴 CHAVE QUE APARECE E NÃO CONTROLA NADA É PIOR QUE CHAVE AUSENTE. Só
     entram as que têm porta: as do servidor (`avisoChegandoEnabled` e as 6 de
     dinheiro) e as do próprio aparelho (som/voz pelo `soundPrefs` do
     Kotlin, tema pelo native). O grupo "Sem internet" INTEIRO sai da tela: o
     download de mapa e o pacote offline morreram no corte de 06/08 — o PMTiles
     guarda os 60 km sozinho, sem botão. "Painel de créditos do dia" também
     sai: não achei porta nenhuma pra ele.
     ------------------------------------------------------------------------ */
  let config = null;

  /* 🔴 QUEM É ADMIN QUEM DIZ É O SERVIDOR, NÃO A TELA. O `GET /logistica/config`
     responde DOIS tamanhos: pra quem é responsável financeiro ele manda o bloco
     comercial (`modoRotaPadrao`, `pixChave`, `trackingAtivo`…), e pra gerente,
     vendedor e motorista esses campos vêm AUSENTES — não nulos, ausentes. Então
     a presença de um deles É a resposta, e não há gate nenhum inventado aqui.
     É o MESMO `isAdmin()` do app que já roda (`app.js`, L545), com o MESMO
     campo, de propósito: dois fronts do mesmo produto não podem discordar sobre
     quem é dono.
     ⚠️ Medido: `moduloFinanceiroAtivo` é o ÚNICO dos 6 que o backend exige
     responsável financeiro pra GRAVAR (está no `changesCommercialConfig`); os
     outros 5 bastam ser ADMIN. Como o app não tem sinal nenhum que separe
     gerente de motorista, o corte é este — e ele erra pro lado certo: esconder
     uma chave que o gerente poderia mexer é menos grave que mostrar uma chave
     que vai devolver 403 na cara dele. Chave que não obedece é mentira. */
  const ehAdmin = () => !!config && Object.prototype.hasOwnProperty.call(config, 'modoRotaPadrao');

  async function carregarAjustes() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const [cfgR, credR] = await Promise.allSettled([
      window.API.get('/logistica/config'),
      window.API.get('/credits/me'),
    ]);
    // Mesma lei do L8: fonte fora do ar não reescreve a tela de ajustes com
    // chave desligada — isso faria o dono achar que perdeu a configuração.
    if (cfgR.status !== 'fulfilled' || !cfgR.value) return fonteCaiu('ajustes');
    config = cfgR.value;
    // A MESMA resposta já traz o CSV do item 9 — aproveitar aqui é de graça e
    // deixa a barra fresca pra quem passou pelos Ajustes (uma chamada a menos).
    aplicarBarra(config);
    const cred = credR.status === 'fulfilled' ? credR.value : null;
    const saldo = cred && typeof cred.balance === 'number' ? cred.balance : null;
    let sons = 1;
    try { const p = window.HBX.soundPrefs.get(); sons = p && p.master === false ? 0 : 1; } catch (_) { /* padrão ligado */ }
    const dist = Number(config.avisoChegandoDistanciaM);
    const admin = ehAdmin() ? 1 : 0;
    window.usarDados('ajustes', {
      ...fonteVoltou,
      admin,
      creditosLinha: saldo != null ? `${saldo} ${saldo === 1 ? 'crédito' : 'créditos'}` : '',
      sons,
      painelCreditos: '',      // sem porta: a linha inteira some
      grupoOffline: 0,         // corte de 06/08
      empresa: '',             // o nome da empresa não vem em porta do celular
      ...linhaDaVersao(),      // versão instalada + anúncio de versão nova
    });
    /* As 6 chaves de dinheiro. Vêm da MESMA resposta que já foi buscada — a tela
       do Avançado não tem chamada própria, e por isso também não tem estado
       próprio de falha: quem recarrega é o `recarregar-ajustes`. */
    window.usarDados('avancado', {
      ...fonteVoltou,
      admin,
      financeiro: config.moduloFinanceiroAtivo ? 1 : 0,
      cobrancaSimples: config.cobrancaSimples ? 1 : 0,
      precoPorCliente: config.precoPorClienteAtivo ? 1 : 0,
      naHora: config.aceitaNaHora ? 1 : 0,
      mensal: config.aceitaMensal ? 1 : 0,
      fiado: config.aceitaFiado ? 1 : 0,
      // "Avisar chegada" mora no Avançado desde 07/08 (ordem do dono) — o
      // campo e o raio são os mesmos que a raiz dos Ajustes mostrava.
      avisarChegada: config.avisoChegandoEnabled ? 1 : 0,
      avisarChegadaDist: isFinite(dist) && dist > 0 ? `${dist} m` : '',
      /* PROSPECTOR (09/08) — até hoje a chave só existia no desktop, e o
         capítulo do tutorial terminava mandando o dono "ligar no computador".
         São DOIS fatos, não um: `prospector` é o estado da empresa, e
         `prospectorDisponivel` é a HBX ter ligado o recurso. A linha só é
         DESENHADA com o segundo — chave de recurso que a empresa não tem
         devolve 403 na cara do dono. */
      prospector: config.prospectorAtivo ? 1 : 0,
      prospectorDisponivel: prospectorPodeLigar(),
      /* PROSPECTOR v2 (12/08) — o que a PESSOA escolheu pra esta semana. Vem da
         memória do §7b-bis (o último GET/POST), não de uma segunda chamada: esta
         tela não tem porta própria, e pendurar mais uma rede aqui faria a linha
         piscar toda vez que os Ajustes recarregassem. Vazio = ainda não escolheu
         (ou ainda não perguntei) — e a linha diz "Escolher o que procurar", que
         é honesto nos dois casos. */
      prospectorTipo: rotuloDoProspector(),
    });
    /* Só pergunta a escolha se a empresa PODE ter prospector — chave desligada
       não tem o que procurar, e seria uma ida à rede por tela de Ajustes de todo
       mundo. Best-effort: falha aqui não atrapalha nada nesta tela. */
    if (config.prospectorAtivo && prospectorPodeLigar()) {
      carregarProspectorSemana().then(() => {
        if (typeof window.usarDados === 'function') {
          window.usarDados('avancado', { prospectorTipo: rotuloDoProspector() });
        }
      }).catch(() => undefined);
    }
    if (cred) encherCarteira(cred);
  }

  /* ------------------------------------------------------------------------
     AJUSTES · CRÉDITOS — a tela única (09/08), e a única que cobra dinheiro.

     Ela era DUAS: "Recarga de créditos" e "Consumo e bônus", vizinhas na
     Administração, as duas mostrando o MESMO saldo. Viraram uma, com o foco na
     recarga. São DUAS portas de rede, e continuam duas de propósito:
       · `/credits/me`                    → saldo, lotes vencendo e catálogo;
       · `/logistica/creditos/extrato`    → uso do mês, bônus e movimento.
     Cada uma com o seu par de bandeiras (`carregando`/`semFonte` e
     `movCarregando`/`movSemFonte`), porque extrato no chão NÃO pode derrubar a
     recarga: quem abriu esta tela veio comprar crédito.

     🔴 CARREGA SOZINHA, venha de onde vier. A recarga só era preenchida de
     carona no `carregarAjustes`; quem entrasse pelo atalho via o catálogo do
     DESENHO — preço, selo de desconto e o botão de pagar. Tela de dinheiro não
     pode depender de por onde a pessoa entrou.
     ------------------------------------------------------------------------ */
  async function carregarCreditos() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    // As duas portas saem JUNTAS e cada uma responde por si — `allSettled`, nunca
    // `all`: com `all`, o extrato fora do ar levaria a carteira junto no catch.
    const [credR, extR] = await Promise.allSettled([
      window.API.get('/credits/me'),
      window.API.get('/logistica/creditos/extrato'),
    ]);
    if (credR.status === 'fulfilled' && credR.value) encherCarteira(credR.value);
    else fonteCaiu('creditos');
    if (extR.status === 'fulfilled' && extR.value && typeof extR.value === 'object') encherMovimento(extR.value);
    else movimentoCaiu();
  }

  /* 🔴 O PAGAMENTO CAÍA E A TELA NÃO FICAVA SABENDO. O `MainActivity` chama
     `window.HBXApp.rechargeCompleted(payload)` assim que o checkout nativo
     aprova a cobrança (`recargaLauncher`, com `{ok, packKey, credited,
     balanceAfter}`) — e no app novo NINGUÉM atendia por esse nome: quem
     atendia era o `app.js`, que a fusão apagou. O desfecho é o pior possível
     numa tela de dinheiro: o dono paga, o checkout diz "créditos adicionados",
     ele volta, e o saldo continua o de antes até fechar e abrir o app inteiro.
     App que mostra saldo velho depois de cobrar parece app que perdeu a compra.

     `balanceAfter` pinta na hora — não é otimismo local, é o número que o
     próprio servidor acabou de devolver junto do "aprovado". A releitura
     confirma e ainda traz a linha nova do extrato. */
  window.HBXApp.rechargeCompleted = function (res) {
    const saldo = Number(res && res.balanceAfter);
    if (isFinite(saldo) && typeof window.usarDados === 'function') {
      window.usarDados('creditos', { ...fonteVoltou, saldo: String(saldo) });
    }
    carregarCreditos();
  };

  /** o movimento tem bandeira PRÓPRIA — mesma lei do `fonteCaiu`, outro par */
  function movimentoCaiu() {
    if (typeof window.usarDados !== 'function') return;
    let primeira = false;
    try { primeira = !!(DADOS.creditos && DADOS.creditos.movCarregando); } catch (_) { return; }
    if (!primeira) return;
    window.usarDados('creditos', { movCarregando: false, movSemFonte: true });
  }

  /** os pacotes vêm no MESMO `/credits/me` do saldo — não há porta separada */
  let pacoteEscolhido = null;
  function encherCarteira(cred) {
    const packs = Array.isArray(cred && cred.packs) ? cred.packs : [];
    const saldo = typeof cred.balance === 'number' ? cred.balance : null;
    if (!pacoteEscolhido) {
      const rec = packs.find((p) => p.recommended) || packs[0];
      pacoteEscolhido = rec ? rec.key : null;
    }
    const atual = packs.find((p) => p.key === pacoteEscolhido) || null;
    window.usarDados('creditos', {
      ...fonteVoltou,
      saldo: saldo != null ? String(saldo) : '',
      vence: creditoVencendo(cred),
      pacotes: packs.map((p) => [
        // crédito é NÚMERO INTEIRO; só o PREÇO do pacote é dinheiro.
        String(p.credits),
        Number(p.price).toFixed(2).replace('.', ','),
        esc(p.badge),
        p.key === pacoteEscolhido ? 1 : 0,
        esc(p.key),
        detalheDoPacote(p),
      ]),
      cta: atual ? `Recarregar ${atual.credits} créditos · ${dinheiro(Number(atual.price))}` : '',
    });
  }

  /* 🔴 ESCOLHER PACOTE É TOQUE, NÃO REDE. O toque num pacote chamava
     `carregarAjustes()` — DUAS chamadas HTTP (`/logistica/config` e
     `/credits/me`) só pra acender a borda de um cartão. Na rede da rua o dedo
     batia e a tela ficava parada até a resposta; e com o `/logistica/config` no
     chão o `fonteCaiu('ajustes')` engolia a escolha, então o pacote NUNCA
     acendia. O catálogo já está na tela — quem manda no aceso é este objeto, e
     o repinte é local e instantâneo. O botão do pé reusa os MESMOS textos da
     linha escolhida: dois lugares formatando o mesmo preço é onde nasce a
     discordância de centavo. */
  function escolherPacote(chave) {
    const k = String(chave || '');
    if (!k || k === pacoteEscolhido || typeof window.usarDados !== 'function') return;
    const packs = Array.isArray(DADOS.creditos && DADOS.creditos.pacotes) ? DADOS.creditos.pacotes : [];
    const atual = packs.find((p) => p[4] === k);
    if (!atual) return;
    pacoteEscolhido = k;
    window.usarDados('creditos', {
      pacotes: packs.map((p) => [p[0], p[1], p[2], p[4] === k ? 1 : 0, p[4], p[5]]),
      cta: `Recarregar ${atual[0]} créditos · R$ ${atual[1]}`,
    });
  }

  /* 🔴 O CRÉDITO VENCE, E O APP NUNCA DISSE ISSO. O `lots[]` do `/credits/me`
     traz `remaining` e `expiresAt` desde sempre e ninguém lia: o dono comprava
     300 créditos com 90 dias de validade e descobria o vencimento pelo saldo
     que sumiu. Dinheiro que evapora calado é a pior surpresa que um produto
     guarda — e aqui ela custa uma recarga que não precisava acontecer.
     Só o lote que vence PRIMEIRO, e só dentro de 30 dias: aviso permanente vira
     paisagem, e lote de 89 dias não é notícia. Lote sem `expiresAt` não vence e
     nem entra na conta. */
  function creditoVencendo(cred) {
    const lots = Array.isArray(cred && cred.lots) ? cred.lots : [];
    const vivos = lots
      .map((l) => ({ resta: Number(l && l.remaining), quando: l && l.expiresAt }))
      .filter((l) => l.resta > 0 && l.quando && isFinite(new Date(l.quando).getTime()));
    if (!vivos.length) return '';
    const limite = Date.now() + 30 * 86400000;
    const primeiro = vivos
      .map((l) => ({ ...l, t: new Date(l.quando).getTime() }))
      .sort((a, b) => a.t - b.t)[0];
    if (primeiro.t > limite) return '';
    // Lotes que vencem NO MESMO DIA somam: são um vencimento só pra quem lê.
    const dia = diaCurto(primeiro.quando);
    const soma = vivos.reduce((s, l) => s + (diaCurto(l.quando) === dia ? l.resta : 0), 0);
    return `${soma} ${soma === 1 ? 'crédito vence' : 'créditos vencem'} em ${dia}`;
  }

  /* O que faz escolher: o preço POR CRÉDITO (a única conta que responde "qual é
     o mais barato" quando os pacotes têm tamanhos diferentes) e a VALIDADE.
     Os dois já vinham no `/credits/me` — `price`, `credits` e
     `defaultExpiryDays` — e nenhum dos dois chegava na tela. Cada pedaço só
     entra se tiver fonte, e o separador nasce com o segundo pedaço. */
  function detalheDoPacote(p) {
    const partes = [];
    const credits = Number(p && p.credits);
    const price = Number(p && p.price);
    if (credits > 0 && isFinite(price) && price > 0) {
      partes.push(`${dinheiro(price / credits)} por crédito`);
    }
    const dias = Number(p && p.defaultExpiryDays);
    if (isFinite(dias) && dias > 0) partes.push(`vale ${dias} dias`);
    return partes.join(' · ');
  }

  /* ------------------------------------------------------------------------
     AJUSTES · FINANCEIRO — a carteira do dono, e a última tela cravada.

     DUAS portas, porque são duas perguntas diferentes:
       · `fechamento/resumo` → o CAIXA DE HOJE (quanto entrou, por qual forma) E
         o mapa `devedores` (id do cliente → centavos em aberto);
       · `nucleo/clientes`  → o NOME de quem está nesse mapa.

     🔴 POR QUE NÃO `GET /logistica/financeiro/saldos`, que seria a porta óbvia
     (ela devolve nome + saldo prontos, é a mesma que o resumo diário do
     WhatsApp usa): ela EXISTE no servidor e está certa, mas o app NÃO ALCANÇA.
     O `NativeApiClient` tem uma lista branca de endereços por flavor
     (`isMobileEndpointAllowed`) e `financeiro/saldos` não está nela — medido no
     g15, a chamada morre DENTRO do aparelho com "Esta operação não pertence ao
     logistica", sem nem sair pra rede. Essa lista mora em `src/main/`, que esta
     frente não pode tocar. Chamar assim mesmo seria pior que não chamar: o
     "Em aberto" nasceria vazio por bloqueio COM CARA de "ninguém te deve" — e
     esses dois vazios são opostos (Lei nº1). Então a conta vem pelo caminho que
     o app já tem aberto, e sem inventar 2ª conta de dívida: o `devedores` do
     resumo é computado pelo MESMO `saldosFinanceiro` (que por sua vez lê a
     fonte única `saldoAbertoPorClientes`), e o `debitoAtual` do
     `nucleo/clientes` é espelho da mesma regra.

     Cada porta escreve SÓ O SEU pedaço, e só se responder. As duas no chão na
     primeira carga ⇒ `fonteCaiu` (aviso + "Tentar de novo"), nunca tela vazia:
     "não entrou nada hoje" e "a rede caiu" não podem ter a mesma cara.
     ------------------------------------------------------------------------ */
  async function carregarFinanceiro() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const dia = diaOperacional();
    const [caixaR, rosterR] = await Promise.allSettled([
      window.API.get(`/logistica/fechamento/resumo?date=${encodeURIComponent(dia)}`),
      window.API.get('/nucleo/clientes?page=1&pageSize=100'),
    ]);
    if (caixaR.status !== 'fulfilled' && rosterR.status !== 'fulfilled') return fonteCaiu('financeiro');

    const caixa = caixaR.status === 'fulfilled' ? caixaR.value : null;
    const formas = (caixa && caixa.fechamento && caixa.fechamento.formas) || null;
    // `devedores` é { idDoCliente: centavos } e só traz quem tem saldo > 0.
    const deve = (caixa && caixa.devedores && typeof caixa.devedores === 'object') ? caixa.devedores : null;
    const totalAberto = deve ? Object.keys(deve).reduce((s, k) => s + (Number(deve[k]) || 0), 0) : 0;
    // O NOME vem do roster. Quem não estiver nele fica SEM LINHA — mas o valor
    // dele continua contado no "Em aberto": o total é QUANTO, a lista é QUEM, e
    // o total nunca pode encolher por causa de uma página de nomes que não veio.
    const nomes = new Map();
    if (rosterR.status === 'fulfilled') {
      const itens = (rosterR.value && Array.isArray(rosterR.value.items)) ? rosterR.value.items : [];
      itens.forEach((c) => { if (c && c.id && String(c.name || '').trim()) nomes.set(String(c.id), String(c.name)); });
    }
    const linhasDevedor = deve
      ? Object.keys(deve)
        .filter((id) => nomes.has(String(id)) && (Number(deve[id]) || 0) > 0)
        .sort((a, b) => (Number(deve[b]) || 0) - (Number(deve[a]) || 0))
      : [];

    window.usarDados('financeiro', {
      ...fonteVoltou,
      ...(caixaR.status === 'fulfilled' ? {
        /* "Recebido" é o que ENTROU: dinheiro + pix + cartão. NÃO é o
           `totalCents`, que soma o fiado junto — e fiado é exatamente o que
           NÃO entrou. Chamar o marcado de recebido seria a mesma mentira desta
           tela vestida de outra roupa. É soma de número do servidor, não conta
           minha. Zero some (Lei do IF, a mesma régua do `saldo` da Rota). */
        recebido: formas
          ? centavosSeTiver((formas.dinheiroCents || 0) + (formas.pixCents || 0) + (formas.cartaoCents || 0))
          : '',
        formas: formas ? [
          ['cash', 'var(--lime)', 'Dinheiro', centavosSeTiver(formas.dinheiroCents)],
          ['pix', 'var(--blue-l)', 'Pix', centavosSeTiver(formas.pixCents)],
          ['card', 'var(--purple)', 'Cartão', centavosSeTiver(formas.cartaoCents)],
        ].filter((x) => x[3]) : [],
        // "Marcou" é o fiado do dia — a palavra é do dono (o `aceitaFiado`, o
        // "pagou não" dele). Não inventar sinônimo aqui é regra, não estilo.
        marcou: formas ? centavosSeTiver(formas.fiadoCents) : '',
        // O TOTAL em aberto sai do mapa INTEIRO — inclusive de quem não tem
        // nome no roster. Ele vem em centavos (o `devedores` do resumo já
        // converte), por isso `centavosSeTiver` e não `dinheiro`.
        emAberto: deve ? centavosSeTiver(totalAberto) : '',
      } : {}),
      ...(rosterR.status === 'fulfilled' && caixaR.status === 'fulfilled' ? {
        /* 🔴 O 3º campo é a linha de baixo do desenho ("3 marcações · a mais
           antiga de 28/07") e vai VAZIA DE PROPÓSITO: nem o `devedores` do
           resumo nem o `financeiro/saldos` entregam QUANTAS marcações são nem a
           data da mais antiga — os dois dão só o saldo. Sem porta, o slot some
           e sobra nome + valor. Contar cobrança aqui no celular seria uma 2ª
           conta de dívida, fadada a discordar do extrato. */
        devedores: linhasDevedor.map((id) => [
          iniciais(nomes.get(String(id))), esc(nomes.get(String(id))), '',
          centavos(Number(deve[id]) || 0), '',
        ]),
      } : {}),
      /* 🔴 A SEMANA NÃO TEM FONTE — e some INTEIRA, com o título junto.
         O desenho pede três números: recebido, marcado e pendência da semana.
         O `historicoDias` do resumo só traz o TOTAL de cada dia (`totalCents`),
         sem quebra por forma — então "recebido da semana" (dinheiro+pix+cartão)
         não existe em porta nenhuma. "Pendência" também não: o "em aberto" é
         saldo ACUMULADO, não da semana — publicá-lo debaixo do título "Semana"
         seria mentira de moldura, o número certo na caixa errada.
         E o "marcado" da semana eu NÃO ligo no `sum(totalCents)` de propósito,
         embora esse número exista: nesta tela, dois dedos acima, "Marcou" já
         significa FIADO. A mesma palavra com dois sentidos na mesma rolagem é
         pior que número faltando. (A tela Semana usa "Marcado" no sentido de
         total — lá é o vocabulário dela, aqui não.)
         Falta: `historicoDias[]` com as `formas` de cada dia. */
    });
  }

  /* 🔴 AS LINHAS DO EXTRATO LIAM CAMPOS QUE NÃO EXISTEM. Este bloco pedia
     `d.titulo`, `d.quando` e `d.creditos` — e o `getAdminStatement` devolve
     `{claimId, routeId, trackingSessionId, deliveryId, credits, paidCredits,
     completedAt}`. Nenhum dos três nomes batia: TODA linha caía no texto de
     reserva ("Entrega rastreada"), com a data VAZIA e o valor no `|| 0`. O dono
     abria o extrato e via uma pilha de linhas iguais dizendo que cada entrega
     custou ZERO crédito — número errado, na tela em que o número é o produto.
     Mesma coisa no bônus, que devolve `{sourceMonth, bonusCredits, grantedAt,
     status}`.

     🔴 O VALOR DA LINHA É `credits`, NÃO `paidCredits`. `paidCreditsConsumed` é
     a parcela que saiu de lote PAGO — a base do cashback, medida em
     `paidCreditsForUsage` (só `grantType === 'paid'`). Quem usou crédito de
     bônus veria "−0" numa entrega que tirou 2 da carteira. O que a linha do
     extrato responde é "quanto saiu daqui", e isso é `credits`. */
  function encherMovimento(e) {
    const uso = e.usage || {};
    const tot = e.totals || {};
    const linhas = [];
    (Array.isArray(e.trackedDeliveries) ? e.trackedDeliveries : []).forEach((d) => {
      const cr = Number(d && d.credits);
      linhas.push([
        'menos', 'Entrega rastreada', quandoDoExtrato(d && d.completedAt),
        String(isFinite(cr) && cr > 0 ? cr : 0),
      ]);
    });
    /* Bônus só entra CONCEDIDO. A tabela guarda a linha do mês desde que a
       varredura a cria (`ensureBonusRow`), muito antes de conceder: sem este
       filtro o extrato anunciaria um crédito de bônus que ainda não existe na
       carteira — promessa, não movimento. */
    (Array.isArray(e.bonuses) ? e.bonuses : []).forEach((b) => {
      const cr = Number(b && b.bonusCredits);
      if (!(cr > 0) || String(b && b.status).toUpperCase() !== 'GRANTED') return;
      const mes = mesRotulo(b && b.sourceMonth);
      const quando = b && b.grantedAt ? `creditado em ${diaCurto(b.grantedAt)}` : '';
      linhas.push(['mais', mes ? `Bônus de ${mes}` : 'Bônus', quando, String(cr)]);
    });
    window.usarDados('creditos', {
      movCarregando: false, movSemFonte: false,
      // Crédito é NÚMERO INTEIRO, nunca moeda — e zero some, como todo recorte.
      mes: mesRotulo(e.month),
      gastosHoje: seTiver(uso.hoje),
      gastosMes: seTiver(uso.mes),
      bonus: seTiver(tot.bonusCredits),
      linhas,
      vazio: 'Nenhum movimento neste mês',
    });
  }

  /** liga/desliga uma chave do servidor e recarrega — sem otimismo na tela */
  async function virarChave(campoConfig) {
    if (!config) return;
    await comTrava(async () => {
      const novo = !config[campoConfig];
      try { await window.API.patch('/logistica/config', { [campoConfig]: novo }); }
      catch (e) { return avisoErro(e); }
      await carregarAjustes();
      // A rota lê as MESMAS chaves pra decidir qual folha abre na porta: sem
      // isto, uma troca de modo só valeria na próxima abertura do app.
      await carregarRota();
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     TUTORIAL GUIADO — os FATOS que o motor do tour lê, e a PORTA que o abre.

     🔴 O OBRIGATÓRIO NÃO PODE NASCER DE DADO PINTADO. A abertura do app pinta
     SÍNCRONA e não repinta (é uma cena com relógio que termina em `ir('rota')`,
     recriando a camada inteira). Quem escrevesse "nunca viu" no seam e esperasse
     a tela reagir esperaria pra sempre — é o mesmo defeito que matou o pop-up da
     atualização no berço, em 09/08. Então o disparo é uma PORTA: quando a
     resposta do servidor chega dizendo que este USUÁRIO nunca viu, a ponte CHAMA
     `TUTOR.obrigatorio()`. O seam continua existindo, mas pra o motor DECIDIR
     qual capítulo existe — nunca pra abrir o tour.

     🔴 AUSENTE ≠ VAZIO, de novo e aqui — e neste seam o "não sei" tem UM lado
     seguro só. `carregando` segura o motor enquanto falta fonte, e
     `obrigatorioVisto` responde JÁ VIU até o servidor dizer o contrário: o
     obrigatório não tem X, então errar pro lado de disparar prende 90 s quem já
     o viu, toda vez que a rede falhar. Errar pro outro lado custa um boot.

     🔴 O CARIMBO É DO USUÁRIO, NÃO DO APARELHO. Por `localStorage` ele repetiria
     a cada reinstalação e sumiria no celular novo — a lição que o RECADO já
     custou. A lâmpada e a aula avançada continuam por aparelho (conveniência de
     leitura); a garantia do "todo cliente vai ler uma vez" é do servidor.
     ══════════════════════════════════════════════════════════════════════════ */

  /** o que o servidor DISSE: null = ainda não sei (nunca "não viu") */
  let tutorialVisto = null;
  /** a pergunta ao servidor já teve desfecho — resposta OU falha. Ver o freio. */
  let tutorialPerguntado = false;
  /* Nesta SESSÃO o obrigatório já foi aberto (ou já foi concluído). A porta é de
     um sentido só: sem isto, uma releitura reabriria o tour por cima de quem
     está no meio dele — ou de quem acabou de fechá-lo com a gravação no chão.
     Quem decide de novo é o próximo boot, lendo o servidor. */
  let obrigatorioResolvido = false;

  /* 🔴 "PODE LIGAR" É CAMPO DO SERVIDOR, NÃO DEDUÇÃO MINHA. O `GET
     /logistica/config` responde `prospectorDisponivel` — a chave-mestra da HBX
     (`HBX_PROSPECTOR_ENABLED`), servida a TODO ator, motorista inclusive.
     Deduzir por "o campo `prospectorAtivo` existe na resposta" daria SEMPRE
     verdadeiro: ele é serializado pra todo mundo, com default `false`. A chave
     apareceria nos Ajustes de empresa que não tem o recurso, e chave que não
     obedece é mentira. Backend velho, sem o campo: NÃO SEI ⇒ não ofereço. */
  const prospectorPodeLigar = () => (config && typeof config.prospectorDisponivel === 'boolean'
    ? (config.prospectorDisponivel ? 1 : 0)
    : 0);

  /* 🔴 "A EMPRESA LIGOU" NÃO É "ESTA PESSOA VÊ" (09/08). O prospector tem QUATRO
     chaves, não uma, e a régua de quem enxerga os prédios é do servidor:
     **admin sempre, funcionário só com `prospectorEquipe`**
     (`logistica-rota.service.ts:502`). Ensinar pelo `prospectorAtivo` sozinho
     poria o capítulo completo — "toque no prédio aceso" — na frente do motorista
     de uma empresa com `prospectorEquipe` desligado, que nunca verá prédio
     nenhum. Seria o tutorial FABRICANDO a pergunta besta que ele veio matar
     ("cadê os prédios que o app me ensinou?").
     Aqui a régua do servidor é traduzida UMA vez, num fato só: quem vê. */
  const prospectorEuVejo = () => {
    if (!config || !config.prospectorAtivo) return 0;
    return (ehAdmin() || config.prospectorEquipe) ? 1 : 0;
  };

  /* A MESMA régua da barra (`moduloDesligado` da casca), lida do MESMO CSV: não
     existe capítulo de Chat num app em que o admin apagou o Chat. */
  const moduloLigado = (k) => (String((config && config.appModulosDesativados) || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    .includes(String(k).toLowerCase()) ? 0 : 1);

  let tutorialAdiado = 0;

  /** os fatos do tour — traduzir, nunca decidir: quem esconde capítulo é o motor */
  function publicarTutorial() {
    if (typeof window.usarDados !== 'function') return;
    /* 🔴 NEM A MINHA PRÓPRIA ESCRITA REPINTA POR CIMA DO TOUR. Escrever no seam
       monta camada NOVA, e o tour vive dentro da camada: publicar isto no meio
       de um passo arrancaria o furo da tela. E ninguém está esperando o dado
       agora — o motor já leu o que precisava pra montar o capítulo (a porta
       abaixo só abre com os fatos COMPLETOS na tela). Espera ele sair. */
    if (tourRodando()) {
      if (!tutorialAdiado) {
        tutorialAdiado = setTimeout(() => { tutorialAdiado = 0; publicarTutorial(); }, 1500);
      }
      return;
    }
    const fatos = {
      /* `carregando` é o FREIO do motor: enquanto vale 1 ele não decide nada.
         Só cai quando as DUAS fontes tiveram desfecho — a config, que diz quais
         capítulos existem pra esta pessoa, e a pergunta do tutorial, que diz se
         o obrigatório já rodou. Derrubar o freio com uma delas pendente é deixar
         o motor decidir com meia verdade; e "pergunta que falhou" também é
         desfecho, senão o catálogo ficaria num esqueleto eterno por causa de
         uma porta que caiu. */
      carregando: (config && tutorialPerguntado) ? 0 : 1,
      /* 🔴 "NÃO SEI" RESPONDE **JÁ VIU** — e isto não é otimismo, é a única
         resposta segura. Pra o motor esta chave responde "posso pular o
         obrigatório?", e o obrigatório NÃO TEM X: disparar por ignorância
         prenderia 90 s num tutorial quem já o viu, toda vez que a rede falhasse.
         Quem ABRE o tour é a porta logo abaixo (`abrirObrigatorio`), e ela só é
         chamada com resposta na mão — então dizer 1 aqui não esconde nada de
         ninguém, e o próximo boot pergunta de novo. Só um "nunca visto" DITO
         pelo servidor vale 0. */
      obrigatorioVisto: tutorialVisto === false ? 0 : 1,
    };
    if (config) {
      fatos.admin = ehAdmin() ? 1 : 0;
      fatos.financeiro = config.moduloFinanceiroAtivo ? 1 : 0;
      fatos.prospectorAtivo = config.prospectorAtivo ? 1 : 0;
      fatos.prospectorDisponivel = prospectorPodeLigar();
      // "Esta pessoa vê os prédios?" — o fato que o capítulo completo pede.
      fatos.prospectorVejo = prospectorEuVejo();
      fatos.chat = moduloLigado('chat');
    }
    window.usarDados('tutorial', fatos);
    /* 🔴 A PORTA ABRE AQUI, E SÓ AQUI — depois de os fatos estarem NA TELA.
       Abrir direto no fim da resposta do tutorial era abrir cedo demais: a
       config pode chegar depois, e o motor filtraria os capítulos por `se:`
       com meia verdade (motorista virando admin, capítulo do prospector
       aparecendo pra quem não tem). As duas fontes têm ordem de chegada
       imprevisível; este ponto é o único em que as duas já chegaram. Config que
       nunca chega = tour que não abre nesta sessão, e está certo: o
       `carregarBarra` tenta de novo a cada minuto. */
    /* 🔴 O FREIO DE 09/08 02:0x SAIU — A CAUSA ERA O `mock.js` PELA METADE.
       O freio foi posto por um motivo REAL e bem medido no g15 (APK 205): abria
       o app, tocava "Vamos lá" e o aparelho ficava mudo — véu comendo o dedo,
       sem furo, sem balão, sem nada desenhado. Diagnóstico da época: o ramo de
       jornada do motor. Não era.

       O `casca-injetar` rodou ENTRE duas edições do motor e gerou um `mock.js`
       que CHAMAVA `acharAlvo()` sem DEFINIR a função (medido: 1 chamada, 0
       definições). É a Lei nº1 do injetor — estado assado pela metade. O APK 205
       nasceu desse arquivo, então o primeiro passo estourava `ReferenceError`
       exatamente DEPOIS de montar o véu e ANTES de desenhar furo e balão: o
       sintoma descrito, nos mínimos detalhes.

       Reinjetado, medido no g15 com o APK instalado (`function acharAlvo` = 1):
       a lâmpada desenha véu+furo+balão; o capítulo "Montar e iniciar a rota"
       sai dos Ajustes, navega sozinho pra Rota (o tal ramo de jornada, que a
       suspeita acusava) e crava o furo no botão certo; toque FORA não faz nada
       e não fecha; toque DENTRO abre a Montagem de verdade e anda pro passo 2,
       com o furo saltando pros chips de dia. Prints no relatório da sessão.

       LEI QUE FICA: quando o app quebra logo depois de uma injeção, o primeiro
       suspeito é o ARQUIVO GERADO, não a lógica recém-escrita. */
    abrirObrigatorio();
  }

  /** a PORTA — o único lugar do app que abre o tutorial obrigatório */
  function abrirObrigatorio() {
    if (obrigatorioResolvido) return;
    /* A abertura é uma cena com relógio e termina recriando a camada inteira:
       tour montado em cima dela morre no berço, sem deixar rastro. Espera a
       casa ficar de pé — a MESMA espera que o portão da atualização já faz. */
    if (telaAtual() === 'entrada') { setTimeout(abrirObrigatorio, 2500); return; }
    if (!window.TUTOR || typeof window.TUTOR.obrigatorio !== 'function') {
      // Casca sem o motor do tour. Silêncio aqui seria um tutorial obrigatório
      // que "não dispara" sem nenhuma pista de por quê.
      console.warn('[HBX ponte] tutorial: o servidor diz "nunca visto", mas esta casca não tem window.TUTOR.obrigatorio()');
      return;
    }
    obrigatorioResolvido = true;
    try { window.TUTOR.obrigatorio(); } catch (e) {
      // Recusou: devolve a porta, senão o próximo caminho que a chamasse
      // encontraria a sessão marcada como resolvida sem nada ter aberto.
      obrigatorioResolvido = false;
      console.warn('[HBX ponte] tutorial: o motor recusou abrir —', (e && e.message) || e);
    }
  }

  /** o estado do tutorial deste USUÁRIO. Porta própria, uma vez, no boot. */
  async function carregarTutorial() {
    if (!temPonte()) return;
    let r;
    try { r = await window.API.get('/logistica/tutorial'); } catch (e) {
      /* 🔴 FALHA AQUI É "NÃO SEI", NUNCA "NÃO VIU". Rede no chão — ou o endereço
         barrado DENTRO do aparelho pela lista branca do `NativeApiClient` —
         não pode empurrar um tutorial obrigatório em cima de quem já o viu.
         Fica sem porta e sem carimbo, e o próximo boot pergunta de novo. O
         aviso é de CONSOLE porque o motorista não tem o que fazer com esta
         falha: ela não tira nada da tela dele. */
      console.warn('[HBX ponte] tutorial: não consegui ler o estado —', (e && e.message) || e);
      tutorialPerguntado = true;
      publicarTutorial();
      return;
    }
    tutorialVisto = !!(r && r.obrigatorioVistoEm);
    tutorialPerguntado = true;
    // Quem abre a porta é o `publicarTutorial` — ele é o único que sabe se as
    // DUAS fontes já chegaram. Ver a lei escrita lá.
    publicarTutorial();
  }

  /* O motor chama esta função no último "Entendi". No mock ela nasce no-op (o
     desenho define o seam, a ponte põe a rede) — e a ponte carrega DEPOIS do
     mock, então esta linha é a que vale no aparelho.

     🔴 GRAVAÇÃO NO CHÃO NÃO PRENDE NINGUÉM E NÃO REPETE. O tutorial acabou na
     tela dele; falhar aqui só significa que o servidor ainda não sabe. Não há
     portão de erro — dizer "Não deu certo" logo depois de "Pronto pra rodar" é
     castigar quem fez tudo certo — e não há segunda tentativa nesta sessão:
     quem tenta de novo é o próximo boot, que relê o estado. */
  window.tutorialConcluido = function () {
    obrigatorioResolvido = true;
    if (!temPonte()) return;
    window.API.post('/logistica/tutorial/visto', {})
      .then(() => { tutorialVisto = true; publicarTutorial(); })
      .catch((e) => {
        console.warn('[HBX ponte] tutorial: não consegui gravar o "visto" —', (e && e.message) || e);
      });
  };

  /* ------------------------------------------------------------------------
     L8 — CHAT COM A CENTRAL (o único canal do motorista com o escritório).

     🔴 O PORTÃO DO RECADO É TRAVA, NÃO AVISO. Recado urgente/alarme que chegou
     e não teve "Entendi" segura a confirmação da entrega — é o ponto exato
     onde cobrar não atrapalha a rota nem põe ninguém em risco: ele está
     PARADO, com o celular na mão, prestes a fechar a parada.

     As rotas indicadas e as missões NÃO entram aqui: saíram no corte de 06/08
     (4 linhas na história inteira, servidas por 2.981 chamadas de poll).
     ------------------------------------------------------------------------ */
  let recados = [];
  let portaoRecados = [];

  const horaCurta = (iso) => hora(iso);

  async function carregarRecados() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const [fioR, portaoR] = await Promise.allSettled([
      window.API.get('/logistica/recados/me'),
      window.API.get('/logistica/recados/portao'),
    ]);
    /* 🔴 FALHA DE REDE NÃO APAGA A TELA. "Vazio porque o servidor disse vazio"
       e "vazio porque a rede caiu" são coisas OPOSTAS, e escrever as duas do
       mesmo jeito faria o fio de recados sumir e o sino zerar no meio da rua.
       O portão pegou isto: no navegador do conferidor as duas chamadas falham
       e o sino ia de 2 pra 0 — 60 das 66 telas mudaram por causa do
       cabeçalho. Sem o fio, não se toca no seam. */
    if (fioR.status !== 'fulfilled' || !Array.isArray(fioR.value)) return fonteCaiu('chat');
    recados = fioR.value;
    // O portão é uma segunda fonte: se SÓ ele falhou, mantém o que já valia —
    // deixar de cobrar o "Entendi" por causa de um erro de rede seria afrouxar
    // uma trava, e trava não se afrouxa sozinha.
    if (portaoR.status === 'fulfilled' && Array.isArray(portaoR.value)) portaoRecados = portaoR.value;
    const pendente = portaoRecados[0] || null;
    window.usarDados('chat', {
      ...fonteVoltou,
      recado: pendente ? esc(pendente.texto) : '',
      // O título é do MOCK e é sempre verdade: quem manda recado é a Central.
      // Montar "Recado de {autor}" me deu "Recado de Central" na tela — nome
      // de gente no lugar de instituição vira português torto.
      recadoTitulo: 'Recado da Central',
      /* O 4º slot é o ANEXO (12/08) — a parada/rota que a Central grudou no
         texto. `undefined` na esmagadora maioria das linhas, e é ele que faz a
         bolha crescer os botões. Ver L8d (`A5-recado-anexo.js`). */
      conversa: recados.map((r) => [
        r.origem === 'motorista' ? 'minha' : 'deles',
        esc(r.texto),
        horaCurta(r.criadoEm),
        anexoDoSeam(r),
      ]),
      // Fio vazio não é erro: é o dia em que ninguém precisou falar nada.
      vazio: recados.length ? '' : 'Nenhum recado por aqui',
      sino: contarNaoLidos(),
    });
    encostarNoPe();
  }

  /* O fio que passa da tela: o CSS não alcança (o `margin-top:auto` some quando
     o conteúdo estoura) e o chat abria na mensagem mais VELHA, com o campo de
     escrever fora da tela.

     🔴 A RÉGUA É A CAMADA, NÃO A MENSAGEM. Tentei guardar "última mensagem já
     vista" e não funcionou: `usarDados` repinta SÍNCRONO (`pintar(false)`) e
     cada repinte cria uma `.tela` NOVA, com `scrollTop` zerado — o `aoAbrirChat`
     sozinho repinta duas vezes (carrega o fio, marca visto, recarrega), então a
     segunda pintura desfazia a rolagem da primeira e a marca dizia "já desci".
     Medido no g15: o fio comprido abria na "Linha 1".

     Camada NOVA = pintura nova = desce. Camada que eu já desci = o dedo é o
     dono da rolagem, e ninguém arranca a leitura de quem voltou pra trás. */
  let ultimoCorpoChat = null;
  function encostarNoPe() {
    if (telaAtual() !== 'chat') return;
    requestAnimationFrame(() => {
      const corpo = naCamada('.body.chat-corpo');
      if (!corpo || corpo === ultimoCorpoChat) return;
      ultimoCorpoChat = corpo;
      corpo.scrollTop = corpo.scrollHeight;
    });
  }

  /** o número do sino: recado do ESCRITÓRIO que este aparelho ainda não abriu */
  function contarNaoLidos() {
    return recados.filter((r) => r && r.origem === 'escritorio' && !r.vistoEm).length;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     L8b — A ESCADA DE FORÇA DO RECADO (restaurada em 08/08).

     🔴 ELA EXISTIA E MORREU CALADA. A fusão de 07/08 (`8a491ffe`) tirou o
     `app.js` de 13.504 linhas do APK, e com ele saiu o ÚNICO leitor do campo
     `nivel`. O servidor continuou gravando normal/urgente/alarme, o cockpit
     continuou mostrando ✓✓, o Kotlin continuou com o despertador de pé — e o
     celular ficou mudo nos três degraus. Bug de FRONTEIRA: nenhum lado estava
     quebrado, o fio entre eles é que não existia mais.

     A escada é decidida no SERVIDOR (`nivel`) e obedecida aqui:
       normal  → aviso na tela + sino. Sem barulho, de propósito.
       urgente → vibra, toca `warning`, FALA em voz alta e trava o PORTÃO.
       alarme  → despertador NATIVO (MissaoAlarme), que fura Doze e tela apagada.

     🔴 POR QUE NÃO SEQUESTRAR A TELA NO URGENTE: o cara está DIRIGINDO com o
     mapa aberto. Tomar a tela é perigoso e o Android moderno nem garante. A
     cobrança do clique acontece onde ele JÁ vai tocar no celular PARADO — na
     confirmação da entrega. Clique garantido, rota intacta, motorista vivo.

     🔴 O PULL É O QUE DÁ DENTE AO PORTÃO. `recados/portao` só cobra recado com
     `entregueEm` preenchido, e quem preenche é `recados/recebidos`. Sem este
     canal o portão devolvia lista vazia PARA SEMPRE: o "Entendi" nunca era
     cobrado e o urgente não tinha nenhuma força — nem som, nem trava.

     O push (FCM) é o caminho rápido; o relógio de 10 s é o paraquedas de quem
     está sem Firebase. `carregarBarra` já paga 1 chamada por minuto: recado é
     mais urgente que configuração, e continua sendo UMA chamada por vez.
     ══════════════════════════════════════════════════════════════════════════ */
  /* 5 s NÃO é chute: `PULSO_ABERTO_MS` do servidor é 15 s, e é ESTE poll que
     carrega o `tela` que decide "no app / fora do app" no painel do master.
     Com 10 s um poll lento já passava dos 15 e o aparelho piscava pra "fora do
     app" com o motorista olhando pra tela. A cadência e a janela são um par —
     mexer numa sem a outra faz o painel mentir. */
  const RECADOS_POLL_MS = 5000;
  /** Recado velho não grita. Aparelho que passou o dia desligado não pode
      acordar tocando 20 alarmes de ontem — o PORTÃO continua cobrando o
      "Entendi" deles (trava não expira), só o barulho é que tem validade. */
  const ALERTA_FORTE_VALIDADE_MS = 2 * 60 * 60 * 1000;
  let recadosChecando = false;
  const recadosAlertados = new Set();

  const falar = (t) => { try { window.HBX.speak(String(t || '').slice(0, 300)); } catch (_) {} };
  const vibrar = (ms) => { try { window.HBX.vibrate(ms); } catch (_) {} };
  const tocarSom = (chave) => { try { window.HBX.sound(chave); } catch (_) {} };
  const recente = (iso) => {
    const t = new Date(iso || 0).getTime();
    return Number.isFinite(t) && Date.now() - t <= ALERTA_FORTE_VALIDADE_MS;
  };

  /** o cartão que desce do sino, com o texto DE VERDADE que o escritório mandou */
  function avisoDeRecado(recado, forte) {
    if (typeof window.avisar !== 'function') return;
    const titulo = recado.nivel === 'alarme' ? 'ALARME da Central'
      : recado.nivel === 'urgente' ? 'URGENTE · Recado da Central'
        : 'Recado da Central';
    window.avisar({ ico: forte ? 'alert' : 'chat', cls: forte ? 'alerta' : '', titulo, sub: esc(recado.texto) });
  }

  /**
   * O degrau de UM recado que acabou de chegar. Nunca duas vezes o mesmo id:
   * o servidor repete o recado até o ✓ de `recebidos`, e repetir alerta seria
   * o app gritando o mesmo aviso de 10 em 10 segundos.
   */
  function alertarRecado(recado, atrasoAlarme) {
    const id = String(recado.id || '');
    if (!id || recadosAlertados.has(id)) return;
    recadosAlertados.add(id);
    const nivel = String(recado.nivel || 'normal');
    const forte = nivel === 'urgente' || nivel === 'alarme';
    // Recado velho entra no fio e no sino, sem barulho. Ver a validade acima.
    if (forte && !recente(recado.criadoEm)) { avisoDeRecado(recado, true); return; }

    if (nivel === 'alarme') {
      // Com a conversa JÁ ABERTA não se arma sirene por baixo da tela: ele está
      // olhando pro recado. Lê em voz alta e pronto.
      if (telaAtual() === 'chat') { falar(`Alarme da central. ${recado.texto}`); return; }
      // O prefixo `recado_` é o que faz o Kotlin tratar isto como RECADO e não
      // como missão de rota (`ehAlarmeDeRecado`): a tela cheia diz "RESPONDER"
      // em vez de "ACEITAR", e a resposta volta pelo `RecadoPendente`.
      const armado = window.HBX.missaoAlarme(
        `recado_${id}`, Date.now() + 1500 + atrasoAlarme, 'Recado da central', String(recado.texto || ''),
      );
      // Sem ponte nativa (ou alarme recusado pelo sistema) o recado NÃO pode
      // passar em silêncio: cai no degrau de baixo, que é barulho de app.
      if (armado) return;
    }
    if (forte) {
      vibrar(200);
      tocarSom('warning');
      falar(nivel === 'alarme' ? `Alarme da central. ${recado.texto}` : `Recado urgente da central. ${recado.texto}`);
    } else {
      tocarSom('sync_complete');
    }
    avisoDeRecado(recado, forte);
  }

  /**
   * O PULSO — puxa o que ainda não chegou, alerta e só então confirma o ✓✓.
   *
   * A ordem importa: o ✓ de `recebidos` é o que faz o servidor PARAR de mandar.
   * Confirmar antes de alertar transformaria uma falha no meio do caminho em
   * recado entregue que nunca avisou ninguém.
   */
  async function pulsoRecados() {
    if (!temPonte() || recadosChecando) return;
    recadosChecando = true;
    try {
      // `v: 2` pede o envelope; APK sem o campo recebe a lista crua (o servidor
      // mantém os dois contratos). `tela` é o PULSO DO APP — de carona, sem
      // requisição nova: é como a Central sabe em que tela o motorista está.
      const resposta = await window.API.post('/logistica/recados/pendentes', { tela: telaAtual() || '', v: 2 });
      const envelope = resposta && !Array.isArray(resposta) && typeof resposta === 'object' ? resposta : null;
      // O envelope traz DUAS coisas. Ler só os recados e jogar fora o `espelho`
      // era o "Ver tela" esperando pra sempre — ver L8c.
      if (envelope) espelhoSincronizar(!!envelope.espelho, !!envelope.espelhoCss);
      const lista = Array.isArray(resposta) ? resposta
        : (envelope && Array.isArray(envelope.recados) ? envelope.recados : []);
      if (!lista.length) return;
      let atraso = 0;
      for (const recado of lista) {
        if (!recado || recado.origem !== 'escritorio') continue;
        alertarRecado(recado, atraso);
        // Dois alarmes no mesmo segundo viram um só toque: o AlarmManager
        // substitui o PendingIntent do mesmo requestCode. Escalona.
        if (recado.nivel === 'alarme') atraso += 7000;
      }
      const ids = lista.map((r) => String(r && r.id || '')).filter(Boolean);
      if (ids.length) await window.API.post('/logistica/recados/recebidos', { ids });
      // O fio e o portão leem o estado NOVO (entregueEm preenchido) — é isto
      // que acende o cartão do "Entendi" e arma a trava da entrega.
      await carregarRecados();
    } catch (_) {
      // Rede fora = silêncio. O próximo tique tenta de novo e o servidor
      // guarda o recado até o ✓ chegar: nada se perde aqui.
    } finally { recadosChecando = false; }
  }

  setInterval(pulsoRecados, RECADOS_POLL_MS);
  /* O push é só campainha: o Kotlin dispara este evento e o pulso acima é que
     vai buscar o conteúdo. Sem ouvinte deste evento — que é como o app ficou
     depois da fusão — o FCM acordava o aparelho para NADA. */
  document.addEventListener('hbx:push-wake', pulsoRecados);
  /* Tocou na notificação do sistema (ou no "Responder" da tela do alarme): a
     caixa de recados abre, que é o que a pessoa pediu ao tocar. */
  document.addEventListener('hbx:open-recados', () => {
    drenarRespostaDoAlarme();
    if (typeof window.ir === 'function') window.ir('chat');
  });

  /**
   * O QUE A PESSOA APERTOU NA TELA CHEIA DO ALARME.
   *
   * A `MissaoAlarmeActivity` não fala com o backend de propósito: lá não há
   * sessão nem tenant. Ela ANOTA a resposta (`RecadoPendente`, persistido em
   * SharedPreferences) e acorda o app — quem executa é este JS. Sem este
   * dreno, o "Entendi" da tela cheia ficava guardado no aparelho PARA SEMPRE:
   * a pessoa respondia, a central nunca via, e o portão continuava cobrando o
   * mesmo recado na próxima entrega.
   */
  async function drenarRespostaDoAlarme() {
    let bruto = '';
    try { bruto = window.HBX.recadoRespostaPendente() || ''; } catch (_) { return; }
    if (!bruto) return;
    let resposta = null;
    try { resposta = JSON.parse(bruto); } catch (_) { return; }
    const id = String((resposta && resposta.id) || '').replace(/^recado_/, '');
    if (!id) return;
    cancelarSirene(id);
    // "responder" é o dedo indo pro campo de texto — a mensagem é dele, e o
    // slot só se limpa quando o POST do "Entendi" volta ok (rede caída no meio
    // não pode apagar a resposta que a pessoa já deu).
    if (resposta.acao !== 'entendi') return;
    try { await window.API.post(`/logistica/recados/${encodeURIComponent(id)}/entendi`, {}); }
    catch (_) { return; }
    try { window.HBX.recadoRespostaConcluir(id); } catch (_) {}
    await carregarRecados();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     L8c — VER TELA: o espelho do NOSSO app (portado em 08/08).

     🔴 O QUARTO ÓRFÃO DA FUSÃO. O `espelho` sempre viajou no MESMO envelope do
     poll de recados (`v: 2`), e quem o lia era o `app.js` que saiu do APK. Sem
     leitor, o painel do master abria a janela de 60 s e ficava em "aguardando o
     aparelho…" pra sempre — e ninguém via, porque o botão "Ver tela" só liga com
     o aparelho pulsando, e o pulso também estava morto. Consertar o pulso ACENDEU
     o botão e revelou este.

     NÃO é print do sistema nem MediaProjection: é a MARCAÇÃO da tela do HBX
     (padrão session replay). O WhatsApp, a galeria e a tela de bloqueio de
     ninguém passam por aqui.

     Três invariantes que não se afrouxam:
      1. Só liga quando o SERVIDOR manda (`espelho: true`); a janela dura 60 s e
         fechar o painel para o app sozinho.
      2. DIGITAÇÃO SAI MASCARADA DAQUI. Mascarar do outro lado é tarde demais.
      3. Quadro é enfeite de suporte: falha de rede é silêncio, nunca um toast na
         mão de quem está dirigindo.
     ══════════════════════════════════════════════════════════════════════════ */
  const ESPELHO_MS = 2000;
  /** Tetos espelhados do servidor (`espelho-app.service.ts`). */
  const ESPELHO_HTML_MAX = 400000;
  const ESPELHO_CSS_MAX = 300000;
  const ESPELHO_CSS_MARCA = 'espelho-css-marca';
  let espelhoTimer = null;
  let espelhoEnviando = false;
  let espelhoPrecisaCss = false;

  /* O servidor só pede CSS quando a VERSÃO muda — e `appVersion` é o versionName
     ("alpha1"), que não muda entre builds. Isso já pintou o HTML novo com o CSS
     velho no painel do dono. Quem decide aqui é o CONTEÚDO: uma marca barata
     (tamanho + hash) do próprio CSS, reenviada quando ela muda. */
  const espelhoMarcaDoCss = (css) => {
    let h = 0;
    for (let i = 0; i < css.length; i++) h = (Math.imul(h, 31) + css.charCodeAt(i)) | 0;
    return `${css.length}:${h}`;
  };

  function espelhoSincronizar(ativo, precisaCss) {
    espelhoPrecisaCss = !!precisaCss;
    if (ativo && !espelhoTimer) {
      // Uma leitura do CSSOM por ATIVAÇÃO, nunca por quadro: a folha tem ~200 KB
      // e reler isso de 2 em 2 s é pagar caro por uma pergunta que quase sempre
      // responde "não mudou".
      try {
        if (!espelhoPrecisaCss && espelhoMarcaDoCss(espelhoCss()) !== window.HBX.cache.get(ESPELHO_CSS_MARCA, '')) {
          espelhoPrecisaCss = true;
        }
      } catch (_) { /* CSSOM indisponível: vale a régua do servidor */ }
      espelhoTimer = setInterval(() => { void espelhoMandarQuadro(); }, ESPELHO_MS);
      void espelhoMandarQuadro();
      return;
    }
    if (!ativo && espelhoTimer) { clearInterval(espelhoTimer); espelhoTimer = null; }
  }

  /** O CSS do app inteiro, do CSSOM (a página é `appassets…`, mesma origem). */
  function espelhoCss() {
    try {
      return [...document.styleSheets]
        .map((folha) => { try { return [...folha.cssRules].map((r) => r.cssText).join('\n'); } catch (_) { return ''; } })
        .join('\n');
    } catch (_) { return ''; }
  }

  /**
   * 🔴 A ROLAGEM DE DENTRO (08/08) — o que faz o painel ver a MESMA parada.
   *
   * `window.scrollY` é 0 no app inteiro: a janela não rola, quem rola é o MIOLO
   * da tela (a lista de paradas, o corpo do chat). Com só o `sy` da janela, o
   * motorista estava na parada 45 e o dono via a 1 — "ver a tela dele" mostrando
   * outra tela, que é o mesmo defeito que a medida errada causa.
   *
   * `scrollTop` é estado de runtime: não existe no `outerHTML`, então não viaja
   * de graça no clone. Aqui ele vira DESENHO — o miolo recortado e o conteúdo
   * empurrado pra cima na medida exata. Vale a mesma regra da máscara: o
   * pareamento é por ÍNDICE (clone profundo tem a mesma ordem), e por isso esta
   * passada roda ANTES de qualquer remoção no clone.
   */
  function espelhoRolagemDeDentro(raiz, copia) {
    const vivos = raiz.querySelectorAll('*');
    const clones = copia.querySelectorAll('*');
    const total = Math.min(vivos.length, clones.length);
    for (let i = 0; i < total; i++) {
      const vivo = vivos[i];
      const st = Math.round(vivo.scrollTop || 0);
      const sl = Math.round(vivo.scrollLeft || 0);
      // 4 px de folga: rolagem de 1 px é resíduo de toque, não é a tela dele.
      if (st < 4 && sl < 4) continue;
      const filho = clones[i].firstElementChild;
      if (!filho) continue;
      const base = vivo.firstElementChild ? getComputedStyle(vivo.firstElementChild) : null;
      const mt = base ? parseFloat(base.marginTop) || 0 : 0;
      const ml = base ? parseFloat(base.marginLeft) || 0 : 0;
      clones[i].style.overflow = 'hidden';
      if (st >= 4) filho.style.marginTop = `${mt - st}px`;
      if (sl >= 4) filho.style.marginLeft = `${ml - sl}px`;
    }
  }

  /**
   * A tela como MARCAÇÃO: sem script, sem mapa (canvas WebGL não viaja) e com
   * todo campo digitável mascarado. O clone nasce ANTES de qualquer edição —
   * mexer no DOM vivo aqui seria mexer na tela de quem está trabalhando.
   */
  function espelhoMarcacao() {
    const raiz = document.getElementById('app');
    if (!raiz) return '';
    const copia = raiz.cloneNode(true);
    /* A MEDIDA DA TELA DELE. Sem isto o painel desenha o app no tamanho do
       MONITOR: o dono vê 4 paradas onde o motorista vê 6, e "ver a tela do
       cliente" mostra outra tela. Viaja como atributo DENTRO da marcação de
       propósito — o quadro já vai inteiro, então a medida não custa coluna no
       banco nem versão nova de contrato. `sy` é o que faz o painel ver a MESMA
       parte da lista. */
    copia.dataset.espelhoVw = String(Math.round(window.innerWidth || 0));
    copia.dataset.espelhoVh = String(Math.round(window.innerHeight || 0));
    copia.dataset.espelhoDpr = String(window.devicePixelRatio || 1);
    copia.dataset.espelhoSy = String(Math.round(window.scrollY || 0));
    espelhoRolagemDeDentro(raiz, copia);
    copia.querySelectorAll('script,iframe,object,embed,link,noscript').forEach((el) => el.remove());
    // O mapa é canvas WebGL: no clone vem em branco. Vira caixa com rótulo, pra
    // a tela do painel não parecer quebrada.
    copia.querySelectorAll('canvas').forEach((el) => {
      const caixa = document.createElement('div');
      caixa.className = el.className;
      caixa.textContent = 'mapa';
      el.replaceWith(caixa);
    });
    // 🔴 INVARIANTE 2. A ordem do `querySelectorAll` é a mesma no clone e no vivo
    // (clone profundo), então dá pra parear por índice — e o `.value` digitado
    // NÃO está no HTML, só no objeto vivo: sem este pareamento a máscara
    // silenciosamente não mascararia nada.
    const vivos = raiz.querySelectorAll('input,textarea');
    copia.querySelectorAll('input,textarea').forEach((el, indice) => {
      const vivo = vivos[indice];
      const digitado = vivo ? String(vivo.value || '') : String(el.getAttribute('value') || '');
      const mascara = digitado ? '•••' : '';
      if (el.tagName === 'TEXTAREA') el.textContent = mascara;
      else el.setAttribute('value', mascara);
    });
    copia.querySelectorAll('[contenteditable]').forEach((el) => {
      if (String(el.textContent || '').trim()) el.textContent = '•••';
    });
    return copia.outerHTML;
  }

  async function espelhoMandarQuadro() {
    if (espelhoEnviando) return;
    espelhoEnviando = true;
    try {
      const marcacao = espelhoMarcacao();
      if (!marcacao) return;
      // Tela maior que o teto do servidor: manda UMA LINHA dizendo isso, em vez
      // de um quadro que vai ser recusado. Recusa em série pararia o espelho e o
      // painel ficaria "aguardando o aparelho…" sem ninguém saber por quê.
      const html = marcacao.length <= ESPELHO_HTML_MAX
        ? marcacao
        : `<div class="app"><section class="card flat">Tela grande demais para o espelho (${Math.round(marcacao.length / 1024)} KB).</section></div>`;
      const corpo = {
        tela: telaAtual() || '',
        html,
        // 🔴 A LUZ, não o "theme". O app novo pinta por `data-luz` no <html> (é o
        // que a folha do mock lê); mandar outra coisa aqui devolveria o espelho
        // sempre no tema escuro, com o motorista no claro.
        tema: document.documentElement.dataset.luz || '',
        bodyClass: document.body.className || '',
      };
      let marcaEnviada = '';
      if (espelhoPrecisaCss) {
        const css = espelhoCss();
        marcaEnviada = css ? espelhoMarcaDoCss(css) : '';
        /* O cliente nativo recusa corpo acima de ~512 mil caracteres. CSS que não
           cabe é DESISTIDO (o espelho sai cru), NUNCA reenviado: senão o app
           entraria num laço de requisição gigante recusada a cada 2 s — e laço
           livre no cliente é sempre bug (lei do disjuntor). */
        if (css && css.length <= ESPELHO_CSS_MAX) corpo.css = css;
        else espelhoPrecisaCss = false;
      }
      const saida = await window.API.post('/logistica/espelho/quadro', corpo);
      // Servidor aceitou o quadro COM o CSS: para de mandar os 200 KB e grava a
      // marca do que subiu — é ela que decide o próximo reenvio.
      if (saida && saida.ok && espelhoPrecisaCss) {
        espelhoPrecisaCss = false;
        if (marcaEnviada) window.HBX.cache.set(ESPELHO_CSS_MARCA, marcaEnviada);
      }
      // Recusa (a janela fechou no meio) = para o laço na hora, sem esperar o
      // próximo poll: enfeite de suporte não fica batendo à toa.
      if (saida && saida.ok === false) espelhoSincronizar(false, false);
    } catch (_) { /* rede fora = silêncio; o próximo tique tenta de novo */ }
    finally { espelhoEnviando = false; }
  }

  /**
   * A TRAVA. Chamada ANTES de fechar a parada: recado urgente/alarme que já
   * está no aparelho e não teve "Entendi" segura o desfecho e mostra o texto.
   * Devolve `true` = travou (o chamador para aqui).
   */
  function travaDoRecado() {
    const alvo = portaoRecados[0];
    if (!alvo || typeof window.portao !== 'function') return false;
    window.portao({
      tom: 'alerta', ico: 'bell', titulo: 'Recado da Central',
      sub: esc(alvo.texto),
      // Sem escape de propósito: é o degrau que o dono pediu, "o nível que
      // atrapalha a rota se ele não clicar". O `handleBack` já engole o Voltar
      // de portão sem escape, então a trava não tem porta dos fundos.
      acoes: [['Entendi', 'principal', false]],
    });
    const b = naCamada('.portao-wrap .principal');
    if (b) b.addEventListener('click', () => { entendiRecado(); }, { once: true });
    return true;
  }

  /** abrir o chat é LER: marca visto e o sino zera (o portão continua de pé) */
  async function aoAbrirChat() {
    /* Voltar pro Chat é começar de novo: o motivo que ele ia escrever e não
       escreveu morre aqui. Alvo de resposta que sobrevive à saída da tela
       grudaria a próxima mensagem — de outro assunto — no recado negado ontem. */
    limparMotivoDoAnexo();
    await carregarRecados();
    /* Regra do dono (03/08): abrir a conversa CALA toda repetição forte. Ele
       está lendo — insistir vira ruído. O portão continua cobrando o "Entendi";
       só a sirene é que para.
       ⚠️ SEM filtrar por `ackEm`: recado já respondido é justamente o que mais
       precisa calar, e filtrá-lo deixava a corrente do alarme viva por meia
       hora depois do "Entendi" (medido no g15, 08/08 — o app pulava sozinho
       pro Chat de 2 em 2 minutos). Cancelar é idempotente: cancelar o que já
       morreu não custa nada. */
    recados
      .filter((r) => r && r.origem === 'escritorio' && r.nivel === 'alarme')
      .forEach((r) => cancelarSirene(r.id));
    // ⚠️ `marcarVisto` exige a LISTA de ids — corpo vazio marca ZERO e volta
    // "ok" (medido: o sino ficava em 2 depois de abrir a conversa). Ele só
    // aceita recado do escritório, então mandar os meus não faria nada de
    // qualquer jeito; mando exatamente os que ainda não foram lidos.
    const naoLidos = recados.filter((r) => r.origem === 'escritorio' && !r.vistoEm).map((r) => r.id);
    if (!naoLidos.length) return;
    try { await window.API.post('/logistica/recados/visto', { ids: naoLidos }); } catch (_) { return; }
    await carregarRecados();
  }

  async function entendiRecado() {
    const alvo = portaoRecados[0];
    if (!alvo) return;
    await comTrava(async () => {
      try { await window.API.post(`/logistica/recados/${encodeURIComponent(alvo.id)}/entendi`, {}); }
      catch (e) { return avisoErro(e); }
      /* 🔴 O "ENTENDI" TEM QUE CALAR A SIRENE. O despertador nativo cutuca de 2
         em 2 minutos e só a RESPOSTA mata a corrente (`MissaoAlarme.cancelar`);
         o ack no servidor não chega até o AlarmManager. Medido no g15: recado
         já respondido continuou abrindo a tela cheia por meia hora. */
      cancelarSirene(alvo.id);
      await carregarRecados();
    });
  }

  /** mata a corrente nativa de um recado — idempotente, e a única saída dela */
  function cancelarSirene(id) {
    try { window.HBX.missaoAlarmeCancelar(`recado_${String(id || '')}`); } catch (_) {}
  }

  async function enviarRecado() {
    const el = naCamada('[data-campo="recado-texto"]');
    const texto = el ? String(el.value || '').trim() : '';
    if (!texto) return;
    await comTrava(async () => {
      // clientMessageId: toque duplo ou retry de rede devolve a MESMA resposta
      // em vez de criar dois balões na central.
      const corpo = { texto, clientMessageId: window.HBX.uuid(), date: diaOperacional() };
      /* 🔴 O MOTIVO DO "NEGAR" TEM DONO (12/08). Quem acabou de negar um anexo
         está escrevendo a justificativa DAQUELE recado — e o portão pode estar
         cobrando outro assunto. Sem esta preferência, o "não vou conseguir
         passar lá" chegaria na central pendurado na mensagem errada. */
      const alvo = recadoIdDoMotivo() || (portaoRecados[0] && portaoRecados[0].id) || '';
      if (alvo) corpo.recadoId = alvo;
      try { await window.API.post('/logistica/recados/responder', corpo); }
      catch (e) { return avisoErro(e); }
      // Só o envio confirmado solta o alvo: rede caída no meio não pode
      // transformar a próxima tentativa em resposta de outro assunto.
      limparMotivoDoAnexo();
      if (el) el.value = '';
      await carregarRecados();
    });
  }

  /* ------------------------------------------------------------------------
     L7 — PRODUTOS (o catálogo, que é de onde sai o preço de TODA entrega).

     ⚠️ O catálogo do celular devolve `{id, nome, unidade, usaLogistica,
     precoCatalogo}` — SEM estoque e SEM categoria, embora as duas colunas
     existam na tabela e o PATCH até aceite `estoque`. Ou seja: dá pra ESCREVER
     estoque e não dá pra LER. Campo assim é o pior de todos — o dono digitaria
     por cima do estoque real sem ver o que estava lá. Por isso o campo Estoque
     e os contadores que dependem dele não aparecem. Está na mão do dono.

     O catálogo inteiro vem numa resposta só (sem paginação), então a busca
     filtra AQUI — e isso é honesto justamente porque a lista inteira já está
     no aparelho. Na tela de Clientes é o contrário, e por isso lá vai pro
     servidor: são coisas diferentes, não incoerência.
     ------------------------------------------------------------------------ */
  const PRODUTOS = new Map();
  let filtroProdutos = { busca: '' };
  let produto = null;

  /** "R$ 11,00" / "11,00" → 11. Vazio ou lixo → null (não vira zero). */
  const paraNumero = (txt) => {
    const limpo = String(txt || '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(limpo);
    return limpo !== '' && isFinite(n) ? n : null;
  };

  async function carregarProdutos() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    let r;
    try { r = await window.API.get('/logistica/produtos'); } catch (_) { return fonteCaiu('produtos'); }
    const todos = Array.isArray(r) ? r : [];
    PRODUTOS.clear();
    todos.forEach((p) => { if (p && p.id != null) PRODUTOS.set(String(p.id), p); });
    const busca = filtroProdutos.busca.trim().toLowerCase();
    const lista = busca
      ? todos.filter((p) => String(p.nome || '').toLowerCase().indexOf(busca) >= 0)
      : todos;
    window.usarDados('produtos', {
      ...fonteVoltou,
      busca: esc(filtroProdutos.busca),
      // Sem categoria no payload, a fileira de chips inteira SOME. Um filtro
      // com uma opção só ("Todos") é enfeite com cara de controle.
      categorias: [],
      lista: lista.map((p) => [
        esc(p.nome),
        // 🔴 ESTOQUE SÓ EXISTE SE A EMPRESA LIGOU (o campo só vem do servidor
        // com `estoqueAtivo` no perfil fiscal — quem decide é o ADMIN, no
        // desktop). Sem ele a linha diz a unidade, como antes.
        typeof p.estoqueDisponivel === 'number'
          ? `Estoque: ${p.estoqueDisponivel} un.`
          : esc(p.unidade),
        typeof p.precoCatalogo === 'number' ? p.precoCatalogo.toFixed(2).replace('.', ',') : '',
        'azul',
        String(p.id),
      ]),
      ativos: String(todos.length),
      estoqueBaixo: '',
      valorEstimado: '',
    });
  }

  function abrirProduto(id) {
    const p = PRODUTOS.get(String(id));
    if (!p || typeof window.usarDados !== 'function') return;
    produto = { id: String(id), item: p, rascunho: {} };
    encherProduto();
    window.ir('fichaproduto');
  }

  function encherProduto() {
    if (!produto) return;
    const p = produto.item || {};
    const r = produto.rascunho || {};
    const v = (k, servidor) => (r[k] !== undefined ? esc(r[k]) : esc(servidor));
    window.usarDados('fichaproduto', {
      nome: v('produto-nome', p.nome),
      // "no catálogo desde… · N entregas" não vem em porta nenhuma do celular.
      resumo: '',
      selo: p.usaLogistica ? 'ativo' : '',
      unidade: v('produto-unidade', p.unidade),
      preco: v('produto-preco', typeof p.precoCatalogo === 'number' ? dinheiro(p.precoCatalogo) : ''),
      // Número, não moeda — e SÓ LEITURA: este saldo é derivado da trilha de
      // movimentos (entrada, reserva, baixa). Corrigir é fazer contagem de
      // inventário no desktop, não digitar por cima aqui.
      estoque: typeof p.estoqueDisponivel === 'number' ? String(p.estoqueDisponivel) : '',
      estoqueDica: 'disponível hoje · vem do controle de estoque',
    });
  }

  async function salvarProduto() {
    if (!produto) return;
    await comTrava(async () => {
      const p = produto.item || {};
      const corpo = {};
      const nome = campo('produto-nome');
      const unidade = campo('produto-unidade');
      const preco = paraNumero(campo('produto-preco'));
      if (nome && nome !== String(p.nome || '')) corpo.nome = nome;
      if (unidade !== String(p.unidade || '')) corpo.unidade = unidade;
      // 🔴 PREÇO SÓ VIAJA SE VIROU NÚMERO. Campo apagado ou digitado errado não
      // pode virar 0 — este é o preço de TODA entrega deste produto.
      if (preco != null && preco !== Number(p.precoCatalogo)) corpo.preco = preco;
      if (!Object.keys(corpo).length) {
        return window.portao({
          tom: 'info', ico: 'check', titulo: 'Nada mudou', sub: 'O produto já está assim.',
          acoes: [['Fechar', '']],
        });
      }
      const gravar = async () => {
        try { await window.API.patch(`/logistica/produtos/${encodeURIComponent(produto.id)}`, corpo); }
        catch (e) { return avisoErro(e); }
        await carregarProdutos();
        const atualizado = PRODUTOS.get(produto.id);
        if (atualizado) produto.item = atualizado;
        produto.rascunho = {};
        encherProduto();
        window.portao({ tom: 'ok', ico: 'check', titulo: 'Produto salvo', sub: '', acoes: [['Fechar', '']] });
      };
      // 🔴 PREÇO MUDOU: mostra o número JÁ LIDO antes de gravar.
      // O campo é texto livre (o mock não tem a moeda "estilo banco" do app
      // velho) e eu vi na tela um dedo escorregado virar "9 509,50" — que o
      // leitor entende como NOVE MIL. Este é o preço que multiplica TODA
      // entrega do produto: ele não pode mudar sem alguém ler o valor.
      if (corpo.preco === undefined) return gravar();
      window.portao({
        tom: 'alerta', ico: 'cash', titulo: 'Confirmar o preço?',
        sub: `${esc(p.nome)} passa a valer ${dinheiro(corpo.preco)}`,
        acoes: [['Não', ''], ['Salvar preço', 'principal']], classe: 'duas',
      });
      const botao = naCamada('.portao-wrap .principal');
      if (botao) botao.addEventListener('click', () => { gravar(); }, { once: true });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     L8d — O RECADO QUE CARREGA TRABALHO (12/08).

     A Central gruda uma PARADA (um cliente) ou uma ROTA SALVA no texto do
     recado; aqui o motorista decide. Com rota ativa são três saídas — Encaixar
     na rota, Analisar, Negar; sem rota ativa, duas — Analisar e Negar (o botão
     que não tem para onde encaixar não nasce).

     🔴 POR QUE ISTO MORA NO CHAT. A tela própria pra isso existiu ("Rota
     Indicada", aceitar/negar) e morreu no corte de 06/08: 4 linhas na história
     inteira servidas por 2.981 polls. Ordem do dono: *"o mecanismo de 'fazem a
     rota pra mim' fica no chat — todo motorista sabe usar chat"*.

     🔴 NENHUM VERBO NOVO DE ROTA NASCE AQUI. Encaixar parada = a MESMA receita
     da parada avulsa (`/logistica/entregas` com `paraMinhaRota` + o
     `encaixarAvulsa` que mede custo de inserção); encaixar rota = o MESMO
     `rota-modelos/:id/gerar` que o "Usar esta rota hoje?" já chama. Um segundo
     caminho pra montar o dia é como nasce a rota que existe numa tela só.

     🔴 NEGAR NÃO LIMPA NADA PORQUE NADA FOI CRIADO. Até o encaixe, o anexo é um
     id dentro de uma mensagem: "a rota recebida é LIMPA, não fica presa em
     limbo nenhum" é propriedade da construção, não faxina. O que sobra é a
     linha no fio dizendo que negou — com ou sem motivo.
     ══════════════════════════════════════════════════════════════════════════ */

  /* O recado cujo MOTIVO está sendo escrito agora. Ele existe porque a próxima
     mensagem do campo tem que responder ESTE recado (o `recadoId` do
     `/recados/responder`), e não o que estiver por acaso no portão — senão o
     "não vou conseguir passar lá" viraria resposta de outro assunto. Some no
     envio, no cancelamento e ao sair do Chat. */
  let motivoDoAnexo = null;

  /** o id que a próxima mensagem do chat deve responder (vazio = nenhum) */
  function recadoIdDoMotivo() {
    return motivoDoAnexo ? String(motivoDoAnexo) : '';
  }

  function limparMotivoDoAnexo() {
    motivoDoAnexo = null;
  }

  /** o recado do fio com este id — o anexo VIVE no fio, não numa lista à parte */
  function recadoComAnexo(id) {
    const alvo = String(id || '');
    if (!alvo) return null;
    const achado = (recados || []).find((r) => r && String(r.id) === alvo);
    return achado && achado.anexo ? achado : null;
  }

  /* A CARA DO ANEXO NA BOLHA. `encaixar` é respondido AQUI e viaja pro seam
     pronto: quem sabe se existe rota é a ponte (`rotaMontada()`), e a tela que
     tentasse adivinhar ofereceria "Encaixar na rota" pra quem não tem rota. */
  function anexoDoSeam(recado) {
    const a = recado && recado.anexo;
    if (!a) return undefined;
    return {
      id: String(recado.id),
      tipo: a.tipo === 'rota' ? 'rota' : 'parada',
      nome: esc(a.nome || ''),
      detalhe: esc(a.detalhe || ''),
      estado: a.estado === 'encaixada' || a.estado === 'negada' ? a.estado : 'pendente',
      encaixar: rotaMontada() ? 1 : 0,
    };
  }

  /** grava o desfecho no servidor e repinta o fio — o card vira selo sozinho */
  async function gravarDesfecho(id, acao) {
    await window.API.post(`/logistica/recados/${encodeURIComponent(String(id))}/anexo`, { acao });
    await carregarRecados();
  }

  /* ── ENCAIXAR ────────────────────────────────────────────────────────────
     🔴 A ORDEM É: CRIAR → ENCAIXAR → MARCAR. Marcar antes de criar deixaria o
     card dizendo "Encaixada" com a rota intacta se a rede caísse no meio — a
     mentira mais cara que este card pode contar. E o marcar é o ÚLTIMO porque
     ele é a única coisa desta corrente que dá pra repetir sem estrago (o
     servidor é idempotente); se ele falhar, a parada está lá e o próximo toque
     conserta o selo. */
  async function encaixarParada(recado) {
    const a = recado.anexo;
    const contaId = String(a.contaId || '');
    if (!contaId) throw new Error('Este recado não diz qual cliente.');

    /* A mesma porta não entra 2x na rota do dia — mesmo freio do
       `rapidaConfirmar`. Aqui ele também FECHA o card: a parada já está na
       rota, então o estado honesto é "encaixada", não "pendente pra sempre". */
    if (paradaAbertaDaConta(contaId)) {
      await gravarDesfecho(recado.id, 'encaixar');
      return { ja: true, anterior: null };
    }
    const entrega = await window.API.post('/logistica/entregas', {
      customerProfileId: contaId,
      quantidade: 1,
      scheduledAt: `${hojeISO()}T12:00:00.000Z`,
      // 🔴 Sem `paraMinhaRota` a entrega nasce órfã e o Iniciar recusa o dia
      // INTEIRO ("atribua as entregas a exatamente um motorista").
      paraMinhaRota: true,
    });
    // A rota é relida ANTES do encaixe: é dela que sai a lista de abertas em
    // que a parada nova vai entrar.
    await carregarRota();
    const novoId = entrega && entrega.id ? String(entrega.id) : '';
    let encaixe = { aplicado: false, anterior: null };
    if (novoId) encaixe = await encaixarAvulsa(novoId);
    await carregarRota();
    await gravarDesfecho(recado.id, 'encaixar');
    return { ja: false, anterior: encaixe.anterior };
  }

  async function encaixarRota(recado) {
    const a = recado.anexo;
    const modeloId = String(a.rotaModeloId || '');
    if (!modeloId) throw new Error('Este recado não diz qual rota.');
    // O MESMO verbo do "Usar esta rota hoje?" — ele materializa as entregas do
    // modelo no dia de hoje. Nada de endpoint novo.
    await window.API.post(`/logistica/rota-modelos/${encodeURIComponent(modeloId)}/gerar`, {
      date: diaOperacional(),
    });
    await carregarRota();
    /* A ORDEM É A SEGUNDA METADE DO VERBO — e falhar aqui não desfaz nada: as
       paradas existem. O recibo muda de tom em vez de mentir (mesma disciplina
       do `rapidaAdicionarEscolhidos`). */
    let ordenou = true;
    try {
      await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...origemGps() });
    } catch (_) { ordenou = false; }
    await carregarRota();
    await gravarDesfecho(recado.id, 'encaixar');
    return { ordenou };
  }

  /**
   * O toque em "Encaixar na rota".
   *
   * `aguardeNoToque` é a MESMA disciplina do pé da Montagem: a classe entra no
   * botão vivo ainda no quadro do toque (recibo imediato, cromo direto no nó) e
   * a trava é variável da ponte, porque o repinte do meio do fluxo troca o nó e
   * nó novo nasce sem classe. Sem isso, encaixar — que é rede em 4 etapas —
   * fica segundos sem resposta e o dedo toca de novo.
   */
  function encaixarAnexo(id, alvo) {
    const recado = recadoComAnexo(id);
    if (!recado || recado.anexo.estado !== 'pendente') return;
    if (!rotaMontada()) {
      return window.portao({
        tom: 'info', ico: 'route', titulo: 'Sem rota montada',
        sub: 'Monte a rota de hoje e o encaixe volta a aparecer.',
        acoes: [['Fechar', 'principal', true]],
      });
    }
    aguardeNoToque(alvo, () => comTrava(async () => {
      const ehRota = recado.anexo.tipo === 'rota';
      let saida;
      try { saida = ehRota ? await encaixarRota(recado) : await encaixarParada(recado); }
      catch (e) { return avisoErro(e); }
      const nome = recado.anexo.nome || 'A parada';
      window.portao({
        tom: 'ok', ico: 'check', titulo: ehRota ? 'Rota encaixada' : 'Parada encaixada',
        sub: ehRota
          ? (saida.ordenou ? 'A ordem já está montada.' : 'Toque em "Montar rota" pra achar a ordem.')
          : saida.ja ? `${esc(nome)} já estava na rota de hoje.`
            : saida.anterior ? `Entra depois de ${esc(saida.anterior)}.`
              : 'Entra como primeira parada.',
        acoes: [['Fechar', 'principal', true]],
      });
    }));
  }

  /* ── ANALISAR ────────────────────────────────────────────────────────────
     Não decide nada: leva o dedo pra Montagem com o alvo ACESO.

     🔴 O DESTAQUE É CROMO DIRETO NO NÓ, não campo de seam — mesma escolha do
     `aguardeNoToque`. Ele é um "olha aqui" do momento da chegada, não um
     estado: pendurá-lo no seam obrigaria alguém a lembrar de apagá-lo, e marca
     que ninguém apaga é a próxima confirmação decorativa.

     🔴 E ELE SÓ NASCE DEPOIS QUE A TELA PAROU DE SE PINTAR. `ir('montagem')`
     dispara um `encherMontagem()` que termina DEPOIS; quando termina, o
     `usarDados` repinta e leva a camada inteira embora — com o destaque dentro.
     É a mesma receita do `voltarDaAvulsa`: navega, ESPERA o dado, e só então
     marca. */
  async function idsParaDestacar(recado) {
    const a = recado.anexo;
    if (a.tipo === 'parada') return a.contaId ? [String(a.contaId)] : [];
    const modeloId = String(a.rotaModeloId || '');
    if (!modeloId) return [];
    // O catálogo de rotas salvas já é lido pelo app; só o buscamos quando ele
    // ainda não estiver na memória deste ciclo.
    if (!MODELOS.has(modeloId)) {
      try { await carregarSalvas(); } catch (_) { return []; }
    }
    const modelo = MODELOS.get(modeloId);
    const paradas = modelo && Array.isArray(modelo.paradas) ? modelo.paradas : [];
    return paradas.map((p) => String(p && p.customerProfileId || '')).filter(Boolean);
  }

  function acenderNaMontagem(ids) {
    if (!ids.length) return 0;
    let achados = 0;
    let primeiro = null;
    ids.forEach((id) => {
      const no = naCamada(`.stop[data-cliente="${id}"]`);
      if (!no) return;
      no.classList.add('destaque');
      if (!primeiro) primeiro = no;
      achados += 1;
    });
    // Rolar até o PRIMEIRO alvo: acender uma linha fora da tela é acender nada.
    if (primeiro && primeiro.scrollIntoView) {
      try { primeiro.scrollIntoView({ block: 'center' }); } catch (_) { /* sem suporte: a classe basta */ }
    }
    return achados;
  }

  function analisarAnexo(id) {
    const recado = recadoComAnexo(id);
    if (!recado) return;
    void comTrava(async () => {
      const ids = await idsParaDestacar(recado);
      window.ir('montagem');
      try { await encherMontagem(); } catch (_) { /* a tela vale mais que a marca */ }
      const acesos = acenderNaMontagem(ids);
      /* 🔴 "NÃO ACHEI" NÃO PODE SAIR CALADO. O cliente anexado pode não estar no
         dia — e aí a tela abre sem nada aceso, que a pessoa lê como app quebrado.
         Uma frase, e o card continua no chat esperando a decisão. */
      if (!acesos && ids.length) {
        window.portao({
          tom: 'info', ico: 'map',
          titulo: recado.anexo.tipo === 'rota' ? 'Essa rota não está no seu dia' : 'Essa parada não está no seu dia',
          sub: 'Volte ao chat e use "Encaixar na rota".',
          acoes: [['Fechar', 'principal', true]],
        });
      }
    });
  }

  /* ── NEGAR ───────────────────────────────────────────────────────────────
     Duas saídas e um só desfecho no servidor. A pergunta do motivo é uma
     CORTESIA, não um pedágio: "Não" fecha e pronto — obrigar a justificar quem
     está dirigindo é o tipo de trava que faz a pessoa parar de usar a porta.

     🔴 O DESFECHO É GRAVADO NOS DOIS CAMINHOS, ANTES do campo de texto. Deixar
     pro envio da mensagem faria "negar e não escrever nada" virar um card
     pendente pra sempre — exatamente o limbo que o dono mandou não existir. */
  function negarAnexo(id) {
    const recado = recadoComAnexo(id);
    if (!recado || recado.anexo.estado !== 'pendente' || typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'chat', titulo: 'Enviar motivo?',
      sub: `${esc(recado.anexo.nome || 'O que a Central mandou')} não entra na sua rota.`,
      acoes: [['Não', ''], ['Sim', 'principal']], classe: 'duas',
    });
    const negar = (comMotivo) => comTrava(async () => {
      try { await gravarDesfecho(recado.id, 'negar'); }
      catch (e) { return avisoErro(e); }
      if (!comMotivo) return;
      /* "Sim" é o dedo indo pro campo — o texto é dele. A mensagem que ele
         escrever sai ligada a ESTE recado (ver `recadoIdDoMotivo`), então a
         central lê a negativa embaixo do que ela mesma mandou. */
      motivoDoAnexo = String(recado.id);
      const el = naCamada('[data-campo="recado-texto"]');
      if (el) el.focus();
    });
    const sim = naCamada('.portao-wrap .principal');
    if (sim) sim.addEventListener('click', () => { negar(true); }, { once: true });
    /* O "Não" também GRAVA: o dono foi literal — "nos dois casos de negar, a
       rota recebida é limpa". Fechar sem gravar deixaria o card pendente. */
    const nao = naCamada('.portao-wrap .acoes button:not(.principal)');
    if (nao) nao.addEventListener('click', () => { negar(false); }, { once: true });
  }

  /* ------------------------------------------------------------------------
     L6 — CLIENTES E FICHA (a tela nº1 de quem usa o app de verdade).

     A lista é PULL: busca e chips de dia vão pro SERVIDOR junto com a página.
     Filtrar no aparelho esconderia todo cliente que ainda não desceu — a base
     do cliente real tem centenas.

     🔴 O ENDEREÇO MATA O PINO. Mudou rua/número/bairro/CEP, a coordenada velha
     MORRE junto (lat/lng = null). Pino velho com endereço novo é o defeito mais
     caro desta casa: a rota leva o motorista pra porta errada e ninguém vê.
     Sem pino a parada aparece como "sem trajeto" e a conferência acusa — barulho
     é melhor que silêncio errado.
     ------------------------------------------------------------------------ */
  const CLIENTES = new Map();
  let filtroClientes = { busca: '', dia: 0 };
  /* Dias que TÊM cliente (união dos `diasEntrega` da base). Só a carga SEM
     filtro mede — com filtro de dia a lista volta só daquele dia e a união
     colapsaria pra ele. Entre filtros o valor fica de pé (sticky). O dono
     (07/08): "não tem terça nem domingo nas rotas, e ainda está aparecendo". */
  let diasComGente = null;
  let ficha = null;          // { id, item, detalhe, local, telefone, dias }
  let historicoCliente = null; // { clienteId, items, nextCursor, carregando, erro }
  let clientesEmVoo = false;

  const iniciais = (nome) => String(nome || '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

  const ROTULO_DIA = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  /** o que a pendência do servidor vira na tela (só a primeira, a mais dura) */
  const AVISO_PENDENCIA = { numero: 'sem número', endereco: 'sem endereço', dia: 'sem dia', telefone: 'sem telefone' };

  async function carregarClientes() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    if (clientesEmVoo) return;
    clientesEmVoo = true;
    try {
      const p = new URLSearchParams({ page: '1', pageSize: '100' });
      if (filtroClientes.busca) p.set('query', filtroClientes.busca);
      if (filtroClientes.dia) p.set('diasSemana', String(filtroClientes.dia));
      let r;
      try { r = await window.API.get(`/nucleo/clientes?${p.toString()}`); } catch (_) { return fonteCaiu('clientes'); }
      // 🔴 SÓ CLIENTE ENTRA. A mesma porta serve lead e fornecedor; sem este
      // filtro a agenda de quem nunca comprou apareceria na rota de quem vende.
      const itens = (Array.isArray(r && r.items) ? r.items : []).filter((c) => c && c.isCliente === true);
      CLIENTES.clear();
      itens.forEach((c) => CLIENTES.set(String(c.id), c));
      // Quem está na rota de HOJE ganha o avatar aceso — é o que o motorista
      // procura primeiro quando abre a lista.
      const naRota = new Set();
      ENTREGAS.forEach((reg) => {
        const id = reg.item && reg.item.cliente && reg.item.cliente.id;
        if (id) naRota.add(String(id));
      });
      if (!filtroClientes.busca && !filtroClientes.dia) {
        const uniao = new Set();
        itens.forEach((c) => (Array.isArray(c.diasEntrega) ? c.diasEntrega : [])
          .forEach((n) => uniao.add(Number(n))));
        diasComGente = [1, 2, 3, 4, 5, 6, 7].filter((n) => uniao.has(n));
      }
      window.usarDados('clientes', {
        ...(diasComGente ? { dias: diasComGente } : {}),
        ...fonteVoltou,
        subtitulo: `${ENTREGAS.size} na rota de hoje`,
        busca: esc(filtroClientes.busca),
        diaSel: filtroClientes.dia,
        total: r && typeof r.total === 'number' ? String(r.total) : '',
        // "sem endereço" seria uma conta da BASE INTEIRA e o servidor não manda
        // esse total — contar só os que desceram diria um número menor que a
        // verdade. Slot vazio some; número errado ficaria.
        semEndereco: '',
        marcadoHoje: DADOS.rota.somaMarcado || '',
        lista: itens.map((c) => {
          const dias = Array.isArray(c.diasEntrega) ? c.diasEntrega : [];
          const pend = Array.isArray(c.pendencias) ? c.pendencias : [];
          const aviso = pend.map((k) => AVISO_PENDENCIA[k]).filter(Boolean)[0] || '';
          const deve = Number(c.debitoAtual) || 0;
          return [
            iniciais(c.name),
            esc(c.name),
            [esc(c.endereco), esc(c.cidade)].filter(Boolean).join(' • '),
            dias.map((n) => ROTULO_DIA[n]).filter(Boolean).join(', '),
            deve > 0 ? deve.toFixed(2).replace('.', ',') : '',
            naRota.has(String(c.id)) ? 1 : 0,
            aviso,
            String(c.id),
          ];
        }),
      });
    } finally { clientesEmVoo = false; }
  }

  /** toque no cliente: puxa a ficha inteira (cadastro + o que ele leva) */
  async function abrirCliente(id, volta) {
    if (!id || typeof window.usarDados !== 'function') return;
    /* 🔴 CLIENTE FORA DA LISTA CARREGADA TAMBÉM ABRE (09/08). O `CLIENTES` é a
       PÁGINA de clientes que está na memória — 100 por vez, e ela encolhe
       quando há filtro de busca ou de dia. A montagem chama esta função com
       quem está na ROTA do dia, que não é o mesmo conjunto: com 120 clientes na
       base, o de número 101 tocava o cartão e NADA acontecia — o `return` calado
       de um `item` ausente. Sem o resumo da lista a ficha abre só com o nome e
       enche quando o detalhe chega, que é como ela já se comporta. */
    const item = CLIENTES.get(String(id)) || { id: String(id) };
    // A ficha abre JÁ com o que a lista sabe; o detalhe entra quando chegar.
    // Tela de cadastro que fica em branco esperando rede é tela quebrada.
    // rascunho ZERADO: cliente novo mostra o cadastro DELE, nunca sobra do anterior.
    historicoCliente = null;
    ficha = {
      id: String(id),
      item,
      detalhe: null,
      local: null,
      telefone: null,
      rascunho: {},
      dias: (item.diasEntrega || []).slice(),
      // por onde ele entrou: é pra lá que o Voltar tem que devolver.
      volta: volta || 'clientes',
    };
    encherFicha();
    window.ir('ficha');
    const [detR, prodR] = await Promise.allSettled([
      window.API.get(`/nucleo/clientes/${encodeURIComponent(id)}`),
      window.API.get(`/logistica/cliente-produtos?customerProfileId=${encodeURIComponent(id)}`),
    ]);
    if (!ficha || ficha.id !== String(id)) return;      // trocou de cliente no meio
    if (detR.status === 'fulfilled' && detR.value) {
      ficha.detalhe = detR.value;
      const locais = Array.isArray(detR.value.locais) ? detR.value.locais : [];
      ficha.local = locais.find((l) => l.isPrincipal) || locais[0] || null;
      const tels = Array.isArray(detR.value.telefones) ? detR.value.telefones : [];
      ficha.telefone = tels.find((t) => t.isPrincipal) || tels[0] || null;
      /* 🔴 O FINANCEIRO DO CLIENTE VOLTOU (12/08, ordem do dono). O servidor
         nunca deixou de mandar — `GET /nucleo/clientes/:id` traz os 6 campos do
         contrato desde a primeira versão da ficha; o que morreu na fusão foi a
         SEÇÃO da tela e o estado que a alimentava. Aqui ele volta a existir.
         DOIS retratos: `fin` é o que o dedo mexe, `finOrig` é o que o servidor
         disse. Salvar manda só o que mudou — a mesma lei do resto desta ficha,
         e a que faz "Nada mudou" ser verdade. */
      ficha.fin = financeiroDoDetalhe(detR.value);
      ficha.finOrig = financeiroDoDetalhe(detR.value);
    }
    ficha.produtos = prodR.status === 'fulfilled' && Array.isArray(prodR.value) ? prodR.value : [];
    encherFicha();
  }

  /* 🔴 O QUE O DEDO ESCREVEU TEM QUE SOBREVIVER AO REPINTE.
     Qualquer `usarDados` repinta a tela inteira a partir do seam — e o texto
     digitado vive no DOM, não no seam. Medido no g15: digitei o número da casa,
     toquei num dia e o número SUMIU.

     🔴 E O RASCUNHO SÓ GUARDA O QUE FOI DIGITADO — nunca uma foto dos campos.
     Minha 1ª versão tirava foto antes de repintar: como a ficha abre VAZIA e
     preenche quando o detalhe chega, a foto gravava "" como se fosse escolha do
     usuário, e daí em diante o vazio VENCIA o dado do servidor. CEP, rua e
     bairro sumiram na tela por causa disso. Rascunho nasce de tecla, e ponto. */
  const CAMPOS_FICHA = ['nome', 'telefone', 'cpf', 'cep', 'rua', 'numero', 'bairro', 'observacoes',
    // os dois campos digitáveis do Financeiro (12/08) — sem eles, tocar numa
    // chave do bloco apagaria o que o dedo acabou de escrever no limite.
    'dia-fechamento', 'limite-fiado'];
  const CAMPOS_PRODUTO = ['produto-nome', 'produto-unidade', 'produto-preco'];
  /** liga o rascunho de QUALQUER ficha da camada viva (cliente ou produto) */
  function ligarCamposDaFicha() {
    const camada = camadaViva();
    if (!camada) return;
    const ligar = (nomes, dono) => {
      for (const nome of nomes) {
        const el = camada.querySelector(`[data-campo="${nome}"]`);
        if (!el || el.__hbxCampo) continue;
        el.__hbxCampo = true;
        el.addEventListener('input', () => {
          const alvo = dono();
          if (!alvo) return;
          alvo.rascunho = alvo.rascunho || {};
          alvo.rascunho[nome] = String(el.value || '');
        });
      }
    };
    ligar(CAMPOS_FICHA, () => ficha);
    ligar(CAMPOS_PRODUTO, () => produto);
    ligarCamposDeCep(camada);
  }

  /* 🔴 CEP É REGRA (10/08, ordem do dono): máscara #####-### em TODO campo de
     CEP, e CEP completo puxa o resto SOZINHO (geo/cep → rua e bairro entram na
     hora). O CEP manda no nome da rua — o que ele diz SOBRESCREVE o que estava
     no campo; quem digita CEP está pedindo exatamente isso. */
  const mascaraCep = (v) => {
    const d = String(v || '').replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  };
  async function preencherPeloCep(digitos, aplicar) {
    let r = null;
    try { r = await window.API.get(`/logistica/geo/cep?cep=${encodeURIComponent(digitos)}`); }
    catch (_) { r = null; }
    if (r && (r.endereco || r.bairro)) aplicar(r);
  }
  /** escreve os campos no DOM da camada viva e no rascunho do dono (se houver) */
  function aplicarEnderecoDoCep(porCampo, rascunhoDono) {
    for (const nome of Object.keys(porCampo)) {
      const valor = String(porCampo[nome] || '').trim();
      if (!valor) continue;
      const el = naCamada(`[data-campo="${nome}"]`);
      if (el) el.value = valor;
      if (rascunhoDono) {
        const alvo = rascunhoDono();
        if (alvo) { alvo.rascunho = alvo.rascunho || {}; alvo.rascunho[nome.replace(/^novo-/, '')] = valor; }
      }
    }
  }
  function ligarCamposDeCep(camada) {
    const ligarCep = (nomeCampo, aoCompletar, rascunhoDono) => {
      const el = camada.querySelector(`[data-campo="${nomeCampo}"]`);
      if (!el || el.__hbxCep) return;
      el.__hbxCep = true;
      el.addEventListener('input', () => {
        const mascarado = mascaraCep(el.value);
        if (el.value !== mascarado) el.value = mascarado;
        // o listener genérico do rascunho rodou ANTES com o valor cru — corrige
        // pro mascarado, senão o repinte devolveria o CEP sem máscara.
        if (rascunhoDono) {
          const alvo = rascunhoDono();
          if (alvo && alvo.rascunho && alvo.rascunho[nomeCampo] !== undefined) alvo.rascunho[nomeCampo] = mascarado;
        }
        const digitos = mascarado.replace(/\D/g, '');
        if (digitos.length === 8 && el.__hbxCepFeito !== digitos) {
          el.__hbxCepFeito = digitos;
          aoCompletar(digitos);
        }
      });
      // valor que chegou do servidor sem máscara ganha a máscara na hora
      const pronto = mascaraCep(el.value);
      if (pronto && pronto !== el.value) el.value = pronto;
    };
    ligarCep('cep', (digitos) => preencherPeloCep(digitos, (r) => {
      aplicarEnderecoDoCep({ rua: r.endereco, bairro: r.bairro }, () => ficha);
      if (ficha) ficha.cepInfo = { cidade: r.cidade || '', uf: r.uf || '' };
    }), () => ficha);
    ligarCep('novo-cep', (digitos) => preencherPeloCep(digitos, (r) => {
      aplicarEnderecoDoCep({ 'novo-rua': r.endereco, 'novo-bairro': r.bairro }, null);
      novoCepInfo = { cidade: r.cidade || '', uf: r.uf || '' };
    }), null);
  }
  /** valor a mostrar: o que ele digitou, senão o que o servidor mandou */
  const valorFicha = (nome, doServidor) => {
    const r = ficha && ficha.rascunho;
    return r && r[nome] !== undefined ? esc(r[nome]) : esc(doServidor);
  };

  /* ------------------------------------------------------------------------
     O CONTRATO FINANCEIRO DO CLIENTE — o que o servidor disse, no vocabulário
     do dedo. `formaPagamento` legado 'aberto' é MOSTRADO como 'na_hora' (é o
     que o app que roda em produção sempre fez, `paymentFields`) e NUNCA
     reescrito sozinho: o cliente só troca de forma quando alguém toca no chip.
     ------------------------------------------------------------------------ */
  const financeiroDoDetalhe = (d) => ({
    forma: String((d && d.formaPagamento) || 'aberto'),
    metodo: String((d && d.metodoPadrao) || ''),
    contabilizar: !(d && d.contabilizar === false),
    avisarCobranca: !(d && d.avisarCobranca === false),
  });
  /** o chip que aparece ACESO: 'aberto' se veste de 'na_hora' (ver acima) */
  const formaNaTela = (v) => (String(v || '') === 'aberto' ? 'na_hora' : String(v || 'na_hora'));
  /* As formas que a EMPRESA aceita (chaves do Avançado). Oferecer uma que o
     dono desligou é prometer contrato que o produto não tem — e a forma vigente
     do cliente entra na fileira mesmo desligada, senão a tela esconderia o que
     está valendo e o primeiro toque trocaria o contrato dele sem querer. */
  function formasDisponiveis(atual) {
    const c = config || {};
    const todas = [['na_hora', 'Na hora', c.aceitaNaHora], ['mensal', 'Mensal', c.aceitaMensal], ['pendura', 'Marcar', c.aceitaFiado]];
    return todas.filter((f) => f[2] || f[0] === atual).map((f) => [f[0], f[1]]);
  }
  /** "R$ 1.234,50" → 1234.5 · vazio → null (limpar o limite é escolha legítima) */
  const dinheiroParaNumero = (v) => {
    const t = String(v || '').trim();
    if (!t) return null;
    const n = Number(t.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  function encherFicha() {
    if (!ficha) return;
    const it = ficha.item || {};
    const d = ficha.detalhe || {};
    const loc = ficha.local || {};
    const pend = Array.isArray(it.pendencias) ? it.pendencias : [];
    // 12/08 — o detalhe passou a trazer `entregasCount`: a ficha aberta PELA
    // MONTAGEM não tem item de lista, e o cabeçalho nascia sem o "42 entregas".
    const entregas = Number(it.entregasCount) || Number(d.entregasCount) || 0;
    const dias = ficha.dias || [];
    const fin = ficha.fin || financeiroDoDetalhe(null);
    const forma = formaNaTela(fin.forma);
    /* 🔴 O SALDO É DE TODO MUNDO; A EDIÇÃO É DO DONO. O motorista precisa saber
       quanto o cliente deve ANTES de bater na porta — é o mesmo `debitoAtual`
       que a lista de Clientes já mostra pra ele. Mas `PATCH
       /logistica/clientes/:id/financeiro` é ADMIN-only no servidor: desenhar os
       campos pra quem vai levar 403 é o botão morto que esta ficha já matou uma
       vez (o Excluir de 08/08). Duas chaves, portanto — e a de fora é a mesma
       do resto do bloco: financeiro desligado, seção nenhuma. */
    const financeiroLigado = !!(config && config.moduloFinanceiroAtivo);
    const saldo = typeof d.debitoAtual === 'number' ? d.debitoAtual
      : (typeof it.debitoAtual === 'number' ? it.debitoAtual : null);
    window.usarDados('ficha', {
      // O EXCLUIR é do dono, não do motorista: `DELETE /nucleo/contas/:id` é
      // ADMIN-only no servidor, e este é o MESMO sinal das 6 chaves do Avançado.
      // Config que não chegou (app sem rede no boot) = sem botão: esconder um
      // botão que o servidor talvez aceitasse é menos grave que oferecer uma
      // exclusão que volta 403 traduzido como "sua sessão expirou".
      admin: ehAdmin() ? 1 : 0,
      volta: ficha.volta || 'clientes',
      ini: iniciais(it.name || d.name),
      nome: valorFicha('nome', d.name || it.name),
      // "cliente desde" não vem em nenhuma das duas portas — some em vez de
      // virar uma data inventada. O que existe é a contagem de entregas.
      resumo: entregas ? `${entregas} ${entregas === 1 ? 'entrega' : 'entregas'}` : '',
      alerta: pend.map((k) => AVISO_PENDENCIA[k]).filter(Boolean)[0] || '',
      telefone: valorFicha('telefone', d.whatsapp || it.phone),
      cpf: valorFicha('cpf', d.document),
      cep: valorFicha('cep', loc.cep || d.cep),
      rua: valorFicha('rua', loc.endereco || d.endereco),
      numero: valorFicha('numero', loc.numero != null ? loc.numero : d.numero),
      bairro: valorFicha('bairro', loc.bairro || d.bairro),
      numeroPendente: pend.indexOf('numero') >= 0 ? 1 : 0,
      // banner do "GPS — usar onde estou" (10/08): só existe depois do toque.
      local: (ficha.gpsAviso && ficha.gpsAviso.local) || '',
      localOk: ficha.gpsAviso ? ficha.gpsAviso.ok : 0,
      observacoes: valorFicha('observacoes', d.observacoes || it.observacoes),
      dias: [1, 2, 3, 4, 5, 6, 7].map((n) => (dias.indexOf(n) >= 0 ? 1 : 0)),
      produtos: (ficha.produtos || []).map((v) => {
        const p = v.produto || {};
        const preco = typeof v.precoAcordado === 'number' ? v.precoAcordado : null;
        const catalogo = typeof p.precoCatalogo === 'number' ? p.precoCatalogo : null;
        // Preço combinado SÓ PRA ELE ganha destaque; preço de catálogo é o
        // normal. Sem preço nenhum, a linha diz só a quantidade.
        const proprio = preco != null && catalogo != null && preco !== catalogo;
        const valor = preco != null
          ? (proprio
            ? ` · <b style="color:var(--lime)">${dinheiro(preco)} só pra ele</b>`
            : ` · ${dinheiro(preco)} (catálogo)`)
          : '';
        /* PAUSADO SE ANUNCIA (12/08): vínculo com `ativo:false` continua na
           ficha e PAROU de gerar entrega. Sem esta palavra o dono olha a lista,
           vê o produto, e não entende por que ele não aparece na rota. */
        const pausado = v.ativo === false ? ' · pausado' : '';
        /* 🔴 O ID É O QUE FAZ A LINHA VIRAR PORTA (mesma lei do `stop()`): sem
           ele o cartão fica inerte, com ele abre o VÍNCULO — nunca o catálogo. */
        return ['box', esc(p.nome), `${Number(v.qtdPadrao) || 0} por entrega${valor}${pausado}`, String(v.id || '')];
      }),
      /* ---------- FINANCEIRO (12/08) ---------- */
      financeiro: financeiroLigado ? 1 : 0,
      financeiroEdita: financeiroLigado && ehAdmin() ? 1 : 0,
      // Lei do IF: saldo zero não é notícia na porta — some, como o resto.
      saldo: financeiroLigado && saldo ? dinheiro(saldo) : '',
      limiteLido: financeiroLigado && typeof d.limiteFiado === 'number' ? dinheiro(d.limiteFiado) : '',
      formas: formasDisponiveis(forma),
      forma,
      metodo: esc(fin.metodo),
      diaFechamento: valorFicha('dia-fechamento', d.diaFechamento != null ? String(d.diaFechamento) : ''),
      limite: valorFicha('limite-fiado', typeof d.limiteFiado === 'number'
        ? d.limiteFiado.toFixed(2).replace('.', ',') : ''),
      contabilizar: fin.contabilizar ? 1 : 0,
      avisarCobranca: fin.avisarCobranca ? 1 : 0,
    });
  }

  /* ------------------------------------------------------------------------
     O QUE O DEDO MEXEU NO FINANCEIRO — estado na memória, gravação no Salvar.

     🔴 UM TOQUE ≠ UM PATCH aqui, de propósito. O desktop grava chip a chip
     porque lá cada campo tem o seu "Salvo"; nesta ficha o dono mexe em nome,
     endereço, dias, produtos e dinheiro na mesma tela e aperta UM botão. Gravar
     a forma de pagamento no toque e o resto no Salvar faria metade da ficha
     obedecer o Voltar e a outra metade não — e o Voltar tem que descartar.
     ------------------------------------------------------------------------ */
  function mexerFinanceiro(mudanca) {
    if (!ficha) return;
    ficha.fin = Object.assign({}, ficha.fin || financeiroDoDetalhe(ficha.detalhe), mudanca);
    // Forma que não é "na hora" não tem método fixo — deixar o pix pendurado
    // mandaria ao servidor um método que ele ignora e a tela mostraria depois.
    if (ficha.fin.forma !== 'na_hora') ficha.fin.metodo = '';
    encherFicha();
  }

  /* O que vai no PATCH — SÓ o que mudou, e nada quando nada mudou (é o que faz
     o "Nada mudou" do Salvar continuar sendo verdade). O dia de fechamento e o
     limite saem do CAMPO da tela, não do estado: eles são texto digitado. */
  function corpoFinanceiro() {
    if (!ficha || !ficha.fin || !ficha.finOrig) return null;
    const a = ficha.fin;
    const b = ficha.finOrig;
    const d = ficha.detalhe || {};
    const corpo = {};
    // 'aberto' vestido de 'na_hora' NÃO é mudança: só entra se o dedo escolheu
    // outra coisa (senão abrir e salvar a ficha reescreveria o contrato de todo
    // cliente legado da base, calado).
    if (a.forma !== b.forma && !(b.forma === 'aberto' && a.forma === 'na_hora')) corpo.formaPagamento = a.forma;
    if (a.forma === 'na_hora' && a.metodo !== String(b.metodo || '')) corpo.metodoPadrao = a.metodo;
    if (a.contabilizar !== b.contabilizar) corpo.contabilizar = a.contabilizar;
    if (a.avisarCobranca !== b.avisarCobranca) corpo.avisarCobranca = a.avisarCobranca;
    const dia = Math.trunc(Number(campo('dia-fechamento')));
    const diaAntes = d.diaFechamento != null ? Number(d.diaFechamento) : null;
    if (a.forma === 'mensal' && Number.isFinite(dia) && dia >= 1 && dia <= 31 && dia !== diaAntes) corpo.diaFechamento = dia;
    const limite = dinheiroParaNumero(campo('limite-fiado'));
    const limiteAntes = typeof d.limiteFiado === 'number' ? d.limiteFiado : null;
    if (limite !== limiteAntes) corpo.limiteFiado = limite;
    return Object.keys(corpo).length ? corpo : null;
  }

  /** lê um campo da ficha na camada viva (o que o dedo digitou, não o do seam) */
  const campo = (nome) => {
    const el = naCamada(`[data-campo="${nome}"]`);
    return el ? String(el.value || '').trim() : '';
  };

  /* ==========================================================================
     CADASTRAR CLIENTE NA PORTA — o "+" do cabeçalho (08/08, pedido do dono).

     🔴 POR QUE ISTO É DINHEIRO, não conforto: medido na empresa 41 em 04/08 —
     117 paradas SEM local nenhum e 130 com local empilhado no mesmo ponto. Foi
     o que apodreceu a rota do André. Endereço digitado no escritório não sabe
     onde a casa fica; cadastro feito com o entregador PARADO na frente dela
     nasce com a coordenada certa.

     Nada de endpoint novo: `POST /nucleo/contas` já aceita lat/lng/geoFonte/
     gpsAccuracy e já passa o porteiro do aparelho. Quem decide se a coordenada
     é boa é o SERVIDOR (fail-closed em 60 m → grava 'gps_impreciso'); o app só
     conta o que mediu. App que se autodeclara preciso é app que mente.
     ========================================================================== */
  let novoLocal = null;      // {lat,lng,precisaoM} do "Usar meu local"
  let novoCepInfo = null;    // {cidade,uf} que o geo/cep devolveu pro CEP digitado

  const novoEmBranco = () => {
    novoLocal = null;
    novoCepInfo = null;
    if (typeof window.usarDados === 'function') {
      window.usarDados('novocliente', {
        nome: '', telefone: '', cep: '', rua: '', numero: '', bairro: '',
        local: '', localOk: 0, salvando: 0,
      });
    }
  };

  /* O que o dedo já digitou tem que SOBREVIVER ao repinte do banner do GPS:
     `usarDados` remonta a camada, e sem devolver os campos o motorista veria o
     nome que acabou de escrever sumir na hora de pegar o local. */
  const novoRascunho = () => ({
    nome: campo('novo-nome'), telefone: campo('novo-telefone'), cep: campo('novo-cep'),
    rua: campo('novo-rua'), numero: campo('novo-numero'), bairro: campo('novo-bairro'),
  });

  /** "Usar meu local": crava a coordenada e, de brinde, sugere a rua. */
  async function usarMeuLocal() {
    const rascunho = novoRascunho();
    if (!ultimoFix) {
      // Sem fix ainda: pede a permissão (o mesmo caminho do Navegar) e explica.
      // `avisarSemGps` é só da navegação — aqui a fala é outra.
      garantirGps();
      return window.portao({
        tom: 'alerta', ico: 'gps', titulo: 'Ainda sem localização',
        sub: 'Libere o GPS e espere um instante do lado de fora. Você pode digitar o endereço à mão enquanto isso.',
        acoes: [['Fechar', '']],
      });
    }
    const precisao = Number(ultimoFix.precisaoM);
    const ok = Number.isFinite(precisao) && precisao <= 60;
    novoLocal = { lat: ultimoFix.lat, lng: ultimoFix.lng, precisaoM: Number.isFinite(precisao) ? precisao : null };
    // Sugestão de rua/bairro: é ENFEITE — 200 sempre, e falha não trava nada
    // (a mesma lei do "enfeite lento não derruba a tela").
    let sugestao = null;
    try {
      sugestao = await window.API.get(`/logistica/geo/reverse?lat=${encodeURIComponent(novoLocal.lat)}&lng=${encodeURIComponent(novoLocal.lng)}`);
    } catch (_) { sugestao = null; }
    const s = sugestao || {};
    window.usarDados('novocliente', {
      ...rascunho,
      // A sugestão só ENTRA em campo vazio: o que o motorista digitou vale mais
      // que o palpite do mapa.
      rua: rascunho.rua || esc(s.endereco || ''),
      bairro: rascunho.bairro || esc(s.bairro || ''),
      // O CEP é OBRIGATÓRIO no servidor (lei de 06/08) e é justamente o que
      // ninguém sabe de cor na porta do cliente — vir de graça aqui é o que
      // torna o cadastro na rua possível. Já mascarado: máscara é regra (10/08).
      cep: rascunho.cep || esc(mascaraCep(s.cep || '')),
      local: ok
        ? `Local marcado aqui${Number.isFinite(precisao) ? ` (${Math.round(precisao)} m)` : ''}.`
        : `Local marcado, mas fraco${Number.isFinite(precisao) ? ` (${Math.round(precisao)} m)` : ''} — chegue mais perto da porta e toque de novo.`,
      localOk: ok ? 1 : 0,
    });
  }

  /** "GPS — usar onde estou" NA FICHA (10/08, ordem literal do dono: "injetar o
      GPS que pega o endereço que a pessoa está, não estou vendo!"). Mesmo motor
      do novocliente: fix do aparelho → geo/reverse (o Censo responde primeiro,
      com o CEP da porta) → CEP/rua/bairro entram sozinhos; o pino viaja no
      Salvar como `gps_cadastro`, nunca antes (salvar é o único verbo que grava). */
  async function usarLocalFicha() {
    if (!ficha) return;
    if (!ultimoFix) {
      garantirGps();
      return window.portao({
        tom: 'alerta', ico: 'gps', titulo: 'Ainda sem localização',
        sub: 'Libere o GPS e espere um instante do lado de fora. Você pode digitar o endereço à mão enquanto isso.',
        acoes: [['Fechar', '']],
      });
    }
    const precisao = Number(ultimoFix.precisaoM);
    const ok = Number.isFinite(precisao) && precisao <= 60;
    ficha.gpsLocal = { lat: ultimoFix.lat, lng: ultimoFix.lng, precisaoM: Number.isFinite(precisao) ? precisao : null };
    let s = null;
    try {
      s = await window.API.get(`/logistica/geo/reverse?lat=${encodeURIComponent(ultimoFix.lat)}&lng=${encodeURIComponent(ultimoFix.lng)}`);
    } catch (_) { s = null; }
    s = s || {};
    ficha.rascunho = ficha.rascunho || {};
    if (s.cep) ficha.rascunho.cep = mascaraCep(s.cep);
    if (s.endereco) ficha.rascunho.rua = String(s.endereco);
    if (s.bairro) ficha.rascunho.bairro = String(s.bairro);
    if (s.cidade || s.uf) ficha.cepInfo = { cidade: s.cidade || '', uf: s.uf || '' };
    ficha.gpsAviso = {
      local: ok
        ? `Local marcado aqui${Number.isFinite(precisao) ? ` (${Math.round(precisao)} m)` : ''}.`
        : `Local marcado, mas fraco${Number.isFinite(precisao) ? ` (${Math.round(precisao)} m)` : ''} — chegue mais perto da porta e toque de novo.`,
      ok: ok ? 1 : 0,
    };
    encherFicha();
  }

  /** Salvar o cliente novo. Confere porta repetida ANTES de criar. */
  async function salvarNovoCliente() {
    await comTrava(async () => {
      const d = novoRascunho();
      if (!d.nome) {
        return window.portao({
          tom: 'alerta', ico: 'users', titulo: 'Falta o nome',
          sub: 'Escreva ao menos o nome do cliente.', acoes: [['Fechar', '']],
        });
      }
      /* 🔴 MESMA PORTA, CONTA NOVA = entrega indo pro cliente errado depois. A
         régua do servidor é fail-closed e mora no `mesmaPorta`: com a RUA dos
         dois lados, ela só confirma a porta se **o CEP ou a cidade baterem**.
         MEDIDO no aparelho (08/08, build publicado): eu mandava número + rua +
         bairro e NUNCA casava — cadastrei duas vezes no mesmo endereço sem um
         aviso. Bairro não entra na conta dela; o CEP é que decide. Por isso o
         aviso agora exige CEP e o manda junto: guarda que não dispara é pior
         que guarda nenhuma, porque dá sensação de conferência. */
      if (d.numero && d.rua && d.cep) {
        let repetidas = [];
        try {
          const p = new URLSearchParams({ numero: d.numero, endereco: d.rua, cep: d.cep });
          if (d.bairro) p.set('bairro', d.bairro);
          const r = await window.API.get(`/nucleo/contas/por-endereco?${p.toString()}`);
          repetidas = Array.isArray(r && r.contas) ? r.contas : [];
        } catch (_) { repetidas = []; }
        if (repetidas.length) {
          const nomes = repetidas.slice(0, 3).map((c) => esc(c.name || c.nome || '')).filter(Boolean).join(', ');
          /* O portão do mock não devolve resposta — ele FECHA. Então a segunda
             metade do caminho vira uma AÇÃO própria, e o botão a chama. Nada de
             promessa esperando um clique que pode nunca vir: portão fechado por
             fora deixaria o cadastro pendurado pra sempre. */
          return window.portao({
            tom: 'alerta', ico: 'alert', titulo: 'Já tem cliente nesta porta',
            sub: `${nomes || 'Outro cadastro'} já está neste endereço. Cadastrar de novo cria cliente repetido.`,
            acoes: [['Deixar pra lá', '', true], ['Cadastrar assim', 'principal']],
            acaoPrincipal: 'criar-cliente-assim',
          });
        }
      }
      await criarCliente(d);
    });
  }

  /** a criação de verdade — chamada direta ou depois do aviso de porta repetida */
  async function criarCliente(dado) {
    const d = dado || novoRascunho();
    if (!d.nome) return;
    window.usarDados('novocliente', { ...d, salvando: 1 });
    const corpo = { nome: d.nome, isCliente: true };
    if (d.telefone) { corpo.phone = d.telefone; corpo.whatsapp = d.telefone; }
    if (d.cep) corpo.cep = d.cep;
    if (d.rua) corpo.endereco = d.rua;
    if (d.numero) corpo.numero = d.numero;
    if (d.bairro) corpo.bairro = d.bairro;
    // cidade/UF que o CEP digitado trouxe (geo/cep): viajam junto, o cadastro
    // nasce completo sem campo novo na tela.
    if (novoCepInfo && novoCepInfo.cidade) corpo.cidade = novoCepInfo.cidade;
    if (novoCepInfo && novoCepInfo.uf) corpo.uf = novoCepInfo.uf;
    if (novoLocal) {
      corpo.lat = novoLocal.lat; corpo.lng = novoLocal.lng;
      corpo.geoFonte = 'gps_cadastro';
      if (Number.isFinite(novoLocal.precisaoM)) corpo.gpsAccuracy = novoLocal.precisaoM;
    }
    const tinhaLocal = !!novoLocal;
    let criado;
    try { criado = await window.API.post('/nucleo/contas', corpo); }
    catch (e) { window.usarDados('novocliente', { ...d, salvando: 0 }); return avisoErro(e); }
    novoEmBranco();
    await carregarClientes();
    // Cai na FICHA do cliente novo quando o servidor devolveu o id: é onde se
    // marca dia e produto, que é o passo seguinte natural de quem cadastrou.
    const id = criado && (criado.id || (criado.conta && criado.conta.id));
    // O `CLIENTES.get` que guardava esta porta caiu junto com o de dentro do
    // `abrirCliente`: cliente novo que nasce fora da página carregada (base com
    // mais de 100) caía na lista em vez da ficha dele.
    if (id) await abrirCliente(String(id));
    else window.ir('clientes');
    window.portao({
      tom: 'ok', ico: 'check', titulo: 'Cliente cadastrado',
      sub: tinhaLocal ? 'Com o local marcado na porta.' : 'Sem local marcado — dá pra marcar na primeira entrega.',
      acoes: [['Fechar', 'principal', true]],
    });
  }

  /* ==========================================================================
     PARADA AVULSA — o "+" da Montagem e da Rota (09/08, cobrança do dono:
     "cadê o + que eu adicionava uma rota avulsa, e tinha opções?").

     Ela existia no app antigo com o nome "Rota rápida" e foi apagada em 07/08
     pela regra do satélite morto, porque o MIOLO nunca tinha sido reescrito
     aqui — sobrou o ícone. Isto é o miolo. O motor no servidor ficou INTEIRO,
     e por isso esta seção não estreia endpoint nenhum:

       achar a porta   → /logistica/geo/link · /geo/cep · /geo/busca · /geo/reverse
       quem mora nela  → /nucleo/contas/por-endereco
       a conta         → POST /nucleo/contas (PATCH quando é stub de endereço)
       a entrega       → POST /logistica/entregas com `paraMinhaRota`
       o encaixe       → POST /logistica/rota/planejar com `ordemManual`

     💰 A parada é ABSORVIDA pela rota: quem cobra crédito é o Iniciar, e
     re-planejar o mesmo dia não debita de novo (claim único por
     empresa+motorista+data+bloco). Adicionar parada não gasta.
     ========================================================================== */
  let rapida = null;                 // o rascunho da tela; null = ninguém abriu

  const PAR_COORD = /(-?\d{1,2}[.,]\d{3,8})\s*,\s*(-?\d{1,3}[.,]\d{3,8})/;
  const digitos = (v) => String(v || '').replace(/\D/g, '');
  /* O `pontoOk` que morava aqui era a MESMA régua de pino com outro nome — e
     enquanto ela tinha dois nomes, a montagem foi consertada num e não no
     outro. Hoje é `pinoValido`, no topo do arquivo, para o app inteiro. */
  /** "13500-000 1067" → {cep:'13500000', numero:'1067'}. Sem CEP no texto, null. */
  function lerCepENumero(texto) {
    const t = String(texto || '');
    const cep = /(\d{5})-?(\d{3})/.exec(t);
    if (!cep) return null;
    const depois = t.slice(cep.index + cep[0].length);
    const num = /(\d{1,6})/.exec(depois) || /(\d{1,6})\s*[,-]?\s*$/.exec(t.slice(0, cep.index));
    return { cep: `${cep[1]}${cep[2]}`, numero: num ? num[1] : '' };
  }
  /* Conta SEM papel nenhum = stub de endereço (é assim que a parada "Direção"
     nasce). Quem cadastra por cima ASSUME o stub em vez de abrir linha nova. */
  const contaEhStub = (c) => !!c && !c.isCliente && !c.isLead && !c.isFornecedor;
  const nomeDaConta = (c) => (!c ? ''
    : String(c.nome || '').trim() || [c.endereco, c.numero].filter(Boolean).join(', ') || 'Cadastro sem nome');
  /* 🔴 CADASTRO NÃO ACEITA LIXO (dono, 28/07: "se a pessoa clicou em CADASTRO
     tem q cadastrar certinho, e comece a barrar lixo pra dentro do sistema").
     "1", "...", "-" não são nome. Em Direção o nome segue opcional — ali o
     pedido foi "só traçar rota mesmo, sem produto, sem valor nem nada". */
  function nomeDeCadastroValido(nome) {
    const limpo = String(nome || '').trim();
    if (limpo.length < 2) return false;
    return (limpo.match(/[a-zà-ÿ]/gi) || []).length >= 2;
  }
  /** as paradas do dia que ainda não foram resolvidas, na ordem do servidor */
  function paradasAbertas() {
    const abertas = [];
    ENTREGAS.forEach((e, id) => {
      const it = e && e.item;
      const st = String((it && it.status) || '');
      if (st !== 'entregue' && st !== 'cancelada') abertas.push({ id: String(id), item: it });
    });
    return abertas;
  }
  /* Parada ABERTA da mesma conta hoje. Entregue não conta: voltar no mesmo
     cliente depois de entregar é operação real ("esqueci o galão"). */
  const paradaAbertaDaConta = (contaId) => (!contaId ? null
    : paradasAbertas().find((p) => String((p.item && p.item.cliente && p.item.cliente.id) || '') === String(contaId)) || null);

  /* 🔴 DIREÇÃO × CADASTRO — e aqui o app novo CORRIGE o antigo. Lá, QUALQUER
     ponto resolvido virava `origem:'mapa'`, e `rapidaModo` devolvia 'direcao'
     pra todos eles: quem procurava um endereço ESCRITO e tocava em "Cadastro"
     não cadastrava nada — o botão existia e não fazia. A régua certa não é de
     onde veio o ponto, é se existe ENDEREÇO CONFERIDO pra guardar:
       · link do Maps / coordenada colada → é um PINO cru, sem endereço que a
         base possa confiar: só Direção (`soDirecao`), e a fileira nem aparece;
       · endereço escrito ou CEP+número → veio do geocodificador com rua,
         bairro e cidade: Cadastro é escolha legítima. */
  const modoDaRapida = (r) => (!r ? 'direcao'
    : (r.origem === 'ponto' ? 'direcao' : (r.modo === 'cadastro' ? 'cadastro' : 'direcao')));

  const tituloDaPorta = (res, numero) => {
    const n = digitos(numero) || String((res && res.numero) || '');
    return [String((res && res.endereco) || '').trim(), n].filter(Boolean).join(', ')
      || String((res && res.cidade) || '').trim() || 'Endereço marcado';
  };
  const detalheDaPorta = (res) => [
    String((res && res.bairro) || '').trim(),
    [String((res && res.cidade) || '').trim(), String((res && res.uf) || '').trim()].filter(Boolean).join(' — '),
  ].filter(Boolean).join(' · ');

  /** a tela nasce EM BRANCO — mesma lei do `novoEmBranco` do cadastro */
  function rapidaEmBranco(veioDe) {
    // Porta de entrada MARCADA, nunca deduzida (mesma lei do `ficha.volta`): quem
    // entrou pela Rota tem que voltar pra Rota, senão o Voltar do Android mente.
    const volta = veioDe === 'rotalista' || veioDe === 'rota' ? veioDe : 'montagem';
    rapida = {
      volta,
      origem: '',            // '' | 'ponto' | 'busca' | 'cep'
      resolvido: null, opcoes: [], duplicado: null,
      cep: '', numero: '', nome: '',
      modo: 'direcao', posicao: 'perto',
      aviso: '', buscando: false, salvando: false,
      /* A PORTA "MEUS CLIENTES" (09/08). Ela abre PRIMEIRO de propósito: a
         pergunta "quem entra na rota?" quase sempre se responde com gente que
         já está na base — digitar endereço é o caso raro, não o caminho. */
      porta: 'cadastro',
      buscaCliente: '', lista: [], escolhidos: [],
      listaCarregando: true, listaSemFonte: false,
    };
    if (typeof window.usarDados !== 'function') return;
    window.usarDados('rapida', {
      volta, busca: '', buscando: 0, salvando: 0, opcoes: [], achado: null,
      aviso: '', modo: 'direcao', soDirecao: 0, nome: '', pedeNome: 0,
      temRota: paradasAbertas().length ? 1 : 0, posicao: 'perto',
      porta: 'cadastro', buscaCliente: '', clientes: [], escolhidos: [],
      listaCarregando: 1, listaSemFonte: 0,
    });
  }

  /* A LISTA DA PORTA "MEUS CLIENTES" — mesma fonte da tela de Clientes
     (`/nucleo/clientes`, `isCliente` obrigatório: lead e fornecedor não entram
     na rota de quem vende). Fonte PRÓPRIA e bandeiras próprias: a busca de
     endereço da outra porta pode estar no chão sem apagar esta lista. */
  let clientesDaRapidaEmVoo = false;
  async function carregarClientesDaRapida() {
    const r = rapida;
    if (!r || !temPonte() || typeof window.usarDados !== 'function') return;
    if (clientesDaRapidaEmVoo) return;
    clientesDaRapidaEmVoo = true;
    try {
      const p = new URLSearchParams({ page: '1', pageSize: '100' });
      if (r.buscaCliente) p.set('query', r.buscaCliente);
      let resp;
      try { resp = await window.API.get(`/nucleo/clientes?${p.toString()}`); } catch (_) {
        if (rapida === r) { r.listaCarregando = false; r.listaSemFonte = true; publicarRapida(); }
        return;
      }
      if (rapida !== r) return;
      r.lista = (Array.isArray(resp && resp.items) ? resp.items : []).filter((c) => c && c.isCliente === true);
      r.listaCarregando = false; r.listaSemFonte = false;
      publicarRapida();
    } finally { clientesDaRapidaEmVoo = false; }
  }

  /* Publica o rascunho na tela. O que o dedo DIGITOU volta junto (`busca`,
     `nome`), pela mesma razão do `novoRascunho`: `usarDados` remonta a camada,
     e sem devolver os campos o motorista veria sumir o que acabou de escrever. */
  function publicarRapida() {
    const r = rapida;
    if (!r || typeof window.usarDados !== 'function') return;
    const res = r.resolvido;
    const modo = modoDaRapida(r);
    const vaiBatizar = !r.duplicado || contaEhStub(r.duplicado);
    window.usarDados('rapida', {
      volta: r.volta,
      busca: esc(campo('rapida-busca')),
      buscando: r.buscando ? 1 : 0,
      salvando: r.salvando ? 1 : 0,
      // lista e porta escolhida nunca convivem — quem escolheu, escolheu.
      opcoes: res ? [] : r.opcoes.map((o) => ({
        titulo: esc(o.nome || o.endereco || 'Endereço'),
        detalhe: esc(o.detalhe || detalheDaPorta(o)),
        dist: pinoValido(o.lat, o.lng) && ultimaPos
          ? emMetros(metrosEntre(ultimaPos, { lat: Number(o.lat), lng: Number(o.lng) })) : '',
      })),
      achado: res ? {
        titulo: esc(tituloDaPorta(res, r.numero)),
        detalhe: esc(detalheDaPorta(res)),
        quem: r.duplicado ? esc(nomeDaConta(r.duplicado)) : '',
      } : null,
      aviso: esc(r.aviso || ''),
      modo,
      soDirecao: r.origem === 'ponto' ? 1 : 0,
      nome: esc(campo('rapida-nome') || r.nome || ''),
      pedeNome: modo === 'cadastro' && vaiBatizar ? 1 : 0,
      temRota: paradasAbertas().length ? 1 : 0,
      posicao: r.posicao,
      /* A porta "Meus clientes" vai JUNTO em todo repinte — as duas portas são
         uma tela só, e publicar meia tela deixaria a lista sumindo cada vez que
         a busca de endereço escrevesse. */
      porta: r.porta === 'endereco' ? 'endereco' : 'cadastro',
      buscaCliente: esc(campo('rapida-cliente-busca') || r.buscaCliente || ''),
      listaCarregando: r.listaCarregando ? 1 : 0,
      listaSemFonte: r.listaSemFonte ? 1 : 0,
      escolhidos: (r.escolhidos || []).slice(),
      clientes: (r.lista || []).map((c) => ({
        id: String(c.id),
        ini: iniciais(c.name),
        nome: esc(c.name),
        endereco: [esc(c.endereco), esc(c.cidade)].filter(Boolean).join(' • '),
        // Quem já está na rota de hoje aparece marcado e DESLIGADO: a mesma
        // porta não entra 2× (o freio que o `rapidaConfirmar` já cobra), e
        // dizer isso na lista evita o toque que ia levar recusa.
        naRota: paradaAbertaDaConta(String(c.id)) ? 1 : 0,
      })),
    });
  }

  /* Um ponto vira porta: o reverse dá rua/bairro/CEP de graça. Ele é ENFEITE —
     falhar não trava nada, porque o pino sozinho já basta pra parada existir. */
  async function rapidaFixarPonto(lat, lng, rotulo, origem) {
    const r = rapida;
    if (!r) return;
    r.origem = origem; r.opcoes = [];
    if (rotulo && !String(r.nome || '').trim()) r.nome = String(rotulo).slice(0, 120);
    r.resolvido = { fonte: origem, endereco: rotulo || '', bairro: '', cidade: '', uf: '', cep: '', numero: '', lat, lng };
    let rev = null;
    try { rev = await window.API.get(`/logistica/geo/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`); }
    catch (_) { rev = null; }
    if (rapida !== r || !rev) return;
    r.resolvido = {
      fonte: origem, endereco: rev.endereco || rotulo || '', bairro: rev.bairro || '',
      cidade: rev.cidade || '', uf: rev.uf || '', cep: rev.cep || '', numero: rev.numero || '', lat, lng,
    };
    if (rev.cep) r.cep = rev.cep;
    if (rev.numero) r.numero = rev.numero;
  }

  /* 🔴 UM CAMPO SÓ, QUATRO CAMINHOS. É o conserto de 31/07 do app antigo ("criar
     uma rota simples já existe, mas tá ruim"): pedir CEP **e** número, os dois
     obrigatórios, não servia pra ir na casa de um amigo que mandou a
     localização pelo WhatsApp. Aqui o mesmo campo engole os quatro jeitos de
     dizer "é aqui" — link/coordenada, CEP com número, CEP sozinho e endereço
     escrito — e é o texto que decide qual porta do servidor atender. */
  async function rapidaBuscar() {
    const r = rapida;
    if (!r || r.buscando || r.salvando) return;
    const texto = campo('rapida-busca').trim();
    if (!texto) {
      r.aviso = 'Escreva o endereço, o CEP com número, ou cole a localização.';
      r.resolvido = null;
      return publicarRapida();
    }
    r.buscando = true; r.aviso = ''; r.duplicado = null; r.opcoes = []; r.resolvido = null;
    publicarRapida();
    try {
      const cn = lerCepENumero(texto);
      if (/https?:\/\//i.test(texto) || PAR_COORD.test(texto)) {
        // Só o SERVIDOR abre link curto do Maps: redirecionamento é rede, e o
        // WebView não segue esse salto sozinho.
        const lido = await window.API.get(`/logistica/geo/link?u=${encodeURIComponent(texto)}`);
        if (lido && pinoValido(lido.lat, lido.lng)) {
          await rapidaFixarPonto(Number(lido.lat), Number(lido.lng), String(lido.rotulo || ''), 'ponto');
        } else {
          r.aviso = 'Não consegui ler essa localização. Tente o endereço escrito.';
        }
      } else if (cn && cn.numero) {
        const res = await window.API.get(`/logistica/geo/cep?cep=${encodeURIComponent(cn.cep)}&numero=${encodeURIComponent(cn.numero)}`);
        if (res && (res.fonte === 'cnefe' || res.fonte === 'geocode' || res.endereco || res.cidade)) {
          r.origem = 'cep'; r.cep = cn.cep; r.numero = cn.numero; r.resolvido = res;
        } else {
          r.aviso = 'Não encontrei este endereço. Confira o CEP e o número.';
        }
      } else if (cn) {
        /* 🔴 CEP SEM NÚMERO NÃO É ERRO (01/08). Metade do país é S/N — posto,
           chácara, praça, comércio, estrada — e exigir número travava o
           motorista na rua, parado num lugar que número não tem. O servidor
           devolve o ponto do TRECHO; a tela avisa que é aproximado e quem
           confirma é a pessoa. */
        const res = await window.API.get(`/logistica/geo/cep?cep=${encodeURIComponent(cn.cep)}`);
        if (res && pinoValido(res.lat, res.lng)) {
          r.origem = 'cep'; r.cep = cn.cep; r.numero = ''; r.resolvido = res;
          r.aviso = 'Sem número: o ponto é o da rua. Confira antes de adicionar.';
        } else if (res && (res.endereco || res.cidade)) {
          r.aviso = `${res.endereco || 'Esta rua'} — não achei o ponto exato. Informe o número, se houver.`;
        } else {
          r.aviso = 'Não encontrei este CEP. Confira, ou escreva o endereço.';
        }
      } else {
        // Endereço escrito: o servidor devolve candidatas e QUEM ESCOLHE É ELE.
        const perto = ultimaPos && pinoValido(ultimaPos.lat, ultimaPos.lng)
          ? `&lat=${encodeURIComponent(ultimaPos.lat)}&lng=${encodeURIComponent(ultimaPos.lng)}` : '';
        const payload = await window.API.get(`/logistica/geo/busca?q=${encodeURIComponent(texto)}${perto}`);
        const itens = (payload && Array.isArray(payload.items) ? payload.items : [])
          .filter((it) => pinoValido(it.lat, it.lng)).slice(0, 4);
        if (itens.length === 1) await rapidaFixarPonto(Number(itens[0].lat), Number(itens[0].lng), String(itens[0].nome || ''), 'busca');
        else if (itens.length) r.opcoes = itens;
        else r.aviso = 'Não encontrei esse endereço.';
      }
    } catch (e) {
      r.resolvido = null;
      r.aviso = humano(e);
    }
    if (rapida !== r) return;                 // a tela trocou no meio da rede
    r.buscando = false;
    publicarRapida();
    if (r.resolvido) await rapidaCheckarPorta();
  }

  /** a candidata que o dedo escolheu vira A porta */
  async function rapidaEscolher(indice) {
    const r = rapida;
    const o = r && Array.isArray(r.opcoes) ? r.opcoes[Number(indice)] : null;
    if (!o || r.buscando || r.salvando) return;
    r.buscando = true; publicarRapida();
    await rapidaFixarPonto(Number(o.lat), Number(o.lng), String(o.nome || ''), 'busca');
    if (rapida !== r) return;
    r.buscando = false;
    publicarRapida();
    if (r.resolvido) await rapidaCheckarPorta();
  }

  /* 🔴 QUEM JÁ MORA NESTA PORTA? (dono, 28/07: "nem compara se já existe o
     endereço?"). A régua de "mesma porta" é do BACKEND e é fail-closed: na
     dúvida ele responde vazio. Best-effort — consulta que falha não trava o
     fluxo, só deixa de avisar. Sem número não dá pra perguntar: "Rua 3a" sem
     número casaria com a rua inteira. */
  async function rapidaCheckarPorta() {
    const r = rapida;
    const res = r && r.resolvido;
    if (!r || !res) return;
    const numero = digitos(r.numero) || digitos(res.numero);
    if (!numero) { r.duplicado = null; return publicarRapida(); }
    const cep = digitos(r.cep) || digitos(res.cep);
    const q = [`numero=${encodeURIComponent(numero)}`];
    if (cep.length === 8) q.push(`cep=${encodeURIComponent(cep)}`);
    if (res.endereco) q.push(`endereco=${encodeURIComponent(res.endereco)}`);
    if (res.bairro) q.push(`bairro=${encodeURIComponent(res.bairro)}`);
    if (res.cidade) q.push(`cidade=${encodeURIComponent(res.cidade)}`);
    if (res.uf) q.push(`uf=${encodeURIComponent(res.uf)}`);
    let achada = null;
    try {
      const resp = await window.API.get(`/nucleo/contas/por-endereco?${q.join('&')}`);
      achada = resp && Array.isArray(resp.contas) ? resp.contas[0] : null;
    } catch (_) { achada = null; }
    if (rapida !== r) return;
    r.duplicado = achada || null;
    publicarRapida();
  }
  /* ------------------------------------------------------------------------
     HISTÓRICO OPERACIONAL DO CLIENTE

     O financeiro é só uma parte da ficha. Esta folha é o registro da VISITA:
     entregue, pago ou sem atendimento, com data e hora de São Paulo, itens e
     motivo. A API já existia e já está na allowlist do APK; a fusão só havia
     deixado o chamador de fora da pele nova.
     ------------------------------------------------------------------------ */
  function quandoDoHistorico(iso) {
    const ymd = diaEmSp(iso);
    if (!ymd) return '';
    const hm = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
    return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)} · ${hm}`;
  }

  function leituraDoHistorico(linha) {
    const tipo = String(linha && linha.tipo || '');
    if (tipo === 'pago') return { titulo: 'Entregue e pago', icone: 'check', tom: 'lime' };
    if (tipo === 'sem_atendimento') return { titulo: 'Sem atendimento', icone: 'alert', tom: '' };
    return { titulo: 'Entregue, a receber', icone: 'route', tom: '' };
  }

  function linhaDoHistorico(linha) {
    const leitura = leituraDoHistorico(linha);
    const metodo = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' }[
      String(linha && linha.receiptMethod || '').toLowerCase()
    ] || '';
    const detalhes = [
      quandoDoHistorico(linha && linha.createdAt), linha && linha.itensResumo,
      metodo, linha && linha.motivo,
    ].filter(Boolean).map(esc).join(' · ');
    return `<div class="item-linha"><span class="ava${leitura.tom ? ` ${leitura.tom}` : ''}" style="width:32px;height:32px">${ic(leitura.icone,16)}</span>
      <span><strong>${esc(linha && linha.titulo || leitura.titulo)}</strong>${detalhes ? `<span>${detalhes}</span>` : ''}</span></div>`;
  }

  function corpoDoHistorico() {
    const h = historicoCliente;
    if (!h || h.carregando && !h.items.length) {
      return '<div class="box"><div class="box-t">Carregando histórico…</div></div>';
    }
    if (!h.items.length && h.erro) {
      return `<div class="box"><div class="box-t">Não consegui carregar o histórico</div><div class="box-s">${esc(h.erro)}</div>
        <button class="act full" style="margin-top:10px;justify-content:center" data-acao="abrir-historico-cliente">Tentar de novo</button></div>`;
    }
    if (!h.items.length) {
      return '<div class="box"><div class="box-t">Sem visitas registradas</div><div class="box-s">As próximas entregas e atendimentos aparecem aqui.</div></div>';
    }
    const aviso = h.erro
      ? `<div class="banner alerta" style="margin-top:8px">${ic('alert',15)}<span>${esc(h.erro)}</span></div>`
      : '';
    const mais = h.nextCursor
      ? `<button class="act full" style="margin-top:9px;justify-content:center" data-acao="historico-cliente-mais"${h.carregando ? ' disabled aria-busy="true"' : ''}>${h.carregando ? 'Carregando…' : 'Ver mais'}</button>`
      : '';
    return `<div class="cartao-lista" style="padding:0 11px">${h.items.map(linhaDoHistorico).join('')}</div>${aviso}${mais}`;
  }

  function mostrarHistoricoCliente() {
    if (!historicoCliente || typeof window.portao !== 'function') return;
    const nome = ficha && (ficha.detalhe?.name || ficha.item?.name) || 'Cliente';
    window.portao({
      tom: 'info', ico: 'clock', titulo: 'Histórico',
      sub: `${esc(nome)} · entregas e atendimentos`,
      corpo: corpoDoHistorico(),
      acoes: [['Fechar', '', true]],
    });
  }

  async function abrirHistoricoCliente() {
    if (!ficha || !ficha.id || !temPonte()) return;
    const h = { clienteId: String(ficha.id), items: [], nextCursor: '', carregando: true, erro: '' };
    historicoCliente = h;
    mostrarHistoricoCliente();
    try {
      const r = await window.API.get(`/logistica/clientes/${encodeURIComponent(h.clienteId)}/historico?limit=30`);
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      h.items = Array.isArray(r && r.items) ? r.items : [];
      h.nextCursor = String(r && r.nextCursor || '');
    } catch (_) {
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      h.erro = 'Confira a conexão e tente novamente.';
    } finally {
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      h.carregando = false;
      mostrarHistoricoCliente();
    }
  }

  async function carregarMaisHistoricoCliente() {
    const h = historicoCliente;
    if (!h || h.carregando || !h.nextCursor || !temPonte()) return;
    h.carregando = true;
    h.erro = '';
    mostrarHistoricoCliente();
    try {
      const r = await window.API.get(`/logistica/clientes/${encodeURIComponent(h.clienteId)}/historico?limit=30&cursor=${encodeURIComponent(h.nextCursor)}`);
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      const novos = Array.isArray(r && r.items) ? r.items : [];
      h.items.push(...novos);
      h.nextCursor = String(r && r.nextCursor || '');
    } catch (_) {
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      h.erro = 'Não consegui trazer mais visitas agora.';
    } finally {
      if (historicoCliente !== h || !ficha || ficha.id !== h.clienteId) return;
      h.carregando = false;
      mostrarHistoricoCliente();
    }
  }
  /* ========================================================================
     L6c — O VÍNCULO CLIENTE × PRODUTO (12/08, ordem do dono: *"não quero
     somente visualizar produtos… a ficha precisa voltar a permitir administrar
     o vínculo entre aquele cliente e aquele produto"*).

     🔴 O DEFEITO, MEDIDO NA FONTE: a ficha do app novo LIA
     `GET /logistica/cliente-produtos` e desenhava a linha com o chevron — o
     símbolo universal de "abre" — e NENHUM `data-acao`. O "Novo produto /
     entrega" era um botão sem verbo. O CRUD inteiro já existia no servidor
     (POST/PATCH/DELETE `/logistica/cliente-produtos`) e as três portas já
     estavam na allowlist do Kotlin (`NativeApiClient.kt`): é o PADRÃO DA FUSÃO
     de novo — capacidade viva, chamador cortado.

     🔴 E ISTO NÃO É A FICHA DO PRODUTO. `T.fichaproduto` mexe no CATÁLOGO
     (`/logistica/produtos/:id`) — o preço de TODO mundo. Aqui se mexe no que
     ESTE cliente leva: quantidade padrão, preço combinado só com ele, em qual
     porta, e se o vínculo continua gerando entrega. Confundir as duas é mudar o
     preço da empresa inteira achando que se acertou o de uma pessoa.

     PAUSAR ≠ REMOVER, e o servidor faz a mesma distinção:
       · a chave "Entra nas próximas rotas" → PATCH `ativo:false` (o vínculo
         fica, para de gerar);
       · o botão vermelho → DELETE (o vínculo morre; entregas JÁ geradas ficam
         intactas — está escrito no próprio endpoint).
     ======================================================================== */
  let vinculo = null;        // { id, item, novo, rascunho, ativo, produtoId, localId, salvando }
  const CATALOGO = new Map();

  /** o catálogo da empresa, uma vez por sessão de tela (some se a porta cair) */
  async function carregarCatalogoDoVinculo() {
    if (CATALOGO.size) return;
    let r;
    try { r = await window.API.get('/logistica/produtos'); } catch (_) { return; }
    (Array.isArray(r) ? r : []).forEach((p) => {
      if (p && p.ativo !== false) CATALOGO.set(String(p.id), p);
    });
  }

  /** o vínculo da ficha aberta, pelo id da linha tocada */
  const vinculoDaFicha = (id) => (ficha && Array.isArray(ficha.produtos)
    ? ficha.produtos.find((v) => String(v.id) === String(id)) || null : null);

  function publicarVinculo() {
    const v = vinculo;
    if (!v || typeof window.usarDados !== 'function') return;
    const it = v.item || {};
    const p = it.produto || CATALOGO.get(String(v.produtoId)) || null;
    const nomeProduto = p ? String(p.nome || p.name || '') : '';
    const c = ficha ? (ficha.detalhe || ficha.item || {}) : {};
    /* Os locais do CLIENTE — a porta do vínculo. Só vira pergunta pra quem tem
       mais de uma: com um endereço só a resposta é óbvia, e fileira de uma
       opção é enfeite. */
    const locais = (ficha && ficha.detalhe && Array.isArray(ficha.detalhe.locais) ? ficha.detalhe.locais : [])
      .map((l) => [String(l.id), esc(l.apelido || l.endereco || 'Endereço'), esc([l.bairro, l.cidade].filter(Boolean).join(' • '))]);
    /* O preço por cliente é chave da EMPRESA (`precoPorClienteAtivo`) — mas um
       vínculo que JÁ tem preço combinado mostra o campo de qualquer jeito:
       esconder um número que está valendo é o dono nunca descobrir por que a
       entrega sai por 22 quando o catálogo diz 11. */
    const temPreco = String(v.rascunho.preco || '').trim() !== ''
      || typeof it.precoAcordado === 'number';
    window.usarDados('fichavinculo', {
      volta: 'ficha',
      novo: v.novo ? 1 : 0,
      cliente: esc(c.name || c.nome || ''),
      produto: esc(nomeProduto),
      ico: 'box',
      produtoId: String(v.produtoId || ''),
      // a lista só existe enquanto não há produto escolhido (ver o mock)
      catalogo: nomeProduto ? [] : [...CATALOGO.values()].map((x) => [
        String(x.id), esc(x.nome || x.name || 'Produto'), 'box',
        typeof x.precoCatalogo === 'number' ? dinheiro(x.precoCatalogo) : '',
      ]),
      qtd: v.rascunho.qtd,
      preco: v.rascunho.preco,
      precoPorCliente: (config && config.precoPorClienteAtivo) || temPreco ? 1 : 0,
      precoDica: 'Vazio = usa o preço do catálogo',
      locais,
      localId: String(v.localId || ''),
      ativo: v.ativo ? 1 : 0,
      // Remover só existe pra vínculo que EXISTE: num rascunho não há o que apagar.
      podeRemover: v.novo ? 0 : 1,
      salvando: v.salvando ? 1 : 0,
    });
  }

  /** toque na linha do produto da ficha */
  function abrirVinculo(id) {
    const it = vinculoDaFicha(id);
    if (!it) return;
    vinculo = {
      id: String(it.id), item: it, novo: false, salvando: false,
      produtoId: String((it.produto && it.produto.id) || it.productId || ''),
      localId: it.localId ? String(it.localId) : '',
      ativo: it.ativo !== false,
      rascunho: {
        qtd: String(Number(it.qtdPadrao) || 1),
        preco: typeof it.precoAcordado === 'number' ? it.precoAcordado.toFixed(2).replace('.', ',') : '',
      },
    };
    publicarVinculo();
    window.ir('fichavinculo');
    // o catálogo entra depois: editando, o produto não troca — ele só serve pro
    // caso NOVO, e a tela não pode esperar rede pra abrir.
    void carregarCatalogoDoVinculo();
  }

  /** o "+ Novo produto / entrega" da ficha */
  async function novoVinculo() {
    if (!ficha) return;
    vinculo = {
      id: '', item: null, novo: true, salvando: false,
      produtoId: '', localId: '', ativo: true,
      rascunho: { qtd: '1', preco: '' },
    };
    publicarVinculo();
    window.ir('fichavinculo');
    await carregarCatalogoDoVinculo();
    if (!CATALOGO.size) {
      return window.portao({
        tom: 'alerta', ico: 'box', titulo: 'Sem produto no catálogo',
        sub: 'Cadastre o produto em Ajustes › Produtos antes de vincular a um cliente.',
        acoes: [['Fechar', '']],
      });
    }
    publicarVinculo();
  }

  /* O que o dedo digitou vive no DOM e MORRE no repinte — a mesma lei da ficha
     do cliente. Toda troca de chave/porta guarda os dois campos antes de
     republicar, senão escolher o local apagaria a quantidade recém-escrita. */
  function guardarRascunhoDoVinculo() {
    if (!vinculo) return;
    const qtd = naCamada('[data-campo="vinculo-qtd"]');
    const preco = naCamada('[data-campo="vinculo-preco"]');
    if (qtd) vinculo.rascunho.qtd = String(qtd.value || '');
    if (preco) vinculo.rascunho.preco = String(preco.value || '');
  }

  function escolherProdutoDoVinculo(id) {
    if (!vinculo || !id) return;
    guardarRascunhoDoVinculo();
    vinculo.produtoId = String(id);
    publicarVinculo();
  }

  function escolherLocalDoVinculo(id) {
    if (!vinculo) return;
    guardarRascunhoDoVinculo();
    // 2º toque no local aceso DESLIGA: sem porta o vínculo usa o endereço do
    // perfil, que é o que o legado sempre foi (o servidor aceita localId nulo).
    vinculo.localId = String(vinculo.localId || '') === String(id) ? '' : String(id);
    publicarVinculo();
  }

  function virarChaveDoVinculo() {
    if (!vinculo) return;
    guardarRascunhoDoVinculo();
    vinculo.ativo = !vinculo.ativo;
    publicarVinculo();
  }

  /** grava: POST quando é novo, PATCH quando existe. Só o que mudou no PATCH. */
  async function salvarVinculo() {
    const v = vinculo;
    if (!v || v.salvando || !ficha) return;
    guardarRascunhoDoVinculo();
    const qtd = Math.trunc(Number(String(v.rascunho.qtd || '').replace(/\D/g, '')));
    if (!Number.isFinite(qtd) || qtd < 1) {
      return window.portao({
        tom: 'alerta', ico: 'box', titulo: 'Quantidade inválida',
        sub: 'Informe quantas unidades saem por entrega (1 ou mais).', acoes: [['Fechar', '']],
      });
    }
    if (v.novo && !v.produtoId) {
      return window.portao({
        tom: 'alerta', ico: 'box', titulo: 'Falta o produto',
        sub: 'Escolha na lista qual produto este cliente leva.', acoes: [['Fechar', '']],
      });
    }
    /* Preço VAZIO é uma escolha: "use o preço do catálogo". Por isso ele vira
       `null` explícito no PATCH em vez de sumir do corpo — sem isso não haveria
       como DESFAZER um preço combinado, só como trocá-lo por outro. */
    const preco = dinheiroParaNumero(v.rascunho.preco);
    v.salvando = true;
    publicarVinculo();
    try {
      if (v.novo) {
        await window.API.post('/logistica/cliente-produtos', {
          customerProfileId: String(ficha.id),
          productId: Number(v.produtoId),
          qtdPadrao: qtd,
          ativo: !!v.ativo,
          ...(preco != null ? { precoAcordado: preco } : {}),
          ...(v.localId ? { localId: v.localId } : {}),
        });
      } else {
        const it = v.item || {};
        const corpo = {};
        if (qtd !== (Number(it.qtdPadrao) || 0)) corpo.qtdPadrao = qtd;
        const precoAntes = typeof it.precoAcordado === 'number' ? it.precoAcordado : null;
        if (preco !== precoAntes) corpo.precoAcordado = preco;
        if (!!v.ativo !== (it.ativo !== false)) corpo.ativo = !!v.ativo;
        const localAntes = it.localId ? String(it.localId) : '';
        if (String(v.localId || '') !== localAntes) corpo.localId = v.localId || null;
        if (!Object.keys(corpo).length) {
          v.salvando = false;
          publicarVinculo();
          return window.portao({
            tom: 'info', ico: 'check', titulo: 'Nada mudou',
            sub: 'Este produto já está assim pra este cliente.', acoes: [['Fechar', '']],
          });
        }
        await window.API.patch(`/logistica/cliente-produtos/${encodeURIComponent(v.id)}`, corpo);
      }
    } catch (e) {
      v.salvando = false;
      publicarVinculo();
      return avisoErro(e);
    }
    vinculo = null;
    // A ficha se relê inteira: quem decidiu o que valeu foi o servidor, e a
    // lista de produtos dela é justamente o que acabou de mudar.
    await recarregarProdutosDaFicha();
    window.ir('ficha');
    window.portao({
      tom: 'ok', ico: 'check', titulo: 'Produto do cliente salvo',
      sub: 'Vale das próximas entregas em diante.', acoes: [['Fechar', 'principal', true]],
    });
  }

  /** o botão vermelho — REMOVE o vínculo (não a entrega já gerada) */
  function removerVinculo() {
    const v = vinculo;
    if (!v || v.novo || typeof window.portao !== 'function') return;
    const it = v.item || {};
    const nome = String((it.produto && it.produto.nome) || 'este produto');
    window.portao({
      tom: 'alerta', ico: 'trash', titulo: 'Tirar do cliente?',
      // A frase diz o que NÃO acontece: é a dúvida óbvia de quem aperta.
      sub: `${nome} para de entrar nas próximas rotas deste cliente. As entregas já feitas continuam no histórico.`,
      acoes: [['Deixar pra lá', '', true], ['Tirar', 'principal']],
      acaoPrincipal: 'remover-vinculo-agora',
      classe: 'duas',
    });
  }

  async function removerVinculoAgora() {
    const v = vinculo;
    if (!v || v.novo) return;
    try { await window.API.del(`/logistica/cliente-produtos/${encodeURIComponent(v.id)}`); }
    catch (e) { return avisoErro(e); }
    vinculo = null;
    await recarregarProdutosDaFicha();
    window.ir('ficha');
    window.portao({
      tom: 'ok', ico: 'check', titulo: 'Produto retirado',
      sub: 'Ele não entra mais nas próximas rotas deste cliente.',
      acoes: [['Fechar', 'principal', true]],
    });
  }

  /** relê SÓ os produtos da ficha aberta — o resto dela não mudou */
  async function recarregarProdutosDaFicha() {
    if (!ficha) return;
    let r;
    try { r = await window.API.get(`/logistica/cliente-produtos?customerProfileId=${encodeURIComponent(ficha.id)}`); }
    catch (_) { return; }
    if (!ficha) return;
    ficha.produtos = Array.isArray(r) ? r : [];
    encherFicha();
  }
  /* ------------------------------------------------------------------------
     🔴 O ENCAIXE (dono, 28/07): "se tiver perto, ele entra na logística — entre
     1 e 10, se está mais perto do 5, vira o 6 e ficam 11".

     Custo de inserção clássico: em cada perna (anterior → próxima) mede quanto
     CUSTA passar pelo ponto novo no meio — d(ant,novo) + d(novo,prox) −
     d(ant,prox) — e ganha a perna mais barata. Pelas RUAS quando o OSRM
     responde (a mesma matriz do planejador), linha reta quando não: sem rede a
     parada entra num lugar razoável em vez de não entrar.

     Parada ÚNICA também planeja. Sair antes do `/rota/planejar` por "não tem
     perna pra medir" deixava a parada sem `rotaOrdem` — e sem ordem o estado do
     dia volta pra "montar", então o botão travava em "Montar rota" e o Iniciar
     só aparecia depois do 2º endereço.
     ------------------------------------------------------------------------ */
  async function matrizViaria(pontos) {
    if (!Array.isArray(pontos) || pontos.length < 2) return null;
    const coords = pontos.map((p) => `${Number(p.lng)},${Number(p.lat)}`).join(';');
    try {
      const payload = await window.API.get(`/logistica/osrm/table?coords=${encodeURIComponent(coords)}`);
      const m = payload && payload.durations;
      if (payload.code !== 'Ok' || !Array.isArray(m) || m.length !== pontos.length) return null;
      return m;
    } catch (_) { return null; }
  }

  async function encaixarAvulsa(novoId, posicao) {
    const abertas = paradasAbertas();
    const novo = abertas.find((p) => p.id === String(novoId));
    if (!novo) return { aplicado: false, anterior: null };
    const base = abertas.filter((p) => p.id !== String(novoId));
    const ids = base.map((p) => p.id);
    const pontoDe = (p) => {
      const c = (p && p.item && p.item.cliente) || {};
      return pinoValido(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : null;
    };
    const pNovo = pontoDe(novo);
    let indice = ids.length;
    /* 🔴 O RECIBO TEM QUE DIZER O QUE FOI MEDIDO (12/08). O portão do fim
       prometia "encaixa na melhor posição sozinho" e devolvia só o nome de
       quem ficou antes — a POSIÇÃO e o CUSTO ficavam aqui dentro, calculados e
       jogados fora. Recibo que não mostra a conta é recibo decorativo: quem
       está na calçada não tem como saber se o encaixe fez sentido.
       A unidade é honesta: com o OSRM de pé a matriz é de DURAÇÃO (segundos);
       sem rede a conta cai pra linha reta (metros). Misturar as duas num "+1,1"
       sem unidade seria mentir com número. */
    let desvioValor = null;
    let desvioEmSegundos = false;
    if (posicao === 'primeira') indice = 0;
    else if (pNovo && base.length) {
      const pOrigem = ultimaPos && pinoValido(ultimaPos.lat, ultimaPos.lng)
        ? { lat: ultimaPos.lat, lng: ultimaPos.lng } : null;
      // nós[0] = de onde eu saio (pode não existir), depois as paradas na
      // ordem, e o ponto novo no fim.
      const nos = [pOrigem, ...base.map(pontoDe), pNovo];
      const validos = nos.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
      const matriz = await matrizViaria(validos.map((i) => nos[i]));
      const naMatriz = new Map(validos.map((no, k) => [no, k]));
      const d = (a, b) => {
        if (a == null || b == null || !nos[a] || !nos[b]) return Infinity;
        if (matriz && naMatriz.has(a) && naMatriz.has(b)) {
          const v = matriz[naMatriz.get(a)][naMatriz.get(b)];
          if (Number.isFinite(v)) return v;
        }
        return metrosEntre(nos[a], nos[b]);
      };
      const iNovo = nos.length - 1;
      let melhor = Infinity;
      for (let k = 0; k <= base.length; k++) {
        const ant = k === 0 ? (pOrigem ? 0 : null) : k;
        const prox = k < base.length ? k + 1 : null;
        const entrada = ant == null ? 0 : d(ant, iNovo);
        const saida = prox == null ? 0 : d(iNovo, prox);
        const antiga = ant == null || prox == null ? 0 : d(ant, prox);
        const custo = entrada + saida - antiga;
        if (Number.isFinite(custo) && custo < melhor) { melhor = custo; indice = k; }
      }
      if (Number.isFinite(melhor)) { desvioValor = Math.max(0, melhor); desvioEmSegundos = !!matriz; }
    }
    const ordem = [...ids.slice(0, indice), String(novoId), ...ids.slice(indice)];
    await window.API.post('/logistica/rota/planejar', {
      date: hojeISO(), deliveryIds: ordem, ordemManual: ordem, ...origemGps(),
    });
    const anterior = indice > 0 ? base[indice - 1] : null;
    const nomeAnterior = anterior && anterior.item && anterior.item.cliente && anterior.item.cliente.nome;
    return {
      aplicado: true,
      anterior: nomeAnterior || null,
      // 1-based: a pessoa conta paradas a partir de 1, não de 0.
      posicao: indice + 1,
      deTotal: ordem.length,
      desvio: desvioValor == null ? '' : (desvioEmSegundos ? emMinutos(desvioValor) : emMetros(desvioValor)),
    };
  }

  /* 🔴 O PORTÃO SÓ NASCE DEPOIS QUE A TELA PAROU DE SE PINTAR (09/08, medido).
     `portao()` monta na camada VIVA — e `ir('montagem')` dispara um
     `encherMontagem()` que termina DEPOIS: quando termina, `usarDados` repinta
     e leva embora a camada inteira, com o portão dentro. O aviso simplesmente
     não aparecia, e no caminho do ERRO isso apagava a única frase que dizia que
     a parada tinha sido criada. É a mesma receita do `criarCliente`, que espera
     a ficha carregar antes de avisar: navega, ESPERA o dado da tela, e só
     então fala. */
  async function voltarDaAvulsa(volta) {
    window.ir(volta);
    if (volta !== 'montagem') return;
    try { await encherMontagem(); } catch (_) { /* o aviso vale mais que a lista */ }
  }

  async function rapidaConfirmar() {
    const r = rapida;
    if (!r || r.salvando || r.buscando || !r.resolvido) return;
    const res = r.resolvido;
    const modo = modoDaRapida(r);
    const dup = r.duplicado;
    const nomeDigitado = (campo('rapida-nome') || String(r.nome || '')).trim();
    /* 🔴 TRÊS FREIOS ANTES DE ESCREVER QUALQUER COISA NA BASE:
       1. a mesma porta não entra 2× na rota do dia;
       2. Cadastro sem nome de gente não passa (Direção passa, é só direção);
       3. endereço que já tem conta REUSA a conta — nada de linha nova. */
    if (dup && paradaAbertaDaConta(dup.id)) {
      r.aviso = `${nomeDaConta(dup)} já está na rota de hoje.`;
      return publicarRapida();
    }
    const vaiBatizar = !dup || contaEhStub(dup);
    const pedeNome = modo === 'cadastro' && vaiBatizar;
    if (pedeNome && !nomeDeCadastroValido(nomeDigitado)) {
      r.aviso = 'Escreva o nome do cliente.';
      return publicarRapida();
    }
    const posicao = r.posicao;
    const volta = r.volta;
    /* 🔴 DEPOIS DE CRIAR, NÃO DÁ PRA VOLTAR ATRÁS — e o `catch` tem que saber
       disso. A conta e a entrega já existem no servidor; se a rede cair no
       ENCAIXE (que vem depois), tratar como "não deu certo" seria mentira:
       a parada está lá. Sem este marcador o `catch` tentava repintar um
       rascunho já apagado, e a tela ficava travada em "Adicionando…" pra
       sempre — com a parada criada por trás. */
    let criou = false;
    r.salvando = true; r.aviso = ''; publicarRapida();
    try {
      const numero = digitos(r.numero) || String(res.numero || '');
      const nome = nomeDigitado || [res.endereco, numero].filter(Boolean).join(', ') || 'Parada avulsa';
      let contaId = dup ? String(dup.id) : '';
      if (dup && pedeNome) {
        // Stub de endereço vira CADASTRO de verdade: MESMA conta, agora com nome
        // e papel de cliente. Cadastro que JÁ tem nome nunca é renomeado daqui —
        // quem edita ficha de cliente é a ficha.
        await window.API.patch(`/nucleo/contas/${encodeURIComponent(dup.id)}`, { nome, isCliente: true });
      }
      if (!contaId) {
        const corpo = {
          /* 🔴 DIREÇÃO NÃO VIRA CLIENTE. A conta existe só pra segurar o
             endereço da parada (a entrega precisa de uma), mas fica FORA do
             Cadastro — a lista de Clientes filtra `isCliente`, a rota não. Sem
             isto, cada parada avulsa virava um "cliente" chamado
             "Rua 14 JP, 1682" na base do dono. */
          nome, tipo: 'pf', isCliente: modo === 'cadastro', isLead: false,
          endereco: res.endereco, numero, bairro: res.bairro, cidade: res.cidade, uf: res.uf,
          cep: digitos(r.cep) || res.cep,
        };
        /* O pino viaja quando ELE é a intenção (link colado, candidata escolhida
           na lista). Em CEP+número não: ali o servidor resolve pela base CNEFE,
           que é a fonte certa e grava a `geoFonte` certa junto. */
        if (r.origem !== 'cep' && pinoValido(res.lat, res.lng)) {
          corpo.lat = Number(res.lat); corpo.lng = Number(res.lng);
          /* 🔴 PINO DE BASE NÃO É FIX DE GPS (F4, 12/08). Quem escolheu no painel
             sabe DE ONDE o ponto veio (Censo, Receita) e diz. Calando, o servidor
             decide pela `gpsAccuracy` que não veio e grava `gps_impreciso` — que
             conta a história de um GPS ruim onde não houve GPS nenhum, e é por
             esse rótulo que as telas decidem se ainda precisam pedir a porta ao
             motorista. Quem MEDE a qualidade continua sendo o servidor: 'geocode'
             é justamente a fonte que ele aceita sem provar nada (força 1). */
          if (r.geoFonteEscolhida) corpo.geoFonte = r.geoFonteEscolhida;
        }
        Object.keys(corpo).forEach((k) => {
          if (corpo[k] === undefined || corpo[k] === null || corpo[k] === '') delete corpo[k];
        });
        const criado = await window.API.post('/nucleo/contas', corpo);
        contaId = criado && (criado.contaId || criado.customerProfileId || criado.id);
      }
      if (!contaId) throw new Error('Não consegui criar o cadastro desta porta.');
      /* 🔴 `paraMinhaRota` FAZ A ENTREGA NASCER COM MOTORISTA. Sem ele ela nasce
         órfã e o Iniciar responde "Atribua as entregas a exatamente um
         motorista" pro dia INTEIRO — uma parada avulsa envenenava o dia. */
      const entrega = await window.API.post('/logistica/entregas', {
        customerProfileId: String(contaId),
        quantidade: 1,
        scheduledAt: `${hojeISO()}T12:00:00.000Z`,
        paraMinhaRota: true,
      });
      criou = true;
      rapida = null;
      // A rota tem que ser relida ANTES do encaixe: é dela que sai a lista de
      // abertas em que a parada nova vai entrar.
      await carregarRota();
      let encaixe = { aplicado: false, anterior: null };
      const novoId = entrega && entrega.id ? String(entrega.id) : '';
      if (novoId) encaixe = await encaixarAvulsa(novoId, posicao);
      // A escolha dele já está gravada — e desde 10/08 a Montagem não
      // reotimiza nada sozinha ao abrir, então ninguém passa por cima.
      await carregarRota();
      await voltarDaAvulsa(volta);
      window.portao({
        tom: 'ok', ico: 'check', titulo: 'Parada adicionada',
        /* O RECIBO MOSTRA A CONTA QUE FOI FEITA — posição, de quantas, depois
           de quem, e quanto custou o encaixe. Tudo saído da resposta do
           `encaixarAvulsa`; nada aqui é enfeite escrito à mão. */
        sub: !encaixe.aplicado ? 'Ela entrou na rota de hoje.'
          : [
            `Parada ${encaixe.posicao} de ${encaixe.deTotal}`,
            encaixe.anterior ? `, depois de ${encaixe.anterior}` : ', como primeira',
            encaixe.desvio ? ` · menor desvio: +${encaixe.desvio}` : '',
          ].join('') + '.',
        acoes: [['Fechar', 'principal', true]],
      });
    } catch (e) {
      if (!criou) {
        // Nada foi escrito: devolve a tela como estava e o dedo tenta de novo.
        if (rapida === r) { r.salvando = false; publicarRapida(); }
        return avisoErro(e);
      }
      // A parada EXISTE; o que falhou foi a ordem. Dizer "não deu certo" aqui
      // faria ele adicionar o mesmo endereço duas vezes.
      rapida = null;
      try { await carregarRota(); } catch (_) { /* já estamos no desvio */ }
      await voltarDaAvulsa(volta);
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'A parada entrou',
        sub: 'Mas não consegui reordenar a rota agora. Ela acha o lugar dela no Iniciar.',
        acoes: [['Fechar', 'principal', true]],
      });
    }
  }

  /* ==========================================================================
     "MONTAR ROTA AGORA, 5 PONTOS" (dono, 09/08) — a porta "Meus clientes".

     🔴 O VERBO SÓ CUMPRE SE OS PONTOS PUDEREM SER ESCOLHIDOS. Até aqui a única
     entrada avulsa era digitar endereço, uma por vez: montar 5 pontos do
     próprio cadastro custava 5 buscas de endereço, mesmo com os 5 na base.
     Aqui a lista é a base, marca-se quem entra e o toque faz as duas metades do
     verbo — cria as paradas e MONTA a ordem — deixando o pé da Montagem em
     "Iniciar rota".

     Sem endpoint novo: `paraMinhaRota` (a entrega nasce com motorista, senão o
     Iniciar recusa o dia inteiro) e o `planejar` de sempre.

     🔴 UMA DE CADA VEZ, e não `Promise.all`. Cinco POSTs em paralelo disputam a
     mesma rota no servidor, e o que eu ganharia em segundos eu perderia em não
     saber QUEM entrou quando um falha. Aqui a falha é por NOME.
     ========================================================================== */
  async function rapidaAdicionarEscolhidos() {
    const r = rapida;
    if (!r || r.salvando || r.buscando) return;
    const nomePorId = new Map((r.lista || []).map((c) => [String(c.id), String(c.name || 'Cliente')]));
    // A mesma porta não entra 2× na rota do dia — mesmo freio do `rapidaConfirmar`.
    const ids = (r.escolhidos || []).map(String).filter((id) => !paradaAbertaDaConta(id));
    if (!ids.length) {
      r.aviso = 'Marque quem entra na rota.';
      return publicarRapida();
    }
    const volta = r.volta;

    /* ------------------------------------------------------------------------
       🔴 ROTA POR MONTAR ⇒ ISTO É RASCUNHO, NÃO GRAVAÇÃO (dono, 09/08: "eu ainda
       nem confirmei q queria nada, ele meio q já adiciona").
       Entrou pela Montagem e a rota ainda não saiu pra rua? Então marcar cliente
       é DECIDIR, e decidir não escreve na base: os escolhidos vão pro rascunho,
       aparecem na lista da Montagem, e viram entrega no "Salvar rota" / "Montar
       rota" / "Iniciar rota" (ver `materializarRascunho`). Voltar joga fora.
       A exceção mora logo abaixo e é do domínio: com a rota VIVA na rua o
       propósito do gesto é somar a ela agora — lá não existe momento "salvar". */
    if (volta === 'montagem' && !rotaNaRua()) {
      const nomes = new Map((r.lista || []).map((c) => [String(c.id), c]));
      /* Aqui a chave é o CLIENTE, e de propósito: `/nucleo/clientes` não fala
         de locais, então marcar alguém nesta porta quer dizer "este cliente",
         no endereço do perfil. Chavear por `cliente|localId` faria quem já
         entrou pelo histórico numa porta nascer DE NOVO no perfil — uma
         segunda visita que ninguém pediu. Porta que não conhece porta
         deduplica por quem ela conhece. */
      const jaNoRascunho = new Set(RASCUNHO.map((c) => String(c.id)));
      let novos = 0;
      ids.forEach((id) => {
        if (jaNoRascunho.has(String(id))) return;
        const c = nomes.get(String(id)) || {};
        /* 🔴 MESMA CASCA ⇒ MESMA BAGAGEM (dono, 09/08: "a gente combinou de
           fazer tudo com a mesma casca, mesmas regras"). A linha do rascunho
           senta no MESMO cartão da prévia da agenda e é lida pela MESMA régua
           (`pernaDaPrevia`) — então ela viaja com o PINO e com o
           `resolveSozinho` que a linha da agenda já traz do servidor. Sem
           isso a mesma tela falava duas línguas: a semana quieta e a avulsa
           gritando "não sei onde fica" pra cliente com porta marcada.
           Recorrência ativa = a régua de `logistica-base-saude` ("a 1ª
           entrega grava a porta pelo GPS do entregador"), lida do
           `diasEntrega` que o card de clientes já manda. Zero não é pino
           (a lição do mapa na África).

           🔴 E O ENDEREÇO SE MONTA COM O NÚMERO. Esta é a ÚNICA das três
           origens da lista que não recebe `enderecoLinha` pronta: o
           `/nucleo/clientes` manda `endereco` e `numero` em campos separados,
           e o `numero` era simplesmente ignorado aqui. Medido na empresa 41:
           44 dos 225 clientes têm o número só nessa coluna — o cartão dizia
           "Rua M-7" e o computador, "Rua M-7, 897". A régua é a mesma do
           servidor (`linhaDeEndereco` = `linhaEnderecoDaFonte`). */
        RASCUNHO.push({
          id: String(id),
          nome: String(c.name || 'Cliente'),
          enderecoLinha: linhaDeEndereco(c.endereco, c.numero),
          bairro: String(c.cidade || ''),
          ...(pinoValido(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : {}),
          resolveSozinho: Array.isArray(c.diasEntrega) && c.diasEntrega.length > 0,
          // "Ult. Registro" (12/08) — o `/nucleo/clientes` manda o campo; a porta
          // "Meus clientes" é a 3ª origem da mesma lista e escreve a mesma data.
          ...(c.ultimaEntregaAt ? { ultimaEntregaAt: String(c.ultimaEntregaAt) } : {}),
        });
        novos += 1;
      });
      rapida = null;
      // O chip de HOJE pode passar a existir só por causa do rascunho — é ele
      // que dá a porta de volta quando o dedo for espiar outro dia.
      publicarMontarDias();
      await voltarDaAvulsa(volta);
      const q = `${novos} ${novos === 1 ? 'parada' : 'paradas'}`;
      return window.portao({
        tom: 'ok', ico: 'check', titulo: `${q} na lista`,
        // O verbo do recibo é o verbo do estado: nada foi gravado ainda, e
        // prometer "está na rota" seria a mesma mentira de antes com outra cara.
        sub: 'Ainda dá pra mexer. Toque em "Iniciar rota" pra valer.',
        acoes: [['Fechar', 'principal', true]],
      });
    }

    r.salvando = true; r.aviso = ''; publicarRapida();

    const entraram = [];
    const falharam = [];
    for (const id of ids) {
      try {
        await window.API.post('/logistica/entregas', {
          customerProfileId: id,
          quantidade: 1,
          scheduledAt: `${hojeISO()}T12:00:00.000Z`,
          paraMinhaRota: true,
        });
        entraram.push(id);
      } catch (_) { falharam.push(nomePorId.get(id) || 'Cliente'); }
    }

    /* NINGUÉM ENTROU = nada foi escrito: devolve a tela como estava e o dedo
       tenta de novo. É o único caminho em que "não deu certo" é verdade. */
    if (!entraram.length) {
      if (rapida === r) { r.salvando = false; publicarRapida(); }
      return avisoErro(new Error('Não consegui adicionar agora. Tente de novo.'));
    }

    rapida = null;
    /* A ORDEM É A SEGUNDA METADE DO VERBO. Falhar aqui não desfaz nada — as
       paradas existem —, então o recibo muda de tom em vez de mentir. */
    let ordenou = true;
    try {
      await carregarRota();
      await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...origemGps() });
    } catch (_) { ordenou = false; }
    await carregarRota();
    await voltarDaAvulsa(volta);

    const n = entraram.length;
    const quantas = `${n} ${n === 1 ? 'parada' : 'paradas'}`;
    if (falharam.length) {
      return window.portao({
        tom: 'alerta', ico: 'alert', titulo: `${quantas} na rota`,
        sub: `Não consegui: ${falharam.join(', ')}.`,
        acoes: [['Fechar', 'principal', true]],
      });
    }
    window.portao({
      tom: 'ok', ico: 'check', titulo: `${quantas} na rota`,
      sub: ordenou ? 'A ordem já está montada — é só iniciar.'
        : 'Toque em "Montar rota" pra achar a ordem delas.',
      acoes: [['Fechar', 'principal', true]],
    });
  }

  /** Salvar: manda SÓ o que mudou, e cada porta é a sua. */
  async function salvarCliente() {
    if (!ficha) return;
    await comTrava(async () => {
      const d = ficha.detalhe || {};
      const it = ficha.item || {};
      const loc = ficha.local || {};
      const nome = campo('nome');
      const telefone = campo('telefone');
      const cpf = campo('cpf');
      const observacoes = campo('observacoes');
      const cep = campo('cep');
      const rua = campo('rua');
      const numero = campo('numero');
      const bairro = campo('bairro');

      const conta = {};
      if (nome && nome !== String(d.name || it.name || '')) conta.nome = nome;
      if (observacoes !== String(d.observacoes || '')) conta.observacoes = observacoes;
      if (telefone !== String(d.whatsapp || it.phone || '')) conta.phone = telefone;
      // 🔴 CPF NUNCA É OBRIGATÓRIO (ordem do dono, 07/08): a ficha salva sem
      // ele igual. Compara SÓ OS DÍGITOS pra máscara digitada
      // ("123.456.789-00") não parecer mudança quando nada mudou.
      const soDigitos = (v) => String(v || '').replace(/\D/g, '');
      if (soDigitos(cpf) !== soDigitos(d.document)) conta.document = cpf;

      // O toque no GPS da ficha conta como mudança de endereço mesmo que o texto
      // não mude: o que ele traz de novo é o PINO (e o pino viaja no salvar).
      const g = ficha.gpsLocal || null;
      const mudouEndereco = !!g
        || cep !== String(loc.cep || '')
        || rua !== String(loc.endereco || '')
        || numero !== String(loc.numero == null ? '' : loc.numero)
        || bairro !== String(loc.bairro || '');

      const diasAgora = [1, 2, 3, 4, 5, 6, 7].filter((n) => (ficha.dias || []).indexOf(n) >= 0);
      const diasAntes = (it.diasEntrega || []).slice().sort().join(',');
      const mudouDias = diasAgora.slice().sort().join(',') !== diasAntes;
      /* 🔴 O FINANCEIRO SALVA COM A FICHA (12/08) — mesmo botão, porta própria.
         `corpoFinanceiro` devolve SÓ o que mudou, e null quando nada mudou; sem
         essa disciplina, abrir e salvar qualquer ficha reescreveria o contrato
         de cobrança de todo cliente legado da base sem ninguém pedir.
         Só quem PODE editar manda: com o módulo desligado ou sem admin a seção
         nem existe na tela, e um PATCH daqui voltaria 403. */
      const fin = (config && config.moduloFinanceiroAtivo && ehAdmin()) ? corpoFinanceiro() : null;

      if (!Object.keys(conta).length && !mudouEndereco && !mudouDias && !fin) {
        return window.portao({
          tom: 'info', ico: 'check', titulo: 'Nada mudou', sub: 'A ficha já está assim.',
          acoes: [['Fechar', '']],
        });
      }
      try {
        if (Object.keys(conta).length) {
          await window.API.patch(`/nucleo/contas/${encodeURIComponent(ficha.id)}`, conta);
        }
        // O telefone vive em DOIS lugares (a conta espelha, o contato é a
        // verdade) — o app velho já grava nos dois, e a busca lê do espelho.
        if (conta.phone && ficha.telefone && ficha.telefone.id) {
          await window.API.patch(`/nucleo/telefones/${encodeURIComponent(ficha.telefone.id)}`,
            { whatsapp: conta.phone, phone: conta.phone, isPrincipal: true });
        }
        if (mudouEndereco && loc.id) {
          const info = ficha.cepInfo || {};
          await window.API.patch(`/nucleo/locais/${encodeURIComponent(loc.id)}`, {
            endereco: rua, numero, bairro, cep,
            cidade: info.cidade || loc.cidade || '', uf: info.uf || loc.uf || '',
            // 🔴 O PINO MORRE COM O ENDEREÇO VELHO — SALVO quando o GPS da ficha
            // acabou de marcar a porta: aí o pino novo é o do dedo (10/08).
            ...(g
              ? { lat: g.lat, lng: g.lng, geoFonte: 'gps_cadastro',
                  ...(Number.isFinite(g.precisaoM) ? { gpsAccuracy: g.precisaoM } : {}) }
              : { lat: null, lng: null }),
          });
        } else if (g) {
          // sem LocalEntrega, o pino do GPS entra pela CONTA (mesma porta do
          // cadastro novo) — updateConta decide a fonte com o mesmo freio.
          await window.API.patch(`/nucleo/contas/${encodeURIComponent(ficha.id)}`, {
            lat: g.lat, lng: g.lng, geoFonte: 'gps_cadastro',
            ...(Number.isFinite(g.precisaoM) ? { gpsAccuracy: g.precisaoM } : {}),
          });
        }
        if (mudouDias) {
          await window.API.patch(`/logistica/clientes/${encodeURIComponent(ficha.id)}/dias`, { dias: diasAgora });
        }
        if (fin) {
          await window.API.patch(`/logistica/clientes/${encodeURIComponent(ficha.id)}/financeiro`, fin);
        }
      } catch (e) { return avisoErro(e); }
      await carregarClientes();
      // Rascunho MORRE no salvamento: daqui pra frente quem manda é o servidor
      // (foi ele que decidiu o que aceitou), senão a tela mostraria pra sempre
      // o que eu digitei mesmo que a gravação tenha ajustado o valor.
      // Reabrir a ficha não troca a porta de saída: quem salvou veio de algum
      // lugar, e o Voltar continua devolvendo pra lá.
      await abrirCliente(ficha.id, ficha.volta);
      window.portao({
        tom: 'ok', ico: 'check', titulo: 'Ficha salva',
        // Lei 8: a palavra "pino" é PROIBIDA em tela — é jargão de motor. Quem
        // lê é o motorista, e pra ele o que mudou é o LOCAL.
        sub: mudouEndereco ? 'O endereço mudou — o local vai ser conferido de novo.' : '',
        acoes: [['Fechar', '']],
      });
    });
  }

  /* 🔴 O EXCLUIR DA FICHA ERA CENÁRIO (medido no aparelho, 08/08). O botão era
     `data-superficie="confirmar"` — a confirmação DECORATIVA da maquete: na
     ficha de um cliente real ele abria "Retirar da rota de hoje? Mercado
     Estrela · volta na próxima quarta". Nome de outro cliente, verbo de outra
     ação, e nada era excluído. Três defeitos numa peça só.

     Agora a pergunta cita QUEM está aberto, e o "Excluir" chama a porta de
     verdade. Duas coisas o servidor decide e a tela obedece:
     · quem pode — `DELETE /nucleo/contas/:id` é ADMIN-only; o botão só nasce
       pra `admin` (ver `encherFicha`), então o 403 não chega aqui por desenho;
     · dívida trava — cliente com valor em aberto volta 409 CLIENTE_COM_DEBITO,
       COM o saldo. Esse número vira frase: "Fulano deve R$ 84,00", e não o
       `Falha 409` cru que o envelope entregava antes de o status viajar.
     É soft-delete no servidor (guarda um retrato antes de esconder), por isso a
     frase é "sai do cadastro", nunca "apaga pra sempre" — a tela não promete
     mais do que o banco faz. */
  async function excluirCliente() {
    if (!ficha || typeof window.portao !== 'function') return;
    const id = ficha.id;
    const d = ficha.detalhe || {};
    const it = ficha.item || {};
    // O nome vem do MESMO lugar que a tela está mostrando (detalhe > lista);
    // sem nome não se pergunta, porque a pergunta sem nome é a de antes.
    const nome = String(d.name || it.name || '').trim();
    if (!nome) return;
    // Já montada, a parada de hoje é da ROTA, não do cadastro: apagar o cliente
    // não a tira de lá. Dizer isso aqui evita o motorista sair pra rua achando
    // que a parada sumiu — e é de graça (`PARADAS_SALVAR` já está na memória).
    const naRotaDeHoje = PARADAS_SALVAR.some((p) => String(p.customerProfileId) === String(id));
    window.portao({
      tom: 'alerta', ico: 'trash', titulo: `Excluir ${esc(nome)}?`,
      sub: `Sai do cadastro e não entra mais em rota. As entregas já feitas ficam no histórico.${
        naRotaDeHoje ? ' A parada de hoje continua na rota até você retirar.' : ''}`,
      acoes: [['Não', ''], ['Excluir', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      try { await window.API.del(`/nucleo/contas/${encodeURIComponent(id)}`); }
      catch (e) { return erroDeExcluir(e, nome); }
      ficha = null;
      await carregarClientes();
      if (typeof window.ir === 'function') window.ir('clientes');
      window.portao({
        tom: 'ok', ico: 'check', titulo: 'Cliente excluído',
        sub: `${esc(nome)} saiu do cadastro.`, acoes: [['Fechar', '']],
      });
    }), { once: true });
  }

  /** as duas respostas que o servidor dá aqui e que o aviso genérico estraga */
  function erroDeExcluir(e, nome) {
    const corpo = (e && e.body) || {};
    if (String(corpo.error || '') === 'CLIENTE_COM_DEBITO') {
      // `saldo` vem em REAIS (o serviço arredonda em 2 casas), não em centavos.
      const saldo = typeof corpo.saldo === 'number' ? corpo.saldo : null;
      return window.portao({
        tom: 'trava', ico: 'cash', titulo: 'Tem valor em aberto',
        sub: saldo != null
          ? `${esc(nome)} deve ${dinheiro(saldo)}. Receba ou baixe a dívida antes de excluir.`
          : `${esc(nome)} tem valor em aberto. Receba ou baixe a dívida antes de excluir.`,
        acoes: [['Fechar', '']],
      });
    }
    // 403 aqui não é sessão vencida (é o que o tradutor diria): é o servidor
    // dizendo que esta conta não manda no cadastro. O botão nem devia estar na
    // tela — se apareceu, a frase tem que ser a verdadeira.
    if (Number(e && e.status) === 403) {
      return window.portao({
        tom: 'trava', ico: 'lock', titulo: 'Isso é do escritório',
        sub: 'Excluir cliente é no computador, com a conta do dono.',
        acoes: [['Fechar', '']],
      });
    }
    return avisoErro(e);
  }

  /* ------------------------------------------------------------------------
     L5 — O FECHAMENTO DO DIA E A SEMANA.

     Tudo sai de UMA porta (`/logistica/fechamento/resumo`), que já era pedida
     pra encher o caixa do topo da Rota — o fechamento não custa requisição nova.
     🔴 SEM FONTE, VAZIO: o resumo não traz "produtos por dia" nem o recebido
     de cada dia da semana (só o total). Esses dois slots do desenho ficam SEM
     NÚMERO em vez de com zero — zero é uma afirmação, e nesta tela ela seria
     falsa. Está anotado como pendência pro dono decidir a fonte.
     ------------------------------------------------------------------------ */
  const DIAS_SEMANA = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const dataBR = (k) => String(k || '').split('-').reverse().slice(0, 2).join('/');
  /** ISO: segunda = 1 … domingo = 7, no dia operacional de São Paulo. */
  const diaDaSemana = () => {
    const [a, m, d] = diaOperacional().split('-').map(Number);
    const js = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
    return js === 0 ? 7 : js;
  };

  function encherFechamento(caixa, itens, entregues) {
    if (typeof window.usarDados !== 'function') return;
    const f = (caixa && caixa.fechamento) || null;
    const formas = (f && f.formas) || null;
    const vendas = f ? Number(f.vendas) || 0 : 0;
    const pagina = (caixa && caixa.pagina) || null;
    // "clientes" é gente DISTINTA, não linha de venda — o mesmo cliente comprando
    // duas vezes é UM cliente. Contar venda aqui inflaria o número do dia.
    const clientes = pagina && Array.isArray(pagina.vendas)
      ? new Set(pagina.vendas.map((v) => String(v.clienteId || ''))).size
      : null;
    window.usarDados('fechamento', {
      entregues: String(entregues),
      // O selo do canto diz um FATO (quantas vendas), nunca um veredito: o app
      // não tem como saber que está "tudo certo". Sem venda, sem selo.
      selo: vendas ? `${vendas} ${vendas === 1 ? 'venda' : 'vendas'}` : '',
      // Só entra a forma que teve dinheiro. Cartão com R$ 0,00 no fechamento
      // de quem só recebeu em pix é ruído com cara de informação.
      formas: formas ? [
        ['cash', 'var(--lime)', 'Dinheiro', centavosSeTiver(formas.dinheiroCents)],
        ['pix', 'var(--blue-l)', 'Pix', centavosSeTiver(formas.pixCents)],
        ['card', 'var(--purple)', 'Cartão', centavosSeTiver(formas.cartaoCents)],
        ['note', 'var(--amber)', 'Marcado', centavosSeTiver(formas.fiadoCents)],
      ].filter((x) => x[3]) : [],
      formaTotal: f ? centavosSeTiver(f.totalCents) : '',
      clientes: seTiver(clientes),
      // 🔴 PRODUTOS SÃO DO FECHAMENTO, NÃO DA ROTA. Estavam lendo
      // `DADOS.rota.*` — e aí uma venda de 2 galões aparecia como "0 produtos"
      // porque a ROTA de hoje estava vazia. São duas contas diferentes com o
      // mesmo nome; a desta tela é a das VENDAS da página.
      produtos: pagina && Array.isArray(pagina.vendas)
        ? seTiver(pagina.vendas.reduce((s, v) => s
            + (Array.isArray(v.itens) ? v.itens.reduce((n, it) => n + (Number(it.qtd) || 0), 0) : 0), 0))
        : '',
      // 🔴 O "marcado" NÃO VIAJA MAIS (09/08). Ele é o `fiadoCents` — exatamente
      // o mesmo número que a grade de formas já mostra como "Marcado". Estava
      // escrito duas vezes na MESMA tela, e dado em 2 cards é bug de produto: a
      // grade é o lugar dele, ao lado de Dinheiro/Pix/Cartão, porque "marcou" é
      // uma forma de desfecho como as outras.
    });

    const dias = Array.isArray(caixa && caixa.historicoDias) ? caixa.historicoDias : [];
    const totalSemana = dias.reduce((s, h) => s + (Number(h.totalCents) || 0), 0);
    window.usarDados('semana', {
      dias: dias.map((h) => [
        DIAS_SEMANA[Number(h.diaSemana)] || '',
        dataBR(h.dateKey),
        String(Number(h.vendas) || 0),
        '',                                        // produtos: sem fonte no resumo
        '',                                        // recebido do dia: idem
        h.totalCents != null ? centavos(h.totalCents).replace('R$ ', '') : '',
      ]),
      marcado: centavosSeTiver(totalSemana),
      recebido: '',
      pendencia: '',
    });
  }

  /* ------------------------------------------------------------------------
     🔴 O ÚNICO VERBO QUE FECHA O DIA (12/08, dono: *"ela aparece algumas vezes
     no final, sem necessidade, transforme isso em 1x só"*).

     Eram DOIS botões no mesmo gancho — o "Finalizar" do dock da rota e o
     "Fechar o dia" desta tela — e nenhum dos dois fechava coisa alguma:
     `fechamento/finalizar` carimba a página do dia e salva a Rota salva, mas
     NÃO encerra rota nenhuma. Ela seguia `ACTIVE`, o rodapé voltava a oferecer
     "Navegar" sobre um dia terminado, e o caminho acabava em `ir('fechamento')`
     — a tela do próprio botão. Anel fechado: fecha, cai onde fecha, fecha de
     novo. Foi isso que o dono viu "aparecendo algumas vezes".

     Hoje a corrente tem TRÊS TEMPOS e um dono cada: o "Finalizar" do dock ABRE
     esta tela (`ir-fechamento`), este botão FECHA o dia, e o `terminou` é o
     recibo. É o desenho de todo app de rota do mercado — o dia só fecha depois
     que o motorista viu o número.

     O fechar faz as duas coisas do dia, na ordem que importa:
       1) ENCERRA A ROTA (`rota/encerrar` — porta que já existia inteira e já
          estava na allowlist do Kotlin). É ela que marca `operationalEndedAt`,
          e é por isso que o dock vira "Montar rota" SOZINHO depois: sem parada
          aberta, `estadoDaRota` cai em 'montar' e `dockDaRota` deriva
          `semparada`. O estado de recomeço não é novo — ele já existia e nunca
          era alcançado, porque ninguém encerrava.
          Só é chamada com a rota VIVA: esta tela também abre pelos Ajustes e
          pelo caixa da Rota, e mandar encerrar um dia que não começou é POST
          sem dono.
       2) REGISTRA A PÁGINA (`fechamento/finalizar`) — o dinheiro.

     🔴 E O 400 DEIXOU DE SER BECO. Dia sem nenhuma venda faz o servidor
     responder "Nada registrado neste dia ainda." — e com isso quem rodou o dia
     inteiro sem vender ficava PRESO, sem conseguir fechar. Quem encerra o dia é
     o passo 1, que já aconteceu; o passo 2 salva a rota como modelo, e não ter
     o que salvar não é erro de quem trabalhou. Erro de verdade (rede, sessão,
     403, 500) continua falando alto — o `!== 400` é o corte.

     🔴 O ESTADO É LIDO NO CLIQUE, NÃO NA ABERTURA DO PORTÃO. Entre desenhar a
     pergunta e o dedo responder cabe um `carregarRota` (o poll, um recado, o
     desfecho de outra parada) — decidir com o estado de dois segundos atrás é
     como o dock do mapa herdava o dia da montagem.
     ------------------------------------------------------------------------ */
  async function fecharDia() {
    if (typeof window.portao !== 'function') return;
    const dia = diaDaSemana();
    const sobrando = paradasPendentes().length;
    window.portao({
      tom: 'info', ico: 'lock', titulo: 'Fechar o dia?',
      /* Quem sobrou é dito ANTES, não depois: encerrar devolve a parada aberta
         pra pendência (sem ordem) e ainda vira recado no escritório. Quem tem
         direito de saber disso é quem está apertando o botão. */
      sub: sobrando
        ? `${sobrando} ${sobrando === 1 ? 'parada fica' : 'paradas ficam'} pra amanhã · registrar como ${DIAS_SEMANA[dia]}`
        : `Registrar como ${DIAS_SEMANA[dia]}`,
      acoes: [['Agora não', ''], ['Fechar o dia', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      if (estadoRota === 'rodando' || estadoRota === 'pausada') {
        try { await window.API.post('/logistica/rota/encerrar', { date: hojeISO() }); }
        catch (e) { return avisoErro(e); }
      }
      try { await window.API.post('/logistica/fechamento/finalizar', { dia }); }
      catch (e) { if (Number(e && e.status) !== 400) return avisoErro(e); }
      await carregarRota();
      encherTerminou();
      window.ir('terminou');
    }), { once: true });
  }

  /* O RECIBO SE ESCREVE DEPOIS DO `carregarRota`, com o dia já do jeito que
     ficou: quem sobrou aqui é a contagem REAL pós-encerramento (as abertas
     voltaram 'agendada'), não a que eu li antes de mandar o POST.
     A hora é a do APARELHO de propósito — é a hora em que ESTE dedo fechou,
     não um fato do servidor; nada é comparado nem gravado com ela. */
  function encherTerminou() {
    if (typeof window.usarDados !== 'function') return;
    let hora = '';
    try {
      hora = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
      }).format(new Date());
    } catch (_) { hora = ''; }
    const sobrou = paradasPendentes().length;
    window.usarDados('terminou', {
      quando: hora ? `Fechado às ${hora}` : '',
      sobra: sobrou ? `${sobrou} ${sobrou === 1 ? 'parada ficou' : 'paradas ficaram'} pra amanhã` : '',
    });
  }

  /* ==========================================================================
     O PAINEL DA BUSCA DA PARADA AVULSA — F2 do PR12082026.

     Desenho aprovado: `docs/mockups/pesquisa-avulsa-v2.html`.
     Contrato (F1, já em prod e provado): `GET /logistica/busca?q=&lat=&lng=`
     devolve os TRÊS grupos — clientes (fuzzy pg_trgm), ruas do Censo (CNEFE) e
     comércios da RFB — já ranqueados por nome × distância do GPS; e
     `GET /logistica/busca/porta?municipio=&via=&numero=` devolve o pino da
     PORTA com o CEP junto.

     A doença que isto cura: a busca de endereço era um campo CEGO. Digitava
     tudo, apertava um botão e uma regex decidia em silêncio se ia pro CNEFE (só
     com CEP) ou pro Nominatim público — 1 req/s, fraco no interior, até ~7 s
     parado na calçada. Zero sugestão, zero recentes, zero ranking.

     ── AS TRÊS LEIS DESTE ARQUIVO ────────────────────────────────────────────

     1. 🔴 TECLA NÃO PASSA PELO SEAM. `usarDados` remonta a CAMADA inteira
        (`innerHTML = render()`); uma camada nova por letra digitada é a tela
        piscando na mão de quem está em pé na porta de um cliente. Então o rolo
        de resultados é escrito DIRETO NO NÓ (`[data-rolo="busca"]`) e o seam é
        atualizado por baixo, sem repintar — a MESMA divisão que o velocímetro
        já tinha (§ `data-vivo`, 60-prospector-nav): *o DADO passa pelo seam; o
        que muda a cada quadro, NÃO*. Toque (escolher, S/N, Usar) é outra
        história: ali repintar é o certo, e passa pelo seam de sempre.

     2. 🔴 UM PEDIDO POR PAUSA, E O ATRASADO NÃO VENCE. Debounce de 250 ms e
        um NÚMERO DE SÉRIE por pedido: quem volta com número velho é jogado
        fora. Sem isso, digitar "bar do ze" enfileira 9 requisições e a última a
        CHEGAR nem sempre é a última a SAIR — a tela mostraria o resultado de
        "bar do z" por cima do de "bar do ze".

     3. 🔴 NADA DE NOMINATIM/GOOGLE NO DIGITAR. Autocomplete no Nominatim
        público viola o ToS dele e o preço é ban. O caminho do link do Maps /
        coordenada colada continua VIVO — só que fora do fluxo por tecla: vira
        um cartão que a pessoa toca (§ `busca-colar`), e ele chama o
        `rapidaBuscar` de sempre.

     E o verbo do fim é o que JÁ EXISTIA: a escolha vira `rapida.resolvido` e
     quem grava é o `rapidaConfirmar` (C0) — mesmas três travas (porta não entra
     2×, cadastro sem nome não passa, endereço com conta REUSA a conta) e o
     mesmo `encaixarAvulsa`. Endpoint novo aqui: nenhum além dos dois da F1.
     ========================================================================== */

  /** espera o dedo parar. 250 ms é o piscar de olho — abaixo disso vira pedido
   *  por letra; acima, a lista parece travada. */
  const BUSCA_ESPERA_MS = 250;
  /** menos que isto não é busca, é uma letra: o servidor devolve vazio (§
   *  BUSCA_MIN_CHARS) e a ida seria só gasto de bateria. */
  const BUSCA_MIN = 2;
  /** as 6 últimas ESCOLHAS deste aparelho (não as últimas digitações) */
  const BUSCA_RECENTES_CHAVE = 'hbx.busca.recentes';
  const BUSCA_RECENTES_TETO = 6;

  /* O número de série do pedido. Cresce sempre; resposta com número velho é
     resposta de uma pergunta que a pessoa já mudou. */
  let buscaSerie = 0;
  let buscaTimerPainel = null;
  /* Os itens CRUS do servidor, na ordem em que foram pintados. O seam leva a
     versão de TELA (texto pronto); a escolha precisa do payload inteiro —
     cep, lat/lng, codMunicipio, via, numero, fonte — porque é dele que a F4
     (cadastro herdando a lei do CEP) vai beber. */
  let buscaCrus = { cli: [], rua: [], loja: [] };
  /* O escopo geográfico que o servidor resolveu (município/cidade/UF). O passo
     do NÚMERO precisa do código do município, e ele não viaja no item. */
  let buscaEscopo = { codMunicipio: null, cidade: null, uf: null };

  /* ------------------------------------------------------------------------
     OS RECENTES — memória do APARELHO, não da empresa.
     Repetir a parada de ontem é o gesto mais comum de quem entrega, e ele
     merece um toque em vez de onze letras. Fica em `localStorage` porque é
     preferência de quem segura o telefone; mandar isso pro servidor seria
     inventar uma tabela pra guardar o que não é da empresa.
     Tudo em try/catch: WebView com DOM storage desligado não pode derrubar a
     busca — sem recentes a tela continua inteira.
     ------------------------------------------------------------------------ */
  function recentesDaBusca() {
    try {
      const cru = window.localStorage.getItem(BUSCA_RECENTES_CHAVE);
      const lista = cru ? JSON.parse(cru) : [];
      return Array.isArray(lista) ? lista.filter((x) => typeof x === 'string' && x).slice(0, BUSCA_RECENTES_TETO) : [];
    } catch (_) { return []; }
  }
  function guardarRecenteDaBusca(rotulo) {
    const novo = String(rotulo || '').trim().slice(0, 60);
    if (!novo) return;
    try {
      const lista = recentesDaBusca().filter((x) => x.toLowerCase() !== novo.toLowerCase());
      lista.unshift(novo);
      window.localStorage.setItem(BUSCA_RECENTES_CHAVE, JSON.stringify(lista.slice(0, BUSCA_RECENTES_TETO)));
    } catch (_) { /* sem storage: os recentes somem, a busca não */ }
  }

  /* ------------------------------------------------------------------------
     DO CONTRATO PRA TELA. Cada grupo vira {titulo, detalhe, dist, fonte} — e
     nada mais: o que a pessoa lê é isto. O resto do payload fica em
     `buscaCrus`, onde a escolha vai buscar.
     ------------------------------------------------------------------------ */
  /** "av 84" → "Av 84". A via vem CANÔNICA do banco (minúscula, abreviada);
   *  escrever assim na tela pareceria defeito de banco de dados. */
  const viaBonita = (v) => String(v || '').split(' ')
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(' ');
  const juntar = (partes) => partes.filter((x) => x != null && String(x).trim() !== '').join(' · ');

  /* 🔴 O BANCO NÃO ESCREVE NA FICHA DO CLIENTE (F4). O escopo da busca vem com a
     cidade NORMALIZADA do Censo ("rio claro" — minúscula, sem acento: é a chave
     de junção das tabelas), e ela ia inteira pro cadastro. O dono abria a ficha
     do cliente novo e lia "rio claro", que é banco de dados vazando pra cara de
     quem trabalha — a mesma doença do CEP cru que o `cepBonito` já curou. */
  const cidadeBonita = (c) => viaBonita(c);

  /* O NÚMERO DE DENTRO DO TEXTO — a MESMA âncora do servidor
     (`extrairNumeroPorta`, cnefe-resolver.util): só vale número depois de
     vírgula ou de "nº". Nunca o primeiro número solto, porque "Rua 12" tem o 12
     no NOME da via, não na porta. O endereço da Receita vem num campo só
     ("Av. 8, 415"), e sem o número dali a conta nascia S/N — e S/N desliga o
     aviso de porta repetida, que EXIGE número dos dois lados. */
  const numeroDoEnderecoDaBusca = (texto) => {
    const m = /(?:,|n[ºo°]\s*|\bn[uú]mero\s*)\s*(\d{1,6})(?!\d)/i.exec(String(texto || ''));
    return m ? m[1] : '';
  };

  /* 🔴 O NÍVEL DO GEO TEM QUE APARECER (o próprio serviço avisa: "1=porta
     2=rua 3=bairro 4=cidade — a tela TEM que diferenciar"). Comércio marcado
     no CENTRO DO BAIRRO desenhado como se fosse a porta é parada plantada no
     lugar errado — e pino errado custa mais caro que pino nenhum. */
  const avisoDoGeo = (nivel) => (Number(nivel) >= 4 ? 'ponto aproximado (cidade)'
    : Number(nivel) === 3 ? 'ponto aproximado (bairro)' : '');

  /* 🔴 ZERO NÃO É PINO — e aqui isso vira dinheiro (medido no g15, 12/08, contra
     PRODUÇÃO). Quem não tem porta marcada volta do servidor com `distM: 0`, e o
     `emMetros` obediente escrevia "0 m": quatro clientes e dois bares apareceram
     como se estivessem NA FRENTE do motorista. É a pior mentira possível numa
     tela cuja promessa escrita, uma linha acima, é "o mais perto de você vem
     primeiro" — e é a mesma lição do mapa na África, onde 0,0 virava um ponto.
     Distância que não existe não vira número: o cartão simplesmente não a mostra
     (a fonte e o endereço continuam lá, que é o que se sabe de verdade).
     ⚠️ O RANKING em si é do SERVIDOR e continua pondo esses zeros na frente —
     isso é conserto de F1, anotado no relatório com a foto. */
  const distDaBusca = (m) => (Number(m) >= 1 ? emMetros(Number(m)) : '');

  /* CEP se lê com máscara. O banco guarda 8 dígitos (e é assim que ele viaja no
     cadastro, § digitos()); só o que a PESSOA lê ganha o traço — "13502150" na
     tela é banco de dados vazando pra cara de quem trabalha. */
  const cepBonito = (c) => {
    const d = String(c == null ? '' : c).replace(/[^0-9]/g, '');
    return d.length === 8 ? d.slice(0, 5) + '-' + d.slice(5) : String(c || '');
  };

  function paraTelaDaBusca(resp) {
    const g = (resp && resp.grupos) || {};
    const cli = Array.isArray(g.clientes) ? g.clientes : [];
    const rua = Array.isArray(g.enderecos) ? g.enderecos : [];
    const loja = Array.isArray(g.comercios) ? g.comercios : [];
    return {
      clientes: cli.map((c) => ({
        titulo: esc(c.nome),
        detalhe: esc(juntar([linhaDeEndereco(c.endereco, c.numero), c.bairro || c.cidade])),
        dist: esc(distDaBusca(c.distM)),
        fonte: 'cliente',
      })),
      enderecos: rua.map((v) => ({
        titulo: esc(viaBonita(v.via)),
        detalhe: esc(juntar([v.portas ? `${v.portas} portas no Censo` : '', buscaEscopo.cidade || ''])),
        dist: esc(distDaBusca(v.distM)),
        fonte: 'censo',
        cep: esc(cepBonito(v.cep)),
      })),
      comercios: loja.map((e) => ({
        titulo: esc(e.nome),
        detalhe: esc(juntar([e.endereco, e.cidade, avisoDoGeo(e.nivelGeo)])),
        dist: esc(distDaBusca(e.distM)),
        fonte: 'rfb',
      })),
    };
  }

  /* ------------------------------------------------------------------------
     A ESCRITA CIRÚRGICA. É aqui que a lei nº 1 deste arquivo acontece: o seam
     é atualizado POR BAIXO (pra que o próximo repinte de verdade — um toque —
     pinte a mesma coisa) e o HTML vai direto pro nó do rolo.

     O desenho é o do MOCK (`roloDaBuscaAvulsa`), nunca uma segunda cópia aqui:
     duas cópias do mesmo desenho divergem na primeira mexida, e aí o app deixa
     de ser o mock.
     ------------------------------------------------------------------------ */
  function escreverRoloDaBusca(campos) {
    if (typeof DADOS === 'undefined' || !DADOS.rapida) return;
    Object.assign(DADOS.rapida, campos);
    const no = naCamada('[data-rolo="busca"]');
    if (!no || typeof roloDaBuscaAvulsa !== 'function') return;
    no.innerHTML = roloDaBuscaAvulsa(DADOS.rapida);
  }

  /** o × do campo e o `data-campo` só existem/valem com a tela montada */
  const noPainelDaBusca = () => !!rapida && rapida.porta === 'endereco' && telaAtual() === 'rapida';

  /* 🔴 O QUE O DEDO ESCREVEU VOLTA EM TODO REPINTE DE TOQUE. `usarDados`
     remonta a camada a partir do seam: se o `busca` não for devolvido, o campo
     se apaga sozinho no instante em que a pessoa toca num resultado (a mesma
     lição do `novoRascunho`). O nó VIVO manda — ele tem as letras que o
     debounce ainda nem levou pro servidor. */
  const textoDaBusca = () => {
    const no = naCamada('[data-campo="rapida-busca"]');
    if (no) return String(no.value || '');
    return String((rapida && rapida.buscaTexto)
      || (typeof DADOS !== 'undefined' && DADOS.rapida && DADOS.rapida.busca) || '');
  };

  const AVISO_VOZ_PERMISSAO = 'Permita o microfone para buscar por voz.';
  const vozNativaDisponivel = () => {
    try {
      return !!(window.HBX && window.HBX.speech && window.HBX.speech.available());
    } catch (_) { return false; }
  };

  /* Voz é estado da busca, não do nó: o reconhecedor pode responder durante um
     repinte. Guardar no seam faz mic e véu voltarem com a mesma verdade. */
  function publicarVozDaBusca(campos) {
    const r = rapida;
    if (!r) return;
    Object.assign(r, campos || {});
    if (!noPainelDaBusca() || typeof window.usarDados !== 'function') return;
    const seam = {};
    if (Object.prototype.hasOwnProperty.call(campos, 'vozDisponivel')) seam.vozDisponivel = campos.vozDisponivel ? 1 : 0;
    if (Object.prototype.hasOwnProperty.call(campos, 'vozOuvindo')) seam.vozOuvindo = campos.vozOuvindo ? 1 : 0;
    if (Object.prototype.hasOwnProperty.call(campos, 'aviso')) seam.aviso = esc(campos.aviso || '');
    window.usarDados('rapida', seam);
  }

  /* ------------------------------------------------------------------------
     O PEDIDO. Best-effort com VOZ: falhou a rede, o rolo diz que não achou —
     nunca fica girando pra sempre, e nunca inventa lista.
     ------------------------------------------------------------------------ */
  async function procurarNaBusca(texto) {
    const q = String(texto || '').trim();
    const r = rapida;
    if (!r || !temPonte() || !window.API) return;
    /* LINK/COORDENADA COLADA NÃO SE PROCURA EM BANCO — vira cartão (lei nº 3).
       O mesmo texto pode ser as duas coisas ("13500-000 1067" é CEP e é busca),
       então o cartão SOMA, não substitui. */
    const colado = (/https?:\/\//i.test(q) || PAR_COORD.test(q)) ? q.slice(0, 60) : '';
    if (q.length < BUSCA_MIN) {
      buscaCrus = { cli: [], rua: [], loja: [] };
      escreverRoloDaBusca({
        busca: esc(q), grupos: { clientes: [], enderecos: [], comercios: [] },
        semNada: 0, colar: esc(colado), numAberto: -1, recentes: recentesDaBusca().map(esc),
      });
      return;
    }
    const serie = ++buscaSerie;
    // o rolo já diz "Procurando…" (é o vazio honesto de quem ainda não sabe)
    escreverRoloDaBusca({ busca: esc(q), semNada: 0, colar: esc(colado) });
    const perto = ultimaPos && pinoValido(ultimaPos.lat, ultimaPos.lng)
      ? `&lat=${encodeURIComponent(ultimaPos.lat)}&lng=${encodeURIComponent(ultimaPos.lng)}` : '';
    let resp = null;
    try {
      resp = await window.API.get(`/logistica/busca?q=${encodeURIComponent(q)}${perto}`);
    } catch (e) {
      // 🔴 "NÃO CONSEGUI PERGUNTAR" ≠ "NÃO EXISTE". Falha de rede não pode
      // apagar o que já está na tela: só marca que esta pergunta não voltou.
      if (serie !== buscaSerie || !noPainelDaBusca() || rapida !== r) return;
      escreverRoloDaBusca({ semNada: 1 });
      return;
    }
    /* 🔴 A RESPOSTA ATRASADA NÃO SOBRESCREVE A NOVA. Este é o teste do
       painel inteiro: sem esta linha, o resultado de "bar do z" (que saiu
       antes e voltou depois) sentaria por cima do de "bar do ze". */
    if (serie !== buscaSerie || rapida !== r || !noPainelDaBusca()) return;
    const esc0 = (resp && resp.escopo) || {};
    buscaEscopo = {
      codMunicipio: esc0.codMunicipio || null,
      cidade: esc0.cidade || null,
      uf: esc0.uf || null,
    };
    const g = (resp && resp.grupos) || {};
    buscaCrus = {
      cli: Array.isArray(g.clientes) ? g.clientes : [],
      rua: Array.isArray(g.enderecos) ? g.enderecos : [],
      loja: Array.isArray(g.comercios) ? g.comercios : [],
    };
    const grupos = paraTelaDaBusca(resp);
    const nada = !grupos.clientes.length && !grupos.enderecos.length && !grupos.comercios.length;
    escreverRoloDaBusca({
      busca: esc(q), grupos, semNada: nada ? 1 : 0, colar: esc(colado), numAberto: -1,
    });
  }

  /* O teclado e a voz entram pelo MESMO cano. Espelhar só é necessário para a
     voz: no teclado o próprio WebView já escreveu no campo vivo. */
  function usarTextoDaBusca(texto, espelharNoCampo) {
    if (!temPonte() || !rapida) return;
    const valor = String(texto == null ? '' : texto);
    rapida.buscaTexto = valor;
    if (typeof DADOS !== 'undefined' && DADOS.rapida) DADOS.rapida.busca = esc(valor);
    if (espelharNoCampo) {
      const no = naCamada('[data-campo="rapida-busca"]');
      if (no) no.value = valor;
    }
    clearTimeout(buscaTimerPainel);
    buscaTimerPainel = setTimeout(() => { void procurarNaBusca(valor); }, BUSCA_ESPERA_MS);
  }

  /* ------------------------------------------------------------------------
     O TECLADO. Ouvinte DELEGADO no documento (e não por nó): o campo nasce de
     novo a cada repinte da camada, e listener por nó precisaria de guarda e de
     um gancho no repinte. `input` sobe, então um ouvinte só cobre todos os
     nascimentos do campo, hoje e depois.
     ------------------------------------------------------------------------ */
  document.addEventListener('input', (ev) => {
    const alvo = ev.target;
    if (!alvo || !alvo.dataset || alvo.dataset.campo !== 'rapida-busca') return;
    usarTextoDaBusca(alvo.value || '', false);
  });

  window.HBXApp = window.HBXApp || {};
  window.HBXApp.speechPermissionChanged = function (concedida) {
    const r = rapida;
    if (!r) return;
    const limparAviso = concedida && String(r.aviso || '') === AVISO_VOZ_PERMISSAO;
    publicarVozDaBusca({
      vozDisponivel: vozNativaDisponivel() ? 1 : 0,
      vozOuvindo: 0,
      ...(concedida ? (limparAviso ? { aviso: '' } : {}) : { aviso: AVISO_VOZ_PERMISSAO }),
    });
  };
  window.HBXApp.speechRecognitionListening = function () {
    publicarVozDaBusca({ vozOuvindo: 1 });
  };
  window.HBXApp.speechRecognitionResult = function (texto) {
    publicarVozDaBusca({ vozOuvindo: 0 });
    const reconhecido = String(texto || '').trim();
    if (reconhecido && noPainelDaBusca()) usarTextoDaBusca(reconhecido, true);
  };
  window.HBXApp.speechRecognitionError = function (mensagem) {
    publicarVozDaBusca({
      vozOuvindo: 0,
      aviso: String(mensagem || 'Não consegui entender. Tente falar de novo.'),
    });
  };

  /* ------------------------------------------------------------------------
     A ESCOLHA. Ela ARMA a parada (não grava nada): preenche o rascunho que o
     `rapidaConfirmar` já sabe gravar, e acende o pé com o resumo REAL —
     incluindo o CEP com que a parada vai nascer.
     ------------------------------------------------------------------------ */
  /** o pé, com o que a pessoa acabou de escolher */
  function armarPeDaBusca(tipo, i, titulo, dist, cep) {
    if (typeof window.usarDados !== 'function') return;
    window.usarDados('rapida', {
      pe: { tipo, i, titulo: esc(titulo), dist: esc(dist || ''), cep: esc(cepBonito(cep)) },
      numAberto: -1,
      /* 🔴 O AVISO SOBREVIVE AO PÉ. Aqui era `aviso: ''` fixo, e quem acabara de
         escrever um aviso (o ponto é do vizinho, o Censo não deu CEP) via a
         própria frase ser apagada do seam no repinte seguinte. O que a tela SABE
         não pode ser apagado pelo que a tela MOSTRA. */
      aviso: esc((rapida && rapida.aviso) || ''),
      busca: esc(textoDaBusca()),
    });
  }

  function escolherDaBusca(tipo, indice) {
    const r = rapida;
    const i = Number(indice);
    if (!r || r.salvando) return;
    const cru = (buscaCrus[tipo] || [])[i];
    if (!cru) return;
    r.aviso = '';
    r.posicao = 'perto';          // "encaixa na melhor posição sozinho" é o pé
    r.opcoes = [];

    if (tipo === 'cli') {
      /* CLIENTE JÁ TEM CONTA — e por isso ele NÃO passa por `POST /nucleo/contas`.
         Enchendo `duplicado` com a conta dele, o `rapidaConfirmar` reusa a linha
         que existe (e cobra o freio "a mesma porta não entra 2× na rota de hoje"
         de graça). Abrir cadastro novo pra quem já está na base é o defeito que
         enche a base de gente repetida. */
      r.duplicado = { id: String(cru.id), nome: cru.nome, isCliente: true, isLead: false, isFornecedor: false };
      r.origem = 'busca';
      r.nome = String(cru.nome || '');
      r.cep = String(cru.cep || '');
      r.numero = String(cru.numero || '');
      r.resolvido = {
        fonte: 'cliente', endereco: cru.endereco || '', numero: cru.numero || '',
        bairro: cru.bairro || '', cidade: cru.cidade || '', uf: cru.uf || '',
        cep: cru.cep || '', lat: cru.lat, lng: cru.lng,
      };
      r.escolhaBusca = { tipo: 'cliente', fonte: 'cliente', contaId: String(cru.id), cep: cru.cep || '', lat: cru.lat, lng: cru.lng };
      guardarRecenteDaBusca(cru.nome);
      armarPeDaBusca(tipo, i, cru.nome, distDaBusca(cru.distM), cru.cep || '');
      return;
    }

    if (tipo === 'rua') {
      /* RUA NÃO É PARADA. "Rua 8" sozinha são 214 portas do Censo: aqui abre o
         DEGRAU DO NÚMERO, e só depois dele existe pino, CEP e parada. Um degrau
         por vez — é o contrário do formulário de seis campos que ninguém
         termina em pé, com o carro ligado. */
      if (typeof window.usarDados === 'function') {
        window.usarDados('rapida', { numAberto: i, numValor: '', numSn: 0, pe: null, aviso: '', busca: esc(textoDaBusca()) });
      }
      return;
    }

    /* ------------------------------------------------------------------------
       COMÉRCIO (RFB × CnpjGeo).

       🔴 O PINO FRACO NÃO SE VESTE DE PORTA (F4). O `CnpjGeo` diz em que NÍVEL
       ele marcou aquele CNPJ: 1=porta, 2=rua, 3=bairro, 4=cidade. O cartão já
       avisava disso na lista — mas na hora de virar parada o ponto viajava
       IGUAL, e um comércio marcado no centro do bairro virava a coordenada pra
       onde o entregador dirige. Numa cidade de interior isso é quilômetro de
       erro, e a lei da casa é uma só: pino errado é PIOR que pino vazio.
       Do nível 3 pra baixo o pino fica em casa e quem resolve o lugar é o CEP,
       no servidor (CNEFE) — que acerta a RUA, e é mais do que o bairro sabe.

       🔴 E O NÚMERO DA RECEITA VEM JUNTO. O endereço da RFB é um campo só
       ("Av. 8, 415"); mandar `numero: ''` fazia a conta nascer S/N — e S/N
       DESLIGA o aviso de porta repetida, que exige número dos dois lados.
       ------------------------------------------------------------------------ */
    const pinoDePorta = Number(cru.nivelGeo) > 0 && Number(cru.nivelGeo) <= 2;
    const numeroDaLoja = numeroDoEnderecoDaBusca(cru.endereco);
    r.duplicado = null;
    r.origem = 'busca';
    r.nome = String(cru.nome || '');
    r.cep = String(cru.cep || '');
    r.numero = numeroDaLoja;
    r.resolvido = {
      fonte: 'rfb', endereco: cru.endereco || '', numero: numeroDaLoja,
      bairro: '', cidade: cru.cidade || '', uf: cru.uf || '',
      cep: cru.cep || '',
      lat: pinoDePorta ? cru.lat : null, lng: pinoDePorta ? cru.lng : null,
    };
    /* Pino de BASE não é fix de GPS. Sem dizer nada, o servidor decide pela
       `gpsAccuracy` que não veio e grava `gps_impreciso` — "houve um GPS, e ele
       era ruim". Não houve GPS nenhum: houve uma base. O nome honesto disso na
       escada da procedência é `geocode` ("nunca foi provado no chão"), e é o
       que as telas leem pra saber se ainda precisam pedir a porta ao motorista. */
    r.geoFonteEscolhida = pinoDePorta ? 'geocode' : null;
    r.escolhaBusca = {
      tipo: 'comercio', fonte: 'rfb', cnpj: String(cru.cnpj || ''), cep: cru.cep || '',
      numero: numeroDaLoja, lat: cru.lat, lng: cru.lng, nivelGeo: cru.nivelGeo,
    };
    r.aviso = pinoDePorta ? ''
      : `A Receita só tem ${avisoDoGeo(cru.nivelGeo) || 'ponto aproximado'} deste comércio: quem manda no lugar é o CEP.`;
    if (!digitos(cru.cep)) r.aviso = 'Sem o CEP deste comércio na Receita — confira o endereço antes de adicionar.';
    guardarRecenteDaBusca(cru.nome);
    armarPeDaBusca(tipo, i, cru.nome, distDaBusca(cru.distM), cru.cep || '');
    // quem já mora nesta porta? (best-effort — só avisa, nunca trava)
    void rapidaCheckarPorta();
  }

  /* ------------------------------------------------------------------------
     O DEGRAU DO NÚMERO — `GET /logistica/busca/porta`.

     🔴 SEM NÚMERO NÃO É ERRO. Metade do interior é S/N (posto, chácara, praça,
     estrada): o botão "S/N" trava o campo e a resposta vira o pino do TRECHO,
     com a `precisao` dizendo o que ela é. Exigir número travava o motorista
     parado num lugar que número não tem.
     ------------------------------------------------------------------------ */
  async function usarRuaDaBusca() {
    const r = rapida;
    const d = (typeof DADOS !== 'undefined' && DADOS.rapida) || {};
    const i = Number(d.numAberto);
    const cru = (buscaCrus.rua || [])[i];
    if (!r || !cru || r.salvando) return;
    if (!buscaEscopo.codMunicipio) {
      r.aviso = 'Não sei em que município procurar esta rua. Ligue o GPS e tente de novo.';
      return publicarRapida();
    }
    const sn = !!d.numSn;
    const numero = sn ? '' : digitos(campo('busca-numero'));
    const p = [
      `municipio=${encodeURIComponent(buscaEscopo.codMunicipio)}`,
      `via=${encodeURIComponent(cru.via)}`,
    ];
    if (numero) p.push(`numero=${encodeURIComponent(numero)}`);
    let porta = null;
    try { porta = await window.API.get(`/logistica/busca/porta?${p.join('&')}`); }
    catch (e) { r.aviso = humano(e); return publicarRapida(); }
    if (rapida !== r) return;
    if (!porta || porta.fonte !== 'cnefe' || !pinoValido(porta.lat, porta.lng)) {
      r.aviso = numero
        ? `Não achei o nº ${numero} nesta rua no Censo. Confira, ou marque S/N.`
        : 'Não achei o ponto desta rua no Censo.';
      return publicarRapida();
    }
    /* 🔴 O NÚMERO É O QUE O DEDO ESCREVEU — NUNCA O DO VIZINHO (F4).
       Com `precisao: 'rua'` o Censo responde com o número da porta VIZINHA (até
       200 números de distância): era ele que ia parar no cadastro. A pessoa
       digitava 1177, a conta nascia no 1175 e o entregador batia na casa
       errada — com a tela dizendo, uma linha abaixo, que o ponto era "o do
       vizinho mais perto". O vizinho é PINO de referência, não é endereço.
       Só a porta EXATA pode ditar o número (e aí ele é o mesmo que foi digitado
       — o Censo confirmando, não corrigindo). */
    const numeroDaPorta = porta.precisao === 'porta' && porta.numero
      ? String(porta.numero)
      : String(numero || '');
    const titulo = [viaBonita(porta.via || cru.via), numeroDaPorta || (sn ? 'S/N' : '')]
      .filter(Boolean).join(', ');
    r.duplicado = null;
    r.nome = titulo;
    r.numero = numeroDaPorta;
    r.cep = String(porta.cep || '');
    r.resolvido = {
      fonte: 'cnefe', endereco: viaBonita(porta.via || cru.via), numero: r.numero,
      bairro: '', cidade: cidadeBonita(buscaEscopo.cidade || ''), uf: buscaEscopo.uf || '',
      cep: r.cep, lat: porta.lat, lng: porta.lng,
    };
    /* 🔴 COM CEP NA MÃO, QUEM RESOLVE O PINO É O SERVIDOR (a lei do CEP).
       `origem:'cep'` faz o `rapidaConfirmar` mandar cep+número e NÃO mandar
       lat/lng: aí a conta nasce pelo CNEFE, com a `geoFonte` certa gravada na
       fonte. Mandar o pino junto carimbaria a conta como ponto marcado à mão —
       mentira sobre a procedência de um pino que é do Censo.
       Sem CEP na resposta o pino é a única coisa que temos: ele viaja. */
    r.origem = r.cep ? 'cep' : 'busca';
    /* Sem CEP o pino do Censo é tudo o que temos, então ele viaja — mas viaja
       com o nome certo. `geocode` é a procedência de quem saiu de uma BASE e
       nunca foi provado no chão; calar aqui faria o servidor gravar
       `gps_impreciso`, que conta a história de um GPS que não existiu. */
    r.geoFonteEscolhida = r.cep ? null : 'geocode';
    r.escolhaBusca = {
      tipo: 'endereco', fonte: 'cnefe', precisao: porta.precisao || null,
      codMunicipio: buscaEscopo.codMunicipio, via: porta.via || cru.via,
      numero: r.numero, cep: r.cep, lat: porta.lat, lng: porta.lng,
    };
    r.aviso = porta.precisao === 'porta' ? ''
      : porta.precisao === 'rua' ? 'O Censo não tem este número exato: o ponto (e o CEP) são os do vizinho mais perto.'
        : 'Sem número: o ponto é o da rua. Confira antes de adicionar.';
    /* 🔴 A TELA PEDE, NÃO CHUTA. Sem CEP o cadastro de CLIENTE não fecha (é a
       lei do dono, cobrada no servidor) — e até aqui a pessoa só descobria isso
       depois de tocar em "Adicionar à rota" e levar um erro cru na cara. */
    if (!r.cep) {
      r.aviso = 'O Censo não deu o CEP desta porta. Sem CEP não dá pra cadastrar cliente — confira o endereço.';
    }
    guardarRecenteDaBusca(titulo);
    armarPeDaBusca('rua', i, titulo, distDaBusca(cru.distM), r.cep);
    // quem já mora nesta porta? (best-effort — só avisa, nunca trava)
    await rapidaCheckarPorta();
  }

  /* ------------------------------------------------------------------------
     O TEXTO COLADO — o caminho ANTIGO, vivo, fora do fluxo por tecla.
     ------------------------------------------------------------------------ */
  async function colarNaBusca() {
    const r = rapida;
    if (!r || r.salvando) return;
    await rapidaBuscar();               // o mesmo /geo/link + /geo/cep de sempre
    const alvo = rapida;
    if (alvo !== r || !r.resolvido) return;
    const titulo = r.nome || [r.resolvido.endereco, r.resolvido.numero].filter(Boolean).join(', ') || 'Localização colada';
    guardarRecenteDaBusca(titulo);
    armarPeDaBusca('colado', -1, titulo, '', digitos(r.cep || r.resolvido.cep || ''));
  }

  /* ------------------------------------------------------------------------
     OS TOQUES PEQUENOS: limpar, S/N, recente.
     ------------------------------------------------------------------------ */
  /* 🔴 O PAINEL NASCE VAZIO E COM OS RECENTES DESTE APARELHO. Sem esta porta o
     painel abriria com o que o MOCK deixou no seam — três recentes de mentira
     ("Bar do Zé", "Rua 8", "Márcia") na tela de um motorista que nunca buscou
     nada. Dado de demonstração na mão de quem trabalha é a mesma doença do
     "João da Silva" que o boot apaga desde 07/08. */
  function zerarPainelDaBusca() {
    const r = rapida;
    if (r) {
      r.resolvido = null; r.duplicado = null; r.aviso = ''; r.buscaTexto = '';
      r.escolhaBusca = null; r.geoFonteEscolhida = null;
    }
    buscaCrus = { cli: [], rua: [], loja: [] };
    buscaEscopo = { codMunicipio: null, cidade: null, uf: null };
    buscaSerie += 1;                    // pedido em voo perde a vez
    clearTimeout(buscaTimerPainel);
    if (typeof window.usarDados !== 'function') return;
    window.usarDados('rapida', {
      busca: '', grupos: { clientes: [], enderecos: [], comercios: [] },
      semNada: 0, colar: '', numAberto: -1, numValor: '', numSn: 0, pe: null,
      aviso: '', recentes: recentesDaBusca().map(esc),
      vozDisponivel: vozNativaDisponivel() ? 1 : 0, vozOuvindo: 0,
    });
  }
  const abrirPainelDaBusca = zerarPainelDaBusca;
  const limparBusca = zerarPainelDaBusca;

  function virarSnDaBusca() {
    const d = (typeof DADOS !== 'undefined' && DADOS.rapida) || {};
    if (typeof window.usarDados !== 'function') return;
    // o que já estava digitado sobrevive ao S/N: desmarcar devolve o número
    const escrito = d.numSn ? String(d.numValor || '') : digitos(campo('busca-numero'));
    window.usarDados('rapida', { numSn: d.numSn ? 0 : 1, numValor: esc(escrito), busca: esc(textoDaBusca()) });
  }

  function usarRecenteDaBusca(rotulo) {
    const r = rapida;
    const texto = String(rotulo || '').trim();
    if (!r || !texto) return;
    r.buscaTexto = texto;
    // repinta com o texto no campo (toque, não tecla: aqui o seam é o caminho)
    if (typeof window.usarDados === 'function') window.usarDados('rapida', { busca: esc(texto), numAberto: -1, pe: null });
    clearTimeout(buscaTimerPainel);
    void procurarNaBusca(texto);
  }

  /* ------------------------------------------------------------------------
     OS TOQUES DO PAINEL — ouvinte PRÓPRIO, e isso é uma decisão, não descuido.

     O lugar canônico de `data-acao` é o mapa do `D0-porta-entrega.js`. Este
     painel fica FORA dele por um motivo de operação: em 12/08 há outra sessão
     escrevendo no D0 (o anexo do recado), e código meu misturado ao lote dela
     no mesmo arquivo é código que ninguém consegue entregar separado — ou eu
     comito o trabalho inacabado dela, ou o meu fica pendurado.

     Tecnicamente não há diferença de comportamento: o D0 já registra DOIS
     ouvintes de clique no documento, este é o terceiro, roda ANTES dele (ordem
     léxica da costura) e as chaves não se cruzam — quem não é minha segue o
     caminho de sempre.

     🔴 Quando o lote do anexo pousar, estas seis linhas voltam pro mapa do D0.
     Está anotado no relatório como pendência, e não como "assim está bom".
     ------------------------------------------------------------------------ */
  document.addEventListener('click', (ev) => {
    const alvo = ev.target && ev.target.closest ? ev.target.closest('[data-acao]') : null;
    if (!alvo || !temPonte()) return;
    const chave = alvo.dataset.acao;
    if (chave === 'busca-limpar') return limparBusca();
    if (chave === 'busca-voz') {
      if (window.HBX && window.HBX.speech && window.HBX.speech.start) window.HBX.speech.start();
      return;
    }
    if (chave === 'busca-sn') return virarSnDaBusca();
    if (chave === 'busca-usar-rua') return void comTrava(usarRuaDaBusca);
    if (chave === 'busca-colar') return void comTrava(colarNaBusca);
    if (chave === 'busca-escolher') return escolherDaBusca(alvo.dataset.tipo, alvo.dataset.i);
    if (chave === 'busca-recente') return usarRecenteDaBusca(alvo.dataset.rec);
    /* 🔴 TROCAR PRA PORTA "PROCURAR" É A ÚNICA ENTRADA DO PAINEL — e é por isso
       que ele se zera aqui. O seam do `rapida` nasce com o dado de
       DEMONSTRAÇÃO do mock (três recentes de mentira): sem isto o motorista
       abriria a busca vendo "Bar do Zé, Rua 8, Márcia" de gente que ele nunca
       procurou. Vai pro fim da fila (`setTimeout 0`) de propósito: quem troca
       o `rapida.porta` é o D0, que roda DEPOIS deste ouvinte. */
    if (chave === 'rapida-porta' && alvo.dataset.porta === 'endereco') {
      setTimeout(() => { if (rapida && rapida.porta === 'endereco') abrirPainelDaBusca(); }, 0);
    }
  });
  /* ------------------------------------------------------------------------
     8. L4 — A PORTA: chegar, entregar e receber.

     Três regras de domínio que NÃO nasceram aqui — vieram do app que já roda:
     · a folha é escolhida pela CONFIG, não pelo gosto: financeiro OFF ou
       "cobrança simples" abrem a folha SIMPLES (`venda`); o resto abre a
       COMPLETA (`folha`). É o mesmo degrau do `deliverySheet()` do app velho;
     · a hora da CHEGADA nasce no celular quando a folha abre e viaja no
       DESFECHO (nunca num POST próprio) — a folha tem que abrir sem rede;
     · toque repetido não confirma duas vezes: a `idempotencyKey` é gravada
       ANTES da ida e só morre quando o servidor responde.

     🔴 O COMPROVANTE POR FOTO NÃO ESTÁ AQUI DE PROPÓSITO (decisão do dono,
     06/08): 0 uso na história do produto. Não é esquecimento.
     ------------------------------------------------------------------------ */
  const ENTREGAS = new Map();
  let financeiroAtivo = true;
  let cobrancaSimples = false;
  let aberta = null;              // { id, n, item } — a parada com a folha aberta
  let forma = '';                 // pix | dinheiro | cartao | fiado
  let motivo = '';                // o motivo do "não entregue"

  // A config só muda quando o dono mexe em Ajustes: pedir 1× por abertura do
  // app basta, e uma falha aqui NÃO pode fechar a porta — o default é o
  // comportamento de hoje (financeiro ligado, folha completa).
  (async function lerConfig() {
    if (!temPonte()) return;
    try {
      const c = await window.API.get('/logistica/config');
      if (c && typeof c === 'object') {
        if (typeof c.moduloFinanceiroAtivo === 'boolean') financeiroAtivo = c.moduloFinanceiroAtivo;
        cobrancaSimples = !!c.cobrancaSimples;
      }
    } catch (_) { /* fica o default */ }
  })();

  /** a hora em que o motorista CHEGOU nesta parada (1ª abertura da folha) */
  function carimbarChegada(id) {
    const chave = `chegada:${id}`;
    const guardada = window.HBX.cache.get(chave, null);
    if (guardada) return guardada;
    // Sobrevive a fechar o app no meio da parada — o desfecho pode vir minutos
    // depois, e uma chegada perdida vira `null` (o servidor prefere ausente a
    // inventada, ver `aparaChegada`).
    const agora = new Date().toISOString();
    window.HBX.cache.set(chave, agora);
    // A chegada muda o pino no mesmo quadro, sem depender da rede nem do
    // navegador externo. O desfecho posterior virá do servidor.
    try {
      const lista = (typeof PARADAS !== 'undefined' ? PARADAS : []) || [];
      const parada = lista.find((p) => String(p && p.id) === String(id));
      if (parada) { parada.chegou = true; parada.mapStatus = 'arrived'; }
      if (typeof pintar === 'function') pintar(false);
    } catch (_) {}
    return agora;
  }

  document.addEventListener('hbx:mapa-parada', (ev) => {
    const id = String((ev && ev.detail && ev.detail.id) || '');
    if (!id) return;
    const reg = ENTREGAS.get(id);
    if (!reg) return;
    if (continuidadeAtiva) {
      return window.portao({
        tom: 'info', ico: 'route', titulo: 'Somente consulta',
        sub: 'Use Continuar, Puxar ou Cancelar no cartão desta rota antes de alterar a ordem.',
        acoes: [['Fechar', '']],
      });
    }
    const st = String((reg.item && reg.item.status) || '');
    if (st === 'entregue' || st === 'cancelada') {
      return window.portao({
        tom: 'info', ico: st === 'entregue' ? 'check' : 'close',
        titulo: reg.item.cliente && reg.item.cliente.nome ? reg.item.cliente.nome : 'Parada finalizada',
        sub: st === 'entregue' ? 'Esta entrega já foi concluída.' : 'Esta parada foi encerrada sem entrega.',
        acoes: [['Fechar', '']],
      });
    }
    const fila = paradasPendentes().map((p) => String(p && p.item && p.item.id || '')).filter(Boolean);
    const jaPrimeiro = fila[0] === id;
    window.portao({
      tom: 'info', ico: 'route',
      titulo: reg.item.cliente && reg.item.cliente.nome ? reg.item.cliente.nome : `Parada ${reg.n}`,
      sub: jaPrimeiro ? 'Este já é o próximo cliente.' : 'Colocar este cliente como a próxima parada? O restante mantém a ordem atual.',
      acoes: [['Fechar', ''], [jaPrimeiro ? 'Abrir parada' : 'Ir agora', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => {
      if (jaPrimeiro) return abrirParada(id);
      const ordem = [id, ...fila.filter((outro) => outro !== id)];
      document.dispatchEvent(new CustomEvent('hbx:ordem', { detail: { ids: ordem } }));
    }, { once: true });
  });

  const somaItens = (item) => (Array.isArray(item.itens) ? item.itens : []);

  /** entrega do servidor → seam da folha COMPLETA */
  function encherFolha(item, n) {
    const c = item.cliente || {};
    const anterior = typeof c.debitoAtual === 'number' ? c.debitoAtual : null;
    const hojeVal = typeof item.valorHoje === 'number' ? item.valorHoje : null;
    window.usarDados('folha', {
      n: String(n),
      cor: String(item.status || '') === 'entregue' ? 'lime' : 'blue',
      nome: esc(c.nome),
      endereco: [esc(c.endereco), esc(c.cidade)].filter(Boolean).join(' • '),
      pill: 'Chegou',
      cabecalho: `Parada ${n} · ${esc(c.nome)}`,
      // Observação do cliente é a única coisa que o motorista PRECISA ler antes
      // de bater na porta — e sem ela a faixa some (não fica caixa vazia).
      nota: c.observacoes ? esc(c.observacoes) : '',
      itens: somaItens(item).map((it) => {
        const prod = (it && it.produto) || {};
        const qtd = it.qtdEntregue != null ? it.qtdEntregue : it.qtdPrevista;
        // 🔴 `valorUnit` só existe pra quem tem acesso a preço (billingAudience).
        // Entregador comum não recebe — e aí a linha diz só "previsto 2", sem
        // "R$ 0,00 cada", que seria um "não sei" com cara de preço.
        const preco = typeof it.valorUnit === 'number' ? ` · ${dinheiro(it.valorUnit)} cada` : '';
        return ['box', esc(prod.nome), `previsto ${it.qtdPrevista}${preco}`, String(qtd == null ? '' : qtd)];
      }),
      anterior: anterior != null ? dinheiro(anterior) : '',
      hoje: hojeVal != null ? dinheiro(hojeVal) : '',
      total: anterior != null || hojeVal != null ? dinheiro((anterior || 0) + (hojeVal || 0)) : '',
      forma,
      /* 🔴 A TELA E O SERVIDOR TÊM QUE DIZER O MESMO MOTIVO. `abrirParada` zerava
         a variável `motivo` mas NÃO o seam: marcar "Endereço não encontrado" na
         parada 3 e abrir o "não entregue" da parada 5 deixava esse motivo
         marcado na tela — enquanto o `registrarNaoEntregue` mandava
         `motivo || motivos[0]`, ou seja, "Ninguém atendeu", pro servidor. A tela
         mostrava um e o banco gravava outro. Agora o seam recebe EXATAMENTE o
         que vai ser enviado, inclusive o padrão da 1ª abertura. */
      motivo: motivo || (DADOS_MOTIVO_PADRAO() || ''),
    });
  }

  /** entrega do servidor → seam da folha SIMPLES (a venda) */
  function encherVenda(item, n) {
    const c = item.cliente || {};
    const lista = somaItens(item);
    const primeiro = lista[0] || {};
    const prod = primeiro.produto || {};
    const hojeVal = typeof item.valorHoje === 'number' ? item.valorHoje : null;
    const anterior = typeof c.debitoAtual === 'number' ? c.debitoAtual : null;
    window.usarDados('venda', {
      n: String(n),
      titulo: `Parada ${n} • ${esc(c.nome)}`,
      endereco: [esc(c.endereco), esc(c.cidade)].filter(Boolean).join(' • '),
      pill: 'Chegou',
      produto: esc(prod.nome) || (lista.length > 1 ? `${lista.length} produtos` : ''),
      tags: lista.map((it) => {
        const p = (it && it.produto) || {};
        return [`${esc(p.nome)} x${it.qtdPrevista}`, 'blue'];
      }),
      contaItem: hojeVal != null ? dinheiro(hojeVal) : '',
      contaChegada: hojeVal != null ? dinheiro(hojeVal) : '',
      // "Ficou marcado" só é verdade quando a forma escolhida é FIADO
      // — em dinheiro/pix/cartão nada fica marcado. Número que muda de
      // significado conforme o botão é número que mente.
      lancamento: forma === 'fiado' && hojeVal != null ? dinheiro(hojeVal) : dinheiro(0),
      recebido: forma && forma !== 'fiado' && hojeVal != null ? dinheiro(hojeVal) : dinheiro(0),
      paraMarcado: anterior != null ? dinheiro(anterior + (forma === 'fiado' ? (hojeVal || 0) : 0)) : '',
      forma,
    });
  }

  /** toque na parada: carimba a chegada e abre a folha que a config mandar */
  function abrirParada(id) {
    const reg = ENTREGAS.get(String(id));
    if (!reg || typeof window.usarDados !== 'function') return;
    aberta = { id: String(id), n: reg.n, item: reg.item };
    carimbarChegada(aberta.id);
    // Método já gravado (reabrindo) > o padrão do cliente > nenhum. Nada de
    // "Dinheiro" pré-marcado por enfeite: quem escolhe como recebeu é quem
    // está na porta.
    const c = reg.item.cliente || {};
    forma = String(reg.item.receiptMethod || c.metodoPadrao || '');
    motivo = '';
    const simples = !financeiroAtivo || cobrancaSimples;
    if (simples) { encherVenda(reg.item, reg.n); window.ir('venda'); }
    else { encherFolha(reg.item, reg.n); window.ir('folha'); }
  }

  /* ---- CHEGOU NA PORTA: a folha abre SOZINHA ------------------------------
     🔴 O KOTLIN GRITAVA PRA NINGUÉM (10/08). `MainActivity.entregarChegada`
     dispara este evento desde sempre, a cada chegada detectada pelo
     `RotaService` — e o app novo nasceu sem ouvinte. Junto com o `activateRoute`
     que ninguém chamava (ver `sincronizarGeofence`), é a corrente inteira do
     "chegou no cliente" que a fusão de 07/08 deixou no chão.

     Ele NÃO é um caminho novo de dinheiro: cai no MESMO `abrirParada` do toque
     — mesma folha, mesmo carimbo de chegada, mesma regra de venda × folha
     completa. A diferença entre chegar e tocar é só quem deu a ordem.

     🔴 E NÃO FALA. Quem diz "Chegou: Fulano" é o `RotaService.falar()` do
     nativo, que já rodou antes deste evento existir. Um `H.speak` aqui seria
     eco — a mesma armadilha dos dois sons do Iniciar (29/07). */
  document.addEventListener('hbx:arrival', (ev) => {
    const id = String((ev && ev.detail && ev.detail.deliveryId) || '');
    if (!id) return;
    /* Folha JÁ ABERTA não se troca. Ele pode estar fechando a venda do cliente
       anterior a 20 m deste — roubar a tela no meio trocaria o cliente debaixo
       do dedo dele, e o alarme do nativo continua na barra pra ser atendido
       quando terminar. Nunca interromper dinheiro em andamento. */
    if (aberta) return;
    // Rota fora da rua: o serviço nativo sobrevive a restart e pode chegar
    // atrasado, depois do dia encerrado. Chegada sem rota não abre nada.
    try { if (estadoRota !== 'rodando') return; } catch (_) { return; }
    const reg = ENTREGAS.get(id);
    if (!reg) return;                       // parada que não é do dia na tela
    const st = String((reg.item && reg.item.status) || '');
    if (st === 'entregue' || st === 'cancelada') return;   // desfecho já dado
    abrirParada(id);
  });

  /* ---- REGISTRAR LOCAL: a porta da RUA (ordem do dono, 10/08) --------------
     *"registrar local teria q ser aqui, com GPS ativo"* — na tela de dirigir,
     que é a única em que o motorista está parado NA PORTA com o fix quente.

     Ele não inventa tela nenhuma: é um cruzamento pras três que já existem, e
     o que ele acrescenta é o FIX no bolso de cada uma. As três cobrem
     exatamente os buracos que o geofence não alcança — cliente que não está no
     dia, cliente que não existe no cadastro, e porta com pino errado (essa é a
     que o geofence NUNCA acha, porque o raio é medido a partir do pino torto).

     🔴 SEM GPS ELE NÃO PROMETE NADA. "Registrar local" sem local é o pior tipo
     de botão: o que parece ter funcionado. Sem fix, pede a permissão pela mesma
     porta do Navegar e diz o que houve. */
  function registrarLocal() {
    if (!ultimoFix) {
      garantirGps();
      return window.portao({
        tom: 'alerta', ico: 'gps', titulo: 'Ainda sem localização',
        sub: 'Libere o GPS e espere um instante. O registro precisa saber onde você está.',
        acoes: [['Fechar', '']],
      });
    }
    const precisao = Number(ultimoFix.precisaoM);
    const linha = Number.isFinite(precisao)
      ? `GPS ±${Math.round(precisao)} m${precisao <= 60 ? ' · na porta' : ' · chegue mais perto'}`
      : 'Local marcado';
    /* O nome da parada da vez entra no BOTÃO — "Corrigir esta porta" é vago
       quando ele tem 51 paradas; "Corrigir Gislaine" é a porta que ele está
       vendo. Sem parada aberta na rota, a terceira saída simplesmente não
       existe (botão que não sabe quem corrigir é botão que erra o cliente). */
    const daVez = paradasPendentes()[0] || null;
    const alvo = daVez && daVez.item && daVez.item.cliente ? daVez.item.cliente : null;
    const acoes = [
      ['Cadastrar cliente novo', 'principal', false, 'registrar-cadastrar'],
      ['Vender pra quem não está no dia', '', false, 'registrar-vender'],
    ];
    if (alvo && alvo.id) acoes.push([`Corrigir ${esc(alvo.nome || 'esta porta')}`, '', false, 'registrar-corrigir']);
    acoes.push(['Fechar', '']);
    window.portao({ tom: 'info', ico: 'gps', titulo: 'Registrar este local', sub: linha, acoes });
  }

  /** repinta a folha aberta (o seam é a única fonte da marcação selecionada) */
  function repintarFolha() {
    if (!aberta) return;
    const simples = !financeiroAtivo || cobrancaSimples;
    if (simples) encherVenda(aberta.item, aberta.n);
    else encherFolha(aberta.item, aberta.n);
  }

  /* ------------------------------------------------------------------------
     🔴 A ÚLTIMA PARADA ABRE O FECHAMENTO SOZINHA (12/08, dono: *"ao finalizar
     (última rota) … já abrindo o fechamento"*).

     Os dois desfechos — entregue e não entregue — largavam o motorista no mapa,
     sempre. No mapa de um dia ACABADO o que sobra é um botão "Navegar" sem para
     onde ir e um "Finalizar" que ele precisa descobrir sozinho. A tela sabia
     que o dia tinha acabado e não dizia.

     🔴 UMA VEZ SÓ — e a marca é o motivo de esta porta existir sem repetir a
     doença que este lote veio matar. Sem marca, TODO retorno ao dia terminado
     (voltar de Ajustes, do Chat, reabrir o app) reabriria o Fechamento por cima
     do que o motorista estivesse fazendo: seria a mesma tela "aparecendo
     algumas vezes", entrando por uma porta nova. A marca mora no APARELHO
     (`HBX.cache` = localStorage: sobrevive a fechar o app, que é justamente
     quando um estado de memória mentiria) e é carimbada pelo DIA — o `iniciar`
     a apaga, então a 2ª leva do mesmo dia ganha o recibo dela.

     🔴 E ELA NÃO FECHA NADA. Abrir é da máquina; fechar é do dedo. Fechar o dia
     encerra a rota no servidor e não tem `git revert` — máquina nenhuma aperta
     isso sozinha ("respeitando o último finalizar ainda", nas palavras do
     dono). O que a porta automática faz é POUPAR o toque de achar o botão.

     🔴 SÓ COM A ROTA NA RUA. Dia por montar, rota pronta e parada avulsa fora
     de rota nenhuma continuam caindo na Rota como sempre: "acabou" só existe
     pra quem começou.
     ------------------------------------------------------------------------ */
  const chaveDoFim = () => `fim-visto:${hojeISO()}`;
  function irDepoisDoDesfecho() {
    if (typeof window.ir !== 'function') return;
    let acabou = false;
    try {
      acabou = (estadoRota === 'rodando' || estadoRota === 'pausada')
        && paradasPendentes().length === 0;
    } catch (_) { acabou = false; }
    if (!acabou) return window.ir('rota');
    const chave = chaveDoFim();
    if (window.HBX.cache.get(chave, '')) return window.ir('rota');
    window.HBX.cache.set(chave, '1');
    window.ir('fechamento');
  }

  /** o desfecho: entregue. `metodo` vazio = a folha ainda não sabe como pagou. */
  async function confirmarEntrega(metodo) {
    if (!aberta) return;
    // 🔴 O PORTÃO DO RECADO VEM ANTES DO DINHEIRO. Ele está PARADO, com o
    // celular na mão: é o único ponto do dia em que dá pra cobrar o "Entendi"
    // sem tirar os olhos dele da rua. Ver L8b.
    if (travaDoRecado()) return;
    const escolhido = metodo || forma;
    // Financeiro ON exige saber como recebeu — senão o fechamento do dia soma
    // errado e ninguém descobre até o caixa não bater.
    if (financeiroAtivo && !escolhido) {
      return window.portao({
        tom: 'alerta', ico: 'cash', titulo: 'Como o cliente pagou?',
        sub: 'Escolha a forma antes de confirmar.', acoes: [['Fechar', '']],
      });
    }
    await comTrava(async () => {
      const chave = `entrega-confirmar:${aberta.id}`;
      let idem = window.HBX.cache.get(chave, null);
      if (!idem) { idem = window.HBX.uuid(); window.HBX.cache.set(chave, idem); }
      const corpo = { idempotencyKey: idem, arrivedAt: carimbarChegada(aberta.id) };
      if (escolhido) corpo.receiptMethod = escolhido;
      /* O GPS da confirmação é o que realimenta o cadastro do cliente — vai
         quando existe, e a falta dele NUNCA barra a entrega.

         🔴 A PRECISÃO VIAJA JUNTO, E SEM ELA O PINO NUNCA SE CORRIGE (10/08).
         O servidor só aceita a coordenada como boa com GPS de OURO
         (`gpsDeOuro` em logistica.service.ts: exige `accuracy` numérico <= 60 m);
         campo AUSENTE reprova o crivo igual a um fix ruim. Desde a fusão de
         07/08 o app mandava lat/lng pelados e o backend descartava calado —
         medido na company 41: 10 pinos `gps_entrega`, o último de 05/08. A
         porta parou de convergir exatamente quando este campo sumiu.

         Sai do `ultimoFix` INTEIRO de propósito, e não do `ultimaPos` (que só
         guarda lat/lng): coordenada e precisão têm que ser da MESMA medição.
         Precisão de um fix carimbando a coordenada de outro é mentira com cara
         de dado bom — e o que ela suja é o endereço que o cliente paga pra
         receber. Fix sem `accuracy` (o aparelho pode não informar) manda só o
         par: o servidor decide, e a decisão dele é não realimentar. */
      if (ultimoFix) {
        corpo.lat = ultimoFix.lat;
        corpo.lng = ultimoFix.lng;
        if (Number.isFinite(ultimoFix.precisaoM)) corpo.accuracy = ultimoFix.precisaoM;
      }
      try {
        await window.API.post(`/logistica/entregas/${encodeURIComponent(aberta.id)}/confirmar`, corpo);
      } catch (e) { return avisoErro(e); }
      window.HBX.cache.remove(chave);
      window.HBX.cache.remove(`chegada:${aberta.id}`);
      aberta = null; forma = '';
      await carregarRota();
      irDepoisDoDesfecho();
    });
  }

  /** o outro desfecho: não entregue, com o motivo que o motorista marcou */
  async function registrarNaoEntregue() {
    if (!aberta) return;
    // Mesma trava do confirmar: os dois desfechos fecham a parada, e o recado
    // cobra no desfecho — não na forma de pagamento.
    if (travaDoRecado()) return;
    const escolhido = motivo || (DADOS_MOTIVO_PADRAO() || '');
    if (!escolhido) {
      return window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'O que aconteceu?',
        sub: 'Marque o motivo antes de registrar.', acoes: [['Fechar', '']],
      });
    }
    await comTrava(async () => {
      try {
        await window.API.post(`/logistica/entregas/${encodeURIComponent(aberta.id)}/cancelar`, {
          motivo: escolhido, arrivedAt: carimbarChegada(aberta.id),
        });
      } catch (e) { return avisoErro(e); }
      window.HBX.cache.remove(`chegada:${aberta.id}`);
      aberta = null; motivo = '';
      await carregarRota();
      irDepoisDoDesfecho();
    });
  }

  /* O 1º motivo já nasce marcado na folha (`.motivo.on` do mock): quem só toca
     em "Registrar" está escolhendo ELE, não "nenhum". Ler do seam mantém uma
     fonte só — se o dono trocar a lista no mock, isto acompanha. */
  function DADOS_MOTIVO_PADRAO() {
    try { return (DADOS.folha.motivos || [])[0] || ''; } catch (_) { return ''; }
  }

  const ACOES = {
    /* 🔴 DOIS PASSOS, NÃO TRÊS (dono, 08/08: "MONTAR ROTA → MONTAGEM DE ROTA
       (BOTÃO INICIAR)"). Este botão abre a Montagem — e abrir a Montagem JÁ
       roda o otimizador (ver o guarda do `ir`), então o motorista chega com a
       lista do dia na frente dos olhos e o pé já dizendo "Iniciar rota".
       O `montar-agora` (o 2º "Montar rota", no pé da própria tela) morreu com
       ele: era o toque a mais que só trocava a fonte da mesma lista. */
    montar: abrirMontagem,
    /* 🔴 E O `montar-agora` VOLTOU A TER DONO. Ele saiu do mapa de ações quando
       o pé da Montagem virou "Iniciar sempre" — botão desenhado sem ação, a
       doença que este arquivo persegue. Hoje ele reaparece na tela no único
       caso em que faz sentido: dia futuro escolhido no chip, onde "Iniciar" não
       existe. Sem esta linha o toque morreria no vidro. */
    /* 🔴 OS TRÊS PASSAM PELA TRAVA DA ORDEM ALTERADA (dono, 10/08). Ela só
       morde na tela de Montagem e só com o dedo tendo mexido na sequência —
       fora disso `comOrdemSalva` é um repasse. Aqui e não dentro de
       `montarRota`/`iniciarRota` porque o que se barra é o TOQUE: as duas
       funções também são chamadas por dentro (retomada, erro), e ali a
       pergunta não teria a quem falar. */
    /* 🔴 …e responde NO TOQUE (12/08): `aguardeNoToque` põe o estado de espera
       no próprio botão no mesmo quadro do dedo — ver a nota no 30-verbos. */
    'montar-agora': (alvo) => aguardeNoToque(alvo, () => comOrdemSalva(montarRota)),
    // rota rodando: o botão do meio leva pra navegação (é o que se faz andando)
    navegar: () => window.ir('mapa'),
    'salvar-rota': salvarRota,
    /* 🔴 A INTENÇÃO NASCE NA PORTA (10/08, lei do PR10082026). São DUAS portas
       pro mesmo verbo, e elas querem coisas diferentes:

         · `iniciar-rota` é o pé da MONTAGEM. Ela lê o estado DELA, no instante
           do toque: chip apagado ⇒ rota AVULSA (só o que está na tela); chip
           num dia que não é hoje ⇒ a gente daquele dia entregando HOJE; chip
           em hoje ⇒ o dia inteiro.
         · `iniciar` é o dock do MAPA. Ele nunca esteve na Montagem: quer o DIA
           INTEIRO, e ponto.

       Enquanto a decisão morava DENTRO do `iniciarRota` (lendo `montarDia`), o
       dock do mapa herdava o -1 de uma tela que o motorista nem abriu e o
       Iniciar morria com "A rota avulsa está vazia" — com 51 paradas agendadas
       no servidor. Porta que adivinha por variável de ambiente é essa doença. */
    // o irmão do mesmo pé, mesma doença, mesma cura: responde no toque.
    'iniciar-rota': (alvo) => aguardeNoToque(alvo, () => comOrdemSalva(() => iniciarRota({
      escopo: montarDia === -1 ? 'avulsa' : (diaDeOutroDia() ? 'outroDia' : 'dia'),
    }))),
    iniciar: () => comOrdemSalva(() => iniciarRota({ escopo: 'dia' })),
    'cancelar-rota': cancelarRota,
    'rota-pendente-abrir': abrirRotaPendente,
    'rota-pendente-continuar': continuarRotaPendente,
    'rota-pendente-puxar': puxarRotaPendente,
    'rota-pendente-cancelar': cancelarRotaPendente,
    'entregue-pagou': () => confirmarEntrega(''),
    'entregue-marcou': () => confirmarEntrega('fiado'),
    'confirmar-venda': () => confirmarEntrega(''),
    'registrar-nao-entregue': registrarNaoEntregue,
    'fechar-dia': fecharDia,
    'salvar-cliente': salvarCliente,
    'excluir-cliente': excluirCliente,
    'salvar-produto': salvarProduto,
    /* O VÍNCULO CLIENTE × PRODUTO (12/08) — a ficha voltou a ADMINISTRAR o que
       o cliente leva, e não só a listar. Nada de endpoint novo: POST/PATCH/
       DELETE de `/logistica/cliente-produtos` já existiam e já estavam na
       allowlist do Kotlin; o que faltava era alguém bater na porta. */
    'novo-vinculo': novoVinculo,
    'salvar-vinculo': salvarVinculo,
    'remover-vinculo': removerVinculo,
    'remover-vinculo-agora': removerVinculoAgora,
    'chave-vinculo-ativo': virarChaveDoVinculo,
    /* As DUAS chaves do Financeiro da ficha. Elas mexem na MEMÓRIA e o Salvar
       grava — ver `mexerFinanceiro`: nesta tela o dono mexe em nome, endereço,
       dia, produto e dinheiro e aperta UM botão; chave que gravasse no toque
       faria metade da ficha obedecer o Voltar e a outra metade não. */
    'chave-contabilizar': () => mexerFinanceiro({ contabilizar: !(ficha && ficha.fin && ficha.fin.contabilizar) }),
    'chave-avisar-cobranca': () => mexerFinanceiro({ avisarCobranca: !(ficha && ficha.fin && ficha.fin.avisarCobranca) }),
    // o "+" do cabeçalho: cadastrar cliente na porta
    'usar-meu-local': usarMeuLocal,
    // o GPS da FICHA (10/08): mesmo motor, cliente que já existe
    'usar-local-ficha': usarLocalFicha,
    /* As três saídas do "Registrar local". Cada uma REUSA a porta que já
       existe — nada de fluxo paralelo de cadastro/venda na rua, que é como
       nasce o cliente que só existe numa das telas.
       O cadastro já sabe puxar o fix sozinho (`usarMeuLocal` traz CEP, rua e
       bairro do reverse — o dado que ninguém sabe de cor na frente do cliente),
       então aqui é literalmente abrir a tela e chamar o que o dedo chamaria. */
    'registrar-cadastrar': () => { window.ir('novocliente'); usarMeuLocal(); },
    'registrar-vender': () => window.ir('rapida'),
    'registrar-corrigir': () => {
      const daVez = paradasPendentes()[0];
      const c = daVez && daVez.item && daVez.item.cliente;
      if (!c || !c.id) return;
      // A ficha real do cliente, com o Voltar devolvendo pra navegação.
      abrirCliente(String(c.id), 'mapa');
    },
    'registrar-local': registrarLocal,
    'salvar-novo-cliente': salvarNovoCliente,
    'criar-cliente-assim': () => comTrava(() => criarCliente(null)),
    // o "+" da Montagem e da Rota: a parada avulsa
    'rapida-buscar': () => comTrava(rapidaBuscar),
    'rapida-confirmar': () => comTrava(rapidaConfirmar),
    'rapida-adicionar-escolhidos': () => comTrava(rapidaAdicionarEscolhidos),
    'rapida-recarregar': () => {
      if (!rapida) return;
      rapida.listaCarregando = true; rapida.listaSemFonte = false;
      publicarRapida();
      carregarClientesDaRapida();
    },
    'entendi-recado': entendiRecado,
    // "Tentar de novo" do aviso de fonte fora do ar: volta pro esqueleto e
    // pede de novo. Sem devolver o esqueleto o toque não teria resposta
    // nenhuma na tela, e o motorista tocaria três vezes achando que travou.
    'recarregar-montagem': () => retentar('montagem', encherMontagem),
    'recarregar-clientes': () => retentar('clientes', carregarClientes),
    'recarregar-produtos': () => retentar('produtos', carregarProdutos),
    'recarregar-salvas': () => retentar('salvas', carregarSalvas),
    'recarregar-chat': () => retentar('chat', carregarRecados),
    'recarregar-ajustes': () => retentar('ajustes', carregarAjustes),
    /* Os dois blocos da tela de Créditos tentam de novo SEPARADO — cada um pede
       só a sua porta. Um "Tentar de novo" que rebuscasse as duas devolveria ao
       esqueleto o bloco que já estava certo na tela. */
    'recarregar-creditos': () => retentar('creditos', carregarCreditos),
    'recarregar-movimento': () => {
      if (typeof window.usarDados === 'function') {
        window.usarDados('creditos', { movCarregando: true, movSemFonte: false });
      }
      carregarCreditos();
    },
    'recarregar-financeiro': () => retentar('financeiro', carregarFinanceiro),
    /* O "Finalizar" do dock da rota. Ele é PORTA, não verbo: abre o Fechamento,
       onde o dinheiro do dia está à vista e mora o único botão que fecha (ver
       `fecharDia`). Antes apontava pro próprio `fechar-dia` — dois botões no
       mesmo gancho, um deles numa tela que o outro abre. */
    'ir-fechamento': () => window.ir('fechamento'),
    'ir-creditos': () => window.ir('creditos'),
    'ir-financeiro': () => window.ir('financeiro'),
    'ir-avancado': () => window.ir('avancado'),
    // 'chave-caderneta' morreu em 07/08 junto com a chave; em 09/08 a palavra
    // saiu do produto inteiro — a tela é o FECHAMENTO DO DIA.
    /* 🔴 TRÊS CAMPOS DO SERVIDOR DISPUTAVAM O RÓTULO "AVISAR CHEGADA". Medido,
       e a diferença é de FUNÇÃO, não de nome:
       · `raioChegadaM` (60 m) — no app que já roda é o raio do geofence NATIVO
         (`activateRoute({raioM})`): é ele que dispara o `hbx:arrival` e ABRE a
         folha sozinho. O app novo NÃO tem esse geofence — aqui a folha abre
         quando o motorista TOCA na parada. Logo, no celular novo esse número
         não muda nada do que ele vê (o que sobra dele é o vigia da Central, que
         é tela de PC). Não entra: número que não faz nada é o mesmo defeito da
         chave que não faz nada.
       · `avisoChegandoEnabled` — liga/desliga o WhatsApp "estou chegando" PRO
         CLIENTE. É literalmente o "chegou no cliente" do dono. É esta a chave.
       · `avisoChegandoDistanciaM` (500 m) — a que distância esse aviso sai. É o
         NÚMERO que aparece na linha, e agora ele é verdade: é o raio do anel
         armado em `anelDeChegada`. */
    // Os dois da beirada da tela de dirigir. Até 08/08 o toque neles morria no
    // vidro — botão desenhado que não faz nada é pior que botão ausente.
    'gps-voz': () => {
      try {
        const p = window.HBX.soundPrefs.get() || {};
        window.HBX.soundPrefs.set(Object.assign({}, p, { voz: p.voz === false }));
      } catch (_) { return; }        // sem ponte de som: nada a prometer
      pintarNavegacao();             // o botão muda de cara no mesmo toque
    },
    // recentralizar é o dedo dizendo "me devolve pra tela de dirigir": ele
    // ATRAVESSA a descida, senão o toque morre esperando 2,4 s de animação.
    // 🔴 E agora ele tem O QUE desfazer: até 08/08 este botão só reafirmava
    // uma câmera que nunca tinha saído do lugar — botão sem trabalho, do lado
    // de um mapa que não obedecia o dedo. Os dois defeitos eram um só.
    'gps-centrar': () => { voltarASeguir(); },
    // O único botão da beirada do mapa 2D (a tela principal da rota). Ele existe
    // porque o dedo pode levar o mapa pra qualquer lugar e nada ali o traz de
    // volta: não há câmera automática no palco "geral", de propósito.
    /* 🔴 O BOTÃO-ALVO É A PORTA DA LOCALIZAÇÃO, NÃO SÓ UMA CÂMERA (09/08). Ele
       enquadrava e pronto — e num dia SEM rota o que ele promete ("Centralizar
       em mim") depende de uma posição que o app pode não ter: sem fix, o toque
       não fazia absolutamente nada e o motorista tocava de novo, e de novo.
       Agora ele faz as duas metades, nesta ordem: GARANTE o GPS (pedindo a
       permissão ao Android se ainda não houver — e este é o toque que autoriza
       o pedido, § pedirGpsNoToque) e enquadra com o que já existe. Quando o fix
       chegar depois, `moverEuNoPlano` cria o marcador e enquadra UMA vez — o
       "centra" acontece sozinho, sem este botão precisar esperar por nada. */
    'mapa-enquadrar': () => { pedirGpsNoToque(); enquadrarPlano(); },
    // A barra do mapa vira BOTÃO quando a localização está desligada (§ T.rota
    // no mock). É a mesma porta do alvo: informação e saída na mesma peça.
    'gps-ligar': () => { pedirGpsNoToque(); },
    'aviso-chegada': () => virarChave('avisoChegandoEnabled'),
    // As 6 do dono. Uma chave = um campo = um PATCH, sem lote: assim o que
    // falhou fica evidente e o resto não volta atrás junto.
    'chave-financeiro': () => virarChave('moduloFinanceiroAtivo'),
    'chave-cobranca-simples': () => virarChave('cobrancaSimples'),
    'chave-preco-cliente': () => virarChave('precoPorClienteAtivo'),
    'chave-na-hora': () => virarChave('aceitaNaHora'),
    'chave-mensal': () => virarChave('aceitaMensal'),
    'chave-fiado': () => virarChave('aceitaFiado'),
    // A do prospector entra pela MESMA porta das seis: um campo, um PATCH, sem
    // otimismo na tela. É ela que deixa o capítulo "Ligue o prospector"
    // terminar num `fazer` de verdade — o dono liga na hora, aprendeu fazendo.
    'chave-prospector': () => virarChave('prospectorAtivo'),
    /* PROSPECTOR v2 (12/08) — as três portas da ESCOLHA DA SEMANA. Elas NÃO são
       chave de config: a chave de cima é da EMPRESA (um campo, um PATCH), estas
       são da PESSOA que dirige (§7b-bis). Abrir CARREGA antes de navegar — folha
       de escolha que nasce vazia é folha que mente sobre o que está escolhido. */
    'abrir-prospector-tipo': abrirFolhaDoProspector,
    'prospector-desligar': desligarProspectorSemana,
    // Som e voz sao do APARELHO (soundPrefs do Kotlin), nao do servidor.
    'chave-sons': () => {
      try {
        const atual = window.HBX.soundPrefs.get() || {};
        window.HBX.soundPrefs.set(Object.assign({}, atual, { master: atual.master === false }));
      } catch (_) { /* sem ponte de som: nada a fazer */ }
      carregarAjustes();
    },
    // 🔴 `chave-tema` NÃO ENTRA AQUI — e a ausência é a correção, não um
    // esquecimento. O tema tem um dono só (§1): a ponte já EMBRULHA o
    // `trocarLuz` do mock pra falar com o native. O mock vira a luz; o embrulho
    // leva pro aparelho. Uma entrada aqui viraria a luz uma SEGUNDA vez no
    // mesmo clique — medido no g15: escuro→claro→escuro, e a chave "Tema
    // escuro" dos Ajustes simplesmente não fazia nada.
    // 🔴 SAIR APAGA A SESSAO DO APARELHO — confirma antes, sempre.
    sair: () => {
      window.portao({
        tom: 'alerta', ico: 'logout', titulo: 'Sair do aplicativo?',
        sub: 'Voce vai precisar parear o aparelho de novo.',
        acoes: [['Ficar', ''], ['Sair', 'principal']], classe: 'duas',
      });
      const b = naCamada('.portao-wrap .principal');
      if (b) b.addEventListener('click', () => { try { window.HBX.logout(); } catch (_) {} }, { once: true });
    },
    recarregar: () => {
      if (!pacoteEscolhido) return;
      // O checkout e NATIVO (RechargeCheckoutActivity): o WebView nunca ve
      // dado de cartao. Aqui so se diz QUAL pacote.
      try { window.HBX.recharge(pacoteEscolhido); }
      catch (_) { avisoErro(new Error('Nao consegui abrir a recarga agora.')); }
    },
    /* 🔴 A PORTA MANUAL DA ATUALIZAÇÃO (09/08). Enquanto só existia o pop-up
       automático, perder o aviso uma vez era ficar preso na versão velha: sem
       chip no cabeçalho, sem linha nos Ajustes, sem nada pra tocar. `forcado`
       fura a trava de 30 min E a memória do "já avisei" — e responde SEMPRE,
       inclusive quando não há novidade. */
    'buscar-update': () => { checkAppUpdate(true); },
    'enviar-recado': enviarRecado,
    // "Responder" não manda nada: ele leva o dedo pro campo. O texto é dele.
    'responder-recado': () => {
      const el = naCamada('[data-campo="recado-texto"]');
      if (el) el.focus();
    },
  };
  /* 🔴 A SETA DO CABEÇALHO É O MESMO VOLTAR (dono, 10/08). O item 4 do pedido
     fala de "voltar", e nesta tela ele tem duas portas: a tecla do Android e a
     seta do topo. Regra que vale numa porta só não é regra — é armadilha.
     Fase de CAPTURA, e só aqui: o roteador do mock escuta `[data-ir]` na subida
     e mandaria a tela pra Rota antes de qualquer coisa. `stopPropagation` no
     documento em captura impede que ele veja o toque; sem dia aceso a linha nem
     morde, e a seta volta a ser a seta. */
  document.addEventListener('click', (e) => {
    if (!temPonte() || telaAtual() !== 'montagem' || montarDia === -1) return;
    if (!e.target.closest('[data-voltar][data-ir]')) return;
    e.preventDefault();
    e.stopPropagation();
    soltarDia();
  }, true);

  // captura na fase de subida, DEPOIS do mock: quem não é meu segue o caminho dele.
  document.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-acao], [data-estado]');
    if (!alvo || !temPonte()) return;
    const chave = alvo.dataset.acao || alvo.dataset.estado;
    // Ações que carregam ARGUMENTO no próprio botão. Ficam fora do mapa porque
    // o mapa é nome→função; aqui o dado é parte do toque.
    if (chave === 'abrir-parada') return abrirParada(alvo.dataset.parada);
    // A ficha volta pra TELA DE ONDE SAIU o toque (Clientes ou Montagem): quem
    // abriu a ficha no meio de montar a rota não pode cair na lista de
    // cadastro e perder o dia que estava arrumando.
    if (chave === 'abrir-cliente') return abrirCliente(alvo.dataset.cliente, telaAtual());
    if (chave === 'abrir-produto') return abrirProduto(alvo.dataset.produto);
    /* 🔴 DUAS PORTAS PARECIDAS QUE NÃO PODEM SE MISTURAR (12/08). `abrir-produto`
       leva ao CATÁLOGO (preço de todo mundo); `abrir-vinculo` leva ao que ESTE
       cliente leva. Confundi-las é mudar o preço da empresa achando que se
       acertou o de uma pessoa — por isso são dois nomes, nunca um com "modo". */
    if (chave === 'abrir-vinculo') return abrirVinculo(alvo.dataset.vinculo);
    if (chave === 'escolher-produto-vinculo') return escolherProdutoDoVinculo(alvo.dataset.produto);
    if (chave === 'local-vinculo') return escolherLocalDoVinculo(alvo.dataset.local);
    // Os dois chips do Financeiro da ficha: mexem na memória, o Salvar grava.
    if (chave === 'forma-cliente') return mexerFinanceiro({ forma: String(alvo.dataset.forma || 'na_hora') });
    if (chave === 'metodo-cliente') return mexerFinanceiro({ metodo: String(alvo.dataset.metodo || '') });
    if (chave === 'abrir-historico-cliente') return abrirHistoricoCliente();
    if (chave === 'historico-cliente-mais') return carregarMaisHistoricoCliente();
    if (chave === 'abrir-salva') return abrirSalva(alvo.dataset.salva);
    /* AS TRÊS DO ANEXO DO RECADO (12/08, L8d). O argumento é o id do RECADO —
       nunca o do cliente/rota: quem guarda o estado da decisão é o recado, e
       chavear pelo alvo faria duas mensagens sobre o mesmo cliente virarem uma
       decisão só. `encaixar` leva o NÓ junto, que é onde o `aguarde` entra. */
    if (chave === 'anexo-encaixar') return encaixarAnexo(alvo.dataset.anexo, alvo);
    if (chave === 'anexo-analisar') return analisarAnexo(alvo.dataset.anexo);
    if (chave === 'anexo-negar') return negarAnexo(alvo.dataset.anexo);
    if (chave === 'abrir-empresa') return acenderEmpresa(alvo.dataset.empresa);
    // O chip da folha do prospector: o TIPO é o argumento do toque (§7b-bis).
    if (chave === 'prospector-tipo') return escolherTipoProspector(alvo.dataset.tipo);
    if (chave === 'pacote') return escolherPacote(alvo.dataset.pacote);
    if (chave === 'modo-rota') return escolherModo(alvo.dataset.modo);
    // As três da parada avulsa que carregam ARGUMENTO no próprio botão.
    if (chave === 'rapida-opcao') return rapidaEscolher(alvo.dataset.i);
    if (chave === 'rapida-modo') {
      if (!rapida) return;
      rapida.modo = alvo.dataset.modo === 'cadastro' ? 'cadastro' : 'direcao';
      rapida.aviso = '';
      return publicarRapida();
    }
    if (chave === 'rapida-posicao') {
      if (!rapida) return;
      rapida.posicao = alvo.dataset.posicao === 'primeira' ? 'primeira' : 'perto';
      return publicarRapida();
    }
    if (chave === 'rapida-porta') {
      if (!rapida) return;
      rapida.porta = alvo.dataset.porta === 'endereco' ? 'endereco' : 'cadastro';
      rapida.aviso = '';
      publicarRapida();
      // Volta pra porta do cadastro com a lista no chão? Ela tenta de novo
      // sozinha — trocar de aba é o pedido de ver a lista.
      if (rapida.porta === 'cadastro' && (rapida.listaSemFonte || !rapida.lista.length)) carregarClientesDaRapida();
      return;
    }
    if (chave === 'rapida-marcar') {
      if (!rapida) return;
      const id = String(alvo.dataset.cliente || '');
      if (!id) return;
      const i = rapida.escolhidos.indexOf(id);
      if (i >= 0) rapida.escolhidos.splice(i, 1); else rapida.escolhidos.push(id);
      rapida.aviso = '';
      return publicarRapida();
    }
    if (chave === 'historico-usar') {
      return void usarHistorico(String(alvo.dataset.data || ''));
    }
    if (chave === 'montar-dia') {
      const n = Number(alvo.dataset.dia) || 0;
      /* 🔴 CHIP DE DIA É LIGA/DESLIGA (dono, 10/08: "eu aperto SEG, para
         remover segunda, ela não some — se ela saísse apareceria essa rota
         avulsa"). O 2º toque no chip aceso APAGA o dia da tela: sem dia nenhum
         (`montarDia = -1`) a Montagem é a ROTA AVULSA — a lista fica só com o
         que o dedo pôs (rascunho e avulsas de hoje) e o Iniciar sai só com
         elas, sem varrer a agenda junto. Tocar qualquer chip devolve o dia. */
      if (montarDia === n) return void soltarDia();
      montarDia = n;
      // o chip acende JÁ (resposta ao dedo); a lista do dia chega em seguida
      window.usarDados('montagem', { diaSel: montarDia });
      // Os 3 espaços são DO DIA: trocar de chip troca a fileira inteira, senão
      // o Espaço 1 de sábado ficaria aceso na tela de segunda.
      carregarEspacos();
      encherMontagem();
      return;
    }
    if (chave === 'chip-dia') {
      const n = Number(alvo.dataset.dia) || 0;
      // 2º toque no mesmo chip DESLIGA o filtro. Chip que só liga é armadilha:
      // o motorista fica preso num dia e acha que perdeu os clientes.
      filtroClientes.dia = filtroClientes.dia === n ? 0 : n;
      window.usarDados('clientes', { diaSel: filtroClientes.dia });
      return carregarClientes();
    }
    if (chave === 'dia-cliente') {
      if (!ficha) return;
      const n = Number(alvo.dataset.dia) || 0;
      const i = ficha.dias.indexOf(n);
      if (i >= 0) ficha.dias.splice(i, 1); else ficha.dias.push(n);
      return encherFicha();
    }
    if (chave === 'forma') { forma = String(alvo.dataset.forma || ''); return repintarFolha(); }
    if (chave === 'motivo') {
      motivo = String(alvo.dataset.motivo || '');
      if (typeof window.usarDados === 'function') window.usarDados('folha', { motivo });
      return;
    }
    const fn = ACOES[chave];
    // o NÓ TOCADO viaja junto: é nele que o "aguarde" do montar/iniciar entra
    // no mesmo quadro do dedo (quem não usa o argumento simplesmente o ignora).
    if (fn) fn(alvo);
  });
})();
