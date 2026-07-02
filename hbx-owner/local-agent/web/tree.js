"use strict";
/* ==========================================================================
   tree.js — Guia "Árvore HBX" (HBX Owner :3107)
   IIFE isolado: não toca globais do app.js, não colide com nenhum id.
   Segue TREE_CONTRACT.md ao pé da letra.
========================================================================== */
(function () {

  /* ── helpers próprios (NÃO depende do app.js) ───────────────────────── */
  function tapi(method, route, body, timeoutMs) {
    const TOKEN = window.__HBX_OWNER_TOKEN__ || "";
    const limit = timeoutMs || 35000;
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
      /* timeout vira erro legível — safe() trata, o nó degrada p/ idle e a árvore NÃO trava */
      if (e && e.name === "AbortError") throw new Error("tempo esgotado (" + Math.round(limit / 1000) + "s)");
      throw e;
    }).finally(function () { clearTimeout(to); });
  }

  function tesc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ── estado ─────────────────────────────────────────────────────────── */
  /* Split-screen: local e VPS SEMPRE lado a lado, nunca mais um toggle que troca de tela
     (pedido do dono 30/06 — "LOCAL na ESQUERDA e VPS na DIREITA, na MESMA TELA"). */
  var tState = {
    pollTimer: null,
    intCache: null,   // { at, local, vps } — presença de chave muda raramente; intVps é SSH
    /* cada escopo carrega e renderiza no seu próprio ritmo — um SSH lento na VPS
       nunca trava o local (e vice-versa) */
    local: { loading: false, loadStartedAt: 0, seq: 0 },
    vps:   { loading: false, loadStartedAt: 0, seq: 0 },
  };

  /* ── navegação guia (Painel ↔ Árvore) ──────────────────────────────── */
  function setGuide(g) {
    document.body.dataset.guide = g;
    var gPanel = document.getElementById("gnav-panel");
    var gTree  = document.getElementById("gnav-tree");
    var panel  = document.getElementById("guide-panel");
    var tree   = document.getElementById("guide-tree");

    if (gPanel) gPanel.classList.toggle("is-active", g === "panel");
    if (gTree)  gTree.classList.toggle("is-active",  g === "tree");
    if (panel)  panel.hidden = (g !== "panel");
    if (tree)   tree.hidden  = (g !== "tree");

    if (g === "tree") {
      loadTree();
      startPoll();
    } else {
      stopPoll();
    }
  }

  function startPoll() {
    stopPoll();
    tState.pollTimer = setInterval(function () {
      if (document.body.dataset.guide === "tree") loadTree();
    }, 12000);
  }

  function stopPoll() {
    if (tState.pollTimer) { clearInterval(tState.pollTimer); tState.pollTimer = null; }
  }

  /* ── refresh (split-screen não tem mais tabs — os dois lados sempre carregam juntos) ── */
  function initScopeTabs() {
    var refreshBtn = document.getElementById("tree-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", function () { loadTree(true); });
  }

  /* ── tbtnResult ────────────────────────────────────────────────────── */
  function tbtnResult(resultEl, ok, msg) {
    if (!resultEl) return;
    resultEl.textContent = ok ? "✓ OK" : ("✗ " + msg);
    resultEl.className = "tbtn-result " + (ok ? "ok" : "bad");
  }

  /* ── fetch paralelo tolerante ──────────────────────────────────────── */
  function safe(p) {
    return p.then(function (d) { return { ok: true, data: d }; })
            .catch(function (e) { return { ok: false, err: e.message }; });
  }

  /* ── loadTree: dispara os DOIS escopos em paralelo (split-screen, sem toggle) ── */
  function loadTree(force) {
    loadScope("local", force);
    loadScope("vps", force);
  }

  function loadScope(scope, force) {
    var flow = document.getElementById(scope === "vps" ? "tree-flow-vps" : "tree-flow-local");
    if (!flow) return;
    var st = scope === "vps" ? tState.vps : tState.local;
    /* trava re-entrância MAS auto-cura: se o load anterior pendurou >45s, segue (nunca deadlock) */
    if (st.loading && (Date.now() - (st.loadStartedAt || 0)) < 45000) return;
    st.loading = true;
    st.loadStartedAt = Date.now();
    st.seq += 1;
    var mySeq = st.seq;                 // se outro load deste MESMO escopo começar depois, este render é descartado
    /* só mostra "carregando" no 1º load (vazio); no refresh mantém a árvore (não pula o scroll) */
    if (!flow.querySelector(".tree-node")) {
      flow.innerHTML = '<p class="delta">montando a árvore… (a 1ª leitura pode levar ~30s — depois fica instantânea)</p>';
    }

    var isVps = scope === "vps";

    /* integrações: cache client-side ~3min. intVps é SSH (~15-30s) — não bater a cada poll. */
    var intFresh = !force && tState.intCache && (Date.now() - tState.intCache.at < 180000);
    var intLocalP = intFresh ? Promise.resolve(tState.intCache.local)
                             : safe(tapi("GET", "/owner/integrations"));
    var intVpsP   = intFresh ? Promise.resolve(tState.intCache.vps)
                             : safe(tapi("GET", "/owner/integrations/vps"));

    /* endpoints */
    var cockpitP   = safe(tapi("GET", "/owner/radar-cockpit"));
    var systemP    = safe(tapi("GET", isVps ? "/owner/vps/system" : "/owner/system"));
    var engP       = safe(tapi("GET", isVps ? "/owner/vps/engines-status" : "/owner/engines/status"));
    var enrichP    = safe(tapi("GET", "/owner/enricher/status"));
    var leadsP     = safe(tapi("GET", isVps ? "/owner/vps/leads" : "/owner/leads-bank"));
    /* factory/status só existe local */
    var factoryP   = isVps ? Promise.resolve({ ok: false, err: "vps" })
                           : safe(tapi("GET", "/owner/factory/status"));
    /* Cérebro IA (Ollama) é LOCAL — só faz sentido no escopo local; VPS recebe stub */
    var aiP        = isVps ? Promise.resolve({ ok: false, err: "vps" })
                           : safe(tapi("GET", "/owner/ai/status"));
    /* Governor por fonte (gauge usado/teto): lê o backend LOCAL; leitura da VPS ainda sem rota ops */
    var budgetP    = isVps ? Promise.resolve({ ok: false, err: "vps" })
                           : safe(tapi("GET", "/owner/source-budget"));

    Promise.all([cockpitP, systemP, engP, enrichP, intLocalP, intVpsP, leadsP, factoryP, aiP, budgetP])
      .then(function (results) {
        var cockpitR = results[0];
        var systemR  = results[1];
        var engR     = results[2];
        var enrichR  = results[3];
        var intLocR  = results[4];
        var intVpsR  = results[5];
        var leadsR   = results[6];
        var factR    = results[7];
        var aiR      = results[8];
        var budgetR  = results[9];

        /* guarda presença de chave no cache client-side (evita SSH a cada poll) */
        if (!intFresh) tState.intCache = { at: Date.now(), local: intLocR, vps: intVpsR };

        /* extrair env do cockpit */
        var env = null;
        if (cockpitR.ok && cockpitR.data && cockpitR.data.environments) {
          env = cockpitR.data.environments[isVps ? "vps" : "localhost"] || null;
        }
        var cockpitUnavail = !cockpitR.ok
          || (cockpitR.data && cockpitR.data.configured === false)
          || (env && env.configured === false);

        var nodes = [];

        /* ── 1. Infra ───────────────────────────────────────────────── */
        (function () {
          var sys = systemR.ok ? systemR.data : null;
          var status = "idle";
          var note = "";
          var metrics = [];

          if (sys && sys.ok !== false && sys.pressure) {
            var p = sys.pressure;
            var ram  = p.ram  ? p.ram.usedPct  : null;
            var cpu  = p.cpu  ? p.cpu.usedPct  : (p.load ? null : null);
            var disk = p.disk ? p.disk.usedPct : null;
            metrics = [
              { label: "RAM",   val: ram  != null ? ram  + "%" : "—" },
              { label: "CPU",   val: cpu  != null ? cpu  + "%" : (p.load && p.load.load1 != null ? "load " + p.load.load1.toFixed(2) : "—") },
              { label: "Disco", val: disk != null ? disk + "%" : "—" },
            ];
            var lvl = sys.verdict ? sys.verdict.level : "ok";
            status = lvl === "buy" ? "blocked" : lvl === "tight" ? "warn" : "ok";
            note   = sys.verdict ? (sys.verdict.detail || sys.verdict.title || "") : "";
          } else if (sys && sys.configured === false) {
            note = "sem leitura da VPS (configure HBX_OWNER_OPS_TOKEN)";
          } else if (!systemR.ok) {
            note = "erro ao ler: " + (systemR.err || "?");
          } else {
            note = "sem dados de pressão";
          }

          nodes.push({
            stage: "infra", icon: "🩺", title: "Infra · " + (isVps ? "servidor" : "sua máquina"),
            status: status, metrics: metrics, note: note, actions: [],
          });
        })();

        /* ── 2. Serviços base ────────────────────────────────────────── */
        (function () {
          var services = env && env.services ? env.services : null;
          var status = "idle";
          var note = "";
          var metrics = [];
          var down = [];

          if (services) {
            function svcUp(s) {
              if (!s) return false;
              return s.state === "running" || s.running === true;
            }
            var pgUp   = svcUp(services.postgres);
            var beUp   = svcUp(services.backend);
            var wsUp   = svcUp(services.webscraping);
            var seUp   = svcUp(services.scrapingEngine);

            metrics = [
              { label: "Backend",    val: beUp ? "up" : "down" },
              { label: "Postgres",   val: pgUp ? "up" : "down" },
              { label: "Webscraping",val: wsUp ? "up" : "down" },
              { label: "Motor-base", val: seUp ? "up" : "down" },
            ];

            if (!beUp) down.push("Backend");
            if (!pgUp) down.push("Postgres");
            if (!wsUp) down.push("Webscraping");
            if (!seUp) down.push("Motor-base");

            if (!pgUp || !beUp) {
              status = "blocked";
              note   = "Serviço(s) crítico(s) down: " + down.join(", ");
            } else if (!wsUp || !seUp) {
              status = "warn";
              note   = "Serviço(s) down: " + down.join(", ");
            } else {
              status = "ok";
              note   = "";
            }
          } else if (cockpitUnavail) {
            note = "sem leitura" + (isVps ? " da VPS (configure HBX_OWNER_OPS_TOKEN)" : "");
          } else {
            note = "dados indisponíveis";
          }

          nodes.push({
            stage: "services", icon: "🧱", title: "Serviços base",
            status: status, metrics: metrics, note: note, actions: [],
          });
        })();

        /* ── 3. Fonte de busca (branches) ───────────────────────────── */
        (function () {
          var intLocal = intLocR.ok ? intLocR.data : null;
          var intVps   = intVpsR.ok ? intVpsR.data : null;

          function keyPresent(key) {
            if (isVps) {
              var vmap = intVps && intVps.items ? intVps.items : null;
              return Boolean(vmap && vmap[key] && vmap[key].present);
            }
            /* local: procura no array de integrações */
            if (!intLocal) return false;
            var list = Array.isArray(intLocal) ? intLocal
                     : (intLocal.items || intLocal.integrations || intLocal.list || []);
            return list.some(function (item) {
              return item.key === key && item.present;
            });
          }

          var gpPresent  = keyPresent("GOOGLE_PLACES_API_KEY");
          var serPresent = keyPresent("SERPER_API_KEY");

          var branches = [
            {
              cost: "free", status: "ok",
              name: "Grátis · IP residencial (searxng/Bing/DDG)",
              desc: isVps
                ? "O motor LOCAL busca pelo IP de casa — fonte grátis e durável que o IP do VPS não tem (VPS toma ban)."
                : "Sem chave de API — fonte grátis e durável. IP residencial não toma ban; é o ativo que sustenta o pipeline.",
              tokenKey: null,
            },
            {
              cost: "paid", status: gpPresent ? "ok" : "off",
              name: "Pago · Google Places (reforço)",
              desc: "Só reforço — puxa contato que falta no lead que já passou no score. Nunca metralhar buscador.",
              tokenKey: gpPresent ? null : "GOOGLE_PLACES_API_KEY",
            },
            {
              cost: "paid", status: serPresent ? "ok" : "off",
              name: "Pago · Serper (reforço)",
              desc: "Fallback quando o motor grátis não achou o contato — só no lead que passou no score.",
              tokenKey: serPresent ? null : "SERPER_API_KEY",
            },
          ];

          /* ── gauge do governor por fonte (usado/teto/período — SourceApiUsage) ──
             Só o escopo LOCAL tem leitura (backend local); a VPS degrada honesto (sem gauge). */
          var gauges = [];
          var budget = budgetR && budgetR.ok ? budgetR.data : null;
          if (budget && Array.isArray(budget.sources)) {
            var gaugeLabels = {
              brave: "Brave", google_places: "Google Places", serper: "Serper",
              brasilapi: "BrasilAPI", ddg: "DuckDuckGo", bing: "Bing", searxng: "SearXNG",
            };
            budget.sources.forEach(function (s) {
              var label = gaugeLabels[s.source] || s.source;
              var g = { label: label, tier: s.tier, text: "", pct: null, state: "ok" };
              if (s.counterError) {
                g.text = s.tier === "paid" ? "contador ilegível → PAUSADA (fail-closed)" : "contador ilegível (segue — fail-open)";
                g.state = s.tier === "paid" ? "blocked" : "warn";
              } else if (s.source === "serper") {
                g.text = s.allowed ? "liberado por env (roda no motor)" : "OFF (HBX_ENRICH_ALLOW_PAID)";
                g.state = s.allowed ? "ok" : "muted";
              } else if (s.cap != null) {
                var used = Number(s.used || 0);
                g.pct = Math.max(0, Math.min(100, Math.round((used / s.cap) * 100)));
                g.text = used.toLocaleString("pt-BR") + " / " + s.cap.toLocaleString("pt-BR")
                  + (s.period === "day" ? " hoje" : " no mês");
                g.state = g.pct >= 100 ? "blocked" : g.pct >= 70 ? "warn" : "ok";
              } else if (s.concurrencyCap != null) {
                g.text = (s.activeNow || 0) + "/" + s.concurrencyCap + " simultâneas agora · "
                  + Number(s.usedMonth || 0).toLocaleString("pt-BR") + " no mês";
                g.state = "ok";
              } else {
                g.text = Number(s.usedMonth || 0).toLocaleString("pt-BR") + " no mês"
                  + (s.minIntervalMs ? " · 1 req/" + (s.minIntervalMs / 1000) + "s" : "");
                g.state = "ok";
              }
              if (s.backoffUntil) { g.text += " · em backoff (429)"; if (g.state === "ok") g.state = "warn"; }
              gauges.push(g);
            });
          }

          nodes.push({
            stage: "source", icon: "🔎", title: "Fonte de busca · grátis primeiro, pago só reforço",
            status: "ok", metrics: [],
            note: "Grátis (IP residencial) sustenta a busca; pago (Places/Serper) entra só como reforço no lead que passou no score."
              + (gauges.length ? " Governor por fonte abaixo: pago corta duro no teto (fail-closed); grátis tem teto de concorrência." : ""),
            actions: [], branches: branches, gauges: gauges,
          });
        })();

        /* ── 4. Motores (frota) ─────────────────────────────────────── */
        (function () {
          var eng  = engR.ok ? engR.data : null;
          var envE = env ? env.engineSummary : null;
          var status = "idle";
          var note = "";
          var alive = 0, ceiling = 0;
          var metrics = [];

          if (eng && eng.ok !== false) {
            var cap = eng.capacity || {};
            alive   = cap.alive != null ? Number(cap.alive) : (Number(envE && envE.running) || 0);
            ceiling = cap.ceiling != null ? Number(cap.ceiling) : 20;
            var running = envE ? Number(envE.running || 0) : alive;
            var total   = envE ? Number(envE.total   || 0) : ceiling;
            metrics = [
              { label: "Vivos",     val: String(alive) },
              { label: "Teto",      val: String(ceiling) },
              { label: "Containers", val: running + "/" + total },
            ];
            var queue = cap.queue != null ? Number(cap.queue) : 0;
            if (alive === 0) {
              status = "blocked"; note = "Nenhum motor ativo.";
            } else if (alive < ceiling && queue > 0) {
              status = "warn"; note = alive + " de " + ceiling + " motores · " + queue + " na fila.";
            } else {
              status = "ok"; note = alive + " de " + ceiling + " motores ativos.";
            }
          } else if (eng && eng.configured === false) {
            note = "sem leitura" + (isVps ? " da VPS (configure HBX_OWNER_OPS_TOKEN)" : "");
          } else if (!engR.ok) {
            note = "erro ao ler motores";
          }

          var enginesOn = alive > 0;
          var actions = [];
          if (isVps) {
            actions = [
              enginesOn
                ? { act: "vps-engines-toggle", label: "● Ativo",      cls: "btn-red tbtn-danger", state: "on" }
                : { act: "vps-engines-toggle", label: "○ Desativado", cls: "btn-green",            state: "off" },
            ];
          } else {
            actions = [
              enginesOn
                ? { act: "engines-toggle", label: "● Ativo",      cls: "btn-red tbtn-danger", state: "on" }
                : { act: "engines-toggle", label: "○ Desativado", cls: "btn-green",            state: "off" },
            ];
          }

          /* ponte pull local↔VPS: o motor LOCAL puxa missão da fila do VPS e devolve enriquecimento.
             Conceitual (sem endpoint novo) — só deixa a narrativa da ponte visível no nó certo. */
          var bridgeNote = isVps
            ? "O VPS orquestra a fila; o motor LOCAL puxa as missões daqui (pull — sem abrir porta em casa)."
            : "Este motor puxa missão da fila do VPS pelo IP residencial e devolve o enriquecimento (pull, nunca push).";
          note = note ? (note + " · " + bridgeNote) : bridgeNote;

          nodes.push({
            stage: "engines", icon: "⚙️", title: "Motores (frota) · puxa missão do VPS",
            status: status, metrics: metrics, note: note, actions: actions,
            enginesAlive: alive,
          });
        })();

        /* ── 5. Laboratório / Fábrica ───────────────────────────────── */
        (function () {
          var fc  = factR.ok ? factR.data : null;
          var envF = env ? env.factoryCursor : null;
          var wn   = env ? env.workingNow   : null;
          var status = "idle";
          var note = "";
          var mission = "";
          var metrics = [];

          if (fc && fc.ok !== false) {
            var newHour = Number(fc.cardsSavedLastHour || 0);
            var lastSaved = Number(fc.lastSavedCount || envF && envF.lastSavedCount || 0);
            var emptyC   = Number(fc.consecutiveEmptyCount   || envF && envF.consecutiveEmptyCount   || 0);
            var failC    = Number(fc.consecutiveFailureCount || envF && envF.consecutiveFailureCount || 0);
            var reasonStopped = fc.reasonStopped || (envF && envF.reasonStopped) || "";
            var fcStatus = String(fc.status || (envF && envF.status) || "").toLowerCase();

            metrics = [
              { label: "Status",     val: tesc(fc.status || (envF && envF.status) || "—") },
              { label: "Salvos",     val: String(lastSaved) },
              { label: "Vazios",     val: String(emptyC) },
              { label: "Falhas",     val: String(failC) },
              { label: "Novos/h",    val: String(newHour) },
            ];

            var m = fc.currentMission || (envF && { city: envF.currentCity, segment: envF.currentSegment, state: envF.currentState }) || {};
            var city    = m.city    || (wn && wn.title)    || (envF && envF.currentCity)    || "";
            var segment = m.segment || (wn && wn.subtitle) || (envF && envF.currentSegment) || "";
            var uf      = m.state   || (envF && envF.currentState) || "";
            mission = [segment, city, uf].filter(Boolean).join(" · ") || "—";

            if (reasonStopped || fcStatus === "stopped") {
              status = "blocked";
              note   = reasonStopped ? ("Parado: " + reasonStopped) : "Fábrica parada.";
            } else if (failC >= 5) {
              status = "blocked"; note = failC + " falhas consecutivas.";
            } else if (emptyC >= 10) {
              status = "warn"; note = "Combo esgotado (" + emptyC + " vazios consecutivos).";
            } else if (newHour > 0 || lastSaved > 0 || fcStatus === "running") {
              status = "ok"; note = newHour > 0 ? (newHour + " cards novos/hora.") : "Rodando.";
            } else {
              status = "idle"; note = "Fábrica ociosa.";
            }
          } else if (isVps) {
            /* VPS: lê do env do cockpit */
            if (envF) {
              var ec  = Number(envF.consecutiveEmptyCount   || 0);
              var fc2 = Number(envF.consecutiveFailureCount || 0);
              var rs  = envF.reasonStopped || "";
              var st  = String(envF.status || "").toLowerCase();
              var city2    = envF.currentCity    || (wn && wn.title)    || "";
              var segment2 = envF.currentSegment || (wn && wn.subtitle) || "";
              var uf2      = envF.currentState   || "";
              mission = [segment2, city2, uf2].filter(Boolean).join(" · ") || "—";
              metrics = [
                { label: "Status",   val: tesc(envF.status || "—") },
                { label: "Salvos",   val: String(envF.lastSavedCount || 0) },
                { label: "Vazios",   val: String(ec) },
                { label: "Falhas",   val: String(fc2) },
              ];
              if (rs || st === "stopped") {
                status = "blocked"; note = rs ? ("Parado: " + rs) : "Fábrica parada.";
              } else if (fc2 >= 5) {
                status = "blocked"; note = fc2 + " falhas consecutivas.";
              } else if (ec >= 10) {
                status = "warn"; note = "Combo esgotado.";
              } else if (st === "running") {
                status = "ok"; note = "Rodando.";
              } else {
                status = "idle"; note = "Fábrica ociosa.";
              }
            } else if (cockpitUnavail) {
              note = "sem leitura da VPS (configure HBX_OWNER_OPS_TOKEN)";
            }
          } else {
            note = "dados da fábrica indisponíveis";
          }

          /* interlock visual: fábrica depende do motor — nó "engines" já foi empilhado acima */
          var enginesNode = nodes.length ? nodes[nodes.length - 1] : null;
          var enginesAliveCount = enginesNode && enginesNode.stage === "engines" ? Number(enginesNode.enginesAlive || 0) : null;
          var noEngine = !isVps && enginesAliveCount === 0;

          var factoryRunning = status === "ok" || status === "warn";

          var actions = [];
          if (!isVps) {
            actions = [
              factoryRunning
                ? { act: "factory-toggle", label: "● Ativo",      cls: "btn-red tbtn-danger", state: "on" }
                : { act: "factory-toggle", label: "○ Desativado", cls: "btn-green",            state: "off", disabled: noEngine },
              { act: "factory-next",   label: "⏭ Próxima missão", cls: "btn-blue" },
              { act: "factory-purge",  label: "🧹 Limpar fila morta", cls: "btn-amber" },
            ];
          }
          var vpsNote = isVps
            ? "A fábrica do VPS se controla pela frota (acima) e pelo enriquecedor (abaixo)."
            : (noEngine ? "Depende do motor — ligue a frota acima para destravar a fábrica." : note);

          nodes.push({
            stage: "factory", icon: "🏭", title: "Laboratório / Fábrica",
            status: noEngine ? "blocked" : status, metrics: metrics,
            note: vpsNote,
            mission: mission,
            actions: actions,
          });
        })();

        /* ── 6. Enriquecimento (branches + toggles) ─────────────────── */
        (function () {
          var enr = enrichR.ok ? enrichR.data : null;
          var intLocal = intLocR.ok ? intLocR.data : null;
          var intVps   = intVpsR.ok ? intVpsR.data : null;

          /* ESTOQUE PRA PUXAR/ENRIQUECER: total de leads no VPS × pendentes de enriquecimento.
             vpsTotal vem do enricher (pendentes de enriquecimento); leadsR (aba VPS) é o total do banco.
             Só temos o "total do banco" com certeza no escopo VPS — no local mostramos honesto ("—"). */
          var enrVpsPending = enr && enr.vpsTotal != null ? Number(enr.vpsTotal) : null;
          var leadsTotal = (isVps && leadsR && leadsR.ok && leadsR.data && leadsR.data.total != null)
                             ? Number(leadsR.data.total) : null;
          var estoquePartes = [];
          estoquePartes.push("Estoque VPS: " + (leadsTotal != null ? leadsTotal.toLocaleString("pt-BR") : "—") + " leads");
          estoquePartes.push("pendentes de enriquecimento: " + (enrVpsPending != null ? enrVpsPending.toLocaleString("pt-BR") : "—"));
          var estoqueNote = estoquePartes.join(" · ") + " — puxa e enriquece do SEU IP (local) → salva de volta no VPS.";

          function keyPresent2(key) {
            if (isVps) { var vm = intVps && intVps.items ? intVps.items : null; return Boolean(vm && vm[key] && vm[key].present); }
            if (!intLocal) return false;
            var list = Array.isArray(intLocal) ? intLocal
                     : (intLocal.items || intLocal.integrations || intLocal.list || []);
            return list.some(function (i) { return i.key === key && i.present; });
          }

          var bravePresent  = keyPresent2("BRAVE_SEARCH_API_KEY");
          var serper2Present = keyPresent2("SERPER_API_KEY");
          var labUp = enr ? Boolean(enr.labUp) : false;
          var running = enr ? Boolean(enr.running) : false;
          var phase   = enr ? (enr.phase || "") : "";
          var metrics2 = [];
          var hasError = enr && enr.error;

          /* estoque em DESTAQUE como 1ª métrica (o que dá pra puxar/enriquecer agora) */
          metrics2.push({ label: "Estoque VPS", val: leadsTotal != null ? leadsTotal.toLocaleString("pt-BR") : "—", hi: true });
          metrics2.push({ label: "Pendentes p/ enriquecer", val: enrVpsPending != null ? enrVpsPending.toLocaleString("pt-BR") : "—", hi: true });

          if (enr && enr.metrics) {
            var m = enr.metrics;
            metrics2 = metrics2.concat([
              { label: "Varridos",   val: String(m.cardsScanned  || 0) },
              { label: "Sites",      val: String(m.sitesCrawled  || 0) },
              { label: "E-mails",    val: String(m.emailsFound   || 0) },
              { label: "Telefones",  val: String(m.phonesFound   || 0) },
              { label: "CNPJ",       val: String(m.cnpjsFound    || 0) },
              { label: "Aplicados",  val: String(m.applied       || 0) },
            ]);
            if (phase) metrics2.push({ label: "Fase", val: tesc(phase) });
          }

          var enrStatus = "idle";
          if (hasError) {
            enrStatus = "blocked";
          } else if (running) {
            enrStatus = "ok";
          } else if (enr && enr.types && enr.types.scraper && !labUp) {
            enrStatus = "warn";
          }

          var enrBranches = [
            {
              cost: "free",
              status: bravePresent ? "ok" : "off",
              name: "Tipo 1 · identidade (CNPJ→dono, telefone)",
              desc: "Base rica grátis: Brave descobre CNPJ e dono. Serper só como reforço pago quando falta contato.",
              tokenSlots: [
                {
                  key: "BRAVE_SEARCH_API_KEY",
                  label: "Brave Search API Key",
                  present: bravePresent,
                },
                {
                  key: "SERPER_API_KEY",
                  label: "Serper (upgrade pago)",
                  present: serper2Present,
                },
              ],
            },
            {
              cost: "paid",
              status: labUp ? "ok" : "off",
              name: "Tipo 2 · caça e-mail (crawl pelo IP residencial via Local Lab)",
              desc: "Rasteja o site das empresas pelo IP de casa buscando e-mails — requer Lab ligado.",
              tokenSlots: [],
            },
          ];

          /* toggles */
          var toggles = [
            { key: "identity",   label: "Tipo 1", checked: enr && enr.types ? Boolean(enr.types.identity)   : true },
            { key: "scraper",    label: "Tipo 2", checked: enr && enr.types ? Boolean(enr.types.scraper)    : true },
            { key: "aggressive", label: "Agressivo", checked: enr ? Boolean(enr.aggressive) : false },
          ];

          nodes.push({
            stage: "enrichment", icon: "✨", title: "Enriquecimento · puxa estoque do VPS & enriquece (local→VPS)",
            status: enrStatus,
            metrics: metrics2,
            note: hasError ? ("Erro: " + tesc(enr.error))
                : (running ? (estoqueNote + " · Rodando · fase " + tesc(phase) + " — coleta o contato bruto que o Cérebro IA (abaixo) vai sanear e pontuar.")
                           : (estoqueNote + " · O botão \"Puxar & enriquecer\" liga o worker que puxa o card do VPS, crawleia do seu IP e salva de volta.")),
            actions: [
              { act: "lab-toggle",     label: labUp ? "⏹ Desligar Lab" : "▶ Lab on", cls: "btn-blue" },
              { act: "enricher-toggle", label: running ? "⏸ Parar enriquecedor" : "▶ Puxar & enriquecer (local→VPS)", cls: running ? "btn-red" : "btn-green" },
            ],
            branches: enrBranches,
            toggles: toggles,
          });
        })();

        /* ── 6.5 Cérebro IA (a PONTE) ───────────────────────────────────
           2 modelos: 30B LOCAL (batch pesado quando o PC está ON) e 7B VPS
           (realtime + fallback). O túnel Tailscale + heartbeat AINDA NÃO existe
           (PR4, sessão conjunta ao vivo) → o nó degrada gracioso: NÃO inventa
           endpoint nem métrica; se não há sinal de modelo, mostra o estado
           honesto "aguardando túnel/heartbeat (PR4)". Sem ação/botão (nenhuma
           rota nova no backend). */
        (function () {
          /* AGORA COM SINAL REAL: /owner/ai/status lê o Ollama LOCAL (127.0.0.1:11434).
             É LOCAL — só o escopo local tem aiR de verdade; o VPS mostra a nota honesta do PR4.
             Degrade gracioso: Ollama off → ai=null → branches caem p/ "ausente/aguardando". */
          var ai = aiR && aiR.ok ? aiR.data : null;
          var ollamaUp = Boolean(ai && ai.ollamaUp);

          /* helper: acha o modelo pelo prefixo do nome dentro de ai.models */
          function aiModelInfo(prefix) {
            if (!ai || !Array.isArray(ai.models)) return null;
            for (var i = 0; i < ai.models.length; i++) {
              var mm = ai.models[i];
              if (mm && mm.name && (mm.name === prefix || mm.name.indexOf(prefix) === 0)) return mm;
            }
            return null;
          }
          var info30 = aiModelInfo("qwen3:30b-a3b");
          var info7  = aiModelInfo("qwen2.5:7b");
          var has30  = Boolean(ai ? ai.has30b : false) || Boolean(info30);
          var warm30 = Boolean(ai ? ai.warm30b : false) || Boolean(info30 && info30.warm);
          var has7   = Boolean(ai ? ai.has7b : false) || Boolean(info7);
          var warm7  = Boolean(ai ? ai.warm7b : false) || Boolean(info7 && info7.warm);
          var size30 = info30 && info30.sizeGb != null ? (info30.sizeGb + " GB") : "";
          var size7  = info7  && info7.sizeGb  != null ? (info7.sizeGb  + " GB") : "";

          /* rótulo de estado do 30B (🔵 presente/frio · 🟢 quente · ⚪ ausente) */
          function brainStateLabel(present, warm) {
            if (warm) return "🟢 quente";
            if (present) return "🔵 presente (frio)";
            return "⚪ ausente";
          }

          /* branch do 30B LOCAL — status/desc guiados pelo sinal REAL do Ollama */
          var branch30status = warm30 ? "ok" : (has30 ? "idle" : "off");
          var branch30desc;
          if (warm30) {
            branch30desc = "🟢 QUENTE" + (size30 ? " (" + size30 + ")" : "") + " — pronto p/ sanear nome+segmento, extrair e-mail/tel/dono, dar nota ICP e escrever a 1ª msg.";
          } else if (has30) {
            branch30desc = "🔵 presente e FRIO" + (size30 ? " (" + size30 + ")" : "") + " — clique \"Aquecer 30B\" p/ carregar na RAM (leva ~12min em CPU). Depois roda batch pesado com o PC ON.";
          } else if (ollamaUp) {
            branch30desc = "⚪ ausente no Ollama — baixe o modelo qwen3:30b-a3b p/ habilitar o batch pesado local.";
          } else {
            branch30desc = "Ollama local off — não deu p/ ler o modelo. Suba o Ollama (127.0.0.1:11434) p/ ver o 30B.";
          }

          var branch7status = warm7 ? "ok" : (has7 ? "idle" : "off");
          var branch7desc;
          if (warm7) {
            branch7desc = "🟢 quente" + (size7 ? " (" + size7 + ")" : "") + " — realtime do cliente e fallback quando o PC está OFF.";
          } else if (has7) {
            branch7desc = "🔵 presente" + (size7 ? " (" + size7 + ")" : "") + " — realtime do cliente + fallback (leve, sobe rápido).";
          } else if (ollamaUp) {
            branch7desc = "⚪ ausente no Ollama — modelo leve p/ realtime + fallback.";
          } else {
            branch7desc = "Ollama local off. Realtime do cliente + fallback quando o PC está OFF.";
          }

          var brainBranches = [
            {
              cost: "free",
              status: branch30status,
              name: "30B LOCAL · qwen3:30b-a3b · " + brainStateLabel(has30, warm30) + (size30 ? " · " + size30 : ""),
              desc: branch30desc,
              tokenSlots: [],
            },
            {
              cost: "paid",
              status: branch7status,
              name: "7B · qwen2.5:7b · " + brainStateLabel(has7, warm7) + (size7 ? " · " + size7 : ""),
              desc: branch7desc,
              tokenSlots: [],
            },
          ];

          /* AÇÃO: aquecer 30B (só faz sentido no escopo local, onde o Ollama vive).
             Quando quente, vira um botão "✓ 30B quente" desabilitado (sem re-disparar). */
          var brainActions = [];
          if (!isVps) {
            if (warm30) {
              brainActions.push({ act: "ai-warm-30b", label: "✓ 30B quente", cls: "btn-green", state: "warm", disabled: true });
            } else if (has30) {
              brainActions.push({ act: "ai-warm-30b", label: "🔥 Aquecer 30B", cls: "btn-amber" });
            }
          }

          /* estado do nó: honesto. Quente = ok; presente-frio = warn (dá p/ aquecer);
             ausente/off = idle. Nunca "blocked" (não está quebrado, só não plugado). */
          var brainStatus;
          if (warm30 || warm7) brainStatus = "ok";
          else if (has30 || has7) brainStatus = "warn";
          else brainStatus = "idle";

          var liveLine;
          if (isVps) {
            liveLine = "O Cérebro IA roda na SUA MÁQUINA (Ollama local) — veja o status ao vivo na coluna da esquerda.";
          } else if (!ollamaUp) {
            liveLine = "Ollama local off (127.0.0.1:11434) — suba p/ ver 30B/7B ao vivo.";
          } else {
            liveLine = "Ollama ON · 30B " + brainStateLabel(has30, warm30) + " · 7B " + brainStateLabel(has7, warm7) + ".";
          }
          var brainNote = liveLine
            + " Status do MODELO já é ao vivo; o roteador 30B↔7B + túnel/heartbeat (PR4) ainda NÃO está plugado — sessão conjunta ao vivo.";

          nodes.push({
            stage: "brain", icon: "🧠", title: "Cérebro IA · saneia · extrai · nota ICP · escreve msg",
            status: brainStatus,
            metrics: [],
            note: brainNote,
            branches: brainBranches,
            actions: brainActions,
          });
        })();

        /* ── 7. Resultado final · banco de leads ────────────────────── */
        (function () {
          var leads = leadsR.ok ? leadsR.data : null;
          var total = 0, today = 0;
          var status = "idle";
          var note = "";

          if (leads && (leads.total != null || leads.ok)) {
            total = Number(leads.total || 0);
            today = Number(leads.deltaToday || leads.today || 0);
            status = total > 0 ? "ok" : "idle";
            note   = today > 0 ? ("+" + today + " hoje") : "sem novos hoje";
          } else if (!leadsR.ok) {
            note = "erro ao ler banco";
          }

          nodes.push({
            stage: "result", icon: "🎯", title: "Resultado final · card na ordem da nota ICP",
            status: status,
            metrics: [
              { label: "Total",      val: total.toLocaleString("pt-BR") },
              { label: "Novos hoje", val: String(today) },
            ],
            note: note ? (note + " · card pronto após validação WhatsApp, ordenado pela nota ICP.")
                       : "Card pronto após validação WhatsApp, ordenado pela nota ICP.",
            actions: [
              { act: "result-reload", label: "↺ Reler contagem", cls: "btn-blue" },
            ],
          });
        })();

        /* ── regra de flow: 1º blocked → abaixo todos stopped ───────── */
        var foundBlocked = false;
        nodes.forEach(function (n) {
          if (foundBlocked) {
            n.flow = "stopped";
          } else {
            n.flow = "on";
            if (n.status === "blocked") foundBlocked = true;
          }
        });

        /* ── render (só se ainda for o load mais recente DESTE escopo — evita um load antigo
           pintar por cima de um mais novo do MESMO lado; local e vps nunca se pisam pq
           cada um tem seu próprio elemento e seq) ── */
        if (mySeq !== st.seq) return;
        renderNodes(nodes, flow);

        /* timestamp: um relógio só, atualizado pelo escopo que terminar por último */
        var gen = document.getElementById("tree-generated");
        if (gen) {
          var now = new Date();
          gen.textContent = "atualizado às " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        }
      })
      .catch(function () { /* safe() já blinda cada fetch; rede dura aqui não derruba a guia */ })
      .finally(function () { st.loading = false; });
  }

  /* ── renderNodes ───────────────────────────────────────────────────── */
  function renderNodes(nodes, flow) {
    if (!flow) return;

    var html = "";
    nodes.forEach(function (n) {
      html += renderNode(n);
    });
    flow.innerHTML = html;
  }

  function renderNode(n) {
    var metricsHtml = "";
    if (n.metrics && n.metrics.length) {
      metricsHtml = '<div class="tnode-metrics">'
        + n.metrics.map(function (m) {
            return '<div class="tnode-metric' + (m.hi ? ' tnode-metric--hi' : '') + '"><span class="tm-label">' + tesc(m.label) + '</span><strong class="tm-val">' + tesc(m.val) + '</strong></div>';
          }).join("")
        + "</div>";
    }

    var noteHtml = n.note
      ? '<p class="tnode-note">' + tesc(n.note) + "</p>"
      : "";

    /* gauges do governor por fonte (usado/teto) — barra só quando existe teto numérico */
    var gaugesHtml = "";
    if (n.gauges && n.gauges.length) {
      gaugesHtml = '<div class="tgauges">'
        + n.gauges.map(function (g) {
            var bar = g.pct != null
              ? '<span class="tgauge-bar"><span class="tgauge-fill" style="width:' + Math.max(2, g.pct) + '%"></span></span>'
              : "";
            return '<div class="tgauge" data-state="' + tesc(g.state) + '" data-tier="' + tesc(g.tier) + '">'
              + '<span class="tgauge-name">' + tesc(g.label) + '</span>'
              + bar
              + '<span class="tgauge-text">' + tesc(g.text) + '</span>'
              + "</div>";
          }).join("")
        + "</div>";
    }

    var missionHtml = n.mission
      ? '<div class="tnode-mission">' + tesc(n.mission) + "</div>"
      : "";

    var branchesHtml = "";
    if (n.branches && n.branches.length) {
      branchesHtml = '<div class="tnode-branches">'
        + n.branches.map(renderBranch).join("")
        + "</div>";
    }

    var togglesHtml = "";
    if (n.toggles && n.toggles.length) {
      togglesHtml = '<div class="tnode-toggles">'
        + n.toggles.map(function (t) {
            return '<label class="ttoggle"><input type="checkbox" data-enr="' + tesc(t.key) + '"'
              + (t.checked ? " checked" : "") + ' /> ' + tesc(t.label) + "</label>";
          }).join("")
        + "</div>";
    }

    var actionsHtml = "";
    if ((n.actions && n.actions.length) || togglesHtml) {
      actionsHtml = '<div class="tnode-actions">'
        + togglesHtml
        + (n.actions ? n.actions.map(function (a) {
            return '<button class="btn btn-sm ' + tesc(a.cls) + '" data-act="' + tesc(a.act) + '"'
              + (a.state ? ' data-state="' + tesc(a.state) + '"' : '')
              + (a.disabled ? ' disabled title="depende do motor — ligue a frota primeiro"' : '')
              + '>' + tesc(a.label) + "</button>";
          }).join("") : "")
        + '<span class="tbtn-result"></span>'
        + "</div>";
    }

    return '<div class="tree-node" data-stage="' + tesc(n.stage)
      + '" data-status="' + tesc(n.status)
      + '" data-flow="' + tesc(n.flow || "on") + '">'
      + '<div class="tnode">'
      + '<div class="tnode-head">'
      + '<span class="tnode-icon">' + tesc(n.icon) + '</span>'
      + '<h3 class="tnode-title">' + tesc(n.title) + '</h3>'
      + (n.badge ? '<span class="tnode-badge">' + tesc(n.badge) + '</span>' : '')
      + '</div>'
      + metricsHtml
      + missionHtml
      + noteHtml
      + gaugesHtml
      + branchesHtml
      + actionsHtml
      + '</div>'
      + '</div>';
  }

  function renderBranch(b) {
    var pillCls = b.status === "ok" ? "pill-ok"
                : b.status === "off" ? "pill-muted"
                : b.status === "idle" ? "pill-muted"
                : "pill-amber";
    var pillTxt = b.status === "ok" ? "ativo"
                : b.status === "off" ? "sem chave"
                : b.status === "idle" ? "aguardando"
                : "atenção";

    var tokenSlotsHtml = "";
    if (b.tokenSlots && b.tokenSlots.length) {
      tokenSlotsHtml = b.tokenSlots.map(function (ts) {
        if (ts.present) return "";
        return '<div class="tbranch-token">'
          + '<input class="tree-token-input" data-key="' + tesc(ts.key) + '" placeholder="' + tesc(ts.label + "…") + '" autocomplete="off" />'
          + '<button class="btn btn-sm btn-green tree-token-save" data-key="' + tesc(ts.key) + '">Salvar na VPS</button>'
          + '<span class="tbtn-result" data-key="' + tesc(ts.key) + '"></span>'
          + "</div>";
      }).join("");
    }

    /* token slot antigo (campo tokenKey, branches de source) */
    if (b.tokenKey && !tokenSlotsHtml) {
      tokenSlotsHtml = '<div class="tbranch-token">'
        + '<input class="tree-token-input" data-key="' + tesc(b.tokenKey) + '" placeholder="colar chave da API…" autocomplete="off" />'
        + '<button class="btn btn-sm btn-green tree-token-save" data-key="' + tesc(b.tokenKey) + '">Salvar na VPS</button>'
        + '<span class="tbtn-result" data-key="' + tesc(b.tokenKey) + '"></span>'
        + "</div>";
    }

    return '<div class="tbranch" data-cost="' + tesc(b.cost) + '" data-status="' + tesc(b.status) + '">'
      + '<div class="tbranch-head">'
      + '<span class="tbranch-name">' + tesc(b.name) + '</span>'
      + '<span class="pill ' + pillCls + '">' + pillTxt + '</span>'
      + '</div>'
      + '<p class="tbranch-desc">' + tesc(b.desc) + '</p>'
      + tokenSlotsHtml
      + '</div>';
  }

  /* ── delegação de eventos em #guide-tree (pai comum às DUAS colunas) ── */
  function initEventDelegation() {
    var root = document.getElementById("guide-tree");
    if (!root) return;

    /* click em [data-act] */
    root.addEventListener("click", function (e) {
      /* tree-token-save */
      var saveBtn = e.target.closest(".tree-token-save");
      if (saveBtn) {
        handleTokenSave(saveBtn);
        return;
      }

      var actBtn = e.target.closest("[data-act]");
      if (!actBtn) return;
      handleAct(actBtn);
    });

    /* change em [data-enr] */
    root.addEventListener("change", function (e) {
      var cb = e.target.closest("[data-enr]");
      if (cb) { /* estado atualizado; próxima ação de toggle lerá os checkboxes */ }
    });
  }

  /* qual coluna (local/vps) contém este elemento — deriva da .tree-split-col ancestral */
  function scopeOf(el) {
    var col = el.closest("[data-scope]");
    return col ? col.dataset.scope : "local";
  }

  function getResultEl(btn) {
    /* Procura .tbtn-result mais próximo dentro do mesmo .tnode-actions */
    var parent = btn.closest(".tnode-actions") || btn.closest(".tbranch-token");
    return parent ? parent.querySelector(".tbtn-result") : null;
  }

  function handleTokenSave(btn) {
    var key = btn.dataset.key;
    var slot = btn.closest(".tbranch-token") || btn.closest(".tnode-actions");
    var input = slot ? slot.querySelector(".tree-token-input[data-key='" + key + "']") : null;
    var resultEl = slot ? slot.querySelector(".tbtn-result[data-key='" + key + "']") || slot.querySelector(".tbtn-result") : null;

    if (!input || !input.value.trim()) {
      if (resultEl) tbtnResult(resultEl, false, "cole a chave");
      if (input) input.focus();
      return;
    }

    if (!confirm("Salvar \"" + key + "\" na VPS?\n\nIsso grava no .env do VPS e recria o backend — leva alguns segundos.")) return;

    btn.disabled = true;
    if (resultEl) { resultEl.textContent = "…"; resultEl.className = "tbtn-result"; }

    tapi("POST", "/owner/integrations/set", { key: key, value: input.value.trim() }, 60000)
      .then(function () {
        if (resultEl) tbtnResult(resultEl, true, "");
        input.value = "";
        setTimeout(function () { loadTree(); }, 2000);
      })
      .catch(function (err) {
        if (resultEl) tbtnResult(resultEl, false, err.message);
      })
      .finally(function () { btn.disabled = false; });
  }

  function handleAct(btn) {
    var act = btn.dataset.act;
    var resultEl = getResultEl(btn);

    /* result-reload: re-fetch apenas leads — só recarrega a coluna do botão clicado */
    if (act === "result-reload") {
      btn.disabled = true;
      if (resultEl) { resultEl.textContent = "…"; resultEl.className = "tbtn-result"; }
      var scope = scopeOf(btn);
      var isVps = scope === "vps";
      tapi("GET", isVps ? "/owner/vps/leads" : "/owner/leads-bank")
        .then(function () { if (resultEl) tbtnResult(resultEl, true, ""); setTimeout(function () { loadScope(scope, true); }, 2500); })
        .catch(function (e) { if (resultEl) tbtnResult(resultEl, false, e.message); })
        .finally(function () { btn.disabled = false; });
      return;
    }

    /* botão de estado único travado pelo interlock (fábrica sem motor) */
    if (btn.disabled) return;

    /* destrutivos que pedem confirm */
    if (act === "vps-engines-stop" || (act === "vps-engines-toggle" && btn.dataset.state === "on")) {
      if (!confirm("⏸ Parar TODA a frota de motores do VPS (produção)?\n\nIsso para todos os motores da fila no servidor.")) return;
    }

    btn.disabled = true;
    if (resultEl) { resultEl.textContent = "…"; resultEl.className = "tbtn-result"; }

    var p = dispatchAct(act, btn);
    p.then(function () {
      if (resultEl) tbtnResult(resultEl, true, "");
      setTimeout(function () { loadTree(true); }, 2500);
    })
    .catch(function (e) {
      if (resultEl) tbtnResult(resultEl, false, e.message);
    })
    .finally(function () { btn.disabled = false; });
  }

  function dispatchAct(act, btn) {
    switch (act) {
      case "engines-up":
        return tapi("POST", "/owner/engines/up", {});

      case "engines-down":
        return tapi("POST", "/owner/engines/down", {});

      case "vps-engines-start":
        return tapi("POST", "/owner/vps/engines/start", { from: 1, to: 20 });

      case "vps-engines-stop":
        return tapi("POST", "/owner/vps/engines/stop", { confirm: true, from: 1, to: 20 });

      case "engines-toggle":
        /* botão de estado único: data-state="on" → motores vivos → ação é DESLIGAR; "off" → LIGAR */
        return tapi("POST", btn.dataset.state === "on" ? "/owner/engines/down" : "/owner/engines/up", {});

      case "vps-engines-toggle":
        return tapi("POST", btn.dataset.state === "on" ? "/owner/vps/engines/stop" : "/owner/vps/engines/start",
          btn.dataset.state === "on" ? { confirm: true, from: 1, to: 20 } : { from: 1, to: 20 });

      case "factory-resume":
        return tapi("POST", "/owner/factory/resume", {});

      case "factory-stop":
        return tapi("POST", "/owner/factory/stop", {});

      case "factory-toggle":
        /* botão de estado único: data-state="on" → fábrica rodando → ação é PARAR; "off" → LIGAR */
        return tapi("POST", btn.dataset.state === "on" ? "/owner/factory/stop" : "/owner/factory/resume", {});

      case "factory-next":
        return tapi("POST", "/owner/factory/force-next", {});

      case "factory-purge":
        return tapi("POST", "/owner/factory/purge-dead-queue", {});

      case "lab-toggle": {
        /* Lab é conceito só-local, mas o nó "Enriquecimento" é renderizado nas DUAS colunas
           (mira o VPS a partir da máquina local) — decide on/off lendo o botão QUE FOI CLICADO,
           não um #tree-flow único que não existe mais. */
        var labLabel = btn ? btn.textContent : "";
        /* heurística: se label diz "Desligar", labUp=true */
        var labUp = labLabel.indexOf("Desligar") !== -1;
        return tapi("POST", labUp ? "/local-lab/stop" : "/local-lab/start", {});
      }

      case "enricher-toggle": {
        /* lê estado atual do botão */
        var enrichBtn = btn;
        var isRunning = enrichBtn.classList.contains("btn-red");
        if (isRunning) {
          return tapi("POST", "/owner/enricher/stop", {});
        } else {
          /* lê checkboxes data-enr da MESMA coluna do botão clicado (o nó existe nas duas) */
          var actionsBox = btn.closest(".tnode-actions");
          var cbId  = actionsBox ? actionsBox.querySelector("[data-enr='identity']")   : null;
          var cbSc  = actionsBox ? actionsBox.querySelector("[data-enr='scraper']")    : null;
          var cbAg  = actionsBox ? actionsBox.querySelector("[data-enr='aggressive']") : null;
          return tapi("POST", "/owner/enricher/start", {
            identity:   cbId ? cbId.checked   : true,
            scraper:    cbSc ? cbSc.checked   : true,
            aggressive: cbAg ? cbAg.checked   : false,
          });
        }
      }

      case "ai-warm-30b":
        /* aquece o 30B local (fire-and-forget no server; a resposta volta na hora).
           timeout curto — o server NÃO bloqueia esperando o modelo carregar. */
        return tapi("POST", "/owner/ai/warm", { model: "qwen3:30b-a3b" }, 15000);

      default:
        return Promise.reject(new Error("ação desconhecida: " + act));
    }
  }

  /* ── init ──────────────────────────────────────────────────────────── */
  function init() {
    /* garante body com data-guide="panel" se não tiver */
    if (!document.body.dataset.guide) document.body.dataset.guide = "panel";

    /* listeners da nav principal */
    var gPanel = document.getElementById("gnav-panel");
    var gTree  = document.getElementById("gnav-tree");
    if (gPanel) gPanel.addEventListener("click", function () { setGuide("panel"); });
    if (gTree)  gTree.addEventListener("click",  function () { setGuide("tree");  });

    /* scope tabs e refresh button */
    initScopeTabs();

    /* delegação de eventos na árvore */
    initEventDelegation();

    /* garante estado inicial: painel visível, árvore oculta */
    var panel = document.getElementById("guide-panel");
    var tree  = document.getElementById("guide-tree");
    if (panel) panel.hidden = false;
    if (tree)  tree.hidden  = true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
