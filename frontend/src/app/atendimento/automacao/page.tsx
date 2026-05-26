export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import AtendimentoAutomationClientPage from "./page.client";

type AtendimentoAutomationPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export default async function Page({ searchParams }: AtendimentoAutomationPageProps) {
  const params = await searchParams;
  const mode = Array.isArray(params?.mode) ? params?.mode[0] : params?.mode;
  if (String(mode || "").trim().toLowerCase() === "mobile") {
    redirect("/atendimento");
  }

  return <AtendimentoAutomationClientPage />;
}
