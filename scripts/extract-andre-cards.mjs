import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = 'C:/Users/Jhonatan/Pictures/Clientes André/sexta';
const out = 'C:/Users/Jhonatan/Pictures/Clientes André/lotes-8-12.jsonl';
const files = fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort((a, b) => a.localeCompare(b, 'en'));
const pending = files.slice(140);
const done = new Set();
if (fs.existsSync(out)) {
  for (const line of fs.readFileSync(out, 'utf8').split(/\r?\n/).filter(Boolean)) {
    try { done.add(JSON.parse(line).foto); } catch {}
  }
}

const prompt = `Leia somente a ficha manuscrita desta imagem. Ignore completamente datas, preços, quantidades e histórico de compras abaixo da linha principal. Retorne JSON puro, sem markdown, neste formato: {"nome":string|null,"bairro":string|null,"logradouro":string|null,"numero":string|null,"complemento":string|null,"telefone":string|null,"dia":"segunda-feira"|"terça-feira"|"quarta-feira"|"quinta-feira"|"sexta-feira"|"sábado"|"domingo"|null,"duvidas":string|null}. Não invente. Preserve grafia incerta e explique em duvidas. O título grande no canto normalmente é o dia.`;

for (let i = 0; i < pending.length; i++) {
  const foto = i + 141;
  if (done.has(foto)) continue;
  const resized = path.join(process.env.TEMP || '.', `andre-card-${foto}.jpg`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(dir, pending[i]), '-vf', "scale='min(900,iw)':-2", '-q:v', '3', resized]);
  const image = fs.readFileSync(resized).toString('base64');
  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'qwen2.5vl:7b', prompt, images: [image], stream: false, format: 'json', options: { temperature: 0, num_ctx: 4096, num_predict: 300 } }),
  });
  if (!response.ok) throw new Error(`${foto}: HTTP ${response.status} ${await response.text()}`);
  const payload = await response.json();
  let parsed;
  try { parsed = JSON.parse(payload.response); } catch { parsed = { erro: payload.response }; }
  const row = { foto, arquivo: pending[i], ...parsed };
  fs.appendFileSync(out, JSON.stringify(row) + '\n');
  fs.rmSync(resized, { force: true });
  process.stdout.write(`${foto}/229 ${row.nome ?? 'SEM NOME'}\n`);
}
