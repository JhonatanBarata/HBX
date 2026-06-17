'use strict';

// Ponte SSH de inspeção/operação na VPS (reusa a lib ssh2 do Ops Control).
// Uso: node scripts/vps-run.js "<comando remoto>"
//      echo "<script>" | node scripts/vps-run.js --stdin
// Credenciais vêm de .env.ops-control (OPS_CONTROL_SSH_*).

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const { Client } = require(path.join(repoRoot, 'ops-control', 'node_modules', 'ssh2'));

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...loadEnvFile(path.join(repoRoot, '.env.ops-control')), ...process.env };

const sshConfig = {
  host: env.OPS_CONTROL_SSH_HOST,
  port: Number(env.OPS_CONTROL_SSH_PORT || 22),
  username: env.OPS_CONTROL_SSH_USER || 'root',
  password: env.OPS_CONTROL_SSH_PASSWORD,
  privateKey: env.OPS_CONTROL_SSH_PRIVATE_KEY,
  readyTimeout: 20000,
};

function getCommand() {
  if (process.argv.includes('--stdin')) {
    return fs.readFileSync(0, 'utf8');
  }
  const arg = process.argv.slice(2).filter((a) => a !== '--stdin').join(' ');
  return arg;
}

const command = getCommand();
if (!command.trim()) {
  console.error('Sem comando. Uso: node scripts/vps-run.js "<comando>"  ou  --stdin');
  process.exit(2);
}

const timeoutMs = Number(env.VPS_RUN_TIMEOUT_MS || 120000);

const conn = new Client();
let settled = false;
const timer = setTimeout(() => {
  if (settled) return;
  settled = true;
  console.error('Timeout SSH.');
  conn.end();
  process.exit(124);
}, timeoutMs);

conn.on('ready', () => {
  conn.exec(command, { pty: false }, (error, stream) => {
    if (error) {
      clearTimeout(timer);
      settled = true;
      console.error('exec error:', error.message);
      conn.end();
      process.exit(1);
      return;
    }
    stream.on('close', (code) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      conn.end();
      process.exit(typeof code === 'number' ? code : 0);
    });
    stream.on('data', (d) => process.stdout.write(d));
    stream.stderr.on('data', (d) => process.stderr.write(d));
  });
});

conn.on('error', (error) => {
  if (settled) return;
  clearTimeout(timer);
  settled = true;
  console.error('SSH error:', error.message);
  process.exit(1);
});

conn.connect(sshConfig);
