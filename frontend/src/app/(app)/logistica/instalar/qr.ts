// ================================================================
// LOGÍSTICA-MOBILE M9 — gerador de QR Code CLIENT-SIDE, sem dependência.
//
// POR QUE VENDORIZADO (e não CDN/npm): o QR precisa renderizar OFFLINE e sem
// serviço externo de imagem (regra do M9). Um <script src> de CDN some se a
// CDN cai / sem sinal; um pacote novo mexe no package.json/lock no meio do WIP
// do dono. Então portamos aqui um codificador QR mínimo e CORRETO (algoritmo
// clássico de Kazuhiko Arase / davidshimjs, MIT): byte mode + Reed-Solomon +
// máscara automática. Devolve uma MATRIZ booleana (true=módulo escuro) que o
// componente pinta num <canvas> (preto/branco — cores neutras, check-pele ok).
//
// Escopo enxuto: só o necessário pra uma URL curta (byte mode, EC nível M,
// versão automática 1..10). Suficiente de sobra pra "https://…/entrega".
// ================================================================

// ---- Galois Field (GF(256)) para Reed-Solomon ----
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

// Polinômio gerador de grau `degree` (coeficientes RS).
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

// Bytes de correção de erro para um bloco de dados.
function rsEncode(data: number[], ecCount: number): number[] {
  // `gen` tem grau ecCount → ecCount+1 coeficientes, com gen[0]=1 (termo líder).
  // LFSR clássico: o termo líder casa com o res[0] já extraído no `factor`, então
  // o XOR usa gen[i+1] (pula o líder) sobre um res de EXATAMENTE ecCount posições.
  const gen = rsGenerator(ecCount);
  const res = new Array(ecCount).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    for (let i = 0; i < ecCount; i++) res[i] ^= gfMul(gen[i + 1], factor);
  }
  return res;
}

// ---- Tabelas por versão (1..10), nível de correção M ----
// [ totalCodewords, ecPerBlock, blocosGrupo1, dataPorBloco1, blocosGrupo2, dataPorBloco2 ]
type VerSpec = [number, number, number, number, number, number];
const SPEC_M: Record<number, VerSpec> = {
  1: [26, 10, 1, 16, 0, 0],
  2: [44, 16, 1, 28, 0, 0],
  3: [70, 26, 1, 44, 0, 0],
  4: [100, 18, 2, 32, 0, 0],
  5: [134, 24, 2, 43, 0, 0],
  6: [172, 16, 4, 27, 0, 0],
  7: [196, 18, 4, 31, 0, 0],
  8: [242, 22, 2, 38, 2, 39],
  9: [292, 22, 3, 36, 2, 37],
  10: [346, 26, 4, 43, 1, 44],
};
// Capacidade de dados (bytes, byte mode, nível M) por versão.
const CAP_M: Record<number, number> = {
  1: 14, 2: 26, 3: 42, 4: 62, 5: 84, 6: 106, 7: 122, 8: 152, 9: 180, 10: 213,
};
// Padrões de alinhamento (centros) por versão.
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

function chooseVersion(byteLen: number): number {
  for (let v = 1; v <= 10; v++) if (byteLen <= CAP_M[v]) return v;
  throw new Error("URL longa demais para o QR (limite ~213 bytes).");
}

// ---- Bitstream ----
class BitBuffer {
  bits: number[] = [];
  put(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() {
    return this.bits.length;
  }
}

function encodeData(text: string, version: number): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const spec = SPEC_M[version];
  const totalCw = spec[0];
  const ecPer = spec[1];
  const dataCw = totalCw - ecPer * (spec[2] + spec[4]);

  const bb = new BitBuffer();
  bb.put(0b0100, 4); // modo byte
  const lenBits = version <= 9 ? 8 : 16;
  bb.put(bytes.length, lenBits);
  for (const b of bytes) bb.put(b, 8);
  // Terminador + preenchimento até fechar byte.
  const cap = dataCw * 8;
  if (bb.length + 4 <= cap) bb.put(0, 4);
  while (bb.length % 8 !== 0) bb.bits.push(0);
  // Bytes de padding alternados 0xEC / 0x11.
  const pads = [0xec, 0x11];
  let pi = 0;
  const dataBytes: number[] = [];
  for (let i = 0; i < bb.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bb.bits[i + j];
    dataBytes.push(v);
  }
  while (dataBytes.length < dataCw) dataBytes.push(pads[pi++ % 2]);

  // Divide em blocos, calcula EC, intercala (data depois EC) conforme a spec QR.
  const blocks: { data: number[]; ec: number[] }[] = [];
  let offset = 0;
  const push = (count: number, dlen: number) => {
    for (let i = 0; i < count; i++) {
      const d = dataBytes.slice(offset, offset + dlen);
      offset += dlen;
      blocks.push({ data: d, ec: rsEncode(d, ecPer) });
    }
  };
  push(spec[2], spec[3]);
  if (spec[4]) push(spec[4], spec[5]);

  const maxData = Math.max(...blocks.map((b) => b.data.length));
  const out: number[] = [];
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ecPer; i++) for (const b of blocks) out.push(b.ec[i]);
  return out;
}

