import { redirect } from "next/navigation";

// Alias de transição: o backend ainda devolve next="/dashboard/master" no
// login do system master. Rota canônica: /dashboard. Sem regra própria.
// Remoção: quando o destino pós-login do master for revisado (doc do PR).
export default function DashboardMasterAlias() {
  redirect("/dashboard");
}
