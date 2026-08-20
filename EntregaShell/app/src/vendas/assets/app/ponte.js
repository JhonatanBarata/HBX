/* ==========================================================================
   PONTE DO HBX VENDAS — o único lugar onde a casca do mock encosta no APARELHO.

   `mock.css`/`mock.js` saem do mock (`docs/mockups/vendas2.0/vendas-2.0.html`)
   e NÃO se editam; então tudo que é do aparelho — API, Voltar do Android,
   teclado, tema, atualização — mora aqui. Este arquivo carrega DEPOIS do mock e
   só se apoia no que ele já expõe no escopo global (`ir`, `atual`, `T`,
   `usarDados`, `portao`, `avisar`).

   🔴 O QUE ESTA LEVA FECHA. Até 19/08 o app de Vendas era uma MAQUETE: a casca
   desenhava as 17 telas e ninguém falava com o servidor — "Empresa 1, Empresa
   2" na mão de um vendedor que ia mandar WhatsApp pra elas. O freio
   `conferirCascaTemPonte()` (scripts/ops/deploy-vps.js) barrava o publish
   justamente por isso. Esta ponte é o CANO; os módulos que a usam entram nos
   arquivos `NN-*.js` seguintes.

   🔴 A COSTURA É UM IIFE SÓ. `ponte.js` é GERADO por `scripts/ponte-costurar.js`
   concatenando os arquivos desta pasta na ordem do NOME. O primeiro (este) ABRE
   o IIFE e o último (`D0-acoes.js`) FECHA. Cada arquivo é uma fatia contígua do
   mesmo escopo léxico — por isso `const` de topo daqui é visível lá embaixo.
   Contrato completo para quem for pendurar um módulo novo: `LEIA-ME.md`.
   ========================================================================== */
