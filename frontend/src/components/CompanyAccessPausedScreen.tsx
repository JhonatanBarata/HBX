"use client";

import { useRouter } from "next/navigation";
import { clearToken } from "@/app/_lib/api";

export default function CompanyAccessPausedScreen() {
  const router = useRouter();

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <main className="app-shell">
      <div className="app-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
        <div className="panel p-4" style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 className="text-lg font-semibold">Acesso temporariamente pausado</h1>
          <p className="text-sm text-muted" style={{ marginTop: 8 }}>
            O acesso da sua empresa ao HBX está pausado no momento.
            Fale com o administrador da sua conta para reativar.
          </p>
          <p className="text-sm text-muted" style={{ marginTop: 4 }}>
            Assim que o acesso for reativado, esta tela libera sozinha.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Verificar novamente
            </button>
            <button type="button" className="btn" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
