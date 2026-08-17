#!/usr/bin/env node
/**
 * PICA A PONTE — de UM arquivo de 11 mil linhas para módulos com dono.
 *
 *     node scripts/ponte-picar.js            (recusa se ponte-src já existe)
 *     node scripts/ponte-picar.js --forcar   (repica por cima)
 *
 * USO ÚNICO. Depois do primeiro corte a FONTE é `logistica/ponte-src/` e o
 * `ponte.js` embarcado é GERADO por `scripts/ponte-costurar.js`. Rodar isto de
 * novo repicaria o gerado — por isso o portão do `--forcar`.
 *
 * 🔴 NINGUÉM MOVE CÓDIGO À MÃO. O corte é por LINHA INTEIRA: cada segmento é
 * uma fatia contígua de bytes do original, sem wrapper, sem cabeçalho, sem uma
 * linha a mais nem a menos. A concatenação dos pedaços na ordem reproduz o
 * arquivo BYTE A BYTE (o portão desta rodada é o sha256 igual) — e é por isso
 * que o escopo léxico único do IIFE continua inteiro: a costura devolve UM
 * arquivo, os `let` de topo continuam se enxergando.
 *
 * 🔴 CORTE SÓ EM FRONTEIRA DE INSTRUÇÃO TOP-LEVEL. Cada linha de corte é
 * conferida por um varredor que sabe onde é comentário, string, template e
 * regex: a profundidade ali tem que ser exatamente "dentro do IIFE" (1 chave,
 * 1 parêntese, 0 colchetes) e o estado tem que ser CÓDIGO. Sem isso o pedaço
 * abriria no meio de uma função e o próximo humano editaria um toco.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const raiz = path.join(__dirname, '..');
const LOGISTICA = path.join(raiz, 'EntregaShell/app/src/logistica');
const PONTE = path.join(LOGISTICA, 'assets', 'app', 'ponte.js'); // GERADO, vai no APK
// A FONTE mora FORA de `assets/` (10/08): o que está em assets é embarcado, e
// 589 KB de fonte que ninguém carrega dobrariam a ponte dentro do APK à toa.
const SRC = path.join(LOGISTICA, 'ponte-src');

/* O MAPA DO CORTE. `linha` é a PRIMEIRA linha (1-based) do pedaço; o pedaço vai
   até a linha anterior ao próximo. Os nomes saem da ordem física do conteúdo —
   quem manda é o comentário de seção que abre o trecho. A onda 2 é que muda
   função de lugar; aqui ninguém se move. */
const CORTES = [
  { linha: 1, nome: '00-nucleo' },              // tema · Voltar · cordão de update · teclado · porta de dados · L1 rota do dia
  { linha: 840, nome: '10-geofence-montagem' }, // geofence nativo · barra do motorista · L2 entra na Montagem · rascunho
  { linha: 1768, nome: '20-montagem-previa' },  // prévia · avulsa · histórico · 3 espaços do dia · trecho entre clientes
  { linha: 2551, nome: '30-verbos-rota' },      // soltar o dia · ordem · materializar · iniciar · cancelar · reordenar
  { linha: 3373, nome: '40-mapa-palcos' },      // L3a o mapa de verdade · um mapa por palco · enquadramento · geometria
  { linha: 4229, nome: '50-cena-ruas' },        // a cena das ruas (entrada e rota nova desenhando os tiles)
  { linha: 5226, nome: '60-prospector-nav' },   // L3b empresas do corredor · cromo da navegação · posição · tô-chegando
  { linha: 6033, nome: '70-traco-camera' },     // pintura do seam · traço e câmera · descida 2D→3D · dedo na câmera
  { linha: 6828, nome: '80-gps-rotas-salvas' }, // voz da manobra · modo dirigindo · assinatura do GPS · L10 rotas salvas
  { linha: 7644, nome: '90-ajustes-financeiro' }, // trava da ordem · L9 ajustes/recarga/consumo · créditos · financeiro
  { linha: 8323, nome: 'A0-chat-produtos' },    // L8 chat com a central · L7 produtos
  { linha: 8996, nome: 'B0-clientes-ficha' },   // L6 clientes e ficha
  { linha: 9810, nome: 'C0-encaixe-semana' },   // o encaixe · L5 fechamento do dia e a semana
  { linha: 10428, nome: 'D0-porta-entrega' },   // L4 a porta: chegar, entregar, receber · registrar local
];

