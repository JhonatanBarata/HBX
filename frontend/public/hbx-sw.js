/* HBX — service worker do PWA (instalável), 14/06/2026.
   MÍNIMO E SEGURO: não cacheia navegações nem assets. Existe pra o app ser
   INSTALÁVEL (ícone na home, tela cheia). Rede sempre — é IMPOSSÍVEL ressuscitar
   tela velha (o bug do PWA antigo "hbx-pwa-v1").

   URL próprio (/hbx-sw.js), separado do kill-switch antigo (/sw.js).

   ── 06/08/2026 — o cache da ROTA saiu daqui ─────────────────────────────────
   Existia UMA exceção: o GET da rota do dia (…/logistica/rota) era guardado
   network-first pro entregador abrir "Hoje" sem sinal. Aquilo servia ao
   /entrega, o app de celular que rodava no NAVEGADOR — apagado nesta data (no
   telefone quem trabalha é o APLICATIVO, que tem o próprio armazenamento
   offline, dentro do APK). Sem consumidor, o cache virava só um jeito de a
   tela do computador mostrar dado velho. Voltou a ser um SW sem cache nenhum.
   A limpeza do cache antigo ("hbx-rota-*") continua rodando no activate: quem
   já tem o SW velho instalado não fica com resto no disco. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Enterro do cache da rota (versões "hbx-rota-*" do SW anterior).
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith("hbx-rota-")).map((k) => caches.delete(k)));
      } catch (e) {
        /* sem caches API */
      }
      await self.clients.claim();
    })(),
  );
});

/* Sem listener de fetch: toda requisição vai pra rede como se não houvesse SW. */
