import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import { OPENING_SOURCE } from '../config.mjs';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function injectBefore(html, marker, content) {
  const index = html.lastIndexOf(marker);
  if (index < 0) throw new Error(`Não encontrei ${marker} em opening.html.`);
  return `${html.slice(0, index)}${content}\n${html.slice(index)}`;
}

async function marketingOpening(url) {
  const source = await fs.readFile(OPENING_SOURCE, 'utf8');
  const title = escapeHtml(url.searchParams.get('title') || 'HBX ENTREGAS');
  const subtitle = escapeHtml(url.searchParams.get('subtitle') || 'Rotas, clientes e recebimentos na mesma operação.');
  const eyebrow = escapeHtml(url.searchParams.get('eyebrow') || 'SUA OPERAÇÃO NA ROTA CERTA');

  const style = `
<style id="hbx-video-opening-mode">
  .pairing { display:none !important; }
  .hbx-video-opening-outro {
    position:absolute; inset:0; z-index:20; display:grid; place-items:center;
    padding:28px; text-align:center; opacity:0; pointer-events:none;
    background:radial-gradient(circle at 50% 38%,rgba(0,229,255,.16),transparent 31%),linear-gradient(180deg,#080d1e,#050713);
    animation:hbxVideoOutroIn .7s 5.04s cubic-bezier(.22,1,.36,1) forwards;
  }
  .hbx-video-opening-outro::before {
    content:""; position:absolute; width:220px; height:220px; border-radius:50%;
    border:1px solid rgba(0,229,255,.22); box-shadow:0 0 90px rgba(46,91,255,.22),inset 0 0 55px rgba(0,229,255,.08);
    animation:hbxVideoOutroOrbit 7s linear infinite;
  }
  .hbx-video-opening-copy { position:relative; z-index:1; width:min(100%,360px); }
  .hbx-video-opening-mark {
    width:76px; height:76px; margin:0 auto 27px; display:grid; place-items:center; border-radius:25px;
    font-size:22px; font-weight:950; letter-spacing:-.06em; color:#fff;
    background:linear-gradient(145deg,rgba(46,91,255,.42),rgba(0,229,255,.16));
    border:1px solid rgba(125,225,255,.36); box-shadow:0 20px 70px rgba(0,0,0,.42),0 0 40px rgba(0,229,255,.18);
  }
  .hbx-video-opening-eyebrow { color:#9aea35; font-size:9px; font-weight:900; letter-spacing:.22em; }
  .hbx-video-opening-title { margin:13px 0 0; font-size:clamp(38px,11vw,54px); line-height:.93; letter-spacing:-.065em; }
  .hbx-video-opening-subtitle { max-width:330px; margin:20px auto 0; color:#aabbd8; font-size:13px; line-height:1.55; }
  @keyframes hbxVideoOutroIn { from{opacity:0;transform:scale(1.05);filter:blur(5px)} to{opacity:1;transform:none;filter:none} }
  @keyframes hbxVideoOutroOrbit { to{transform:rotate(360deg)} }
</style>`;

  const markup = `
<section class="hbx-video-opening-outro" aria-label="${title}">
  <div class="hbx-video-opening-copy">
    <div class="hbx-video-opening-mark">HBX</div>
    <div class="hbx-video-opening-eyebrow">${eyebrow}</div>
    <h2 class="hbx-video-opening-title">${title}</h2>
    <p class="hbx-video-opening-subtitle">${subtitle}</p>
  </div>
</section>`;

  let html = injectBefore(source, '</head>', style);
  html = injectBefore(html, '</main>', markup);
  html = injectBefore(html, '</body>', '<script>document.documentElement.dataset.hbxVideoReady="1";</script>');
  return html;
}

