/* api/vod.js — VOD: categorias, listas, detalhe (temporadas/episódios), busca, play. */
(function () {
  var E = CONFIG.ENDPOINTS;

  function mockList(kind, n) {
    var out = [];
    for (var i = 1; i <= (n || 12); i++) {
      out.push({
        id: kind + i, title: (kind === 'series' ? 'Série ' : 'Filme ') + i,
        poster: '', year: 2018 + (i % 7), score: (60 + (i * 7) % 40) / 10,
        type: kind, vip: i % 3 === 0
      });
    }
    return out;
  }

  function categories() {
    if (CONFIG.MOCK) return Promise.resolve([
      { id: 'movies', name: 'MOVIES' }, { id: 'series', name: 'SERIES' },
      { id: 'anime', name: 'Anime' }, { id: 'kids', name: 'Kids' }
    ]);
    return Http.get(E.vodCategories);
  }

  function list(categoryId, opts) {
    if (CONFIG.MOCK) return Promise.resolve(mockList(categoryId === 'series' ? 'series' : 'movie', 18));
    return Http.get(E.vodList, Object.assign({ categoryId: categoryId }, opts || {}));
  }

  function detail(vodId) {
    if (CONFIG.MOCK) {
      var isSeries = /series/.test(vodId);
      var seasons = isSeries ? [
        { season: 1, episodes: gen(10) }, { season: 2, episodes: gen(8) }
      ] : null;
      return Promise.resolve({
        id: vodId, title: (isSeries ? 'Série ' : 'Filme ') + vodId.replace(/\D/g, ''),
        year: 2021, score: 8.4, duration: 7200,
        genres: ['Ação', 'Aventura'], country: 'EUA',
        cast: ['Ator A', 'Ator B', 'Ator C'],
        desc: 'Descrição de exemplo do conteúdo. Substitua pela sinopse vinda da API real.',
        poster: '', backdrop: '', vip: true,
        seasons: seasons, related: mockList('movie', 8),
        qualities: ['Auto', '4K', '1080p', '720p'],
        subtitles: [{ lang: 'pt', label: 'Português' }, { lang: 'en', label: 'English' }]
      });
    }
    return Http.get(E.vodDetail, { vodId: vodId });
  }

  function gen(n) { var a = []; for (var i = 1; i <= n; i++) a.push({ id: 'e' + i, ep: i, title: 'Episódio ' + i }); return a; }

  function playUrl(vodId, episodeId, quality) {
    if (CONFIG.MOCK) return Promise.resolve({
      url: CONFIG.MOCK_HLS,
      subtitles: [{ lang: 'pt', url: '' }]
    });
    return Http.get(E.vodPlayUrl, { vodId: vodId, episodeId: episodeId, quality: quality });
  }

  function search(kw) {
    if (CONFIG.MOCK) return Promise.resolve(mockList('movie', 8));
    return Http.get(E.vodSearch, { kw: kw });
  }

  window.VodApi = { categories: categories, list: list, detail: detail, playUrl: playUrl, search: search };
})();
