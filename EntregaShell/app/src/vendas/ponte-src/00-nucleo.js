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