/* 🔴 SEM TETO (17/08, ordem do dono: *"destrave esse teto de 1000 linhas, só
   remova"*). Aqui ele era o portão do PICADOR — o script que quebra a ponte
   costurada de volta em fontes. Ver o porquê inteiro em `ponte-costurar.js`. */
const TETO = Infinity;

/* ------------------------------------------------------------------------
   O VARREDOR — onde é código de verdade e qual a profundidade em cada linha.
   Devolve, por índice de linha (0-based), o estado no PRIMEIRO byte dela.
   ------------------------------------------------------------------------ */
function varrer(src) {
  const n = src.length;
  let i = 0, linha = 0;
  let chaves = 0, parens = 0, colchetes = 0;
  let estado = 'code'; // code | linha | bloco | aspa1 | aspa2 | template
  const pilhaTpl = []; // profundidade de chaves ao entrar num `${`
  let ultimo = ''; // último byte significativo: decide regex × divisão
  const inicios = [{ chaves: 0, parens: 0, colchetes: 0, limpo: true }];
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '\n') {
      linha++;
      if (estado === 'linha') estado = 'code';
      i++;
      inicios[linha] = { chaves, parens, colchetes, limpo: estado === 'code' && pilhaTpl.length === 0 };
      continue;
    }
    if (estado === 'linha') { i++; continue; }
    if (estado === 'bloco') { if (c === '*' && d === '/') { estado = 'code'; i += 2; } else i++; continue; }
    if (estado === 'aspa1' || estado === 'aspa2') {
      if (c === '\\') { i += 2; continue; }
      if ((estado === 'aspa1' && c === "'") || (estado === 'aspa2' && c === '"')) estado = 'code';
      i++; continue;
    }
    if (estado === 'template') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { estado = 'code'; i++; continue; }
      if (c === '$' && d === '{') { pilhaTpl.push(chaves); chaves++; estado = 'code'; i += 2; continue; }
      i++; continue;
    }
    if (c === '/' && d === '/') { estado = 'linha'; i += 2; continue; }
    if (c === '/' && d === '*') { estado = 'bloco'; i += 2; continue; }
    if (c === "'") { estado = 'aspa1'; ultimo = "'"; i++; continue; }
    if (c === '"') { estado = 'aspa2'; ultimo = '"'; i++; continue; }
    if (c === '`') { estado = 'template'; ultimo = '`'; i++; continue; }
    if (c === '/') {
      // `/` depois de valor é DIVISÃO; depois de operador/abre-parêntese é REGEX.
      if (!/[A-Za-z0-9_$)\]'"`]/.test(ultimo)) {
        i++;
        let classe = false;
        while (i < n) {
          const r = src[i];
          if (r === '\\') { i += 2; continue; }
          if (r === '[') classe = true;
          else if (r === ']') classe = false;
          else if (r === '/' && !classe) { i++; break; }
          else if (r === '\n') break; // literal de regex não atravessa linha
          i++;
        }
        while (i < n && /[a-z]/.test(src[i])) i++; // as bandeiras (g, i, m, u, y, s)
        ultimo = '/';
        continue;
      }
      ultimo = '/'; i++; continue;
    }
    if (c === '{') chaves++;
    else if (c === '}') {
      chaves--;
      if (pilhaTpl.length && chaves === pilhaTpl[pilhaTpl.length - 1]) {
        pilhaTpl.pop(); estado = 'template'; i++; ultimo = '}'; continue;
      }
    } else if (c === '(') parens++;
    else if (c === ')') parens--;
    else if (c === '[') colchetes++;
    else if (c === ']') colchetes--;
    if (!/\s/.test(c)) ultimo = c;
    i++;
  }
  return { inicios, fim: { chaves, parens, colchetes, estado, tpl: pilhaTpl.length } };
}

