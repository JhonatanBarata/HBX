#!/usr/bin/env node
// radares-gerar.mjs — F1 do PR12082026-RADAR-E-VELOCIDADE
//
// Gera o arquivo estático de radares do Sudeste (SP/RJ/MG/ES) a partir de 3 fontes
// abertas de uso comercial livre e sobe pro Cloudflare R2 (mesmo bucket dos tiles,
// servido por https://mapa.hbxsystem.com.br).
//
// Fontes (MapaRadar e SCDB são PROIBIDAS — licença):
//   1. DNIT / PNCV  — CKAN servicos.dnit.gov.br (XLSX mais recente, descoberto via API).
//                     Traz lat/lng; NÃO traz limite de velocidade (nenhuma safra traz).
//   2. DER-SP       — radares.xlsx dos dados abertos (host novo dersp.der.sp.gov.br;
//                     o host antigo www.der.sp.gov.br devolve a homepage com HTTP 200 —
//                     por isso o download valida magic bytes, nunca confia no status).
//   3. OSM          — UMA consulta Overpass em lote (nunca por tecla): nodes
//                     highway=speed_camera + relações type=enforcement nas áreas
//                     ISO3166-2 BR-SP/RJ/MG/ES. Equivale ao osmium tags-filter do PBF
//                     do Sudeste sem baixar 850 MB no VPS. Relações dão o maxspeed
//                     fiscalizado e o sentido (bearing from→to).
//
// Saída: radares-sudeste-YYYYMMDD.json.gz — array de
//   { lat, lng, limite, tipo, sentido, via, fonte }
//   limite em km/h ou null · sentido em graus (0-359) ou null · tipo sempre "fixo"
//   (PNCV/DER-SP/OSM só listam equipamento fixo) · fonte: "der-sp" | "dnit" | "osm".
//
// Dedup: ~40 m por proximidade (haversine em grade). Ordem de inserção
// der-sp → dnit → osm; ponto novo a <40 m de um existente NÃO entra, mas PREENCHE
// campos null do existente (é assim que o ponto do governo ganha o limite do OSM).
//
// Uso:
//   node scripts/radares-gerar.mjs                 # só gera (imprime caminho e stats)
//   node scripts/radares-gerar.mjs --upload        # gera + sobe .gz e manifesto pro R2
//   node scripts/radares-gerar.mjs --out <dir>     # muda o diretório de saída
//
// R2: credenciais em .env.local da raiz (R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/
// ENDPOINT/BUCKET — mesmas do upload dos tiles brasil-*.pmtiles). Upload é S3 PutObject
// com SigV4 assinado aqui mesmo (zero dependência nova). Idempotente: rodar de novo no
// mesmo dia sobrescreve o mesmo objeto; o manifesto sempre aponta a versão corrente.
// Roda na bancada ou no VPS (só precisa de node >= 18 e do xlsx que já mora em
// backend/node_modules). 1x por mês é o ritmo.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// ---------- config ----------
const UFS_SUDESTE = new Set(['SP', 'RJ', 'MG', 'ES']);
// Caixa de sanidade do Sudeste (coordenada fora disso é lixo de digitação)
const BBOX = { latMin: -26.0, latMax: -13.5, lngMin: -54.5, lngMax: -38.0 };
const DEDUP_METROS = 40;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const DNIT_CKAN = 'https://servicos.dnit.gov.br/dadosabertos/api/3/action/package_show?id=controle-de-velocidade';
const DNIT_FALLBACK = 'https://servicos.dnit.gov.br/dadosabertos/dataset/afb1da02-221b-462b-a3e1-1b11dffb495b/resource/32ece134-15bf-40be-9582-d8889e71062e/download/cgpert___pncv___07_2026.xlsx';
const DERSP_URL = 'https://dersp.der.sp.gov.br/WebSite/Arquivos/DadosAbertos/AtivosRodoviarios/Radar/radares.xlsx';
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const OVERPASS_QUERY = `[out:json][timeout:600];
area["ISO3166-2"~"^BR-(SP|RJ|MG|ES)$"]["admin_level"="4"]->.a;
(
  node["highway"="speed_camera"](area.a);
  relation["type"="enforcement"](area.a);
);
out body;
>;
out skel qt;`;

