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
  // '.chegou-wrap' entra ENTRE '.conf-wrap' e '.aviso' (LOTE 3, 15/08) — a
  // lista é z-index decrescente, e o cartão "Você chegou" vale 56: abaixo do
  // portão/confirmação, acima do aviso passageiro.
  const POR_CIMA = ['.aula-wrap', '.erro-wrap', '.portao-wrap', '.conf-wrap', '.chegou-wrap', '.aviso'];
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
    // Encerrada/concluída NÃO é rodando: o dia fechou. Se ainda sobrou parada
    // aberta com ordem, o estado é "pronta" (dá pra reiniciar no mesmo dia).
    // 🔴 A ROTA FANTASMA (14/08): PLANNED sozinho não prova parada viva — só
    // que a rota foi montada um dia. Zero abertas rebaixa pro dock real
    // ("Montar rota"); com abertas, intocado — continua 'pronta'.
    if (s === 'PLANNED') return abertas.length ? 'pronta' : 'montar';
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
  /* 🔴 A ROTA FANTASMA (15/08) — `refDaResposta` MUDOU DE CASA, pro módulo
     dela de verdade (`25-continuidade-rota.js`, é lá que ela mora agora):
     este arquivo está no teto de 1000/1000 linhas do portão da ponte. Ver o
     comentário completo junto da definição nova. */

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
