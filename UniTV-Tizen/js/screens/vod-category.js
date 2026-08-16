/* screens/vod-category.js — grade de categoria + busca (VodCategoryActivity/VodSearchActivity). */
(function () {
  Router.register('vod-category', {
    render: function (p) {
      var isSearch = p.categoryId === 'search';
      return '<div class="page-title">' + (isSearch ? 'Buscar' : 'Catálogo') + '</div>' +
        (isSearch ? '<div style="padding:0 60px 10px"><div class="input focusable" id="vc-search" data-default style="width:700px">Digite para buscar…</div></div>' : '') +
        '<div class="page" style="top:200px"><div class="rail"><div class="items" id="vc-grid" style="flex-wrap:wrap;height:760px;overflow:auto;align-content:flex-start"></div></div></div>';
    },
    mounted: function (p) {
      if (p.categoryId === 'search') {
        var box = document.getElementById('vc-search');
        box._onEnter = function () { UI.toast('Abra o teclado do sistema para digitar (IME).'); doSearch('a'); };
        doSearch('');
      } else {
        VodApi.list(p.kind || 'movies').then(render);
      }
    }
  });

  function doSearch(kw) { VodApi.search(kw).then(render); }

  function render(items) {
    var grid = document.getElementById('vc-grid');
    grid.innerHTML = '';
    items.forEach(function (it) {
      var el = document.createElement('div');
      el.className = 'card focusable';
      el.style.margin = '0 22px 22px 0';
      el.innerHTML = (it.poster ? '<img src="' + UI.esc(it.poster) + '">' : '<div class="ph">🎬</div>') +
        (it.vip ? '<div class="badge">VIP</div>' : '') +
        '<div class="label">' + UI.esc(it.title) + '</div>';
      el._onEnter = function () { Router.go('vod-details', { vodId: it.id, kind: it.type }); };
      grid.appendChild(el);
    });
    Focus.refresh();
  }
})();
