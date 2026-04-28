"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "../../_lib/api";
import { useRequireAuth } from "../../_lib/useRequireAuth";
import { fetchMasterWorkspaceBootstrap } from "../master.bootstrap";
import { formatCurrency, metricValue } from "../master.formatters";
import type {
  CompanySummary,
  CurrentUser,
  DrawerTab,
  MasterWhatsAppSituationMode,
  OperationalTone,
  StatusBucket,
  SystemModule,
  WorkspacePayload,
} from "../master.types";
import styles from "../page.module.css";

type MasterArea = "clientes" | "financeiro" | "whatsapp" | "planos";
type ClientFilterId =
  | "all"
  | "PAYING"
  | "TRIAL"
  | "TRIAL_ENDING"
  | "OVERDUE"
  | "SUSPENDED"
  | "NO_METHOD"
  | "no_whatsapp"
  | "whatsapp_error"
  | "high_usage"
  | "critical_error";

const MASTER_NAV: Array<{ id: MasterArea | "home" | "sistema" | "operacao"; label: string; href: string }> = [
  { id: "home", label: "Home", href: "/dashboard/master" },
  { id: "sistema", label: "Sistema/Hostinger", href: "/dashboard/master/sistema" },
  { id: "clientes", label: "Clientes", href: "/dashboard/master/clientes" },
  { id: "financeiro", label: "Financeiro", href: "/dashboard/master/financeiro" },
  { id: "whatsapp", label: "WhatsApp", href: "/dashboard/master/whatsapp" },
  { id: "planos", label: "Planos/Módulos", href: "/dashboard/master/planos" },
  { id: "operacao", label: "Operação completa", href: "/dashboard/master/operacao" },
];

const CLIENT_FILTERS: Array<{ id: ClientFilterId; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "PAYING", label: "Pagando" },
  { id: "TRIAL", label: "Trial" },
  { id: "TRIAL_ENDING", label: "Trial vencendo" },
  { id: "OVERDUE", label: "Atrasado" },
  { id: "SUSPENDED", label: "Suspenso" },
  { id: "NO_METHOD", label: "Sem método" },
  { id: "no_whatsapp", label: "Sem WhatsApp" },
  { id: "whatsapp_error", label: "WhatsApp com erro" },
  { id: "high_usage", label: "Uso alto" },
  { id: "critical_error", label: "Erro crítico" },
];

const DRAWER_TABS: Array<{ id: DrawerTab; label: string }> = [
  { id: "summary", label: "Resumo" },
  { id: "finance", label: "Financeiro" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "modules", label: "Módulos" },
  { id: "users", label: "Usuários" },
  { id: "website", label: "Website" },
  { id: "integrations", label: "Integrações" },
  { id: "audit", label: "Auditoria" },
  { id: "danger", label: "Perigo" },
];

