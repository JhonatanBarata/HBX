// ─────────────────────────────────────────────────────────────────────────
// voice-fx.ts — Alterador de voz (módulo "VC"), 100% no navegador.
//
// Processa a nota de voz GRAVADA (offline, não é tempo real → sem latência de
// rede; o VPS fica fora) com um phase vocoder de PITCH e FORMANT independentes.
//   • pitch  = altura da voz (sobe = mais aguda)
//   • formant = timbre/ressonância do trato vocal (o que faz soar "menor")
// Separar os dois é o que deixa imperceptível: só subir pitch vira "chipmunk";
// subir pitch + formant na medida certa = voz feminina natural.
//
// Saída em WAV (PCM 16-bit). O motor (Webwhats/Baileys) já transcodifica o
// áudio enviado para opus/PTT — então WAV entra e vira nota de voz tocável,
// mesmo caminho do envio de áudio de hoje. Nada muda no motor/envio.
// ─────────────────────────────────────────────────────────────────────────

export type VoiceMode = 'normal' | 'fem' | 'masc';

// Presets — TUNÁVEIS. Se quiser mais/menos efeito, mexa aqui.
//   pitch 1.0 = sem mudança; >1 sobe; <1 desce.  (1.30 ≈ +4.7 semitons)
//   formant 1.0 = sem mudança; >1 trato "menor" (feminino); <1 "maior" (grave).
export const VOICE_PRESETS: Record<Exclude<VoiceMode, 'normal'>, { pitch: number; formant: number }> = {
  fem:  { pitch: 1.34, formant: 1.18 },
  masc: { pitch: 0.80, formant: 0.86 },
};

export const VOICE_MODE_LABEL: Record<VoiceMode, string> = {
  normal: 'Normal',
  fem: 'Feminina',
  masc: 'Masculina',
};

export type DecodedAudio = { data: Float32Array; sampleRate: number };

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

