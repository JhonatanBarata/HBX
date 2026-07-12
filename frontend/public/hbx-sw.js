/* HBX — service worker do PWA (instalável), 14/06/2026.
   MÍNIMO E SEGURO: não cacheia navegações nem assets. Existe pra o app ser
   INSTALÁVEL (ícone na home, tela cheia). Rede sempre — é IMPOSSÍVEL ressuscitar
   tela velha (o bug do PWA antigo "hbx-pwa-v1").

   URL próprio (/hbx-sw.js), separado do kill-switch antigo (/sw.js).

   ── LOGÍSTICA-MOBILE M8 (05/07) — EXCEÇÃO CIRÚRGICA E ADITIVA ────────────────
   Uma ÚNICA rota é cacheada com network-first: o GET da rota do dia
   (…/logistica/rota) — pra o entregador abrir "Hoje" numa zona sem sinal. TODO O
   RESTO continua passando direto pra rede (mesmo comportamento de antes: nada de
   página/asset em cache). Não há risco de ressuscitar tela velha porque só um GET
   de DADOS (JSON) é tocado. Cada sessão tem uma chave opaca própria. */

const ROTA_CACHE = "hbx-rota-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Limpa versões antigas do cache da rota (se um dia mudar o nome).
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith("hbx-rota-") && k !== ROTA_CACHE).map((k) => caches.delete(k)));
      } catch (e) {
        /* sem caches API */
      }
      await self.clients.claim();
    })(),
  );
});

/* Só o GET da rota do dia é o alvo. Casa o caminho da API tanto no proxy
   same-origin (/hbx/api/logistica/rota) quanto na chamada direta (…/logistica/rota).
   Ignora querystring (?date=) na comparação do path. */
function isRotaRequest(request) {
  if (request.method !== "GET") return false;
  try {
    const url = new URL(request.url);
    return url.pathname.endsWith("/logistica/rota");
  } catch (e) {
    return false;
  }
}

async function scopedCacheKey(request) {
  const auth = request.headers.get("Authorization") || "anonymous";
  const bytes = new TextEncoder().encode(auth);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const scope = Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  const url = new URL(request.url);
  url.searchParams.set("__hbx_scope", scope);
  return new Request(url.toString(), { method: "GET" });
}

/* Network-first: cada toque em Atualizar busca a versão fresca. O cache só
   aparece quando a rede falha e nunca cruza usuário/sessão. */
async function networkFirst(request) {
  const cache = await caches.open(ROTA_CACHE);
  const key = await scopedCacheKey(request);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) await cache.put(key, fresh.clone());
    return fresh;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  // ADITIVO: só intercepta o GET da rota do dia. Todo o resto passa direto pra rede
  // (não chama respondWith → o navegador trata como se não houvesse SW).
  if (isRotaRequest(event.request)) {
    event.respondWith(networkFirst(event.request));
  }
});
