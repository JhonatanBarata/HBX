import { redirect } from "next/navigation";

// /planos CONSOLIDADO na casca única (16/06): a apresentação de planos vive em
// MarketingClient (/?ver=planos) — fonte ÚNICA dos dados de plano. Esta rota só
// redireciona pra lá, pra não voltar a duplicar card/preço/feature em dois lugares
// (foi o que gerou o card velho "Aquecimento" enquanto o form já estava novo).
// Links legados (upsell bot_ia, tutorial, master) continuam funcionando.
export default function PlanosPage() {
  redirect("/?ver=planos");
}