(function () {
  'use strict';

  const temPonte = () => typeof window.HBX !== 'undefined' && typeof window.HBX.api === 'function';

  /* 🔴 `let`/`const` de topo NÃO viram propriedade de `window` — só `var` e
     `function` viram. O mock declara `let atual`, então `window.atual` é SEMPRE
     undefined, e quem ler assim vai achar que não tem tela nenhuma (no app do
     motorista foi exatamente isso que fez o Voltar do Android devolver "não
     tratei", medido no g15). Referência NUA resolve pelo escopo léxico global,
     que os dois scripts compartilham — é assim que se lê o estado do mock. */
  const telaAtual = () => { try { return atual; } catch (_) { return null; } };

  /* 🔴 A CAMADA VIVA É A ÚLTIMA, NUNCA A PRIMEIRA. Durante a troca de tela
     existem DUAS `.tela` no DOM: a que entra e a que morre. `querySelector`
     devolve a PRIMEIRA — a moribunda — e quem procurar botão ali acha nada (ou
     acha o botão errado, que some no instante seguinte). O `pintar()` do mock
     já fala essa língua (`camadaViva`); a ponte fala a mesma. */
  const camadaViva = () => {
    const camadas = document.querySelectorAll('#app .tela');
    return camadas.length ? camadas[camadas.length - 1] : null;
  };
  const naCamada = (sel) => {
    const c = camadaViva();
    return c ? c.querySelector(sel) : null;
  };

  /* ------------------------------------------------------------------------
     O SEAM — a única porta por onde dado real entra na tela.

     🔴 O FREIO DE REPINTE MORA NO MOCK, e é de propósito: `usarDados(secao,
     valor)` compara CAMPO A CAMPO com o que já está em `DADOS` e, se nada mudou,
     NÃO repinta. A ponte relê configuração por relógio e por volta de foco —
     sem esse freio, cada leitura trocaria o DOM inteiro (o `pintar` monta outra
     camada) e a tela piscaria sozinha na cara de quem está trabalhando.

     🔴 O QUE A PONTE DEVE À REGRA: dado que muda por FORA de `DADOS` não é visto
     pelo freio. No app do motorista isso já custou uma tela mentindo (a lista
     reordenada pelo dedo, com a gravação recusada pelo servidor, continuava na
     ordem errada). Em Vendas toda lista viaja DENTRO de `DADOS` (`blocos`,
     `lista`, `conversa`), então o freio enxerga tudo — quem for pendurar módulo
     novo mantém essa lei: lista fora do seam precisa de digital própria.

     Este embrulho existe pra que os módulos não repitam a mesma guarda 40 vezes
     (mock não carregado = nada a escrever, e nunca um TypeError na abertura). */
  function usar(secao, valor) {
    if (typeof window.usarDados !== 'function') return;
    window.usarDados(secao, valor);
  }

  /* ------------------------------------------------------------------------
     O PONTO DE REGISTRO — como um módulo pendura ação SEM editar o `D0-acoes.js`.

     🔴 POR QUE ISTO EXISTE. Os módulos de Vendas (funil, radar, agenda,
     conversas, empresas) nascem em arquivos e em sessões DIFERENTES. Se cada um
     precisasse acrescentar uma linha no mapa de ações do `D0`, dois agentes
     escrevendo no mesmo arquivo assariam estado pela metade — e o defeito
     apareceria como "o botão não faz nada", que é a categoria mais cara desta
     casa. Aqui cada módulo REGISTRA o que é dele, no arquivo dele.

     Os três registros, e por que são três e não um:
     · `registrarAcoes`  — toque em `[data-acao]`. O handler recebe o NÓ TOCADO,
       nunca um argumento já extraído: é no nó que moram `data-lead`,
       `data-etapa`, `data-empresa`… e é nele que o "aguarde" entra no MESMO
       quadro do dedo.
     · `registrarCampos` — digitação em `[data-campo]`. Recebe (valor, nó).
       Aceita `{ espera, ao }` porque campo de busca sem debounce é um pedido
       por letra — e a tela repinta a cada resposta.
     · `registrarTelas`  — a tela ABRIU. É o gancho de carregar: `data-ir` /
       `data-nav` / `data-tela` são do roteador do MOCK, e a ponte não pode
       sequestrá-los (o tour e a aula apontam pra esses atributos por nome).

     🔴 NOME REPETIDO REPROVA ALTO, no console e na hora. Dois donos pra mesma
     ação é o defeito que a chave do tema já pagou no app do motorista (dois
     handlers viravam a luz no mesmo clique e ela "não fazia nada").
     ------------------------------------------------------------------------ */
  const ACOES = Object.create(null);
  const CAMPOS = Object.create(null);
  const TELAS_AO_ABRIR = Object.create(null);

  const registrarEm = (cofre, mapa, rotulo) => {
    Object.keys(mapa || {}).forEach((chave) => {
      if (cofre[chave]) {
        try { console.error(`[ponte/vendas] ${rotulo} "${chave}" registrado DUAS vezes — o segundo dono foi ignorado.`); } catch (_) {}
        return;
      }
      cofre[chave] = mapa[chave];
    });
  };
  const registrarAcoes = (mapa) => registrarEm(ACOES, mapa, 'ação');
  const registrarCampos = (mapa) => registrarEm(CAMPOS, mapa, 'campo');
  const registrarTelas = (mapa) => registrarEm(TELAS_AO_ABRIR, mapa, 'tela');

  /* ------------------------------------------------------------------------
     1. TEMA COM UM DONO SÓ.
     O `native.js` já resolve o tema com três entradas (escolha do dono, virada
     de turno e o aparelho) e espelha em `data-luz`. O mock tem o `trocarLuz`
     dele. Dois donos do tema um dia discordam — e quem perde é a tela, que fica
     clara com o app escuro. Aqui o mock passa a OBEDECER o native: manda a
     escolha pra ele e só repinta quando ele avisa.

     🔴 E POR ISSO `chave-tema` NÃO ESTÁ NO MAPA DE AÇÕES do `D0` — a ausência é
     a correção, não esquecimento. O mock já trata o clique (ele chama
     `trocarLuz`); uma entrada lá viraria a luz uma SEGUNDA vez no mesmo toque.
     ------------------------------------------------------------------------ */
  if (temPonte() && typeof window.trocarLuz === 'function') {
    const doMock = window.trocarLuz;
    window.trocarLuz = function (escolha) {
      // vocabulário do mock (escuro/claro/sistema) → o do native (dark/light/system)
      const mapa = { escuro: 'dark', claro: 'light', sistema: 'system' };
      if (mapa[escolha]) { window.HBX.theme.set(mapa[escolha]); return; }
      doMock(escolha);
    };
    // o native mexeu no tema (turno virou, aparelho mudou): a tela acompanha.
    document.addEventListener('hbx:theme', () => {
      if (typeof window.pintar === 'function') window.pintar(false);
    });
  }

  /* ------------------------------------------------------------------------
     2. VOLTAR DO ANDROID.
     O Kotlin pergunta `window.HBXApp.handleBack()`: `true` = eu tratei, `false`
     = pode sair do app. A ordem é sempre a mesma: primeiro fecha o que está POR
     CIMA, depois volta pela porta marcada da tela, depois cai no Funil, e só no
     Funil é que sair vale.

     🔴 A LISTA É A DO MOCK DE **VENDAS**, NA ORDEM DO Z-INDEX — de cima pra
     baixo: erro(60) · portão(59) · confirmação(58) · aviso(55) · aula(52).
     Ela NÃO é a lista do app do motorista, e copiar aquela seria errar duas
     vezes: `.chegou-wrap` e `.chat-wrap` não existem em nenhuma tela de Vendas
     (o CSS delas veio junto na cópia da folha, o JS nunca as monta) — seriam
     duas voltas de laço procurando fantasma; e a AULA lá está no topo da lista,
     enquanto aqui ela mora ABAIXO do aviso, de propósito (o comentário do mock
     é explícito: "aula é conveniência; trava e recado são o dia"). Com a lista
     do motorista, o Voltar fecharia a lição ANTES da trava de crédito que
     nasceu por cima dela.
     ------------------------------------------------------------------------ */
  const POR_CIMA = ['.erro-wrap', '.portao-wrap', '.conf-wrap', '.aviso', '.aula-wrap'];
  window.HBXApp = window.HBXApp || {};
  window.HBXApp.handleBack = function () {
    const camada = camadaViva();
    if (camada) {
      for (const sel of POR_CIMA) {
        const peca = camada.querySelector(sel);
        if (!peca) continue;
        /* 🔴 TRAVA É TRAVA — mas quem diz se trava é o ESCAPE, não o tom.
           Escape = o botão que sai SEM resolver. O portão marca (`data-escape`)
           e a aula também (o × e o "Entendi" do último passo); erro e
           confirmação não marcam, e ali o escape é o `data-fechar` que NÃO é o
           principal ("Fechar", "Não"). Camada SEM escape nenhum é obrigatória
           (atualização obrigatória, tutorial obrigatório) e o Voltar não pode
           ser a porta dos fundos: engole o toque (`true` sem fechar) e a trava
           continua de pé, com o app aberto.
           ⚠️ Tom vermelho NÃO é obrigação — "Créditos acabaram" tem "Fechar".
           Tratar tom como trava prenderia o vendedor numa tela. */
        const escape = peca.querySelector('[data-escape], [data-fechar]:not(.principal):not(.azul)');
        const eEnfeite = sel === '.aviso';   // aviso passa sozinho; não é decisão
        if (!escape && !eEnfeite) return true;
        /* 🔴 VOLTAR APERTA O BOTÃO DE SAIR — não arranca a peça do DOM. Arrancar
           fecharia a caixa e deixaria o RASTRO de quem a abriu: é o × da aula
           que grava de onde ela parou (`tutorGravar('pos:'…)`), e é o "Não" da
           confirmação que desfaz o estado de quem a abriu. Apertar o escape roda
           o fechamento de verdade — o MESMO caminho do dedo. */
        if (escape) escape.click();
        // Aviso não tem botão: ele sai como sai sozinho (`sai` + 280 ms), que é
        // a saída que o mock desenhou. `fechar()` aqui animaria o ÍCONE, porque
        // o aviso não tem wrap — ele É o cartão.
        else if (eEnfeite) { peca.classList.add('sai'); setTimeout(() => peca.remove(), 280); }
        return true;
      }
    }
    const tela = telaAtual();
    /* 🔴 QUEM RESPONDE É `[data-voltar]`, NUNCA "o primeiro `data-ir`" do
       cabeçalho. Nas telas de Vendas sem volta, o primeiro botão do cabeçalho é
       o "+", que aponta pro RADAR — deduzir o Voltar por POSIÇÃO faria a tecla
       do aparelho abrir a busca de empresas no meio do funil (no app do
       motorista o mesmo erro abria "Cadastrar cliente", medido no g15). O mock
       de Vendas já marca a volta: `hdr({voltar:'…'})` escreve `data-voltar="1"`. */
    if (camada && typeof window.ir === 'function') {
      const volta = camada.querySelector('[data-voltar][data-ir]');
      const destino = volta && volta.dataset ? volta.dataset.ir : '';
      if (destino && destino !== tela) {
        window.ir(destino);
        // `ir()` RECUSA calado (módulo desligado pelo admin, destino que não
        // existe mais). Sem conferir, o Voltar viraria tecla morta na mão do
        // vendedor: a tela não muda e o Kotlin acha que foi tratado.
        if (telaAtual() !== tela) return true;
      }
    }
    /* O degrau do meio: qualquer tela de Vendas volta pro FUNIL. Ele é a casa
       deste app (a lei da barra: "Vendas nunca some"), e é a única tela em que
       sair do aplicativo é a resposta certa. */
    if (tela && tela !== 'vendas' && typeof window.ir === 'function') {
      window.ir('vendas');
      if (telaAtual() === 'vendas') return true;
    }
    return false;   // no Funil, Voltar sai do app — um toque só (Kotlin)
  };

  /* ------------------------------------------------------------------------
     2b. O CORDÃO DE ENTREGA — como este app descobre que existe versão nova.

     🔴 AQUI ELE É UM ANÚNCIO, NÃO UM INSTALADOR — e a diferença foi MEDIDA no
     Kotlin, não deduzida. As três portas do auto-update do `NativeAppBridge`
     (`updateInstallAllowed`, `openInstallPermission`, `downloadAndInstall`)
     abrem com `if (BuildConfig.APP_MODE != "logistica") return`. Elas EXISTEM no
     objeto (então `typeof === 'function'` responde `true` e um feature-detect
     ingênuo passaria), e não fazem NADA neste flavor. Portar o pop-up
     "Atualizar agora / Baixando… 37%" do app do motorista seria entregar a
     categoria de defeito mais cara desta casa: o botão que parece funcionar,
     não devolve erro e não acontece — com barra de progresso e tudo.

     Então o contrato deste app é o honesto: a ponte DESCOBRE a versão nova,
     ANUNCIA na linha dos Ajustes (a porta que sobrevive a qualquer repinte) e
     diz ONDE pegar. Quando o Kotlin abrir o instalador pro `vendas`, o pop-up
     de instalar entra aqui e nada mais precisa mudar.

     🔴 O MANIFESTO É O DESTE APP: `version-vendas.json`, nunca o do motorista.
     Os dois flavors têm `applicationId` DIFERENTE (`br.com.hbxsystem` ×
     `br.com.hbxsystem.logistica`): ler o manifesto do outro faria o app
     comparar a própria versão com a de um pacote que nem é ele e anunciar
     atualização pra sempre — e, com instalador, INSTALARIA O APP DO MOTORISTA
     ao lado. Endereço de update é identidade de app.

     ⚠️ PENDÊNCIA REAL, anotada onde ela aparece: o `scripts/ops/deploy-vps.js`
     publica hoje só o `version-logistica.json` e sobe só o `Loghbx.apk` — o
     `Salehbx.apk` é construído e não viaja. Enquanto isso, este manifesto
     responde 404: a checagem automática fica CALADA (é o certo, não há novidade
     a anunciar) e o toque manual responde a verdade, em vez de "confira a
     internet" com a internet perfeita.
     ------------------------------------------------------------------------ */
  const bridgeCru = () => (typeof window.HBXAndroid !== 'undefined' ? window.HBXAndroid : null);
  let updateInfo = null;
  let updateCheckEm = 0;

  /* 🔴 O versionNAME NÃO IDENTIFICA BUILD: ele não muda entre publicações, então
     "Versão beta1 pronta" seria a MESMA frase toda vez — e aviso que não muda
     ensina o dedo a ignorá-lo. Medido no app do motorista em 16/08: g15 na 276
     com a 280 no ar, 3 publicações ignoradas e 12 h de trabalho testadas contra
     o app velho. LEI: o número que MUDA é o que aparece. Régua única — a linha
     dos Ajustes e o aviso bebem daqui. */
  const frasePronta = () => {
    const i = (window.HBX && window.HBX.info && window.HBX.info()) || {};
    return `Versão ${(updateInfo && updateInfo.versionCode) || ''} disponível${i.versionCode ? ` — você está na ${Number(i.versionCode)}` : ''}.`;
  };

  /* Toque manual SEMPRE responde. Silêncio num botão que a pessoa acabou de
     tocar é botão morto: ela fica sem saber se o app está atualizado, se a rede
     caiu ou se o toque nem chegou. A checagem AUTOMÁTICA continua calada quando
     não há novidade — aviso que chega sem motivo vira paisagem. */
  const respostaSeco = (titulo, sub) => {
    if (typeof window.portao !== 'function') return;
    window.portao({ tom: 'info', ico: 'download', titulo, sub, acoes: [['Entendi', 'principal', true]] });
  };

  function avisoDeVersaoNova() {
    if (!updateInfo || typeof window.portao !== 'function') return;
    // A abertura é uma cena com relógio; portão em cima dela morre na troca de
    // camada. Espera a casa (o Funil) estar de pé.
    if (telaAtual() === 'entrada') { setTimeout(avisoDeVersaoNova, 2500); return; }
    respostaSeco('Atualizar app', `${frasePronta()} Baixe a nova em hbxsystem.com.br.`);
    /* 🔴 O CARIMBO SÓ VALE DEPOIS QUE O AVISO NASCEU. No app do motorista ele era
       posto ANTES de pintar — e o aviso mora na camada VIVA, que qualquer
       repinte do boot leva embora. Resultado medido: versão nova no servidor,
       pop-up morto no berço, versão marcada como "já avisada" e nenhum caminho
       de volta. Carimbo de "eu avisei" só depois que o aviso está DE PÉ. */
    if (!naCamada('.portao-wrap')) return;
    try { window.HBX.cache.set('update-avisado', updateInfo.versionCode); } catch (_) {}
  }

  /* 🔴 O CATCH QUE CHUTA A CAUSA MENTE. `fetch` barrado pela CSP e `fetch` sem
     internet chegam aqui com a MESMA cara ("Failed to fetch"), e a frase
     "confira a internet" mandou o dono olhar o wi-fi por dois dias enquanto o
     problema era a POLÍTICA do próprio app (o `connect-src` do index.html,
     perdido numa injeção do gerador). O navegador conta a verdade num evento à
     parte; quem escuta, sabe qual das duas é. */
  let cspBarrouEm = 0;
  document.addEventListener('securitypolicyviolation', (e) => {
    const alvo = String((e && e.blockedURI) || '');
    const regra = String((e && e.violatedDirective) || '');
    if (alvo.includes('version-vendas') || regra.indexOf('connect-src') === 0) cspBarrouEm = Date.now();
  });

  async function checkAppUpdate(forcado) {
    if (!forcado && Date.now() - updateCheckEm < 1800000) return;   // 30 min
    if (!bridgeCru()) {                                             // fora do aparelho: nada a checar
      if (forcado) respostaSeco('Atualização', 'Abra o aplicativo instalado para procurar atualização.');
      return;
    }
    const info = (window.HBX && window.HBX.info && window.HBX.info()) || {};
    const base = String(info.webBaseUrl || '').replace(/\/+$/, '');
    const meu = Number(info.versionCode || 0);
    if (!base || !meu) {
      if (forcado) respostaSeco('Atualização', 'Não consegui identificar a versão instalada agora.');
      return;
    }
    updateCheckEm = Date.now();
    let v;
    try {
      /* 🔴 O NOME DO MANIFESTO FICA ESCRITO AQUI, INTEIRO E LITERAL — não numa
         constante lá em cima. Ele é o que separa este app do outro, e o fiscal
         `tests/app-cordao-de-update.test.mjs` lê exatamente esta linha pra provar
         que nenhum dos dois apps aponta pro manifesto do vizinho. Constante
         montada em template esconde o nome do fiscal e de quem lê. */
      const r = await fetch(`${base}/downloads/version-vendas.json`, { cache: 'no-store' });
      /* 🔴 404 NÃO É "A REDE CAIU" — e dizer que é seria justamente a mentira
         que este bloco existe pra não contar. Hoje o publish grava só o
         manifesto do Logística (ver a nota lá em cima): o canal de Vendas
         responde 404, e a frase honesta é esta. No dia em que o publish passar a
         gravar o `version-vendas.json`, nada aqui muda — o caminho já é o certo. */
      if (r.status === 404) {
        if (forcado) {
          respostaSeco('Atualização',
            'Este aplicativo ainda não recebe aviso automático de versão nova. Fale com a Central.');
        }
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      v = await r.json();
    } catch (_) {
      if (forcado) {
        avisoErro(new Error(Date.now() - cspBarrouEm < 5000
          ? 'Esta versão do app não consegue procurar atualização. Baixe a nova em hbxsystem.com.br e avise a Central.'
          : 'Não consegui verificar agora. Confira a internet e tente de novo.'));
      }
      return;
    }
    if (!v || !(Number(v.versionCode) > meu)) {
      // Já está na mais recente: some com o rastro de uma versão que ele já
      // instalou (senão a linha dos Ajustes continuaria oferecendo o que não
      // existe mais) e responde a quem perguntou.
      updateInfo = null;
      pintarLinhaVersao();
      if (forcado) respostaSeco('Tudo certo', 'Você já está na versão mais recente.');
      return;
    }
    updateInfo = {
      versionName: v.versionName || '', versionCode: Number(v.versionCode),
      obrigatoria: !!v.obrigatoria,
    };
    // A linha dos Ajustes passa a ANUNCIAR — ela é a porta que sobrevive ao
    // aviso perdido, então precisa saber que há versão nova mesmo se o pop-up
    // nascer e morrer num repinte.
    pintarLinhaVersao();
    // avisa 1x por versionCode; obrigatória e toque manual furam a memória
    let jaAvisado = 0;
    try { jaAvisado = Number((window.HBX.cache && window.HBX.cache.get('update-avisado', 0)) || 0); } catch (_) {}
    if (!updateInfo.obrigatoria && !forcado && updateInfo.versionCode <= jaAvisado) return;
    avisoDeVersaoNova();
  }

  window.addEventListener('focus', () => { checkAppUpdate(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAppUpdate();
  });
  /* 🔴 EVENTO QUE NÃO DISPARA NÃO É GARANTIA. MEDIDO na mesma WebView do app do
     motorista: `visibilitychange` NÃO dispara aqui — a Activity fica viva e a
     WebView nunca é pausada — e o `focus` da janela segue o mesmo destino. Ou
     seja: a checagem só aconteceria no boot FRIO, e este app fica aberto o dia
     inteiro. Quem garante é o RELÓGIO; os dois eventos ficam como atalho. A
     trava de 30 min lá dentro é que manda no custo, então o tique é barato. */
  setInterval(() => checkAppUpdate(), 600000);   // 10 min de tique, 30 min de trava

  /* A linha "Versão" dos Ajustes fala por si: ela diz o que está instalado e,
     quando há versão nova, ANUNCIA. É a porta MANUAL — o aviso automático é
     conveniência, esta linha é a garantia (quem perdeu o aviso uma vez ficaria
     preso na versão velha sem nada pra tocar). */
  function linhaDaVersao() {
    const info = (window.HBX && window.HBX.info && window.HBX.info()) || {};
    const meu = Number(info.versionCode || 0);
    const nome = info.versionName ? `Versão ${esc(info.versionName)}${meu ? ` (${meu})` : ''}` : '';
    const nova = updateInfo && updateInfo.versionCode > meu;
    return {
      versao: nome,
      versaoSub: nova ? `${frasePronta()} Baixe em hbxsystem.com.br.` : 'toque para procurar atualização',
      versaoTag: nova ? 'Atualizar' : '',
    };
  }
  function pintarLinhaVersao() {
    if (!temPonte()) return;
    usar('ajustes', linhaDaVersao());
  }

  /* ------------------------------------------------------------------------
     3. TECLADO NUNCA COBRE CAMPO NEM BOTÃO.
     A WebView não encolhe sozinha: quem sabe a altura real é a `visualViewport`.
     A folha usa `--teclado` pra empurrar o que precisa; a classe é o sinal.

     🔴 EM VENDAS ISTO PESA MAIS QUE NO APP DO MOTORISTA, e é por isso que o
     `index.html` deste app pede `interactive-widget=resizes-content`: aqui quase
     toda tela tem campo (buscar empresa, buscar lead, escrever mensagem) e o
     botão de ação mora no rodapé. Sem as duas metades — a meta e esta medida — o
     vendedor digita a mensagem atrás do próprio teclado.
     ------------------------------------------------------------------------ */
  const vv = window.visualViewport;
  if (vv) {
    const sincronizar = () => {
      const tomado = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--teclado', `${Math.round(tomado)}px`);
      document.body.classList.toggle('keyboard-open', tomado > 120);
    };
    vv.addEventListener('resize', sincronizar);
    vv.addEventListener('scroll', sincronizar);
    sincronizar();
  }

  /* ------------------------------------------------------------------------
     4. A PORTA DOS DADOS.
     `API.get/post/patch/del` é o que todo módulo usa. Erro chega em PORTUGUÊS
     de gente: id cru de backend nunca vai pra tela. Sem ponte (mock aberto no
     navegador), a porta REJEITA em vez de inventar dado — número inventado em
     tela de dinheiro é mentira com cara de app.
     ------------------------------------------------------------------------ */
  const humano = (e) => {
    const msg = String((e && e.message) || e || '');
    const body = (e && e.body) || null;
    const code = String((body && body.code) || '');
    /* 🔴 O 403 DE MÓDULO ERA MUDO NA TELA, e isso já custou um cliente inteiro
       (18/08: o cliente 46 pareou o aparelho e levou 39x `MODULE_ACCESS_DENIED`
       em 65 segundos porque o módulo estava desligado desde o cadastro — ele
       tocava, tocava, e concluía que o aplicativo estava quebrado). O servidor
       sempre disse o porquê no corpo; quem jogava fora era o app. A frase manda
       a pessoa pro lugar certo (o administrador, no computador) e a tela de
       "Módulos liberados" dos Ajustes mostra a mesma verdade por escrito. */
    if (code === 'MODULE_ACCESS_DENIED') {
      return 'Este módulo não está liberado para você. Fale com o administrador da sua empresa — ele libera no computador.';
    }
    if (/Failed to fetch|NetworkError|ERR_/i.test(msg)) return 'Sem conexão agora.';
    if (/demorou/i.test(msg)) return 'O servidor demorou. Tente de novo.';
    if (/401|sessão|token/i.test(msg)) return 'Sua sessão expirou. Abra o app de novo.';
    if (/403/.test(msg)) return 'Você não tem permissão para isso.';
    /* 🔴 A FRASE DA RECUSA SEM PONTE É A DESTE APP, E O CASAMENTO É POR REGEX.
       O `native.js` do vendas responde "Abra esta tela pelo HBX Vendas." — copiar
       a frase do motorista mandaria o VENDEDOR abrir o aplicativo de ENTREGA.
       O prefixo ("Abra esta tela pelo HBX") é o contrato entre os dois arquivos;
       ele fica, o nome do app muda. */
    if (/Abra esta tela pelo HBX/i.test(msg)) return msg;
    return msg || 'Não consegui agora.';
  };

  /* 🔴 A FRASE CERTA NÃO BASTA — A TELA TAMBÉM PRECISA SABER QUAL CENA É.
     O `humano()` acima já dizia "este módulo não está liberado", mas essa frase
     só chegava ao TOAST: o esqueleto da tela continuava escrevendo "Não consegui
     carregar · Sem resposta do servidor agora" com um "Tentar de novo" ao lado.
     São cenas OPOSTAS na mesma tela — uma manda esperar a rede voltar, a outra
     manda falar com o administrador —, e a errada é a que faz o cliente bater 39
     vezes na mesma porta trancada (18/08, cliente 46: 39x 403 em 65 s).

     Aqui a queda vira UMA PALAVRA que a casca entende. Três, e só três:
       'modulo'  → 403 MODULE_ACCESS_DENIED: porta TRANCADA. "Tentar de novo"
                   ali é o botão que bate na mesma porta — ele não nasce.
       'sessao'  → 401/token: o crachá venceu. Recarregar não conserta; quem
                   conserta é o caminho de sessão que o app já tem (o `sair`).
       ''        → rede/5xx/resposta torta: é o "não consegui carregar" de
                   sempre, com o "Tentar de novo" que de fato resolve.
     Régua pelo CORPO primeiro (o `code` do backend é explícito) e pelo status
     depois — casar por texto de mensagem é como a tradução de amanhã vira um
     bug de classificação. */
  const motivoDaQueda = (e) => {
    if (!e) return '';
    const code = String(((e.body || {}).code) || '');
    if (code === 'MODULE_ACCESS_DENIED') return 'modulo';
    const status = Number(e.status || 0);
    if (status === 401) return 'sessao';
    /* 403 sem `code` é permissão de USUÁRIO (RBAC), não módulo desligado — e
       essa também é porta trancada: o "Tentar de novo" continua sendo mentira. */
    if (status === 403) return 'modulo';
    /* Sem status (o `Error` cru do timeout/offline do `native.js`) a régua é a
       mensagem já traduzida, e só para o caso de sessão — os outros caem na
       rede, que é o lado seguro: oferecer "Tentar de novo" a mais é barato;
       esconder o botão numa queda de rede prende a pessoa. */
    if (/sessão expirou/i.test(String(e.message || ''))) return 'sessao';
    return '';
  };

  /* 🔴 O TRADUTOR NÃO PODE APAGAR O QUE O SERVIDOR DISSE. O `native.js` entrega
     `error.status` (o código HTTP) e `error.body` (o corpo já lido); trocar de
     Error jogando os dois no lixo deixava quem chama sem como distinguir "409
     porque já existe" de "500 qualquer". A tradução em português continua sendo
     a mensagem (é ela que vai pra tela por padrão); status e corpo viajam JUNTO
     pra quem quiser dizer a frase certa daquele caso. */
  const chamar = (metodo, caminho, corpo) => {
    if (!temPonte()) return Promise.reject(new Error('Abra esta tela pelo HBX Vendas.'));
    return window.HBX.api(caminho, { method: metodo, body: corpo }).catch((e) => {
      const erro = new Error(humano(e));
      erro.status = Number((e && e.status) || 0);
      erro.body = (e && e.body) || null;
      throw erro;
    });
  };
  window.API = {
    ponte: temPonte,
    get: (c) => chamar('GET', c),
    post: (c, corpo) => chamar('POST', c, corpo),
    patch: (c, corpo) => chamar('PATCH', c, corpo),
    del: (c) => chamar('DELETE', c),
  };

  /** A caixa vermelha padrão da casa. Um lugar só: mensagem de erro escrita à
   *  mão em cada `catch` é como duas telas passam a explicar o mesmo problema de
   *  dois jeitos. */
  const avisoErro = (e) => {
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'trava', ico: 'alert', titulo: 'Não deu certo',
      sub: humano(e), acoes: [['Fechar', '']],
    });
  };

  /* ------------------------------------------------------------------------
     5. AS RÉGUAS DE TEXTO — traduzir ≠ decidir.
     Campo sem fonte vai VAZIO; o template do mock faz o slot sumir sozinho.
     ------------------------------------------------------------------------ */

  /* 🔴 O TEMPLATE DO MOCK INTERPOLA CRU (`${…}`), como toda maquete. Enquanto o
     dado era do desenho isso não tinha dono; com dado REAL passa a ter: uma
     razão social vinda da RFB com `&` ou `<` (e elas VÊM: "COMÉRCIO & CIA") quebra
     a marcação e o cartão some da lista sem erro nenhum. Escapa-se na FONTE
     (aqui), nunca no template — assim vale pra toda tela que ler o seam, e o
     literal do mock (que tem `<b>` de propósito) continua vivo. */
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const dinheiro = (n) => (typeof n === 'number' && isFinite(n)
    ? `R$ ${n.toFixed(2).replace('.', ',')}`
    : '');

  const hora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isFinite(d.getTime())
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : '';
  };

  /* 🔴 O DIA DA OPERAÇÃO É O DE SÃO PAULO — nem o do relógio do aparelho, nem o
     do servidor. O servidor roda em UTC (sem TZ, medido nos dois containers) e o
     aparelho pode estar em qualquer fuso; se cada ponta escolher o seu, o
     vendedor vê a agenda de ontem ou de amanhã dependendo da HORA. */
  const diaOperacional = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());   // en-CA já formata como AAAA-MM-DD

  /** AAAA-MM-DD de um instante, no fuso da operação. Vazio se a data não presta. */
  const diaEmSp = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  };
  const diaAnterior = (ymd) => {
    const [a, m, d] = String(ymd).split('-').map(Number);
    if (!a || !m || !d) return '';
    const x = new Date(Date.UTC(a, m - 1, d) - 86400000);
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
  };
  /** "12/09" — a data curta que se lê num cartão. */
  const diaCurto = (iso) => {
    const ymd = diaEmSp(iso);
    return ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '';
  };
  /** "Terça, 19 de agosto" — o subtítulo da agenda. Montado com `Date.UTC` de
   *  propósito: `new Date('2026-08-19')` é meia-noite UTC, que no Brasil ainda é
   *  o dia 18 — a data por extenso sairia um dia atrasada. */
  const dataPorExtenso = (ymd) => {
    const [a, m, d] = String(ymd || '').split('-').map(Number);
    if (!a || !m || !d) return '';
    const x = new Date(Date.UTC(a, m - 1, d));
    if (!isFinite(x.getTime())) return '';
    const txt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
    }).format(x);
    return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : '';
  };

  /* "hoje, 09:12" · "ontem" · "há 4 d" · "12/09" — o QUANDO de um toque no
     cartão do funil. Régua única porque três telas escrevem esta mesma frase
     (funil, agenda, ficha), e três cópias é como elas passam a discordar.
     🔴 A CONTA É EM DIAS DE CALENDÁRIO (São Paulo), não em 24h corridas: às 23h
     de hoje, um toque das 01h de hoje é "hoje", não "há 22 horas". */
  const quandoDoToque = (iso) => {
    const ymd = diaEmSp(iso);
    if (!ymd) return '';
    const hoje = diaOperacional();
    if (ymd === hoje) return `hoje, ${new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))}`;
    if (ymd === diaAnterior(hoje)) return 'ontem';
    const dias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${ymd}T12:00:00Z`)) / 86400000);
    if (dias > 1 && dias <= 30) return `há ${dias} d`;
    return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
  };

  /* As DUAS letras do avatar. Sai do nome real da empresa — "Distribuidora
     Nova" vira "DN", "Bar do Zé" vira "BZ". Uma palavra só devolve as duas
     primeiras letras; sem nome, devolve vazio e o círculo nasce liso (é o que a
     folha já faz), nunca com um "?" que parece erro. */
  const iniciais = (nome) => {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  };

  /* 🔴 TELEFONE SE LÊ, NÃO SE DECORA. O banco guarda dígito cru
     ("5519999990001", "19999990001", "1930000000") e a tela mostrava o cru — 13
     números grudados que ninguém confere de bater o olho. Aqui vira
     "(19) 99999-0001". O que NÃO couber em nenhum formato brasileiro volta como
     veio: inventar máscara em número estrangeiro é escrever um telefone que não
     existe. O `55` do país sai só quando sobra exatamente ele. */
  const telefoneBonito = (bruto) => {
    let d = String(bruto || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length > 11 && d.slice(0, 2) === '55') d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(bruto || '');
  };

  /* "Cidade · UF" — e cada metade some sozinha quando falta. Sem isto a linha
     saía como "· SP" ou "Valinhos ·", que lê como dado corrompido. */
  const local = (cidade, uf) => [String(cidade || '').trim(), String(uf || '').trim()]
    .filter(Boolean).join(' · ');

  /* O TOM DA ETAPA — a pílula do cartão fala a língua do servidor
     (`statusLabel`), e a COR é a régua daqui. Uma tinta por significado, e as
     quatro já existem nas duas peles (claro e escuro): nada de cor nova.
     🔴 O CINZA DO "Novo lead" É DELIBERADO: lead que ninguém tocou não é
     conquista nem alarme — pintá-lo de verde faria a tela comemorar o trabalho
     que ainda não foi feito. */
  const TOM_DA_ETAPA = {
    'Qualificado': 'lime',
    'Em contato': 'blue',
    'Retorno': 'amber',
    'Novo lead': '',
    'Encerrado': '',
  };
  const tomDaEtapa = (rotulo) => TOM_DA_ETAPA[String(rotulo || '')] || '';

  /* ==========================================================================
     O PORTÃO DE CARGA — esqueleto → aviso → conteúdo, e a carga inicial.

     🔴 A LEI Nº 1 DESTA FRENTE: "vazio porque o servidor disse vazio" e "vazio
     porque a rede caiu" são OPOSTOS, e a tela tem que saber qual dos dois está
     mostrando. Lista vazia sem aviso mente dizendo que a base do vendedor está
     vazia — e em Vendas essa mentira termina em "o app não funciona, não tenho
     nenhum lead".

     🔴 A SEGUNDA LEI, e ela é a que separa este arquivo de um `try/catch`
     qualquer: FALHA DE REDE SÓ APAGA TELA NA PRIMEIRA CARGA. Com dado real já
     desenhado, um tique de fundo que não respondeu NÃO pode arrancar o funil da
     mão de quem está trabalhando — ele avisa e deixa o que estava. Quem guarda
     essa diferença é o próprio `carregando`: ele só está ligado enquanto a
     primeira resposta não chegou.
     ========================================================================== */

  /** Fonte fora do ar: some o esqueleto, entra o aviso.
   *  🔴 SÓ NA PRIMEIRA CARGA (`carregando` ainda ligado) — ver a 2ª lei acima.
   *
   *  🔴 E ELE RECEBE O ERRO, NÃO SÓ O NOME DA SEÇÃO. Até 19/08 todo chamador
   *  fazia `.catch(() => fonteCaiu('vendas'))` e JOGAVA FORA o objeto — então a
   *  tela dizia "não consegui carregar" (= a rede caiu, espere) quando o
   *  servidor tinha dito "você não tem esse módulo" (= porta trancada, fale com
   *  o administrador). Duas cenas opostas na mesma tela, e a errada é a que
   *  custou o cliente 46 em 18/08: 39 respostas 403 em 65 segundos e nenhuma
   *  palavra na tela. O `quedaMotivo` é a palavra que a casca lê pra escolher
   *  qual das três caras desenhar (ver `motivoDaQueda`, 00-nucleo). */
  const fonteCaiu = (secao, erro) => {
    if (typeof window.usarDados !== 'function') return;
    let primeira = false;
    try { primeira = !!(DADOS[secao] && DADOS[secao].carregando); } catch (_) { return; }
    if (!primeira) return;
    usar(secao, { carregando: false, semFonte: true, quedaMotivo: motivoDaQueda(erro) });
  };
  /** Respondeu: sai o esqueleto E o aviso, no MESMO repinte do dado — senão a
   *  tela pisca "carregando → aviso → conteúdo" em duas pinturas.
   *  `quedaMotivo` zera junto: motivo velho sobrevivendo à recuperação faria a
   *  próxima queda de REDE aparecer vestida de módulo desligado. */
  const fonteVoltou = { carregando: false, semFonte: false, quedaMotivo: '' };
  /** O "Tentar de novo": devolve o esqueleto e pede de novo. */
  const retentar = (secao, carregador) => {
    usar(secao, { carregando: true, semFonte: false, quedaMotivo: '' });
    carregador();
  };

  /* 🔴 A MESMA ESCADA, COM AS BANDEIRAS NA MÃO. Uma tela pode ter DUAS fontes de
     rede independentes — o Funil tem: `/vendas/board` traz o funil e
     `/vendas/report` traz o placar. Com um par único de bandeiras por SEÇÃO, a
     queda de uma porta apagaria o bloco da outra. Estes dois pares são o par
     `placarCarregando`/`placarSemFonte` que a casca já desenha. */
  const blocoCaiu = (secao, campoCarregando, campoSemFonte) => {
    let primeira = false;
    try { primeira = !!(DADOS[secao] && DADOS[secao][campoCarregando]); } catch (_) { return; }
    if (!primeira) return;
    usar(secao, { [campoCarregando]: false, [campoSemFonte]: true });
  };

  /* ==========================================================================
     🔴 NO APARELHO, A DEMONSTRAÇÃO NÃO EXISTE.

     O mock é o front, e o front traz o dado de exemplo do DESENHO. Até o
     servidor responder, o vendedor via "Empresa 1", "Empresa 2", telefones
     `(19) 90000-0001` e um saldo de créditos que não é dele. São 60 ms na
     bancada, mas segundos numa rede ruim — e este app termina em MENSAGEM DE
     WHATSAPP: empresa inventada com nome e telefone, numa tela que manda
     mensagem, é a mentira mais cara que este produto pode contar.

     Então, no boot: apaga o exemplo e liga o ESQUELETO das telas que buscam.
     UMA pintura só no fim (`usarDados` repinta a cada chamada; onze chamadas
     seriam onze repintes no quadro mais caro do app, o da abertura).

     🔴 A RÉGUA DO QUE ZERA: o que é DADO zera; o que é COPY fica. `vazios`
     (o texto de cada etapa sem card), `subtitulo` da carteira e a nota de rodapé
     são texto do desenho e não vêm do servidor — apagá-los deixaria a tela muda
     em vez de honesta. Já `chamados`, `saldo`, `lista` e `contagem` vêm do
     servidor: enquanto ele não falar, é VAZIO.

     🔴 E ZERA INTEIRO, NÃO OS CAMPOS QUE EU LEMBREI. No app do motorista essa
     economia custou uma tela mostrando "Dinheiro R$ 132,00 · Pix R$ 52,00" — os
     números do mock com cara de caixa do dia — porque só `saldo` tinha sido
     zerado e o que a ponte não escreve FICA.
     ========================================================================== */
  function apagarDemonstracao() {
    if (!temPonte()) return;
    const zerar = {
      /* O FUNIL. `carregando` liga o esqueleto e `placarCarregando` o do placar:
         são duas portas e cada uma sobe e cai sozinha. `etapa` NÃO zera — é do
         DEDO, e 'today' é onde a pessoa abre o app. */
      vendas: {
        carregando: true, semFonte: false,
        placarCarregando: true, placarSemFonte: false,
        subtitulo: '', chamados: '', respostas: '', conversao: '',
        aviso: '', avisoTom: '', busca: '',
        contagem: {}, blocos: { overdue: [], today: [], scheduled: [], closed: [] },
        carteira: '', vagas: '', vagasRotulo: '', vagasAlerta: 0,
      },
      /* O RADAR. `corrida:{}` é "nunca buscou" — a cena do CONVITE —, e ela não
         pode ser confundida com "busquei e não achei nada". `quantidade` e
         `quantidades` ficam: são a escolha do dedo e a régua do desenho.
         `custoPuxar` some porque preço é do servidor: preço escrito na tela sem
         o servidor ter falado é preço errado ensinado ao vendedor.
         ⚠️ E desde 19/08 ele fica vazio PARA SEMPRE, de propósito: nenhuma porta
         que este app alcança informa o custo por card (o `send-to-vendas` não
         devolve o debitado, e o catálogo de preço é do /master). A subtração de
         dois saldos que fazia esse papel mentia quando um colega gastava crédito
         no meio — ver a nota no `puxarLeadDoRadar`. */
      radar: {
        carregando: false, semFonte: false,
        segmento: '', cidade: '', uf: '', sugestoes: [],
        contagem: '', contando: 0, contagemSemFonte: 0,
        saldo: '', custoPuxar: '',
        corrida: {}, lista: [], comTelefone: '', puxados: '',
      },
      /* A AGENDA. `janela` é do dedo. `subtitulo` vira a data por extenso do dia
         operacional lá embaixo — aqui só sai o "Terça, 19 de agosto" do desenho,
         que seria a data errada em qualquer outro dia. */
      agenda: {
        carregando: true, semFonte: false,
        subtitulo: '', contas: {}, listas: { atrasadas: [], hoje: [], semana: [] },
        concluindo: '', remarcando: '', feitasHoje: '', proxima: '',
      },
      /* AS DUAS CONVERSAS. A segunda é o estado que o desenho mostra ao lado (chip
         no chão + lead sem WhatsApp): a ponte nunca escreve nela, mas ela existe
         em `T` e carrega "Empresa 2" com telefone — some do mesmo jeito. */
      conversas: {
        carregando: false, semFonte: false,
        lead: '', ini: '', nome: '', telefone: '', etapa: '', origem: '',
        temWhats: 0, chip: {}, canal: '', enviando: 0, vazio: '', conversa: [],
      },
      conversassemchip: {
        lead: '', ini: '', nome: '', telefone: '', etapa: '', origem: '',
        temWhats: 0, chip: {}, canal: '', enviando: 0, conversa: [],
      },
      /* A FICHA DO LEAD. As QUATRO listas zeram juntas e isso não é zelo: elas
         são do LEAD, não da tela. Sobrando do lead anterior, a ficha abriria com
         o telefone de outra empresa enquanto a resposta não chega — e é um dado
         que termina em ligação telefônica. `fone`/`email` vazios apagam os
         botões de canal, que é o lado certo de errar: canal sem destino manda a
         pessoa pro WhatsApp na tela de "número inválido". */
      leadficha: {
        carregando: false, semFonte: false,
        volta: 'vendas', id: '', ini: '', nome: '', tom: '',
        etapa: '', etapaTom: '', selo: '', seloTom: '', onde: '', segmento: '',
        fone: '', email: '', fones: [], emails: [],
        cnpj: '', razaoSocial: '', situacao: '', responsavel: '', nota: '', site: '',
        endereco: '', recado: '', linha: [], historia: [],
      },
      /* A CARTEIRA DE EMPRESAS. `ufs:[]` some com a fileira de chips inteira —
         27 siglas chutadas seriam filtro prometendo base que não existe. */
      empresas: {
        carregando: true, semFonte: false,
        busca: '', ufSel: '', ufs: [], lista: [],
        total: '', pagina: 1, totalPaginas: 1, carregandoMais: 0,
      },
      empresaficha: {
        carregando: false, semFonte: false,
        id: '', ini: '', nome: '', cnpj: '', documento: '', cidade: '', uf: '',
        endereco: '', numero: '', cep: '', pino: '', telefone: '', email: '',
        origem: '', desde: '', cliente: 0, lead: 0, fornecedor: 0,
        leadId: '', mandando: 0, contatos: [],
      },
      /* OS AJUSTES E AS QUATRO TELAS DE DENTRO.
         🔴 `zapLigado: null` e `sons: null` são "NÃO SEI", e não sei NÃO PINTA
         SELO nem CHAVE — a folha testa ausência. Selo "conectado" por omissão faz
         a pessoa escrever a mensagem e descobrir depois que nada saiu; chave
         ligada por omissão faz ela achar que desligou algo que nunca carregou. */
      ajustes: {
        carregando: true, semFonte: false,
        admin: 0, perfilNome: '', perfilSub: '',
        creditosLinha: '', creditosSub: '',
        zapLigado: null, zapNumero: '', modulosLinha: '',
        sons: null, versao: '', versaoSub: '', versaoTag: '',
      },
      perfil: {
        carregando: false, semFonte: false,
        nome: '', papel: '', email: '', telefone: '', empresa: '', cidade: '', aparelho: '',
      },
      whatsapp: {
        carregando: false, semFonte: false,
        conectado: null, numero: '', estado: '', conferido: '',
      },
      modulos: { carregando: false, semFonte: false, lista: [] },
      /* 🔴 `cobranca: 0` É O LADO SEGURO DO INTERRUPTOR DO DINHEIRO. A folha
         exige `cobranca===1` pra mostrar R$, pacote e botão de recarga; qualquer
         outra coisa cai na face neutra do vendedor. Se a ponte um dia errar, ela
         erra pro lado de ESCONDER preço — nunca pro de mostrar preço a quem o
         backend decidiu não mostrar (a Lei do Vendedor). */
      creditos: {
        carregando: true, semFonte: false,
        cobranca: 0, saldo: '', vence: '', pacotes: [], cta: '',
      },
      /* O TUTOR: `carregando:1` é "não sei ainda", e é ele que impede o tutorial
         obrigatório de disparar antes de o servidor dizer se a pessoa já o viu. */
      tutorial: { carregando: 1, obrigatorioVisto: 0, admin: 0 },
      /* A tela "você ainda não tem empresas" é COPY inteira e a ponte NÃO
         escreve nada nela. Ela tinha um `enviado` (o recibo da foto da lista),
         e ele saiu em 19/08 junto com as três portas de cadastro — que eram
         botões sem dono em ponte nenhuma e sem rota alcançável neste flavor
         (a nota inteira está em `T.semclientes`, no mock). Seção sem campo de
         dado não entra aqui: zerar o que não existe é como esta lista passa a
         mentir sobre o que ainda é demonstração. */
    };
    try {
      Object.keys(zerar).forEach((s) => { DADOS[s] = Object.assign({}, DADOS[s], zerar[s]); });
      /* Na ABERTURA não se repinta: ela é uma cena com relógio (a marca viaja
         pro cabeçalho) e a camada seria recriada do zero, cortando a animação no
         meio. Nenhuma destas telas está à vista agora — quem pinta com o valor
         novo é o `ir('vendas')` que encerra a abertura. */
      if (telaAtual() !== 'entrada' && typeof window.pintar === 'function') window.pintar(false);
    } catch (_) { /* sem seam: a casca não subiu, e aí não há o que apagar */ }
  }

  /* ==========================================================================
     A TELA ABRIU — o gancho de carregar.

     🔴 POR QUE NÃO INTERCEPTAR `data-ir` NO CLIQUE. Os atributos `data-ir` /
     `data-nav` / `data-tela` são do ROTEADOR DO MOCK, e mais gente aponta pra
     eles por NOME: o tour e a aula usam esses seletores como agulha
     (`acharAlvo`), e o `podarDesligados` varre por eles. Ponte que sequestra o
     atributo quebra os três em silêncio. Então a ponte não decide a navegação —
     ela só PERGUNTA, depois, qual tela ficou de pé.

     São duas entradas de propósito, e a segunda é a rede de segurança da
     primeira:
     · o embrulho de `window.ir` pega TODA troca de tela, inclusive a que a
       própria ponte pede (`window.ir('conversas')` depois de tocar num lead) e a
       que a abertura dispara sozinha ao terminar a cena;
     · o clique delegado pega o caso em que o embrulho não pegou.
     `telaAnunciada` faz as duas serem a mesma coisa: quem chegar primeiro
     anuncia, o outro cala. Sem essa trava, abrir o Radar dispararia a busca DUAS
     vezes — e no Radar duas chamadas é dinheiro.
     ========================================================================== */
  /* 🔴 O POUSO DA ABERTURA NÃO É UMA VISITA NOVA — e sem esta linha ele pagava a
     leitura do funil DUAS VEZES em todo boot. MEDIDO na bancada
     (`scripts/prova-ponte-vendas.js`, 19/08): `GET /vendas/board` pedido 2x,
     mais o `pending-summary` e o `report` de brinde. O boot carrega o funil
     porque a abertura ESPERA esse dado (`aberturaPronta`); segundos depois a
     cena termina no `ir('vendas')` e a tela "abre", disparando a mesma leitura —
     de dados que ninguém mudou no meio de uma animação.

     A cura é dizer a verdade em vez de cronometrar: o app POUSA no Funil (quem
     crava isso é o `armarAbertura` do mock, que termina em `ir('vendas')`), e o
     boot já carregou essa tela. Então ela nasce ANUNCIADA.
     ⚠️ Um relógio ("não releia nos próximos N segundos") foi tentado antes e é a
     régua errada: a cortina é segurada pelo aparelho (`HBXCenaComeca`), então o
     tempo entre o boot e o pouso NÃO TEM TETO — qualquer N seria chute, e um N
     grande engoliria releitura de verdade. */
  const TELA_DE_POUSO = 'vendas';
  let telaAnunciada = TELA_DE_POUSO;
  function anunciarTela() {
    const t = telaAtual();
    if (!t || t === telaAnunciada) return;
    telaAnunciada = t;
    const fn = TELAS_AO_ABRIR[t];
    if (!fn) return;
    // Carregador que estoura NÃO pode derrubar a navegação: a tela já trocou, e
    // quem paga o erro é o portão de fontes daquele módulo.
    try { fn(t); } catch (_) { /* o módulo cuida do próprio aviso */ }
  }
  if (typeof window.ir === 'function') {
    const irDoMock = window.ir;
    window.ir = function (k) {
      irDoMock(k);
      anunciarTela();
    };
  }
  document.addEventListener('click', anunciarTela);

  /* ==========================================================================
     A CARGA INICIAL.

     🔴 A ABERTURA ESPERA O DADO, NÃO UM RELÓGIO CEGO. A cena de entrada tem PISO
     (3,4 s) e TETO (7 s), e sai quando as duas coisas forem verdade: o piso
     passou E alguém chamou `window.aberturaPronta()`. Quem chama é o FUNIL —
     dando certo ou dando errado. "Falhar também é carregar": app que não abre
     porque o servidor caiu é pior que app aberto mostrando o aviso de fonte.

     🔴 E É UMA CORTINA SÓ. O flavor `vendas` passou a ligar `HBX_V2` no mesmo
     commit desta ponte: sem isso a `MainActivity` montava a cortina ANTIGA
     (`mountOpeningOverlay`) por cima desta cena e somava 1,63 s de espera — duas
     aberturas em sequência para o mesmo toque.
     ========================================================================== */
  const cargaInicial = () => {
    apagarDemonstracao();
    /* Os módulos vêm primeiro por um motivo de tela: é a resposta deles que diz
       quais botões a barra tem. Não bloqueia nada — quem espera é só a barra. */
    carregarModulos();
    checkAppUpdate();
    Promise.resolve(carregarFunil())
      .catch(() => {})
      .then(() => { try { if (typeof window.aberturaPronta === 'function') window.aberturaPronta(); } catch (_) {} });
    /* A linha da versão dos Ajustes é escrita ANTES de qualquer resposta de
       rede: ela sai do `appInfo()`, que é local. Sem isto a linha "Versão" ficava
       vazia até o primeiro `checkAppUpdate` responder — e ela é a PORTA MANUAL
       da atualização, ou seja, justamente a que não pode depender da rede. */
    pintarLinhaVersao();
    /* O DIA DE HOJE TAMBÉM É LOCAL, e o subtítulo da Agenda é dele. Escrito aqui
       (e não dentro do módulo da Agenda) por dois motivos: ele não depende de
       resposta nenhuma, então esperar a rede pra mostrar a data seria deixar a
       tela muda à toa; e a régua do fuso tem que morar num lugar só — a operação
       é São Paulo, nem o relógio do aparelho nem o do servidor (que roda em UTC).
       Cada tela que formatasse a própria data seria a segunda régua do mesmo
       fuso, e das 21h à meia-noite as duas discordariam. */
    usar('agenda', { subtitulo: dataPorExtenso(diaOperacional()) });
  };
  document.addEventListener('DOMContentLoaded', cargaInicial);
  if (document.readyState !== 'loading') setTimeout(cargaInicial, 0);

  /* O admin liga e desliga módulo com o app do vendedor ABERTO — é o caso
     normal, não a exceção (foi assim que o cliente 46 ficou com a Logística
     desligada e levou 39 respostas 403 em 65 segundos, sem uma palavra na tela).

     🔴 MEDIDO na mesma WebView do app do motorista: `visibilitychange` NÃO
     dispara aqui — a Activity fica viva e a WebView nunca é pausada. Evento que
     eu não vi disparar não é garantia, é esperança. A GARANTIA é o relógio; os
     dois eventos ficam como ATALHO: onde dispararem, obedece na hora.

     🔴 E O TIQUE NÃO PODE DERRUBAR A LIÇÃO. Todo `usarDados` monta uma camada
     nova, e o tutorial guiado vive DENTRO da camada: um tique de fundo no meio
     de um passo arrancaria o furo da tela sem ninguém ter encostado no aparelho.
     Uma leitura atrasada em um minuto não custa nada; o passo perdido custa a
     lição inteira. */
  const tourRodando = () => {
    try { return !!(window.TUTOR && typeof window.TUTOR.rodando === 'function' && window.TUTOR.rodando()); }
    catch (_) { return false; }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !tourRodando()) carregarModulos();
  });
  window.addEventListener('focus', () => { if (!tourRodando()) carregarModulos(); });
  setInterval(() => { if (!tourRodando()) carregarModulos(); }, 60000);

  /* ==========================================================================
     VENDAS — O FUNIL. A tela em que o app abre, e a que prova que ele é real.

     TRÊS PORTAS, TRÊS DESFECHOS INDEPENDENTES (é assim que a casca desenha):
       GET /vendas/board              → chips, lista, rodapé  (`carregando`)
       GET /vendas/report?period=30d  → o placar de cima      (`placarCarregando`)
       GET /vendas/pending-summary    → a faixa de aviso      (sem bandeira: ela
                                        só existe quando tem o que dizer)
     `Promise.allSettled` e não `Promise.all`: com `all`, o placar no chão
     derrubaria o FUNIL junto — e o funil é o app inteiro. Cada porta que falha
     deixa o SEU bloco no aviso e as outras seguem.

     🔴 O SEAM ESPELHA O SERVIDOR CHAVE A CHAVE, SEM RENOMEAR. `blocos` é
     `board.blocks` e `contagem` é `board.summary` (overdue/today/scheduled/
     closed). Campo renomeado no meio do caminho é o que descola do servidor no
     dia seguinte — e ninguém vê, porque a tela continua bonita com o valor
     velho.

     🔴 A BUSCA NÃO TEM PORTA NO SERVIDOR, e isso é decisão, não falta: o board
     já vem inteiro (take 240) e digitar não pode virar uma requisição por letra
     numa tela que o vendedor usa o dia todo. O filtro é LOCAL, sobre o que já
     chegou — e por isso ele nunca "acha" o que não veio: quem procura empresa
     que não está na carteira usa o Radar, que é a porta certa e está a um toque.
     ========================================================================== */

  /* O board CRU da última resposta. A tela mostra a versão FILTRADA (a busca do
     dedo), mas o filtro precisa reler o original a cada letra — senão apagar uma
     letra não devolveria os cards, porque eles já teriam sido jogados fora. */
  let boardCru = null;
  /* Um pedido por vez: quem chega no meio do voo recebe a MESMA promessa. Sem
     isto, dois gatilhos que caem juntos (o "Tentar de novo" tocado duas vezes,
     por exemplo) viram duas varreduras de 240 leads no servidor. */
  let funilEmVoo = null;

  /* 🔴 O TELEFONE DECIDE SE O CARTÃO É ACIONÁVEL, e é por isso que ele tem selo
     próprio (vermelho) em vez de sumir em silêncio: lead sem telefone num app
     que fala por WhatsApp é um card que nunca vai virar conversa, e o vendedor
     precisa VER isso na lista pra não abrir um por um. Esta régua é a mesma do
     desenho (`selo:'sem telefone', seloTom:'red', tom:'red'`). */
  function traduzirLead(lead) {
    const l = lead || {};
    const nome = String(l.name || '').trim();
    const fone = telefoneBonito(l.phone);
    const tentativas = Number(l.attemptCount) || 0;

    /* Um selo só, e a ordem é a da URGÊNCIA de quem lê: o impedimento primeiro
       (sem telefone), depois a oportunidade (empresa recém-aberta), e por último
       o histórico (quantas vezes já se bateu nesta porta). Três selos numa linha
       de 412 px viram tarja; o que importa é o de cima. */
    let selo = '';
    let seloTom = '';
    if (!fone) { selo = 'sem telefone'; seloTom = 'red'; }
    else if (l.isFreshCompany) { selo = 'empresa nova'; seloTom = 'lime'; }
    else if (tentativas > 1) { selo = `${tentativas} toques`; seloTom = ''; }

    return {
      // 🔴 SEM `id` A LINHA SAI INERTE — é o que o desenho já faz (`c.id?`). Lead
      // sem id no servidor não vira botão que abre o nada.
      id: String(l.id || ''),
      ini: esc(iniciais(nome)),
      nome: esc(nome),
      local: esc(local(l.city, l.state)),
      fone: esc(fone),
      etapa: esc(l.statusLabel || ''),
      etapaTom: tomDaEtapa(l.statusLabel),
      selo: esc(selo),
      seloTom,
      // "sem toque" é FATO (o servidor mandou `lastContactAt: null`), não falta
      // de fonte: é a notícia mais importante do cartão de um lead novo.
      toque: l.lastContactAt ? esc(quandoDoToque(l.lastContactAt)) : 'sem toque',
      tom: !fone ? 'red' : (l.isFreshCompany ? 'lime' : ''),
    };
  }

  /* O que o dedo digitou corta a lista que JÁ chegou. Compara sem acento e sem
     caixa porque ninguém digita "Bar do Zé" com o acento no lugar quando está na
     rua; e varre nome, cidade, UF e telefone — os campos que a própria caixa de
     busca promete ("Buscar empresa, cidade ou telefone"). Promessa escrita no
     `placeholder` é contrato.

     🔴 O FILTRO MORDE O LEAD CRU, NUNCA O CARTÃO JÁ TRADUZIDO. O cartão passou
     pelo `esc()` — uma empresa chamada "BAR & CIA" está guardada lá como
     "BAR &amp; CIA", e quem digitasse "bar & cia" não acharia a própria empresa
     que está na tela. Escapar é para PINTAR; procurar é sobre o dado. */
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const cabeNaBusca = (lead, alvo) => semAcento(
    [lead && lead.name, lead && lead.city, lead && lead.state, lead && lead.phone].filter(Boolean).join(' '),
  ).includes(alvo);

  /* Reescreve só a LISTA a partir do board já guardado — sem tocar na rede. É o
     que a busca e o "Tentar de novo" do chip chamam. */
  function publicarFunil() {
    if (!boardCru) return;
    let busca = '';
    try { busca = String((DADOS.vendas && DADOS.vendas.busca) || ''); } catch (_) {}
    const alvo = semAcento(busca).trim();
    const blocos = {};
    ['overdue', 'today', 'scheduled', 'closed'].forEach((k) => {
      const lista = Array.isArray(boardCru.blocks && boardCru.blocks[k]) ? boardCru.blocks[k] : [];
      blocos[k] = (alvo ? lista.filter((l) => cabeNaBusca(l, alvo)) : lista).map(traduzirLead);
    });
    usar('vendas', { blocos });
  }

  /* 🔴 A CONTAGEM DO CHIP É A DO SERVIDOR, NUNCA A DA LISTA FILTRADA. Se ela
     seguisse a busca, digitar uma letra faria os quatro chips despencarem e a
     pessoa leria "só tenho 1 atrasado" quando tem 12. O chip conta o FUNIL; a
     lista mostra o RECORTE. São duas perguntas diferentes na mesma tela. */
  function vestirBoard(board) {
    boardCru = board;
    const resumo = (board && board.summary) || {};
    const suprimento = (board && board.radarSupply) || {};

    /* O RODAPÉ responde "por que parou de chegar empresa nova". `activeCards` é
       o tamanho da carteira e `availableSlots` o que ainda cabe.
       🔴 ZERO AQUI É O NÚMERO MAIS IMPORTANTE DA LINHA, e por isso ele vira
       STRING: a folha testa AUSÊNCIA (`!=null && !==''`), nunca verdade — com o
       teste de verdade, "0 vagas" (a explicação inteira) sumiria da tela.
       🔴 CARTEIRA SEM TETO NÃO MOSTRA VAGA: `unlimited` é a lei do dono de
       27/06 ("à vontade"), e "0 vagas" ali seria o oposto do que é verdade. */
    const ilimitada = !!suprimento.unlimited;
    const cheia = !!suprimento.full;
    const pausada = !!suprimento.paused;
    const vagas = ilimitada ? '' : String(Math.max(0, Number(suprimento.availableSlots) || 0));

    /* A FAIXA DE AVISO TEM UM DONO SÓ POR VEZ. Se a carteira cheia e a pausa do
       Radar escrevessem as duas, a mesma notícia apareceria duplicada — e é a
       mesma notícia dita de dois jeitos. Ordem: o que BLOQUEIA vence o que
       explica. Quem manda no `blocked` é o `/vendas/pending-summary`, escrito
       logo abaixo, e ele só sobrescreve quando tem o que dizer. */
    let aviso = '';
    let avisoTom = '';
    if (cheia) { aviso = 'Carteira cheia — o Radar parou de mandar empresa nova.'; avisoTom = 'alerta'; }
    else if (pausada) { aviso = 'O Radar está pausado — nenhuma empresa nova está entrando.'; avisoTom = 'pausa'; }

    /* O SUBTÍTULO SAI DA CONTA, NÃO DO DESENHO. "Comece pelos atrasados" com
       zero atrasados é o app dando ordem errada logo na primeira linha que a
       pessoa lê. Sem nada a dizer, a linha SOME (a folha testa `v.subtitulo?`) —
       silêncio é melhor que conselho falso. */
    const atrasados = Number(resumo.overdue) || 0;
    const hoje = Number(resumo.today) || 0;
    const subtitulo = atrasados ? 'Comece pelos atrasados.'
      : hoje ? 'Seus retornos de hoje.'
        : '';

    usar('vendas', Object.assign({}, fonteVoltou, {
      subtitulo,
      contagem: {
        overdue: Number(resumo.overdue) || 0,
        today: Number(resumo.today) || 0,
        scheduled: Number(resumo.scheduled) || 0,
        closed: Number(resumo.closed) || 0,
      },
      carteira: String(Math.max(0, Number(suprimento.activeCards) || 0)),
      vagas,
      vagasRotulo: cheia ? 'carteira cheia' : 'vagas na carteira',
      vagasAlerta: cheia ? 1 : 0,
      aviso, avisoTom,
    }));
    publicarFunil();
  }

  /* O PLACAR — a leitura de 30 dias, e ela é OUTRA porta.
     🔴 CONVERSÃO SEM CHAMADA NÃO É 0%, É NADA. `taxaConversao` vem 0 quando
     ninguém foi chamado (0/0), e "0% de conversão" acusa de fracasso quem
     simplesmente ainda não começou. Sem denominador, o slot some — Lei do IF.
     Já "0 chamados" FICA: esse zero é a notícia. */
  function vestirPlacar(rel) {
    const m = (rel && rel.metrics) || {};
    const chamados = Math.max(0, Math.trunc(Number(m.cardsChamados) || 0));
    const respostas = Math.max(0, Math.trunc(Number(m.respostas) || 0));
    const taxa = Number(m.taxaConversao);
    usar('vendas', {
      placarCarregando: false, placarSemFonte: false,
      // O rótulo do período é do SERVIDOR (`period.label`): ele é quem resolve o
      // `?period=30d` em dias de verdade, e escrever "Últimos 30 dias" aqui
      // deixaria a tela mentindo no dia em que o padrão do backend mudasse.
      periodo: rel && rel.period && rel.period.label ? `Últimos ${esc(rel.period.label)}` : '',
      chamados: String(chamados),
      respostas: String(respostas),
      conversao: chamados && isFinite(taxa) ? `${Math.round(taxa * 100)}%` : '',
    });
  }

  /* A faixa de bloqueio do `pending-summary`. Ela VENCE o aviso da carteira
     porque é a única das duas que impede o trabalho de continuar — e por isso
     também não apaga nada quando não há bloqueio: ausência de bloqueio não é
     motivo pra limpar o recado que o board acabou de escrever. */
  function vestirPendencias(resumo) {
    if (!resumo || !resumo.blocked) return;
    const msg = String(resumo.message || '').trim();
    if (!msg) return;
    usar('vendas', { aviso: esc(msg), avisoTom: 'alerta' });
  }

  function carregarFunil() {
    if (!temPonte()) return Promise.resolve();
    if (funilEmVoo) return funilEmVoo;
    funilEmVoo = Promise.allSettled([
      window.API.get('/vendas/board'),
      window.API.get('/vendas/pending-summary'),
      window.API.get('/vendas/report?period=30d'),
    ]).then(([board, pend, rel]) => {
      /* 🔴 O `reason` DO `allSettled` É O ERRO INTEIRO, e é ele que decide a
         CENA. Esta é a tela em que o app POUSA — a primeira coisa que um
         cliente novo vê. Em 18/08 ela dizia "não consegui carregar · sem
         resposta do servidor" enquanto o servidor respondia, em 39 ms, que o
         módulo Vendas não estava liberado para aquela empresa. Sem o `reason`
         aqui a cura não chega justamente na tela que mais precisa dela. */
      if (board.status === 'fulfilled' && board.value) vestirBoard(board.value);
      else fonteCaiu('vendas', board.reason);

      if (rel.status === 'fulfilled' && rel.value) vestirPlacar(rel.value);
      else blocoCaiu('vendas', 'placarCarregando', 'placarSemFonte');

      // O resumo de pendências é o ÚNICO dos três sem bandeira própria na
      // casca: ele não tem bloco na tela, só empresta uma frase à faixa. Falhar
      // aqui não pode acender aviso nenhum — seria inventar um bloqueio.
      if (pend.status === 'fulfilled') vestirPendencias(pend.value);
    }).finally(() => { funilEmVoo = null; });
    return funilEmVoo;
  }

  /* ------------------------------------------------------------------------
     O QUE O DEDO FAZ NESTA TELA.
     ------------------------------------------------------------------------ */
  /* Entrar no Funil relê o funil. O POUSO da abertura não passa por aqui — quem
     explica é o `TELA_DE_POUSO` do `10-portao-fontes.js`. */
  registrarTelas({ vendas: carregarFunil });

  registrarAcoes({
    /* O chip da etapa é DO DEDO e não fala com a rede: os quatro baldes já
       vieram no mesmo `board`. Refazer a chamada aqui seria pagar uma varredura
       de 240 leads pra mostrar dado que já está na memória — e piscaria a tela. */
    'etapa-funil': (el) => {
      const etapa = String((el && el.dataset && el.dataset.etapa) || 'today');
      usar('vendas', { etapa });
    },
    // Os dois "Tentar de novo" da tela. Eles devolvem o ESQUELETO antes de pedir
    // de novo — sem isso o toque não responde nada por um segundo inteiro e a
    // pessoa toca outra vez.
    'recarregar-funil': () => retentar('vendas', carregarFunil),
    'recarregar-placar': () => {
      usar('vendas', { placarCarregando: true, placarSemFonte: false });
      carregarFunil();
    },
  });

  registrarCampos({
    /* 🔴 A BUSCA ESPERA O DEDO PARAR. Cada letra escreve no seam, e cada escrita
       remonta a camada (`pintar`): sem o respiro, digitar "distribuidora" são 14
       repintes seguidos na tela de quem está com o dedo no vidro. 180 ms é o
       piscar de olho — abaixo disso vira repinte por letra; acima, a lista
       parece travada.
       O caret sobrevive porque a casca mede e devolve o foco (`medirFoco`/
       `herdarFoco`); é por isso que este campo pode passar pelo seam de verdade
       em vez de escrever no nó por fora. */
    'busca-lead': {
      espera: 180,
      ao: (valor) => {
        usar('vendas', { busca: valor });
        publicarFunil();
      },
    },
  });

  /* ==========================================================================
     RADAR — a ÚNICA tela deste app em que o dedo vira DINHEIRO.

     São CINCO portas e cada uma tem desfecho próprio (nenhuma derruba a outra):
       GET  /webscraping/radar/leads              → a colheita (a lista)
       GET  /webscraping/radar/search-runs/latest → a corrida deixada rodando
       GET  /webscraping/radar/preference-suggestions → os chips de segmento
       GET  /credits/me                           → o saldo (o que sobra pra gastar)
       POST /webscraping/radar/count              → a contagem GRÁTIS
       POST /webscraping/radar/search-runs        → começar a busca (grátis)
       POST /webscraping/radar/search-runs/:id/cancel     → parar a busca
       POST /webscraping/radar/leads/:id/send-to-vendas   → 🔴 O ÚNICO QUE COBRA

     🔴 O RADAR RESPONDE FALHA COM 200. `buildRadarClientErrorResponse` devolve
     `{items:[], code, message, meta:{available:false}}` com status 200 — quem
     tratar só o `catch` acha que recebeu uma lista vazia e escreve na tela
     "nenhuma empresa com esse pedido" quando o que houve foi o Radar fora do ar.
     São cenas OPOSTAS (a lei nº1 do portão de fontes), então `meta.available
     === false` é lido como queda em TODAS as leituras deste arquivo.

     🔴 A CONTAGEM É GRÁTIS E VEM ANTES DE GASTAR — e por isso ela zera sozinha
     quando o pedido muda. Contagem velha ao lado de pedido novo é uma mentira
     barata que decide um gasto: "86 empresas batem" com a cidade já trocada faz
     a pessoa buscar (e puxar) achando que o número era daquele pedido.

     🔴 A CORRIDA É ASSÍNCRONA E VIVE NO SERVIDOR. "Ainda rodando" e "terminou e
     não achou" são CENAS DIFERENTES no desenho, e a diferença é o `status` do
     run — nunca o tamanho da lista. Sair da tela não mata a busca: ao voltar, o
     `/latest` reencontra a corrida e a tela continua de onde parou.
     ========================================================================== */

  /* Quanto da colheita a tela carrega de uma vez. Não é o tamanho da corrida
     (esse é o `quantidade`, escolha do dedo): é o teto de UMA tela de celular —
     a lista tem cartão de ~72 px e ninguém rola 2.000. */
  const TETO_DA_COLHEITA = 50;
  /* Os cinco desfechos do run no servidor que já são FIM. Escrito por extenso e
     não deduzido de `meta.terminal` porque é este mesmo vocabulário que separa
     as três cenas do desenho (terminou · cancelada · falhou). */
  const CORRIDA_ACABOU = ['completed', 'partial_error', 'completed_insufficient_results', 'failed', 'canceled'];
  const PASSO_DA_CORRIDA = 4000;   // o tique que acompanha a busca enquanto a tela está aberta

  let radarPrimeiraCarga = true;
  let radarSugestoesPedidas = false;
  let radarListaCrua = [];         // a resposta CRUA: o filtro e a tradução releem daqui
  let radarRunId = '';
  let radarRelogio = 0;
  let radarAchadosVistos = -1;     // pra só reler a colheita quando a corrida ANDOU
  let radarTropecos = 0;           // tiques seguidos sem resposta
  let radarSaldo = null;           // último saldo NUMÉRICO conhecido (a régua do custo medido)

  /* 🔴 OS DOIS COFRES DO DINHEIRO. `radarPuxando` é a reentrância: enquanto o id
     estiver aqui, nenhum segundo toque vira segunda cobrança — e como a tradução
     da lista LÊ estes dois conjuntos, qualquer repinte (o tique da corrida, o
     teclado, a volta de foco) redesenha o botão JÁ travado. Guarda que mora só
     no nó do DOM morre no primeiro repinte, e aí o dedo paga duas vezes. */
  const radarPuxando = new Set();
  const radarPuxados = new Set();  // ids que o servidor confirmou nesta sessão

  /* O pedido é do DEDO e mora no seam. Ler daqui — e não de uma variável
     paralela — é o que faz o campo, o chip de sugestão, a contagem e a corrida
     falarem do MESMO pedido; bandeira paralela ao dado é como as duas
     discordam no dia seguinte. */
  const pedidoDoRadar = () => {
    let d = {};
    try { d = DADOS.radar || {}; } catch (_) { d = {}; }
    return {
      segmento: String(d.segmento || '').trim(),
      cidade: String(d.cidade || '').trim(),
      uf: String(d.uf || '').trim().toUpperCase(),
      // o servidor aceita 1..100; fora disso ele responde 400 e o toque some sem cena
      quantidade: Math.max(1, Math.min(100, Math.trunc(Number(d.quantidade) || 20))),
    };
  };

  /* Resposta do Radar que chegou 200 mas está dizendo "eu caí". Ver o bloco 🔴
     do topo: sem esta régua, queda de servidor vira "não achei nada". */
  const radarCaiu = (r) => !r || (r.meta && r.meta.available === false);

  /* JÁ ESTÁ NA CARTEIRA — e a régua é generosa DE PROPÓSITO. Errar pro lado de
     "já é seu" esconde um botão de cobrança; errar pro outro lado cobra de novo
     por uma empresa que a pessoa já pagou. Entre um botão a menos e uma
     cobrança a mais, esta casa escolhe o botão a menos. */
  const naCarteiraDoRadar = (c) => !!(c && (
    radarPuxados.has(String(c.id || ''))
    || c.vendasLeadId
    || c.ownershipStatus === 'mine'
    || c.companyStatus === 'sent_to_vendas'
    || c.companyStatus === 'in_attendance'
  ));

  function traduzirCardDoRadar(l) {
    const c = l || {};
    const id = String(c.id || '');
    const presenca = c.channelPresence || {};
    const nome = String(c.name || '').trim();
    const nota = Number(c.rating);
    return {
      // sem id a linha não vira botão de cobrança — o desenho já testa `l.id`
      id,
      ini: esc(iniciais(nome)),
      nome: esc(nome),
      /* 🔴 O "· 3,2 km" DO DESENHO NÃO TEM FONTE. A porta devolve cidade e UF,
         nunca distância — escrever um número de quilômetro aqui seria inventar
         a informação que mais parece verdade nesta tela. Some, e a linha lê
         "Valinhos · SP", que é o que o servidor disse. */
      onde: esc(local(c.city, c.state)),
      segmento: esc(c.businessCategory || c.segment || ''),
      /* Os selos são SINAL DE VENDA e cada um só existe com o fato por trás.
         `channelPresence` é calculado ANTES da máscara de contato, então ele
         continua honesto no card que ainda não foi puxado (onde o telefone vem
         vazio de propósito) — é a única leitura que não mente aqui. */
      zap: c.hasWhatsapp ? 1 : 0,
      semSite: presenca.site === false ? 1 : 0,
      nota: isFinite(nota) && nota > 0 ? esc(`${nota.toFixed(1).replace('.', ',')} de nota`) : '',
      puxado: naCarteiraDoRadar(c) ? 1 : 0,
      puxando: radarPuxando.has(id) ? 1 : 0,
    };
  }

  /* A colheita traduzida + as duas contas do rodapé, num objeto só: quem escreve
     no seam escreve UMA vez (cada `usar` remonta a camada inteira). */
  function montarColheitaDoRadar() {
    const hoje = diaOperacional();
    const comFone = radarListaCrua.filter((c) => c && c.hasPhone).length;
    const puxadasHoje = radarListaCrua.filter((c) => c && c.claimedAt && diaEmSp(c.claimedAt) === hoje).length;
    return {
      lista: radarListaCrua.map(traduzirCardDoRadar),
      /* ZERO AQUI É NOTÍCIA e por isso vira string: "0 com telefone" numa lista
         de 12 empresas é o motivo de nenhuma delas virar conversa, e é a coisa
         mais útil que o rodapé pode dizer. Já "0 puxadas hoje" não é notícia
         nenhuma — some, como o desenho manda (`d.puxados?`). */
      comTelefone: String(comFone),
      puxados: puxadasHoje ? String(puxadasHoje) : '',
    };
  }
  const publicarColheitaDoRadar = () => usar('radar', montarColheitaDoRadar());

  /* ------------------------------------------------------------------------
     AS LEITURAS.
     ------------------------------------------------------------------------ */
  function carregarColheitaDoRadar() {
    const p = pedidoDoRadar();
    /* O pedido do dedo VIRA FILTRO da colheita: a lista se chama "Empresas
       encontradas", então ela mostra o que casa com o que foi pedido. Sem
       pedido nenhum (o boot), vem a lagoa inteira da empresa — que é a resposta
       certa pra "o que eu já tenho aqui". */
    const q = [`limit=${TETO_DA_COLHEITA}`];
    if (p.segmento) q.push(`segment=${encodeURIComponent(p.segmento)}`);
    if (p.cidade) q.push(`city=${encodeURIComponent(p.cidade)}`);
    if (p.uf) q.push(`state=${encodeURIComponent(p.uf)}`);
    return window.API.get(`/webscraping/radar/leads?${q.join('&')}`).then((r) => {
      if (radarCaiu(r)) { fonteCaiu('radar'); return; }
      radarListaCrua = Array.isArray(r.items) ? r.items : [];
      usar('radar', Object.assign({}, fonteVoltou, montarColheitaDoRadar()));
    }).catch((e) => fonteCaiu('radar', e));
  }

  /* 🔴 O SALDO É LIDO, NUNCA CONTADO NA MÃO. Descontar 1 da tela depois de puxar
     seria a tela mantendo a própria contabilidade — e ela erra no primeiro card
     que o motor marcar como não-cobrável (o `review_backup` entra de graça). */
  function carregarSaldoDoRadar() {
    return window.API.get('/credits/me').then((c) => {
      /* As DUAS faces do `/credits/me`: `balance` pra audiência de cobrança,
         `leadsDisponiveis` pro vendedor (1 crédito = 1 lead). Aqui as duas
         valem o mesmo número — o que a pessoa ainda pode puxar. */
      const n = typeof (c && c.balance) === 'number' ? c.balance
        : (typeof (c && c.leadsDisponiveis) === 'number' ? c.leadsDisponiveis : null);
      if (n == null) return null;
      radarSaldo = n;
      usar('radar', { saldo: String(n) });
      return n;
    }).catch(() => null);
  }

  function carregarSugestoesDoRadar() {
    if (radarSugestoesPedidas) return Promise.resolve();
    radarSugestoesPedidas = true;
    return window.API.get('/webscraping/radar/preference-suggestions').then((r) => {
      const lista = Array.isArray(r && r.suggestions) ? r.suggestions : [];
      /* Chip é o que a EMPRESA já vendeu (afinidade de segmento do servidor).
         Sem fonte, nenhum chip e o campo continua servindo sozinho — chip
         inventado manda a vendedora caçar um segmento que o motor não conhece.

         🔴 AQUI O `esc()` SERIA O BUG, e é a única exceção desta ponte. O texto
         do chip não é só texto: ele vira o PEDIDO (`data-segmento` → o campo →
         o corpo do POST). Escapado, a empresa procuraria por "bar &amp; cia" e
         o motor não acharia nada. Então ele viaja CRU e quem não couber num
         atributo do desenho (aspas e sinais de marcação, que não existem em
         nome de segmento de verdade) simplesmente não vira chip — o campo
         continua aceitando qualquer coisa que a pessoa digitar. */
      const cabeNoChip = (s) => s && !/["'<>&]/.test(s);
      usar('radar', { sugestoes: lista.map((s) => String((s && s.segment) || '').trim()).filter(cabeNoChip) });
    }).catch(() => { radarSugestoesPedidas = false; });
  }

  /* ------------------------------------------------------------------------
     A CORRIDA — quatro palavras pro que o servidor fala em oito status.
     ------------------------------------------------------------------------ */
  const corridaZerada = { rodando: 0, terminou: 0, cancelada: 0, falhou: 0, pct: 0, achados: '0', alvo: '0', etapa: '', mensagem: '' };

  /** Escreve a cena da corrida. Devolve `true` se ela acabou, `false` se segue
   *  viva, `null` quando não há corrida nenhuma pra mostrar. */
  function vestirCorridaDoRadar(r) {
    if (!r || !r.id) return null;
    const status = String(r.status || '');
    const acabou = CORRIDA_ACABOU.indexOf(status) >= 0;
    const meta = r.meta || {};
    const recado = String(meta.operationalMessage || r.message || r.errorMessage || '');
    radarRunId = String(r.id);
    usar('radar', {
      corrida: {
        rodando: acabou ? 0 : 1,
        terminou: (status === 'completed' || status === 'partial_error' || status === 'completed_insufficient_results') ? 1 : 0,
        cancelada: status === 'canceled' ? 1 : 0,
        falhou: status === 'failed' ? 1 : 0,
        pct: Math.max(0, Math.min(100, Math.trunc(Number(meta.progress) || 0))),
        achados: String(Math.max(0, Math.trunc(Number(r.foundCount) || Number(meta.deliveredCount) || 0))),
        alvo: String(Math.max(0, Math.trunc(Number(r.targetQuantity) || 0))),
        /* A frase do servidor É a etapa. Ela é o que separa "procurando em
           Valinhos" de "pausado, sem cota" — dois estados que caem no mesmo
           `rodando` e que a pessoa precisa distinguir pra decidir se espera. */
        etapa: acabou ? '' : esc(recado),
        mensagem: esc(recado),
      },
    });
    return acabou;
  }

  function pararRelogioDoRadar() {
    if (radarRelogio) { clearInterval(radarRelogio); radarRelogio = 0; }
  }

  /* 🔴 O RELÓGIO É DA TELA, NÃO DA CORRIDA. A busca roda no servidor com ou sem
     ninguém olhando (é isso que o banner promete); o tique só existe pra pintar
     o progresso. Deixá-lo vivo com o app noutra tela seria pagar uma requisição
     a cada 4 s pelo dia inteiro pra mostrar uma barra que ninguém está vendo —
     quem reencontra a corrida na volta é o `/latest`, que custa uma ida só. */
  function acompanharCorridaDoRadar() {
    pararRelogioDoRadar();
    if (!radarRunId) return;
    radarAchadosVistos = -1;
    radarTropecos = 0;
    radarRelogio = setInterval(() => {
      if (telaAtual() !== 'radar' || !radarRunId) { pararRelogioDoRadar(); return; }
      window.API.get(`/webscraping/radar/search-runs/${encodeURIComponent(radarRunId)}`).then((r) => {
        if (radarCaiu(r)) {
          /* Run que o servidor não acha mais: a busca acabou e foi recolhida.
             Isso não é falha — some com a cena da corrida e deixa a colheita,
             que é o que sobrou dela. */
          radarRunId = '';
          pararRelogioDoRadar();
          usar('radar', { corrida: {} });
          carregarColheitaDoRadar();
          return;
        }
        radarTropecos = 0;
        const acabou = vestirCorridaDoRadar(r);
        const achados = Math.max(0, Math.trunc(Number(r.foundCount) || 0));
        /* A colheita só é relida quando a corrida ANDOU (ou acabou). Sem esta
           régua, cada tique pagaria uma varredura da lagoa inteira pra
           redesenhar exatamente os mesmos cartões. */
        if (acabou || achados !== radarAchadosVistos) {
          radarAchadosVistos = achados;
          carregarColheitaDoRadar();
        }
        if (acabou) { radarRunId = ''; pararRelogioDoRadar(); }
      }).catch(() => {
        /* Tique que não respondeu NÃO apaga a corrida — a busca continua viva no
           servidor. Depois de três seguidos o relógio desiste (bateria) e a tela
           diz a verdade: eu perdi o contato, não que a busca morreu. Reabrir a
           tela refaz o encontro pelo `/latest`. */
        radarTropecos += 1;
        if (radarTropecos < 3) return;
        pararRelogioDoRadar();
        let cena = {};
        try { cena = (DADOS.radar && DADOS.radar.corrida) || {}; } catch (_) { cena = {}; }
        usar('radar', { corrida: Object.assign({}, cena, { etapa: 'Sem resposta do servidor agora.' }) });
      });
    }, PASSO_DA_CORRIDA);
  }

  function recuperarCorridaDoRadar() {
    /* `/latest` só devolve corrida VIVA (queued/running/sleeping/paused) e
       responde vazio quando não há nenhuma — por isso o silêncio aqui é a
       resposta certa, e não uma falha a anunciar. */
    return window.API.get('/webscraping/radar/search-runs/latest').then((r) => {
      if (radarCaiu(r)) return;
      const acabou = vestirCorridaDoRadar(r);
      if (acabou === false) acompanharCorridaDoRadar();
    }).catch(() => {});
  }

  function carregarRadar() {
    if (!temPonte()) return Promise.resolve();
    /* O Radar nasce SEM esqueleto (`carregando:false` no `apagarDemonstracao`)
       porque a cena de estreia dele é o CONVITE, não uma lista. O esqueleto
       entra só na primeira busca de verdade — e é ele que autoriza o
       `fonteCaiu` a trocar a tela pelo aviso (lei: rede caída só apaga tela na
       PRIMEIRA carga). */
    if (radarPrimeiraCarga) usar('radar', { carregando: true, semFonte: false });
    return Promise.allSettled([
      carregarColheitaDoRadar(),
      recuperarCorridaDoRadar(),
      carregarSugestoesDoRadar(),
      carregarSaldoDoRadar(),
    ]).then(() => { radarPrimeiraCarga = false; });
  }

  /* ------------------------------------------------------------------------
     O QUE O DEDO FAZ — e o que ele CUSTA.
     ------------------------------------------------------------------------ */

  /* CONTAR É GRÁTIS e tem par de bandeiras PRÓPRIO (`contando`/
     `contagemSemFonte`): a contagem no chão não pode apagar a colheita, nem o
     contrário. São duas portas na mesma tela. */
  function contarNoRadar() {
    if (!temPonte()) return;
    const p = pedidoDoRadar();
    if (!p.segmento && !p.cidade && !p.uf) {
      avisoErro(new Error('Escreva o que você procura antes de contar.'));
      return;
    }
    usar('radar', { contando: 1, contagemSemFonte: 0 });
    window.API.post('/webscraping/radar/count', { segment: p.segmento, city: p.cidade, uf: p.uf }).then((r) => {
      const disponivel = !!(r && r.available) && r.count != null;
      if (!disponivel) {
        /* "A base não está carregada neste ambiente" tem a MESMA cara de rede
           caída pra quem olha: nos dois casos não existe número. O que não pode
           é virar "0 empresas batem" — isso mandaria a pessoa desistir de uma
           cidade cheia. */
        usar('radar', { contando: 0, contagemSemFonte: 1, contagem: '' });
        return;
      }
      const n = Math.max(0, Math.trunc(Number(r.count)));
      // o servidor capa a contagem num teto e marca `approx` — o "+" é dele, não meu
      usar('radar', { contando: 0, contagemSemFonte: 0, contagem: r.approx ? `${n}+` : String(n) });
    }).catch(() => usar('radar', { contando: 0, contagemSemFonte: 1 }));
  }

  function buscarNoRadar(el) {
    if (!temPonte()) return;
    const p = pedidoDoRadar();
    /* O servidor exige cidade E segmento (`Cidade e segmento sao obrigatorios`).
       Deixar o 400 chegar funcionaria, mas gastaria uma ida à rede pra dizer o
       que já dá pra ver — e a frase daqui aponta os DOIS campos que faltam. */
    if (!p.segmento || !p.cidade) {
      avisoErro(new Error('Escreva o que você procura e a cidade — o Radar precisa dos dois.'));
      return;
    }
    if (el) { el.disabled = true; el.setAttribute('aria-busy', 'true'); }
    // A cena de "abrindo" entra no MESMO quadro do dedo: o pé vira "Buscando…" e
    // o Parar aparece antes de qualquer resposta.
    usar('radar', { corrida: Object.assign({}, corridaZerada, { rodando: 1, alvo: String(p.quantidade), etapa: 'Abrindo a busca…' }) });
    window.API.post('/webscraping/radar/search-runs', {
      segment: p.segmento, city: p.cidade, state: p.uf, quantity: p.quantidade,
    }).then((r) => {
      if (radarCaiu(r)) {
        usar('radar', { corrida: Object.assign({}, corridaZerada, { falhou: 1, alvo: String(p.quantidade), mensagem: esc((r && r.message) || 'A busca não começou.') }) });
        return;
      }
      const acabou = vestirCorridaDoRadar(r);
      if (acabou === null) { usar('radar', { corrida: {} }); return; }
      carregarColheitaDoRadar();
      if (!acabou) acompanharCorridaDoRadar();
    }).catch((erro) => {
      usar('radar', { corrida: Object.assign({}, corridaZerada, { falhou: 1, alvo: String(p.quantidade), mensagem: esc((erro && erro.message) || '') }) });
    });
  }

  function pararCorridaDoRadar(el) {
    if (!temPonte() || !radarRunId) return;
    if (el) { el.disabled = true; el.setAttribute('aria-busy', 'true'); }
    const alvo = radarRunId;
    pararRelogioDoRadar();
    window.API.post(`/webscraping/radar/search-runs/${encodeURIComponent(alvo)}/cancel`).then((r) => {
      radarRunId = '';
      if (radarCaiu(r)) { usar('radar', { corrida: Object.assign({}, corridaZerada, { cancelada: 1 }) }); }
      else vestirCorridaDoRadar(r);
      // o que chegou até o instante da parada é da pessoa e continua na tela
      carregarColheitaDoRadar();
    }).catch((erro) => {
      // O cancelamento não pegou: a busca CONTINUA. Voltar a acompanhar é o
      // honesto — dizer "parada" sem o servidor ter confirmado é a mentira que
      // faz a pessoa tocar em Buscar e nascer a segunda corrida.
      radarRunId = alvo;
      acompanharCorridaDoRadar();
      avisoErro(erro);
    });
  }

  /* ==========================================================================
     🔴 O PUXAR — O ÚNICO TOQUE DESTE APLICATIVO QUE VIRA DINHEIRO.

     A trava tem TRÊS camadas e as três entram no MESMO quadro do dedo, antes de
     qualquer ida à rede:
       1. o `Set` de reentrância (memória do módulo) — o segundo toque morre aqui
          mesmo que o nó do DOM tenha sido trocado por um repinte no meio;
       2. o nó tocado (`disabled` + `aria-busy`) — o dedo vê a reação na hora;
       3. o SEAM (`puxando:1`) — o repinte redesenha o botão JÁ travado, que é o
          que faz a trava sobreviver ao tique da corrida e à volta do teclado.

     🔴 E ELA SÓ SAI POR RESPOSTA DO SERVIDOR, NUNCA POR RELÓGIO. Um `setTimeout`
     que destravasse o botão devolveria o toque a uma cobrança que talvez tenha
     acontecido — e a segunda cobrança não tem `git revert`.
     ========================================================================== */
  function puxarLeadDoRadar(el) {
    if (!temPonte()) return;
    const id = String((el && el.dataset && el.dataset.lead) || '');
    if (!id) return;
    if (radarPuxando.has(id) || radarPuxados.has(id)) return;

    radarPuxando.add(id);
    if (el) {
      el.disabled = true;
      el.setAttribute('aria-busy', 'true');
      el.classList.add('aguarde');
    }
    publicarColheitaDoRadar();

    window.API.post(`/webscraping/radar/leads/${encodeURIComponent(id)}/send-to-vendas`, {}).then(() => {
      radarPuxados.add(id);
      radarPuxando.delete(id);
      publicarColheitaDoRadar();
      /* 🔴 O SALDO É RELIDO. O PREÇO, NÃO — E ESSA É A CORREÇÃO DE 19/08.
         Até aqui a tela escrevia o preço do botão que COBRA como a subtração de
         dois saldos lidos em momentos diferentes (`antes - agora`). Parecia
         "fato medido"; não era. O `/credits/me` devolve o saldo da EMPRESA, não
         do usuário: qualquer crédito que um colega consumisse no computador
         entre as duas leituras entrava na conta e virava "o preço do meu
         clique". Num tenant com dois vendedores trabalhando ao mesmo tempo, o
         botão passaria a anunciar 3, 7, 12 créditos por empresa — e é por esse
         número que a pessoa decide gastar.

         E não há de onde tirar o número certo hoje: o `send-to-vendas` responde
         `{ok, radarLeadId, vendasLeadId, import}` e não diz quanto debitou (o
         `reserveLeadDeliveryCredit` sabe, e guarda pra si); o `/webscraping/
         radar/count` é a CONTAGEM, que é de graça; e o catálogo de preço de
         ação é do /master, sem porta pública. Preço só se escreve quando o
         servidor o informa — a Lei nº4 desta ponte, e a régua da casa: número
         de dinheiro inventado na tela é pior que número ausente.
         O dia em que o `send-to-vendas` devolver `debited`, é UMA linha aqui. */
      return carregarSaldoDoRadar();
    }).catch((erro) => {
      radarPuxando.delete(id);
      publicarColheitaDoRadar();
      /* 🔴 SEM SALDO O SERVIDOR RESPONDE 409, e esse caso tem cena própria: uma
         caixa vermelha genérica ("Não deu certo") faria a pessoa tocar de novo
         no mesmo botão. O portão diz o número REAL que ela tem — o catálogo do
         mock traz "0 créditos / 1 por empresa / 14 na carteira" cravados no
         desenho, e número de dinheiro cravado é o que esta casa não publica. */
      if (erro && erro.status === 409) { travaDeCreditoDoRadar(erro); return; }
      avisoErro(erro);
    });
  }

  function travaDeCreditoDoRadar(erro) {
    if (typeof window.portao !== 'function') return;
    const saldo = radarSaldo == null ? '' : String(radarSaldo);
    window.portao({
      tom: 'trava', ico: 'card', titulo: 'Créditos acabaram',
      sub: String((erro && erro.message) || 'Sem crédito o Radar não manda empresa nova.')
        + ' Buscar e contar continuam de graça.',
      corpo: saldo ? `<div class="pt-nums"><div><b>${esc(saldo)}</b><small>créditos seus</small></div></div>` : '',
      acoes: [['Fechar', '']],
    });
  }

  /* ------------------------------------------------------------------------
     OS REGISTROS.
     ------------------------------------------------------------------------ */
  registrarTelas({ radar: carregarRadar });

  registrarAcoes({
    'radar-contar': () => contarNoRadar(),
    'radar-buscar': (el) => buscarNoRadar(el),
    'radar-cancelar': (el) => pararCorridaDoRadar(el),
    'puxar-lead': (el) => puxarLeadDoRadar(el),
    'radar-recarregar': () => retentar('radar', carregarRadar),

    /* Chip de sugestão é um PEDIDO INTEIRO trocado num toque — então ele zera a
       contagem (que era de outro pedido) e relê a colheita. Diferente de digitar
       letra a letra, aqui a pessoa afirmou o que quer. */
    'radar-sugestao': (el) => {
      const seg = String((el && el.dataset && el.dataset.segmento) || '');
      if (!seg) return;
      usar('radar', { segmento: seg, contagem: '', contagemSemFonte: 0 });
      carregarColheitaDoRadar();
    },
    // Quantas trazer é o tamanho da CORRIDA, não o da conta — não fala com a rede.
    'radar-quantidade': (el) => {
      const q = Math.max(1, Math.min(100, Math.trunc(Number((el && el.dataset && el.dataset.quantidade)) || 0)));
      if (q) usar('radar', { quantidade: q });
    },
  });

  /* 🔴 MUDOU O PEDIDO, MORREU A CONTAGEM. Os três campos escrevem no seam com
     respiro (sem ele é um repinte por letra numa tela com o dedo no vidro) e
     apagam o número da contagem junto: "86 empresas batem" ao lado de uma
     cidade que a pessoa acabou de trocar é a mentira mais barata desta tela — e
     é ela que decide um gasto logo em seguida. */
  const trocarPedidoDoRadar = (campo) => (valor) => {
    const novo = {};
    novo[campo] = campo === 'uf' ? String(valor || '').toUpperCase() : valor;
    novo.contagem = '';
    novo.contagemSemFonte = 0;
    usar('radar', novo);
  };

  registrarCampos({
    'radar-segmento': {
      espera: 180,
      ao: trocarPedidoDoRadar('segmento'),
      /* A tecla de confirmar do teclado do Android (`enterkeyhint="search"`) é um
         botão de verdade na cara da pessoa. Ela responde com a CONTAGEM, que é
         grátis, instantânea e não cria nada: começar uma corrida com o formulário
         pela metade nasceria em 400 ("falta a cidade") a cada Enter apressado.
         O verbo que busca continua onde o desenho o pôs — o botão do pé. */
      aoEnter: () => contarNoRadar(),
    },
    'radar-cidade': { espera: 180, ao: trocarPedidoDoRadar('cidade') },
    'radar-uf': { espera: 180, ao: trocarPedidoDoRadar('uf') },
  });

  /* ==========================================================================
     AGENDA — a fila do dia, com UM verbo: fechar.

     UMA PORTA SÓ, E ELA JÁ TRAZ OS TRÊS BALDES:
       GET  /atividades/agenda?janela=todas&incluirConcluidas=1
       POST /atividades/:id/concluir     (resultado: sim | nao | remarcar)

     🔴 TROCAR DE CHIP NÃO FALA COM A REDE. Medido no `listForUser`: ele IGNORA
     o parâmetro `janela` e devolve `counts` + atrasadas + hoje + semana numa
     resposta só. Chip que dispara fetch numa rede ruim vira esqueleto piscando
     três vezes pela MESMA resposta que já está na mão — e o `?janela=todas` vai
     escrito assim, por extenso, pra dizer em voz alta o que se está pedindo.

     🔴 `incluirConcluidas=1` NÃO É ENFEITE: sem ele o servidor devolve só
     pendentes e "concluídas hoje" ficaria vazio pra sempre. A célula some
     sozinha quando o número é zero — zero mentiroso é pior que célula ausente.

     🔴 O TEXTO DA DATA NASCE AQUI, NUNCA NA TELA. `vencimento` chega em ISO e
     vira "Hoje"/"Sexta · 15/08"/"09:30 · 15 min" nesta ponte, no fuso da
     OPERAÇÃO (São Paulo) — o servidor roda em UTC e o aparelho pode estar em
     qualquer fuso. Duas réguas do mesmo fuso discordam entre 21 h e a
     meia-noite, e aí a agenda mostra o dia errado exatamente na hora em que o
     vendedor está fechando o dia.
     ========================================================================== */

  /* Os quatro tipos que o `ATIVIDADE_TIPOS` do servidor aceita. Tipo que não
     está nesta lista vai VAZIO: o desenho já tem o caso ('Tarefa', glifo de
     nota), e inventar um quinto rótulo aqui seria a tela ensinando um
     vocabulário que o backend recusa no próximo POST. */
  const TIPOS_DA_AGENDA = ['ligacao', 'reuniao', 'visita', 'mensagem'];
  /* 🔴 SÃO PAULO NÃO TEM HORÁRIO DE VERÃO DESDE 2019 — por isso o deslocamento
     é constante e pode ser escrito. Ele existe porque "remarcar pra amanhã" tem
     que virar um instante ANCORADO no fuso da operação: mandar "2026-08-20T09:00"
     sem offset faz o servidor (UTC) marcar a tarefa pras 06:00 de São Paulo. */
  const FUSO_DA_AGENDA = '-03:00';

  let agendaEmVoo = null;
  let agendaCrua = null;                  // a resposta CRUA — o remarcar relê o vencimento daqui
  const agendaFechando = new Set();       // reentrância: um id, uma conclusão

  /** "09:30" no fuso da operação. NÃO é o `hora()` do núcleo: aquele lê o
   *  relógio do APARELHO (`getHours`), e a agenda é o dia de São Paulo. Com o
   *  celular em outro fuso, o `hora()` mostraria a ligação das 09:00 marcada
   *  pras 05:00 — e o remarcar gravaria essa hora errada de volta no servidor. */
  const horaSpDaAgenda = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  };

  /** "Sexta" — o dia da semana de um AAAA-MM-DD. Montado em UTC de propósito:
   *  `new Date('2026-08-19')` é meia-noite UTC, que no Brasil ainda é o dia 18.
   *  O "-feira" cai porque este texto é CABEÇALHO DE GRUPO ("Sexta · 15/08"),
   *  não frase: é assim que o desenho o mostra, e é assim que se escreve um dia
   *  da semana em cima de uma lista. A data por extenso do subtítulo (que é
   *  frase) continua com ele, e as duas estão certas em registros diferentes. */
  const semanaDaAgenda = (ymd) => {
    const [a, m, d] = String(ymd || '').split('-').map(Number);
    if (!a || !m || !d) return '';
    const x = new Date(Date.UTC(a, m - 1, d));
    const txt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long' })
      .format(x).replace(/-feira$/, '');
    return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : '';
  };

  const somarDiasNaAgenda = (ymd, dias) => {
    const [a, m, d] = String(ymd || '').split('-').map(Number);
    if (!a || !m || !d) return '';
    const x = new Date(Date.UTC(a, m - 1, d) + (Number(dias) || 0) * 86400000);
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
  };

  /* O atraso é contado em DIAS DE CALENDÁRIO de São Paulo, não em 24 h
     corridas: às 23 h, uma tarefa das 08 h de hoje está atrasada — mas não "há
     1 dia". O servidor já disse QUE está atrasada (`atrasada`); aqui só se diz
     HÁ QUANTO, que é o que muda a ordem de quem ligar primeiro. */
  const atrasoDaAgenda = (ymd, hoje) => {
    if (!ymd || !hoje) return '';
    const dias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${ymd}T12:00:00Z`)) / 86400000);
    if (!isFinite(dias) || dias <= 0) return 'atrasada';
    return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
  };

  function traduzirAtividadeDaAgenda(a) {
    const x = a || {};
    const iso = x.vencimento || '';
    const ymd = diaEmSp(iso);
    const hoje = diaOperacional();
    const inteiro = !!x.diaInteiro;
    const minutos = Math.trunc(Number(x.duracao) || 0);
    const hm = horaSpDaAgenda(iso);
    const curto = diaCurto(iso);

    /* O cabeçalho do DIA viaja DENTRO da linha (é o desenho que agrupa): quem
       sabe onde o dia troca é quem ordenou. "Hoje" em vez da data porque no
       balde de hoje a data seria a legenda do óbvio. */
    const dia = !ymd ? '' : ymd === hoje ? 'Hoje' : [semanaDaAgenda(ymd), curto].filter(Boolean).join(' · ');
    /* O QUANDO responde perguntas diferentes em cada balde: hoje é HORA (e
       quanto dura); fora de hoje é o DIA e a hora. "dia inteiro" é o que o
       servidor chama de `duracao: null` — tarefa sem hora marcada. */
    const quando = !iso ? ''
      : ymd === hoje
        ? (inteiro ? 'dia inteiro' : [hm, minutos > 0 ? `${minutos} min` : ''].filter(Boolean).join(' · '))
        : (inteiro ? [curto, 'dia inteiro'].filter(Boolean).join(' · ') : [curto, hm].filter(Boolean).join(' · '));

    return {
      id: String(x.id || ''),
      // sem lead a linha não abre conversa nenhuma — e o desenho já trata o vazio
      lead: String(x.leadId || ''),
      nome: esc(String(x.leadNome || '').trim()),
      titulo: esc(String(x.titulo || '').trim()),
      tipo: TIPOS_DA_AGENDA.indexOf(String(x.tipo || '')) >= 0 ? String(x.tipo) : '',
      dia,
      quando,
      /* O selo âmbar é do DADO, não da aba: se um atrasado vazar pro balde de
         hoje (a tarefa das 09 h vista às 11 h), ele chega marcado sozinho. */
      atraso: x.atrasada ? atrasoDaAgenda(ymd, hoje) : '',
    };
  }

  function vestirAgendaDoDia(r) {
    agendaCrua = r;
    const balde = (k) => (Array.isArray(r && r[k]) ? r[k] : []);
    const contas = (r && r.counts) || {};
    const hoje = diaOperacional();
    const agora = Date.now();

    /* CONCLUÍDAS HOJE é do dia de SÃO PAULO, não das últimas 24 h: a lista vem
       com tudo que já foi fechado, e "4 concluídas hoje" no fim da tarde só
       vale se "hoje" for o mesmo hoje do resto da tela. */
    const feitas = balde('concluidas').filter((c) => c && c.realizadaEm && diaEmSp(c.realizadaEm) === hoje).length;
    /* A PRÓXIMA é a primeira de hoje com hora marcada que ainda NÃO passou. A
       lista já vem ordenada por vencimento, então a primeira que sobra é ela.
       Tarefa "dia inteiro" não tem hora e por isso não pode ser a próxima —
       seria uma hora inventada no lugar mais visível do rodapé. */
    const proxima = balde('hoje')
      .filter((a) => a && !a.diaInteiro && a.vencimento && Date.parse(a.vencimento) >= agora)
      .map((a) => horaSpDaAgenda(a.vencimento))
      .filter(Boolean)[0] || '';

    usar('agenda', Object.assign({}, fonteVoltou, {
      /* Os chips contam o que o SERVIDOR contou (`counts`), não o tamanho das
         listas que couberam na tela — são duas perguntas diferentes. */
      contas: {
        atrasadas: Math.max(0, Math.trunc(Number(contas.atrasadas) || 0)),
        hoje: Math.max(0, Math.trunc(Number(contas.hoje) || 0)),
        semana: Math.max(0, Math.trunc(Number(contas.semana) || 0)),
      },
      listas: {
        atrasadas: balde('atrasadas').map(traduzirAtividadeDaAgenda),
        hoje: balde('hoje').map(traduzirAtividadeDaAgenda),
        semana: balde('semana').map(traduzirAtividadeDaAgenda),
      },
      feitasHoje: feitas ? String(feitas) : '',
      proxima,
    }));
  }

  function carregarAgenda() {
    if (!temPonte()) return Promise.resolve();
    // Um pedido por vez: dois gatilhos que caem juntos (o chip e o "Tentar de
    // novo" tocado duas vezes) receberiam a MESMA promessa em vez de duas idas.
    if (agendaEmVoo) return agendaEmVoo;
    agendaEmVoo = window.API.get('/atividades/agenda?janela=todas&incluirConcluidas=1')
      .then((r) => {
        if (!r || !r.counts) { fonteCaiu('agenda'); return; }
        vestirAgendaDoDia(r);
      })
      .catch((e) => fonteCaiu('agenda', e))
      .finally(() => { agendaEmVoo = null; });
    return agendaEmVoo;
  }

  const acharAtividadeCruaDaAgenda = (id) => {
    if (!agendaCrua) return null;
    const alvo = String(id || '');
    return ['atrasadas', 'hoje', 'semana']
      .reduce((achado, k) => achado || (Array.isArray(agendaCrua[k]) ? agendaCrua[k] : []).find((a) => String(a && a.id) === alvo) || null, null);
  };

  /* 🔴 REMARCAR PRESERVA A HORA DO VENCIMENTO E ANDA O DIA A PARTIR DE HOJE —
     não a partir do vencimento antigo. "Amanhã" numa tarefa atrasada há 4 dias
     que somasse 1 dia ao vencimento nasceria ATRASADA DE NOVO, no mesmo balde,
     e o toque não teria resolvido nada. A hora fica: quem marcou uma ligação
     pras 09:00 quer as 09:00 de amanhã, não a hora em que apertou o botão. */
  function remarcarParaISONaAgenda(id, dias) {
    const orig = acharAtividadeCruaDaAgenda(id);
    const hm = horaSpDaAgenda(orig && orig.vencimento) || '09:00';
    const alvo = somarDiasNaAgenda(diaOperacional(), dias);
    if (!alvo) return '';
    return `${alvo}T${hm}:00${FUSO_DA_AGENDA}`;
  }

  function concluirAtividadeDaAgenda(el) {
    if (!temPonte()) return;
    const d = (el && el.dataset) || {};
    const id = String(d.atividade || '');
    const resultado = String(d.resultado || '');
    if (!id || !resultado) return;
    if (agendaFechando.has(id)) return;

    const corpo = { resultado };
    if (resultado === 'remarcar') {
      const dias = Math.trunc(Number(d.dias) || 0);
      // Sem dia escolhido o "Remarcar" é só a pergunta — quem fecha é o chip.
      if (dias <= 0) return;
      const quando = remarcarParaISONaAgenda(id, dias);
      if (!quando) return;
      corpo.remarcarPara = quando;
    }

    agendaFechando.add(id);
    if (el) { el.disabled = true; el.classList.add('aguarde'); }
    window.API.post(`/atividades/${encodeURIComponent(id)}/concluir`, corpo)
      .then(() => {
        usar('agenda', { concluindo: '', remarcando: '' });
        return carregarAgenda();
      })
      .catch((erro) => {
        /* 🔴 "ATIVIDADE JA CONCLUIDA" NÃO É ERRO DE REDE — é a linha que outro
           aparelho (ou o computador) fechou enquanto esta tela estava aberta. O
           servidor responde 400, e uma caixa vermelha aqui acusaria a pessoa de
           um defeito que não existe: o trabalho ESTÁ feito. A linha some calada
           e a lista se refaz com a verdade. */
        if (erro && erro.status === 400 && /j[aá] conclu/i.test(String(erro.message || ''))) {
          usar('agenda', { concluindo: '', remarcando: '' });
          return carregarAgenda();
        }
        avisoErro(erro);
        return null;
      })
      .finally(() => { agendaFechando.delete(id); });
  }

  /* ------------------------------------------------------------------------
     O QUE O DEDO FAZ NESTA TELA.
     ------------------------------------------------------------------------ */
  registrarTelas({ agenda: carregarAgenda });

  registrarAcoes({
    // O chip da janela é filtro de OLHO: os três baldes já vieram juntos.
    'janela-agenda': (el) => {
      const j = String((el && el.dataset && el.dataset.janela) || 'hoje');
      usar('agenda', { janela: j });
    },
    /* Abrir o painel de resultado é um interruptor, e fechar é o mesmo toque —
       o desenho já troca o ícone (check ↔ ×) e o rótulo (Concluir ↔ Fechar).
       Fechar também apaga o `remarcando`: sem isso, reabrir outra linha nasceria
       com os chips de dia de uma linha que nem está mais aberta. */
    'abrir-concluir': (el) => {
      const id = String((el && el.dataset && el.dataset.atividade) || '');
      let aberta = '';
      try { aberta = String((DADOS.agenda && DADOS.agenda.concluindo) || ''); } catch (_) {}
      usar('agenda', { concluindo: aberta === id ? '' : id, remarcando: '' });
    },
    // "Remarcar" é o único resultado com um degrau a mais: remarcar sem data é
    // só adiar a pergunta. Este toque abre os dias; quem conclui é o chip.
    'atividade-remarcar': (el) => {
      const id = String((el && el.dataset && el.dataset.atividade) || '');
      if (id) usar('agenda', { remarcando: id });
    },
    'concluir-atividade': (el) => concluirAtividadeDaAgenda(el),
    'recarregar-agenda': () => retentar('agenda', carregarAgenda),

    /* 🔴 "NOVA TAREFA" NÃO PODE NASCER AQUI, E A FRASE É A CORREÇÃO. O
       `CreateAtividadeDto` exige `leadId` (e o service confere o lead no escopo
       da empresa): tarefa é sempre DE ALGUÉM. Esta tela não tem — e não vai ter
       — um seletor de lead: o desenho é uma FILA, não um formulário. Botão que
       abrisse um campo de texto aqui terminaria em 400 ("leadId obrigatório")
       depois da pessoa ter digitado tudo, que é a pior ordem possível pra dar
       uma notícia. Então o toque diz onde a tarefa nasce e leva pra lá.
       (A agenda CRIA tarefa por outro caminho, e ele já está de pé: concluir
       com "Remarcar" grava a próxima no mesmo POST, com o histórico junto.) */
    'nova-atividade': () => {
      if (typeof window.portao !== 'function') return;
      window.portao({
        tom: 'info', ico: 'calendar', titulo: 'Toda tarefa é de um lead',
        sub: 'Abra o card da empresa no funil e marque o retorno por lá — ele aparece aqui na hora certa.',
        acoes: [['Fechar', ''], ['Abrir o funil', 'principal', false, 'agenda-ir-funil']],
        classe: 'duas',
      });
    },
    'agenda-ir-funil': () => { if (typeof window.ir === 'function') window.ir('vendas'); },
  });

  /* ==========================================================================
     CONVERSAS — o lead, o fio e o BOTÃO DE DUAS POSIÇÕES.

     O pedido do dono, literal: "garantir que seja fácil a escolha entre whatsapp
     da empresa ou whatsapp do celular. (não explicar, 1 botão)". Os rótulos que
     ele aprovou: [ Empresa | Meu WhatsApp ]. Então aqui NÃO existe frase de
     apoio, tooltip, modal de escolha nem "tem certeza?": o ESTADO do botão é a
     explicação inteira, e é a casca que o desenha (`corpoDaConversa`, no mock).

     🔴 O QUE ESTE ARQUIVO ALIMENTA — e nada além disso:
       `chip.conectado`  ← GET /companies/me/whatsapp-status  (`connected`)
       `temWhats`        ← o servidor NÃO desmentiu este destinatário
       `canal`           ← a escolha do DEDO, carimbada POR LEAD
     A posição da pílula é DERIVADA a cada pintura pela casca
     (`podeEmpresa = chip.conectado && temWhats`) — nunca guardada. É isso que
     faz o chip que cai no meio da conversa devolver a pílula pro celular
     sozinho, em vez de deixar o dedo mandando pelo lado morto.

     🔴 AS DUAS PORTAS SÃO A FACHADA DO VENDAS, NUNCA O ATENDIMENTO. Aqui só
     entram `/vendas/lead/:id/conversation…`. `/inbox` e `/conversations` exigem
     o módulo `atendimento`, que o plano LITE não tem
     (COMMERCIAL_PLAN_MODULE_KEYS[LITE] = ['vendas','webscraping']) — foi esse
     403 MUDO que expulsou um cliente inteiro em 18/08. A fachada manda pelo
     MESMO motor, e vive sob o gate que o plano já tem.

     🔴 O APP NÃO ESCOLHE O CHIP. Nenhuma chamada daqui leva `sessionId`,
     `tenantKey` ou número de origem: quem resolve o chip é o SERVIDOR, pelo
     vendedor logado, fail-closed. Mandar isso do cliente foi a raiz do
     vazamento de chip de 20/07.

     🔴 O QUE NÃO NASCE NESTE ARQUIVO, e a proibição é permanente: envio em
     lote, "mandar pra todos", template repetido, fila automática, retry
     automático de mensagem que falhou. Em 17/08 esta casa viu 126 mensagens
     idênticas num minuto atravessarem o gate inteiro e custarem um chip banido;
     no mesmo dia um chip novo morreu com `401 device_removed` no primeiro envio
     da vida. A régua é ROBÔ × GENTE — aqui só existe gente: UMA mensagem, para
     UM lead, por UM toque. O reenvio existe (o `Tentar de novo` da bolha que
     falhou) e ele manda o MESMO corpo que já está pintado na tela, jamais um
     texto novo montado por código.
     ========================================================================== */

  /* O lead ABERTO agora. É `''` até alguém tocar num card — e enquanto for `''`
     este módulo não fala com a rede: pedir a conversa "do lead nenhum" é um 404
     garantido, e um aviso de rede caída por cima de uma tela que só está vazia
     seria a Lei nº 1 quebrada ao contrário. */
  let leadDaConversa = '';
  /* O texto que a pessoa escreveu. Ele mora AQUI e não no seam de propósito: o
     `<input>` do mock não tem `value` no template (é maquete), então todo
     repinte apagaria o que ela digitou — e escrever no seam a cada letra
     remontaria a camada inteira por tecla. A régua fica: o rascunho acompanha o
     campo, e `pintarConversa()` o devolve ao nó depois de cada pintura. */
  let rascunhoDaConversa = '';
  /* As mensagens CRUAS da última resposta. O fio pintado passou pelo `esc()`, e
     o reenvio precisa do corpo ORIGINAL — mandar o texto escapado poria
     "BAR &amp; CIA" no WhatsApp do cliente. */
  let fioCruDaConversa = [];
  /* A FICHA CRUA do lead, tal como o `/vendas/lead/:id/card` a devolveu. O
     cabeçalho da conversa mostra quatro campos dela (nome, telefone, etapa,
     origem); o resto — CNPJ, razão social, dono, e-mails e os OUTROS telefones
     que o enriquecimento achou — não tem tela nenhuma neste app e ficava no
     lixo. É ele que o "Abrir ficha" mostra: dado que o app já pagou pra ter. */
  let fichaCruaDoLead = null;
  /* "Já existe conversa no servidor?" — quem responde é o snapshot. Sem ela o
     POST da mensagem morre com "Abra a conversa antes de enviar a mensagem." */
  let conversaExiste = false;
  /* Um pedido por vez: dois gatilhos que caem juntos (o "Tentar de novo" tocado
     duas vezes) viram duas leituras do mesmo fio.
     🔴 E O VOO É DE UM LEAD, NÃO DA TELA. Devolver o voo em curso para QUALQUER
     pedido faria o segundo lead herdar a espera do primeiro — e a resposta que
     chegasse seria descartada pela guarda de "o dedo trocou de lead", deixando a
     conversa nova no esqueleto para sempre. Quem chega pedindo OUTRO lead abre
     um voo novo. */
  let conversaEmVoo = null;
  let conversaEmVooDe = '';

  /* 🔴 A ESCOLHA É POR LEAD, NUNCA POR APARELHO. Um vendedor que escolheu "Meu
     WhatsApp" pra falar com um lead que não tem WhatsApp confirmado não escolheu
     isso pra sempre: no lead seguinte a régua volta a decidir. Preferência
     guardada no aparelho é como o app passa a mandar tudo pelo lado errado
     depois de UM caso excepcional. */
  const canalPorLead = Object.create(null);
  /* Carimbo de desmentido, também POR LEAD: o servidor disse, para ESTE
     destinatário, que não há WhatsApp confirmado. Some quando o app fecha —
     é uma verdade do momento, não um cadastro. */
  const semWhatsPorLead = Object.create(null);

  const caminhoDoLead = (id) => `/vendas/lead/${encodeURIComponent(String(id || ''))}`;

  /* ------------------------------------------------------------------------
     A PINTURA — uma porta só, porque o rascunho tem que voltar SEMPRE.

     O campo de escrever é o único pedaço desta tela cujo conteúdo não vive no
     seam. Se cada `usar()` daqui pra baixo tivesse que lembrar de devolver o
     texto, o dia em que um deles esquecesse a pessoa perderia a mensagem que
     acabou de escrever — e perderia CALADO, que é a pior versão. Uma porta só.
     ------------------------------------------------------------------------ */
  function pintarConversa(patch) {
    usar('conversas', patch);
    const campo = naCamada('[data-campo="conversa-texto"]');
    if (!campo || typeof campo.value !== 'string') return;
    if (campo.value !== rascunhoDaConversa) campo.value = rascunhoDaConversa;
  }

  /* ------------------------------------------------------------------------
     AS RÉGUAS DE TRADUÇÃO.
     ------------------------------------------------------------------------ */

  /* O selo da bolha é o status que o servidor devolve em CADA mensagem, virado
     em uma palavra. `RECEIVED` (o que ELES mandaram) não tem selo: "entregue"
     numa bolha de entrada seria o app informando o óbvio com a palavra errada.
     Status que eu não conheço também vira '' — inventar rótulo pra estado novo
     do motor é mentir com cara de detalhe. */
  const SELO_DA_MENSAGEM = {
    PENDING: 'enviando',
    QUEUED: 'enviando',
    SENT: 'entregue',
    DELIVERED: 'entregue',
    READ: 'lida',
    FAILED: 'falhou',
  };

  /* A ORIGEM do lead na tag do cabeçalho. Chave que eu não conheço vira VAZIO e
     a metade sobrevivente (a cidade) aparece sozinha — jogar `sourceType` cru na
     tela ("webscraping") é vocabulário de banco na cara do vendedor. */
  const ORIGEM_NA_CONVERSA = {
    webscraping: 'Radar',
    manual: 'Manual',
    anuncio: 'Anúncio',
  };

  /** [lado, texto, hora, selo, id] — o formato que a casca desenha. */
  function traduzirMensagem(m) {
    const msg = m || {};
    const entrando = String(msg.direction || '').toLowerCase() === 'inbound';
    const selo = entrando ? '' : (SELO_DA_MENSAGEM[String(msg.status || '').toUpperCase()] || '');
    return [
      entrando ? 'deles' : 'minha',
      // 🔴 `esc()` NA FONTE. O template do mock interpola cru: uma mensagem que
      // o cliente escreveu com "<" some com a bolha inteira e sem erro nenhum —
      // e aqui o texto é de TERCEIRO por definição.
      esc(msg.content),
      esc(hora(msg.createdAt)),
      selo,
      // Só a bolha que falhou usa o id (é ela que ganha o "Tentar de novo").
      String(msg.id || ''),
    ];
  }

  /* ------------------------------------------------------------------------
     O CABEÇALHO DO LEAD — quem é a pessoa do outro lado.

     🔴 A PRIMEIRA PINTURA SAI DO CARTÃO QUE O DEDO TOCOU, não da rede. O funil
     já tem nome, telefone e etapa DESENHADOS na tela; repetir a pergunta ao
     servidor pra escrever o mesmo cabeçalho deixaria a conversa abrindo com um
     retângulo cinza por meio segundo em cima de um dado que já estava ali. O
     `/card` vem DEPOIS e é quem traz o que o cartão não tem (o veredito de
     WhatsApp do destinatário e a origem).
     ------------------------------------------------------------------------ */
  function cartaoDoFunil(id) {
    let blocos = null;
    try { blocos = DADOS.vendas && DADOS.vendas.blocos; } catch (_) { return null; }
    if (!blocos) return null;
    const chaves = ['overdue', 'today', 'scheduled', 'closed'];
    for (const k of chaves) {
      const lista = Array.isArray(blocos[k]) ? blocos[k] : [];
      const achado = lista.find((c) => c && String(c.id) === String(id));
      if (achado) return achado;
    }
    return null;
  }

  /* O veredito do servidor sobre o destinatário.

     🔴 "NÃO CHECADO" NÃO É "NÃO TEM". O board só confere WhatsApp dos leads que
     vieram do Radar (`ensureWhatsappAvailabilityForRows` roda sobre os de
     `primarySource === 'webscraping'`); o lead cadastrado na mão nunca foi
     conferido e volta `whatsappAvailability: null`. Tratar o desconhecido como
     "não tem" apagaria a posição "Empresa" para a maioria dos leads — o chip da
     empresa viraria um recurso que nunca liga, e o vendedor mandaria tudo pelo
     celular pessoal pra sempre. Então o desconhecido ACENDE, e quem desmente é
     o servidor na hora do envio (400 WHATSAPP_RECIPIENT_*), que é barato: a
     mensagem NÃO sai, a pílula cai pro celular e o recado é o do backend.

     O caminho contrário também vale: conversa com mensagem RECEBIDA prova que o
     número tem WhatsApp, e um "unavailable" velho de um lookup que degradou não
     pode apagar o botão numa conversa que está viva. */
  function temWhatsDoLead(id, disponibilidade, engajamento) {
    if (semWhatsPorLead[id]) return 0;
    if (engajamento && (engajamento.hasInboundMessage || engajamento.hasSuccessfulOutbound)) return 1;
    const estado = String((disponibilidade && disponibilidade.status) || '').toLowerCase();
    return estado === 'unavailable' ? 0 : 1;
  }

  /* ------------------------------------------------------------------------
     A CARGA DA TELA — três portas, três desfechos independentes.

       GET  /vendas/lead/:id/conversation/messages?limit=30  → o FIO + o snapshot
       GET  /companies/me/whatsapp-status                    → o CHIP da empresa
       GET  /vendas/lead/:id/card                            → a ficha do lead

     `allSettled` e não `all`: o chip fora do ar não pode apagar o fio, e a ficha
     que não veio não pode apagar nem um nem outro. Só o FIO manda no esqueleto
     (`carregando`/`semFonte`) — é ele que a tela é.

     ⚠️ O `/card` é a única porta que devolve a ficha de UM lead (não existe
     `GET /vendas/lead/:id` — só PATCH). Ele é caro no servidor: hoje
     `getLeadCardForUser` remonta o BOARD inteiro (240 leads) pra achar um. Está
     anotado como pendência; o app não tem outro caminho.
     ------------------------------------------------------------------------ */
  function carregarConversa() {
    if (!temPonte()) return Promise.resolve();
    const id = leadDaConversa;
    if (!id) {
      /* Tela aberta pela BARRA, sem lead escolhido. Não é rede caída e não é
         "este lead não tem mensagem": é uma tela sem assunto. O honesto é dizer
         isso e não pedir nada ao servidor. */
      pintarConversa({
        carregando: false, semFonte: false,
        conversa: [], vazio: 'Abra um lead no Funil para conversar aqui.',
      });
      return Promise.resolve();
    }
    if (conversaEmVoo && conversaEmVooDe === id) return conversaEmVoo;

    conversaEmVooDe = id;
    conversaEmVoo = Promise.allSettled([
      window.API.get(`${caminhoDoLead(id)}/conversation/messages?limit=30`),
      window.API.get('/companies/me/whatsapp-status'),
      window.API.get(`${caminhoDoLead(id)}/card`),
    ]).then(([fio, zap, ficha]) => {
      // O dedo trocou de lead enquanto isso: esta resposta é de OUTRA conversa e
      // pintá-la poria o fio de um lead no cabeçalho de outro.
      if (leadDaConversa !== id) return;

      const patch = {};

      /* 1. O CHIP. `{}` é "não sei", e não-sei apaga a posição Empresa: prometer
         o chip conectado sem resposta faria a pessoa escrever a mensagem inteira
         pra descobrir depois que nada saiu. O celular sempre funciona — é pra
         ele que o desconhecido cai. */
      const conectado = zap.status === 'fulfilled' && zap.value && zap.value.connected === true;
      patch.chip = conectado ? { conectado: 1 } : {};

      /* 2. A FICHA. Ela refina o cabeçalho que o cartão já pintou e traz o
         veredito de WhatsApp do destinatário. Se não veio, o cabeçalho do cartão
         FICA — falha de uma porta não apaga o que a outra já escreveu. */
      let disponibilidade = null;
      if (ficha.status === 'fulfilled' && ficha.value && ficha.value.lead) {
        const l = ficha.value.lead;
        fichaCruaDoLead = l;
        disponibilidade = l.whatsappAvailability || null;
        const nome = String(l.name || '').trim();
        const fone = telefoneBonito(l.phone);
        if (nome) { patch.nome = esc(nome); patch.ini = esc(iniciais(nome)); }
        if (fone) patch.telefone = esc(fone);
        if (l.statusLabel) patch.etapa = esc(l.statusLabel);
        patch.origem = esc([
          ORIGEM_NA_CONVERSA[String(l.primarySource || l.sourceType || '').toLowerCase()],
          local(l.city, l.state),
        ].filter(Boolean).join(' · '));
      }

      /* 3. O FIO. Ele é o dono do esqueleto e do aviso de fonte. */
      if (fio.status === 'fulfilled' && fio.value) {
        const r = fio.value;
        const cruas = Array.isArray(r.messages) ? r.messages : [];
        fioCruDaConversa = cruas;
        conversaExiste = !!(r.conversation && r.conversation.exists);
        patch.conversa = cruas.map(traduzirMensagem);
        /* Vazio porque o SERVIDOR disse vazio — cena própria, e nunca a mesma do
           "não consegui carregar". Um lead que ninguém chamou ainda tem fio
           vazio de verdade, e isso é notícia, não defeito. */
        patch.vazio = cruas.length ? '' : 'Nenhuma mensagem ainda';
        patch.temWhats = temWhatsDoLead(id, disponibilidade, r.engagement);
        pintarConversa(Object.assign({}, fonteVoltou, patch));
      } else {
        // O chip e a ficha ainda valem: pinta o que chegou e deixa o portão de
        // fontes decidir o esqueleto do fio (só apaga na PRIMEIRA carga).
        // O `reason` viaja junto: 403 de módulo e rede no chão são cenas
        // opostas, e aqui a errada manda a pessoa esperar por uma porta que
        // está TRANCADA.
        pintarConversa(patch);
        fonteCaiu('conversas', fio.reason);
      }
    }).finally(() => {
      // Só o voo ATUAL se apaga: um voo velho terminando depois não pode limpar
      // a vaga de quem já está no ar.
      if (conversaEmVooDe === id) { conversaEmVoo = null; conversaEmVooDe = ''; }
    });

    return conversaEmVoo;
  }

  /* ------------------------------------------------------------------------
     ABRIR O LEAD — o toque no cartão do Funil e na linha da Agenda.
     ------------------------------------------------------------------------ */
  function abrirConversaDoLead(el) {
    const id = String((el && el.dataset && el.dataset.lead) || '').trim();
    if (!id) return;                       // linha sem id não abre o nada
    irParaConversa(id);
  }

  /* 🔴 O ID VIAJA SOZINHO, SEM O NÓ (19/08). Até aqui só o cartão do funil e a
     linha da agenda abriam conversa, e os dois tinham `data-lead` no nó tocado.
     A FICHA do lead abre pelo botão "Conversa", que não carrega o id em atributo
     nenhum — ele mora no estado da tela. Fabricar um `{dataset:{lead:id}}` de
     mentira pra caber na porta antiga é o tipo de gambiarra que o próximo leitor
     não entende; a porta é que passa a receber o que ela realmente usa. */
  function irParaConversa(id) {
    const deOnde = telaAtual();
    leadDaConversa = id;
    rascunhoDaConversa = '';
    fioCruDaConversa = [];
    /* A ficha do lead ANTERIOR morre aqui. Sem esta linha, tocar num lead novo e
       abrir a ficha antes de a resposta chegar mostraria o CNPJ do lead de
       trás — mentira com cara de app pronto, e num dado que termina em ligação
       telefônica. */
    fichaCruaDoLead = null;
    conversaExiste = false;

    /* O CABEÇALHO NASCE NO MESMO QUADRO DO DEDO, com o que já está pintado no
       cartão. `chip:{}` e `temWhats:0` nascem fechados: até o servidor falar, a
       pílula abre em "Meu WhatsApp" — o lado que funciona sem saber de nada. */
    const c = cartaoDoFunil(id) || {};
    usar('conversas', {
      // Quem abriu a conversa de dentro da Agenda não pode cair no Funil ao
      // voltar. `volta` é a porta de entrada, igual à ficha de empresa.
      volta: deOnde && deOnde !== 'conversas' ? deOnde : 'vendas',
      lead: id,
      ini: c.ini || '', nome: c.nome || '', telefone: c.fone || '',
      etapa: c.etapa || '', origem: c.local || '',
      temWhats: 0, chip: {}, canal: canalPorLead[id] || '',
      enviando: 0, vazio: '', conversa: [],
      carregando: true, semFonte: false,
    });

    if (typeof window.ir !== 'function') return;
    /* Já ESTAR na tela não dispara o gancho de abrir (`anunciarTela` só anuncia
       troca), e sem isto trocar de lead de dentro da conversa deixaria o novo
       lead no esqueleto para sempre. */
    if (telaAtual() === 'conversas') { carregarConversa(); return; }
    window.ir('conversas');
    /* 🔴 `ir()` RECUSA CALADO quando o admin desligou o módulo — e cartão que
       não faz nada é exatamente o defeito que custou o cliente 46 (39 respostas
       403 em 65 s, e a tela sem uma palavra). A frase é a MESMA do `humano()`:
       um dono só pra ela, senão duas telas explicam o mesmo bloqueio de dois
       jeitos. */
    if (telaAtual() === 'conversas') return;
    const erro = new Error('');
    erro.body = { code: 'MODULE_ACCESS_DENIED' };
    avisoErro(erro);
  }

  /* ------------------------------------------------------------------------
     ENVIAR — UMA função, DOIS caminhos.

     🔴 UMA SÓ, e é por isso que ela recebe o destino em vez de existir em duas
     cópias: o dia em que o "carimba a tentativa" mudar, duas cópias mudam uma
     de cada vez e a metade esquecida é a que mente no funil. As diferenças
     entre os caminhos são pequenas e ficam VISÍVEIS lado a lado aqui dentro.

     · 'empresa'  → o chip do motor, pela fachada do Vendas. A mensagem sai do
                    número da empresa e o servidor escolhe o chip.
     · 'celular'  → o intent nativo (`openWhatsapp`), que abre o WhatsApp da
                    pessoa com o número do lead. Nada sai daqui: quem escreve e
                    aperta enviar é ela, lá dentro.
     ------------------------------------------------------------------------ */
  function enviarMensagem(destino, corpoPronto, noTocado) {
    const id = leadDaConversa;
    if (!id || !temPonte()) return;

    if (destino === 'celular') {
      let fone = '';
      try { fone = String((DADOS.conversas && DADOS.conversas.telefone) || ''); } catch (_) {}
      if (!fone) return;                    // sem alvo não há intent

      /* 🔴 O ÚNICO VERBO DE REDE DESTE APP QUE NÃO TINHA GUARDA — medido em
         19/08: TRÊS toques = três intents do WhatsApp e três POSTs de
         `attempt`. Ele saía por cima do `enviando` (que ficava lá embaixo, no
         caminho da empresa) e não chamava `usar()`, então a tela não mudava um
         PIXEL depois do dedo: nada dizia "já peguei", e num aparelho que leva
         meio segundo pra trocar de app o segundo toque é o comportamento
         normal de qualquer pessoa. Três `attempt` viram três carimbos de
         contato no mesmo lead — e é o carimbo que decide se a vendedora manda
         de novo pro mesmo contato frio, que é a máquina de ban desta casa.

         A guarda é a MESMA dos outros verbos, e são duas camadas no MESMO
         quadro do dedo: o seam (`enviando:1`, que sobrevive ao repinte e é o
         que a casca lê pra desenhar o botão travado) e o nó tocado (reação
         instantânea, antes de qualquer pintura). Ela sai por RESPOSTA do
         servidor, nunca por relógio — ver o desfecho do `attempt` lá embaixo. */
      let ocupadoCel = 0;
      try { ocupadoCel = Number((DADOS.conversas && DADOS.conversas.enviando) || 0); } catch (_) {}
      if (ocupadoCel) return;
      if (noTocado) {
        noTocado.disabled = true;
        noTocado.setAttribute('aria-busy', 'true');
        noTocado.classList.add('ocupado');
      }
      pintarConversa({ enviando: 1 });

      /* 🔴 O PREFIXO 55 MORA NO KOTLIN (`NativeAppBridge.openWhatsapp`) e não se
         repete aqui: duas cópias da mesma regra de DDI divergem no primeiro
         ajuste e o app passa a discar um número que não existe. Vai o telefone
         como está escrito na tela; o native limpa o que não é dígito.

         🔴 O TEXTO QUE VAI JUNTO É O DELA, E SÓ ELE. Quando o servidor recusa o
         destinatário, a pílula cai pro celular e o campo de escrever SOME da
         tela — com o parágrafo que a pessoa acabou de digitar dentro. Sem esta
         linha ela redigitaria tudo no WhatsApp, e redigitar é como a mensagem
         chega diferente da que ela revisou. Aqui não se monta template nenhum:
         se ela não escreveu nada, vai vazio e ela escreve lá. */
      try { window.HBX.whatsapp(fone, rascunhoDaConversa); } catch (_) {}
      /* A TELEMETRIA VEM DEPOIS DO INTENT, E CALADA. O WhatsApp já abriu na cara
         da pessoa: um pop-up vermelho aqui diria que não aconteceu o que ela
         está vendo acontecer. Se este POST falhar, o card fica sem a marca de
         contato — e é o servidor que conserta na próxima leitura, não a tela.
         Ele é o que move o card pra "Contato feito": sem ele a vendedora
         reabre a lista, lê "Sem contato" e manda de novo pro mesmo contato
         frio, que é a máquina de ban. */
      window.API.post(`${caminhoDoLead(id)}/attempt`, { channel: 'whatsapp_pessoal' })
        .catch(() => {})
        /* A trava sai quando o SERVIDOR responde — dando certo ou dando errado.
           Um `setTimeout` aqui devolveria o toque a uma tentativa que talvez já
           tenha sido carimbada, que é exatamente o defeito que esta guarda
           existe pra matar. E ela só solta o botão do lead que ela travou: uma
           resposta velha chegando depois da troca de lead não pode destravar a
           tela de outra conversa. */
        .then(() => { if (leadDaConversa === id) pintarConversa({ enviando: 0 }); });
      return;
    }

    /* 🔴 O CORPO É O QUE ESTÁ PINTADO — sempre. No envio normal ele vem do nó
       vivo (o que a pessoa está lendo enquanto toca), e no reenvio ele vem da
       mensagem que falhou, tal como o servidor a devolveu. Texto montado por
       código nunca entra: mensagem que a pessoa não escreveu é a definição de
       robô, e robô é o que queima chip. */
    const doNo = naCamada('[data-campo="conversa-texto"]');
    const corpo = String(
      corpoPronto != null ? corpoPronto : (doNo && typeof doNo.value === 'string' ? doNo.value : ''),
    ).trim();
    if (!corpo) return;

    let ocupado = 0;
    try { ocupado = Number((DADOS.conversas && DADOS.conversas.enviando) || 0); } catch (_) {}
    if (ocupado) return;                    // um envio por vez, e o teclado é rápido

    // O "ocupado" entra no MESMO quadro do dedo: campo travado e botão em
    // espera antes de qualquer resposta de rede.
    pintarConversa({ enviando: 1 });

    /* A conversa precisa EXISTIR antes da mensagem (o servidor recusa com "Abra
       a conversa antes de enviar a mensagem"). Criar é POST na mesma fachada —
       e ele é quem devolve 503 quando o chip está no chão, antes de a mensagem
       chegar perto do motor. */
    const abrir = conversaExiste
      ? Promise.resolve()
      : window.API.post(`${caminhoDoLead(id)}/conversation`, {}).then((r) => {
        conversaExiste = !!(r && r.conversation && r.conversation.exists);
      });

    abrir
      .then(() => window.API.post(`${caminhoDoLead(id)}/conversation/message`, { body: corpo }))
      .then((r) => {
        if (leadDaConversa !== id) return;
        // Saiu: o campo esvazia. O rascunho é zerado ANTES da pintura porque é
        // ele que a pintura devolve ao nó.
        rascunhoDaConversa = '';
        const patch = { enviando: 0 };
        /* O POST responde com o fio inteiro relido. Quando ele não responde
           (o envio deu certo e só a releitura falhou), a tela FICA como está —
           zerar a lista aqui apagaria a conversa depois de um envio bem
           sucedido, que é a mentira mais cara possível nesta tela. */
        const cruas = r && Array.isArray(r.messages) ? r.messages : null;
        if (cruas) {
          fioCruDaConversa = cruas;
          patch.conversa = cruas.map(traduzirMensagem);
          patch.vazio = cruas.length ? '' : 'Nenhuma mensagem ainda';
        }
        if (r && r.conversation) conversaExiste = !!r.conversation.exists;
        pintarConversa(patch);
      })
      .catch((erro) => {
        if (leadDaConversa !== id) return;
        const codigo = String((erro && erro.body && erro.body.code) || '');
        const status = Number((erro && erro.status) || 0);
        const patch = { enviando: 0 };

        /* 🔴 A RECUSA CAI A PÍLULA PRO CELULAR E NÃO EXPLICA NADA ALÉM DO QUE O
           SERVIDOR DISSE. São os dois "não dá por aqui" que o backend sabe e o
           app não tinha como saber antes:
             · 400 WHATSAPP_RECIPIENT_* — este número não tem WhatsApp confirmado
               (carimba o desmentido NESTE lead, e só nele);
             · 503                      — o chip da empresa está desconectado.
           Nos dois casos a mensagem NÃO SAIU e o rascunho fica onde está: a
           pessoa toca "Abrir no meu WhatsApp" e leva o mesmo texto na mão. */
        if (codigo.indexOf('WHATSAPP_RECIPIENT') === 0) {
          semWhatsPorLead[id] = 1;
          patch.temWhats = 0;
          patch.canal = 'celular';
          canalPorLead[id] = 'celular';
        } else if (status === 503) {
          patch.chip = {};
          patch.canal = 'celular';
        }
        pintarConversa(patch);
        avisoErro(erro);
      });
  }


  /* ------------------------------------------------------------------------
     O QUE O DEDO FAZ NESTA TELA.
     ------------------------------------------------------------------------ */
  registrarTelas({ conversas: carregarConversa });

  registrarAcoes({
    /* 🔴 O TOQUE NO CARTÃO NÃO MORA MAIS AQUI (19/08). `abrir-lead` passou a ser
       do `70-leadficha.js`: tocar num lead abre a FICHA dele, e a conversa é
       UMA das ações de lá — foi o pedido do dono ("eu clico nele abre conversas,
       como assim?") e é o que todo CRM de celular faz.
       O que sobrou aqui é o ATALHO: o balão verde do cartão, que continua
       levando direto pro fio pra quem já sabe o que quer. */
    'abrir-conversa': abrirConversaDoLead,

    /* A PÍLULA. Ela só carimba a preferência — quem decide se a posição
       "Empresa" existe é a casca, a cada pintura, com as duas bandeiras do
       servidor. O botão apagado vem `disabled` do desenho, então este handler
       nunca recebe um "empresa" impossível. */
    'canal-conversa': (el) => {
      const canal = String((el && el.dataset && el.dataset.canal) || '') === 'empresa' ? 'empresa' : 'celular';
      if (leadDaConversa) canalPorLead[leadDaConversa] = canal;
      pintarConversa({ canal });
    },

    'enviar-conversa': () => enviarMensagem('empresa'),
    /* O NÓ TOCADO viaja: é nele que o "ocupado" entra no MESMO quadro do dedo,
       antes de qualquer repinte — ver a guarda dentro do `enviarMensagem`. */
    'abrir-whats-pessoal': (el) => enviarMensagem('celular', null, el),

    /* 🔴 `abrir-ficha-lead` MUDOU DE ARQUIVO (19/08) — os dois lugares em que a
       casca escreve "Abrir ficha" (o cartão do cabeçalho e o botão do aviso
       "Sem telefone") agora abrem a TELA da ficha, e ela mora no
       `70-leadficha.js` com todo o resto dela. O portão de leitura que morava
       aqui morreu junto: ele listava os telefones como TEXTO, sem um botão pra
       ligar — era exatamente esse o defeito que o dono viu na foto. */

    /* 🔴 REENVIO É UM TOQUE DE GENTE, UMA VEZ, COM O MESMO CORPO. O botão trava
       no mesmo quadro do dedo (`disabled`) porque o repinte só chega depois da
       primeira resposta de rede — e dois toques rápidos aqui seriam a mesma
       mensagem duas vezes no WhatsApp do cliente, que é exatamente o padrão que
       baniu chip nesta casa. Nada de fila, nada de retry automático. */
    'reenviar-mensagem': (el) => {
      const alvo = String((el && el.dataset && el.dataset.msg) || '');
      const original = fioCruDaConversa.find((m) => m && String(m.id) === alvo);
      if (!original) return;
      const corpo = String(original.content || '').trim();
      if (!corpo) return;
      if (el) { el.disabled = true; el.classList.add('aguarde'); }
      enviarMensagem('empresa', corpo);
    },

    'recarregar-conversas': () => retentar('conversas', carregarConversa),
  });

  registrarCampos({
    /* SEM `espera` DE PROPÓSITO: este campo não fala com a rede nem escreve no
       seam — ele só mantém o rascunho vivo pra que a pintura possa devolvê-lo ao
       nó. Debounce aqui só atrasaria a cópia de uma variável.
       `aoEnter` existe porque a tecla de confirmar do teclado do Android é um
       botão de verdade na cara de quem está escrevendo: num campo de conversa
       ela significa "enviar", e ignorá-la é deixar a pessoa batendo numa tecla
       morta. O guarda de `enviando` lá dentro cobre o Enter seguido do toque. */
    'conversa-texto': {
      ao: (valor) => { rascunhoDaConversa = String(valor || ''); },
      aoEnter: () => enviarMensagem('empresa'),
    },
  });

  /* ==========================================================================
     EMPRESAS — a carteira (a base PJ do tenant) e a FICHA de uma delas.

     TRÊS PORTAS:
       GET  /nucleo/empresas?query=&uf=&page=&pageSize=   → a lista paginada
       GET  /nucleo/empresas/:id                          → a ficha + as pessoas
       POST /vendas/manual                                → vira lead e abre a conversa

     🔴 PAGINAÇÃO CONCATENA, NUNCA SUBSTITUI. "Carregar mais" que troca a página
     joga fora o que a pessoa já rolou: ela toca esperando ver MAIS e vê OUTRAS,
     com o dedo no meio da lista. A página 1 é a única que recomeça a lista — e
     ela recomeça sempre que o filtro muda, porque aí o conjunto é outro.

     🔴 OS CHIPS DE UF SÃO DA PONTE, não da API. O `listEmpresas` não devolve
     faceta nenhuma; 27 siglas chutadas na casca seriam filtro prometendo base
     que não existe (o desenho já some com a fileira quando `ufs` vem vazio).
     Aqui eles nascem do que JÁ CHEGOU — e nunca encolhem, senão o chip somiria
     debaixo do dedo justamente quando ele acabou de filtrar por ele.

     🔴 404 NA FICHA NÃO É "NÃO CONSEGUI CARREGAR". O controller do núcleo
     responde 404 tanto pra conta inexistente quanto pra conta de OUTRO tenant
     (de propósito: 403 vazaria a existência do registro). Nos dois casos a
     resposta certa não é uma ficha vazia com "não informado" em toda linha —
     isso lê como app quebrado. É voltar pra lista e dizer o que houve.
     ========================================================================== */

  const TAMANHO_DA_PAGINA_DA_CARTEIRA = 30;    // o mesmo default do servidor: página curta rola rápido

  let empresasVez = 0;             // ficha de corrida: resposta atrasada de filtro velho é ignorada
  let empresasCrua = [];           // o acumulado CRU das páginas (o `esc` é só pra pintar)
  let empresasPagina = 1;
  const ufsVistasNaCarteira = new Set();
  let fichaDaEmpresaCrua = null;            // a resposta CRUA da ficha — é dela que sai o POST
  let empresaMandando = false;       // reentrância do "Mandar pra Vendas"

  /* 🔴 A FICHA NASCE VAZIA A CADA ABERTURA, E ZERA INTEIRA. O que a ponte não
     escreve FICA: sem esta limpeza, abrir a segunda empresa mostraria o nome
     dela com o TELEFONE da primeira até a resposta chegar — e esta tela termina
     em "Falar no WhatsApp". A lista é a mesma do `apagarDemonstracao`; ela mora
     aqui de novo porque aquilo é a faxina do BOOT, e esta é a de cada toque. */
  const FICHA_DE_EMPRESA_ZERADA = {
    id: '', ini: '', nome: '', cnpj: '', documento: '', cidade: '', uf: '',
    endereco: '', numero: '', cep: '', pino: '', telefone: '', email: '',
    origem: '', desde: '', cliente: 0, lead: 0, fornecedor: 0,
    leadId: '', mandando: 0, contatos: [],
  };

  /** "00.000.000/0001-01" — 14 dígitos ou nada. O que não for CNPJ volta como
   *  veio: máscara aplicada a número torto escreve um documento que não existe. */
  const cnpjDaCarteira = (bruto) => {
    const d = String(bruto || '').replace(/\D/g, '');
    if (d.length !== 14) return String(bruto || '');
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  };
  const cepDaCarteira = (bruto) => {
    const d = String(bruto || '').replace(/\D/g, '');
    return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(bruto || '');
  };
  /** "03/2026" — o mês em que a conta entrou na carteira, no fuso da operação. */
  const mesNaCarteira = (iso) => {
    const ymd = diaEmSp(iso);
    return ymd ? `${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '';
  };

  const filtroDaCarteira = () => {
    let d = {};
    try { d = DADOS.empresas || {}; } catch (_) { d = {}; }
    return { busca: String(d.busca || '').trim(), uf: String(d.ufSel || '').trim().toUpperCase() };
  };

  function traduzirEmpresaDaCarteira(e) {
    const x = e || {};
    const nome = String(x.name || '').trim();
    return {
      id: String(x.id || ''),
      ini: esc(iniciais(nome)),
      nome: esc(nome),
      // a segunda linha é composta pela TELA (ela sabe dizer "sem CNPJ e sem
      // cidade" quando faltam os dois); aqui cada pedaço vai inteiro ou vazio
      cnpj: esc(cnpjDaCarteira(x.cnpj)),
      cidade: esc(String(x.cidade || '').trim()),
      uf: esc(String(x.uf || '').trim()),
      cliente: x.isCliente ? 1 : 0,
      lead: x.isLead ? 1 : 0,
      fornecedor: x.isFornecedor ? 1 : 0,
      contatos: Math.max(0, Math.trunc(Number(x.contatosCount) || 0)),
      origem: esc(String(x.origin || '').trim()),
    };
  }

  /**
   * `pagina > 1` CONCATENA; qualquer outra coisa recomeça a lista.
   * Toda chamada carimba uma vez (`empresasVez`): a resposta de um filtro que a
   * pessoa já trocou chega depois e seria a lista errada com o chip certo aceso
   * — o defeito que parece "o filtro não funciona" e é só uma corrida perdida.
   */
  function carregarEmpresas(pagina) {
    if (!temPonte()) return Promise.resolve();
    const alvo = Math.max(1, Math.trunc(Number(pagina) || 1));
    const mais = alvo > 1;
    const f = filtroDaCarteira();
    const vez = ++empresasVez;

    if (mais) usar('empresas', { carregandoMais: 1 });
    const q = [`page=${alvo}`, `pageSize=${TAMANHO_DA_PAGINA_DA_CARTEIRA}`];
    if (f.busca) q.push(`query=${encodeURIComponent(f.busca)}`);
    if (f.uf) q.push(`uf=${encodeURIComponent(f.uf)}`);

    return window.API.get(`/nucleo/empresas?${q.join('&')}`).then((r) => {
      if (vez !== empresasVez) return;                 // filtro velho: a resposta não vale mais
      if (!r || !Array.isArray(r.items)) { fonteCaiu('empresas'); return; }
      empresasCrua = mais ? empresasCrua.concat(r.items) : r.items.slice();
      empresasPagina = Math.max(1, Math.trunc(Number(r.page) || alvo));
      r.items.forEach((e) => {
        const uf = String((e && e.uf) || '').trim().toUpperCase();
        if (uf) ufsVistasNaCarteira.add(uf);
      });
      usar('empresas', Object.assign({}, fonteVoltou, {
        lista: empresasCrua.map(traduzirEmpresaDaCarteira),
        ufs: Array.from(ufsVistasNaCarteira).sort(),
        /* `total` e `totalPaginas` são do SERVIDOR, nunca `lista.length`: somar
           a página na mão é como lista paginada mente ("30 na carteira" com 128
           lá dentro). O rodapé mostra os dois números de propósito — um é a
           carteira, o outro é o que coube nesta tela. */
        total: String(Math.max(0, Math.trunc(Number(r.total) || 0))),
        pagina: empresasPagina,
        totalPaginas: Math.max(1, Math.trunc(Number(r.totalPages) || 1)),
        carregandoMais: 0,
      }));
    }).catch((e) => {
      if (vez !== empresasVez) return;
      // O "Carregar mais" que falhou solta o botão ANTES do aviso: botão preso
      // em "Carregando…" pra sempre é o defeito que a pessoa resolve fechando o app.
      usar('empresas', { carregandoMais: 0 });
      fonteCaiu('empresas', e);
    });
  }

  /* Filtro novo = lista nova. O esqueleto volta porque o conjunto vai mudar
     inteiro — sem ele a lista antiga fica de pé mentindo até a resposta. */
  function refiltrarCarteira() {
    usar('empresas', { carregando: true, semFonte: false, carregandoMais: 0 });
    empresasCrua = [];
    return carregarEmpresas(1);
  }

  /* ------------------------------------------------------------------------
     A FICHA.
     ------------------------------------------------------------------------ */
  function traduzirPessoaDaEmpresa(c) {
    const x = c || {};
    /* PODE FALAR é DERIVADO do que existe (WhatsApp ou telefone), nunca uma
       bandeira que a ponte liga na mão — bandeira paralela ao dado é como as
       duas discordam. O desenho usa isso pra decidir se a linha é clicável. */
    const fone = telefoneBonito(x.whatsapp || x.phone);
    const partes = [String(x.cargo || '').trim(), fone || 'sem WhatsApp'].filter(Boolean);
    return {
      id: String(x.id || ''),
      ini: esc(iniciais(x.nome)),
      nome: esc(String(x.nome || '').trim()),
      sub: esc(partes.join(' · ')),
      principal: x.isPrincipal ? 1 : 0,
      podeFalar: (x.whatsapp || x.phone) ? 1 : 0,
    };
  }

  function vestirFichaDaEmpresa(e) {
    fichaDaEmpresaCrua = e;
    const contatos = Array.isArray(e && e.contatos) ? e.contatos : [];
    usar('empresaficha', Object.assign({}, fonteVoltou, {
      id: String(e.id || ''),
      ini: esc(iniciais(e.name)),
      nome: esc(String(e.name || '').trim()),
      cnpj: esc(cnpjDaCarteira(e.cnpj)),
      documento: esc(String(e.document || '').trim()),
      cidade: esc(String(e.cidade || '').trim()),
      uf: esc(String(e.uf || '').trim()),
      endereco: esc(String(e.endereco || '').trim()),
      numero: esc(String(e.numero || '').trim()),
      cep: esc(cepDaCarteira(e.cep)),
      /* `pino` é COPY curta feita a partir de lat/lng — a ficha não desenha
         mapa (este app não tem tela de mapa, e botão que abre o nada é o botão
         morto que esta casa já matou três vezes). Sem coordenada, a linha some:
         "local não confirmado" seria alarme sobre uma ausência banal. */
      pino: (e.lat != null && e.lng != null) ? 'coordenada confirmada' : '',
      telefone: esc(telefoneBonito(e.phone)),
      email: esc(String(e.email || '').trim()),
      origem: esc(String(e.origin || '').trim()),
      desde: mesNaCarteira(e.createdAt),
      cliente: e.isCliente ? 1 : 0,
      lead: e.isLead ? 1 : 0,
      fornecedor: e.isFornecedor ? 1 : 0,
      /* 🔴 `leadId` VAZIO NÃO É ESQUECIMENTO: a porta do núcleo é de CADASTRO e
         não devolve o vínculo com o funil (a conversa é por LEAD, não por
         conta). Vazio é a verdade que o servidor contou, e o desenho já
         responde a ela com o verbo certo — "Mandar pra Vendas", que CRIA o
         vínculo. Chutar um id aqui abriria uma conversa com o lead errado. */
      leadId: '',
      mandando: 0,
      contatos: contatos.map(traduzirPessoaDaEmpresa),
    }));
  }

  function fichaDaEmpresaSumiu() {
    let volta = 'empresas';
    try { volta = String((DADOS.empresaficha && DADOS.empresaficha.volta) || 'empresas'); } catch (_) {}
    // Sai da ficha ANTES de falar: cena própria quer dizer que a tela vazia
    // nunca chega a existir — a pessoa volta pra lista, que é o que vale.
    if (typeof window.ir === 'function') window.ir(volta);
    if (typeof window.portao !== 'function') return;
    window.portao({
      tom: 'alerta', ico: 'store', titulo: 'Empresa não encontrada',
      sub: 'Ela saiu da carteira da sua empresa (ou nunca foi dela). A lista aqui atrás é a que vale.',
      acoes: [['Entendi', 'principal', true]],
    });
  }

  function carregarFichaDaEmpresa() {
    if (!temPonte()) return Promise.resolve();
    let id = '';
    try { id = String((DADOS.empresaficha && DADOS.empresaficha.id) || ''); } catch (_) {}
    if (!id) return Promise.resolve();
    return window.API.get(`/nucleo/empresas/${encodeURIComponent(id)}`).then((e) => {
      if (!e || !e.id) { fonteCaiu('empresaficha'); return; }
      vestirFichaDaEmpresa(e);
    }).catch((erro) => {
      if (erro && erro.status === 404) { fichaDaEmpresaSumiu(); return; }
      fonteCaiu('empresaficha', erro);
    });
  }

  function abrirFichaDaEmpresa(id, volta) {
    if (!id) return;
    fichaDaEmpresaCrua = null;
    usar('empresaficha', Object.assign({}, FICHA_DE_EMPRESA_ZERADA, {
      id, volta: volta || 'empresas', carregando: true, semFonte: false,
    }));
    if (typeof window.ir === 'function') window.ir('empresaficha');
  }

  /* ------------------------------------------------------------------------
     A PORTA PRA CONVERSA — o centro desta tela.
     ------------------------------------------------------------------------ */

  /* 🔴 A PORTA DA CONVERSA TEM UM DONO SÓ, E NÃO É ESTE ARQUIVO. Quem abre um
     lead é o módulo da conversa (`abrir-lead`, em `50-conversas.js`): é lá que
     mora o estado do fio (qual lead está aberto, o rascunho, as mensagens
     cruas), e reescrever a abertura aqui seria a SEGUNDA cópia da mesma cena —
     a que ficar pra trás no dia em que o cabeçalho mudar é a que mente. Pior:
     escrever só no seam e chamar `ir('conversas')` abriria a tela com "Abra um
     lead no Funil para conversar aqui", porque quem manda lá é a variável do
     módulo, não o `DADOS`.

     Então esta função só resolve o NÓ que aquele dono espera — ele lê
     `dataset.lead` e faz o resto: limpa o lead anterior, pinta o cabeçalho,
     navega, e diz a frase certa quando o admin desligou o módulo Conversas. O
     `volta` sai de graça e certo: ele carimba a tela de onde o dedo veio, que
     aqui é a ficha da empresa. */
  function abrirConversaVindaDaCarteira(no, leadId) {
    const id = String(leadId || '').trim();
    if (!id) return;
    const alvo = (no && no.dataset) ? no : document.createElement('button');
    alvo.dataset.lead = id;
    abrirConversaDoLead(alvo);
  }

  /* Um e-mail torto derruba o POST INTEIRO (`@IsEmail` no DTO) e a pessoa
     perderia a criação do lead por causa de um campo que nem é obrigatório.
     Manda só o que tem cara de e-mail; o resto viaja sem ele. */
  const emailQueOServidorAceita = (v) => {
    const e = String(v || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : '';
  };

  /**
   * Cria o lead a partir da FICHA CRUA (nunca do seam: lá o texto já passou pelo
   * `esc()`, e gravar "BAR &amp; CIA" no funil é um nome errado pra sempre) e só
   * então abre a conversa. `telefone` opcional troca o número da conta pelo da
   * pessoa que o dedo escolheu.
   */
  function mandarEmpresaParaVendas(el, telefone) {
    if (!temPonte()) return;
    if (empresaMandando) return;
    if (!fichaDaEmpresaCrua) { avisoErro(new Error('A ficha ainda não terminou de carregar.')); return; }

    const contatos = Array.isArray(fichaDaEmpresaCrua.contatos) ? fichaDaEmpresaCrua.contatos : [];
    const doContato = contatos.map((c) => (c && (c.whatsapp || c.phone)) || '').filter(Boolean)[0] || '';
    const fone = String(telefone || fichaDaEmpresaCrua.phone || doContato || '').trim();
    const nome = String(fichaDaEmpresaCrua.name || '').trim();
    const email = emailQueOServidorAceita(fichaDaEmpresaCrua.email);
    if (!nome && !fone && !email) {
      avisoErro(new Error('Esta empresa não tem nome, telefone nem e-mail — não há o que mandar pra Vendas.'));
      return;
    }

    empresaMandando = true;
    // O "aguarde" entra no MESMO quadro do dedo, no nó tocado — e o seam faz o
    // rótulo do botão virar "Mandando…" pra quem estiver olhando o repinte.
    if (el) { el.setAttribute('aria-busy', 'true'); el.classList.add('aguarde'); if ('disabled' in el) el.disabled = true; }
    usar('empresaficha', { mandando: 1 });

    const corpo = {
      name: nome || undefined,
      phone: fone ? fone.slice(0, 24) : undefined,
      address: [fichaDaEmpresaCrua.endereco, fichaDaEmpresaCrua.numero, fichaDaEmpresaCrua.cidade, fichaDaEmpresaCrua.uf]
        .map((p) => String(p || '').trim()).filter(Boolean).join(', ').slice(0, 280) || undefined,
    };
    if (email) corpo.email = email;

    window.API.post('/vendas/manual', corpo).then((r) => {
      const leadId = String((r && r.lead && r.lead.id) || '');
      usar('empresaficha', { mandando: 0, leadId, lead: 1 });
      if (!leadId) {
        // O servidor confirmou sem dizer QUEM nasceu: abrir a conversa de um id
        // vazio seria uma tela em branco com cara de travamento.
        avisoErro(new Error('O lead foi criado, mas o servidor não devolveu o número dele. Ele já está no funil.'));
        return;
      }
      abrirConversaVindaDaCarteira(el, leadId);
    }).catch((erro) => {
      usar('empresaficha', { mandando: 0 });
      avisoErro(erro);
    }).finally(() => {
      empresaMandando = false;
      if (el) { el.removeAttribute('aria-busy'); el.classList.remove('aguarde'); }
    });
  }

  /* ------------------------------------------------------------------------
     OS REGISTROS.
     ------------------------------------------------------------------------ */
  registrarTelas({
    /* Entrar na carteira relê a PÁGINA 1 — e as páginas extras que a pessoa
       tinha carregado não voltam. É de propósito: a alternativa seria refazer N
       requisições pra reconstruir uma rolagem que o celular já perdeu de
       qualquer jeito, ou mostrar dado velho de quando ela saiu. Voltar da ficha
       de uma empresa que acabou de virar lead tem que mostrar o selo novo. */
    empresas: () => carregarEmpresas(1),
    empresaficha: carregarFichaDaEmpresa,
  });

  registrarAcoes({
    'abrir-empresa': (el) => abrirFichaDaEmpresa(String((el.dataset && el.dataset.empresa) || ''), 'empresas'),
    'recarregar-empresas': () => retentar('empresas', () => carregarEmpresas(1)),
    'recarregar-empresa': () => retentar('empresaficha', carregarFichaDaEmpresa),

    'empresa-uf': (el) => {
      const uf = String((el.dataset && el.dataset.uf) || '').trim().toUpperCase();
      let atual = '';
      try { atual = String((DADOS.empresas && DADOS.empresas.ufSel) || ''); } catch (_) {}
      if (uf === atual) return;                       // tocar no chip aceso não repete a busca
      usar('empresas', { ufSel: uf });
      refiltrarCarteira();
    },
    'empresas-limpar': () => {
      usar('empresas', { busca: '', ufSel: '' });
      refiltrarCarteira();
    },
    'empresas-mais': () => {
      let d = {};
      try { d = DADOS.empresas || {}; } catch (_) { d = {}; }
      // Um toque, uma página: o botão já está em "Carregando…" e o segundo toque
      // duplicaria a MESMA página no meio da lista.
      if (d.carregandoMais) return;
      if (Number(d.pagina || 1) >= Number(d.totalPaginas || 1)) return;
      carregarEmpresas(Number(d.pagina || 1) + 1);
    },

    // Já é lead: a conversa está a um toque, sem criar nada e sem cobrar nada.
    'abrir-conversa-empresa': (el) => abrirConversaVindaDaCarteira(el, String((el.dataset && el.dataset.lead) || '')),
    'mandar-para-vendas': (el) => mandarEmpresaParaVendas(el, ''),

    /* Tocar na PESSOA é o mesmo destino com outro número: falar com a empresa
       POR ELA. Se a conta já virou lead, abre a conversa; se não, ela nasce com
       o telefone desta pessoa — que é justamente por onde o dedo escolheu
       falar. Nunca um segundo lead por contato: a conversa é da EMPRESA. */
    'falar-contato': (el) => {
      const id = String((el.dataset && el.dataset.contato) || '');
      let leadId = '';
      try { leadId = String((DADOS.empresaficha && DADOS.empresaficha.leadId) || ''); } catch (_) {}
      if (leadId) { abrirConversaVindaDaCarteira(el, leadId); return; }
      const contatos = Array.isArray(fichaDaEmpresaCrua && fichaDaEmpresaCrua.contatos) ? fichaDaEmpresaCrua.contatos : [];
      const pessoa = contatos.find((c) => String((c && c.id) || '') === id);
      const fone = String((pessoa && (pessoa.whatsapp || pessoa.phone)) || '').trim();
      if (!fone) return;                              // o desenho só marca quem TEM por onde falar
      mandarEmpresaParaVendas(el, fone);
    },
  });

  registrarCampos({
    /* 🔴 ESTA BUSCA VAI AO SERVIDOR — e é por isso que ela espera mais que a do
       funil (180 ms lá, porque lá o filtro é local e só custa um repinte). Aqui
       cada letra sem respiro seria uma varredura de CustomerProfile por tecla:
       "distribuidora" são 13 consultas na base inteira do tenant. 320 ms é o
       tempo de tirar o dedo da tecla; o caret sobrevive porque a casca mede e
       devolve o foco. */
    'busca-empresa': {
      espera: 320,
      ao: (valor) => {
        let antes = '';
        try { antes = String((DADOS.empresas && DADOS.empresas.busca) || ''); } catch (_) {}
        if (String(valor || '') === antes) return;
        usar('empresas', { busca: valor });
        refiltrarCarteira();
      },
    },
  });

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

  /* 🔴 O E-MAIL VEM EM DUAS FORMAS DO SERVIDOR — texto puro e `{email}` /
     `{address}` do enriquecimento — e as DUAS já apareceram em produção. Esta
     régua é uma só porque ela serve o DESENHO e a AÇÃO: em 19/08 elas eram
     duas, o desenho lia o objeto e a ação lia o cru, e o botão "E-mail"
     aparecia na tela pra depois dizer "este lead não tem e-mail" — o pior dos
     dois mundos (o portão da prova pegou).
     🔴 E ELA DEVOLVE O CRU, NUNCA O `esc()`: quem escapa é a tradução, na
     borda da tela. Um `&amp;` viajando dentro de um `mailto:` é um endereço
     que não existe. */
  const umEmail = (bruto) => String((bruto && (bruto.email || bruto.address)) || bruto || '').trim();
  function emailsDoLead(l) {
    const c = l || {};
    const achados = [];
    [c.email].concat(Array.isArray(c.emails) ? c.emails : []).forEach((e) => {
      const limpo = umEmail(e);
      if (limpo && limpo.indexOf('@') > 0 && achados.indexOf(limpo) < 0) achados.push(limpo);
    });
    return achados;
  }

  function emailDoToque(el) {
    const doNo = String((el && el.dataset && el.dataset.email) || '').trim();
    if (doNo) return doNo;
    return emailsDoLead(fichaCruaDoLead)[0] || '';
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

    const emails = emailsDoLead(c).map(esc);

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
       relatório: o sétimo evento empurra pra baixo o que interessa.

       🔴 A DESCRIÇÃO PASSA POR UM FILTRO, E ELE NASCEU DE UMA FOTO (19/08, g15).
       O evento "Enriquecimento social do Radar" guarda no `description` o
       PAYLOAD do enriquecimento — `{"radarLeadId":"cmqu6…","enrichmentStatus":
       "queued",…` — e a tela despejava isso na cara do vendedor, quinze linhas
       de JSON no meio do histórico. Vocabulário de banco na tela é a coisa que
       esta casa não publica: o TÍTULO do evento ("Enriquecimento social do
       Radar") já diz tudo que uma pessoa precisa saber dele.
       O filtro é sobre a FORMA, não sobre uma lista de eventos proibidos: o dia
       em que o servidor guardar JSON noutro tipo de evento, ele já está coberto.
       E o corte de 160 caracteres é de TELA — descrição que vira parágrafo
       empurra os outros eventos pra fora do vidro. */
    const pareceMaquina = (t) => {
      const texto = String(t || '').trim();
      if (!texto) return true;
      if (texto[0] === '{' || texto[0] === '[') return true;      // JSON cru, inteiro
      if (/"[a-zA-Z_]+"\s*:/.test(texto)) return true;            // par chave:valor no meio da frase
      return false;
    };
    const recadoDoEvento = (t) => {
      if (pareceMaquina(t)) return '';
      const texto = String(t).trim().replace(/\s+/g, ' ');
      return texto.length > 160 ? `${texto.slice(0, 157)}…` : texto;
    };
    const historia = (Array.isArray(c.timeline) ? c.timeline : []).slice(0, 6).map((e) => [
      esc(quandoDoToque(e && e.createdAt) || ''),
      esc((e && e.title) || 'Atualização'),
      esc(recadoDoEvento(e && e.description)),
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

  /* ==========================================================================
     AJUSTES — o índice e as quatro telas de dentro (perfil, WhatsApp, módulos,
     créditos). É a porta de tudo neste app: por lei da casca, Ajustes NUNCA some
     da barra (murar esta porta seria prender a pessoa).

     CADA TELA TEM A SUA PORTA E O SEU DESFECHO:
       GET /profile                        → Meu perfil (e quem é admin)
       GET /credits/me                     → Créditos (saldo, lotes, pacotes)
       GET /companies/me/whatsapp-status   → WhatsApp da empresa
       GET /modules/me                     → Módulos liberados **e a BARRA**
     Nenhuma delas derruba a outra: quem cai, cai sozinha, com o "Tentar de novo"
     dela. O índice mostra um RESUMO de cada uma — e o resumo é escrito pelo
     MESMO carregador da tela de dentro, num lugar só. Duas contas do mesmo
     número em dois lugares é como o índice e a tela passam a discordar.
     ========================================================================== */

  /* ------------------------------------------------------------------------
     MÓDULOS — e por que este carregador é o mais importante do arquivo.

     🔴 ELE MANDA NA BARRA. Módulo que o admin não liberou não pode virar botão:
     o servidor recusa com `403 MODULE_ACCESS_DENIED` e — até 18/08 — a tela não
     dizia UMA PALAVRA. Medido: um cliente pareou o aparelho e levou 39 respostas
     403 em 65 segundos porque o módulo estava desligado desde o cadastro; ele
     tocava, tocava, e concluiu que o aplicativo estava quebrado. Aqui a barra
     obedece o servidor ANTES do toque, e a tela "Módulos liberados" escreve o
     porquê pra quem for procurar.

     🔴 REDE CAÍDA NÃO ESCONDE MÓDULO. É o CONTRÁRIO do resto desta ponte (onde
     fonte fora do ar vira aviso): o `catch` volta SEM escrever, e o campo fica
     como estava — vazio no boot, ou seja, a barra inteira. Aqui o silêncio não
     pode TIRAR nada de quem está trabalhando.

     🔴 E CHAVE AUSENTE TAMBÉM NÃO ESCONDE. Se o `/modules/me` não citar
     `conversas`, isso é "não sei" (catálogo antigo, migration pendente), não
     "desligado" — e desligar por omissão apagaria um módulo inteiro da barra de
     todo mundo no dia de um deploy pela metade.
     ------------------------------------------------------------------------ */

  /* A tradução entre o vocabulário da BARRA (o que o dedo vê) e o do CATÁLOGO
     (o que o servidor guarda). Ela existe porque os dois nomes divergem de
     verdade em dois pontos, e adivinhar qualquer um deles esconderia um botão:
     · `radar` na barra é `webscraping` no catálogo — o nome antigo do módulo;
     · `agenda` NÃO é módulo. O `/atividades` é gateado por `vendas` no próprio
       controller ("Atividades é a agenda dentro da carteira do vendedor, não um
       módulo à parte"), então ela vive e morre com o funil — e o funil, por lei
       da casca, nunca some.
     `ajustes` não entra: não é módulo e não pode sumir. */
  const MODULOS_DA_BARRA = [
    ['vendas', 'vendas', 'sales', 'Vendas', 'o funil, os leads e as tentativas'],
    ['radar', 'webscraping', 'target', 'Radar', 'buscar empresas novas'],
    ['agenda', 'vendas', 'calendar', 'Agenda', 'o que fazer hoje'],
    ['conversas', 'conversas', 'chat', 'Conversas', 'falar pelo WhatsApp da empresa'],
    ['empresas', 'empresas', 'store', 'Empresas', 'a base de CNPJ'],
  ];

  /* 🔴 O MOTIVO VIAJA NO DADO, e ele MANDA A PESSOA FALAR COM GENTE DIFERENTE.
     "A empresa não liberou" é assunto do administrador; "seu usuário não tem
     permissão" é assunto de quem distribui acesso dentro da empresa. Quem sabe
     qual é são o `companyEnabled` e o `userAllowed` do servidor — uma frase
     genérica ("sem acesso") faria a pessoa reclamar no lugar errado e voltar
     achando que o app é que está quebrado. */
  function motivoDoModulo(m, resumo) {
    if (!m) return resumo;                       // não sei: fica o resumo do que o módulo faz
    if (m.accessible) return resumo;
    if (m.companyEnabled === false) return 'a empresa não liberou este módulo';
    if (m.userAllowed === false) return 'seu usuário não tem permissão para este módulo';
    return 'este módulo não está liberado agora';
  }

  function carregarModulos() {
    if (!temPonte()) return Promise.resolve();
    return window.API.get('/modules/me').then((lista) => {
      if (!Array.isArray(lista)) return;
      const porChave = Object.create(null);
      lista.forEach((m) => { if (m && m.key) porChave[String(m.key)] = m; });

      const desligados = [];
      const linhas = [];
      MODULOS_DA_BARRA.forEach(([naBarra, noCatalogo, ico, rotulo, resumo]) => {
        const m = porChave[noCatalogo];
        // AUSENTE = NÃO SEI = LIGADO (ver a lei acima). Só o `accessible: false`
        // explícito apaga um botão.
        const ligado = !m || m.accessible !== false;
        if (!ligado && desligados.indexOf(naBarra) < 0) desligados.push(naBarra);
        linhas.push([ico, rotulo, motivoDoModulo(m, resumo), ligado ? 1 : 0]);
      });

      usar('barra', { desligados: desligados.join(',') });
      /* A pessoa pode estar OLHANDO justamente o módulo que acabou de ser
         desligado — a configuração chega enquanto o app está aberto, que é o
         caso normal. Sem isto ela fica numa tela sem botão aceso na barra,
         presa. A casca sabe devolver pra casa. */
      try {
        if (typeof window.resgatarModuloDesligado === 'function') window.resgatarModuloDesligado();
      } catch (_) { /* casca sem a função: nada a resgatar */ }

      const ligados = linhas.filter((l) => l[3]).length;
      usar('modulos', Object.assign({}, fonteVoltou, { lista: linhas }));
      usar('ajustes', { modulosLinha: `${ligados} de ${linhas.length}` });
    }).catch((e) => {
      // A BARRA fica como está (ver a lei); quem tem direito a aviso é só a TELA
      // de módulos, e só se ela ainda estiver no esqueleto da primeira carga.
      fonteCaiu('modulos', e);
    });
  }

  /* ------------------------------------------------------------------------
     MEU PERFIL — e a régua de QUEM É ADMIN, que decide o dinheiro na tela.
     ------------------------------------------------------------------------ */

  /* 🔴 O PAPEL SAI DO SERVIDOR, NÃO DE UM PALPITE DA TELA. `userKind` e
     `canViewBilling` são a régua canônica do backend (master › dono › gerente ›
     vendedor); traduzir `role` cru aqui faria a tela chamar de "Administrador"
     um gerente que não vê cobrança — e é justamente essa diferença que decide se
     a linha de Créditos existe. */
  function papelDaPessoa(p) {
    if (!p) return '';
    if (p.isSystemMaster) return 'Master';
    const tipo = String(p.userKind || '');
    if (tipo === 'admin') return p.canViewBilling ? 'Dono da conta' : 'Gerente';
    if (tipo === 'seller') return 'Vendedor';
    return '';
  }

  /* O aparelho é a única linha desta tela que NÃO vem do `/profile`: ela é o
     PAREAMENTO, e quem o conhece é a ponte (`appInfo`).
     🔴 E ELA RESPONDE UMA PERGUNTA SÓ: "este aparelho está vinculado?".
     `appInfo()` não devolve modelo nem data de pareamento — só o `sessionScope`,
     que é o hash opaco da credencial gravada (vazio = nenhum vínculo). Escrever
     "Moto G15 · pareado em 12/08" com esses dados seria inventar as duas
     metades; e sem vínculo a linha SOME, em vez de dizer "—". */
  function linhaDoAparelho() {
    try {
      const i = window.HBX.info() || {};
      if (!String(i.sessionScope || '').trim()) return '';
      return i.versionCode ? `pareado · app ${Number(i.versionCode)}` : 'pareado';
    } catch (_) { return ''; }
  }

  function carregarPerfil() {
    if (!temPonte()) return Promise.resolve();
    return window.API.get('/profile').then((p) => {
      if (!p) return fonteCaiu('perfil');
      const admin = p.canViewBilling ? 1 : 0;
      const empresa = (p.company && p.company.name) || '';
      usar('perfil', Object.assign({}, fonteVoltou, {
        nome: esc(p.name || p.username || ''),
        papel: esc(papelDaPessoa(p)),
        email: esc(p.email || ''),
        // O telefone que o `/profile` conhece é o da EMPRESA (contactPhone) — a
        // pessoa não tem telefone próprio nesta resposta. Rotulá-lo como "seu
        // telefone" seria mentira; ele entra em "Onde você trabalha", junto do
        // nome da empresa, que é onde ele é verdade.
        telefone: '',
        empresa: esc(empresa),
        cidade: '',
        aparelho: esc(linhaDoAparelho()),
      }));
      usar('ajustes', Object.assign({}, fonteVoltou, {
        admin,
        perfilNome: esc(p.name || p.username || 'Meu perfil'),
        perfilSub: esc(p.email || ''),
      }));
      /* O tutor precisa saber DUAS coisas antes de decidir qualquer capítulo:
         que já não está mais "carregando" (enquanto está, ele não esconde nada) e
         se esta pessoa é audiência de cobrança — é isso que diz se o capítulo de
         créditos existe pra ela. */
      usar('tutorial', { carregando: 0, admin, obrigatorioVisto: tutorialJaVisto() });
    }).catch((e) => {
      fonteCaiu('perfil', e);
      fonteCaiu('ajustes', e);
    });
  }

  /* ------------------------------------------------------------------------
     O TUTOR — a memória é DO APARELHO, e é assim porque não há porta.

     O app do motorista guarda "já viu o tutorial obrigatório" no servidor
     (`/logistica/tutorial`); em Vendas essa porta não existe. Inventar uma
     chamada pra um endereço que ninguém escreveu daria 404 a cada boot — e a
     ponte trataria o 404 como "não sei", prendendo a pessoa no tutorial pra
     sempre ou nunca o abrindo. Enquanto a porta não nasce, quem lembra é o
     aparelho: é a mesma memória que a casca já usa pros capítulos avulsos
     (`localStorage`, `hbx:tutor:*`), então o app tem UM dono da lembrança.
     ⚠️ Consequência honesta e anotada: trocar de aparelho reabre a lição.
     ------------------------------------------------------------------------ */
  const TUTOR_VISTO = 'tutorial-obrigatorio-visto';
  const tutorialJaVisto = () => {
    try { return Number(window.HBX.cache.get(TUTOR_VISTO, 0)) ? 1 : 0; } catch (_) { return 0; }
  };
  /* O mock declara `window.tutorialConcluido` como NO-OP e diz, por escrito, que
     a ponte o sobrescreve: sem isto o obrigatório terminaria e voltaria a abrir
     no próximo boot, cobrando o mesmo minuto todo dia. */
  window.tutorialConcluido = function () {
    try { window.HBX.cache.set(TUTOR_VISTO, 1); } catch (_) {}
    usar('tutorial', { obrigatorioVisto: 1 });
  };

  /* ------------------------------------------------------------------------
     WHATSAPP DA EMPRESA — a tela que existe porque o silêncio dela custa venda.
     ------------------------------------------------------------------------ */

  /* 🔴 "NÃO SEI" NÃO PODE VIRAR NENHUM DOS DOIS SELOS. Pintar "conectado" por
     omissão faz o vendedor escrever a mensagem e descobrir depois que nada saiu;
     pintar "desconectado" por omissão manda ele incomodar o administrador por um
     problema que talvez não exista. Os dois erros são caros — e `conectado:null`
     apaga o selo, que é o único estado honesto. */
  function carregarWhatsapp() {
    if (!temPonte()) return Promise.resolve();
    return window.API.get('/companies/me/whatsapp-status').then((z) => {
      if (!z || typeof z.connected !== 'boolean') return fonteCaiu('whatsapp');
      const on = z.connected ? 1 : 0;
      const numero = telefoneBonito(z.displayNumber);
      usar('whatsapp', Object.assign({}, fonteVoltou, {
        conectado: on,
        numero: esc(numero),
        // O `status` é o vocabulário do motor (connecting/close/open…). Ele vira
        // frase só quando diz algo que o selo já não disse; senão a linha some.
        estado: on ? 'conectado agora' : esc(estadoDoChip(z.status)),
        // A hora é do RELÓGIO, e relógio é da ponte — o servidor não manda "às
        // 9:41". É ela que prova que o "Atualizar" fez alguma coisa.
        conferido: `conferido às ${hora(new Date().toISOString())}`,
      }));
      usar('ajustes', { zapLigado: on, zapNumero: esc(numero) });
    }).catch((e) => {
      fonteCaiu('whatsapp', e);
      // O selo do ÍNDICE volta pro silêncio: ele não pode continuar dizendo
      // "conectado" com a resposta que sustentava isso no chão.
      usar('ajustes', { zapLigado: null });
    });
  }
  const ESTADO_DO_CHIP = {
    open: 'conectado agora',
    connecting: 'conectando…',
    close: 'desconectado',
    qr: 'esperando leitura do QR',
  };
  const estadoDoChip = (status) => ESTADO_DO_CHIP[String(status || '').toLowerCase()] || 'sem WhatsApp conectado';

  /* ------------------------------------------------------------------------
     CRÉDITOS — a mesma tela do motorista com a régua do dinheiro INVERTIDA.

     🔴 QUEM DECIDE SE APARECE DINHEIRO É O SERVIDOR, E A OMISSÃO É "NÃO". O
     `/credits/me` tem DUAS respostas: pra audiência de cobrança vem `balance`,
     `lots` e `packs`; pro VENDEDOR vem só `leadsDisponiveis` — sem R$, sem
     pacote, sem preço (LEI DO VENDEDOR, docs/Rules/PAGAMENTOS.md). A ponte não
     escolhe a face: ela LÊ qual das duas chegou. `cobranca` só vale 1 quando o
     `balance` veio — assim, se um dia esta tradução errar, ela erra pro lado de
     ESCONDER preço.
     ------------------------------------------------------------------------ */
  let pacoteEscolhido = null;

  function carregarCreditos() {
    if (!temPonte()) return Promise.resolve();
    return window.API.get('/credits/me').then((cred) => {
      if (!cred) return fonteCaiu('creditos');
      const temDinheiro = typeof cred.balance === 'number';
      const saldo = temDinheiro ? cred.balance
        : (typeof cred.leadsDisponiveis === 'number' ? cred.leadsDisponiveis : null);
      const packs = temDinheiro && Array.isArray(cred.packs) ? cred.packs : [];
      if (!pacoteEscolhido && packs.length) {
        const rec = packs.find((p) => p.recommended) || packs[0];
        pacoteEscolhido = rec ? rec.key : null;
      }
      const atual = packs.find((p) => p.key === pacoteEscolhido) || null;
      usar('creditos', Object.assign({}, fonteVoltou, {
        cobranca: temDinheiro ? 1 : 0,
        saldo: saldo != null ? String(saldo) : '',
        vence: temDinheiro ? creditoVencendo(cred) : '',
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
      }));
      /* A linha do índice fala a língua da face que chegou: "240 créditos" pra
         quem compra, "240 leads" pra quem gasta (1 crédito = 1 lead — é a mesma
         régua do desenho). Escrever "créditos" pro vendedor seria empurrar
         vocabulário de dinheiro pra quem o backend decidiu não mostrar. */
      const unidade = temDinheiro
        ? (saldo === 1 ? 'crédito' : 'créditos')
        : (saldo === 1 ? 'lead' : 'leads');
      usar('ajustes', { creditosLinha: saldo != null ? `${saldo} ${unidade}` : '' });
    }).catch((e) => fonteCaiu('creditos', e));
  }

  /* 🔴 O CRÉDITO VENCE, E O APP NUNCA DISSE ISSO. O `lots[]` traz `remaining` e
     `expiresAt` desde sempre e ninguém lia: compra-se 300 créditos com 90 dias
     de validade e descobre-se o vencimento pelo saldo que sumiu. Dinheiro que
     evapora calado é a pior surpresa que um produto guarda.
     Só o lote que vence PRIMEIRO, e só dentro de 30 dias: aviso permanente vira
     paisagem, e lote de 89 dias não é notícia. */
  function creditoVencendo(cred) {
    const lots = Array.isArray(cred && cred.lots) ? cred.lots : [];
    const vivos = lots
      .map((l) => ({ resta: Number(l && l.remaining), quando: l && l.expiresAt }))
      .filter((l) => l.resta > 0 && l.quando && isFinite(new Date(l.quando).getTime()));
    if (!vivos.length) return '';
    const limite = Date.now() + 30 * 86400000;
    const primeiro = vivos
      .map((l) => Object.assign({}, l, { t: new Date(l.quando).getTime() }))
      .sort((a, b) => a.t - b.t)[0];
    if (primeiro.t > limite) return '';
    // Lotes que vencem NO MESMO DIA somam: são um vencimento só pra quem lê.
    const dia = diaCurto(primeiro.quando);
    const soma = vivos.reduce((s, l) => s + (diaCurto(l.quando) === dia ? l.resta : 0), 0);
    return `${soma} ${soma === 1 ? 'crédito vence' : 'créditos vencem'} em ${dia}`;
  }

  /* O que faz escolher: o preço POR CRÉDITO (a única conta que responde "qual é
     o mais barato" quando os pacotes têm tamanhos diferentes) e a VALIDADE. Os
     dois já vêm no `/credits/me` e nenhum chegava na tela. Cada pedaço só entra
     se tiver fonte, e o separador nasce com o segundo pedaço. */
  function detalheDoPacote(p) {
    const partes = [];
    const credits = Number(p && p.credits);
    const price = Number(p && p.price);
    if (credits > 0 && isFinite(price) && price > 0) partes.push(`${dinheiro(price / credits)} por crédito`);
    const dias = Number(p && p.defaultExpiryDays);
    if (isFinite(dias) && dias > 0) partes.push(`vale ${dias} dias`);
    return partes.join(' · ');
  }

  /* 🔴 ESCOLHER PACOTE É TOQUE, NÃO REDE. No app do motorista o toque num pacote
     refazia DUAS chamadas HTTP só pra acender a borda de um cartão: na rede da
     rua o dedo batia e a tela ficava parada até a resposta — e com uma das
     portas no chão a escolha era engolida, então o pacote NUNCA acendia. O
     catálogo já está na tela; quem manda no aceso é esta variável. O botão do pé
     reusa os MESMOS textos da linha escolhida — dois lugares formatando o mesmo
     preço é onde nasce a discordância de centavo. */
  function escolherPacote(chave) {
    const k = String(chave || '');
    if (!k || k === pacoteEscolhido) return;
    let packs = [];
    try { packs = Array.isArray(DADOS.creditos && DADOS.creditos.pacotes) ? DADOS.creditos.pacotes : []; } catch (_) { return; }
    const atual = packs.find((p) => p[4] === k);
    if (!atual) return;
    pacoteEscolhido = k;
    usar('creditos', {
      pacotes: packs.map((p) => [p[0], p[1], p[2], p[4] === k ? 1 : 0, p[4], p[5]]),
      cta: `Recarregar ${atual[0]} créditos · R$ ${atual[1]}`,
    });
  }

  /* ------------------------------------------------------------------------
     O ÍNDICE — ele não tem porta própria: é o resumo das quatro de baixo.
     ------------------------------------------------------------------------ */
  function carregarAjustes() {
    if (!temPonte()) return Promise.resolve();
    /* 🔴 A CHAVE "SONS E AVISOS" NÃO NASCE NESTE APP, e a ausência é a correção.
       MEDIDO no Kotlin, não deduzido: `setSoundPrefs`, `playSound`, `stopSound` e
       `previewSound` do `NativeAppBridge` abrem todos com
       `if (BuildConfig.APP_MODE != "logistica") return` — o gravador devolve as
       preferências ANTIGAS sem escrever nada, e o motor de som deste flavor não
       toca nada. Uma chave aqui seria o pior tipo de botão: a pessoa toca, ele
       nem vira (o valor relido é o mesmo), e ela conclui que o app travou.
       `sons: null` é o "não sei" que a folha já entende — a linha simplesmente
       não entra, e o grupo continua de pé com o Tema escuro.
       A cura de verdade é soltar o gate no `NativeAppBridge` (código
       COMPARTILHADO com o app em produção) e dar som a este app; isso é frente
       própria, não efeito colateral desta. Anotado nas pendências. */
    usar('ajustes', Object.assign({ sons: null }, linhaDaVersao()));
    return Promise.allSettled([carregarPerfil(), carregarCreditos(), carregarWhatsapp(), carregarModulos()]);
  }

  /* ------------------------------------------------------------------------
     O QUE O DEDO FAZ NESTAS TELAS.
     ------------------------------------------------------------------------ */
  registrarTelas({
    ajustes: carregarAjustes,
    perfil: carregarPerfil,
    creditos: carregarCreditos,
    whatsapp: carregarWhatsapp,
    modulos: carregarModulos,
  });

  registrarAcoes({
    // Os cinco "Tentar de novo". Cada um devolve o ESQUELETO da SUA seção antes
    // de pedir de novo: toque que não responde nada por um segundo é toque que a
    // pessoa repete.
    'recarregar-ajustes': () => retentar('ajustes', carregarAjustes),
    'recarregar-perfil': () => retentar('perfil', carregarPerfil),
    'recarregar-creditos': () => retentar('creditos', carregarCreditos),
    'recarregar-modulos': () => retentar('modulos', carregarModulos),
    'recarregar-whatsapp': () => retentar('whatsapp', carregarWhatsapp),

    /* 🔴 `chave-sons` NÃO ENTRA AQUI, e a ausência é deliberada — ver o porquê
       inteiro em `carregarAjustes`: o Kotlin deste flavor engole `setSoundPrefs`,
       então a chave não é desenhada (`sons: null`). Registrar um dono pra um
       botão que a tela não pinta é deixar código esperando um toque que nunca
       chega, e é ele que faria o próximo leitor achar que a chave funciona.
       🔴 `chave-tema` também não, e por outro motivo: o mock JÁ trata o clique
       (ele chama `trocarLuz`, que esta ponte embrulhou no §1). Uma entrada aqui
       viraria a luz uma SEGUNDA vez no mesmo toque — medido no g15 do app do
       motorista: escuro→claro→escuro, e a chave "não fazia nada". */

    /* 🔴 A PORTA MANUAL DA ATUALIZAÇÃO. Enquanto só existisse o pop-up
       automático, perder o aviso uma vez seria ficar preso na versão velha sem
       nada pra tocar. `forcado` fura a trava de 30 min E a memória do "já
       avisei" — e RESPONDE SEMPRE, inclusive quando não há novidade. */
    'buscar-update': () => { checkAppUpdate(true); },

    // 🔴 SAIR APAGA A SESSÃO DO APARELHO — confirma antes, sempre. Um toque
    // errado aqui custa um pareamento novo, e o vendedor não tem como refazê-lo
    // sozinho na rua.
    sair: () => {
      window.portao({
        tom: 'alerta', ico: 'logout', titulo: 'Sair do aplicativo?',
        sub: 'Você vai precisar parear o aparelho de novo.',
        acoes: [['Ficar', ''], ['Sair', 'principal']], classe: 'duas',
      });
      const b = naCamada('.portao-wrap .principal');
      if (b) b.addEventListener('click', () => { try { window.HBX.logout(); } catch (_) {} }, { once: true });
    },

    pacote: (el) => escolherPacote(el && el.dataset ? el.dataset.pacote : ''),
    // O checkout é NATIVO (RechargeCheckoutActivity): a WebView nunca vê dado de
    // cartão. Aqui só se diz QUAL pacote.
    recarregar: () => {
      if (!pacoteEscolhido) return;
      try { window.HBX.recharge(pacoteEscolhido); }
      catch (_) { avisoErro(new Error('Não consegui abrir a recarga agora.')); }
    },
  });

  /* ==========================================================================
     O DESPACHANTE — o último arquivo da costura, e o único que fecha o IIFE.

     Ele não sabe o que nenhum botão faz: só sabe ENCONTRAR o dono. Os módulos
     registram o que é deles (`registrarAcoes` / `registrarCampos` /
     `registrarTelas`, definidos no `00-nucleo.js`) e este arquivo consome os três
     cofres no fim. É por isso que um módulo novo NÃO precisa editar este
     arquivo: dois agentes escrevendo no mesmo mapa de ações assam estado pela
     metade, e o defeito sai como "o botão não faz nada".

     🔴 ELE ESCUTA NA SUBIDA, DEPOIS DO MOCK. O roteador do mock foi registrado
     primeiro (o `mock.js` carrega antes) e roda antes deste — quando o dedo bate
     num `data-ir`, a tela JÁ trocou quando chegamos aqui. É essa ordem que faz o
     `anunciarTela` (10-portao-fontes) enxergar a tela nova, e é ela que deixa o
     `data-acao` de um botão de portão correr DEPOIS do `data-fechar` que o
     fecha.
     ========================================================================== */

  /* 🔴 O DE DENTRO VENCE — e `closest()` já resolve isso de graça: ele sobe do
     nó tocado e devolve o PRIMEIRO ancestral que casa, ou seja, o mais próximo
     do dedo. Um botão `[data-acao="puxar-lead"]` dentro de uma linha
     `[data-acao="abrir-lead"]` responde "puxar", que é o que o dedo quis.

     🔴 E A NAVEGAÇÃO DO MOCK TAMBÉM DISPUTA ESSA CORRIDA. Os dois roteadores são
     independentes: o mock não interrompe o evento, então um `[data-ir]`
     ANINHADO dentro de um `[data-acao]` faria as DUAS coisas no mesmo toque —
     trocar de tela e disparar a ação da linha que ficou pra trás. Quem estiver
     mais perto do dedo manda; `contains` responde isso sem contar nós.
     (Botão de portão é a exceção legítima e continua funcionando: `data-fechar`
     não é rota — o portão fecha E a ação corre, que é o contrato do
     `acaoPrincipal` da casca.) */
  const ROTAS_DO_MOCK = '[data-ir], [data-nav], [data-tela], [data-aula]';

  document.addEventListener('click', (e) => {
    const alvo = e.target && e.target.closest ? e.target.closest('[data-acao]') : null;
    if (!alvo || !temPonte()) return;
    const rota = e.target.closest(ROTAS_DO_MOCK);
    if (rota && rota !== alvo && alvo.contains(rota)) return;

    const chave = String((alvo.dataset && alvo.dataset.acao) || '');
    if (!chave) return;

    /* 🔴 O TUTOR TEM DONO, E NÃO É ESTE ARQUIVO. `tutor-comecar` e `tutor-<id>`
       são tratados pelo próprio mock (ele abre o capítulo com a espera que cobre
       a saída do portão). Sem esta linha, o aviso de "ação sem dono" lá embaixo
       gritaria a cada toque no catálogo do Tutorial — e guarda que grita à toa é
       guarda que se aprende a ignorar. */
    if (chave.indexOf('tutor-') === 0) return;
    /* 🔴 `chave-tema` TAMBÉM É DO MOCK. Ele chama `trocarLuz`, que esta ponte
       embrulhou (00-nucleo §1) pra falar com o native. Tratar aqui viraria a luz
       uma SEGUNDA vez no mesmo clique — medido no g15 do app do motorista:
       escuro→claro→escuro, e a chave "Tema escuro" parecia morta. */
    if (chave === 'chave-tema') return;

    const fn = ACOES[chave];
    if (!fn) {
      /* Ação desenhada na casca e sem dono na ponte É UM BOTÃO MORTO — e botão
         morto neste app já custou três diagnósticos errados. O grito nomeia a
         chave que falta, que é exatamente o que o próximo módulo precisa
         registrar. Ele fica no console (não na tela): quem lê console é quem
         está construindo, e quem está usando não tem culpa do que falta. */
      try { console.warn(`[ponte/vendas] ação sem dono: "${chave}" — registre-a com registrarAcoes({...}) no módulo dela.`); } catch (_) {}
      return;
    }
    /* O NÓ TOCADO viaja junto: é dele que sai o `data-lead`/`data-empresa` do
       toque, e é NELE que o "aguarde" (disabled + .aguarde) entra no MESMO
       quadro do dedo, antes de qualquer resposta de rede. */
    try { fn(alvo, e); } catch (erro) {
      // Handler que estoura não pode derrubar o resto do app: a tela continua
      // de pé e a pessoa vê a frase da casa, não um travamento mudo.
      try { console.error(`[ponte/vendas] ação "${chave}" estourou:`, erro); } catch (_) {}
      avisoErro(erro);
    }
  });

  /* ------------------------------------------------------------------------
     OS CAMPOS. Mesmo desenho, outro evento.

     🔴 TECLA NÃO PODE VIRAR PEDIDO. Cada escrita no seam remonta a camada
     inteira (`pintar`), e cada letra vira uma requisição se ninguém segurar:
     digitar "distribuidora de água" seriam 21 idas ao servidor e 21 repintes na
     tela de quem está com o dedo no vidro. Por isso o registro aceita
     `{ espera, ao }` — o módulo diz quanto tempo o dedo precisa parar.
     O caret sobrevive ao repinte porque a casca mede e devolve o foco
     (`medirFoco`/`herdarFoco`), inclusive a posição do cursor.

     `aoEnter` existe para os campos que a casca marcou com `enterkeyhint`
     ("search" no Radar): a tecla de confirmar do teclado do Android é um botão
     de verdade na cara da pessoa, e ignorá-la é deixá-la tocando numa tecla que
     não faz nada.
     ------------------------------------------------------------------------ */
  const relogiosDeCampo = Object.create(null);

  const donoDoCampo = (e) => {
    const el = e.target && e.target.closest ? e.target.closest('[data-campo]') : null;
    if (!el || !temPonte()) return null;
    const nome = String((el.dataset && el.dataset.campo) || '');
    if (!nome) return null;
    const reg = CAMPOS[nome];
    if (!reg) return null;                   // campo do desenho sem dono ainda: silêncio
    return { el, nome, reg: typeof reg === 'function' ? { ao: reg } : reg };
  };

  document.addEventListener('input', (e) => {
    const achado = donoDoCampo(e);
    if (!achado || typeof achado.reg.ao !== 'function') return;
    const valor = typeof achado.el.value === 'string' ? achado.el.value : '';
    const espera = Number(achado.reg.espera) || 0;
    clearTimeout(relogiosDeCampo[achado.nome]);
    if (!espera) return void achado.reg.ao(valor, achado.el);
    relogiosDeCampo[achado.nome] = setTimeout(() => achado.reg.ao(valor, achado.el), espera);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const achado = donoDoCampo(e);
    if (!achado || typeof achado.reg.aoEnter !== 'function') return;
    // O relógio do debounce morre aqui: quem apertou Enter não quer esperar mais
    // 180 ms pela mesma busca, e deixá-lo vivo dispararia a segunda chamada.
    clearTimeout(relogiosDeCampo[achado.nome]);
    const valor = typeof achado.el.value === 'string' ? achado.el.value : '';
    /* Fecha o teclado antes de agir: o resultado que a busca traz nasce ATRÁS do
       teclado se ele ficar aberto, e a pessoa acha que nada aconteceu. */
    try { achado.el.blur(); } catch (_) {}
    achado.reg.aoEnter(valor, achado.el);
  });
})();
