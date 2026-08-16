/* screens/live.js — LiveFreeActivity: player ao vivo em tela cheia, lista de canais (OK/lista),
 * EPG na infobar, troca por Ch+/Ch- e números. */
(function () {
  var channels = [], idx = 0, listOpen = false, infoTimer = null;

  Router.register('live', {
    render: function () {
      return '<div class="screen" id="lv">' +
        '<div class="live-list" id="lv-list"></div>' +
        '<div class="infobar" id="lv-info"><div class="ch" id="lv-ch">—</div><div class="prog" id="lv-prog"></div></div>' +
        '</div>';
    },
    mounted: function () {
      LiveApi.channels('all').then(function (list) {
        channels = list; buildList(); tune(0); openList(true);
      });
    },
    onLeave: function () { Player.stop(); clearTimeout(infoTimer); },
    onBack: function () { if (listOpen) { openList(false); return true; } return false; },
    onKey: function (a) {
      if (a === 'chup') { tune((idx + 1) % channels.length); return true; }
      if (a === 'chdown') { tune((idx - 1 + channels.length) % channels.length); return true; }
      if (a === 'info') { showInfo(); return true; }
      if (a === 'red') { openList(!listOpen); return true; }
      if (listOpen) {
        if (a === 'left') { openList(false); return true; }
        return false; // deixa o foco navegar a lista
      } else {
        if (a === 'right' || a === 'enter' || a === 'up' || a === 'down') { openList(true); return true; }
      }
      return false;
    }
  });

  function buildList() {
    var host = document.getElementById('lv-list');
    host.innerHTML = '';
    channels.forEach(function (c, i) {
      var el = document.createElement('div');
      el.className = 'chan focusable';
      el.innerHTML = '<div class="num">' + c.num + '</div><div><div class="cname">' + UI.esc(c.name) + '</div><div class="now">' + UI.esc(c.now || '') + '</div></div>';
      el._onEnter = function () { tune(i); openList(false); };
      host.appendChild(el);
    });
  }

  function openList(open) {
    listOpen = open;
    document.getElementById('lv-list').classList.toggle('open', open);
    if (open) { Focus.refresh('.chan'); var el = document.querySelectorAll('.chan')[idx]; if (el) Focus.setFocus(el); }
    else { Focus.clear(); }
  }

  function tune(i) {
    idx = i; var c = channels[i]; if (!c) return;
    document.getElementById('lv-ch').textContent = c.num + '  ' + c.name;
    LiveApi.playUrl(c.id).then(function (r) {
      Player.open(r.url, {
        onready: function () { showInfo(); },
        onbuffer: function (on) { if (on) document.getElementById('lv-prog').textContent = 'Sintonizando…'; },
        onerror: function (e) { document.getElementById('lv-prog').textContent = 'Erro no canal: ' + e; }
      });
    });
    LiveApi.epg(c.id).then(function (epg) {
      var now = epg[0]; document.getElementById('lv-prog').textContent = now ? (now.start + ' ' + now.title) : 'Sem EPG';
    });
  }

  function showInfo() {
    document.getElementById('lv-info').classList.remove('hidden');
    clearTimeout(infoTimer);
    infoTimer = setTimeout(function () { document.getElementById('lv-info').classList.add('hidden'); }, 4000);
  }
})();
