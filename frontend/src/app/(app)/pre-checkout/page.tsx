import { redirect } from "next/navigation";

// Alias de transição: o backend devolve next="/pre-checkout/..." quando a
// empresa exige regularização. A tela de checkout ainda não existe no front
// novo (quebra anotada no log do dia). Rota canônica provisória: /dashboard.
// O backend continua negando as APIs comerciais — o front não decide acesso.
export default function PreCheckoutAlias() {
  redirect("/dashboard");
}
