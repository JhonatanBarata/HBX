#!/usr/bin/env node
/**
 * PORTÃO ANTES×DEPOIS DO MOCK — refatoração interna não pode mudar UM pixel.
 *
 *     node scripts/casca-antes-e-depois.js [commit]                 (padrão: HEAD)
 *     node scripts/casca-antes-e-depois.js --app vendas [commit]
 *
 * O `casca-conferir` compara MOCK × PELE — numa refatoração do próprio mock os
 * dois mudam JUNTOS e ele fica verde mesmo com a tela mudada (lição paga na
 * fiação da pele 2.0). ESTE portão compara o mock DE AGORA (árvore) com o mock
 * de um commit (HEAD por padrão): 32 telas × 2 modos, pixel a pixel.
 *
 * É o instrumento da tokenização (F1 do PR06082026-RECOMECO-LOGISTICA2):
 * trocar 404 hex por token TEM que passar aqui com 62/62 idênticas.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { resolverApp, semFlagDeApp } = require('./lib/apps');

const raiz = path.join(__dirname, '..');
// `--app <nome>` escolhe QUAL mock é medido; o commit continua posicional.
// 🔴 O flag sai da lista ANTES de ler o posicional: sem isso `--app` viraria o
// commit e o `git show` reprovaria com uma mensagem que não explica nada.
const ALVO = resolverApp(process.argv);
const REL = ALVO.mockRel;
const commit = semFlagDeApp(process.argv)[2] || 'HEAD';

const antesHtml = execFileSync('git', ['show', `${commit}:${REL}`], {
  cwd: raiz, maxBuffer: 64 * 1024 * 1024,
}).toString('utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'casca-antes-'));
const ANTES = path.join(tmp, 'antes.html');
fs.writeFileSync(ANTES, antesHtml);

const urlDe = (p) => 'file:///' + p.replace(/\\/g, '/');
const MODOS = ['escuro', 'claro'];

// Mesmo palco do casca-conferir: sem zoom/notch/status/animação, caixa cravada.
const PALCO = `*,*::before,*::after{animation:none!important;transition:none!important}
body{margin:0;display:block;overflow:hidden;background:#06090f}
.phone{zoom:1;padding:0;width:auto;height:auto;background:none;box-shadow:none;border-radius:0}
.doc-top,.rail{display:none!important}
.stage{padding:0;background:none;overflow:visible}
.notch{display:none!important}
.status{display:none!important}
.app{position:fixed;top:0;left:0;width:412px!important;height:940px!important;border-radius:0!important}`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 940 }, deviceScaleFactor: 1 });

  const abrir = async (url, rotulo) => {
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(`${rotulo}: ${e.message}`));
    await p.goto(url);
    await p.waitForTimeout(400);
    await p.addStyleTag({ content: PALCO });
    return { p, erros };
  };

  const agora = await abrir(urlDe(path.join(raiz, REL)), 'árvore');
  const base = await abrir(urlDe(ANTES), `mock@${commit}`);

  const telas = await agora.p.evaluate(() => ORDEM);
  const telasBase = await base.p.evaluate(() => ORDEM);

  /* 🔴 AQUECIMENTO — a PRIMEIRA medição do loop era um FALSO POSITIVO (11/08).
     Provado do jeito que não deixa dúvida: rodando este portão com o MESMO
     arquivo dos dois lados ele acusava `escuro/entrada`, sempre. O primeiro
     screenshot depois do `addStyleTag` sai com a página ainda assentando
     (fonte, compositor), e quem paga é a primeira tela da ORDEM — e ela é
     sempre a mesma, então o alarme parecia um defeito de verdade naquela tela.
     Portão que reprova o inocente é portão que se aprende a ignorar: aqui cada
     lado tira um retrato de descarte antes de a régua começar a valer. */
  for (const lado of [agora, base]) {
    await lado.p.evaluate(([t]) => { anterior = atual; atual = t; pintar(false); }, [telas[0]]);
    await lado.p.waitForTimeout(120);
    await lado.p.locator('.app').screenshot();
  }

  let iguais = 0; const diferentes = [];
  for (const modo of MODOS) {
    for (const k of telas) {
      const pintarEm = async (lado, existe) => {
        if (!existe) return null;
        await lado.p.evaluate(([t, m]) => {
          document.documentElement.dataset.luz = m;
          document.documentElement.dataset.luzEscolha = m;
          anterior = atual; atual = t; pintar(false);
        }, [k, modo]);
        await lado.p.waitForTimeout(60);
        return lado.p.locator('.app').screenshot();
      };
      const [a, b] = await Promise.all([
        pintarEm(agora, true),
        pintarEm(base, telasBase.includes(k)),
      ]);
      if (b === null) { diferentes.push(`${modo}/${k} (tela NOVA — não existe em ${commit})`); continue; }
      if (a.equals(b)) iguais++;
      else diferentes.push(`${modo}/${k}`);
    }
  }
  const total = telas.length * MODOS.length;
  if (diferentes.length === 0) {
    console.log(`✓ ${iguais}/${total} IDÊNTICAS — a refatoração não moveu um pixel (árvore == ${commit}).`);
  } else {
    console.log(`✗ ${diferentes.length} de ${total} DIFERENTES do mock@${commit}:`);
    diferentes.forEach((d) => console.log('   ' + d));
    console.log('\nSe a diferença é INTENCIONAL (o dono mexeu no desenho), o portão não se aplica a ela.');
  }
  [...agora.erros, ...base.erros].forEach((e) => console.log('  erro: ' + e));
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(diferentes.length === 0 ? 0 : 1);
})();
