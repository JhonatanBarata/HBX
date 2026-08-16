/* screens/vod-player.js — player de VOD com AVPlay + menu (áudio/legenda/qualidade/razão).
 * Espelha o player do app: MENU/long-OK abre opções; setas fazem seek; barra de progresso. */
(function () {
  var duration = 0, position = 0, seeking = false, hideTimer = null, menuOpen = false;

  Router.register('vod-player', {
    render: function () {
      return '<div class="screen" id="vp">' +
        '<div class="infobar" id="vp-info"><div class="ch" id="vp-title"></div><div class="prog" id="vp-sub">Carregando…</div></div>' +
        '<div class="pbar" id="vp-bar"><div class="track"><div class="fill" id="vp-fill"></div></div>' +
          '<div class="time"><span id="vp-cur">00:00</span> / <span id="vp-dur">00:00</span> &nbsp;·&nbsp; [MENU] opções · ◀▶ avançar/retroceder · OK pausar</div></div>' +
        '<div class="pmenu" id="vp-menu"></div>' +
        '</div>';
    },
    mounted: function (p) {
      var d = p.vod, ep = p.episode;
      document.getElementById('vp-title').textContent = d.title + (ep ? ' — E' + ep.ep : '');
      VodApi.playUrl(d.id, ep && ep.id, Store.settings.quality || 'Auto').then(function (r) {
        Player.open(r.url, {
          onready: function (dur) { duration = dur; document.getElementById('vp-dur').textContent = UI.fmtTime(dur / 1000); document.getElementById('vp-sub').textContent = 'Reproduzindo'; buildMenu(d); autohide(); },
          ontime: function (ms, dur) { if (!seeking) { position = ms; duration = dur || duration; updateBar(); } },
          onbuffer: function (on) { document.getElementById('vp-sub').textContent = on ? 'Buffering…' : 'Reproduzindo'; },
          onend: function () { Router.back(); },
          onerror: function (e) { document.getElementById('vp-sub').textContent = 'Erro: ' + e + ' (tente trocar o player/qualidade no MENU).'; }
        });
      });
    },
    onLeave: function () { Player.stop(); clearTimeout(hideTimer); },
    onBack: function () { if (menuOpen) { toggleMenu(false); return true; } return false; },
    onKey: function (a) {
      showControls();
      if (menuOpen) return false; // dentro do menu, foco padrão navega
      switch (a) {
        case 'enter': case 'playpause': Player.togglePause(); return true;
        case 'left': case 'rewind': Player.jump(-10); flash('-10s'); return true;
        case 'right': case 'forward': Player.jump(10); flash('+10s'); return true;
        case 'up': case 'info': showControls(); return true;
        case 'down': toggleMenu(true); return true;
        case 'stop': Router.back(); return true;
      }
      return false;
    }
  });

  function updateBar() {
    document.getElementById('vp-fill').style.width = (duration ? (position / duration * 100) : 0) + '%';
    document.getElementById('vp-cur').textContent = UI.fmtTime(position / 1000);
  }
  function flash(txt) { document.getElementById('vp-sub').textContent = txt; }
  function showControls() {
    document.getElementById('vp-info').classList.remove('hidden');
    document.getElementById('vp-bar').classList.remove('hidden');
    autohide();
  }
  function autohide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (menuOpen) return;
      document.getElementById('vp-info').classList.add('hidden');
      document.getElementById('vp-bar').classList.add('hidden');
    }, 4000);
  }

  function toggleMenu(open) {
    menuOpen = open;
    document.getElementById('vp-menu').classList.toggle('open', open);
    if (open) { clearTimeout(hideTimer); Focus.refresh('#vp-menu .opt'); }
  }

  function buildMenu(d) {
    _actions = []; // reseta ações a cada abertura do player
    var tracks = Player.getTracks();
    var html = '<h3>Opções</h3>';
    html += group('Qualidade', (d.qualities || ['Auto']).map(function (q) { return { label: q, act: function () { UI.toast('Qualidade: ' + q); } }; }));
    html += group('Áudio', (tracks.audio.length ? tracks.audio : [{ label: 'Padrão', index: 0 }]).map(function (t) {
      return { label: t.label, act: function () { Player.selectAudio(t.index); UI.toast('Áudio: ' + t.label); } };
    }));
    html += group('Legenda', [{ label: 'Desligar', act: function () { Player.selectText(-1); } }].concat(
      (tracks.text.length ? tracks.text : (d.subtitles || []).map(function (s, i) { return { label: s.label, index: i }; })).map(function (t) {
        return { label: t.label, act: function () { Player.selectText(t.index); UI.toast('Legenda: ' + t.label); } };
      })));
    html += group('Proporção', ['auto', 'original', 'fit'].map(function (r) { return { label: r, act: function () { Player.setRatio(r); UI.toast('Proporção: ' + r); } }; }));
    var menu = document.getElementById('vp-menu');
    menu.innerHTML = html;
    var opts = menu.querySelectorAll('.opt');
    // liga ações
    _actions.forEach(function (fn, i) { if (opts[i]) opts[i]._onEnter = fn; });
  }

  var _actions = [];
  function group(title, items) {
    var h = '<div style="color:#9ab;font-size:22px;margin:18px 0 8px">' + title + '</div>';
    items.forEach(function (it) { _actions.push(it.act); h += '<div class="opt focusable">' + UI.esc(it.label) + '</div>'; });
    return h;
  }
})();
