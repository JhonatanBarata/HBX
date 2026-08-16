/**
 * REGENERAR O GERADO ANTES DE MEDIR — o helper único das provas de tela.
 *
 *     const { regenerarGerados } = require('./_regenerar');
 *     regenerarGerados();   // no COMEÇO da prova, antes de servir qualquer arquivo
 *
 * 🔴 A LEI (16/08, LOTE 1.4 — armadilha que mordeu a própria revisão
 * adversarial). Neste repo NADA do que a prova serve é fonte:
 *   · `EntregaShell/app/src/logistica/assets/app/ponte.js` é GERADO por
 *     `ponte-costurar` a partir de `ponte-src/*.js`;
 *   · `assets/app/mock.js` + `index.html` são GERADOS por `casca-injetar` a
 *     partir de `docs/mockups/logistica2.0/logistica-2.0.html`.
 * As provas de Playwright abrem o GERADO (é ele que roda no aparelho). Então
 * uma prova que não regenera mede o gerado que estiver no disco — o de ontem,
 * ou o da OUTRA sessão que rodou por último.
 *
 * O preço disso já foi pago em dinheiro de tempo: 23 das 25 provas não
 * regeneravam, e um red-first feito editando a FONTE saía VERDE (140/140) sobre
 * código velho; só depois de regenerar à mão é que as 3 asserções reprovaram.
 * Red-first sobre gerado velho é PIOR que não ter prova: ele CERTIFICA o
 * contrário do que aconteceu.
 *
 * Regra desta casa, daqui pra frente: toda prova que abre `assets/app/**`
 * chama isto na primeira linha do main. Se a prova monta o gerado EM MEMÓRIA a
 * partir da fonte (é o caso da `prova-teclado-vivo`), ela já cumpre a lei por
 * outro caminho e não precisa deste helper.
 *
 * `--sem-regerar` existe só pra depurar a própria prova (medir o disco como
 * ele está, sem tocar em nada) — nunca pra portão.
 */
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');

function regenerarGerados(opts) {
  const argv = (opts && opts.argv) || process.argv;
  const rotulo = (opts && opts.rotulo) || path.basename(argv[1] || 'prova', '.js');
  if (argv.includes('--sem-regerar')) {
    console.log(`[${rotulo}] --sem-regerar: MEDINDO O GERADO DO DISCO como ele está (não vale como portão).`);
    return false;
  }
  console.log(`[${rotulo}] regenerando ponte.js + mock.js/index.html (é o GERADO que a prova mede)…`);
  execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'ponte-costurar.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'casca-injetar.js')], { stdio: 'inherit' });
  return true;
}

module.exports = { regenerarGerados };
