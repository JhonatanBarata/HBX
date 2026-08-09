'use strict';
/* ============================================================================
   ESTÚDIO DE SONS DO HBX — v2 (09/08/2026)

   O que mudou em relação ao `sons-hbx-gerar.js` (v1, identidade "MARCADO"):
   v1 somava harmônicos com peso fixo e cortava com uma exponencial só. Isso é
   um BIP. Objeto de verdade que é batido perde AGUDO PRIMEIRO, tem um estalo
   no ataque (o contato) e mora numa sala. v1 não tinha nenhuma das três — por
   isso soava sintetizado mesmo estando afinado.

   Esta versão é uma CADEIA DE ESTÚDIO, não uma soma de senos:
     1. TIMBRE      — 3 vozes candidatas, mesma gramática (o dono escolhe de ouvido).
     2. ATAQUE      — estalo de contato: ruído por um passa-faixa ressonante, 4 ms.
                      É ele que dá DEFINIÇÃO no ruído de cabine; sem estalo, o som
                      "aparece" em vez de ser tocado.
     3. QUEDA EM 2  — 72% cai rápido (o soco) + 28% cai lento (o rastro). Um pico
        ESTÁGIOS      curto morre no motor; uma cauda longa cansa em 80 toques/dia.
                      Dois estágios entregam os dois — é o truque que faz um som
                      curto PARECER que atravessou o barulho.
     4. AGUDO CAI    — cada harmônico tem a PRÓPRIA queda, e quanto mais agudo,
        PRIMEIRO      mais rápido some. É a diferença física entre "madeira" e
                      "apito". Uma linha de código, e o ouvido acredita.
     5. SALA         — reverb curto (3 pentes + 1 passa-tudo, cauda escura). ~10%.
                      Não é efeito: é o que separa "som produzido" de "beep".
     6. MASTER       — passa-alta em 150 Hz (o alto-falante do celular NÃO toca
                      grave — deixar grave ali só rouba headroom e vira chiado),
                      saturação macia, e nivelamento por LOUDNESS (RMS), não por
                      pico. Nivelar por pico é o erro clássico: dois sons com o
                      mesmo pico têm volumes percebidos MUITO diferentes.

   A GRAMÁTICA NÃO MUDA — de propósito. O motorista já aprendeu:
     subir = deu certo · descer = acabou/erro · repetir = atenção · 4 notas = a marca.
   Trocar o vocabulário obrigaria a reaprender o app inteiro por causa de estética.
   O que muda é a VOZ que fala essa gramática.

   Nada gravado: onda calculada. Saída WAV; o .ogg sai no ffmpeg.

   Uso:
     node scripts/sons-hbx-estudio.js <pastaDeSaida> [--voz=aco,madeira,prisma]
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const SR = 44100;

/* ─────────────────────────────────────────────────────────────────────────────
   1. FERRAMENTA DE ARQUIVO
   ────────────────────────────────────────────────────────────────────────── */

function wav(s) {
  const n = s.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32000), 44 + i * 2);
  return b;
}

/* ─────────────────────────────────────────────────────────────────────────────
   2. FILTROS (biquad RBJ) — os mesmos do livro de receitas de áudio.
   Existem aqui porque "passa-alta de um polo" chia: a queda é lenta demais e
   sobra grave no meio da banda que o celular tenta tocar e distorce.
   ────────────────────────────────────────────────────────────────────────── */

