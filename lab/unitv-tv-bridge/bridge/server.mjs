import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "..");
const appRoot = join(root, "tizen-app");
const liveRoot = join(root, "live");
const logRoot = join(root, "logs");
const port = Number(process.env.UNITV_BRIDGE_PORT || 8090);
const host = process.env.UNITV_BRIDGE_HOST || "0.0.0.0";

mkdirSync(liveRoot, { recursive: true });
mkdirSync(logRoot, { recursive: true });

let ffmpeg = null;
let state = {
  mode: "stopped",
  source: null,
  startedAt: null,
  lastExit: null,
  error: null
};

function findFfmpeg() {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  const result = spawnSync("where.exe", ["ffmpeg"], {
    encoding: "utf8",
    windowsHide: true
  });
  const candidate = result.stdout?.split(/\r?\n/).find(Boolean);
  if (!candidate) {
    throw new Error("ffmpeg.exe não foi encontrado no PATH.");
  }
  return candidate.trim();
}

function clearLive() {
  for (const name of readdirSync(liveRoot)) {
    if (name !== ".gitkeep") {
      rmSync(join(liveRoot, name), { force: true, recursive: true });
    }
  }
}

function inputArguments(mode, source) {
  if (mode === "test") {
    return [
      "-re",
      "-f", "lavfi",
      "-i", "testsrc2=size=1280x720:rate=30",
      "-f", "lavfi",
      "-i", "sine=frequency=440:sample_rate=48000"
    ];
  }

  if (mode === "desktop") {
    return [
      "-f", "gdigrab",
      "-framerate", "30",
      "-draw_mouse", "1",
      "-i", "desktop"
    ];
  }

  if (mode === "window") {
    if (!source) {
      throw new Error("Informe o título da janela em source.");
    }
    return [
      "-f", "gdigrab",
      "-framerate", "30",
      "-draw_mouse", "0",
      "-i", `title=${source}`
    ];
  }

  if (mode === "url") {
    if (!source || !/^https?:\/\//i.test(source)) {
      throw new Error("A fonte URL precisa começar com http:// ou https://.");
    }
    return ["-re", "-i", source];
  }

  throw new Error(`Modo desconhecido: ${mode}`);
}

function outputArguments(hasAudio) {
  const segmentPattern = join(liveRoot, "segment-%06d.ts");
  const playlist = join(liveRoot, "index.m3u8");
  return [
    "-map", "0:v:0",
    ...(hasAudio ? ["-map", "1:a:0"] : ["-an"]),
    "-vf",
    "scale=1280:720:force_original_aspect_ratio=decrease," +
      "pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-tune", "zerolatency",
    "-profile:v", "main",
    "-level:v", "3.1",
    "-b:v", "4500k",
    "-maxrate", "5000k",
    "-bufsize", "1000k",
    "-g", "30",
    "-keyint_min", "30",
    "-sc_threshold", "0",
    "-bf", "0",
    ...(hasAudio
      ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000"]
      : []),
    "-f", "hls",
    "-hls_time", "1",
    "-hls_list_size", "5",
    "-hls_delete_threshold", "3",
    "-hls_flags",
    "delete_segments+append_list+independent_segments+omit_endlist+program_date_time",
    "-hls_segment_filename", segmentPattern,
    playlist
  ];
}

function stopStream() {
  if (ffmpeg && !ffmpeg.killed) {
    ffmpeg.kill("SIGTERM");
  }
  ffmpeg = null;
  state.mode = "stopped";
  state.source = null;
  state.startedAt = null;
}