// ---- Montagem da matriz ----
type Cell = number | null; // null = livre; 0/1 = fixo; usamos boolean no final.

function placeFinder(m: Cell[][], r: number, c: number) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      const inner = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const dark = inner && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      m[rr][cc] = dark ? 1 : 0;
    }
  }
}

function reserveFormat(m: Cell[][]) {
  const n = m.length;
  for (let i = 0; i < 9; i++) {
    if (m[i][8] === null) m[i][8] = 0;
    if (m[8][i] === null) m[8][i] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][n - 1 - i] === null) m[8][n - 1 - i] = 0;
    if (m[n - 1 - i][8] === null) m[n - 1 - i][8] = 0;
  }
  m[n - 8][8] = 1; // módulo escuro fixo
}

function buildMatrix(codewords: number[], version: number): boolean[][] {
  const n = version * 4 + 17;
  const m: Cell[][] = Array.from({ length: n }, () => new Array<Cell>(n).fill(null));

  // Localizadores de canto + separadores.
  placeFinder(m, 0, 0);
  placeFinder(m, 0, n - 7);
  placeFinder(m, n - 7, 0);

  // Timing patterns.
  for (let i = 8; i < n - 8; i++) {
    if (m[6][i] === null) m[6][i] = i % 2 === 0 ? 1 : 0;
    if (m[i][6] === null) m[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Padrões de alinhamento.
  const centers = ALIGN[version];
  for (const r of centers) {
    for (const c of centers) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          m[r + dr][c + dc] = dark ? 1 : 0;
        }
      }
    }
  }

  reserveFormat(m);

  // Reserva as duas áreas de version info (6×3) a partir da versão 7, pra o
  // zigzag NÃO gravar dado nelas (os bits reais entram no applyBestMask).
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        if (m[i][n - 11 + j] === null) m[i][n - 11 + j] = 0;
        if (m[n - 11 + j][i] === null) m[n - 11 + j][i] = 0;
      }
    }
  }

  // Preenche dados em zigue-zague (colunas de 2, de baixo p/ cima, pulando col 6).
  const bits: number[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);

  let bi = 0;
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    const c = col === 6 ? col - 1 : col;
    for (let i = 0; i < n; i++) {
      const row = upward ? n - 1 - i : i;
      for (let k = 0; k < 2; k++) {
        const cc = c - k;
        if (m[row][cc] !== null) continue;
        m[row][cc] = bi < bits.length ? bits[bi++] : 0;
      }
    }
    upward = !upward;
  }

  // Aplica a melhor máscara e grava format info.
  return applyBestMask(m, version);
}

// ---- Máscara + format info ----
const MASKS = [
  (r: number, c: number) => (r + c) % 2 === 0,
  (r: number, _c: number) => r % 2 === 0,
  (_r: number, c: number) => c % 3 === 0,
  (r: number, c: number) => (r + c) % 3 === 0,
  (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function isFunction(m: Cell[][], r: number, c: number, fixed: boolean[][]): boolean {
  return fixed[r][c];
}

function penalty(grid: boolean[][]): number {
  const n = grid.length;
  let p = 0;
  // Regra 1: corridas de 5+ iguais.
  for (let r = 0; r < n; r++) {
    for (let dir = 0; dir < 2; dir++) {
      let run = 1;
      for (let c = 1; c < n; c++) {
        const a = dir === 0 ? grid[r][c] : grid[c][r];
        const b = dir === 0 ? grid[r][c - 1] : grid[c - 1][r];
        if (a === b) {
          run++;
          if (run === 5) p += 3;
          else if (run > 5) p += 1;
        } else run = 1;
      }
    }
  }
  // Regra 2: blocos 2x2.
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++)
      if (grid[r][c] === grid[r][c + 1] && grid[r][c] === grid[r + 1][c] && grid[r][c] === grid[r + 1][c + 1]) p += 3;
  // Regra 3: padrão localizador 1:1:3:1:1.
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= n - 11; c++) {
      let m1 = true;
      let m2 = true;
      for (let k = 0; k < 11; k++) {
        if (grid[r][c + k] !== pat1[k]) m1 = false;
        if (grid[r][c + k] !== pat2[k]) m2 = false;
      }
      if (m1 || m2) p += 40;
      let v1 = true;
      let v2 = true;
      for (let k = 0; k < 11; k++) {
        if (grid[c + k][r] !== pat1[k]) v1 = false;
        if (grid[c + k][r] !== pat2[k]) v2 = false;
      }
      if (v1 || v2) p += 40;
    }
  }
  // Regra 4: proporção de escuros.
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c]) dark++;
  const ratio = (dark / (n * n)) * 100;
  p += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return p;
}

// BCH(15,5) para format info (nível M = bits 00).
function formatBits(maskIndex: number): number[] {
  const ecBits = 0b00; // nível M
  const data = (ecBits << 3) | maskIndex;
  let rem = data << 10;
  const g = 0b10100110111;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= g << (i - 10);
  const bits = ((data << 10) | rem) ^ 0b101010000010010;
  const out: number[] = [];
  for (let i = 14; i >= 0; i--) out.push((bits >> i) & 1);
  return out;
}