const AREA_COPY: Record<MasterArea, { title: string; description: string }> = {
  clientes: {
    title: "Clientes Master",
    description: "Base operacional com financeiro, WhatsApp, atividade e atalhos para a operação completa.",
  },
  financeiro: {
    title: "Financeiro Master",
    description: "Leitura centralizada pelo billingSituation, sem mudar cobrança ou ativação existente.",
  },
  whatsapp: {
    title: "WhatsApp Master",
    description: "Leitura operacional de QR rápido, Meta oficial e Token Master sem expor secrets.",
  },
  planos: {
    title: "Planos e Módulos",
    description: "Catálogo de módulos, preços e uso por cliente com edição segura já existente no backend.",
  },
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function paymentMethodLabel(value?: string | null) {
  const method = String(value || "").trim().toUpperCase();
  if (method === "CARD") return "Cartão";
  if (method === "PIX") return "Pix";
  if (method === "BOLETO") return "Boleto";
  if (method === "MANUAL") return "Manual";
  if (method === "TRANSFERENCIA") return "Transferência";
  if (method === "DINHEIRO") return "Dinheiro";
  return "Sem método";
}

function bucketLabel(value?: StatusBucket | string | null) {
  if (value === "PAYING") return "Pagando";
  if (value === "MANUAL_PREMIUM") return "Premium manual";
  if (value === "TRIAL") return "Trial";
  if (value === "TRIAL_ENDING") return "Trial vencendo";
  if (value === "OVERDUE") return "Atrasado";
  if (value === "SUSPENDED") return "Suspenso";
  if (value === "NO_METHOD") return "Sem método";
  return "Indefinido";
}

function badgeClass(tone: string) {
  if (tone === "success") return "badge badge-success";
  if (tone === "danger") return "badge badge-danger";
  if (tone === "warning" || tone === "brand") return "badge badge-brand";
  return "badge";
}

function statusTone(status?: StatusBucket | string | null) {
  if (status === "PAYING" || status === "TRIAL") return "success";
  if (status === "TRIAL_ENDING" || status === "MANUAL_PREMIUM" || status === "NO_METHOD") return "warning";
  if (status === "OVERDUE" || status === "SUSPENDED") return "danger";
  return "neutral";
}

function operationalHealthLabel(tone?: OperationalTone | null) {
  if (tone === "green") return "Operando";
  if (tone === "yellow") return "Em atenção";
  if (tone === "red") return "Crítico";
  return "Sem leitura";
}

function whatsappModeLabel(mode?: MasterWhatsAppSituationMode | string | null) {
  if (mode === "qr") return "QR rápido = teste/onboarding rápido";
  if (mode === "official") return "Meta oficial = produção";
  if (mode === "master_token") return "Token Master = credencial global controlada pelo Master";
  if (mode === "mixed") return "Misto";
  if (mode === "none") return "Sem WhatsApp";
  return "Sem leitura";
}

function whatsappStatusTone(company: CompanySummary) {
  const status = company.whatsappSituation?.status;
  if (status === "connected") return "success";
  if (status === "error") return "danger";
  if (status === "attention") return "warning";
  if (company.whatsappCenter?.status === "OFFICIAL") return "success";
  if (company.whatsappCenter?.status === "QR") return "brand";
  if (company.whatsappCenter?.status === "ATTENTION") return "warning";
  return "neutral";
}

function operationHref(company: CompanySummary, tab: DrawerTab = "summary") {
  const operationTab = tab === "whatsapp" ? "integrations" : tab;
  return `/dashboard/master/operacao?companyId=${company.id}&tab=${operationTab}`;
}

function lastActivityAt(company: CompanySummary) {
  return (
    company.webscrapingUsage?.lastSearchAt ||
    company.webscrapingUsage?.lastAttemptAt ||
    company.operationalStatus?.lastCheckedAt ||
    company.createdAt ||
    null
  );
}

function usageLabel(company: CompanySummary) {
  const searches = Number(company.webscrapingUsage?.searchesToday || 0);
  const blocked = Number(company.webscrapingUsage?.blockedToday || 0);
  const reuse = Number(company.webscrapingUsage?.globalCacheReuseRate || 0);
  if (!searches && !blocked) return "Sem uso hoje";
  return `${searches} busca(s) hoje • ${blocked} bloqueio(s) • reuso ${reuse}%`;
}

function companyMatchesFilter(company: CompanySummary, filterId: ClientFilterId) {
  if (filterId === "all") return true;
  if (filterId === "no_whatsapp") {
    return !company.whatsappSituation || company.whatsappSituation.mode === "none" || company.whatsappSituation.status === "disconnected";
  }
  if (filterId === "whatsapp_error") {
    return Boolean(company.whatsappSituation?.hasError || company.whatsappSituation?.status === "error");
  }
  if (filterId === "high_usage") {
    return Number(company.webscrapingUsage?.searchesToday || 0) >= 3 || Number(company.webscrapingUsage?.fetchedToday || 0) >= 20;
  }
  if (filterId === "critical_error") {
    return company.riskLevel === "critical" || company.operationalStatus?.overallHealth === "red";
  }
  return company.statusBucket === filterId;
}

function companyMatchesSearch(company: CompanySummary, search: string) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    company.name,
    company.contactEmail,
    company.contactPhone,
    company.slug,
    company.primaryContactName,
    company.plan?.name,
    company.financialSituation,
    company.billingSituation?.statusLabel,
    company.whatsappSituation?.statusLabel,
    company.whatsappSituation?.mode,
    company.paymentStatus,
    company.subscriptionStatus,
    company.statusBucket,
    company.operationalStatus?.overallLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}

function moduleClientCount(moduleKey: string, companies: CompanySummary[]) {
  return companies.filter((company) => company.modules.some((moduleItem) => moduleItem.key === moduleKey && moduleItem.enabled)).length;
}

