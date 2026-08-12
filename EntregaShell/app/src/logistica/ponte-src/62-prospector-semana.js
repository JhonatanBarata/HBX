  /* ------------------------------------------------------------------------
     7b-bis. A ESCOLHA DA SEMANA (PROSPECTOR v2, 12/08 — decisão do dono).

     🔴 O QUE MUDOU NO PRODUTO. O prospector nascia ligado pra empresa inteira e
     acendia o que a cesta achasse. Agora ele nasce DESLIGADO pra todo mundo: só
     acorda quando a PESSOA aciona e diz que TIPO de empresa interessa a ela
     NESTA SEMANA. Sem escolha, o servidor nem manda a chave `prospector` — a rua
     fica sem prédio nenhum, que é o estado certo de quem não pediu nada.

     🔴 DUAS PORTAS, E SÓ ELAS:
       · GET  /logistica/prospector/semana  → { tipo, rotulo, semana, tipos[] }
       · POST /logistica/prospector/semana  → { tipo } | { tipo:null } (desligar)
     A CURADORIA (quais tipos existem) mora no SERVIDOR. A tela NÃO tem uma
     segunda cópia da lista: é a mesma lei da cesta de CNAE — duas listas
     escritas à mão divergem no primeiro ajuste, e aí o chip diz "Padarias" e o
     servidor procura outra coisa.

     🔴 A ESCOLHA É DA PESSOA, NÃO DA EMPRESA. O servidor lê pelo ator do JWT;
     aqui não viaja id nenhum de usuário. Dois motoristas da mesma distribuidora
     escolhem coisas diferentes na mesma segunda-feira.

     🔴 SEM OTIMISMO NA TELA. O chip só fica marcado depois que o POST voltou —
     mesma régua das 6 chaves dos Ajustes (§ `virarChave`). Marcar antes seria a
     tela prometendo uma caçada que o servidor pode ter recusado, e a pessoa
     dirigiria o dia inteiro esperando prédio verde que nunca vem.
     ------------------------------------------------------------------------ */

  /* O que o servidor respondeu por último. Guardado aqui (e não só no seam) por
     UM motivo: a linha dos Ajustes precisa do RÓTULO, e ela é repintada pelo
     `carregarAjustes`, que roda em outra hora e por outro caminho. Sem esta
     memória, a linha voltaria a dizer "Escolher o que procurar" toda vez que os
     Ajustes recarregassem — a tela esquecendo o que a pessoa acabou de decidir. */
  let escolhaDaSemana = null;

  /** O rótulo pra linha dos Ajustes ('' = ninguém escolheu / ainda não sei). */
  function rotuloDoProspector() {
    return (escolhaDaSemana && escolhaDaSemana.rotulo) || '';
  }

  /* Escreve o seam da folha. `tipos` vem SEMPRE do servidor; lista vazia é um
     estado honesto (a folha diz que não carregou e oferece a saída), nunca uma
     lista inventada aqui. */
  function pintarFolhaDoProspector() {
    if (typeof window.usarDados !== 'function') return;
    const e = escolhaDaSemana || {};
    window.usarDados('prospectortipo', {
      tipo: e.tipo || '',
      tipos: Array.isArray(e.tipos) ? e.tipos : [],
    });
  }

  /**
   * Busca a escolha e a curadoria. Best-effort COM VOZ: falhou, a folha abre
   * sem tipo nenhum e diz isso — nunca trava a tela de Ajustes por causa de uma
   * porta de preferência.
   */
  async function carregarProspectorSemana() {
    if (!temPonte() || !window.API || typeof window.API.get !== 'function') return null;
    try {
      const r = await window.API.get('/logistica/prospector/semana');
      if (r && typeof r === 'object') {
        escolhaDaSemana = {
          tipo: r.tipo || '',
          rotulo: r.rotulo || '',
          semana: r.semana || '',
          tipos: Array.isArray(r.tipos) ? r.tipos : [],
        };
      }
    } catch (erro) {
      /* 🔴 NÃO ZERA A MEMÓRIA NO ERRO. "Não consegui perguntar" ≠ "a resposta é
         não" (memória: start-process-nao-devolve-exitcode). Apagar aqui faria a
         linha dos Ajustes dizer "Escolher o que procurar" pra quem já escolheu,
         só porque o Wi-Fi caiu no meio do estacionamento. */
      try { console.log(`[prospector] semana: leitura falhou (${String((erro && erro.message) || erro)})`); } catch (_) {}
    }
    pintarFolhaDoProspector();
    return escolhaDaSemana;
  }

  /** Abre a folha JÁ COM DADO — tela de escolha que nasce vazia é tela que mente. */
  async function abrirFolhaDoProspector() {
    await carregarProspectorSemana();
    if (typeof window.ir === 'function') window.ir('prospectortipo');
  }

  /**
   * Grava a escolha (ou desliga, com `slug` vazio) e repinta as duas telas que
   * dependem dela: a folha (o chip marcado) e o Avançado (o rótulo da linha).
   *
   * DEPOIS DE GRAVAR, A RUA MUDA SOZINHA: o próximo `GET /logistica/rota` já vem
   * com `escolhida` recomputado contra a escolha nova, e o `aplicarProspector`
   * repinta os prédios. Nada aqui mexe em cor de prédio — a cor é do servidor.
   */
  async function escolherTipoProspector(slug) {
    if (!temPonte() || !window.API || typeof window.API.post !== 'function') return;
    const alvo = String(slug || '');
    // `comTrava` é a MESMA da `virarChave`: dedo rápido em dois chips não pode
    // virar duas gravações correndo, com a última resposta a chegar vencendo.
    await comTrava(async () => {
      let r;
      /* Botão que não faz nada e não avisa é pior que botão que dá erro. No erro
         a tela NÃO muda (sem otimismo) e a pessoa lê o que houve — mesmo aviso
         das 6 chaves de cima (`avisoErro`). */
      try { r = await window.API.post('/logistica/prospector/semana', { tipo: alvo || null }); }
      catch (e) { return avisoErro(e); }
      escolhaDaSemana = {
        tipo: (r && r.tipo) || '',
        rotulo: (r && r.rotulo) || '',
        semana: (r && r.semana) || '',
        // A lista de tipos não muda no POST; se ela não vier, fica a que já veio
        // do GET (perder a curadoria deixaria a folha vazia depois de um acerto).
        tipos: (r && Array.isArray(r.tipos) && r.tipos.length)
          ? r.tipos
          : ((escolhaDaSemana && escolhaDaSemana.tipos) || []),
      };
      pintarFolhaDoProspector();
      // A linha do Avançado mostra o rótulo — ela tem que saber na mesma hora.
      await carregarAjustes();
      /* 🔴 E A RUA TEM QUE MUDAR JUNTO. A cor é do servidor: sem reler a rota, os
         prédios só trocariam de cor no próximo poll — e quem acabou de escolher
         "Padarias" merece ver a rua responder ao toque, não daqui a 5 s. Mesma
         razão do `carregarRota()` no fim da `virarChave`. */
      await carregarRota();
    });
  }

  /** "Desligar esta semana" — a MESMA porta, sem tipo. Ausência é o desligado. */
  function desligarProspectorSemana() {
    return escolherTipoProspector('');
  }
