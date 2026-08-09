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
      if (forcado) avisoErro(new Error('Não consegui verificar agora. Confira a internet e tente de novo.'));
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
    return e === 'pronta' || e === 'rodando' || e === 'pausada';
  };

  /* 🔴 O TEMPLATE DO MOCK INTERPOLA CRU (`${…}`), como toda maquete. Enquanto o
     dado era do mock isso não tinha dono; com dado REAL passa a ter: um nome de
     cliente com `<` quebra a marcação e o cartão some da lista sem erro nenhum.
     Escapa-se na FONTE (aqui), nunca no template — assim vale pra toda tela que
     ler o seam, e o literal do mock (que tem `<b>` de propósito) continua vivo. */
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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
  /** o tom do NÚMERO da parada — o par visual da pílula acima */
  function corDaParada(statusCru) {
    const status = String(statusCru || '');
    if (status === 'entregue') return 'lime';
    if (status === 'cancelada') return 'off';
    return undefined;
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
      // 🔴 O NÚMERO DA TELA É A ORDEM DA VISITA, e gente conta do 1. O servidor
      // grava `rotaOrdem` começando em ZERO — usar o campo cru punha "0, 1, 2"
      // na frente do motorista (visto no g15). A ordem do servidor decide a
      // SEQUÊNCIA; o número que aparece é a posição na fila.
      n: i + 1,
      hora: hora(item.etaAt || item.scheduledAt),
      cor: corDaParada(status),
      nome: esc(c.nome),
      rua: esc(c.endereco),
      bairro: esc(c.cidade),
      // o pino do mapa sai daqui; sem coordenada a parada existe na lista e
      // NÃO aparece no mapa (é o que "sem trajeto" já conta pro motorista).
      lat: typeof c.lat === 'number' ? c.lat : null,
      lng: typeof c.lng === 'number' ? c.lng : null,
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
          aceso: !!e.aceso,
          ordem: filaDeJanelas(id || String(i)),
          // escalona quem acende primeiro: as três da cena do desenho entram
          // com respiro entre elas, não todas no mesmo quadro.
          atraso: `${(i * 0.75).toFixed(2)}s`,
        };
      });
    window.usarDados('mapa', { empresas });
  }

  /* Qual DIA está desenhado na tela agora. É a metade que faltava pra fechar a
     virada da meia-noite: sem guardar isto, ninguém tem como perceber que a
     tela envelheceu. Ver `viradaDoDia`. */
  let diaNaTela = null;

  async function carregarRota() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const dia = diaOperacional();
    let r;
    // 🔴 A DATA VIAJA SEMPRE. Sem ela o servidor usa o dia DELE — e ele roda em
    // UTC (medido: nem o container local nem o da VPS têm TZ). Das 21h à
    // meia-noite de Brasília o UTC já é amanhã, então a rota do motorista
    // aparecia VAZIA justo no fim do turno. Achado no g15 às 23:28 (defeito meu
    // da L1: o app velho sempre mandou `?date=`).
    try { r = await window.API.get(`/logistica/rota?date=${encodeURIComponent(dia)}`); } catch (_) {
      // A rota tem estado próprio e o desenho já previa os dois: o esqueleto
      // (`carregando`) e o aviso com "Tentar de novo" (`vazia`). Só na PRIMEIRA
      // carga — com a rota do dia já na tela, rede ruim não apaga o dia.
      try { if (estadoRota === 'carregando') { estadoRota = 'vazia'; pintar(false); } } catch (_) { /* sem seam */ }
      return;
    }
    // Só depois que o servidor RESPONDEU: rede caída não pode carimbar o dia,
    // senão o vigia da virada acharia que já cuidou de um dia que nunca chegou.
    diaNaTela = dia;

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
    const itens = Array.isArray(r.items) ? r.items : [];
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
    try { estadoRota = estadoDaRota(r); } catch (_) { /* idem */ }

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
      digitalDaLista: `${gestoSujouATela}|${itens.map((it) => `${it.id}:${it.status || ''}`).join('|')}`,
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
      },
      clientes: { carregando: true, lista: [], total: '', semEndereco: '', marcadoHoje: '', subtitulo: '' },
      produtos: { carregando: true, lista: [], categorias: [], ativos: '', estoqueBaixo: '', valorEstimado: '' },
      salvas: { carregando: true, lista: [], total: '' },
      // `sino` zera JUNTO: o "2" do desenho ficava no cabeçalho de TODA tela
      // até os recados responderem — badge de exemplo com cara de recado real.
      chat: { carregando: true, conversa: [], recado: '', sino: '' },
      consumo: { carregando: true, linhas: [], saldo: '', gastosHoje: '', bonus: '' },
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
      // 🔴 TELA DE DINHEIRO. O catálogo inteiro era do desenho (R$ 49/129/239/449,
      // "+8% grátis") e o botão anunciava "Recarregar 300 créditos · R$ 129,00"
      // sem pacote escolhido de verdade — ele saía pelo `if (!pacoteEscolhido)`
      // e não fazia nada. Preço inventado com botão em cima não fica na tela.
      recarga: { carregando: true, saldo: '', ritmo: '', pacotes: [], cta: '' },
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
  const viradaDoDia = () => { if (diaNaTela && diaNaTela !== diaOperacional()) carregarRota(); };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') viradaDoDia();
  });
  window.addEventListener('focus', viradaDoDia);
  // Mesma espera do tique acima: a virada de um minuto atrasada não custa nada,
  // o tour arrancado da tela custa o passo inteiro.
  setInterval(() => { if (!tourRodando()) viradaDoDia(); }, 60000);

  const cargaInicial = () => {
    apagarDemonstracao(); carregarBarra(); carregarRota(); carregarRecados(); checkAppUpdate();
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
     adiantar, ou voltar um dia". O trilho é o MESMO do desktop
     (`/logistica/admin-route/prepare`): o dia operacional continua HOJE —
     fechamento, cobrança e carimbo coerentes — e só os CLIENTES vêm do dia
     escolhido. 0 = hoje (fluxo de sempre). Chip só aparece pra admin.
     -------------------------------------------------------------------- */
  let montarDia = 0;
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
  async function carregarDiasComCliente() {
    if (typeof window.API === 'undefined' || !ehAdmin() || diasEmVoo) return;
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
    publicarMontarDias();
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
    const dias = [1, 2, 3, 4, 5, 6, 7]
      .filter((n) => !diasComCliente || diasComCliente.has(n))
      .map((n) => [n === hoje ? 0 : n, ROTULO_DIA[n]]);
    window.usarDados('montagem', { dias, diaSel: montarDia });
  }

  /* O recado da lista vazia. Hoje sem ninguém não tem chip pra explicar a tela
     (a regra acima o tirou da fila), então quem explica é esta linha — texto
     literal do dono. Outro dia continua com o recado que já existia: ali o chip
     está aceso e o "nesse dia" tem a quem se referir. Um dia da semana pode vir
     vazio mesmo tendo gente: a cadência (quinzenal, de N em N) decide se ele
     cai NESTA semana. */
  const textoVazio = (dia) => (dia ? 'Nenhum cliente nesse dia' : 'Nada a exibir hoje');

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
    const temPino = (c) => typeof c.lat === 'number' && typeof c.lng === 'number'
      && isFinite(c.lat) && isFinite(c.lng) && !(c.lat === 0 && c.lng === 0);
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
  const semPinoNaPrevia = (c) => !(c && typeof c.lat === 'number' && typeof c.lng === 'number'
    && isFinite(c.lat) && isFinite(c.lng) && !(c.lat === 0 && c.lng === 0));
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
        // A avulsa fala a MESMA língua da prévia do servidor (09/08): quem
        // desenha o cartão lê `enderecoLinha`, então enfiar a rua no campo do
        // apelido — como era feito aqui — só funcionava por acidente.
        enderecoLinha: c.endereco || '',
        bairro: c.bairro || c.cidade || '',
        observacoes: c.observacoes || '',
        // Sem produto: a avulsa é uma PARADA, não uma venda montada. Item
        // inventado aqui viraria contagem falsa no rodapé da tela.
        itens: [],
        ...(typeof c.lat === 'number' && typeof c.lng === 'number' ? { lat: c.lat, lng: c.lng } : {}),
      });
    });
  }

  /* ------------------------------------------------------------------------
     🔴 OS 2 ESPAÇOS DO DIA (dono, 08/08) — o botão do MEIO da tela de montar.

     Três posições e uma só valendo: `dist` (a ordem automática por distância,
     que a lista já nasce tendo) e `s1`/`s2`, as duas rotas salvas DAQUELE dia
     da semana. O rótulo é o nome que o motorista digitou: "Manhã" no sábado é
     o Manhã do sábado, sempre — é `diaSemana` do rota-modelo que carrega isso,
     coluna que já existia.

     A ORDEM DOS ESPAÇOS É A DE NASCIMENTO (`criadoEm`), nunca a alfabética: o
     1º salvo do dia é o Espaço 1 pra sempre. Ordenar por nome faria renomear
     "Manhã" pra "Tarde" trocar o espaço de lugar embaixo do dedo dele.

     Escolher um espaço REORDENA o dia — não corta o dia em dois. Quem decide
     QUEM entra na rota é o `planejar` do servidor (ele monta tudo o que está
     aberto hoje); o espaço diz em que SEQUÊNCIA. Por isso o que não está no
     espaço não some: vai pro fim, na ordem de distância que já tinha.
     ------------------------------------------------------------------------ */
  const ESPACOS = [];          // até 2 rota-modelos do dia, em ordem de nascimento
  let modoSel = 'dist';        // 'dist' | 's1' | 's2'
  const NOME_MAX = 10;         // teto do nome: o botão tem 1/3 da largura da tela

  const modeloDoModo = () => (modoSel === 's1' ? ESPACOS[0] : modoSel === 's2' ? ESPACOS[1] : null);
  const diaDosEspacos = () => montarDia || diaDaSemana();

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
    const modos = ['dist', 's1', 's2'].map((chave, i) => {
      const m = i ? ESPACOS[i - 1] : null;
      // `previaDoDedo` já é o "o dedo mandou nesta lista" da montagem — o ponto
      // é a LEITURA dele, não um estado novo pra sair de sincronia depois.
      return [chave, i ? esc(String((m && m.nome) || '')) : 'Distância', (modoSel === chave && previaDoDedo) ? 1 : 0];
    });
    window.usarDados('montagem', { modos, modoSel });
  }

  /** os 2 espaços do dia escolhido, do servidor */
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
      .slice(0, 2)
      .forEach((m) => ESPACOS.push(m));
    // O dia mudou debaixo do espaço escolhido? Volta pra Distância: espaço 2 de
    // sábado não é espaço 2 de segunda, e manter a seleção mostraria a ordem de
    // uma rota que não é aquela.
    if (modoSel !== 'dist' && !modeloDoModo()) modoSel = 'dist';
    publicarModos();
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
      const porta = `${cid}|${String((p && p.localId) || '')}`;
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
      const porta = `${cid}|${String((c && c.localId) || '')}`;
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
    const idx = alvo === 's1' ? 0 : alvo === 's2' ? 1 : -1;
    // Espaço vazio não troca nada: ENSINA.
    if (idx >= 0 && !ESPACOS[idx]) return tutorialDoEspaco(alvo);
    // 2º toque no que já está aceso abre renomear/apagar (ver `gerirEspaco`).
    if (idx >= 0 && alvo === modoSel) return gerirEspaco(idx);
    modoSel = alvo;
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
    const temPino = (c) => !!c && typeof c.lat === 'number' && typeof c.lng === 'number'
      && isFinite(c.lat) && isFinite(c.lng) && !(c.lat === 0 && c.lng === 0);
    if (!temPino(atual)) return 'sem trajeto — não sei onde fica';
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
        /* 🔴 QUEM ORDENA É O OTIMIZADOR, ASSIM QUE ELE RESPONDE (dono, 08/08:
           "o otimizador é pra funcionar já no carregamento, ao apertar Montar
           Rota, só isso"). O encadeado por linha reta daqui é só a resposta
           IMEDIATA — a lista já nasce em ordem de distância enquanto o servidor
           calcula por RUA. Quando a rota volta montada, ela vence: é a mesma
           sequência que o motorista vai dirigir, e é isso que faz a tela parar
           de discordar do que foi gravado. */
        : (ordemDaRotaMontada(previaCrua, daRota) || encadearPorDistancia(previaCrua, ultimaPos)));
    // 🔴 O QUE FOI PUBLICADO VIRA A VERDADE. Guardar a ordem CRUA do servidor
    // depois de pintar outra deixaria dois donos da mesma lista — e o próximo
    // repinte escolheria um deles no escuro. Daqui pra frente `previaCrua` e
    // `PREVIA` andam no mesmo índice, que é o que faz o arrasto ser mapeável.
    previaCrua = clientes;
    PREVIA.length = 0;
    let produtos = 0;
    let total = 0;
    let temPreco = false;
    const linhas = clientes.map((c, i) => {
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
        // a POSIÇÃO de origem: é por ela que o arrasto desta lista fala
        // (`hbx:ordem` → `{previa}`), já que não há id de entrega pra mandar.
        previa: i,
        n: i + 1,
        hora: naRota ? naRota.hora : '',
        nome: esc(c.nome),
        /* 🔴 O ENDEREÇO DO CARTÃO É O ENDEREÇO (dono, 09/08: "celular tem que
           espelhar os mesmos dados que o desktop tem").
           Aqui estava `c.localApelido` — o APELIDO do local ("Casa", "Loja"),
           não a rua. Medido em prod na empresa 41: dos 51 clientes de segunda,
           51 têm apelido VAZIO e 51 têm rua preenchida — ou seja, a montagem
           listava a lista inteira com o endereço em branco enquanto o mesmo
           cliente aparecia com "Rua M-7, 897" no computador e na tela de Rota
           deste mesmo app (`rua: esc(c.endereco)`, lá em cima).
           Agora vem pronto do servidor (`enderecoLinha`, montado da MESMA fonte
           que deu o pino). O apelido não morre: quando existe, ele é o que o
           dono chamou aquela porta, então entra na linha de baixo. */
        rua: esc(c.enderecoLinha || c.endereco || c.localApelido || ''),
        bairro: esc(c.bairro || c.cidade || (c.enderecoLinha ? c.localApelido : '') || ''),
        nota: c.observacoes ? esc(c.observacoes) : undefined,
        tags: itens.map((it) => [`${Math.max(1, Number(it.qtd) || 1)}x ${esc(it.nome)}`, 'blue']),
        marcado: somaCliente ? somaCliente.toFixed(2).replace('.', ',') : '',
        cor: corDaParada(naRota && naRota.status),
        pill: pilulaDaParada(naRota && naRota.status),
        perna: pernaDaPrevia(c, clientes[i - 1], naRota, naRotaMontada(daRota, clientes[i - 1])),
      };
    });
    window.usarDados('montagem', {
      carregando: false,
      semFonte: false,
      linhas,
      // 🔴 O PÉ É "INICIAR", SEMPRE (dono: "MONTAR ROTA → MONTAGEM DE ROTA
      // (BOTÃO INICIAR)"). O `pronta:0` desta tela era o segundo "Montar rota",
      // o toque a mais que existia só pra trocar a fonte da mesma lista.
      pronta: 1,
      // quem vem primeiro: é pra onde ele vai agora.
      iniciarSub: esc((clientes[0] && clientes[0].nome) || ''),
      vazio: textoVazio(alvo),
      somaParadas: String(linhas.length),
      somaProdutos: String(produtos),
      somaValor: temPreco ? dinheiro(total) : '',
    });
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
      const porta = `${cid}|${String((it && it.localId) || '')}`;
      if (!porPorta.has(porta)) porPorta.set(porta, dado);
      if (!porCliente.has(cid)) porCliente.set(cid, dado);
    });
    if (!porCliente.size) return null;
    return { porPorta, porCliente };
  }

  const naRotaMontada = (mapas, c) => {
    if (!mapas) return null;
    const cid = String((c && c.customerProfileId) || '');
    return mapas.porPorta.get(`${cid}|${String((c && c.localId) || '')}`) || mapas.porCliente.get(cid) || null;
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

  /** o botão do meio da Rota: abre a tela de montar, sem tocar no servidor */
  function abrirMontagem() {
    // Os espaços do dia entram junto com a tela — quem os busca é o guarda de
    // `tela === 'montagem'`, o mesmo lugar que já enche a lista.
    if (typeof window.ir === 'function') window.ir('montagem');
  }

  let ocupado = false;
  const comTrava = async (fn) => {
    if (ocupado) return;
    ocupado = true;
    try { await fn(); } finally { ocupado = false; }
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
  const avisoErro = (e) => {
    const msg = humano(e);
    if (typeof window.portao === 'function') {
      window.portao({ tom: 'trava', ico: 'alert', titulo: 'Não deu certo', sub: msg, acoes: [['Fechar', '']] });
    }
  };
  const hojeISO = () => diaOperacional();

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

  /* 🔴 ABRIR A MONTAGEM NÃO PODE RE-RODAR O OTIMIZADOR AGORA (09/08).
     Abrir a Montagem RE-PLANEJA — é o "montar já no carregamento" que o dono
     pediu, e está certo enquanto ninguém decidiu nada. A parada avulsa quebra
     as duas pontas disso, e por motivos diferentes:

     1. DEU CERTO: ela acabou de gravar uma sequência ESCOLHIDA ("No caminho"
        mediu o encaixe perna a perna, "Primeira parada" furou a fila). O
        `planejar` sem `ordemManual` do toque seguinte desfazia a escolha dele
        em silêncio, e a parada reaparecia noutro lugar sem ninguém pedir. É a
        metade já escrita duas seções acima: COM decisão humana, o motor não
        tem o direito de refazer.
     2. DEU ERRADO: o encaixe caiu na rede, e a tela volta com o aviso "a
        parada entrou, mas não consegui reordenar". Deixar a Montagem tentar
        planejar de novo ali é pedir pro MESMO erro acontecer 300 ms depois —
        e o portão genérico do erro APAGA o aviso certo (medido: o "Não deu
        certo" comia a única frase que dizia que a parada existe).

     Vale UMA vez e some depois. */
  let pularMontarAoAbrir = false;

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

  /** monta a rota do dia: planeja (grava a ordem) e confere (semáforo). */
  async function montarRota() {
    await comTrava(async () => {
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
      montando(1);
      const devolverEstado = () => montando(0);

      let plano;
      try {
        if (montarDia && montarDia !== diaDaSemana() && ehAdmin()) {
          // Outro dia puxado pra HOJE: o prepare materializa a agenda do dia
          // escolhido em cima do dia operacional de hoje e já planeja.
          const prep = await window.API.post('/logistica/admin-route/prepare', {
            operationalDate: hojeISO(), sourceDates: [dataDoDia(montarDia)], ...origemGps(),
          });
          plano = prep && prep.plan ? prep.plan : prep;
        } else {
          plano = await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...origemGps() });
        }
      } catch (e) { devolverEstado(); return avisoErro(e); }
      const paradas = Array.isArray(plano && plano.stops) ? plano.stops
        : (Array.isArray(plano && plano.items) ? plano.items
          : (Array.isArray(plano && plano.paradas) ? plano.paradas : []));

      // semáforo dos endereços: só ATRASA a montagem se o servidor acusar algo.
      let conf = null;
      try { conf = await window.API.post('/logistica/rota/conferir', { date: hojeISO(), ...origemGps() }); } catch (_) { /* aviso é enfeite, não portão */ }
      const comAviso = conf && Array.isArray(conf.items)
        ? conf.items.filter((i) => Array.isArray(i.motivosVisiveis) && i.motivosVisiveis.length).length
        : 0;

      /* A ESCOLHA DE DIA MORRE AQUI. O `prepare` acima já trouxe o dia escolhido
         pra HOJE; seleção presa deixaria o próximo montar puxando o dia velho
         calado, e o chip aceso mentindo sobre o que está na lista. */
      if (montarDia) { montarDia = 0; window.usarDados('montagem', { diaSel: 0 }); }
      // 🔴 SÓ ABRE A MONTAGEM SE A ROTA ENTROU. Com o `/logistica/rota` no chão
      // o `carregarRota` volta no catch antes de escrever no seam, e a tela de
      // montagem abria com as 6 paradas do desenho e "R$ 336,00" — dinheiro de
      // exemplo numa tela de decisão. Falhou, avisa e fica onde está.
      if (!(await carregarRota())) {
        devolverEstado();
        return avisoErro(new Error('Não consegui montar agora. Tente de novo.'));
      }
      /* 🔴 O ARRASTO E O ESPAÇO SOBREVIVEM AO MONTAR. Sem esta linha o motorista
         arrastava, mandava montar, e o otimizador devolvia a ordem DELE por
         cima — o gesto virava enfeite. Em modo Distância isto nem roda: lá a
         sequência é do servidor, de propósito. */
      if (ordemDeGente()) await cravarOrdemDaTela();
      devolverEstado();          // o "Montando…" sai com o dado já na tela
      if (comAviso && typeof window.usarDados === 'function') {
        window.usarDados('montagem', { iniciarSub: `${comAviso} com aviso` });
      }
      if (comAviso && typeof window.portao === 'function') {
        window.portao({
          tom: 'alerta', ico: 'gps', titulo: `${comAviso} ${comAviso === 1 ? 'endereço com aviso' : 'endereços com aviso'}`,
          sub: 'Dá pra sair assim, mas confira antes.', acoes: [['Ver a rota', 'principal']],
        });
      }
      // Não navega: o motorista JÁ está na montagem, e ela acabou de virar a
      // rota de verdade (o `carregarRota` acima escreveu `pronta:1`, então o
      // botão do pé agora é "Iniciar rota").
    });
  }

  /** iniciar: mostra o custo REAL e só então cobra. */
  async function iniciarRota() {
    await comTrava(async () => {
      /* 🔴 UMA TELA SÓ ⇒ O INICIAR TAMBÉM MONTA (dono: "MONTAR ROTA → MONTAGEM
         DE ROTA (BOTÃO INICIAR)"). O 2º "Montar rota" morreu, então o dia pode
         chegar aqui sem ordem gravada — e o servidor responderia "monte a rota
         antes de iniciar" no toque que devia sair pra rua. Planejar de novo o
         mesmo conjunto não cria parada nem debita. */
      if (estadoRota === 'montar' || !ENTREGAS.size) {
        try {
          await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...origemGps() });
        } catch (e) { return avisoErro(e); }
        if (!(await carregarRota())) return avisoErro(new Error('Não consegui montar agora. Tente de novo.'));
        if (ordemDeGente()) await cravarOrdemDaTela();
      }
      let custo = null;
      // a data vai JUNTO — sem ela o servidor cobra pelo dia UTC dele (ver a
      // nota no `carregarRota`): das 21h em diante o portão nem abria.
      try { custo = await window.API.get(`/logistica/rota/custo-preview?date=${encodeURIComponent(hojeISO())}`); } catch (e) { return avisoErro(e); }
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
      window.portao({
        tom: temSaldo ? 'info' : 'trava',
        ico: temSaldo ? 'play' : 'card',
        titulo: temSaldo ? 'Iniciar a rota?' : 'Créditos insuficientes',
        sub: isFinite(saldo)
          ? `Debita ${num(debita)} · você tem ${num(saldo)}`
          : `Debita ${num(debita)}`,
        acoes: temSaldo ? [['Agora não', ''], ['Iniciar', 'principal']] : [['Fechar', '']],
        classe: temSaldo ? 'duas' : '',
      });
      // o "Iniciar" do portão é quem cobra — nunca este trecho.
      const wrap = naCamada('.portao-wrap');
      const botao = wrap && wrap.querySelector('.principal');
      if (temSaldo && botao) {
        // `comTravaFila`, não `comTrava`: ver a nota lá em cima — o toque que
        // chega ocupado espera a vez em vez de morrer junto com o diálogo.
        botao.addEventListener('click', () => comTravaFila(async () => {
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
            aplicarProspector(await window.API.post('/logistica/rota/iniciar', {
              date: hojeISO(), ...(minha ? { ordemManual: minha } : {}), ...origemGps(),
            }));
          } catch (e) {
            // 🔴 NUNCA MORRER CALADO (dono, §1.3): primeiro a verdade do
            // servidor — se a rota JÁ ESTÁ em andamento, a resposta certa é
            // levar o motorista pra ela, não um erro genérico.
            await carregarRota();
            if (estadoRota === 'rodando' || estadoRota === 'pausada') {
              if (typeof window.ir === 'function') window.ir('rota');
              return window.portao({
                tom: 'info', ico: 'route', titulo: 'A rota já está em andamento',
                sub: 'Você caiu direto nela.', acoes: [['Fechar', '']],
              });
            }
            return avisoErro(e);
          }
          await carregarRota();
          if (typeof window.ir === 'function') window.ir('rota');
        }), { once: true });
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
  async function cancelarRota() {
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'close', titulo: 'Tem certeza que deseja cancelar?',
      acoes: [['Não', ''], ['Sim', 'principal']], classe: 'duas', perigo: true,
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      try { await window.API.post('/logistica/rota/limpar-dia', { date: hojeISO() }); } catch (e) { return avisoErro(e); }
      // 🔴 O SERVIDOR ENCERROU; O APARELHO TAMBÉM TEM QUE ESQUECER. A fita e a
      // geometria são DESTE lado do fio — e vêm ANTES do `carregarRota`, senão
      // o repinte que ele dispara passaria com a rota morta ainda desenhada.
      esquecerTraco();
      await carregarRota();
      if (typeof window.ir === 'function') window.ir('rota');
    }), { once: true });
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
        await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ordemManual: ids, ...origemGps() });
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
     do mock, intocado. O desenho fica embaixo como fundo de espera: tela preta
     enquanto o mapa sobe é pior que a ilustração.
     ------------------------------------------------------------------------ */
  const MAPA_TILES = 'https://appassets.androidplatform.net/tiles/{z}/{x}/{y}.pbf';
  // 🔴 O basemap acaba no z14. Sem declarar o teto, o maplibre pede z15+, não
  // acha nada e a tela fica VAZIA justo no zoom de rua — que é onde o motorista
  // olha. Com o teto, o z14 estica (overzoom), que é o certo.
  const MAPA_ZOOM_MAX = 14;
  let maplibrePromessa = null;
  const carregarMaplibre = () => {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (maplibrePromessa) return maplibrePromessa;
    maplibrePromessa = new Promise((ok, falha) => {
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
     `pontoOk` é a régua que esta casa já tinha (rejeita 0,0 e o que sai da
     faixa) — a mesma que a parada avulsa usa pra aceitar coordenada digitada.
     LEI: trocar um filtro por outro "mais rigoroso" exige perguntar o que o
     antigo barrava DE GRAÇA. `truthy` barrava o zero; `isFinite` não. */
  function paradasDoMapa() {
    if (!rotaMontada()) return [];
    return ((typeof PARADAS !== 'undefined' ? PARADAS : []) || [])
      .filter((p) => p && pontoOk(p.lat, p.lng));
  }

  /** os pinos numerados: só se refaz quando a LISTA muda, não a cada repinte */
  function sincronizarPinos(casa) {
    const paradas = paradasDoMapa();
    const chave = paradas.map((p) => `${p.n}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
    if (chave === casa.chave) return;
    casa.chave = chave;
    casa.pinos.forEach((m) => { try { m.remove(); } catch (_) { /* já saiu */ } });
    casa.pinos.clear();
    paradas.forEach((p) => {
      const pino = document.createElement('div');
      pino.textContent = String(p.n);
      pino.style.cssText = 'width:26px;height:26px;border-radius:50%;display:grid;place-items:center;'
        + 'font:500 12px Inter,sans-serif;background:var(--map-pino);color:var(--map-pino-tinta);'
        + 'border:1.5px solid var(--map-rota)';
      casa.pinos.set(String(p.n), new casa.gl.Marker({ element: pino })
        .setLngLat([p.lng, p.lat]).addTo(casa.mapa));
    });
    pinosVisiveis(casa);
    // rota OUTRA = enquadramento outro. Aqui dentro é o único lugar automático
    // que reenquadra, e de propósito: este bloco só roda quando a lista muda.
    enquadrarGeral(casa);
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
    if (eu && pontoOk(eu.lat, eu.lng)) pontos.push([eu.lng, eu.lat]);
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
  function moverEuNoPlano() {
    const casa = GARAGEM.get('geral');
    const eu = ultimaPos || ultimoFix;
    if (!casa || !eu || !Number.isFinite(eu.lat) || !Number.isFinite(eu.lng)) return;
    if (!casa.eu) {
      try {
        casa.eu = new casa.gl.Marker({ color: '#3d8bff' })
          .setLngLat([eu.lng, eu.lat]).addTo(casa.mapa);
      } catch (_) { casa.eu = null; return; }
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
               .mapa-palco>svg          → o mapa DESENHADO, opacidade 1
               .mapa-palco .mapa-vivo   → o mapa DE VERDADE, opacidade 0
               .mapa-palco.pronto ...   → o contrário, com transição de .3 s
           O `resize()` logo abaixo lê `clientHeight` — e ler tamanho OBRIGA o
           navegador a calcular o estilo ali, com o palco ainda sem `pronto`.
           O estilo intermediário fica CARIMBADO: o mapa de mentira em cima, o
           de verdade apagado. Quando a classe entrava depois, as duas
           transições rodavam e a tela fazia um dissolve de 300 ms do mapa
           desenhado pro mapa real. Uma vez por repinte, e o repinte era por
           SEGUNDO — é isso que o dono via como "a imagem está piscando".
           Pondo a classe primeiro, o primeiro cálculo de estilo do palco já
           nasce com o valor final: transição não roda em estilo inicial. */
        palco.classList.add('pronto');
        palco.appendChild(casa.alvo);              // 🔴 O TRANSPLANTE
        try { casa.mapa.resize(); } catch (_) { /* mapa morto */ }
      }
      palco.__hbxMapa = true;
      palco.__hbxMapaObj = casa.mapa;
      palco.classList.add('pronto');
      acertarLuz(casa);
      sincronizarPinos(casa);
      if (nome === 'gps') { desenharTraco(casa.mapa); cameraDaNavegacao(); return; }
      // 🔴 O TRANSPLANTE NÃO MEXE NA CÂMERA, e é assim que fica: voltar pra aba
      // Rota devolve o mapa exatamente onde ele estava. Só o traço e a seta se
      // acertam — os dois são DADO, e dado velho na tela principal é mentira.
      desenharTraco(casa.mapa);
      moverEuNoPlano();
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
    palco.__hbxMapa = true;
    palco.__hbxMapaObj = mapa;

    mapa.on('load', () => {
      palco.classList.add('pronto');             // o desenho de espera se apaga
      sincronizarPinos(nova);
      // 🔴 A SETA É UMA SÓ. No palco "gps" quem mostra o motorista é o puck do
      // desenho, parado a 68% da tela — um marcador do maplibre no mesmo lugar
      // seria a segunda seta, e o V4 promete uma. No mapa "geral" (a rota
      // inteira, sem puck) o marcador é justamente o que diz onde ele está.
      if (nome === 'gps') { desenharTraco(mapa); cameraDaNavegacao(); return; }
      // 🔴 O PALCO "geral" É A TELA PRINCIPAL DA ROTA desde 08/08, e ele nascia
      // com pino e mais nada: sem traço (o caminho existia e ninguém desenhava)
      // e no zoom de nascimento, com o resto do dia fora da tela. As três peças
      // do que a tela promete entram juntas aqui.
      desenharTraco(mapa);
      moverEuNoPlano();
      enquadrarGeral(nova);
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
    const acompanharCamera = () => {
      posicionarEmpresas();
      pinosVisiveis(nova);
      if (camFase === 'solta') sincronizarPuckSolto(true);
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

  /* 🔴 A RÉGUA DO MOCK ROTA (§2.3 do plano, correção do dono): a empresa vale
     À FRENTE do veículo; "depois que passou já era" — o motorista não pode
     ser avisado de algo que ficou pra trás. Passou é PRA SEMPRE no dia (Set
     por identidade). Rumo só existe em movimento (`rumoConfiavel`, ≥9 km/h):
     sem rumo NADA muda — parado ou a pé, a tela continua mostrando tudo. */
  const empresasPassadas = new Set();
  const EMP_PASSOU_M = 40;      // atrás disso, apaga o convite (v4: despede 40-90 m)
  const EMP_SOME_M = 250;       // bem pra trás, sai da tela (v4: some 150-320 m)
  function reguaDaFrente(el, lat, lng) {
    const chave = el.dataset.empresa || `${lat},${lng}`;
    if (empresasPassadas.has(chave)) {
      el.classList.add('passou');
      return;
    }
    const fix = ultimoFix;
    const rumo = rumoConfiavel(fix);
    if (rumo == null || !fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return;
    // equiretangular basta nesta escala (corredor de 150 m)
    const kx = 111320 * Math.cos((fix.lat * Math.PI) / 180);
    const dx = (lng - fix.lng) * kx;
    const dy = (lat - fix.lat) * 110540;
    const dist = Math.hypot(dx, dy);
    if (dist < EMP_PASSOU_M) return;                    // do lado: ainda é agora
    const aoAlvo = (Math.atan2(dx, dy) * 180) / Math.PI; // 0° = norte, como o rumo
    let dif = Math.abs(aoAlvo - rumo) % 360;
    if (dif > 180) dif = 360 - dif;
    if (dif <= 100) return;                             // à frente (com folga de esquina)
    empresasPassadas.add(chave);
    el.classList.add('passou');
    if (dist > EMP_SOME_M) el.classList.remove('no-ar');
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
    let zoom;
    try { zoom = mapa.getZoom(); } catch (_) { return; }
    if (!Number.isFinite(zoom)) return;
    // LER ANTES DE ESCREVER: a medida do chip é a única leitura de layout daqui,
    // e ela vem toda de uma vez, antes da primeira escrita. Intercalar leitura e
    // escrita nesta função é reflow síncrono a cada quadro do mapa.
    alvos.forEach(larguraDoRotulo);
    const porZoom = Math.pow(2, zoom - EMP_ZOOM_BASE);
    const postos = [];
    alvos.forEach((el) => {
      const lat = Number(el.dataset.lat); const lng = Number(el.dataset.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      let ponto;
      try { ponto = mapa.project([lng, lat]); } catch (_) { return; }
      const dist = Number(el.dataset.dist) || 0;
      const perto = 1 - 0.35 * Math.min(1, dist / EMP_DIST_CHEIA);
      const esc = Math.min(EMP_ESC_TETO, Math.max(EMP_ESC_PISO, porZoom * perto));
      el.style.setProperty('--x', `${ponto.x.toFixed(1)}px`);
      el.style.setProperty('--y', `${ponto.y.toFixed(1)}px`);
      el.style.setProperty('--esc', esc.toFixed(3));
      reguaDaFrente(el, lat, lng);
      postos.push({ el, x: ponto.x, y: ponto.y, esc });
    });
    deconflitarRotulos(postos, cena.clientWidth || 0);
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
    return (typeof c.lat === 'number' && typeof c.lng === 'number') ? { lat: c.lat, lng: c.lng } : null;
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
  const NAV_ZOOM = 16.6;
  /* 51°, o número do V4 (`para={tilt:51,…}`) — era 55 aqui por chute. */
  const NAV_PITCH = 51;
  /* 🔴 86% — "o ponteiro tem q ficar COLADO NO BOTTOM, igual gps comum"
     (correção nº2 do V4, repetida pelo dono em 09/08). Foi 68%, virou 78% na
     primeira passada e agora é o número do mock. Este é o valor MESTRE: o
     `top` do `.gps-puck` no mock e o `NAV_PUCK` daqui saem os dois dele. */
  const NAV_ANCORA = 0.86;
  /* o recuo da câmera até o puck: ela desce o centro até ele, senão o motorista
     dirige com a seta no meio da tela e metade do mapa mostrando a rua que já
     passou. Sai do `NAV_ANCORA` em vez de ser digitado — o número existe em UM
     lugar só, e o `top` do `.gps-puck` no mock é o mesmo. Escrever os dois à
     mão foi o que deixou a câmera mirando um palmo acima da seta. */
  const NAV_PUCK = NAV_ANCORA - 0.5;

  const mapaDaNavegacao = () => {
    const palco = naCamada('[data-mapa="gps"]');
    return (palco && palco.__hbxMapaObj) || null;
  };
  const tinta = (nome, padrao) => {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;
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
  function presoNaRota(fix) {
    const geo = navRota && navRota.geometria;
    const c = geo && geo.coordinates;
    if (!fix || !Number.isFinite(fix.lat) || !c || c.length < 2) return null;
    const kx = 111320 * Math.cos((fix.lat * Math.PI) / 180);
    const ky = 110540;
    const px = fix.lng * kx; const py = fix.lat * ky;
    let melhor = null;
    for (let i = 0; i < c.length - 1; i += 1) {
      const ax = c[i][0] * kx; const ay = c[i][1] * ky;
      const dx = (c[i + 1][0] * kx) - ax; const dy = (c[i + 1][1] * ky) - ay;
      const den = (dx * dx) + (dy * dy);
      let t = den > 0 ? ((((px - ax) * dx) + ((py - ay) * dy)) / den) : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const qx = ax + (t * dx); const qy = ay + (t * dy);
      const d = Math.hypot(px - qx, py - qy);
      if (!melhor || d < melhor.d) melhor = { d, i, lat: qy / ky, lng: qx / kx };
    }
    return (melhor && melhor.d <= SNAP_MAX_M) ? melhor : null;
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
        paint: { 'line-color': tinta('--map-rota-borda', '#4f8f14'), 'line-width': 11 },
      });
      mapa.addLayer({
        id: `${TRACO}-fita`,
        type: 'line',
        source: TRACO,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': tinta('--map-rota', '#78c900'), 'line-width': 7 },
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
  const DESCIDA_MS = 2400;
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
  const GERAL_MS = 2200;
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

  /** o encaixe do puck é o mesmo nas três fases — por isso mora sozinho aqui */
  const recuoDoPuck = (mapa) => {
    const alto = (mapa.getContainer && mapa.getContainer().clientHeight) || 0;
    return [0, alto ? alto * NAV_PUCK : 0];
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
        const pxAcima = Math.max(80, alt * NAV_ANCORA - GERAL_MARGEM_TOPO);
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
    try { mapa.jumpTo(passo); } catch (_) { /* mapa saindo de cena */ }
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
    if (vigiaCena) { clearInterval(vigiaCena); vigiaCena = null; }
    if (geralTimer) { clearTimeout(geralTimer); geralTimer = null; }
    camFase = 'cima';
    poseGeral = null;
    vistaGeral();
    const desistirEm = Date.now() + 3000;
    vigiaCena = setInterval(() => {
      if (camFase !== 'cima' || telaAtual() !== 'mapa') {
        clearInterval(vigiaCena); vigiaCena = null;
        if (telaAtual() !== 'mapa') camFase = 'dirigindo';
        return;
      }
      if (emCena() && Date.now() < desistirEm) return;
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
     🔴 A SETA PREGADA NO VIDRO. Seguindo, o puck é DESENHO parado a 78% da
     tela e quem gira é o mundo — é o certo, é o que o V4 promete e é uma seta
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
    try { mapa.easeTo(passo); } catch (_) { /* mapa saindo de cena */ }
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
      pedirRota(); cameraDaNavegacao();
      // a voz mora AQUI, no fix — não no repinte: quem entra na tela não pode
      // levar um "vire à direita" na cara só por ter aberto o mapa.
      vozDaManobra(manobraDaVez());
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
    /* 🔴 O 1º FIX QUASE SEMPRE CHEGA DEPOIS DA LISTA — numa garagem, bem
       depois. A montagem abre, busca o dia e pinta antes de existir GPS: se
       ninguém voltasse aqui, a tela ficaria na ordem do banco justamente na
       primeira vez que o motorista a abre no dia. Reencadeia com o que já está
       na memória (nada de rede) e só UMA vez — `previaComGps` fecha a porta;
       repintar a cada fix seria a lista tremendo debaixo do dedo dele. */
    if (!previaComGps && telaAtual() === 'montagem') publicarPrevia();
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
    // Fora da navegação a permissão não é cobrada: diálogo de localização na
    // cara de quem abriu o app pra ver o chat é pedido fora de hora.
    if (naNavegacao()) garantirGps();
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
    avisarSemGps();
  };

  armarGps();

  /* A BUSCA É DE TECLA, NÃO DE CLIQUE — por isso não cabe no mapa de ações.
     Espera o dedo parar (350ms) antes de ir ao servidor: mandar a cada letra
     enfileira 8 requisições pra digitar "Larissa" e a última nem sempre é a
     que chega por último. O guard `__hbxBusca` é obrigatório: cada repinte
     traz um input NOVO, e sem ele o listener empilhava a cada tecla. */
  let buscaTimer = null;
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
      const r = irDoMock.apply(this, arguments);
      if (tela === 'clientes') carregarClientes();
      if (tela === 'produtos') carregarProdutos();
      // A parada avulsa NASCE EM BRANCO, sempre — mesma lei do cadastro: campo
      // que guarda o endereço da vez passada é a receita de adicionar duas
      // vezes a mesma porta.
      if (tela === 'rapida') rapidaEmBranco(veioDe);
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
        garantirGps(); publicarMontarDias(); carregarDiasComCliente(); carregarEspacos(); encherMontagem();
        /* 🔴 O OTIMIZADOR RODA NO CARREGAMENTO (dono, 08/08: "é pra funcionar
           já no carregamento, ao apertar Montar Rota, só isso"). Chegar aqui É
           mandar montar — o 2º "Montar rota" no pé da tela não existe mais.
           Rota JÁ RODANDO fica de fora: re-planejar no meio do dia embaralharia
           a sequência de quem está na rua só porque ele abriu a tela. */
        if (pularMontarAoAbrir) pularMontarAoAbrir = false;
        else if (estadoRota !== 'rodando' && estadoRota !== 'pausada') montarRota();
      }
      /* 🔴 A TELA PRINCIPAL DA ROTA É UM MAPA, E MAPA SEM "ONDE EU ESTOU" NÃO É
         MAPA (dono, 08/08: *"não mostra minha localização tbm"*). O watch do
         GPS só era armado dentro da NAVEGAÇÃO (`naNavegacao()`), então na aba
         Rota nunca chegava um fix: sem fix não há marcador, e sem marcador o
         `enquadrarGeral` também não tinha o motorista pra pôr na moldura. O
         "pedir fora de hora" que este arquivo evita é pedir no boot ou na tela
         de chat — numa tela que É um mapa, a localização é o assunto. Mesma
         régua do "Navegar" e da Montagem: cobra-se onde serve. */
      /* 🔴 ...E O CAMINHO ENTRE OS PINOS. Entrar aqui TIRA O BILHETE do traço
         (§ tracoDoPlano): um pedido, na mesma porta com os mesmos freios, pra
         a tela principal não mostrar mais ponto solto. Se o GPS ainda não deu
         fix, o bilhete espera o primeiro — não há relógio nenhum atrás disto. */
      if (tela === 'rota') { garantirGps(); planoQuerTraco = true; tracoDoPlano(); }
      if (tela === 'chat') aoAbrirChat();
      // Cadastro NASCE EM BRANCO, sempre. Formulário que guarda o cliente
      // anterior é a receita de cadastrar duas vezes a mesma pessoa — e aqui
      // ninguém apaga campo por campo com o motor ligado.
      if (tela === 'novocliente') novoEmBranco();
      if (tela === 'ajustes') carregarAjustes();
      if (tela === 'consumo') carregarConsumo();
      if (tela === 'salvas') carregarSalvas();
      if (tela === 'recarga') carregarRecarga();
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
        // 🔴 ENTRAR NA NAVEGAÇÃO É DESCER (§7d-bis). A câmera é posta em pé por
        // baixo da cena da cobra e desce 2,4 s depois que o véu abre — é o
        // movimento do V4. Voltar pra cá com o mapa já na garagem passa pelo
        // mesmo caminho: ele está estacionado deitado, em 3D, e sem endireitar
        // antes a tela abriria já dirigindo, sem descida nenhuma.
        if (tela === 'mapa') { pedirRota(); entrarNaDescida(); }
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
      telaVistaAqui = telaAtual();
      if (telaVistaAqui === 'mapa') entrarNaDescida(); else pararDescida();
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
    const n = chave === 's2' ? 2 : 1;
    const passo = (i, t, s) => `<div class="pt-passo"><b>${i}</b><span><strong>${t}</strong>${s}</span></div>`;
    window.portao({
      tom: 'info', ico: 'save', titulo: `Espaço ${n} — ainda vazio`,
      sub: `Cada dia da semana guarda 2 rotas suas, com o nome que você escolher.`,
      corpo: `${passo(1, 'Deixe a lista na ordem que você dirige', 'arraste as paradas pelo punho')}
        ${passo(2, 'Salve neste espaço', 'com um nome curto: Manhã, Centro, Bairro…')}
        ${passo(3, `Na próxima ${ROTULO_DIA[diaDosEspacos()] || 'vez'}`, 'um toque no botão e a ordem volta')}`,
      acoes: [['Agora não', ''], ['Salvar aqui', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (botao) botao.addEventListener('click', () => pedirNome(n - 1), { once: true });
  }

  /* O nome é DIGITADO (o botão do seletor mostra o que ele escreveu) e tem teto
     de 10: cada posição leva 1/3 da largura da tela, e nome que não cabe vira
     reticência — o motorista deixaria de distinguir os dois espaços. */
  function pedirNome(idx) {
    if (typeof window.portao !== 'function') return;
    if (!paradasParaSalvar().length) return avisoErro(new Error('Esta rota não tem parada para salvar.'));
    const espaco = ESPACOS[idx];
    const dia = diaDosEspacos();
    window.portao({
      tom: 'info', ico: 'save',
      titulo: espaco ? 'Regravar este espaço?' : `Salvar no Espaço ${idx + 1}`,
      sub: espaco
        ? `"${esc(espaco.nome)}" perde a ordem antiga e fica com a que está na tela.`
        : 'O nome curto é o que vai aparecer no botão.',
      corpo: `<div class="campo"><label>Nome</label><input data-campo="nome-espaco" type="text"
        maxlength="${NOME_MAX}" autocomplete="off" placeholder="Manhã" value="${esc(nomeCurto(espaco && espaco.nome))}"></div>`,
      acoes: [['Agora não', ''], [espaco ? 'Regravar' : 'Salvar', 'principal']], classe: 'duas',
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
      comTrava(() => salvarNoEspaco(idx, nome));
    }, { once: true });
  }

  /** grava a ordem da tela no espaço: POST se está vago, PATCH se já tem rota */
  async function salvarNoEspaco(idx, nome) {
    const paradas = paradasParaSalvar();
    if (!paradas.length) return avisoErro(new Error('Esta rota não tem parada para salvar.'));
    const dia = diaDosEspacos();
    const espaco = ESPACOS[idx];
    try {
      if (espaco) {
        await window.API.patch(`/logistica/rota-modelos/${encodeURIComponent(espaco.id)}`, { nome, diaSemana: dia, paradas });
      } else {
        await window.API.post('/logistica/rota-modelos', { nome, diaSemana: dia, paradas });
      }
    } catch (e) { return avisoErro(e); }
    await carregarEspacos();
    // Salvou o que estava vendo ⇒ é ESTE espaço que passa a valer, e o ponto de
    // "editado" apaga: a ordem da tela e a gravada voltaram a ser a mesma.
    modoSel = `s${idx + 1}`;
    previaDoDedo = false;
    publicarModos();
    // A lista de Rotas salvas fica fresca na hora: o dono vai OLHAR lá pra
    // conferir que "ficou salvo" — e lista velha diria que não ficou.
    await carregarSalvas();
    window.portao({
      tom: 'ok', ico: 'check', titulo: 'Rota salva',
      sub: `${esc(nome)} é o Espaço ${idx + 1} de ${ROTULO_DIA[dia] || 'hoje'}.`,
      acoes: [['Fechar', 'principal']],
    });
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
    if (modoSel === 's1' || modoSel === 's2') return pedirNome(modoSel === 's1' ? 0 : 1);
    const rotulo = (i) => (ESPACOS[i] ? `Espaço ${i + 1}: ${esc(ESPACOS[i].nome)}` : `Espaço ${i + 1} (vazio)`);
    window.portao({
      tom: 'info', ico: 'save', titulo: 'Salvar em qual espaço?',
      sub: `${ROTULO_DIA[diaDosEspacos()] || 'Este dia'} guarda 2 rotas. Espaço com rota dentro é regravado.`,
      acoes: [[rotulo(0), 'principal'], [rotulo(1), 'azul'], ['Agora não', '']],
    });
    const um = naCamada('.portao-wrap .principal');
    const dois = naCamada('.portao-wrap .azul');
    if (um) um.addEventListener('click', () => pedirNome(0), { once: true });
    if (dois) dois.addEventListener('click', () => pedirNome(1), { once: true });
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
    });
    if (cred) encherRecarga(cred);
  }

  /* 🔴 A RECARGA CARREGA SOZINHA. Ela só era preenchida de carona no
     `carregarAjustes`: quem abrisse a Recarga direto (o atalho `ir-recarga`, ou
     o caminho vindo do crédito baixo) via o catálogo do DESENHO — preço, selo
     de desconto e o botão de pagar. Tela de dinheiro não pode depender de por
     onde o motorista entrou. */
  async function carregarRecarga() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    let cred;
    try { cred = await window.API.get('/credits/me'); } catch (_) { return fonteCaiu('recarga'); }
    if (!cred) return fonteCaiu('recarga');
    encherRecarga(cred);
  }

  /** os pacotes vêm no MESMO `/credits/me` do saldo — não há porta separada */
  let pacoteEscolhido = null;
  function encherRecarga(cred) {
    const packs = Array.isArray(cred && cred.packs) ? cred.packs : [];
    const saldo = typeof cred.balance === 'number' ? cred.balance : null;
    if (!pacoteEscolhido) {
      const rec = packs.find((p) => p.recommended) || packs[0];
      pacoteEscolhido = rec ? rec.key : null;
    }
    const atual = packs.find((p) => p.key === pacoteEscolhido) || null;
    window.usarDados('recarga', {
      ...fonteVoltou,
      saldo: saldo != null ? String(saldo) : '',
      // "~17 dias no seu ritmo" precisaria do consumo médio — não tenho essa
      // conta em porta nenhuma, e chutar dias em tela de crédito é mentira.
      ritmo: '',
      pacotes: packs.map((p) => [
        // crédito é NÚMERO INTEIRO; só o PREÇO do pacote é dinheiro.
        String(p.credits),
        Number(p.price).toFixed(2).replace('.', ','),
        esc(p.badge),
        p.key === pacoteEscolhido ? 1 : 0,
        esc(p.key),
      ]),
      cta: atual ? `Recarregar ${atual.credits} créditos · ${dinheiro(Number(atual.price))}` : '',
    });
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

  async function carregarConsumo() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    let e;
    try { e = await window.API.get('/logistica/creditos/extrato'); } catch (_) { return fonteCaiu('consumo'); }
    if (!e || typeof e !== 'object') return fonteCaiu('consumo');
    const uso = e.usage || {};
    const tot = e.totals || {};
    const linhas = [];
    (Array.isArray(e.trackedDeliveries) ? e.trackedDeliveries : []).forEach((d) => {
      linhas.push(['menos', esc(d.titulo || 'Entrega rastreada'), esc(d.quando || ''), String(d.creditos || 0)]);
    });
    (Array.isArray(e.bonuses) ? e.bonuses : []).forEach((b) => {
      linhas.push(['mais', esc(b.titulo || 'Bônus'), esc(b.quando || ''), String(b.creditos || 0)]);
    });
    window.usarDados('consumo', {
      ...fonteVoltou,
      // Crédito é NÚMERO INTEIRO, nunca moeda — e zero some, como todo recorte.
      saldo: seTiver(e.balanceCredits),
      gastosHoje: seTiver(uso.hoje),
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
      conversa: recados.map((r) => [
        r.origem === 'motorista' ? 'minha' : 'deles',
        esc(r.texto),
        horaCurta(r.criadoEm),
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
      const alvo = portaoRecados[0];
      if (alvo) corpo.recadoId = alvo.id;
      try { await window.API.post('/logistica/recados/responder', corpo); }
      catch (e) { return avisoErro(e); }
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
  const CAMPOS_FICHA = ['nome', 'telefone', 'cpf', 'cep', 'rua', 'numero', 'bairro', 'observacoes'];
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
  }
  /** valor a mostrar: o que ele digitou, senão o que o servidor mandou */
  const valorFicha = (nome, doServidor) => {
    const r = ficha && ficha.rascunho;
    return r && r[nome] !== undefined ? esc(r[nome]) : esc(doServidor);
  };

  function encherFicha() {
    if (!ficha) return;
    const it = ficha.item || {};
    const d = ficha.detalhe || {};
    const loc = ficha.local || {};
    const pend = Array.isArray(it.pendencias) ? it.pendencias : [];
    const entregas = Number(it.entregasCount) || 0;
    const dias = ficha.dias || [];
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
        return ['box', esc(p.nome), `${Number(v.qtdPadrao) || 0} por entrega${valor}`];
      }),
    });
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

  const novoEmBranco = () => {
    novoLocal = null;
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
      // torna o cadastro na rua possível.
      cep: rascunho.cep || esc(s.cep || ''),
      local: ok
        ? `Local marcado aqui${Number.isFinite(precisao) ? ` (${Math.round(precisao)} m)` : ''}.`
        : `Local marcado, mas fraco${Number.isFinite(precisao) ? ` (${Math.round(precisao)} m)` : ''} — chegue mais perto da porta e toque de novo.`,
      localOk: ok ? 1 : 0,
    });
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
  const pontoOk = (lat, lng) => {
    const a = Number(lat); const b = Number(lng);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180
      && !(a === 0 && b === 0);
  };
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
    };
    if (typeof window.usarDados !== 'function') return;
    window.usarDados('rapida', {
      volta, busca: '', buscando: 0, salvando: 0, opcoes: [], achado: null,
      aviso: '', modo: 'direcao', soDirecao: 0, nome: '', pedeNome: 0,
      temRota: paradasAbertas().length ? 1 : 0, posicao: 'perto',
    });
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
        dist: pontoOk(o.lat, o.lng) && ultimaPos
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
        if (lido && pontoOk(lido.lat, lido.lng)) {
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
        if (res && pontoOk(res.lat, res.lng)) {
          r.origem = 'cep'; r.cep = cn.cep; r.numero = ''; r.resolvido = res;
          r.aviso = 'Sem número: o ponto é o da rua. Confira antes de adicionar.';
        } else if (res && (res.endereco || res.cidade)) {
          r.aviso = `${res.endereco || 'Esta rua'} — não achei o ponto exato. Informe o número, se houver.`;
        } else {
          r.aviso = 'Não encontrei este CEP. Confira, ou escreva o endereço.';
        }
      } else {
        // Endereço escrito: o servidor devolve candidatas e QUEM ESCOLHE É ELE.
        const perto = ultimaPos && pontoOk(ultimaPos.lat, ultimaPos.lng)
          ? `&lat=${encodeURIComponent(ultimaPos.lat)}&lng=${encodeURIComponent(ultimaPos.lng)}` : '';
        const payload = await window.API.get(`/logistica/geo/busca?q=${encodeURIComponent(texto)}${perto}`);
        const itens = (payload && Array.isArray(payload.items) ? payload.items : [])
          .filter((it) => pontoOk(it.lat, it.lng)).slice(0, 4);
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
      return pontoOk(c.lat, c.lng) ? { lat: Number(c.lat), lng: Number(c.lng) } : null;
    };
    const pNovo = pontoDe(novo);
    let indice = ids.length;
    if (posicao === 'primeira') indice = 0;
    else if (pNovo && base.length) {
      const pOrigem = ultimaPos && pontoOk(ultimaPos.lat, ultimaPos.lng)
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
    }
    const ordem = [...ids.slice(0, indice), String(novoId), ...ids.slice(indice)];
    await window.API.post('/logistica/rota/planejar', {
      date: hojeISO(), deliveryIds: ordem, ordemManual: ordem, ...origemGps(),
    });
    const anterior = indice > 0 ? base[indice - 1] : null;
    const nomeAnterior = anterior && anterior.item && anterior.item.cliente && anterior.item.cliente.nome;
    return { aplicado: true, anterior: nomeAnterior || null };
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
        if (r.origem !== 'cep' && pontoOk(res.lat, res.lng)) {
          corpo.lat = Number(res.lat); corpo.lng = Number(res.lng);
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
      // A escolha dele já está gravada: a Montagem que vem a seguir não
      // reotimiza por cima (ver `pularMontarAoAbrir`).
      pularMontarAoAbrir = encaixe.aplicado;
      await carregarRota();
      await voltarDaAvulsa(volta);
      window.portao({
        tom: 'ok', ico: 'check', titulo: 'Parada adicionada',
        sub: !encaixe.aplicado ? 'Ela entrou na rota de hoje.'
          : encaixe.anterior ? `Entra depois de ${encaixe.anterior}.`
            : 'Entra como primeira parada.',
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
      // Sem isto a Montagem tentaria planejar de novo e o erro genérico dela
      // apagaria o aviso abaixo — que é a única frase que diz que a parada existe.
      pularMontarAoAbrir = true;
      await voltarDaAvulsa(volta);
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'A parada entrou',
        sub: 'Mas não consegui reordenar a rota agora. Toque em "Montar rota" pra ela achar o lugar dela.',
        acoes: [['Fechar', 'principal', true]],
      });
    }
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

      const mudouEndereco = cep !== String(loc.cep || '')
        || rua !== String(loc.endereco || '')
        || numero !== String(loc.numero == null ? '' : loc.numero)
        || bairro !== String(loc.bairro || '');

      const diasAgora = [1, 2, 3, 4, 5, 6, 7].filter((n) => (ficha.dias || []).indexOf(n) >= 0);
      const diasAntes = (it.diasEntrega || []).slice().sort().join(',');
      const mudouDias = diasAgora.slice().sort().join(',') !== diasAntes;

      if (!Object.keys(conta).length && !mudouEndereco && !mudouDias) {
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
          await window.API.patch(`/nucleo/locais/${encodeURIComponent(loc.id)}`, {
            endereco: rua, numero, bairro, cep,
            cidade: loc.cidade || '', uf: loc.uf || '',
            // 🔴 O PINO MORRE COM O ENDEREÇO VELHO. Ver o bloco no topo.
            lat: null, lng: null,
          });
        }
        if (mudouDias) {
          await window.API.patch(`/logistica/clientes/${encodeURIComponent(ficha.id)}/dias`, { dias: diasAgora });
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

  /** Fechar o dia: registra o dia de hoje e salva nas Rotas salvas. */
  async function fecharDia() {
    if (typeof window.portao !== 'function') return;
    const dia = diaDaSemana();
    window.portao({
      tom: 'info', ico: 'lock', titulo: 'Fechar o dia?',
      sub: `Registrar como ${DIAS_SEMANA[dia]}`,
      acoes: [['Agora não', ''], ['Fechar o dia', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      try { await window.API.post('/logistica/fechamento/finalizar', { dia }); }
      catch (e) { return avisoErro(e); }
      await carregarRota();
      window.ir('fechamento');
    }), { once: true });
  }

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
    return agora;
  }

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

  /** repinta a folha aberta (o seam é a única fonte da marcação selecionada) */
  function repintarFolha() {
    if (!aberta) return;
    const simples = !financeiroAtivo || cobrancaSimples;
    if (simples) encherVenda(aberta.item, aberta.n);
    else encherFolha(aberta.item, aberta.n);
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
      // O GPS da confirmação é o que realimenta o cadastro do cliente — vai
      // quando existe, e a falta dele NUNCA barra a entrega.
      if (ultimaPos) { corpo.lat = ultimaPos.lat; corpo.lng = ultimaPos.lng; }
      try {
        await window.API.post(`/logistica/entregas/${encodeURIComponent(aberta.id)}/confirmar`, corpo);
      } catch (e) { return avisoErro(e); }
      window.HBX.cache.remove(chave);
      window.HBX.cache.remove(`chegada:${aberta.id}`);
      aberta = null; forma = '';
      await carregarRota();
      window.ir('rota');
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
      window.ir('rota');
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
    // rota rodando: o botão do meio leva pra navegação (é o que se faz andando)
    navegar: () => window.ir('mapa'),
    'salvar-rota': salvarRota,
    'iniciar-rota': iniciarRota,
    iniciar: iniciarRota,
    'cancelar-rota': cancelarRota,
    'entregue-pagou': () => confirmarEntrega(''),
    'entregue-marcou': () => confirmarEntrega('fiado'),
    'confirmar-venda': () => confirmarEntrega(''),
    'registrar-nao-entregue': registrarNaoEntregue,
    'fechar-dia': fecharDia,
    'salvar-cliente': salvarCliente,
    'excluir-cliente': excluirCliente,
    'salvar-produto': salvarProduto,
    // o "+" do cabeçalho: cadastrar cliente na porta
    'usar-meu-local': usarMeuLocal,
    'salvar-novo-cliente': salvarNovoCliente,
    'criar-cliente-assim': () => comTrava(() => criarCliente(null)),
    // o "+" da Montagem e da Rota: a parada avulsa
    'rapida-buscar': () => comTrava(rapidaBuscar),
    'rapida-confirmar': () => comTrava(rapidaConfirmar),
    'entendi-recado': entendiRecado,
    // "Tentar de novo" do aviso de fonte fora do ar: volta pro esqueleto e
    // pede de novo. Sem devolver o esqueleto o toque não teria resposta
    // nenhuma na tela, e o motorista tocaria três vezes achando que travou.
    'recarregar-montagem': () => retentar('montagem', encherMontagem),
    'recarregar-clientes': () => retentar('clientes', carregarClientes),
    'recarregar-produtos': () => retentar('produtos', carregarProdutos),
    'recarregar-salvas': () => retentar('salvas', carregarSalvas),
    'recarregar-chat': () => retentar('chat', carregarRecados),
    'recarregar-consumo': () => retentar('consumo', carregarConsumo),
    'recarregar-ajustes': () => retentar('ajustes', carregarAjustes),
    'recarregar-recarga': () => retentar('recarga', carregarRecarga),
    'recarregar-financeiro': () => retentar('financeiro', carregarFinanceiro),
    'ir-consumo': () => window.ir('consumo'),
    'ir-recarga': () => window.ir('recarga'),
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
    'mapa-enquadrar': () => { enquadrarPlano(); },
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
    if (chave === 'abrir-salva') return abrirSalva(alvo.dataset.salva);
    if (chave === 'abrir-empresa') return acenderEmpresa(alvo.dataset.empresa);
    if (chave === 'pacote') {
      pacoteEscolhido = String(alvo.dataset.pacote || '');
      return carregarAjustes();
    }
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
    if (chave === 'montar-dia') {
      const n = Number(alvo.dataset.dia) || 0;
      // 2º toque no mesmo chip volta pra Hoje — chip que só liga prende o
      // motorista num dia (mesma régua do chip de dia dos Clientes).
      montarDia = montarDia === n ? 0 : n;
      // o chip acende JÁ (resposta ao dedo); a lista do dia chega em seguida
      window.usarDados('montagem', { diaSel: montarDia });
      // Os 2 espaços são DO DIA: trocar de chip troca a fileira inteira, senão
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
    if (fn) fn();
  });
})();
