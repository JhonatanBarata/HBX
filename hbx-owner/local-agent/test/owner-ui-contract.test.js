"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("painel da fábrica usa os campos reais do backend", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
  const start = source.indexOf("async function fabRender()");
  const end = source.indexOf("async function fabStart()", start);
  const render = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "fabRender deve existir");
  assert.match(render, /set\("#fab-current", r\.lastLeadId\)/);
  assert.match(render, /set\("#fab-errors", r\.lastError\)/);
  assert.doesNotMatch(render, /r\.currentLead|r\.current\b|r\.errors\b/);
  assert.match(html, /<span class="label">Último lead<\/span><strong id="fab-current"/);
  assert.match(html, /<span class="label">Último erro<\/span><strong id="fab-errors"/);
});

test("painel local usa contrato contínuo, métricas e tooltips aprovados", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");

  assert.match(source, /\/owner\/local-deep-enrich\/status/);
  assert.match(source, /\/owner\/local-deep-enrich\/start/);
  assert.doesNotMatch(source.slice(source.indexOf("async function ponteRender()"), source.indexOf("/* ================= HOT-02")), /\/owner\/ponte\/control|\/owner\/ponte\/reset/);
  assert.match(html, /Recebe leads do VPS, processa no seu computador e grava o enriquecimento de volta no VPS\./);
  assert.match(html, /Só liga o motor local do scraping\. Sozinho, não recebe leads do VPS\./);
  for (const id of ["ponte-target", "ponte-heartbeat", "ponte-no-data", "ponte-retries", "ponte-emails", "ponte-phones", "ponte-owners", "ponte-average", "ponte-p95"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

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
  assert.doesNotMatch(installer, /Start-Process\s+["']https?:\/\//i);
  assert.match(supervisor, /while \(\$true\)/);
  assert.match(supervisor, /start-owner\.ps1/);
  assert.match(supervisor, /ensure-local-enrichment-tunnel\.ps1/);
  assert.match(tunnel, /ExitOnForwardFailure=yes/);
  assert.match(tunnel, /ServerAliveInterval=20/);
  assert.match(tunnel, /HBXLocalEnrichmentTunnelSupervisor/);
  assert.doesNotMatch(tunnel, /PASSWORD\s*=|senha\s*=/i);
});
