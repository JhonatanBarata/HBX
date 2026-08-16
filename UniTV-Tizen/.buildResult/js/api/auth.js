/* api/auth.js — autenticação. Ajuste os bodies/paths conforme o proxy revelar.
 * O login envia seu usuário/senha comprado + deviceId + portalKey. */
(function () {
  var E = CONFIG.ENDPOINTS;

  function login(account, password) {
    if (CONFIG.MOCK) {
      Store.token = 'mock-token';
      Store.user = { account: account, vip: true, expire: '2030-12-31', nick: account || 'Convidado' };
      return Promise.resolve(Store.user);
    }
    return Http.post(E.login, {
      account: account,
      password: password,
      deviceId: Store.deviceId(),
      portalKey: CONFIG.PORTAL_KEY,
      type: CONFIG.COOLX_TYPE
    }).then(function (res) {
      // Ajuste os campos conforme a resposta real (token/access_token/data.token...).
      Store.token = res.token || (res.data && res.data.token);
      Store.user = res.user || (res.data && res.data.user) || { account: account };
      return Store.user;
    });
  }

  function activate(code) {
    if (CONFIG.MOCK) return Promise.resolve({ ok: true, days: 30 });
    return Http.post(E.activate, { code: code, deviceId: Store.deviceId() });
  }

  function profile() {
    if (CONFIG.MOCK) return Promise.resolve(Store.user || {});
    return Http.get(E.profile);
  }

  function logout() {
    var done = function () { Store.token = null; Store.user = null; };
    if (CONFIG.MOCK) { done(); return Promise.resolve(); }
    return Http.post(E.logout, {}).then(done, done);
  }

  function isLoggedIn() { return !!Store.token; }

  window.AuthApi = { login: login, activate: activate, profile: profile, logout: logout, isLoggedIn: isLoggedIn };
})();
