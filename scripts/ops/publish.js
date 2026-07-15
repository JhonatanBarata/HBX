'use strict';

const { logStage, runStep } = require('./common');

function main() {
  logStage('Publish completo');
  console.log('Commitando tudo no master, enviando tudo e reconstruindo/reiniciando todos os servicos da VPS.');
  runStep('node', ['./scripts/deploy-hostinger.js', 'force', '--skip-local-preflight']);
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
}
