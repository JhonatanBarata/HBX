
  /* ==========================================================================
     AJUSTES — o índice e as quatro telas de dentro (perfil, WhatsApp, módulos,
     créditos). É a porta de tudo neste app: por lei da casca, Ajustes NUNCA some
     da barra (murar esta porta seria prender a pessoa).

     CADA TELA TEM A SUA PORTA E O SEU DESFECHO:
       GET /profile                        → Meu perfil (e quem é admin)
       GET /credits/me                     → Créditos (saldo, lotes, pacotes)
       GET /companies/me/whatsapp-status   → WhatsApp da empresa
       GET /modules/me                     → Módulos liberados **e a BARRA**
     Nenhuma delas derruba a outra: quem cai, cai sozinha, com o "Tentar de novo"
     dela. O índice mostra um RESUMO de cada uma — e o resumo é escrito pelo
     MESMO carregador da tela de dentro, num lugar só. Duas contas do mesmo
     número em dois lugares é como o índice e a tela passam a discordar.
     ========================================================================== */

  /* ------------------------------------------------------------------------
     MÓDULOS — e por que este carregador é o mais importante do arquivo.

     🔴 ELE MANDA NA BARRA. Módulo que o admin não liberou não pode virar botão:
     o servidor recusa com `403 MODULE_ACCESS_DENIED` e — até 18/08 — a tela não
     dizia UMA PALAVRA. Medido: um cliente pareou o aparelho e levou 39 respostas
     403 em 65 segundos porque o módulo estava desligado desde o cadastro; ele
     tocava, tocava, e concluiu que o aplicativo estava quebrado. Aqui a barra
     obedece o servidor ANTES do toque, e a tela "Módulos liberados" escreve o
     porquê pra quem for procurar.

     🔴 REDE CAÍDA NÃO ESCONDE MÓDULO. É o CONTRÁRIO do resto desta ponte (onde
     fonte fora do ar vira aviso): o `catch` volta SEM escrever, e o campo fica
     como estava — vazio no boot, ou seja, a barra inteira. Aqui o silêncio não
     pode TIRAR nada de quem está trabalhando.

     🔴 E CHAVE AUSENTE TAMBÉM NÃO ESCONDE. Se o `/modules/me` não citar
     `conversas`, isso é "não sei" (catálogo antigo, migration pendente), não
     "desligado" — e desligar por omissão apagaria um módulo inteiro da barra de
     todo mundo no dia de um deploy pela metade.
     ------------------------------------------------------------------------ */

  /* A tradução entre o vocabulário da BARRA (o que o dedo vê) e o do CATÁLOGO
     (o que o servidor guarda). Ela existe porque os dois nomes divergem de
     verdade em dois pontos, e adivinhar qualquer um deles esconderia um botão:
     · `radar` na barra é `webscraping` no catálogo — o nome antigo do módulo;
     · `agenda` NÃO é módulo. O `/atividades` é gateado por `vendas` no próprio
       controller ("Atividades é a agenda dentro da carteira do vendedor, não um
       módulo à parte"), então ela vive e morre com o funil — e o funil, por lei
       da casca, nunca some.
     `ajustes` não entra: não é módulo e não pode sumir. */
  const MODULOS_DA_BARRA = [
    ['vendas', 'vendas', 'sales', 'Vendas', 'o funil, os leads e as tentativas'],
    ['radar', 'webscraping', 'target', 'Radar', 'buscar empresas novas'],
    ['agenda', 'vendas', 'calendar', 'Agenda', 'o que fazer hoje'],
    ['conversas', 'conversas', 'chat', 'Conversas', 'falar pelo WhatsApp da empresa'],
    ['empresas', 'empresas', 'store', 'Empresas', 'a base de CNPJ'],
  ];

  /* 🔴 O MOTIVO VIAJA NO DADO, e ele MANDA A PESSOA FALAR COM GENTE DIFERENTE.
     "A empresa não liberou" é assunto do administrador; "seu usuário não tem
     permissão" é assunto de quem distribui acesso dentro da empresa. Quem sabe
     qual é são o `companyEnabled` e o `userAllowed` do servidor — uma frase
     genérica ("sem acesso") faria a pessoa reclamar no lugar errado e voltar
     achando que o app é que está quebrado. */
  function motivoDoModulo(m, resumo) {
    if (!m) return resumo;                       // não sei: fica o resumo do que o módulo faz
    if (m.accessible) return resumo;
    if (m.companyEnabled === false) return 'a empresa não liberou este módulo';
    if (m.userAllowed === false) return 'seu usuário não tem permissão para este módulo';
    return 'este módulo não está liberado agora';
  }

  function carregarModulos() {
    if (!temPonte()) return Promise.resolve();
    return window.API.get('/modules/me').then((lista) => {
      if (!Array.isArray(lista)) return;
      const porChave = Object.create(null);
      lista.forEach((m) => { if (m && m.key) porChave[String(m.key)] = m; });

      const desligados = [];
      const linhas = [];
      MODULOS_DA_BARRA.forEach(([naBarra, noCatalogo, ico, rotulo, resumo]) => {
        const m = porChave[noCatalogo];
        // AUSENTE = NÃO SEI = LIGADO (ver a lei acima). Só o `accessible: false`
        // explícito apaga um botão.
        const ligado = !m || m.accessible !== false;
        if (!ligado && desligados.indexOf(naBarra) < 0) desligados.push(naBarra);
        linhas.push([ico, rotulo, motivoDoModulo(m, resumo), ligado ? 1 : 0]);
      });

      usar('barra', { desligados: desligados.join(',') });
      /* A pessoa pode estar OLHANDO justamente o módulo que acabou de ser
         desligado — a configuração chega enquanto o app está aberto, que é o
         caso normal. Sem isto ela fica numa tela sem botão aceso na barra,
         presa. A casca sabe devolver pra casa. */
      try {
        if (typeof window.resgatarModuloDesligado === 'function') window.resgatarModuloDesligado();
      } catch (_) { /* casca sem a função: nada a resgatar */ }

      const ligados = linhas.filter((l) => l[3]).length;
      usar('modulos', Object.assign({}, fonteVoltou, { lista: linhas }));
      usar('ajustes', { modulosLinha: `${ligados} de ${linhas.length}` });
    }).catch((e) => {
      // A BARRA fica como está (ver a lei); quem tem direito a aviso é só a TELA
      // de módulos, e só se ela ainda estiver no esqueleto da primeira carga.
      fonteCaiu('modulos', e);
    });
  }

  /* ------------------------------------------------------------------------
     MEU PERFIL — e a régua de QUEM É ADMIN, que decide o dinheiro na tela.
     ------------------------------------------------------------------------ */

  /* 🔴 O PAPEL SAI DO SERVIDOR, NÃO DE UM PALPITE DA TELA. `userKind` e
     `canViewBilling` são a régua canônica do backend (master › dono › gerente ›
     vendedor); traduzir `role` cru aqui faria a tela chamar de "Administrador"
     um gerente que não vê cobrança — e é justamente essa diferença que decide se
     a linha de Créditos existe. */
  function papelDaPessoa(p) {
    if (!p) return '';
    if (p.isSystemMaster) return 'Master';
    const tipo = String(p.userKind || '');
    if (tipo === 'admin') return p.canViewBilling ? 'Dono da conta' : 'Gerente';
    if (tipo === 'seller') return 'Vendedor';
    return '';
  }

  /* O aparelho é a única linha desta tela que NÃO vem do `/profile`: ela é o
     PAREAMENTO, e quem o conhece é a ponte (`appInfo`).
     🔴 E ELA RESPONDE UMA PERGUNTA SÓ: "este aparelho está vinculado?".
     `appInfo()` não devolve modelo nem data de pareamento — só o `sessionScope`,
     que é o hash opaco da credencial gravada (vazio = nenhum vínculo). Escrever
     "Moto G15 · pareado em 12/08" com esses dados seria inventar as duas
     metades; e sem vínculo a linha SOME, em vez de dizer "—". */
  function linhaDoAparelho() {
    try {
      const i = window.HBX.info() || {};
      if (!String(i.sessionScope || '').trim()) return '';
      return i.versionCode ? `pareado · app ${Number(i.versionCode)}` : 'pareado';
    } catch (_) { return ''; }
  }

  function carregarPerfil() {
    if (!temPonte()) return Promise.resolve();
    return window.API.get('/profile').then((p) => {
      if (!p) return fonteCaiu('perfil');
      const admin = p.canViewBilling ? 1 : 0;
      const empresa = (p.company && p.company.name) || '';
      usar('perfil', Object.assign({}, fonteVoltou, {
        nome: esc(p.name || p.username || ''),
        papel: esc(papelDaPessoa(p)),
        email: esc(p.email || ''),
        // O telefone que o `/profile` conhece é o da EMPRESA (contactPhone) — a
        // pessoa não tem telefone próprio nesta resposta. Rotulá-lo como "seu
        // telefone" seria mentira; ele entra em "Onde você trabalha", junto do
        // nome da empresa, que é onde ele é verdade.
        telefone: '',
        empresa: esc(empresa),
        cidade: '',
        aparelho: esc(linhaDoAparelho()),
      }));
      usar('ajustes', Object.assign({}, fonteVoltou, {
        admin,
        perfilNome: esc(p.name || p.username || 'Meu perfil'),
        perfilSub: esc(p.email || ''),
      }));
      /* O tutor precisa saber DUAS coisas antes de decidir qualquer capítulo:
         que já não está mais "carregando" (enquanto está, ele não esconde nada) e
         se esta pessoa é audiência de cobrança — é isso que diz se o capítulo de
         créditos existe pra ela. */
      usar('tutorial', { carregando: 0, admin, obrigatorioVisto: tutorialJaVisto() });
    }).catch((e) => {
      fonteCaiu('perfil', e);
      fonteCaiu('ajustes', e);
    });
  }

  /* ------------------------------------------------------------------------
     O TUTOR — a memória é DO APARELHO, e é assim porque não há porta.

     O app do motorista guarda "já viu o tutorial obrigatório" no servidor
     (`/logistica/tutorial`); em Vendas essa porta não existe. Inventar uma
     chamada pra um endereço que ninguém escreveu daria 404 a cada boot — e a
     ponte trataria o 404 como "não sei", prendendo a pessoa no tutorial pra
     sempre ou nunca o abrindo. Enquanto a porta não nasce, quem lembra é o
     aparelho: é a mesma memória que a casca já usa pros capítulos avulsos
     (`localStorage`, `hbx:tutor:*`), então o app tem UM dono da lembrança.
     ⚠️ Consequência honesta e anotada: trocar de aparelho reabre a lição.
     ------------------------------------------------------------------------ */
  const TUTOR_VISTO = 'tutorial-obrigatorio-visto';
  const tutorialJaVisto = () => {
    try { return Number(window.HBX.cache.get(TUTOR_VISTO, 0)) ? 1 : 0; } catch (_) { return 0; }
  };
  /* O mock declara `window.tutorialConcluido` como NO-OP e diz, por escrito, que
     a ponte o sobrescreve: sem isto o obrigatório terminaria e voltaria a abrir
     no próximo boot, cobrando o mesmo minuto todo dia. */
  window.tutorialConcluido = function () {
    try { window.HBX.cache.set(TUTOR_VISTO, 1); } catch (_) {}
    usar('tutorial', { obrigatorioVisto: 1 });
  };

  /* ------------------------------------------------------------------------
     WHATSAPP DA EMPRESA — a tela que existe porque o silêncio dela custa venda.
     ------------------------------------------------------------------------ */

  /* 🔴 "NÃO SEI" NÃO PODE VIRAR NENHUM DOS DOIS SELOS. Pintar "conectado" por
     omissão faz o vendedor escrever a mensagem e descobrir depois que nada saiu;
     pintar "desconectado" por omissão manda ele incomodar o administrador por um
     problema que talvez não exista. Os dois erros são caros — e `conectado:null`
     apaga o selo, que é o único estado honesto. */
  function carregarWhatsapp() {
    if (!temPonte()) return Promise.resolve();
    return window.API.get('/companies/me/whatsapp-status').then((z) => {
      if (!z || typeof z.connected !== 'boolean') return fonteCaiu('whatsapp');
      const on = z.connected ? 1 : 0;
      const numero = telefoneBonito(z.displayNumber);
      usar('whatsapp', Object.assign({}, fonteVoltou, {
        conectado: on,
        numero: esc(numero),
        // O `status` é o vocabulário do motor (connecting/close/open…). Ele vira
        // frase só quando diz algo que o selo já não disse; senão a linha some.
        estado: on ? 'conectado agora' : esc(estadoDoChip(z.status)),
        // A hora é do RELÓGIO, e relógio é da ponte — o servidor não manda "às
        // 9:41". É ela que prova que o "Atualizar" fez alguma coisa.
        conferido: `conferido às ${hora(new Date().toISOString())}`,
      }));
      usar('ajustes', { zapLigado: on, zapNumero: esc(numero) });
    }).catch((e) => {
      fonteCaiu('whatsapp', e);
      // O selo do ÍNDICE volta pro silêncio: ele não pode continuar dizendo
      // "conectado" com a resposta que sustentava isso no chão.
      usar('ajustes', { zapLigado: null });
    });
  }
  const ESTADO_DO_CHIP = {
    open: 'conectado agora',
    connecting: 'conectando…',
    close: 'desconectado',
    qr: 'esperando leitura do QR',
  };
  const estadoDoChip = (status) => ESTADO_DO_CHIP[String(status || '').toLowerCase()] || 'sem WhatsApp conectado';

  /* ------------------------------------------------------------------------
     CRÉDITOS — a mesma tela do motorista com a régua do dinheiro INVERTIDA.

     🔴 QUEM DECIDE SE APARECE DINHEIRO É O SERVIDOR, E A OMISSÃO É "NÃO". O
     `/credits/me` tem DUAS respostas: pra audiência de cobrança vem `balance`,
     `lots` e `packs`; pro VENDEDOR vem só `leadsDisponiveis` — sem R$, sem
     pacote, sem preço (LEI DO VENDEDOR, docs/Rules/PAGAMENTOS.md). A ponte não
     escolhe a face: ela LÊ qual das duas chegou. `cobranca` só vale 1 quando o
     `balance` veio — assim, se um dia esta tradução errar, ela erra pro lado de
     ESCONDER preço.
     ------------------------------------------------------------------------ */
  let pacoteEscolhido = null;

  function carregarCreditos() {
    if (!temPonte()) return Promise.resolve();
    return window.API.get('/credits/me').then((cred) => {
      if (!cred) return fonteCaiu('creditos');
      const temDinheiro = typeof cred.balance === 'number';
      const saldo = temDinheiro ? cred.balance
        : (typeof cred.leadsDisponiveis === 'number' ? cred.leadsDisponiveis : null);
      const packs = temDinheiro && Array.isArray(cred.packs) ? cred.packs : [];
      if (!pacoteEscolhido && packs.length) {
        const rec = packs.find((p) => p.recommended) || packs[0];
        pacoteEscolhido = rec ? rec.key : null;
      }
      const atual = packs.find((p) => p.key === pacoteEscolhido) || null;
      usar('creditos', Object.assign({}, fonteVoltou, {
        cobranca: temDinheiro ? 1 : 0,
        saldo: saldo != null ? String(saldo) : '',
        vence: temDinheiro ? creditoVencendo(cred) : '',
        pacotes: packs.map((p) => [
          // crédito é NÚMERO INTEIRO; só o PREÇO do pacote é dinheiro.
          String(p.credits),
          Number(p.price).toFixed(2).replace('.', ','),
          esc(p.badge),
          p.key === pacoteEscolhido ? 1 : 0,
          esc(p.key),
          detalheDoPacote(p),
        ]),
        cta: atual ? `Recarregar ${atual.credits} créditos · ${dinheiro(Number(atual.price))}` : '',
      }));
      /* A linha do índice fala a língua da face que chegou: "240 créditos" pra
         quem compra, "240 leads" pra quem gasta (1 crédito = 1 lead — é a mesma
         régua do desenho). Escrever "créditos" pro vendedor seria empurrar
         vocabulário de dinheiro pra quem o backend decidiu não mostrar. */
      const unidade = temDinheiro
        ? (saldo === 1 ? 'crédito' : 'créditos')
        : (saldo === 1 ? 'lead' : 'leads');
      usar('ajustes', { creditosLinha: saldo != null ? `${saldo} ${unidade}` : '' });
    }).catch((e) => fonteCaiu('creditos', e));
  }

  /* 🔴 O CRÉDITO VENCE, E O APP NUNCA DISSE ISSO. O `lots[]` traz `remaining` e
     `expiresAt` desde sempre e ninguém lia: compra-se 300 créditos com 90 dias
     de validade e descobre-se o vencimento pelo saldo que sumiu. Dinheiro que
     evapora calado é a pior surpresa que um produto guarda.
     Só o lote que vence PRIMEIRO, e só dentro de 30 dias: aviso permanente vira
     paisagem, e lote de 89 dias não é notícia. */
  function creditoVencendo(cred) {
    const lots = Array.isArray(cred && cred.lots) ? cred.lots : [];
    const vivos = lots
      .map((l) => ({ resta: Number(l && l.remaining), quando: l && l.expiresAt }))
      .filter((l) => l.resta > 0 && l.quando && isFinite(new Date(l.quando).getTime()));
    if (!vivos.length) return '';
    const limite = Date.now() + 30 * 86400000;
    const primeiro = vivos
      .map((l) => Object.assign({}, l, { t: new Date(l.quando).getTime() }))
      .sort((a, b) => a.t - b.t)[0];
    if (primeiro.t > limite) return '';
    // Lotes que vencem NO MESMO DIA somam: são um vencimento só pra quem lê.
    const dia = diaCurto(primeiro.quando);
    const soma = vivos.reduce((s, l) => s + (diaCurto(l.quando) === dia ? l.resta : 0), 0);
    return `${soma} ${soma === 1 ? 'crédito vence' : 'créditos vencem'} em ${dia}`;
  }

  /* O que faz escolher: o preço POR CRÉDITO (a única conta que responde "qual é
     o mais barato" quando os pacotes têm tamanhos diferentes) e a VALIDADE. Os
     dois já vêm no `/credits/me` e nenhum chegava na tela. Cada pedaço só entra
     se tiver fonte, e o separador nasce com o segundo pedaço. */
  function detalheDoPacote(p) {
    const partes = [];
    const credits = Number(p && p.credits);
    const price = Number(p && p.price);
    if (credits > 0 && isFinite(price) && price > 0) partes.push(`${dinheiro(price / credits)} por crédito`);
    const dias = Number(p && p.defaultExpiryDays);
    if (isFinite(dias) && dias > 0) partes.push(`vale ${dias} dias`);
    return partes.join(' · ');
  }

  /* 🔴 ESCOLHER PACOTE É TOQUE, NÃO REDE. No app do motorista o toque num pacote
     refazia DUAS chamadas HTTP só pra acender a borda de um cartão: na rede da
     rua o dedo batia e a tela ficava parada até a resposta — e com uma das
     portas no chão a escolha era engolida, então o pacote NUNCA acendia. O
     catálogo já está na tela; quem manda no aceso é esta variável. O botão do pé
     reusa os MESMOS textos da linha escolhida — dois lugares formatando o mesmo
     preço é onde nasce a discordância de centavo. */
  function escolherPacote(chave) {
    const k = String(chave || '');
    if (!k || k === pacoteEscolhido) return;
    let packs = [];
    try { packs = Array.isArray(DADOS.creditos && DADOS.creditos.pacotes) ? DADOS.creditos.pacotes : []; } catch (_) { return; }
    const atual = packs.find((p) => p[4] === k);
    if (!atual) return;
    pacoteEscolhido = k;
    usar('creditos', {
      pacotes: packs.map((p) => [p[0], p[1], p[2], p[4] === k ? 1 : 0, p[4], p[5]]),
      cta: `Recarregar ${atual[0]} créditos · R$ ${atual[1]}`,
    });
  }

  /* ------------------------------------------------------------------------
     O ÍNDICE — ele não tem porta própria: é o resumo das quatro de baixo.
     ------------------------------------------------------------------------ */
  function carregarAjustes() {
    if (!temPonte()) return Promise.resolve();
    /* 🔴 A CHAVE "SONS E AVISOS" NÃO NASCE NESTE APP, e a ausência é a correção.
       MEDIDO no Kotlin, não deduzido: `setSoundPrefs`, `playSound`, `stopSound` e
       `previewSound` do `NativeAppBridge` abrem todos com
       `if (BuildConfig.APP_MODE != "logistica") return` — o gravador devolve as
       preferências ANTIGAS sem escrever nada, e o motor de som deste flavor não
       toca nada. Uma chave aqui seria o pior tipo de botão: a pessoa toca, ele
       nem vira (o valor relido é o mesmo), e ela conclui que o app travou.
       `sons: null` é o "não sei" que a folha já entende — a linha simplesmente
       não entra, e o grupo continua de pé com o Tema escuro.
       A cura de verdade é soltar o gate no `NativeAppBridge` (código
       COMPARTILHADO com o app em produção) e dar som a este app; isso é frente
       própria, não efeito colateral desta. Anotado nas pendências. */
    usar('ajustes', Object.assign({ sons: null }, linhaDaVersao()));
    return Promise.allSettled([carregarPerfil(), carregarCreditos(), carregarWhatsapp(), carregarModulos()]);
  }

  /* ------------------------------------------------------------------------
     O QUE O DEDO FAZ NESTAS TELAS.
     ------------------------------------------------------------------------ */
  registrarTelas({
    ajustes: carregarAjustes,
    perfil: carregarPerfil,
    creditos: carregarCreditos,
    whatsapp: carregarWhatsapp,
    modulos: carregarModulos,
  });

  registrarAcoes({
    // Os cinco "Tentar de novo". Cada um devolve o ESQUELETO da SUA seção antes
    // de pedir de novo: toque que não responde nada por um segundo é toque que a
    // pessoa repete.
    'recarregar-ajustes': () => retentar('ajustes', carregarAjustes),
    'recarregar-perfil': () => retentar('perfil', carregarPerfil),
    'recarregar-creditos': () => retentar('creditos', carregarCreditos),
    'recarregar-modulos': () => retentar('modulos', carregarModulos),
    'recarregar-whatsapp': () => retentar('whatsapp', carregarWhatsapp),

    /* 🔴 `chave-sons` NÃO ENTRA AQUI, e a ausência é deliberada — ver o porquê
       inteiro em `carregarAjustes`: o Kotlin deste flavor engole `setSoundPrefs`,
       então a chave não é desenhada (`sons: null`). Registrar um dono pra um
       botão que a tela não pinta é deixar código esperando um toque que nunca
       chega, e é ele que faria o próximo leitor achar que a chave funciona.
       🔴 `chave-tema` também não, e por outro motivo: o mock JÁ trata o clique
       (ele chama `trocarLuz`, que esta ponte embrulhou no §1). Uma entrada aqui
       viraria a luz uma SEGUNDA vez no mesmo toque — medido no g15 do app do
       motorista: escuro→claro→escuro, e a chave "não fazia nada". */

    /* 🔴 A PORTA MANUAL DA ATUALIZAÇÃO. Enquanto só existisse o pop-up
       automático, perder o aviso uma vez seria ficar preso na versão velha sem
       nada pra tocar. `forcado` fura a trava de 30 min E a memória do "já
       avisei" — e RESPONDE SEMPRE, inclusive quando não há novidade. */
    'buscar-update': () => { checkAppUpdate(true); },

    // 🔴 SAIR APAGA A SESSÃO DO APARELHO — confirma antes, sempre. Um toque
    // errado aqui custa um pareamento novo, e o vendedor não tem como refazê-lo
    // sozinho na rua.
    sair: () => {
      window.portao({
        tom: 'alerta', ico: 'logout', titulo: 'Sair do aplicativo?',
        sub: 'Você vai precisar parear o aparelho de novo.',
        acoes: [['Ficar', ''], ['Sair', 'principal']], classe: 'duas',
      });
      const b = naCamada('.portao-wrap .principal');
      if (b) b.addEventListener('click', () => { try { window.HBX.logout(); } catch (_) {} }, { once: true });
    },

    pacote: (el) => escolherPacote(el && el.dataset ? el.dataset.pacote : ''),
    // O checkout é NATIVO (RechargeCheckoutActivity): a WebView nunca vê dado de
    // cartão. Aqui só se diz QUAL pacote.
    recarregar: () => {
      if (!pacoteEscolhido) return;
      try { window.HBX.recharge(pacoteEscolhido); }
      catch (_) { avisoErro(new Error('Não consegui abrir a recarga agora.')); }
    },
  });
