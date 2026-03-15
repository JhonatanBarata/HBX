"use client";

export default function GlobalError(
  props: {
    error: Error & { digest?: string };
    reset: () => void;
  }
) {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full p-6 border border-foreground/10 rounded-2xl bg-background shadow-sm">
          <h1 className="text-2xl font-bold mb-2">Ocorreu um erro</h1>
          <p className="text-sm text-foreground/70 mb-4">
            Tente novamente.
          </p>
          <button
            onClick={() => props.reset()}
            className="w-full py-2 rounded-xl border border-foreground/10 hover:bg-foreground/5"
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}