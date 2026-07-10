import { redirect } from "next/navigation";

// /login morreu como TELA (W1/PR10072026, dono 10/07): existe 1 login só,
// o card embutido na landing. Rota vira alias — links antigos continuam vivos.
export default function LoginPage() {
  redirect("/?entrar");
}
