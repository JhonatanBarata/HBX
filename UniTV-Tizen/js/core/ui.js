/* ui.js — helpers de UI: toast, loading, confirmar saída, escape/format. */
(function () {
  var toastEl, loadingEl, toastTimer;

  function toast(msg, ms) {
    toastEl = toastEl || document.getElementById('toast');
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.add('hidden'); }, ms || 2200);
  }

  function loading(on) {
    loadingEl = loadingEl || document.getElementById('loading');
    loadingEl.classList.toggle('hidden', !on);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h > 0 ? h + ':' : '') + p(m) + ':' + p(s);
  }

  function confirmExit() {
    // Em TV real: encerra o app. No browser dev: apenas avisa.
    try {
      if (window.tizen && tizen.application) { tizen.application.getCurrentApplication().exit(); return; }
    } catch (e) {}
    toast('Sair do app (BACK na Home).');
  }

  window.UI = { toast: toast, loading: loading, esc: esc, fmtTime: fmtTime, confirmExit: confirmExit };
})();
