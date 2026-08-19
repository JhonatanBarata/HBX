
  /* ==========================================================================
     CONVERSAS — o lead, o fio e o BOTÃO DE DUAS POSIÇÕES.

     O pedido do dono, literal: "garantir que seja fácil a escolha entre whatsapp
     da empresa ou whatsapp do celular. (não explicar, 1 botão)". Os rótulos que
     ele aprovou: [ Empresa | Meu WhatsApp ]. Então aqui NÃO existe frase de
     apoio, tooltip, modal de escolha nem "tem certeza?": o ESTADO do botão é a
     explicação inteira, e é a casca que o desenha (`corpoDaConversa`, no mock).

     🔴 O QUE ESTE ARQUIVO ALIMENTA — e nada além disso:
       `chip.conectado`  ← GET /companies/me/whatsapp-status  (`connected`)
       `temWhats`        ← o servidor NÃO desmentiu este destinatário
       `canal`           ← a escolha do DEDO, carimbada POR LEAD
     A posição da pílula é DERIVADA a cada pintura pela casca
     (`podeEmpresa = chip.conectado && temWhats`) — nunca guardada. É isso que
     faz o chip que cai no meio da conversa devolver a pílula pro celular
     sozinho, em vez de deixar o dedo mandando pelo lado morto.

     🔴 AS DUAS PORTAS SÃO A FACHADA DO VENDAS, NUNCA O ATENDIMENTO. Aqui só
     entram `/vendas/lead/:id/conversation…`. `/inbox` e `/conversations` exigem
     o módulo `atendimento`, que o plano LITE não tem
     (COMMERCIAL_PLAN_MODULE_KEYS[LITE] = ['vendas','webscraping']) — foi esse
     403 MUDO que expulsou um cliente inteiro em 18/08. A fachada manda pelo
     MESMO motor, e vive sob o gate que o plano já tem.

     🔴 O APP NÃO ESCOLHE O CHIP. Nenhuma chamada daqui leva `sessionId`,
     `tenantKey` ou número de origem: quem resolve o chip é o SERVIDOR, pelo
     vendedor logado, fail-closed. Mandar isso do cliente foi a raiz do
     vazamento de chip de 20/07.

     🔴 O QUE NÃO NASCE NESTE ARQUIVO, e a proibição é permanente: envio em
     lote, "mandar pra todos", template repetido, fila automática, retry
     automático de mensagem que falhou. Em 17/08 esta casa viu 126 mensagens
     idênticas num minuto atravessarem o gate inteiro e custarem um chip banido;
     no mesmo dia um chip novo morreu com `401 device_removed` no primeiro envio
     da vida. A régua é ROBÔ × GENTE — aqui só existe gente: UMA mensagem, para
     UM lead, por UM toque. O reenvio existe (o `Tentar de novo` da bolha que
     falhou) e ele manda o MESMO corpo que já está pintado na tela, jamais um
     texto novo montado por código.
     ========================================================================== */

  /* O lead ABERTO agora. É `''` até alguém tocar num card — e enquanto for `''`
     este módulo não fala com a rede: pedir a conversa "do lead nenhum" é um 404
     garantido, e um aviso de rede caída por cima de uma tela que só está vazia
     seria a Lei nº 1 quebrada ao contrário. */
  let leadDaConversa = '';
  /* O texto que a pessoa escreveu. Ele mora AQUI e não no seam de propósito: o
     `<input>` do mock não tem `value` no template (é maquete), então todo
     repinte apagaria o que ela digitou — e escrever no seam a cada letra
     remontaria a camada inteira por tecla. A régua fica: o rascunho acompanha o
     campo, e `pintarConversa()` o devolve ao nó depois de cada pintura. */
  let rascunhoDaConversa = '';
  /* As mensagens CRUAS da última resposta. O fio pintado passou pelo `esc()`, e
     o reenvio precisa do corpo ORIGINAL — mandar o texto escapado poria
     "BAR &amp; CIA" no WhatsApp do cliente. */
  let fioCruDaConversa = [];
  /* A FICHA CRUA do lead, tal como o `/vendas/lead/:id/card` a devolveu. O
     cabeçalho da conversa mostra quatro campos dela (nome, telefone, etapa,
     origem); o resto — CNPJ, razão social, dono, e-mails e os OUTROS telefones
     que o enriquecimento achou — não tem tela nenhuma neste app e ficava no
     lixo. É ele que o "Abrir ficha" mostra: dado que o app já pagou pra ter. */
  let fichaCruaDoLead = null;
  /* "Já existe conversa no servidor?" — quem responde é o snapshot. Sem ela o
     POST da mensagem morre com "Abra a conversa antes de enviar a mensagem." */
  let conversaExiste = false;
  /* Um pedido por vez: dois gatilhos que caem juntos (o "Tentar de novo" tocado
     duas vezes) viram duas leituras do mesmo fio.
     🔴 E O VOO É DE UM LEAD, NÃO DA TELA. Devolver o voo em curso para QUALQUER
     pedido faria o segundo lead herdar a espera do primeiro — e a resposta que
     chegasse seria descartada pela guarda de "o dedo trocou de lead", deixando a
     conversa nova no esqueleto para sempre. Quem chega pedindo OUTRO lead abre
     um voo novo. */
  let conversaEmVoo = null;
  let conversaEmVooDe = '';

  /* 🔴 A ESCOLHA É POR LEAD, NUNCA POR APARELHO. Um vendedor que escolheu "Meu
     WhatsApp" pra falar com um lead que não tem WhatsApp confirmado não escolheu
     isso pra sempre: no lead seguinte a régua volta a decidir. Preferência
     guardada no aparelho é como o app passa a mandar tudo pelo lado errado
     depois de UM caso excepcional. */
  const canalPorLead = Object.create(null);
  /* Carimbo de desmentido, também POR LEAD: o servidor disse, para ESTE
     destinatário, que não há WhatsApp confirmado. Some quando o app fecha —
     é uma verdade do momento, não um cadastro. */
  const semWhatsPorLead = Object.create(null);

  const caminhoDoLead = (id) => `/vendas/lead/${encodeURIComponent(String(id || ''))}`;

  /* ------------------------------------------------------------------------
     A PINTURA — uma porta só, porque o rascunho tem que voltar SEMPRE.

     O campo de escrever é o único pedaço desta tela cujo conteúdo não vive no
     seam. Se cada `usar()` daqui pra baixo tivesse que lembrar de devolver o
     texto, o dia em que um deles esquecesse a pessoa perderia a mensagem que
     acabou de escrever — e perderia CALADO, que é a pior versão. Uma porta só.
     ------------------------------------------------------------------------ */
  function pintarConversa(patch) {
    usar('conversas', patch);
    const campo = naCamada('[data-campo="conversa-texto"]');
    if (!campo || typeof campo.value !== 'string') return;
    if (campo.value !== rascunhoDaConversa) campo.value = rascunhoDaConversa;
  }

  /* ------------------------------------------------------------------------
     AS RÉGUAS DE TRADUÇÃO.
     ------------------------------------------------------------------------ */

  /* O selo da bolha é o status que o servidor devolve em CADA mensagem, virado
     em uma palavra. `RECEIVED` (o que ELES mandaram) não tem selo: "entregue"
     numa bolha de entrada seria o app informando o óbvio com a palavra errada.
     Status que eu não conheço também vira '' — inventar rótulo pra estado novo
     do motor é mentir com cara de detalhe. */
  const SELO_DA_MENSAGEM = {
    PENDING: 'enviando',
    QUEUED: 'enviando',
    SENT: 'entregue',
    DELIVERED: 'entregue',
    READ: 'lida',
    FAILED: 'falhou',
  };

  /* A ORIGEM do lead na tag do cabeçalho. Chave que eu não conheço vira VAZIO e
     a metade sobrevivente (a cidade) aparece sozinha — jogar `sourceType` cru na
     tela ("webscraping") é vocabulário de banco na cara do vendedor. */
  const ORIGEM_NA_CONVERSA = {
    webscraping: 'Radar',
    manual: 'Manual',
    anuncio: 'Anúncio',
  };

  /** [lado, texto, hora, selo, id] — o formato que a casca desenha. */
  function traduzirMensagem(m) {
    const msg = m || {};
    const entrando = String(msg.direction || '').toLowerCase() === 'inbound';
    const selo = entrando ? '' : (SELO_DA_MENSAGEM[String(msg.status || '').toUpperCase()] || '');
    return [
      entrando ? 'deles' : 'minha',
      // 🔴 `esc()` NA FONTE. O template do mock interpola cru: uma mensagem que
      // o cliente escreveu com "<" some com a bolha inteira e sem erro nenhum —
      // e aqui o texto é de TERCEIRO por definição.
      esc(msg.content),
      esc(hora(msg.createdAt)),
      selo,
      // Só a bolha que falhou usa o id (é ela que ganha o "Tentar de novo").
      String(msg.id || ''),
    ];
  }

  /* ------------------------------------------------------------------------
     O CABEÇALHO DO LEAD — quem é a pessoa do outro lado.

     🔴 A PRIMEIRA PINTURA SAI DO CARTÃO QUE O DEDO TOCOU, não da rede. O funil
     já tem nome, telefone e etapa DESENHADOS na tela; repetir a pergunta ao
     servidor pra escrever o mesmo cabeçalho deixaria a conversa abrindo com um
     retângulo cinza por meio segundo em cima de um dado que já estava ali. O
     `/card` vem DEPOIS e é quem traz o que o cartão não tem (o veredito de
     WhatsApp do destinatário e a origem).
     ------------------------------------------------------------------------ */
  function cartaoDoFunil(id) {
    let blocos = null;
    try { blocos = DADOS.vendas && DADOS.vendas.blocos; } catch (_) { return null; }
    if (!blocos) return null;
    const chaves = ['overdue', 'today', 'scheduled', 'closed'];
    for (const k of chaves) {
      const lista = Array.isArray(blocos[k]) ? blocos[k] : [];
      const achado = lista.find((c) => c && String(c.id) === String(id));
      if (achado) return achado;
    }
    return null;
  }

  /* O veredito do servidor sobre o destinatário.

     🔴 "NÃO CHECADO" NÃO É "NÃO TEM". O board só confere WhatsApp dos leads que
     vieram do Radar (`ensureWhatsappAvailabilityForRows` roda sobre os de
     `primarySource === 'webscraping'`); o lead cadastrado na mão nunca foi
     conferido e volta `whatsappAvailability: null`. Tratar o desconhecido como
     "não tem" apagaria a posição "Empresa" para a maioria dos leads — o chip da
     empresa viraria um recurso que nunca liga, e o vendedor mandaria tudo pelo
     celular pessoal pra sempre. Então o desconhecido ACENDE, e quem desmente é
     o servidor na hora do envio (400 WHATSAPP_RECIPIENT_*), que é barato: a
     mensagem NÃO sai, a pílula cai pro celular e o recado é o do backend.

     O caminho contrário também vale: conversa com mensagem RECEBIDA prova que o
     número tem WhatsApp, e um "unavailable" velho de um lookup que degradou não
     pode apagar o botão numa conversa que está viva. */
  function temWhatsDoLead(id, disponibilidade, engajamento) {
    if (semWhatsPorLead[id]) return 0;
    if (engajamento && (engajamento.hasInboundMessage || engajamento.hasSuccessfulOutbound)) return 1;
    const estado = String((disponibilidade && disponibilidade.status) || '').toLowerCase();
    return estado === 'unavailable' ? 0 : 1;
  }

  /* ------------------------------------------------------------------------
     A CARGA DA TELA — três portas, três desfechos independentes.

       GET  /vendas/lead/:id/conversation/messages?limit=30  → o FIO + o snapshot
       GET  /companies/me/whatsapp-status                    → o CHIP da empresa
       GET  /vendas/lead/:id/card                            → a ficha do lead

     `allSettled` e não `all`: o chip fora do ar não pode apagar o fio, e a ficha
     que não veio não pode apagar nem um nem outro. Só o FIO manda no esqueleto
     (`carregando`/`semFonte`) — é ele que a tela é.

     ⚠️ O `/card` é a única porta que devolve a ficha de UM lead (não existe
     `GET /vendas/lead/:id` — só PATCH). Ele é caro no servidor: hoje
     `getLeadCardForUser` remonta o BOARD inteiro (240 leads) pra achar um. Está
     anotado como pendência; o app não tem outro caminho.
     ------------------------------------------------------------------------ */
  function carregarConversa() {
    if (!temPonte()) return Promise.resolve();
    const id = leadDaConversa;
    if (!id) {
      /* Tela aberta pela BARRA, sem lead escolhido. Não é rede caída e não é
         "este lead não tem mensagem": é uma tela sem assunto. O honesto é dizer
         isso e não pedir nada ao servidor. */
      pintarConversa({
        carregando: false, semFonte: false,
        conversa: [], vazio: 'Abra um lead no Funil para conversar aqui.',
      });
      return Promise.resolve();
    }
    if (conversaEmVoo && conversaEmVooDe === id) return conversaEmVoo;

    conversaEmVooDe = id;
    conversaEmVoo = Promise.allSettled([
      window.API.get(`${caminhoDoLead(id)}/conversation/messages?limit=30`),
      window.API.get('/companies/me/whatsapp-status'),
      window.API.get(`${caminhoDoLead(id)}/card`),
    ]).then(([fio, zap, ficha]) => {
      // O dedo trocou de lead enquanto isso: esta resposta é de OUTRA conversa e
      // pintá-la poria o fio de um lead no cabeçalho de outro.
      if (leadDaConversa !== id) return;

      const patch = {};

      /* 1. O CHIP. `{}` é "não sei", e não-sei apaga a posição Empresa: prometer
         o chip conectado sem resposta faria a pessoa escrever a mensagem inteira
         pra descobrir depois que nada saiu. O celular sempre funciona — é pra
         ele que o desconhecido cai. */
      const conectado = zap.status === 'fulfilled' && zap.value && zap.value.connected === true;
      patch.chip = conectado ? { conectado: 1 } : {};

      /* 2. A FICHA. Ela refina o cabeçalho que o cartão já pintou e traz o
         veredito de WhatsApp do destinatário. Se não veio, o cabeçalho do cartão
         FICA — falha de uma porta não apaga o que a outra já escreveu. */
      let disponibilidade = null;
      if (ficha.status === 'fulfilled' && ficha.value && ficha.value.lead) {
        const l = ficha.value.lead;
        fichaCruaDoLead = l;
        disponibilidade = l.whatsappAvailability || null;
        const nome = String(l.name || '').trim();
        const fone = telefoneBonito(l.phone);
        if (nome) { patch.nome = esc(nome); patch.ini = esc(iniciais(nome)); }
        if (fone) patch.telefone = esc(fone);
        if (l.statusLabel) patch.etapa = esc(l.statusLabel);
        patch.origem = esc([
          ORIGEM_NA_CONVERSA[String(l.primarySource || l.sourceType || '').toLowerCase()],
          local(l.city, l.state),
        ].filter(Boolean).join(' · '));
      }

      /* 3. O FIO. Ele é o dono do esqueleto e do aviso de fonte. */
      if (fio.status === 'fulfilled' && fio.value) {
        const r = fio.value;
        const cruas = Array.isArray(r.messages) ? r.messages : [];
        fioCruDaConversa = cruas;
        conversaExiste = !!(r.conversation && r.conversation.exists);
        patch.conversa = cruas.map(traduzirMensagem);
        /* Vazio porque o SERVIDOR disse vazio — cena própria, e nunca a mesma do
           "não consegui carregar". Um lead que ninguém chamou ainda tem fio
           vazio de verdade, e isso é notícia, não defeito. */
        patch.vazio = cruas.length ? '' : 'Nenhuma mensagem ainda';
        patch.temWhats = temWhatsDoLead(id, disponibilidade, r.engagement);
        pintarConversa(Object.assign({}, fonteVoltou, patch));
      } else {
        // O chip e a ficha ainda valem: pinta o que chegou e deixa o portão de
        // fontes decidir o esqueleto do fio (só apaga na PRIMEIRA carga).
        // O `reason` viaja junto: 403 de módulo e rede no chão são cenas
        // opostas, e aqui a errada manda a pessoa esperar por uma porta que
        // está TRANCADA.
        pintarConversa(patch);
        fonteCaiu('conversas', fio.reason);
      }
    }).finally(() => {
      // Só o voo ATUAL se apaga: um voo velho terminando depois não pode limpar
      // a vaga de quem já está no ar.
      if (conversaEmVooDe === id) { conversaEmVoo = null; conversaEmVooDe = ''; }
    });

    return conversaEmVoo;
  }

  /* ------------------------------------------------------------------------
     ABRIR O LEAD — o toque no cartão do Funil e na linha da Agenda.
     ------------------------------------------------------------------------ */
  function abrirConversaDoLead(el) {
    const id = String((el && el.dataset && el.dataset.lead) || '').trim();
    if (!id) return;                       // linha sem id não abre o nada

    const deOnde = telaAtual();
    leadDaConversa = id;
    rascunhoDaConversa = '';
    fioCruDaConversa = [];
    /* A ficha do lead ANTERIOR morre aqui. Sem esta linha, tocar num lead novo e
       abrir a ficha antes de a resposta chegar mostraria o CNPJ do lead de
       trás — mentira com cara de app pronto, e num dado que termina em ligação
       telefônica. */
    fichaCruaDoLead = null;
    conversaExiste = false;

    /* O CABEÇALHO NASCE NO MESMO QUADRO DO DEDO, com o que já está pintado no
       cartão. `chip:{}` e `temWhats:0` nascem fechados: até o servidor falar, a
       pílula abre em "Meu WhatsApp" — o lado que funciona sem saber de nada. */
    const c = cartaoDoFunil(id) || {};
    usar('conversas', {
      // Quem abriu a conversa de dentro da Agenda não pode cair no Funil ao
      // voltar. `volta` é a porta de entrada, igual à ficha de empresa.
      volta: deOnde && deOnde !== 'conversas' ? deOnde : 'vendas',
      lead: id,
      ini: c.ini || '', nome: c.nome || '', telefone: c.fone || '',
      etapa: c.etapa || '', origem: c.local || '',
      temWhats: 0, chip: {}, canal: canalPorLead[id] || '',
      enviando: 0, vazio: '', conversa: [],
      carregando: true, semFonte: false,
    });

    if (typeof window.ir !== 'function') return;
    /* Já ESTAR na tela não dispara o gancho de abrir (`anunciarTela` só anuncia
       troca), e sem isto trocar de lead de dentro da conversa deixaria o novo
       lead no esqueleto para sempre. */
    if (telaAtual() === 'conversas') { carregarConversa(); return; }
    window.ir('conversas');
    /* 🔴 `ir()` RECUSA CALADO quando o admin desligou o módulo — e cartão que
       não faz nada é exatamente o defeito que custou o cliente 46 (39 respostas
       403 em 65 s, e a tela sem uma palavra). A frase é a MESMA do `humano()`:
       um dono só pra ela, senão duas telas explicam o mesmo bloqueio de dois
       jeitos. */
    if (telaAtual() === 'conversas') return;
    const erro = new Error('');
    erro.body = { code: 'MODULE_ACCESS_DENIED' };
    avisoErro(erro);
  }

  /* ------------------------------------------------------------------------
     ENVIAR — UMA função, DOIS caminhos.

     🔴 UMA SÓ, e é por isso que ela recebe o destino em vez de existir em duas
     cópias: o dia em que o "carimba a tentativa" mudar, duas cópias mudam uma
     de cada vez e a metade esquecida é a que mente no funil. As diferenças
     entre os caminhos são pequenas e ficam VISÍVEIS lado a lado aqui dentro.

     · 'empresa'  → o chip do motor, pela fachada do Vendas. A mensagem sai do
                    número da empresa e o servidor escolhe o chip.
     · 'celular'  → o intent nativo (`openWhatsapp`), que abre o WhatsApp da
                    pessoa com o número do lead. Nada sai daqui: quem escreve e
                    aperta enviar é ela, lá dentro.
     ------------------------------------------------------------------------ */
  function enviarMensagem(destino, corpoPronto, noTocado) {
    const id = leadDaConversa;
    if (!id || !temPonte()) return;

    if (destino === 'celular') {
      let fone = '';
      try { fone = String((DADOS.conversas && DADOS.conversas.telefone) || ''); } catch (_) {}
      if (!fone) return;                    // sem alvo não há intent

      /* 🔴 O ÚNICO VERBO DE REDE DESTE APP QUE NÃO TINHA GUARDA — medido em
         19/08: TRÊS toques = três intents do WhatsApp e três POSTs de
         `attempt`. Ele saía por cima do `enviando` (que ficava lá embaixo, no
         caminho da empresa) e não chamava `usar()`, então a tela não mudava um
         PIXEL depois do dedo: nada dizia "já peguei", e num aparelho que leva
         meio segundo pra trocar de app o segundo toque é o comportamento
         normal de qualquer pessoa. Três `attempt` viram três carimbos de
         contato no mesmo lead — e é o carimbo que decide se a vendedora manda
         de novo pro mesmo contato frio, que é a máquina de ban desta casa.

         A guarda é a MESMA dos outros verbos, e são duas camadas no MESMO
         quadro do dedo: o seam (`enviando:1`, que sobrevive ao repinte e é o
         que a casca lê pra desenhar o botão travado) e o nó tocado (reação
         instantânea, antes de qualquer pintura). Ela sai por RESPOSTA do
         servidor, nunca por relógio — ver o desfecho do `attempt` lá embaixo. */
      let ocupadoCel = 0;
      try { ocupadoCel = Number((DADOS.conversas && DADOS.conversas.enviando) || 0); } catch (_) {}
      if (ocupadoCel) return;
      if (noTocado) {
        noTocado.disabled = true;
        noTocado.setAttribute('aria-busy', 'true');
        noTocado.classList.add('ocupado');
      }
      pintarConversa({ enviando: 1 });

      /* 🔴 O PREFIXO 55 MORA NO KOTLIN (`NativeAppBridge.openWhatsapp`) e não se
         repete aqui: duas cópias da mesma regra de DDI divergem no primeiro
         ajuste e o app passa a discar um número que não existe. Vai o telefone
         como está escrito na tela; o native limpa o que não é dígito.

         🔴 O TEXTO QUE VAI JUNTO É O DELA, E SÓ ELE. Quando o servidor recusa o
         destinatário, a pílula cai pro celular e o campo de escrever SOME da
         tela — com o parágrafo que a pessoa acabou de digitar dentro. Sem esta
         linha ela redigitaria tudo no WhatsApp, e redigitar é como a mensagem
         chega diferente da que ela revisou. Aqui não se monta template nenhum:
         se ela não escreveu nada, vai vazio e ela escreve lá. */
      try { window.HBX.whatsapp(fone, rascunhoDaConversa); } catch (_) {}
      /* A TELEMETRIA VEM DEPOIS DO INTENT, E CALADA. O WhatsApp já abriu na cara
         da pessoa: um pop-up vermelho aqui diria que não aconteceu o que ela
         está vendo acontecer. Se este POST falhar, o card fica sem a marca de
         contato — e é o servidor que conserta na próxima leitura, não a tela.
         Ele é o que move o card pra "Contato feito": sem ele a vendedora
         reabre a lista, lê "Sem contato" e manda de novo pro mesmo contato
         frio, que é a máquina de ban. */
      window.API.post(`${caminhoDoLead(id)}/attempt`, { channel: 'whatsapp_pessoal' })
        .catch(() => {})
        /* A trava sai quando o SERVIDOR responde — dando certo ou dando errado.
           Um `setTimeout` aqui devolveria o toque a uma tentativa que talvez já
           tenha sido carimbada, que é exatamente o defeito que esta guarda
           existe pra matar. E ela só solta o botão do lead que ela travou: uma
           resposta velha chegando depois da troca de lead não pode destravar a
           tela de outra conversa. */
        .then(() => { if (leadDaConversa === id) pintarConversa({ enviando: 0 }); });
      return;
    }

    /* 🔴 O CORPO É O QUE ESTÁ PINTADO — sempre. No envio normal ele vem do nó
       vivo (o que a pessoa está lendo enquanto toca), e no reenvio ele vem da
       mensagem que falhou, tal como o servidor a devolveu. Texto montado por
       código nunca entra: mensagem que a pessoa não escreveu é a definição de
       robô, e robô é o que queima chip. */
    const doNo = naCamada('[data-campo="conversa-texto"]');
    const corpo = String(
      corpoPronto != null ? corpoPronto : (doNo && typeof doNo.value === 'string' ? doNo.value : ''),
    ).trim();
    if (!corpo) return;

    let ocupado = 0;
    try { ocupado = Number((DADOS.conversas && DADOS.conversas.enviando) || 0); } catch (_) {}
    if (ocupado) return;                    // um envio por vez, e o teclado é rápido

    // O "ocupado" entra no MESMO quadro do dedo: campo travado e botão em
    // espera antes de qualquer resposta de rede.
    pintarConversa({ enviando: 1 });

    /* A conversa precisa EXISTIR antes da mensagem (o servidor recusa com "Abra
       a conversa antes de enviar a mensagem"). Criar é POST na mesma fachada —
       e ele é quem devolve 503 quando o chip está no chão, antes de a mensagem
       chegar perto do motor. */
    const abrir = conversaExiste
      ? Promise.resolve()
      : window.API.post(`${caminhoDoLead(id)}/conversation`, {}).then((r) => {
        conversaExiste = !!(r && r.conversation && r.conversation.exists);
      });

    abrir
      .then(() => window.API.post(`${caminhoDoLead(id)}/conversation/message`, { body: corpo }))
      .then((r) => {
        if (leadDaConversa !== id) return;
        // Saiu: o campo esvazia. O rascunho é zerado ANTES da pintura porque é
        // ele que a pintura devolve ao nó.
        rascunhoDaConversa = '';
        const patch = { enviando: 0 };
        /* O POST responde com o fio inteiro relido. Quando ele não responde
           (o envio deu certo e só a releitura falhou), a tela FICA como está —
           zerar a lista aqui apagaria a conversa depois de um envio bem
           sucedido, que é a mentira mais cara possível nesta tela. */
        const cruas = r && Array.isArray(r.messages) ? r.messages : null;
        if (cruas) {
          fioCruDaConversa = cruas;
          patch.conversa = cruas.map(traduzirMensagem);
          patch.vazio = cruas.length ? '' : 'Nenhuma mensagem ainda';
        }
        if (r && r.conversation) conversaExiste = !!r.conversation.exists;
        pintarConversa(patch);
      })
      .catch((erro) => {
        if (leadDaConversa !== id) return;
        const codigo = String((erro && erro.body && erro.body.code) || '');
        const status = Number((erro && erro.status) || 0);
        const patch = { enviando: 0 };

        /* 🔴 A RECUSA CAI A PÍLULA PRO CELULAR E NÃO EXPLICA NADA ALÉM DO QUE O
           SERVIDOR DISSE. São os dois "não dá por aqui" que o backend sabe e o
           app não tinha como saber antes:
             · 400 WHATSAPP_RECIPIENT_* — este número não tem WhatsApp confirmado
               (carimba o desmentido NESTE lead, e só nele);
             · 503                      — o chip da empresa está desconectado.
           Nos dois casos a mensagem NÃO SAIU e o rascunho fica onde está: a
           pessoa toca "Abrir no meu WhatsApp" e leva o mesmo texto na mão. */
        if (codigo.indexOf('WHATSAPP_RECIPIENT') === 0) {
          semWhatsPorLead[id] = 1;
          patch.temWhats = 0;
          patch.canal = 'celular';
          canalPorLead[id] = 'celular';
        } else if (status === 503) {
          patch.chip = {};
          patch.canal = 'celular';
        }
        pintarConversa(patch);
        avisoErro(erro);
      });
  }

  /* ==========================================================================
     ABRIR FICHA — o botão que estava desenhado em DOIS lugares e não tinha dono
     em ponte nenhuma (medido em 19/08: o dedo tocava, nada acontecia, e o
     console gritava "ação sem dono"). Ele aparece no cartão do cabeçalho e no
     aviso "Sem telefone", que é justamente o lead que não dá pra chamar.

     🔴 O QUE ELE ABRE JÁ ESTÁ NA MÃO — e é exatamente por isso que ele existe.
     O `/vendas/lead/:id/card` devolve muito mais do que os quatro campos que o
     cabeçalho pinta: CNPJ, razão social, o nome do dono, os e-mails achados e
     os OUTROS telefones do enriquecimento. Nada disso tem tela neste app, e o
     caso do "Sem telefone" é o que prova o custo: o cartão mostra "sem
     telefone" enquanto a resposta traz três números em `phones[]`. O lead
     parecia morto por falta de tela, não por falta de dado.

     🔴 E É LEITURA, SEM VERBO DE REDE. Portão, não tela nova: tela nova custa
     desenho, rota, aula e podar; o portão é a superfície que esta ponte já usa
     pra dizer número de verdade. Nenhum botão daqui gasta crédito, manda
     mensagem ou grava nada — quem faz isso continua sendo a pílula lá fora.
     ========================================================================== */
  /** Uma linha do corpo do portão, na MESMA peça que a ficha de empresa usa
   *  (`.rowline`: rótulo à esquerda, valor à direita, risco tracejado entre
   *  duas). Peça nova pra dizer a mesma coisa é como duas telas passam a
   *  mostrar o mesmo dado de dois jeitos.
   *  🔴 Campo sem fonte NÃO VIRA LINHA (Lei do IF): "CNPJ: não informado" é
   *  ruído que empurra pra fora da tela a informação que a pessoa veio ver. */
  const linhaDaFicha = (rotulo, valor) => {
    const v = String(valor == null ? '' : valor).trim();
    return v
      ? `<div class="rowline"><span style="color:var(--ink-2)">${esc(rotulo)}</span><b style="color:var(--ink)">${esc(v)}</b></div>`
      : '';
  };

  function abrirFichaDoLead() {
    if (typeof window.portao !== 'function') return;
    const l = fichaCruaDoLead;
    /* Sem ficha não se inventa ficha. Pode ser que a porta do `/card` tenha
       caído ou que a conversa tenha sido aberta pela barra, sem lead — e um
       portão vazio com título de ficha é pior que a recusa honesta. */
    if (!l) {
      window.portao({
        tom: 'info', ico: 'alert', titulo: 'Ficha ainda não chegou',
        sub: 'Os dados desta empresa não vieram do servidor. Puxe a conversa de novo e tente outra vez.',
        acoes: [['Fechar', '', true]],
      });
      return;
    }

    /* Os telefones: o principal e os que o enriquecimento achou, sem repetir o
       que já está no cabeçalho. É esta lista que salva o lead "sem telefone" —
       ela é o motivo de o aviso ter um botão. */
    const jaMostrado = String(l.phone || '').replace(/\D/g, '');
    const outros = (Array.isArray(l.phones) ? l.phones : [])
      .map((p) => String((p && (p.phone || p.number)) || p || ''))
      .filter((p) => p && p.replace(/\D/g, '') !== jaMostrado)
      .map((p) => telefoneBonito(p) || p);
    const emails = (Array.isArray(l.emails) ? l.emails : [])
      .map((e) => String((e && (e.email || e.address)) || e || '').trim())
      .filter(Boolean);

    /* 🔴 TETO EM CADA LISTA, e ele é de TELA, não de gosto. O portão não rola
       (`.portao` é uma caixa centrada): oito telefones empurrariam o botão
       "Fechar" pra fora do vidro e o portão viraria uma armadilha — o defeito
       que o "portão sem saída é beco" desta casa já nomeou. */
    const corpo = [
      linhaDaFicha('Razão social', l.razaoSocial),
      linhaDaFicha('CNPJ', l.cnpj),
      linhaDaFicha('Situação', l.companySituation),
      linhaDaFicha('Responsável', l.ownerName),
      linhaDaFicha('Telefone', telefoneBonito(l.phone)),
      outros.slice(0, 3).map((p) => linhaDaFicha('Outro telefone', p)).join(''),
      emails.slice(0, 2).map((e) => linhaDaFicha('E-mail', e)).join(''),
      linhaDaFicha('Onde', local(l.city, l.state)),
      linhaDaFicha('Tentativas', l.attemptCount ? String(l.attemptCount) : ''),
    ].filter(Boolean).join('');

    window.portao({
      tom: 'info', ico: 'store',
      // 🔴 `esc()` no TÍTULO: razão social da RFB vem com `&` ("COMÉRCIO & CIA")
      // e o template do portão interpola cru — um `<` some com a caixa inteira.
      titulo: esc(String(l.name || 'Ficha do lead')),
      /* O subtítulo é a NOTÍCIA do caso vazio: sem ele o portão abriria mudo
         justamente para quem tocou no aviso "Sem telefone". */
      sub: corpo
        ? ''
        : 'O servidor não devolveu nenhum outro dado desta empresa além do que já está na tela.',
      corpo,
      acoes: [['Fechar', '', true]],
    });
  }

  /* ------------------------------------------------------------------------
     O QUE O DEDO FAZ NESTA TELA.
     ------------------------------------------------------------------------ */
  registrarTelas({ conversas: carregarConversa });

  registrarAcoes({
    // O cartão do Funil e a linha da Agenda apontam pro mesmo verbo.
    'abrir-lead': abrirConversaDoLead,

    /* A PÍLULA. Ela só carimba a preferência — quem decide se a posição
       "Empresa" existe é a casca, a cada pintura, com as duas bandeiras do
       servidor. O botão apagado vem `disabled` do desenho, então este handler
       nunca recebe um "empresa" impossível. */
    'canal-conversa': (el) => {
      const canal = String((el && el.dataset && el.dataset.canal) || '') === 'empresa' ? 'empresa' : 'celular';
      if (leadDaConversa) canalPorLead[leadDaConversa] = canal;
      pintarConversa({ canal });
    },

    'enviar-conversa': () => enviarMensagem('empresa'),
    /* O NÓ TOCADO viaja: é nele que o "ocupado" entra no MESMO quadro do dedo,
       antes de qualquer repinte — ver a guarda dentro do `enviarMensagem`. */
    'abrir-whats-pessoal': (el) => enviarMensagem('celular', null, el),

    /* Os DOIS lugares em que a casca desenha "Abrir ficha" (o cartão do
       cabeçalho e o botão do aviso "Sem telefone") apontam pro mesmo verbo —
       um dono só, senão as duas portas explicam o mesmo lead de dois jeitos. */
    'abrir-ficha-lead': abrirFichaDoLead,

    /* 🔴 REENVIO É UM TOQUE DE GENTE, UMA VEZ, COM O MESMO CORPO. O botão trava
       no mesmo quadro do dedo (`disabled`) porque o repinte só chega depois da
       primeira resposta de rede — e dois toques rápidos aqui seriam a mesma
       mensagem duas vezes no WhatsApp do cliente, que é exatamente o padrão que
       baniu chip nesta casa. Nada de fila, nada de retry automático. */
    'reenviar-mensagem': (el) => {
      const alvo = String((el && el.dataset && el.dataset.msg) || '');
      const original = fioCruDaConversa.find((m) => m && String(m.id) === alvo);
      if (!original) return;
      const corpo = String(original.content || '').trim();
      if (!corpo) return;
      if (el) { el.disabled = true; el.classList.add('aguarde'); }
      enviarMensagem('empresa', corpo);
    },

    'recarregar-conversas': () => retentar('conversas', carregarConversa),
  });

  registrarCampos({
    /* SEM `espera` DE PROPÓSITO: este campo não fala com a rede nem escreve no
       seam — ele só mantém o rascunho vivo pra que a pintura possa devolvê-lo ao
       nó. Debounce aqui só atrasaria a cópia de uma variável.
       `aoEnter` existe porque a tecla de confirmar do teclado do Android é um
       botão de verdade na cara de quem está escrevendo: num campo de conversa
       ela significa "enviar", e ignorá-la é deixar a pessoa batendo numa tecla
       morta. O guarda de `enviando` lá dentro cobre o Enter seguido do toque. */
    'conversa-texto': {
      ao: (valor) => { rascunhoDaConversa = String(valor || ''); },
      aoEnter: () => enviarMensagem('empresa'),
    },
  });
