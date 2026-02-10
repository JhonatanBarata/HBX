import React from "react";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  // simple wrapper — keep server-compatible so it can be imported from layout
  return <div style={{ transition: 'opacity 160ms ease', opacity: 1 }}>{children}</div>;
}
