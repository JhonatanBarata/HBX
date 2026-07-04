// ================================================================
// LOGÍSTICA-MOBILE M9 — ícones do app de entrega (SVG inline, sem dependência).
// O /entrega é uma casca ISOLADA (data-skin="entrega") e NÃO importa o shell do
// dashboard — então tem seu próprio conjunto mínimo de ícones. Traço via
// currentColor (herda a cor do token --ent-* do contexto). Sem cor literal aqui.
// ================================================================

// Paths (viewBox 24) — mesma família visual do resto do app.
export const ICON_PATHS = {
  route: [
    "M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M9 16h6a3 3 0 0 0 3-3",
  ],
  nav: ["M3 11 22 2l-9 19-2-8-8-2Z"],
  check: ["M20 6 9 17l-5-5"],
} as const;

export function I({ d, size = 24 }: { d?: readonly string[]; size?: number }): React.JSX.Element {
  return (
    <svg
      className="ent-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(d ?? []).map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}
