'use strict';

/* eslint-disable @typescript-eslint/no-require-imports */

// Segundo dev server (preview do Claude) sem brigar pelo .next do dev
// principal: aponta o distDir para .next-preview (lido no next.config.ts).
// A porta vem do env PORT (autoPort do harness); sem PORT, Next usa 3000.

const { spawn } = require('child_process');

const env = {
  ...process.env,
  NEXT_DIST_DIR: '.next-preview',
};

const nextCli = require.resolve('next/dist/bin/next');
// Mantém o preview no mesmo bundler do dev principal; evita o erro de HMR
// do Turbopack que deixa chunks CSS sem o elemento <link> correspondente.
const child = spawn(process.execPath, [nextCli, 'dev', '--webpack'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(typeof code === 'number' ? code : 1);
});
