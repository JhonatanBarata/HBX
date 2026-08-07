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
  const POR_CIMA = ['.erro-wrap', '.conf-wrap', '.portao-wrap', '.sheet-wrap', '.modal-wrap', '.aviso'];
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
        const escapes = peca.querySelectorAll('[data-escape], [data-fechar]:not(.principal):not(.azul)');
        const eEnfeite = sel === '.aviso';   // aviso passa sozinho; não é decisão
        if (!escapes.length && !eEnfeite) return true;
        // o mock sabe fechar com a animação certa; sem ele, some direto.
        if (typeof window.fechar === 'function' && peca.firstElementChild) window.fechar(peca);
        else peca.remove();
        return true;
      }
    }
    const tela = telaAtual();
    if (tela && tela !== 'rota' && typeof window.ir === 'function') {
      window.ir('rota');
      return true;
    }
    return false;   // na Rota, Voltar sai do app (o Kotlin pede a confirmação)
  };

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
  const chamar = (metodo, caminho, corpo) => {
    if (!temPonte()) return Promise.reject(new Error('Abra esta tela pelo HBX Logística.'));
    return window.HBX.api(caminho, { method: metodo, body: corpo }).catch((e) => {
      throw new Error(humano(e));
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
  const distancia = (m, s) => {
    if (!(m > 0)) return '';
    const km = m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`;
    const min = s > 0 ? ` · ${Math.max(1, Math.round(s / 60))} min` : '';
    return km + min;
  };

  /** estado da rota, no vocabulário do transmux do mock */
  function estadoDaRota(r) {
    const s = String(r.routeStatus || '').toLowerCase();
    if (s === 'em_rota' || s === 'iniciada' || s === 'running') return 'rodando';
    if (s === 'pausada' || s === 'paused') return 'pausada';
    if (r.routeId) return 'pronta';
    return 'montar';
  }

  /** uma parada do servidor → uma linha do mock */
  function traduzirParada(item, i, anterior) {
    const c = item.cliente || {};
    const entregue = String(item.status || '') === 'entregue';
    const tags = [];
    if (item.quantidade > 0) tags.push([`${item.quantidade}x`, 'blue']);
    const pill = entregue
      ? ['Entregue', 'lime', 'check']
      : (item.status === 'em_rota' ? ['A caminho', 'blue', 'nav'] : ['Pendente', 'mute', 'clock']);
    return {
      // 🔴 O NÚMERO DA TELA É A ORDEM DA VISITA, e gente conta do 1. O servidor
      // grava `rotaOrdem` começando em ZERO — usar o campo cru punha "0, 1, 2"
      // na frente do motorista (visto no g15). A ordem do servidor decide a
      // SEQUÊNCIA; o número que aparece é a posição na fila.
      n: i + 1,
      hora: hora(item.etaAt || item.scheduledAt),
      cor: entregue ? 'lime' : undefined,
      nome: c.nome || '',
      rua: c.endereco || '',
      bairro: c.cidade || '',
      nota: c.observacoes || undefined,
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

  async function carregarRota() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    let r;
    try { r = await window.API.get('/logistica/rota'); } catch (_) { return; }

    // Crédito e caixa do dia vêm de OUTRAS portas — pedidos em paralelo, e
    // cada um que falhar deixa o SEU campo vazio, sem derrubar a tela.
    const hoje = new Date();
    const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const [creditoR, caixaR] = await Promise.allSettled([
      window.API.get('/credits/me'),
      window.API.get(`/logistica/caderneta/resumo?data=${dia}`),
    ]);
    const credito = creditoR.status === 'fulfilled' ? creditoR.value : null;
    const caixa = caixaR.status === 'fulfilled' ? caixaR.value : null;
    const formas = (caixa && caixa.fechamento && caixa.fechamento.formas) || null;
    const itens = Array.isArray(r.items) ? r.items : [];
    const paradas = itens.map((it, i) => traduzirParada(it, i, i > 0));
    const entregues = itens.filter((it) => String(it.status || '') === 'entregue').length;
    const marcado = itens.reduce((s, it) => s + (typeof it.valorHoje === 'number' ? it.valorHoje : 0), 0);
    const temValor = itens.some((it) => typeof it.valorHoje === 'number');

    if (typeof window.PARADAS !== 'undefined') window.PARADAS = paradas;
    else try { PARADAS = paradas; } catch (_) { /* seam ausente: nada a fazer */ }
    try { estadoRota = estadoDaRota(r); } catch (_) { /* idem */ }

    window.usarDados('rota', {
      kpiParadas: String(itens.length),
      kpiEntregues: String(entregues),
      kpiEntreguesParado: String(entregues),
      // saldo/dinheiro/pix = o CAIXA do dia (fechamento da caderneta), em
      // centavos na origem. Fonte fora do ar ⇒ campo vazio, nunca número velho.
      saldo: caixa && caixa.fechamento ? centavos(caixa.fechamento.totalCents) : '',
      dinheiro: formas ? centavos(formas.dinheiroCents) : '',
      pix: formas ? centavos(formas.pixCents) : '',
      // crédito é NÚMERO INTEIRO, nunca moeda (lei da casa).
      creditos: credito && typeof credito.balance === 'number' ? String(credito.balance) : '',
      diaFeitas: String(entregues),
      diaTotal: String(itens.length),
      diaPct: itens.length ? `${Math.round((entregues / itens.length) * 100)}%` : '0%',
      diaMarcado: temValor ? dinheiro(marcado) : '',
      filtroFila: String(itens.length - entregues),
      filtroEntregue: String(entregues),
      somaProdutos: String(itens.reduce((s, it) => s + (Number(it.quantidade) || 0), 0)),
      somaMarcado: temValor ? dinheiro(marcado) : '',
    });

    // 🔴 A MONTAGEM SE ENCHE AQUI, não só no toque de "Montar rota". Quem chega
    // nela por outro caminho via a lista do MOCK — João da Silva, R$ 336,00 —
    // com o dado real na tela de trás. Dado de enfeite numa tela de dinheiro é
    // o defeito que esta frente inteira existe pra matar (visto no g15).
    window.usarDados('montagem', {
      somaParadas: String(paradas.length),
      somaProdutos: String(itens.reduce((s, it) => s + (Number(it.quantidade) || 0), 0)),
      somaValor: temValor ? dinheiro(marcado) : '',
      iniciarSub: '',
      linhas: paradas.map((p) => [
        p.n, p.hora, p.nome, p.rua, p.bairro, p.tags.map((t) => t[0]), p.marcado, p.cor || '',
      ]),
    });
  }

  // 1ª carga assim que a casca subiu, e recarga toda vez que a Rota reaparece.
  window.HBXRota = { carregar: carregarRota };
  document.addEventListener('DOMContentLoaded', carregarRota);
  if (document.readyState !== 'loading') setTimeout(carregarRota, 0);

  /* ------------------------------------------------------------------------
     6. L2 — MONTAR → MONTAGEM → INICIAR (DEBITA) → ENCERRAR.
     Regras que valem dinheiro, todas do domínio e nenhuma inventada aqui:
     · quem DEBITA é o Iniciar, e só ele;
     · o número do portão é o MESMO que o servidor vai cobrar (custo-preview),
       nunca uma conta minha na tela;
     · toque repetido não cobra duas vezes (trava de reentrância);
     · Cancelar não perde entrega: as abertas voltam pra agenda (encerrar).
     ------------------------------------------------------------------------ */
  let ocupado = false;
  const comTrava = async (fn) => {
    if (ocupado) return;
    ocupado = true;
    try { await fn(); } finally { ocupado = false; }
  };
  const avisoErro = (e) => {
    const msg = humano(e);
    if (typeof window.portao === 'function') {
      window.portao({ tom: 'trava', ico: 'alert', titulo: 'Não deu certo', sub: msg, acoes: [['Fechar', '']] });
    }
  };
  const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /** monta a rota do dia: planeja (grava a ordem) e confere (semáforo). */
  async function montarRota() {
    await comTrava(async () => {
      // 🔴 TOQUE MUDO É DEFEITO. Montar são 3 idas ao servidor (planejar,
      // conferir, recarregar) — medido, passa de 2s. Sem sinal na tela o
      // motorista toca de novo achando que falhou. O mock já tem o estado
      // "carregando" (esqueleto): é ele que responde ao dedo.
      const estadoAntes = estadoRota;
      try { estadoRota = 'carregando'; if (typeof window.pintar === 'function') window.pintar(false); } catch (_) { /* sem seam */ }
      const devolverEstado = () => { try { estadoRota = estadoAntes; } catch (_) { /* idem */ } };

      let plano;
      try { plano = await window.API.post('/logistica/rota/planejar', { date: hojeISO() }); }
      catch (e) { devolverEstado(); return avisoErro(e); }
      const paradas = Array.isArray(plano && plano.stops) ? plano.stops
        : (Array.isArray(plano && plano.items) ? plano.items : []);

      // semáforo dos endereços: só ATRASA a montagem se o servidor acusar algo.
      let conf = null;
      try { conf = await window.API.post('/logistica/rota/conferir', { date: hojeISO() }); } catch (_) { /* aviso é enfeite, não portão */ }
      const comAviso = conf && Array.isArray(conf.items)
        ? conf.items.filter((i) => Array.isArray(i.motivosVisiveis) && i.motivosVisiveis.length).length
        : 0;

      devolverEstado();          // o esqueleto sai antes do dado entrar
      await carregarRota();      // já preenche a montagem com as paradas reais
      if (comAviso && typeof window.usarDados === 'function') {
        window.usarDados('montagem', { iniciarSub: `${comAviso} com aviso` });
      }
      if (comAviso && typeof window.portao === 'function') {
        window.portao({
          tom: 'alerta', ico: 'gps', titulo: `${comAviso} ${comAviso === 1 ? 'endereço com aviso' : 'endereços com aviso'}`,
          sub: 'Dá pra sair assim, mas confira antes.', acoes: [['Ver a rota', 'principal']],
        });
      }
      if (typeof window.ir === 'function') window.ir('montagem');
    });
  }

  /** iniciar: mostra o custo REAL e só então cobra. */
  async function iniciarRota() {
    await comTrava(async () => {
      let custo = null;
      try { custo = await window.API.get('/logistica/rota/custo-preview'); } catch (e) { return avisoErro(e); }
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
        botao.addEventListener('click', () => comTrava(async () => {
          try {
            await window.API.post('/logistica/rota/iniciar', { date: hojeISO() });
          } catch (e) { return avisoErro(e); }
          await carregarRota();
          if (typeof window.ir === 'function') window.ir('rota');
        }), { once: true });
      }
    });
  }

  /** cancelar: encerra a rota; entrega aberta volta pra agenda, nunca some. */
  async function cancelarRota() {
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'close', titulo: 'Cancelar a rota de hoje?',
      sub: 'As entregas em aberto voltam pra agenda.',
      acoes: [['Não', ''], ['Cancelar rota', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      try { await window.API.post('/logistica/rota/encerrar', { date: hojeISO() }); } catch (e) { return avisoErro(e); }
      await carregarRota();
      if (typeof window.ir === 'function') window.ir('rota');
    }), { once: true });
  }

  const ACOES = {
    montar: montarRota,
    'iniciar-rota': iniciarRota,
    iniciar: iniciarRota,
    'cancelar-rota': cancelarRota,
  };
  // captura na fase de subida, DEPOIS do mock: quem não é meu segue o caminho dele.
  document.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-acao], [data-estado]');
    if (!alvo || !temPonte()) return;
    const chave = alvo.dataset.acao || alvo.dataset.estado;
    const fn = ACOES[chave];
    if (fn) fn();
  });
})();
