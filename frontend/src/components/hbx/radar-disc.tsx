"use client";

// Disco de radar — PURO ENFEITE (VENDAS-REFAB item 2/8, 04/07). Zero prop de
// estado, zero API: decoração fixa, sempre no visual mais "vivo". Extraído de
// (app)/leads/page.client.tsx no W1 (PR10072026) pra landing usar a MESMA tela
// real sem puxar a página inteira pro bundle. CSS: .radar* em screens.css,
// tokens --radar-* no skeleton.css.
// Pool de rótulos de CATEGORIA pros blips (07/07, pedido do dono: esses 7
// nomes, sorteados aleatoriamente a cada montagem — nunca nome de empresa
// real, isso seria dado fabricado).

import { useEffect, useState } from "react";

const RADAR_LABEL_POOL = ["telefones", "sites", "instagram", "facebook", "e-mail", "CNAE", "Microempresa"];
function pickRadarLabels(count: number): string[] {
  const pool = [...RADAR_LABEL_POOL];
  const out: string[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

// Réplica fiel do mock aprovado pelo dono ao vivo (06/07, "quero exatamente
// igual"): scope circular com grade+ruído, sweep com agulha+cauda longa,
// anéis de ping, blips com rótulo de CATEGORIA (não é nome de empresa real —
// isso seria dado fabricado). Ajuste 07/07 (feedback do dono): rótulo ancora
// pro lado OPOSTO ao da borda mais próxima (blip na metade direita → texto
// cresce pra esquerda, e vice-versa) — assim nunca estoura o círculo, sem
// precisar cortar. Núcleo trocou bolinha por agulha de bússola vintage
// (menor que a bolinha antiga). Rótulos sorteados do RADAR_LABEL_POOL, uma
// vez por montagem (não re-sorteia a cada render).
export function RadarDisc({ mini = false, hideLabels = false }: { mini?: boolean; hideLabels?: boolean } = {}) {
  // SSR-safe (fix 10/07, hydration mismatch na landing): o 1º render — servidor E cliente —
  // usa os 3 primeiros rótulos do pool (determinístico); o sorteio entra só PÓS-mount
  // (useEffect roda apenas no cliente). Sem isso o server sorteia um rótulo e o cliente
  // outro → React descarta a árvore hidratada inteira na entrada pública.
  const [labels, setLabels] = useState(() => RADAR_LABEL_POOL.slice(0, 3));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sorteio só PÓS-mount (ver comentário acima) pra não quebrar a hidratação; lazy init rodaria no servidor também
    setLabels(pickRadarLabels(3));
  }, []);
  const blips: Array<{ top: string; left: string; size: number; hot?: boolean; label: string; delay: string }> = [
    { top: "35%", left: "62%", size: 13, hot: true, label: labels[0] || "", delay: "-0.15s" },
    { top: "47%", left: "73%", size: 12, label: labels[1] || "", delay: "-1.05s" },
    { top: "64%", left: "37%", size: 10, label: labels[2] || "", delay: "-2.05s" },
    { top: "57%", left: "51%", size: 7, label: "", delay: "-3.05s" },
    { top: "42%", left: "44%", size: 6, label: "", delay: "-4.05s" },
  ];
  const tracks: Array<{ angle: string; delay: string }> = [
    { angle: "26deg", delay: "-1.1s" },
    { angle: "118deg", delay: "-2.7s" },
    { angle: "228deg", delay: "-3.6s" },
  ];

  return (
    <div className={"radar-disc-wrap radar-disc-wrap--funcionando" + (mini ? " radar-disc-wrap--mini" : "")}>
      <div className="radarScopeClip">
        <i className="radarScopeGrid" />
        <i className="radarScopeGlow" />
        {!mini && <i className="radarNoise" />}
        {!mini && tracks.map((t, i) => (
          <i key={i} className="radarTrack" style={{ transform: `rotate(${t.angle})`, animationDelay: t.delay }} />
        ))}
        <i className="radarPulseRing" style={{ animationDelay: "0s" }} />
        <i className="radarPulseRing" style={{ animationDelay: "0.9s" }} />
        <i className="radarPulseRing" style={{ animationDelay: "1.8s" }} />
        {blips.map((b, i) => (
          <div
            key={i}
            className={"radarBlip2" + (b.hot ? " radarBlip2--hot" : "")}
            style={{ top: b.top, left: b.left, width: b.size, height: b.size, animationDelay: b.delay }}
          >
            <i className="radarBlip2Ripple" />
          </div>
        ))}
        <div className="radarSweep2">
          <i className="radarSweepNeedle" />
        </div>
      </div>
      {!mini && !hideLabels && blips.map((b, i) => {
        if (!b.label) return null;
        const rightHalf = parseFloat(b.left) > 50;
        const anchor = rightHalf
          ? { right: `calc(100% - ${b.left} + 9px)` }
          : { left: `calc(${b.left} + 9px)` };
        return (
          <span
            key={i}
            className={"radarBlip2Label" + (rightHalf ? " radarBlip2Label--flip" : "")}
            style={{ top: `calc(${b.top} - 23px)`, ...anchor, animationDelay: b.delay }}
          >
            {b.label}
          </span>
        );
      })}
      <div className="radarCompass">
        <svg viewBox="0 0 100 100" className="radarCompassSvg" aria-hidden="true">
          <circle cx="50" cy="50" r="45" className="radarCompassRing" />
          <g className="radarCompassTicks">
            <line x1="50" y1="6" x2="50" y2="15" />
            <line x1="50" y1="85" x2="50" y2="94" />
            <line x1="6" y1="50" x2="15" y2="50" />
            <line x1="85" y1="50" x2="94" y2="50" />
          </g>
          <path className="radarCompassNeedleN" d="M50 12 L60 50 L50 50 L40 50 Z" />
          <path className="radarCompassNeedleS" d="M50 88 L60 50 L50 50 L40 50 Z" />
          <circle cx="50" cy="50" r="6" className="radarCompassPivot" />
        </svg>
      </div>
    </div>
  );
}
