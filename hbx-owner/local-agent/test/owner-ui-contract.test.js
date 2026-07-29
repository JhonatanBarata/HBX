"use strict";

// Os 2 testes que liam web/app.js + web/index.html (contrato do painel VELHO: fabRender,
// ponteRender, tooltips e ids do HTML antigo) foram removidos em 28/07 (E5) — a casca que eles
// protegiam foi demolida via `git rm` (cutover pro V3, docs/PLANEJAMENTOS/Plano 28072026 -
// HBX-OWNER-V3.md, etapa E5). O contrato de front vivo agora é web/v3/ (testado por
// test/owner-v3.test.js, que cobre o agregado /owner/v3/overview e os 3 switches). As rotas que
// esses testes citavam (/owner/local-deep-enrich/status|start, /owner/ponte/*) continuam de pé no
// server.js — só a asserção sobre a APARÊNCIA do painel morto saiu.

const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("autostart do Windows retoma oculto no logon, wake e restart sem abrir navegador", () => {
  const installer = fs.readFileSync(path.join(__dirname, "..", "install-startup.ps1"), "utf8");
  const supervisor = fs.readFileSync(path.join(__dirname, "..", "start-owner-supervised.ps1"), "utf8");
  const tunnel = fs.readFileSync(path.join(__dirname, "..", "ensure-local-enrichment-tunnel.ps1"), "utf8");
  assert.match(installer, /New-ScheduledTaskTrigger\s+-AtLogOn/);
  assert.match(installer, /-WindowStyle Hidden/);
  assert.match(installer, /-NoBrowser/);
  assert.match(installer, /-StartWhenAvailable/);
  assert.match(installer, /-WakeToRun/);
  assert.match(installer, /-RestartCount\s+10/);
  assert.match(installer, /-RestartInterval\s+\(New-TimeSpan -Minutes 1\)/);
  assert.match(installer, /HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run/);
  assert.match(installer, /Set-ItemProperty[^\n]*\$runKey/);
  assert.doesNotMatch(installer, /Start-Process\s+["']https?:\/\//i);
  assert.match(supervisor, /while \(\$true\)/);
  assert.match(supervisor, /start-owner\.ps1/);
  assert.match(supervisor, /ensure-local-enrichment-tunnel\.ps1/);
  assert.match(tunnel, /ExitOnForwardFailure=yes/);
  assert.match(tunnel, /ServerAliveInterval=20/);
  assert.match(tunnel, /HBXLocalEnrichmentTunnelSupervisor/);
  assert.doesNotMatch(tunnel, /PASSWORD\s*=|senha\s*=/i);
});

test("configurador de producao grava somente tunel local e exige segredo efemero", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "configure-production-worker.ps1"), "utf8");
  assert.match(source, /HBX_LOCAL_ENRICH_DATABASE_PASSWORD/);
  assert.match(source, /Remove-Item Env:HBX_LOCAL_ENRICH_DATABASE_PASSWORD/);
  assert.match(source, /127\.0\.0\.1:\$LocalPort\/hbx_prod/);
  assert.match(source, /HBX_LOCAL_ENRICH_PRIVATE_CHANNEL_CONFIRMED\s*=\s*"true"/);
  assert.match(source, /HBX_LOCAL_DEEP_TARGET\s*=\s*"production"/);
  assert.match(source, /state\\secure-config/);
  assert.match(source, /dotenv-\{0\}\.tmp/);
  assert.match(source, /S-1-5-18/);
  assert.match(source, /S-1-5-32-544/);
  assert.match(source, /\/inheritance:r/);
  assert.match(source, /finally\s*\{[\s\S]*?Remove-Item -LiteralPath \$temp/);
  assert.doesNotMatch(source, /\.env\.local\.tmp|\$Path\.tmp/);
  assert.doesNotMatch(source, /Write-Host[^\n]*\$password/);
});

test("supervisor permite configurar os limites de recursos do worker local", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "start-owner-supervised.ps1"), "utf8");
  assert.match(source, /"HBX_LOCAL_DEEP_RAM_THROTTLE_PCT"/);
  assert.match(source, /"HBX_LOCAL_DEEP_CPU_THROTTLE_PCT"/);
  assert.match(source, /"HBX_LOCAL_DEEP_RESOURCE_HYSTERESIS_PCT"/);
});
