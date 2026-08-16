/* http.js — wrapper de rede (fetch) com token, headers e timeout.
 * Todo endpoint sai daqui; ajuste assinatura/headers conforme o proxy revelar. */
(function () {
  function url(path, query) {
    var base = (window.CONFIG.BASE_URL || '').replace(/\/+$/, '');
    var u = /^https?:/.test(path) ? path : base + path;
    if (query) {
      var qs = Object.keys(query)
        .filter(function (k) { return query[k] !== undefined && query[k] !== null; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); })
        .join('&');
      if (qs) u += (u.indexOf('?') === -1 ? '?' : '&') + qs;
    }
    return u;
  }

  function headers(extra) {
    var h = {};
    var s = window.CONFIG.staticHeaders || {};
    Object.keys(s).forEach(function (k) { h[k] = s[k]; });
    h['X-Device-Id'] = Store.deviceId();
    if (window.CONFIG.PORTAL_KEY) h['X-Portal-Key'] = window.CONFIG.PORTAL_KEY;
    if (Store.token) h['Authorization'] = 'Bearer ' + Store.token;
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  function request(method, path, opts) {
    opts = opts || {};
    var full = url(path, opts.query);
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { ctrl && ctrl.abort(); }, window.CONFIG.HTTP_TIMEOUT);

    var init = { method: method, headers: headers(opts.headers) };
    if (ctrl) init.signal = ctrl.signal;
    if (opts.body !== undefined) init.body = (typeof opts.body === 'string') ? opts.body : JSON.stringify(opts.body);

    return fetch(full, init).then(function (res) {
      clearTimeout(timer);
      if (res.status === 401) { // token expirou → volta ao login
        Store.token = null;
        if (Router.current !== 'login' && Router.current !== 'welcome') Router.go('login');
        throw new Error('unauthorized');
      }
      var ct = res.headers.get('content-type') || '';
      var parse = ct.indexOf('json') !== -1 ? res.json() : res.text();
      return parse.then(function (data) {
        if (!res.ok) throw Object.assign(new Error('http ' + res.status), { status: res.status, data: data });
        return data;
      });
    }, function (err) { clearTimeout(timer); throw err; });
  }

  window.Http = {
    get: function (path, query, headers) { return request('GET', path, { query: query, headers: headers }); },
    post: function (path, body, query) { return request('POST', path, { body: body, query: query }); },
    put: function (path, body) { return request('PUT', path, { body: body }); },
    del: function (path, query) { return request('DELETE', path, { query: query }); },
    url: url
  };
})();
