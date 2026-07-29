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

// ── fake do Local Lab (127.0.0.1:3098) para o teste de starvation ───────────────────────────────
// O server.js real fala com o Local Lab em uma URL FIXA ("http://127.0.0.1:3098"), sem env var de
// override — então o teste não pode simplesmente "apontar para outra porta". Em vez disso,
// interceptamos http.get/http.request no MESMO módulo "http" que o server.js importa (require de
// módulo nativo é singleton no processo — patchear aqui também vale lá) e redirecionamos só o
// tráfego destinado à 3098 para um fake nosso em porta efêmera. Isso tira a dependência de "há ou
// não um processo real ouvindo na 3098 desta máquina" (a causa da instabilidade) sem tocar
// server.js e sem trocar o que o teste prova (leitura do Docker não sofre starvation com o Local
// Lab lento rodando concorrente).
const LOCAL_LAB_ORIGIN = "http://127.0.0.1:3098";

// Nunca responde ao /health: o cliente real (requestLocalLabHealth) tem timeout PRÓPRIO de 1200ms
// e aborta sozinho — então isso reproduz de forma determinística "consulta ainda em andamento",
// em qualquer máquina, com ou sem Local Lab de verdade rodando na 3098.
function startHangingLocalLabFake() {
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    req.on("error", () => {});
    res.on("error", () => {});
    // Propositalmente sem res.end() — ver comentário acima.
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  return {
    listen: () => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    }),
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}

function redirectLocalLabHttp(fakePort) {
  const originalGet = http.get;
  const originalRequest = http.request;
  const fakeOrigin = `http://127.0.0.1:${fakePort}`;

  function rewriteUrl(input) {
    if (typeof input === "string" && input.startsWith(LOCAL_LAB_ORIGIN)) {
      return fakeOrigin + input.slice(LOCAL_LAB_ORIGIN.length);
    }
    return input;
  }
  function rewriteOptions(input) {
    if (input && typeof input === "object" && input.hostname === "127.0.0.1" && Number(input.port) === 3098) {
      return { ...input, port: fakePort };
    }
    return input;
  }

  http.get = function patchedGet(a, ...rest) {
    return typeof a === "string"
      ? originalGet.call(http, rewriteUrl(a), ...rest)
      : originalGet.call(http, rewriteOptions(a), ...rest);
  };
  http.request = function patchedRequest(a, ...rest) {
    return typeof a === "string"
      ? originalRequest.call(http, rewriteUrl(a), ...rest)
      : originalRequest.call(http, rewriteOptions(a), ...rest);
  };

  return function restore() {
    http.get = originalGet;
    http.request = originalRequest;
  };
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
  // Isola de porta real (ver comentário do helper acima): não importa se ESTA máquina tem ou não
  // um Local Lab de verdade escutando em 3098 — o tráfego do server.js pra lá é redirecionado
  // pro fake, que nunca responde ao /health.
  const fakeLab = startHangingLocalLabFake();
  const fakeLabPort = await fakeLab.listen();
  const restoreHttp = redirectLocalLabHttp(fakeLabPort);

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

    // O health do Lab (redirecionado pro fake) consome os 1200ms cheios do timeout PRÓPRIO do
    // cliente (o fake nunca responde — quem corta é o timeout do cliente, não o fake), o que dá um
    // piso DETERMINÍSTICO de ~1200ms pra essa leitura, medido empiricamente em ~1225ms (4 corridas,
    // desvio <3ms) — independe da velocidade real da consulta concorrente ao PowerShell/WMI
    // (findLocalLabProcesses). Checamos em 900ms (folga de ~300ms sob o piso) em vez dos 1500ms
    // originais: com 1500ms a folga real ficava pequena e instável, dependendo de quão rápido o WMI
    // respondesse nesta máquina.
    await new Promise((resolve) => setTimeout(resolve, 900));
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
    restoreHttp();
    await fakeLab.close();
  }
});
