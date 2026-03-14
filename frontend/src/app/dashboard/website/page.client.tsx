"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../_lib/api";
import { useRequireAuth } from "../_lib/useRequireAuth";

type CurrentUser = {
  id: number;
  username?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
};

type MasterCompany = {
  id: number;
  name: string;
  slug?: string | null;
  isActive: boolean;
  paymentStatus: string;
  subscriptionStatus?: string | null;
};

type WebsiteTemplate = {
  key: string;
  name: string;
  type?: string | null;
  hasFunctions?: boolean;
  sourcePath?: string | null;
  copiedAt?: string | null;
};

type WebsiteProject = {
  companyId: number;
  companyName: string;
  companySlug: string;
  templateKey: string;
  templateName: string;
  firebaseProjectId?: string | null;
  status: string;
  localPath: string;
  relativePath: string;
  createdAt: string;
  updatedAt: string;
  deploy?: {
    useCommand?: string;
    hostingCommand?: string;
    hostingFunctionsCommand?: string;
  } | null;
};

function formatSubscriptionLabel(statusRaw?: string | null) {
  const status = String(statusRaw || "").trim().toLowerCase();
  if (status === "trialing") return "trial";
  if (status === "active") return "ativa";
  if (status === "past_due") return "em atraso";
  if (status === "canceled") return "cancelada";
  if (status === "expired") return "expirada";
  return status || "-";
}

