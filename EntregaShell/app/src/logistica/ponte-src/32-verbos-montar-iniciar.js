  /* ------------------------------------------------------------------------
     MONTAR + INICIAR — separado de 30-verbos-rota.js em 15/08 (teto de 1000
     linhas/fonte, ordem do dono 10/08). Fatia contigua do MESMO IIFE — a
     costura (scripts/ponte-costurar.js) e concatenacao pura, entao `comTrava`,
     `ocupado`, `avisoErro`, `origemGps`, `ordemDeGente`, `idsDaPrevia`,
     `materializarRascunho`/`materializarDia`/`previaViraRascunho` e todo o
     resto de 30-verbos-rota.js continuam no MESMO escopo lexico — nada aqui
     precisa de import/export, so a ORDEM DO NOME (32 depois de 30) importa.
     ------------------------------------------------------------------------ */
  async function montarRota(alvo) {
    await comTrava(async () => {
      /* 🔴 O VÉU NASCE ANTES DO 1º PEDIDO (15/08 — espelho do `iniciarRota`,
         13/08, nota lá embaixo): o 1º recibo visual só saía DEPOIS do
         `materializarRascunho` (rede), rota grande parecia travada. Acende
         SÍNCRONO. `montando`/`etapa` abaixo continuam sendo quem AVANÇA o véu
         (8→38→66→88%); a 1ª chamada deles vira NO-OP pelo freio de
         dado-igual do `usarDados`. */
      try {
        window.usarDados('rota', {
          montando: 1,
          etapaMontar: 'Organizando as paradas…',
          etapaMontarPct: 8,
        });
      } catch (_) { /* sem seam: a rota continua funcionando */ }
      // Cada tentativa começa com a memória limpa: avisos de uma volta
      // anterior não podem vazar pro portão de erro desta (ver `avisoErro`).
      ultimosAvisosMaterialize = [];
      // O dia escolhido no chip entra como escolha de GENTE (ver
      // `previaViraRascunho`): a lista da tela vira rascunho antes de tudo.
      const outroDia = diaDeOutroDia();
      if (outroDia) previaViraRascunho();
      // O rascunho vira parada ANTES de planejar: planejar ordena o que EXISTE,
      // e o que só está no aparelho não existe pro servidor.
      const mat = await materializarRascunho();
      // 🔴 TOQUE MUDO É DEFEITO — mas o recibo é do BOTÃO, não da tela inteira.
      // Montar são 3 idas ao servidor (planejar, conferir, recarregar) e passa
      // de 2 s. O sinal disto era `estadoRota='carregando'`, e ele mentia nas
      // duas telas: na Rota trocava tudo pelo esqueleto — que vai SEM rodapé,
      // então o botão sumia no meio do próprio toque; na Montagem não mudava
      // nada (ela não lê `estadoRota`), só repintava. Agora quem responde ao
      // dedo é o botão tocado, no lugar dele: "Montando…", sem aceitar toque.
      const montando = (v) => {
        try { window.usarDados('rota', { montando: v }); } catch (_) { /* sem seam */ }
      };
      /* a ETAPA do véu de montar (11/08 — dono: "coloque um carregando aí,
         altíssima qualidade"): o texto é o passo REAL do trabalho, não teatro
         de relógio. Escreve DIRETO no nó (regra do `data-vivo` do velocímetro
         — o que anda rápido não repinta a tela) e espelha no seam sem
         repintar, pro repinte que chegar no meio renascer com a etapa certa. */
      const etapa = (pct, texto) => {
        try {
          if (typeof DADOS !== 'undefined' && DADOS.rota) Object.assign(DADOS.rota, { etapaMontar: texto, etapaMontarPct: pct });
          const rotulo = naCamada('[data-etapa-montar]');
          if (rotulo && rotulo.textContent !== texto) rotulo.textContent = texto;
          const barra = naCamada('[data-barra-montar]');
          if (barra) barra.style.width = pct + '%';
        } catch (_) { /* o véu é enfeite; a rota não depende dele */ }
      };
      montando(1);
      etapa(8, 'Organizando as paradas…');
      const devolverEstado = () => montando(0);

      /* 🔴 A ROTA SAI COM O QUE ESTÁ NA TELA — o RECORTE (`deliveryIds`) é a
         mesma lei da rota avulsa (10/08): com um dia de outra data na tela, a
         agenda de HOJE que o cron já materializou não pode ser varrida pra
         dentro da rota que o dono acabou de escolher. Ele lê a tela, e a tela
         mostra a quarta-feira.
         O recorte é medido DEPOIS do `materializarRascunho` de propósito: é lá
         que as entregas de hoje nascem, e `idsDaPrevia` casa a lista da tela
         com elas. */
      const recorte = outroDia ? { deliveryIds: idsDaPrevia() || [] } : {};
      let plano;
      try {
        // A agenda do dia vira entrega ANTES de ordenar (ver `materializarDia`).
        // Nunca na avulsa nem com o dia de outra data: nos dois a agenda de hoje
        // ficou de fora de propósito — trazê-la de volta é encher a rota com
        // gente que a tela não está mostrando.
        if (montarDia !== -1 && !outroDia) await materializarDia();
        etapa(38, 'Calculando o melhor trajeto…');
        plano = await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...recorte, ...origemGps() });
      } catch (e) { devolverEstado(); return avisoErro(e, { repetir: () => montarRota() }); }
      const paradas = Array.isArray(plano && plano.stops) ? plano.stops
        : (Array.isArray(plano && plano.items) ? plano.items
          : (Array.isArray(plano && plano.paradas) ? plano.paradas : []));

      // semáforo dos endereços: só ATRASA a montagem se o servidor acusar algo.
      // Confere HOJE, sempre: o dia da rota é hoje mesmo quando a gente dela
      // veio de outra data (é a lei do chip — ver `diaDeOutroDia`).
      let conf = null;
      try {
        etapa(66, 'Conferindo os endereços…');
        conf = await window.API.post('/logistica/rota/conferir', { date: hojeISO(), ...origemGps() });
      } catch (_) { /* aviso é enfeite, não portão */ }
      const comAviso = conf && Array.isArray(conf.items)
        ? conf.items.filter((i) => Array.isArray(i.motivosVisiveis) && i.motivosVisiveis.length).length
        : 0;

      /* 🔴 O CHIP FICA ACESO, E ISSO É O CONSERTO (10/08). Aqui a escolha de dia
         era APAGADA (`montarDia = -1`) porque o dia tinha sido montado noutra
         data — a lista de hoje era outra coisa, e o chip aceso mentiria.
         Agora a lista da tela É a rota que acabou de nascer: apagar o dia
         trocaria a lista debaixo do dedo dele, e o pé diria "Iniciar" sobre uma
         lista que não é a que ele montou. Quem solta o dia continua sendo o
         gesto de soltar (`soltarDia`) e o Iniciar, quando a rota já saiu. */
      // 🔴 SÓ ABRE A MONTAGEM SE A ROTA ENTROU. Com o `/logistica/rota` no chão
      // o `carregarRota` volta no catch antes de escrever no seam, e a tela de
      // montagem abria com as 6 paradas do desenho e "R$ 336,00" — dinheiro de
      // exemplo numa tela de decisão. Falhou, avisa e fica onde está.
      etapa(88, 'Trazendo a rota…');
      if (!(await carregarRota())) {
        devolverEstado();
        return avisoErro(new Error('Não consegui montar agora. Tente de novo.'));
      }
      /* 🔴 O ARRASTO E O ESPAÇO SOBREVIVEM AO MONTAR. Sem esta linha o motorista
         arrastava, mandava montar, e o otimizador devolvia a ordem DELE por
         cima — o gesto virava enfeite. Em modo Distância isto nem roda: lá a
         sequência é do servidor, de propósito. */
      if (ordemDeGente()) await cravarOrdemDaTela();
      /* 🔴 ROTA NOVA REPETE A CENA DA ENTRADA — ordem do dono: *"este efeito se
         repete sempre que uma rota é criada"*. Aqui é só o PEDIDO: quem monta
         está na tela de Montagem, e a cena acontece quando o mapa voltar pra
         frente (ver `atenderCena` no transplante). Cena tocada num palco fora da
         tela é cena que ninguém vê. */
      pedirCena('rota');
      devolverEstado();          // o "Montando…" sai com o dado já na tela
      /* 🔴 UM STATUS SÓ, NA TELA DO MAPA (dono, 11/08: "esse iniciar rota eu
         quero aqui [no mapa], quero um status só, mesma tela") — reverte o
         "Não navega" de 10/08, por ordem dele. Montar POUSA na Rota: a rota
         verde no mapa com o "Iniciar" único, e a cena das ruas pedida acima
         toca no pouso. Só navega quem AINDA está na Montagem — o cabeçalho e
         as abas ficam vivos por cima do véu, e o fim do montar não teleporta
         quem já foi pra outra tela. Os portões abaixo vêm DEPOIS do `ir` de
         propósito: troca de tela fecha portão; nascendo na camada nova eles
         sobrevivem à transição e os repintes os remontam. */
      if (telaAtual() === 'montagem' && typeof window.ir === 'function') window.ir('rota');
      /* Quem não conseguiu virar parada é dito por NOME, e antes do semáforo de
         endereço: "o Alfredo não entrou" vale mais pra quem vai sair pra rua do
         que "2 endereços com aviso". Nunca "não deu certo" — o resto entrou. */
      if (mat.falharam.length && typeof window.portao === 'function') {
        return window.portao({
          tom: 'alerta', ico: 'alert', titulo: 'Rota montada sem todos',
          sub: `Não consegui adicionar: ${mat.falharam.join(', ')}.`,
          acoes: [['Entendi', 'principal']],
        });
      }
      if (comAviso && typeof window.usarDados === 'function') {
        window.usarDados('montagem', { iniciarSub: `${comAviso} com aviso` });
      }
      if (comAviso && typeof window.portao === 'function') {
        window.portao({
          tom: 'alerta', ico: 'gps', titulo: `${comAviso} ${comAviso === 1 ? 'endereço com aviso' : 'endereços com aviso'}`,
          // "Entendi", não "Ver a rota": desde 11/08 o montar já pousa NELA
          sub: 'Dá pra sair assim, mas confira antes.', acoes: [['Entendi', 'principal']],
        });
      }
    }, alvo);
  }

  /* ------------------------------------------------------------------------
     🔴 A INTENÇÃO VIAJA COMO ARGUMENTO — a porta declara, o verbo obedece
     (10/08). Este era o defeito medido em produção hoje: `iniciarRota` decidia
     se a rota era AVULSA lendo `montarDia`, que é estado da tela MONTAGEM. Só
     que a Montagem abre SEM dia (`montarDia = -1` é o default desde 10/08), e
     esse -1 fica de pé mesmo pra quem nunca abriu a Montagem. Resultado: o
     Iniciar do MAPA, com 51 paradas agendadas no servidor, morria dizendo "A
     rota avulsa está vazia" — com o dia CHEIO do outro lado do fio. E quando a
     Montagem tinha sido aberta antes, era pior: o Iniciar do mapa saía
     RECORTADO pela prévia dela, calado.

     Agora cada porta diz o que quer, e o verbo NUNCA mais lê `montarDia`:

       · `{ escopo: 'dia' }`      — o dia inteiro (o Iniciar do dock do MAPA).
                                    Materializa a agenda, planeja tudo, inicia.
       · `{ escopo: 'avulsa' }`   — só o que está na tela (chip do dia apagado).
       · `{ escopo: 'outroDia' }` — a gente de outra data entregando HOJE.

     Estado de tela morre com a tela: quem lê a prévia e o chip é a MONTAGEM, no
     instante do toque (ver o mapa de ações). Com esta lei a regressão de hoje
     é impossível de escrever.
     ------------------------------------------------------------------------ */
  /** iniciar: mostra o custo REAL e só então cobra. */
  async function iniciarRota(intencao, alvo) {
    const escopo = String((intencao && intencao.escopo) || 'dia');
    await comTrava(async () => {
      /* 🔴 O VÉU NASCE ANTES DO PRIMEIRO PEDIDO (13/08). Rota grande pode
         materializar, planejar, consultar custo, iniciar e reler antes de
         abrir o mapa. O botão já acusava o toque, mas a tela inteira parecia
         congelada. Reutilizamos o mesmo véu da montagem e só mudamos a etapa
         REAL; nenhuma regra de rota, ordem ou cobrança mora aqui. */
      let esperaInicioAtiva = true;
      const fecharEsperaInicio = () => {
        if (!esperaInicioAtiva) return;
        esperaInicioAtiva = false;
        try { window.usarDados('rota', { montando: 0 }); } catch (_) { /* sem seam */ }
      };
      const etapaInicio = (pct, texto) => {
        if (!esperaInicioAtiva) return;
        try {
          if (typeof DADOS !== 'undefined' && DADOS.rota) Object.assign(DADOS.rota, { etapaMontar: texto, etapaMontarPct: pct });
          const rotulo = naCamada('[data-etapa-montar]');
          if (rotulo && rotulo.textContent !== texto) rotulo.textContent = texto;
          const barra = naCamada('[data-barra-montar]');
          if (barra) barra.style.width = pct + '%';
        } catch (_) { /* o véu é enfeite; iniciar não depende dele */ }
      };
      const falharInicio = (e, contexto) => {
        fecharEsperaInicio();
        return avisoErro(e, contexto);
      };
      try {
        window.usarDados('rota', {
          montando: 1,
          etapaMontar: 'Preparando a rota…',
          etapaMontarPct: 8,
        });
      } catch (_) { /* sem seam: a rota continua funcionando */ }
      try {
      // Mesma memória limpa do montar: avisos de uma tentativa anterior não
      // podem vazar pro portão de erro desta (ver `avisoErro`).
      ultimosAvisosMaterialize = [];
      /* 🔴 UMA TELA SÓ ⇒ O INICIAR TAMBÉM MONTA (dono: "MONTAR ROTA → MONTAGEM
         DE ROTA (BOTÃO INICIAR)"). O 2º "Montar rota" morreu, então o dia pode
         chegar aqui sem ordem gravada — e o servidor responderia "monte a rota
         antes de iniciar" no toque que devia sair pra rua. Planejar de novo o
         mesmo conjunto não cria parada nem debita. */
      // O dia de outra data vira gente de HOJE antes de tudo — o mesmo gesto do
      // montar (ver `previaViraRascunho`). Quem já é parada aberta é pulado lá,
      // então tocar Iniciar numa lista já montada não cria nada de novo.
      const outroDia = escopo === 'outroDia';
      if (outroDia) previaViraRascunho();
      // O rascunho vira parada ANTES de tudo: é o dedo mandando gravar, e é
      // daqui que sai o conjunto que o planejar vai ordenar e o servidor cobrar.
      etapaInicio(22, 'Organizando as paradas…');
      const mat = await materializarRascunho();
      /* 🔴 A ROTA SAI SÓ COM O QUE ESTÁ NA TELA (dono, 10/08: o chip do dia
         desligado É a rota avulsa; e o chip de OUTRO dia é a gente daquele dia
         entregando hoje). Sem o recorte, o planejar varria as entregas da
         agenda — que o cron já criou no servidor — pra dentro da rota que ele
         acabou de escolher na tela. `deliveryIds` já existe nas três portas
         (planejar, custo-preview, iniciar); aqui ele carrega a tela ao pé da
         letra.
         🔴 QUEM DIZ QUE É AVULSA É A PORTA, nunca o `montarDia` (ver o bloco
         da INTENÇÃO acima): o escopo 'dia' sai INTEIRO, sem recorte nenhum. */
      const avulsa = escopo === 'avulsa';
      const recortada = avulsa || outroDia;
      const idsAvulsa = recortada ? idsDaPrevia() : null;
      if (avulsa && (!idsAvulsa || !idsAvulsa.length)) {
        return falharInicio(new Error('A rota avulsa está vazia. Adicione uma parada antes de iniciar.'));
      }
      const recorte = idsAvulsa && idsAvulsa.length ? { deliveryIds: idsAvulsa } : {};
      if (estadoRota === 'montar' || !ENTREGAS.size || recortada) {
        try {
          // O MESMO remédio do montar: sem materializar, um dia cancelado em
          // massa batia aqui e morria no "Nenhuma entrega aberta neste dia".
          // Na avulsa e no dia de outra data NÃO: materializar traria a agenda
          // de hoje de volta pra tela que mostra outra gente.
          if (!recortada) await materializarDia();
          etapaInicio(42, 'Calculando o melhor trajeto…');
          await window.API.post('/logistica/rota/planejar', { date: hojeISO(), ...recorte, ...origemGps() });
        } catch (e) { return falharInicio(e, { repetir: () => iniciarRota(intencao) }); }
        if (!(await carregarRota())) return falharInicio(new Error('Não consegui montar agora. Tente de novo.'));
        if (ordemDeGente()) await cravarOrdemDaTela();
      }
      let custo = null;
      // a data vai JUNTO — sem ela o servidor cobra pelo dia UTC dele (ver a
      // nota no `carregarRota`): das 21h em diante o portão nem abria. E na
      // avulsa o recorte viaja aqui também: o preço tem que ser DESSA rota.
      try {
        etapaInicio(62, 'Conferindo a saída…');
        const qIds = idsAvulsa && idsAvulsa.length ? `&deliveryIds=${encodeURIComponent(idsAvulsa.join(','))}` : '';
        custo = await window.API.get(`/logistica/rota/custo-preview?date=${encodeURIComponent(hojeISO())}${qIds}`);
      } catch (e) { return falharInicio(e, { repetir: () => iniciarRota(intencao) }); }
      // 🔴 NOME DE CAMPO DE DINHEIRO NÃO SE CHUTA. A 1ª versão adivinhou
      // (`custo`/`total`/`creditos`) e a tela mostrou "Debita 0" com o servidor
      // dizendo 4,8 — mentira com cara de app pronto. Estes são os nomes
      // MEDIDOS na resposta, e quem decide se pode sair é o servidor
      // (`saldoCobre`), não uma conta minha na tela.
      const debita = Number(custo && custo.creditosAIniciar);
      const saldo = Number(custo && custo.saldoAtual);
      const temSaldo = custo && typeof custo.saldoCobre === 'boolean'
        ? custo.saldoCobre
        : (isFinite(saldo) && isFinite(debita) ? saldo >= debita : true);
      const num = (v) => (isFinite(v) ? String(v).replace('.', ',') : '');
      /* 🔴 SALDO QUE COBRE NÃO PERGUNTA NADA (dono, 09/08: "apertei iniciar, não
         tem q perguntar nada já inicia").
         O portão "Iniciar a rota? · Debita X · você tem Y" nasceu pra pôr o
         preço na frente da decisão — e ele continua existindo exatamente onde
         DECIDE alguma coisa: sem saldo, é a trava que impede a saída, e trava
         bloqueia por natureza. Com saldo, ele não decidia nada: era um "sim" a
         mais entre o dedo e a rua, na única tela em que o motorista já tinha
         dito o que queria. Um gesto, uma reação.
         O preço não sumiu — ele virou RECIBO, depois, sem travar ninguém (ver o
         `avisar` no fim). E o custo-preview continua sendo consultado, porque é
         ele quem diz se cobre: quem decide se pode sair é o servidor. */
      if (!temSaldo) {
        fecharEsperaInicio();
        return window.portao({
          tom: 'trava', ico: 'card', titulo: 'Créditos insuficientes',
          sub: isFinite(saldo)
            ? `Debita ${num(debita)} · você tem ${num(saldo)}`
            : `Debita ${num(debita)}`,
          acoes: [['Fechar', '']],
        });
      }
      try {
        // 🔴 A RESPOSTA DO INICIAR TEM DADO DENTRO. Ela era descartada, e
        // com ela iam embora as empresas do corredor (`prospector`) que o
        // servidor acabou de embarcar pro dia. Ver `aplicarProspector`.
            /* 🔴 AQUI O OTIMIZADOR TEM A ÚLTIMA PALAVRA — de propósito. O
               iniciar "re-planeja a partir da origem atual": é o único momento
               em que o servidor sabe de ONDE o motorista está saindo de fato
               (montou na base às 7h, saiu às 8h de outro lugar). Por isso NÃO
               vai `ordemManual` no caso comum.
               A exceção é a ordem de gente: arrasto ou espaço escolhido. Aí a
               sequência viaja junto, senão o toque de sair desfaria a decisão
               dele — que foi o defeito que este trecho já teve. */
        const minha = ordemDeGente() ? idsNaOrdemDaTela() : null;
        etapaInicio(82, 'Iniciando a rota…');
        aplicarProspector(await window.API.post('/logistica/rota/iniciar', {
          date: hojeISO(), ...recorte, ...(minha ? { ordemManual: minha } : {}), ...origemGps(),
        }));
      } catch (e) {
        // 🔴 NUNCA MORRER CALADO (dono, §1.3): primeiro a verdade do
        // servidor — se a rota JÁ ESTÁ em andamento, a resposta certa é
        // levar o motorista pra ela, não um erro genérico.
        await carregarRota();
        if (estadoRota === 'rodando' || estadoRota === 'pausada') {
          // Já está em andamento? Cai direto NELA — a navegação, não uma tela
          // intermediária com mais um botão (a mesma lei do sucesso, abaixo).
          fecharEsperaInicio();
          if (typeof window.ir === 'function') window.ir('mapa');
          return;
        }
        return falharInicio(e, { repetir: () => iniciarRota(intencao) });
      }
      etapaInicio(94, 'Abrindo a navegação…');
      await carregarRota();
      // A escolha de dia morre no Iniciar: a rota (avulsa ou com a gente de
      // outra data) virou A rota em andamento, e a Montagem seguinte volta a
      // abrir sem dia — o estado em que ela nasce desde 10/08.
      // Só o escopo recortado chega aqui, e recortado só vem da MONTAGEM: é
      // limpeza da tela que mandou, nunca leitura de estado alheio (o dock do
      // mapa manda 'dia' e não encosta no chip de ninguém).
      if (recortada) { montarDia = -1; window.usarDados('montagem', { diaSel: -1 }); }
      /* 🔴 ROTA NOVA, RECIBO NOVO (12/08). A marca de "já mostrei o fim deste
         dia" (ver `irDepoisDoDesfecho`) é carimbada pelo DIA, e o mesmo dia
         pode ter uma 2ª leva — o servidor devolve `operationalEndedAt` pra
         null justamente pra isso. Sem apagar aqui, quem sai pra rua de novo
         terminaria a 2ª rota no mapa mudo, com o app achando que já tinha
         avisado. Quem abre a rota é quem limpa o fim dela. */
      try { window.HBX.cache.remove(`fim-visto:${hojeISO()}`); } catch (_) { /* sem cache: nada a limpar */ }
      /* 🔴 INICIAR É UM GESTO SÓ (dono, 10/08: "clico em iniciar, o botão muda
         para navegar NÃO QUERO — é iniciar de uma vez só, ou navegar de uma vez
         só"). Antes o toque deixava o motorista na tela Rota com o dock
         morfado pra "Navegar" — um segundo toque pra fazer o que ele acabou de
         mandar. Agora o Iniciar entra DIRETO na navegação (a mesma porta do
         botão Navegar: `ir('mapa')` cobra GPS na hora certa e toca a descida
         2D→3D). O "Sair" do 3D continua devolvendo pra Rota com o dock
         Navegar·Cancelar·Finalizar — sair de propósito é outro verbo. */
      fecharEsperaInicio();
      if (typeof window.ir === 'function') window.ir('mapa');
      /* 🔴 O RECIBO FALA DEPOIS QUE A TELA PAROU DE SE PINTAR (mesma armadilha
         que o portão da parada avulsa já pagou, 09/08). `avisar` monta na camada
         VIVA, e o `carregarRota` acima repinta: falar antes é falar pra uma
         camada que já morreu. Navega, espera o dado, e só então fala.
         🔴 DÉBITO ZERO NÃO VIRA AVISO NENHUM. Recibo de coisa que não aconteceu
         é ruído na cara de quem está saindo pra rua — e no modo free (ou com a
         franquia do plano cobrindo o dia) o débito é 0 de verdade.
         Quem falhou em virar parada é dito aqui também: o dono mandou iniciar e
         tem o direito de saber que saiu sem o Alfredo. */
      if (typeof window.avisar === 'function') {
        if (mat.falharam.length) {
          window.avisar({
            ico: 'alert', cls: 'alerta', titulo: 'Rota iniciada sem todos',
            sub: `Ficou de fora: ${mat.falharam.join(', ')}`,
          });
        } else if (isFinite(debita) && debita > 0) {
          window.avisar({ ico: 'card', cls: 'ok', titulo: 'Rota iniciada', sub: `Debitou ${num(debita)}` });
        }
      }
      } finally {
        fecharEsperaInicio();
      }
    }, alvo);
  }

  /* ------------------------------------------------------------------------
     🔴 CANCELAR É CANCELAR — UM VERBO SÓ (lei do dono, 29/07; regressão que a
     fusão trouxe de volta e ele pegou ao vivo em 09/08: "estou apertando
     Cancelar, eu clico em montar rota, os clientes voltam!!!").

     Eu tinha apontado este botão pro `rota/encerrar` — o verbo do "guarda o
     resto pra depois": ele devolve as entregas abertas VIVAS ('agendada'). E
     abrir a Montagem chama `rota/planejar`, que lê justamente as entregas
     ABERTAS do dia. Então o ciclo se fechava sozinho: cancelo → as entregas
     ficam vivas → monto → o planejador acha as mesmas → os clientes voltam. O
     botão nunca cancelou nada; ele DESMONTAVA.

     O verbo certo já existia inteiro do outro lado do fio, e até na allowlist
     do Kotlin: `POST /logistica/rota/limpar-dia`. Só faltava alguém chamar —
     o mesmo padrão de sempre desta fusão (a capacidade viva, o chamador morto
     junto com o `app.js`). Ele mata o que não foi feito ('cancelada'), não
     encosta no que já foi entregue, solta o motorista da entrega morta e —
     detalhe que só o `limpar-dia` faz — DESFAZ a ocorrência recorrente, isto é,
     devolve o `proximaData` do plano; sem isso o dia virava pedra (o FIX 25/07
     dele).

     Palavras do dono na lei: "eu bati a porra do caminhão, não vai ter entrega,
     limpa pendência". E a pergunta é a mesma em todo caminho destrutivo:
     "Tem certeza que deseja cancelar?" → Não / Sim. Sem parágrafo, sem 3º
     botão, sem resumo — por isso a legenda saiu (ela ainda dizia "voltam pra
     agenda", que era verdade do `encerrar` e vira MENTIRA aqui).

     `perigo` continua (09/08): o "Sim" é vermelho. Vestido do verde do
     "Iniciar", no mesmo lugar da tela, ele me fez encerrar a rota do dono três
     vezes sem querer — provado no log do servidor.
     ------------------------------------------------------------------------ */

  /* 🔴 CANCELOU? O APARELHO NÃO GUARDA CÓPIA (dono, 09/08: "cancelar tem q
     limpar toda a rota já carregada… fica limpinho para montar rota do zero").

     A rota carregada mora em SEIS lugares deste lado do fio, e o `carregarRota`
     só reescreve os dois primeiros — e só se a rede responder. Sem esta faxina
     o dono cancelava e ainda via: a lista da Montagem com os mesmos clientes
     (`previaCrua`/`PREVIA`, que a tela republica sem ir à rede), a folha de
     chegada de uma parada morta (`ENTREGAS`), e o "Salvar rota" oferecendo o
     roteiro que acabou de ser apagado (`PARADAS_SALVAR`).

     O `previaSeq` sobe junto porque a Montagem monta sozinha ao abrir: uma
     busca em VOO no instante do cancelamento voltaria depois e republicaria o
     dia cancelado por cima da tela limpa — resposta velha não escreve.

     E vem tudo ANTES do `carregarRota`: se a rede cair no meio, o servidor já
     cancelou e a tela TEM que estar limpa do mesmo jeito. Rota que sobrevive na
     tela depois do cancelar é a mesma mentira que esta seção existe pra matar. */
  function esquecerRotaCarregada() {
    esquecerTraco();
    // pedido de cena de "rota nova" não sobrevive à rota: cancelada a rota,
    // a cena dela morre junto (senão o próximo repinte a tocava por cima do
    // dia limpo — parente do pisca do cancelar)
    esquecerCenaPedida();
    /* 🔴 O CACHE TAMBÉM É "ROTA CARREGADA" (15/08). `chegada:<id>` sobrevive no
       APARELHO (`HBX.cache`) por parada, e remontar o dia com o MESMO id de
       entrega (servidor reusa) reabriria a folha achando que já chegou ali.
       Varre ANTES do `ENTREGAS.clear()` de baixo, que é quem sabe os ids.
       `fim-visto` some junto — mesmo carimbo que o Iniciar apaga (ver "ROTA
       NOVA, RECIBO NOVO"): cancelar também abre espaço pra uma 2ª leva do
       mesmo dia.
       🔴 `entrega-confirmar:<id>` NÃO ENTRA (correção 15/08, revisão
       adversarial): é a idempotencyKey do POST de confirmar — dinheiro — e só
       pode morrer no desfecho bem-sucedido (`confirmarEntrega`, D0). Apagá-la
       aqui deixaria um retry gerar uuid novo: risco de confirmação/cobrança em
       dobro. E este esquecer roda em TODO resync 409/404 de continuidade
       (lote 1), inclusive erro inofensivo da rota VIVA — não só cancelamento
       de verdade. */
    if (window.HBX && window.HBX.cache) {
      ENTREGAS.forEach((_, id) => {
        try { window.HBX.cache.remove(`chegada:${id}`); } catch (_) { /* sem cache: nada a limpar */ }
      });
      try { window.HBX.cache.remove(`fim-visto:${hojeISO()}`); } catch (_) { /* sem cache: nada a limpar */ }
    }
    // 2º toque no Cancelar não posta ref morta (mesma var que
    // 10-geofence-montagem.js grava direto ao ler /logistica/rota).
    rotaRefAtual = '';
    previaSeq += 1;
    previaCrua = null;
    previaDoDedo = false;
    previaComGps = false;
    previaAlvo = 0;
    PREVIA.length = 0;
    PARADAS_SALVAR.length = 0;
    ENTREGAS.clear();
    if (typeof window.PARADAS !== 'undefined') window.PARADAS = [];
    else try { PARADAS = []; } catch (_) { /* sem seam: nada a fazer */ }
    // `semFonte: false` de propósito: o dia está vazio porque o dono MANDOU
    // esvaziar, não porque a rede caiu — são opostos, e a folha tem uma peça
    // pra cada um. `vazio` vem do mesmo escritor do boot: "nesse dia" sem chip
    // aceso não se refere a dia nenhum.
    if (typeof window.usarDados === 'function') {
      window.usarDados('montagem', {
        carregando: false, semFonte: false, linhas: [], vazio: textoVazio(0), iniciarSub: '',
        somaParadas: '', somaProdutos: '', somaValor: '',
      });
    }
  }

  /* 🔴 A CONFIRMAÇÃO E A LIMPEZA MORAM EM `confirmarLimparDia` (10/08) — o
     mesmo botão "Sim" que o 409 de outro motorista passou a usar no "Forçar
     cancelamento e puxar". Só o DEPOIS muda: aqui é sair pra Rota; lá é
     montar de novo sozinho. */
  async function cancelarRota() {
    confirmarLimparDia(() => { if (typeof window.ir === 'function') window.ir('rota'); });
  }
