"use client";

// Moldura das telas públicas de auth (reset de senha, confirmar e-mail,
// onboarding do vendedor): card limpo centrado na casca — mesma família do
// login embutido na landing (login-client). A cena da Automação (HbxScene) e a nav
// da entrada antiga morreram na limpeza de legado (W3/PR10072026).

export function AuthSplit({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="register-entry hbx-scene">
      <div className={"reg-form" + (wide ? " is-wide" : "")}>{children}</div>
    </main>
  );
}
