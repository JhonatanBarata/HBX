/* screens/login.js — login por conta+senha ou código de ativação (EGx-).
 * Teclado na tela (on-screen) simplificado + abas. Espelha o fluxo de login do app. */
(function () {
  var mode = 'account';       // 'account' | 'activation'
  var field = 'account';      // campo ativo para digitação
  var data = { account: '', password: '', code: '' };

  Router.register('login', {
    render: function () {
      return '' +
        '<div class="screen">' +
          '<div class="login-wrap">' +
            '<div class="login-title">Entrar no UniTV</div>' +
            '<div class="login-sub">Use a conta que você contratou, ou um código de ativação.</div>' +
            '<div class="login-tabs">' +
              '<div class="tab focusable ' + (mode === 'account' ? 'active' : '') + '" data-default data-mode="account">Conta e senha</div>' +
              '<div class="tab focusable ' + (mode === 'activation' ? 'active' : '') + '" data-mode="activation">Código de ativação</div>' +
            '</div>' +
            '<div id="login-form"></div>' +
            '<div class="hint" id="login-hint"></div>' +
          '</div>' +
        '</div>';
    },
    mounted: function () { bindTabs(); renderForm(); hint(); },
    onKey: function (a) {
      if (a && a.indexOf('num:') === 0) { typeNum(a.split(':')[1]); return true; }
      return false;
    }
  });

  function bindTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t._onEnter = function () { mode = t.getAttribute('data-mode'); Router.go('login', {}, { replace: true }); };
    });
  }

  function renderForm() {
    var host = document.getElementById('login-form');
    if (mode === 'account') {
      host.innerHTML = '' +
        row('Conta / e-mail', 'account', data.account) +
        row('Senha', 'password', mask(data.password)) +
        '<div class="btn focusable" id="btn-login">Entrar</div>';
      wireField('account'); wireField('password');
      byId('btn-login')._onEnter = doLogin;
    } else {
      host.innerHTML = '' +
        row('Código de ativação (ex.: EG1-XXXX)', 'code', data.code) +
        '<div class="btn focusable" id="btn-activate">Ativar</div>';
      wireField('code');
      byId('btn-activate')._onEnter = doActivate;
    }
    Focus.refresh();
  }

  function row(label, key, val) {
    return '<div class="field"><label>' + label + '</label>' +
      '<div class="input focusable" data-field="' + key + '">' + (UI.esc(val) || '&nbsp;') + '</div></div>';
  }

  // Campo "editável": ao focar vira o campo ativo; teclas numéricas do controle digitam.
  // Em TV real, abra o IME do sistema: tizen usa <input> real + foco; aqui simplificamos.
  function wireField(key) {
    var el = document.querySelector('.input[data-field="' + key + '"]');
    if (!el) return;
    el._onFocus = function () { field = key; };
    el._onEnter = function () { openIME(key); };
  }

  // Abre um <input> real sobreposto para o IME do Tizen aparecer.
  function openIME(key) {
    var el = document.querySelector('.input[data-field="' + key + '"]');
    var inp = document.createElement('input');
    inp.type = (key === 'password') ? 'password' : 'text';
    inp.value = data[key] || '';
    inp.style.cssText = 'position:absolute;left:' + el.offsetLeft + 'px;top:' + el.getBoundingClientRect().top +
      'px;width:' + el.offsetWidth + 'px;height:74px;font-size:28px;padding:0 22px;border-radius:12px;' +
      'border:2px solid #ffcc00;background:#232c40;color:#fff;z-index:99;';
    document.getElementById('app').appendChild(inp);
    inp.focus();
    var commit = function () {
      data[key] = inp.value;
      el.innerHTML = (key === 'password' ? mask(inp.value) : UI.esc(inp.value)) || '&nbsp;';
      inp.remove();
      Focus.setFocus(el);
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', function (e) {
      if (e.keyCode === 13) { commit(); }
      else if (e.keyCode === 10009 || e.keyCode === 27) { inp.remove(); Focus.setFocus(el); }
    });
  }

  function typeNum(d) { data[field] = (data[field] || '') + d; var el = document.querySelector('.input[data-field="' + field + '"]'); if (el) el.textContent = field === 'password' ? mask(data[field]) : data[field]; }
  function mask(s) { return (s || '').replace(/./g, '•'); }

  function doLogin() {
    if (!data.account || !data.password) { UI.toast('Preencha conta e senha.'); return; }
    UI.loading(true);
    AuthApi.login(data.account.trim(), data.password).then(function () {
      UI.loading(false); Router.resetTo('home');
    }).catch(function (e) {
      UI.loading(false);
      UI.toast(e && e.message === 'unauthorized' ? 'Conta ou senha incorretos.' : 'Falha no login. Verifique a URL da API (config.js) e sua conexão.');
    });
  }

  function doActivate() {
    if (!data.code) { UI.toast('Informe o código.'); return; }
    UI.loading(true);
    AuthApi.activate(data.code.trim()).then(function () {
      UI.loading(false); UI.toast('Ativado! Agora entre com sua conta.'); mode = 'account'; Router.go('login', {}, { replace: true });
    }).catch(function () { UI.loading(false); UI.toast('Código inválido ou já usado.'); });
  }

  function hint() {
    var h = byId('login-hint');
    if (!CONFIG.BASE_URL && !CONFIG.MOCK) h.innerHTML = '⚠ Defina CONFIG.BASE_URL em js/config.js (capture no proxy). Modo atual sem servidor.';
    else if (CONFIG.MOCK) h.innerHTML = '🧪 Modo MOCK ligado — qualquer usuário/senha entra para você navegar a UI.';
    else h.innerHTML = 'Conectando em: ' + CONFIG.BASE_URL;
  }

  function byId(id) { return document.getElementById(id); }
})();