// Version information (18 bits: 6 de dados + 12 de BCH) — obrigatória a partir da
// versão 7. Sem ela, decoders (jsQR) rejeitam o QR e os 2×18 módulos viram lixo.
function versionBits(version: number): number[] {
  let rem = version << 12;
  const g = 0b1111100100101; // gerador BCH(18,6)
  for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= g << (i - 12);
  const bits = (version << 12) | rem;
  const out: number[] = [];
  for (let i = 17; i >= 0; i--) out.push((bits >> i) & 1);
  return out;
}

// Coloca a version info nos dois blocos 6×3 (junto aos localizadores TR e BL).
// Ordem canônica: bit i em (i div 3, i mod 3) espelhado — bloco superior-direito
// nas colunas n-11..n-9 (linhas 0..5) e o bloco inferior-esquerdo transposto.
function placeVersion(grid: boolean[][], version: number) {
  if (version < 7) return;
  const n = grid.length;
  const v = versionBits(version); // v[0] = bit 17 (mais significativo)
  for (let i = 0; i < 18; i++) {
    const bit = v[17 - i] === 1; // i = índice do bit (0 = menos significativo)
    const r = Math.floor(i / 3);
    const c = i % 3;
    grid[r][n - 11 + c] = bit; // bloco superior-direito
    grid[n - 11 + c][r] = bit; // bloco inferior-esquerdo (transposto)
  }
}

function placeFormat(grid: boolean[][], maskIndex: number) {
  const n = grid.length;
  const f = formatBits(maskIndex);
  // Cópia 1 (em torno do localizador superior-esquerdo).
  for (let i = 0; i <= 5; i++) grid[8][i] = f[i] === 1;
  grid[8][7] = f[6] === 1;
  grid[8][8] = f[7] === 1;
  grid[7][8] = f[8] === 1;
  for (let i = 9; i <= 14; i++) grid[14 - i][8] = f[i] === 1;
  // Cópia 2 — vertical (bits 0..6 nas linhas n-1..n-7 da coluna 8) e horizontal
  // (bits 7..14 nas colunas n-8..n-1 da linha 8). O MÓDULO ESCURO fixo em
  // (n-8, 8) NÃO faz parte do format info: fica preservado (por isso o vertical
  // vai só até i=6, e o horizontal começa em bit 7).
  for (let i = 0; i <= 6; i++) grid[n - 1 - i][8] = f[i] === 1;
  for (let i = 7; i <= 14; i++) grid[8][n - 8 + (i - 7)] = f[i] === 1;
  grid[n - 8][8] = true; // módulo escuro fixo (sempre 1).
}

function applyBestMask(m: Cell[][], version: number): boolean[][] {
  const n = m.length;
  // Marca quais células são função (não recebem máscara).
  const fixed: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  markFunction(fixed, version);

  let best: boolean[][] | null = null;
  let bestPen = Infinity;
  let bestMask = 0;
  for (let mask = 0; mask < 8; mask++) {
    const grid: boolean[][] = Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) => {
        const base = m[r][c] === 1;
        if (isFunction(m, r, c, fixed)) return base;
        return MASKS[mask](r, c) ? !base : base;
      }),
    );
    placeFormat(grid, mask);
    placeVersion(grid, version); // version info (v7+) — sobre a máscara, como format.
    const pen = penalty(grid);
    if (pen < bestPen) {
      bestPen = pen;
      best = grid;
      bestMask = mask;
    }
  }
  void bestMask;
  return best!;
}

// Recalcula onde ficam os módulos de FUNÇÃO (para não mascará-los).
function markFunction(fixed: boolean[][], version: number) {
  const n = version * 4 + 17;
  const mark = (r: number, c: number) => {
    if (r >= 0 && c >= 0 && r < n && c < n) fixed[r][c] = true;
  };
  // Localizadores + separadores (8x8 nos 3 cantos).
  for (const [br, bc] of [[0, 0], [0, n - 8], [n - 8, 0]] as const)
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) mark(br + r, bc + c);
  // Timing.
  for (let i = 0; i < n; i++) {
    mark(6, i);
    mark(i, 6);
  }
  // Format info.
  for (let i = 0; i < 9; i++) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    mark(8, n - 1 - i);
    mark(n - 1 - i, 8);
  }
  mark(n - 8, 8);
  // Alinhamento.
  const centers = ALIGN[version];
  for (const r of centers)
    for (const c of centers) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) mark(r + dr, c + dc);
    }
  // Version info (v7+): dois blocos 6×3 junto aos localizadores TR e BL.
  if (version >= 7) {
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) {
        mark(i, n - 11 + j);
        mark(n - 11 + j, i);
      }
  }
}

/**
 * Gera a matriz de módulos do QR para um texto (byte mode, EC nível M).
 * `true` = módulo escuro. O componente pinta num canvas (preto/branco).
 */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text).length;
  const version = chooseVersion(bytes);
  const codewords = encodeData(text, version);
  return buildMatrix(codewords, version);
}
