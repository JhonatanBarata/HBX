#!/usr/bin/env node
/**
 * CONFERE A PONTE — o `ponte.js` embarcado É a costura da fonte?
 *
 *     node scripts/ponte-conferir.js                (= --app logistica)
 *     node scripts/ponte-conferir.js --app vendas
 *
 * A vacina contra a lição que já custou caro duas vezes no `index.html`:
 * alguém conserta o arquivo GERADO, o gerador roda depois e o conserto some
 * sem barulho. Aqui a comparação é FONTE × GERADO, byte a byte — nunca contra
 * o passado. Quando a fonte muda de propósito, o certo é o hash mudar; o que
 * não pode é o gerado andar sozinho.
 *
 * Sai com código ≠ 0 (e diz o QUE fazer) quando:
 *   · o gerado não existe;
 *   · o gerado difere da costura da fonte (mostra a primeira linha divergente);
 *   · alguma fonte passou do teto de 1.000 linhas.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { costurar, TETO } = require('./ponte-costurar.js');
const { resolverApp } = require('./lib/apps');

// `--app <nome>`; sem o flag, o app do motorista (é assim que o `deploy-vps`
// chama). Os caminhos vêm do mapa — o conferidor não conhece flavor.
const ALVO = resolverApp(process.argv);
const PONTE = ALVO.pontePath;
const SRC = ALVO.ponteSrc;

const raiz = path.join(__dirname, '..');
const rel = (p) => path.relative(raiz, p).split(path.sep).join('/');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function reprovar(msg) {
  console.error(`\n❌ PONTE FORA DE DIA\n\n${msg}\n`);
  process.exit(1);
}

let costura;
try {
  costura = costurar(ALVO);
} catch (erro) {
  reprovar(`${erro.message}\n\n   A fonte da ponte é ${rel(SRC)} (corte por scripts/ponte-picar.js).`);
}

if (!fs.existsSync(PONTE)) {
  reprovar(`${rel(PONTE)} não existe.\n\n   Rode: node scripts/ponte-costurar.js --app ${ALVO.nome}`);
}

const embarcado = fs.readFileSync(PONTE);
if (!embarcado.equals(costura.buffer)) {
  const a = embarcado.toString('latin1').split('\n');
  const b = costura.buffer.toString('latin1').split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  // de que fonte é a linha divergente
  let acumulado = 0, dono = '(fim do arquivo)';
  for (const p of costura.partes) {
    if (i < acumulado + p.linhas) { dono = `${p.nome}:${i - acumulado + 1}`; break; }
    acumulado += p.linhas;
  }
  reprovar(
    `${rel(PONTE)} NÃO é a costura de ${rel(SRC)}.\n\n` +
    `   1ª divergência na linha ${i + 1} (fonte ${dono}):\n` +
    `     gerado : ${JSON.stringify((a[i] || '').slice(0, 110))}\n` +
    `     fonte  : ${JSON.stringify((b[i] || '').slice(0, 110))}\n\n` +
    `   sha256 gerado ${sha(embarcado).slice(0, 16)}… × fonte ${sha(costura.buffer).slice(0, 16)}…\n\n` +
    `   O GERADO NÃO SE EDITA. Leve a mudança para ${rel(SRC)}/ e rode:\n` +
    `     node scripts/ponte-costurar.js --app ${ALVO.nome}`,
  );
}

const gordos = costura.partes.filter((p) => p.linhas > TETO);
if (gordos.length) {
  reprovar(
    `fonte acima do teto de ${TETO} linhas (ordem do dono, 10/08):\n` +
    gordos.map((p) => `     ${p.nome}: ${p.linhas} linhas`).join('\n') +
    '\n\n   Pique o arquivo em dois numa fronteira de instrução top-level.',
  );
}

const total = costura.partes.reduce((s, p) => s + p.linhas, 0);
const teto = Number.isFinite(TETO) ? `teto ${TETO}` : 'sem teto';
console.log(`✅ ponte conferida (${ALVO.nome}): ${costura.partes.length} fontes (maior ${Math.max(...costura.partes.map((p) => p.linhas))} linhas, ${teto}) = ${total} linhas`);
console.log(`   ${rel(PONTE)} é EXATAMENTE a costura da fonte · sha256 ${sha(embarcado).slice(0, 16)}…`);
