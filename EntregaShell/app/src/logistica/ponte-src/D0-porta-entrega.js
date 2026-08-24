  /* ------------------------------------------------------------------------
     8. L4 — A PORTA: chegar, entregar e receber.

     Três regras de domínio que NÃO nasceram aqui — vieram do app que já roda:
     · a folha é UMA: a COMPLETA (`folha`). Até 24/08 a config escolhia entre
       ela e a simples (`venda`) — a simples morreu junto com o interruptor do
       financeiro, e toda chegada abre a completa;
     · a hora da CHEGADA nasce no celular quando a folha abre e viaja no
       DESFECHO (nunca num POST próprio) — a folha tem que abrir sem rede;
     · toque repetido não confirma duas vezes: a `idempotencyKey` é gravada
       ANTES da ida e só morre quando o servidor responde.

     🔴 O COMPROVANTE POR FOTO NÃO ESTÁ AQUI DE PROPÓSITO (decisão do dono,
     06/08): 0 uso na história do produto. Não é esquecimento.
     ------------------------------------------------------------------------ */
  const ENTREGAS = new Map();
  /* O WhatsApp do SUPORTE (ordem 6 do dono, 17/08) — número completo, com país
     e DDD. Constante e não campo de servidor: é o telefone do dono, não
     configuração de tenant, e uma linha de socorro que depende de a rede
     responder é justamente a que falta na hora que ela some. Ver a ação
     `suporte`, lá embaixo. */
  const SUPORTE_WHATSAPP = '5519997024884';

  /* O número do suporte que VALE: o que o servidor publica em `/logistica/config`
     (`suporteWhatsapp`, env ADMIN_SUPPORT_PHONE — a mesma fonte do e-mail de
     boas-vindas e do "me ligue"), caindo na constante quando a config ainda não
     chegou ou a rede sumiu. A constante continua sendo a linha de socorro offline;
     a config é quem deixa o dono trocar o número sem publicar APK. */
  function numeroDoSuporte() {
    let fromConfig = '';
    try { fromConfig = String((config && config.suporteWhatsapp) || '').replace(/\D/g, ''); } catch (_) { fromConfig = ''; }
    return fromConfig.length >= 10 ? fromConfig : SUPORTE_WHATSAPP;
  }

  /* ── "QUERO QUE A HBX ME LIGUE" (22/08, PR22082026-CLIENTE-ME-ACHA) ─────────
     O pedido de contato de dentro do app. Vira LEAD no /vendas da HBX + e-mail
     pro suporte (POST /logistica/contato-hbx). É a porta que a política da
     Play permite: pedido de contato, sem preço, sem compra, sem link.
     O estado (assunto + telefone) vive AQUI, não no DOM do portão: o botão do
     portão fecha a peça no mesmo toque (`data-fechar`), então ler o campo na
     hora do envio seria ler um nó que já saiu da tela. */
  const CONTATO_ASSUNTOS = [
    ['creditos', 'Créditos e plano'],
    ['fiscal', 'Nota fiscal'],
    ['vendas', 'Vendas / clientes novos'],
    ['app', 'Dúvida no app'],
    ['outro', 'Outro'],
  ];
  let contatoAssunto = 'creditos';
  let contatoTelefone = '';

  function abrirPedidoDeContato() {
    const chips = CONTATO_ASSUNTOS.map(([k, t]) =>
      `<button class="chip${k === contatoAssunto ? ' on' : ''}" data-acao="contato-assunto" data-assunto="${k}">${t}</button>`).join('');
    window.portao({
      tom: 'info', ico: 'bell', titulo: 'Quero que a HBX me ligue',
      sub: 'Diz o assunto e deixa um telefone. A HBX te chama — sem compromisso.',
      corpo: `<div class="chips" data-papel="contato-assuntos">${chips}</div>
        <div class="pt-campo"><input class="resto" type="tel" inputmode="tel" placeholder="Seu telefone com DDD" value="${esc(contatoTelefone)}" data-campo="contato-telefone"></div>`,
      acoes: [['Agora não', ''], ['Enviar pedido', 'principal', undefined, 'contato-enviar']], classe: 'duas',
    });
  }

  function escolherAssuntoContato(chave, alvo) {
    const k = String(chave || '').trim();
    if (!CONTATO_ASSUNTOS.some(([key]) => key === k)) return;
    contatoAssunto = k;
    try {
      const caixa = alvo && alvo.closest ? alvo.closest('[data-papel="contato-assuntos"]') : null;
      if (caixa) caixa.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.assunto === k));
    } catch (_) { /* só visual */ }
  }

  async function enviarPedidoDeContato() {
    const telefone = String(contatoTelefone || '').replace(/\D/g, '');
    try {
      await window.API.post('/logistica/contato-hbx', { assunto: contatoAssunto, telefone });
      window.portao({
        tom: 'ok', ico: 'check', titulo: 'Pedido enviado',
        sub: 'A HBX vai falar com você pelo WhatsApp ou pelo telefone da sua conta.',
        acoes: [['Fechar', '']],
      });
    } catch (e) {
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'Não consegui enviar agora',
        sub: 'Tenta de novo em instantes — ou fala direto com a gente no WhatsApp.',
        acoes: [['Fechar', ''], ['WhatsApp', 'principal', undefined, 'suporte']], classe: 'duas',
      });
    }
  }

  // O telefone digitado no portão: guardado a cada tecla (ver nota acima).
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el && el.matches && el.matches('[data-campo="contato-telefone"]')) contatoTelefone = String(el.value || '');
  });

  // ⚰️ 24/08 — `financeiroAtivo`/`cobrancaSimples` morreram: o financeiro é
  // sempre ligado e TODA chegada abre a folha completa (a simples morreu).
  let aberta = null;              // { id, n, item } — a parada com a folha aberta
  let forma = '';                 // pix | dinheiro | cartao | fiado
  let motivo = '';                // o motivo do "não entregue"

  /* ---- LOTE 3 (15/08) — O "VOCÊ CHEGOU" -----------------------------------
     `chegada` é o id da parada com o CARTÃO aberto (a peça `.chegou-wrap`,
     nunca a folha — essa é `aberta`, acima). `chegadaPalco` é de onde o
     motorista estava quando ABRIU A FOLHA ('rota'=2D · 'mapa'=3D) — gravado
     em `abrirParada`, não no nascimento do cartão (FURO 2 do LOTE 3.1,
     15/08: nem toda folha abre por um cartão — lista 2D, pino do mapa e
     mapalista chamam `abrirParada` direto, e um cartão visto e nunca aberto
     não pode gravar palco nenhum). É ele que devolve o motorista pro palco
     certo depois de confirmar (`irDepoisDoDesfecho`, logo abaixo neste
     mesmo arquivo — "quem chegou dirigindo volta a dirigir; quem chegou
     olhando o dia volta pro dia"). `chegadasDispensadas` é o "Agora não": a
     chegada continua carimbada (o pino segue âmbar), só não insiste em
     reabrir o cartão sozinha. */
  let chegada = null;
  let chegadaPalco = null;
  const chegadasDispensadas = new Set();
  /* AS TELAS QUE SÃO "DIRIGIR" (o 3D). Uma lista, não um literal espalhado:
     é ela que `irDepoisDoDesfecho` consulta pra devolver o motorista pro palco
     dele. `mapalista` ("Mapa + fila") ainda é maquete no mock — no dia em que
     virar tela de dado, ela entra AQUI e nada mais precisa mudar. */
  const PALCOS_3D = ['mapa'];

  // ⚰️ 24/08 — o `lerConfig()` que morava aqui morreu junto com a bifurcação
  // venda×folha: era um `GET /logistica/config` a mais POR ABERTURA DO APP só
  // pra decidir qual folha abrir — e a decisão acabou (folha completa, sempre).

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
        // VASILHAME onda 2 (17/08) — os dois slots do fim: quantos vazios estão
        // contados e o id do item (o − e o + da linha do casco precisam dele).
        // `slotVazios` devolve '' pra produto sem casco, e aí a linha nem nasce.
        // Ver `C7-vasilhame-vazios.js`.
        return [
          'box', esc(prod.nome), `previsto ${it.qtdPrevista}${preco}`, String(qtd == null ? '' : qtd),
          slotVazios(it), String(it.id || ''),
        ];
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
      // DE QUAL FOLHA a `folhanao` foi aberta — desde 24/08 só existe a
      // COMPLETA, e ela ESTÁ preenchida: voltar pra ela é honesto.
      voltarPara: 'folha',
    });
  }

  /* ⚰️ `encherVenda` (a folha SIMPLES) MORREU em 24/08. A bifurcação
     venda×folha vivia da config (`!financeiroAtivo || cobrancaSimples`) e os
     dois campos morreram no contrato — toda chegada abre a folha COMPLETA, que
     sempre teve o "Não entregue" (a ordem 9 de 17/08 era exatamente religar
     essa saída na folha que o dono usava). O `semPreco` morreu junto: o
     servidor não distingue mais — R$ 0,00 é valor legítimo e é o que
     `dinheiro(0)` imprime na folha completa. */

  /** toque na parada: carimba a chegada e abre a folha completa */
  function abrirParada(id) {
    const reg = ENTREGAS.get(String(id));
    if (!reg || typeof window.usarDados !== 'function') return;
    /* 🔴 FURO 2 DO LOTE 3.1 (15/08) — `chegadaPalco` GRAVA AQUI, não mais
       dentro de `desenharChegada`. Até a 3.1 o campo nascia junto do CARTÃO
       ("o palco onde ele apareceu na tela") — mas nem toda folha abre por um
       cartão: lista 2D, pino do mapa e mapalista chamam esta função DIRETO,
       sem cartão nenhum passar por `desenharChegada`. Um cartão visto e nunca
       aberto (ou aberto bem depois, de OUTRO palco) deixava `chegadaPalco`
       apontando pro ÚLTIMO cartão que nasceu — estado GLOBAL do cartão, não
       da parada sendo desfechada. Medido nos dois sentidos: confirmar uma
       parada aberta pela LISTA 2D jogava o motorista na navegação 3D sem ele
       ter pedido; confirmar uma parada aberta pelo PINO dirigindo no 3D
       cuspia no 2D — o defeito que o lote 3 dizia ter matado.
       `telaAtual()` no instante exato do toque é a única fonte que não
       mente: `irDepoisDoDesfecho` lê isto depois, pra devolver o motorista
       pro palco de onde ELE abriu ESTA folha, nunca do último cartão. */
    chegadaPalco = telaAtual();
    aberta = { id: String(id), n: reg.n, item: reg.item };
    carimbarChegada(aberta.id);
    // "Registrar entrega" do cartão cai NESTA MESMA função (zero código novo,
    // §3.5 do lote): zera o cartão da chegada — `chegada`, não `chegadaPalco`,
    // que acabou de ser regravado acima com o palco de VERDADE desta abertura.
    if (chegada === String(id)) chegada = null;
    // Método já gravado (reabrindo) > o padrão do cliente > nenhum. Nada de
    // "Dinheiro" pré-marcado por enfeite: quem escolhe como recebeu é quem
    // está na porta.
    const c = reg.item.cliente || {};
    forma = String(reg.item.receiptMethod || c.metodoPadrao || '');
    motivo = '';
    // VASILHAME onda 2 — a contagem de vazios é DESTA porta. Sobrar o "2" da
    // parada anterior daria casco ao cliente errado (mesma lei do `motivo`).
    zerarVazios();
    // 24/08 — sem bifurcação: a folha simples morreu, a completa é a única.
    encherFolha(reg.item, reg.n);
    window.ir('folha');
  }

  /* ---- CHEGOU NA PORTA: O CARTÃO ABRE SOZINHO -----------------------------
     🔴 O KOTLIN GRITAVA PRA NINGUÉM (10/08). `MainActivity.entregarChegada`
     dispara este evento desde sempre, a cada chegada detectada pelo
     `RotaService` — e o app novo nasceu sem ouvinte. Junto com o `activateRoute`
     que ninguém chamava (ver `sincronizarGeofence`), é a corrente inteira do
     "chegou no cliente" que a fusão de 07/08 deixou no chão.

     🔴 ATÉ 14/08 ele caía direto no `abrirParada` (a folha abria sozinha). O
     LOTE 3 (15/08) pôs um degrau NO MEIO: a chegada abre o CARTÃO
     (`.chegou-wrap`, por cima do palco em que o motorista já está, sem trocar
     de tela) — é o toque dele em "Registrar entrega" que cai no `abrirParada`
     de sempre. Mesmo carimbo de chegada, mesma regra de venda × folha
     completa; o que mudou é só ONDE o dedo entra na cadeia.

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
    /* ---- GUARDAS DO LOTE 3 (15/08) — o CARTÃO, não mais a folha direto ----
       Nesta ordem: mesma parada já com cartão aberto (geofence pode repetir o
       evento); id que o motorista já dispensou nesta sessão ("Agora não" não
       insiste); 2ª chegada de OUTRO cliente com um cartão já aberto não troca
       o cliente debaixo do dedo (mesma lei da folha, um degrau acima); e tela
       fora de rota/mapa GRAVA o estado e sai — o cartão nasce quando ele
       voltar a um dos dois palcos (o observador de 80-gps-rotas-salvas.js
       chama `desenharChegada()` de novo nessa volta). */
    if (chegada === id) return;
    if (chegadasDispensadas.has(id)) return;
    /* 🔴 FURO 3 DO LOTE 3.1 (15/08) — CARIMBA ANTES DE DECIDIR (mesma ordem
       do `abrirParada`: carimba primeiro, decide depois). Até a 3.1, `if
       (chegada) return` vinha ANTES do carimbo: a 2ª chegada com um cartão já
       aberto era descartada INTEIRA — `chegada:<id>` nunca era gravado e o
       pino da 2ª parada nunca ficava âmbar (o `arrivedAt` dela virava a hora
       do toque manual). Carimbar não abre cartão nenhum sozinho — só decide o
       relógio; quem decide se TROCA o cliente na tela é a guarda logo abaixo,
       que continua de pé. */
    carimbarChegada(id);
    if (chegada) return;      // não troca o cliente debaixo do dedo
    chegada = id;
    const tela = telaAtual();
    if (tela !== 'rota' && tela !== 'mapa') return;
    desenharChegada();
  });

  /* ---- A PORTA ÚNICA DE MONTAGEM DO CARTÃO (LOTE 3, 15/08) ----------------
     `function`, não `const`: a costura concatena `80-gps-rotas-salvas.js`
     ANTES deste arquivo, e é de lá (o observador de mutação, depois de
     `montarMapa(palco)`) que ela também é chamada — só o hoisting garante
     que o nome já existe quando a chamada roda.

     🔴 A GUARDA `naCamada('.chegou-wrap')` É O QUE IMPEDE O RENASCER 1×/S
     (armadilha nº2 do desenho). O observador dispara em TODO repinte — e no
     3D um fix de GPS chega por segundo. Sem esta guarda, cada fix arrancaria
     o cartão e recolocaria outro, reanimando a entrada pra sempre. Dentro do
     MESMO repinte, quem já moveu o nó pra camada nova foi `remontarChegada`
     (chamado por `pintar()`, antes do observador rodar) — então, quando o
     observador chega aqui, `naCamada('.chegou-wrap')` já é verdade e a função
     sai sem fazer nada. Só numa TROCA de tela (que destrói o nó velho sem
     remontar) é que esta porta volta a montar de verdade. */
  function desenharChegada() {
    if (!chegada) {
      const vazio = naCamada('.chegou-wrap');
      if (vazio) vazio.remove();
      return;
    }
    const tela = telaAtual();
    // Fora dos dois palcos: sai SEM limpar `chegada` — o cartão nasce quando
    // ele voltar (o observador chama de novo depois de `montarMapa`).
    if (tela !== 'rota' && tela !== 'mapa') return;
    if (naCamada('.chegou-wrap')) return;
    const reg = ENTREGAS.get(chegada);
    // a parada sumiu. `chegadaPalco` NÃO é responsabilidade daqui desde a
    // 3.1 (§ FURO 2, ver `abrirParada`) — nada a zerar aqui.
    if (!reg) { chegada = null; return; }
    const c = reg.item.cliente || {};
    const gps = ultimoFix && Number.isFinite(ultimoFix.precisaoM) ? ultimoFix.precisaoM : null;
    if (typeof window.cartaoChegada === 'function') {
      window.cartaoChegada({
        id: chegada,
        n: reg.n,
        nome: esc(c.nome),
        endereco: [esc(c.endereco), esc(c.cidade)].filter(Boolean).join(' • '),
        gps,
      });
    }
  }

  /** "Agora não": fecha o cartão sem tocar no servidor nem no pino âmbar. */
  function dispensarChegada() {
    if (!chegada) return;
    chegadasDispensadas.add(chegada);
    chegada = null;
    chegadaPalco = null;
  }

  /* ---- FURO 1 DO LOTE 3.1 (15/08) — FOLHA ABANDONADA NÃO TRAVA A CHEGADA
     SEGUINTE. `aberta` só nascia zerado dentro de `confirmarEntrega`/
     `registrarNaoEntregue` — sair da folha pelo Voltar do Android (ou pelo ×
     do cabeçalho: os dois caem no MESMO `window.ir`, nunca noutra porta) SEM
     nenhum desfecho deixava `aberta` preso pro resto do dia. E como
     `if (aberta) return` é a PRIMEIRA guarda do ouvinte `hbx:arrival`
     (acima), nenhuma chegada seguinte abria o cartão — o `arrivedAt` de TODA
     parada seguinte virava a hora do toque manual. Medido em bancada: abrir
     folha → handleBack → nova chegada → `.chegou-wrap` nunca nasce,
     `chegada:<id>` nunca é gravado.

     🔴 `window.ir` É A ÚNICA PORTA POR ONDE TODA TROCA DE TELA PASSA — mesmo
     choke point que `trocarLuz` (00-nucleo.js) e o próprio `ir` (já
     embrulhado em 80-gps-rotas-salvas.js) usam. Embrulhar de novo aqui, por
     CIMA do que 80- já embrulhou, fecha a porta inteira SEM tocar nos dois
     arquivos que não são desta leva: o Voltar do Android cai no
     `[data-voltar][data-ir]` do degrau do meio (`handleBack`, 00-nucleo.js),
     o × do cabeçalho da folha é o MESMO botão pelo clique — os dois terminam
     em `window.ir(destino)`. */
  if (typeof window.ir === 'function') {
    const irAntesDaPorta = window.ir;
    // 24/08 — 'venda' saiu da lista: a tela morreu junto com a folha simples.
    const naFolha = (t) => t === 'folha' || t === 'folhanao';
    window.ir = function (tela) {
      const veioDe = telaAtual();
      const r = irAntesDaPorta.apply(this, arguments);
      /* Só morde quando `aberta` SOBREVIVEU à troca de tela. `confirmarEntrega`
         e `registrarNaoEntregue` já zeram `aberta` (e `chegadaPalco`) ANTES de
         chamar `ir` — então nesses dois caminhos isto é um no-op honesto.
         `aberta` de pé DEPOIS de sair de folha/folhanao só pode
         significar abandono — nunca a troca folha↔folhanao ("Não entregue"
         dentro da própria folha), que fica DENTRO do conjunto e não é saída
         nenhuma: é o motivo mudando de tela, a mesma folha ainda aberta. */
      if (aberta && naFolha(veioDe) && !naFolha(telaAtual())) {
        aberta = null; forma = ''; motivo = ''; chegadaPalco = null;
      }
      return r;
    };
  }

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
    encherFolha(aberta.item, aberta.n);
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
  /* 🔴 SÓ QUEIMA A PORTA COM ALGO PRA MOSTRAR (15/08). Mesma conta de
     `temDado` em `fechamentoCorpo()` do mock (formas OU soma — o par de
     blocos que decide entre o caixa de verdade e "Nada registrado hoje
     ainda"). Sem esta checagem, a última parada carimbava `fim-visto` mesmo
     quando o `/logistica/fechamento/resumo` ainda não tinha respondido (ou
     respondia vazio): "abriu vazio" virava "já mostrei", e a PRÓXIMA vez que
     o dia terminasse de verdade (2ª leva do mesmo dia, rota reaberta) a porta
     automática já estava queimada — o motorista saía do mapa pra Rota, sem o
     Fechamento nunca abrir sozinho. */
  const fechamentoTemConteudo = () => {
    try {
      const f = DADOS.fechamento;
      return !!(f && ((Array.isArray(f.formas) && f.formas.length) || f.formaTotal
        || f.entregues || f.clientes || f.produtos));
    } catch (_) { return false; }
  };
  function irDepoisDoDesfecho() {
    if (typeof window.ir !== 'function') return;
    let acabou = false;
    try {
      acabou = (estadoRota === 'rodando' || estadoRota === 'pausada')
        && paradasPendentes().length === 0;
    } catch (_) { acabou = false; }
    /* 🔴 QUEM CHEGOU DIRIGINDO VOLTA A DIRIGIR; QUEM CHEGOU OLHANDO O DIA
       VOLTA PRO DIA (LOTE 3, 15/08). Antes este `return` mandava sempre pra
       'rota' — e quem confirmava a entrega vindo do 3D (o cartão "Você
       chegou" sobre a tela de dirigir) era cuspido no 2D, cortando a rua no
       meio. `chegadaPalco` é o palco de onde o cartão nasceu; zera aqui
       porque, resolvido o dia, ele já cumpriu o papel. */
    /* 🔴 A FAMÍLIA 3D É EXPLÍCITA (LOTE 1.3) — e não pode voltar a ser um
       literal solto. `PALCOS_3D` é a lista das telas que SÃO a navegação
       (hoje só `mapa`); qualquer outra coisa é 2D e volta pra `rota`. Até
       aqui a régua era `chegadaPalco === 'mapa'`, e o dia em que `mapalista`
       ("Mapa + fila", hoje maquete no mock) virar tela de dado, quem abrisse
       a parada de lá seria cuspido no 2D calado — o MESMO defeito que o furo
       2 do lote 3.1 acabou de matar, entrando pela porta dos fundos.
       LEI: palco tem FAMÍLIA, não nome; nome solto envelhece sem avisar. */
    if (!acabou) {
      const destino = PALCOS_3D.includes(String(chegadaPalco || '')) ? 'mapa' : 'rota';
      chegadaPalco = null;
      return window.ir(destino);
    }
    const chave = chaveDoFim();
    if (window.HBX.cache.get(chave, '')) return window.ir('rota');
    if (fechamentoTemConteudo()) window.HBX.cache.set(chave, '1');
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
    /* ⚰️ 24/08 — o portão "Como o cliente pagou?" MORREU: a entrega confirma
       mesmo sem forma escolhida. O POST aceita `receiptMethod` ausente, e o
       campo só viaja quando o motorista TOCOU num dos botões da folha
       (Dinheiro/Pix/Cartão/Marcar, que continuam lá). Pergunta bloqueante na
       porta do cliente era um degrau a mais no verbo mais repetido do dia. */
    await comTrava(async () => {
      const chave = `entrega-confirmar:${aberta.id}`;
      let idem = window.HBX.cache.get(chave, null);
      if (!idem) { idem = window.HBX.uuid(); window.HBX.cache.set(chave, idem); }
      const corpo = { idempotencyKey: idem, arrivedAt: carimbarChegada(aberta.id) };
      if (escolhido) corpo.receiptMethod = escolhido;
      /* VASILHAME onda 2 (17/08) — os vazios recolhidos pegam carona no MESMO
         desfecho, pela mesma razão do carimbo de chegada logo acima: a folha
         tem que fechar sem rede, e o desfecho já é idempotente e já drena da
         fila offline. Só item com casco entra, e sem quantidade nenhuma junto
         — contar vazio não pode reprecificar a entrega (ver C7). */
      const vazios = itensDoDesfecho(aberta.item);
      if (vazios.length) corpo.itens = vazios;
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

  /* A PERGUNTA (ordens 3/3b) e a porta que ela abre. Ficam juntas de propósito:
     é uma decisão só, em dois toques.

     🔴 SÓ SE PERGUNTA COM ROTA ACONTECENDO (18/08, dono: *"essa classificação
     foi usada para usar em rota acontecendo, não criando rota nova"*).

     Montando o dia não existe FILA pra pular: "vai pro topo" é uma pergunta
     sobre uma fila que ainda não foi calculada, e a resposta morreria no
     primeiro Montar. Pior: era a MESMA pergunta em dois momentos diferentes,
     com respostas que não significam a mesma coisa — dado em dois lugares é
     bug de produto, a lei da casa.

     Com a rota na rua a pergunta é real e urgente: o cliente ligou, a parada
     entra AGORA e passa na frente. Fora disso o silêncio responde 'perto'
     (Comum), que é o encaixe automático de sempre — um toque a menos no
     caminho mais usado do app.

     A régua é o `estadoRota` do núcleo, a mesma que governa mapa e rodapé:
     'rodando' (ACTIVE) e 'pausada'. `iniciando` fica de fora de propósito — é
     dinheiro em reserva, ainda não é rota na rua (§ estadoDaRota). */
  function rotaAcontecendo() {
    const e = (typeof estadoRota !== 'undefined' ? String(estadoRota) : '');
    return e === 'rodando' || e === 'pausada';
  }

  function abrirPortaDaParada() {
    if (!rotaAcontecendo()) return entrarNaRapida('perto');
    if (typeof window.portao !== 'function') return entrarNaRapida('perto');
    window.portao({
      tom: 'info', ico: 'plus', titulo: 'Como esta parada entra?',
      sub: 'Dá pra mudar depois arrastando o cartão na lista.',
      corpo: '<div class="pt-linha"><span class="m">1</span><span><strong>Prioridade</strong>'
        + '<span>vai pro topo da fila e fica em vermelho</span></span></div>'
        + '<div class="pt-linha"><span class="m">2</span><span><strong>Comum</strong>'
        + '<span>encaixa onde custar menos desvio</span></span></div>',
      acoes: [
        ['Agora não', '', true],
        ['Prioridade', 'perigo', false, 'parada-prioridade'],
        ['Comum', 'principal', false, 'parada-comum'],
      ],
    });
  }
  function entrarNaRapida(posicao) {
    definirPosicaoDaProximaRapida(posicao);
    if (typeof window.ir === 'function') window.ir('rapida');
  }

  const ACOES = {
    /* 🔴 DOIS PASSOS, NÃO TRÊS (dono, 08/08: "MONTAR ROTA → MONTAGEM DE ROTA
       (BOTÃO INICIAR)"). Este botão abre a Montagem — e abrir a Montagem só
       CARREGA (chips do dia, prévia/lista, histórico e espaços — o guarda de
       `tela === 'montagem'` em 80-gps-rotas-salvas.js), nunca grava: "ENTRAR
       NÃO MONTA MAIS NADA" (dono, 10/08) matou o auto-montar que rodava o
       otimizador só de a tela abrir. Quem grava é o DEDO — o toque em "Montar
       rota"/"Iniciar" — e é por isso que o motorista chega com a lista do dia
       na frente dos olhos e o pé já dizendo "Iniciar rota": a lista é do
       carregamento, a ordem gravada é do toque seguinte.
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
    'montar-agora': (alvo) => aguardeNoToque(alvo, () => comOrdemSalva(() => montarRota(alvo))),
    // rota rodando: o botão do meio leva pra navegação (é o que se faz andando)
    navegar: () => window.ir('mapa'),
    // o interruptor da tela cheia, 1º da coluna lateral (§ 80-gps-rotas-salvas.js:
    // `virarTelaCheia` — inverte, grava no aparelho, repinta e avisa o nativo).
    // Vizinho reservado deste gancho: `abrir-chat` (item 9, sessão principal).
    'tela-cheia': virarTelaCheia,
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
    }, alvo))),
    iniciar: (alvo) => comOrdemSalva(() => iniciarRota({ escopo: 'dia' }, alvo)),
    'cancelar-rota': cancelarRota,
    /* ORDEM 5 — o botão à esquerda de "Fila N" na lista. Devolve a sequência ao
       otimizador; a prioritária fica no topo porque o SERVIDOR a segura lá
       (§ priorizarPrimeiro). `aguardeNoToque` porque o verbo é rede, e botão que
       não responde no quadro do dedo é defeito que esta casa já pagou. */
    'reorganizar-rota': (alvo) => aguardeNoToque(alvo, reorganizarPorDistancia),
    'rota-pendente-abrir': abrirRotaPendente,
    'rota-pendente-continuar': continuarRotaPendente,
    'rota-pendente-puxar': puxarRotaPendente,
    'rota-pendente-cancelar': cancelarRotaPendente,
    // o "Agora não" do cartão "Você chegou" (LOTE 3, 15/08).
    'chegada-dispensar': dispensarChegada,
    'entregue-pagou': () => confirmarEntrega(''),
    'entregue-marcou': () => confirmarEntrega('fiado'),
    // ⚰️ 'confirmar-venda' morreu em 24/08 com a folha simples (T.venda): o
    // único botão que o disparava saiu do desenho junto com a tela.
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
    /* 🔴 `comTrava(rapidaConfirmar)` passava o ARGUMENTO DA TRAVA como `ficar`.
       Por isso os dois verbos são funções próprias, com o argumento escrito à
       mão: repassar a função nua fazia `ficar` receber o que o `comTrava`
       resolvesse — e "sai da tela" viraria "fica" por acidente. */
    'rapida-confirmar': () => comTrava(() => rapidaConfirmar(false)),
    // ORDEM 3 — a opção de adicionar MÚLTIPLOS pelo "Procurar": mesma gravação,
    // item a item, sem sair da tela. Ver a nota do `ficar` no C0.
    'rapida-confirmar-continuar': () => comTrava(() => rapidaConfirmar(true)),
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
    /* Fechamento não tem carregador próprio — os campos dele chegam JUNTO da
       carga da rota (`/logistica/fechamento/resumo`, dentro de `carregarRota`,
       ver `encherFechamento`/`fonteCaiu('fechamento')`). "Tentar de novo"
       aqui é tentar a rota inteira de novo; ela devolve o esqueleto certo
       sozinha, mesmo padrão do `retentar` das outras telas. */
    'recarregar-fechamento': () => retentar('fechamento', carregarRota),
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
    /* ⚰️ `ir-fechamento` MORREU EM 16/08. Ele era o "Finalizar" do dock — uma
       PORTA vestida de verbo, que o dono pegou na hora: *"pq o 3d tem encerrar e
       o 2d não?"*. O satélite do 2D e o botão da ponta do 3D passaram os dois a
       apontar pro `fechar-dia`, que é quem encerra de verdade. Sem botão nenhum
       apontando pra cá, a entrada saiu junto: handler sem botão é a mesma
       mentira de mapa que botão sem handler — e esta casa já pagou as duas.
       Quem quer só VER o fechamento continua entrando pelo caixa da lista e
       pelos Ajustes, os dois com `data-ir="fechamento"`, que não passa por
       gancho nenhum. */
    'ir-creditos': () => window.ir('creditos'),
    'ir-financeiro': () => window.ir('financeiro'),
    'ir-avancado': () => window.ir('avancado'),
    // 'chave-caderneta' morreu em 07/08 junto com a chave; em 09/08 a palavra
    // saiu do produto inteiro — a tela é o FECHAMENTO DO DIA.
    /* 🔴 TRÊS CAMPOS DO SERVIDOR DISPUTAVAM O RÓTULO "AVISAR CHEGADA". Medido,
       e a diferença é de FUNÇÃO, não de nome:
       · `raioChegadaM` (60 m) — o raio do geofence NATIVO de verdade
         (`activateRoute({raioM})`, lido por `raioDaChegada()` em
         10-geofence-montagem.js/`sincronizarGeofence`): é ele que dispara o
         `hbx:arrival` — o ouvinte MORA NESTE MESMO ARQUIVO, religado em 10/08
         junto com o `activateRoute` (ver a nota grande ali em cima) — e abre a
         folha SOZINHA quando o motorista se aproxima, sem toque nenhum.
         (Comentário antigo dizia "o app novo não tem esse geofence" — mentira
         desde a religação: hoje as duas portas abrem a MESMA folha, geofence
         OU toque, ver `abrirParada`.) Ainda assim não entra em Ajustes: é raio
         de DETECÇÃO do servidor (o Kotlin clampa 20-1000), não preferência do
         motorista — expor um número aqui seria outra funcionalidade, não a que
         este bloco resolve.
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
    // As formas de pagamento do dono. Uma chave = um campo = um PATCH, sem
    // lote: assim o que falhou fica evidente e o resto não volta atrás junto.
    // ⚰️ 24/08 — chave-financeiro/chave-cobranca-simples/chave-preco-cliente
    // morreram com os campos: o PATCH com qualquer um deles agora é 400.
    'chave-na-hora': () => virarChave('aceitaNaHora'),
    'chave-mensal': () => virarChave('aceitaMensal'),
    'chave-fiado': () => virarChave('aceitaFiado'),
    /* A do prospector entra pela MESMA porta: um campo, um PATCH, sem otimismo
       na tela. 24/08 — ao LIGAR, o portão "Ciente" vem ANTES do PATCH: mensagem
       automática em nome do motorista + custo em crédito exigem o carimbo do
       ator no servidor (`POST /logistica/prospector/ciente`) uma vez na vida.
       DESLIGAR nunca pergunta nada. */
    'chave-prospector': () => {
      const ligando = !!(config && !config.prospectorAtivo);
      if (ligando && config.prospectorCiente !== true) {
        return portaoCienteProspector(() => virarChave('prospectorAtivo'));
      }
      virarChave('prospectorAtivo');
    },
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
        sub: 'Você vai precisar parear o aparelho de novo.',
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
      catch (_) { avisoErro(new Error('Não consegui abrir a recarga agora.')); }
    },
    /* 🔴 A PORTA MANUAL DA ATUALIZAÇÃO (09/08). Enquanto só existia o pop-up
       automático, perder o aviso uma vez era ficar preso na versão velha: sem
       chip no cabeçalho, sem linha nos Ajustes, sem nada pra tocar. `forcado`
       fura a trava de 30 min E a memória do "já avisei" — e responde SEMPRE,
       inclusive quando não há novidade. */
    /* 🔴 O "+" PERGUNTA ANTES DE ABRIR (17/08, ordens 3 e 3b do dono:
       *"comportamento adicionar rota: pergunta: Prioridade / Comum: Ao escolher
       entrar direto na foto 3"* e *"Prioridade: coloca na prioridade, comum
       encaixa na rota"*).

       Nenhuma peça nova: o portão é o `window.portao` de sempre (o 4º campo de
       cada ação dá `data-acao` a QUALQUER botão — a mesma receita do "Registrar
       local", que abre três portas num portão só), e a RESPOSTA é um campo que
       já existe e já funciona ponta a ponta: `rapida.posicao`
       ('primeira' | 'perto'), lido pelo `encaixarAvulsa` — 'primeira' cai em
       `indice = 0`, 'perto' roda o custo de inserção (OSRM quando responde,
       Haversine quando não). O botão dele tinha SUMIDO da casca em 12/08
       ("onde ela entra virou letra miúda"), e o handler ficou órfão esperando
       dono. A pergunta do dono é esse dono.

       Duas frases e não uma: quem está em pé na calçada tem que ler a
       CONSEQUÊNCIA, não o rótulo. E sem escape mudo — fechar sem escolher é
       'Agora não', que não cria parada nenhuma. */
    'parada-nova': abrirPortaDaParada,
    'parada-prioridade': () => entrarNaRapida('primeira'),
    'parada-comum': () => entrarNaRapida('perto'),
    'buscar-update': () => { checkAppUpdate(true); },
    /* 🔴 SUPORTE ABRE O WHATSAPP DO DONO (17/08, ordem 6: *"Colocar Suporte
       nele, para admin e motoristas: Clicou já abre meu whatsapp no celular da
       pessoa +5519997024884"*).

       Zero Kotlin novo: `NativeAppBridge.openWhatsapp` já existe (ele normaliza
       o número, monta `https://wa.me/<digitos>?text=…` e abre por ACTION_VIEW),
       o `AndroidManifest` já declara `<queries>` pros dois pacotes do WhatsApp,
       e `native.js` já expõe `window.HBX.whatsapp`. O que faltava era a LINHA
       na tela e este gancho.

       O número viaja COMPLETO (55 + DDD): o Kotlin só prefixa o 55 sozinho
       quando recebe 10 ou 11 dígitos, e mandar "19997024884" daqui deixaria a
       regra do país escrita em dois lugares.

       O texto já vai carimbado com a versão e a empresa — quem abre um chamado
       nunca sabe dizer em qual APK está, e essa é a primeira pergunta que o
       dono faria. `appInfo` é a MESMA fonte da linha da Versão nos Ajustes. */
    suporte: () => {
      let versao = '';
      try {
        const info = window.HBX.info() || {};
        versao = [info.versionName, info.versionCode ? `(${info.versionCode})` : ''].filter(Boolean).join(' ');
      } catch (_) { versao = ''; }
      let empresa = '';
      try { empresa = String((DADOS.ajustes && DADOS.ajustes.empresa) || ''); } catch (_) { empresa = ''; }
      const texto = ['Olá, preciso de ajuda no HBX Logística.',
        empresa ? `Empresa: ${empresa}` : '',
        versao ? `App: ${versao}` : ''].filter(Boolean).join('\n');
      try { window.HBX.whatsapp(numeroDoSuporte(), texto); }
      catch (_) { avisoErro(new Error('Não consegui abrir o WhatsApp agora.')); }
    },
    // "QUERO QUE A HBX ME LIGUE" (22/08) — ver o bloco lá em cima.
    'pedir-contato': abrirPedidoDeContato,
    'contato-enviar': enviarPedidoDeContato,
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
  /* 🔴 TODA PORTA DO "+" PERGUNTA (17/08, ordem 3). As portas são três — o
     rodapé dos dois modos do mapa (`data-acao="parada-nova"`, que já cai no
     mapa de ações), o "+" da Montagem e o vazio-porta da rota avulsa (os dois
     `data-ir="rapida"`). Interceptar em fase de CAPTURA é o que permite manter
     o ATRIBUTO `data-ir="rapida"` intacto: ele é a agulha do TOUR e da AULA
     (dois passos apontam pra ele), e renomear o atributo quebraria os dois em
     silêncio. Mesmo precedente do `soltarDia`, 30 linhas abaixo.
     Só morde a porta do DEDO: quem chama `window.ir('rapida')` por dentro (uma
     prova, o roteador) continua caindo direto na tela, com o padrão 'perto'. */
  document.addEventListener('click', (e) => {
    if (!temPonte()) return;
    const porta = e.target.closest('[data-ir="rapida"]');
    if (!porta) return;
    e.preventDefault();
    e.stopPropagation();
    abrirPortaDaParada();
  }, true);

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
    // O chip de assunto do "quero que a HBX me ligue" (22/08): argumento no botão.
    if (chave === 'contato-assunto') return escolherAssuntoContato(alvo.dataset.assunto, alvo);
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
    /* ORDENS 7 e 10 — o cartao do historico ABRE o dia; reutilizar virou o
       botao de dentro. Os dois carregam a DATA no proprio botao, entao ficam
       aqui e nao no mapa nome->funcao. */
    /* ORDEM 8 — cada dado do fechamento abre o extrato dele. O BLOCO e o QUEM
       viajam no próprio botão: é o mesmo padrão do `abrir-parada`. */
    if (chave === 'financeiro-extrato') {
      return void extratoFinanceiro(String(alvo.dataset.bloco || ''), String(alvo.dataset.quem || ''));
    }
    /* 23/08 — OS QUATRO TOQUES DO EXTRATO DO CLIENTE (a tela do painel dentro
       do portão, `91-extrato-cliente.js`). Todos carregam ARGUMENTO ou mexem no
       estado da folha aberta, então moram aqui e não no mapa nome→função. */
    if (chave === 'extrato-cobranca') {
      return void alternarCobrancaDoExtrato(String(alvo.dataset.cobranca || ''));
    }
    if (chave === 'extrato-quitar') {
      return void quitarDoExtrato(String(alvo.dataset.cobranca || ''));
    }
    if (chave === 'extrato-recarregar') return void recarregarExtratoCliente();
    if (chave === 'extrato-fechar') return void fecharExtratoCliente();
    // ORDENS 7/10 — a tela do dia se recarrega pela mesma porta que a abriu.
    if (chave === 'historico-recarregar') {
      return void abrirDiaDoHistorico(String((DADOS.historicodia && DADOS.historicodia.data) || ''));
    }
    if (chave === 'historico-abrir') {
      return void abrirDiaDoHistorico(String(alvo.dataset.data || ''));
    }
    if (chave === 'historico-fechamento') {
      return void abrirFechamentoDoDia(String(alvo.dataset.data || ''));
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