function ModuleEditor({
  moduleItem,
  onCancel,
  onSaved,
}: {
  moduleItem: SystemModule;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: moduleItem.name,
    description: moduleItem.description || "",
    monthlyPrice: String(moduleItem.monthlyPrice || 0),
    defaultEnabled: Boolean(moduleItem.defaultEnabled),
    companyAssignable: Boolean(moduleItem.companyAssignable),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveModule() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/modules/master/system-modules/${moduleItem.key}`, {
        method: "PUT",
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim(),
          monthlyPrice: Number(String(draft.monthlyPrice).replace(",", ".")) || 0,
          defaultEnabled: draft.defaultEnabled,
          companyAssignable: draft.companyAssignable,
        }),
      });
      onSaved();
      onCancel();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar módulo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.summaryCard}>
      <div className={styles.panelCardHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Editar módulo</p>
          <h3>{moduleItem.name}</h3>
        </div>
        <div className={styles.rowActions}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveModule} disabled={saving}>
            {saving ? "Salvando..." : "Salvar módulo"}
          </button>
        </div>
      </div>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <div className={styles.formGrid}>
        <input className="field" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nome" />
        <input className="field" value={draft.monthlyPrice} onChange={(event) => setDraft((current) => ({ ...current, monthlyPrice: event.target.value }))} placeholder="Preço mensal" />
        <textarea className="field" rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Descrição" />
        <div className={styles.secondaryCell}>
          <label className={styles.inlineCheck}>
            <input type="checkbox" checked={draft.defaultEnabled} onChange={(event) => setDraft((current) => ({ ...current, defaultEnabled: event.target.checked }))} />
            <span>Padrão para novas empresas</span>
          </label>
          <label className={styles.inlineCheck}>
            <input type="checkbox" checked={draft.companyAssignable} onChange={(event) => setDraft((current) => ({ ...current, companyAssignable: event.target.checked }))} />
            <span>Vendável/atribuível para clientes</span>
          </label>
        </div>
      </div>
    </section>
  );
}

function MasterNavigation({ active }: { active: MasterArea }) {
  return (
    <nav className={styles.filterChips} aria-label="Navegação Master">
      {MASTER_NAV.map((item) => (
        <Link key={item.href} href={item.href} className={item.id === active ? styles.filterChipActive : styles.filterChip}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function ClientDrawer({
  company,
  tab,
  onTabChange,
  onClose,
}: {
  company: CompanySummary | null;
  tab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.drawerRoot} data-open={Boolean(company)}>
      <button type="button" className={styles.drawerBackdrop} onClick={onClose} aria-label="Fechar detalhes" />
      <aside className={styles.drawerPanel}>
        {company ? (
          <>
            <header className={styles.drawerHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Detalhe rápido do cliente</p>
                <h2>{company.name}</h2>
                <div className={styles.drawerBadges}>
                  <span className={badgeClass(statusTone(company.statusBucket))}>{bucketLabel(company.statusBucket)}</span>
                  <span className="badge">{company.plan?.name || "Sem plano"}</span>
                  <span className={badgeClass(whatsappStatusTone(company))}>{company.whatsappSituation?.statusLabel || company.whatsappCenter?.statusLabel || "WhatsApp sem leitura"}</span>
                </div>
              </div>
              <button type="button" className={styles.iconButton} onClick={onClose}>
                Fechar
              </button>
            </header>

            <div className={styles.contextBanner}>
              <strong>Ações completas continuam na operação preservada</strong>
              <span>Este drawer mostra a leitura consolidada. Trial, pagamentos, tokens, módulos, usuários e exclusões abrem no Master completo com os safeguards atuais.</span>
              <div className={styles.rowActions}>
                <Link href={operationHref(company, tab)} className="btn btn-primary btn-sm">
                  Abrir esta aba na operação completa
                </Link>
                <Link href={operationHref(company, "danger")} className="btn btn-secondary btn-sm">
                  Área de perigo
                </Link>
              </div>
            </div>

            <nav className={styles.drawerTabs}>
              {DRAWER_TABS.map((item) => (
                <button key={item.id} type="button" className={tab === item.id ? styles.drawerTabActive : styles.drawerTab} onClick={() => onTabChange(item.id)}>
                  {item.label}
                </button>
              ))}
            </nav>

            <div className={styles.drawerBody}>
              {tab === "summary" ? (
                <>
                  <section className={styles.summaryCard}>
                    <div className={styles.summaryStats}>
                      <div><span>Operacional</span><strong>{operationalHealthLabel(company.operationalStatus?.overallHealth)}</strong></div>
                      <div><span>Financeiro</span><strong>{company.billingSituation?.statusLabel || company.financialSituation}</strong></div>
                      <div><span>WhatsApp</span><strong>{company.whatsappSituation?.statusLabel || company.whatsappCenter?.statusLabel || "Sem leitura"}</strong></div>
                      <div><span>Última atividade</span><strong>{formatDateTime(lastActivityAt(company))}</strong></div>
                    </div>
                  </section>
                  <section className={styles.summaryCard}>
                    <div className={styles.summaryMeta}>
                      <p>Contato: {company.primaryContactName || "-"} • {company.contactEmail || "sem e-mail"} • {company.contactPhone || "sem telefone"}</p>
                      <p>Slug: {company.slug || "-"} • Plano: {company.plan?.name || "Sem plano"}</p>
                      <p>Uso: {usageLabel(company)}</p>
                      <p>Módulos ativos: {company.modules.filter((item) => item.enabled).map((item) => item.name).join(", ") || "Nenhum"}</p>
                    </div>
                  </section>
                </>
              ) : null}

              {tab === "finance" ? (
                <section className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Financeiro normalizado</p>
                      <h3>{company.billingSituation?.statusLabel || company.financialSituation}</h3>
                    </div>
                    <div className={styles.rowActions}>
                      <Link href={operationHref(company, "finance")} className="btn btn-primary btn-sm">Registrar pagamento manual</Link>
                      <Link href={operationHref(company, "finance")} className="btn btn-secondary btn-sm">Trial, acesso e meses grátis</Link>
                    </div>
                  </div>
                  <div className={styles.summaryStats}>
                    <div><span>Valor ciclo</span><strong>{formatCurrency(company.billingSituation?.currentCycleAmount ?? company.finance.finalCycleAmount)}</strong></div>
                    <div><span>Aberto</span><strong>{formatCurrency(company.billingSituation?.amountDue ?? company.currentOutstandingValue)}</strong></div>
                    <div><span>Método</span><strong>{paymentMethodLabel(company.billingSituation?.paymentMethod || company.paymentMethod)}</strong></div>
                    <div><span>Próximo venc.</span><strong>{formatDate(company.billingSituation?.nextDueAt || company.nextDueAt)}</strong></div>
                  </div>
                  <div className={styles.summaryMeta}>
                    <p>Último pagamento: {company.billingSituation?.lastPayment ? `${formatDateTime(company.billingSituation.lastPayment.paidAt)} • ${formatCurrency(company.billingSituation.lastPayment.amount)}` : "Sem histórico"}</p>
                    <p>Última falha: {company.billingSituation?.lastFailure ? `${formatDateTime(company.billingSituation.lastFailure.dueDate)} • ${formatCurrency(company.billingSituation.lastFailure.amount)}` : "Sem falha recente"}</p>
                    <p>Provider: {company.billingSituation?.provider || company.billingProvider || "manual"}</p>
                    <p>Atraso: {company.billingSituation?.daysOverdue ?? company.daysOverdue} dia(s)</p>
                  </div>
                </section>
              ) : null}

              {tab === "whatsapp" ? (
                <section className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>WhatsApp normalizado</p>
                      <h3>{company.whatsappSituation?.statusLabel || company.whatsappCenter?.statusLabel || "Sem leitura"}</h3>
                    </div>
                    <div className={styles.rowActions}>
                      <Link href={operationHref(company, "integrations")} className="btn btn-primary btn-sm">Configurar tokens/modos</Link>
                      <Link href="/dashboard/master/whatsapp" className="btn btn-secondary btn-sm">Ver WhatsApp Master</Link>
                    </div>
                  </div>
                  <div className={styles.summaryStats}>
                    <div><span>Modo</span><strong>{whatsappModeLabel(company.whatsappSituation?.mode)}</strong></div>
                    <div><span>Número</span><strong>{company.whatsappSituation?.numberLabel || company.whatsappCenter?.official?.displayNumber || "-"}</strong></div>
                    <div><span>Token Master</span><strong>{company.whatsappSituation?.usingMasterToken ? "Sim" : "Não"}</strong></div>
                    <div><span>Pendência</span><strong>{company.whatsappSituation?.hasPendingMigration ? "Migração" : company.whatsappSituation?.nextStepLabel || "-"}</strong></div>
                  </div>
                  <div className={styles.summaryMeta}>
                    <p>QR rápido = teste/onboarding rápido</p>
                    <p>Meta oficial = produção</p>
                    <p>Token Master = credencial global controlada pelo Master</p>
                    <p>{company.whatsappSituation?.hasError ? `Erro seguro: ${company.whatsappSituation.errorMessageSafe || "revisar configuração"}` : "Sem erro seguro reportado."}</p>
                  </div>
                </section>
              ) : null}

              {tab === "modules" ? (
                <section className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Módulos do cliente</p>
                      <h3>{formatCurrency(company.modulesTotalMonthlyValue || 0)} em módulos ativos</h3>
                    </div>
                    <Link href={operationHref(company, "modules")} className="btn btn-primary btn-sm">Editar módulos na operação</Link>
                  </div>
                  <div className={styles.userList}>
                    {company.modules.map((moduleItem) => (
                      <article key={moduleItem.key} className={styles.userCard}>
                        <strong>{moduleItem.name}</strong>
                        <span className={badgeClass(moduleItem.enabled ? "success" : "neutral")}>{moduleItem.enabled ? "Ativo" : "Inativo"}</span>
                        <p>{formatCurrency(moduleItem.monthlyPrice || 0)}/mês</p>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {tab === "users" ? (
                <section className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Usuários</p>
                      <h3>{company.userCount} usuário(s)</h3>
                    </div>
                    <Link href={operationHref(company, "users")} className="btn btn-primary btn-sm">Gerenciar usuários</Link>
                  </div>
                  <p className={styles.emptyPanel}>A criação, edição, reset de senha e remoção seguem na operação completa.</p>
                </section>
              ) : null}

              {tab === "website" ? (
                <section className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Website</p>
                      <h3>{company.website.configured ? "Configurado" : "Pendente"}</h3>
                    </div>
                    <Link href={operationHref(company, "website")} className="btn btn-primary btn-sm">Abrir website</Link>
                  </div>
                  <div className={styles.summaryMeta}>
                    <p>Site público: {company.website.publicUrl || "-"}</p>
                    <p>Admin: {company.website.adminUrl || "-"}</p>
                    <p>Projeto: {company.website.projectId || "-"}</p>
                    <p>Modo: {company.website.launchMode || "public"}</p>
                  </div>
                </section>
              ) : null}

              {tab === "integrations" ? (
                <section className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Integrações</p>
                      <h3>Tokens e credenciais sem exibir secrets</h3>
                    </div>
                    <Link href={operationHref(company, "integrations")} className="btn btn-primary btn-sm">Gerenciar integrações</Link>
                  </div>
                  <div className={styles.summaryStats}>
                    <div><span>Mercado Pago</span><strong>{company.mercadoPago.tokenConfigured ? "Configurado" : "Pendente"}</strong></div>
                    <div><span>MP Master</span><strong>{company.mercadoPago.usingMasterToken ? "Sim" : "Não"}</strong></div>
                    <div><span>WhatsApp Token</span><strong>{company.whatsappSituation?.tokenConfigured ? "Configurado" : "Pendente"}</strong></div>
                    <div><span>Phone ID</span><strong>{company.whatsappSituation?.phoneNumberIdConfigured ? "Configurado" : "Pendente"}</strong></div>
                  </div>
                </section>
              ) : null}

              {tab === "audit" ? (
                <section className={styles.summaryCard}>
                  <div className={styles.panelCardHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Auditoria</p>
                      <h3>{company.auditCount || 0} evento(s) no snapshot</h3>
                    </div>
                    <Link href={operationHref(company, "audit")} className="btn btn-primary btn-sm">Abrir auditoria completa</Link>
                  </div>
                  <p className={styles.emptyPanel}>A linha do tempo detalhada é carregada no Master completo para preservar o endpoint de detalhe existente.</p>
                </section>
              ) : null}

              {tab === "danger" ? (
                <section className={styles.summaryCard}>
                  <div className={styles.contextBannerStrong}>
                    <strong>Área sensível preservada</strong>
                    <span>Arquivar e excluir continuam exigindo confirmação no drawer completo. Nenhuma ação destrutiva foi duplicada aqui.</span>
                    <Link href={operationHref(company, "danger")} className="btn btn-primary btn-sm">Abrir perigo com safeguards</Link>
                  </div>
                </section>
              ) : null}
            </div>
          </>
        ) : (
          <div className={styles.drawerEmpty}>Selecione uma empresa.</div>
        )}
      </aside>
    </div>
  );
}

export default function MasterOperationalView({ area }: { area: MasterArea }) {
  const hasToken = useRequireAuth();
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterId, setFilterId] = useState<ClientFilterId>("all");
  const [selectedCompany, setSelectedCompany] = useState<CompanySummary | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("summary");
  const [editingModuleKey, setEditingModuleKey] = useState<string | null>(null);

  async function loadWorkspace(background = false) {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const payload = await fetchMasterWorkspaceBootstrap(!background);
      setWorkspace(payload.workspacePayload);
      setUser(payload.userPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o Master.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (hasToken !== true) return;
    void loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken]);

  const companies = workspace?.companies || [];
  const filteredCompanies = useMemo(() => {
    return companies
      .filter((company) => companyMatchesFilter(company, filterId))
      .filter((company) => companyMatchesSearch(company, search))
      .sort((left, right) => {
        const riskWeight = { critical: 0, warning: 1, stable: 2 } as const;
        const riskDiff = riskWeight[left.riskLevel] - riskWeight[right.riskLevel];
        if (riskDiff !== 0) return riskDiff;
        return left.name.localeCompare(right.name, "pt-BR");
      });
  }, [companies, filterId, search]);

  const billingRows = useMemo(() => {
    return companies
      .filter((company) => companyMatchesSearch(company, search))
      .sort((left, right) => {
        const dueDiff = new Date(left.billingSituation?.nextDueAt || left.nextDueAt || 0).getTime() - new Date(right.billingSituation?.nextDueAt || right.nextDueAt || 0).getTime();
        if (dueDiff !== 0) return dueDiff;
        return Number(right.billingSituation?.amountDue || right.currentOutstandingValue || 0) - Number(left.billingSituation?.amountDue || left.currentOutstandingValue || 0);
      });
  }, [companies, search]);

  const whatsappRows = useMemo(() => {
    return companies
      .filter((company) => companyMatchesSearch(company, search))
      .sort((left, right) => {
        const statusWeight = { error: 0, attention: 1, disconnected: 2, unknown: 3, connected: 4 } as const;
        const leftStatus = left.whatsappSituation?.status || "unknown";
        const rightStatus = right.whatsappSituation?.status || "unknown";
        const diff = (statusWeight[leftStatus] ?? 3) - (statusWeight[rightStatus] ?? 3);
        if (diff !== 0) return diff;
        return left.name.localeCompare(right.name, "pt-BR");
      });
  }, [companies, search]);

  const billingOverview = useMemo(() => {
    return {
      overdue: companies.reduce((total, company) => total + Number(company.billingSituation?.amountDue || company.currentOutstandingValue || 0), 0),
      trialsToConvert: companies.filter((company) => company.statusBucket === "TRIAL" || company.statusBucket === "TRIAL_ENDING").length,
      manualPremium: companies.filter((company) => company.statusBucket === "MANUAL_PREMIUM").length,
      mercadoPagoFailures: companies.filter((company) => company.recentCardFailure || String(company.mercadoPago.status || "").toUpperCase() === "ERROR").length,
      noMethod: companies.filter((company) => company.statusBucket === "NO_METHOD" || company.billingSituation?.reason === "no_method").length,
    };
  }, [companies]);

  const whatsappOverview = useMemo(() => {
    return {
      connected: companies.filter((company) => company.whatsappSituation?.status === "connected").length,
      error: companies.filter((company) => company.whatsappSituation?.hasError || company.whatsappSituation?.status === "error").length,
      masterToken: companies.filter((company) => company.whatsappSituation?.usingMasterToken).length,
      pendingMigration: companies.filter((company) => company.whatsappSituation?.hasPendingMigration).length,
    };
  }, [companies]);

  function openClient(company: CompanySummary, tab: DrawerTab = "summary") {
    setSelectedCompany(company);
    setDrawerTab(tab);
  }

  if (hasToken === null || loading) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando cockpit Master...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  if (!user?.isSystemMaster) {
    return (
      <DashboardScaffold title={AREA_COPY[area].title} description="Acesso exclusivo do usuário MASTER.">
        <section className={styles.masterHomeAccess}>
          <h2>Acesso exclusivo do MASTER</h2>
          <p>Seu usuário autenticado não tem permissão para abrir esta central.</p>
          {error ? <p className={styles.masterHomeError}>{error}</p> : null}
          <Link href="/dashboard" className="btn btn-secondary btn-sm">Voltar ao painel</Link>
        </section>
      </DashboardScaffold>
    );
  }

  const editingModule = workspace?.systemModules.find((moduleItem) => moduleItem.key === editingModuleKey) || null;

  return (
    <DashboardScaffold
      title={AREA_COPY[area].title}
      description={AREA_COPY[area].description}
      actions={
        <div className={styles.heroActions}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadWorkspace(true)} disabled={refreshing}>
            {refreshing ? "Atualizando..." : "Atualizar"}
          </button>
          <Link href="/dashboard/master/operacao" className="btn btn-primary btn-sm">
            Operação completa
          </Link>
        </div>
      }
    >
      <div className={styles.masterPage}>
        <MasterNavigation active={area} />
        {error ? <div className="alert alert-error">{error}</div> : null}

        <section className={styles.commandBar}>
          <div className={styles.commandSearch}>
            <p className={styles.commandLabel}>Busca operacional</p>
            <input className="field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, e-mail, telefone, slug ou status" />
          </div>
          <div className={styles.commandAlerts}>
            <strong>{companies.length} clientes</strong>
            <p>Snapshot gerado em {formatDateTime(workspace?.generatedAt)}</p>
          </div>
          <div className={styles.commandAlerts}>
            <strong>{billingOverview.noMethod} sem método</strong>
            <p>{formatCurrency(billingOverview.overdue)} em atraso no snapshot.</p>
          </div>
          <div className={styles.commandAlerts}>
            <strong>{whatsappOverview.error} WhatsApp com erro</strong>
            <p>{whatsappOverview.masterToken} usando Token Master.</p>
          </div>
        </section>

        {area === "clientes" ? (
          <section className={styles.tableSection}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Clientes</p>
                <h2>Base com leitura financeira e WhatsApp normalizadas</h2>
              </div>
            </div>
            <div className={styles.filterChips}>
              {CLIENT_FILTERS.map((filter) => (
                <button key={filter.id} type="button" className={filterId === filter.id ? styles.filterChipActive : styles.filterChip} onClick={() => setFilterId(filter.id)}>
                  {filter.label}
                </button>
              ))}
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.masterTable}>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Plano</th>
                    <th>Situação operacional</th>
                    <th>Financeiro</th>
                    <th>WhatsApp</th>
                    <th>Uso/atividade</th>
                    <th>Última atividade</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies.map((company) => (
                    <tr key={company.id}>
                      <td>
                        <button type="button" className={styles.companyCell} onClick={() => openClient(company)}>
                          <strong>{company.name}</strong>
                          <span>{company.contactEmail || "Sem e-mail"} • {company.contactPhone || "sem telefone"}</span>
                          <span>#{company.id}{company.slug ? ` • ${company.slug}` : ""}</span>
                        </button>
                      </td>
                      <td><div className={styles.secondaryCell}><strong>{company.plan?.name || "Sem plano"}</strong><span>{formatCurrency(company.monthlyValue)}</span></div></td>
                      <td><div className={styles.secondaryCell}><strong>{operationalHealthLabel(company.operationalStatus?.overallHealth)}</strong><span>{company.operationalStatus?.overallLabel || "Sem leitura"}</span></div></td>
                      <td><div className={styles.secondaryCell}><strong>{company.billingSituation?.statusLabel || company.financialSituation}</strong><span>{formatCurrency(company.billingSituation?.amountDue ?? company.currentOutstandingValue)} aberto</span></div></td>
                      <td><div className={styles.secondaryCell}><strong>{company.whatsappSituation?.statusLabel || company.whatsappCenter?.statusLabel || "Sem leitura"}</strong><span>{whatsappModeLabel(company.whatsappSituation?.mode)}</span></div></td>
                      <td><div className={styles.secondaryCell}><strong>{usageLabel(company)}</strong><span>{company.webscrapingUsage?.lastSearchUser || "sem usuário recente"}</span></div></td>
                      <td>{formatDateTime(lastActivityAt(company))}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openClient(company)}>Detalhe</button>
                          <Link href={operationHref(company)} className="btn btn-primary btn-sm">Operação</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredCompanies.length ? <div className={styles.emptyPanel}>Nenhum cliente encontrado.</div> : null}
            </div>
          </section>
        ) : null}

        {area === "financeiro" ? (
          <>
            <section className={styles.metricsGrid}>
              <article className={styles.metricCard} data-accent="emerald"><p className={styles.metricEyebrow}>Recebido no mês</p><strong className={styles.metricValue}>{metricValue(workspace?.summary.confirmedRevenueMonth)}</strong><p className={styles.metricNote}>{workspace?.summary.confirmedRevenueMonth?.note}</p></article>
              <article className={styles.metricCard} data-accent="navy"><p className={styles.metricEyebrow}>Previsto no mês</p><strong className={styles.metricValue}>{metricValue(workspace?.summary.projectedRevenueMonth)}</strong><p className={styles.metricNote}>{workspace?.summary.projectedRevenueMonth?.note}</p></article>
              <article className={styles.metricCard} data-accent="rose"><p className={styles.metricEyebrow}>Atrasado</p><strong className={styles.metricValue}>{formatCurrency(billingOverview.overdue)}</strong><p className={styles.metricNote}>Soma aberta por billingSituation.</p></article>
              <article className={styles.metricCard} data-accent="amber"><p className={styles.metricEyebrow}>Trials para converter</p><strong className={styles.metricValue}>{billingOverview.trialsToConvert}</strong><p className={styles.metricNote}>Inclui trial e trial vencendo.</p></article>
            </section>
            <section className={styles.controlTowerGrid}>
              <div className={styles.kpiMini}><span>Premium manual</span><strong>{billingOverview.manualPremium}</strong></div>
              <div className={styles.kpiMini}><span>Falhas Mercado Pago</span><strong>{billingOverview.mercadoPagoFailures}</strong></div>
              <div className={styles.kpiMini}><span>Sem método</span><strong>{billingOverview.noMethod}</strong></div>
            </section>
            <section className={styles.tableSection}>
              <div className={styles.tableWrap}>
                <table className={styles.masterTable}>
                  <thead><tr><th>Cliente</th><th>Valor</th><th>Ciclo</th><th>Status</th><th>Método</th><th>Provider</th><th>Último pagamento</th><th>Próximo vencimento</th><th>Ação</th></tr></thead>
                  <tbody>
                    {billingRows.map((company) => (
                      <tr key={company.id}>
                        <td><button type="button" className={styles.companyCell} onClick={() => openClient(company, "finance")}><strong>{company.name}</strong><span>{company.plan?.name || "Sem plano"}</span></button></td>
                        <td>{formatCurrency(company.billingSituation?.currentCycleAmount ?? company.finance.finalCycleAmount)}</td>
                        <td>{company.billingSituation?.billingCycle === "ANNUAL" ? "Anual" : "Mensal"}</td>
                        <td><span className={badgeClass(statusTone(company.statusBucket))}>{company.billingSituation?.statusLabel || company.financialSituation}</span></td>
                        <td>{paymentMethodLabel(company.billingSituation?.paymentMethod || company.paymentMethod)}</td>
                        <td>{company.billingSituation?.provider || company.billingProvider || "manual"}</td>
                        <td>{company.billingSituation?.lastPayment ? `${formatDate(company.billingSituation.lastPayment.paidAt)} • ${formatCurrency(company.billingSituation.lastPayment.amount)}` : "-"}</td>
                        <td>{formatDate(company.billingSituation?.nextDueAt || company.nextDueAt)}</td>
                        <td><div className={styles.rowActions}><button type="button" className="btn btn-secondary btn-sm" onClick={() => openClient(company, "finance")}>Abrir</button><Link href={operationHref(company, "finance")} className="btn btn-primary btn-sm">Ações</Link></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        {area === "whatsapp" ? (
          <>
            <section className={styles.summaryCard}>
              <div className={styles.summaryStats}>
                <div><span>Conectados</span><strong>{whatsappOverview.connected}</strong></div>
                <div><span>Com erro</span><strong>{whatsappOverview.error}</strong></div>
                <div><span>Token Master</span><strong>{whatsappOverview.masterToken}</strong></div>
                <div><span>Migração pendente</span><strong>{whatsappOverview.pendingMigration}</strong></div>
              </div>
              <div className={styles.summaryMeta}>
                <p>QR rápido = teste/onboarding rápido</p>
                <p>Meta oficial = produção</p>
                <p>Token Master = credencial global controlada pelo Master</p>
                <p>Nenhum token completo é exibido nesta tela.</p>
              </div>
            </section>
            <section className={styles.tableSection}>
              <div className={styles.tableWrap}>
                <table className={styles.masterTable}>
                  <thead><tr><th>Cliente</th><th>Modo</th><th>Status</th><th>Número</th><th>Token</th><th>Próximo passo</th><th>Ação</th></tr></thead>
                  <tbody>
                    {whatsappRows.map((company) => (
                      <tr key={company.id}>
                        <td><button type="button" className={styles.companyCell} onClick={() => openClient(company, "whatsapp")}><strong>{company.name}</strong><span>{company.slug || company.contactEmail || "-"}</span></button></td>
                        <td>{whatsappModeLabel(company.whatsappSituation?.mode)}</td>
                        <td><span className={badgeClass(whatsappStatusTone(company))}>{company.whatsappSituation?.statusLabel || company.whatsappCenter?.statusLabel || "Sem leitura"}</span></td>
                        <td>{company.whatsappSituation?.numberLabel || company.whatsappCenter?.official?.displayNumber || "-"}</td>
                        <td>{company.whatsappSituation?.usingMasterToken ? "Token Master" : company.whatsappSituation?.tokenConfigured ? "Próprio configurado" : "Pendente"}</td>
                        <td>{company.whatsappSituation?.nextStepLabel || company.whatsappCenter?.statusHint || "-"}</td>
                        <td><div className={styles.rowActions}><button type="button" className="btn btn-secondary btn-sm" onClick={() => openClient(company, "whatsapp")}>Detalhe</button><Link href={operationHref(company, "integrations")} className="btn btn-primary btn-sm">Configurar</Link></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        {area === "planos" ? (
          <>
            {editingModule ? (
              <ModuleEditor moduleItem={editingModule} onCancel={() => setEditingModuleKey(null)} onSaved={() => void loadWorkspace(true)} />
            ) : null}
            <section className={styles.tableSection}>
              <div className={styles.tableWrap}>
                <table className={styles.masterTable}>
                  <thead><tr><th>Módulo</th><th>Preço</th><th>Padrão</th><th>Vendável</th><th>Clientes usando</th><th>Ação</th></tr></thead>
                  <tbody>
                    {(workspace?.systemModules || []).map((moduleItem) => (
                      <tr key={moduleItem.key}>
                        <td><div className={styles.secondaryCell}><strong>{moduleItem.name}</strong><span>{moduleItem.description || moduleItem.key}</span></div></td>
                        <td>{formatCurrency(moduleItem.monthlyPrice)}</td>
                        <td><span className={badgeClass(moduleItem.defaultEnabled ? "success" : "neutral")}>{moduleItem.defaultEnabled ? "Sim" : "Não"}</span></td>
                        <td><span className={badgeClass(moduleItem.companyAssignable ? "success" : "warning")}>{moduleItem.companyAssignable ? "Sim" : "Não"}</span></td>
                        <td>{moduleClientCount(moduleItem.key, companies)}</td>
                        <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingModuleKey(moduleItem.key)}>Editar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className={styles.summaryCard}>
              <div className={styles.panelCardHeader}>
                <div>
                  <p className={styles.sectionEyebrow}>Total financeiro por cliente</p>
                  <h3>Módulos ativos e ciclo atual</h3>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.historyTable}>
                  <thead><tr><th>Cliente</th><th>Plano</th><th>Módulos ativos</th><th>Total módulos</th><th>Ciclo atual</th><th>Ação</th></tr></thead>
                  <tbody>
                    {companies.map((company) => (
                      <tr key={company.id}>
                        <td>{company.name}</td>
                        <td>{company.plan?.name || "Sem plano"}</td>
                        <td>{company.modules.filter((moduleItem) => moduleItem.enabled).map((moduleItem) => moduleItem.name).join(", ") || "Nenhum"}</td>
                        <td>{formatCurrency(company.modulesTotalMonthlyValue || 0)}</td>
                        <td>{formatCurrency(company.billingSituation?.currentCycleAmount ?? company.finance.finalCycleAmount)}</td>
                        <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => openClient(company, "modules")}>Ver cliente</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        <ClientDrawer company={selectedCompany} tab={drawerTab} onTabChange={setDrawerTab} onClose={() => setSelectedCompany(null)} />
      </div>
    </DashboardScaffold>
  );
}
