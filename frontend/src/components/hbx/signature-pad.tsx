"use client";

// Canvas de assinatura à mão (mouse/touch) — usado pelo dono (assinatura da
// empresa no contrato) e, depois, pelo vendedor. Visual mora na classe central
// .sig-pad; a cor do traço vem do token --sig-ink (nada de cor literal aqui).

import React, { useEffect, useImperativeHandle, useRef } from "react";

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string | null;
};

export const SignaturePad = React.forwardRef<SignaturePadHandle, {
  value?: string | null;
  onChange?: (dataUrl: string | null) => void;
}>(function SignaturePad({ value, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // dimensiona o canvas pro tamanho real e pega a cor do traço do token (1x)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height));
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const ink = getComputedStyle(canvas).getPropertyValue("--sig-ink").trim();
    if (ink) ctx.strokeStyle = ink;
  }, []);

  // carrega/recarrega a assinatura salva quando o value muda (fetch do servidor)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
    }
  }, [value]);

  function pos(e: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent) {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* ok */ }
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    dirty.current = true;
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (dirty.current) onChange?.(canvasRef.current?.toDataURL("image/png") ?? null);
  }

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty.current = false;
      onChange?.(null);
    },
    isEmpty: () => !dirty.current,
    toDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? null,
  }));

  return (
    <canvas ref={canvasRef} className="sig-pad"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
  );
});
