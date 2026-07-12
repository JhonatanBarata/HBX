"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ComprovantesLocais, ComprovanteRequisitos } from "./entrega-api";

type Props = {
  requisitos: ComprovanteRequisitos;
  value: ComprovantesLocais;
  onChange: (next: ComprovantesLocais) => void;
  disabled?: boolean;
};

function arquivoValido(file: File): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Use foto JPG, PNG ou WEBP.";
  if (file.size > 5 * 1024 * 1024) return "A foto deve ter até 5 MB.";
  return null;
}

export function ComprovanteCapture({ requisitos, value, onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const desenhandoRef = useRef(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const [assinou, setAssinou] = useState(Boolean(value.assinatura));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !requisitos.assinaturaObrigatoria) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = getComputedStyle(canvas).color;
  }, [requisitos.assinaturaObrigatoria]);

  const ponto = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const iniciar = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const p = ponto(event);
    const ctx = canvas?.getContext("2d");
    if (!canvas || !p || !ctx) return;
    canvas.setPointerCapture(event.pointerId);
    desenhandoRef.current = true;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }, [disabled, ponto]);

  const mover = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhandoRef.current) return;
    const p = ponto(event);
    const ctx = canvasRef.current?.getContext("2d");
    if (!p || !ctx) return;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }, [ponto]);

  const finalizar = useCallback(() => {
    if (!desenhandoRef.current) return;
    desenhandoRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      setAssinou(true);
      onChange({ ...value, assinatura: blob });
    }, "image/png");
  }, [onChange, value]);

  const limparAssinatura = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setAssinou(false);
    onChange({ ...value, assinatura: undefined });
  }, [onChange, value]);

  if (!requisitos.fotoObrigatoria && !requisitos.assinaturaObrigatoria && !requisitos.codigoObrigatorio) return null;

  return (
    <div className="ent-proof">
      <div className="ent-proof-title">Comprovante</div>

      {requisitos.fotoObrigatoria ? (
        <label className={`ent-proof-upload${value.foto ? " is-ready" : ""}`}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const erro = arquivoValido(file);
              setErroFoto(erro);
              if (!erro) onChange({ ...value, foto: file });
            }}
          />
          <span>{value.foto ? "Foto pronta ✓" : "Tirar foto"}</span>
          {value.foto instanceof File ? <small>{value.foto.name}</small> : null}
        </label>
      ) : null}
      {erroFoto ? <div className="ent-erro">{erroFoto}</div> : null}

      {requisitos.assinaturaObrigatoria ? (
        <div className={`ent-proof-sign${assinou ? " is-ready" : ""}`}>
          <span>Assinatura {assinou ? "✓" : ""}</span>
          <canvas
            ref={canvasRef}
            className="ent-proof-canvas"
            aria-label="Área para assinatura"
            onPointerDown={iniciar}
            onPointerMove={mover}
            onPointerUp={finalizar}
            onPointerCancel={finalizar}
          />
          <button type="button" className="ent-proof-clear" onClick={limparAssinatura} disabled={disabled || !assinou}>
            Limpar
          </button>
        </div>
      ) : null}

      {requisitos.codigoObrigatorio ? (
        <label className="ent-proof-code">
          <span>Código de confirmação</span>
          <input
            className="ent-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={value.codigo || ""}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, codigo: event.target.value.replace(/\D/g, "").slice(0, 6) })}
          />
        </label>
      ) : null}
    </div>
  );
}
