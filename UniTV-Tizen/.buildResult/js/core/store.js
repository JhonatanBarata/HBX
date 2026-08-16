/* store.js — persistência simples (token, settings, deviceId) via localStorage. */
(function () {
  var NS = 'unitv.';
  var mem = {};

  function get(k, def) {
    try {
      var v = localStorage.getItem(NS + k);
      return v === null ? def : JSON.parse(v);
    } catch (e) { return (k in mem) ? mem[k] : def; }
  }
  function set(k, v) {
    try { localStorage.setItem(NS + k, JSON.stringify(v)); }
    catch (e) { mem[k] = v; }
  }
  function del(k) {
    try { localStorage.removeItem(NS + k); } catch (e) { delete mem[k]; }
  }

  // deviceId estável: o backend amarra a conta a um device (regra "1 phone + 1 TV box").
  // Em TV real dá para usar webapis.productinfo.getDuid()/getMac; aqui geramos e guardamos.
  function deviceId() {
    var id = get('deviceId', null);
    if (id) return id;
    var duid = null;
    try {
      if (window.webapis && webapis.productinfo && webapis.productinfo.getDuid) {
        duid = webapis.productinfo.getDuid();
      }
    } catch (e) {}
    id = duid || ('tizen-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
    set('deviceId', id);
    return id;
  }

  window.Store = {
    get: get, set: set, del: del, deviceId: deviceId,
    get token() { return get('token', null); },
    set token(v) { v ? set('token', v) : del('token'); },
    get user() { return get('user', null); },
    set user(v) { v ? set('user', v) : del('user'); },
    get settings() { return get('settings', { lang: 'pt', ratio: 'auto', player: 1, subSize: 'normal', subColor: 'white' }); },
    set settings(v) { set('settings', v); }
  };
})();
