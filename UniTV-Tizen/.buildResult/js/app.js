/* app.js — bootstrap: registra teclas do controle, listener global e inicia no Welcome. */
(function () {
  function boot() {
    Keys.registerKeys();

    // Um único listener global; o Router despacha para a tela atual.
    document.addEventListener('keydown', function (e) {
      var action = Keys.toAction(e.keyCode);
      if (!action) return;
      // Não sequestrar quando um <input> real (IME) está focado.
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA') && action !== 'back') return;
      e.preventDefault();
      Router.dispatchKey(action);
    });

    // Botão físico "Return" do Tizen também dispara keycode 10009 (tratado acima).
    window.addEventListener('appcontrol', function () {}); // deep-link do sistema, se houver.

    // Escala do canvas 1920x1080 para a resolução real da janela (útil no browser dev).
    fitScale();
    window.addEventListener('resize', fitScale);

    Router.resetTo('welcome');
  }

  function fitScale() {
    var w = window.innerWidth, h = window.innerHeight;
    var sx = w / CONFIG.DESIGN_W, sy = h / CONFIG.DESIGN_H;
    var s = Math.min(sx, sy);
    // Em TV real a janela já é 1920x1080 (s=1). No browser dev, encaixa proporcional.
    if (Math.abs(s - 1) < 0.001) { document.body.style.transform = ''; return; }
    document.body.style.transformOrigin = 'top left';
    document.body.style.transform = 'scale(' + s + ')';
    document.body.style.left = ((w - CONFIG.DESIGN_W * s) / 2) + 'px';
    document.body.style.position = 'absolute';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
