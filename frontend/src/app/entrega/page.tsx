import { AdminEntregaHome } from "./admin-page.client";

// Um único HBX Mobile. O Admin recebe primeiro a experiência completa de controle
// logístico e execução; perfis limitados continuam no fluxo legado até a árvore
// de roles ser aplicada sobre esta base estável.
export default function EntregaPage() {
  return <AdminEntregaHome />;
}
