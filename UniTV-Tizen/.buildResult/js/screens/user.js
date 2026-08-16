/* screens/user.js — UserCenterActivity: perfil, plano/VIP e atalhos (histórico, pedidos,
 * cupons, convite, compra, segurança, ajustes). Cada item espelha uma Activity do módulo mine. */
(function () {
  Router.register('user', {
    render: function () {
      var u = Store.user || {};
      var vip = u.vip ? ('VIP até ' + (u.expire || '-')) : 'Sem plano ativo';
      return '<div class="page-title">Minha Conta</div>' +
        '<div class="list">' +
          '<div class="item"><span>' + UI.esc(u.nick || u.account || 'Usuário') + '</span><span class="v">' + vip + '</span></div>' +
          item('history', '▶ Continuar assistindo') +
          item('purchase', '💳 Comprar / Renovar plano') +
          item('orders', '🧾 Histórico de compras') +
          item('coupons', '🎟 Cupons') +
          item('invite', '👥 Convidar amigos') +
          item('security', '🔒 Segurança da conta') +
          item('settings', '⚙ Ajustes') +
          item('logout', '⏻ Sair da conta') +
        '</div>';
    },
    mounted: function () {
      wire('history', function () { UserApi.history().then(function (h) { UI.toast(h.length + ' itens no histórico (demo).'); }); });
      wire('purchase', function () { UserApi.purchaseQr().then(function (r) { UI.toast('Escaneie o QR para pagar: ' + (r.link || '')); }); });
      wire('orders', function () { UserApi.orders().then(function (o) { UI.toast(o.length + ' pedidos (demo).'); }); });
      wire('coupons', function () { UserApi.coupons().then(function (c) { UI.toast(c.length + ' cupons (demo).'); }); });
      wire('invite', function () { UserApi.invite().then(function (i) { UI.toast('Seu código: ' + i.code); }); });
      wire('security', function () { UI.toast('Segurança: bind e-mail/telefone e trocar senha (a implementar com API real).'); });
      wire('settings', function () { Router.go('settings'); });
      wire('logout', function () { AuthApi.logout().then(function () { Router.resetTo('login'); }); });
    }
  });

  function item(id, label) { return '<div class="item focusable" data-act="' + id + '"><span>' + label + '</span><span class="v">›</span></div>'; }
  function wire(id, fn) { var el = document.querySelector('.item[data-act="' + id + '"]'); if (el) el._onEnter = fn; }
})();
