import { RegisterPanel } from "./page.client";

// Cadastro público do modelo crédito — rota própria, card limpo centrado na
// casca (mesma família do login embutido na landing). A seleção de plano da
// entrada antiga morreu (W3/PR10072026).
export default function RegisterPage() {
  return (
    <main className="register-entry hbx-scene">
      <RegisterPanel />
    </main>
  );
}
