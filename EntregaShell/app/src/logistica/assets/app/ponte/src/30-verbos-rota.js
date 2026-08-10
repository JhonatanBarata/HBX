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
      await window.API.post('/logistica/mobile/materialize', {
        operationalDate: hojeISO(), sourceDates: [hojeISO()],
      });
      return true;
    } catch (_) { return false; }
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
      });
      novos += 1;
    });
    return novos;
  }

  async function montarRota() {
    await comTrava(async () => {
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
      montando(1);
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
        plano = await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...recorte, ...origemGps() });
      } catch (e) { devolverEstado(); return avisoErro(e); }
      const paradas = Array.isArray(plano && plano.stops) ? plano.stops
        : (Array.isArray(plano && plano.items) ? plano.items
          : (Array.isArray(plano && plano.paradas) ? plano.paradas : []));

      // semáforo dos endereços: só ATRASA a montagem se o servidor acusar algo.
      // Confere HOJE, sempre: o dia da rota é hoje mesmo quando a gente dela
      // veio de outra data (é a lei do chip — ver `diaDeOutroDia`).
      let conf = null;
      try {
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
      // O dia de outra data vira gente de HOJE antes de tudo — o mesmo gesto do
      // montar (ver `previaViraRascunho`). Quem já é parada aberta é pulado lá,
      // então tocar Iniciar numa lista já montada não cria nada de novo.
      const outroDia = diaDeOutroDia();
      if (outroDia) previaViraRascunho();
      // O rascunho vira parada ANTES de tudo: é o dedo mandando gravar, e é
      // daqui que sai o conjunto que o planejar vai ordenar e o servidor cobrar.
      const mat = await materializarRascunho();
      /* 🔴 A ROTA SAI SÓ COM O QUE ESTÁ NA TELA (dono, 10/08: o chip do dia
         desligado É a rota avulsa; e o chip de OUTRO dia é a gente daquele dia
         entregando hoje). Sem o recorte, o planejar varria as entregas da
         agenda — que o cron já criou no servidor — pra dentro da rota que ele
         acabou de escolher na tela. `deliveryIds` já existe nas três portas
         (planejar, custo-preview, iniciar); aqui ele carrega a tela ao pé da
         letra. */
      const avulsa = montarDia === -1;
      const recortada = avulsa || outroDia;
      const idsAvulsa = recortada ? idsDaPrevia() : null;
      if (avulsa && (!idsAvulsa || !idsAvulsa.length)) {
        return avisoErro(new Error('A rota avulsa está vazia. Adicione uma parada antes de iniciar.'));
      }
      const recorte = idsAvulsa && idsAvulsa.length ? { deliveryIds: idsAvulsa } : {};
      if (estadoRota === 'montar' || !ENTREGAS.size || recortada) {
        try {
          // O MESMO remédio do montar: sem materializar, um dia cancelado em
          // massa batia aqui e morria no "Nenhuma entrega aberta neste dia".
          // Na avulsa e no dia de outra data NÃO: materializar traria a agenda
          // de hoje de volta pra tela que mostra outra gente.
          if (!recortada) await materializarDia();
          await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...recorte, ...origemGps() });
        } catch (e) { return avisoErro(e); }
        if (!(await carregarRota())) return avisoErro(new Error('Não consegui montar agora. Tente de novo.'));
        if (ordemDeGente()) await cravarOrdemDaTela();
      }
      let custo = null;
      // a data vai JUNTO — sem ela o servidor cobra pelo dia UTC dele (ver a
      // nota no `carregarRota`): das 21h em diante o portão nem abria. E na
      // avulsa o recorte viaja aqui também: o preço tem que ser DESSA rota.
      try {
        const qIds = idsAvulsa && idsAvulsa.length ? `&deliveryIds=${encodeURIComponent(idsAvulsa.join(','))}` : '';
        custo = await window.API.get(`/logistica/rota/custo-preview?date=${encodeURIComponent(hojeISO())}${qIds}`);
      } catch (e) { return avisoErro(e); }
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
          if (typeof window.ir === 'function') window.ir('mapa');
          return;
        }
        return avisoErro(e);
      }
      await carregarRota();
      // A escolha de dia morre no Iniciar: a rota (avulsa ou com a gente de
      // outra data) virou A rota em andamento, e a Montagem seguinte volta a
      // abrir sem dia — o estado em que ela nasce desde 10/08.
      if (recortada) { montarDia = -1; window.usarDados('montagem', { diaSel: -1 }); }
      /* 🔴 INICIAR É UM GESTO SÓ (dono, 10/08: "clico em iniciar, o botão muda
         para navegar NÃO QUERO — é iniciar de uma vez só, ou navegar de uma vez
         só"). Antes o toque deixava o motorista na tela Rota com o dock
         morfado pra "Navegar" — um segundo toque pra fazer o que ele acabou de
         mandar. Agora o Iniciar entra DIRETO na navegação (a mesma porta do
         botão Navegar: `ir('mapa')` cobra GPS na hora certa e toca a descida
         2D→3D). O "Sair" do 3D continua devolvendo pra Rota com o dock
         Navegar·Cancelar·Finalizar — sair de propósito é outro verbo. */
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

  async function cancelarRota() {
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'close', titulo: 'Tem certeza que deseja cancelar?',
      acoes: [['Não', ''], ['Sim', 'principal']], classe: 'duas', perigo: true,
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    /* `comTravaFila` e não `comTrava`: este é o "Sim" de um portão, a mesma
       peça do "Iniciar" logo acima. O portão FECHA no toque, então toque
       descartado por app ocupado (a Montagem monta sozinha ao abrir) não tem
       repeteco — o dono via o diálogo sumir e a rota continuar de pé. */
    botao.addEventListener('click', () => comTravaFila(async () => {
      try { await window.API.post('/logistica/rota/limpar-dia', { date: hojeISO() }); } catch (e) { return avisoErro(e); }
      // 🔴 O SERVIDOR ENCERROU; O APARELHO TAMBÉM TEM QUE ESQUECER. A fita, a
      // geometria e a lista são DESTE lado do fio — e vêm ANTES do
      // `carregarRota`, senão o repinte que ele dispara passaria com a rota
      // morta ainda desenhada.
      esquecerRotaCarregada();
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

