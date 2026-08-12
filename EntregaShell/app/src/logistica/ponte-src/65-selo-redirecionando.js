  /* ------------------------------------------------------------------------
     6c. O SELO DO RETRAÇO — "Redirecionando…" (12/08).

     Fora do traçado, o caminho novo demora o que a rede demorar — e nesse
     meio tempo a tela parada parece o app perdido: a fita aponta um caminho
     que o motorista acabou de abandonar e nada diz que o recálculo já está
     em curso. O selo é esse aviso, e ele tem TRÊS leis:

       · só acende COM PEDIDO EM VOO, e só no retraço (`pedirRota` decide —
         rota nova de parada entregue NÃO é retraço, é a ordem do dia);
       · apaga com a RESPOSTA: no sucesso ~700 ms depois do flash da fita
         (tempo de ligar o aviso ao caminho novo que acabou de pintar), na
         falha NA HORA — o backoff pode ser 60 s e selo pendurado é promessa
         falsa, a lição de [[confirmacao-decorativa-virou-promessa-falsa]];
       · e tem TETO DURO de 4 s que apaga de qualquer jeito — timer perdido,
         resposta que nunca vem, repinte no meio: nada deixa o selo eterno.

     🔴 CROMO VIVO, NUNCA SEAM: isto muda no meio da tela de dirigir e passar
     pelo `usarDados` remontaria a camada e PISCARIA (a lição paga de
     [[o-pisca-era-a-tela-entrando-de-novo]]). É classe direta no nó da camada
     viva, o mesmo mecanismo do `cromoDoProspector` e do `marcarSolta`. O nó
     `.gps-redir` é permanente e inerte no template (irmão do `.gps-veu`);
     repinte troca o nó e o novo nasce apagado — estado seguro, e o teto acima
     garante que os timers não ressuscitam nada. */
  const SELO_REDIR_TETO_MS = 4000;
  const SELO_REDIR_SUCESSO_MS = 700;
  let seloRedirTeto = null;    // o teto duro
  let seloRedirTarde = null;   // o apagar adiado do sucesso

  /** escreve o estado no nó da camada viva — e só nele */
  function seloRedir(liga) {
    const el = naCamada('.gps-redir');
    if (el) el.classList.toggle('on', !!liga);
  }

  /** apaga: já (0) ou daqui a pouco (>0). Sempre desarma os dois timers. */
  function apagarSeloRedir(aposMs) {
    if (seloRedirTeto) { clearTimeout(seloRedirTeto); seloRedirTeto = null; }
    if (seloRedirTarde) { clearTimeout(seloRedirTarde); seloRedirTarde = null; }
    if (aposMs > 0) {
      seloRedirTarde = setTimeout(() => { seloRedirTarde = null; seloRedir(false); }, aposMs);
      return;
    }
    seloRedir(false);
  }

  /** acende e arma o teto — chamado por `pedirRota`, nunca por conta própria */
  function acenderSeloRedir() {
    apagarSeloRedir(0);          // pedido novo não herda timer do anterior
    seloRedir(true);
    seloRedirTeto = setTimeout(() => { seloRedirTeto = null; seloRedir(false); }, SELO_REDIR_TETO_MS);
  }
