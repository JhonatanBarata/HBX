"use strict";
/* ==========================================================================
   arvore.js — Guia "Árvore do motor" (HBX Owner :3107)
   F3 (02/07, docs/PLANEJAMENTOS/PR02072026/F3-3107-arvore-viva.md).

   IIFE isolado: NÃO toca globais do app.js/tree.js, não colide com nenhum id
   deles. Mesmo padrão de tree.js (helper de fetch próprio com token, escape
   próprio, fetch paralelo tolerante) — mas é uma guia NOVA e SEPARADA: a
   "Árvore HBX" (tree.js) mostra local×VPS lado a lado; esta guia mostra a
   MESMA grade do desenho docs/PLANEJAMENTOS/ARVORE-MESTRA/pesquisa-vps.svg
   (a árvore do MOTOR: seed→rfb→web→portas→fusão→enriquecimento→zap-gate→card
   +fábrica/missões+cofre), alimentada por 1 endpoint agregador só
   (GET /owner/radar/tree-status, cache 10s no backend).

   Reusa as classes visuais JÁ existentes (tree.css: .tree-node/.tnode/
   .tnode-metrics/.tgauges/.tnode-actions; styles.css: .btn/.pill) — zero CSS
   novo, zero framework.
========================================================================== */
(function () {

  /* ── helpers próprios (NÃO depende do app.js/tree.js) ────────────────── */
  function aapi(method, route, body, timeoutMs) {
    const TOKEN = window.__HBX_OWNER_TOKEN__ || "";
    const limit = timeoutMs || 20000;
    const ctrl = new AbortController();
    const to = setTimeout(function () { ctrl.abort(); }, limit);
    const opts = {
      method,
      headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
      signal: ctrl.signal,
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(route, opts).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          const msg = (Array.isArray(d && d.message) ? d.message.join(" · ") : d && d.message)
            || (d && d.error) || (d && d.reason) || ("http_" + res.status);
          throw new Error(msg);
        });
      }
      return res.json();
    }).catch(function (e) {
      if (e && e.name === "AbortError") throw new Error("tempo esgotado (" + Math.round(limit / 1000) + "s)");
      throw e;
    }).finally(function () { clearTimeout(to); });
  }

  function aesc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function afmt(n) {
    const num = Number(n);
    return Number.isFinite(num) ? num.toLocaleString("pt-BR") : "—";
  }

  /* ── estado ────────────────────────────────────────────────────────── */
  var aState = {
    pollTimer: null,
    loading: false,
    loadStartedAt: 0,
    seq: 0,
    lastData: null,
    detailStage: null, // qual caixa está com o painel de detalhe aberto (clique)
  };

  /* ── navegação guia (chamada pelo init da nav principal) ─────────────── */
  function setGuideArvore(active) {
    var root = document.getElementById("guide-arvore");
    if (root) root.hidden = !active;
    var nav = document.getElementById("gnav-arvore");
    if (nav) nav.classList.toggle("is-active", active);
    if (active) {
      loadArvore();
      startPoll();
    } else {
      stopPoll();
    }
  }

  function startPoll() {
    stopPoll();
    // polling 15s (pedido do briefing) — o backend já cacheia 10s, então no pior caso a UI
    // mostra um número com até ~25s de atraso; nunca mais que isso.
    aState.pollTimer = setInterval(function () {
      if (document.body.dataset.guide === "arvore") loadArvore();
    }, 15000);
  }

  function stopPoll() {
    if (aState.pollTimer) { clearInterval(aState.pollTimer); aState.pollTimer = null; }
  }

  /* ── carga ─────────────────────────────────────────────────────────── */
  function loadArvore(force) {
    var flow = document.getElementById("arvore-flow");
    if (!flow) return;
    if (aState.loading && (Date.now() - (aState.loadStartedAt || 0)) < 30000) return;
    aState.loading = true;
    aState.loadStartedAt = Date.now();
    aState.seq += 1;
    var mySeq = aState.seq;

    if (!flow.querySelector(".tree-node")) {
      flow.innerHTML = '<p class="delta">montando a árvore do motor…</p>';
    }

    // timeout 25s: FOLGADO acima do timeout do proxy no server.js (15s pro backendRequest) — o
    // proxy sempre responde HTTP 200 antes (sucesso OU degradado), então o abort daqui só deve
    // disparar se o PRÓPRIO server.js (não o backend) estiver travado.
    aapi("GET", "/owner/radar/tree-status", undefined, 25000)
      .then(function (data) {
        if (mySeq !== aState.seq) return;
        // Falha de PROXY (backend local fora do ar, token ausente etc.): o server.js degrada com
        // HTTP 200 + { ok:false, reason } NO NÍVEL RAIZ (não tem "seed"/"rfb"/... dentro) — se
        // renderizarmos isso como se fosse o agregador normal, cada bloco vira "idle" silencioso
        // (mentira: não é ocioso, é SEM LEITURA NENHUMA). Detecta e mostra 1 erro único e honesto.
        if (data && data.ok === false && !data.seed) {
          flow.innerHTML = '<p class="delta">sem leitura do backend local: ' + aesc(data.reason || "erro desconhecido") + "</p>";
          aState.lastData = null;
          return;
        }
        aState.lastData = data;
        renderArvore(data, flow);
        var gen = document.getElementById("arvore-generated");
        if (gen) {
          var now = new Date();
          var cachedFlag = data && data.cached ? " (cache)" : "";
          gen.textContent = "atualizado às " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + cachedFlag;
        }
      })
      .catch(function (e) {
        if (mySeq !== aState.seq) return;
        if (!flow.querySelector(".tree-node")) {
          flow.innerHTML = '<p class="delta">falha ao ler a árvore: ' + aesc(e.message) + "</p>";
        }
      })
      .finally(function () { aState.loading = false; });
  }

  /* ── leitura de bloco tolerante: { ok:true, data } | { ok:false, error } ── */
  function blockData(block) {
    return block && block.ok ? block.data : null;
  }
  function blockError(block) {
    return block && block.ok === false ? block.error : null;
  }

  /* ── monta os "nós" (caixas) da grade a partir do agregador ──────────── */
  function buildNodes(data) {
    var nodes = [];

    // 1 — Semente (buscas de hoje)
    (function () {
      var d = blockData(data.seed);
      var err = blockError(data.seed);
      nodes.push({
        stage: "seed", icon: "🌱", title: "1 · Semente — buscas de hoje",
        big: d ? afmt(d.runsToday) : null,
        bigLabel: "buscas hoje",
        status: err ? "warn" : (d && d.runsToday > 0 ? "ok" : "idle"),
        note: err ? ("sem leitura: " + err) : "1 run = 1 clique em \"buscar\" do vendedor.",
      });
    })();

    // 2 — RFB (base local)
    (function () {
      var d = blockData(data.rfb);
      var err = blockError(data.rfb);
      nodes.push({
        stage: "rfb", icon: "🏛", title: "2 · SELECT RFB — base local",
        big: d ? afmt(d.totalCompanies) : null,
        bigLabel: "empresas no extrato",
        status: err ? "warn" : (!d ? "idle" : (d.enabled ? "ok" : "off")),
        badge: d ? (d.enabled ? "ligado no caminho do cliente" : "desligado (HBX_RADAR_CNPJ_PUBLIC_ENABLED=false)") : null,
        note: err ? ("sem leitura: " + err) : (d && !d.enabled ? "Base existe, mas a flag ainda não libera no caminho do cliente (F1)." : ""),
      });
    })();

    // 3 — Motor web (frota)
    (function () {
      var d = blockData(data.web);
      var err = blockError(data.web);
      var alive = d ? Number(d.alive || 0) : null;
      nodes.push({
        stage: "web", icon: "🔎", title: "3 · Motor web — frota grátis",
        big: alive != null ? afmt(alive) : null,
        bigLabel: "motores vivos",
        status: err ? "warn" : (!d ? "idle" : (alive === 0 ? "blocked" : (d.queued > 0 ? "warn" : "ok"))),
        metrics: d ? [
          { label: "Vivos", val: afmt(d.alive) },
          { label: "Rodando", val: afmt(d.running) },
          { label: "Na fila", val: afmt(d.queued) },
        ] : [],
        note: err ? ("sem leitura: " + err) : (d && d.operationalStatus ? ("status: " + d.operationalStatus) : ""),
      });
    })();

    // 4 — Portas (aceitos x rejeitados)
    (function () {
      var d = blockData(data.gates);
      var err = blockError(data.gates);
      nodes.push({
        stage: "gates", icon: "🚪", title: "4 · Portas — aceitos × rejeitados hoje",
        big: d ? (afmt(d.accepted) + " / " + afmt(d.rejected)) : null,
        bigLabel: "aceitos / rejeitados",
        status: err ? "warn" : (!d ? "idle" : "ok"),
        note: err ? ("sem leitura: " + err) : (d && d.note ? d.note : ""),
      });
    })();

    // 5 — Fusão
    (function () {
      var d = blockData(data.fusion);
      var err = blockError(data.fusion);
      nodes.push({
        stage: "fusion", icon: "🔗", title: "5 · Fusão canônica",
        big: d ? (d.fusionPct + "%") : null,
        bigLabel: "cards com 2+ fontes",
        status: err ? "warn" : (!d ? "idle" : "ok"),
        metrics: d ? [
          { label: "Cards hoje", val: afmt(d.cardsToday) },
          { label: "Fundidos", val: afmt(d.fusedToday) },
        ] : [],
        note: err ? ("sem leitura: " + err) : "",
      });
    })();

    // 6 — Enriquecimento L1-L4 (fill-rate)
    (function () {
      var d = blockData(data.enrich);
      var err = blockError(data.enrich);
      nodes.push({
        stage: "enrich", icon: "✨", title: "6 · Enriquecimento — fill-rate hoje",
        big: d ? (d.email.pct + "%") : null,
        bigLabel: "com e-mail",
        status: err ? "warn" : (!d ? "idle" : "ok"),
        metrics: d ? [
          { label: "E-mail", val: d.email.pct + "% (" + afmt(d.email.count) + ")" },
          { label: "Instagram", val: d.instagram.pct + "% (" + afmt(d.instagram.count) + ")" },
          { label: "Sócio", val: d.owner.pct + "% (" + afmt(d.owner.count) + ")" },
        ] : [],
        note: err ? ("sem leitura: " + err) : "",
      });
    })();

    // 8 — Zap-gate (freio W4)
    (function () {
      var d = blockData(data.zapGate);
      var err = blockError(data.zapGate);
      var breaker = d ? d.breakerState : null;
      nodes.push({
        stage: "zapgate", icon: "📵", title: "8 · Zap-gate — freio da entrega",
        big: breaker ? breaker : null,
        bigLabel: "disjuntor",
        status: err ? "warn" : (!d ? "idle" : (breaker === "open" ? "blocked" : (breaker === "half_open" ? "warn" : "ok"))),
        metrics: d ? [
          { label: "Cache TTL", val: d.ttlHours + "h" },
          { label: "Teto/min", val: afmt(d.maxPerMinute) },
          { label: "Na janela", val: afmt(d.windowCount) },
          { label: "Erros seguidos", val: afmt(d.consecutiveErrors) },
        ] : [],
        note: err ? ("sem leitura: " + err) : "",
      });
    })();

    // Card entregue + split sourceChain
    (function () {
      var d = blockData(data.card);
      var err = blockError(data.card);
      nodes.push({
        stage: "card", icon: "🎯", title: "Card entregue hoje · split sourceChain",
        big: d ? afmt(d.deliveredToday) : null,
        bigLabel: "entregues hoje",
        status: err ? "warn" : (!d ? "idle" : "ok"),
        metrics: d ? [
          { label: "rfb+web", val: afmt(d.split.rfb_web) },
          { label: "só web", val: afmt(d.split.web) },
          { label: "só rfb", val: afmt(d.split.rfb) },
          { label: "sem mapa", val: afmt(d.split.unmapped) },
        ] : [],
        note: err ? ("sem leitura: " + err) : "",
      });
    })();

    // Fábrica de missões (fila S4)
    (function () {
      var d = blockData(data.missions);
      var err = blockError(data.missions);
      var lag = d ? d.lag : null;
      nodes.push({
        stage: "missions", icon: "🏭", title: "Fábrica de enriquecimento — fila de missões",
        big: d ? (d.supported ? afmt(lag && lag.queuedDue) : "off") : null,
        bigLabel: "na fila (devidas)",
        status: err ? "warn" : (!d ? "idle" : (!d.supported ? "off" : (d.paused ? "blocked" : "ok"))),
        metrics: d && d.supported ? (d.byStageStatus || []).slice(0, 6).map(function (row) {
          return { label: row.stage + "·" + row.status, val: afmt(row.count) };
        }) : [],
        note: err ? ("sem leitura: " + err) : (d && !d.supported ? "Fila ainda sem persistência (tabela RadarMission ausente)." : (d && d.paused ? "Fila PAUSADA." : "")),
        actions: (d && d.supported) ? [
          { act: "missions-redrive", label: "↻ Redrive dead-letter", cls: "btn-amber" },
        ] : [],
      });
    })();

    // Cofre (governor por fonte)
    (function () {
      var d = blockData(data.vault);
      var err = blockError(data.vault);
      var sources = d && Array.isArray(d.sources) ? d.sources : [];
      nodes.push({
        stage: "vault", icon: "🔒", title: "Cofre — governor por fonte",
        big: sources.length ? afmt(sources.length) : null,
        bigLabel: "fontes monitoradas",
        status: err ? "warn" : (!d ? "idle" : "ok"),
        gauges: sources.map(function (s) {
          var g = { label: s.source, tier: s.tier, text: "", pct: null, state: "ok" };
          if (s.counterError) {
            g.text = s.tier === "paid" ? "contador ilegível → PAUSADA (fail-closed)" : "contador ilegível (segue)";
            g.state = s.tier === "paid" ? "blocked" : "warn";
          } else if (s.cap != null) {
            var used = Number(s.used || 0);
            g.pct = Math.max(0, Math.min(100, Math.round((used / s.cap) * 100)));
            g.text = used.toLocaleString("pt-BR") + " / " + s.cap.toLocaleString("pt-BR") + (s.period === "day" ? " hoje" : " no mês");
            g.state = g.pct >= 100 ? "blocked" : g.pct >= 70 ? "warn" : "ok";
          } else {
            g.text = s.allowed === false ? "OFF" : "sem teto fixo";
            g.state = s.allowed === false ? "muted" : "ok";
          }
          return g;
        }),
        note: err ? ("sem leitura: " + err) : "",
      });
    })();

    return nodes;
  }

  /* ── ação PARAR TUDO (reusa a MESMA rota que o botão da fábrica antiga usa
     — POST /owner/factory/stop, já proxiada no server.js — sem duplicar lógica) ── */
  function buildStopBanner(data) {
    var factoryBlock = blockData(data.missions); // sinaliza pausa da fila, quando existe
    var paused = Boolean(factoryBlock && factoryBlock.paused);
    return {
      stage: "stop-banner",
      paused: paused,
    };
  }

  /* ── render ────────────────────────────────────────────────────────── */
  function renderArvore(data, flow) {
    var nodes = buildNodes(data);
    var html = nodes.map(renderNode).join("");
    flow.innerHTML = html;
  }

  function renderNode(n) {
    var bigHtml = n.big != null
      ? '<div class="metric"><span class="label">' + aesc(n.bigLabel || "") + '</span><strong>' + aesc(n.big) + "</strong></div>"
      : "";

    var metricsHtml = "";
    if (n.metrics && n.metrics.length) {
      metricsHtml = '<div class="tnode-metrics">'
        + n.metrics.map(function (m) {
            return '<div class="tnode-metric"><span class="tm-label">' + aesc(m.label) + '</span><strong class="tm-val">' + aesc(m.val) + "</strong></div>";
          }).join("")
        + "</div>";
    }

    var gaugesHtml = "";
    if (n.gauges && n.gauges.length) {
      gaugesHtml = '<div class="tgauges">'
        + n.gauges.map(function (g) {
            var bar = g.pct != null
              ? '<span class="tgauge-bar"><span class="tgauge-fill" style="width:' + Math.max(2, g.pct) + '%"></span></span>'
              : "";
            return '<div class="tgauge" data-state="' + aesc(g.state) + '" data-tier="' + aesc(g.tier) + '">'
              + '<span class="tgauge-name">' + aesc(g.label) + '</span>'
              + bar
              + '<span class="tgauge-text">' + aesc(g.text) + '</span>'
              + "</div>";
          }).join("")
        + "</div>";
    }

    var badgeHtml = n.badge ? '<span class="tnode-badge">' + aesc(n.badge) + '</span>' : "";
    var noteHtml = n.note ? '<p class="tnode-note">' + aesc(n.note) + '</p>' : "";

    var actionsHtml = "";
    if (n.actions && n.actions.length) {
      actionsHtml = '<div class="tnode-actions">'
        + n.actions.map(function (a) {
            return '<button class="btn btn-sm ' + aesc(a.cls) + '" data-act="' + aesc(a.act) + '">' + aesc(a.label) + "</button>";
          }).join("")
        + '<span class="tbtn-result"></span>'
        + "</div>";
    }

    return '<div class="tree-node" data-stage="' + aesc(n.stage) + '" data-status="' + aesc(n.status) + '" data-flow="on">'
      + '<div class="tnode" data-arvore-detail="' + aesc(n.stage) + '">'
      + '<div class="tnode-head">'
      + '<span class="tnode-icon">' + aesc(n.icon) + '</span>'
      + '<h3 class="tnode-title">' + aesc(n.title) + '</h3>'
      + badgeHtml
      + '</div>'
      + bigHtml
      + metricsHtml
      + gaugesHtml
      + noteHtml
      + actionsHtml
      + '</div>'
      + '</div>';
  }

  /* ── clique na caixa abre painel de detalhe simples (JSON pré-formatado) ── */
  function showDetail(stage) {
    var box = document.getElementById("arvore-detail");
    if (!box || !aState.lastData) return;
    var block = aState.lastData[stage];
    box.hidden = false;
    var title = box.querySelector("[data-detail-title]");
    var pre = box.querySelector("[data-detail-body]");
    if (title) title.textContent = "Detalhe · " + stage;
    if (pre) pre.textContent = JSON.stringify(block, null, 2);
    aState.detailStage = stage;
  }

  function hideDetail() {
    var box = document.getElementById("arvore-detail");
    if (box) box.hidden = true;
    aState.detailStage = null;
  }

  /* ── PARAR TUDO / redrive — ações com confirmação explícita ──────────── */
  function tbtnResult(resultEl, ok, msg) {
    if (!resultEl) return;
    resultEl.textContent = ok ? "✓ OK" : ("✗ " + msg);
    resultEl.className = "tbtn-result " + (ok ? "ok" : "bad");
  }

  function handleStopAll(btn) {
    if (!confirm("⏸ PARAR TUDO?\n\nCongela a fábrica (emergencyStop) — corta Brave/ddg/bing e pausa a produção autônoma. Confirma?")) return;
    btn.disabled = true;
    var resultEl = document.getElementById("arvore-stopall-result");
    if (resultEl) { resultEl.textContent = "…"; resultEl.className = "tbtn-result"; }
    aapi("POST", "/owner/factory/stop", {})
      .then(function () {
        if (resultEl) tbtnResult(resultEl, true, "");
        setTimeout(function () { loadArvore(true); }, 1500);
      })
      .catch(function (e) {
        if (resultEl) tbtnResult(resultEl, false, e.message);
      })
      .finally(function () { btn.disabled = false; });
  }

  function handleResumeAll(btn) {
    if (!confirm("▶ Religar a fábrica (voltar ao agendamento normal)?")) return;
    btn.disabled = true;
    var resultEl = document.getElementById("arvore-stopall-result");
    if (resultEl) { resultEl.textContent = "…"; resultEl.className = "tbtn-result"; }
    aapi("POST", "/owner/factory/resume", {})
      .then(function () {
        if (resultEl) tbtnResult(resultEl, true, "");
        setTimeout(function () { loadArvore(true); }, 1500);
      })
      .catch(function (e) {
        if (resultEl) tbtnResult(resultEl, false, e.message);
      })
      .finally(function () { btn.disabled = false; });
  }

  function handleMissionsRedrive(btn) {
    if (!confirm("↻ Redrive dead-letter: devolve as missões mortas pra fila (status=queued)?\n\nElas voltam a tentar do zero.")) return;
    btn.disabled = true;
    var resultEl = btn.closest(".tnode-actions") ? btn.closest(".tnode-actions").querySelector(".tbtn-result") : null;
    if (resultEl) { resultEl.textContent = "…"; resultEl.className = "tbtn-result"; }
    aapi("POST", "/owner/missions/redrive", {})
      .then(function () {
        if (resultEl) tbtnResult(resultEl, true, "");
        setTimeout(function () { loadArvore(true); }, 1500);
      })
      .catch(function (e) {
        if (resultEl) tbtnResult(resultEl, false, e.message);
      })
      .finally(function () { btn.disabled = false; });
  }

  /* ── delegação de eventos em #guide-arvore ────────────────────────────── */
  function initEventDelegation() {
    var root = document.getElementById("guide-arvore");
    if (!root) return;

    root.addEventListener("click", function (e) {
      var closeBtn = e.target.closest("[data-detail-close]");
      if (closeBtn) { hideDetail(); return; }

      var stopBtn = e.target.closest("#arvore-stopall-btn");
      if (stopBtn) { handleStopAll(stopBtn); return; }

      var resumeBtn = e.target.closest("#arvore-resumeall-btn");
      if (resumeBtn) { handleResumeAll(resumeBtn); return; }

      var actBtn = e.target.closest("[data-act='missions-redrive']");
      if (actBtn) { handleMissionsRedrive(actBtn); return; }

      var refreshBtn = e.target.closest("#arvore-refresh");
      if (refreshBtn) { loadArvore(true); return; }

      // clique numa caixa (fora de botão) abre o detalhe
      var nodeEl = e.target.closest("[data-arvore-detail]");
      if (nodeEl && !e.target.closest("button")) {
        showDetail(nodeEl.getAttribute("data-arvore-detail"));
      }
    });
  }

  /* ── init ──────────────────────────────────────────────────────────── */
  function init() {
    var gArvore = document.getElementById("gnav-arvore");
    if (gArvore) gArvore.addEventListener("click", function () { setGuideArvoreNav(); });

    initEventDelegation();

    var box = document.getElementById("arvore-detail");
    if (box) box.hidden = true;

    var root = document.getElementById("guide-arvore");
    if (root) root.hidden = true;
  }

  /* Nav própria: coexiste com "Painel"/"Árvore HBX" (tree.js) sem tocar no
     dataset.guide delas — usa o MESMO atributo body.dataset.guide (3 valores
     possíveis agora: panel|tree|arvore), então esconde as outras 2 seções ao
     entrar e restaura "panel" ao sair (mesma convenção do tree.js). */
  function setGuideArvoreNav() {
    document.body.dataset.guide = "arvore";
    var gPanel = document.getElementById("gnav-panel");
    var gTree = document.getElementById("gnav-tree");
    var gArvore = document.getElementById("gnav-arvore");
    var panel = document.getElementById("guide-panel");
    var tree = document.getElementById("guide-tree");
    if (gPanel) gPanel.classList.remove("is-active");
    if (gTree) gTree.classList.remove("is-active");
    if (gArvore) gArvore.classList.add("is-active");
    if (panel) panel.hidden = true;
    if (tree) tree.hidden = true;
    setGuideArvore(true);
  }

  // Intercepta os cliques nas outras 2 abas pra fechar esta guia (evita as 3 seções visíveis
  // juntas) — delegação leve, não substitui os handlers delas (tree.js/app.js continuam donos).
  function initCrossGuideClose() {
    var gPanel = document.getElementById("gnav-panel");
    var gTree = document.getElementById("gnav-tree");
    if (gPanel) gPanel.addEventListener("click", function () { setGuideArvore(false); });
    if (gTree) gTree.addEventListener("click", function () { setGuideArvore(false); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); initCrossGuideClose(); });
  } else {
    init();
    initCrossGuideClose();
  }

})();
