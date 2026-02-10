"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [firstAccessInfo, setFirstAccessInfo] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Read first-access prefill info from localStorage when arriving from login
  useEffect(() => {
    try {
      const raw = localStorage.getItem('firstAccess');
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj?.username) setUsername(String(obj.username));
        if (obj?.message) setFirstAccessInfo(String(obj.message));
        localStorage.removeItem('firstAccess');
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  function getErrorMessage(data: any) {
    if (!data) return null;
    // Prefer specific `message` returned by backend (may be localized)
    if (Array.isArray(data.message)) return data.message.join(", ");
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;
    return null;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const signupRes = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          password,
        }),
      });
      const signupData = await signupRes.json();
      if (!signupRes.ok) {
        setError(getErrorMessage(signupData) ?? "Erro no registro");
        return;
      }

      const token =
        (typeof signupData?.access_token === "string" && signupData.access_token) ||
        (typeof signupData?.accessToken === "string" && signupData.accessToken) ||
        (typeof signupData?.token === "string" && signupData.token);
      if (!token) {
        setError(getErrorMessage(signupData) ?? "Registro não retornou token");
        return;
      }
      localStorage.setItem("token", token);

      router.push("/dashboard");
    } catch {
      setError("Falha ao conectar no backend");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className={`max-w-md w-full p-6 border border-foreground/10 rounded-2xl bg-background shadow-sm transition-all duration-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
        <h1 className="text-2xl font-bold mb-6">Registro</h1>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Usuário</label>
            <input
              className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
              value={username}
              onChange={(e) => { setUsername(e.target.value); }}
              placeholder="meuusuario"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label className="text-sm font-medium">E-mail</label>
            <input
              className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Senha</label>
            <input
              type="password"
              className="w-full mt-1 p-2 border border-foreground/10 rounded-xl bg-background"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mín. 10 caracteres"
              required
              autoComplete="new-password"
            />
            <p className="text-xs text-foreground/60 mt-1">Mínimo 10 caracteres, com letra e número.</p>
          </div>

          {error && (
            <p className="text-sm border border-foreground/10 bg-background p-2 rounded-xl">
              {error}
            </p>
          )}

          {firstAccessInfo && (
            <div className="border-l-4 border-primary/80 bg-primary/5 p-3 rounded-md">
              <p className="text-sm font-semibold">Primeiro acesso</p>
              <p className="text-sm text-foreground/80 mt-1">{firstAccessInfo}</p>
              <p className="text-xs text-foreground/60 mt-2">Preencha seu e‑mail e senha abaixo para ativar a conta e prosseguir para o login.</p>
            </div>
          )}

          <button
            disabled={loading}
            className="w-full py-2 rounded-xl bg-secondary text-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Criando..." : "Criar conta"}
          </button>
        </form>

        <p className="text-sm text-foreground/70 mt-4">
          Já tem conta? {" "}
          <a className="underline" href="/login">
            Login
          </a>
        </p>
      </div>
    </main>
  );
}