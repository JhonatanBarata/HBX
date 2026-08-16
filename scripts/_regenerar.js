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
 *
 * 🔴 E AGORA ELE NÃO CONSEGUE MAIS SE PASSAR POR PORTÃO (16/08, LOTE 1.5 —
 * furo 3). A frase "não vale como portão" era só EDUCAÇÃO: a prova seguia,
 * imprimia o placar cheio e saía com código 0. Medido neste lote: fonte mutada
 * (a régua nova DESLIGADA no `ponte-src`), disco com o gerado bom, e o comando
 * devolveu `41/41` + exit 0 — um verde perfeito sobre código que não existe.
 * Um número desses colado num relatório é pior que prova nenhuma: ele CERTIFICA
 * o contrário do que aconteceu, e foi exatamente assim que o red-first de um
 * lote anterior saiu 140/140 sobre código velho.
 *
 * A cura tem que ser MECÂNICA, não textual, e vale pras 25+ provas de uma vez
 * (elas todas chamam este helper na 1ª linha do main):
 *   1. o placar sai CARIMBADO — a linha `N/N` ganha o selo de inválido colado
 *      nela, então nem recorte de tela se salva;
 *   2. o processo termina com código != 0, SEMPRE — verde ou vermelho. CI,
 *      script, `&&` de shell: ninguém consegue tratar isto como aprovação.
 * Depurar a própria prova continua possível (a saída inteira está lá, e o selo
 * não some nem atrapalha) — o que morreu foi a chance de confundir depuração
 * com portão.
 */
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');

/** o código de saída do "medi, mas não vale" — distinto de 1 (prova vermelha)
 *  de propósito: quem lê o código consegue separar "reprovou" de "nem contava". */
const SAIDA_INVALIDA = 9;
const SELO = '⛔ PLACAR INVÁLIDO — medido com --sem-regerar (gerado do disco, NÃO a fonte)';
/** o formato do placar destas provas: `41/41`, sozinho na linha. */
const EH_PLACAR = /^\s*\d+\s*\/\s*\d+\s*$/;

function carimbarPlacarInvalido(rotulo) {
  const linha = '='.repeat(78);
  console.log(`\n${linha}\n[${rotulo}] ${SELO}`);
  console.log(`[${rotulo}] --sem-regerar serve pra DEPURAR a prova, nunca pra aprovar trabalho.`);
  console.log(`${linha}\n`);
  const logOriginal = console.log.bind(console);
  console.log = (...args) => {
    if (args.length === 1 && typeof args[0] === 'string' && EH_PLACAR.test(args[0])) {
      logOriginal(`${args[0]}   ${SELO}`);
      return;
    }
    logOriginal(...args);
  };
  process.on('exit', () => {
    logOriginal(`\n${linha}\n[${rotulo}] ${SELO}`);
    logOriginal(`[${rotulo}] saindo com código ${SAIDA_INVALIDA} — este resultado NÃO é portão.`);
    logOriginal(linha);
    // Dentro do 'exit' o valor de `process.exitCode` ainda é lido pelo Node na
    // hora de morrer — vale inclusive quando a prova chamou `process.exit(0)`.
    process.exitCode = SAIDA_INVALIDA;
  });
}

function regenerarGerados(opts) {
  const argv = (opts && opts.argv) || process.argv;
  const rotulo = (opts && opts.rotulo) || path.basename(argv[1] || 'prova', '.js');
  if (argv.includes('--sem-regerar')) {
    console.log(`[${rotulo}] --sem-regerar: MEDINDO O GERADO DO DISCO como ele está (não vale como portão).`);
    carimbarPlacarInvalido(rotulo);
    return false;
  }
  console.log(`[${rotulo}] regenerando ponte.js + mock.js/index.html (é o GERADO que a prova mede)…`);
  execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'ponte-costurar.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(RAIZ, 'scripts', 'casca-injetar.js')], { stdio: 'inherit' });
  return true;
}

module.exports = { regenerarGerados };
