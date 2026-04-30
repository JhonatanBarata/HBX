"use client";

import DashboardScaffold from "@/components/DashboardScaffold";

export default function LayoutsClientPage() {
  return (
    <DashboardScaffold
      title="Layouts do Workspace"
      description="Área reservada para presets, testes de composição e governança dos layouts profissionais do HBX."
      layoutMode="workspace"
    >
      <section className="panel p-5">
        <h2 className="text-xl font-extrabold tracking-tight">Laboratório de layouts</h2>
        <p className="mt-3 text-sm text-muted leading-relaxed">
          A infraestrutura de docking já está pronta para receber presets por módulo, role e
          tenant. Esta rota fica reservada para a futura central administrativa dos layouts.
        </p>
      </section>
    </DashboardScaffold>
  );
}
