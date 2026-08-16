/* keys.js — códigos do controle remoto Samsung + registro das teclas de mídia.
 * Referência Tizen TV keyCodes. As teclas "extra" (mídia, coloridas, Info, Ch±)
 * precisam ser registradas via tizen.tvinputdevice.registerKey. */
(function () {
  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 10009, RETURN: 10009, EXIT: 10182,
    MEDIA_PLAY_PAUSE: 10252, MEDIA_PLAY: 415, MEDIA_PAUSE: 19,
    MEDIA_STOP: 413, MEDIA_REWIND: 412, MEDIA_FF: 417,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
    INFO: 457, CH_UP: 427, CH_DOWN: 428,
    N0: 48, N1: 49, N2: 50, N3: 51, N4: 52, N5: 53, N6: 54, N7: 55, N8: 56, N9: 57,
    // teclas úteis para debug em teclado (dev no browser): 'Backspace' etc.
    KB_BACKSPACE: 8, KB_ESC: 27
  };

  // Nomes que precisam ser registrados no runtime da TV.
  var REGISTER = [
    'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
    'MediaRewind', 'MediaFastForward',
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    'Info', 'ChannelUp', 'ChannelDown',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
  ];

  function registerKeys() {
    if (!(window.tizen && tizen.tvinputdevice)) return; // browser dev: ignora
    REGISTER.forEach(function (name) {
      try { tizen.tvinputdevice.registerKey(name); } catch (e) {}
    });
  }

  // Normaliza um KeyboardEvent para uma "ação" lógica da app.
  function toAction(code) {
    switch (code) {
      case KEY.LEFT: return 'left';
      case KEY.UP: return 'up';
      case KEY.RIGHT: return 'right';
      case KEY.DOWN: return 'down';
      case KEY.ENTER: return 'enter';
      case KEY.BACK: case KEY.KB_BACKSPACE: case KEY.KB_ESC: return 'back';
      case KEY.EXIT: return 'exit';
      case KEY.MEDIA_PLAY_PAUSE: return 'playpause';
      case KEY.MEDIA_PLAY: return 'play';
      case KEY.MEDIA_PAUSE: return 'pause';
      case KEY.MEDIA_STOP: return 'stop';
      case KEY.MEDIA_REWIND: return 'rewind';
      case KEY.MEDIA_FF: return 'forward';
      case KEY.RED: return 'red';
      case KEY.GREEN: return 'green';
      case KEY.YELLOW: return 'yellow';
      case KEY.BLUE: return 'blue';
      case KEY.INFO: return 'info';
      case KEY.CH_UP: return 'chup';
      case KEY.CH_DOWN: return 'chdown';
      default:
        if (code >= KEY.N0 && code <= KEY.N9) return 'num:' + (code - KEY.N0);
        return null;
    }
  }

  window.Keys = { KEY: KEY, registerKeys: registerKeys, toAction: toAction };
})();
