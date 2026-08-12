  /* ══════════════════════════════════════════════════════════════════════════
     L8d — O RECADO QUE CARREGA TRABALHO (12/08).

     A Central gruda uma PARADA (um cliente) ou uma ROTA SALVA no texto do
     recado; aqui o motorista decide. Com rota ativa são três saídas — Encaixar
     na rota, Analisar, Negar; sem rota ativa, duas — Analisar e Negar (o botão
     que não tem para onde encaixar não nasce).

     🔴 POR QUE ISTO MORA NO CHAT. A tela própria pra isso existiu ("Rota
     Indicada", aceitar/negar) e morreu no corte de 06/08: 4 linhas na história
     inteira servidas por 2.981 polls. Ordem do dono: *"o mecanismo de 'fazem a
     rota pra mim' fica no chat — todo motorista sabe usar chat"*.

     🔴 NENHUM VERBO NOVO DE ROTA NASCE AQUI. Encaixar parada = a MESMA receita
     da parada avulsa (`/logistica/entregas` com `paraMinhaRota` + o
     `encaixarAvulsa` que mede custo de inserção); encaixar rota = o MESMO
     `rota-modelos/:id/gerar` que o "Usar esta rota hoje?" já chama. Um segundo
     caminho pra montar o dia é como nasce a rota que existe numa tela só.

     🔴 NEGAR NÃO LIMPA NADA PORQUE NADA FOI CRIADO. Até o encaixe, o anexo é um
     id dentro de uma mensagem: "a rota recebida é LIMPA, não fica presa em
     limbo nenhum" é propriedade da construção, não faxina. O que sobra é a
     linha no fio dizendo que negou — com ou sem motivo.
     ══════════════════════════════════════════════════════════════════════════ */

  /* O recado cujo MOTIVO está sendo escrito agora. Ele existe porque a próxima
     mensagem do campo tem que responder ESTE recado (o `recadoId` do
     `/recados/responder`), e não o que estiver por acaso no portão — senão o
     "não vou conseguir passar lá" viraria resposta de outro assunto. Some no
     envio, no cancelamento e ao sair do Chat. */
  let motivoDoAnexo = null;

  /** o id que a próxima mensagem do chat deve responder (vazio = nenhum) */
  function recadoIdDoMotivo() {
    return motivoDoAnexo ? String(motivoDoAnexo) : '';
  }

  function limparMotivoDoAnexo() {
    motivoDoAnexo = null;
  }

  /** o recado do fio com este id — o anexo VIVE no fio, não numa lista à parte */
  function recadoComAnexo(id) {
    const alvo = String(id || '');
    if (!alvo) return null;
    const achado = (recados || []).find((r) => r && String(r.id) === alvo);
    return achado && achado.anexo ? achado : null;
  }

  /* A CARA DO ANEXO NA BOLHA. `encaixar` é respondido AQUI e viaja pro seam
     pronto: quem sabe se existe rota é a ponte (`rotaMontada()`), e a tela que
     tentasse adivinhar ofereceria "Encaixar na rota" pra quem não tem rota. */
  function anexoDoSeam(recado) {
    const a = recado && recado.anexo;
    if (!a) return undefined;
    return {
      id: String(recado.id),
      tipo: a.tipo === 'rota' ? 'rota' : 'parada',
      nome: esc(a.nome || ''),
      detalhe: esc(a.detalhe || ''),
      estado: a.estado === 'encaixada' || a.estado === 'negada' ? a.estado : 'pendente',
      encaixar: rotaMontada() ? 1 : 0,
    };
  }

  /** grava o desfecho no servidor e repinta o fio — o card vira selo sozinho */
  async function gravarDesfecho(id, acao) {
    await window.API.post(`/logistica/recados/${encodeURIComponent(String(id))}/anexo`, { acao });
    await carregarRecados();
  }

  /* ── ENCAIXAR ────────────────────────────────────────────────────────────
     🔴 A ORDEM É: CRIAR → ENCAIXAR → MARCAR. Marcar antes de criar deixaria o
     card dizendo "Encaixada" com a rota intacta se a rede caísse no meio — a
     mentira mais cara que este card pode contar. E o marcar é o ÚLTIMO porque
     ele é a única coisa desta corrente que dá pra repetir sem estrago (o
     servidor é idempotente); se ele falhar, a parada está lá e o próximo toque
     conserta o selo. */
  async function encaixarParada(recado) {
    const a = recado.anexo;
    const contaId = String(a.contaId || '');
    if (!contaId) throw new Error('Este recado não diz qual cliente.');

    /* A mesma porta não entra 2x na rota do dia — mesmo freio do
       `rapidaConfirmar`. Aqui ele também FECHA o card: a parada já está na
       rota, então o estado honesto é "encaixada", não "pendente pra sempre". */
    if (paradaAbertaDaConta(contaId)) {
      await gravarDesfecho(recado.id, 'encaixar');
      return { ja: true, anterior: null };
    }
    const entrega = await window.API.post('/logistica/entregas', {
      customerProfileId: contaId,
      quantidade: 1,
      scheduledAt: `${hojeISO()}T12:00:00.000Z`,
      // 🔴 Sem `paraMinhaRota` a entrega nasce órfã e o Iniciar recusa o dia
      // INTEIRO ("atribua as entregas a exatamente um motorista").
      paraMinhaRota: true,
    });
    // A rota é relida ANTES do encaixe: é dela que sai a lista de abertas em
    // que a parada nova vai entrar.
    await carregarRota();
    const novoId = entrega && entrega.id ? String(entrega.id) : '';
    let encaixe = { aplicado: false, anterior: null };
    if (novoId) encaixe = await encaixarAvulsa(novoId);
    await carregarRota();
    await gravarDesfecho(recado.id, 'encaixar');
    return { ja: false, anterior: encaixe.anterior };
  }

  async function encaixarRota(recado) {
    const a = recado.anexo;
    const modeloId = String(a.rotaModeloId || '');
    if (!modeloId) throw new Error('Este recado não diz qual rota.');
    // O MESMO verbo do "Usar esta rota hoje?" — ele materializa as entregas do
    // modelo no dia de hoje. Nada de endpoint novo.
    await window.API.post(`/logistica/rota-modelos/${encodeURIComponent(modeloId)}/gerar`, {
      date: diaOperacional(),
    });
    await carregarRota();
    /* A ORDEM É A SEGUNDA METADE DO VERBO — e falhar aqui não desfaz nada: as
       paradas existem. O recibo muda de tom em vez de mentir (mesma disciplina
       do `rapidaAdicionarEscolhidos`). */
    let ordenou = true;
    try {
      await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...origemGps() });
    } catch (_) { ordenou = false; }
    await carregarRota();
    await gravarDesfecho(recado.id, 'encaixar');
    return { ordenou };
  }

  /**
   * O toque em "Encaixar na rota".
   *
   * `aguardeNoToque` é a MESMA disciplina do pé da Montagem: a classe entra no
   * botão vivo ainda no quadro do toque (recibo imediato, cromo direto no nó) e
   * a trava é variável da ponte, porque o repinte do meio do fluxo troca o nó e
   * nó novo nasce sem classe. Sem isso, encaixar — que é rede em 4 etapas —
   * fica segundos sem resposta e o dedo toca de novo.
   */
  function encaixarAnexo(id, alvo) {
    const recado = recadoComAnexo(id);
    if (!recado || recado.anexo.estado !== 'pendente') return;
    if (!rotaMontada()) {
      return window.portao({
        tom: 'info', ico: 'route', titulo: 'Sem rota montada',
        sub: 'Monte a rota de hoje e o encaixe volta a aparecer.',
        acoes: [['Fechar', 'principal', true]],
      });
    }
    aguardeNoToque(alvo, () => comTrava(async () => {
      const ehRota = recado.anexo.tipo === 'rota';
      let saida;
      try { saida = ehRota ? await encaixarRota(recado) : await encaixarParada(recado); }
      catch (e) { return avisoErro(e); }
      const nome = recado.anexo.nome || 'A parada';
      window.portao({
        tom: 'ok', ico: 'check', titulo: ehRota ? 'Rota encaixada' : 'Parada encaixada',
        sub: ehRota
          ? (saida.ordenou ? 'A ordem já está montada.' : 'Toque em "Montar rota" pra achar a ordem.')
          : saida.ja ? `${esc(nome)} já estava na rota de hoje.`
            : saida.anterior ? `Entra depois de ${esc(saida.anterior)}.`
              : 'Entra como primeira parada.',
        acoes: [['Fechar', 'principal', true]],
      });
    }));
  }

  /* ── ANALISAR ────────────────────────────────────────────────────────────
     Não decide nada: leva o dedo pra Montagem com o alvo ACESO.

     🔴 O DESTAQUE É CROMO DIRETO NO NÓ, não campo de seam — mesma escolha do
     `aguardeNoToque`. Ele é um "olha aqui" do momento da chegada, não um
     estado: pendurá-lo no seam obrigaria alguém a lembrar de apagá-lo, e marca
     que ninguém apaga é a próxima confirmação decorativa.

     🔴 E ELE SÓ NASCE DEPOIS QUE A TELA PAROU DE SE PINTAR. `ir('montagem')`
     dispara um `encherMontagem()` que termina DEPOIS; quando termina, o
     `usarDados` repinta e leva a camada inteira embora — com o destaque dentro.
     É a mesma receita do `voltarDaAvulsa`: navega, ESPERA o dado, e só então
     marca. */
  async function idsParaDestacar(recado) {
    const a = recado.anexo;
    if (a.tipo === 'parada') return a.contaId ? [String(a.contaId)] : [];
    const modeloId = String(a.rotaModeloId || '');
    if (!modeloId) return [];
    // O catálogo de rotas salvas já é lido pelo app; só o buscamos quando ele
    // ainda não estiver na memória deste ciclo.
    if (!MODELOS.has(modeloId)) {
      try { await carregarSalvas(); } catch (_) { return []; }
    }
    const modelo = MODELOS.get(modeloId);
    const paradas = modelo && Array.isArray(modelo.paradas) ? modelo.paradas : [];
    return paradas.map((p) => String(p && p.customerProfileId || '')).filter(Boolean);
  }

  function acenderNaMontagem(ids) {
    if (!ids.length) return 0;
    let achados = 0;
    let primeiro = null;
    ids.forEach((id) => {
      const no = naCamada(`.stop[data-cliente="${id}"]`);
      if (!no) return;
      no.classList.add('destaque');
      if (!primeiro) primeiro = no;
      achados += 1;
    });
    // Rolar até o PRIMEIRO alvo: acender uma linha fora da tela é acender nada.
    if (primeiro && primeiro.scrollIntoView) {
      try { primeiro.scrollIntoView({ block: 'center' }); } catch (_) { /* sem suporte: a classe basta */ }
    }
    return achados;
  }

  function analisarAnexo(id) {
    const recado = recadoComAnexo(id);
    if (!recado) return;
    void comTrava(async () => {
      const ids = await idsParaDestacar(recado);
      window.ir('montagem');
      try { await encherMontagem(); } catch (_) { /* a tela vale mais que a marca */ }
      const acesos = acenderNaMontagem(ids);
      /* 🔴 "NÃO ACHEI" NÃO PODE SAIR CALADO. O cliente anexado pode não estar no
         dia — e aí a tela abre sem nada aceso, que a pessoa lê como app quebrado.
         Uma frase, e o card continua no chat esperando a decisão. */
      if (!acesos && ids.length) {
        window.portao({
          tom: 'info', ico: 'map',
          titulo: recado.anexo.tipo === 'rota' ? 'Essa rota não está no seu dia' : 'Essa parada não está no seu dia',
          sub: 'Volte ao chat e use "Encaixar na rota".',
          acoes: [['Fechar', 'principal', true]],
        });
      }
    });
  }

  /* ── NEGAR ───────────────────────────────────────────────────────────────
     Duas saídas e um só desfecho no servidor. A pergunta do motivo é uma
     CORTESIA, não um pedágio: "Não" fecha e pronto — obrigar a justificar quem
     está dirigindo é o tipo de trava que faz a pessoa parar de usar a porta.

     🔴 O DESFECHO É GRAVADO NOS DOIS CAMINHOS, ANTES do campo de texto. Deixar
     pro envio da mensagem faria "negar e não escrever nada" virar um card
     pendente pra sempre — exatamente o limbo que o dono mandou não existir. */
  function negarAnexo(id) {
    const recado = recadoComAnexo(id);
    if (!recado || recado.anexo.estado !== 'pendente' || typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'chat', titulo: 'Enviar motivo?',
      sub: `${esc(recado.anexo.nome || 'O que a Central mandou')} não entra na sua rota.`,
      acoes: [['Não', ''], ['Sim', 'principal']], classe: 'duas',
    });
    const negar = (comMotivo) => comTrava(async () => {
      try { await gravarDesfecho(recado.id, 'negar'); }
      catch (e) { return avisoErro(e); }
      if (!comMotivo) return;
      /* "Sim" é o dedo indo pro campo — o texto é dele. A mensagem que ele
         escrever sai ligada a ESTE recado (ver `recadoIdDoMotivo`), então a
         central lê a negativa embaixo do que ela mesma mandou. */
      motivoDoAnexo = String(recado.id);
      const el = naCamada('[data-campo="recado-texto"]');
      if (el) el.focus();
    });
    const sim = naCamada('.portao-wrap .principal');
    if (sim) sim.addEventListener('click', () => { negar(true); }, { once: true });
    /* O "Não" também GRAVA: o dono foi literal — "nos dois casos de negar, a
       rota recebida é limpa". Fechar sem gravar deixaria o card pendente. */
    const nao = naCamada('.portao-wrap .acoes button:not(.principal)');
    if (nao) nao.addEventListener('click', () => { negar(false); }, { once: true });
  }

