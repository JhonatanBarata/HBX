import { AppShell } from "@/components/hbx/app-shell";
import { AuthGate } from "@/components/hbx/auth-gate";

// O shell (menu + topo) é PERSISTENTE: vive aqui no layout do grupo (app) e não
// remonta ao navegar — só o conteúdo troca dentro do AppShell. Ver app-shell.tsx.
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AuthGate />
      <AppShell>{children}</AppShell>
    </>
  );
}
