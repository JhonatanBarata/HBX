  /* ------------------------------------------------------------------------
     6b. O DEDO QUE MEXE NA ROTA — reordenar e retirar, gravados DE VERDADE.

     Os dois gestos da lista (arrastar pelo punho, deslizar pra retirar) eram
     só DOM: o `renumerar()` reescrevia os números na tela, ninguém gravava, e
     o primeiro repinte devolvia a ordem do servidor — provado reiniciando o
     app, a ordem arrastada sumia. Gesto que promete e não cumpre é pior que
     gesto que não existe: o motorista sai pra rua confiando numa sequência
     que só existia na tela dele.

     A casca ANUNCIA (`hbx:ordem` / `hbx:retirar`), esta seção GRAVA. Quem
     assume chama `preventDefault()` — é o contrato que faz a casca parar de
     mexer no DOM e esperar o dado real. Sem ponte (mock no navegador)
     ninguém assume e a maquete continua se virando sozinha.
     ------------------------------------------------------------------------ */

  /* Uma fila SÉRIE pros dois gestos: eles mexem na MESMA rota, e dois toques
     rápidos numa rede ruim mandariam duas ordens concorrentes — a última a
     chegar venceria por acaso. Enfileirando, a última ordem do DEDO vence,
     que é a que o motorista está vendo. (O `comTrava` global não serve aqui:
     ele DESCARTA o segundo toque calado, e gesto descartado em silêncio é a
     mesma mentira que esta seção existe pra matar.) */
  let filaRota = Promise.resolve();
  const naFila = (fn) => {
    filaRota = filaRota.then(fn, fn);
    return filaRota;
  };

  /* 🔴 O DEDO MANDOU NA PRÉVIA — e agora o DADO sabe na hora. Antes disto o
     arrasto da montagem vivia só no DOM até o "Montar rota" ler a tela, e
     qualquer repinte no meio o desfazia calado (o fix de GPS que chega da
     garagem é o caso real). Nada vai ao servidor: a entrega ainda não existe.
     Confere tudo antes de aplicar — uma lista de posições torta reescreveria a
     prévia com buraco, e prévia com buraco vira rota com cliente faltando. */
  function reordenarPrevia(idx) {
    if (!Array.isArray(idx) || idx.length < 2) return;
    if (!previaCrua || previaCrua.length !== idx.length) return;
    if (idx.some((n) => !Number.isInteger(n) || n < 0 || n >= previaCrua.length)) return;
    if (new Set(idx).size !== idx.length) return;
    if (!idx.some((n, i) => n !== i)) return;      // soltou no mesmo lugar
    previaCrua = idx.map((n) => previaCrua[n]);
    previaDoDedo = true;
    publicarModos();     // acende o ponto de "editado" no espaço que está aceso
    publicarPrevia();
  }

  /* 🔴 ARRASTOU = "MINHA ORDEM". `ordemManual` é o contrato que já existe no
     servidor (o mesmo que o desktop manda ao arrastar no Gerenciador): os ids
     listados recebem `rotaOrdem` NA ORDEM DADA e o motor pula o NN+2-opt —
     a ordem do motorista não é uma sugestão que o otimizador possa desfazer.
     Sem `deliveryIds`: quem decide o CONJUNTO continua sendo o servidor (as
     abertas do dia); eu só digo a SEQUÊNCIA. Id que ele não conhece (parada
     já entregue, que viaja na lista) é ignorado — medido no teste do
     `planRouteManual`.
     💰 Dinheiro: reordenar não cria parada. O snapshot da rota é append-only
     e o bloco cobrável tem claim ÚNICO por (empresa+motorista+data+bloco),
     então re-planejar o mesmo conjunto não debita nem reconta — inclusive com
     a rota ACTIVE, que é justamente quando o motorista arrasta. */
  document.addEventListener('hbx:ordem', (ev) => {
    if (!temPonte()) return;
    if (continuidadeAtiva) {
      ev.preventDefault();
      return avisoErro(new Error('Esta rota está em modo de consulta. Continue ou puxe antes de alterar a ordem.'));
    }
    // A MONTAGEM fala por POSIÇÃO: lá a entrega ainda não existe, então não há
    // id pra mandar ao servidor — e não há servidor pra chamar. Sai antes.
    if (ev.detail && Array.isArray(ev.detail.previa)) {
      ev.preventDefault();
      return reordenarPrevia(ev.detail.previa.map(Number));
    }
    const ids = ev.detail && Array.isArray(ev.detail.ids) ? ev.detail.ids.map(String).filter(Boolean) : [];
    if (ids.length < 2) return;
    ev.preventDefault();          // eu assumo: a casca não mexe mais na lista
    gestoSujouATela += 1;         // o DOM saiu do que o dado diz: o repinte vale
    naFila(async () => {
      try {
        // A origem entra aqui também: `planRouteManual` não reordena nada (a
        // ordem é a do dedo), mas é ela que dá a PERNA real da 1ª parada — sem
        // origem o trecho até o primeiro cliente sai zerado na tela.
        // A lista inteira vai como conjunto E sequência: escolher o cliente 3
        // não puxa para este planejamento uma parada alheia que entrou no dia
        // por outro aparelho enquanto o motorista tocava no mapa.
        await window.API.post('/logistica/rota/planejar', {
          date: dataDaRotaNaTela(), deliveryIds: ids, ordemManual: ids, ...origemGps(),
        });
      } catch (e) {
        // A tela está mostrando a ordem NOVA e o servidor ficou com a velha.
        // Repintar primeiro DESFAZ a mentira; o aviso vem depois, senão o
        // motorista fecha o alerta e continua olhando pra ordem que não é.
        await carregarRota();
        return avisoErro(e);
      }
      await carregarRota();
    });
  });

  /* 🔴 REORGANIZAR = DEVOLVER O VOLANTE AO OTIMIZADOR (17/08, ordem 5 do
     dono: *"colocar um botão na esquerda de 'Fila 13', Reorganizar = Reorganiza
     por distancia, porém o q foi adicionado como prioridade fica em vermelho, e
     não entra nesse filtro"*).

     Ele mora AQUI e não em arquivo novo porque este arquivo é "O DEDO QUE MEXE
     NA ROTA": é o terceiro gesto da mesma família (reordenar, retirar,
     reorganizar), na mesma fila SÉRIE (`naFila`), com o mesmo guarda de
     consulta e o mesmo par `carregarRota`/`avisoErro` do arrasto.

     É UMA CHAMADA SÓ, e isso é o conserto: `POST /rota/planejar` SEM
     `ordemManual` é exatamente o NN+2-opt a partir do GPS. A prioridade não
     precisa de conta nenhuma aqui porque quem a segura no topo é o SERVIDOR
     (o selo `Entrega.prioridade`, lido pelo `priorizarPrimeiro` dos dois
     motores do planejador). Fazer a lista calcular isso do lado de cá seria a
     segunda régua do mesmo fato — e duas réguas divergem no primeiro ajuste.

     💰 Dinheiro: mesma nota do arrasto, 30 linhas acima — re-planejar o mesmo
     conjunto não cria parada nem debita (claim ÚNICO por empresa+motorista+
     data+bloco). */
  async function reorganizarPorDistancia() {
    if (!temPonte()) return;
    if (continuidadeAtiva) {
      return avisoErro(new Error('Esta rota está em modo de consulta. Continue ou puxe antes de alterar a ordem.'));
    }
    return naFila(async () => {
      try {
        // Sem `deliveryIds` de propósito: quem decide o CONJUNTO continua sendo
        // o servidor (as abertas do dia); daqui só se pede a SEQUÊNCIA dele.
        await window.API.post('/logistica/rota/planejar', {
          date: dataDaRotaNaTela(), ...origemGps(),
        });
      } catch (e) {
        await carregarRota();     // desfaz a mentira primeiro, avisa depois
        return avisoErro(e);
      }
      await carregarRota();
    });
  }

  /* 🔴 RETIRAR É CANCELAR — o app tem UM verbo destrutivo só (lei do dono,
     29/07). Não nasce aqui um segundo caminho de exclusão: a parada retirada
     é uma entrega DECIDIDA (ele resolveu não passar lá hoje), e é o
     `entregas/:id/cancelar` que fecha o desfecho, anda o cursor da agenda e
     cancela a cobrança dela — o cliente volta na recorrência dele, intacta.
     O motivo viaja escrito: no extrato fica "Cancelada: retirada da rota pelo
     motorista", que é o que o escritório precisa ler depois pra saber que
     ninguém bateu na porta. */
  document.addEventListener('hbx:retirar', (ev) => {
    if (!temPonte()) return;
    const id = String((ev.detail && ev.detail.id) || '');
    if (!id) return;
    ev.preventDefault();
    gestoSujouATela += 1;         // mesma régua do arrastar: repinte garantido
    naFila(async () => {
      try {
        await window.API.post(`/logistica/entregas/${encodeURIComponent(id)}/cancelar`, {
          motivo: 'retirada da rota pelo motorista',
        });
      } catch (e) {
        // Rede caída NÃO apaga parada: a casca não removeu o cartão (nós
        // assumimos o gesto), então basta repintar pra tela voltar a ser o
        // que o servidor tem — a parada continua lá, viva.
        await carregarRota();
        return avisoErro(e);
      }
      await carregarRota();
    });
  });
