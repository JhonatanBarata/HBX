import { redirect } from "next/navigation";

// REGRA DURA (FRONTEND.md, 12/06/2026): TEMA É SÓ PELE. O app paralelo
// Friendly que vivia aqui foi MORTO na unificação — agora o HBX é um app
// único e o tema Friendly é um conjunto de tokens aplicado sobre as mesmas
// telas (chavinha no Topbar). Alias mantido só para links/bookmarks velhos.
export default function WorkspacePage() {
  redirect("/dashboard");
}