// ---------- util ----------
function log(...a) { console.log('[radares]', ...a); }

function loadEnvLocal() {
  const out = {};
  const file = path.join(repoRoot, '.env.local');
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

function requireXlsx() {
  for (const p of [
    path.join(repoRoot, 'backend', 'node_modules', 'xlsx'),
    path.join(repoRoot, 'frontend', 'node_modules', 'xlsx'),
  ]) {
    if (fs.existsSync(p)) return require(p);
  }
  throw new Error('lib xlsx não encontrada em backend/ nem frontend/node_modules — rodar npm install no backend.');
}

async function baixar(url, { binario = true, tenta = 3 } = {}) {
  let ultimoErro;
  for (let i = 0; i < tenta; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return binario ? buf : buf.toString('utf8');
    } catch (e) {
      ultimoErro = e;
      log(`tentativa ${i + 1}/${tenta} falhou: ${e.message}`);
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw ultimoErro;
}

// ALARME, não engolir: XLSX de verdade começa com PK (zip). Servidor de governo
// devolve homepage HTML com HTTP 200 quando o caminho morre.
function exigirXlsx(buf, fonte) {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error(`${fonte}: resposta não é XLSX (magic ${buf.slice(0, 4).toString('hex')}) — o caminho do arquivo mudou? Primeiros bytes: ${buf.slice(0, 120).toString('utf8').replace(/\s+/g, ' ')}`);
  }
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingGraus(lat1, lng1, lat2, lng2) {
  const f1 = (lat1 * Math.PI) / 180, f2 = (lat2 * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

function dentroDaCaixa(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax;
}

const CARDEAL = { N: 0, NNE: 22, NE: 45, ENE: 67, E: 90, ESE: 112, SE: 135, SSE: 157, S: 180, SSW: 202, SW: 225, WSW: 247, W: 270, WNW: 292, NW: 315, NNW: 337 };
function parseDirection(v) {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  if (/^\d{1,3}$/.test(s)) { const n = Number(s); return n >= 0 && n < 360 ? n : null; }
  if (s in CARDEAL) return CARDEAL[s];
  return null; // "forward", "45;225" (dupla direção), etc. — sem sentido único
}

function parseMaxspeed(v) {
  if (v == null) return null;
  const m = String(v).match(/^\s*(\d{2,3})\s*(km\/?h)?\s*$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 20 && n <= 130 ? n : null;
}

// ---------- fontes ----------
async function fonteDnit(XLSX) {
  let url = DNIT_FALLBACK;
  try {
    const pkg = JSON.parse(await baixar(DNIT_CKAN, { binario: false }));
    const xlsxRes = (pkg.result?.resources || [])
      .filter((r) => String(r.format).toUpperCase() === 'XLSX' && /controle de velocidade/i.test(r.name || ''))
      .sort((a, b) => String(b.last_modified || b.created || '').localeCompare(String(a.last_modified || a.created || '')));
    if (xlsxRes.length) { url = xlsxRes[0].url; log(`DNIT via CKAN: ${xlsxRes[0].name}`); }
  } catch (e) {
    log(`DNIT: CKAN falhou (${e.message}), usando URL fixa de julho/2026`);
  }
  const buf = await baixar(url);
  exigirXlsx(buf, 'DNIT');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const pontos = [];
  let semCoord = 0, foraSudeste = 0;
  for (const r of rows) {
    if (!UFS_SUDESTE.has(String(r['UF']).trim())) { foraSudeste++; continue; }
    // "Coordenadas (Lat/Long)": "-10,011852 / -67,773819" (vírgula decimal, barra separando)
    const m = String(r['Coordenadas (Lat/Long)'] ?? '').match(/(-?\d+[.,]\d+)\s*\/\s*(-?\d+[.,]\d+)/);
    if (!m) { semCoord++; continue; }
    const lat = Number(m[1].replace(',', '.'));
    const lng = Number(m[2].replace(',', '.'));
    if (!dentroDaCaixa(lat, lng)) { semCoord++; continue; }
    const rodovia = String(r['Rodovia'] ?? '').trim();
    pontos.push({
      lat, lng,
      limite: null, // PNCV atual não publica o limite (conferido nas safras 2026/2024/2023)
      tipo: 'fixo',
      sentido: null,
      via: rodovia ? `BR-${rodovia.padStart(3, '0')}` : null,
      fonte: 'dnit',
    });
  }
  log(`DNIT: ${rows.length} no Brasil, ${pontos.length} no Sudeste (${foraSudeste} fora, ${semCoord} sem coordenada válida)`);
  return pontos;
}

async function fonteDerSp(XLSX) {
  const buf = await baixar(DERSP_URL);
  exigirXlsx(buf, 'DER-SP');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const pontos = [];
  let semCoord = 0, cancelados = 0;
  for (const r of rows) {
    if (r['Cancelamento'] != null && String(r['Cancelamento']).trim() !== '') { cancelados++; continue; }
    // "Coordenadas": "-22.910293, -46.546438"
    const m = String(r['Coordenadas'] ?? '').match(/(-?\d+[.,]\d+)\s*,\s*(-?\d+[.,]\d+)/);
    if (!m) { semCoord++; continue; }
    const lat = Number(m[1].replace(',', '.'));
    const lng = Number(m[2].replace(',', '.'));
    if (!dentroDaCaixa(lat, lng)) { semCoord++; continue; }
    const via = String(r['Rodovia'] ?? '').trim().replace(/\s+/g, '-') || null; // "SP 008" -> "SP-008"
    pontos.push({ lat, lng, limite: null, tipo: 'fixo', sentido: null, via, fonte: 'der-sp' });
  }
  log(`DER-SP: ${rows.length} linhas, ${pontos.length} válidos (${cancelados} cancelados, ${semCoord} sem coordenada)`);
  return pontos;
}

async function fonteOsm() {
  let json;
  let ultimoErro;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        // Overpass recusa (406) UA de navegador em client não-navegador; etiqueta da API
        // pede UA identificável. O UA de Chrome fica só pros XLSX de governo.
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'HBX-radares-gerar/1.0 (hbxsystem.com.br)' },
        body: 'data=' + encodeURIComponent(OVERPASS_QUERY),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
      break;
    } catch (e) { ultimoErro = e; log(`Overpass ${url} falhou: ${e.message}`); }
  }
  if (!json) throw ultimoErro;

  const porId = new Map();
  for (const el of json.elements) if (el.type === 'node') porId.set(el.id, el);

  const pontos = [];
  let relSemDevice = 0;

  // 1) relações type=enforcement com maxspeed: device = posição; from->to = sentido
  const devicesDeRelacao = new Set();
  for (const el of json.elements) {
    if (el.type !== 'relation' || !el.tags) continue;
    const limite = parseMaxspeed(el.tags.maxspeed);
    if (limite == null) continue; // enforcement sem maxspeed não é radar de velocidade utilizável
    const device = (el.members || []).find((m) => m.role === 'device' && m.type === 'node');
    const no = device ? porId.get(device.ref) : null;
    if (!no || !dentroDaCaixa(no.lat, no.lon)) { relSemDevice++; continue; }
    let sentido = null;
    const de = (el.members || []).find((m) => m.role === 'from' && m.type === 'node');
    const para = (el.members || []).find((m) => m.role === 'to' && m.type === 'node');
    const noDe = de ? porId.get(de.ref) : null;
    const noPara = para ? porId.get(para.ref) : null;
    if (noDe && noPara) sentido = bearingGraus(noDe.lat, noDe.lon, noPara.lat, noPara.lon);
    devicesDeRelacao.add(device.ref);
    const tags = no.tags || {};
    pontos.push({
      lat: no.lat, lng: no.lon, limite, tipo: 'fixo',
      sentido: sentido ?? parseDirection(tags.direction),
      via: tags.ref || null, fonte: 'osm',
    });
  }

  // 2) nodes highway=speed_camera (fora os que já entraram como device de relação)
  let cams = 0;
  for (const el of json.elements) {
    if (el.type !== 'node' || !el.tags || el.tags.highway !== 'speed_camera') continue;
    cams++;
    if (devicesDeRelacao.has(el.id)) continue;
    if (!dentroDaCaixa(el.lat, el.lon)) continue;
    pontos.push({
      lat: el.lat, lng: el.lon,
      limite: parseMaxspeed(el.tags.maxspeed),
      tipo: 'fixo',
      sentido: parseDirection(el.tags.direction),
      via: el.tags.ref || null,
      fonte: 'osm',
    });
  }
  log(`OSM: ${cams} nodes speed_camera + ${devicesDeRelacao.size} devices de relação com maxspeed (${relSemDevice} relações sem device aproveitável) => ${pontos.length} pontos`);
  return pontos;
}

// ---------- dedup ~40 m (grade + haversine; novo preenche nulls do existente) ----------
function dedup(listas) {
  const CELULA = 0.0005; // ~55 m de lado — vizinhança 3x3 cobre o raio de 40 m
  const grade = new Map();
  const finais = [];
  const mortos = {};
  const chave = (lat, lng) => `${Math.round(lat / CELULA)}|${Math.round(lng / CELULA)}`;

  for (const { nome, pontos } of listas) {
    mortos[nome] = 0;
    for (const p of pontos) {
      const ci = Math.round(p.lat / CELULA), cj = Math.round(p.lng / CELULA);
      let alvo = null;
      busca: for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const arr = grade.get(`${ci + di}|${cj + dj}`);
          if (!arr) continue;
          for (const q of arr) {
            if (haversineM(p.lat, p.lng, q.lat, q.lng) <= DEDUP_METROS) { alvo = q; break busca; }
          }
        }
      }
      if (alvo) {
        mortos[nome]++;
        // o duplicado morre, mas doa o que o titular não tem
        if (alvo.limite == null && p.limite != null) alvo.limite = p.limite;
        if (alvo.sentido == null && p.sentido != null) alvo.sentido = p.sentido;
        if (alvo.via == null && p.via != null) alvo.via = p.via;
      } else {
        const novo = { ...p, lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) };
        finais.push(novo);
        const k = chave(p.lat, p.lng);
        if (!grade.has(k)) grade.set(k, []);
        grade.get(k).push(novo);
      }
    }
  }
  return { finais, mortos };
}

