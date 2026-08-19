
  /* ==========================================================================
     AGENDA — a fila do dia, com UM verbo: fechar.

     UMA PORTA SÓ, E ELA JÁ TRAZ OS TRÊS BALDES:
       GET  /atividades/agenda?janela=todas&incluirConcluidas=1
       POST /atividades/:id/concluir     (resultado: sim | nao | remarcar)

     🔴 TROCAR DE CHIP NÃO FALA COM A REDE. Medido no `listForUser`: ele IGNORA
     o parâmetro `janela` e devolve `counts` + atrasadas + hoje + semana numa
     resposta só. Chip que dispara fetch numa rede ruim vira esqueleto piscando
     três vezes pela MESMA resposta que já está na mão — e o `?janela=todas` vai
     escrito assim, por extenso, pra dizer em voz alta o que se está pedindo.

     🔴 `incluirConcluidas=1` NÃO É ENFEITE: sem ele o servidor devolve só
     pendentes e "concluídas hoje" ficaria vazio pra sempre. A célula some
     sozinha quando o número é zero — zero mentiroso é pior que célula ausente.

     🔴 O TEXTO DA DATA NASCE AQUI, NUNCA NA TELA. `vencimento` chega em ISO e
     vira "Hoje"/"Sexta · 15/08"/"09:30 · 15 min" nesta ponte, no fuso da
     OPERAÇÃO (São Paulo) — o servidor roda em UTC e o aparelho pode estar em
     qualquer fuso. Duas réguas do mesmo fuso discordam entre 21 h e a
     meia-noite, e aí a agenda mostra o dia errado exatamente na hora em que o
     vendedor está fechando o dia.
     ========================================================================== */

  /* Os quatro tipos que o `ATIVIDADE_TIPOS` do servidor aceita. Tipo que não
     está nesta lista vai VAZIO: o desenho já tem o caso ('Tarefa', glifo de
     nota), e inventar um quinto rótulo aqui seria a tela ensinando um
     vocabulário que o backend recusa no próximo POST. */
  const TIPOS_DA_AGENDA = ['ligacao', 'reuniao', 'visita', 'mensagem'];
  /* 🔴 SÃO PAULO NÃO TEM HORÁRIO DE VERÃO DESDE 2019 — por isso o deslocamento
     é constante e pode ser escrito. Ele existe porque "remarcar pra amanhã" tem
     que virar um instante ANCORADO no fuso da operação: mandar "2026-08-20T09:00"
     sem offset faz o servidor (UTC) marcar a tarefa pras 06:00 de São Paulo. */
  const FUSO_DA_AGENDA = '-03:00';

  let agendaEmVoo = null;
  let agendaCrua = null;                  // a resposta CRUA — o remarcar relê o vencimento daqui
  const agendaFechando = new Set();       // reentrância: um id, uma conclusão

  /** "09:30" no fuso da operação. NÃO é o `hora()` do núcleo: aquele lê o
   *  relógio do APARELHO (`getHours`), e a agenda é o dia de São Paulo. Com o
   *  celular em outro fuso, o `hora()` mostraria a ligação das 09:00 marcada
   *  pras 05:00 — e o remarcar gravaria essa hora errada de volta no servidor. */
  const horaSpDaAgenda = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  };

  /** "Sexta" — o dia da semana de um AAAA-MM-DD. Montado em UTC de propósito:
   *  `new Date('2026-08-19')` é meia-noite UTC, que no Brasil ainda é o dia 18.
   *  O "-feira" cai porque este texto é CABEÇALHO DE GRUPO ("Sexta · 15/08"),
   *  não frase: é assim que o desenho o mostra, e é assim que se escreve um dia
   *  da semana em cima de uma lista. A data por extenso do subtítulo (que é
   *  frase) continua com ele, e as duas estão certas em registros diferentes. */
  const semanaDaAgenda = (ymd) => {
    const [a, m, d] = String(ymd || '').split('-').map(Number);
    if (!a || !m || !d) return '';
    const x = new Date(Date.UTC(a, m - 1, d));
    const txt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long' })
      .format(x).replace(/-feira$/, '');
    return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : '';
  };

  const somarDiasNaAgenda = (ymd, dias) => {
    const [a, m, d] = String(ymd || '').split('-').map(Number);
    if (!a || !m || !d) return '';
    const x = new Date(Date.UTC(a, m - 1, d) + (Number(dias) || 0) * 86400000);
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
  };

  /* O atraso é contado em DIAS DE CALENDÁRIO de São Paulo, não em 24 h
     corridas: às 23 h, uma tarefa das 08 h de hoje está atrasada — mas não "há
     1 dia". O servidor já disse QUE está atrasada (`atrasada`); aqui só se diz
     HÁ QUANTO, que é o que muda a ordem de quem ligar primeiro. */
  const atrasoDaAgenda = (ymd, hoje) => {
    if (!ymd || !hoje) return '';
    const dias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${ymd}T12:00:00Z`)) / 86400000);
    if (!isFinite(dias) || dias <= 0) return 'atrasada';
    return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
  };

  function traduzirAtividadeDaAgenda(a) {
    const x = a || {};
    const iso = x.vencimento || '';
    const ymd = diaEmSp(iso);
    const hoje = diaOperacional();
    const inteiro = !!x.diaInteiro;
    const minutos = Math.trunc(Number(x.duracao) || 0);
    const hm = horaSpDaAgenda(iso);
    const curto = diaCurto(iso);

    /* O cabeçalho do DIA viaja DENTRO da linha (é o desenho que agrupa): quem
       sabe onde o dia troca é quem ordenou. "Hoje" em vez da data porque no
       balde de hoje a data seria a legenda do óbvio. */
    const dia = !ymd ? '' : ymd === hoje ? 'Hoje' : [semanaDaAgenda(ymd), curto].filter(Boolean).join(' · ');
    /* O QUANDO responde perguntas diferentes em cada balde: hoje é HORA (e
       quanto dura); fora de hoje é o DIA e a hora. "dia inteiro" é o que o
       servidor chama de `duracao: null` — tarefa sem hora marcada. */
    const quando = !iso ? ''
      : ymd === hoje
        ? (inteiro ? 'dia inteiro' : [hm, minutos > 0 ? `${minutos} min` : ''].filter(Boolean).join(' · '))
        : (inteiro ? [curto, 'dia inteiro'].filter(Boolean).join(' · ') : [curto, hm].filter(Boolean).join(' · '));

    return {
      id: String(x.id || ''),
      // sem lead a linha não abre conversa nenhuma — e o desenho já trata o vazio
      lead: String(x.leadId || ''),
      nome: esc(String(x.leadNome || '').trim()),
      titulo: esc(String(x.titulo || '').trim()),
      tipo: TIPOS_DA_AGENDA.indexOf(String(x.tipo || '')) >= 0 ? String(x.tipo) : '',
      dia,
      quando,
      /* O selo âmbar é do DADO, não da aba: se um atrasado vazar pro balde de
         hoje (a tarefa das 09 h vista às 11 h), ele chega marcado sozinho. */
      atraso: x.atrasada ? atrasoDaAgenda(ymd, hoje) : '',
    };
  }

  function vestirAgendaDoDia(r) {
    agendaCrua = r;
    const balde = (k) => (Array.isArray(r && r[k]) ? r[k] : []);
    const contas = (r && r.counts) || {};
    const hoje = diaOperacional();
    const agora = Date.now();

    /* CONCLUÍDAS HOJE é do dia de SÃO PAULO, não das últimas 24 h: a lista vem
       com tudo que já foi fechado, e "4 concluídas hoje" no fim da tarde só
       vale se "hoje" for o mesmo hoje do resto da tela. */
    const feitas = balde('concluidas').filter((c) => c && c.realizadaEm && diaEmSp(c.realizadaEm) === hoje).length;
    /* A PRÓXIMA é a primeira de hoje com hora marcada que ainda NÃO passou. A
       lista já vem ordenada por vencimento, então a primeira que sobra é ela.
       Tarefa "dia inteiro" não tem hora e por isso não pode ser a próxima —
       seria uma hora inventada no lugar mais visível do rodapé. */
    const proxima = balde('hoje')
      .filter((a) => a && !a.diaInteiro && a.vencimento && Date.parse(a.vencimento) >= agora)
      .map((a) => horaSpDaAgenda(a.vencimento))
      .filter(Boolean)[0] || '';

    usar('agenda', Object.assign({}, fonteVoltou, {
      /* Os chips contam o que o SERVIDOR contou (`counts`), não o tamanho das
         listas que couberam na tela — são duas perguntas diferentes. */
      contas: {
        atrasadas: Math.max(0, Math.trunc(Number(contas.atrasadas) || 0)),
        hoje: Math.max(0, Math.trunc(Number(contas.hoje) || 0)),
        semana: Math.max(0, Math.trunc(Number(contas.semana) || 0)),
      },
      listas: {
        atrasadas: balde('atrasadas').map(traduzirAtividadeDaAgenda),
        hoje: balde('hoje').map(traduzirAtividadeDaAgenda),
        semana: balde('semana').map(traduzirAtividadeDaAgenda),
      },
      feitasHoje: feitas ? String(feitas) : '',
      proxima,
    }));
  }

  function carregarAgenda() {
    if (!temPonte()) return Promise.resolve();
    // Um pedido por vez: dois gatilhos que caem juntos (o chip e o "Tentar de
    // novo" tocado duas vezes) receberiam a MESMA promessa em vez de duas idas.
    if (agendaEmVoo) return agendaEmVoo;
    agendaEmVoo = window.API.get('/atividades/agenda?janela=todas&incluirConcluidas=1')
      .then((r) => {
        if (!r || !r.counts) { fonteCaiu('agenda'); return; }
        vestirAgendaDoDia(r);
      })
      .catch((e) => fonteCaiu('agenda', e))
      .finally(() => { agendaEmVoo = null; });
    return agendaEmVoo;
  }

  const acharAtividadeCruaDaAgenda = (id) => {
    if (!agendaCrua) return null;
    const alvo = String(id || '');
    return ['atrasadas', 'hoje', 'semana']
      .reduce((achado, k) => achado || (Array.isArray(agendaCrua[k]) ? agendaCrua[k] : []).find((a) => String(a && a.id) === alvo) || null, null);
  };

  /* 🔴 REMARCAR PRESERVA A HORA DO VENCIMENTO E ANDA O DIA A PARTIR DE HOJE —
     não a partir do vencimento antigo. "Amanhã" numa tarefa atrasada há 4 dias
     que somasse 1 dia ao vencimento nasceria ATRASADA DE NOVO, no mesmo balde,
     e o toque não teria resolvido nada. A hora fica: quem marcou uma ligação
     pras 09:00 quer as 09:00 de amanhã, não a hora em que apertou o botão. */
  function remarcarParaISONaAgenda(id, dias) {
    const orig = acharAtividadeCruaDaAgenda(id);
    const hm = horaSpDaAgenda(orig && orig.vencimento) || '09:00';
    const alvo = somarDiasNaAgenda(diaOperacional(), dias);
    if (!alvo) return '';
    return `${alvo}T${hm}:00${FUSO_DA_AGENDA}`;
  }

  function concluirAtividadeDaAgenda(el) {
    if (!temPonte()) return;
    const d = (el && el.dataset) || {};
    const id = String(d.atividade || '');
    const resultado = String(d.resultado || '');
    if (!id || !resultado) return;
    if (agendaFechando.has(id)) return;

    const corpo = { resultado };
    if (resultado === 'remarcar') {
      const dias = Math.trunc(Number(d.dias) || 0);
      // Sem dia escolhido o "Remarcar" é só a pergunta — quem fecha é o chip.
      if (dias <= 0) return;
      const quando = remarcarParaISONaAgenda(id, dias);
      if (!quando) return;
      corpo.remarcarPara = quando;
    }

    agendaFechando.add(id);
    if (el) { el.disabled = true; el.classList.add('aguarde'); }
    window.API.post(`/atividades/${encodeURIComponent(id)}/concluir`, corpo)
      .then(() => {
        usar('agenda', { concluindo: '', remarcando: '' });
        return carregarAgenda();
      })
      .catch((erro) => {
        /* 🔴 "ATIVIDADE JA CONCLUIDA" NÃO É ERRO DE REDE — é a linha que outro
           aparelho (ou o computador) fechou enquanto esta tela estava aberta. O
           servidor responde 400, e uma caixa vermelha aqui acusaria a pessoa de
           um defeito que não existe: o trabalho ESTÁ feito. A linha some calada
           e a lista se refaz com a verdade. */
        if (erro && erro.status === 400 && /j[aá] conclu/i.test(String(erro.message || ''))) {
          usar('agenda', { concluindo: '', remarcando: '' });
          return carregarAgenda();
        }
        avisoErro(erro);
        return null;
      })
      .finally(() => { agendaFechando.delete(id); });
  }

  /* ------------------------------------------------------------------------
     O QUE O DEDO FAZ NESTA TELA.
     ------------------------------------------------------------------------ */
  registrarTelas({ agenda: carregarAgenda });

  registrarAcoes({
    // O chip da janela é filtro de OLHO: os três baldes já vieram juntos.
    'janela-agenda': (el) => {
      const j = String((el && el.dataset && el.dataset.janela) || 'hoje');
      usar('agenda', { janela: j });
    },
    /* Abrir o painel de resultado é um interruptor, e fechar é o mesmo toque —
       o desenho já troca o ícone (check ↔ ×) e o rótulo (Concluir ↔ Fechar).
       Fechar também apaga o `remarcando`: sem isso, reabrir outra linha nasceria
       com os chips de dia de uma linha que nem está mais aberta. */
    'abrir-concluir': (el) => {
      const id = String((el && el.dataset && el.dataset.atividade) || '');
      let aberta = '';
      try { aberta = String((DADOS.agenda && DADOS.agenda.concluindo) || ''); } catch (_) {}
      usar('agenda', { concluindo: aberta === id ? '' : id, remarcando: '' });
    },
    // "Remarcar" é o único resultado com um degrau a mais: remarcar sem data é
    // só adiar a pergunta. Este toque abre os dias; quem conclui é o chip.
    'atividade-remarcar': (el) => {
      const id = String((el && el.dataset && el.dataset.atividade) || '');
      if (id) usar('agenda', { remarcando: id });
    },
    'concluir-atividade': (el) => concluirAtividadeDaAgenda(el),
    'recarregar-agenda': () => retentar('agenda', carregarAgenda),

    /* 🔴 "NOVA TAREFA" NÃO PODE NASCER AQUI, E A FRASE É A CORREÇÃO. O
       `CreateAtividadeDto` exige `leadId` (e o service confere o lead no escopo
       da empresa): tarefa é sempre DE ALGUÉM. Esta tela não tem — e não vai ter
       — um seletor de lead: o desenho é uma FILA, não um formulário. Botão que
       abrisse um campo de texto aqui terminaria em 400 ("leadId obrigatório")
       depois da pessoa ter digitado tudo, que é a pior ordem possível pra dar
       uma notícia. Então o toque diz onde a tarefa nasce e leva pra lá.
       (A agenda CRIA tarefa por outro caminho, e ele já está de pé: concluir
       com "Remarcar" grava a próxima no mesmo POST, com o histórico junto.) */
    'nova-atividade': () => {
      if (typeof window.portao !== 'function') return;
      window.portao({
        tom: 'info', ico: 'calendar', titulo: 'Toda tarefa é de um lead',
        sub: 'Abra o card da empresa no funil e marque o retorno por lá — ele aparece aqui na hora certa.',
        acoes: [['Fechar', ''], ['Abrir o funil', 'principal', false, 'agenda-ir-funil']],
        classe: 'duas',
      });
    },
    'agenda-ir-funil': () => { if (typeof window.ir === 'function') window.ir('vendas'); },
  });
