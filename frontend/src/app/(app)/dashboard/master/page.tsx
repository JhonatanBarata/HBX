import { redirect } from "next/navigation";

// Alias: o backend devolve next="/dashboard/master" no login do system
// master (auth.service). Rota canônica: /master (PLAN12062026002 FOCO 1).
export default function DashboardMasterAlias() {
  redirect("/master");
}
