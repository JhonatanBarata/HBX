const http = require("http");

const token = String(process.env.HBX_OWNER_LOCAL_TOKEN || "").trim();
const port = Number(process.env.HBX_OWNER_LOCAL_AGENT_PORT || 3107);

if (!token) {
  console.error("HBX_OWNER_LOCAL_TOKEN nao configurado.");
  process.exit(1);
}

const request = http.request(
  {
    hostname: "127.0.0.1",
    port,
    path: "/health",
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
  (response) => {
    let body = "";
    response.on("data", (chunk) => {
      body += chunk;
    });
    response.on("end", () => {
      console.log(body);
      process.exit(response.statusCode === 200 ? 0 : 1);
    });
  },
);

request.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

request.end();
