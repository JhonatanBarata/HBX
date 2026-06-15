/* HBX — service worker do PWA (instalável), 14/06/2026.
   MÍNIMO E SEGURO: NÃO cacheia navegações nem assets. Existe só para o app
   ser INSTALÁVEL (ícone na home, tela cheia). Sem cache = é IMPOSSÍVEL
   ressuscitar tela velha (o bug do PWA antigo "hbx-pwa-v1"). Rede sempre.

   URL próprio (/hbx-sw.js), separado do kill-switch antigo (/sw.js). Não
   adicionar cache aqui sem ordem do dono — o ganho de offline não vale o
   risco de servir página obsoleta. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* Handler de fetch INERTE: presente (satisfaz o critério de instalabilidade de
   navegadores antigos) mas não chama respondWith — o navegador trata tudo pela
   rede, como se não houvesse SW. Nada é interceptado, nada é cacheado. */
self.addEventListener("fetch", () => { /* passa direto pra rede */ });