function startStream(mode, source = null) {
  stopStream();
  clearLive();

  const executable = findFfmpeg();
  const hasAudio = mode === "test";
  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    "-y",
    ...inputArguments(mode, source),
    ...outputArguments(hasAudio)
  ];

  const logChunks = [];
  ffmpeg = spawn(executable, args, {
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"]
  });
  state = {
    mode,
    source,
    startedAt: new Date().toISOString(),
    lastExit: null,
    error: null
  };

  ffmpeg.stderr.setEncoding("utf8");
  ffmpeg.stderr.on("data", chunk => {
    logChunks.push(chunk);
    if (logChunks.length > 100) logChunks.shift();
  });
  ffmpeg.on("error", error => {
    state.error = error.message;
  });
  ffmpeg.on("exit", (code, signal) => {
    state.lastExit = { code, signal, at: new Date().toISOString() };
    if (code && code !== 0) {
      state.error = logChunks.join("").slice(-6000);
    }
    ffmpeg = null;
    if (state.mode !== "stopped") state.mode = "exited";
  });
}

function sendJson(response, status, body) {
  const data = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });
  response.end(data);
}

function mimeType(path) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts": "video/mp2t",
    ".xml": "application/xml; charset=utf-8",
    ".png": "image/png"
  }[extname(path).toLowerCase()] || "application/octet-stream";
}

function serveFile(response, base, requestPath) {
  const relative = normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const file = resolve(base, relative);
  if (!file.startsWith(resolve(base)) || !existsSync(file)) {
    sendJson(response, 404, { error: "not found" });
    return;
  }

  const headers = {
    "Content-Type": mimeType(file),
    "Access-Control-Allow-Origin": "*",
    "Accept-Ranges": "bytes",
    "Cache-Control": extname(file) === ".m3u8" ? "no-store" : "public, max-age=2"
  };
  response.writeHead(200, headers);
  createReadStream(file).pipe(response);
}

function serveTransportStream(request, response) {
  if (!existsSync(join(liveRoot, "index.m3u8"))) {
    sendJson(response, 503, { error: "stream not ready" });
    return;
  }

  const relay = spawn(findFfmpeg(), [
    "-hide_banner",
    "-loglevel", "error",
    "-i", `http://127.0.0.1:${port}/live/index.m3u8`,
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c", "copy",
    "-f", "mpegts",
    "-mpegts_flags", "+resend_headers",
    "pipe:1"
  ], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"]
  });

  response.writeHead(200, {
    "Content-Type": "video/mp2t",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Connection": "close"
  });
  relay.stdout.pipe(response);

  const closeRelay = () => {
    if (!relay.killed) relay.kill("SIGTERM");
  };
  request.on("close", closeRelay);
  response.on("close", closeRelay);
  relay.on("exit", () => {
    if (!response.writableEnded) response.end();
  });
}

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    response.end();
    return;
  }

  if (url.pathname === "/api/status") {
    sendJson(response, 200, {
      ...state,
      running: Boolean(ffmpeg),
      playlistReady: existsSync(join(liveRoot, "index.m3u8")),
      streamUrl: `http://${request.headers.host}/live/index.m3u8`
    });
    return;
  }

  if (url.pathname === "/api/start" && request.method === "POST") {
    try {
      startStream(url.searchParams.get("mode") || "test", url.searchParams.get("source"));
      sendJson(response, 202, state);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/stop" && request.method === "POST") {
    stopStream();
    sendJson(response, 200, state);
    return;
  }

  if (url.pathname.startsWith("/live/")) {
    serveFile(response, liveRoot, url.pathname.slice("/live/".length));
    return;
  }

  if (url.pathname === "/live.ts") {
    serveTransportStream(request, response);
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    serveFile(response, appRoot, "index.html");
    return;
  }

  serveFile(response, appRoot, url.pathname.slice(1));
});

server.listen(port, host, () => {
  console.log(`UniTV TV Bridge: http://localhost:${port}`);
  console.log(`Stream: http://192.168.0.10:${port}/live/index.m3u8`);

  const autostart = process.argv
    .find(argument => argument.startsWith("--autostart="))
    ?.split("=", 2)[1];
  if (autostart) {
    startStream(autostart);
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopStream();
    server.close(() => process.exit(0));
  });
}