function biquad(tipo, f0, Q) {
  const w = 2 * Math.PI * f0 / SR, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (tipo === 'hp') {
    b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
    a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
  } else if (tipo === 'bp') {
    b0 = al; b1 = 0; b2 = -al;
    a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
  } else { // 'lp'
    b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
    a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function aplicarBiquad(buf, c) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[i] = y;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. AS TRÊS VOZES
   Cada voz recebe (t, freq, tau) e devolve a amostra JÁ com o corpo do timbre.
   A queda por harmônico mora AQUI dentro porque é característica do material:
   é o que faz o ouvido dizer "isso é metal" ou "isso é madeira".
   ────────────────────────────────────────────────────────────────────────── */

// Uma "batida" de ruído por passa-faixa ressonante — o CONTATO. Pré-calculada
// uma vez por sessão: gerar ruído por nota deixava o mesmo som diferente a cada
// execução, e som de marca precisa ser BIT A BIT reproduzível.
const ESTALO = (() => {
  const n = Math.round(0.02 * SR), b = new Float64Array(n);
  let seed = 20260809; // PRNG fixo: o mesmo arquivo hoje e daqui a um ano.
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  for (let i = 0; i < n; i++) b[i] = rnd() * Math.exp(-(i / SR) / 0.0035);
  aplicarBiquad(b, biquad('bp', 3100, 1.1));
  let p = 0; for (const s of b) p = Math.max(p, Math.abs(s));
  if (p > 0) for (let i = 0; i < n; i++) b[i] /= p;
  return b;
})();

/* IMPORTANTE — a queda mora em UM lugar só.
   `corpo()` devolve o timbre com envelope RELATIVO: o parcial fundamental sai
   sempre em 1,0 e só os parciais ACIMA dele decaem. Quem faz o som sumir é o
   envelope de amplitude do `renderNota` (queda em dois estágios), uma vez só.
   Aplicar queda nos dois lugares — que foi o primeiro jeito que escrevi aqui —
   dobra o expoente e deixa TODA a paleta mais curta e mais seca do que o
   projeto pedia, sem que nenhum número na tabela de frases explique por quê. */
const VOZES = {
  /* AÇO — o DNA do "MARCADO" (harmônico ímpar) feito direito.
     Harmônicos ímpares com peso 1/h^1,2 (v1 usava 1/h, que deixa o agudo
     gritando) e cada um sumindo antes do anterior: o 11º morre ~10x mais rápido
     que o fundamental. Resultado: entra brilhante e ASSENTA em nota limpa, em
     vez de ficar áspero até o fim. Saturação macia por cima para densidade — é
     o que atravessa motor sem precisar de volume. */
  aco: {
    nome: 'AÇO',
    corpo(t, f, tau) {
      let s = 0;
      for (let h = 1; h <= 11; h += 2) {
        const rel = h === 1 ? 1 : Math.exp(-t * 0.22 * (h - 1) / tau);
        s += (1 / Math.pow(h, 1.2)) * Math.sin(2 * Math.PI * f * h * t) * rel;
      }
      return Math.tanh(s * 1.5) / 1.1;
    },
  },

  /* MADEIRA — barra percutida (família marimba/xilofone).
     Os parciais NÃO são múltiplos inteiros: uma barra vibra em 1 : 3,93 : 9,55.
     É essa inarmonicidade que o ouvido lê como "madeira" e não como "nota".
     Os parciais altos somem em milissegundos — daí o som ser quente e o menos
     cansativo do trio, que importa num app que apita 80 vezes por dia. */
  madeira: {
    nome: 'MADEIRA',
    corpo(t, f, tau) {
      const p = [1, 3.93, 9.55], g = [1, 0.34, 0.12], d = [0, 0.34, 0.13];
      let s = 0;
      for (let k = 0; k < 3; k++) {
        const rel = d[k] === 0 ? 1 : Math.exp(-t / (tau * d[k]));
        s += g[k] * Math.sin(2 * Math.PI * f * p[k] * t) * rel;
      }
      return s * 0.92;
    },
  },

  /* PRISMA — sino de vidro por FM (a família do "premium/fintech").
     Uma senoide modula a outra em razão 2:1, com ÍNDICE que despenca em 50 ms:
     nasce sino, vira nota pura. Mais um parcial em 3,01 (fora da série, por
     isso "vidro") que dura pouco. É o timbre mais bonito no fone — e o de maior
     risco na cabine, porque a beleza dele mora na cauda. */
  prisma: {
    nome: 'PRISMA',
    corpo(t, f, tau) {
      const idx = 3.4 * Math.exp(-t / 0.05);
      const s = Math.sin(2 * Math.PI * f * t + idx * Math.sin(2 * Math.PI * f * 2 * t))
        + 0.30 * Math.sin(2 * Math.PI * f * 3.01 * t) * Math.exp(-t / (tau * 0.30));
      return s * 0.95;
    },
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   4. ARTICULAÇÕES
   Uma voz só, três jeitos de tocar. É assim que um conjunto de sons soa como UM
   produto: não se troca de instrumento por evento, troca-se a INTENSIDADE.
   `leve` é para o que acontece o tempo todo (não pode chamar atenção),
   `forte` para o que acontece poucas vezes ao dia (pode celebrar).
   ────────────────────────────────────────────────────────────────────────── */
const ART = {
  leve:   { tau: 0.075, estalo: 0.10, ganho: 0.62 },
  media:  { tau: 0.135, estalo: 0.15, ganho: 0.82 },
  forte:  { tau: 0.230, estalo: 0.20, ganho: 1.00 },
  // Alarme: queda seca e estalo alto — nasce para INCOMODAR e emendar em loop.
  alarme: { tau: 0.055, estalo: 0.34, ganho: 1.00 },
};

/* Escala em SOL — deslocada para cima em relação à v1 (que era em RÉ).
   Motivo técnico, não gosto: alto-falante de celular praticamente não radia
   abaixo de ~700 Hz, e o ruído de cabine mora embaixo. Toda fundamental daqui
   fica entre 780 e 2350 Hz, com harmônicos caindo em 1,5–5 kHz — que é
   exatamente onde a audição humana é mais sensível. O som ganha alcance sem
   ganhar volume. */
const N = {
  G5: 783.99, Gs5: 830.61, A5: 880.00, B5: 987.77, C6: 1046.50, D6: 1174.66,
  E6: 1318.51, Fs6: 1479.98, G6: 1567.98, A6: 1760.00, B6: 1975.53, D7: 2349.32,
  G4: 392.00,
};

/* ─────────────────────────────────────────────────────────────────────────────
   5. AS 17 FRASES
   `wrap` = o que passar do fim volta para o começo. Só o alarme usa: é o que
   faz o loop emendar SEM clique, inclusive com a cauda da sala. (v1 resolvia
   isso cortando o rabo em zero, o que funciona mas deixa o loop "respirando".)
   `sala` = quanto de reverb. Zero no alarme: sala em som de alarme empasta a
   repetição e ele perde a urgência.
   ────────────────────────────────────────────────────────────────────────── */
const FRASES = {
  // ── A MARCA ────────────────────────────────────────────────────────────────
  // 4 notas: fundamental, quinta, oitava, NONA. Termina na nona de propósito —
  // é um acorde aberto, que não "fecha". Marca de logística não resolve: ela
  // continua. (v1 terminava na terça, que soa conclusivo — errado para o verbo
  // desta empresa.)
  hbx_sonic_logo: { dur: 1.70, sala: 0.20, f: n => {
    n(0, N.G5, 'media', 0.70); n(0.12, N.D6, 'media', 0.86);
    n(0.24, N.G6, 'media', 0.94); n(0.37, N.A6, 'forte', 1.00, 1.15);
  } },

  // ── ROTA ───────────────────────────────────────────────────────────────────
  // Início: sobe a mesma tríade da marca, porém rápida e com âncora embaixo —
  // é irmã do logo, não cópia. Quem ouve sabe que É o mesmo app.
  hbx_route_start: { dur: 1.30, sala: 0.15, f: n => {
    n(0, N.G5, 'leve', 0.72); n(0.085, N.B5, 'leve', 0.82);
    n(0.17, N.D6, 'media', 0.90); n(0.255, N.G6, 'forte', 1.00, 0.95);
  } },
  // Fim: a mesma frase ao contrário e mais devagar. Descer = acabou.
  hbx_route_stop: { dur: 1.20, sala: 0.16, f: n => {
    n(0, N.G6, 'leve', 0.88); n(0.095, N.D6, 'media', 0.82);
    n(0.19, N.G5, 'forte', 0.78, 0.90);
  } },
  hbx_navigation_open: { dur: 0.52, sala: 0.09, f: n => {
    n(0, N.B5, 'leve', 0.58); n(0.055, N.Fs6, 'leve', 0.78, 0.40);
  } },
  // Parado sem motivo: nota REPETIDA (atenção), grave da escala, sem brilho.
  // É cutucão, não bronca — o motorista pode estar almoçando.
  hbx_pause_detected: { dur: 0.88, sala: 0.10, f: n => {
    n(0, N.A5, 'leve', 0.70); n(0.20, N.A5, 'media', 0.72, 0.58);
  } },

  // ── CHEGADA ────────────────────────────────────────────────────────────────
  // O ÚNICO som feito para incomodar: duas notas alternadas a uma quinta de
  // distância, seco, sem sala, 2,5 toques por segundo. Tem que furar bolso de
  // calça e rádio ligado.
  // `alvo` alto: é o único som que PODE gastar todo o headroom. Nivelado junto
  // com os outros ele saía 8 dB abaixo do que o alto-falante aguenta — alarme
  // com folga sobrando é alarme que perde para o motor.
  hbx_arrival_alert_loop: { dur: 1.60, sala: 0, wrap: true, alvo: 0.34, f: n => {
    for (let k = 0; k < 4; k++) {
      n(k * 0.40, N.D6, 'alarme', 1.00, 0.20);
      n(k * 0.40 + 0.20, N.A6, 'alarme', 1.00, 0.20);
    }
  } },
  hbx_arrival_confirm: { dur: 0.80, sala: 0.13, f: n => {
    n(0, N.D6, 'media', 0.85); n(0.065, N.G6, 'forte', 1.00, 0.62);
  } },

  // ── ENTREGA ────────────────────────────────────────────────────────────────
  // O som mais tocado do app (dezenas de vezes por dia). Sobe 3 notas — é a
  // vitória — mas é CURTO e a última não estica: som de vitória comprido vira
  // tortura na 40ª parada. Este é o som que decide se o motorista deixa o
  // "Sons e voz" ligado.
  hbx_delivery_complete: { dur: 0.90, sala: 0.13, f: n => {
    n(0, N.G5, 'leve', 0.78); n(0.07, N.B5, 'media', 0.88); n(0.14, N.D6, 'forte', 1.00, 0.65);
  } },
  // Guardado no aparelho, ainda não enviado: MESMA frase, sem a nota de cima.
  // Falta a nota porque falta a confirmação — o som conta a verdade.
  hbx_offline_saved: { dur: 0.75, sala: 0.11, f: n => {
    n(0, N.G5, 'leve', 0.76); n(0.075, N.B5, 'media', 0.84, 0.55);
  } },
  // Foto salva: um toque de agulha em cima e pronto. Tem que ser quase nada.
  hbx_proof_saved: { dur: 0.45, sala: 0.08, f: n => {
    n(0, N.D7, 'leve', 0.48, 0.09); n(0.045, N.G6, 'leve', 0.72, 0.34);
  } },

  // ── SINCRONIA ──────────────────────────────────────────────────────────────
  hbx_sync_pending: { dur: 0.42, sala: 0.07, f: n => { n(0, N.A5, 'leve', 0.60, 0.34); } },
  hbx_sync_complete: { dur: 0.58, sala: 0.11, f: n => {
    n(0, N.D6, 'leve', 0.76); n(0.075, N.G6, 'media', 0.88, 0.42);
  } },

  // ── SISTEMA ────────────────────────────────────────────────────────────────
  hbx_success: { dur: 0.62, sala: 0.12, f: n => {
    n(0, N.G5, 'leve', 0.80); n(0.07, N.D6, 'media', 0.92, 0.48);
  } },
  // Erro: segunda MENOR descendente (o intervalo mais desconfortável da música
  // ocidental) e uma oitava grave por baixo dando peso. Dói de propósito — mas
  // é afinado, então dói sem soar barato.
  hbx_error: { dur: 0.85, sala: 0.10, f: n => {
    n(0, N.A5, 'media', 0.95, 0.22);
    n(0.085, N.Gs5, 'forte', 1.00, 0.68);
    n(0.085, N.G4, 'media', 0.34, 0.50);
  } },
  // Aviso: nota repetida, sem subir nem descer. "Olha isso", não "deu errado".
  hbx_warning: { dur: 0.78, sala: 0.10, f: n => {
    n(0, N.D6, 'media', 0.88); n(0.17, N.D6, 'forte', 0.86, 0.52);
  } },
  // Atualizou: salto largo (oitava + quinta) — é notícia boa e rara.
  hbx_update_complete: { dur: 1.00, sala: 0.15, f: n => {
    n(0, N.G5, 'leve', 0.76); n(0.08, N.D6, 'media', 0.88); n(0.16, N.B6, 'forte', 1.00, 0.74);
  } },
  // Pareou: 4 notas como a marca, mas em RÉ — mesma cerimônia, cor diferente,
  // para nunca ser confundido com o logo de abertura.
  hbx_pairing_success: { dur: 1.30, sala: 0.16, f: n => {
    n(0, N.A5, 'leve', 0.70); n(0.09, N.D6, 'leve', 0.80);
    n(0.18, N.Fs6, 'media', 0.90); n(0.27, N.A6, 'forte', 1.00, 0.92);
  } },
};

/* ─────────────────────────────────────────────────────────────────────────────
   6. RENDER DE UMA NOTA
   Três coisas que a v1 não fazia e que valem mais que qualquer escolha de
   timbre:
   · ATAQUE em cosseno elevado de 3 ms — linear estala, e zero estala mais.
   · ENVELOPE DE ALTURA: +0,5% de afinação nos primeiros 12 ms. Todo objeto
     percutido sobe de tom no impacto; sem isso o som "liga", não é TOCADO.
   · QUEDA EM DOIS ESTÁGIOS: 72% rápido + 28% lento.
   ────────────────────────────────────────────────────────────────────────── */
function renderNota(out, t0, freq, artNome, ganho, durOpt, voz, wrap) {
  const a = ART[artNome];
  const tau = a.tau;
  const dur = durOpt != null ? durOpt : Math.max(0.18, tau * 3.4);
  const n = Math.round(dur * SR), i0 = Math.round(t0 * SR), L = out.length;
  const fadeN = Math.round(0.008 * SR); // rabo de cada nota, contra clique

  for (let i = 0; i < n; i++) {
    const idx = wrap ? (i0 + i) % L : i0 + i;
    if (idx >= L) break;
    const t = i / SR;

    // afinação do impacto
    const f = freq * (1 + 0.005 * Math.exp(-t / 0.012));

    let s = voz.corpo(t, f, tau);

    // estalo de contato
    if (i < ESTALO.length) s += ESTALO[i] * a.estalo;

    // ataque + queda em dois estágios
    const atk = t < 0.003 ? 0.5 - 0.5 * Math.cos(Math.PI * (t / 0.003)) : 1;
    const dec = 0.72 * Math.exp(-t / tau) + 0.28 * Math.exp(-t / (tau * 3.2));
    let env = atk * dec;

    // rabo da nota
    const rest = n - i;
    if (rest < fadeN) env *= rest / fadeN;

    out[idx] += s * env * ganho * a.ganho * 0.34;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   7. SALA — 3 pentes + 1 passa-tudo (Schroeder), com passa-baixa na realimen-
   tação para a cauda ser ESCURA. Sala clara em som de UI soa a banheiro; sala
   escura e curta (RT60 ~0,22 s) soa a "produzido". Não é para OUVIR o reverb:
   é para o som não parecer nu.
   ────────────────────────────────────────────────────────────────────────── */
function sala(buf, wet, wrap) {
  if (wet <= 0) return;
  const L = buf.length;
  const rt60 = 0.22;
  const combs = [1301, 1697, 2113, 2467];
  const molhado = new Float64Array(L);

  for (const D of combs) {
    const g = Math.pow(10, -3 * D / (SR * rt60));
    const linha = new Float64Array(D);
    let p = 0, lp = 0;
    for (let i = 0; i < L; i++) {
      const y = linha[p];
      lp = 0.62 * y + 0.38 * lp;         // agudo some antes na cauda
      linha[p] = buf[i] + g * lp;
      p = (p + 1) % D;
      molhado[i] += y * 0.25;
    }
  }

  // passa-tudo: espalha os ecos e tira o "metálico" dos pentes
  const D2 = 347, g2 = 0.6, linha2 = new Float64Array(D2);
  let p2 = 0;
  for (let i = 0; i < L; i++) {
    const x = molhado[i], v = linha2[p2];
    const y = -g2 * x + v;
    linha2[p2] = x + g2 * y;
    p2 = (p2 + 1) % D2;
    molhado[i] = y;
  }

  // No loop, a cauda que passaria do fim volta para o começo (senão o reverb é
  // decapitado e a emenda aparece).
  if (wrap) {
    const volta = Math.round(rt60 * SR);
    for (let i = 0; i < volta && i < L; i++) molhado[i] += molhado[(L - volta + i + L) % L] * 0.35;
  }

  for (let i = 0; i < L; i++) buf[i] = buf[i] * (1 - wet * 0.45) + molhado[i] * wet;
}

/* ─────────────────────────────────────────────────────────────────────────────
   8. MASTER
   Nivelar por PICO (o que a v1 fazia) é o erro clássico: som denso e som magro
   com o mesmo pico têm volumes percebidos muito diferentes — foi o que fazia a
   tabela de volume do `HbxSoundEngine.kt` precisar de 17 valores diferentes na
   mão. Aqui o nivelamento é por LOUDNESS (RMS na janela de 300 ms mais alta),
   então a tabela do Kotlin volta a ser AJUSTE FINO, não conserto.
   ────────────────────────────────────────────────────────────────────────── */
function master(buf, alvo) {
  aplicarBiquad(buf, biquad('hp', 150, 0.707));   // grave que o celular não toca só rouba headroom

  const jan = Math.round(0.3 * SR);
  let soma = 0, melhor = 0;
  for (let i = 0; i < buf.length; i++) {
    soma += buf[i] * buf[i];
    if (i >= jan) soma -= buf[i - jan] * buf[i - jan];
    const rms = Math.sqrt(soma / Math.min(i + 1, jan));
    if (rms > melhor) melhor = rms;
  }
  // 0,26 foi MEDIDO contra os 17 arquivos que já estão no app (que eram
  // normalizados por pico em 0,82): abaixo disso a paleta nova chega ao
  // motorista mais baixa que a de hoje com a MESMA tabela de volume do Kotlin,
  // e "som novo mais fraco" é lido como "som novo pior".
  const ALVO = alvo || 0.26;
  if (melhor > 0) {
    const g = ALVO / melhor;
    for (let i = 0; i < buf.length; i++) buf[i] *= g;
  }

  // saturação macia: segura o pico sem o "corte" quadrado do clipping duro
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * 1.25) / 1.05;

  let pico = 0;
  for (const s of buf) pico = Math.max(pico, Math.abs(s));
  if (pico > 0.92) { const g = 0.92 / pico; for (let i = 0; i < buf.length; i++) buf[i] *= g; }
  return { pico: Math.min(pico, 0.92), rms: melhor };
}

/* ─────────────────────────────────────────────────────────────────────────────
   9. MOAGEM
   ────────────────────────────────────────────────────────────────────────── */
function gerar(vozKey, outDir) {
  const voz = VOZES[vozKey];
  fs.mkdirSync(outDir, { recursive: true });
  const relatorio = [];

  for (const [nome, def] of Object.entries(FRASES)) {
    const L = Math.round(SR * def.dur);
    const out = new Float64Array(L);
    const wrap = !!def.wrap;

    def.f((t0, freq, art, ganho, durOpt) => renderNota(out, t0, freq, art, ganho, durOpt, voz, wrap));
    sala(out, def.sala || 0, wrap);
    const m = master(out, def.alvo);

    // Fade só no som que NÃO é loop: no loop, cortar as pontas é justamente o
    // que cria o clique que o `wrap` foi feito para evitar.
    if (!wrap) {
      const fi = Math.round(0.001 * SR), fo = Math.round(0.012 * SR);
      for (let i = 0; i < fi; i++) out[i] *= i / fi;
      for (let i = 0; i < fo; i++) out[L - 1 - i] *= i / fo;
    }

    fs.writeFileSync(path.join(outDir, `${nome}.wav`), wav(out));
    relatorio.push({ nome, dur: def.dur, pico: m.pico });
  }
  return relatorio;
}

/* ─────────────────────────────────────────────────────────────────────────────
   10. INSTALAR — a troca é de ARQUIVO, nunca de código.
   Os 17 `.ogg` mantêm o nome, então `HbxSoundEngine.kt`, as Activities, os
   `R.raw.*`, o `soundPrefs` e a folha "Sons e voz" continuam de pé (mesma
   receita do `EntregaShell/app/src/logistica/LEIA-ME-sons.md`). Sobrescreve
   arquivo versionado — se não gostar, `git checkout` na pasta e voltou.

     node scripts/sons-hbx-estudio.js ./tmp-sons --instalar=madeira

   O `if (!fs.existsSync(oggPath))` não é paranoia: nome que não existe em
   `res/raw` vira arquivo NOVO que nenhum `R.raw.*` referencia — o som some do
   app sem erro de build e sem ninguém perceber.
   ────────────────────────────────────────────────────────────────────────── */
const RAW = path.join(__dirname, '..', 'EntregaShell', 'app', 'src', 'logistica', 'res', 'raw');

function instalar(vozKey, tmpDir) {
  const { execFileSync } = require('child_process');
  const dir = path.join(tmpDir, vozKey);
  let n = 0;
  for (const nome of Object.keys(FRASES)) {
    const oggPath = path.join(RAW, `${nome}.ogg`);
    if (!fs.existsSync(oggPath)) throw new Error(`nao existe em res/raw: ${nome}.ogg`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, `${nome}.wav`),
      '-c:a', 'libvorbis', '-q:a', '4', '-ac', '1', oggPath]);
    n++;
  }
  return n;
}

const OUT = process.argv[2] || '.';
const argInstalar = (process.argv.find(a => a.startsWith('--instalar=')) || '').slice(11);
const argVoz = argInstalar
  || (process.argv.find(a => a.startsWith('--voz=')) || '--voz=aco,madeira,prisma').slice(6);

for (const v of argVoz.split(',').map(s => s.trim()).filter(Boolean)) {
  if (!VOZES[v]) { console.error(`voz desconhecida: ${v} (use aco, madeira ou prisma)`); process.exit(1); }
  const dir = path.join(OUT, v);
  const r = gerar(v, dir);
  console.log(`\n== ${VOZES[v].nome} (${r.length} sons) -> ${dir}`);
  for (const x of r) console.log('  ' + x.nome.padEnd(24), x.dur.toFixed(2) + 's', 'pico ' + x.pico.toFixed(2));
}

if (argInstalar) {
  const n = instalar(argInstalar, OUT);
  console.log(`\n>> ${n} .ogg da voz ${VOZES[argInstalar].nome} gravados em res/raw. Zero linha de codigo muda.`);
}
