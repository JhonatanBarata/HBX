"use strict";

process.env.HBX_OWNER_LOCAL_TOKEN = "test-owner-token";
process.env.HBX_PONTE_WORKER_ENABLED = "off";

const http = require("node:http");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createOwnerServer,
  dockerRead,
  invalidateDockerReadCache,
} = require("../server").__testing;

function getJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      headers: { Authorization: "Bearer test-owner-token" },
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
  });
}

test("leitura Docker lenta não bloqueia GET crítico da ponte e polls iguais são coalescidos", async () => {
  invalidateDockerReadCache();
  const server = createOwnerServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    // Exercita o mesmo executor/cache usado por docker ps/stats com um subprocesso lento controlado.
    const slowCommand = [
      process.execPath,
      "-e",
      "setTimeout(function(){console.log('docker-ok')},600)",
    ];
    const firstRead = dockerRead(slowCommand);
    const secondRead = dockerRead(slowCommand);
    assert.strictEqual(secondRead, firstRead, "polls concorrentes devem compartilhar a mesma leitura");

    let readFinished = false;
    firstRead.then(() => { readFinished = true; });

    const startedAt = Date.now();
    const response = await getJson(server.address().port, "/owner/ponte/status");
    const elapsedMs = Date.now() - startedAt;

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ok, true);
    assert.equal(readFinished, false, "a rota crítica deve responder antes da leitura lenta terminar");
    assert.ok(elapsedMs < 450, `GET crítico levou ${elapsedMs}ms durante leitura Docker lenta`);

    const result = await firstRead;
    assert.equal(result.ok, true);
    assert.match(result.stdout, /docker-ok/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    invalidateDockerReadCache();
  }
});

test("polling real do Local Lab não causa starvation no freio da ponte", {
  skip: process.platform !== "win32",
  timeout: 45_000,
}, async () => {
  const server = createOwnerServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const port = server.address().port;
    let labFinished = false;
    const firstLabRead = getJson(port, "/local-lab/status").finally(() => { labFinished = true; });
    const secondLabRead = getJson(port, "/local-lab/status");

    // O health do Lab pode consumir até 1,2s; depois começa a consulta real ao PowerShell/WMI.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    assert.equal(labFinished, false, "a consulta real do Local Lab deveria continuar em andamento");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const startedAt = Date.now();
      const response = await getJson(port, "/owner/ponte/status");
      const elapsedMs = Date.now() - startedAt;
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.ok, true);
      assert.ok(elapsedMs < 1_500, `tentativa ${attempt + 1}: freio levou ${elapsedMs}ms durante polling do Lab`);
    }

    const [firstLab, secondLab] = await Promise.all([firstLabRead, secondLabRead]);
    assert.equal(firstLab.statusCode, 200);
    assert.equal(secondLab.statusCode, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
