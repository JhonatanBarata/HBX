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

