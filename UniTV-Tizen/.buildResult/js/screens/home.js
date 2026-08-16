/* screens/home.js — HomeActivity: topbar com abas (Live/Movies/Series/Match) + rails. */
(function () {
  var TABS = [
    { id: 'live', name: 'AO VIVO' },
    { id: 'movies', name: 'FILMES' },
    { id: 'series', name: 'SÉRIES' },
    { id: 'match', name: 'ESPORTES' }
  ];
  var activeTab = 'movies';

  Router.register('home', {
    render: function () {
      return '' +
        '<div class="topbar">' +
          '<div class="logo">UniTV</div>' +
          '<div class="nav">' + TABS.map(function (t) {
            return '<div class="navitem focusable ' + (t.id === activeTab ? 'active' : '') + '" data-tab="' + t.id + '">' + t.name + '</div>';
          }).join('') + '</div>' +
          '<div class="spacer"></div>' +
          '<div class="user focusable" id="home-search">🔍 Buscar</div>' +
          '<div class="user focusable" id="home-user">👤 ' + UI.esc((Store.user && Store.user.nick) || 'Perfil') + '</div>' +
        '</div>' +
        '<div class="page" id="home-page"></div>';
    },
    mounted: function () {
      Array.prototype.forEach.call(document.querySelectorAll('.navitem'), function (n) {
        n._onFocus = function () {}; // navegar não troca; só ao ENTER ou ao passar? Usamos ENTER.
        n._onEnter = function () { switchTab(n.getAttribute('data-tab')); };
      });
      document.getElementById('home-search')._onEnter = function () { Router.go('vod-category', { categoryId: 'search' }); };
      document.getElementById('home-user')._onEnter = function () { Router.go('user'); };
      loadTab(activeTab);
    },
    onKey: function (a) {
      // Atalho: teclas coloridas trocam abas rápido (comum em apps de TV).
      if (a === 'red') { switchTab('live'); return true; }
      if (a === 'green') { switchTab('movies'); return true; }
      if (a === 'yellow') { switchTab('series'); return true; }
      if (a === 'blue') { switchTab('match'); return true; }
      return false;
    }
  });

  function switchTab(id) {
    activeTab = id;
    if (id === 'live') { Router.go('live'); return; }
    Array.prototype.forEach.call(document.querySelectorAll('.navitem'), function (n) {
      n.classList.toggle('active', n.getAttribute('data-tab') === id);
    });
    loadTab(id);
  }

  function loadTab(id) {
    var page = document.getElementById('home-page');
    page.innerHTML = '<div style="padding:40px;color:#89a;font-size:26px">Carregando…</div>';
    if (id === 'match') { loadMatch(page); return; }
    var kind = (id === 'series') ? 'series' : 'movies';
    VodApi.categories().then(function () {
      return Promise.all([
        VodApi.list(kind).then(function (a) { return { title: id === 'series' ? 'Séries em alta' : 'Filmes em alta', items: a }; }),
        VodApi.list(kind).then(function (a) { return { title: 'Novidades', items: a.slice().reverse() }; }),
        VodApi.list(kind).then(function (a) { return { title: 'Recomendados', items: a }; })
      ]);
    }).then(function (rails) { renderRails(page, rails); });
  }

  function loadMatch(page) {
    MatchApi.schedule().then(function (list) {
      var items = list.map(function (m) {
        return { id: m.id, title: m.home + ' × ' + m.away, sub: m.league + ' • ' + m.time, live: m.status === 'live', wide: true, _match: m };
      });
      renderRails(page, [{ title: 'Jogos de hoje', items: items, wide: true, isMatch: true }]);
    });
  }

  function renderRails(page, rails) {
    page.innerHTML = rails.map(function (r, ri) {
      return '<div class="rail"><h3>' + UI.esc(r.title) + '</h3><div class="items" id="rail-' + ri + '"></div></div>';
    }).join('');
    rails.forEach(function (r, ri) {
      var host = document.getElementById('rail-' + ri);
      r.items.forEach(function (it) {
        var el = document.createElement('div');
        el.className = 'card focusable' + (r.wide || it.wide ? ' wide' : '');
        el.innerHTML =
          (it.poster || it.backdrop ? '<img src="' + UI.esc(it.poster || it.backdrop) + '">' : '<div class="ph">🎬</div>') +
          (it.vip ? '<div class="badge">VIP</div>' : '') +
          (it.live ? '<div class="badge">● AO VIVO</div>' : '') +
          '<div class="label">' + UI.esc(it.title) + (it.sub ? '<br><small style="color:#9ab">' + UI.esc(it.sub) + '</small>' : '') + '</div>';
        el._onEnter = function () {
          if (r.isMatch) Router.go('match', { matchId: it.id });
          else Router.go('vod-details', { vodId: it.id, kind: activeTab });
        };
        host.appendChild(el);
      });
    });
    Focus.refresh('.navitem.active');
  }
})();
