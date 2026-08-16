/* screens/vod-details.js — VodDetailsActivity: hero, ações, temporadas/episódios, similares. */
(function () {
  var vod = null;

  Router.register('vod-details', {
    render: function () {
      return '<div class="screen">' +
        '<div class="detail-hero"><div class="bg" id="dt-bg"></div></div>' +
        '<div class="detail-body" id="dt-body"><div style="font-size:28px;color:#9ab">Carregando…</div></div>' +
        '</div>';
    },
    mounted: function (p) {
      VodApi.detail(p.vodId).then(function (d) { vod = d; paint(d, p); });
    }
  });

  function paint(d, p) {
    if (d.backdrop) document.getElementById('dt-bg').style.backgroundImage = 'url(' + d.backdrop + ')';
    var body = document.getElementById('dt-body');
    var isVip = !!d.vip && !(Store.user && Store.user.vip);

    var html = '<div class="t">' + UI.esc(d.title) + '</div>' +
      '<div class="meta">⭐ ' + (d.score || '-') + '  •  ' + (d.year || '') + '  •  ' + (d.country || '') +
        '  •  ' + (d.genres || []).join(', ') + '</div>' +
      '<div class="desc">' + UI.esc(d.desc || '') + '</div>' +
      '<div class="actions">' +
        '<div class="btn focusable" data-default id="dt-play">▶ ' + (d.seasons ? 'Assistir S1E1' : 'Assistir') + '</div>' +
        '<div class="btn secondary focusable" id="dt-fav">＋ Minha Lista</div>' +
        (isVip ? '<div class="btn secondary focusable" id="dt-vip">🔒 Seja VIP</div>' : '') +
      '</div>';

    // Episódios (séries)
    if (d.seasons) {
      html += '<div class="rail"><h3>Episódios — Temporada 1</h3><div class="items" id="dt-eps"></div></div>';
    }
    // Similares
    html += '<div class="rail"><h3>Você também pode gostar</h3><div class="items" id="dt-rel"></div></div>';
    body.innerHTML = html;

    document.getElementById('dt-play')._onEnter = function () { play(d, d.seasons ? d.seasons[0].episodes[0] : null); };
    var fav = document.getElementById('dt-fav'); if (fav) fav._onEnter = function () { UI.toast('Adicionado à Minha Lista.'); };
    var vip = document.getElementById('dt-vip'); if (vip) vip._onEnter = function () { Router.go('user'); };

    if (d.seasons) {
      var eps = document.getElementById('dt-eps');
      d.seasons[0].episodes.forEach(function (e) {
        var el = document.createElement('div');
        el.className = 'card wide focusable';
        el.innerHTML = '<div class="ph">▶</div><div class="label">E' + e.ep + ' — ' + UI.esc(e.title) + '</div>';
        el._onEnter = function () { play(d, e); };
        eps.appendChild(el);
      });
    }
    var rel = document.getElementById('dt-rel');
    (d.related || []).forEach(function (it) {
      var el = document.createElement('div');
      el.className = 'card focusable';
      el.innerHTML = '<div class="ph">🎬</div><div class="label">' + UI.esc(it.title) + '</div>';
      el._onEnter = function () { Router.go('vod-details', { vodId: it.id, kind: it.type }); };
      rel.appendChild(el);
    });

    Focus.refresh('#dt-play');
  }

  function play(d, episode) {
    if (d.vip && !(Store.user && Store.user.vip)) { UI.toast('Conteúdo VIP. Ative seu plano.'); Router.go('user'); return; }
    Router.go('vod-player', { vod: d, episode: episode });
  }
})();
