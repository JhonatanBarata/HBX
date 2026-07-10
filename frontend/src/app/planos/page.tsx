import { redirect } from "next/navigation";

// Alias comercial canônico: a landing antiga foi removida e o cadastro tem rota
// própria. Mantém links externos sem reintroduzir a tela pública anterior.
export default function PlanosPage() {
  redirect("/register");
}
