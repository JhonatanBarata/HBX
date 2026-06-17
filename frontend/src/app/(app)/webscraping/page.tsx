import { redirect } from "next/navigation";

// SEM LEGADO (CLAUDE.md / FRONTEND.md, 17/06/2026): a Radar foi unificada em /leads.
// A tela /webscraping (vitrine antiga) foi MORTA — vira alias só pra links/bookmarks velhos.
export default function WebscrapingPage() {
  redirect("/leads");
}
