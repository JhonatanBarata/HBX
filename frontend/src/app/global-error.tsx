"use client";

// Barreira RAIZ: se a aplicação inteira crashar no render (antes de qualquer
// layout), o Next monta isto no lugar. Sem ele = tela branca. Mostra o MESMO
// popup amigável. Precisa do próprio <html>/<body> e importar o CSS global.

import "./globals.css";
import { ErrorPopup } from "@/components/hbx/error-popup";
import { toFriendlyError } from "@/lib/errors";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <ErrorPopup error={toFriendlyError(error)} onClose={reset} />
      </body>
    </html>
  );
}
