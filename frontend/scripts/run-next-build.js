'use strict';

const { spawnSync } = require('child_process');

const env = {
  ...process.env,
  NODE_ENV: 'production',
};

const nextCli = require.resolve('next/dist/bin/next');
const result = spawnSync(process.execPath, [nextCli, 'build'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);