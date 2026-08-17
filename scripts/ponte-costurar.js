#!/usr/bin/env node
/**
 * COSTURA A PONTE — `logistica/ponte-src/*.js` (a FONTE) vira o `ponte.js` do APK.
 *
 *     node scripts/ponte-costurar.js
 *
 * Mesmo desenho da casca (mock HTML é a fonte, `mock.js` é gerado): quem se
 * edita é `ponte-src/`; `assets/app/ponte.js` é SAÍDA. A costura é concatenação
 * pura, na ordem do NOME do arquivo (00, 10, 20, … A0, B0 …) — nada de wrapper,
 * nada de cabeçalho, nada de linha inventada. Os pedaços são fatias contíguas
 * do mesmo IIFE, então o escopo léxico volta inteiro.
 *
 * 🔴 A FONTE MORA FORA DE `assets/` DE PROPÓSITO (10/08). Tudo que está em
 * `src/logistica/assets/**` é EMBARCADO no APK: com a fonte lá dentro, o
 * motorista baixava 589 KB de código que ninguém carrega (o `index.html` só
 * puxa o `ponte.js` costurado) — o dobro da ponte, por nada. Em `src/logistica/`
 * ela continua contando na digital do APK (o `deploy-vps` varre `app/src`
 * inteiro, então mexer só na fonte já carimba versão nova) sem viajar junto.
 *
 * 🔴 Editar o `ponte.js` gerado é perder o trabalho no próximo `costurar` — foi
 * o que já custou duas vezes o cordão de update no `index.html`. O
 * `scripts/ponte-conferir.js` é a vacina: ele reprova quando o gerado deixa de
 * ser a costura da fonte.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const raiz = path.join(__dirname, '..');
const LOGISTICA = path.join(raiz, 'EntregaShell/app/src/logistica');
const PONTE = path.join(LOGISTICA, 'assets', 'app', 'ponte.js'); // GERADO, vai no APK
const SRC = path.join(LOGISTICA, 'ponte-src');                   // FONTE, fica fora do APK

const NOME_VALIDO = /^[0-9A-Z]{2}-[a-z0-9-]+\.js$/;
/* 🔴 O TETO DE 1.000 LINHAS CAIU (17/08, ordem do dono: *"destrave esse teto de
   1000 linhas, só remova"*). Ele valia desde 10/08 e cobrava um preço que virou
   estorvo agora: `40-mapa-palcos.js` (984) e `D0-porta-entrega.js` (983) estavam
   a uma linha de reprovar a costura, e "picar o arquivo em dois" no meio de uma
   cirurgia de tela é criar fronteira de arquivo por causa de régua, não por
   causa de assunto — arquivo picado no lugar errado é pior que arquivo grande.
   `TETO = Infinity` em vez de arrancar a variável: ela é exportada e lida pelo
   `ponte-conferir` e pelo `ponte-picar`; mantê-la deixa o número num lugar só
   (e o dia em que o dono quiser um teto de novo é uma linha). */
const TETO = Infinity;

/** lê a fonte em ordem e devolve { partes, buffer } */
function costurar() {
  if (!fs.existsSync(SRC)) {
    const e = new Error(`fonte da ponte não encontrada em ${path.relative(raiz, SRC)}`);
    e.semFonte = true;
    throw e;
  }
  const arquivos = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
  if (!arquivos.length) {
    const e = new Error(`nenhum .js em ${path.relative(raiz, SRC)}`);
    e.semFonte = true;
    throw e;
  }
  const fora = arquivos.filter((f) => !NOME_VALIDO.test(f));
  if (fora.length) {
    throw new Error(
      `nome de fonte fora do padrão NN-nome.js: ${fora.join(', ')}\n` +
      '   A ORDEM DA COSTURA É A ORDEM DO NOME — nome torto embaralha o arquivo.',
    );
  }
  const partes = arquivos.map((f) => {
    const buffer = fs.readFileSync(path.join(SRC, f));
    const linhas = buffer.length ? buffer.toString('latin1').split('\n').length - 1 : 0;
    if (buffer.length && buffer[buffer.length - 1] !== 0x0a) {
      throw new Error(`${f} não termina em quebra de linha — a costura grudaria duas instruções na mesma linha.`);
    }
    return { nome: f, buffer, linhas };
  });
  return { partes, buffer: Buffer.concat(partes.map((p) => p.buffer)) };
}

module.exports = { costurar, PONTE, SRC, TETO };

if (require.main === module) {
  let costura;
  try {
    costura = costurar();
  } catch (erro) {
    console.error(`\n❌ ${erro.message}\n`);
    process.exit(1);
  }
  const gordos = costura.partes.filter((p) => p.linhas > TETO);
  const anterior = fs.existsSync(PONTE) ? fs.readFileSync(PONTE) : Buffer.alloc(0);
  const mudou = !anterior.equals(costura.buffer);
  if (mudou) fs.writeFileSync(PONTE, costura.buffer);
  const sha = crypto.createHash('sha256').update(costura.buffer).digest('hex');
  console.log(`ponte costurada: ${costura.partes.length} fontes → ${costura.buffer.toString('latin1').split('\n').length - 1} linhas`);
  console.log(`  ${path.relative(raiz, PONTE)} ${mudou ? 'REESCRITO' : 'já estava igual'} · sha256 ${sha.slice(0, 16)}…`);
  if (gordos.length) {
    console.warn(`  ⚠️ passaram de ${TETO} linhas: ${gordos.map((p) => `${p.nome} (${p.linhas})`).join(', ')}`);
  }
}