// ---------- R2 (S3 SigV4, PutObject puro — mesmo bucket/credenciais dos tiles) ----------
function assinarSigV4({ method, host, caminho, payload, headersExtra, chave, segredo }) {
  const agora = new Date();
  const amzDate = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dataCurta = amzDate.slice(0, 8);
  const regiao = 'auto', servico = 's3';
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, ...headersExtra };
  const nomesOrdenados = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = nomesOrdenados.map((h) => `${h}:${String(headers[Object.keys(headers).find((k) => k.toLowerCase() === h)]).trim()}\n`).join('');
  const signedHeaders = nomesOrdenados.join(';');
  const canonicalRequest = [method, caminho, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const escopo = `${dataCurta}/${regiao}/${servico}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, escopo, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${segredo}`, dataCurta), regiao), servico), 'aws4_request');
  const assinatura = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${chave}/${escopo}, SignedHeaders=${signedHeaders}, Signature=${assinatura}`;
  delete headers.host; // fetch põe o Host sozinho
  return headers;
}

async function subirPraR2(nomeObjeto, payload, contentType, cacheControl, env) {
  const endpoint = env.R2_ENDPOINT?.replace(/\/$/, '');
  const bucket = env.R2_BUCKET;
  const chave = env.R2_ACCESS_KEY_ID, segredo = env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !chave || !segredo) {
    throw new Error('R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY ausentes (.env.local da raiz)');
  }
  const host = new URL(endpoint).host;
  const caminho = `/${bucket}/${nomeObjeto}`;
  const headers = assinarSigV4({
    method: 'PUT', host, caminho, payload,
    headersExtra: { 'content-type': contentType, 'cache-control': cacheControl },
    chave, segredo,
  });
  const res = await fetch(`${endpoint}${caminho}`, { method: 'PUT', headers, body: payload });
  if (!res.ok) throw new Error(`PUT ${nomeObjeto} => HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  log(`R2 OK: ${nomeObjeto} (${payload.length} B)`);
}

