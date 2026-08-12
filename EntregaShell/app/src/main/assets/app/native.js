(function () {
  "use strict";

  const pending = new Map();
  let sequence = 0;
  let renderedNavIndex = null;

  function parseBody(raw) {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (_) { return { raw }; }
  }

  function bridgeJson(method, fallback) {
    try {
      return bridge && typeof bridge[method] === "function" ? parseBody(bridge[method]()) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  window.HBXNative = {
    _resolve(payloadText) {
      let envelope;
      try { envelope = JSON.parse(payloadText); } catch (_) { return; }
      const waiter = pending.get(envelope.id);
      if (!waiter) return;
      pending.delete(envelope.id);
      const body = parseBody(envelope.body);
      if (Number(envelope.status) >= 200 && Number(envelope.status) < 300 && !envelope.error) {
        waiter.resolve(body);
      } else {
        const message = envelope.error || body.userMessage || body.message || `Falha ${envelope.status || "offline"}`;
        const error = new Error(Array.isArray(message) ? message.join(" ") : String(message));
        error.status = Number(envelope.status || 0);
        error.body = body;
        waiter.reject(error);
      }
    },
  };

  const bridge = window.HBXAndroid;

  // 22/07 S3a (PR22072026-APK-PROFISSIONAL) — reconciliação fina do .content.
  // O freio anti-piscada de mais cedo hoje (ver mount() abaixo) só evitava
  // trocar a tela quando NADA no .content mudava. Durante uma rota ativa o
  // GPS atualiza distância/ETA/ordem das paradas a cada tique — um byte muda
  // e a tela INTEIRA (content.replaceWith) era destruída e recriada por
  // segundo. Daqui pra baixo é a mesma ideia que já funciona nos overlays
  // (comparar cada nó com o que ELE MESMO gerou no render anterior, nunca
  // com o DOM vivo — que sofre mutação de mapa/foco/scroll depois do mount e
  // nunca mais bateria na string), só que aplicada RECURSIVAMENTE dentro do
  // .content: cada filho é comparado com a marcação que ele tinha da última
  // vez; igual, não toca; só texto mudou, escreve o miolo; estrutura
  // diferente, troca só aquele nó. Teto de profundidade porque recursão sem
  // limite numa lista grande de entregas custa mais que a troca — medido no
  // stopCard real (logistica/app.js): content → .list → <article
  // data-delivery> → .stop-top → .card-main → texto é 5 níveis; por isso o
  // teto é 5, não os "3–4" de sugestão inicial (senão o teto estoura ANTES
  // de chegar no texto do card, que é o alvo real do tique de GPS).
  const HBX_CONTEUDO_PROFUNDIDADE_MAX = 5;
  // Campo de formulário nunca leva patch fino: o atributo `value` não
  // reflete o que o usuário já digitou (a propriedade `.value` some da
  // sincronia com o atributo assim que o campo é tocado) — sincronizar via
  // setAttribute mostraria um valor desatualizado sem avisar. Ou fica igual
  // (barra no __hbxGen acima) ou troca o nó inteiro; nunca meio-termo.
  const HBX_CONTROLES_FORM = new Set(["INPUT", "TEXTAREA", "SELECT"]);

  // 25/07 — CARIMBO VELHO MENTE. Todo caminho que devolve `false` daqui pra
  // baixo é "este nó NÃO ficou igual ao gerado" (mapa vivo, foco, filho
  // pulado). Não bastava deixar de carimbar: o `__hbxGen` ANTIGO continuava
  // pendurado no nó, descrevendo uma tela que não existe mais. Se a marcação
  // voltasse EXATAMENTE àquele valor antigo (é o normal: entrar num modo de
  // tela e sair dele devolve a mesma marcação de antes), o atalho
  // `if (vivo.__hbxGen === html) return true` batia e o ramo inteiro era
  // PULADO — a tela ficava congelada no estado do meio.
  // Foi exatamente isso na Leitura de Rota (relato do dono 25/07): abrir o
  // app carimbava a Rota normal, iniciar a leitura trocava a faixa mas NÃO
  // recarimbava (mapa vivo ⇒ incompleto), e o cancelar gerava a marcação
  // normal de novo — idêntica ao carimbo velho. Resultado: "Cancelar/
  // Gravando/Checkpoint" grudados na tela e o painel "Próxima parada" sem
  // voltar, mesmo com a sessão já cancelada no servidor. Zerar o carimbo ao
  // devolver `false` custa nada e mata a classe inteira de bug.
  function hbxCarimboVencido(el) {
    if (el && el.__hbxGen) el.__hbxGen = null;
    return false;
  }

  function hbxChaveDoNo(el) {
    if (el.dataset) {
      if (el.dataset.delivery) return `delivery:${el.dataset.delivery}`;
      if (el.dataset.client) return `client:${el.dataset.client}`;
    }
    if (el.id) return `id:${el.id}`;
    return null;
  }

  // Mesma técnica de chave da reconciliação de overlays (mount() abaixo):
  // chave estável (data-delivery/data-client/id) primeiro, cai pra primeira
  // classe + ordem de aparição quando não houver.
  // 22/07 — o contador de ordem vale pra TODA chave, inclusive a estável.
  // Antes ele só rodava no ramo do fallback, e chave estável saía crua: dois
  // irmãos com o mesmo id/data-* geravam a MESMA chave. Como o índice de nós
  // vivos é um Map, chave repetida guardava só o ÚLTIMO — o primeiro nunca era
  // visitado pelo laço que remove e ficava ÓRFÃO na tela. Foi exatamente isso
  // que duplicou o disco de rota e a lixeira no aparelho do dono (v20).
  function hbxChavearLista(lista) {
    const usados = new Map();
    return lista.map(el => {
      const base = hbxChaveDoNo(el) || (el.getAttribute("class") || el.tagName.toLowerCase()).split(" ")[0];
      const n = (usados.get(base) || 0) + 1;
      usados.set(base, n);
      return { chave: `${base}#${n}`, el };
    });
  }

  // getAttribute/setAttribute, NUNCA .className: em nó SVG (ícone inline)
  // `className` é um SVGAnimatedString e uma atribuição direta LANÇA em
  // "use strict" (este arquivo é strict). Sincroniza todo atributo — cobre
  // disabled/aria-*/data-* genericamente; sem isto um `data-status` que muda
  // sem mexer em texto/classe passaria batido e a tela ficaria errada calada.
  function hbxSincronizarAtributos(vivo, novo) {
    const antigos = vivo.attributes;
    for (let i = antigos.length - 1; i >= 0; i -= 1) {
      const nome = antigos[i].name;
      if (!novo.hasAttribute(nome)) vivo.removeAttribute(nome);
    }
    const novos = novo.attributes;
    for (let i = 0; i < novos.length; i += 1) {
      const { name, value } = novos[i];
      if (vivo.getAttribute(name) !== value) vivo.setAttribute(name, value);
    }
  }

  // `transplantarMapa` vem de fora (definida em mount(), fecha sobre root e
  // sabe onde o mapa maplibre vive de verdade) — recebida por parâmetro pra
  // esta função poder ficar em escopo de módulo em vez de ser recriada a
  // cada mount().
  // Devolve `true` quando este nó (e tudo por baixo dele) ficou 100% igual
  // ao gerado; `false` quando algum pedaço foi PULADO de propósito (foco ou
  // mapa vivo — ver os dois pontos abaixo) e continua desatualizado. O pai
  // só pode carimbar `__hbxGen` (linha ~247) quando TODO filho voltar `true`
  // — ver o comentário grande antes do carimbo, é a correção de 22/07 pro
  // "ramo pulado fica errado pra sempre".
  function hbxReconciliarConteudo(vivo, novo, profundidade, transplantarMapa) {
    // Mapa vivo pendurado aqui (host.__hbxMap, ver logistica/app.js
    // mountMap): NUNCA reconcilia por dentro. O maplibre injeta canvas/
    // controles como filhos reais do host — nada a ver com o
    // <span class="route-map-loading"> que ESTA função geraria como filho
    // do placeholder. Comparar/reconciliar filho a filho aqui apagaria os
    // filhos de verdade do mapa (não batem em nenhuma chave) e penduraria o
    // spinner de novo por cima de um mapa que já estava certo. Só uma
    // troca de ANCESTRAL (mais acima na recursão) pode mexer neste nó — e aí
    // é o transplantarMapa() de lá que resgata o mapa antes da troca.
    if (vivo.__hbxMap) return hbxCarimboVencido(vivo);

    // 22/07 — CORREÇÃO (revisão pós-commit): a guarda original usava
    // `vivo.contains(document.activeElement)` bem no topo — mas a 1ª
    // chamada desta função (feita por mount()) recebe `vivo = .content`
    // INTEIRO. `contains()` inclui QUALQUER descendente em QUALQUER
    // profundidade, então bastava um campo com foco em qualquer lugar do
    // `.content` (o normal de teclado aberto — observação da leitura, valor
    // em dinheiro, nome do cliente; ver focusedControlSnapshot()/
    // restoreFocusedControl() em logistica/app.js) pra essa 1ª chamada
    // retornar na hora e a TELA INTEIRA parar de reconciliar enquanto o
    // entregador digitava. Trocava piscada por tela CONGELADA — pior, não é
    // óbvio que travou.
    // O que precisa de proteção é o NÓ EM SI que está focado (não deixar um
    // innerHTML/replaceWith arrancar o cursor dele) — recursar por DENTRO de
    // um ancestral do campo focado é inofensivo, o próprio campo se protege
    // quando chegar a vez dele nesta mesma checagem. Por isso aqui é `===`,
    // não `contains()`; o `contains()` some daqui e só volta nos dois pontos
    // que REALMENTE destroem o nó (os dois `replaceWith` abaixo).
    // 27/07 (dono: "Painel de créditos do dia — funciona mas não visualmente"):
    // a guarda de foco valia pra QUALQUER nó focado, e no WebView o Android dá
    // foco ao <button> assim que o dedo toca nele. Resultado: a linha de Ajustes
    // que acabou de ser tocada era exatamente o único ramo que a tela se recusava
    // a redesenhar — o interruptor ficava congelado no estado anterior até sair da
    // tela e voltar (a chave ligava de verdade, só não mostrava). Quem precisa de
    // proteção é campo que guarda DIGITAÇÃO/CURSOR (input/textarea/select e
    // contenteditable): sincronizar atributo/miolo num botão não tira cursor de
    // ninguém. Os dois `replaceWith` abaixo — que DESTROEM o nó e aí sim levariam
    // o foco junto — seguem com a guarda `contains(activeElement)` deles.
    const focoDeDigitacao = HBX_CONTROLES_FORM.has(vivo.tagName) || vivo.isContentEditable;
    if (vivo === document.activeElement && focoDeDigitacao) return hbxCarimboVencido(vivo);

    const html = novo.outerHTML;
    // Comparo com o que EU MESMO gerei da última vez (__hbxGen), nunca com
    // vivo.outerHTML: o nó vivo sofre mutação depois do mount (mapa, foco,
    // scroll) e nunca mais bateria na string — mesma regra da reconciliação
    // de overlays logo abaixo, aqui guardada no próprio nó em vez de um Map,
    // porque agora o alcance é recursivo (qualquer profundidade), não só os
    // filhos diretos de um container.
    if (vivo.__hbxGen === html) return true;

    const eraFolha = vivo.children.length === 0;
    const ehFolha = novo.children.length === 0;
    if (vivo.tagName !== novo.tagName || HBX_CONTROLES_FORM.has(vivo.tagName) || eraFolha !== ehFolha) {
      // 22/07 — CORREÇÃO: troca de estrutura é o ponto que REALMENTE destrói
      // o nó (replaceWith arranca tudo, foco incluso). Se o foco está em
      // QUALQUER descendente daqui (o próprio `vivo` já foi descartado pela
      // checagem `===` lá em cima), não troca: fica atrasado até o foco
      // sair. Perder o cursor do entregador é pior que um galho desatualizado
      // por alguns segundos.
      if (vivo.contains(document.activeElement)) return hbxCarimboVencido(vivo);
      // Estrutura realmente diferente (tag mudou, campo de formulário, ou
      // virou folha/deixou de ser): troca o nó inteiro. Conservador de
      // propósito — na dúvida, troca-se o nó, nunca a tela. Barato aqui:
      // nunca é mais que um pedaço pequeno da tela.
      transplantarMapa("route-live-map", novo);
      vivo.replaceWith(novo);
      novo.__hbxGen = html;
      return true;
    }

    hbxSincronizarAtributos(vivo, novo);

    if (ehFolha) {
      // Sem filhos-elemento: é o caso mais comum do tique de GPS (distância,
      // ETA, status do badge). innerHTML cobre texto puro E o raro caso de
      // formatação inline (<b>), sem recriar o nó — o patch mais barato e o
      // que mais paga. Livre de guarda de foco: folha não tem filho pra
      // esconder outro foco, e se `vivo` fosse o foco a checagem `===` lá
      // em cima já teria retornado antes de chegar aqui.
      if (vivo.innerHTML !== novo.innerHTML) vivo.innerHTML = novo.innerHTML;
      vivo.__hbxGen = html;
      return true;
    }

    if (profundidade <= 0) {
      // Teto de profundidade estourou NUM GALHO (nó com filhos) — recursão
      // sem limite numa lista grande custaria mais que a troca. Mesma
      // proteção de foco do replaceWith acima: troca destrói, então só troca
      // se não houver foco escondido no galho.
      if (vivo.contains(document.activeElement)) return hbxCarimboVencido(vivo);
      transplantarMapa("route-live-map", novo);
      vivo.replaceWith(novo);
      novo.__hbxGen = html;
      return true;
    }

    const filhosVivos = [...vivo.children];
    const filhosNovos = [...novo.children];
    const vivosComChave = hbxChavearLista(filhosVivos);
    const vivosPorChave = new Map(vivosComChave.map(item => [item.chave, item.el]));
    const novosComChave = hbxChavearLista(filhosNovos);
    const chavesNovas = new Set(novosComChave.map(item => item.chave));

    // A remoção percorre os filhos VIVOS DE VERDADE (a lista), não os valores
    // do Map: varrer o índice só alcança o que o índice indexou, e era por aí
    // que o nó escapava. Com a chave agora única, lista e Map são 1:1.
    vivosComChave.forEach(({ chave, el }) => { if (!chavesNovas.has(chave)) el.remove(); });

    // 22/07 — CORREÇÃO: se ALGUM filho ficou pra trás (devolveu `false` —
    // foco ou mapa vivo pularam ele), ESTE nó TAMBÉM não pode se carimbar
    // como "igual ao novo" (`vivo.__hbxGen = html` logo abaixo): não está,
    // só uma parte foi aplicada. Sem isto, o `if (vivo.__hbxGen === html)
    // return true` lá em cima bateria no PRÓXIMO render (ele compara o
    // `.content` ou o ancestral inteiro, não o filho pulado) e o ramo pulado
    // ficava errado PRA SEMPRE — só consertava quando a marcação mudasse de
    // novo por outro motivo, não quando o foco saísse. `completo=false`
    // propaga pai acima até o topo, então o ramo pendente é reavaliado a
    // cada render seguinte, exatamente até o foco sair.
    let completo = true;
    let anterior = null;
    novosComChave.forEach(({ chave, el }) => {
      const vivoFilho = vivosPorChave.get(chave);
      if (vivoFilho) {
        if (!hbxReconciliarConteudo(vivoFilho, el, profundidade - 1, transplantarMapa)) completo = false;
        // O filho pode ter sobrevivido (mesma chave) mas mudado de POSIÇÃO
        // na lista (ex.: fila reordenada por proximidade/status) — reordena
        // só quando precisa, pra não gerar mutação/reflow à toa.
        const esperado = anterior ? anterior.nextElementSibling : vivo.firstElementChild;
        if (esperado !== vivoFilho) vivo.insertBefore(vivoFilho, esperado);
        anterior = vivoFilho;
        return;
      }
      // Nó novo (chave não existia antes): mesmo cuidado do mapa que os
      // overlays já fazem — só transplanta pra dentro de quem REALMENTE vai
      // entrar no DOM.
      transplantarMapa("route-live-map", el);
      el.__hbxGen = el.outerHTML;
      if (anterior && anterior.nextSibling) vivo.insertBefore(el, anterior.nextSibling);
      else vivo.appendChild(el);
      anterior = el;
    });
    // REDE DE SEGURANÇA (22/07, depois do disco duplicado em produção): se
    // depois de tudo a contagem de filhos não bate com a marcação, alguma
    // chave errou e há nó a mais (ou a menos) na tela. Em vez de deixar o
    // entregador olhando dois botões de iniciar rota, este ramo desiste da
    // costura fina e troca o nó inteiro — o comportamento antigo, que é feio
    // (recria) mas nunca mente. Falha de reconciliação vira piscada, nunca
    // tela errada. Devolve false pra não se carimbar como "em dia".
    // Compara com `filhosNovos.length`, tirado ANTES do laço — nunca com
    // `novo.children.length` agora: inserir um filho de `novo` na tela o
    // REMOVE de `novo`, então essa contagem despenca sozinha e a rede
    // dispararia à toa, trocando o bloco por um nó já esvaziado (foi o que
    // sumiu com o mapa da Rota no primeiro tiro desta correção).
    // E RECONSTRÓI do `html` (a marcação de origem): o `novo` a esta altura já
    // pode ter sido esvaziado pelo laço acima, então reusá-lo colocaria na
    // tela um nó pela metade — trocar seis por meia dúzia. Do texto sai
    // sempre o bloco inteiro.
    if (vivo.children.length !== filhosNovos.length) {
      const molde = document.createElement("template");
      molde.innerHTML = html;
      const inteiro = molde.content.firstElementChild;
      if (!inteiro) return false;
      transplantarMapa("route-live-map", inteiro);
      vivo.replaceWith(inteiro);
      inteiro.__hbxGen = html;
      return false;
    }
    if (completo) vivo.__hbxGen = html;
    else hbxCarimboVencido(vivo);
    return completo;
  }

  const HBX = {
    api(path, options) {
      if (!bridge || typeof bridge.request !== "function") {
        return Promise.reject(new Error("Abra esta tela pelo HBX Logística."));
      }
      const opts = options || {};
      const id = `req_${Date.now()}_${++sequence}`;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const timer = setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error("O VPS demorou para responder. Tente novamente."));
        }, 35000);
        const entry = pending.get(id);
        pending.set(id, {
          resolve: value => { clearTimeout(timer); entry.resolve(value); },
          reject: error => { clearTimeout(timer); entry.reject(error); },
        });
        bridge.request(id, opts.method || "GET", path, opts.body === undefined ? null : JSON.stringify(opts.body));
      });
    },
    recharge(packKey) {
      const key = String(packKey || "").trim();
      if (!key) return false;
      try { return Boolean(bridge && bridge.openRechargeCheckout && bridge.openRechargeCheckout(key)); }
      catch (_) { return false; }
    },
    call(phone) { bridge && bridge.openCall && bridge.openCall(String(phone || "")); },
    vibrate(ms) { const d = Math.max(1, Math.min(200, Number(ms) || 12)); try { if (bridge && bridge.vibrate) { bridge.vibrate(d); return; } } catch (_) {} try { if (navigator.vibrate) navigator.vibrate(d); } catch (_) {} },
    whatsapp(phone, message) { bridge && bridge.openWhatsapp && bridge.openWhatsapp(String(phone || ""), String(message || "")); },
    maps(lat, lng, address) { bridge && bridge.openMaps && bridge.openMaps(lat == null ? null : String(lat), lng == null ? null : String(lng), String(address || "")); },
    // S5 21/07 (PR21072026-NAVEGAÇÃO-HBX) — TTS nativo pt-BR (android.speech.tts).
    // Mesmo padrão de guard de maps()/vibrate: bridge ausente (preview fora do
    // app) = no-op silencioso, nunca quebra o fluxo de entrega.
    speak(text) { bridge && bridge.speak && bridge.speak(String(text || "")); },
    // 31/07 — tela acesa enquanto guia (ver syncNavWatch). Sem ponte (preview no
    // navegador) é no-op, igual speak/vibrate.
    manterTelaAcesa(ligado) { try { bridge && bridge.manterTelaAcesa && bridge.manterTelaAcesa(!!ligado); } catch (_) {} },
    // 31/07 — mapa offline (ver MapaOffline.kt). Sem ponte (preview no navegador)
    // a seção inteira some da tela, em vez de mostrar botão que não faz nada.
    // 🔴 05/08 (PR05082026-MAPA-PMTILES, F5) — `mapaOfflineBaixar` TROCOU DE
    // ASSINATURA. O 1º argumento era a URL do estilo (o nativo baixava o mapa
    // lendo o TileJSON do openfreemap); agora o mapa vem de um PMTiles único e
    // quem manda no gasto de 4G é a tela, então a ponte passa
    // (lat, lng, raioKm, permitirDadosMoveis). Não é shim: manter o argumento
    // velho faria o nativo ler a URL como latitude e TODO pedido cairia em
    // `motivo:"semCoordenada"` — nada baixaria, calado.
    mapaOfflineDisponivel() { return !!(bridge && bridge.mapaOfflineBaixar && bridge.mapaOfflineEstado); },
    mapaOfflineEstado(lat, lng, raioKm) {
      if (!this.mapaOfflineDisponivel()) return null;
      try { return JSON.parse(bridge.mapaOfflineEstado(String(lat == null ? "" : lat), String(lng == null ? "" : lng), String(raioKm || 60))); }
      catch (_) { return null; }
    },
    // `permitirDadosMoveis` é EXPLÍCITO e nasce FALSO: o padrão é só wi-fi, e
    // quem pergunta ao motorista antes de gastar 4G é o app.js — o nativo nunca
    // decide isso sozinho (ver MapaOffline.baixarRegiao).
    mapaOfflineBaixar(lat, lng, raioKm, permitirDadosMoveis) {
      if (!this.mapaOfflineDisponivel()) return;
      try { bridge.mapaOfflineBaixar(String(lat), String(lng), String(raioKm || 60), !!permitirDadosMoveis); } catch (_) {}
    },
    mapaOfflineApagar() { try { bridge && bridge.mapaOfflineApagar && bridge.mapaOfflineApagar(); } catch (_) {} },
    speakStop() { bridge && bridge.speakStop && bridge.speakStop(); },
    // S1 22/07 (PR22072026-APP-SOUNDS) — motor de sons nativo. Mesmo guard de
    // bridge ausente que speak/vibrate acima: preview fora do APK (browser)
    // não pode quebrar. Nenhum call site chama isto ainda — S1 é só o cano.
    sound(key) { try { bridge && bridge.playSound && bridge.playSound(String(key || "")); } catch (_) {} },
    soundStop(key) { try { bridge && bridge.stopSound && bridge.stopSound(String(key || "")); } catch (_) {} },
    // S5 22/07 (PR22072026-APP-SOUNDS) — prévia da folha "Sons" (▶ ao lado de
    // cada nome): fura mestra e toggle do item do lado nativo (ver
    // `HbxSoundEngine.play(preview=true)`), aqui é só o mesmo guard de sempre.
    soundPreview(key) { try { bridge && bridge.previewSound && bridge.previewSound(String(key || "")); } catch (_) {} },
    // S5 — preferências de som/voz. Fonte da verdade é o SharedPreferences
    // nativo (`hbx_sound_prefs`/`config_json`), NUNCA o localStorage: a
    // ChegadaActivity toca com o WebView fora de foco e não pode perguntar
    // nada ao JS (S5-PREFERENCIA.md). `get()`/`set()` são leitura/escrita
    // SÍNCRONAS pela ponte (mesmo padrão de `offline.status()`/`appInfo()`) —
    // o `set()` devolve o estado JÁ persistido, nunca confia às cegas no que
    // o chamador mandou.
    soundPrefs: {
      get() {
        return bridgeJson("soundPrefs", { master: true, voz: true, off: [] });
      },
      set(prefs) {
        try {
          if (!bridge || typeof bridge.setSoundPrefs !== "function") return prefs;
          return parseBody(bridge.setSoundPrefs(JSON.stringify(prefs || {})));
        } catch (_) {
          return prefs;
        }
      },
    },
    // MODO PASSEIO (29/07) — relógio NATIVO do tempo-no-lugar (AlarmManager):
    // timer JS congela no Doze com a tela apagada, o alarme nativo não. Millis
    // viaja como STRING (número de 13 dígitos pela ponte é terreno de coerção).
    // Mesmo guard de bridge ausente de speak/sound: preview no navegador = no-op.
    passeioAlarme(atMillis, titulo, texto) {
      try { return !!(bridge && bridge.passeioAlarme && bridge.passeioAlarme(String(Math.round(Number(atMillis) || 0)), String(titulo || ""), String(texto || ""))); }
      catch (_) { return false; }
    },
    passeioAlarmeCancelar() { try { bridge && bridge.passeioAlarmeCancelar && bridge.passeioAlarmeCancelar(); } catch (_) {} },
    // AGENDADOR DE MISSÃO (02/08) — despertador da rota marcada pelo escritório.
    // Mesmo motivo do passeio pra ser nativo: o alarme tem que tocar com o app
    // FECHADO e a tela apagada. O nome é herança da rota indicada (morta na F4
    // de 09/08) — hoje o ÚNICO id aceito é `recado_<id>`, e o nativo recusa
    // qualquer outro. Quem responde é o par recadoResposta* abaixo.
    missaoAlarme(id, atMillis, titulo, texto) {
      try { return !!(bridge && bridge.missaoAlarme && bridge.missaoAlarme(String(id || ""), String(Math.round(Number(atMillis) || 0)), String(titulo || ""), String(texto || ""))); }
      catch (_) { return false; }
    },
    missaoAlarmeCancelar(id) { try { bridge && bridge.missaoAlarmeCancelar && bridge.missaoAlarmeCancelar(String(id || "")); } catch (_) {} },
    recadoRespostaPendente() {
      try { return (bridge && bridge.recadoRespostaPendente && bridge.recadoRespostaPendente()) || ""; }
      catch (_) { return ""; }
    },
    recadoRespostaConcluir(id) {
      try { bridge && bridge.recadoRespostaConcluir && bridge.recadoRespostaConcluir(String(id || "")); }
      catch (_) {}
    },
    activateRoute(payload) { bridge && bridge.activateRoute && bridge.activateRoute(JSON.stringify(payload)); },
    stopRoute() { bridge && bridge.stopRoute && bridge.stopRoute(); },
    requestLocationPermission() { bridge && bridge.requestLocationPermission && bridge.requestLocationPermission(); },
    speech: {
      available() {
        try { return !!(bridge && bridge.speechRecognitionAvailable && bridge.speechRecognitionAvailable()); }
        catch (_) { return false; }
      },
      start() {
        try { bridge && bridge.requestSpeechRecognition && bridge.requestSpeechRecognition(); }
        catch (_) {}
      },
    },
    uploadProof(deliveryId, type, file, clientKey) {
      if (!bridge || typeof bridge.uploadProof !== "function") return Promise.reject(new Error("Upload nativo indisponível."));
      if (!file || file.size > 5 * 1024 * 1024) return Promise.reject(new Error("A imagem deve ter no máximo 5 MB."));
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        reader.onload = () => {
          const base64 = String(reader.result || "").split(",").pop() || "";
          const id = `upload_${Date.now()}_${++sequence}`;
          const timer = setTimeout(() => {
            if (!pending.has(id)) return;
            pending.delete(id);
            reject(new Error("O comprovante demorou para ser armazenado."));
          }, 45000);
          pending.set(id, {
            resolve: value => { clearTimeout(timer); resolve(value); },
            reject: error => { clearTimeout(timer); reject(error); },
          });
          bridge.uploadProof(id, String(deliveryId), String(type), String(file.name || `${type}.jpg`), String(file.type || "image/jpeg"), base64, String(clientKey || HBX.uuid()));
        };
        reader.readAsDataURL(file);
      });
    },
    offline: {
      status() {
        return bridgeJson("offlineStatus", { supported: false, hasRoute: false, pendingOperations: 0, pendingProofs: 0 });
      },
      setPreferences(wifiOnly, retainAfterUpload) {
        try {
          if (!bridge || typeof bridge.setOfflinePreferences !== "function") return this.status();
          return parseBody(bridge.setOfflinePreferences(Boolean(wifiOnly), Boolean(retainAfterUpload)));
        } catch (_) {
          return this.status();
        }
      },
      flush() { bridge && bridge.flushOffline && bridge.flushOffline(); },
    },
    logout() {
      // A ponte nativa só limpa WebStorage e vínculo depois de confirmar que não há
      // entrega/comprovante pendente. Não apague localStorage antes dessa decisão.
      bridge && bridge.logout && bridge.logout();
    },
    info() {
      try { return bridge && bridge.appInfo ? JSON.parse(bridge.appInfo()) : { mode: "preview" }; }
      catch (_) { return { mode: "preview" }; }
    },
    cache: {
      get(key, fallback) {
        try { const raw = localStorage.getItem(`hbx:${key}`); return raw ? JSON.parse(raw) : fallback; }
        catch (_) { return fallback; }
      },
      set(key, value) {
        try { localStorage.setItem(`hbx:${key}`, JSON.stringify(value)); } catch (_) {}
      },
      remove(key) { try { localStorage.removeItem(`hbx:${key}`); } catch (_) {} },
      clearPrivateData() {
        try {
          Object.keys(localStorage)
            .filter(key => key.startsWith("hbx:") && key !== "hbx:theme")
            .forEach(key => localStorage.removeItem(key));
        } catch (_) {}
      },
    },
    modules: {
      get() {
        const saved = HBX.cache.get("mobile-modules", { logistica: true, vendas: true }) || {};
        const modules = { logistica: saved.logistica !== false, vendas: saved.vendas !== false };
        if (!modules.logistica && !modules.vendas) modules.logistica = true;
        return modules;
      },
      set(next) {
        const modules = { logistica: next && next.logistica !== false, vendas: next && next.vendas !== false };
        if (!modules.logistica && !modules.vendas) return null;
        HBX.cache.set("mobile-modules", modules);
        return modules;
      },
    },
    revealActiveNav() {
      requestAnimationFrame(() => {
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
      });
    },
    navIndicator(activeIndex) {
      const saved = renderedNavIndex == null ? Number(HBX.cache.get("mobile-nav-index", activeIndex)) : renderedNavIndex;
      const from = Number.isFinite(saved) ? saved : activeIndex;
      renderedNavIndex = activeIndex;
      HBX.cache.set("mobile-nav-index", activeIndex);
      return { from, to: activeIndex, moving: from !== activeIndex };
    },
    mobileShell: {
      context: null,
      setContext(context) { this.context = context; },
      // `rotulos` (opcional) troca só o TEXTO de um item, por tela:
      // { route: "Caderneta" }. MODO CADERNETA (PR05082026-VER-TELA V4, 05/08):
      // o dono pediu que "Rota" SUMISSE com o modo ligado — sumir aqui é trocar
      // o RÓTULO, mantendo posição e ícone (lei das MESMAS TELAS: a tela do dia
      // mora ali; virar aba nova seria um app diferente pro mesmo motorista).
      navigation(appName, currentScreen, icon, rotulos) {
        const items = appName === "vendas"
          ? [["vendas", "funnel", "sales", "Vendas"], ["vendas", "chat", "wa", "WhatsApp"], ["vendas", "agenda", "calendar", "Agenda"], ["vendas", "more", "gear", "Ajustes"]]
          : [["logistica", "route", "route", "Rota"], ["logistica", "clients", "users", "Clientes"], ["logistica", "products", "box", "Produtos"], ["logistica", "chat", "chat", "Chat"], ["logistica", "settings", "gear", "Ajustes"]];
        const activeIndex = Math.max(0, items.findIndex(([itemApp, screen]) => itemApp === appName && screen === currentScreen));
        const indicator = HBX.navIndicator(activeIndex);
        return `<nav class="bottom-nav is-centered nav-count-${items.length}" style="--nav-count:${items.length};--nav-from:${indicator.from};--nav-to:${indicator.to}" aria-label="Navegação principal"><i class="nav-water ${indicator.moving ? "is-moving" : ""}" aria-hidden="true"></i>${items.map(([itemApp, screen, iconName, label]) => {
          const active = itemApp === appName && currentScreen === screen;
          const texto = (rotulos && rotulos[screen]) || label;
          return `<button type="button" class="nav-btn ${active ? "active" : ""}" data-destination="${itemApp}:${screen}"${active ? ` aria-current="page"` : ""}>${icon(iconName)}<span>${HBX.escape(texto)}</span></button>`;
        }).join("")}</nav>`;
      },
      frame(options) {
        const companyName = HBX.cache.get("logistica-company-name", ""); const brandName = companyName ? `HBX - ${companyName}` : "HBX";
        const motion = options.motion ? `screen-enter-${options.motion}` : "";
        const themeLabel = document.documentElement.dataset.theme === "dark" ? "Usar tema claro" : "Usar tema escuro";
        const brandMark = options.appName === "logistica" ? options.icon("route", 20) : "»";
        const syncStatus = options.appName === "vendas" ? `<span class="sync-dot ${options.error ? "offline" : ""}"></span>` : "";
        // MODO PASSEIO (29/07) — o botão "modo trabalho" vive SEMPRE na marcação
        // (o patch fino do topbar não reconcilia botões novos); quem mostra/esconde
        // é o CSS via body.pss-active. Só logistica.
        const passeioSair = options.appName === "logistica" ? `<button class="icon-btn pss-modo-sair" data-action="pss-trabalho" aria-label="Voltar ao modo trabalho">${options.icon("route", 18)}</button>` : "";
        return `<header class="topbar"><div class="topbar-spacer"></div><div class="brand"><div class="brand-mark">${brandMark}</div><div class="brand-copy"><strong>${HBX.escape(brandName)}</strong></div></div><div class="toolbar">${syncStatus}<button class="icon-btn" data-action="theme" aria-label="${themeLabel}">${options.icon("moon", 18)}</button><button class="icon-btn" data-action="refresh" aria-label="Atualizar" ${options.refreshing ? "disabled" : ""}>${options.icon("refresh", 18)}</button>${passeioSair}</div></header><main class="content ${motion}">${options.content}</main>${this.navigation(options.appName, options.currentScreen, options.icon, options.navLabels)}${options.overlays || ""}`;
      },
      mount(root, markup) {
        if (!root.querySelector(":scope > .topbar") || !root.querySelector(":scope > .content") || !root.querySelector(":scope > .bottom-nav")) {
          root.innerHTML = markup;
          root.__hbxContentHTML = null;
          root.__hbxOverlaysHTML = null;
          root.__hbxOverlayGen = null;
          return;
        }
        const template = document.createElement("template");
        template.innerHTML = markup.trim();
        const nextChildren = [...template.content.children];
        const nextTopbar = nextChildren.find(child => child.classList.contains("topbar"));
        const nextContent = nextChildren.find(child => child.classList.contains("content"));
        const nextNav = nextChildren.find(child => child.classList.contains("bottom-nav"));
        const topbar = root.querySelector(":scope > .topbar");
        const content = root.querySelector(":scope > .content");
        const nav = root.querySelector(":scope > .bottom-nav");

        // PR18072026 L4-D — o mapa maplibre (route-live-map / route-plan-preview-map)
        // não pode ser destruído a cada render (piscada + peso: tiles recarregam, GPU
        // reinicia). Se o nó atual já tem uma instância viva pendurada (el.__hbxMap,
        // ver logistica/app.js mountMap) e o próximo HTML tem um placeholder com o
        // MESMO id, o nó vivo é transplantado pro lugar do placeholder antes da
        // troca — ver transplantarMapa() logo abaixo. Se o novo HTML não tiver o
        // id, deixa morrer naturalmente.
        // 22/07 — FIM DA PISCADA (feedback do dono: "criei uma rota e a tela
        // piscou 5x"). Cada render() reconstruía a tela INTEIRA (content
        // .replaceWith) e destruía+recriava todos os overlays. Só que boa parte
        // dos renders de um fluxo não muda nada do que está na tela: um toast
        // que aparece e some são DUAS reconstruções completas; hideLoading +
        // dayStarting=false, mais uma. Cinco renders viravam cinco flashes.
        // Agora comparamos a MARCAÇÃO GERADA (não o DOM vivo, que sofre mutação
        // de mapa/foco/scroll depois do mount) com a do render anterior: igual =
        // não encosta no DOM. Consequência importante: quando pulamos a troca,
        // os nós SOBREVIVEM — então tudo que roda depois do mount tem que ser
        // idempotente (ver os guardas __hbx* em app.js: [data-day],
        // attachMoneyInput e o insertAdjacentHTML de enhancePaymentForms).
        // 22/07 S3a — o `.content` foi além: não é mais tudo-ou-nada. Ver
        // hbxReconciliarConteudo() acima (fora do mount, escopo de módulo).
        // MAIS nós agora sobrevivem (não só quando o .content inteiro bate
        // igual, mas também quando só um pedaço mudou) — o mesmo cuidado de
        // idempotência vale em dobro.
        const nextContentHTML = nextContent ? nextContent.outerHTML : "";
        const nextOverlaysHTML = [...template.content.children]
          .filter(child => !child.matches(".topbar,.content,.bottom-nav"))
          .map(child => child.outerHTML).join("");
        const contentChanged = nextContentHTML !== root.__hbxContentHTML;
        const overlaysChanged = nextOverlaysHTML !== root.__hbxOverlaysHTML;

        // O transplante do mapa vivo só pode acontecer no nó que REALMENTE vai
        // entrar no DOM — mover o mapa pra dentro de um pedaço de template que
        // acabará descartado arrancaria o mapa da tela. #route-plan-preview-map
        // (mora nos overlays) é transplantado lá embaixo, já dentro da
        // reconciliação, quando se sabe qual overlay vai ser inserido.
        // 22/07 S3a — #route-live-map (mora no .content) passou a valer a
        // MESMA regra, só que por dentro de hbxReconciliarConteudo(): antes
        // havia UMA chamada aqui, incondicional sempre que `contentChanged`
        // fosse true — e com a reconciliação fina `contentChanged` vira true
        // por causa de QUALQUER pedaço do .content, não só quando o ramo do
        // mapa muda. Chamar aqui, cedo, arrancaria o mapa vivo do lugar certo
        // (root.querySelector já o acha) e o prenderia dentro do template
        // DESCARTADO sempre que o ramo do mapa sobrevivesse — tela ficaria
        // com o spinner "Carregando mapa…" para sempre. Por isso a chamada
        // daqui saiu: agora só existe dentro da própria reconciliação, no
        // exato ponto em que um nó vai MESMO ser trocado/inserido.
        const transplantarMapa = (id, destino) => {
          const liveEl = root.querySelector(`#${id}`);
          const placeholder = destino.querySelector ? destino.querySelector(`#${id}`) : null;
          if (liveEl && liveEl.__hbxMap && placeholder && placeholder !== liveEl) placeholder.replaceWith(liveEl);
        };

        if (nextTopbar) {
          const brand = topbar.querySelector(".brand-copy");
          const nextBrand = nextTopbar.querySelector(".brand-copy");
          if (brand && nextBrand && brand.innerHTML !== nextBrand.innerHTML) brand.innerHTML = nextBrand.innerHTML;
          const sync = topbar.querySelector(".sync-dot");
          const nextSync = nextTopbar.querySelector(".sync-dot");
          if (sync && nextSync) sync.className = nextSync.className;
          const refresh = topbar.querySelector('[data-action="refresh"]');
          const nextRefresh = nextTopbar.querySelector('[data-action="refresh"]');
          if (refresh && nextRefresh) refresh.disabled = nextRefresh.disabled;
          const theme = topbar.querySelector('[data-action="theme"]');
          const nextTheme = nextTopbar.querySelector('[data-action="theme"]');
          if (theme && nextTheme) theme.setAttribute("aria-label", nextTheme.getAttribute("aria-label") || "Alterar tema");
        }

        // 22/07 S3a — era `content.replaceWith(nextContent)` tudo-ou-nada.
        // Agora, quando algo no .content mudou, reconciliamos filho a filho
        // (ver hbxReconciliarConteudo, escopo de módulo acima) em vez de
        // destruir a tela inteira; o `.content` (o <main>) em si nunca é
        // trocado, só o que está dentro dele.
        if (nextContent && contentChanged) hbxReconciliarConteudo(content, nextContent, HBX_CONTEUDO_PROFUNDIDADE_MAX, transplantarMapa);
        root.__hbxContentHTML = nextContentHTML;

        if (nextNav) {
          const currentKeys = [...nav.querySelectorAll(".nav-btn")].map(button => button.dataset.destination).join("|");
          const nextKeys = [...nextNav.querySelectorAll(".nav-btn")].map(button => button.dataset.destination).join("|");
          if (currentKeys !== nextKeys) nav.replaceWith(nextNav);
          else {
            nav.className = nextNav.className;
            nav.style.cssText = nextNav.style.cssText;
            const buttons = nav.querySelectorAll(".nav-btn");
            const nextButtons = nextNav.querySelectorAll(".nav-btn");
            buttons.forEach((button, index) => {
              button.className = nextButtons[index].className;
              const current = nextButtons[index].getAttribute("aria-current");
              if (current) button.setAttribute("aria-current", current); else button.removeAttribute("aria-current");
              // 05/08 — o RÓTULO também é reconciliado. As chaves da barra são o
              // `data-destination`, que NÃO muda quando só o texto muda ("Rota"
              // → "Caderneta"): sem esta linha o rótulo novo só apareceria
              // depois de um render que trocasse a barra inteira, e o modo
              // caderneta ligado ficaria escrito "Rota" pra sempre.
              const rotulo = button.querySelector("span");
              const proximo = nextButtons[index].querySelector("span");
              if (rotulo && proximo && rotulo.textContent !== proximo.textContent) rotulo.textContent = proximo.textContent;
            });
            const water = nav.querySelector(".nav-water");
            const nextWater = nextNav.querySelector(".nav-water");
            if (water && nextWater) {
              water.className = "nav-water";
              if (nextWater.classList.contains("is-moving")) requestAnimationFrame(() => water.classList.add("is-moving"));
            }
          }
        }

        // Overlays: reconciliação PEÇA A PEÇA, não "tudo ou nada". Antes, um
        // toast entrando (ou saindo) fazia TODOS os overlays serem removidos e
        // recriados junto — inclusive a folha de montar rota, que piscava por
        // causa de um aviso que nem era dela. Agora cada overlay é comparado
        // com a marcação que ele mesmo tinha no render anterior: igual = o nó
        // não é tocado (nem removido, nem re-anexado, nem re-animado); mudou =
        // só ELE é trocado; sumiu = só ele sai.
        if (overlaysChanged) {
          const primeiraClasse = el => (el.getAttribute("class") || el.tagName.toLowerCase()).split(" ")[0];
          const chavear = el => (usados => {
            const base = primeiraClasse(el);
            const n = (usados.get(base) || 0) + 1;
            usados.set(base, n);
            return `${base}#${n}`;
          });
          const usadosVivos = new Map();
          const vivos = new Map();
          [...root.children]
            .filter(child => !child.matches(".topbar,.content,.bottom-nav"))
            .forEach(child => vivos.set(chavear(child)(usadosVivos), child));
          const usadosNovos = new Map();
          const novos = [...template.content.children]
            .filter(child => !child.matches(".topbar,.content,.bottom-nav"))
            .map(child => ({ chave: chavear(child)(usadosNovos), el: child }));
          const chavesNovas = new Set(novos.map(item => item.chave));
          const geradoAntes = root.__hbxOverlayGen instanceof Map ? root.__hbxOverlayGen : new Map();
          const geradoAgora = new Map();

          vivos.forEach((el, chave) => { if (!chavesNovas.has(chave)) el.remove(); });

          let anterior = null;
          novos.forEach(({ chave, el }) => {
            const html = el.outerHTML;
            geradoAgora.set(chave, html);
            const vivo = vivos.get(chave);
            // Comparo com o que GEREI da última vez, não com o outerHTML do nó
            // vivo: o nó vivo sofre mutação depois do mount (mapa transplantado,
            // scroll, foco) e nunca voltaria a "bater" na string.
            if (vivo && geradoAntes.get(chave) === html) { anterior = vivo; return; }
            // Só agora, sabendo que ESTE nó vai mesmo entrar na tela, é seguro
            // puxar o mapa vivo pra dentro dele.
            transplantarMapa("route-plan-preview-map", el);
            if (vivo) { vivo.replaceWith(el); anterior = el; return; }
            if (anterior && anterior.nextSibling) root.insertBefore(el, anterior.nextSibling);
            else root.appendChild(el);
            anterior = el;
          });
          root.__hbxOverlayGen = geradoAgora;
        }
        root.__hbxOverlaysHTML = nextOverlaysHTML;
      },
      navigate(direction) {
        const context = this.context; if (!context) return;
        const screens = context.appName === "vendas"
          ? [["vendas", "funnel"], ["vendas", "chat"], ["vendas", "agenda"], ["vendas", "more"]]
          : [["logistica", "route"], ["logistica", "clients"], ["logistica", "products"], ["logistica", "chat"], ["logistica", "settings"]];
        const index = Math.max(0, screens.findIndex(([appName, screen]) => appName === context.appName && screen === context.currentScreen));
        const next = screens[(index + direction + screens.length) % screens.length]; const motion = direction > 0 ? "forward" : "back";
        context.navigate(next[1], motion);
      },
    },
    escape(value) {
      return String(value == null ? "" : value).replace(/[&<>'"]/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
      })[char]);
    },
    digits(value) { return String(value || "").replace(/\D/g, ""); },
    date(value, options) {
      if (!value) return "Sem data";
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return String(value);
      return parsed.toLocaleString("pt-BR", options || { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    },
    money(value) {
      return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    },
    uuid() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return `hbx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    },
  };

  // A abertura só libera o shell quando o módulo fixo deste APK termina a
  // primeira leitura real. Erro concluído também conta, pois a própria tela
  // abrirá no estado de erro recuperável.
  const bootMode = HBX.info().mode;
  const bootExpected = [bootMode === "vendas" ? "vendas" : "logistica"];
  const bootState = new Map(bootExpected.map(name => [name, { done: 0, total: 1, ready: false }]));
  let bootReadySent = false;
  function publishBootProgress() {
    const entries = [...bootState.values()];
    if (!entries.length) return;
    const ratio = entries.reduce((sum, item) => sum + Math.min(1, item.done / Math.max(1, item.total)), 0) / entries.length;
    const value = Math.min(96, 45 + Math.round(ratio * 51));
    bridge && bridge.appLoadProgress && bridge.appLoadProgress(value);
    if (bootReadySent || !entries.every(item => item.ready)) return;
    bootReadySent = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bridge && bridge.appReady && bridge.appReady(document.documentElement.dataset.theme || "dark");
    }));
  }
  HBX.boot = {
    begin(name, total) {
      const item = bootState.get(name); if (!item) return;
      item.total = Math.max(1, Number(total) || 1); item.done = 0; item.ready = false;
      publishBootProgress();
    },
    step(name) {
      const item = bootState.get(name); if (!item || item.ready) return;
      item.done = Math.min(item.total, item.done + 1); publishBootProgress();
    },
    ready(name) {
      const item = bootState.get(name); if (!item) return;
      item.done = item.total; item.ready = true; publishBootProgress();
    },
  };

  // Os apps usam delegação de clique no #app e fecham overlays quando o alvo
  // acionável é o próprio backdrop. Sem esta barreira, um clique em input/select
  // sobe até .modal-wrap/.sheet-wrap e é confundido com clique fora do conteúdo.
  // Registra antes de app.js para bloquear somente esse fechamento fantasma,
  // preservando ações explícitas, submit de formulário e clique real no backdrop.
  const appRoot = document.getElementById("app");
  if (appRoot) {
    let shellSwipe = null;
    const explicitTargetSelector = [
      "[data-screen]",
      "[data-action]",
      "[data-block]",
      "[data-lead]",
      "[data-wa]",
      "[data-delivery]",
      "[data-client]",
      "[data-mode]",
      "[data-day]",
      "[data-client-day]",
      "[data-client-product-mode]",
      "[data-client-product-id]",
      "[data-payment-form]",
      "[data-payment-method]",
    ].join(",");
    appRoot.addEventListener("click", event => {
      const destination = event.target.closest?.("[data-destination]");
      if (destination) {
        event.stopImmediatePropagation();
        const [appName, screen] = String(destination.dataset.destination || "").split(":");
        const context = HBX.mobileShell.context;
        if (context && context.appName === appName) context.navigate(screen);
        else if (appName === "vendas" && HBX.salesModule) HBX.salesModule.activate(screen, "forward");
        else if (appName === "logistica" && HBX.logisticaModule) HBX.logisticaModule.activate(screen, "back");
        return;
      }
      const overlay = event.target.closest?.(".sheet-wrap[data-action],.modal-wrap[data-action]");
      if (!overlay || event.target === overlay) return;
      const explicitTarget = event.target.closest?.(explicitTargetSelector);
      if (explicitTarget && explicitTarget !== overlay) return;
      event.stopImmediatePropagation();
    });
    appRoot.addEventListener("touchstart", event => {
      const target = event.target;
      if (event.touches.length !== 1 || target.closest?.(".bottom-nav, input, textarea, select, [contenteditable], .chips, .sales-board, .sales-stages, .modal-wrap, .sheet-wrap, [data-route-current], .maplibregl-map, .route-live-map, .route-plan-preview-map, .pss-screen")) { shellSwipe = null; return; }
      const touch = event.touches[0]; shellSwipe = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });
    appRoot.addEventListener("touchend", event => {
      if (!shellSwipe || event.changedTouches.length !== 1) { shellSwipe = null; return; }
      const touch = event.changedTouches[0]; const dx = touch.clientX - shellSwipe.x; const dy = touch.clientY - shellSwipe.y; shellSwipe = null;
      if (Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy)) HBX.mobileShell.navigate(dx < 0 ? 1 : -1);
    }, { passive: true });
    appRoot.addEventListener("touchcancel", () => { shellSwipe = null; }, { passive: true });
  }

  // 🔴 29/07 (dono, dirigindo às 21h com o mapa branco na cara: "NÃO TEM MODO
  // NOTURNO depois das 18 bem feito") — MODO NOTURNO POR HORA, sozinho: das 18h
  // às 6h o app e o mapa ficam escuros sem ninguém apertar nada. O botão de tema
  // continua manda: a escolha à mão vale até o próximo virar de turno (18h/6h),
  // aí a hora volta a mandar — quem forçou claro à noite não fica preso no claro
  // pra sempre, e quem não toca em nada nunca mais vê mapa branco de madrugada.
  function ehNoite(agora) {
    const hora = (agora || new Date()).getHours();
    return hora >= 18 || hora < 6;
  }
  function ultimoViradoDeTurno(agora) {
    const marco = new Date(agora || Date.now());
    const hora = marco.getHours();
    marco.setMinutes(0, 0, 0);
    if (hora >= 18) marco.setHours(18);
    else if (hora >= 6) marco.setHours(6);
    else { marco.setDate(marco.getDate() - 1); marco.setHours(18); }
    return marco.getTime();
  }
  function temaResolvido() {
    const escolha = HBX.cache.get("theme", "system");
    const escolhidoEm = Number(HBX.cache.get("themeAt", 0)) || 0;
    const manualVale = (escolha === "dark" || escolha === "light") && escolhidoEm > ultimoViradoDeTurno();
    if (manualVale) return escolha;
    if (ehNoite()) return "dark";
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function applyTheme() {
    const dark = temaResolvido() === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }
  HBX.theme = {
    get: () => HBX.cache.get("theme", "system"),
    set(value) { HBX.cache.set("theme", value); HBX.cache.set("themeAt", Date.now()); applyTheme(); document.dispatchEvent(new CustomEvent("hbx:theme")); },
    toggle() { this.set(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); },
  };
  applyTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (HBX.theme.get() === "system") {
      applyTheme();
      document.dispatchEvent(new CustomEvent("hbx:theme"));
    }
  });
  // Relógio do modo noturno: 1 checagem por minuto, e só avisa a tela quando o
  // tema REALMENTE virou (nada de render a cada minuto).
  setInterval(() => {
    const atual = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    if (temaResolvido() === atual) return;
    applyTheme();
    document.dispatchEvent(new CustomEvent("hbx:theme"));
  }, 60000);
  window.HBX = HBX;
})();
