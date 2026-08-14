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
    // A chegada muda o pino no mesmo quadro, sem depender da rede nem do
    // navegador externo. O desfecho posterior virá do servidor.
    try {
      const lista = (typeof PARADAS !== 'undefined' ? PARADAS : []) || [];
      const parada = lista.find((p) => String(p && p.id) === String(id));
      if (parada) { parada.chegou = true; parada.mapStatus = 'arrived'; }
      if (typeof pintar === 'function') pintar(false);
    } catch (_) {}
    return agora;
  }

  document.addEventListener('hbx:mapa-parada', (ev) => {
    const id = String((ev && ev.detail && ev.detail.id) || '');
    if (!id) return;
    const reg = ENTREGAS.get(id);
    if (!reg) return;
    if (continuidadeAtiva) {
      return window.portao({
        tom: 'info', ico: 'route', titulo: 'Somente consulta',
        sub: 'Use Continuar, Puxar ou Cancelar no cartão desta rota antes de alterar a ordem.',
        acoes: [['Fechar', '']],
      });
    }
    const st = String((reg.item && reg.item.status) || '');
    if (st === 'entregue' || st === 'cancelada') {
      return window.portao({
        tom: 'info', ico: st === 'entregue' ? 'check' : 'close',
        titulo: reg.item.cliente && reg.item.cliente.nome ? reg.item.cliente.nome : 'Parada finalizada',
        sub: st === 'entregue' ? 'Esta entrega já foi concluída.' : 'Esta parada foi encerrada sem entrega.',
        acoes: [['Fechar', '']],
      });
    }
    const fila = paradasPendentes().map((p) => String(p && p.item && p.item.id || '')).filter(Boolean);
    const jaPrimeiro = fila[0] === id;
    window.portao({
      tom: 'info', ico: 'route',
      titulo: reg.item.cliente && reg.item.cliente.nome ? reg.item.cliente.nome : `Parada ${reg.n}`,
      sub: jaPrimeiro ? 'Este já é o próximo cliente.' : 'Colocar este cliente como a próxima parada? O restante mantém a ordem atual.',
      acoes: [['Fechar', ''], [jaPrimeiro ? 'Abrir parada' : 'Ir agora', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => {
      if (jaPrimeiro) return abrirParada(id);
      const ordem = [id, ...fila.filter((outro) => outro !== id)];
      document.dispatchEvent(new CustomEvent('hbx:ordem', { detail: { ids: ordem } }));
    }, { once: true });
  });

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
      /* 🔴 A TELA E O SERVIDOR TÊM QUE DIZER O MESMO MOTIVO. `abrirParada` zerava
         a variável `motivo` mas NÃO o seam: marcar "Endereço não encontrado" na
         parada 3 e abrir o "não entregue" da parada 5 deixava esse motivo
         marcado na tela — enquanto o `registrarNaoEntregue` mandava
         `motivo || motivos[0]`, ou seja, "Ninguém atendeu", pro servidor. A tela
         mostrava um e o banco gravava outro. Agora o seam recebe EXATAMENTE o
         que vai ser enviado, inclusive o padrão da 1ª abertura. */
      motivo: motivo || (DADOS_MOTIVO_PADRAO() || ''),
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
      // "Ficou marcado" só é verdade quando a forma escolhida é FIADO
      // — em dinheiro/pix/cartão nada fica marcado. Número que muda de
      // significado conforme o botão é número que mente.
      lancamento: forma === 'fiado' && hojeVal != null ? dinheiro(hojeVal) : dinheiro(0),
      recebido: forma && forma !== 'fiado' && hojeVal != null ? dinheiro(hojeVal) : dinheiro(0),
      paraMarcado: anterior != null ? dinheiro(anterior + (forma === 'fiado' ? (hojeVal || 0) : 0)) : '',
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

  /* ---- CHEGOU NA PORTA: a folha abre SOZINHA ------------------------------
     🔴 O KOTLIN GRITAVA PRA NINGUÉM (10/08). `MainActivity.entregarChegada`
     dispara este evento desde sempre, a cada chegada detectada pelo
     `RotaService` — e o app novo nasceu sem ouvinte. Junto com o `activateRoute`
     que ninguém chamava (ver `sincronizarGeofence`), é a corrente inteira do
     "chegou no cliente" que a fusão de 07/08 deixou no chão.

     Ele NÃO é um caminho novo de dinheiro: cai no MESMO `abrirParada` do toque
     — mesma folha, mesmo carimbo de chegada, mesma regra de venda × folha
     completa. A diferença entre chegar e tocar é só quem deu a ordem.

     🔴 E NÃO FALA. Quem diz "Chegou: Fulano" é o `RotaService.falar()` do
     nativo, que já rodou antes deste evento existir. Um `H.speak` aqui seria
     eco — a mesma armadilha dos dois sons do Iniciar (29/07). */
  document.addEventListener('hbx:arrival', (ev) => {
    const id = String((ev && ev.detail && ev.detail.deliveryId) || '');
    if (!id) return;
    /* Folha JÁ ABERTA não se troca. Ele pode estar fechando a venda do cliente
       anterior a 20 m deste — roubar a tela no meio trocaria o cliente debaixo
       do dedo dele, e o alarme do nativo continua na barra pra ser atendido
       quando terminar. Nunca interromper dinheiro em andamento. */
    if (aberta) return;
    // Rota fora da rua: o serviço nativo sobrevive a restart e pode chegar
    // atrasado, depois do dia encerrado. Chegada sem rota não abre nada.
    try { if (estadoRota !== 'rodando') return; } catch (_) { return; }
    const reg = ENTREGAS.get(id);
    if (!reg) return;                       // parada que não é do dia na tela
    const st = String((reg.item && reg.item.status) || '');
    if (st === 'entregue' || st === 'cancelada') return;   // desfecho já dado
    abrirParada(id);
  });

  /* ---- REGISTRAR LOCAL: a porta da RUA (ordem do dono, 10/08) --------------
     *"registrar local teria q ser aqui, com GPS ativo"* — na tela de dirigir,
     que é a única em que o motorista está parado NA PORTA com o fix quente.

     Ele não inventa tela nenhuma: é um cruzamento pras três que já existem, e
     o que ele acrescenta é o FIX no bolso de cada uma. As três cobrem
     exatamente os buracos que o geofence não alcança — cliente que não está no
     dia, cliente que não existe no cadastro, e porta com pino errado (essa é a
     que o geofence NUNCA acha, porque o raio é medido a partir do pino torto).

     🔴 SEM GPS ELE NÃO PROMETE NADA. "Registrar local" sem local é o pior tipo
     de botão: o que parece ter funcionado. Sem fix, pede a permissão pela mesma
     porta do Navegar e diz o que houve. */
  function registrarLocal() {
    if (!ultimoFix) {
      garantirGps();
      return window.portao({
        tom: 'alerta', ico: 'gps', titulo: 'Ainda sem localização',
        sub: 'Libere o GPS e espere um instante. O registro precisa saber onde você está.',
        acoes: [['Fechar', '']],
      });
    }
    const precisao = Number(ultimoFix.precisaoM);
    const linha = Number.isFinite(precisao)
      ? `GPS ±${Math.round(precisao)} m${precisao <= 60 ? ' · na porta' : ' · chegue mais perto'}`
      : 'Local marcado';
    /* O nome da parada da vez entra no BOTÃO — "Corrigir esta porta" é vago
       quando ele tem 51 paradas; "Corrigir Gislaine" é a porta que ele está
       vendo. Sem parada aberta na rota, a terceira saída simplesmente não
       existe (botão que não sabe quem corrigir é botão que erra o cliente). */
    const daVez = paradasPendentes()[0] || null;
    const alvo = daVez && daVez.item && daVez.item.cliente ? daVez.item.cliente : null;
    const acoes = [
      ['Cadastrar cliente novo', 'principal', false, 'registrar-cadastrar'],
      ['Vender pra quem não está no dia', '', false, 'registrar-vender'],
    ];
    if (alvo && alvo.id) acoes.push([`Corrigir ${esc(alvo.nome || 'esta porta')}`, '', false, 'registrar-corrigir']);
    acoes.push(['Fechar', '']);
    window.portao({ tom: 'info', ico: 'gps', titulo: 'Registrar este local', sub: linha, acoes });
  }

  /** repinta a folha aberta (o seam é a única fonte da marcação selecionada) */
  function repintarFolha() {
    if (!aberta) return;
    const simples = !financeiroAtivo || cobrancaSimples;
    if (simples) encherVenda(aberta.item, aberta.n);
    else encherFolha(aberta.item, aberta.n);
  }

  /* ------------------------------------------------------------------------
     🔴 A ÚLTIMA PARADA ABRE O FECHAMENTO SOZINHA (12/08, dono: *"ao finalizar
     (última rota) … já abrindo o fechamento"*).

     Os dois desfechos — entregue e não entregue — largavam o motorista no mapa,
     sempre. No mapa de um dia ACABADO o que sobra é um botão "Navegar" sem para
     onde ir e um "Finalizar" que ele precisa descobrir sozinho. A tela sabia
     que o dia tinha acabado e não dizia.

     🔴 UMA VEZ SÓ — e a marca é o motivo de esta porta existir sem repetir a
     doença que este lote veio matar. Sem marca, TODO retorno ao dia terminado
     (voltar de Ajustes, do Chat, reabrir o app) reabriria o Fechamento por cima
     do que o motorista estivesse fazendo: seria a mesma tela "aparecendo
     algumas vezes", entrando por uma porta nova. A marca mora no APARELHO
     (`HBX.cache` = localStorage: sobrevive a fechar o app, que é justamente
     quando um estado de memória mentiria) e é carimbada pelo DIA — o `iniciar`
     a apaga, então a 2ª leva do mesmo dia ganha o recibo dela.

     🔴 E ELA NÃO FECHA NADA. Abrir é da máquina; fechar é do dedo. Fechar o dia
     encerra a rota no servidor e não tem `git revert` — máquina nenhuma aperta
     isso sozinha ("respeitando o último finalizar ainda", nas palavras do
     dono). O que a porta automática faz é POUPAR o toque de achar o botão.

     🔴 SÓ COM A ROTA NA RUA. Dia por montar, rota pronta e parada avulsa fora
     de rota nenhuma continuam caindo na Rota como sempre: "acabou" só existe
     pra quem começou.
     ------------------------------------------------------------------------ */
  const chaveDoFim = () => `fim-visto:${hojeISO()}`;
  function irDepoisDoDesfecho() {
    if (typeof window.ir !== 'function') return;
    let acabou = false;
    try {
      acabou = (estadoRota === 'rodando' || estadoRota === 'pausada')
        && paradasPendentes().length === 0;
    } catch (_) { acabou = false; }
    if (!acabou) return window.ir('rota');
    const chave = chaveDoFim();
    if (window.HBX.cache.get(chave, '')) return window.ir('rota');
    window.HBX.cache.set(chave, '1');
    window.ir('fechamento');
  }

  /** o desfecho: entregue. `metodo` vazio = a folha ainda não sabe como pagou. */
  async function confirmarEntrega(metodo) {
    if (!aberta) return;
    // 🔴 O PORTÃO DO RECADO VEM ANTES DO DINHEIRO. Ele está PARADO, com o
    // celular na mão: é o único ponto do dia em que dá pra cobrar o "Entendi"
    // sem tirar os olhos dele da rua. Ver L8b.
    if (travaDoRecado()) return;
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
      /* O GPS da confirmação é o que realimenta o cadastro do cliente — vai
         quando existe, e a falta dele NUNCA barra a entrega.

         🔴 A PRECISÃO VIAJA JUNTO, E SEM ELA O PINO NUNCA SE CORRIGE (10/08).
         O servidor só aceita a coordenada como boa com GPS de OURO
         (`gpsDeOuro` em logistica.service.ts: exige `accuracy` numérico <= 60 m);
         campo AUSENTE reprova o crivo igual a um fix ruim. Desde a fusão de
         07/08 o app mandava lat/lng pelados e o backend descartava calado —
         medido na company 41: 10 pinos `gps_entrega`, o último de 05/08. A
         porta parou de convergir exatamente quando este campo sumiu.

         Sai do `ultimoFix` INTEIRO de propósito, e não do `ultimaPos` (que só
         guarda lat/lng): coordenada e precisão têm que ser da MESMA medição.
         Precisão de um fix carimbando a coordenada de outro é mentira com cara
         de dado bom — e o que ela suja é o endereço que o cliente paga pra
         receber. Fix sem `accuracy` (o aparelho pode não informar) manda só o
         par: o servidor decide, e a decisão dele é não realimentar. */
      if (ultimoFix) {
        corpo.lat = ultimoFix.lat;
        corpo.lng = ultimoFix.lng;
        if (Number.isFinite(ultimoFix.precisaoM)) corpo.accuracy = ultimoFix.precisaoM;
      }
      try {
        await window.API.post(`/logistica/entregas/${encodeURIComponent(aberta.id)}/confirmar`, corpo);
      } catch (e) { return avisoErro(e); }
      window.HBX.cache.remove(chave);
      window.HBX.cache.remove(`chegada:${aberta.id}`);
      aberta = null; forma = '';
      await carregarRota();
      irDepoisDoDesfecho();
    });
  }

  /** o outro desfecho: não entregue, com o motivo que o motorista marcou */
  async function registrarNaoEntregue() {
    if (!aberta) return;
    // Mesma trava do confirmar: os dois desfechos fecham a parada, e o recado
    // cobra no desfecho — não na forma de pagamento.
    if (travaDoRecado()) return;
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
      irDepoisDoDesfecho();
    });
  }

  /* O 1º motivo já nasce marcado na folha (`.motivo.on` do mock): quem só toca
     em "Registrar" está escolhendo ELE, não "nenhum". Ler do seam mantém uma
     fonte só — se o dono trocar a lista no mock, isto acompanha. */
  function DADOS_MOTIVO_PADRAO() {
    try { return (DADOS.folha.motivos || [])[0] || ''; } catch (_) { return ''; }
  }

  const ACOES = {
    /* 🔴 DOIS PASSOS, NÃO TRÊS (dono, 08/08: "MONTAR ROTA → MONTAGEM DE ROTA
       (BOTÃO INICIAR)"). Este botão abre a Montagem — e abrir a Montagem JÁ
       roda o otimizador (ver o guarda do `ir`), então o motorista chega com a
       lista do dia na frente dos olhos e o pé já dizendo "Iniciar rota".
       O `montar-agora` (o 2º "Montar rota", no pé da própria tela) morreu com
       ele: era o toque a mais que só trocava a fonte da mesma lista. */
    montar: abrirMontagem,
    /* 🔴 E O `montar-agora` VOLTOU A TER DONO. Ele saiu do mapa de ações quando
       o pé da Montagem virou "Iniciar sempre" — botão desenhado sem ação, a
       doença que este arquivo persegue. Hoje ele reaparece na tela no único
       caso em que faz sentido: dia futuro escolhido no chip, onde "Iniciar" não
       existe. Sem esta linha o toque morreria no vidro. */
    /* 🔴 OS TRÊS PASSAM PELA TRAVA DA ORDEM ALTERADA (dono, 10/08). Ela só
       morde na tela de Montagem e só com o dedo tendo mexido na sequência —
       fora disso `comOrdemSalva` é um repasse. Aqui e não dentro de
       `montarRota`/`iniciarRota` porque o que se barra é o TOQUE: as duas
       funções também são chamadas por dentro (retomada, erro), e ali a
       pergunta não teria a quem falar. */
    /* 🔴 …e responde NO TOQUE (12/08): `aguardeNoToque` põe o estado de espera
       no próprio botão no mesmo quadro do dedo — ver a nota no 30-verbos. */
    'montar-agora': (alvo) => aguardeNoToque(alvo, () => comOrdemSalva(montarRota)),
    // rota rodando: o botão do meio leva pra navegação (é o que se faz andando)
    navegar: () => window.ir('mapa'),
    'salvar-rota': salvarRota,
    /* 🔴 A INTENÇÃO NASCE NA PORTA (10/08, lei do PR10082026). São DUAS portas
       pro mesmo verbo, e elas querem coisas diferentes:

         · `iniciar-rota` é o pé da MONTAGEM. Ela lê o estado DELA, no instante
           do toque: chip apagado ⇒ rota AVULSA (só o que está na tela); chip
           num dia que não é hoje ⇒ a gente daquele dia entregando HOJE; chip
           em hoje ⇒ o dia inteiro.
         · `iniciar` é o dock do MAPA. Ele nunca esteve na Montagem: quer o DIA
           INTEIRO, e ponto.

       Enquanto a decisão morava DENTRO do `iniciarRota` (lendo `montarDia`), o
       dock do mapa herdava o -1 de uma tela que o motorista nem abriu e o
       Iniciar morria com "A rota avulsa está vazia" — com 51 paradas agendadas
       no servidor. Porta que adivinha por variável de ambiente é essa doença. */
    // o irmão do mesmo pé, mesma doença, mesma cura: responde no toque.
    'iniciar-rota': (alvo) => aguardeNoToque(alvo, () => comOrdemSalva(() => iniciarRota({
      escopo: montarDia === -1 ? 'avulsa' : (diaDeOutroDia() ? 'outroDia' : 'dia'),
    }))),
    iniciar: () => comOrdemSalva(() => iniciarRota({ escopo: 'dia' })),
    'cancelar-rota': cancelarRota,
    'rota-pendente-abrir': abrirRotaPendente,
    'rota-pendente-continuar': continuarRotaPendente,
    'rota-pendente-puxar': puxarRotaPendente,
    'rota-pendente-cancelar': cancelarRotaPendente,
    'entregue-pagou': () => confirmarEntrega(''),
    'entregue-marcou': () => confirmarEntrega('fiado'),
    'confirmar-venda': () => confirmarEntrega(''),
    'registrar-nao-entregue': registrarNaoEntregue,
    'fechar-dia': fecharDia,
    'salvar-cliente': salvarCliente,
    'excluir-cliente': excluirCliente,
    'salvar-produto': salvarProduto,
    /* O VÍNCULO CLIENTE × PRODUTO (12/08) — a ficha voltou a ADMINISTRAR o que
       o cliente leva, e não só a listar. Nada de endpoint novo: POST/PATCH/
       DELETE de `/logistica/cliente-produtos` já existiam e já estavam na
       allowlist do Kotlin; o que faltava era alguém bater na porta. */
    'novo-vinculo': novoVinculo,
    'salvar-vinculo': salvarVinculo,
    'remover-vinculo': removerVinculo,
    'remover-vinculo-agora': removerVinculoAgora,
    'chave-vinculo-ativo': virarChaveDoVinculo,
    /* As DUAS chaves do Financeiro da ficha. Elas mexem na MEMÓRIA e o Salvar
       grava — ver `mexerFinanceiro`: nesta tela o dono mexe em nome, endereço,
       dia, produto e dinheiro e aperta UM botão; chave que gravasse no toque
       faria metade da ficha obedecer o Voltar e a outra metade não. */
    'chave-contabilizar': () => mexerFinanceiro({ contabilizar: !(ficha && ficha.fin && ficha.fin.contabilizar) }),
    'chave-avisar-cobranca': () => mexerFinanceiro({ avisarCobranca: !(ficha && ficha.fin && ficha.fin.avisarCobranca) }),
    // o "+" do cabeçalho: cadastrar cliente na porta
    'usar-meu-local': usarMeuLocal,
    // o GPS da FICHA (10/08): mesmo motor, cliente que já existe
    'usar-local-ficha': usarLocalFicha,
    /* As três saídas do "Registrar local". Cada uma REUSA a porta que já
       existe — nada de fluxo paralelo de cadastro/venda na rua, que é como
       nasce o cliente que só existe numa das telas.
       O cadastro já sabe puxar o fix sozinho (`usarMeuLocal` traz CEP, rua e
       bairro do reverse — o dado que ninguém sabe de cor na frente do cliente),
       então aqui é literalmente abrir a tela e chamar o que o dedo chamaria. */
    'registrar-cadastrar': () => { window.ir('novocliente'); usarMeuLocal(); },
    'registrar-vender': () => window.ir('rapida'),
    'registrar-corrigir': () => {
      const daVez = paradasPendentes()[0];
      const c = daVez && daVez.item && daVez.item.cliente;
      if (!c || !c.id) return;
      // A ficha real do cliente, com o Voltar devolvendo pra navegação.
      abrirCliente(String(c.id), 'mapa');
    },
    'registrar-local': registrarLocal,
    'salvar-novo-cliente': salvarNovoCliente,
    'criar-cliente-assim': () => comTrava(() => criarCliente(null)),
    // o "+" da Montagem e da Rota: a parada avulsa
    'rapida-buscar': () => comTrava(rapidaBuscar),
    'rapida-confirmar': () => comTrava(rapidaConfirmar),
    'rapida-adicionar-escolhidos': () => comTrava(rapidaAdicionarEscolhidos),
    'rapida-recarregar': () => {
      if (!rapida) return;
      rapida.listaCarregando = true; rapida.listaSemFonte = false;
      publicarRapida();
      carregarClientesDaRapida();
    },
    'entendi-recado': entendiRecado,
    // "Tentar de novo" do aviso de fonte fora do ar: volta pro esqueleto e
    // pede de novo. Sem devolver o esqueleto o toque não teria resposta
    // nenhuma na tela, e o motorista tocaria três vezes achando que travou.
    'recarregar-montagem': () => retentar('montagem', encherMontagem),
    'recarregar-clientes': () => retentar('clientes', carregarClientes),
    'recarregar-produtos': () => retentar('produtos', carregarProdutos),
    'recarregar-salvas': () => retentar('salvas', carregarSalvas),
    'recarregar-chat': () => retentar('chat', carregarRecados),
    'recarregar-ajustes': () => retentar('ajustes', carregarAjustes),
    /* Os dois blocos da tela de Créditos tentam de novo SEPARADO — cada um pede
       só a sua porta. Um "Tentar de novo" que rebuscasse as duas devolveria ao
       esqueleto o bloco que já estava certo na tela. */
    'recarregar-creditos': () => retentar('creditos', carregarCreditos),
    'recarregar-movimento': () => {
      if (typeof window.usarDados === 'function') {
        window.usarDados('creditos', { movCarregando: true, movSemFonte: false });
      }
      carregarCreditos();
    },
    'recarregar-financeiro': () => retentar('financeiro', carregarFinanceiro),
    /* O "Finalizar" do dock da rota. Ele é PORTA, não verbo: abre o Fechamento,
       onde o dinheiro do dia está à vista e mora o único botão que fecha (ver
       `fecharDia`). Antes apontava pro próprio `fechar-dia` — dois botões no
       mesmo gancho, um deles numa tela que o outro abre. */
    'ir-fechamento': () => window.ir('fechamento'),
    'ir-creditos': () => window.ir('creditos'),
    'ir-financeiro': () => window.ir('financeiro'),
    'ir-avancado': () => window.ir('avancado'),
    // 'chave-caderneta' morreu em 07/08 junto com a chave; em 09/08 a palavra
    // saiu do produto inteiro — a tela é o FECHAMENTO DO DIA.
    /* 🔴 TRÊS CAMPOS DO SERVIDOR DISPUTAVAM O RÓTULO "AVISAR CHEGADA". Medido,
       e a diferença é de FUNÇÃO, não de nome:
       · `raioChegadaM` (60 m) — no app que já roda é o raio do geofence NATIVO
         (`activateRoute({raioM})`): é ele que dispara o `hbx:arrival` e ABRE a
         folha sozinho. O app novo NÃO tem esse geofence — aqui a folha abre
         quando o motorista TOCA na parada. Logo, no celular novo esse número
         não muda nada do que ele vê (o que sobra dele é o vigia da Central, que
         é tela de PC). Não entra: número que não faz nada é o mesmo defeito da
         chave que não faz nada.
       · `avisoChegandoEnabled` — liga/desliga o WhatsApp "estou chegando" PRO
         CLIENTE. É literalmente o "chegou no cliente" do dono. É esta a chave.
       · `avisoChegandoDistanciaM` (500 m) — a que distância esse aviso sai. É o
         NÚMERO que aparece na linha, e agora ele é verdade: é o raio do anel
         armado em `anelDeChegada`. */
    // Os dois da beirada da tela de dirigir. Até 08/08 o toque neles morria no
    // vidro — botão desenhado que não faz nada é pior que botão ausente.
    'gps-voz': () => {
      try {
        const p = window.HBX.soundPrefs.get() || {};
        window.HBX.soundPrefs.set(Object.assign({}, p, { voz: p.voz === false }));
      } catch (_) { return; }        // sem ponte de som: nada a prometer
      pintarNavegacao();             // o botão muda de cara no mesmo toque
    },
    // recentralizar é o dedo dizendo "me devolve pra tela de dirigir": ele
    // ATRAVESSA a descida, senão o toque morre esperando 2,4 s de animação.
    // 🔴 E agora ele tem O QUE desfazer: até 08/08 este botão só reafirmava
    // uma câmera que nunca tinha saído do lugar — botão sem trabalho, do lado
    // de um mapa que não obedecia o dedo. Os dois defeitos eram um só.
    'gps-centrar': () => { voltarASeguir(); },
    // O único botão da beirada do mapa 2D (a tela principal da rota). Ele existe
    // porque o dedo pode levar o mapa pra qualquer lugar e nada ali o traz de
    // volta: não há câmera automática no palco "geral", de propósito.
    /* 🔴 O BOTÃO-ALVO É A PORTA DA LOCALIZAÇÃO, NÃO SÓ UMA CÂMERA (09/08). Ele
       enquadrava e pronto — e num dia SEM rota o que ele promete ("Centralizar
       em mim") depende de uma posição que o app pode não ter: sem fix, o toque
       não fazia absolutamente nada e o motorista tocava de novo, e de novo.
       Agora ele faz as duas metades, nesta ordem: GARANTE o GPS (pedindo a
       permissão ao Android se ainda não houver — e este é o toque que autoriza
       o pedido, § pedirGpsNoToque) e enquadra com o que já existe. Quando o fix
       chegar depois, `moverEuNoPlano` cria o marcador e enquadra UMA vez — o
       "centra" acontece sozinho, sem este botão precisar esperar por nada. */
    'mapa-enquadrar': () => { pedirGpsNoToque(); enquadrarPlano(); },
    // A barra do mapa vira BOTÃO quando a localização está desligada (§ T.rota
    // no mock). É a mesma porta do alvo: informação e saída na mesma peça.
    'gps-ligar': () => { pedirGpsNoToque(); },
    'aviso-chegada': () => virarChave('avisoChegandoEnabled'),
    // As 6 do dono. Uma chave = um campo = um PATCH, sem lote: assim o que
    // falhou fica evidente e o resto não volta atrás junto.
    'chave-financeiro': () => virarChave('moduloFinanceiroAtivo'),
    'chave-cobranca-simples': () => virarChave('cobrancaSimples'),
    'chave-preco-cliente': () => virarChave('precoPorClienteAtivo'),
    'chave-na-hora': () => virarChave('aceitaNaHora'),
    'chave-mensal': () => virarChave('aceitaMensal'),
    'chave-fiado': () => virarChave('aceitaFiado'),
    // A do prospector entra pela MESMA porta das seis: um campo, um PATCH, sem
    // otimismo na tela. É ela que deixa o capítulo "Ligue o prospector"
    // terminar num `fazer` de verdade — o dono liga na hora, aprendeu fazendo.
    'chave-prospector': () => virarChave('prospectorAtivo'),
    /* PROSPECTOR v2 (12/08) — as três portas da ESCOLHA DA SEMANA. Elas NÃO são
       chave de config: a chave de cima é da EMPRESA (um campo, um PATCH), estas
       são da PESSOA que dirige (§7b-bis). Abrir CARREGA antes de navegar — folha
       de escolha que nasce vazia é folha que mente sobre o que está escolhido. */
    'abrir-prospector-tipo': abrirFolhaDoProspector,
    'prospector-desligar': desligarProspectorSemana,
    // Som e voz sao do APARELHO (soundPrefs do Kotlin), nao do servidor.
    'chave-sons': () => {
      try {
        const atual = window.HBX.soundPrefs.get() || {};
        window.HBX.soundPrefs.set(Object.assign({}, atual, { master: atual.master === false }));
      } catch (_) { /* sem ponte de som: nada a fazer */ }
      carregarAjustes();
    },
    // 🔴 `chave-tema` NÃO ENTRA AQUI — e a ausência é a correção, não um
    // esquecimento. O tema tem um dono só (§1): a ponte já EMBRULHA o
    // `trocarLuz` do mock pra falar com o native. O mock vira a luz; o embrulho
    // leva pro aparelho. Uma entrada aqui viraria a luz uma SEGUNDA vez no
    // mesmo clique — medido no g15: escuro→claro→escuro, e a chave "Tema
    // escuro" dos Ajustes simplesmente não fazia nada.
    // 🔴 SAIR APAGA A SESSAO DO APARELHO — confirma antes, sempre.
    sair: () => {
      window.portao({
        tom: 'alerta', ico: 'logout', titulo: 'Sair do aplicativo?',
        sub: 'Voce vai precisar parear o aparelho de novo.',
        acoes: [['Ficar', ''], ['Sair', 'principal']], classe: 'duas',
      });
      const b = naCamada('.portao-wrap .principal');
      if (b) b.addEventListener('click', () => { try { window.HBX.logout(); } catch (_) {} }, { once: true });
    },
    recarregar: () => {
      if (!pacoteEscolhido) return;
      // O checkout e NATIVO (RechargeCheckoutActivity): o WebView nunca ve
      // dado de cartao. Aqui so se diz QUAL pacote.
      try { window.HBX.recharge(pacoteEscolhido); }
      catch (_) { avisoErro(new Error('Nao consegui abrir a recarga agora.')); }
    },
    /* 🔴 A PORTA MANUAL DA ATUALIZAÇÃO (09/08). Enquanto só existia o pop-up
       automático, perder o aviso uma vez era ficar preso na versão velha: sem
       chip no cabeçalho, sem linha nos Ajustes, sem nada pra tocar. `forcado`
       fura a trava de 30 min E a memória do "já avisei" — e responde SEMPRE,
       inclusive quando não há novidade. */
    'buscar-update': () => { checkAppUpdate(true); },
    'enviar-recado': enviarRecado,
    // "Responder" não manda nada: ele leva o dedo pro campo. O texto é dele.
    'responder-recado': () => {
      const el = naCamada('[data-campo="recado-texto"]');
      if (el) el.focus();
    },
  };
  /* 🔴 A SETA DO CABEÇALHO É O MESMO VOLTAR (dono, 10/08). O item 4 do pedido
     fala de "voltar", e nesta tela ele tem duas portas: a tecla do Android e a
     seta do topo. Regra que vale numa porta só não é regra — é armadilha.
     Fase de CAPTURA, e só aqui: o roteador do mock escuta `[data-ir]` na subida
     e mandaria a tela pra Rota antes de qualquer coisa. `stopPropagation` no
     documento em captura impede que ele veja o toque; sem dia aceso a linha nem
     morde, e a seta volta a ser a seta. */
  document.addEventListener('click', (e) => {
    if (!temPonte() || telaAtual() !== 'montagem' || montarDia === -1) return;
    if (!e.target.closest('[data-voltar][data-ir]')) return;
    e.preventDefault();
    e.stopPropagation();
    soltarDia();
  }, true);

  // captura na fase de subida, DEPOIS do mock: quem não é meu segue o caminho dele.
  document.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-acao], [data-estado]');
    if (!alvo || !temPonte()) return;
    const chave = alvo.dataset.acao || alvo.dataset.estado;
    // Ações que carregam ARGUMENTO no próprio botão. Ficam fora do mapa porque
    // o mapa é nome→função; aqui o dado é parte do toque.
    if (chave === 'abrir-parada') return abrirParada(alvo.dataset.parada);
    // A ficha volta pra TELA DE ONDE SAIU o toque (Clientes ou Montagem): quem
    // abriu a ficha no meio de montar a rota não pode cair na lista de
    // cadastro e perder o dia que estava arrumando.
    if (chave === 'abrir-cliente') return abrirCliente(alvo.dataset.cliente, telaAtual());
    if (chave === 'abrir-produto') return abrirProduto(alvo.dataset.produto);
    /* 🔴 DUAS PORTAS PARECIDAS QUE NÃO PODEM SE MISTURAR (12/08). `abrir-produto`
       leva ao CATÁLOGO (preço de todo mundo); `abrir-vinculo` leva ao que ESTE
       cliente leva. Confundi-las é mudar o preço da empresa achando que se
       acertou o de uma pessoa — por isso são dois nomes, nunca um com "modo". */
    if (chave === 'abrir-vinculo') return abrirVinculo(alvo.dataset.vinculo);
    if (chave === 'escolher-produto-vinculo') return escolherProdutoDoVinculo(alvo.dataset.produto);
    if (chave === 'local-vinculo') return escolherLocalDoVinculo(alvo.dataset.local);
    // Os dois chips do Financeiro da ficha: mexem na memória, o Salvar grava.
    if (chave === 'forma-cliente') return mexerFinanceiro({ forma: String(alvo.dataset.forma || 'na_hora') });
    if (chave === 'metodo-cliente') return mexerFinanceiro({ metodo: String(alvo.dataset.metodo || '') });
    if (chave === 'abrir-historico-cliente') return abrirHistoricoCliente();
    if (chave === 'historico-cliente-mais') return carregarMaisHistoricoCliente();
    if (chave === 'abrir-salva') return abrirSalva(alvo.dataset.salva);
    /* AS TRÊS DO ANEXO DO RECADO (12/08, L8d). O argumento é o id do RECADO —
       nunca o do cliente/rota: quem guarda o estado da decisão é o recado, e
       chavear pelo alvo faria duas mensagens sobre o mesmo cliente virarem uma
       decisão só. `encaixar` leva o NÓ junto, que é onde o `aguarde` entra. */
    if (chave === 'anexo-encaixar') return encaixarAnexo(alvo.dataset.anexo, alvo);
    if (chave === 'anexo-analisar') return analisarAnexo(alvo.dataset.anexo);
    if (chave === 'anexo-negar') return negarAnexo(alvo.dataset.anexo);
    if (chave === 'abrir-empresa') return acenderEmpresa(alvo.dataset.empresa);
    // O chip da folha do prospector: o TIPO é o argumento do toque (§7b-bis).
    if (chave === 'prospector-tipo') return escolherTipoProspector(alvo.dataset.tipo);
    if (chave === 'pacote') return escolherPacote(alvo.dataset.pacote);
    if (chave === 'modo-rota') return escolherModo(alvo.dataset.modo);
    // As três da parada avulsa que carregam ARGUMENTO no próprio botão.
    if (chave === 'rapida-opcao') return rapidaEscolher(alvo.dataset.i);
    if (chave === 'rapida-modo') {
      if (!rapida) return;
      rapida.modo = alvo.dataset.modo === 'cadastro' ? 'cadastro' : 'direcao';
      rapida.aviso = '';
      return publicarRapida();
    }
    if (chave === 'rapida-posicao') {
      if (!rapida) return;
      rapida.posicao = alvo.dataset.posicao === 'primeira' ? 'primeira' : 'perto';
      return publicarRapida();
    }
    if (chave === 'rapida-porta') {
      if (!rapida) return;
      rapida.porta = alvo.dataset.porta === 'endereco' ? 'endereco' : 'cadastro';
      rapida.aviso = '';
      publicarRapida();
      // Volta pra porta do cadastro com a lista no chão? Ela tenta de novo
      // sozinha — trocar de aba é o pedido de ver a lista.
      if (rapida.porta === 'cadastro' && (rapida.listaSemFonte || !rapida.lista.length)) carregarClientesDaRapida();
      return;
    }
    if (chave === 'rapida-marcar') {
      if (!rapida) return;
      const id = String(alvo.dataset.cliente || '');
      if (!id) return;
      const i = rapida.escolhidos.indexOf(id);
      if (i >= 0) rapida.escolhidos.splice(i, 1); else rapida.escolhidos.push(id);
      rapida.aviso = '';
      return publicarRapida();
    }
    if (chave === 'historico-usar') {
      return void usarHistorico(String(alvo.dataset.data || ''));
    }
    if (chave === 'montar-dia') {
      const n = Number(alvo.dataset.dia) || 0;
      /* 🔴 CHIP DE DIA É LIGA/DESLIGA (dono, 10/08: "eu aperto SEG, para
         remover segunda, ela não some — se ela saísse apareceria essa rota
         avulsa"). O 2º toque no chip aceso APAGA o dia da tela: sem dia nenhum
         (`montarDia = -1`) a Montagem é a ROTA AVULSA — a lista fica só com o
         que o dedo pôs (rascunho e avulsas de hoje) e o Iniciar sai só com
         elas, sem varrer a agenda junto. Tocar qualquer chip devolve o dia. */
      if (montarDia === n) return void soltarDia();
      montarDia = n;
      // o chip acende JÁ (resposta ao dedo); a lista do dia chega em seguida
      window.usarDados('montagem', { diaSel: montarDia });
      // Os 3 espaços são DO DIA: trocar de chip troca a fileira inteira, senão
      // o Espaço 1 de sábado ficaria aceso na tela de segunda.
      carregarEspacos();
      encherMontagem();
      return;
    }
    if (chave === 'chip-dia') {
      const n = Number(alvo.dataset.dia) || 0;
      // 2º toque no mesmo chip DESLIGA o filtro. Chip que só liga é armadilha:
      // o motorista fica preso num dia e acha que perdeu os clientes.
      filtroClientes.dia = filtroClientes.dia === n ? 0 : n;
      window.usarDados('clientes', { diaSel: filtroClientes.dia });
      return carregarClientes();
    }
    if (chave === 'dia-cliente') {
      if (!ficha) return;
      const n = Number(alvo.dataset.dia) || 0;
      const i = ficha.dias.indexOf(n);
      if (i >= 0) ficha.dias.splice(i, 1); else ficha.dias.push(n);
      return encherFicha();
    }
    if (chave === 'forma') { forma = String(alvo.dataset.forma || ''); return repintarFolha(); }
    if (chave === 'motivo') {
      motivo = String(alvo.dataset.motivo || '');
      if (typeof window.usarDados === 'function') window.usarDados('folha', { motivo });
      return;
    }
    const fn = ACOES[chave];
    // o NÓ TOCADO viaja junto: é nele que o "aguarde" do montar/iniciar entra
    // no mesmo quadro do dedo (quem não usa o argumento simplesmente o ignora).
    if (fn) fn(alvo);
  });
})();
