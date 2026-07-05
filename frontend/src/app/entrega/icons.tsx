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
  // A2 — ícones das abas do app (Clientes · Produtos · Ajustes).
  // "route" já cobre a aba Rota.
  clientes: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  produtos: [
    "M21 8 12 3 3 8v8l9 5 9-5V8Z",
    "M3 8l9 5 9-5",
    "M12 13v8",
  ],
  ajustes: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z",
  ],
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
