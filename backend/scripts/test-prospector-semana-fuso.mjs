#!/usr/bin/env node
/**
 * PROSPECTOR v2 (12/08) — roda a régua da SEMANA nos três fusos que importam.
 *
 * POR QUE ISTO EXISTE: a escolha do prospector expira na virada da SEMANA, e semana
 * nasce de dia civil. É o mesmo furo do incidente 26/07 da Agenda um degrau acima —
 * o container `hbx-backend` sobe em UTC, a máquina do dono é -03, e domingo 23h em
 * Brasília já é segunda em UTC. Com a semana herdando o fuso do processo, a escolha
 * da pessoa morreria 3 horas antes da hora, no fim do domingo, sem nada na tela
 * explicando. Verde no Windows do dono e vermelho em produção é exatamente a
 * configuração em que ninguém olha.
 *
 * Uso: npm run test:prospector-semana-fuso
 * Falhou em QUALQUER um dos fusos ⇒ sai != 0. Não existe "passou no meu PC".
 */
import { spawnSync } from 'node:child_process';

const ARQUIVOS = ['dist/logistica/logistica-prospector-semana.test.js'];

// Mesmo trio do runner da Agenda: produção, dono e o canário com horário de verão
// (o único lugar onde aritmética de data com método local escorrega de dia civil).
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
    env: { ...process.env, TZ: tz, HBX_TEST_TZ: tz },
  });
  if (run.status !== 0) {
    falhou = true;
    console.error(`\n[prospector-semana] FALHOU com TZ=${tz}.`);
  }
}

if (falhou) {
  console.error(
    '\n[prospector-semana] A semana da escolha é ISO e nasce do DIA CIVIL DE SÃO PAULO\n'
    + '(`saoPauloDateKey` → `semanaIsoDeDiaCivil`). Nada de `getDay/setDate/getFullYear`\n'
    + 'local: use `logistica-prospector-semana.util.ts`, que faz a conta inteira em UTC\n'
    + 'depois que o dia civil já foi resolvido.',
  );
  process.exit(1);
}
console.log('\n[prospector-semana] OK — a mesma semana no container (UTC), na máquina do dono (-03) e num fuso com horário de verão.');
