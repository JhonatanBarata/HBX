  /* ------------------------------------------------------------------------
     🔴 A TRAVA DA ORDEM ALTERADA (dono, 10/08: "caso a pessoa fazer alterações e
     tentar montar rota, barre e peça para salvar — 1 tela apenas: 'Foi alterado
     a ordem, necessário salvar para montar rota'").

     Arrastar a lista é permitido (item 2 do mesmo pedido: "vc pode alterar as
     sequências"). O que não é permitido é a ordem nova sair pra rua sem estar
     GRAVADA em espaço nenhum: no toque seguinte no dia ela não teria como
     voltar, e o trabalho do dedo morreria no primeiro repinte.

     UMA TELA. O alvo já vem decidido daqui — o espaço aceso, ou o primeiro
     vago —, então o dono digita (ou aceita) o nome e a rota monta na sequência.
     Com os ${MAX_ESPACOS} ocupados e nenhum aceso não há alvo pra decidir
     sozinho, e é o único caso em que existe uma pergunta antes: apagar o MAIS
     ANTIGO (o Espaço 1, que é o mais velho por nascimento) e gravar no lugar.
     ------------------------------------------------------------------------ */
  const ordemAlteradaSemSalvar = () => telaAtual() === 'montagem'
    && previaDoDedo && paradasParaSalvar().length > 0;

  /** o 1º espaço sem rota dentro; -1 quando os três estão ocupados */
  function primeiroVago() {
    for (let i = 0; i < MAX_ESPACOS; i += 1) if (!ESPACOS[i]) return i;
    return -1;
  }
  /** o espaço que recebe a gravação obrigatória: o aceso, senão o 1º vago */
  function alvoDaTrava() {
    const aceso = idxDoModo(modoSel);
    return aceso >= 0 ? aceso : primeiroVago();  // -1 = cheio, quem decide é o dono
  }

  /** embrulha Montar/Iniciar: sem ordem gravada, a tela de salvar vem antes */
  function comOrdemSalva(seguir) {
    if (!ordemAlteradaSemSalvar() || typeof window.portao !== 'function') return seguir();
    const dia = diaDosEspacos();
    const idx = alvoDaTrava();
    const abrirSalvar = (n) => pedirNome(n, {
      titulo: 'Foi alterado a ordem',
      sub: 'Necessário salvar para montar rota.',
      rotulo: 'Salvar e montar',
      nomePadrao: `${ROTULO_DIA[dia] || 'Rota'} ${n + 1}`,
      depois: seguir,
    });
    if (idx >= 0) return abrirSalvar(idx);
    const velho = ESPACOS[0];
    window.portao({
      tom: 'alerta', ico: 'save', titulo: 'Foi alterado a ordem',
      sub: `Os ${MAX_ESPACOS} espaços de ${ROTULO_DIA[dia] || 'hoje'} estão cheios. Apagar "${esc(velho.nome)}", o mais antigo?`,
      acoes: [['Agora não', ''], ['Apagar e salvar', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTrava(async () => {
      try { await window.API.del(`/logistica/rota-modelos/${encodeURIComponent(velho.id)}`); }
      catch (e) { return avisoErro(e); }
      // A fileira encolhe: quem era Espaço 2 vira 1, e o vago é o ÚLTIMO. O
      // alvo aqui é o VAGO e não `alvoDaTrava()`: o `carregarEspacos` acabou de
      // reacender um espaço pela memória do dia, e regravar ELE seria apagar a
      // segunda rota logo depois de o dono ter apagado a primeira.
      await carregarEspacos();
      const vago = primeiroVago();
      if (vago < 0) return avisoErro(new Error('Não consegui liberar um espaço agora.'));
      abrirSalvar(vago);
    }), { once: true });
  }

  /* ------------------------------------------------------------------------
     L9 — AJUSTES, RECARGA E CONSUMO.

     🔴 CHAVE QUE APARECE E NÃO CONTROLA NADA É PIOR QUE CHAVE AUSENTE. Só
     entram as que têm porta: as do servidor (`avisoChegandoEnabled` e as 6 de
     dinheiro) e as do próprio aparelho (som/voz pelo `soundPrefs` do
     Kotlin, tema pelo native). O grupo "Sem internet" INTEIRO sai da tela: o
     download de mapa e o pacote offline morreram no corte de 06/08 — o PMTiles
     guarda os 60 km sozinho, sem botão. "Painel de créditos do dia" também
     sai: não achei porta nenhuma pra ele.
     ------------------------------------------------------------------------ */
  let config = null;

  /* 🔴 QUEM É ADMIN QUEM DIZ É O SERVIDOR, NÃO A TELA — e agora ele diz COM
     PALAVRA, não com silêncio (24/08). O `GET /logistica/config` passou a
     responder `admin: true` no bloco de quem é responsável financeiro; a
     dedução antiga ("`modoRotaPadrao` presente ⇒ admin") morreu junto com o
     modo de rota — `modoRotaPadrao` ainda viaja ('TRACKED' cravado) só por
     compat, e ler papel de um campo de compat é adivinhar por variável de
     ambiente. Campo explícito, comparação explícita: ausente = não é. */
  const ehAdmin = () => !!config && config.admin === true;

  async function carregarAjustes() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const [cfgR, credR] = await Promise.allSettled([
      window.API.get('/logistica/config'),
      window.API.get('/credits/me'),
    ]);
    // Mesma lei do L8: fonte fora do ar não reescreve a tela de ajustes com
    // chave desligada — isso faria o dono achar que perdeu a configuração.
    if (cfgR.status !== 'fulfilled' || !cfgR.value) return fonteCaiu('ajustes');
    config = cfgR.value;
    // A MESMA resposta já traz o CSV do item 9 — aproveitar aqui é de graça e
    // deixa a barra fresca pra quem passou pelos Ajustes (uma chamada a menos).
    aplicarBarra(config);
    const cred = credR.status === 'fulfilled' ? credR.value : null;
    const saldo = cred && typeof cred.balance === 'number' ? cred.balance : null;
    let sons = 1;
    try { const p = window.HBX.soundPrefs.get(); sons = p && p.master === false ? 0 : 1; } catch (_) { /* padrão ligado */ }
    const dist = Number(config.avisoChegandoDistanciaM);
    const admin = ehAdmin() ? 1 : 0;
    window.usarDados('ajustes', {
      ...fonteVoltou,
      admin,
      creditosLinha: saldo != null ? `${saldo} ${saldo === 1 ? 'crédito' : 'créditos'}` : '',
      sons,
      painelCreditos: '',      // sem porta: a linha inteira some
      grupoOffline: 0,         // corte de 06/08
      empresa: '',             // o nome da empresa não vem em porta do celular
      ...linhaDaVersao(),      // versão instalada + anúncio de versão nova
    });
    /* As chaves de dinheiro. Vêm da MESMA resposta que já foi buscada — a tela
       do Avançado não tem chamada própria, e por isso também não tem estado
       próprio de falha: quem recarrega é o `recarregar-ajustes`.
       ⚰️ 24/08 — `financeiro`/`cobrancaSimples`/`precoPorCliente` MORRERAM no
       contrato (o financeiro é sempre ligado, a folha é sempre a completa):
       o `GET /logistica/config` não os responde mais e o PATCH devolve 400
       (forbidNonWhitelisted) pra quem tentar gravá-los. Publicar campo morto
       no seam seria desenhar chave que o servidor não obedece. */
    window.usarDados('avancado', {
      ...fonteVoltou,
      admin,
      naHora: config.aceitaNaHora ? 1 : 0,
      mensal: config.aceitaMensal ? 1 : 0,
      fiado: config.aceitaFiado ? 1 : 0,
      // "Avisar chegada" mora no Avançado desde 07/08 (ordem do dono) — o
      // campo e o raio são os mesmos que a raiz dos Ajustes mostrava.
      avisarChegada: config.avisoChegandoEnabled ? 1 : 0,
      avisarChegadaDist: isFinite(dist) && dist > 0 ? `${dist} m` : '',
      /* PROSPECTOR (09/08; ABERTO A TODOS em 24/08) — a chave atravessou o
         vidro em 09/08, e em 24/08 `prospectorDisponivel` morreu no contrato:
         toda empresa PODE ligar, então sobrou UM fato — `prospector` é a
         empresa ter ligado. O portão de responsabilidade de quem liga é o
         "Ciente" (`portaoCienteProspector`), não uma chave-mestra da HBX. */
      prospector: config.prospectorAtivo ? 1 : 0,
      /* PROSPECTOR v2 (12/08) — o que a PESSOA escolheu pra esta semana. Vem da
         memória do §7b-bis (o último GET/POST), não de uma segunda chamada: esta
         tela não tem porta própria, e pendurar mais uma rede aqui faria a linha
         piscar toda vez que os Ajustes recarregassem. Vazio = ainda não escolheu
         (ou ainda não perguntei) — e a linha diz "Escolher o que procurar", que
         é honesto nos dois casos. */
      prospectorTipo: rotuloDoProspector(),
    });
    /* Só pergunta a escolha com o prospector LIGADO — chave desligada não tem
       o que procurar, e seria uma ida à rede por tela de Ajustes de todo
       mundo. Best-effort: falha aqui não atrapalha nada nesta tela. */
    if (config.prospectorAtivo) {
      carregarProspectorSemana().then(() => {
        if (typeof window.usarDados === 'function') {
          window.usarDados('avancado', { prospectorTipo: rotuloDoProspector() });
        }
      }).catch(() => undefined);
    }
    if (cred) encherCarteira(cred);
  }

  /* ------------------------------------------------------------------------
     AJUSTES · CRÉDITOS — a tela única (09/08), e a única que cobra dinheiro.

     Ela era DUAS: "Recarga de créditos" e "Consumo e bônus", vizinhas na
     Administração, as duas mostrando o MESMO saldo. Viraram uma, com o foco na
     recarga. São DUAS portas de rede, e continuam duas de propósito:
       · `/credits/me`                    → saldo, lotes vencendo e catálogo;
       · `/logistica/creditos/extrato`    → uso do mês, bônus e movimento.
     Cada uma com o seu par de bandeiras (`carregando`/`semFonte` e
     `movCarregando`/`movSemFonte`), porque extrato no chão NÃO pode derrubar a
     recarga: quem abriu esta tela veio comprar crédito.

     🔴 CARREGA SOZINHA, venha de onde vier. A recarga só era preenchida de
     carona no `carregarAjustes`; quem entrasse pelo atalho via o catálogo do
     DESENHO — preço, selo de desconto e o botão de pagar. Tela de dinheiro não
     pode depender de por onde a pessoa entrou.
     ------------------------------------------------------------------------ */
  async function carregarCreditos() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    // As duas portas saem JUNTAS e cada uma responde por si — `allSettled`, nunca
    // `all`: com `all`, o extrato fora do ar levaria a carteira junto no catch.
    const [credR, extR] = await Promise.allSettled([
      window.API.get('/credits/me'),
      window.API.get('/logistica/creditos/extrato'),
    ]);
    if (credR.status === 'fulfilled' && credR.value) encherCarteira(credR.value);
    else fonteCaiu('creditos');
    if (extR.status === 'fulfilled' && extR.value && typeof extR.value === 'object') encherMovimento(extR.value);
    else movimentoCaiu();
  }

  /* 🔴 O PAGAMENTO CAÍA E A TELA NÃO FICAVA SABENDO. O `MainActivity` chama
     `window.HBXApp.rechargeCompleted(payload)` assim que o checkout nativo
     aprova a cobrança (`recargaLauncher`, com `{ok, packKey, credited,
     balanceAfter}`) — e no app novo NINGUÉM atendia por esse nome: quem
     atendia era o `app.js`, que a fusão apagou. O desfecho é o pior possível
     numa tela de dinheiro: o dono paga, o checkout diz "créditos adicionados",
     ele volta, e o saldo continua o de antes até fechar e abrir o app inteiro.
     App que mostra saldo velho depois de cobrar parece app que perdeu a compra.

     `balanceAfter` pinta na hora — não é otimismo local, é o número que o
     próprio servidor acabou de devolver junto do "aprovado". A releitura
     confirma e ainda traz a linha nova do extrato. */
  window.HBXApp.rechargeCompleted = function (res) {
    const saldo = Number(res && res.balanceAfter);
    if (isFinite(saldo) && typeof window.usarDados === 'function') {
      window.usarDados('creditos', { ...fonteVoltou, saldo: String(saldo) });
    }
    carregarCreditos();
  };

  /** o movimento tem bandeira PRÓPRIA — mesma lei do `fonteCaiu`, outro par */
  function movimentoCaiu() {
    if (typeof window.usarDados !== 'function') return;
    let primeira = false;
    try { primeira = !!(DADOS.creditos && DADOS.creditos.movCarregando); } catch (_) { return; }
    if (!primeira) return;
    window.usarDados('creditos', { movCarregando: false, movSemFonte: true });
  }

  /** os pacotes vêm no MESMO `/credits/me` do saldo — não há porta separada */
  let pacoteEscolhido = null;
  function encherCarteira(cred) {
    // 🔴 CANAL PLAY: SALDO SIM, VITRINE NÃO (20/08/2026).
    // A política de Pagamentos do Google não proíbe só o botão de pagar — ela
    // proíbe "levar o usuário a um meio de pagamento que não seja o do Google
    // Play", e isso cobre preço, promoção e chamada pra ação dentro do app.
    // Então, num binário de loja, os PACOTES somem e o CTA some; o que fica é
    // saldo, vencimento e extrato — informação da conta, que é legítima e que o
    // motorista precisa pra entender por que a rota não inicia.
    // ⚠️ Não é preciso mexer no desenho: o mock já esconde o bloco inteiro
    // "Escolha o pacote" (e a nota do Mercado Pago junto) quando `pacotes` vem
    // vazio, e não desenha o botão do rodapé quando `cta` é ''. Uma linha aqui
    // apaga a vitrine inteira sem deixar buraco na tela.
    const daLoja = !!((window.HBX && window.HBX.info && window.HBX.info()) || {}).play;
    const packs = daLoja ? [] : (Array.isArray(cred && cred.packs) ? cred.packs : []);
    const saldo = typeof cred.balance === 'number' ? cred.balance : null;
    if (!pacoteEscolhido) {
      const rec = packs.find((p) => p.recommended) || packs[0];
      pacoteEscolhido = rec ? rec.key : null;
    }
    const atual = packs.find((p) => p.key === pacoteEscolhido) || null;
    window.usarDados('creditos', {
      ...fonteVoltou,
      // 22/08 (PR22082026): no binário da loja a tela acende o aviso "quem recarrega é o
      // administrador, pelo painel" + as portas de suporte (WhatsApp / me ligue) — é o
      // que a política permite, e é a saída do beco "saldo 0, rota não inicia".
      loja: daLoja ? 1 : 0,
      saldo: saldo != null ? String(saldo) : '',
      vence: creditoVencendo(cred),
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
    });
  }

  /* 🔴 ESCOLHER PACOTE É TOQUE, NÃO REDE. O toque num pacote chamava
     `carregarAjustes()` — DUAS chamadas HTTP (`/logistica/config` e
     `/credits/me`) só pra acender a borda de um cartão. Na rede da rua o dedo
     batia e a tela ficava parada até a resposta; e com o `/logistica/config` no
     chão o `fonteCaiu('ajustes')` engolia a escolha, então o pacote NUNCA
     acendia. O catálogo já está na tela — quem manda no aceso é este objeto, e
     o repinte é local e instantâneo. O botão do pé reusa os MESMOS textos da
     linha escolhida: dois lugares formatando o mesmo preço é onde nasce a
     discordância de centavo. */
  function escolherPacote(chave) {
    const k = String(chave || '');
    if (!k || k === pacoteEscolhido || typeof window.usarDados !== 'function') return;
    const packs = Array.isArray(DADOS.creditos && DADOS.creditos.pacotes) ? DADOS.creditos.pacotes : [];
    const atual = packs.find((p) => p[4] === k);
    if (!atual) return;
    pacoteEscolhido = k;
    window.usarDados('creditos', {
      pacotes: packs.map((p) => [p[0], p[1], p[2], p[4] === k ? 1 : 0, p[4], p[5]]),
      cta: `Recarregar ${atual[0]} créditos · R$ ${atual[1]}`,
    });
  }

  /* 🔴 O CRÉDITO VENCE, E O APP NUNCA DISSE ISSO. O `lots[]` do `/credits/me`
     traz `remaining` e `expiresAt` desde sempre e ninguém lia: o dono comprava
     300 créditos com 90 dias de validade e descobria o vencimento pelo saldo
     que sumiu. Dinheiro que evapora calado é a pior surpresa que um produto
     guarda — e aqui ela custa uma recarga que não precisava acontecer.
     Só o lote que vence PRIMEIRO, e só dentro de 30 dias: aviso permanente vira
     paisagem, e lote de 89 dias não é notícia. Lote sem `expiresAt` não vence e
     nem entra na conta. */
  function creditoVencendo(cred) {
    const lots = Array.isArray(cred && cred.lots) ? cred.lots : [];
    const vivos = lots
      .map((l) => ({ resta: Number(l && l.remaining), quando: l && l.expiresAt }))
      .filter((l) => l.resta > 0 && l.quando && isFinite(new Date(l.quando).getTime()));
    if (!vivos.length) return '';
    const limite = Date.now() + 30 * 86400000;
    const primeiro = vivos
      .map((l) => ({ ...l, t: new Date(l.quando).getTime() }))
      .sort((a, b) => a.t - b.t)[0];
    if (primeiro.t > limite) return '';
    // Lotes que vencem NO MESMO DIA somam: são um vencimento só pra quem lê.
    const dia = diaCurto(primeiro.quando);
    const soma = vivos.reduce((s, l) => s + (diaCurto(l.quando) === dia ? l.resta : 0), 0);
    return `${soma} ${soma === 1 ? 'crédito vence' : 'créditos vencem'} em ${dia}`;
  }

  /* O que faz escolher: o preço POR CRÉDITO (a única conta que responde "qual é
     o mais barato" quando os pacotes têm tamanhos diferentes) e a VALIDADE.
     Os dois já vinham no `/credits/me` — `price`, `credits` e
     `defaultExpiryDays` — e nenhum dos dois chegava na tela. Cada pedaço só
     entra se tiver fonte, e o separador nasce com o segundo pedaço. */
  function detalheDoPacote(p) {
    const partes = [];
    const credits = Number(p && p.credits);
    const price = Number(p && p.price);
    if (credits > 0 && isFinite(price) && price > 0) {
      partes.push(`${dinheiro(price / credits)} por crédito`);
    }
    const dias = Number(p && p.defaultExpiryDays);
    if (isFinite(dias) && dias > 0) partes.push(`vale ${dias} dias`);
    return partes.join(' · ');
  }

  /* ------------------------------------------------------------------------
     AJUSTES · FINANCEIRO — a carteira do dono, e a última tela cravada.

     DUAS portas, porque são duas perguntas diferentes:
       · `fechamento/resumo` → o CAIXA DE HOJE (quanto entrou, por qual forma) E
         o mapa `devedores` (id do cliente → centavos em aberto);
       · `nucleo/clientes`  → o NOME de quem está nesse mapa.

     🔴 POR QUE NÃO `GET /logistica/financeiro/saldos`, que seria a porta óbvia
     (ela devolve nome + saldo prontos, é a mesma que o resumo diário do
     WhatsApp usa): ela EXISTE no servidor e está certa, mas o app NÃO ALCANÇA.
     O `NativeApiClient` tem uma lista branca de endereços por flavor
     (`isMobileEndpointAllowed`) e `financeiro/saldos` não está nela — medido no
     g15, a chamada morre DENTRO do aparelho com "Esta operação não pertence ao
     logistica", sem nem sair pra rede. Essa lista mora em `src/main/`, que esta
     frente não pode tocar. Chamar assim mesmo seria pior que não chamar: o
     "Em aberto" nasceria vazio por bloqueio COM CARA de "ninguém te deve" — e
     esses dois vazios são opostos (Lei nº1). Então a conta vem pelo caminho que
     o app já tem aberto, e sem inventar 2ª conta de dívida: o `devedores` do
     resumo é computado pelo MESMO `saldosFinanceiro` (que por sua vez lê a
     fonte única `saldoAbertoPorClientes`), e o `debitoAtual` do
     `nucleo/clientes` é espelho da mesma regra.

     Cada porta escreve SÓ O SEU pedaço, e só se responder. As duas no chão na
     primeira carga ⇒ `fonteCaiu` (aviso + "Tentar de novo"), nunca tela vazia:
     "não entrou nada hoje" e "a rede caiu" não podem ter a mesma cara.
     ------------------------------------------------------------------------ */
  /* 🔴 O CRU DA ÚLTIMA CARGA FICA GUARDADO (17/08, ordem 8 do dono: *"garanta
     q todos os dados de fechamento sejam clicáveis, e tenham os dados do
     /financeiro. (pop up com extrato completo)"*).

     O extrato sai DAQUI e não de uma segunda ida à rede, e o motivo é de
     domínio: dois pedidos ao mesmo endpoint em momentos diferentes podem trazer
     números diferentes (uma venda entrou no meio), e aí o pop-up contradiria o
     cartão que o dedo acabou de tocar. Em tela de dinheiro, o detalhe TEM que
     ser a explicação do total que está na tela — nunca uma segunda medição.
     Se ninguém carregou ainda, o pop-up diz isso em vez de mostrar zero. */
  let caixaCrua = null;      // a resposta de /logistica/fechamento/resumo
  let devedoresCrus = null;  // { customerProfileId: centavos }
  let nomesDosDevedores = null; // Map(id -> nome)

  /* ==========================================================================
     O EXTRATO COMPLETO (17/08 — ordem 8 do dono).

     Cinco portas, uma peça: `portao()` com corpo montado aqui. Ele já é a
     superfície certa (o `.portao` tem `max-height:82%` + `overflow:auto`), e
     peça nova seria a 2ª folha de dinheiro do app.

     Cada porta responde a pergunta que o número em cima dela levanta:
       recebido → POR FORMA, com o total conferindo com o cartão;
       aberto   → QUEM deve, do maior pro menor, com o total;
       forma    → o valor daquela forma isolado, com o peso dela no dia;
       devedor  → a linha de UMA pessoa;
       semana   → dia a dia, com o total da semana.
     Nada de conta nova: tudo sai do MESMO `caixa` que pintou a tela.
     ========================================================================== */
  function extratoFinanceiro(bloco, quem, simples) {
    if (typeof window.portao !== 'function') return;
    /* 🔴 O TOQUE NA PESSOA ABRE O EXTRATO DE VERDADE (23/08, ordem do dono com
       a foto do painel: *"eu quero essa tela no extrato, essas informações"*).
       O que morava aqui era uma LINHA — nome e saldo, o mesmo que o cartão de
       trás já mostrava; agora a mesma porta do computador responde
       (`91-extrato-cliente.js`), com cobrança por cobrança.
       `simples` é a volta: quando o servidor diz 403 (motorista comum não vê
       valor do tenant), o extrato completo devolve o toque PRA CÁ, e sem esta
       chave os dois ficariam se chamando pra sempre. */
    if (bloco === 'devedor' && quem && !simples) {
      const nomes = nomesDosDevedores || new Map();
      return abrirExtratoCliente(quem, nomes.get(String(quem)) || '');
    }
    const c = caixaCrua;
    if (!c) {
      return window.portao({
        tom: 'alerta', ico: 'wallet', titulo: 'Ainda não carreguei o dia',
        sub: 'Toque em "Tentar de novo" na tela pra buscar os números.',
        acoes: [['Fechar', 'principal', true]],
      });
    }
    const f = (c.fechamento && c.fechamento.formas) || {};
    const linha = (rot, val, cor) => '<div class="rowline"><span>' + rot + '</span><b'
      + (cor ? ' style="color:' + cor + '"' : '') + '>' + (val || centavos(0)) + '</b></div>';
    const somaEntrou = (Number(f.dinheiroCents) || 0) + (Number(f.pixCents) || 0) + (Number(f.cartaoCents) || 0);

    if (bloco === 'recebido' || bloco === 'forma') {
      const corpo = linha('Dinheiro', centavos(Number(f.dinheiroCents) || 0), 'var(--lime)')
        + linha('Pix', centavos(Number(f.pixCents) || 0), 'var(--blue-l)')
        + linha('Cartão', centavos(Number(f.cartaoCents) || 0), 'var(--purple)')
        + linha('Entrou hoje', centavos(somaEntrou))
        + linha('Marcou (fiado)', centavos(Number(f.fiadoCents) || 0), 'var(--amber)')
        + linha('Total do dia', centavos(Number(f.totalCents) || (somaEntrou + (Number(f.fiadoCents) || 0))));
      return window.portao({
        tom: 'info', ico: 'wallet',
        titulo: bloco === 'forma' ? String(quem || 'Forma de pagamento') : 'Recebido hoje',
        sub: 'Fechamento do dia, forma por forma. Marcado NÃO entra no recebido.',
        corpo: '<div class="box" style="margin:0">' + corpo + '</div>',
        acoes: [['Fechar', 'principal', true]],
      });
    }

    if (bloco === 'aberto' || bloco === 'devedor') {
      const deve = devedoresCrus || {};
      const nomes = nomesDosDevedores || new Map();
      const ids = Object.keys(deve)
        .filter((id) => (Number(deve[id]) || 0) > 0)
        .sort((a, b) => (Number(deve[b]) || 0) - (Number(deve[a]) || 0));
      const alvo = String(quem || '');
      const lista = (alvo && bloco === 'devedor') ? ids.filter((id) => id === alvo) : ids;
      const total = ids.reduce((s2, id) => s2 + (Number(deve[id]) || 0), 0);
      const corpo = lista.length
        ? lista.map((id) => linha(esc(nomes.get(String(id)) || 'Cliente'), centavos(Number(deve[id]) || 0), 'var(--amber)')).join('')
          + (bloco === 'aberto' ? linha('Total em aberto', centavos(total), 'var(--amber)') : '')
        : '<span class="sub">Ninguém está devendo agora.</span>';
      return window.portao({
        tom: 'info', ico: 'note',
        titulo: bloco === 'devedor' ? 'Quanto esta pessoa deve' : 'Em aberto',
        /* A frase diz o que o número É: saldo ACUMULADO, não dívida do dia.
           Confundir os dois é a leitura errada mais cara desta tela. */
        sub: 'Saldo acumulado de quem marcou — não é só de hoje.',
        corpo: '<div class="box" style="margin:0">' + corpo + '</div>',
        acoes: [['Fechar', 'principal', true]],
      });
    }

    if (bloco === 'semana') {
      const dias = Array.isArray(c.historicoDias) ? c.historicoDias : [];
      const total = dias.reduce((s2, d) => s2 + (Number(d && d.totalCents) || 0), 0);
      const corpo = dias.length
        ? dias.map((d) => linha(esc(String((d && d.data) || '')), centavos(Number(d && d.totalCents) || 0))).join('')
          + linha('Total da semana', centavos(total))
        : '<span class="sub">Sem dias fechados nesta semana.</span>';
      return window.portao({
        tom: 'info', ico: 'calendar', titulo: 'Semana, dia a dia',
        /* ⚠️ O servidor só manda o TOTAL de cada dia (`totalCents`) — sem quebra
           por forma. Então esta porta não promete "recebido da semana": ela diz
           o total, que é o que existe. Prometer a quebra aqui seria inventar. */
        sub: 'Total de cada dia. A quebra por forma existe só no dia de hoje.',
        corpo: '<div class="box" style="margin:0">' + corpo + '</div>',
        acoes: [['Fechar', 'principal', true]],
      });
    }
  }

  async function carregarFinanceiro() {
    if (!temPonte() || typeof window.usarDados !== 'function') return;
    const dia = diaOperacional();
    const [caixaR, rosterR] = await Promise.allSettled([
      window.API.get(`/logistica/fechamento/resumo?date=${encodeURIComponent(dia)}`),
      window.API.get('/nucleo/clientes?page=1&pageSize=100'),
    ]);
    if (caixaR.status !== 'fulfilled' && rosterR.status !== 'fulfilled') return fonteCaiu('financeiro');

    const caixa = caixaR.status === 'fulfilled' ? caixaR.value : null;
    const formas = (caixa && caixa.fechamento && caixa.fechamento.formas) || null;
    // `devedores` é { idDoCliente: centavos } e só traz quem tem saldo > 0.
    const deve = (caixa && caixa.devedores && typeof caixa.devedores === 'object') ? caixa.devedores : null;
    const totalAberto = deve ? Object.keys(deve).reduce((s, k) => s + (Number(deve[k]) || 0), 0) : 0;
    // O NOME vem do roster. Quem não estiver nele fica SEM LINHA — mas o valor
    // dele continua contado no "Em aberto": o total é QUANTO, a lista é QUEM, e
    // o total nunca pode encolher por causa de uma página de nomes que não veio.
    const nomes = new Map();
    if (rosterR.status === 'fulfilled') {
      const itens = (rosterR.value && Array.isArray(rosterR.value.items)) ? rosterR.value.items : [];
      itens.forEach((c) => { if (c && c.id && String(c.name || '').trim()) nomes.set(String(c.id), String(c.name)); });
    }
    // guarda o cru pro extrato da ordem 8 (ver a nota lá em cima)
    caixaCrua = caixa;
    devedoresCrus = deve;
    nomesDosDevedores = nomes;
    const linhasDevedor = deve
      ? Object.keys(deve)
        .filter((id) => nomes.has(String(id)) && (Number(deve[id]) || 0) > 0)
        .sort((a, b) => (Number(deve[b]) || 0) - (Number(deve[a]) || 0))
      : [];

    window.usarDados('financeiro', {
      ...fonteVoltou,
      ...(caixaR.status === 'fulfilled' ? {
        /* "Recebido" é o que ENTROU: dinheiro + pix + cartão. NÃO é o
           `totalCents`, que soma o fiado junto — e fiado é exatamente o que
           NÃO entrou. Chamar o marcado de recebido seria a mesma mentira desta
           tela vestida de outra roupa. É soma de número do servidor, não conta
           minha. Zero some (Lei do IF, a mesma régua do `saldo` da Rota). */
        recebido: formas
          ? centavosSeTiver((formas.dinheiroCents || 0) + (formas.pixCents || 0) + (formas.cartaoCents || 0))
          : '',
        formas: formas ? [
          ['cash', 'var(--lime)', 'Dinheiro', centavosSeTiver(formas.dinheiroCents)],
          ['pix', 'var(--blue-l)', 'Pix', centavosSeTiver(formas.pixCents)],
          ['card', 'var(--purple)', 'Cartão', centavosSeTiver(formas.cartaoCents)],
        ].filter((x) => x[3]) : [],
        // "Marcou" é o fiado do dia — a palavra é do dono (o `aceitaFiado`, o
        // "pagou não" dele). Não inventar sinônimo aqui é regra, não estilo.
        marcou: formas ? centavosSeTiver(formas.fiadoCents) : '',
        // O TOTAL em aberto sai do mapa INTEIRO — inclusive de quem não tem
        // nome no roster. Ele vem em centavos (o `devedores` do resumo já
        // converte), por isso `centavosSeTiver` e não `dinheiro`.
        emAberto: deve ? centavosSeTiver(totalAberto) : '',
      } : {}),
      ...(rosterR.status === 'fulfilled' && caixaR.status === 'fulfilled' ? {
        /* 🔴 O 3º campo é a linha de baixo do desenho ("3 marcações · a mais
           antiga de 28/07") e vai VAZIA DE PROPÓSITO: nem o `devedores` do
           resumo nem o `financeiro/saldos` entregam QUANTAS marcações são nem a
           data da mais antiga — os dois dão só o saldo. Sem porta, o slot some
           e sobra nome + valor. Contar cobrança aqui no celular seria uma 2ª
           conta de dívida, fadada a discordar do extrato. */
        devedores: linhasDevedor.map((id) => [
          iniciais(nomes.get(String(id))), esc(nomes.get(String(id))), '',
          centavos(Number(deve[id]) || 0), '',
          // 17/08 (ordem 8) — o 6º campo é o ID: é ele que o pop-up usa pra
          // achar a pessoa de volta sem uma segunda conta de dívida.
          String(id),
        ]),
      } : {}),
      /* 🔴 A SEMANA NÃO TEM FONTE — e some INTEIRA, com o título junto.
         O desenho pede três números: recebido, marcado e pendência da semana.
         O `historicoDias` do resumo só traz o TOTAL de cada dia (`totalCents`),
         sem quebra por forma — então "recebido da semana" (dinheiro+pix+cartão)
         não existe em porta nenhuma. "Pendência" também não: o "em aberto" é
         saldo ACUMULADO, não da semana — publicá-lo debaixo do título "Semana"
         seria mentira de moldura, o número certo na caixa errada.
         E o "marcado" da semana eu NÃO ligo no `sum(totalCents)` de propósito,
         embora esse número exista: nesta tela, dois dedos acima, "Marcou" já
         significa FIADO. A mesma palavra com dois sentidos na mesma rolagem é
         pior que número faltando. (A tela Semana usa "Marcado" no sentido de
         total — lá é o vocabulário dela, aqui não.)
         Falta: `historicoDias[]` com as `formas` de cada dia. */
    });
  }

  /* 🔴 AS LINHAS DO EXTRATO LIAM CAMPOS QUE NÃO EXISTEM. Este bloco pedia
     `d.titulo`, `d.quando` e `d.creditos` — e o `getAdminStatement` devolve
     `{claimId, routeId, trackingSessionId, deliveryId, credits, paidCredits,
     completedAt}`. Nenhum dos três nomes batia: TODA linha caía no texto de
     reserva ("Entrega rastreada"), com a data VAZIA e o valor no `|| 0`. O dono
     abria o extrato e via uma pilha de linhas iguais dizendo que cada entrega
     custou ZERO crédito — número errado, na tela em que o número é o produto.
     Mesma coisa no bônus, que devolve `{sourceMonth, bonusCredits, grantedAt,
     status}`.

     🔴 O VALOR DA LINHA É `credits`, NÃO `paidCredits`. `paidCreditsConsumed` é
     a parcela que saiu de lote PAGO — a base do cashback, medida em
     `paidCreditsForUsage` (só `grantType === 'paid'`). Quem usou crédito de
     bônus veria "−0" numa entrega que tirou 2 da carteira. O que a linha do
     extrato responde é "quanto saiu daqui", e isso é `credits`. */
  function encherMovimento(e) {
    const uso = e.usage || {};
    const tot = e.totals || {};
    const linhas = [];
    (Array.isArray(e.trackedDeliveries) ? e.trackedDeliveries : []).forEach((d) => {
      const cr = Number(d && d.credits);
      linhas.push([
        'menos', 'Entrega rastreada', quandoDoExtrato(d && d.completedAt),
        String(isFinite(cr) && cr > 0 ? cr : 0),
      ]);
    });
    /* Bônus só entra CONCEDIDO. A tabela guarda a linha do mês desde que a
       varredura a cria (`ensureBonusRow`), muito antes de conceder: sem este
       filtro o extrato anunciaria um crédito de bônus que ainda não existe na
       carteira — promessa, não movimento. */
    (Array.isArray(e.bonuses) ? e.bonuses : []).forEach((b) => {
      const cr = Number(b && b.bonusCredits);
      if (!(cr > 0) || String(b && b.status).toUpperCase() !== 'GRANTED') return;
      const mes = mesRotulo(b && b.sourceMonth);
      const quando = b && b.grantedAt ? `creditado em ${diaCurto(b.grantedAt)}` : '';
      linhas.push(['mais', mes ? `Bônus de ${mes}` : 'Bônus', quando, String(cr)]);
    });
    window.usarDados('creditos', {
      movCarregando: false, movSemFonte: false,
      // Crédito é NÚMERO INTEIRO, nunca moeda — e zero some, como todo recorte.
      mes: mesRotulo(e.month),
      gastosHoje: seTiver(uso.hoje),
      gastosMes: seTiver(uso.mes),
      bonus: seTiver(tot.bonusCredits),
      linhas,
      vazio: 'Nenhum movimento neste mês',
    });
  }

  /** liga/desliga uma chave do servidor e recarrega — sem otimismo na tela */
  async function virarChave(campoConfig) {
    if (!config) return;
    await comTrava(async () => {
      const novo = !config[campoConfig];
      try { await window.API.patch('/logistica/config', { [campoConfig]: novo }); }
      catch (e) { return avisoErro(e); }
      await carregarAjustes();
      // A rota lê as MESMAS chaves pra decidir qual folha abre na porta: sem
      // isto, uma troca de modo só valeria na próxima abertura do app.
      await carregarRota();
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     TUTORIAL GUIADO — os FATOS que o motor do tour lê, e a PORTA que o abre.

     🔴 O OBRIGATÓRIO NÃO PODE NASCER DE DADO PINTADO. A abertura do app pinta
     SÍNCRONA e não repinta (é uma cena com relógio que termina em `ir('rota')`,
     recriando a camada inteira). Quem escrevesse "nunca viu" no seam e esperasse
     a tela reagir esperaria pra sempre — é o mesmo defeito que matou o pop-up da
     atualização no berço, em 09/08. Então o disparo é uma PORTA: quando a
     resposta do servidor chega dizendo que este USUÁRIO nunca viu, a ponte CHAMA
     `TUTOR.obrigatorio()`. O seam continua existindo, mas pra o motor DECIDIR
     qual capítulo existe — nunca pra abrir o tour.

     🔴 AUSENTE ≠ VAZIO, de novo e aqui — e neste seam o "não sei" tem UM lado
     seguro só. `carregando` segura o motor enquanto falta fonte, e
     `obrigatorioVisto` responde JÁ VIU até o servidor dizer o contrário: o
     obrigatório não tem X, então errar pro lado de disparar prende 90 s quem já
     o viu, toda vez que a rede falhar. Errar pro outro lado custa um boot.

     🔴 O CARIMBO É DO USUÁRIO, NÃO DO APARELHO. Por `localStorage` ele repetiria
     a cada reinstalação e sumiria no celular novo — a lição que o RECADO já
     custou. A lâmpada e a aula avançada continuam por aparelho (conveniência de
     leitura); a garantia do "todo cliente vai ler uma vez" é do servidor.
     ══════════════════════════════════════════════════════════════════════════ */

  /** o que o servidor DISSE: null = ainda não sei (nunca "não viu") */
  let tutorialVisto = null;
  /** a pergunta ao servidor já teve desfecho — resposta OU falha. Ver o freio. */
  let tutorialPerguntado = false;
  /* Nesta SESSÃO o obrigatório já foi aberto (ou já foi concluído). A porta é de
     um sentido só: sem isto, uma releitura reabriria o tour por cima de quem
     está no meio dele — ou de quem acabou de fechá-lo com a gravação no chão.
     Quem decide de novo é o próximo boot, lendo o servidor. */
  let obrigatorioResolvido = false;

  /* ⚰️ `prospectorPodeLigar` MORREU em 24/08: `prospectorDisponivel` saiu do
     contrato — o prospector é aberto a toda empresa, e a régua admin/equipe
     (`prospectorEquipe`) morreu junto. "Esta pessoa vê os prédios" virou UM
     fato só: a empresa ligou. Quem carrega a responsabilidade jurídica agora
     é o carimbo `prospectorCiente` (por ATOR, gravado no servidor — o
     inventário já provou que `HBX.cache` é por aparelho e não serve pra
     carimbo), cobrado pelo portão abaixo. */
  const prospectorEuVejo = () => (config && config.prospectorAtivo === true ? 1 : 0);

  /* ── O PORTÃO "CIENTE" DO PROSPECTOR (24/08) ──────────────────────────────
     Mensagem automática EM NOME do motorista + custo em crédito = ninguém liga
     (nem roda com) o prospector sem ler isto uma vez. Mesmo padrão do
     `travaDoRecado` (A0): portão SEM ESCAPE — só a ação 'Ciente', o
     `handleBack` já engole o Voltar de portão sem escape — e listener
     `{once:true}` no principal. O carimbo é SÓ servidor
     (`POST /logistica/prospector/ciente`, idempotente): quem já é ciente numa
     conta é ciente em qualquer aparelho. Dois gatilhos chamam este portão:
     a chave nos Ajustes (ao LIGAR, D0) e a chegada de empresas acesas na rua
     (`aplicarProspector`, 00-nucleo — o funcionário que nunca abre Ajustes). */
  function portaoCienteProspector(depois) {
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'info', ico: 'sales', titulo: 'Vender no caminho',
      sub: 'O Prospector envia mensagens automáticas em seu nome para empresas '
        + 'no caminho da rota e pode gerar custo em créditos. Você é responsável '
        + 'pelo conteúdo enviado.',
      acoes: [['Ciente', 'principal', false]],
    });
    const b = naCamada('.portao-wrap .principal');
    if (b) b.addEventListener('click', () => { carimbarCienteProspector(depois); }, { once: true });
  }

  /** grava o ciente no SERVIDOR e segue. Falha não prende: o portão volta no
   *  próximo gatilho (o carimbo continua `false` na config) — nunca em loop. */
  async function carimbarCienteProspector(depois) {
    try {
      await window.API.post('/logistica/prospector/ciente', {});
      if (config) config.prospectorCiente = true;
    } catch (e) {
      console.warn('[HBX ponte] prospector: não consegui gravar o "ciente" —', (e && e.message) || e);
    }
    if (typeof depois === 'function') depois();
  }

  /* O portão da RUA dispara UMA vez por sessão — e a marca só queima quando o
     portão realmente ABRE (folha de dinheiro aberta adia pro próximo poll). */
  let cienteProspectorPedido = false;

  /* A MESMA régua da barra (`moduloDesligado` da casca), lida do MESMO CSV: não
     existe capítulo de Chat num app em que o admin apagou o Chat. */
  const moduloLigado = (k) => (String((config && config.appModulosDesativados) || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    .includes(String(k).toLowerCase()) ? 0 : 1);

  let tutorialAdiado = 0;

  /** os fatos do tour — traduzir, nunca decidir: quem esconde capítulo é o motor */
  function publicarTutorial() {
    if (typeof window.usarDados !== 'function') return;
    /* 🔴 NEM A MINHA PRÓPRIA ESCRITA REPINTA POR CIMA DO TOUR. Escrever no seam
       monta camada NOVA, e o tour vive dentro da camada: publicar isto no meio
       de um passo arrancaria o furo da tela. E ninguém está esperando o dado
       agora — o motor já leu o que precisava pra montar o capítulo (a porta
       abaixo só abre com os fatos COMPLETOS na tela). Espera ele sair. */
    if (tourRodando()) {
      if (!tutorialAdiado) {
        tutorialAdiado = setTimeout(() => { tutorialAdiado = 0; publicarTutorial(); }, 1500);
      }
      return;
    }
    const fatos = {
      /* `carregando` é o FREIO do motor: enquanto vale 1 ele não decide nada.
         Só cai quando as DUAS fontes tiveram desfecho — a config, que diz quais
         capítulos existem pra esta pessoa, e a pergunta do tutorial, que diz se
         o obrigatório já rodou. Derrubar o freio com uma delas pendente é deixar
         o motor decidir com meia verdade; e "pergunta que falhou" também é
         desfecho, senão o catálogo ficaria num esqueleto eterno por causa de
         uma porta que caiu. */
      carregando: (config && tutorialPerguntado) ? 0 : 1,
      /* 🔴 "NÃO SEI" RESPONDE **JÁ VIU** — e isto não é otimismo, é a única
         resposta segura. Pra o motor esta chave responde "posso pular o
         obrigatório?", e o obrigatório NÃO TEM X: disparar por ignorância
         prenderia 90 s num tutorial quem já o viu, toda vez que a rede falhasse.
         Quem ABRE o tour é a porta logo abaixo (`abrirObrigatorio`), e ela só é
         chamada com resposta na mão — então dizer 1 aqui não esconde nada de
         ninguém, e o próximo boot pergunta de novo. Só um "nunca visto" DITO
         pelo servidor vale 0. */
      obrigatorioVisto: tutorialVisto === false ? 0 : 1,
      /* 🔴 O CANAL É FATO DO BINÁRIO, NÃO DA CONFIG (23/08) — por isso mora
         FORA do `if (config)`: `BuildConfig.HBX_PLAY` já está no aparelho antes
         de qualquer resposta de rede, e a aula de Créditos precisa dele para
         não ensinar a vitrine que o binário da loja não tem. Mesma leitura de
         `encherCarteira`, para não existirem duas réguas do mesmo fato. */
      loja: ((window.HBX && window.HBX.info && window.HBX.info()) || {}).play ? 1 : 0,
    };
    if (config) {
      fatos.admin = ehAdmin() ? 1 : 0;
      // ⚰️ 24/08 — `financeiro` e `prospectorDisponivel` saíram dos fatos: o
      // financeiro é sempre ligado (o capítulo do Fechamento perdeu o `se:`) e
      // o prospector é aberto a toda empresa.
      fatos.prospectorAtivo = config.prospectorAtivo ? 1 : 0;
      // "Esta pessoa vê os prédios?" — desde 24/08 é a própria chave da
      // empresa: a régua admin/equipe morreu com o contrato novo.
      fatos.prospectorVejo = prospectorEuVejo();
      // O carimbo jurídico do ATOR (24/08) — fato publicado junto dos demais;
      // quem COBRA o portão é a ponte (`portaoCienteProspector`), não o motor.
      fatos.prospectorCiente = config.prospectorCiente === true ? 1 : 0;
      fatos.chat = moduloLigado('chat');
    }
    window.usarDados('tutorial', fatos);
    /* As portas de contato da tela "você ainda não tem clientes" dependem da
       MESMA config, e este é o ponto que já sabe que ela chegou (17/08). Um
       relógio próprio lá dentro decidia no escuro e apagava as duas portas. */
    try { publicarPortasDeSuporte(); } catch (_) { /* módulo ausente */ }
    /* 🔴 A PORTA ABRE AQUI, E SÓ AQUI — depois de os fatos estarem NA TELA.
       Abrir direto no fim da resposta do tutorial era abrir cedo demais: a
       config pode chegar depois, e o motor filtraria os capítulos por `se:`
       com meia verdade (motorista virando admin, capítulo do prospector
       aparecendo pra quem não tem). As duas fontes têm ordem de chegada
       imprevisível; este ponto é o único em que as duas já chegaram. Config que
       nunca chega = tour que não abre nesta sessão, e está certo: o
       `carregarBarra` tenta de novo a cada minuto. */
    /* 🔴 O FREIO DE 09/08 02:0x SAIU — A CAUSA ERA O `mock.js` PELA METADE.
       O freio foi posto por um motivo REAL e bem medido no g15 (APK 205): abria
       o app, tocava "Vamos lá" e o aparelho ficava mudo — véu comendo o dedo,
       sem furo, sem balão, sem nada desenhado. Diagnóstico da época: o ramo de
       jornada do motor. Não era.

       O `casca-injetar` rodou ENTRE duas edições do motor e gerou um `mock.js`
       que CHAMAVA `acharAlvo()` sem DEFINIR a função (medido: 1 chamada, 0
       definições). É a Lei nº1 do injetor — estado assado pela metade. O APK 205
       nasceu desse arquivo, então o primeiro passo estourava `ReferenceError`
       exatamente DEPOIS de montar o véu e ANTES de desenhar furo e balão: o
       sintoma descrito, nos mínimos detalhes.

       Reinjetado, medido no g15 com o APK instalado (`function acharAlvo` = 1):
       a lâmpada desenha véu+furo+balão; o capítulo "Montar e iniciar a rota"
       sai dos Ajustes, navega sozinho pra Rota (o tal ramo de jornada, que a
       suspeita acusava) e crava o furo no botão certo; toque FORA não faz nada
       e não fecha; toque DENTRO abre a Montagem de verdade e anda pro passo 2,
       com o furo saltando pros chips de dia. Prints no relatório da sessão.

       LEI QUE FICA: quando o app quebra logo depois de uma injeção, o primeiro
       suspeito é o ARQUIVO GERADO, não a lógica recém-escrita. */
    abrirObrigatorio();
  }

  /** a PORTA — o único lugar do app que abre o tutorial obrigatório */
  function abrirObrigatorio() {
    if (obrigatorioResolvido) return;
    /* A abertura é uma cena com relógio e termina recriando a camada inteira:
       tour montado em cima dela morre no berço, sem deixar rastro. Espera a
       casa ficar de pé — a MESMA espera que o portão da atualização já faz. */
    if (telaAtual() === 'entrada') { setTimeout(abrirObrigatorio, 2500); return; }
    if (!window.TUTOR || typeof window.TUTOR.obrigatorio !== 'function') {
      // Casca sem o motor do tour. Silêncio aqui seria um tutorial obrigatório
      // que "não dispara" sem nenhuma pista de por quê.
      console.warn('[HBX ponte] tutorial: o servidor diz "nunca visto", mas esta casca não tem window.TUTOR.obrigatorio()');
      return;
    }
    obrigatorioResolvido = true;
    try { window.TUTOR.obrigatorio(); } catch (e) {
      // Recusou: devolve a porta, senão o próximo caminho que a chamasse
      // encontraria a sessão marcada como resolvida sem nada ter aberto.
      obrigatorioResolvido = false;
      console.warn('[HBX ponte] tutorial: o motor recusou abrir —', (e && e.message) || e);
    }
  }

  /** o estado do tutorial deste USUÁRIO. Porta própria, uma vez, no boot. */
  async function carregarTutorial() {
    if (!temPonte()) return;
    let r;
    try { r = await window.API.get('/logistica/tutorial'); } catch (e) {
      /* 🔴 FALHA AQUI É "NÃO SEI", NUNCA "NÃO VIU". Rede no chão — ou o endereço
         barrado DENTRO do aparelho pela lista branca do `NativeApiClient` —
         não pode empurrar um tutorial obrigatório em cima de quem já o viu.
         Fica sem porta e sem carimbo, e o próximo boot pergunta de novo. O
         aviso é de CONSOLE porque o motorista não tem o que fazer com esta
         falha: ela não tira nada da tela dele. */
      console.warn('[HBX ponte] tutorial: não consegui ler o estado —', (e && e.message) || e);
      tutorialPerguntado = true;
      publicarTutorial();
      return;
    }
    tutorialVisto = !!(r && r.obrigatorioVistoEm);
    tutorialPerguntado = true;
    // Quem abre a porta é o `publicarTutorial` — ele é o único que sabe se as
    // DUAS fontes já chegaram. Ver a lei escrita lá.
    publicarTutorial();
  }

  /* O motor chama esta função no último "Entendi". No mock ela nasce no-op (o
     desenho define o seam, a ponte põe a rede) — e a ponte carrega DEPOIS do
     mock, então esta linha é a que vale no aparelho.

     🔴 GRAVAÇÃO NO CHÃO NÃO PRENDE NINGUÉM E NÃO REPETE. O tutorial acabou na
     tela dele; falhar aqui só significa que o servidor ainda não sabe. Não há
     portão de erro — dizer "Não deu certo" logo depois de "Pronto pra rodar" é
     castigar quem fez tudo certo — e não há segunda tentativa nesta sessão:
     quem tenta de novo é o próximo boot, que relê o estado. */
  window.tutorialConcluido = function () {
    obrigatorioResolvido = true;
    if (!temPonte()) return;
    window.API.post('/logistica/tutorial/visto', {})
      .then(() => { tutorialVisto = true; publicarTutorial(); })
      .catch((e) => {
        console.warn('[HBX ponte] tutorial: não consegui gravar o "visto" —', (e && e.message) || e);
      });
  };