function morrer(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

const forcar = process.argv.includes('--forcar');
if (!fs.existsSync(PONTE)) morrer(`não achei ${PONTE}`);
if (fs.existsSync(SRC) && fs.readdirSync(SRC).some((f) => f.endsWith('.js')) && !forcar) {
  morrer(
    `${path.relative(raiz, SRC)} já existe com fonte dentro.\n` +
    '   A ponte JÁ foi picada: a fonte é essa pasta e o ponte.js é GERADO\n' +
    '   (node scripts/ponte-costurar.js). Repicar por cima só com --forcar.',
  );
}

const bruto = fs.readFileSync(PONTE);
const antes = crypto.createHash('sha256').update(bruto).digest('hex');
const texto = bruto.toString('latin1'); // 1 byte = 1 char: índices de linha valem para o buffer

/* offsets de byte de cada início de linha */
const offsets = [0];
for (let i = 0; i < bruto.length; i++) if (bruto[i] === 0x0a) offsets.push(i + 1);
const totalLinhas = bruto[bruto.length - 1] === 0x0a ? offsets.length - 1 : offsets.length;
if (bruto[bruto.length - 1] !== 0x0a) morrer('ponte.js não termina em quebra de linha — o corte por linha ficaria torto.');

const { inicios, fim } = varrer(texto);
if (fim.chaves !== 0 || fim.parens !== 0 || fim.colchetes !== 0 || fim.estado !== 'code' || fim.tpl !== 0) {
  morrer(`o varredor não fechou o arquivo (${JSON.stringify(fim)}) — não confio nos cortes dele.`);
}

/* portão 1: todo corte cai em fronteira de instrução top-level do IIFE */
for (const c of CORTES) {
  if (c.linha === 1) continue;
  const p = inicios[c.linha - 1];
  if (!p) morrer(`corte ${c.nome}: linha ${c.linha} não existe`);
  if (!p.limpo) morrer(`corte ${c.nome} (linha ${c.linha}) cai DENTRO de comentário/string/template`);
  if (p.chaves !== 1 || p.parens !== 1 || p.colchetes !== 0) {
    morrer(
      `corte ${c.nome} (linha ${c.linha}) não é topo do IIFE ` +
      `(chaves ${p.chaves}, parênteses ${p.parens}, colchetes ${p.colchetes})`,
    );
  }
  if (!/^ {2}\S/.test(texto.slice(offsets[c.linha - 1], offsets[c.linha]))) {
    morrer(`corte ${c.nome} (linha ${c.linha}) não começa na coluna 2`);
  }
}

/* portão 2: ordem e teto */
for (let k = 1; k < CORTES.length; k++) {
  if (CORTES[k].linha <= CORTES[k - 1].linha) morrer('a tabela de cortes está fora de ordem');
}
const pedacos = CORTES.map((c, k) => {
  const primeira = c.linha;
  const ultima = k + 1 < CORTES.length ? CORTES[k + 1].linha - 1 : totalLinhas;
  const fatia = bruto.subarray(offsets[primeira - 1], k + 1 < CORTES.length ? offsets[CORTES[k + 1].linha - 1] : bruto.length);
  return { nome: c.nome, primeira, ultima, linhas: ultima - primeira + 1, fatia };
});
for (const p of pedacos) if (p.linhas > TETO) morrer(`${p.nome} ficou com ${p.linhas} linhas (teto ${TETO})`);

/* grava */
fs.mkdirSync(SRC, { recursive: true });
for (const f of fs.readdirSync(SRC)) if (f.endsWith('.js')) fs.unlinkSync(path.join(SRC, f));
for (const p of pedacos) fs.writeFileSync(path.join(SRC, `${p.nome}.js`), p.fatia);

/* portão 3: a costura devolve o original BYTE A BYTE */
const recosturado = Buffer.concat(
  fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort()
    .map((f) => fs.readFileSync(path.join(SRC, f))),
);
const depois = crypto.createHash('sha256').update(recosturado).digest('hex');

console.log('\nPICADA DA PONTE');
console.log('---------------------------------------------------------------');
for (const p of pedacos) {
  console.log(
    `  ${p.nome}.js`.padEnd(30) +
    String(p.linhas).padStart(5) + ' linhas   ' +
    `(originais ${p.primeira}–${p.ultima})`,
  );
}
console.log('---------------------------------------------------------------');
console.log(`  ${pedacos.length} arquivos · maior ${Math.max(...pedacos.map((p) => p.linhas))} linhas · teto ${TETO}`);
console.log(`  sha256 ORIGINAL  ${antes}`);
console.log(`  sha256 COSTURADO ${depois}`);
if (antes !== depois) morrer('a costura NÃO reproduz o original. Nada disso vale.');
console.log('  ✅ byte a byte: o costurado É o original.\n');
