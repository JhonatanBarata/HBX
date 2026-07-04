"use client";

// LOGÍSTICA-MOBILE M9 — QR renderizado num <canvas> a partir da matriz do
// gerador local (qr.ts). Sem <img> externo, sem CDN: pinta módulo a módulo.
// Cores = preto/branco puros (neutros isentos no check-pele); NADA de hex de
// marca aqui. Tamanho e "quiet zone" (borda clara obrigatória do QR) via props.

import { useEffect, useMemo, useRef } from "react";

import { qrMatrix } from "./qr";

const QUIET = 4; // módulos de borda clara (padrão da especificação QR).

export function QrCanvas({ text, size = 240 }: { text: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // A matriz só recalcula quando o texto muda (encode é barato, mas evita loop).
  const matrix = useMemo(() => {
    try {
      return qrMatrix(text);
    } catch {
      return null;
    }
  }, [text]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !matrix) return;
    const modules = matrix.length + QUIET * 2;
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    // Escala inteira por módulo → QR nítido (sem serrilhado entre pixels).
    const scale = Math.max(1, Math.floor((size * dpr) / modules));
    const px = modules * scale;
    canvas.width = px;
    canvas.height = px;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Fundo claro (quiet zone inclusa) + módulos escuros.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix.length; c++) {
        if (matrix[r][c]) ctx.fillRect((c + QUIET) * scale, (r + QUIET) * scale, scale, scale);
      }
    }
  }, [matrix, size]);

  if (!matrix) {
    // Falha de encode (URL grande demais) — estado honesto, sem quebrar a tela.
    return <div className="log-qr__fallback" role="img" aria-label="QR indisponível">QR indisponível</div>;
  }
  return <canvas ref={ref} className="log-qr__canvas" role="img" aria-label="QR code para instalar o app de entrega" />;
}
