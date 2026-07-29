"use client";

// ============================================================
// CENTRAL DO LEAD — o jogo de ícones DO DESENHO.
//
// Escrito do zero em 28/07/2026 a partir de "Central do Lead — desenho
// aplicável": são os mesmos `<symbol>` do arquivo de referência, path por
// path. Não são os ICONS do shell — aqueles são contorno de 1,7/1,9 em
// grade de 24 e desenham outra família (o telefone, o WhatsApp, a faísca
// e a moeda da referência são PREENCHIDOS, e é isso que dá o peso ótico
// que o desenho pede: 24px de ícone dentro de caixa de 40).
//
// Um componente só, com `name`: chamar `<CdlIcon name="wa" />` é o que
// mantém a tela sem SVG solto no meio do JSX.
// ============================================================

const FILLED: Record<string, string> = {
  phone: "M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.85 21 3 13.15 3 3.5a1 1 0 0 1 1-1H7.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z",
  wa: "M12 2a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l5.4-1.4A9.5 9.5 0 1 0 12 2Zm0 17.3c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-3-.2-.3A7.8 7.8 0 1 1 12 19.3Zm4.5-5.6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.4 6.4 0 0 1-3.2-2.8c-.2-.4 0-.5.1-.6l.5-.6c.1-.2.1-.4 0-.5l-.7-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.9.9-1.2 2.2-.4 3.7 1 1.9 2.6 3.5 4.6 4.5 1.9.9 2.9.8 3.8.5.6-.2 1.3-.8 1.4-1.4.1-.6.1-1-.1-1.1l-.9-.1Z",
  facebook: "M13.7 21v-8h2.7l.4-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5h1.8V3.8c-.5-.1-1.5-.2-2.7-.2-2.7 0-4.5 1.6-4.5 4.5v1.8H7.2V13h2.7v8h3.8Z",
  send: "m3.4 20.4 17.4-7.5a1 1 0 0 0 0-1.8L3.4 3.6a.9.9 0 0 0-1.3 1L4 11l9 1-9 1-1.9 6.4a.9.9 0 0 0 1.3 1Z",
  spark: "M12 2.5 14.2 9l6.5 2.2-6.5 2.2L12 20l-2.2-6.6L3.3 11.2 9.8 9 12 2.5Zm7.5 12.9 1 2.9 2.9 1-2.9 1-1 2.9-1-2.9-2.9-1 2.9-1 1-2.9Z",
  money: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm.9 15.5v1.6h-1.7v-1.5c-1.2-.2-2.3-.8-3-1.6l1.3-1.4c.6.6 1.5 1.1 2.4 1.1.9 0 1.5-.4 1.5-1.1 0-.7-.5-1-1.8-1.4-1.8-.6-3.1-1.3-3.1-3 0-1.5 1.1-2.6 2.7-2.9V5.7h1.7v1.5c1 .2 1.9.7 2.5 1.3l-1.2 1.4c-.5-.5-1.2-.9-2-.9-.9 0-1.4.4-1.4 1s.5.9 1.9 1.4c1.9.6 3 1.4 3 3 0 1.6-1.1 2.7-2.8 3Z",
};

// Traçados: stroke 1.9 é a espessura da referência (não 1.7 do shell).
const STROKED: Record<string, string[]> = {
  mail: ["M3.5 5.5h17a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Zm.5 1.5 8 6.3L20 7"],
  instagram: ["M7 2.8h10A4.2 4.2 0 0 1 21.2 7v10a4.2 4.2 0 0 1-4.2 4.2H7A4.2 4.2 0 0 1 2.8 17V7A4.2 4.2 0 0 1 7 2.8Z", "M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z", "M17.4 6.6h.01"],
  globe: ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z", "M3.5 9h17M3.5 15h17", "M12 3c2.2 2.4 3.4 5.4 3.4 9s-1.2 6.6-3.4 9c-2.2-2.4-3.4-5.4-3.4-9S9.8 5.4 12 3Z"],
  doc: ["M7 3.5h7L19 8v12.5H7V3.5Zm7 0V8h5M9.5 12h6m-6 3.5h6"],
  clock: ["M12 3.3a8.7 8.7 0 1 1 0 17.4 8.7 8.7 0 0 1 0-17.4Z", "M12 7.4V12l3 2"],
  cal: ["M5.5 5h13a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "M8 3v4m8-4v4M3.5 10h17"],
  copy: ["M10.5 8.5h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z", "M15.5 5.5v-1a1 1 0 0 0-1-1h-10a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "m21 21-4.3-4.3"],
  check: ["M20 6 9 17l-5-5"],
  bolt: ["M13 3 4 14h7l-1 7 9-11h-7z"],
};

export function CdlIcon({ name }: { name: string }) {
  const filled = FILLED[name];
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d={filled} />
      </svg>
    );
  }
  const paths = STROKED[name] || [];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d, index) => <path key={index} d={d} />)}
    </svg>
  );
}
