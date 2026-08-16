  /* ------------------------------------------------------------------------
     CONTINUIDADE DA ROTA — dono, virada do dia e handoff exato.

     Esta frente nunca chama a limpeza ampla do dia. Toda ação leva o `ref`
     validado pelo servidor e só depois recarrega a fonte. A fila offline fecha
     o portão: rota não troca de mãos nem é cancelada enquanto este aparelho
     ainda guarda entrega/comprovante sem ACK — PENDENTE, o trabalho que ainda
     pode subir. O RECUSADO é outra coisa e não tranca nada (ver a nota do
     `recusadosResolvidos`): ele já morreu no servidor, só precisa ser visto.
     ------------------------------------------------------------------------ */
  const refDoAlvo = (alvo) => String((alvo && alvo.dataset && alvo.dataset.ref) || '');
  const ownerDoAlvo = (alvo) => Number(alvo && alvo.dataset && alvo.dataset.owner) || undefined;

  /* 🔴 A ROTA FANTASMA (15/08) — MOVIDA de `00-nucleo.js` pra CÁ (o módulo da
     ref) porque aquele arquivo está no teto de 1000/1000 do portão da ponte;
     a costura é um IIFE contíguo e `function` hoista, então a mudança de casa
     não muda comportamento nenhum.

     🔴 O QUE MUDOU DE VERDADE: a ref `route:` agora EXIGE rota VIVA — mas
     "viva" NÃO é o mesmo que "rodando". Até aqui (14/08) bastava `r.routeId`
     existir — e ele existe pra QUALQUER rota do motorista+dia, viva ou
     morta. `claimLogisticaRoute` (backend) cria a `LogisticaRoute` ANTES de
     `planejarRota`: todo Iniciar que falha (dia vazio, 402 de assento, OSRM
     fora) deixa uma rota PLANNED com zero stops pra trás — e o Cancelar
     anterior deixa uma rota ACTIVE/ENCERRADA com zero stops (a lápide, medida
     no banco de produção). Nos dois casos o `routeId` continua vindo no
     payload e a ref virava `route:<morta>`: todo verbo (inclusive Cancelar)
     passava a bater 409/404 contra um alvo que o servidor já esqueceu — o
     aparelho ficava preso olhando pra uma rota fantasma, rodando
     `carregarRota()` a cada 60 s pra sempre.

     🔴 O FURO DO LOTE 1.1 (15/08, achado pela revisão adversarial) — a 1ª
     cura restringiu demais: `estadoDaRota(r) === 'rodando'` só é verdade pra
     ACTIVE/INITIALIZING. Uma rota PLANNED deixada por um Iniciar que falhou
     DEPOIS do congelamento (ou uma COMPLETED com abertas presas dentro —
     "a rota COMPLETED com 14 paradas abertas presas" que existe em prod,
     ver §5 do desenho) AINDA SEGURA os stops do dia — mas caía em `draft:`
     porque não está "rodando". O `resolve()` do servidor (ramo `draft:`)
     EXCLUI de propósito qualquer entrega presa num stop de rota com
     `operationalEndedAt` NULO (é o par exato desta régua: rota viva não
     encerrada guarda dono via `route:`, só a morta solta pro `draft:`) — a
     ref virava `draft:`, o resolve não achava as entregas presas, NotFound,
     e o F5 do lote 1.1 engolia isso como saída graciosa: `{ok:true,
     canceladas:0}` SEM cancelar nada. Pior que o 404 de antes — parecia
     sucesso.

     A RÉGUA CERTA (lote 1.2): rota ENCERRADA (`routeStatus === 'ENCERRADA'`,
     o servidor deriva isso de `operationalEndedAt`) OU inexistente → `draft:`
     (é o dia que sobrou por cima da lápide — exatamente a cena do print:
     lápide encerrada → `draft:` → cancela o dia). Rota VIVA (qualquer status
     != 'ENCERRADA': PLANNED, INITIALIZING, ACTIVE, COMPLETED-com-stop-preso)
     → `route:`, independente de estar 'rodando'. Isso NÃO reabre a fantasma
     original: o `routeId` só existe pra rota de HOJE deste motorista
     (`getOperationalRouteMetadata`), e uma rota PLANNED/COMPLETED com
     `routeId` publicado sempre tem dono válido no backend — é a MESMA rota
     que o Cancelar precisa mirar pra realmente esvaziar.

     Qualquer outro estado (sem `routeId`, ou ENCERRADA) cai na ref do DIA
     (`draft:<dono>:<data>`) — é exatamente o que o servidor publica em
     `/logistica/rota/continuidade` quando a rota não é mais "de hoje e
     viva". Sem dono nem ordem gravada, `comDono` não acha ninguém e a ref
     sai vazia — não há o que cancelar, o dock já mostra "Montar rota". */
  function refDaResposta(r, itens) {
    if (r && r.continuityRef) return String(r.continuityRef);
    if (r && r.routeId && String(r.routeStatus || '').toUpperCase() !== 'ENCERRADA') {
      return `route:${String(r.routeId)}`;
    }
    const comDono = (itens || []).find((it) => it && it.entregador && it.entregador.id
      && it.rotaOrdem !== null && it.rotaOrdem !== undefined);
    return comDono ? `draft:${Number(comDono.entregador.id)}:${String((r && r.date) || dataDaRotaNaTela())}` : '';
  }

  /* ------------------------------------------------------------------------
     O POLL DA CONTINUIDADE — MOVIDO de `10-geofence-montagem.js` no LOTE 1.3
     (15/08). Ele nunca foi do geofence: é a irmã do `refDaResposta` acima (a
     mesma pergunta, "de quem é esta rota"), e aquele arquivo estava no teto de
     1.000 linhas do portão da ponte. A costura é um IIFE contíguo e `function`
     hoista; `tourRodando`/`carregarRota` continuam lá e são lidos daqui — a
     mudança de casa não muda comportamento nenhum.
     ------------------------------------------------------------------------ */
  /* 🔴 QUANTAS PARADAS **DESTA ROTA** AINDA ESTÃO ABERTAS — que NÃO é a conta
     do DIA (LOTE 1.4, 16/08). As duas contas divergem exatamente no estado em
     que o motorista passa a tarde: rota cumprida (todos os stops fechados) e
     uma entrega nova lançada por cima. O dia tem aberta; a ROTA não tem
     nenhuma. E é a conta da ROTA que o servidor usa pra decidir se publica
     `route:<id>` em `ownedRefs` (`listar`: `stops: { some: { delivery: status
     IN abertos } }`).

     A régua de "esta parada é desta rota" é a MESMA que o resto da casa já usa
     e que `estadoDaRota` escreve com todas as letras: quem prova é a ORDEM
     GRAVADA (`rotaOrdem`) — é ela que o `rota/planejar` grava e é ela que o
     `carregarRota` usa pra separar parada de rota de resíduo do dia. Entrega
     nova (avulsa lançada depois, agenda que caiu no dia) chega SEM ordem: não
     está em stop nenhum e não é desta rota.

     Fonte: `ENTREGAS`, que o `carregarRota` reescreve inteira a cada carga com
     os ITENS crus do servidor (`{item, n}`) — o mesmo material de onde
     `PARADAS` nasce. Ler os itens crus (e não `PARADAS`) é de propósito: a
     parada traduzida perde o `rotaOrdem` no caminho.

     Falha aqui devolve ZERO — "não sei" tem que virar "não mexe". Este número
     só existe pra AUTORIZAR um desarme de GPS + recarga de tela no meio da rua;
     na dúvida, a mão fica fora do volante.

     🔴 CONTINUA VIVA DEPOIS DO LOTE 1.5, e é fácil achar que não. A régua nova
     (`refsDoAtor.length === 0`) não cobre a cena 5 da bancada: rota ACTIVE com
     os stops todos fechados e um encaixe SEM ordem por cima — ali o servidor
     não publica a rota (sem stop aberto) NEM forma rascunho (o `listar` só
     agrupa em `draft:` quem tem `rotaOrdem` OU `startedAt`), então `ownedRefs`
     vem VAZIA sem que ninguém tenha puxado nada. Quem separa essa cena do
     controle de posse revogada de verdade é só esta conta. Apagar isto reabre
     o loop naquela variante — a prova `prova-loop-posse` reprova na hora. */
  function paradasAbertasDaRota() {
    let n = 0;
    try {
      ENTREGAS.forEach((e) => {
        const it = (e && e.item) || null;
        if (!it) return;
        const st = String(it.status || '');
        if (st === 'entregue' || st === 'cancelada') return;
        if (it.rotaOrdem === null || it.rotaOrdem === undefined) return;
        n += 1;
      });
    } catch (_) { return 0; }
    return n;
  }

  /* 🔴 A ÚLTIMA REF QUE ESTE APARELHO ADOTOU DO SERVIDOR (LOTE 1.6, 16/08). Ela
     é o FREIO da cura abaixo, e existe por um motivo mecânico: `carregarRota`
     re-DERIVA `rotaRefAtual` do payload (`refDaResposta`) toda vez, então a
     divergência que disparou a adoção volta a existir no tique seguinte. Sem
     guardar o que já foi adotado, "ressincronizar uma vez" viraria
     "ressincronizar sempre" — o loop de 60s de volta por uma porta nova.
     Guarda a ref PUBLICADA (não a derivada): é ela que muda quando o dia muda
     de verdade, e é essa mudança que autoriza a próxima ressincronização. */
  let ultimaRefAdotada = '';

  async function atualizarContinuidades() {
    if (!temPonte()) return;
    let resp;
    try { resp = await window.API.get('/logistica/rota/continuidade'); } catch (_) {
      // Rede ruim preserva o último retrato, mas ele precisa dizer que é um
      // retrato — silêncio aqui fazia cartão velho parecer informação ao vivo.
      pendenciasSemConexao = true;
      if (typeof window.usarDados === 'function') {
        window.usarDados('rota', { pendencias: pendenciasDaRota, pendenciasSemConexao });
      }
      return;
    }
    vestirPendencias(resp);
    if (typeof window.usarDados === 'function') window.usarDados('rota', { pendencias: pendenciasDaRota, pendenciasSemConexao });
    /* Se outra pessoa puxou esta rota, o aparelho antigo perde a posse no
       próximo tique/foco e desarma o geofence. Offline de verdade não permite
       revogação instantânea; ao reconectar esta é a primeira ação.

       🔴 O LOOP DE 60 SEGUNDOS (LOTE 1.3, 15/08 — REGRESSÃO QUE FOI PARAR NO
       APARELHO DO MOTORISTA, medida em bancada com controle). "Posse revogada"
       só faz sentido com ROTA NA RUA. Desde o lote 1.2 a ref `route:` nasce
       pra QUALQUER rota não-ENCERRADA — inclusive as que não seguram parada
       aberta nenhuma (a PLANNED que sobra de um Iniciar que falhou; a
       COMPLETED com parada nova lançada por cima) — e o servidor NUNCA publica
       uma rota assim em `ownedRefs` (o `listar` exige `stops: { some: {
       delivery: status IN abertos } }`). Cada lado está CERTO sozinho; o
       encontro deles é que mentia: `route:<viva-sem-stop>` ∉ `ownedRefs` ⇒
       este bloco concluía "perdi a posse" a CADA tique, desarmava o serviço
       nativo e recarregava a tela inteira, para sempre — bateria e tela
       piscando na mão de quem está dirigindo. Medido em 3 tiques: +12
       `stopRoute` e +6 `GET /logistica/rota` na PLANNED-fantasma e na
       COMPLETED-sem-aberta; ZERO numa rota ACTIVE normal (o controle limpo).

       A cura é no CONSUMIDOR, nunca na régua da ref acima — foi ela que curou
       o no-op mudo do Cancelar. `estadoRota === 'rodando'` é o MESMO recorte
       que o `sincronizarGeofence` usa pra decidir se há serviço armado (só
       ACTIVE/INITIALIZING): desarmar o que não está armado e recarregar o dia
       de quem não saiu é trabalho inútil por definição. O caso que importa —
       rota ACTIVE cuja posse foi pra outro aparelho — segue INTEIRO, com
       controle próprio em `scripts/prova-loop-posse.js`.

       O `try` é a convenção da casa (casca velha pode não ter a variável):
       sem ele um ReferenceError aqui viraria unhandledrejection mudo, e a
       régua nova fecharia o bloco pelo motivo errado.

       🔴 O LOTE 1.3 SÓ ENCOLHEU O LOOP (LOTE 1.4, 16/08 — medido pela revisão
       adversarial com sonda própria: 8 `stopRoute` + 8 `GET /logistica/rota`
       em 4 tiques, no código já corrigido). `estadoRota === 'rodando'` desliga
       o bloco pra rota que não está na rua — mas "rodando" NADA diz sobre a
       rota ainda SEGURAR parada aberta: `estadoDaRota` devolve 'rodando' por
       `routeStatus === 'ACTIVE'` e ponto, e ACTIVE dura até alguém ENCERRAR o
       dia. Rota cumprida de manhã + entrega nova de tarde = ACTIVE, dia com
       aberta na tela, e o servidor sem publicar ref nenhuma pro ator (a rota
       não tem stop aberto; a entrega nova não tem `rotaOrdem` nem `startedAt`
       pra formar rascunho). Todas as condições batiam, INCLUSIVE a nova — e o
       aparelho desarmava o GPS e recarregava a tela 1×/min a tarde inteira.

       A régua que faltava: só se PERDE a posse de uma rota que o servidor
       AINDA reconheceria como sua — isto é, uma rota que ainda segura parada
       aberta (`paradasAbertasDaRota`, o espelho do filtro do `listar`). Sem
       parada aberta na rota, a ausência dela em `ownedRefs` não é revogação:
       é o servidor dizendo que aquela rota acabou. Não há posse a perder.

       As DUAS contas ficam, porque elas leem fontes diferentes — a do DIA vem
       de `PARADAS` (o mock/tela), a da ROTA vem de `ENTREGAS` (os itens crus).
       Hoje a segunda implica a primeira; no dia em que divergirem, quem manda
       é a mais estreita, e nenhuma divergência reabre o loop. O CONTROLE segue
       inteiro: rota ACTIVE com parada aberta cuja posse foi pra outro aparelho
       continua desarmando e ressincronizando, com cena própria na bancada.

       🔴 A METADE QUE SOBROU — E A RÉGUA DEFINITIVA (LOTE 1.5, 16/08; o fiscal
       mediu 8 `stopRoute` + 8 `GET /logistica/rota` em 4 tiques no HEAD do
       1.4, na variante MAIS COMUM). O guarda acima (`paradasAbertasDaRota`)
       decide "esta parada é DESTA rota" pela ORDEM GRAVADA — mas quem prova
       isso no SERVIDOR é o STOP (`listar`: `stops: { some: { delivery: aberta
       } }`), e stop só nasce no INICIAR (`congelarStops`). O
       `/logistica/rota/planejar` grava `rotaOrdem` SEM criar stop — e é ele
       que TODO encaixe do app chama no mesmo toque (ficha do cliente, parada
       avulsa, dedo na rota, recado com anexo), além do desktop do admin. Cena
       medida: o motorista cumpre a rota da manhã, não encerra (segue ACTIVE),
       encaixa uma entrega de tarde ⇒ ela ganha ordem e não ganha stop ⇒
       `paradasAbertasDaRota()` volta a contar 1 ⇒ o loop inteiro renasce, com
       ele dirigindo.

       A régua que fecha a porta é OUTRA, e é mais rasa: **posse revogada só
       existe quando o servidor não devolve ref NENHUMA pro ator**. Se ele
       devolveu alguma (na cena acima, o `draft:` do dia — o encaixe sem stop
       FORMA rascunho), o aparelho não perdeu rota alguma: a ref que ele
       carrega apenas mudou de FORMA (`route:` → `draft:`) enquanto o dia
       continua dele. Perder posse é o servidor não reconhecer mais NADA como
       seu — que é exatamente o que acontece quando outro aparelho puxa a rota
       (o CONTROLE, que continua desarmando e recarregando).

       Por isso o `!refsDoAtor.includes(rotaRefAtual)` SAIU: com a lista vazia
       ele é sempre verdadeiro, e com a lista cheia ele passou a ser a pergunta
       ERRADA (ref diferente ≠ posse perdida). `refsDoAtor.length === 0` diz a
       mesma coisa que ele dizia no único caso em que ele estava certo, e não
       mente no resto.

       NESTE bloco não se adota a ref publicada, e isso não mudou: aqui se
       DESARMA GPS, e desarme errado é a mão fora do volante. A adoção da ref
       (sem tocar no serviço de rota) virou um bloco PRÓPRIO logo abaixo, no
       lote 1.6 — é a metade que faltava, e ela paga o preço nomeado no
       parágrafo seguinte.

       O PREÇO HONESTO desta régua (nomeado quando ela nasceu, e COBRADO no
       lote 1.6): se a rota for puxada por outro aparelho E este ator ainda
       tiver alguma entrega solta com ordem no mesmo dia, `ownedRefs` não vem
       vazia e o aparelho antigo não desarma no tique. Ficar com a tela velha
       parecia barato ("retrato desatualizado, sem perda de dado") — não é: a
       tela velha é ACIONÁVEL, o motorista antigo toca paradas que já são de
       outra pessoa e cada toque volta REJECTED, lápide permanente nesta casa.
       Daí a cura do 1.6 logo abaixo: ressincronizar UMA vez, sem desarmar
       nada. O volante continua intocado — o que mudou é que o retrato velho
       deixou de ser eterno. */
    let naRuaAgora = false;
    try { naRuaAgora = estadoRota === 'rodando'; } catch (_) { naRuaAgora = false; }
    const semRefNenhuma = !Array.isArray(refsDoAtor) || refsDoAtor.length === 0;
    if (!continuidadeAtiva && naRuaAgora && rotaRefAtual && semRefNenhuma
      && paradasAbertasNaTela() > 0 && paradasAbertasDaRota() > 0) {
      try { if (window.HBX && typeof window.HBX.stopRoute === 'function') window.HBX.stopRoute(); } catch (_) {}
      await carregarRota();
      return;
    }
    /* 🔴 O PREÇO DA RÉGUA DO 1.5, PAGO (LOTE 1.6, 16/08 — furo 2 da revisão
       adversarial). O parágrafo acima nomeia o preço com todas as letras:
       "se a rota for puxada por outro aparelho E este ator ainda tiver alguma
       entrega solta com ordem no mesmo dia, `ownedRefs` não vem vazia e o
       aparelho antigo não desarma no tique — ele fica com a tela velha". O
       fiscal mediu o que "tela velha" custa: 4 tiques, 0 desarme, 0 recarga —
       e a tela continua ACIONÁVEL. O motorista antigo segue tocando paradas que
       já são de OUTRA pessoa; cada toque desses entra na fila offline e volta
       REJECTED, que nesta casa é LÁPIDE PERMANENTE (só sai por descarte
       manual). Retrato velho é uma coisa; retrato velho com botão é outra.

       A cura NÃO reabre o loop, e a diferença é onde ela mexe:
         · o servidor DEVOLVEU refs (a lista não está vazia) ⇒ não houve
           revogação total: o serviço de rota fica INTOCADO (zero `stopRoute`).
           Desarmar continua exclusivo do caso lista vazia, que é o único em
           que o servidor não reconhece NADA como deste ator;
         · a ref que este aparelho carrega não está entre as publicadas ⇒ ela
           está velha (ou mudou de FORMA, `route:`→`draft:`). O aparelho ADOTA a
           publicada e ressincroniza UMA vez — condicionado à MUDANÇA da ref
           (`ultimaRefAdotada`), nunca a cada tique.
       E ela é coerente com o resto: rota viva COM stop aberto SEMPRE aparece em
       `ownedRefs` (o `listar` a publica), então pra ela nada muda — a troca só
       acontece onde o `draft:` do dia já é o alvo certo. O `route:` derivado
       volta na carga seguinte (`refDaResposta` re-deriva do payload), então o
       alvo do Cancelar continua sendo o mesmo de sempre: esta escrita é um
       PISO pra não ficar com ref morta se a recarga falhar, não um teto.

       `paradasAbertasNaTela`/`paradasAbertasDaRota` NÃO entram aqui de
       propósito: os dois guardam DESARME de GPS ("na dúvida, a mão fica fora
       do volante"), e aqui não se desarma nada. Uma tela velha acionável é
       igualmente perigosa com a rota parada. */
    if (!continuidadeAtiva && rotaRefAtual && !semRefNenhuma
      && refsDoAtor.indexOf(rotaRefAtual) < 0) {
      // Uma `route:` publicada é mais específica que o `draft:` do dia — quando
      // as duas vierem, a rota manda. Determinístico de propósito: a mesma
      // resposta tem que dar sempre a mesma ref.
      const publicada = refsDoAtor.filter((r) => String(r).indexOf('route:') === 0)[0] || refsDoAtor[0];
      if (publicada && publicada !== ultimaRefAdotada) {
        ultimaRefAdotada = publicada;
        rotaRefAtual = publicada;
        await carregarRota();
      }
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') atualizarContinuidades();
  });
  window.addEventListener('focus', atualizarContinuidades);
  setInterval(() => { if (!tourRodando()) atualizarContinuidades(); }, 60000);

  /* 🔴 A ROTA FANTASMA (14/08, print do dono): "51 paradas · 0 entregues" com
     dock Cancelar|Iniciar|Montagem, e QUALQUER verbo de continuidade batendo
     409/404 sem NUNCA atualizar a tela — o aparelho ficava preso olhando pra
     um dia que o servidor já não reconhecia mais (sem abertas, rota sumida,
     dono trocado). `avisoErro` sozinho só abria o portão com a frase crua
     ("Não deu certo") e a tela morta continuava desenhada por baixo dele.

     `avisoErroContinuidade` é a MESMA porta, só que pros 4 verbos de
     continuidade (o Cancelar do dock, em `30-verbos-rota.js`, e os 3 destes
     cartões): num 409/404 SEM `code` dedicado — ROTA_DE_OUTRO_MOTORISTA e
     ASSENTOS_ESGOTADOS continuam com o handoff próprio deles, intocado —
     ela RESSINCRONIZA primeiro (esquece a rota carregada e recarrega) e só
     DEPOIS abre um portão curto e honesto. Quando ele fechar, a tela por
     baixo já bate com o servidor — nunca com o fantasma. */
  const avisoErroContinuidade = async (e) => {
    const status = Number((e && e.status) || 0);
    const code = String((e && e.body && e.body.code) || '');
    if (status !== 409 && status !== 404) return avisoErro(e);
    if (code) return avisoErro(e);
    esquecerRotaCarregada();
    await carregarRota();
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'trava', ico: 'alert', titulo: 'Este dia mudou',
      sub: humano(e) || 'Este dia não tem mais paradas abertas.',
      acoes: [['Fechar', '']],
    });
  };

  /* 🔴 UM PORTÃO QUE PERGUNTA PRECISA DEVOLVER A RESPOSTA — E MORRER JUNTO COM A
     TELA (14/08). O "sim" resolve `true`; QUALQUER outra saída (o escape, o toque
     fora, o repinte que varre a camada) resolve `false` pelo vigia. Sem o vigia,
     um "Agora não" deixaria `comTravaFila` ocupado pra sempre — exatamente o tipo
     de beco que este arquivo está consertando. O relógio de 60s é só backstop. */
  function decisaoDoPortao() {
    return new Promise((resolve) => {
      const wrap = naCamada('.portao-wrap');
      const principal = naCamada('.portao-wrap .principal');
      if (!wrap || !principal) { resolve(false); return; }
      let respondido = false;
      let vigia = 0;
      const responder = (valor) => {
        if (respondido) return;
        respondido = true;
        if (vigia) clearInterval(vigia);
        resolve(valor);
      };
      principal.addEventListener('click', () => responder(true), { once: true });
      vigia = setInterval(() => { if (!wrap.isConnected) responder(false); }, 250);
      setTimeout(() => responder(false), 60000);
    });
  }

  /* 🔴 RECUSADO AVISA, NÃO TRANCA (14/08 — o beco que prendeu 4 rotas do dono).
     A régua de ontem exigia `rejected == 0` pra mover ou cancelar, e mandava
     "resolva esse item antes" — só que resolver não existia: REJECTED nasceu pra
     ficar de evidência e NADA neste app o apagava. Pior: a rota com
     `operationalEndedAt` faz o VPS devolver CONFLICT em qualquer comando, o app
     grava CONFLICT como REJECTED permanente, e aí o CANCELAR — a única saída
     daquela rota — some junto. Ciclo fechado, aparelho preso.

     Recusa permanente é fato MORTO: o VPS já disse que não aceita e repetir não
     muda; o `applyLocalOverlay` nem desenha REJECTED, então a tela JÁ mostra o
     que o servidor tem de verdade. Segurar a rota por causa dele não protege
     nada. O que protege é o PENDING — esse continua trancando, porque é trabalho
     que ainda não subiu. Aqui o recusado só precisa ser VISTO e descartado pela
     mão do dono. APK sem a ponte do descarte não trava por algo que não tem como
     resolver: segue, como era antes de ontem. */
  async function recusadosResolvidos(st) {
    const quantos = Number(st && st.rejected) || 0;
    if (quantos <= 0) return true;
    const offline = (window.HBX && window.HBX.offline) || null;
    if (!offline || typeof offline.descartarRecusados !== 'function') return true;
    if (typeof window.portao !== 'function') return true;
    window.portao({
      tom: 'alerta',
      ico: 'alert',
      titulo: quantos === 1 ? 'Um item foi recusado' : `${quantos} itens foram recusados`,
      sub: 'O HBX não aceitou esta entrega ou comprovante e não vai aceitar numa nova tentativa. A rota na tela já mostra o que o servidor tem. Descarte para seguir.',
      acoes: [['Agora não', ''], ['Descartar e seguir', 'principal']],
      classe: 'duas',
      // Descartar APAGA a evidência local — veste vermelho, como todo destrutivo
      // desta casa. A classe segue `principal` porque é nela que o "sim" pendura.
      perigo: true,
    });
    if (!(await decisaoDoPortao())) return false;
    const depois = offline.descartarRecusados();
    if (depois && (Number(depois.rejected) || 0) > 0) {
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'Não consegui descartar',
        sub: 'Os itens recusados continuam neste aparelho. Toque em Sincronizar e tente de novo.',
        acoes: [['Fechar', '']],
      });
      return false;
    }
    return true;
  }

  async function filaOfflinePronta() {
    try {
      const ler = () => (window.HBX && window.HBX.offline && window.HBX.offline.status
        ? window.HBX.offline.status() : { pendingOperations: 0, pendingProofs: 0 });
      let st = ler() || {};
      if (!(await recusadosResolvidos(st))) return false;
      st = ler() || {};
      if ((Number(st.pendingOperations) || 0) + (Number(st.pendingProofs) || 0) <= 0) return true;
      if (window.HBX.offline && window.HBX.offline.flush) window.HBX.offline.flush();
      await new Promise((resolve) => setTimeout(resolve, 1600));
      st = ler() || {};
      if (!(await recusadosResolvidos(st))) return false;
      st = ler() || {};
      if ((Number(st.pendingOperations) || 0) + (Number(st.pendingProofs) || 0) <= 0) return true;
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'Sincronize antes de mover',
        sub: 'Este aparelho ainda guarda entregas ou comprovantes. Conecte à internet e toque em Sincronizar.',
        acoes: [['Fechar', '']],
      });
      return false;
    } catch (_) {
      window.portao({
        tom: 'alerta', ico: 'alert', titulo: 'Não consegui conferir a fila',
        sub: 'Por segurança, conecte à internet e toque em Sincronizar antes de mover ou cancelar esta rota.',
        acoes: [['Fechar', '']],
      });
      return false;
    }
  }

  async function abrirRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    if (!ref) return;
    continuidadeAtiva = ref;
    await carregarRota();
    if (typeof window.ir === 'function') window.ir('rota');
  }

  async function continuarRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    const expectedOwnerId = ownerDoAlvo(alvo);
    if (!ref) return;
    await comTravaFila(async () => {
      if (!(await filaOfflinePronta())) return false;
      let resposta;
      try { resposta = await window.API.post('/logistica/rota/continuidade/retomar', { ref, expectedOwnerId }); }
      catch (e) { await avisoErroContinuidade(e); return false; }
      continuidadeAtiva = '';
      esquecerRotaCarregada();
      await carregarRota();
      if (resposta && resposta.planningPending) avisoErro(new Error(resposta.message));
      if (typeof window.ir === 'function') window.ir('rota');
      return true;
    });
  }

  function puxarRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    const expectedOwnerId = ownerDoAlvo(alvo);
    if (!ref || typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'route', titulo: 'Puxar esta rota?',
      sub: 'As paradas ainda não iniciadas passam para você. A rota da outra pessoa não é apagada.',
      acoes: [['Não', ''], ['Puxar', 'principal']], classe: 'duas',
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTravaFila(async () => {
      if (!(await filaOfflinePronta())) return false;
      let resposta;
      try { resposta = await window.API.post('/logistica/rota/continuidade/puxar', { ref, expectedOwnerId }); }
      catch (e) { await avisoErroContinuidade(e); return false; }
      continuidadeAtiva = '';
      esquecerRotaCarregada();
      await carregarRota();
      if (resposta && resposta.planningPending) avisoErro(new Error(resposta.message));
      if (typeof window.ir === 'function') window.ir('rota');
      return true;
    }), { once: true });
  }

  function cancelarRotaPendente(alvo) {
    const ref = refDoAlvo(alvo);
    const expectedOwnerId = ownerDoAlvo(alvo);
    if (!ref || typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'close', titulo: 'Cancelar esta rota?',
      sub: 'Só as paradas abertas desta rota serão canceladas.',
      acoes: [['Não', ''], ['Sim, cancelar', 'principal']], classe: 'duas', perigo: true,
    });
    const botao = naCamada('.portao-wrap .principal');
    if (!botao) return;
    botao.addEventListener('click', () => comTravaFila(async () => {
      if (!(await filaOfflinePronta())) return false;
      try { await window.API.post('/logistica/rota/continuidade/cancelar', { ref, expectedOwnerId }); }
      catch (e) { await avisoErroContinuidade(e); return false; }
      if (continuidadeAtiva === ref) continuidadeAtiva = '';
      esquecerRotaCarregada();
      await carregarRota();
      if (typeof window.ir === 'function') window.ir('rota');
      return true;
    }), { once: true });
  }
