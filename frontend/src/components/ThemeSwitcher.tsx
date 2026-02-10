"use client";

import React from "react";

const options = [
  { id: "primary", label: "Primary" },
  { id: "secondary", label: "Secondary" },
  { id: "neutral", label: "Neutral" },
];

export default function ThemeSwitcher() {
  const current = typeof window !== "undefined" ? document.documentElement.getAttribute("data-theme") || "primary" : "primary";

  function setTheme(id: string) {
    if (typeof window === "undefined") return;
    document.documentElement.setAttribute("data-theme", id);
    try { localStorage.setItem("theme", id); } catch (e) {}
  }

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored) document.documentElement.setAttribute("data-theme", stored);
    } catch (e) {}
  }, []);

  return (
    <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setTheme(o.id)}
          className="btn"
          style={{
            padding: '6px 10px',
            borderRadius: 9999,
            background: current === o.id ? 'var(--brand)' : 'transparent',
            color: current === o.id ? '#fff' : 'var(--foreground)',
            border: '1px solid rgba(15,23,42,0.06)'
          }}
          aria-pressed={current === o.id}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
