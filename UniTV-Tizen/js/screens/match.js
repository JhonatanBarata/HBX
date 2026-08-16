/* screens/match.js — MatchDetailActivity: detalhe do jogo + canais transmissores + stats.
 * (A agenda em si é renderizada na aba MATCH da Home.) */
(function () {
  Router.register('match', {
    render: function () {
      return '<div class="page-title" id="mt-title">Jogo</div>' +
        '<div class="page" style="top:120px"><div id="mt-body" style="font-size:26px;color:#9ab">Carregando…</div></div>';
    },
    mounted: function (p) {
      MatchApi.detail(p.matchId).then(function (m) {
        document.getElementById('mt-title').textContent = m.home + ' × ' + m.away + '  (' + m.score.join('-') + ')';
        var body = document.getElementById('mt-body');
        var html = '<div class="rail"><h3>Assistir em</h3><div class="items" id="mt-ch"></div></div>';
        html += '<div class="rail"><h3>Estatísticas</h3><div style="font-size:24px;color:#cde">' +
          'Posse de bola: ' + m.stats.possession.join('% / ') + '%<br>' +
          'Finalizações: ' + m.stats.shots.join(' / ') + '</div></div>';
        body.innerHTML = html;
        var ch = document.getElementById('mt-ch');
        m.channels.forEach(function (c) {
          var el = document.createElement('div');
          el.className = 'card wide focusable';
          el.innerHTML = '<div class="ph">📺</div><div class="label">' + UI.esc(c.name) + '</div>';
          el._onEnter = function () { Router.go('live'); }; // sintoniza no canal do jogo
          ch.appendChild(el);
        });
        Focus.refresh();
      });
    }
  });
})();
