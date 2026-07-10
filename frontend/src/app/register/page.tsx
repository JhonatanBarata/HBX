import { RegisterPanel } from "./page.client";

// O cadastro continua usando o formulário e as regras comerciais canônicas, mas
// agora tem uma rota própria: a landing anterior foi removida por completo.
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const plan = typeof sp.plan === "string" ? sp.plan : undefined;
  return (
    <main className="register-entry hbx-scene">
      <RegisterPanel selectedPlanKey={plan} />
    </main>
  );
}
