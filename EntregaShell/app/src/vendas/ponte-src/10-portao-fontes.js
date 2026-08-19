
  /* ==========================================================================
     O PORTÃO DE CARGA — esqueleto → aviso → conteúdo, e a carga inicial.

     🔴 A LEI Nº 1 DESTA FRENTE: "vazio porque o servidor disse vazio" e "vazio
     porque a rede caiu" são OPOSTOS, e a tela tem que saber qual dos dois está
     mostrando. Lista vazia sem aviso mente dizendo que a base do vendedor está
     vazia — e em Vendas essa mentira termina em "o app não funciona, não tenho
     nenhum lead".

     🔴 A SEGUNDA LEI, e ela é a que separa este arquivo de um `try/catch`
     qualquer: FALHA DE REDE SÓ APAGA TELA NA PRIMEIRA CARGA. Com dado real já
     desenhado, um tique de fundo que não respondeu NÃO pode arrancar o funil da
     mão de quem está trabalhando — ele avisa e deixa o que estava. Quem guarda
     essa diferença é o próprio `carregando`: ele só está ligado enquanto a
     primeira resposta não chegou.
     ========================================================================== */

  /** Fonte fora do ar: some o esqueleto, entra o aviso.
   *  🔴 SÓ NA PRIMEIRA CARGA (`carregando` ainda ligado) — ver a 2ª lei acima.
   *
   *  🔴 E ELE RECEBE O ERRO, NÃO SÓ O NOME DA SEÇÃO. Até 19/08 todo chamador
   *  fazia `.catch(() => fonteCaiu('vendas'))` e JOGAVA FORA o objeto — então a
   *  tela dizia "não consegui carregar" (= a rede caiu, espere) quando o
   *  servidor tinha dito "você não tem esse módulo" (= porta trancada, fale com
   *  o administrador). Duas cenas opostas na mesma tela, e a errada é a que
   *  custou o cliente 46 em 18/08: 39 respostas 403 em 65 segundos e nenhuma
   *  palavra na tela. O `quedaMotivo` é a palavra que a casca lê pra escolher
   *  qual das três caras desenhar (ver `motivoDaQueda`, 00-nucleo). */
  const fonteCaiu = (secao, erro) => {
    if (typeof window.usarDados !== 'function') return;
    let primeira = false;
    try { primeira = !!(DADOS[secao] && DADOS[secao].carregando); } catch (_) { return; }
    if (!primeira) return;
    usar(secao, { carregando: false, semFonte: true, quedaMotivo: motivoDaQueda(erro) });
  };
  /** Respondeu: sai o esqueleto E o aviso, no MESMO repinte do dado — senão a
   *  tela pisca "carregando → aviso → conteúdo" em duas pinturas.
   *  `quedaMotivo` zera junto: motivo velho sobrevivendo à recuperação faria a
   *  próxima queda de REDE aparecer vestida de módulo desligado. */
  const fonteVoltou = { carregando: false, semFonte: false, quedaMotivo: '' };
  /** O "Tentar de novo": devolve o esqueleto e pede de novo. */
  const retentar = (secao, carregador) => {
    usar(secao, { carregando: true, semFonte: false, quedaMotivo: '' });
    carregador();
  };

  /* 🔴 A MESMA ESCADA, COM AS BANDEIRAS NA MÃO. Uma tela pode ter DUAS fontes de
     rede independentes — o Funil tem: `/vendas/board` traz o funil e
     `/vendas/report` traz o placar. Com um par único de bandeiras por SEÇÃO, a
     queda de uma porta apagaria o bloco da outra. Estes dois pares são o par
     `placarCarregando`/`placarSemFonte` que a casca já desenha. */
  const blocoCaiu = (secao, campoCarregando, campoSemFonte) => {
    let primeira = false;
    try { primeira = !!(DADOS[secao] && DADOS[secao][campoCarregando]); } catch (_) { return; }
    if (!primeira) return;
    usar(secao, { [campoCarregando]: false, [campoSemFonte]: true });
  };

  /* ==========================================================================
     🔴 NO APARELHO, A DEMONSTRAÇÃO NÃO EXISTE.

     O mock é o front, e o front traz o dado de exemplo do DESENHO. Até o
     servidor responder, o vendedor via "Empresa 1", "Empresa 2", telefones
     `(19) 90000-0001` e um saldo de créditos que não é dele. São 60 ms na
     bancada, mas segundos numa rede ruim — e este app termina em MENSAGEM DE
     WHATSAPP: empresa inventada com nome e telefone, numa tela que manda
     mensagem, é a mentira mais cara que este produto pode contar.

     Então, no boot: apaga o exemplo e liga o ESQUELETO das telas que buscam.
     UMA pintura só no fim (`usarDados` repinta a cada chamada; onze chamadas
     seriam onze repintes no quadro mais caro do app, o da abertura).

     🔴 A RÉGUA DO QUE ZERA: o que é DADO zera; o que é COPY fica. `vazios`
     (o texto de cada etapa sem card), `subtitulo` da carteira e a nota de rodapé
     são texto do desenho e não vêm do servidor — apagá-los deixaria a tela muda
     em vez de honesta. Já `chamados`, `saldo`, `lista` e `contagem` vêm do
     servidor: enquanto ele não falar, é VAZIO.

     🔴 E ZERA INTEIRO, NÃO OS CAMPOS QUE EU LEMBREI. No app do motorista essa
     economia custou uma tela mostrando "Dinheiro R$ 132,00 · Pix R$ 52,00" — os
     números do mock com cara de caixa do dia — porque só `saldo` tinha sido
     zerado e o que a ponte não escreve FICA.
     ========================================================================== */
  function apagarDemonstracao() {
    if (!temPonte()) return;
    const zerar = {
      /* O FUNIL. `carregando` liga o esqueleto e `placarCarregando` o do placar:
         são duas portas e cada uma sobe e cai sozinha. `etapa` NÃO zera — é do
         DEDO, e 'today' é onde a pessoa abre o app. */
      vendas: {
        carregando: true, semFonte: false,
        placarCarregando: true, placarSemFonte: false,
        subtitulo: '', chamados: '', respostas: '', conversao: '',
        aviso: '', avisoTom: '', busca: '',
        contagem: {}, blocos: { overdue: [], today: [], scheduled: [], closed: [] },
        carteira: '', vagas: '', vagasRotulo: '', vagasAlerta: 0,
      },
      /* O RADAR. `corrida:{}` é "nunca buscou" — a cena do CONVITE —, e ela não
         pode ser confundida com "busquei e não achei nada". `quantidade` e
         `quantidades` ficam: são a escolha do dedo e a régua do desenho.
         `custoPuxar` some porque preço é do servidor: preço escrito na tela sem
         o servidor ter falado é preço errado ensinado ao vendedor.
         ⚠️ E desde 19/08 ele fica vazio PARA SEMPRE, de propósito: nenhuma porta
         que este app alcança informa o custo por card (o `send-to-vendas` não
         devolve o debitado, e o catálogo de preço é do /master). A subtração de
         dois saldos que fazia esse papel mentia quando um colega gastava crédito
         no meio — ver a nota no `puxarLeadDoRadar`. */
      radar: {
        carregando: false, semFonte: false,
        segmento: '', cidade: '', uf: '', sugestoes: [],
        contagem: '', contando: 0, contagemSemFonte: 0,
        saldo: '', custoPuxar: '',
        corrida: {}, lista: [], comTelefone: '', puxados: '',
      },
      /* A AGENDA. `janela` é do dedo. `subtitulo` vira a data por extenso do dia
         operacional lá embaixo — aqui só sai o "Terça, 19 de agosto" do desenho,
         que seria a data errada em qualquer outro dia. */
      agenda: {
        carregando: true, semFonte: false,
        subtitulo: '', contas: {}, listas: { atrasadas: [], hoje: [], semana: [] },
        concluindo: '', remarcando: '', feitasHoje: '', proxima: '',
      },
      /* AS DUAS CONVERSAS. A segunda é o estado que o desenho mostra ao lado (chip
         no chão + lead sem WhatsApp): a ponte nunca escreve nela, mas ela existe
         em `T` e carrega "Empresa 2" com telefone — some do mesmo jeito. */
      conversas: {
        carregando: false, semFonte: false,
        lead: '', ini: '', nome: '', telefone: '', etapa: '', origem: '',
        temWhats: 0, chip: {}, canal: '', enviando: 0, vazio: '', conversa: [],
      },
      conversassemchip: {
        lead: '', ini: '', nome: '', telefone: '', etapa: '', origem: '',
        temWhats: 0, chip: {}, canal: '', enviando: 0, conversa: [],
      },
      /* A CARTEIRA DE EMPRESAS. `ufs:[]` some com a fileira de chips inteira —
         27 siglas chutadas seriam filtro prometendo base que não existe. */
      empresas: {
        carregando: true, semFonte: false,
        busca: '', ufSel: '', ufs: [], lista: [],
        total: '', pagina: 1, totalPaginas: 1, carregandoMais: 0,
      },
      empresaficha: {
        carregando: false, semFonte: false,
        id: '', ini: '', nome: '', cnpj: '', documento: '', cidade: '', uf: '',
        endereco: '', numero: '', cep: '', pino: '', telefone: '', email: '',
        origem: '', desde: '', cliente: 0, lead: 0, fornecedor: 0,
        leadId: '', mandando: 0, contatos: [],
      },
      /* OS AJUSTES E AS QUATRO TELAS DE DENTRO.
         🔴 `zapLigado: null` e `sons: null` são "NÃO SEI", e não sei NÃO PINTA
         SELO nem CHAVE — a folha testa ausência. Selo "conectado" por omissão faz
         a pessoa escrever a mensagem e descobrir depois que nada saiu; chave
         ligada por omissão faz ela achar que desligou algo que nunca carregou. */
      ajustes: {
        carregando: true, semFonte: false,
        admin: 0, perfilNome: '', perfilSub: '',
        creditosLinha: '', creditosSub: '',
        zapLigado: null, zapNumero: '', modulosLinha: '',
        sons: null, versao: '', versaoSub: '', versaoTag: '',
      },
      perfil: {
        carregando: false, semFonte: false,
        nome: '', papel: '', email: '', telefone: '', empresa: '', cidade: '', aparelho: '',
      },
      whatsapp: {
        carregando: false, semFonte: false,
        conectado: null, numero: '', estado: '', conferido: '',
      },
      modulos: { carregando: false, semFonte: false, lista: [] },
      /* 🔴 `cobranca: 0` É O LADO SEGURO DO INTERRUPTOR DO DINHEIRO. A folha
         exige `cobranca===1` pra mostrar R$, pacote e botão de recarga; qualquer
         outra coisa cai na face neutra do vendedor. Se a ponte um dia errar, ela
         erra pro lado de ESCONDER preço — nunca pro de mostrar preço a quem o
         backend decidiu não mostrar (a Lei do Vendedor). */
      creditos: {
        carregando: true, semFonte: false,
        cobranca: 0, saldo: '', vence: '', pacotes: [], cta: '',
      },
      /* O TUTOR: `carregando:1` é "não sei ainda", e é ele que impede o tutorial
         obrigatório de disparar antes de o servidor dizer se a pessoa já o viu. */
      tutorial: { carregando: 1, obrigatorioVisto: 0, admin: 0 },
      /* A tela "você ainda não tem empresas" é COPY inteira e a ponte NÃO
         escreve nada nela. Ela tinha um `enviado` (o recibo da foto da lista),
         e ele saiu em 19/08 junto com as três portas de cadastro — que eram
         botões sem dono em ponte nenhuma e sem rota alcançável neste flavor
         (a nota inteira está em `T.semclientes`, no mock). Seção sem campo de
         dado não entra aqui: zerar o que não existe é como esta lista passa a
         mentir sobre o que ainda é demonstração. */
    };
    try {
      Object.keys(zerar).forEach((s) => { DADOS[s] = Object.assign({}, DADOS[s], zerar[s]); });
      /* Na ABERTURA não se repinta: ela é uma cena com relógio (a marca viaja
         pro cabeçalho) e a camada seria recriada do zero, cortando a animação no
         meio. Nenhuma destas telas está à vista agora — quem pinta com o valor
         novo é o `ir('vendas')` que encerra a abertura. */
      if (telaAtual() !== 'entrada' && typeof window.pintar === 'function') window.pintar(false);
    } catch (_) { /* sem seam: a casca não subiu, e aí não há o que apagar */ }
  }

  /* ==========================================================================
     A TELA ABRIU — o gancho de carregar.

     🔴 POR QUE NÃO INTERCEPTAR `data-ir` NO CLIQUE. Os atributos `data-ir` /
     `data-nav` / `data-tela` são do ROTEADOR DO MOCK, e mais gente aponta pra
     eles por NOME: o tour e a aula usam esses seletores como agulha
     (`acharAlvo`), e o `podarDesligados` varre por eles. Ponte que sequestra o
     atributo quebra os três em silêncio. Então a ponte não decide a navegação —
     ela só PERGUNTA, depois, qual tela ficou de pé.

     São duas entradas de propósito, e a segunda é a rede de segurança da
     primeira:
     · o embrulho de `window.ir` pega TODA troca de tela, inclusive a que a
       própria ponte pede (`window.ir('conversas')` depois de tocar num lead) e a
       que a abertura dispara sozinha ao terminar a cena;
     · o clique delegado pega o caso em que o embrulho não pegou.
     `telaAnunciada` faz as duas serem a mesma coisa: quem chegar primeiro
     anuncia, o outro cala. Sem essa trava, abrir o Radar dispararia a busca DUAS
     vezes — e no Radar duas chamadas é dinheiro.
     ========================================================================== */
  /* 🔴 O POUSO DA ABERTURA NÃO É UMA VISITA NOVA — e sem esta linha ele pagava a
     leitura do funil DUAS VEZES em todo boot. MEDIDO na bancada
     (`scripts/prova-ponte-vendas.js`, 19/08): `GET /vendas/board` pedido 2x,
     mais o `pending-summary` e o `report` de brinde. O boot carrega o funil
     porque a abertura ESPERA esse dado (`aberturaPronta`); segundos depois a
     cena termina no `ir('vendas')` e a tela "abre", disparando a mesma leitura —
     de dados que ninguém mudou no meio de uma animação.

     A cura é dizer a verdade em vez de cronometrar: o app POUSA no Funil (quem
     crava isso é o `armarAbertura` do mock, que termina em `ir('vendas')`), e o
     boot já carregou essa tela. Então ela nasce ANUNCIADA.
     ⚠️ Um relógio ("não releia nos próximos N segundos") foi tentado antes e é a
     régua errada: a cortina é segurada pelo aparelho (`HBXCenaComeca`), então o
     tempo entre o boot e o pouso NÃO TEM TETO — qualquer N seria chute, e um N
     grande engoliria releitura de verdade. */
  const TELA_DE_POUSO = 'vendas';
  let telaAnunciada = TELA_DE_POUSO;
  function anunciarTela() {
    const t = telaAtual();
    if (!t || t === telaAnunciada) return;
    telaAnunciada = t;
    const fn = TELAS_AO_ABRIR[t];
    if (!fn) return;
    // Carregador que estoura NÃO pode derrubar a navegação: a tela já trocou, e
    // quem paga o erro é o portão de fontes daquele módulo.
    try { fn(t); } catch (_) { /* o módulo cuida do próprio aviso */ }
  }
  if (typeof window.ir === 'function') {
    const irDoMock = window.ir;
    window.ir = function (k) {
      irDoMock(k);
      anunciarTela();
    };
  }
  document.addEventListener('click', anunciarTela);

  /* ==========================================================================
     A CARGA INICIAL.

     🔴 A ABERTURA ESPERA O DADO, NÃO UM RELÓGIO CEGO. A cena de entrada tem PISO
     (3,4 s) e TETO (7 s), e sai quando as duas coisas forem verdade: o piso
     passou E alguém chamou `window.aberturaPronta()`. Quem chama é o FUNIL —
     dando certo ou dando errado. "Falhar também é carregar": app que não abre
     porque o servidor caiu é pior que app aberto mostrando o aviso de fonte.

     🔴 E É UMA CORTINA SÓ. O flavor `vendas` passou a ligar `HBX_V2` no mesmo
     commit desta ponte: sem isso a `MainActivity` montava a cortina ANTIGA
     (`mountOpeningOverlay`) por cima desta cena e somava 1,63 s de espera — duas
     aberturas em sequência para o mesmo toque.
     ========================================================================== */
  const cargaInicial = () => {
    apagarDemonstracao();
    /* Os módulos vêm primeiro por um motivo de tela: é a resposta deles que diz
       quais botões a barra tem. Não bloqueia nada — quem espera é só a barra. */
    carregarModulos();
    checkAppUpdate();
    Promise.resolve(carregarFunil())
      .catch(() => {})
      .then(() => { try { if (typeof window.aberturaPronta === 'function') window.aberturaPronta(); } catch (_) {} });
    /* A linha da versão dos Ajustes é escrita ANTES de qualquer resposta de
       rede: ela sai do `appInfo()`, que é local. Sem isto a linha "Versão" ficava
       vazia até o primeiro `checkAppUpdate` responder — e ela é a PORTA MANUAL
       da atualização, ou seja, justamente a que não pode depender da rede. */
    pintarLinhaVersao();
    /* O DIA DE HOJE TAMBÉM É LOCAL, e o subtítulo da Agenda é dele. Escrito aqui
       (e não dentro do módulo da Agenda) por dois motivos: ele não depende de
       resposta nenhuma, então esperar a rede pra mostrar a data seria deixar a
       tela muda à toa; e a régua do fuso tem que morar num lugar só — a operação
       é São Paulo, nem o relógio do aparelho nem o do servidor (que roda em UTC).
       Cada tela que formatasse a própria data seria a segunda régua do mesmo
       fuso, e das 21h à meia-noite as duas discordariam. */
    usar('agenda', { subtitulo: dataPorExtenso(diaOperacional()) });
  };
  document.addEventListener('DOMContentLoaded', cargaInicial);
  if (document.readyState !== 'loading') setTimeout(cargaInicial, 0);

  /* O admin liga e desliga módulo com o app do vendedor ABERTO — é o caso
     normal, não a exceção (foi assim que o cliente 46 ficou com a Logística
     desligada e levou 39 respostas 403 em 65 segundos, sem uma palavra na tela).

     🔴 MEDIDO na mesma WebView do app do motorista: `visibilitychange` NÃO
     dispara aqui — a Activity fica viva e a WebView nunca é pausada. Evento que
     eu não vi disparar não é garantia, é esperança. A GARANTIA é o relógio; os
     dois eventos ficam como ATALHO: onde dispararem, obedece na hora.

     🔴 E O TIQUE NÃO PODE DERRUBAR A LIÇÃO. Todo `usarDados` monta uma camada
     nova, e o tutorial guiado vive DENTRO da camada: um tique de fundo no meio
     de um passo arrancaria o furo da tela sem ninguém ter encostado no aparelho.
     Uma leitura atrasada em um minuto não custa nada; o passo perdido custa a
     lição inteira. */
  const tourRodando = () => {
    try { return !!(window.TUTOR && typeof window.TUTOR.rodando === 'function' && window.TUTOR.rodando()); }
    catch (_) { return false; }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !tourRodando()) carregarModulos();
  });
  window.addEventListener('focus', () => { if (!tourRodando()) carregarModulos(); });
  setInterval(() => { if (!tourRodando()) carregarModulos(); }, 60000);
