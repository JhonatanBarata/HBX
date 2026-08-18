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

  /* ==========================================================================
     O DIA DO HISTORICO, ABERTO DE VERDADE (17/08 - ordens 7 e 10 do dono).

     Ate hoje o toque no cartao tinha UM destino: `usarHistorico`, que enche o
     rascunho e mostra o portao de tres linhas ("Nada gravado ainda - Salvar ou
     Iniciar e que gravam"). Era a foto 8 que ele mandou, e a queixa dele era
     literal: *"eu queria que tivesse o historico mesmo!!"*.

     Agora o toque ABRE o dia (GET /logistica/rota/historico/dia?date=), com
     desfecho por parada, motivo de quem nao foi feita, dinheiro e o credito que
     aquele dia custou. Reutilizar continua existindo - virou o botao verde de
     DENTRO da tela, que e onde ele faz sentido: depois de ver o que aconteceu.
     ========================================================================== */
  async function abrirDiaDoHistorico(data) {
    const dia = String(data || '');
    if (!dia || !temPonte() || typeof window.usarDados !== 'function') return;
    const doSeam = (DADOS.montagem && Array.isArray(DADOS.montagem.historico)) ? DADOS.montagem.historico : [];
    const cartao = doSeam.find((h) => h && h.data === dia) || {};
    /* A TELA ABRE JA COM O QUE O CARTAO SABIA (titulo, contagem, cor) e enche
       quando a rede chega - a mesma lei da ficha do cliente. Tela em branco
       esperando rede e tela quebrada, e aqui a espera e a pior possivel: quem
       tocou acabou de ver os numeros no cartao. */
    window.usarDados('historicodia', {
      carregando: 1, semFonte: 0, data: dia, volta: 'montagem',
      titulo: esc(cartao.titulo || 'Dia do historico'),
      sub: esc(cartao.sub || ''), desfecho: '',
      paradas: '', entregues: '', naoFez: '',
      recebido: '', marcado: '', total: '',
      creditosGastos: '', creditosPresos: 0, creditosNota: '', vazioTitulo: '', itens: [],
    });
    window.ir('historicodia');
    let r;
    try { r = await window.API.get('/logistica/rota/historico/dia?date=' + encodeURIComponent(dia)); }
    catch (_) { return window.usarDados('historicodia', { carregando: 0, semFonte: 1 }); }
    if (telaAtual() !== 'historicodia') return;   // ele ja saiu: resposta velha nao escreve
    encherDiaDoHistorico(dia, cartao, r);
  }

  function encherDiaDoHistorico(dia, cartao, r) {
    const itens = Array.isArray(r && r.itens) ? r.itens : [];
    const cr = (r && r.creditos) || {};
    const din = (r && r.dinheiro) || {};
    const presos = Number(cr.presos) || 0;
    const gastos = Number(cr.gastos) || 0;
    /* A NOTA DO CREDITO E A FRASE MAIS CARA DESTA TELA, entao ela diz SO o que
       o banco sabe: o debito e 1x por EMPRESA+DATA, sem rateio por cliente.
       "X creditos presos no cliente Y" seria numero inventado - o dono pediu o
       fato, e o fato e este. */
    const nota = presos > 0
      ? (Number(r.naoCompletadas) || 0) + ' parada(s) ficaram por fazer'
      : (gastos > 0 ? 'o dia foi cobrado uma vez' : '');
    window.usarDados('historicodia', {
      carregando: 0, semFonte: 0,
      data: dia,
      titulo: esc((r && r.data) ? (cartao.titulo || diaPorExtenso(r.data)) : (cartao.titulo || '')),
      sub: rotuloDoDesfecho(r && r.desfecho),
      desfecho: String((r && r.desfecho) || ''),
      paradas: String(Number(r && r.paradas) || 0),
      entregues: String(Number(r && r.entregues) || 0),
      naoFez: (Number(r && r.naoCompletadas) || 0) ? String(r.naoCompletadas) : '',
      recebido: centavosSeTiver(din.recebidoCents),
      marcado: centavosSeTiver(din.marcadoCents),
      total: centavosSeTiver(din.totalCents),
      creditosGastos: gastos > 0 ? String(gastos) : '',
      creditosPresos: presos > 0 ? 1 : 0,
      creditosNota: nota,
      vazioTitulo: itens.length ? '' : 'Nada ficou registrado neste dia',
      itens: itens.map((p) => ({
        ini: iniciaisDoNome(p && p.nome),
        nome: esc((p && p.nome) || 'Cliente'),
        endereco: esc((p && p.endereco) || ''),
        st: String((p && p.status) || ''),
        feito: !!(p && p.feito),
        motivo: esc((p && p.motivo) || ''),
        pill: pilhaDoDesfechoDaParada(p),
        valor: centavosSeTiver(p && p.valorCents),
      })),
    });
  }

  /* Os quatro tradutores desta tela. Ficam AQUI e nao no mock porque sao DADO
     (o mock e desenho): a mesma regra do `st` da parada. */
  const rotuloDoDesfecho = (d) => (d === 'completa' ? 'Dia completo'
    : d === 'incompleta' ? 'Dia incompleto' : d === 'cancelada' ? 'Rota cancelada' : '');
  const iniciaisDoNome = (n) => String(n || '')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
  function pilhaDoDesfechoDaParada(p) {
    if (!p) return null;
    if (p.feito) return ['Entregue', 'lime'];
    if (String(p.status) === 'cancelada') return ['Nao entregue', 'mute'];
    return ['Nao feita', 'mute'];
  }
  /** so pro caso do cartao nao ter titulo (ex.: entrou pelo link direto) */
  function diaPorExtenso(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? (m[3] + '/' + m[2]) : String(iso || '');
  }

  /* 🔴 O FECHAMENTO DE UM DIA PASSADO (a outra metade da ordem 7: *"nem o
     fechamento"*). O SERVIDOR SEMPRE SOUBE responder por data - o
     `GET /logistica/fechamento/resumo` aceita `?date=` e deriva tudo dela
     (medidores, formas, devedores, pagina). Quem cravava HOJE era ESTA PONTE,
     que so pedia o `diaOperacional()`. Nao nasce endpoint nenhum: nasce a
     PERGUNTA. */
  async function abrirFechamentoDoDia(data) {
    const dia = String(data || '');
    if (!dia || !temPonte()) return;
    let caixa;
    try { caixa = await window.API.get('/logistica/fechamento/resumo?date=' + encodeURIComponent(dia)); }
    catch (e) { return avisoErro(e); }
    try { encherFechamento(caixa, [], 0); } catch (_) { /* o tradutor e best-effort */ }
    window.ir('fechamento');
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
  /* 🔴 A AVULSA TEM OS ESPAÇOS DELA (17/08, ordem 10 do dono: *"JOWJOW E
     QUINZENAL são salvos de segunda feira, blz, eu removo a flag de 'seg', e
     eles ficam. Esses salvos deveriam ser de rotas avulsas"*).

     Até aqui `-1` caía em `diaDaSemana()` — o dia de HOJE. Numa segunda-feira,
     desligar o chip "Seg" deixava os espaços da segunda na tela: o dono lia
     JOWJOW/QUINZENAL numa rota que não é de dia nenhum, e o "Salvar rota" dali
     REGRAVAVA por cima do roteiro da segunda dele. Espaço mostrado num balde e
     gravado noutro é perda de trabalho, não confusão de rótulo.

     O balde da avulsa já existe no servidor desde sempre e não custa migration:
     `LogisticaRotaModelo.diaSemana` é `Int?` com "null = sem dia fixo"
     (schema.prisma:1503), o DTO aceita null (`@IsOptional`) e o
     `assertNomeUnico` já trata as sem-dia como namespace próprio
     ("as sem dia fixo entre si"). O que faltava era a ponte PEDIR esse balde.

     `-1` continua sendo o vocabulário desta casa (é o valor do `montarDia`);
     quem traduz pro servidor é o `diaNoServidor`, num lugar só — duas traduções
     é como as duas pontas passam a discordar de qual espaço é de quem.

     ⚠️ `montarDia` TEM TRÊS FAIXAS, e confundir duas delas apaga o caso mais
     comum: `-1` é a avulsa, `1..7` é OUTRO dia da semana e **`0` é HOJE** — o
     chip do dia corrente nasce com 0 (`10-geofence-montagem.js`, o
     `n === hoje ? 0 : n` da fileira). Por isso o teste é `=== -1` e não
     `> 0`: com `> 0` o dia de hoje cairia no balde da avulsa e o motorista
     perderia os espaços do dia em que ele está trabalhando. */
  const diaDosEspacos = () => (montarDia === -1 ? -1 : (montarDia > 0 ? montarDia : diaDaSemana()));
  /** -1 (avulsa) vira `null` no servidor; 1..7 viaja como número. */
  const diaNoServidor = (d) => (Number(d) > 0 ? Number(d) : null);
  /** o dia de um rota-modelo no vocabulário da tela: sem dia fixo = -1.
   *  `Number(null)` é 0 e `Number(undefined)` é NaN — os dois caem no -1, que
   *  é o que "sem dia fixo" significa aqui. */
  const diaDoModelo = (m) => {
    const n = Number(m && m.diaSemana);
    return n >= 1 && n <= 7 ? n : -1;
  };
  /** o nome do balde na frase do portão ("Espaço 1 de …") */
  const rotuloDoBalde = (d) => (Number(d) > 0 ? (ROTULO_DIA[Number(d)] || '') : 'rota avulsa');

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
      .filter((m) => m && diaDoModelo(m) === dia)
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
      /* 🔴 …e com a rota JÁ NA RUA o pé não oferece verbo nenhum de saída
         (16/08). Desde que o Montar leva o dia até o fim num carregamento só
         (ver `montarRota`), voltar aqui com a rota ACTIVE encontrava um
         "Iniciar rota" verde sobre um dia que já começou — botão que mente, a
         doença que esta casa persegue. Rodando, o que sobra pra fazer com esta
         lista é REMONTAR, e esse é o "Montar rota". */
      pronta: (estadoRota === 'rodando' || estadoRota === 'pausada')
        ? 0
        : (previaAlvo > 0 ? (montadaNaTela ? 1 : 0) : 1),
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

