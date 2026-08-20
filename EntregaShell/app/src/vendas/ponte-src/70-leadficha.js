
  /* ==========================================================================
     A FICHA DO LEAD — a tela que o toque no cartão abre, e os CANAIS que ela
     entrega ao dedo.

     🔴 POR QUE ELA NASCEU (19/08, ordem do dono, duas frases):
       "eu quero ver detalhes do lead que puxei ao clicar nele, eu clico nele
        abre conversas, como assim?"
       "cadê no celular as opções de já abrir o e-mail do celular, telefone já
        ligar, WhatsApp já abrir o WhatsApp — tá horrível, refaça isso tudo."
     Ele tinha razão nas duas. O toque no cartão do funil pulava DIRETO pra
     conversa — o app tinha dezessete telas e nenhuma mostrava o LEAD — e o que
     se chamava de "ficha" era um portão de LEITURA: quatro telefones e dois
     e-mails escritos como texto, sem um único botão. O vendedor lia o número na
     tela e digitava no discador na mão, na rua, com o cliente esperando.

     🔴 O QUE O MERCADO FAZ, E É UM PADRÃO SÓ. Contatos do Android e do iOS,
     HubSpot, Pipedrive, Zoho e Kommo abrem o REGISTRO ao tocar na lista, com a
     fileira de canais logo abaixo do nome (ligar · mensagem · e-mail · rota) e
     todo dado de contato como ALVO, nunca como texto. A conversa é uma das
     ações, não o destino do toque: quem abre um lead muitas vezes quer o CNPJ
     pra conferir, o e-mail pra mandar proposta ou o endereço pra passar lá.

     🔴 E O CUSTO DE UM TOQUE A MAIS FOI PAGO NA LISTA, não aqui: o cartão do
     funil ganhou o balão verde (`abrir-conversa`) que continua abrindo o fio em
     UM toque. Trocar o destino do cartão sem esse atalho seria consertar um
     defeito criando outro pra quem só queria falar.

     🔴 ZERO ENDPOINT NOVO, ZERO LINHA NA ALLOWLIST. Tudo sai do
     `GET /vendas/lead/:id/card`, que a conversa já lia e que o Kotlin já
     deixava passar (`NativeApiClient.vendasEndpoint`). Endpoint novo sem linha
     lá morre DENTRO do aparelho, com o backend 100% verde — o tropeço que o
     `financeiro/saldos` e o `rota/historico/dia` já pagaram nesta casa.

     🔴 OS QUATRO CANAIS SAEM DO APP E CAEM NO APARELHO, e cada um tem dono
     nativo que JÁ EXISTIA — nenhum Kotlin novo, menos um:
       WhatsApp → `HBX.whatsapp` → `NativeAppBridge.openWhatsapp` (wa.me)
       Ligar    → `HBX.call`     → `ACTION_DIAL tel:` (DIAL, não CALL: quem
                                    aperta o verde é a pessoa, e por isso o app
                                    não precisa da permissão de ligar)
       Mapa     → `HBX.maps`     → Google Maps com o endereço
       E-mail   → `HBX.email`    → 🔴 O ÚNICO QUE FALTAVA. `ACTION_SENDTO
                                    mailto:` no Kotlin (openEmail), com queda
                                    pro `location.href` fora do app.
     ========================================================================== */

  /* O lead ABERTO nesta tela. Separado do `leadDaConversa` de propósito: os dois
     andam juntos na maior parte do tempo, mas a conversa pode estar num lead e a
     ficha ser aberta noutro pela Agenda — e uma variável só faria a resposta de
     uma tela pintar a outra. */
  let leadDaFicha = '';
  let fichaEmVoo = null;
  let fichaEmVooDe = '';

  const soDigitos = (v) => String(v || '').replace(/\D/g, '');

  /* 🔴 O CRU VAI PRO APARELHO, O BONITO FICA NA TELA. O discador e o wa.me
     recebem dígito; "(19) 99000-0001" no `tel:` abre o teclado com parênteses
     dentro. Por isso cada linha carrega os DOIS (`cru` no atributo, `rot` no
     texto) em vez de a ação tentar desformatar o que a tela mostra. */
  const foneCruDoLead = (l) => soDigitos(l && (l.phoneNormalized || l.phone));

  /* O telefone do TOQUE: o da linha tocada, e — quando o toque veio da fileira
     de canais lá de cima, que não carrega número — o principal do lead. */
  function foneDoToque(el) {
    const doNo = soDigitos(el && el.dataset && el.dataset.fone);
    return doNo || foneCruDoLead(fichaCruaDoLead);
  }

  function emailDoToque(el) {
    const doNo = String((el && el.dataset && el.dataset.email) || '').trim();
    if (doNo) return doNo;
    const l = fichaCruaDoLead || {};
    const lista = Array.isArray(l.emails) ? l.emails : [];
    return String(l.email || lista[0] || '').trim();
  }

  /* "21/08 · 09:00" — o compromisso marcado, no fuso da operação. Régua própria
     porque `quandoDoToque` fala do PASSADO ("há 4 d", "ontem") e diria "há -2 d"
     de um retorno agendado pra depois de amanhã. */
  const quandoMarcado = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }).format(d).replace(', ', ' · ');
    } catch (_) { return ''; }
  };

  /* ------------------------------------------------------------------------
     A TRADUÇÃO — do card do servidor pro seam da tela.

     🔴 CAMPO SEM FONTE NÃO VIRA LINHA (Lei do IF, campo a campo). "CNPJ: não
     informado" empurra pra fora do vidro justamente o dado que a pessoa veio
     ver — e num lead cru do Radar seria a tela inteira dizendo "não informado".
     É esta régua que faz a ficha encolher sozinha no lead novo e crescer no
     lead enriquecido, sem uma única bandeira de "modo".
     ------------------------------------------------------------------------ */
  function traduzirFicha(l) {
    const c = l || {};
    const nome = String(c.name || '').trim();
    const principal = foneCruDoLead(c);
    const zapPorNumero = (c.phonesWhatsapp && typeof c.phonesWhatsapp === 'object') ? c.phonesWhatsapp : {};

    /* Os telefones, sem repetir o principal. A lista do enriquecimento vem ora
       como texto, ora como objeto (`{phone}`/`{number}`) — as duas formas já
       apareceram em produção, e ler só uma delas apaga números de verdade. */
    const vistos = Object.create(null);
    const fones = [];
    const somarFone = (bruto, sub) => {
      const cru = soDigitos(bruto);
      if (!cru || cru.length < 8 || vistos[cru]) return;
      vistos[cru] = 1;
      /* 🔴 "WHATSAPP CONFIRMADO" SÓ COM O SIM DO SERVIDOR. `phonesWhatsapp` é
         o veredito do motor; a AUSÊNCIA dele não é "não tem" (a maioria dos
         números nunca foi conferida), então o silêncio vira o convite neutro em
         vez de um selo negativo que faria a pessoa nem tentar. */
      const confirmado = zapPorNumero[cru] === true || zapPorNumero[`+${cru}`] === true;
      fones.push({
        cru: esc(cru),
        rot: esc(telefoneBonito(bruto) || bruto),
        sub: esc([sub, confirmado ? 'WhatsApp confirmado' : ''].filter(Boolean).join(' · ')
          || 'toque para abrir no WhatsApp'),
      });
    };
    somarFone(c.phone || c.phoneNormalized, 'principal');
    somarFone(c.ownerPhone, 'do responsável');
    (Array.isArray(c.phones) ? c.phones : []).forEach((p) => {
      somarFone((p && (p.phone || p.number)) || p, '');
    });

    const emails = [];
    const somarEmail = (bruto) => {
      const e = String((bruto && (bruto.email || bruto.address)) || bruto || '').trim();
      if (!e || e.indexOf('@') < 0 || emails.indexOf(esc(e)) >= 0) return;
      emails.push(esc(e));
    };
    somarEmail(c.email);
    (Array.isArray(c.emails) ? c.emails : []).forEach(somarEmail);

    /* O ESTADO DO LEAD em pares — e o que não veio simplesmente não entra na
       lista, então a caixa some inteira num lead que ninguém tocou ainda. */
    const tentativas = Math.max(0, Math.trunc(Number(c.attemptCount) || 0));
    const linha = [
      ['Etapa', esc(c.statusLabel || '')],
      ['Tentativas', tentativas ? String(tentativas) : ''],
      ['Último toque', c.lastContactAt ? esc(quandoDoToque(c.lastContactAt)) : 'sem toque'],
      ['Retorno marcado', esc(quandoMarcado(c.returnAt))],
      ['Próximo passo', esc(c.nextAction || '')],
      ['Origem', esc([
        ORIGEM_NA_CONVERSA[String(c.primarySource || c.sourceType || '').toLowerCase()],
        c.isFreshCompany ? 'empresa recém-aberta' : '',
      ].filter(Boolean).join(' · '))],
      ['Robô', esc((c.automation && c.automation.label) || '')],
    ].filter((p) => p[1]);

    /* O HISTÓRICO é o que o servidor já guarda (`timeline`, 12 últimos eventos).
       Teto de 6 porque esta é uma tela de DECIDIR o próximo toque, não um
       relatório: o sétimo evento empurra pra baixo o que interessa. */
    const historia = (Array.isArray(c.timeline) ? c.timeline : []).slice(0, 6).map((e) => [
      esc(quandoDoToque(e && e.createdAt) || ''),
      esc((e && e.title) || 'Atualização'),
      esc((e && e.description) || ''),
    ]).filter((h) => h[1]);

    const nota = Number(c.rating);
    const avaliacoes = Math.max(0, Math.trunc(Number(c.reviews) || 0));

    return {
      id: esc(String(c.id || '')),
      ini: esc(iniciais(nome)),
      nome: esc(nome),
      tom: !principal ? 'red' : (c.isFreshCompany ? 'lime' : ''),
      etapa: esc(c.statusLabel || ''),
      etapaTom: tomDaEtapa(c.statusLabel),
      /* Um selo só, e a ordem é a da urgência de quem lê — a MESMA régua do
         cartão do funil (`traduzirLead`), porque cartão e ficha dizendo coisas
         diferentes sobre o mesmo lead é o defeito que a régua única evita. */
      selo: !principal ? 'sem telefone' : (c.isFreshCompany ? 'empresa nova' : ''),
      seloTom: !principal ? 'red' : (c.isFreshCompany ? 'lime' : ''),
      onde: esc(local(c.city, c.state)),
      segmento: esc(c.businessCategory || c.segment || ''),
      fone: esc(principal),
      email: emails.length ? emails[0] : '',
      fones,
      emails,
      cnpj: esc(c.cnpj || ''),
      razaoSocial: esc(c.razaoSocial || ''),
      situacao: esc(c.companySituation || ''),
      responsavel: esc(c.ownerName || ''),
      nota: isFinite(nota) && nota > 0
        ? esc(`${nota.toFixed(1).replace('.', ',')}${avaliacoes ? ` · ${avaliacoes} avaliações` : ''}`)
        : '',
      site: esc(String(c.website || '').trim()),
      endereco: esc(String(c.address || '').trim()),
      recado: esc(c.shortNote || ''),
      linha,
      historia,
    };
  }

  /* ------------------------------------------------------------------------
     ABRIR E CARREGAR.
     ------------------------------------------------------------------------ */

  /* O cabeçalho nasce no MESMO quadro do dedo, com o que o cartão do funil já
     tem pintado: nome, cidade, telefone e etapa. Sem isto a tela abriria num
     esqueleto cinza por meio segundo e o toque pareceria não ter feito nada. */
  function semearFicha(id, deOnde) {
    const c = cartaoDoFunil(id) || {};
    usar('leadficha', {
      volta: deOnde && deOnde !== 'leadficha' ? deOnde : 'vendas',
      id: String(id),
      ini: c.ini || '', nome: c.nome || '', onde: c.local || '',
      etapa: c.etapa || '', etapaTom: c.etapaTom || '',
      selo: c.selo || '', seloTom: c.seloTom || '', tom: c.tom || '',
      fone: soDigitos(c.fone), email: '',
      /* 🔴 AS LISTAS NASCEM VAZIAS, E ISSO É OBRIGATÓRIO. Elas são do LEAD, e
         não da tela: sobrando do lead anterior, a ficha abriria com o telefone
         de outra empresa por meio segundo — e é um dado que termina em ligação
         telefônica. */
      fones: [], emails: [], linha: [], historia: [],
      cnpj: '', razaoSocial: '', situacao: '', responsavel: '', nota: '',
      site: '', endereco: '', recado: '', segmento: '',
      carregando: true, semFonte: false, quedaMotivo: '',
    });
  }

  function carregarFicha() {
    if (!temPonte()) return Promise.resolve();
    const id = leadDaFicha;
    if (!id) {
      /* Tela sem lead (só acontece por rota direta). Não é rede caída: é uma
         tela sem assunto, e o honesto é dizer isso sem pedir nada ao servidor. */
      usar('leadficha', { carregando: false, semFonte: false, nome: '', fones: [], emails: [] });
      return Promise.resolve();
    }
    if (fichaEmVoo && fichaEmVooDe === id) return fichaEmVoo;

    fichaEmVooDe = id;
    fichaEmVoo = window.API.get(`${caminhoDoLead(id)}/card`).then((r) => {
      // O dedo trocou de lead enquanto isso: esta resposta é de OUTRO lead, e
      // pintá-la poria o CNPJ de uma empresa na ficha de outra.
      if (leadDaFicha !== id) return;
      const l = r && r.lead;
      if (!l) { fonteCaiu('leadficha'); return; }
      /* 🔴 UMA CÓPIA SÓ DO CARD, e ela é compartilhada com a conversa
         (`fichaCruaDoLead`, declarada no `50-conversas.js`). Duas cópias do
         mesmo lead é como as duas telas passam a mostrar telefones diferentes
         depois que uma delas relê. */
      fichaCruaDoLead = l;
      usar('leadficha', Object.assign({}, fonteVoltou, traduzirFicha(l)));
    }).catch((erro) => {
      if (leadDaFicha !== id) return;
      fonteCaiu('leadficha', erro);
    }).finally(() => {
      if (fichaEmVooDe === id) { fichaEmVoo = null; fichaEmVooDe = ''; }
    });
    return fichaEmVoo;
  }

  /* O toque no cartão do Funil, na linha da Agenda e no cabeçalho da Conversa. */
  function abrirFichaDoLead(el) {
    const id = String((el && el.dataset && el.dataset.lead) || '').trim() || leadDaConversa;
    if (!id) return;
    const deOnde = telaAtual();
    leadDaFicha = id;
    /* A ficha do lead ANTERIOR morre aqui, e não quando a nova chega: entre o
       toque e a resposta existem uns 300 ms em que os botões desta tela ainda
       responderiam com o telefone de trás. */
    if (!fichaCruaDoLead || String(fichaCruaDoLead.id || '') !== id) fichaCruaDoLead = null;
    semearFicha(id, deOnde);

    if (typeof window.ir !== 'function') return;
    if (telaAtual() === 'leadficha') { carregarFicha(); return; }
    window.ir('leadficha');
    /* 🔴 `ir()` RECUSA CALADO quando o admin desligou o módulo. Cartão que não
       faz nada é o defeito que custou o cliente 46 (39 respostas 403 em 65 s,
       e a tela sem uma palavra) — a frase é a mesma do `humano()`. */
    if (telaAtual() === 'leadficha') return;
    const erro = new Error('');
    erro.body = { code: 'MODULE_ACCESS_DENIED' };
    avisoErro(erro);
  }

  /* ------------------------------------------------------------------------
     O QUE O DEDO FAZ — e cada verbo sai do app.
     ------------------------------------------------------------------------ */

  /* 🔴 CANAL SEM DESTINO NÃO ABRE NADA, E DIZ POR QUÊ. Um `wa.me/` sem número
     abre o WhatsApp na tela de "número inválido", e um `tel:` vazio abre o
     discador em branco: nos dois casos a pessoa sai do app e volta achando que
     o aplicativo a jogou fora. O aviso fica DENTRO da tela. */
  function semDestino(oque) {
    avisoErro(new Error(`Este lead não tem ${oque} — o Radar às vezes acha depois.`));
  }

  registrarTelas({ leadficha: carregarFicha });

  registrarAcoes({
    /* O TOQUE NO CARTÃO. Ele mudou de dono em 19/08: era a conversa, virou a
       ficha (o pedido do dono, e o padrão de todo CRM de celular). */
    'abrir-lead': abrirFichaDoLead,
    /* Os dois "Abrir ficha" da tela de conversa (o cartão do cabeçalho e o botão
       do aviso "Sem telefone") — mesmo verbo, um dono só. */
    'abrir-ficha-lead': abrirFichaDoLead,

    /* A conversa vista de dentro da ficha. Ela reusa a porta da tela de
       conversas em vez de reimplementar a abertura: o dia em que a régua do
       cabeçalho mudar, muda num lugar só. */
    'lead-conversar': () => {
      if (leadDaFicha) irParaConversa(leadDaFicha);
    },

    'lead-zap': (el) => {
      const fone = foneDoToque(el);
      if (!fone) { semDestino('telefone'); return; }
      /* 🔴 SEM TEXTO PRONTO, DE PROPÓSITO. Este botão abre a conversa no
         WhatsApp do APARELHO, e o que ele mandaria seria uma mensagem de robô
         saindo do número pessoal do vendedor. A régua desta casa é ROBÔ×GENTE:
         mensagem em massa custou chip banido em 17/08. Quem escreve é a pessoa,
         na tela do WhatsApp dela. */
      try { window.HBX.whatsapp(fone, ''); } catch (_) { semDestino('telefone'); }
    },

    'lead-ligar': (el) => {
      const fone = foneDoToque(el);
      if (!fone) { semDestino('telefone'); return; }
      /* `ACTION_DIAL`: o número entra no discador e QUEM APERTA O VERDE É A
         PESSOA. É por isso que este app não pede `CALL_PHONE` — permissão de
         ligar sozinho num app de vendas é poder que ele não precisa ter. */
      try { window.HBX.call(fone); } catch (_) { semDestino('telefone'); }
    },

    'lead-email': (el) => {
      const email = emailDoToque(el);
      if (!email) { semDestino('e-mail'); return; }
      /* O assunto sai do nome da empresa e o corpo fica VAZIO: o e-mail é do
         vendedor, e um texto pronto no corpo é o mesmo robô do parágrafo de
         cima com outra roupa. */
      const alvo = fichaCruaDoLead || {};
      const assunto = String(alvo.name || '').trim();
      try { window.HBX.email(email, assunto, ''); } catch (_) { semDestino('e-mail'); }
    },

    'lead-mapa': () => {
      const l = fichaCruaDoLead || {};
      const endereco = [String(l.address || '').trim(), local(l.city, l.state)]
        .filter(Boolean).join(' - ');
      if (!endereco) { semDestino('endereço'); return; }
      /* Sem lat/lng: o card não devolve coordenada, e chutar uma seria mandar o
         vendedor pro lugar errado. O `openMaps` aceita ENDEREÇO e deixa o Google
         resolver — é o mesmo caminho que o app do motorista usa quando a parada
         só tem rua e número. */
      try { window.HBX.maps(null, null, endereco); } catch (_) { semDestino('endereço'); }
    },

    'lead-site': () => {
      const url = String((fichaCruaDoLead && fichaCruaDoLead.website) || '').trim();
      if (!url) return;
      const alvo = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      // O WebView entrega qualquer URL de fora ao Android (`shouldOverrideUrlLoading`),
      // que abre no navegador do aparelho — o mesmo caminho do `wa.me` sem ponte.
      try { window.open(alvo, '_blank', 'noopener'); } catch (_) {}
    },

    /* COPIAR é o verbo do CNPJ (ninguém digita 14 dígitos olhando pra tela) e do
       telefone que a pessoa quer levar pra outro app. `navigator.clipboard` só
       existe em origem segura — a do APK é `https://appassets…`, então ele
       funciona lá dentro; o `execCommand` fica de rede de segurança pro dia em
       que o WebView de algum aparelho recusar. */
    'lead-copiar': (el) => {
      const texto = String((el && el.dataset && el.dataset.copia) || '').trim();
      if (!texto) return;
      const recibo = () => { try { window.HBX.vibrate(12); } catch (_) {} };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(texto).then(recibo).catch(() => {});
          return;
        }
      } catch (_) {}
      try {
        const caixa = document.createElement('textarea');
        caixa.value = texto;
        document.body.appendChild(caixa);
        caixa.select();
        document.execCommand('copy');
        document.body.removeChild(caixa);
        recibo();
      } catch (_) {}
    },

    'recarregar-leadficha': () => retentar('leadficha', carregarFicha),
  });