// ---------- main ----------
async function main() {
  const args = process.argv.slice(2);
  const upload = args.includes('--upload');
  const outIdx = args.indexOf('--out');
  const outDir = outIdx !== -1 ? path.resolve(args[outIdx + 1]) : path.join(os.tmpdir(), 'radares-hbx');
  fs.mkdirSync(outDir, { recursive: true });

  const XLSX = requireXlsx();
  log('baixando as 3 fontes…');
  const [dnit, dersp, osm] = await Promise.all([fonteDnit(XLSX), fonteDerSp(XLSX), fonteOsm()]);

  const { finais, mortos } = dedup([
    { nome: 'der-sp', pontos: dersp },
    { nome: 'dnit', pontos: dnit },
    { nome: 'osm', pontos: osm },
  ]);

  const porFonte = {};
  let comLimite = 0, comSentido = 0;
  for (const p of finais) {
    porFonte[p.fonte] = (porFonte[p.fonte] || 0) + 1;
    if (p.limite != null) comLimite++;
    if (p.sentido != null) comSentido++;
  }

  const hoje = new Date();
  const ymd = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, '0')}${String(hoje.getDate()).padStart(2, '0')}`;
  const nomeGz = `radares-sudeste-${ymd}.json.gz`;
  const json = JSON.stringify(finais);
  const gz = zlib.gzipSync(Buffer.from(json), { level: 9 });
  const sha256 = crypto.createHash('sha256').update(gz).digest('hex');
  const caminhoGz = path.join(outDir, nomeGz);
  fs.writeFileSync(caminhoGz, gz);

  const manifesto = {
    arquivo: nomeGz,
    url: `https://mapa.hbxsystem.com.br/${nomeGz}`,
    data: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`,
    total: finais.length,
    porFonte,
    comLimite,
    comSentido,
    bytesGz: gz.length,
    sha256,
    schema: '[{lat,lng,limite:kmh|null,tipo:"fixo",sentido:graus|null,via:string|null,fonte:"der-sp"|"dnit"|"osm"}]',
  };
  const caminhoManifesto = path.join(outDir, 'radares-manifest.json');
  fs.writeFileSync(caminhoManifesto, JSON.stringify(manifesto, null, 2));

  log('--- resultado ---');
  log(`antes do dedup: der-sp ${dersp.length} + dnit ${dnit.length} + osm ${osm.length} = ${dersp.length + dnit.length + osm.length}`);
  log(`dedup matou: ${JSON.stringify(mortos)} (total ${Object.values(mortos).reduce((a, b) => a + b, 0)})`);
  log(`final: ${finais.length} pontos (${JSON.stringify(porFonte)}) · com limite ${comLimite} · com sentido ${comSentido}`);
  log(`json ${json.length} B => gz ${gz.length} B · sha256 ${sha256}`);
  log(`arquivos: ${caminhoGz} · ${caminhoManifesto}`);

  if (upload) {
    const env = { ...loadEnvLocal(), ...process.env };
    // .gz é versionado pelo nome => immutable (igual aos tiles). Sem Content-Encoding:
    // o corpo É gzip e o app decide como abrir (DecompressionStream ou ponte nativa).
    await subirPraR2(nomeGz, gz, 'application/gzip', 'public, max-age=31536000, immutable', env);
    // manifesto é o ponteiro da versão corrente => cache curto
    await subirPraR2('radares-manifest.json', Buffer.from(JSON.stringify(manifesto, null, 2)), 'application/json', 'public, max-age=300, must-revalidate', env);
    log(`no ar: https://mapa.hbxsystem.com.br/radares-manifest.json -> ${manifesto.url}`);
  }
}

main().catch((e) => { console.error('[radares] FALHOU:', e.message); process.exit(1); });
