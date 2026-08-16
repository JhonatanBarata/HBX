/* screens/settings.js — SettingsActivity: idioma, proporção, player, legenda, cache, sobre. */
(function () {
  var LANGS = ['pt', 'en', 'es', 'fr'];
  var RATIOS = ['auto', 'original', 'fit'];

  Router.register('settings', {
    render: function () {
      var s = Store.settings;
      return '<div class="page-title">Ajustes</div>' +
        '<div class="list">' +
          row('lang', 'Idioma', s.lang) +
          row('ratio', 'Proporção de tela', s.ratio) +
          row('player', 'Player (1=Ijk/HW, 2=alt.)', s.player) +
          row('subSize', 'Tamanho da legenda', s.subSize) +
          row('cache', 'Limpar cache', '') +
          '<div class="item focusable" data-act="about"><span>Sobre</span><span class="v">UniTV ' + CONFIG.APP_VERSION + '</span></div>' +
        '</div>';
    },
    mounted: function () {
      cycle('lang', LANGS);
      cycle('ratio', RATIOS);
      toggle('player', [1, 2]);
      cycle('subSize', ['small', 'normal', 'big']);
      wire('cache', function () { UI.toast('Cache limpo.'); });
      wire('about', function () { UI.toast('UniTV ' + CONFIG.APP_VERSION + ' • Tizen • suporte: unitv4k@gmail.com'); });
    }
  });

  function row(id, label, val) {
    return '<div class="item focusable" data-act="' + id + '"><span>' + label + '</span><span class="v" id="v-' + id + '">' + UI.esc(String(val)) + '</span></div>';
  }
  function set(id, val) { var s = Store.settings; s[id] = val; Store.settings = s; var el = document.getElementById('v-' + id); if (el) el.textContent = val; if (id === 'ratio') Player.setRatio(val); }
  function cycle(id, arr) {
    var el = document.querySelector('.item[data-act="' + id + '"]'); if (!el) return;
    el._onEnter = function () { var s = Store.settings; var i = (arr.indexOf(s[id]) + 1) % arr.length; set(id, arr[i]); };
  }
  function toggle(id, arr) { cycle(id, arr); }
  function wire(id, fn) { var el = document.querySelector('.item[data-act="' + id + '"]'); if (el) el._onEnter = fn; }
})();
