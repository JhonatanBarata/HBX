import { spawn, spawnSync } from 'node:child_process';

export function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  return result.status === 0;
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio || 'inherit',
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: options.shell ?? (process.platform === 'win32'),
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve({ code, signal });
      else reject(new Error(`${command} terminou com código ${code ?? 'n/a'}${signal ? ` (${signal})` : ''}.`));
    });
  });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
