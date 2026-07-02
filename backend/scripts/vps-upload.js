#!/usr/bin/env node
/**
 * Sobe um arquivo local pra VPS via SFTP (F1 — transferência do extrato magro
 * CnpjPublicCompany, docs/PLANEJAMENTOS/PR02072026/F1-rfb-carga-extrato-vps.md item 5).
 *
 * Reusa a mesma lib ssh2 e o mesmo .env.ops-control do scripts/vps-run.js (credenciais
 * SÓ existem no working copy PRINCIPAL — este script roda por caminho absoluto e resolve
 * a lib/env relativos a --repo-root, que default é o main copy).
 *
 * Uso:
 *   node backend/scripts/vps-upload.js --local <arquivo> --remote </caminho/remoto>
 *     [--repo-root "C:\Users\Jhonatan\Desktop\App"]
 *
 * Não faz nada além de copiar bytes (leitura local + SFTP put) — nenhuma alteração em
 * schema/dados. Progresso logado a cada ~5% ou 100MB.
 */
const fs = require('fs');
const path = require('path');

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : true;
}

function log(msg) {
  console.log(`[vps-upload] ${new Date().toISOString().slice(11, 19)} ${msg}`);
}

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

async function main() {
  const localPath = arg('local');
  const remotePath = arg('remote');
  const repoRoot = String(arg('repo-root', 'C:\\Users\\Jhonatan\\Desktop\\App'));

  if (!localPath || localPath === true || !remotePath || remotePath === true) {
    console.error('Uso: node vps-upload.js --local <arquivo local> --remote </caminho/remoto> [--repo-root <path>]');
    process.exit(2);
  }
  const local = path.resolve(String(localPath));
  if (!fs.existsSync(local)) {
    console.error(`arquivo local não existe: ${local}`);
    process.exit(2);
  }
  const size = fs.statSync(local).size;

  const { Client } = require(path.join(repoRoot, 'ops-control', 'node_modules', 'ssh2'));
  const env = { ...loadEnvFile(path.join(repoRoot, '.env.ops-control')), ...process.env };
  const sshConfig = {
    host: env.OPS_CONTROL_SSH_HOST,
    port: Number(env.OPS_CONTROL_SSH_PORT || 22),
    username: env.OPS_CONTROL_SSH_USER || 'root',
    password: env.OPS_CONTROL_SSH_PASSWORD,
    privateKey: env.OPS_CONTROL_SSH_PRIVATE_KEY,
    readyTimeout: 20000,
  };
  if (!sshConfig.host) {
    console.error('OPS_CONTROL_SSH_HOST vazio — .env.ops-control não encontrado/lido (confira --repo-root).');
    process.exit(2);
  }

  log(`local: ${local} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  log(`remoto: ${sshConfig.host}:${remotePath}`);

  const conn = new Client();
  const t0 = Date.now();
  let lastPct = -1;

  await new Promise((resolve, reject) => {
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        const readStream = fs.createReadStream(local);
        const writeStream = sftp.createWriteStream(remotePath);
        let sent = 0;
        readStream.on('data', (chunk) => {
          sent += chunk.length;
          const pct = Math.floor((sent / size) * 100);
          if (pct !== lastPct && (pct % 5 === 0)) {
            lastPct = pct;
            log(`progresso: ${pct}% (${(sent / 1024 / 1024).toFixed(0)}/${(size / 1024 / 1024).toFixed(0)} MB)`);
          }
        });
        writeStream.on('error', reject);
        readStream.on('error', reject);
        writeStream.on('close', () => resolve());
        readStream.pipe(writeStream);
      });
    });
    conn.on('error', reject);
    conn.connect(sshConfig);
  });

  conn.end();
  const elapsedS = (Date.now() - t0) / 1000;
  const mbps = (size / 1024 / 1024) / elapsedS;
  log(`FIM: ${(size / 1024 / 1024).toFixed(1)} MB em ${elapsedS.toFixed(0)}s (~${mbps.toFixed(1)} MB/s)`);
}

main().catch((error) => {
  console.error('[vps-upload] falhou:', error && error.message ? error.message : error);
  process.exit(1);
});
