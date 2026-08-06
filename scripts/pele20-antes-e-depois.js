#!/usr/bin/env node
/**
 * ANTES × DEPOIS — o mock renderiza igual ao que renderizava?
 *
 *     node scripts/pele20-antes-e-depois.js [ref-git]      (padrão: HEAD)
 *
 * 🔴 POR QUE ISTO EXISTE, E POR QUE O `pele20-conferir` NÃO BASTA.
 * O conferidor compara MOCK × PELE. Numa refatoração de dados (tirar o literal
 * de dentro do template e pôr num objeto), os dois mudam JUNTOS — então ele
 * continua verde mesmo se eu digitar 22% onde era 21%. Identidade preservada,
 * desenho quebrado, e ninguém vê.
 *
 * Este script compara o mock de AGORA com o mock de um commit anterior,
 * renderizando as 33 telas nos 2 modos nos dois. É o portão que prova que
 * "mover o dado" foi mesmo só MOVER.
 *
 * Uso esperado: rodar ANTES de commitar qualquer leva da refatoração de dados,
 * com a ref apontando pro último commit em que a tela estava certa.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const REL = 'docs/mockups/logistica2.0/logistica-2.0.html';
const ref = process.argv[2] || 'HEAD';
const urlDe = (p) => 'file:///' + p.replace(/\\/g, '/');

const antesHtml = execFileSync('git', ['show', `${ref}:${REL}`], { cwd: raiz, maxBuffer: 64 * 1024 * 1024 });
const antesPath = path.join(os.tmpdir(), 'hbx-mock-antes.html');
fs.writeFileSync(antesPath, antesHtml);

const colher = async (page) => {
  const chaves = await page.evaluate(() => Object.keys(T));
  const saida = {};
  for (const modo of ['escuro', 'claro']) {
    await page.evaluate((m) => { document.documentElement.dataset.luz = m; }, modo);
    for (const k of chaves) {
      saida[`${modo}/${k}`] = await page.evaluate((key) => T[key].render(), k);
    }
  }
  return saida;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 940 } });
  const pAntes = await ctx.newPage();
  const pDepois = await ctx.newPage();
  const erros = [];
  pAntes.on('pageerror', (e) => erros.push(`antes: ${e.message}`));
  pDepois.on('pageerror', (e) => erros.push(`depois: ${e.message}`));

  await pAntes.goto(urlDe(antesPath));
  await pDepois.goto(urlDe(path.join(raiz, REL)));

  const antes = await colher(pAntes);
  const depois = await colher(pDepois);
  await browser.close();

  // 🔴 ESPAÇO NÃO É DESENHO. Trocar uma lista escrita à mão por `.map().join('')`
  // muda a quebra de linha e a indentação do HTML — e nada na tela. Misturar isso
  // com mudança de CONTEÚDO faria o portão gritar tanto que eu aprenderia a
  // ignorá-lo. Então ele separa: reflow é nota de rodapé, conteúdo é reprovação.
  const semEspaco = (s) => s.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
  // 🔴 GANCHO TAMBÉM NÃO É DESENHO. `data-acao`/`data-valor` são a fiação que a
  // refatoração ESTÁ instalando de propósito — contá-los como mudança faria o
  // portão reprovar exatamente o trabalho que ele deveria proteger. Tirando os
  // dois, sobra a única pergunta que importa: mudou algo que o dono VÊ?
  const semGancho = (s) => semEspaco(s).replace(/ data-(acao|valor)="[^"]*"/g, '');

  const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].sort();
  const mudaram = [];
  const soEspaco = [];
  for (const k of chaves) {
    if (antes[k] === depois[k]) continue;
    if (antes[k] === undefined) { mudaram.push(`${k}: tela NOVA (não existia em ${ref})`); continue; }
    if (depois[k] === undefined) { mudaram.push(`${k}: tela SUMIU`); continue; }
    if (semGancho(antes[k]) === semGancho(depois[k])) { soEspaco.push(k); continue; }
    const a = semGancho(antes[k]); const b = semGancho(depois[k]);
    const i = [...a].findIndex((ch, n) => ch !== b[n]);
    const janela = (s) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40));
    mudaram.push(`${k}\n      antes : ${janela(a)}\n      depois: ${janela(b)}`);
  }

  console.log(`[antes×depois] ref=${ref} · ${chaves.length} renderizações (33 telas × 2 modos)`);
  if (erros.length) { console.log('erros de página:'); erros.forEach((e) => console.log('  ' + e)); }
  if (soEspaco.length) {
    console.log(`· ${soEspaco.length} mudaram SÓ em espaçamento/gancho (invisível na tela):`);
    console.log('    ' + soEspaco.join(', '));
  }
  if (!mudaram.length) {
    console.log('✓ nenhum CONTEÚDO mudou — mover o dado foi só MOVER.');
    process.exit(0);
  }
  console.log(`✗ ${mudaram.length} renderização(ões) mudaram de CONTEÚDO:`);
  mudaram.slice(0, 20).forEach((m) => console.log('    ' + m));
  console.log('\n  Se a mudança for INTENCIONAL (o dono mexeu no desenho), rode com a ref');
  console.log('  do commit anterior a ela. Se não for, é regressão da refatoração.');
  process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