function cardHtml(url) {
  const title = escapeHtml(url.searchParams.get('title') || 'HBX Entregas');
  const subtitle = escapeHtml(url.searchParams.get('subtitle') || 'Sua operação na rota certa.');
  const eyebrow = escapeHtml(url.searchParams.get('eyebrow') || 'HBX SYSTEM');
  const cta = escapeHtml(url.searchParams.get('cta') || '');
  const step = escapeHtml(url.searchParams.get('step') || '');
  const compact = url.searchParams.get('compact') === '1';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>${title}</title>
  <style>
    :root{color-scheme:dark;--bg:#050713;--bg2:#0a1125;--blue:#2e5bff;--cyan:#00e5ff;--lime:#9aea35;--ink:#f8fbff;--muted:#9eacc6;--spring:cubic-bezier(.22,1,.36,1)}
    *{box-sizing:border-box} html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#03050c}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
    .stage{position:relative;width:100vw;height:100dvh;display:grid;place-items:center;isolation:isolate;overflow:hidden;background:radial-gradient(circle at 50% 35%,rgba(46,91,255,.24),transparent 28%),radial-gradient(circle at 82% 15%,rgba(0,229,255,.12),transparent 27%),linear-gradient(180deg,var(--bg2),var(--bg) 68%,#02040b)}
    .grid{position:absolute;inset:-18%;z-index:-3;opacity:.24;background-image:linear-gradient(rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.022) 1px,transparent 1px);background-size:34px 34px;transform:perspective(630px) rotateX(63deg) translateY(18%);transform-origin:50% 100%;mask-image:linear-gradient(to top,#000,transparent 76%)}
    .orb{position:absolute;border-radius:50%;filter:blur(82px);opacity:.24}.orb.a{width:320px;height:320px;background:var(--blue);left:-170px;top:8%}.orb.b{width:280px;height:280px;background:var(--cyan);right:-160px;bottom:1%}
    .route{position:absolute;inset:0;width:100%;height:100%;opacity:.9}.route path{fill:none;stroke-linecap:round}.route .ghost{stroke:rgba(111,139,192,.12);stroke-width:1}.route .live{stroke:url(#g);stroke-width:2.4;path-length:1;stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.4s .2s var(--spring) forwards,glow 2.2s 1.5s ease-in-out infinite}.route .live.b{animation-delay:.55s,1.8s}.route .live.c{animation-delay:.9s,2.1s}@keyframes draw{to{stroke-dashoffset:0}}@keyframes glow{50%{opacity:.52;stroke-width:3}}
    .content{position:relative;z-index:2;width:min(88vw,370px);text-align:center;animation:enter .82s .1s var(--spring) both}
    .mark{position:relative;width:${compact ? 66 : 84}px;height:${compact ? 66 : 84}px;margin:0 auto ${compact ? 20 : 29}px;display:grid;place-items:center;border-radius:${compact ? 21 : 27}px;font-size:${compact ? 19 : 24}px;font-weight:950;letter-spacing:-.065em;background:linear-gradient(145deg,rgba(46,91,255,.5),rgba(0,229,255,.15));border:1px solid rgba(122,222,255,.38);box-shadow:0 22px 75px rgba(0,0,0,.42),0 0 0 8px rgba(0,229,255,.025),0 0 45px rgba(0,229,255,.17)}
    .mark::after{content:"";position:absolute;inset:-16px;border-radius:34px;border:1px solid rgba(0,229,255,.13);animation:pulse 2.3s ease-in-out infinite}
    .step{min-height:18px;margin-bottom:8px;color:#7787a7;font-size:9px;font-weight:900;letter-spacing:.22em}.eyebrow{color:var(--lime);font-size:9px;font-weight:900;letter-spacing:.23em}.title{margin:14px 0 0;font-size:${compact ? 'clamp(34px,9vw,44px)' : 'clamp(42px,11vw,58px)'};line-height:.94;letter-spacing:-.065em;text-wrap:balance}.subtitle{max-width:340px;margin:21px auto 0;color:var(--muted);font-size:${compact ? 12 : 14}px;line-height:1.55;text-wrap:balance}.cta{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:29px;padding:0 23px;border:1px solid rgba(132,235,255,.3);border-radius:999px;background:linear-gradient(135deg,rgba(46,91,255,.42),rgba(0,229,255,.14));box-shadow:0 16px 42px rgba(0,0,0,.3);font-size:12px;font-weight:850;letter-spacing:.04em;animation:cta 2.4s 1s ease-in-out infinite}
    @keyframes enter{from{opacity:0;transform:translateY(24px) scale(.96);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}@keyframes pulse{50%{opacity:.32;transform:scale(1.06)}}@keyframes cta{50%{transform:translateY(-2px);box-shadow:0 20px 48px rgba(0,0,0,.36),0 0 24px rgba(0,229,255,.12)}}
  </style>
</head>
<body>
  <main class="stage">
    <span class="grid"></span><span class="orb a"></span><span class="orb b"></span>
    <svg class="route" viewBox="0 0 432 768" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2e5bff"/><stop offset=".55" stop-color="#00e5ff"/><stop offset="1" stop-color="#9aea35"/></linearGradient></defs><path class="ghost" d="M-10 190C80 120 175 265 258 170S380 96 455 160"/><path class="ghost" d="M-20 570C115 480 178 620 275 532S390 435 460 500"/><path class="live" d="M-10 190C80 120 175 265 258 170S380 96 455 160"/><path class="live b" d="M-20 570C115 480 178 620 275 532S390 435 460 500"/><path class="live c" d="M56 744C100 646 200 676 234 585S318 490 402 466"/></svg>
    <section class="content">
      <div class="mark">HBX</div>
      <div class="step">${step}</div>
      <div class="eyebrow">${eyebrow}</div>
      <h1 class="title">${title}</h1>
      <p class="subtitle">${subtitle}</p>
      ${cta ? `<div class="cta">${cta}</div>` : ''}
    </section>
  </main>
  <script>document.documentElement.dataset.hbxVideoReady='1';</script>
</body>
</html>`;
}

export async function startStudioServer({ port = 0 } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (url.pathname === '/opening') {
        const html = await marketingOpening(url);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
        return;
      }
      if (url.pathname === '/card') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(cardHtml(url));
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error instanceof Error ? error.stack || error.message : String(error));
    }
  });

  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor do estúdio não abriu uma porta TCP.');
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    close: async () => {
      server.close();
      await once(server, 'close');
    },
  };
}
