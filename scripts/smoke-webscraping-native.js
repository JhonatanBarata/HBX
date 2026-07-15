/**
 * Smoke test do modulo nativo de prospeccao.
 * Valida superficie minima das rotas nativas sem depender do legado.
 */

const http = require("http");
const https = require("https");

const API_BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const FRONT_BASE_URL = process.env.FRONT_BASE_URL || "http://localhost:3001";

function request(method, url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === "https:" ? https : http;

    const req = client.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
          });
        });
      },
    );

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function expectStatus(label, method, url, expectedStatus, body = null) {
  const response = await request(method, url, body);
  const ok = response.status === expectedStatus;
  console.log(`${ok ? "OK" : "FAIL"} ${label} -> ${response.status}`);
  if (!ok) {
    console.log(`   esperado: ${expectedStatus}`);
    if (response.body) console.log(`   resposta: ${response.body.slice(0, 240)}`);
  }
  return ok;
}

async function main() {
  console.log("\nSmoke: webscraping nativo HBX\n");

  const checks = [];
  checks.push(await expectStatus("GET /webscraping/runtime sem auth", "GET", `${API_BASE_URL}/webscraping/runtime`, 401));
  checks.push(await expectStatus("POST /webscraping/search sem auth", "POST", `${API_BASE_URL}/webscraping/search`, 401, {
    city: "Sao Paulo - SP",
    segment: "Clinicas",
    quantity: 5,
  }));
  checks.push(await expectStatus("GET /webscraping/history removido", "GET", `${API_BASE_URL}/webscraping/history`, 404));
  checks.push(await expectStatus("POST /webscraping/export sem auth", "POST", `${API_BASE_URL}/webscraping/export`, 401, {
    city: "Sao Paulo - SP",
    segment: "Clinicas",
    quantity: 5,
  }));

  try {
    const frontend = await request("GET", `${FRONT_BASE_URL}/dashboard/webscraping`);
    const ok = frontend.status === 200 || frontend.status === 307 || frontend.status === 308;
    console.log(`${ok ? "OK" : "FAIL"} rota frontend /dashboard/webscraping -> ${frontend.status}`);
    checks.push(ok);
  } catch (error) {
    console.log(`FAIL rota frontend /dashboard/webscraping -> ${error.message}`);
    checks.push(false);
  }

  console.log("\nResumo:");
  console.log("1. As rotas nativas devem responder sem depender do legado visivel.");
  console.log("2. Runtime, busca, historico e exportacao permanecem protegidos por auth.");
  console.log("3. A tela do dashboard deve abrir pela rota nativa /dashboard/webscraping.\n");

  process.exit(checks.every(Boolean) ? 0 : 1);
}

main().catch((error) => {
  console.error("Erro no smoke:", error.message);
  process.exit(1);
});
