import { redirect } from "next/navigation";

// /politicas mantém o link plugado no front, mas a Política vive como pop-up
// CENTRAL na casca (Lei 2). A rota só redireciona pra landing com ?ver=politicas,
// que abre o pop-up — mesmo padrão de /planos. Sem página/casca duplicada.
export default function PoliticasPage() {
  redirect("/?ver=politicas");
}
