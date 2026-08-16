/* focus.js — navegação espacial (D-pad) baseada em geometria.
 * Uso: marque elementos navegáveis com a classe "focusable".
 * Focus.refresh() reindexa a tela atual; Focus.move('left'|'up'|...) move o foco;
 * Focus.current() retorna o elemento focado. Rails horizontais rolam sozinhos. */
(function () {
  var current = null;

  function allRaw() {
    return Array.prototype.slice.call(document.querySelectorAll('.focusable'))
      .filter(function (el) { return !el.classList.contains('disabled'); });
  }

  function all() {
    var raw = allRaw();
    var vis = raw.filter(function (el) {
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0; // visível/com layout
    });
    // Fallback: sem geometria (ex.: pane não exibido/headless) usa ordem de DOM.
    return vis.length ? vis : raw;
  }

  // true quando há layout real (rects não-degenerados) → usar geometria.
  function hasLayout() {
    var el = document.querySelector('.focusable');
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r };
  }

  function setFocus(el, opts) {
    if (!el) return;
    if (current && current !== el) current.classList.remove('focused');
    current = el;
    el.classList.add('focused');
    scrollIntoView(el);
    if (!(opts && opts.silent) && typeof el._onFocus === 'function') el._onFocus(el);
  }

  // Rola o container-rail (overflow) para manter o card visível horizontalmente,
  // e a página verticalmente.
  function scrollIntoView(el) {
    var rail = el.closest('.items');
    if (rail) {
      var er = el.getBoundingClientRect(), rr = rail.getBoundingClientRect();
      var pad = 80;
      if (er.left < rr.left + pad) rail.scrollLeft -= (rr.left + pad - er.left);
      else if (er.right > rr.right - pad) rail.scrollLeft += (er.right - (rr.right - pad));
    }
    var page = el.closest('.page') || el.closest('.list') || el.closest('.pmenu') || el.closest('.live-list');
    if (page && page.scrollHeight > page.clientHeight) {
      var pe = el.getBoundingClientRect(), pr = page.getBoundingClientRect(), p2 = 120;
      if (pe.top < pr.top + p2) page.scrollTop -= (pr.top + p2 - pe.top);
      else if (pe.bottom > pr.bottom - p2) page.scrollTop += (pe.bottom - (pr.bottom - p2));
    }
  }

  // Escolhe o melhor candidato na direção dada.
  function move(dir) {
    var items = all();
    if (!items.length) return;
    if (!current || items.indexOf(current) === -1) { setFocus(items[0]); return; }

    // Fallback por ordem de DOM quando não há layout (pane oculto/headless).
    if (!hasLayout()) {
      var i = items.indexOf(current);
      if (dir === 'right' || dir === 'down') setFocus(items[Math.min(items.length - 1, i + 1)]);
      else if (dir === 'left' || dir === 'up') setFocus(items[Math.max(0, i - 1)]);
      return;
    }

    var c = center(current);
    var best = null, bestScore = Infinity;

    items.forEach(function (el) {
      if (el === current) return;
      var t = center(el);
      var dx = t.x - c.x, dy = t.y - c.y;
      var primary, cross, aligned;
      if (dir === 'left')  { if (dx >= -2) return; primary = -dx; cross = Math.abs(dy); aligned = overlapY(c.r, t.r); }
      else if (dir === 'right') { if (dx <= 2) return; primary = dx; cross = Math.abs(dy); aligned = overlapY(c.r, t.r); }
      else if (dir === 'up')   { if (dy >= -2) return; primary = -dy; cross = Math.abs(dx); aligned = overlapX(c.r, t.r); }
      else { if (dy <= 2) return; primary = dy; cross = Math.abs(dx); aligned = overlapX(c.r, t.r); }

      // penaliza desalinhamento no eixo cruzado; bonifica sobreposição.
      var score = primary + cross * 2 - aligned * 0.5;
      if (score < bestScore) { bestScore = score; best = el; }
    });

    if (best) setFocus(best);
  }

  function overlapY(a, b) { return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)); }
  function overlapX(a, b) { return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)); }

  // Reindexa e foca o primeiro (ou um preferido data-focus-default) após render.
  function refresh(preferSelector) {
    var items = all();
    if (!items.length) { current = null; return; }
    var pref = preferSelector ? document.querySelector(preferSelector) : null;
    var def = document.querySelector('.focusable[data-default]');
    setFocus(pref || def || (items.indexOf(current) !== -1 ? current : items[0]));
  }

  function enter() {
    if (current && typeof current._onEnter === 'function') { current._onEnter(current); return true; }
    if (current) { current.click(); return true; }
    return false;
  }

  window.Focus = {
    refresh: refresh, move: move, enter: enter,
    setFocus: setFocus,
    current: function () { return current; },
    clear: function () { if (current) current.classList.remove('focused'); current = null; }
  };
})();
