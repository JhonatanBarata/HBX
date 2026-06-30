// ─────────────────────────────────────────────────────────────────────────
// voice-rubberband.ts — pitch + FORMANT independentes com a RubberBand R3.
//
// Usa a biblioteca profissional RubberBand (mesma de DAWs) compilada em WASM,
// 100% no navegador, offline. Engine "Finer" (R3) + formante independente:
//   • pitchScale   = altura da voz (1.45 ≈ +6.5 semitons)
//   • formantScale = timbre/trato vocal, SEPARADO do pitch → é o que dá voz
//     feminina natural sem "chipmunk".
// O .wasm é servido em /rubberband.wasm (copiado de node_modules em public/).
// ─────────────────────────────────────────────────────────────────────────
import { RubberBandInterface, RubberBandOption } from 'rubberband-wasm';

let rbPromise: Promise<RubberBandInterface> | null = null;

async function getRubberBand(): Promise<RubberBandInterface> {
  if (!rbPromise) {
    rbPromise = (async () => {
      const resp = await fetch('/rubberband.wasm');
      if (!resp.ok) throw new Error('Falha ao carregar rubberband.wasm');
      const bytes = await resp.arrayBuffer();
      const module = await WebAssembly.compile(bytes);
      return RubberBandInterface.initialize(module);
    })().catch((err) => { rbPromise = null; throw err; });
  }
  return rbPromise;
}

// Processa offline um PCM mono com pitch e formant independentes. `rb` injetável
// para teste em Node; em produção use processVoiceRubberBand (carrega o wasm).
export function rubberBandOffline(
  rb: RubberBandInterface,
  input: Float32Array,
  sampleRate: number,
  pitchScale: number,
  formantScale: number,
): Float32Array {
  const n = input.length;
  const options =
    RubberBandOption.RubberBandOptionProcessOffline |
    RubberBandOption.RubberBandOptionEngineFiner |          // R3 = máxima qualidade
    RubberBandOption.RubberBandOptionPitchHighQuality |
    RubberBandOption.RubberBandOptionFormantPreserved;      // formante não segue o pitch; controlamos via formantScale

  const BLOCK = 4096;        // bloco de processamento (evita realocação interna)
  const OUT_BLOCK = 8192;
  const state = rb.rubberband_new(sampleRate, 1, options, 1.0, pitchScale);
  const out: Float32Array[] = [];
  let chPtr = 0, inPtrs = 0, outChPtr = 0, outPtrs = 0;
  try {
    rb.rubberband_set_formant_scale(state, formantScale);
    rb.rubberband_set_expected_input_duration(state, n);
    rb.rubberband_set_max_process_size(state, BLOCK);

    // buffers de 1 canal (reusados por bloco): ponteiro do canal + array c/ ele
    chPtr = rb.malloc(BLOCK * 4);
    inPtrs = rb.malloc(4);
    rb.memWritePtr(inPtrs, chPtr);
    outChPtr = rb.malloc(OUT_BLOCK * 4);
    outPtrs = rb.malloc(4);
    rb.memWritePtr(outPtrs, outChPtr);

    const drain = () => {
      let avail = rb.rubberband_available(state);
      while (avail > 0) {
        const want = Math.min(avail, OUT_BLOCK);
        const got = rb.rubberband_retrieve(state, outPtrs, want);
        if (got <= 0) break;
        out.push(Float32Array.from(rb.memReadF32(outChPtr, got)));
        avail = rb.rubberband_available(state);
      }
    };

    // 1) study (planejamento offline) em blocos
    for (let i = 0; i < n; i += BLOCK) {
      const len = Math.min(BLOCK, n - i);
      rb.memWrite(chPtr, input.subarray(i, i + len));
      rb.rubberband_study(state, inPtrs, len, i + len >= n ? 1 : 0);
    }
    // 2) process + retrieve em blocos (drena após cada bloco)
    for (let i = 0; i < n; i += BLOCK) {
      const len = Math.min(BLOCK, n - i);
      rb.memWrite(chPtr, input.subarray(i, i + len));
      rb.rubberband_process(state, inPtrs, len, i + len >= n ? 1 : 0);
      drain();
    }
    drain();

    // junta os blocos
    let total = 0;
    for (const c of out) total += c.length;
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of out) { merged.set(c, off); off += c.length; }
    return merged;
  } finally {
    if (chPtr) rb.free(chPtr);
    if (inPtrs) rb.free(inPtrs);
    if (outChPtr) rb.free(outChPtr);
    if (outPtrs) rb.free(outPtrs);
    rb.rubberband_delete(state);
  }
}

export async function processVoiceRubberBand(
  input: Float32Array,
  sampleRate: number,
  pitchScale: number,
  formantScale: number,
): Promise<Float32Array> {
  const rb = await getRubberBand();
  return rubberBandOffline(rb, input, sampleRate, pitchScale, formantScale);
}
