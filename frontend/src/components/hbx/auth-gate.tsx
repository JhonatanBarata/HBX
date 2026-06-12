"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getToken } from "@/lib/api";

// Guarda mínima das rotas autenticadas: sem token → /login.
// Regra comercial continua 100% no backend (FRONTEND.md).
export function AuthGate() {
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    }
  }, [router]);
  return null;
}
