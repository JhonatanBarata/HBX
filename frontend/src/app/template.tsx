// Toda rota entra por aqui (remonta a cada navegação) — é o que dá o
// padrão único de transição do site ao app (hbx-theme/transitions.css):
// corporate = fade simples; friendly/site = rise de alto nível.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="hbx-page">{children}</div>;
}
