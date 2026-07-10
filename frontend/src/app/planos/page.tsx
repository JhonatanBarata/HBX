import { redirect } from "next/navigation";

// Alias comercial canônico: o cadastro é o card embutido na landing (W5).
// Mantém links externos sem reintroduzir a tela pública anterior.
export default function PlanosPage() {
  redirect("/?criar");
}
