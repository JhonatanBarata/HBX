'use strict';

const { spawnSync } = require('child_process');

const env = {
  ...process.env,
  NODE_ENV: 'production',
};

const isWindows = process.platform === 'win32';
const executable = isWindows ? 'npx.cmd' : 'npx';
const result = spawnSync(executable, ['next', 'build'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  shell: isWindows,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);