import { redirect } from "next/navigation";

// A vitrine da logística virou uma página só (17/08): tudo o que morava aqui
// — as 5 telas, a torre de controle, as provas e o download — vive na porta
// única. `/rota` continua vivo como endereço divulgado e cai lá.
export default function RotaPage() {
  redirect("/");
}
