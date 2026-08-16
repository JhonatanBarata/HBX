/* api/match.js — esportes: agenda, detalhe (line-up/stats/canais), classificação. */
(function () {
  var E = CONFIG.ENDPOINTS;

  function schedule() {
    if (CONFIG.MOCK) return Promise.resolve([
      { id: 'm1', home: 'Flamengo', away: 'Palmeiras', time: '16:00', league: 'Brasileirão', status: 'live', channelId: 'ch8' },
      { id: 'm2', home: 'Real Madrid', away: 'Barcelona', time: '18:00', league: 'La Liga', status: 'upcoming', channelId: 'ch6' },
      { id: 'm3', home: 'Corinthians', away: 'São Paulo', time: '21:00', league: 'Brasileirão', status: 'upcoming', channelId: 'ch8' }
    ]);
    return Http.get(E.matchSchedule);
  }

  function detail(matchId) {
    if (CONFIG.MOCK) return Promise.resolve({
      id: matchId, home: 'Flamengo', away: 'Palmeiras', score: [1, 0],
      channels: [{ id: 'ch8', name: 'Premiere 1' }, { id: 'ch9', name: 'Premiere 2' }],
      stats: { possession: [55, 45], shots: [8, 5] }
    });
    return Http.get(E.matchDetail, { matchId: matchId });
  }

  function rank(leagueId) {
    if (CONFIG.MOCK) return Promise.resolve([
      { pos: 1, team: 'Flamengo', j: 20, v: 14, e: 3, d: 3, pts: 45 },
      { pos: 2, team: 'Palmeiras', j: 20, v: 13, e: 4, d: 3, pts: 43 }
    ]);
    return Http.get(E.matchRank, { leagueId: leagueId });
  }

  window.MatchApi = { schedule: schedule, detail: detail, rank: rank };
})();
