/* screens/welcome.js — splash + autologin (espelha WelcomeActivity). */
(function () {
  Router.register('welcome', {
    render: function () {
      return '' +
        '<div class="screen center">' +
          '<div class="brand">UniTV<small>IPTV • LIVE • MOVIES • MATCH</small></div>' +
          '<div class="tagline" id="wl-status">Iniciando…</div>' +
        '</div>';
    },
    mounted: function () {
      var status = document.getElementById('wl-status');
      // Fluxo do WelcomeActivity: checa versão/device → autologin por token → Home; senão Login.
      setTimeout(function () {
        if (AuthApi.isLoggedIn()) {
          status.textContent = 'Entrando…';
          AuthApi.profile().then(function () {
            Router.resetTo('home');
          }).catch(function () {
            Router.resetTo('login');
          });
        } else {
          Router.resetTo('login');
        }
      }, 900);
    },
    onKey: function () { return true; } // ignora teclas durante o splash
  });
})();
