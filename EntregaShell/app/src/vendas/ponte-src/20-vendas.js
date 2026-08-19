
  /* ==========================================================================
     VENDAS — O FUNIL. A tela em que o app abre, e a que prova que ele é real.

     TRÊS PORTAS, TRÊS DESFECHOS INDEPENDENTES (é assim que a casca desenha):
       GET /vendas/board              → chips, lista, rodapé  (`carregando`)
       GET /vendas/report?period=30d  → o placar de cima      (`placarCarregando`)
       GET /vendas/pending-summary    → a faixa de aviso      (sem bandeira: ela
                                        só existe quando tem o que dizer)
     `Promise.allSettled` e não `Promise.all`: com `all`, o placar no chão
     derrubaria o FUNIL junto — e o funil é o app inteiro. Cada porta que falha
     deixa o SEU bloco no aviso e as outras seguem.

     🔴 O SEAM ESPELHA O SERVIDOR CHAVE A CHAVE, SEM RENOMEAR. `blocos` é
     `board.blocks` e `contagem` é `board.summary` (overdue/today/scheduled/
     closed). Campo renomeado no meio do caminho é o que descola do servidor no
     dia seguinte — e ninguém vê, porque a tela continua bonita com o valor
     velho.

     🔴 A BUSCA NÃO TEM PORTA NO SERVIDOR, e isso é decisão, não falta: o board
     já vem inteiro (take 240) e digitar não pode virar uma requisição por letra
     numa tela que o vendedor usa o dia todo. O filtro é LOCAL, sobre o que já
     chegou — e por isso ele nunca "acha" o que não veio: quem procura empresa
     que não está na carteira usa o Radar, que é a porta certa e está a um toque.
     ========================================================================== */

  /* O board CRU da última resposta. A tela mostra a versão FILTRADA (a busca do
     dedo), mas o filtro precisa reler o original a cada letra — senão apagar uma
     letra não devolveria os cards, porque eles já teriam sido jogados fora. */
  let boardCru = null;
  /* Um pedido por vez: quem chega no meio do voo recebe a MESMA promessa. Sem
     isto, dois gatilhos que caem juntos (o "Tentar de novo" tocado duas vezes,
     por exemplo) viram duas varreduras de 240 leads no servidor. */
  let funilEmVoo = null;

  /* 🔴 O TELEFONE DECIDE SE O CARTÃO É ACIONÁVEL, e é por isso que ele tem selo
     próprio (vermelho) em vez de sumir em silêncio: lead sem telefone num app
     que fala por WhatsApp é um card que nunca vai virar conversa, e o vendedor
     precisa VER isso na lista pra não abrir um por um. Esta régua é a mesma do
     desenho (`selo:'sem telefone', seloTom:'red', tom:'red'`). */
  function traduzirLead(lead) {
    const l = lead || {};
    const nome = String(l.name || '').trim();
    const fone = telefoneBonito(l.phone);
    const tentativas = Number(l.attemptCount) || 0;

    /* Um selo só, e a ordem é a da URGÊNCIA de quem lê: o impedimento primeiro
       (sem telefone), depois a oportunidade (empresa recém-aberta), e por último
       o histórico (quantas vezes já se bateu nesta porta). Três selos numa linha
       de 412 px viram tarja; o que importa é o de cima. */
    let selo = '';
    let seloTom = '';
    if (!fone) { selo = 'sem telefone'; seloTom = 'red'; }
    else if (l.isFreshCompany) { selo = 'empresa nova'; seloTom = 'lime'; }
    else if (tentativas > 1) { selo = `${tentativas} toques`; seloTom = ''; }

    return {
      // 🔴 SEM `id` A LINHA SAI INERTE — é o que o desenho já faz (`c.id?`). Lead
      // sem id no servidor não vira botão que abre o nada.
      id: String(l.id || ''),
      ini: esc(iniciais(nome)),
      nome: esc(nome),
      local: esc(local(l.city, l.state)),
      fone: esc(fone),
      etapa: esc(l.statusLabel || ''),
      etapaTom: tomDaEtapa(l.statusLabel),
      selo: esc(selo),
      seloTom,
      // "sem toque" é FATO (o servidor mandou `lastContactAt: null`), não falta
      // de fonte: é a notícia mais importante do cartão de um lead novo.
      toque: l.lastContactAt ? esc(quandoDoToque(l.lastContactAt)) : 'sem toque',
      tom: !fone ? 'red' : (l.isFreshCompany ? 'lime' : ''),
    };
  }

  /* O que o dedo digitou corta a lista que JÁ chegou. Compara sem acento e sem
     caixa porque ninguém digita "Bar do Zé" com o acento no lugar quando está na
     rua; e varre nome, cidade, UF e telefone — os campos que a própria caixa de
     busca promete ("Buscar empresa, cidade ou telefone"). Promessa escrita no
     `placeholder` é contrato.

     🔴 O FILTRO MORDE O LEAD CRU, NUNCA O CARTÃO JÁ TRADUZIDO. O cartão passou
     pelo `esc()` — uma empresa chamada "BAR & CIA" está guardada lá como
     "BAR &amp; CIA", e quem digitasse "bar & cia" não acharia a própria empresa
     que está na tela. Escapar é para PINTAR; procurar é sobre o dado. */
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const cabeNaBusca = (lead, alvo) => semAcento(
    [lead && lead.name, lead && lead.city, lead && lead.state, lead && lead.phone].filter(Boolean).join(' '),
  ).includes(alvo);

  /* Reescreve só a LISTA a partir do board já guardado — sem tocar na rede. É o
     que a busca e o "Tentar de novo" do chip chamam. */
  function publicarFunil() {
    if (!boardCru) return;
    let busca = '';
    try { busca = String((DADOS.vendas && DADOS.vendas.busca) || ''); } catch (_) {}
    const alvo = semAcento(busca).trim();
    const blocos = {};
    ['overdue', 'today', 'scheduled', 'closed'].forEach((k) => {
      const lista = Array.isArray(boardCru.blocks && boardCru.blocks[k]) ? boardCru.blocks[k] : [];
      blocos[k] = (alvo ? lista.filter((l) => cabeNaBusca(l, alvo)) : lista).map(traduzirLead);
    });
    usar('vendas', { blocos });
  }

  /* 🔴 A CONTAGEM DO CHIP É A DO SERVIDOR, NUNCA A DA LISTA FILTRADA. Se ela
     seguisse a busca, digitar uma letra faria os quatro chips despencarem e a
     pessoa leria "só tenho 1 atrasado" quando tem 12. O chip conta o FUNIL; a
     lista mostra o RECORTE. São duas perguntas diferentes na mesma tela. */
  function vestirBoard(board) {
    boardCru = board;
    const resumo = (board && board.summary) || {};
    const suprimento = (board && board.radarSupply) || {};

    /* O RODAPÉ responde "por que parou de chegar empresa nova". `activeCards` é
       o tamanho da carteira e `availableSlots` o que ainda cabe.
       🔴 ZERO AQUI É O NÚMERO MAIS IMPORTANTE DA LINHA, e por isso ele vira
       STRING: a folha testa AUSÊNCIA (`!=null && !==''`), nunca verdade — com o
       teste de verdade, "0 vagas" (a explicação inteira) sumiria da tela.
       🔴 CARTEIRA SEM TETO NÃO MOSTRA VAGA: `unlimited` é a lei do dono de
       27/06 ("à vontade"), e "0 vagas" ali seria o oposto do que é verdade. */
    const ilimitada = !!suprimento.unlimited;
    const cheia = !!suprimento.full;
    const pausada = !!suprimento.paused;
    const vagas = ilimitada ? '' : String(Math.max(0, Number(suprimento.availableSlots) || 0));

    /* A FAIXA DE AVISO TEM UM DONO SÓ POR VEZ. Se a carteira cheia e a pausa do
       Radar escrevessem as duas, a mesma notícia apareceria duplicada — e é a
       mesma notícia dita de dois jeitos. Ordem: o que BLOQUEIA vence o que
       explica. Quem manda no `blocked` é o `/vendas/pending-summary`, escrito
       logo abaixo, e ele só sobrescreve quando tem o que dizer. */
    let aviso = '';
    let avisoTom = '';
    if (cheia) { aviso = 'Carteira cheia — o Radar parou de mandar empresa nova.'; avisoTom = 'alerta'; }
    else if (pausada) { aviso = 'O Radar está pausado — nenhuma empresa nova está entrando.'; avisoTom = 'pausa'; }

    /* O SUBTÍTULO SAI DA CONTA, NÃO DO DESENHO. "Comece pelos atrasados" com
       zero atrasados é o app dando ordem errada logo na primeira linha que a
       pessoa lê. Sem nada a dizer, a linha SOME (a folha testa `v.subtitulo?`) —
       silêncio é melhor que conselho falso. */
    const atrasados = Number(resumo.overdue) || 0;
    const hoje = Number(resumo.today) || 0;
    const subtitulo = atrasados ? 'Comece pelos atrasados.'
      : hoje ? 'Seus retornos de hoje.'
        : '';

    usar('vendas', Object.assign({}, fonteVoltou, {
      subtitulo,
      contagem: {
        overdue: Number(resumo.overdue) || 0,
        today: Number(resumo.today) || 0,
        scheduled: Number(resumo.scheduled) || 0,
        closed: Number(resumo.closed) || 0,
      },
      carteira: String(Math.max(0, Number(suprimento.activeCards) || 0)),
      vagas,
      vagasRotulo: cheia ? 'carteira cheia' : 'vagas na carteira',
      vagasAlerta: cheia ? 1 : 0,
      aviso, avisoTom,
    }));
    publicarFunil();
  }

  /* O PLACAR — a leitura de 30 dias, e ela é OUTRA porta.
     🔴 CONVERSÃO SEM CHAMADA NÃO É 0%, É NADA. `taxaConversao` vem 0 quando
     ninguém foi chamado (0/0), e "0% de conversão" acusa de fracasso quem
     simplesmente ainda não começou. Sem denominador, o slot some — Lei do IF.
     Já "0 chamados" FICA: esse zero é a notícia. */
  function vestirPlacar(rel) {
    const m = (rel && rel.metrics) || {};
    const chamados = Math.max(0, Math.trunc(Number(m.cardsChamados) || 0));
    const respostas = Math.max(0, Math.trunc(Number(m.respostas) || 0));
    const taxa = Number(m.taxaConversao);
    usar('vendas', {
      placarCarregando: false, placarSemFonte: false,
      // O rótulo do período é do SERVIDOR (`period.label`): ele é quem resolve o
      // `?period=30d` em dias de verdade, e escrever "Últimos 30 dias" aqui
      // deixaria a tela mentindo no dia em que o padrão do backend mudasse.
      periodo: rel && rel.period && rel.period.label ? `Últimos ${esc(rel.period.label)}` : '',
      chamados: String(chamados),
      respostas: String(respostas),
      conversao: chamados && isFinite(taxa) ? `${Math.round(taxa * 100)}%` : '',
    });
  }

  /* A faixa de bloqueio do `pending-summary`. Ela VENCE o aviso da carteira
     porque é a única das duas que impede o trabalho de continuar — e por isso
     também não apaga nada quando não há bloqueio: ausência de bloqueio não é
     motivo pra limpar o recado que o board acabou de escrever. */
  function vestirPendencias(resumo) {
    if (!resumo || !resumo.blocked) return;
    const msg = String(resumo.message || '').trim();
    if (!msg) return;
    usar('vendas', { aviso: esc(msg), avisoTom: 'alerta' });
  }

  function carregarFunil() {
    if (!temPonte()) return Promise.resolve();
    if (funilEmVoo) return funilEmVoo;
    funilEmVoo = Promise.allSettled([
      window.API.get('/vendas/board'),
      window.API.get('/vendas/pending-summary'),
      window.API.get('/vendas/report?period=30d'),
    ]).then(([board, pend, rel]) => {
      /* 🔴 O `reason` DO `allSettled` É O ERRO INTEIRO, e é ele que decide a
         CENA. Esta é a tela em que o app POUSA — a primeira coisa que um
         cliente novo vê. Em 18/08 ela dizia "não consegui carregar · sem
         resposta do servidor" enquanto o servidor respondia, em 39 ms, que o
         módulo Vendas não estava liberado para aquela empresa. Sem o `reason`
         aqui a cura não chega justamente na tela que mais precisa dela. */
      if (board.status === 'fulfilled' && board.value) vestirBoard(board.value);
      else fonteCaiu('vendas', board.reason);

      if (rel.status === 'fulfilled' && rel.value) vestirPlacar(rel.value);
      else blocoCaiu('vendas', 'placarCarregando', 'placarSemFonte');

      // O resumo de pendências é o ÚNICO dos três sem bandeira própria na
      // casca: ele não tem bloco na tela, só empresta uma frase à faixa. Falhar
      // aqui não pode acender aviso nenhum — seria inventar um bloqueio.
      if (pend.status === 'fulfilled') vestirPendencias(pend.value);
    }).finally(() => { funilEmVoo = null; });
    return funilEmVoo;
  }

  /* ------------------------------------------------------------------------
     O QUE O DEDO FAZ NESTA TELA.
     ------------------------------------------------------------------------ */
  /* Entrar no Funil relê o funil. O POUSO da abertura não passa por aqui — quem
     explica é o `TELA_DE_POUSO` do `10-portao-fontes.js`. */
  registrarTelas({ vendas: carregarFunil });

  registrarAcoes({
    /* O chip da etapa é DO DEDO e não fala com a rede: os quatro baldes já
       vieram no mesmo `board`. Refazer a chamada aqui seria pagar uma varredura
       de 240 leads pra mostrar dado que já está na memória — e piscaria a tela. */
    'etapa-funil': (el) => {
      const etapa = String((el && el.dataset && el.dataset.etapa) || 'today');
      usar('vendas', { etapa });
    },
    // Os dois "Tentar de novo" da tela. Eles devolvem o ESQUELETO antes de pedir
    // de novo — sem isso o toque não responde nada por um segundo inteiro e a
    // pessoa toca outra vez.
    'recarregar-funil': () => retentar('vendas', carregarFunil),
    'recarregar-placar': () => {
      usar('vendas', { placarCarregando: true, placarSemFonte: false });
      carregarFunil();
    },
  });

  registrarCampos({
    /* 🔴 A BUSCA ESPERA O DEDO PARAR. Cada letra escreve no seam, e cada escrita
       remonta a camada (`pintar`): sem o respiro, digitar "distribuidora" são 14
       repintes seguidos na tela de quem está com o dedo no vidro. 180 ms é o
       piscar de olho — abaixo disso vira repinte por letra; acima, a lista
       parece travada.
       O caret sobrevive porque a casca mede e devolve o foco (`medirFoco`/
       `herdarFoco`); é por isso que este campo pode passar pelo seam de verdade
       em vez de escrever no nó por fora. */
    'busca-lead': {
      espera: 180,
      ao: (valor) => {
        usar('vendas', { busca: valor });
        publicarFunil();
      },
    },
  });
