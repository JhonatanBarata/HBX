import { AuthGate } from "@/components/hbx/auth-gate";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AuthGate />
      {children}
    </>
  );
}
