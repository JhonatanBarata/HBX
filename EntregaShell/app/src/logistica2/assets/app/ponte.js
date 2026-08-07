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

  /** estado da rota, no vocabulário do transmux do mock */
  function estadoDaRota(r) {
    const s = String(r.routeStatus || '').toLowerCase();
    if (s === 'em_rota' || s === 'iniciada' || s === 'running') return 'rodando';
    if (s === 'pausada' || s === 'paused') return 'pausada';
    if (r.routeId) return 'pronta';
    return 'montar';
  }

  /* 🔴 O TEMPLATE DO MOCK INTERPOLA CRU (`${…}`), como toda maquete. Enquanto o
     dado era do mock isso não tinha dono; com dado REAL passa a ter: um nome de
     cliente com `<` quebra a marcação e o cartão some da lista sem erro nenhum.
     Escapa-se na FONTE (aqui), nunca no template — assim vale pra toda tela que
     ler o seam, e o literal do mock (que tem `<b>` de propósito) continua vivo. */
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /** uma parada do servidor → uma linha do mock */
  function traduzirParada(item, i, anterior) {
    const c = item.cliente || {};
    const status = String(item.status || '');
    const entregue = status === 'entregue';
    const cancelada = status === 'cancelada';
    const tags = [];
    if (item.quantidade > 0) tags.push([`${item.quantidade}x`, 'blue']);
    // 🔴 CANCELADA NÃO É PENDENTE. Caía no `else` e a parada que o motorista já
    // resolveu ("não entregue", com motivo) voltava pra lista com cara de coisa
    // por fazer — ele bateria na mesma porta de novo. Visto no g15.
    const pill = entregue
      ? ['Entregue', 'lime', 'check']
      // `mute` + número apagado, e NÃO um vermelho novo: a casca só tem
      // blue/lime/amber/mute, e "não entregue" é desfecho FECHADO, não bloqueio
      // (Lei 2c: vermelho só quando trava). Inventar `.pill.red` aqui seria
      // criar variante que o mock não tem — o oposto de casca única.
      : cancelada
        ? ['Não entregue', 'mute', 'close']
        : (status === 'em_rota' ? ['A caminho', 'blue', 'nav'] : ['Pendente', 'mute', 'clock']);
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
      cor: entregue ? 'lime' : (cancelada ? 'off' : undefined),
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

  async function carregarRota() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const dia = diaOperacional();
    let r;
    // 🔴 A DATA VIAJA SEMPRE. Sem ela o servidor usa o dia DELE — e ele roda em
    // UTC (medido: nem o container local nem o da VPS têm TZ). Das 21h à
    // meia-noite de Brasília o UTC já é amanhã, então a rota do motorista
    // aparecia VAZIA justo no fim do turno. Achado no g15 às 23:28 (defeito meu
    // da L1: o app velho sempre mandou `?date=`).
    try { r = await window.API.get(`/logistica/rota?date=${encodeURIComponent(dia)}`); } catch (_) { return; }

    // Crédito e caixa do dia vêm de OUTRAS portas — pedidos em paralelo, e
    // cada um que falhar deixa o SEU campo vazio, sem derrubar a tela.
    const [creditoR, caixaR] = await Promise.allSettled([
      window.API.get('/credits/me'),
      // ⚠️ é `date`, não `data` (conferido no controller): o nome errado não dá
      // erro nenhum — o servidor ignora e responde o dia DELE, em UTC.
      window.API.get(`/logistica/caderneta/resumo?date=${encodeURIComponent(dia)}`),
    ]);
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
    // O nível do financeiro vem no MESMO payload da rota (não é chute nem
    // pedido extra): é ele que decide qual das duas folhas abre na porta.
    if (typeof r.moduloFinanceiroAtivo === 'boolean') financeiroAtivo = r.moduloFinanceiroAtivo;
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
  const hojeISO = () => diaOperacional();

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

  let ultimaPos = null;
  if (navigator.geolocation) {
    try {
      navigator.geolocation.watchPosition(
        (p) => { ultimaPos = { lat: p.coords.latitude, lng: p.coords.longitude }; },
        () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
      );
    } catch (_) { /* sem GPS: o mapa abre na 1ª parada */ }
  }

  /** monta (ou reaproveita) o mapa do palco visível */
  async function montarMapa(palco) {
    if (!palco || palco.__hbxMapa) return;
    palco.__hbxMapa = true;                      // idempotente: 1 mapa por palco
    let maplibregl; let estilo;
    try {
      maplibregl = await carregarMaplibre();
      estilo = await estiloDoMapa(document.documentElement.dataset.luz !== 'claro');
    } catch (_) { palco.__hbxMapa = false; return; }   // sem mapa, fica o desenho
    if (!document.body.contains(palco)) { palco.__hbxMapa = false; return; }

    const alvo = document.createElement('div');
    alvo.className = 'mapa-vivo';
    palco.appendChild(alvo);

    const paradas = (typeof PARADAS !== 'undefined' ? PARADAS : []).filter((p) => p.lat && p.lng);
    const centro = ultimaPos || (paradas[0] ? { lat: paradas[0].lat, lng: paradas[0].lng } : null);
    const mapa = new maplibregl.Map({
      container: alvo,
      style: estilo,
      center: centro ? [centro.lng, centro.lat] : [-47.5863, -22.4226],
      zoom: centro ? 15 : 12,
      maxZoom: 18,
      attributionControl: false,
    });
    palco.__hbxMapaObj = mapa;
    mapa.on('load', () => {
      palco.classList.add('pronto');             // o desenho de espera se apaga
      paradas.forEach((p) => {
        const pino = document.createElement('div');
        pino.textContent = String(p.n);
        pino.style.cssText = 'width:26px;height:26px;border-radius:50%;display:grid;place-items:center;'
          + 'font:500 12px Inter,sans-serif;background:var(--map-pino);color:var(--map-pino-tinta);'
          + 'border:1.5px solid var(--map-rota)';
        new maplibregl.Marker({ element: pino }).setLngLat([p.lng, p.lat]).addTo(mapa);
      });
      if (ultimaPos) new maplibregl.Marker({ color: '#3d8bff' }).setLngLat([ultimaPos.lng, ultimaPos.lat]).addTo(mapa);
    });
  }

  // toda pintura de tela pode trazer um palco novo: o mapa nasce junto.
  const observador = new MutationObserver(() => {
    const palco = naCamada('[data-mapa]');
    if (palco) montarMapa(palco);
  });
  observador.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });

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
      // "Lançamento na caderneta" só é verdade quando a forma escolhida é FIADO
      // — em dinheiro/pix/cartão nada vai pra caderneta. Número que muda de
      // significado conforme o botão é número que mente.
      lancamento: forma === 'fiado' && hojeVal != null ? dinheiro(hojeVal) : dinheiro(0),
      recebido: forma && forma !== 'fiado' && hojeVal != null ? dinheiro(hojeVal) : dinheiro(0),
      paraCaderneta: anterior != null ? dinheiro(anterior + (forma === 'fiado' ? (hojeVal || 0) : 0)) : '',
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
    montar: montarRota,
    'iniciar-rota': iniciarRota,
    iniciar: iniciarRota,
    'cancelar-rota': cancelarRota,
    'entregue-pagou': () => confirmarEntrega(''),
    'entregue-marcou': () => confirmarEntrega('fiado'),
    'confirmar-venda': () => confirmarEntrega(''),
    'registrar-nao-entregue': registrarNaoEntregue,
  };
  // captura na fase de subida, DEPOIS do mock: quem não é meu segue o caminho dele.
  document.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-acao], [data-estado]');
    if (!alvo || !temPonte()) return;
    const chave = alvo.dataset.acao || alvo.dataset.estado;
    // Ações que carregam ARGUMENTO no próprio botão. Ficam fora do mapa porque
    // o mapa é nome→função; aqui o dado é parte do toque.
    if (chave === 'abrir-parada') return abrirParada(alvo.dataset.parada);
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
