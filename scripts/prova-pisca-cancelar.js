#!/usr/bin/env node
/**
 * PROVA DO PISCA DO CANCELAR (11/08) — o repinte tardio re-tocava a VOLTA.
 *
 *     node scripts/prova-pisca-cancelar.js
 *     node scripts/prova-pisca-cancelar.js --antes    (só MEDE, não reprova)
 *
 * Cena do dono: no mapa da rota montada, Cancelar → Sim → a tela PISCA uma vez
 * a cena de "voltar da navegação" antes de assentar. A raiz não é o cancelar:
 * é a CAMADA. Quem volta do GPS veste `entra cheio voltando` e as marcas só
 * saem na PRÓXIMA troca de tela — e o bypass de herança do `pintar()` deixava
 * `cheio` herdar PRA SEMPRE, sem janela. O 1º repinte do cancelar herdava as
 * marcas, o carimbo de relógio já não valia (t > teto), e o `mvCheioVolta`
 * (520 ms, o gesto de sair da navegação) tocava do quadro ZERO na cara do dono.
 *
 * Mede no MOCK (a fonte do `pintar()`), não no index.html do APK: entrar na
 * tela de dirigir sobe o maplibre, e o WebGL do chromium headless derruba o
 * renderer no meio da medida ("context destroyed"). A mecânica do pisca é
 * TODA do pintar, e o `casca-conferir` já prova mock ≡ casca, byte a byte.
 */
const path = require('path');
const { chromium } = require('playwright');

const APP = 'file:///' + path
  .join(__dirname, '..', 'docs/mockups/logistica2.0/logistica-2.0.html')
  .replace(/\\/g, '/');

const ok = [];
const falhou = [];
const notas = [];
const eh = (nome, cond, det) => (cond ? ok : falhou).push(nome + (cond ? '' : `  [${det}]`));
const nota = (t) => notas.push(t);
const SO_MEDIR = process.argv.includes('--antes');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 940 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => falhou.push('ERRO DE PAGINA: ' + e.message));

  await p.goto(APP);
  // a abertura anda sozinha; o que importa é sair dela antes de medir camada
  await p.waitForTimeout(4200);

  /* a régua de leitura: a camada VIVA (a última — mesma lei do pintar) com as
     classes dela e toda animação `mvCheioVolta` rodando, com o relógio. */
  const MEDIR = `(() => {
    const c = [...document.querySelectorAll('#app .tela')].pop();
    const an = (c && c.getAnimations ? c.getAnimations({ subtree: true }) : [])
      .filter((a) => a.animationName === 'mvCheioVolta')
      .map((a) => Math.round(Number(a.currentTime) || 0));
    return { classes: c ? c.className : '(sem camada)', volta: an };
  })()`;

  // ida e VOLTA do GPS: é a volta que veste `entra cheio voltando` na camada
  await p.evaluate(() => window.ir('rota'));
  await p.waitForTimeout(1400);
  await p.evaluate(() => window.ir('mapa'));
  await p.waitForTimeout(1400);

  /* P0+P2 numa tacada só, com o relógio DENTRO da página (roundtrip do
     Playwright não entra na conta): volta pra rota, mede a troca no nascimento,
     repinta aos 300 ms (DENTRO da volta de 520 ms) e mede aos 460 ms. */
  const dentro = await p.evaluate((MEDIR2) => new Promise((fim) => {
    let n = 0;
    window.ir('rota');
    const aoNascer = eval(MEDIR2);
    setTimeout(() => {
      n += 1; window.usarDados('rota', { kpiParadas: 'pisca-dentro-' + n });
      setTimeout(() => fim({ aoNascer, depois: eval(MEDIR2) }), 160);
    }, 300);
  }), MEDIR);
  nota(`[dentro] nasce: ${dentro.aoNascer.classes} · mvCheioVolta=${JSON.stringify(dentro.aoNascer.volta)}`);
  nota(`         aos ~460ms (repinte aos 300): ${depoisTxt(dentro.depois)}`);
  eh('P0 · a VOLTA do GPS continua vestindo cheio+voltando na troca',
    /voltando/.test(dentro.aoNascer.classes) && dentro.aoNascer.volta.length >= 1,
    dentro.aoNascer.classes);
  eh('P2 · repinte DENTRO da volta herda e CONTINUA o relógio (não zera)',
    dentro.depois.volta.length >= 1 && Math.max(...dentro.depois.volta, 0) > 250,
    JSON.stringify(dentro.depois));

  // agora a janela fecha: volta terminada, camada parada há mais de 1 s
  await p.waitForTimeout(1400);

  /* P1 — O BUG. Repinte tardio (é o que o cancelar faz: `esquecerRotaCarregada`
     escreve no seam) não pode re-tocar a volta. Antes do fix: a camada nova
     herdava `entra cheio voltando` e o mvCheioVolta nascia do zero. */
  const tarde = await p.evaluate((MEDIR2) => new Promise((fim) => {
    window.usarDados('rota', { kpiParadas: 'pisca-tarde-1' });
    setTimeout(() => fim(eval(MEDIR2)), 160);
  }), MEDIR);
  nota(`[tarde] apos repinte tardio: ${tarde.classes} · mvCheioVolta=${JSON.stringify(tarde.volta)}`);
  eh('P1 · repinte TARDIO nao re-toca a volta da navegacao (o pisca do cancelar)',
    tarde.volta.length === 0, `classes="${tarde.classes}" volta=${JSON.stringify(tarde.volta)}`);

  /* P3 — e o repinte seguinte também nasce parado (o pisca era 1 por escrita) */
  const tarde2 = await p.evaluate((MEDIR2) => new Promise((fim) => {
    window.usarDados('rota', { kpiParadas: 'pisca-tarde-2' });
    setTimeout(() => fim(eval(MEDIR2)), 160);
  }), MEDIR);
  eh('P3 · toda escrita tardia nasce parada, nao so a primeira',
    tarde2.volta.length === 0, JSON.stringify(tarde2));

  await b.close();
  console.log('\n=== MEDIDAS ===');
  notas.forEach((n) => console.log('  · ' + n));
  console.log('\n=== PROVA: pisca do cancelar (camada voltando) ===');
  ok.forEach((n) => console.log('  ok  ' + n));
  falhou.forEach((n) => console.log('  XX  ' + n));
  console.log('\n' + ok.length + '/' + (ok.length + falhou.length));
  process.exit(SO_MEDIR ? 0 : (falhou.length ? 1 : 0));
})();

function depoisTxt(d) {
  return `${d.classes} · mvCheioVolta=${JSON.stringify(d.volta)}`;
}
