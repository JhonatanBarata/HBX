/* HBX — service worker do PWA (instalável), 14/06/2026.
   MÍNIMO E SEGURO: não cacheia navegações nem assets. Existe pra o app ser
   INSTALÁVEL (ícone na home, tela cheia). Rede sempre — é IMPOSSÍVEL ressuscitar
   tela velha (o bug do PWA antigo "hbx-pwa-v1").

   URL próprio (/hbx-sw.js), separado do kill-switch antigo (/sw.js).

   ── LOGÍSTICA-MOBILE M8 (05/07) — EXCEÇÃO CIRÚRGICA E ADITIVA ────────────────
   Uma ÚNICA rota é cacheada com stale-while-revalidate: o GET da rota do dia
   (…/logistica/rota) — pra o entregador abrir "Hoje" numa zona sem sinal. TODO O
   RESTO continua passando direto pra rede (mesmo comportamento de antes: nada de
   página/asset em cache). Não há risco de ressuscitar tela velha porque só um GET
   de DADOS (JSON) é tocado, e mesmo assim ele SEMPRE revalida em background. */

const ROTA_CACHE = "hbx-rota-v1";

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

/* stale-while-revalidate SÓ pra rota: responde o cache na hora (se houver) e, em
   paralelo, busca a versão fresca e atualiza o cache. Sem sinal → serve o cache;
   sem cache e sem sinal → o fetch rejeita e a UI trata (estado offline honesto). */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(ROTA_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      // Só guarda respostas OK (não cacheia 401/500 — não envenena a rota).
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  // Tem cache → responde já e revalida em background. Sem cache → espera a rede.
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  const fresh = await network;
  if (fresh) return fresh;
  // Sem cache e sem rede: refaz o fetch pra propagar o erro real (a UI mostra offline).
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  // ADITIVO: só intercepta o GET da rota do dia. Todo o resto passa direto pra rede
  // (não chama respondWith → o navegador trata como se não houvesse SW).
  if (isRotaRequest(event.request)) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});
