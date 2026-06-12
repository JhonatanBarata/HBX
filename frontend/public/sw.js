/* HBX — service worker DESATIVADO permanentemente (kill-switch).
   O PWA antigo ("hbx-pwa-v1") cacheava navegações inteiras no navegador e
   ficava ressuscitando telas velhas no localhost:3001 e em produção, mesmo
   sem servidor rodando. Este arquivo substitui o SW antigo no mesmo URL
   (/sw.js): apaga todos os caches, desregistra a si mesmo e recarrega as
   abas abertas. NÃO registrar service worker novo sem ordem do dono. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch { /* segue */ }
    try {
      await self.registration.unregister();
    } catch { /* segue */ }
    try {
      const clients = await self.clients.matchAll({ type: "window" });
      await Promise.all(clients.map((client) => client.navigate(client.url)));
    } catch { /* segue */ }
  })());
});

/* Sem handler de fetch de propósito: nada é interceptado, rede sempre. */
