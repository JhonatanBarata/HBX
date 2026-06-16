import type { Metadata } from "next";

import { PoliticasClient } from "./page.client";

export const metadata: Metadata = {
  title: "HBX — Política de Privacidade",
  description: "Como a HBX System coleta, usa, armazena e protege seus dados pessoais, conforme a LGPD (Lei 13.709/2018).",
};

export default function PoliticasPage() {
  return <PoliticasClient />;
}
