/* router.js — SPA router. Espelha as Activities do app Android.
 * Cada tela registra: Router.register('home', { render, onKey, onLeave }). */
(function () {
  var screens = {};
  var stack = [];        // pilha de navegação (para o BACK)
  var currentName = null;
  var currentScreen = null;

  function register(name, def) { screens[name] = def; }

  function go(name, params, opts) {
    var def = screens[name];
    if (!def) { console.warn('rota inexistente:', name); return; }
    if (currentScreen && currentScreen.onLeave) currentScreen.onLeave();
    if (!(opts && opts.replace) && currentName) stack.push({ name: currentName, params: currentParams });
    _mount(name, params, def);
  }

  function _mount(name, params, def) {
    currentName = name; currentParams = params || {}; currentScreen = def;
    var app = document.getElementById('app');
    app.innerHTML = '';
    var out = def.render(currentParams) || '';
    if (typeof out === 'string') app.innerHTML = out;
    else if (out && out.nodeType) app.appendChild(out);
    if (def.mounted) def.mounted(currentParams);
    Focus.refresh(def.focusFirst);
    window.location.hash = '#/' + name;
  }

  function back() {
    if (currentScreen && currentScreen.onBack && currentScreen.onBack() === true) return; // tela consumiu o BACK
    var prev = stack.pop();
    if (!prev) { // nada para voltar: na home pergunta sair; senão vai pra home
      if (currentName === 'home' || currentName === 'welcome') UI.confirmExit();
      else _mount('home', {}, screens.home);
      return;
    }
    if (currentScreen && currentScreen.onLeave) currentScreen.onLeave();
    _mount(prev.name, prev.params, screens[prev.name]);
  }

  function dispatchKey(action) {
    // 1) a tela atual tem prioridade
    if (currentScreen && currentScreen.onKey && currentScreen.onKey(action) === true) return;
    // 2) navegação padrão
    if (action === 'left' || action === 'right' || action === 'up' || action === 'down') Focus.move(action);
    else if (action === 'enter') Focus.enter();
    else if (action === 'back') back();
    else if (action === 'exit') UI.confirmExit();
  }

  var currentParams = {};
  window.Router = {
    register: register, go: go, back: back, dispatchKey: dispatchKey,
    get current() { return currentName; },
    get params() { return currentParams; },
    resetTo: function (name, params) { stack = []; go(name, params, { replace: true }); }
  };
})();
