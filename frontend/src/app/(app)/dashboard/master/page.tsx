import { redirect } from "next/navigation";

// Alias legado: a rota canônica do master é /master (PLAN12062026002 FOCO 1).
export default function DashboardMasterAlias() {
  redirect("/master");
}
