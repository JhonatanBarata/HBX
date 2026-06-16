import { redirect } from "next/navigation";

// /termos mantém o link plugado no front, mas os Termos vivem como pop-up
// CENTRAL na casca (Lei 2). A rota só redireciona pra landing com ?ver=termos,
// que abre o pop-up — mesmo padrão de /planos. Sem página/casca duplicada.
export default function TermosPage() {
  redirect("/?ver=termos");
}
