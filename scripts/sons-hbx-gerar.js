'use strict';
// OS 17 SONS DO HBX — identidade "MARCADO" (escolha do dono, 07/08).
// Timbre: harmônicos ÍMPARES (quadrada suavizada) com queda seca. Escolhido por
// cortar ruído de rua e motor — o app vive dentro de um caminhão, não num fone.
// Nada gravado: onda calculada + envelope. Saída WAV; o .ogg sai no ffmpeg.
const fs = require('fs');
const path = require('path');

const SR = 44100;
const OUT = process.argv[2] || '.';

function wav(s) {
  const n = s.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32000), 44 + i * 2);
  return b;
}

// A voz da marca: harmônicos ímpares, ataque de 2ms, queda seca.
// `dur` é o tempo TOTAL da nota; a queda usa uma fração dela.
function nota(out, t0, freq, dur, gain, secura = 0.16) {
  const i0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / SR;
    const env = t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / (dur * secura));
    let s = 0;
    for (let h = 1; h <= 9; h += 2) s += (1 / h) * Math.sin(2 * Math.PI * freq * h * t);
    out[i0 + i] += s * env * gain * 0.36;
  }
}

// Escala de Lá maior — região média-aguda, que é a que sobrevive no alto-falante do celular.
const N = { D5: 587.33, E5: 659.25, Fs5: 739.99, A5: 880, B5: 987.77, Cs6: 1108.73, D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760 };

// Cada som é uma FRASE. O vocabulário é constante de propósito:
//   subir = deu certo · descer = acabou/erro · repetir = atenção · 4 notas = a marca.
const SONS = {
  // ── CHEGADA ────────────────────────────────────────────────────────────────
  // Alarme em LOOP: duas notas alternadas, insistentes, sem cauda. Emenda limpa
  // no fim pra repetir sem clique. É o que tem que acordar alguém com o celular no bolso.
  hbx_arrival_alert_loop: { dur: 1.6, f: o => { for (let k = 0; k < 4; k++) { nota(o, k * 0.4, N.A5, 0.18, 1.0, 0.30); nota(o, k * 0.4 + 0.2, N.E6, 0.18, 1.0, 0.30); } } },
  hbx_arrival_confirm:    { dur: 0.7, f: o => { nota(o, 0, N.A5, 0.22, 0.9); nota(o, 0.07, N.E6, 0.34, 1.0); } },

  // ── ENTREGA ────────────────────────────────────────────────────────────────
  hbx_delivery_complete:  { dur: 1.1, f: o => { nota(o, 0, N.A5, 0.20, 0.8); nota(o, 0.08, N.Cs6, 0.22, 0.9); nota(o, 0.16, N.E6, 0.55, 1.0) } },
  // Guardado no aparelho, ainda não enviado: mesma frase, sem a nota de cima.
  hbx_offline_saved:      { dur: 0.8, f: o => { nota(o, 0, N.A5, 0.20, 0.8); nota(o, 0.08, N.Cs6, 0.40, 0.85) } },
  hbx_proof_saved:        { dur: 0.6, f: o => { nota(o, 0, N.E6, 0.10, 0.7, 0.08); nota(o, 0.06, N.A6, 0.30, 0.9) } },

  // ── SINCRONIA ──────────────────────────────────────────────────────────────
  hbx_sync_pending:       { dur: 0.5, f: o => { nota(o, 0, N.Fs5, 0.28, 0.65) } },
  hbx_sync_complete:      { dur: 0.7, f: o => { nota(o, 0, N.Cs6, 0.16, 0.8); nota(o, 0.10, N.E6, 0.34, 0.95) } },

  // ── ROTA ───────────────────────────────────────────────────────────────────
  hbx_route_start:        { dur: 1.3, f: o => { nota(o, 0, N.D5, 0.20, 0.75); nota(o, 0.09, N.A5, 0.20, 0.85); nota(o, 0.18, N.Cs6, 0.22, 0.92); nota(o, 0.27, N.E6, 0.65, 1.0) } },
  hbx_route_stop:         { dur: 1.2, f: o => { nota(o, 0, N.E6, 0.18, 0.9); nota(o, 0.09, N.Cs6, 0.18, 0.8); nota(o, 0.18, N.A5, 0.55, 0.75) } },
  hbx_navigation_open:    { dur: 0.6, f: o => { nota(o, 0, N.B5, 0.14, 0.7); nota(o, 0.08, N.Fs6, 0.30, 0.85) } },
  hbx_pause_detected:     { dur: 0.9, f: o => { nota(o, 0, N.Fs5, 0.22, 0.7); nota(o, 0.22, N.Fs5, 0.35, 0.7) } },

  // ── SISTEMA ────────────────────────────────────────────────────────────────
  hbx_success:            { dur: 0.7, f: o => { nota(o, 0, N.A5, 0.18, 0.85); nota(o, 0.07, N.Cs6, 0.36, 0.95) } },
  // Erro: segunda MENOR descendente. Dissonante de propósito — dói um pouco.
  hbx_error:              { dur: 0.9, f: o => { nota(o, 0, N.Fs5, 0.24, 1.0); nota(o, 0.08, N.Fs5 * 0.944, 0.45, 0.95) } },
  // Aviso: nota repetida, sem subir nem descer. "Olha isso", não "deu errado".
  hbx_warning:            { dur: 0.8, f: o => { nota(o, 0, N.B5, 0.16, 0.85); nota(o, 0.17, N.B5, 0.32, 0.8) } },
  hbx_update_complete:    { dur: 1.0, f: o => { nota(o, 0, N.A5, 0.16, 0.8); nota(o, 0.08, N.D6, 0.18, 0.9); nota(o, 0.17, N.Fs6, 0.48, 1.0) } },
  hbx_pairing_success:    { dur: 1.4, f: o => { nota(o, 0, N.D5, 0.18, 0.7); nota(o, 0.10, N.Fs5, 0.18, 0.8); nota(o, 0.20, N.A5, 0.18, 0.9); nota(o, 0.30, N.D6, 0.70, 1.0) } },

  // ── A MARCA ────────────────────────────────────────────────────────────────
  // 4 notas, a assinatura. Sobe firme e assenta na quinta — é o que a pessoa
  // vai ouvir todo dia ao abrir. Um pouco mais longa e mais aberta que o resto.
  hbx_sonic_logo:         { dur: 1.8, f: o => { nota(o, 0, N.D5, 0.22, 0.7, 0.22); nota(o, 0.13, N.A5, 0.22, 0.85, 0.22); nota(o, 0.26, N.D6, 0.24, 0.95, 0.22); nota(o, 0.39, N.Fs6, 0.95, 1.0, 0.26) } },
};

for (const [nome, def] of Object.entries(SONS)) {
  const out = new Float64Array(Math.ceil(SR * def.dur));
  def.f(out);
  let pico = 0;
  for (const s of out) pico = Math.max(pico, Math.abs(s));
  // Folga de 0,82: alto-falante de celular satura antes do 1,0 e vira chiado.
  if (pico > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / pico) * 0.82;
  // Corta o rabo em zero pra o loop emendar sem clique.
  const fade = Math.round(0.006 * SR);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  fs.writeFileSync(path.join(OUT, `${nome}.wav`), wav(out));
  console.log(nome.padEnd(26), def.dur.toFixed(2) + 's');
}
