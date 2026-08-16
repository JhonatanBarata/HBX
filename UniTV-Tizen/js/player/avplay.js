/* avplay.js — wrapper do webapis.avplay (Tizen) com fallback <video> para dev no browser.
 *
 * API pública:
 *   Player.open(url, {onready, ontime, onend, onbuffer, onerror})
 *   Player.play() / pause() / togglePause() / stop()
 *   Player.seek(ms) / jump(deltaSec)
 *   Player.getCurrentTime() (ms) / getDuration() (ms) / getState()
 *   Player.getTracks() -> {audio:[], text:[]} ; selectAudio(i) ; selectText(i)
 *   Player.setRatio('auto'|'original'|'fit'|'16:9'|'4:3')
 *   Player.setExternalSubtitle(path)
 *   Player.show(bool)  (mostra/oculta a camada de vídeo)
 */
(function () {
  var AV = (window.webapis && webapis.avplay) ? webapis.avplay : null;
  var layer = document.getElementById('player-layer');
  var cbs = {};
  var video = null;        // fallback HTML5
  var lastUrl = null;

  function isTizen() { return !!AV; }

  // Mostra/oculta a camada de vídeo. Ao ativar, remove o fundo opaco da UI
  // (body.playing esconde o #bg), senão o plano de hardware do AVPlay fica
  // coberto e o resultado é áudio sem imagem.
  function show(on) {
    layer.classList.toggle('active', !!on);
    document.body.classList.toggle('playing', !!on);
  }

  /* ---------------- Tizen AVPlay ---------------- */
  function tizenListeners() {
    AV.setListener({
      onbufferingstart: function () { cbs.onbuffer && cbs.onbuffer(true); },
      onbufferingprogress: function (p) { cbs.onbuffer && cbs.onbuffer(true, p); },
      onbufferingcomplete: function () { cbs.onbuffer && cbs.onbuffer(false); },
      oncurrentplaytime: function (ms) { cbs.ontime && cbs.ontime(ms, safeDuration()); },
      onstreamcompleted: function () { cbs.onend && cbs.onend(); },
      onevent: function (type, data) { /* ex.: 'PLAYER_MSG_BITRATE_CHANGE' */ },
      onerror: function (e) { cbs.onerror && cbs.onerror(String(e)); },
      onsubtitlechange: function (duration, text) { cbs.onsubtitle && cbs.onsubtitle(text); },
      ondrmevent: function () {}
    });
  }
  function safeDuration() { try { return AV.getDuration(); } catch (e) { return 0; } }

  function tizenOpen(url, options) {
    cbs = options || {};
    lastUrl = url;
    try {
      try { AV.close(); } catch (e) {}
      AV.open(url);
      AV.setDisplayRect(0, 0, 1920, 1080);
      // HLS/adaptive: deixa o player escolher bitrate; para 4K forçar decoder de HW.
      try { AV.setStreamingProperty('ADAPTIVE_INFO', 'STARTBITRATE=HIGHEST'); } catch (e) {}
      tizenListeners();
      show(true);
      AV.prepareAsync(function () {
        applyRatio(Store.settings.ratio);
        AV.play();
        cbs.onready && cbs.onready(safeDuration());
      }, function (err) { cbs.onerror && cbs.onerror('prepare: ' + err); });
    } catch (e) { cbs.onerror && cbs.onerror(String(e)); }
  }

  /* ---------------- Fallback <video> (browser dev) ---------------- */
  function htmlOpen(url, options) {
    cbs = options || {};
    lastUrl = url;
    if (!video) {
      video = document.createElement('video');
      video.style.cssText = 'width:1920px;height:1080px;background:#000;';
      video.setAttribute('playsinline', '');
      var obj = document.getElementById('av-player');
      obj.parentNode.replaceChild(video, obj);
      video.addEventListener('timeupdate', function () {
        cbs.ontime && cbs.ontime(video.currentTime * 1000, (video.duration || 0) * 1000);
      });
      video.addEventListener('ended', function () { cbs.onend && cbs.onend(); });
      video.addEventListener('waiting', function () { cbs.onbuffer && cbs.onbuffer(true); });
      video.addEventListener('playing', function () { cbs.onbuffer && cbs.onbuffer(false); });
      video.addEventListener('error', function () { cbs.onerror && cbs.onerror('video error'); });
      video.addEventListener('loadedmetadata', function () { cbs.onready && cbs.onready((video.duration || 0) * 1000); });
    }
    show(true);
    // Browsers sem HLS nativo não tocam .m3u8; ok para validar layout/controle.
    video.src = url;
    video.play().catch(function () {});
  }

  /* ---------------- API unificada ---------------- */
  function open(url, options) { isTizen() ? tizenOpen(url, options) : htmlOpen(url, options); }
  function play() { isTizen() ? safe(function () { AV.play(); }) : video && video.play(); }
  function pause() { isTizen() ? safe(function () { AV.pause(); }) : video && video.pause(); }
  function stop() {
    if (isTizen()) safe(function () { AV.stop(); AV.close(); });
    else if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    show(false);
  }
  function getState() {
    if (isTizen()) { try { return AV.getState(); } catch (e) { return 'NONE'; } }
    if (!video) return 'NONE';
    return video.paused ? 'PAUSED' : 'PLAYING';
  }
  function togglePause() {
    var s = getState();
    if (s === 'PLAYING') pause(); else play();
    return getState();
  }
  function getCurrentTime() {
    if (isTizen()) { try { return AV.getCurrentTime(); } catch (e) { return 0; } }
    return video ? video.currentTime * 1000 : 0;
  }
  function getDuration() {
    if (isTizen()) return safeDuration();
    return video ? (video.duration || 0) * 1000 : 0;
  }
  function seek(ms) {
    if (isTizen()) safe(function () { AV.seekTo(Math.max(0, ms)); });
    else if (video) video.currentTime = Math.max(0, ms / 1000);
  }
  function jump(deltaSec) { seek(getCurrentTime() + deltaSec * 1000); }

  function getTracks() {
    var out = { audio: [], text: [] };
    if (!isTizen()) return out;
    try {
      var info = AV.getTotalTrackInfo();
      info.forEach(function (t) {
        var extra = {}; try { extra = JSON.parse(t.extra_info || '{}'); } catch (e) {}
        var label = extra.track_lang || extra.language || ('#' + t.index);
        if (t.type === 'AUDIO') out.audio.push({ index: t.index, label: label });
        else if (t.type === 'TEXT') out.text.push({ index: t.index, label: label });
      });
    } catch (e) {}
    return out;
  }
  function selectAudio(i) { if (isTizen()) safe(function () { AV.setSelectTrack('AUDIO', i); }); }
  function selectText(i) { if (isTizen()) safe(function () { AV.setSelectTrack('TEXT', i); }); }

  function applyRatio(mode) {
    if (!isTizen()) return;
    var map = {
      auto: 'PLAYER_DISPLAY_MODE_LETTER_BOX',
      original: 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO',
      fit: 'PLAYER_DISPLAY_MODE_FULL_SCREEN',
      '16:9': 'PLAYER_DISPLAY_MODE_LETTER_BOX',
      '4:3': 'PLAYER_DISPLAY_MODE_LETTER_BOX'
    };
    safe(function () { AV.setDisplayMethod(map[mode] || map.auto); });
  }
  function setRatio(mode) { var s = Store.settings; s.ratio = mode; Store.settings = s; applyRatio(mode); }

  function setExternalSubtitle(path) { if (isTizen()) safe(function () { AV.setExternalSubtitlePath(path); }); }

  function safe(fn) { try { fn(); } catch (e) { cbs.onerror && cbs.onerror(String(e)); } }

  window.Player = {
    open: open, play: play, pause: pause, togglePause: togglePause, stop: stop,
    seek: seek, jump: jump, getState: getState,
    getCurrentTime: getCurrentTime, getDuration: getDuration,
    getTracks: getTracks, selectAudio: selectAudio, selectText: selectText,
    setRatio: setRatio, setExternalSubtitle: setExternalSubtitle,
    show: show, isTizen: isTizen
  };
})();