// ── Núcleo: phase vocoder (Bernsee) com separação envelope/excitação. ─────────
// Baseado no smbPitchShift, com o magnitude dividido pelo envelope espectral
// (cepstral) antes do shift e o envelope re-aplicado escalado por `formant` —
// dando controle INDEPENDENTE de pitch e formant.
function pitchFormantShift(
  input: Float32Array,
  sampleRate: number,
  pitch: number,
  formant: number,
): Float32Array {
  const N = 2048;            // tamanho da janela FFT
  const osamp = 4;           // sobreposição 4x
  const step = N / osamp;    // hop = 512
  const half = N / 2;
  const expct = (2 * Math.PI * step) / N;
  const freqPerBin = sampleRate / N;
  const liftQuef = 48;       // suavização do envelope (quanto menor, mais liso)

  const output = new Float32Array(input.length);

  // janela de Hann
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  // buffers reaproveitados
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const cre = new Float64Array(N);
  const cim = new Float64Array(N);
  const lastPhase = new Float64Array(half + 1);
  const sumPhase = new Float64Array(half + 1);
  const anaMagn = new Float64Array(half + 1);
  const anaFreq = new Float64Array(half + 1);
  const env = new Float64Array(half + 1);
  const synExc = new Float64Array(half + 1);
  const synFreq = new Float64Array(half + 1);
  const synMagn = new Float64Array(half + 1);

  // gain de reconstrução p/ Hann com osamp=4 (soma das janelas ≈ constante)
  const gain = 2 / (osamp * 0.5);

  for (let pos = 0; pos + N <= input.length; pos += step) {
    // 1) janela + FFT
    for (let i = 0; i < N; i++) { re[i] = input[pos + i] * win[i]; im[i] = 0; }
    fft(re, im, false);

    // 2) magnitude/frequência-verdadeira por bin (phase vocoder)
    for (let k = 0; k <= half; k++) {
      const r = re[k], ii = im[k];
      const magn = Math.sqrt(r * r + ii * ii);
      const phase = Math.atan2(ii, r);
      let tmp = phase - lastPhase[k];
      lastPhase[k] = phase;
      tmp -= k * expct;
      // princarg → [-π, π]
      const qpd = Math.round(tmp / Math.PI);
      tmp -= Math.PI * qpd;
      tmp = (osamp * tmp) / (2 * Math.PI);
      anaMagn[k] = magn;
      anaFreq[k] = k * freqPerBin + tmp * freqPerBin;
    }

    // 3) envelope espectral via cepstro (lifter passa-baixa na quefrência)
    for (let k = 0; k <= half; k++) {
      cre[k] = Math.log(anaMagn[k] + 1e-8);
      cim[k] = 0;
    }
    for (let k = 1; k < half; k++) { cre[N - k] = cre[k]; cim[N - k] = 0; } // espelho
    fft(cre, cim, true); // → cepstro real (não normalizado; ok, é linear)
    for (let k = 0; k < N; k++) cre[k] /= N;
    // mantém só baixas quefrências (envelope liso)
    for (let k = 0; k < N; k++) {
      const keep = k <= liftQuef || k >= N - liftQuef;
      if (!keep) { cre[k] = 0; }
      cim[k] = 0;
    }
    fft(cre, cim, false); // volta p/ log-magnitude suavizada
    for (let k = 0; k <= half; k++) env[k] = Math.exp(cre[k]);

    // 4) excitação = magnitude / envelope; zera acumuladores
    for (let k = 0; k <= half; k++) { synExc[k] = 0; synFreq[k] = 0; }

    // 5) PITCH: remapeia a excitação (harmônicos) por `pitch`
    for (let k = 0; k <= half; k++) {
      const idx = Math.round(k * pitch);
      if (idx >= 0 && idx <= half) {
        synExc[idx] += anaMagn[k] / (env[k] + 1e-8);
        synFreq[idx] = anaFreq[k] * pitch;
      }
    }

    // 6) FORMANT: envelope reavaliado em k/formant (interp linear) e re-aplicado
    for (let k = 0; k <= half; k++) {
      const sx = k / formant;
      let warped: number;
      if (sx <= 0) warped = env[0];
      else if (sx >= half) warped = env[half];
      else {
        const i0 = Math.floor(sx);
        const frac = sx - i0;
        warped = env[i0] * (1 - frac) + env[i0 + 1] * frac;
      }
      synMagn[k] = synExc[k] * warped;
    }

    // 7) síntese: reconstrói fase acumulada
    for (let k = 0; k <= half; k++) {
      let tmp = synFreq[k];
      tmp -= k * freqPerBin;
      tmp /= freqPerBin;
      tmp = (2 * Math.PI * tmp) / osamp;
      tmp += k * expct;
      sumPhase[k] += tmp;
      const phase = sumPhase[k];
      re[k] = synMagn[k] * Math.cos(phase);
      im[k] = synMagn[k] * Math.sin(phase);
    }
    // espelho hermitiano p/ saída real
    for (let k = 1; k < half; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    im[0] = 0; im[half] = 0;

    fft(re, im, true);
    for (let k = 0; k < N; k++) re[k] /= N;

    // 8) overlap-add com janela de síntese
    for (let i = 0; i < N; i++) output[pos + i] += re[i] * win[i] * gain;
  }

  return output;
}

// Normaliza o pico para ~-1dBFS (evita clip do envelope/overlap).
function normalizePeak(buf: Float32Array, target = 0.89) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
  if (peak > 1e-6 && peak !== target) {
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

// ── Alto nível: aplica o modo de voz no PCM já decodificado → WAV Blob. ───────
// `normal` não deveria chegar aqui (manda-se o blob original), mas é seguro.
export function renderVoiceWav(decoded: DecodedAudio, mode: VoiceMode): Blob {
  if (mode === 'normal') return encodeWav(decoded.data, decoded.sampleRate);
  const preset = VOICE_PRESETS[mode];
  const shifted = pitchFormantShift(decoded.data, decoded.sampleRate, preset.pitch, preset.formant);
  normalizePeak(shifted);
  return encodeWav(shifted, decoded.sampleRate);
}