export default function WebsiteClientPage() {
  const hasToken = useRequireAuth();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isSystemMaster, setIsSystemMaster] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [companies, setCompanies] = useState<MasterCompany[]>([]);
  const [templates, setTemplates] = useState<WebsiteTemplate[]>([]);
  const [project, setProject] = useState<WebsiteProject | null>(null);

  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(0);
  const [templateKey, setTemplateKey] = useState("");
  const [firebaseProjectId, setFirebaseProjectId] = useState("");
  const [overwrite, setOverwrite] = useState(false);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) || null,
    [companies, selectedCompanyId],
  );

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.key === templateKey) || null,
    [templates, templateKey],
  );

  async function loadProject(companyId: number) {
    if (!companyId) {
      setProject(null);
      return;
    }

    const projectData = await apiFetch<WebsiteProject | null>(`/website/project?companyId=${companyId}`);
    setProject(projectData || null);
    setFirebaseProjectId(projectData?.firebaseProjectId || "");
  }

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [user, companyData, templateData] = await Promise.all([
        apiFetch<CurrentUser>("/profile/current-user"),
        apiFetch<MasterCompany[]>("/modules/master/companies"),
        apiFetch<WebsiteTemplate[]>("/website/templates"),
      ]);

      const master = Boolean(user?.isSystemMaster);
      setIsSystemMaster(master);
      setCheckingAccess(false);

      if (!master) {
        setCompanies([]);
        setTemplates([]);
        setProject(null);
        return;
      }

      const companyList = Array.isArray(companyData) ? companyData : [];
      const templateList = Array.isArray(templateData) ? templateData : [];
      setCompanies(companyList);
      setTemplates(templateList);

      const preferredTemplate =
        templateList.find((item) => item.key === "hbx-master-saas")?.key ||
        templateList[0]?.key ||
        "";
      setTemplateKey((current) => current || preferredTemplate);

      const nextCompanyId = selectedCompanyId || companyList[0]?.id || 0;
      setSelectedCompanyId(nextCompanyId);
      if (nextCompanyId) {
        await loadProject(nextCompanyId);
      } else {
        setProject(null);
      }
    } catch (loadError) {
      setCheckingAccess(false);
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar modulo Website.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasToken !== true) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  useEffect(() => {
    if (!isSystemMaster || !selectedCompanyId || loading) return;
    loadProject(selectedCompanyId).catch((loadError) => {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar website da empresa.";
      setError(message);
    });
  }, [isSystemMaster, loading, selectedCompanyId]);

  async function handleCreateOrRecreate() {
    if (!selectedCompanyId) {
      setError("Selecione a empresa antes de criar o website.");
      return;
    }
    if (!templateKey) {
      setError("Selecione um template antes de criar o website.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = await apiFetch<WebsiteProject>("/website/project", {
        method: "POST",
        body: JSON.stringify({
          companyId: selectedCompanyId,
          templateKey,
          firebaseProjectId: firebaseProjectId.trim() || undefined,
          overwrite,
        }),
      });
      setProject(payload);
      setFirebaseProjectId(payload.firebaseProjectId || "");
      setSuccess(overwrite ? "Website recriado com sucesso." : "Website criado com sucesso.");
      setOverwrite(false);
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Falha ao criar ou recriar website.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFirebaseProjectId() {
    if (!selectedCompanyId) {
      setError("Selecione a empresa antes de salvar o projeto Firebase.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = await apiFetch<WebsiteProject>("/website/project", {
        method: "PATCH",
        body: JSON.stringify({
          companyId: selectedCompanyId,
          firebaseProjectId: firebaseProjectId.trim(),
        }),
      });
      setProject(payload);
      setSuccess("firebaseProjectId atualizado com sucesso.");
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Falha ao atualizar firebaseProjectId.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (hasToken === null || checkingAccess) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando modulo Website...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  if (!isSystemMaster) {
    return (
      <DashboardScaffold
        title="Website"
        description="Area reservada ao MASTER para importar, provisionar e publicar websites."
      >
        <section className="panel p-5">
          <h2 className="text-lg font-semibold">Acesso exclusivo do MASTER</h2>
          <p className="text-sm text-muted mt-2">
            O modulo Website agora e uma area central de provisionamento por empresa e nao fica mais
            disponivel para usuarios comuns.
          </p>
        </section>
      </DashboardScaffold>
    );
  }

  return (
    <DashboardScaffold
      title="Website"
      description="Gerencie websites por empresa, com importacao do template HBX e deploy guiado pelo modulo master."
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      {loading ? (
        <div className="panel p-4 text-sm text-muted">Carregando configuracoes do website...</div>
      ) : (
        <>
          <section className="panel p-4 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Provisionamento master</h2>
              <p className="text-sm text-muted mt-1">
                O template <strong>HBX Master SaaS</strong> foi importado para o modulo Website do
                sistema. Agora o MASTER escolhe a empresa e provisiona o website diretamente daqui.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs uppercase tracking-[0.12em] text-muted">Empresa</label>
                <select
                  className="field mt-1"
                  value={selectedCompanyId ? String(selectedCompanyId) : ""}
                  onChange={(event) => setSelectedCompanyId(Number(event.target.value || 0))}
                >
                  <option value="">Selecione</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      #{company.id} - {company.name}
                    </option>
                  ))}
                </select>
                {selectedCompany ? (
                  <p className="text-xs text-muted mt-2">
                    Status: {selectedCompany.isActive ? "ATIVA" : "INATIVA"} | Pagamento:{" "}
                    {selectedCompany.paymentStatus} | Assinatura:{" "}
                    {formatSubscriptionLabel(selectedCompany.subscriptionStatus)}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="text-xs uppercase tracking-[0.12em] text-muted">Template</label>
                <select
                  className="field mt-1"
                  value={templateKey}
                  onChange={(event) => setTemplateKey(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {templates.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {selectedTemplate ? (
                  <p className="text-xs text-muted mt-2">
                    Tipo: {selectedTemplate.type || "-"} | Functions:{" "}
                    {selectedTemplate.hasFunctions ? "Sim" : "Nao"} | Origem:{" "}
                    {selectedTemplate.sourcePath || "-"}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="text-xs uppercase tracking-[0.12em] text-muted">
                  Firebase projectId
                </label>
                <input
                  className="field mt-1"
                  placeholder="ex.: hbxautomacoes"
                  value={firebaseProjectId}
                  onChange={(event) => setFirebaseProjectId(event.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-muted inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(event) => setOverwrite(event.target.checked)}
                />
                Recriar website (overwrite)
              </label>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving || !selectedCompanyId || !templateKey}
                onClick={handleCreateOrRecreate}
              >
                {saving ? "Processando..." : project ? "Criar/Recriar website" : "Criar website"}
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={saving || !selectedCompanyId || !project}
                onClick={handleSaveFirebaseProjectId}
              >
                Salvar firebaseProjectId
              </button>
            </div>
          </section>

          <section className="panel p-4 mt-3 space-y-3">
            <h2 className="text-lg font-semibold">Projeto atual da empresa</h2>
            {!selectedCompany ? (
              <p className="text-sm text-muted">Selecione uma empresa para ver o website provisionado.</p>
            ) : !project ? (
              <p className="text-sm text-muted">
                Nenhum website criado ainda para a empresa {selectedCompany.name}.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Empresa #{project.companyId}: {project.companyName} ({project.companySlug})
                </p>
                <p className="text-sm text-muted">
                  Template: {project.templateName} ({project.templateKey})
                </p>
                <p className="text-sm text-muted">
                  Status: {project.status} | Firebase projectId: {project.firebaseProjectId || "-"}
                </p>
                <p className="text-sm text-muted break-all">Pasta local: {project.localPath}</p>
                <p className="text-sm text-muted">Caminho relativo: {project.relativePath}</p>
                <p className="text-sm text-muted">
                  Criado em: {new Date(project.createdAt).toLocaleString()} | Atualizado em:{" "}
                  {new Date(project.updatedAt).toLocaleString()}
                </p>

                <div className="rounded-[12px] border border-[var(--line)] p-3 bg-[var(--surface-soft)] text-xs leading-6">
                  <p>
                    <strong>Selecionar projeto:</strong>{" "}
                    <code>{project.deploy?.useCommand || "firebase use <project-id>"}</code>
                  </p>
                  <p>
                    <strong>Deploy Hosting:</strong>{" "}
                    <code>{project.deploy?.hostingCommand || "firebase deploy --only hosting"}</code>
                  </p>
                  <p>
                    <strong>Deploy Hosting + Functions:</strong>{" "}
                    <code>
                      {project.deploy?.hostingFunctionsCommand ||
                        "firebase deploy --only hosting,functions"}
                    </code>
                  </p>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </DashboardScaffold>
  );
}
