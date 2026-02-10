"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("accessToken")
  );
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event("auth-change"));
    } catch (e) {
      // ignore
    }
  }
}

export function clearToken() {
  localStorage.removeItem("token");
  localStorage.removeItem("access_token");
  localStorage.removeItem("accessToken");
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event("auth-change"));
    } catch (e) {
      // ignore
    }
  }
}

function parseErrorMessage(data: any): string {
  if (!data) return "Erro";
  if (typeof data.error === "string") return data.error;
  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.message)) return data.message.join(", ");
  return "Erro";
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;
  const token = getToken();

  const headers: Record<string, string> = {
    ...(init?.headers as any),
  };
  if (!headers["Content-Type"] && init?.body) headers["Content-Type"] = "application/json";
  if (!init?.skipAuth && token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...init, headers });

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg = typeof data === "string" ? data : parseErrorMessage(data);
    throw new Error(msg);
  }
  return data as T;
}
