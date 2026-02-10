"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardClientPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) {
      router.push("/login");
      return;
    }
    setToken(t);
  }, [router]);

  function logout() {
    localStorage.removeItem("token");
    router.push("/login");
  }

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-foreground/70">Carregando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl w-full p-6 border border-foreground/10 rounded-2xl bg-background shadow-sm">
        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
        <p className="text-sm text-foreground/70 mb-4">Acesse o módulo de mensagens automáticas.</p>

        <div className="grid grid-cols-1 gap-2">
          <a
            className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm"
            href="/dashboard/auto-replies"
          >
            Regras de respostas automáticas
          </a>
          <a
            className="px-3 py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5 text-sm"
            href="/dashboard/messages"
          >
            Teste de envio + logs
          </a>
        </div>

        <div className="text-xs bg-foreground/5 border border-foreground/10 rounded-xl p-3 overflow-auto">
          <p className="font-semibold mb-1">Token (preview)</p>
          <pre className="whitespace-pre-wrap break-all">{token}</pre>
        </div>

        <button
          onClick={logout}
          className="mt-6 w-full py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5"
        >
          Sair
        </button>
      </div>
    </main>
  );
}
