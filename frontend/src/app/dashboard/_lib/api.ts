"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
};

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return Boolean(value) && typeof value === "object";
}

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
    } catch {
      // ignore event dispatch errors
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
    } catch {
      // ignore event dispatch errors
    }
  }
}

function parseErrorMessage(data: unknown): string {
  if (!data) return "Erro";
  if (!isApiErrorPayload(data)) return "Erro";

  if (typeof data.message === "string") return data.message;
  if (Array.isArray(data.message)) return data.message.join(", ");
  if (typeof data.error === "string") return data.error;
  return "Erro";
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;
  const token = getToken();
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (!init?.skipAuth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (typeof window !== "undefined") {
    const route = `${window.location.pathname || ""}${window.location.search || ""}`.slice(0, 220);
    if (route && !headers.has("x-master-route")) {
      headers.set("x-master-route", route);
    }
  }

  const res = await fetch(url, { ...init, headers });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message = typeof data === "string" ? data : parseErrorMessage(data);
    throw new Error(message);
  }

  return data as T;
}
