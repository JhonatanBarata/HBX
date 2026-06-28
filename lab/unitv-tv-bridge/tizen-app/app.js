(function () {
  "use strict";

  var bridge = "http://192.168.0.14:8090";
  var stream = bridge + "/live/index.m3u8";
  var overlay = document.getElementById("overlay");
  var message = document.getElementById("message");
  var status = document.getElementById("status");
  var dot = document.getElementById("status-dot");
  var htmlPlayer = document.getElementById("html-player");
  var usingAvPlay = Boolean(window.webapis && webapis.avplay);
  var playing = false;

  function setStatus(kind, title, detail) {
    dot.className = "dot" + (kind ? " " + kind : "");
    status.textContent = title;
    message.textContent = detail;
    overlay.classList.remove("hidden");
  }

  function request(path, method) {
    return fetch(bridge + path, {
      method: method || "GET",
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    });
  }

  function avPlay() {
    try { webapis.avplay.close(); } catch (_) {}
    webapis.avplay.open(stream + "?t=" + Date.now());
    webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
    webapis.avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
    webapis.avplay.setListener({
      onbufferingstart: function () {
        setStatus("", "buffering", "Carregando o stream local…");
      },
      onbufferingcomplete: function () {
        playing = true;
        overlay.classList.add("hidden");
      },
      onstreamcompleted: function () {
        playing = false;
        setStatus("", "encerrado", "O stream terminou. Pressione OK para reconectar.");
      },
      onerror: function (error) {
        playing = false;
        setStatus("error", "erro AVPlay", String(error));
      },
      onevent: function () {},
      ondrmevent: function () {},
      onsubtitlechange: function () {}
    });
    webapis.avplay.prepareAsync(function () {
      webapis.avplay.play();
    }, function (error) {
      setStatus("error", "falha ao preparar", String(error && error.message || error));
    });
  }

  function htmlPlay() {
    htmlPlayer.style.display = "block";
    htmlPlayer.src = stream + "?t=" + Date.now();
    htmlPlayer.play().then(function () {
      playing = true;
      overlay.classList.add("hidden");
    }).catch(function (error) {
      setStatus("error", "erro HTML5", error.message);
    });
  }

  function play() {
    setStatus("", "conectando", "Abrindo H.264/HLS do computador…");
    request("/api/status").then(function (data) {
      if (!data.playlistReady) {
        throw new Error("Bridge online, mas o stream ainda não foi iniciado.");
      }
      if (usingAvPlay) avPlay(); else htmlPlay();
    }).catch(function (error) {
      setStatus("error", "bridge indisponível", error.message);
    });
  }

  function startTest() {
    setStatus("", "iniciando teste", "Gerando vídeo e áudio por CPU no computador…");
    request("/api/start?mode=test", "POST").then(function () {
      setTimeout(play, 1800);
    }).catch(function (error) {
      setStatus("error", "não iniciou", error.message);
    });
  }

  function stop() {
    try { if (usingAvPlay) webapis.avplay.close(); } catch (_) {}
    htmlPlayer.pause();
    playing = false;
    request("/api/stop", "POST").finally(function () {
      setStatus("", "parado", "Bridge interrompido. Vermelho gera o vídeo de teste.");
    });
  }

  function exitApp() {
    try { if (usingAvPlay) webapis.avplay.close(); } catch (_) {}
    if (window.tizen && tizen.application) {
      tizen.application.getCurrentApplication().exit();
    }
  }

  function registerKeys() {
    if (!window.tizen || !tizen.tvinputdevice) return;
    ["ColorF0Red", "ColorF1Green", "MediaPlayPause"].forEach(function (key) {
      try { tizen.tvinputdevice.registerKey(key); } catch (_) {}
    });
  }

  document.addEventListener("keydown", function (event) {
    switch (event.keyCode) {
      case 13: play(); break;
      case 10009: exitApp(); break;
      case 403: startTest(); break;
      case 404: stop(); break;
      case 10252:
        if (playing && usingAvPlay) {
          try { webapis.avplay.pause(); playing = false; } catch (_) {}
        } else {
          play();
        }
        break;
    }
  });

  registerKeys();
  request("/api/status").then(function (data) {
    if (data.playlistReady) {
      setStatus("online", "bridge online", "Pressione OK para assistir.");
    } else {
      setStatus("online", "bridge online", "Pressione Vermelho para gerar o teste.");
    }
  }).catch(function () {
    setStatus("error", "bridge offline", "Inicie o bridge no PC em 192.168.0.14:8090.");
  });
}());
