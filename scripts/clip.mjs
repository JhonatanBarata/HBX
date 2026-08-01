#!/usr/bin/env node
/**
 * FISCAL DE CORTE — atalho de linha de comando.
 *
 *   npm run clip          mede e REPROVA se alguma tela piorou
 *   npm run clip:regua    mede e BAIXA a régua (usar depois de consertar)
 *
 * Existe por dois motivos, os dois de Windows:
 *
 *   1. `HBX_CLIP_UPDATE=1 npx playwright ...` na frente do comando é sintaxe
 *      de shell POSIX. O npm no Windows roda os scripts pelo cmd.exe, onde
 *      isso não define variável nenhuma — o comando roda sem a flag e o dono
 *      acharia que baixou a régua sem ter baixado.
 *
 *   2. Os dois arquivos de saída são ACUMULADOS EM DISCO (o Playwright
 *      reinicia o worker a cada falha e leva junto qualquer acumulador em
 *      memória). Sem apagar antes, a corrida de hoje soma o achado de ontem.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const RAIZ = process.cwd();
const TEMPORARIOS = ["tests/e2e/clip-report.txt", "tests/e2e/clip-medido.jsonl"];

for (const arquivo of TEMPORARIOS) {
  try {
    fs.unlinkSync(path.join(RAIZ, arquivo));
  } catch {
    /* não existir é o caso normal */
  }
}

const baixarRegua = process.argv.includes("--regua");
const extras = process.argv.slice(2).filter((a) => a !== "--regua");

// `shell: true` é obrigatório no Windows: sem ele o spawn procura um binário
// chamado "npx" que não existe (o que existe é npx.cmd), falha em silêncio e
// o script sai 0 sem ter rodado teste nenhum — o pior tipo de verde.
const r = spawnSync(
  "npx",
  ["playwright", "test", "design-system", "--project=chromium", ...extras],
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...(baixarRegua ? { HBX_CLIP_UPDATE: "1" } : {}) },
  }
);

if (r.error) {
  console.error("[clip] não consegui rodar o Playwright:", r.error.message);
  process.exit(1);
}
process.exit(r.status ?? 1);
