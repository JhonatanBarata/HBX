/*
 * config.js — ÚNICO arquivo que você precisa editar para "ligar" o app no seu portal.
 *
 * Os hosts reais (API/EPG/mídia) estão criptografados dentro do APK Android e são
 * resolvidos em runtime — por isso NÃO vêm preenchidos aqui. Capture-os uma vez com
 * um proxy (mitmproxy/Charles) rodando o app Android e faça login; veja README §4.
 *
 * Depois preencha BASE_URL e ajuste ENDPOINTS conforme o que o proxy mostrar.
 * Seu usuário/senha comprado é enviado no login normalmente — nada dele fica aqui.
 */
window.CONFIG = {
  APP_NAME: 'UniTV',
  APP_VERSION: '4.19.1',

  // >>> PREENCHA com a base capturada no proxy (ex.: 'https://api.seuportal.com') <<<
  BASE_URL: '',

  // Chave de portal/tenant extraída do APK (meta-data PORTAL_KEY, já decodificada de hex).
  // Muitos backends CoolX exigem isto num header ou no body do login/bootstrap.
  PORTAL_KEY: 'bQ4xD8uHnZ+YnoR67A0UmJuHNQwyftyEs7yvPtrcemxNzu4ismBQYw==',

  // coolx_type do manifest (build "live").
  COOLX_TYPE: 'live',

  // Canvas lógico de design (o app Android foi desenhado em 1920x1080).
  DESIGN_W: 1920,
  DESIGN_H: 1080,

  // Firebase (extraído do APK) — só necessário se for reusar push/analytics. Opcional.
  FIREBASE: {
    projectId: 'unitv-kh3',
    appId: '1:373016554559:android:96dbbbe239c4911fe95c8a',
    apiKey: 'AIzaSyCmcq8rNyTaJpj2OpVvpTzpfrPfnMwg2jE',
    messagingSenderId: '373016554559',
    databaseURL: 'https://unitv-kh3.firebaseio.com',
    storageBucket: 'unitv-kh3.appspot.com'
  },

  // Mapa de endpoints. Ajuste os PATHS conforme o proxy revelar. Estes são
  // placeholders com nomes comuns dos backends IPTV CoolX/白标.
  ENDPOINTS: {
    bootstrap:      '/api/app/init',        // resolve config/host dinâmico + geofence
    login:          '/api/user/login',      // { account, password, deviceId, portalKey }
    activate:       '/api/user/activate',   // { code: "EGx-...." }
    logout:         '/api/user/logout',
    refresh:        '/api/user/refresh',    // renova token
    profile:        '/api/user/info',       // dados do plano/VIP/expiração
    forcePwd:       '/api/user/password',

    liveCategories: '/api/live/categories',
    liveChannels:   '/api/live/channels',   // ?categoryId=
    liveEpg:        '/api/live/epg',         // ?channelId=&date=
    livePlayUrl:    '/api/live/play',        // ?channelId= -> { url: '...m3u8' }

    vodCategories:  '/api/vod/categories',
    vodList:        '/api/vod/list',         // ?categoryId=&page=&filter=
    vodDetail:      '/api/vod/detail',       // ?vodId=
    vodPlayUrl:     '/api/vod/play',         // ?vodId=&episodeId=&quality= -> { url, subtitles[] }
    vodSearch:      '/api/vod/search',       // ?kw=
    vodTopic:       '/api/vod/topic',

    matchSchedule:  '/api/match/schedule',
    matchDetail:    '/api/match/detail',
    matchRank:      '/api/match/rank',

    orders:         '/api/user/orders',
    history:        '/api/user/history',
    coupons:        '/api/user/coupons',
    invite:         '/api/user/invite',
    purchaseQr:     '/api/pay/qrcode'
  },

  // Headers padrão enviados em toda requisição. Ajuste conforme o proxy.
  staticHeaders: {
    'Content-Type': 'application/json',
    'X-App-Version': '4.19.1',
    'X-Platform': 'tizen'
  },

  // Timeout de rede (ms) e política de retry.
  HTTP_TIMEOUT: 15000,

  // true = usa dados de exemplo (mock) sem servidor, para navegar a UI e testar AVPlay.
  // Coloque false quando BASE_URL estiver preenchido.
  MOCK: true,

  // Stream HLS público usado no modo MOCK para validar o AVPlay no player.
  MOCK_HLS: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
};
