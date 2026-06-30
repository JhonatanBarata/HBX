// ─────────────────────────────────────────────────────────────────────────
// voice-fx.ts — Alterador de voz (módulo "VC"), 100% no navegador.
//
// Processa a nota de voz GRAVADA (offline) deslocando o TOM da voz. Usa WSOLA
// (Waveform Similarity Overlap-Add) — emenda no domínio do TEMPO alinhando os
// trechos por similaridade de onda. NÃO mexe em fase espectral, então NÃO solta
// aquele timbre metálico/robótico de phase vocoder ("voz de proteção"). É a
// mesma família de algoritmo do SoundTouch.
//
// Saída em WAV (PCM 16-bit). O motor (Webwhats/Baileys) já transcodifica para
// opus/PTT — WAV entra e vira nota de voz tocável. Nada muda no motor/envio.
// ─────────────────────────────────────────────────────────────────────────

export type VoiceMode = 'normal' | 'fem' | 'masc';

// TOM padrão por modo (multiplicador de altura). 1.0 = sem mudança; >1 mais
// aguda; <1 mais grave. O admin afina ao vivo no slider (salvo no navegador).
//   1.25 ≈ +3.9 semitons | 0.85 ≈ -2.8 semitons
export const VOICE_PITCH_DEFAULTS: Record<Exclude<VoiceMode, 'normal'>, number> = {
  fem: 1.25,
  masc: 0.85,
};

// Faixa do slider de afinação por modo (mín/máx do "Tom").
export const VOICE_PITCH_RANGE: Record<Exclude<VoiceMode, 'normal'>, { min: number; max: number }> = {
  fem: { min: 1.05, max: 1.6 },
  masc: { min: 0.6, max: 0.95 },
};

export const VOICE_MODE_LABEL: Record<VoiceMode, string> = {
  normal: 'Normal',
  fem: 'Feminina',
  masc: 'Masculina',
};

export type DecodedAudio = { data: Float32Array; sampleRate: number };

// ── Decodifica o blob gravado (webm/ogg) → PCM mono Float32 + sampleRate. ──────
export async function decodeAudioBlob(blob: Blob): Promise<DecodedAudio> {
  const arrayBuffer = await blob.arrayBuffer();
  const w = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AC = w.AudioContext ?? w.webkitAudioContext;
  if (!AC) throw new Error('AudioContext indisponível neste navegador.');
  const ctx = new AC();
  try {
    const buf: AudioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const ch = buf.numberOfChannels;
    const len = buf.length;
    const out = new Float32Array(len);
    for (let c = 0; c < ch; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) out[i] += d[i];
    }
    if (ch > 1) for (let i = 0; i < len; i++) out[i] /= ch;
    return { data: out, sampleRate: buf.sampleRate };
  } finally {
    ctx.close().catch(() => undefined);
  }
}

// ── FFT iterativa radix-2 (in-place). inverse não normaliza (dividimos à mão). ─
function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wlenR = Math.cos(ang), wlenI = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const vr = re[b] * wr - im[b] * wi;
        const vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
        const nwr = wr * wlenR - wi * wlenI;
        wi = wr * wlenI + wi * wlenR; wr = nwr;
      }
    }
  }
}

// ── Phase vocoder LIMPO (smbPitchShift) — desloca o TOM mantendo a duração. ────
// Sem manipulação de formante (era o que metalizava): apenas remapeia os
// harmônicos por `pitch` com fase propagada. pitch>1 = aguda; <1 = grave.
function pitchShift(x: Float32Array, pitch: number): Float32Array {
  if (Math.abs(pitch - 1) < 0.01 || x.length < 2048) return x.slice();
  const N = 2048;
  const osamp = 8;                 // 8x overlap = menos artefato
  const step = N / osamp;
  const half = N / 2;
  const expct = (2 * Math.PI * step) / N;
  const freqPerBin = 1 / N;        // em ciclos/amostra (sr cancela no remap)

  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const lastPhase = new Float64Array(half + 1);
  const sumPhase = new Float64Array(half + 1);
  const anaMagn = new Float64Array(half + 1);
  const anaFreq = new Float64Array(half + 1);
  const synMagn = new Float64Array(half + 1);
  const synFreq = new Float64Array(half + 1);

  const output = new Float32Array(x.length + N);
  const gain = 2 / (osamp * 0.5);  // OLA de Hann com osamp

  for (let pos = 0; pos + N <= x.length; pos += step) {
    for (let i = 0; i < N; i++) { re[i] = x[pos + i] * win[i]; im[i] = 0; }
    fft(re, im, false);

    // análise: magnitude + frequência verdadeira (em ciclos/amostra)
    for (let k = 0; k <= half; k++) {
      const r = re[k], ii = im[k];
      const magn = Math.sqrt(r * r + ii * ii);
      const phase = Math.atan2(ii, r);
      let tmp = phase - lastPhase[k];
      lastPhase[k] = phase;
      tmp -= k * expct;
      const qpd = Math.round(tmp / Math.PI);
      tmp -= Math.PI * qpd;
      tmp = (osamp * tmp) / (2 * Math.PI);
      anaMagn[k] = magn;
      anaFreq[k] = (k + tmp) * freqPerBin;
    }

    // pitch shift: remapeia bin k -> k*pitch
    for (let k = 0; k <= half; k++) { synMagn[k] = 0; synFreq[k] = 0; }
    for (let k = 0; k <= half; k++) {
      const idx = Math.round(k * pitch);
      if (idx >= 0 && idx <= half) {
        synMagn[idx] += anaMagn[k];
        synFreq[idx] = anaFreq[k] * pitch;
      }
    }

    // síntese: reconstrói fase acumulada
    for (let k = 0; k <= half; k++) {
      let tmp = synFreq[k] / freqPerBin - k;
      tmp = (2 * Math.PI * tmp) / osamp;
      tmp += k * expct;
      sumPhase[k] += tmp;
      const phase = sumPhase[k];
      re[k] = synMagn[k] * Math.cos(phase);
      im[k] = synMagn[k] * Math.sin(phase);
    }
    for (let k = 1; k < half; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    im[0] = 0; im[half] = 0;

    fft(re, im, true);
    for (let i = 0; i < N; i++) output[pos + i] += (re[i] / N) * win[i] * gain;
  }

  return output.subarray(0, x.length);
}

// Normaliza o pico para ~-1dBFS (evita clip nas bordas do overlap).
function normalizePeak(buf: Float32Array, target = 0.9) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
  if (peak > 1e-6) {
    const g = target / peak;
    if (g < 1) for (let i = 0; i < buf.length; i++) buf[i] *= g;
  }
  return buf;
}

// ── PCM Float32 mono → WAV (PCM 16-bit). ──────────────────────────────────────
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, 1, true);        // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// ── Alto nível: aplica o modo de voz no PCM decodificado → WAV Blob. ──────────
// `pitch` opcional sobrescreve o padrão do modo (usado pelo slider de afinação).
export function renderVoiceWav(decoded: DecodedAudio, mode: VoiceMode, pitch?: number): Blob {
  if (mode === 'normal') return encodeWav(decoded.data, decoded.sampleRate);
  const p = typeof pitch === 'number' && pitch > 0 ? pitch : VOICE_PITCH_DEFAULTS[mode];
  const shifted = pitchShift(decoded.data, p);
  normalizePeak(shifted);
  return encodeWav(shifted, decoded.sampleRate);
}
