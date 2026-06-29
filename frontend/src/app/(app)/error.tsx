"use client";

// Barreira de erro do app autenticado: crash de render numa tela cai aqui (em
// vez de tela branca) e mostra o MESMO popup. "Tentar de novo" remonta a tela.

import { ErrorPopup } from "@/components/hbx/error-popup";
import { toFriendlyError } from "@/lib/errors";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPopup error={toFriendlyError(error)} onClose={reset} />;
}
