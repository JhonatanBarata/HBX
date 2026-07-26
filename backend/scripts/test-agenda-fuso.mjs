#!/usr/bin/env node
/**
 * Roda a suíte de datas da Agenda NOS DOIS FUSOS que importam.
 *
 * POR QUE ISTO EXISTE (26/07 — o furo apareceu DUAS vezes):
 * o container `hbx-backend` na VPS sobe com TZ vazio, ou seja UTC (`docker exec
 * hbx-backend date` → UTC). A máquina do dono é -03. Quando a conta de data herda o
 * fuso do processo, o teste fica VERDE no Windows do dono e VERMELHO em produção —
 * exatamente a configuração em que ninguém olhava. Rodar num fuso só é o que
 * escondeu o bug na 1ª rodada (paradas materializadas 3h antes da janela do
 * `prepare`) e na 2ª (contador da Agenda mentindo pra plano QUINZENAL).
 *
 * Uso: npm run test:agenda-fuso
 * Falhou em QUALQUER um dos fusos ⇒ sai != 0. Não existe "passou no meu PC".
 */
import { spawnSync } from 'node:child_process';

const ARQUIVOS = [
  'dist/logistica/logistica-agenda-fuso.test.js',
  'dist/logistica/logistica-agenda-resumo.service.test.js',
];

// UTC = produção (container). America/Sao_Paulo = máquina do dono. O resultado tem
// que ser IDÊNTICO nos dois — é essa igualdade que o script cobra. New_York entra
// como CANÁRIO: é o único dos três com horário de verão, e horário de verão no fuso
// do processo é exatamente onde `setDate(getDate() + n)` perde 1h e escorrega de dia
// civil (o jeito "óbvio" de somar dias, que já sobrou vivo uma vez).
const FUSOS = [
  ['UTC', 'o fuso REAL do container em prod'],
  ['America/Sao_Paulo', 'a máquina do dono'],
  ['America/New_York', 'canário: fuso COM horário de verão'],
];

let falhou = false;
for (const [tz, papel] of FUSOS) {
  console.log(`\n=== TZ=${tz} (${papel}) ===`);
  const run = spawnSync(process.execPath, ['--test', ...ARQUIVOS], {
    stdio: 'inherit',
    // HBX_TEST_TZ: o arquivo de fuso trava em UTC por padrão; é assim que o runner
    // pede pra ele rodar também nos outros (ver o topo de logistica-agenda-fuso.test.ts).
    env: { ...process.env, TZ: tz, HBX_TEST_TZ: tz },
  });
  if (run.status !== 0) {
    falhou = true;
    console.error(`\n[agenda-fuso] FALHOU com TZ=${tz}.`);
  }
}

if (falhou) {
  console.error(
    '\n[agenda-fuso] Data de operação é dia CIVIL de São Paulo, explícito — nunca herdada do\n'
    + 'fuso do processo. Nada de `setDate/getDate/setHours/getDay` em data de agenda:\n'
    + 'use `startOfDay` + `addDays` + `isoWeekday` (bloco "FUSO" em logistica-agenda.service.ts).',
  );
  process.exit(1);
}
console.log('\n[agenda-fuso] OK — mesmo resultado no container (UTC), na máquina do dono (-03) e num fuso com horário de verão.');
