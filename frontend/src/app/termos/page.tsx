import type { Metadata } from "next";
import { TermosClient } from "./page.client";

export const metadata: Metadata = {
  title: "Termos de Serviço — HBX System",
  description: "Termos e condições de uso da plataforma HBX System.",
};

export default function TermosPage() {
  return <TermosClient />;
}
