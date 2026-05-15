/* HBX PWA service worker */
const CACHE_VERSION = "hbx-pwa-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const NAVIGATION_CACHE = `${CACHE_VERSION}-navigation`;
const OFFLINE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HBX offline</title>
  <style>
    :root { color-scheme: dark; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #040816;
      color: #e6eef9;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
    }
    main {
      width: min(420px, 100%);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 24px;
      padding: 24px;
      background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
      box-shadow: 0 28px 80px rgba(0,0,0,.32);
    }
    strong { display: block; font-size: 1.4rem; }
    p { color: #9fb0c2; line-height: 1.55; }
    a { color: #70d6ff; font-weight: 800; }
  </style>
</head>
<body>
  <main>
    <strong>HBX sem conexão</strong>
    <p>Não foi possível carregar a tela agora. Verifique sua conexão e tente novamente.</p>
    <a href="/login">Voltar ao login</a>
  </main>
</body>
</html>`;

const STATIC_PATH_PREFIXES = [
  "/_next/static/",
  "/icons/",
  "/hbx-visuals/",
  "/login-media/",
];

const STATIC_FILE_EXTENSIONS = [
  ".css",
  ".js",
  ".mjs",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".gif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
];

function isApiRequest(requestUrl) {
  return requestUrl.pathname.startsWith("/hbx/api") || requestUrl.pathname.startsWith("/api");
}

function hasAuthorization(request) {
  return request.headers.has("authorization");
}

function isCacheableStaticRequest(requestUrl) {
  if (requestUrl.origin !== self.location.origin) return false;
  if (STATIC_PATH_PREFIXES.some((prefix) => requestUrl.pathname.startsWith(prefix))) return true;
  return STATIC_FILE_EXTENSIONS.some((extension) => requestUrl.pathname.endsWith(extension));
}

function canCacheResponse(response) {
  if (!response || !response.ok) return false;
  const cacheControl = response.headers.get("cache-control") || "";
  return !/no-store|private/i.test(cacheControl);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("hbx-pwa-") && !key.startsWith(CACHE_VERSION))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(NAVIGATION_CACHE);
  try {
    const response = await fetch(request);
    if (canCacheResponse(response)) {
      await cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (canCacheResponse(response)) {
        void cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    })
    .catch(() => cached || new Response("", { status: 504, statusText: "Gateway Timeout" }));

  return cached || networkPromise;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (isApiRequest(requestUrl) || hasAuthorization(request)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCacheableStaticRequest(requestUrl)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
