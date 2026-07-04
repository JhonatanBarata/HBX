import { EntregaHome } from "./page.client";

// HOME "vitrine" do app de entrega (M1) — PROVA o Design System Entrega com
// dado ESTÁTICO (as telas reais Hoje/Rota/Chegada são o M4). Server component
// fino: delega pro client (auth reusada, botão Instalar, hooks de PWA).
export default function EntregaPage() {
  return <EntregaHome />;
}
