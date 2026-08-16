/* api/user.js — central do usuário: histórico, pedidos, cupons, convite, compra (QR). */
(function () {
  var E = CONFIG.ENDPOINTS;

  function history() {
    if (CONFIG.MOCK) return Promise.resolve([
      { vodId: 'movie3', title: 'Filme 3', progress: 0.4 },
      { vodId: 'series1', title: 'Série 1', progress: 0.7, ep: 5 }
    ]);
    return Http.get(E.history);
  }
  function orders() {
    if (CONFIG.MOCK) return Promise.resolve([
      { order: 'A1001', status: 'paid', time: '2025-01-10', plan: 'Anual' }
    ]);
    return Http.get(E.orders);
  }
  function coupons() {
    if (CONFIG.MOCK) return Promise.resolve([{ id: 'c1', value: 'R$20', expire: '2026-12-31' }]);
    return Http.get(E.coupons);
  }
  function invite() {
    if (CONFIG.MOCK) return Promise.resolve({ code: 'UNI12345', qr: '' });
    return Http.get(E.invite);
  }
  function purchaseQr(planId) {
    if (CONFIG.MOCK) return Promise.resolve({ qr: '', link: 'https://uniquetv.live/pay' });
    return Http.get(E.purchaseQr, { planId: planId });
  }

  window.UserApi = { history: history, orders: orders, coupons: coupons, invite: invite, purchaseQr: purchaseQr };
})();
