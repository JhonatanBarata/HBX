/* player.js — player mínimo AVPlay (kiosk). Toca uma URL HLS e mostra diagnóstico na tela.
 * Controle: RETURN/EXIT sai; Enter/PlayPause pausa/continua. */
(function () {
  var URL_TO_PLAY = "http://192.168.0.19:8080/out.m3u8";
  var msg = document.getElementById('msg');
  function say(t) { if (msg) msg.innerHTML = t; }

  var AV = (window.webapis && webapis.avplay) ? webapis.avplay : null;

  // Registra teclas de mídia do controle remoto.
  try {
    if (window.tizen && tizen.tvinputdevice) {
      ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop'].forEach(function (k) {
        try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
      });
    }
  } catch (e) {}

  function toggle() {
    try { if (AV.getState() === 'PLAYING') AV.pause(); else AV.play(); } catch (e) {}
  }
  function close() {
    try { AV.stop(); AV.close(); } catch (e) {}
    try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
  }

  document.addEventListener('keydown', function (e) {
    switch (e.keyCode) {
      case 10009: case 10182: close(); break;      // RETURN / EXIT
      case 13: case 10252: toggle(); break;         // Enter / MediaPlayPause
    }
  });

  function start() {
    if (!AV) { say('webapis.avplay indisponível (não é TV Tizen?)'); return; }
    try {
      say('Abrindo stream&hellip;<br><span style="font-size:22px">' + URL_TO_PLAY + '</span>');
      try { AV.close(); } catch (e) {}
      AV.open(URL_TO_PLAY);
      AV.setDisplayRect(0, 0, 1920, 1080);
      AV.setListener({
        onbufferingstart: function () { say('Buffering&hellip;'); },
        onbufferingprogress: function (p) { say('Buffering ' + p + '%'); },
        onbufferingcomplete: function () { say(''); },
        oncurrentplaytime: function (ms) { say(''); },
        onstreamcompleted: function () { try { AV.seekTo(0); AV.play(); } catch (e) {} },  // loop
        onerror: function (err) { say('ERRO AVPlay: ' + err); }
      });
      AV.prepareAsync(function () {
        try { AV.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) {}
        AV.play();
        say('');
      }, function (err) { say('ERRO prepare: ' + err); });
    } catch (e) { say('EXCEÇÃO: ' + e); }
  }

  window.onload = start;
})();
