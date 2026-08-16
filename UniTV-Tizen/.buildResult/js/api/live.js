/* api/live.js — TV ao vivo: categorias, canais, EPG, URL de play. */
(function () {
  var E = CONFIG.ENDPOINTS;

  function mockChannels() {
    var out = [];
    var names = ['Globo', 'SBT', 'Record', 'Band', 'RedeTV', 'ESPN', 'SporTV', 'Premiere',
      'Telecine', 'HBO', 'Discovery', 'History', 'Cartoon', 'Nick', 'CNN Brasil'];
    names.forEach(function (n, i) {
      out.push({
        id: 'ch' + (i + 1), num: i + 1, name: n,
        logo: '', now: 'Programa ao vivo', next: 'A seguir',
        url: CONFIG.MOCK_HLS
      });
    });
    return out;
  }

  function categories() {
    if (CONFIG.MOCK) return Promise.resolve([
      { id: 'all', name: 'Todos' }, { id: 'sports', name: 'Esportes' },
      { id: 'movies', name: 'Filmes' }, { id: 'kids', name: 'Infantil' },
      { id: 'news', name: 'Notícias' }, { id: 'adult', name: 'Adulto', locked: true }
    ]);
    return Http.get(E.liveCategories);
  }

  function channels(categoryId) {
    if (CONFIG.MOCK) return Promise.resolve(mockChannels());
    return Http.get(E.liveChannels, { categoryId: categoryId });
  }

  function epg(channelId, date) {
    if (CONFIG.MOCK) return Promise.resolve([
      { start: '18:00', end: '19:00', title: 'Jornal' },
      { start: '19:00', end: '20:30', title: 'Novela' },
      { start: '20:30', end: '22:00', title: 'Filme' }
    ]);
    return Http.get(E.liveEpg, { channelId: channelId, date: date });
  }

  // Retorna a URL HLS tocável (normalmente com token/expiração na query).
  function playUrl(channelId) {
    if (CONFIG.MOCK) return Promise.resolve({ url: CONFIG.MOCK_HLS });
    return Http.get(E.livePlayUrl, { channelId: channelId });
  }

  window.LiveApi = { categories: categories, channels: channels, epg: epg, playUrl: playUrl };
})();
