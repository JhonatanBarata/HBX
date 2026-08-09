"use client";

// Janela 1 — Empresas (CORAÇÃO do /master).
// MASTER-REFAB S6 (10/07 noite, ordem literal do dono): cortesia morre como conceito — só 2
// TIPOS explícitos de conta, `accountType` vindo do backend: Crédito (self-service, ativa por
// default) e Empresarial (exceção montada aqui pelo master; era "Negociada" no S1). O box
// Cortesia da ficha SOME (presente = conceder crédito na Carteira, aba Financeiro). O modelo de
// catálogo/período de avaliação/degustação e as condições de cobrança à parte morreram desta
// tela; S7 (10/07) aposentou os endpoints de backend correspondentes (plan/trial/plan-taste/
// courtesy) — 410 na escrita, corpo mantido no service pra auditoria.
// Contratos ligados (todos já existentes no backend):
//   GET  /modules/master/companies                       → lista (vem do pai)
//   GET  /modules/master/company/:id/detail              → detalhe completo
//   PUT  /modules/master/company/:id/account-type        → toggle Crédito|Empresarial (S6)
//   GET/PUT /logistica/master/company/:id/nivel           → nível Basic|Advanced|Full + preset de toggles (PR27072026 F1)
//   POST /modules/master/company/:id/enterprise-contract → chavinha: tipo+módulos full+valor+teto num gesto (S8)
//   PUT  /modules/master/company/:id  {moduleKey,enabled}→ módulo (TETO/masterEnabled — W1 PR10072026)
//   PUT  /modules/master/company/:id/profile             → dados cadastrais
//   PUT  /modules/master/company/:id/suspension          → {suspended, reason}
//   PUT  /modules/master/company/:id/card-quota          → {seatCap} (assentos; cards/mês·dia morreram da UI)
//   PUT  /modules/master/company/:id/delivery-cap        → {dailyDeliveryCapOverride} (GUARDRAILS S3, anti-scraper)
//   PUT  /modules/master/company/:id/finance-settings    → {setupValue, monthlyValueOverride} (Implantação)
//   PUT  /modules/master/company/:id/global-token-usage  → toggles credencial master
//   POST /modules/master/company/:id/manual-payment      → registrar pagamento (rota Empresarial)
//   PUT  .../manual-payment/:entryId/cancel              → cancelar lançamento
//   GET  /credits/master/company/:id                     → Carteira (saldo/lotes/extrato)
//   POST /credits/master/company/:id/grant               → conceder crédito manual
//   GET  /credits/public-catalog                          → welcomeCredits default (wizard)
//   POST /master/provisioning/tenants                    → nova empresa (fluxo Empresarial)
//   PATCH users/master/:id | reset-password | delete     → usuários
//   master-context assume → via prop do pai (banner global no layout)

import React, { useState } from "react";

import { apiFetch } from "@/lib/api";
import { enterImpersonation } from "@/lib/impersonation";
import { useTabParam } from "@/lib/use-tab-param";

import { FichaAparelhos } from "./ficha-aparelhos";
import { accountTypeLabel, accountTypeTagClass, fmtData, fmtDataHora, statusLabel, statusTagClass, type MasterCompany } from "./page.client";

type DetailUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string;
  isActive?: boolean;
  createdAt?: string | null;
};

type LedgerRow = {
  id: string;
  entryType?: string;
  entryGroup?: string;
  status?: string;
  origin?: string | null;
  competence?: string | null;
  amount?: number;
  dueDate?: string | null;
  paidAt?: string | null;
  paymentMethod?: string | null;
  referenceLabel?: string | null;
  observation?: string | null;
  metadata?: { chargeId?: string | null } | null;
  createdAt?: string | null;
};

type DeletionRefundPreview = {
  eligible?: boolean;
  amount?: number;
  remainingDays?: number;
  paidAmount?: number;
  reason?: string;
};

type AuditRow = {
  id: string;
  scope?: string;
  action?: string;
  severity?: string;
  createdAt?: string | null;
};

type CredEntry = { key?: string; label?: string; configured?: boolean };

type Detail = {
  generatedAt?: string;
  company?: {
    id?: number;
    name?: string;
    slug?: string | null;
    status?: string | null;
    // MASTER-REFAB S6 (10/07 noite): tipo explícito de conta — fonte única.
    accountType?: "credit" | "enterprise" | string | null;
    isActive?: boolean;
    primaryContactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    taxDocument?: string | null;
    paymentMethod?: string | null;
    billingProvider?: string | null;
    courtesyReason?: string | null;
    courtesyEndsAt?: string | null;
    commercialCardsMonthlyLimitOverride?: number | null;
    commercialCardsDailyLimitOverride?: number | null;
    seatCap?: number | null;
    dailyDeliveryCapOverride?: number | null;
    setupValue?: number | null;
    monthlyValueOverride?: number | null;
    users?: DetailUser[];
    // PR10072026 W1/W3 — 2 camadas: `enabled` = teto do master (compat com o
    // toggle), `companyEnabled` = camada da empresa (OOBE/Configurações),
    // `effective` = masterEnabled && companyEnabled.
    modules?: { key: string; name: string; enabled: boolean; masterEnabled?: boolean; companyEnabled?: boolean; effective?: boolean }[];
    plan?: { id?: number; name?: string | null } | null;
    whatsapp?: { usingMasterToken?: boolean; masterCredentialKey?: string | null } | null;
    mercadoPago?: { usingMasterToken?: boolean; masterCredentialKey?: string | null } | null;
    masterIntegrations?: { whatsappLibrary?: CredEntry[]; mercadoPagoLibrary?: CredEntry[] } | null;
    financeHistory?: LedgerRow[];
    auditTimeline?: AuditRow[];
  };
} | null;

// MASTER-REFAB S1/S6: sem Plano/Ciclo no wizard — a conta Empresarial é montada na ficha
// (módulos + crédito concedido + cobrança manual), não escolhida num catálogo. planKey/
// billingCycle simplesmente não são mais enviados; o backend (master-provisioning.service.ts)
// já assume o default (PADRAO/MONTHLY) quando omitidos — endpoint intacto, só paramos de
// escolher (o accountType='enterprise' desta empresa é setado direto no backend, sem input).
const PROV_VAZIO = {
  companyName: "",
  slug: "",
  taxDocument: "",
  manualAccess: false,
  adminName: "",
  adminEmail: "",
  adminPhone: "",
  adminPassword: "",
  seatCap: "",
  monthlyValueOverride: "",
  initialCredits: "",
};

type UserEditForm = { id: number; name: string; email: string; username: string; phone: string; role: string; isActive: boolean };

const EMP_VAZIO = { name: "", primaryContactName: "", contactEmail: "", contactPhone: "", taxDocument: "", paymentMethod: "", billingProvider: "" };
const PAG_VAZIO = { value: "", competence: "", paidAt: "", paymentMethod: "PIX", observation: "", settlePending: true };

// PR05082026-VER-TELA (05/08) — "Aparelhos" entra ao lado de Usuários: é a
// mesma pergunta ("quem é essa empresa por dentro?"), só que do lado do APK.
// A janela "Pulso" (frota inteira) e a "Quem está online" (que lia sessão WEB e
// por isso mentia sobre quem só vive no app) morreram nesta mesma frente.
const DETAIL_TABS = ["Usuários", "Aparelhos", "Comercial", "Financeiro", "Implantação", "Website", "Auditoria"] as const;


type WalletLot = { id: string; amount: number; remaining: number; expiresAt?: string | null; grantType?: string | null };
type WalletMovement = { id: string; kind: string; amount: number; actionKey?: string | null; sourceRef?: string | null; createdAt: string };
type WalletOverview = { enabled?: boolean; balance?: number; lots?: WalletLot[]; recent?: WalletMovement[] } | null;

const WALLET_MOVEMENT_LABEL: Record<string, string> = {
  debit: "Débito",
  refund: "Estorno",
  expire: "Expiração",
  adjust: "Ajuste",
  grant: "Concessão",
  recharge: "Recarga",
  promo: "Promoção",
};

// MASTER-REFAB S6 (10/07 noite): o VALOR gravado (courtesy_internal) não muda — semântica
// fiscal fica —, só o rótulo de UI vira "Concessão interna" (cortesia morre como palavra).
const WALLET_GRANT_TYPE_LABEL: Record<string, string> = {
  courtesy_internal: "Concessão interna",
  paid: "Pago",
  promo: "Promoção",
};

const WALLET_GRANT_VAZIO = { amount: "", grantType: "courtesy_internal" as "paid" | "courtesy_internal" | "promo", reason: "" };

// PR27072026 F1 (ROTA 3 NÍVEIS) — a matriz do plano (docs/PLANEJAMENTOS/
// PR27072026-ROTA-3-NIVEIS.md, seção "Os 3 níveis"), rótulo curto + 1 linha de
// venda por nível — texto do próprio plano, zero invenção. Aplicar chama o PUT
// que seta o preset de toggles no backend; isto aqui é só a vitrine do seletor.
type LogisticaNivel = "BASIC" | "ADVANCED" | "FULL";
const NIVEL_ORDEM: LogisticaNivel[] = ["BASIC", "ADVANCED", "FULL"];
const NIVEL_LABEL: Record<LogisticaNivel, string> = { BASIC: "Basic", ADVANCED: "Advanced", FULL: "Full" };
const NIVEL_DESCRICAO: Record<LogisticaNivel, string> = {
  BASIC: "Anota o dia inteiro e te leva até a porta.",
  ADVANCED: "O app cobra por você.",
  FULL: "iFood da sua distribuidora.",
};

// Espelha as validações do backend (website.service.ts updateCompanyConfigByMaster
// — NÃO editar o backend, só refletir aqui pra não deixar o Master submeter algo
// que o backend vai recusar de qualquer forma):
//   websiteEnabled=true       → websitePublicUrl obrigatório
//   websiteAdminEnabled=true  → websiteAdminUrl + websiteProjectId obrigatórios
//   websiteLaunchMode=admin   → exige websiteAdminEnabled=true
const WEBSITE_VAZIO = {
  websiteEnabled: false,
  websitePublicUrl: "",
  websiteAdminUrl: "",
  websiteProjectId: "",
  websiteAdminEnabled: false,
  websiteLaunchMode: "public" as "public" | "admin",
};

type WebsiteConfigPortal = {
  configured?: boolean;
  websiteEnabled?: boolean;
  websitePublicUrl?: string | null;
  websiteAdminUrl?: string | null;
  websiteProjectId?: string | null;
  websiteAdminEnabled?: boolean;
  websiteLaunchMode?: "public" | "admin";
  adminAllowed?: boolean;
  launchUrl?: string | null;
  message?: string | null;
};

function fmtBRL(v?: number | null) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// WhatsApp da lista: a situacao unificada (Meta oficial por token + conexao
// rapida QR/WebWhats + Token Master), nao so a coluna oficial crua da Meta.
function waSituacao(emp: MasterCompany): { label: string; cls: string } {
  const sit = emp.whatsappSituation;
  const st = String(sit?.status || "").toLowerCase();
  const label = sit?.statusLabel || (emp.whatsappStatus ? String(emp.whatsappStatus) : "—");
  if (st === "connected") return { label, cls: "tag teal" };
  if (st === "attention") return { label, cls: "tag warn" };
  if (st === "error") return { label, cls: "tag red" };
  return { label, cls: "tag" };
}

export function JanelaEmpresas({ companies, error, reload, assumirContexto }: {
  companies: MasterCompany[] | null;
  error: string | null;
  reload: () => Promise<void> | void;
  assumirContexto?: (companyId: number) => Promise<void> | void;
}) {
  const [selId, setSelId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  // Aba ativa do detalhe persiste na URL (?emp=…), padrão do projeto (use-tab-param).
  const [detailTab, setDetailTab] = useTabParam<(typeof DETAIL_TABS)[number]>("emp", "Usuários", DETAIL_TABS);

  // provisioning
  const [provOpen, setProvOpen] = useState(false);
  const [provStep, setProvStep] = useState(1);
  const [provForm, setProvForm] = useState(PROV_VAZIO);
  const [provBusy, setProvBusy] = useState(false);
  const [provMsg, setProvMsg] = useState<string | null>(null);
  const [provResult, setProvResult] = useState<{ companyId?: number; adminUserId?: number | null; temporaryPassword?: string | null; passwordDefined?: boolean; creditsWarning?: string | null } | null>(null);

  // tipo de conta (MASTER-REFAB S6, 10/07 noite) — toggle Crédito|Empresarial
  const [accountTypeBusy, setAccountTypeBusy] = useState(false);
  const [accountTypeMsg, setAccountTypeMsg] = useState<string | null>(null);

  // PR27072026 F1 (ROTA 3 NÍVEIS) — nível do plano de logística (Basic/Advanced/
  // Full). null = ainda não carregou (não decide grandfathering no front — quem
  // resolve ausência/sujeira é o backend, aqui só espelha o que ele mandou).
  const [nivel, setNivel] = useState<LogisticaNivel | null>(null);
  const [nivelBusy, setNivelBusy] = useState(false);
  const [nivelMsg, setNivelMsg] = useState<string | null>(null);

  // MASTER-REFAB S8 (10/07) — "chavinha" contrato empresarial: 1 gesto (tipo + módulos full +
  // valor fixo + teto num só POST). Só aparece quando a empresa ainda é conta Crédito.
  const [entContractBusy, setEntContractBusy] = useState(false);
  const [entContractMsg, setEntContractMsg] = useState<string | null>(null);
  const [entContractArm, setEntContractArm] = useState(false);
  const [entContractForm, setEntContractForm] = useState({ monthlyValue: "", dailyDeliveryCap: "" });

  // usuários
  const [userMsg, setUserMsg] = useState<string | null>(null);
  const [userBusy, setUserBusy] = useState(false);
  const [resetResult, setResetResult] = useState<{ id: number; temporaryPassword: string } | null>(null);
  const [userEdit, setUserEdit] = useState<UserEditForm | null>(null);
  const [deleteArm, setDeleteArm] = useState<number | null>(null);

  // módulos
  const [moduloBusy, setModuloBusy] = useState<string | null>(null);
  const [moduloMsg, setModuloMsg] = useState<string | null>(null);

  // perfil da empresa
  const [empOpen, setEmpOpen] = useState(false);
  const [empForm, setEmpForm] = useState(EMP_VAZIO);
  const [empBusy, setEmpBusy] = useState(false);
  const [empMsg, setEmpMsg] = useState<string | null>(null);

  // comercial (fase 2)
  const [comBusy, setComBusy] = useState<string | null>(null); // qual ação está rodando
  const [comMsg, setComMsg] = useState<string | null>(null);
  const [suspReason, setSuspReason] = useState("");
  // monthly/daily seguem no estado só pra round-trip transparente do /card-quota (o backend
  // SEMPRE reescreve os 3 campos juntos — omitir monthly/daily zeraria overrides existentes
  // que esta tela não edita mais). A UI mostra só "Assentos".
  const [quotaForm, setQuotaForm] = useState({ monthly: "", daily: "", seatCap: "" });
  const [finForm, setFinForm] = useState({ setupValue: "", parcela: "" });
  // GUARDRAILS S3 (10/07) — teto diário de leads por empresa (anti-scraper), PUT dedicado
  // (não é assento nem cota de plano). "" = herda o default global.
  const [dailyCapForm, setDailyCapForm] = useState("");

  // carteira (MASTER-REFAB S1)
  const [wallet, setWallet] = useState<WalletOverview>(null);
  const [walletGrantOpen, setWalletGrantOpen] = useState(false);
  const [walletGrantForm, setWalletGrantForm] = useState(WALLET_GRANT_VAZIO);
  const [walletGrantKey, setWalletGrantKey] = useState("");
  const [walletGrantBusy, setWalletGrantBusy] = useState(false);
  const [walletGrantMsg, setWalletGrantMsg] = useState<string | null>(null);
  const [legadoAssinaturaOpen, setLegadoAssinaturaOpen] = useState(false);

  // Website (WEBSITE-KIT Sprint 1, T2): config por empresa via
  // PATCH /website/master/company/:id/config; teste ao vivo via
  // GET /website/master/company/:id/launch (só no clique — mesmo gotcha de
  // token do portal do cliente).
  const [websiteForm, setWebsiteForm] = useState(WEBSITE_VAZIO);
  const [websiteBusy, setWebsiteBusy] = useState(false);
  const [websiteMsg, setWebsiteMsg] = useState<string | null>(null);
  const [websiteLaunchBusy, setWebsiteLaunchBusy] = useState<"public" | "admin" | null>(null);

  // financeiro (fase 2)
  const [pagOpen, setPagOpen] = useState(false);
  const [pagForm, setPagForm] = useState(PAG_VAZIO);
  const [pagBusy, setPagBusy] = useState(false);
  const [pagMsg, setPagMsg] = useState<string | null>(null);
  const [cancelArm, setCancelArm] = useState<string | null>(null);
  const [refundArm, setRefundArm] = useState<string | null>(null); // F3 — lançamento a estornar
  const [subCancelArm, setSubCancelArm] = useState(false); // cancelar assinatura recorrente (MP)
  const [delRefund, setDelRefund] = useState<DeletionRefundPreview | null>(null); // F2 — preview do reembolso da exclusão

  function carregarDetail(id: number) {
    setSelId(id);
    setDetail(null);
    setDetailError(null);
    setAccountTypeMsg(null);
    setNivel(null);
    setNivelMsg(null);
    setEntContractMsg(null);
    setEntContractArm(false);
    setEntContractForm({ monthlyValue: "", dailyDeliveryCap: "" });
    setUserMsg(null);
    setModuloMsg(null);
    setComMsg(null);
    setPagMsg(null);
    setResetResult(null);
    setDeleteArm(null);
    setCancelArm(null);
    setRefundArm(null);
    setSubCancelArm(false);
    setLegadoAssinaturaOpen(false);
    setDelRefund(null);
    setWebsiteMsg(null);
    setWebsiteForm(WEBSITE_VAZIO);
    setWallet(null);
    setWalletGrantMsg(null);
    // Carteira (bloco Financeiro): saldo/lotes/extrato desta empresa. 404 quando os créditos
    // estão desligados na env — trata como "sem carteira", não como erro.
    apiFetch<WalletOverview>(`/credits/master/company/${id}`)
      .then(res => setWallet(res))
      .catch(() => setWallet(null));
    // F2 — quanto seria reembolsado se esta empresa fosse excluída agora (mostra no confirm).
    apiFetch<{ refund?: DeletionRefundPreview }>(`/companies/master/${id}/deletion-refund-preview`)
      .then(res => setDelRefund(res?.refund || null))
      .catch(() => setDelRefund(null));
    // PR27072026 F1 — nível do plano (endereço próprio, fora do /detail). Erro
    // de leitura cai em ADVANCED na tela (mesmo grandfathering do backend) —
    // nunca mostra Basic por causa de uma falha de rede.
    apiFetch<{ nivel?: string }>(`/logistica/master/company/${id}/nivel`)
      .then(res => setNivel(res?.nivel === "BASIC" || res?.nivel === "FULL" ? res.nivel : "ADVANCED"))
      .catch(() => setNivel("ADVANCED"));
    // Website: GET .../launch?target=public NÃO gera token (mesmo gotcha do
    // portal do cliente) — seguro pra usar só como leitura de config no load.
    apiFetch<WebsiteConfigPortal>(`/website/master/company/${id}/launch?target=public`)
      .then(res => setWebsiteForm({
        websiteEnabled: Boolean(res?.websiteEnabled),
        websitePublicUrl: res?.websitePublicUrl || "",
        websiteAdminUrl: res?.websiteAdminUrl || "",
        websiteProjectId: res?.websiteProjectId || "",
        websiteAdminEnabled: Boolean(res?.websiteAdminEnabled),
        websiteLaunchMode: res?.websiteLaunchMode === "admin" ? "admin" : "public",
      }))
      .catch(() => setWebsiteForm(WEBSITE_VAZIO));
    apiFetch<Detail>(`/modules/master/company/${id}/detail`)
      .then(res => {
        setDetail(res);
        const c = res?.company;
        setQuotaForm({
          monthly: c?.commercialCardsMonthlyLimitOverride != null ? String(c.commercialCardsMonthlyLimitOverride) : "",
          daily: c?.commercialCardsDailyLimitOverride != null ? String(c.commercialCardsDailyLimitOverride) : "",
          seatCap: c?.seatCap != null ? String(c.seatCap) : "",
        });
        setDailyCapForm(c?.dailyDeliveryCapOverride != null ? String(c.dailyDeliveryCapOverride) : "");
        setFinForm({
          setupValue: c?.setupValue != null ? String(c.setupValue) : "",
          parcela: c?.monthlyValueOverride != null ? String(c.monthlyValueOverride) : "",
        });
      })
      .catch((err: unknown) => setDetailError(err instanceof Error ? err.message : "Falha ao carregar o detalhe."));
  }

  function recarregarTudo() {
    if (selId != null) carregarDetail(selId);
    return reload();
  }

  // empresa selecionada sumiu da lista (ex.: recarga) → detalhe some junto
  const selVisivel = selId != null && (!companies || companies.some(c => c.id === selId));

  async function provisionar() {
    if (provBusy) return;
    setProvBusy(true);
    setProvMsg(null);
    try {
      // planKey/billingCycle NÃO vão mais no corpo — o backend assume PADRAO/MONTHLY quando
      // omitidos (mesmo default que o wizard sempre mandou). A conta Empresarial é montada na
      // ficha depois (módulos + crédito), este POST só cria o registro + admin.
      const body: Record<string, unknown> = {
        companyName: provForm.companyName.trim(),
        manualAccess: provForm.manualAccess,
      };
      if (provForm.slug.trim()) body.slug = provForm.slug.trim();
      if (provForm.taxDocument.trim()) body.taxDocument = provForm.taxDocument.trim();
      if (provForm.adminEmail.trim()) {
        body.admin = {
          email: provForm.adminEmail.trim(),
          ...(provForm.adminName.trim() ? { name: provForm.adminName.trim() } : {}),
          ...(provForm.adminPhone.trim() ? { phone: provForm.adminPhone.trim() } : {}),
          ...(provForm.adminPassword.trim() ? { password: provForm.adminPassword.trim() } : {}),
        };
      }
      if (provForm.seatCap.trim()) body.seatCap = Math.max(0, Number(provForm.seatCap) || 0);
      if (provForm.monthlyValueOverride.trim() !== "") {
        body.monthlyValueOverride = Math.max(0, Number(String(provForm.monthlyValueOverride).replace(",", ".")) || 0);
      }
      const res = await apiFetch<{ ok?: boolean; companyId?: number; adminUserId?: number | null; temporaryPassword?: string | null }>(
        "/master/provisioning/tenants",
        { method: "POST", body: JSON.stringify(body) },
      );
      // Créditos iniciais (0 = sem concessão): a empresa já existe, então isto é uma 2ª chamada
      // best-effort — se falhar, a empresa NÃO é desfeita (já foi criada); o master conclui a
      // concessão manualmente na aba Financeiro > Carteira.
      const initialCredits = Math.trunc(Number(provForm.initialCredits) || 0);
      let creditsWarning: string | null = null;
      if (res?.companyId && initialCredits > 0) {
        try {
          await apiFetch(`/credits/master/company/${res.companyId}/grant`, {
            method: "POST",
            body: JSON.stringify({
              amount: initialCredits,
              grantType: "courtesy_internal",
              usageKey: `provisioning:${res.companyId}`,
              metadata: { reason: "Créditos iniciais — criação da empresa (wizard master)" },
            }),
          });
        } catch {
          creditsWarning = "Empresa criada, mas a concessão de créditos iniciais falhou — conceda na aba Financeiro > Carteira.";
        }
      }
      setProvResult(res ? { ...res, passwordDefined: Boolean(provForm.adminPassword.trim()), creditsWarning } : null);
      setProvForm(PROV_VAZIO);
      setProvOpen(false);
      setProvStep(1);
      await reload();
      if (res?.companyId) carregarDetail(res.companyId);
    } catch (err) {
      setProvMsg(err instanceof Error ? err.message : "Falha ao criar a empresa.");
    } finally {
      setProvBusy(false);
    }
  }

  function avancarPasso() {
    if (provStep === 1) {
      if (!provForm.companyName.trim()) { setProvMsg("Nome da empresa é obrigatório."); return; }
      const digits = provForm.taxDocument.replace(/\D/g, "");
      if (digits && digits.length !== 11 && digits.length !== 14) {
        setProvMsg("CPF deve ter 11 dígitos e CNPJ 14 dígitos."); return;
      }
    }
    if (provStep === 2 && provForm.adminEmail.trim() && !provForm.adminEmail.includes("@")) {
      setProvMsg("E-mail do admin inválido."); return;
    }
    if (provStep === 2 && provForm.adminPassword.trim() && provForm.adminPassword.trim().length < 6) {
      setProvMsg("A senha do admin deve ter ao menos 6 caracteres."); return;
    }
    setProvMsg(null);
    setProvStep(s => s + 1);
  }


  // MASTER-REFAB S6 (10/07 noite): toggle enxuto do tipo de conta — substitui o box Cortesia
  // (presente = conceder crédito na Carteira, aba Financeiro).
  async function salvarAccountType(accountType: "credit" | "enterprise") {
    if (accountTypeBusy || selId == null) return;
    setAccountTypeBusy(true);
    setAccountTypeMsg(null);
    try {
      await apiFetch(`/modules/master/company/${selId}/account-type`, {
        method: "PUT",
        body: JSON.stringify({ accountType }),
      });
      setAccountTypeMsg(`✓ Tipo de conta: ${accountTypeLabel(accountType)}.`);
      await recarregarTudo();
    } catch (err) {
      setAccountTypeMsg(err instanceof Error ? err.message : "Falha ao salvar o tipo de conta.");
    } finally {
      setAccountTypeBusy(false);
    }
  }

  // PR27072026 F1 (ROTA 3 NÍVEIS) — aplica o nível: o backend grava
  // logisticaNivel E o preset de toggles da matriz do plano NUM SÓ PUT. Preset
  // é ATALHO, não algema (decisão do dono 27/07) — os toggles individuais
  // (Financeiro, Cobrança por WhatsApp, Modo das rotas) seguem editáveis nas
  // telas de sempre depois de aplicar.
  async function salvarNivel(alvo: LogisticaNivel) {
    if (nivelBusy || selId == null || alvo === nivel) return;
    setNivelBusy(true);
    setNivelMsg(null);
    try {
      await apiFetch(`/logistica/master/company/${selId}/nivel`, {
        method: "PUT",
        body: JSON.stringify({ nivel: alvo }),
      });
      setNivel(alvo);
      setNivelMsg(`✓ Nível aplicado: ${NIVEL_LABEL[alvo]}.`);
      await recarregarTudo();
    } catch (err) {
      setNivelMsg(err instanceof Error ? err.message : "Falha ao aplicar o nível.");
    } finally {
      setNivelBusy(false);
    }
  }

  // MASTER-REFAB S8 (10/07) — "chavinha" contrato empresarial: 1 POST que liga tipo de conta +
  // TODOS os módulos + (opcional) valor fixo mensal + teto diário. Limites anti-abuso (S3)
  // continuam valendo — este botão não afrouxa nada, só junta 4 ações num gesto.
  async function ativarContratoEmpresarial() {
    if (entContractBusy || selId == null) return;
    setEntContractBusy(true);
    setEntContractMsg(null);
    try {
      const body: Record<string, number> = {};
      if (entContractForm.monthlyValue.trim() !== "") {
        body.monthlyValue = Math.max(0, Number(String(entContractForm.monthlyValue).replace(",", ".")) || 0);
      }
      if (entContractForm.dailyDeliveryCap.trim() !== "") {
        body.dailyDeliveryCap = Math.max(0, Number(entContractForm.dailyDeliveryCap) || 0);
      }
      const res = await apiFetch<{ modulesOn?: number }>(`/modules/master/company/${selId}/enterprise-contract`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setEntContractMsg(`✓ Contrato empresarial ativado — ${res?.modulesOn ?? 0} módulo(s) liberado(s) full.`);
      setEntContractArm(false);
      setEntContractForm({ monthlyValue: "", dailyDeliveryCap: "" });
      await recarregarTudo();
    } catch (err) {
      setEntContractMsg(err instanceof Error ? err.message : "Falha ao ativar o contrato empresarial.");
    } finally {
      setEntContractBusy(false);
    }
  }

  async function salvarEmpresa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (empBusy || selId == null) return;
    setEmpBusy(true);
    setEmpMsg(null);
    try {
      const body: Record<string, string> = {};
      for (const [k, v] of Object.entries(empForm)) {
        if (String(v).trim()) body[k] = String(v).trim();
      }
      await apiFetch(`/modules/master/company/${selId}/profile`, { method: "PUT", body: JSON.stringify(body) });
      setEmpOpen(false);
      await recarregarTudo();
    } catch (err) {
      setEmpMsg(err instanceof Error ? err.message : "Falha ao salvar a empresa.");
    } finally {
      setEmpBusy(false);
    }
  }

  async function setSuspensao(suspended: boolean) {
    if (comBusy || selId == null) return;
    setComBusy("susp");
    setComMsg(null);
    try {
      await apiFetch(`/modules/master/company/${selId}/suspension`, {
        method: "PUT",
        body: JSON.stringify({ suspended, ...(suspReason.trim() ? { reason: suspReason.trim() } : {}) }),
      });
      setComMsg(suspended ? "✓ Empresa suspensa." : "✓ Suspensão removida.");
      setSuspReason("");
      await recarregarTudo();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha na suspensão.");
    } finally {
      setComBusy(null);
    }
  }

  async function excluirEmpresa() {
    if (comBusy || selId == null) return;
    setComBusy("delete");
    setComMsg(null);
    try {
      await apiFetch(`/companies/master/${selId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmText: "EXCLUIR EMPRESA", reason: "Limpeza de teste (master)" }),
      });
      setSelId(null);
      setDetail(null);
      await reload();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha ao excluir a empresa.");
    } finally {
      setComBusy(null);
    }
  }

  // Assentos (teto de acessos) é o único campo editável aqui agora. monthly/daily viajam
  // JUNTO no corpo (round-trip do que já veio do backend) porque o endpoint reescreve os 3
  // campos sempre — nunca reseta um override que esta tela não edita mais.
  async function salvarQuota() {
    if (comBusy || selId == null) return;
    setComBusy("quota");
    setComMsg(null);
    try {
      const body: Record<string, number> = {};
      if (quotaForm.monthly !== "") body.monthlyCardLimit = Math.max(0, Number(quotaForm.monthly) || 0);
      if (quotaForm.daily !== "") body.dailyCardLimit = Math.max(0, Number(quotaForm.daily) || 0);
      body.seatCap = quotaForm.seatCap === "" ? 0 : Math.max(0, Number(quotaForm.seatCap) || 0);
      await apiFetch(`/modules/master/company/${selId}/card-quota`, { method: "PUT", body: JSON.stringify(body) });
      setComMsg("✓ Teto de acessos atualizado.");
      await recarregarTudo();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha ao salvar o teto de acessos.");
    } finally {
      setComBusy(null);
    }
  }

  // GUARDRAILS S3 (10/07) — teto diário de leads (anti-scraper). "" = limpa o override (herda o
  // default global); "0" = sem teto SÓ nesta empresa; N>0 = teto próprio.
  async function salvarDailyCap() {
    if (comBusy || selId == null) return;
    setComBusy("dailyCap");
    setComMsg(null);
    try {
      const body: Record<string, number | null> = {
        dailyDeliveryCapOverride: dailyCapForm.trim() === "" ? null : Math.max(0, Number(dailyCapForm) || 0),
      };
      await apiFetch(`/modules/master/company/${selId}/delivery-cap`, { method: "PUT", body: JSON.stringify(body) });
      setComMsg("✓ Teto diário de leads atualizado.");
      await recarregarTudo();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha ao salvar o teto diário de leads.");
    } finally {
      setComBusy(null);
    }
  }

  // Só Implantação (setup + parcela acordada) — desconto/meses grátis/ciclo morreram desta
  // tela junto com "Condições de cobrança". Campos omitidos no corpo NÃO são zerados pelo
  // backend (fallback pro valor atual da empresa quando `undefined`).
  async function salvarFinanceSettings() {
    if (comBusy || selId == null) return;
    setComBusy("fin");
    setComMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (finForm.setupValue !== "") body.setupValue = Math.max(0, Number(finForm.setupValue) || 0);
      if (finForm.parcela !== "") body.monthlyValueOverride = Math.max(0, Number(finForm.parcela) || 0);
      await apiFetch(`/modules/master/company/${selId}/finance-settings`, { method: "PUT", body: JSON.stringify(body) });
      setComMsg("✓ Implantação atualizada.");
      await recarregarTudo();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha ao salvar a implantação.");
    } finally {
      setComBusy(null);
    }
  }

  async function salvarTokens(patch: Record<string, unknown>) {
    if (comBusy || selId == null) return;
    setComBusy("token");
    setComMsg(null);
    try {
      await apiFetch(`/modules/master/company/${selId}/global-token-usage`, { method: "PUT", body: JSON.stringify(patch) });
      setComMsg("✓ Uso de credencial master atualizado.");
      await recarregarTudo();
    } catch (err) {
      setComMsg(err instanceof Error ? err.message : "Falha ao atualizar credenciais.");
    } finally {
      setComBusy(null);
    }
  }

  async function registrarPagamento(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pagBusy || selId == null) return;
    setPagBusy(true);
    setPagMsg(null);
    try {
      const body: Record<string, unknown> = {
        value: Number(String(pagForm.value).replace(",", ".")) || 0,
        settlePending: pagForm.settlePending,
      };
      if (pagForm.competence.trim()) body.competence = pagForm.competence.trim();
      if (pagForm.paidAt) body.paidAt = pagForm.paidAt;
      if (pagForm.paymentMethod) body.paymentMethod = pagForm.paymentMethod;
      if (pagForm.observation.trim()) body.observation = pagForm.observation.trim();
      await apiFetch(`/modules/master/company/${selId}/manual-payment`, { method: "POST", body: JSON.stringify(body) });
      setPagOpen(false);
      setPagForm(PAG_VAZIO);
      setPagMsg("✓ Pagamento manual registrado.");
      await recarregarTudo();
    } catch (err) {
      setPagMsg(err instanceof Error ? err.message : "Falha ao registrar o pagamento.");
    } finally {
      setPagBusy(false);
    }
  }

  async function cancelarLancamento(entryId: string) {
    if (pagBusy || selId == null) return;
    setPagBusy(true);
    setPagMsg(null);
    try {
      await apiFetch(`/modules/master/company/${selId}/manual-payment/${encodeURIComponent(entryId)}/cancel`, {
        method: "PUT",
        body: JSON.stringify({}),
      });
      setPagMsg("✓ Lançamento cancelado.");
      setCancelArm(null);
      await recarregarTudo();
    } catch (err) {
      setPagMsg(err instanceof Error ? err.message : "Falha ao cancelar o lançamento.");
    } finally {
      setPagBusy(false);
    }
  }

  // Cancela a assinatura recorrente (MP) da empresa: para de cobrar o cartão nas
  // próximas faturas. Mantém o acesso até o fim do período já pago. Ação live → confirma.
  async function cancelarAssinatura() {
    if (pagBusy || selId == null) return;
    setPagBusy(true);
    setPagMsg(null);
    try {
      await apiFetch(`/financeiro/master/company/${selId}/subscription/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPagMsg("✓ Assinatura cancelada no Mercado Pago — o cartão não será mais cobrado.");
      setSubCancelArm(false);
      await recarregarTudo();
    } catch (err) {
      setPagMsg(err instanceof Error ? err.message : "Falha ao cancelar a assinatura.");
    } finally {
      setPagBusy(false);
    }
  }

  // F3 — estorno total da cobrança pelo master. O backend devolve o dinheiro no MP e
  // marca o lançamento como estornado (REFUNDED). Dinheiro real → exige confirmação.
  async function reembolsarLancamento(entryId: string, chargeId: string) {
    if (pagBusy || selId == null) return;
    setPagBusy(true);
    setPagMsg(null);
    try {
      await apiFetch(`/financeiro/master/company/${selId}/charge/${encodeURIComponent(chargeId)}/refund`, {
        method: "POST",
        body: JSON.stringify({ reason: "Estorno pelo master" }),
      });
      setPagMsg("✓ Estorno solicitado ao Mercado Pago.");
      setRefundArm(null);
      await recarregarTudo();
    } catch (err) {
      setPagMsg(err instanceof Error ? err.message : "Falha ao estornar a cobrança.");
    } finally {
      setPagBusy(false);
    }
  }

  // Carteira — conceder crédito manual (bloco Financeiro). usageKey estável gerada na
  // ABERTURA do modal (não a cada clique) — double-click não dobra o crédito de graça
  // (mesma trava de idempotência do backend, comentada em credits.service.ts).
  async function concederCredito(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (walletGrantBusy || selId == null) return;
    const amount = Math.trunc(Number(walletGrantForm.amount) || 0);
    if (amount <= 0) { setWalletGrantMsg("Informe uma quantidade de créditos positiva."); return; }
    setWalletGrantBusy(true);
    setWalletGrantMsg(null);
    try {
      await apiFetch(`/credits/master/company/${selId}/grant`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          grantType: walletGrantForm.grantType,
          usageKey: walletGrantKey,
          ...(walletGrantForm.reason.trim() ? { metadata: { reason: walletGrantForm.reason.trim() } } : {}),
        }),
      });
      setWalletGrantOpen(false);
      setWalletGrantForm(WALLET_GRANT_VAZIO);
      await recarregarTudo();
    } catch (err) {
      setWalletGrantMsg(err instanceof Error ? err.message : "Falha ao conceder o crédito.");
    } finally {
      setWalletGrantBusy(false);
    }
  }

  // Validações espelham o backend (website.service.ts) ANTES de submeter — o
  // backend segue sendo a fonte da verdade (rejeita de novo se algo escapar
  // daqui), isto só evita round-trip com erro óbvio.
  function validarWebsiteForm(f: typeof WEBSITE_VAZIO): string | null {
    if (f.websiteEnabled && !f.websitePublicUrl.trim()) {
      return "URL pública é obrigatória quando o website está habilitado.";
    }
    if (f.websiteAdminEnabled && !f.websiteAdminUrl.trim()) {
      return "URL do admin é obrigatória quando o admin do website está habilitado.";
    }
    if (f.websiteAdminEnabled && !f.websiteProjectId.trim()) {
      return "Project ID é obrigatório quando o admin do website está habilitado.";
    }
    if (f.websiteLaunchMode === "admin" && !f.websiteAdminEnabled) {
      return "Modo de abertura \"admin\" exige o admin do website habilitado.";
    }
    return null;
  }

  async function salvarWebsite() {
    if (websiteBusy || selId == null) return;
    const invalido = validarWebsiteForm(websiteForm);
    if (invalido) { setWebsiteMsg(invalido); return; }
    setWebsiteBusy(true);
    setWebsiteMsg(null);
    try {
      await apiFetch(`/website/master/company/${selId}/config`, {
        method: "PATCH",
        body: JSON.stringify({
          websiteEnabled: websiteForm.websiteEnabled,
          websitePublicUrl: websiteForm.websitePublicUrl.trim() || undefined,
          websiteAdminUrl: websiteForm.websiteAdminUrl.trim() || undefined,
          websiteProjectId: websiteForm.websiteProjectId.trim() || undefined,
          websiteAdminEnabled: websiteForm.websiteAdminEnabled,
          websiteLaunchMode: websiteForm.websiteLaunchMode,
        }),
      });
      setWebsiteMsg("✓ Configuração do website salva.");
      await recarregarTudo();
    } catch (err) {
      setWebsiteMsg(err instanceof Error ? err.message : "Falha ao salvar a configuração do website.");
    } finally {
      setWebsiteBusy(false);
    }
  }

  // Teste ao vivo: SÓ no clique (nunca na carga da aba) — target=admin gera um
  // entry token de 90s de uso único a cada chamada (mesmo gotcha do portal do
  // cliente). O launchUrl nunca é guardado em estado para reabrir depois.
  async function abrirWebsiteLaunch(target: "public" | "admin") {
    if (websiteLaunchBusy || selId == null) return;
    setWebsiteLaunchBusy(target);
    setWebsiteMsg(null);
    try {
      const res = await apiFetch<WebsiteConfigPortal>(`/website/master/company/${selId}/launch?target=${target}`);
      if (res?.launchUrl) {
        window.open(res.launchUrl, "_blank", "noopener,noreferrer");
      } else {
        setWebsiteMsg(res?.message || `Não foi possível abrir o ${target === "admin" ? "admin" : "site público"}.`);
      }
    } catch (err) {
      setWebsiteMsg(err instanceof Error ? err.message : `Falha ao abrir o ${target === "admin" ? "admin" : "site público"}.`);
    } finally {
      setWebsiteLaunchBusy(null);
    }
  }

  async function resetSenha(u: DetailUser) {
    if (userBusy) return;
    setUserBusy(true);
    setUserMsg(null);
    setResetResult(null);
    try {
      const res = await apiFetch<{ ok?: boolean; id: number; temporaryPassword: string }>(
        `/users/master/${u.id}/reset-password`,
        { method: "PATCH", body: JSON.stringify({}) },
      );
      setResetResult({ id: u.id, temporaryPassword: res?.temporaryPassword || "" });
    } catch (err) {
      setUserMsg(err instanceof Error ? err.message : "Falha ao resetar a senha.");
    } finally {
      setUserBusy(false);
    }
  }

  // MASTER "ENTRAR COMO": vira o usuário-alvo. Pede o token de impersonação, guarda
  // o token do master (pro banner "Sair") e recarrega o app já como ele — cai
  // exatamente na casa dele (next do backend). Funciona pra QUALQUER usuário.
  async function entrarComo(u: DetailUser) {
    if (userBusy) return;
    setUserBusy(true);
    setUserMsg(null);
    try {
      const res = await apiFetch<{ access_token?: string; next?: string }>(
        "/auth/impersonate",
        { method: "POST", body: JSON.stringify({ userId: u.id }) },
      );
      if (!res?.access_token) throw new Error("Não veio o token de acesso.");
      enterImpersonation(res.access_token);
      // Navegação dura de propósito: recarrega o app inteiro já com a identidade do
      // alvo (limpa o cache do /profile/current-user e monta menu/telas com o papel
      // dele). Não zera userBusy no sucesso — a página está saindo.
      window.location.assign(res.next || "/dashboard");
    } catch (err) {
      setUserMsg(err instanceof Error ? err.message : "Falha ao entrar como este usuário.");
      setUserBusy(false);
    }
  }

  async function salvarUsuario(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (userBusy || !userEdit) return;
    setUserBusy(true);
    setUserMsg(null);
    try {
      await apiFetch(`/users/master/${userEdit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: userEdit.name,
          email: userEdit.email,
          username: userEdit.username,
          phone: userEdit.phone,
          role: userEdit.role,
          isActive: userEdit.isActive,
        }),
      });
      setUserEdit(null);
      setUserMsg("✓ Usuário atualizado.");
      await recarregarTudo();
    } catch (err) {
      setUserMsg(err instanceof Error ? err.message : "Falha ao salvar o usuário.");
    } finally {
      setUserBusy(false);
    }
  }

  async function excluirUsuario(id: number) {
    if (userBusy) return;
    setUserBusy(true);
    setUserMsg(null);
    try {
      await apiFetch(`/users/master/${id}/delete`, { method: "PATCH", body: JSON.stringify({}) });
      setDeleteArm(null);
      setUserMsg("✓ Usuário removido.");
      await recarregarTudo();
    } catch (err) {
      setUserMsg(err instanceof Error ? err.message : "Falha ao remover o usuário.");
    } finally {
      setUserBusy(false);
    }
  }

  // Confirma o e-mail na mão (suporte). Resolve o login travado no localhost, onde o
  // envio de e-mail é off e o cadastro não recebe o link de confirmação.
  async function confirmarEmail(u: DetailUser) {
    if (userBusy) return;
    setUserBusy(true);
    setUserMsg(null);
    try {
      const res = await apiFetch<{ ok?: boolean; alreadyConfirmed?: boolean }>(
        `/users/master/${u.id}/confirm-email`,
        { method: "PATCH", body: JSON.stringify({}) },
      );
      setUserMsg(res?.alreadyConfirmed ? "✓ E-mail já estava confirmado." : "✓ E-mail confirmado — já pode logar.");
      await recarregarTudo();
    } catch (err) {
      setUserMsg(err instanceof Error ? err.message : "Falha ao confirmar o e-mail.");
    } finally {
      setUserBusy(false);
    }
  }

  async function alternarModulo(key: string, enabled: boolean) {
    if (moduloBusy || selId == null) return;
    const enabledAntes = detail?.company?.modules?.find(m => m.key === key)?.enabled;
    setModuloBusy(key);
    setModuloMsg(null);
    setDetail(prev => prev?.company ? {
      ...prev,
      company: {
        ...prev.company,
        modules: (prev.company.modules || []).map(m => m.key === key ? { ...m, enabled } : m),
      },
    } : prev);
    try {
      await apiFetch(`/modules/master/company/${selId}`, {
        method: "PUT",
        body: JSON.stringify({ moduleKey: key, enabled }),
      });
      await reload();
    } catch (err) {
      if (enabledAntes != null) {
        setDetail(prev => prev?.company ? {
          ...prev,
          company: {
            ...prev.company,
            modules: (prev.company.modules || []).map(m => m.key === key ? { ...m, enabled: enabledAntes } : m),
          },
        } : prev);
      }
      setModuloMsg(err instanceof Error ? err.message : "Falha ao alterar o módulo.");
    } finally {
      setModuloBusy(null);
    }
  }

  const lista = companies || [];
  const totais = {
    total: lista.length,
    ativas: lista.filter(c => c.isActive).length,
    empresariais: lista.filter(c => (c.accountType || "credit") === "enterprise").length,
  };
  const c = detail?.company;
  const accountType = (c?.accountType || "credit") as "credit" | "enterprise";
  const suspensa = String(c?.status || "").toLowerCase() === "suspended";
  const ledger = c?.financeHistory || [];
  const auditoria = c?.auditTimeline || [];
  const credsWa = c?.masterIntegrations?.whatsappLibrary || [];
  const credsMp = c?.masterIntegrations?.mercadoPagoLibrary || [];

  return (
    <React.Fragment>
      {error && <div style={{ fontSize: "var(--fz-l3)", fontWeight: 600, color: "var(--hbx-danger)" }}>{error}</div>}

      {provResult && (
        <section className="panel" style={{ borderColor: "var(--hbx-brand)" }}>
          <div style={{ padding: 16, display: "grid", gap: 6 }}>
            <strong style={{ fontSize: "var(--fz-l1)" }}>✓ Empresa criada (#{provResult.companyId})</strong>
            {provResult.temporaryPassword ? (
              <span style={{ fontSize: "var(--fz-l3)", lineHeight: 1.5 }}>
                Senha temporária do admin: <b style={{ fontFamily: "var(--font-mono)" }}>{provResult.temporaryPassword}</b>
                {" "}— anote agora, ela não aparece de novo (o admin troca no 1º login).
              </span>
            ) : provResult.passwordDefined && provResult.adminUserId ? (
              <span style={{ fontSize: "var(--fz-l3)", lineHeight: 1.5 }}>
                Admin criado com a senha que você definiu — já pode entrar com ela (sem troca forçada).
              </span>
            ) : (
              <span style={{ fontSize: "var(--fz-m1)", color: "var(--text-muted)" }}>Sem usuário admin inicial (criado sem senha ou não informado).</span>
            )}
            {provResult.creditsWarning && (
              <span style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{provResult.creditsWarning}</span>
            )}
            {!provResult.temporaryPassword && provResult.companyId != null && (
              <button className="btn-teal" style={{ width: "fit-content", minHeight: 28, fontSize: "var(--hbx-font-min)" }}
                onClick={() => {
                  setDetailTab("Usuários");
                  document.getElementById("detalhe-empresa")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}>
                Criar usuário admin agora
              </button>
            )}
            <button className="btn-ghost" style={{ width: "fit-content", minHeight: 28, fontSize: "var(--hbx-font-min)" }} onClick={() => setProvResult(null)}>Fechar</button>
          </div>
        </section>
      )}

      <div className="kpis">
        {[
          { label: "Empresas", value: companies ? String(totais.total) : "—" },
          { label: "Com acesso ativo", value: companies ? String(totais.ativas) : "—" },
          { label: "Empresariais", value: companies ? String(totais.empresariais) : "—" },
        ].map(k => (
          <div className="kpi" key={k.label}>
            <span className="kpi-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M17 19c0-2.8-2.2-5-5-5s-5 2.2-5 5M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /></svg></span>
            <div>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Empresas clientes</h2>
          <div className="meta">
            <button className="btn-teal" onClick={() => {
              setProvOpen(true);
              setProvMsg(null);
              setProvStep(1);
              setProvForm(PROV_VAZIO);
              // Pré-preenche "créditos iniciais" com o lote de boas-vindas padrão
              // (CreditGlobalConfig.welcomeCredits) — rota pública, sem custo de leitura.
              apiFetch<{ enabled?: boolean; welcomeCredits?: number }>("/credits/public-catalog")
                .then(res => setProvForm(f => ({ ...f, initialCredits: res?.enabled ? String(res.welcomeCredits ?? 0) : "0" })))
                .catch(() => {});
            }}>+ Nova empresa</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Status</th>
                <th>Cobrança</th>
                <th>Créditos</th>
                <th>Usuários</th>
                <th>Módulos ON</th>
                <th>WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {!companies && (
                <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Carregando…</td></tr>
              )}
              {companies && lista.length === 0 && (
                <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Nenhuma empresa cliente ainda — crie a primeira em “Nova empresa”.</td></tr>
              )}
              {lista.map(emp => (
                <tr key={emp.id} className={emp.id === selId ? "sel" : ""} onClick={() => carregarDetail(emp.id)}>
                  <td>
                    <div className="co">
                      <strong>{emp.name}</strong>
                      <span className="sub2">#{emp.id}{emp.slug ? ` · ${emp.slug}` : ""}</span>
                    </div>
                  </td>
                  <td>
                    <span className={statusTagClass(emp.status, emp.isActive, emp.accountType)}>{statusLabel(emp.status, emp.accountType)}</span>
                    <span className={accountTypeTagClass(emp.accountType)} style={{ marginLeft: 4, fontSize: "var(--hbx-font-min)" }}>
                      {accountTypeLabel(emp.accountType)}
                    </span>
                  </td>
                  <td>{emp.paymentMethod || emp.billingProvider || "—"}</td>
                  <td>
                    {emp.creditsBalance == null
                      ? "—"
                      : emp.creditsBalance === 0
                        ? <span className="tag warn">sem saldo</span>
                        : String(emp.creditsBalance)}
                  </td>
                  <td>{emp.users?.length ?? 0}</td>
                  <td>{(emp.modules || []).filter(m => m.enabled).length}</td>
                  <td>{(() => { const w = waSituacao(emp); return <span className={w.cls}>{w.label}</span>; })()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selVisivel && (
        <div className="hbx-veil master-company-detail-veil" onClick={e => { if (e.target === e.currentTarget) setSelId(null); }}>
          <div className="hbx-modal master-company-detail-modal" role="dialog" aria-modal="true" aria-labelledby="master-company-detail-title">
            <header className="master-company-detail-head">
              <div className="master-company-detail-title">
                <span>Empresa cliente</span>
                <h2 id="master-company-detail-title">{c?.name || (selId != null ? `Empresa #${selId}` : "Detalhe da empresa")}</h2>
              </div>
              <div className="master-company-detail-actions">
                {c && <span className={statusTagClass(c.status, c.isActive, c.accountType)}>{statusLabel(c.status, c.accountType)}</span>}
                {c && <span className={accountTypeTagClass(c.accountType)}>{accountTypeLabel(c.accountType)}</span>}
                <button type="button" className="btn-ghost master-company-detail-close" onClick={() => setSelId(null)}>
                  Fechar
                </button>
              </div>
            </header>
            <div className="master-company-detail-body">
              {detailError && <div style={{ fontSize: "var(--fz-l3)", fontWeight: 600, color: "var(--hbx-danger)" }}>{detailError}</div>}
              {!detail && !detailError && <div style={{ fontSize: "var(--fz-l3)", color: "var(--text-muted)" }}>Carregando detalhe…</div>}
              {c && (
                <div id="detalhe-empresa" className="master-company-detail-grid">
              <div style={{ display: "grid", gap: 14 }}>
                <section className="panel">
                  <div className="panel-head">
                    <h2>{c.name}</h2>
                    <div className="meta">
                      <span className={statusTagClass(c.status, c.isActive, c.accountType)}>{statusLabel(c.status, c.accountType)}</span>
                      <span className={accountTypeTagClass(c.accountType)}>{accountTypeLabel(c.accountType)}</span>
                      <button className="btn-ghost" style={{ minHeight: 28, fontSize: "var(--hbx-font-min)" }}
                        onClick={() => {
                          setEmpForm({
                            name: c.name || "",
                            primaryContactName: c.primaryContactName || "",
                            contactEmail: c.contactEmail || "",
                            contactPhone: c.contactPhone || "",
                            taxDocument: c.taxDocument || "",
                            paymentMethod: c.paymentMethod || "",
                            billingProvider: c.billingProvider || "",
                          });
                          setEmpMsg(null);
                          setEmpOpen(true);
                        }}>Editar</button>
                    </div>
                  </div>
                  <div style={{ padding: "12px 16px 16px", display: "grid", gap: 8, fontSize: "var(--fz-l3)" }}>
                    {[
                      ["Contato", c.primaryContactName],
                      ["E-mail", c.contactEmail],
                      ["Telefone", c.contactPhone],
                      ["Documento", c.taxDocument],
                      ["Tipo", c.accountType === "enterprise" ? "Empresarial (montada pelo master)" : "Crédito (self-service)"],
                      ["Slug", c.slug],
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ color: "var(--text-muted)" }}>{label}</span>
                        <span style={{ fontWeight: 600, textAlign: "right" }}>{value || "—"}</span>
                      </div>
                    ))}
                    {assumirContexto && c.id != null && (
                      <button className="btn-ghost" style={{ marginTop: 4, width: "fit-content", minHeight: 30, fontSize: "var(--hbx-font-min)" }}
                        onClick={() => assumirContexto(Number(c.id))}>
                        Assumir contexto desta empresa
                      </button>
                    )}
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-head"><h2>Módulos</h2></div>
                  <div style={{ padding: "10px 16px 14px", display: "grid", gap: 8 }}>
                    {moduloMsg && <div style={{ fontSize: "var(--fz-m2)", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{moduloMsg}</div>}
                    {(c.modules || []).length === 0 && <span style={{ fontSize: "var(--fz-m1)", color: "var(--text-muted)" }}>Sem módulos atribuíveis.</span>}
                    {(c.modules || []).map(m => (
                      <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fz-l3)" }}>
                        <span style={{ fontWeight: 600 }}>{m.name}</span>
                        {/* PR10072026 W3 — estado da empresa quando diverge do teto:
                            teto ON (enabled) + camada empresa OFF = a empresa desligou
                            em Configurações/OOBE (o toggle ao lado segue sendo o teto). */}
                        {m.enabled && m.companyEnabled === false && (
                          <span className="tag warn" style={{ fontSize: "var(--hbx-font-min)" }}>empresa desligou</span>
                        )}
                        <button type="button" className="btn-ghost" disabled={moduloBusy === m.key}
                          style={{ marginLeft: "auto", minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 10px", ...(m.enabled ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)" } : {}) }}
                          onClick={() => alternarModulo(m.key, !m.enabled)}>
                          {moduloBusy === m.key ? "…" : m.enabled ? "ON" : "OFF"}
                        </button>
                      </div>
                    ))}
                    <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>Liga/desliga módulo desta empresa. O pagamento continua barrando o acesso no app.</span>
                  </div>
                </section>
              </div>

              <section className="panel">
                <div className="tabs">
                  {DETAIL_TABS.map(t => (
                    <button key={t} className={"tab" + (detailTab === t ? " active" : "")} onClick={() => setDetailTab(t)}
                      style={detailTab === t ? { color: "var(--hbx-brand-strong)", borderBottomColor: "var(--hbx-brand)" } : {}}>
                      {t}{t === "Usuários" ? <span className="n">{(c.users || []).length}</span> : null}{t === "Financeiro" ? <span className="n">{ledger.length}</span> : null}
                    </button>
                  ))}
                </div>

                {detailTab === "Usuários" && (
                  <React.Fragment>
                    {userMsg && (
                      <div style={{ padding: "10px 16px 0", fontSize: "var(--fz-m1)", fontWeight: 700, color: userMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{userMsg}</div>
                    )}
                    {resetResult && (
                      <div style={{ margin: "10px 16px 0", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--hbx-brand)", fontSize: "var(--fz-l3)", lineHeight: 1.5 }}>
                        ✓ Senha resetada (usuário #{resetResult.id}). Senha temporária:{" "}
                        <b style={{ fontFamily: "var(--font-mono)" }}>{resetResult.temporaryPassword}</b> — anote agora; o usuário troca no primeiro login.
                      </div>
                    )}
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead>
                          <tr><th>Usuário</th><th>Papel</th><th>Status</th><th>Criado</th><th>Ações</th></tr>
                        </thead>
                        <tbody>
                          {(c.users || []).length === 0 && (
                            <tr><td colSpan={5} style={{ color: "var(--text-muted)" }}>Sem usuários.</td></tr>
                          )}
                          {(c.users || []).map(u => (
                            <tr key={u.id} style={{ cursor: "default" }}>
                              <td>
                                <div className="co">
                                  <strong>{u.name || u.username || "—"}</strong>
                                  <span className="sub2">{u.email || "—"}</span>
                                </div>
                              </td>
                              <td>{String(u.role || "").toUpperCase() === "ADMIN" ? "Admin" : "Vendedor"}</td>
                              <td><span className={u.isActive ? "tag teal" : "tag red"}>{u.isActive ? "Ativo" : "Inativo"}</span></td>
                              <td>{fmtDataHora(u.createdAt)}</td>
                              <td>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  <button className="btn-teal" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 8px" }} disabled={userBusy}
                                    onClick={() => entrarComo(u)}>Entrar como</button>
                                  <button className="btn-ghost" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 8px" }} disabled={userBusy}
                                    onClick={() => resetSenha(u)}>Reset senha</button>
                                  <button className="btn-ghost" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 8px" }} disabled={userBusy}
                                    onClick={() => { setUserEdit({ id: u.id, name: u.name || "", email: u.email || "", username: u.username || "", phone: "", role: String(u.role || "USER").toUpperCase(), isActive: u.isActive !== false }); setUserMsg(null); }}>Editar</button>
                                  {deleteArm === u.id ? (
                                    <button className="btn-ghost btn-danger" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 8px" }} disabled={userBusy}
                                      onClick={() => excluirUsuario(u.id)}>Confirmar exclusão</button>
                                  ) : (
                                    <button className="btn-ghost btn-danger" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 8px" }} disabled={userBusy}
                                      onClick={() => setDeleteArm(u.id)}>Excluir</button>
                                  )}
                                  <button className="btn-ghost" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", padding: "0 8px" }} disabled={userBusy}
                                    onClick={() => confirmarEmail(u)}>Confirmar e-mail</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </React.Fragment>
                )}

                {/* PR05082026-VER-TELA — o painel do cliente do lado do APK.
                    Monta só quando a aba abre (lazy, item 5 do plano): a lista
                    de aparelhos e a trilha nunca rodam em segundo plano. */}
                {detailTab === "Aparelhos" && c.id != null && <FichaAparelhos companyId={Number(c.id)} />}

                {detailTab === "Comercial" && (
                  <div style={{ padding: "12px 16px 16px", display: "grid", gap: 14 }}>
                    {comMsg && (
                      <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, lineHeight: 1.5, color: comMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{comMsg}</div>
                    )}

                    <div style={{ display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: "var(--fz-l2)" }}>Suspensão</strong>
                      <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>{suspensa ? "Empresa SUSPENSA — sem acesso." : "Empresa não está suspensa."}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 4, flex: 1, minWidth: 180 }}>
                          <label style={{ fontSize: "var(--hbx-font-min)", fontWeight: 700, color: "var(--text-muted)" }}>Motivo</label>
                          <input className="field-dark" maxLength={200} value={suspReason} onChange={e => setSuspReason(e.target.value)} />
                        </div>
                        {suspensa ? (
                          <button className="btn-teal" disabled={comBusy != null} onClick={() => setSuspensao(false)}>
                            {comBusy === "susp" ? "…" : "Remover suspensão"}
                          </button>
                        ) : (
                          <button className="btn-ghost btn-danger" disabled={comBusy != null}
                            onClick={() => setSuspensao(true)}>
                            {comBusy === "susp" ? "…" : "Suspender empresa"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 12, display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: "var(--fz-l2)" }}>Tipo de conta</strong>
                      <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>
                        Crédito = self-service, ativa por default (teto real é o saldo). Empresarial = exceção montada aqui (módulos/crédito/preço manuais).
                      </span>
                      {accountTypeMsg && (
                        <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: accountTypeMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{accountTypeMsg}</div>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                        <select className="field-dark" style={{ minHeight: 32, fontSize: "var(--fz-m2)", width: 160 }}
                          value={accountType} disabled={accountTypeBusy}
                          onChange={e => salvarAccountType(e.target.value as "credit" | "enterprise")}>
                          <option value="credit">Crédito</option>
                          <option value="enterprise">Empresarial</option>
                        </select>
                        {accountTypeBusy && <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>Salvando…</span>}
                      </div>
                    </div>

                    {/* PR27072026 F1 (ROTA 3 NÍVEIS) — seletor Basic/Advanced/Full. Aplicar
                        seta o preset de toggles da matriz do plano num PUT só (atalho, não
                        algema): o Financeiro, a Cobrança por WhatsApp e o Modo das rotas
                        seguem editáveis um a um nas telas de sempre depois. className
                        ="ctx-section"/"hint"/"ctx-msg"/"plano-nivel-*" (kit.css) — zero
                        style visual inline novo (5 Leis). */}
                    <div className="ctx-section">
                      <strong style={{ fontSize: "var(--fz-l2)" }}>Nível do plano de logística</strong>
                      {nivelMsg && <div className={`ctx-msg ${nivelMsg.startsWith("✓") ? "ok" : "err"}`}>{nivelMsg}</div>}
                      <div className="plano-nivel-grid">
                        {NIVEL_ORDEM.map(n => (
                          <button key={n} type="button"
                            className={`plano-nivel-card${nivel === n ? " is-selected" : ""}`}
                            disabled={nivelBusy || nivel == null}
                            onClick={() => salvarNivel(n)}>
                            <span className="t">{NIVEL_LABEL[n]}</span>
                            <span className="d">{NIVEL_DESCRICAO[n]}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* MASTER-REFAB S8 (10/07) — chavinha: 1 gesto liga tipo + módulos full +
                        valor fixo + teto diário. Some quando já é Empresarial (os campos de
                        edição contínua são os que já existem: Implantação > Parcela e Teto de
                        acessos > Teto diário de leads, mais acima/abaixo nesta mesma aba).
                        className="ctx-section"/"hint"/"ctx-msg" (kit.css) — zero style visual
                        inline novo (5 Leis, catraca do check-pele). */}
                    <div className="ctx-section">
                      <strong style={{ fontSize: "var(--fz-l2)" }}>Contrato empresarial</strong>
                      {accountType === "credit" ? (
                        <>
                          <span className="hint">
                            1 gesto: vira conta Empresarial, libera TODOS os módulos e (opcional) grava o valor fixo mensal e o teto diário combinados com o cliente.
                          </span>
                          {entContractMsg && (
                            <div className={`ctx-msg ${entContractMsg.startsWith("✓") ? "ok" : "err"}`}>{entContractMsg}</div>
                          )}
                          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                            <div style={{ display: "grid", gap: 4 }}>
                              <label className="field-label">Valor fixo mensal (R$)</label>
                              <input className="field-dark" type="number" min={0} style={{ width: 130 }} placeholder="opcional"
                                disabled={entContractBusy}
                                value={entContractForm.monthlyValue} onChange={e => setEntContractForm(f => ({ ...f, monthlyValue: e.target.value }))} />
                            </div>
                            <div style={{ display: "grid", gap: 4 }}>
                              <label className="field-label">Teto diário de leads</label>
                              <input className="field-dark" type="number" min={0} style={{ width: 130 }} placeholder="500 (padrão)"
                                disabled={entContractBusy}
                                value={entContractForm.dailyDeliveryCap} onChange={e => setEntContractForm(f => ({ ...f, dailyDeliveryCap: e.target.value }))} />
                            </div>
                          </div>
                          {entContractArm ? (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "var(--hbx-font-min)", fontWeight: 700 }}>Confirma ativar contrato empresarial?</span>
                              <button className="btn-teal" disabled={entContractBusy} onClick={ativarContratoEmpresarial}>
                                {entContractBusy ? "Ativando…" : "Confirmar"}
                              </button>
                              <button className="btn-ghost" disabled={entContractBusy} onClick={() => setEntContractArm(false)}>Cancelar</button>
                            </div>
                          ) : (
                            <button className="btn-teal" style={{ maxWidth: 220 }} onClick={() => setEntContractArm(true)}>
                              Ativar contrato empresarial
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="hint">
                          Ativo — módulos liberados full. Valor fixo mensal e teto diário ficam editáveis em Implantação e em Teto de acessos, mais abaixo. Limites anti-abuso continuam valendo.
                        </span>
                      )}
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 12, display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: "var(--fz-l2)" }}>Excluir empresa</strong>
                      <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>
                        Apaga a empresa e TODOS os dados (usuários, leads, mensagens) permanentemente. Sem volta. Um clique exclui.
                      </span>
                      {delRefund?.eligible && (delRefund.amount || 0) > 0 && (
                        <span className="tag warn" style={{ fontSize: "var(--hbx-font-min)", alignSelf: "flex-start" }}>
                          Excluir vai reembolsar {fmtBRL(delRefund.amount)} ao cliente
                          {delRefund.remainingDays ? ` (${delRefund.remainingDays} dia(s) restantes do período pago)` : ""}.
                        </span>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                        <button className="btn-ghost btn-danger"
                          disabled={comBusy != null} onClick={() => excluirEmpresa()}>
                          {comBusy === "delete" ? "Excluindo…" : "Excluir empresa"}
                        </button>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 12, display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: "var(--fz-l2)" }}>Teto de acessos (assentos)</strong>
                      <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>Teto RÍGIDO de acessos (vazio = sem teto). Bloqueia criar acesso além do número.</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <label className="field-label">Assentos (teto)</label>
                          <input className="field-dark" type="number" min={0} style={{ width: 110 }} placeholder="sem teto"
                            value={quotaForm.seatCap} onChange={e => setQuotaForm(f => ({ ...f, seatCap: e.target.value }))} />
                        </div>
                        <button className="btn-ghost" disabled={comBusy != null} onClick={salvarQuota}>
                          {comBusy === "quota" ? "Salvando…" : "Salvar assentos"}
                        </button>
                      </div>
                      {/* GUARDRAILS S3 (10/07) — teto diário de leads (anti-scraper); mesmo bloco de
                          limites, PUT dedicado (não é assento). */}
                      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <label className="field-label">Teto diário de leads</label>
                          <input className="field-dark" type="number" min={0} style={{ width: 110 }} placeholder="padrão global (500)"
                            value={dailyCapForm} onChange={e => setDailyCapForm(e.target.value)} />
                        </div>
                        <button className="btn-ghost" disabled={comBusy != null} onClick={salvarDailyCap}>
                          {comBusy === "dailyCap" ? "Salvando…" : "Salvar teto diário"}
                        </button>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-hairline)", paddingTop: 12, display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: "var(--fz-l2)" }}>Credenciais master</strong>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: "var(--fz-m1)" }}>
                        <span style={{ fontWeight: 600 }}>WhatsApp:</span>
                        <button className="btn-ghost" disabled={comBusy != null}
                          style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", ...(c.whatsapp?.usingMasterToken ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)" } : {}) }}
                          onClick={() => salvarTokens({ useMasterWhatsAppToken: !c.whatsapp?.usingMasterToken })}>
                          {c.whatsapp?.usingMasterToken ? "usando master" : "token próprio"}
                        </button>
                        {credsWa.length > 0 && (
                          <select className="field-dark" style={{ minHeight: 30, fontSize: "var(--hbx-font-min)", width: 170 }}
                            value={String(c.whatsapp?.masterCredentialKey || "")}
                            onChange={e => salvarTokens({ useMasterWhatsAppToken: true, masterWhatsAppCredentialKey: e.target.value })}>
                            <option value="">credencial…</option>
                            {credsWa.map(cr => <option key={cr.key} value={cr.key}>{cr.label || cr.key}{cr.configured ? "" : " (incompleta)"}</option>)}
                          </select>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: "var(--fz-m1)" }}>
                        <span style={{ fontWeight: 600 }}>Mercado Pago:</span>
                        <button className="btn-ghost" disabled={comBusy != null}
                          style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", ...(c.mercadoPago?.usingMasterToken ? { borderColor: "var(--hbx-brand)", color: "var(--hbx-brand-strong)" } : {}) }}
                          onClick={() => salvarTokens({ useMasterMercadoPagoToken: !c.mercadoPago?.usingMasterToken })}>
                          {c.mercadoPago?.usingMasterToken ? "usando master" : "token próprio"}
                        </button>
                        {credsMp.length > 0 && (
                          <select className="field-dark" style={{ minHeight: 30, fontSize: "var(--hbx-font-min)", width: 170 }}
                            value={String(c.mercadoPago?.masterCredentialKey || "")}
                            onChange={e => salvarTokens({ useMasterMercadoPagoToken: true, masterMercadoPagoCredentialKey: e.target.value })}>
                            <option value="">credencial…</option>
                            {credsMp.map(cr => <option key={cr.key} value={cr.key}>{cr.label || cr.key}{cr.configured ? "" : " (incompleta)"}</option>)}
                          </select>
                        )}
                      </div>
                    </div>

                    {/* "Armar bot" MORREU (31/07/2026): a liberação do bot é a
                        ENTREVISTA que a própria empresa responde em /automacao —
                        fail-closed no cliente, sem chave no suporte. */}
                  </div>
                )}

                {detailTab === "Financeiro" && (
                  <React.Fragment>
                    <div style={{ padding: "12px 16px 0" }}>
                      <section className="panel" style={{ marginBottom: 4 }}>
                        <div className="panel-head">
                          <h2>Carteira</h2>
                          <div className="meta">
                            <button className="btn-teal" style={{ minHeight: 30, fontSize: "var(--hbx-font-min)" }}
                              onClick={() => {
                                setWalletGrantKey(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `grant-${Date.now()}-${Math.random().toString(36).slice(2)}`);
                                setWalletGrantForm(WALLET_GRANT_VAZIO);
                                setWalletGrantMsg(null);
                                setWalletGrantOpen(true);
                              }}>
                              + Conceder crédito
                            </button>
                          </div>
                        </div>
                        <div style={{ padding: "12px 16px 16px", display: "grid", gap: 12 }}>
                          {!wallet && <span style={{ fontSize: "var(--fz-m1)", color: "var(--text-muted)" }}>Carregando carteira…</span>}
                          {wallet && wallet.enabled === false && (
                            <span style={{ fontSize: "var(--fz-m1)", color: "var(--text-muted)" }}>Créditos desligados nesta env.</span>
                          )}
                          {wallet && wallet.enabled !== false && (
                            <React.Fragment>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                                <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>Saldo</span>
                                <strong style={{ fontSize: "var(--fz-t7)", fontFamily: "var(--font-mono)" }}>{wallet.balance ?? 0}</strong>
                                <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>créditos</span>
                                {(wallet.balance ?? 0) === 0 && <span className="tag warn" style={{ fontSize: "var(--hbx-font-min)" }}>sem saldo</span>}
                              </div>

                              <div style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: "var(--hbx-font-min)", fontWeight: 700, color: "var(--text-muted)" }}>Lotes</span>
                                {(wallet.lots || []).length === 0 && (
                                  <span style={{ fontSize: "var(--fz-m2)", color: "var(--text-muted)" }}>Sem lotes abertos.</span>
                                )}
                                {(wallet.lots || []).map(lot => (
                                  <div key={lot.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: "var(--fz-m1)" }}>
                                    <span>{lot.remaining}/{lot.amount} créditos{lot.grantType ? ` · ${WALLET_GRANT_TYPE_LABEL[lot.grantType] || lot.grantType}` : ""}</span>
                                    <span style={{ color: "var(--text-muted)" }}>{lot.expiresAt ? `expira ${fmtData(lot.expiresAt)}` : "não expira"}</span>
                                  </div>
                                ))}
                              </div>

                              <div style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: "var(--hbx-font-min)", fontWeight: 700, color: "var(--text-muted)" }}>Extrato (últimos movimentos)</span>
                                {(wallet.recent || []).length === 0 && (
                                  <span style={{ fontSize: "var(--fz-m2)", color: "var(--text-muted)" }}>Sem movimentos.</span>
                                )}
                                {(wallet.recent || []).map(m => (
                                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: "var(--fz-m1)" }}>
                                    <span>{WALLET_MOVEMENT_LABEL[m.kind] || m.kind}{m.actionKey ? ` · ${m.actionKey}` : ""}</span>
                                    <span style={{ fontFamily: "var(--font-mono)" }}>{m.amount}</span>
                                    <span style={{ color: "var(--text-muted)" }}>{fmtDataHora(m.createdAt)}</span>
                                  </div>
                                ))}
                              </div>
                            </React.Fragment>
                          )}
                        </div>
                      </section>
                    </div>

                    <div style={{ padding: "10px 16px 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button className="btn-teal" style={{ minHeight: 32, fontSize: "var(--fz-m2)" }}
                        onClick={() => { setPagForm(PAG_VAZIO); setPagMsg(null); setPagOpen(true); }}>+ Registrar pagamento</button>
                      {pagMsg && (
                        <span style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: pagMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{pagMsg}</span>
                      )}
                    </div>
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead>
                          <tr><th>Lançamento</th><th>Status</th><th>Competência</th><th>Valor</th><th>Pago em</th><th>Método</th><th></th></tr>
                        </thead>
                        <tbody>
                          {ledger.length === 0 && (
                            <tr><td colSpan={7} style={{ color: "var(--text-muted)" }}>Sem lançamentos financeiros.</td></tr>
                          )}
                          {ledger.map(l => {
                            // backend grava CANCELLED (2 L); cobre as duas grafias
                            const statusUp = String(l.status || "").toUpperCase();
                            const cancelado = statusUp.startsWith("CANCEL");
                            const manual = String(l.origin || "").toLowerCase().includes("manual") || String(l.entryType || "").toLowerCase().includes("manual");
                            // F3 — estornável: receita de cartão paga, com cobrança vinculada, ainda não estornada.
                            const jaEstornado = statusUp.includes("REFUND");
                            const chargeId = l.metadata?.chargeId || null;
                            const refundable = String(l.entryGroup || "") === "revenue" &&
                              (statusUp === "APPROVED" || statusUp === "PAID") &&
                              String(l.paymentMethod || "").toUpperCase() === "CARD" &&
                              !!chargeId && !jaEstornado;
                            return (
                              <tr key={l.id} style={{ cursor: "default", opacity: cancelado ? 0.55 : 1 }}>
                                <td>
                                  <div className="co">
                                    <strong>{l.referenceLabel || l.entryType || "—"}</strong>
                                    <span className="sub2">{l.observation || l.origin || "—"}</span>
                                  </div>
                                </td>
                                <td><span className={cancelado ? "tag red" : String(l.status || "").toUpperCase() === "PAID" ? "tag teal" : "tag warn"}>{l.status || "—"}</span></td>
                                <td>{l.competence || "—"}</td>
                                <td style={{ fontFamily: "var(--font-mono)" }}>{fmtBRL(l.amount)}</td>
                                <td>{l.paidAt ? fmtData(l.paidAt) : "—"}</td>
                                <td>{l.paymentMethod || "—"}</td>
                                <td>
                                  {manual && !cancelado && (cancelArm === l.id ? (
                                    <button className="btn-ghost" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", borderColor: "var(--hbx-danger)", color: "var(--hbx-danger)" }}
                                      disabled={pagBusy} onClick={() => cancelarLancamento(l.id)}>Confirmar</button>
                                  ) : (
                                    <button className="btn-ghost" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", color: "var(--hbx-danger)" }}
                                      disabled={pagBusy} onClick={() => setCancelArm(l.id)}>Cancelar</button>
                                  ))}
                                  {refundable && chargeId && (refundArm === l.id ? (
                                    <button className="btn-ghost" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", borderColor: "var(--hbx-danger)", color: "var(--hbx-danger)" }}
                                      disabled={pagBusy} onClick={() => reembolsarLancamento(l.id, chargeId)}>Confirmar estorno</button>
                                  ) : (
                                    <button className="btn-ghost" style={{ minHeight: 26, fontSize: "var(--hbx-font-min)", color: "var(--hbx-warning)" }}
                                      disabled={pagBusy} onClick={() => setRefundArm(l.id)}>Reembolsar</button>
                                  ))}
                                  {jaEstornado && <span className="bv-hint" style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>estornado</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {String(c?.billingProvider || "").toLowerCase() === "mercadopago" && (
                      <div style={{ padding: "12px 16px 16px" }}>
                        <button type="button" className="btn-ghost" style={{ minHeight: 28, fontSize: "var(--hbx-font-min)" }}
                          onClick={() => setLegadoAssinaturaOpen(o => !o)}>
                          {legadoAssinaturaOpen ? "▾" : "▸"} Legado (assinatura)
                        </button>
                        {legadoAssinaturaOpen && (
                          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            {subCancelArm ? (
                              <button className="btn-ghost" style={{ minHeight: 32, fontSize: "var(--fz-m2)", borderColor: "var(--hbx-danger)", color: "var(--hbx-danger)" }}
                                disabled={pagBusy} onClick={() => cancelarAssinatura()}>{pagBusy ? "Cancelando…" : "Confirmar cancelamento da assinatura"}</button>
                            ) : (
                              <button className="btn-ghost" style={{ minHeight: 32, fontSize: "var(--fz-m2)", color: "var(--hbx-danger)" }}
                                disabled={pagBusy} onClick={() => setSubCancelArm(true)}>Cancelar assinatura</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                )}

                {detailTab === "Implantação" && (
                  <div style={{ padding: "12px 16px 16px", display: "grid", gap: 14 }}>
                    <div style={{ display: "grid", gap: 8 }}>
                      <strong>Central de Implantação (Full)</strong>
                      <span className="field-label">Registro do que foi acordado com este cliente. Não altera cobrança/comissão sozinho.</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <label className="field-label">Implantação (R$)</label>
                          <input className="field-dark" type="number" min={0} step="0.01" style={{ width: 130 }}
                            value={finForm.setupValue} onChange={e => setFinForm(f => ({ ...f, setupValue: e.target.value }))} />
                        </div>
                        <div style={{ display: "grid", gap: 4 }}>
                          <label className="field-label">Parcela (R$/mês)</label>
                          <input className="field-dark" type="number" min={0} step="0.01" style={{ width: 130 }}
                            value={finForm.parcela} onChange={e => setFinForm(f => ({ ...f, parcela: e.target.value }))} />
                        </div>
                        <button className="btn-ghost" disabled={comBusy != null} onClick={salvarFinanceSettings}>
                          {comBusy === "fin" ? "Salvando…" : "Salvar implantação"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === "Website" && (
                  <div style={{ padding: "12px 16px 16px", display: "grid", gap: 14 }}>
                    <span className="field-label">
                      Site institucional da empresa (Website Kit). O cliente acessa a URL pública direto; o admin
                      entra por token de uso único (90s) — nunca guardado, só na hora do clique.
                    </span>
                    {websiteMsg && (
                      <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, lineHeight: 1.5, color: websiteMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-warning)" }}>{websiteMsg}</div>
                    )}

                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fz-l2)", fontWeight: 700, cursor: "pointer" }}>
                      <input type="checkbox" checked={websiteForm.websiteEnabled}
                        onChange={e => setWebsiteForm(f => ({ ...f, websiteEnabled: e.target.checked }))} />
                      Website habilitado
                    </label>

                    <div style={{ display: "grid", gap: 4 }}>
                      <label className="field-label">URL pública {websiteForm.websiteEnabled && "*"}</label>
                      <input className="field-dark" placeholder="https://cliente.hbxsystem.com.br"
                        value={websiteForm.websitePublicUrl}
                        onChange={e => setWebsiteForm(f => ({ ...f, websitePublicUrl: e.target.value }))} />
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fz-l2)", fontWeight: 700, cursor: "pointer" }}>
                      <input type="checkbox" checked={websiteForm.websiteAdminEnabled}
                        onChange={e => setWebsiteForm(f => ({ ...f, websiteAdminEnabled: e.target.checked }))} />
                      Admin do website habilitado
                    </label>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "grid", gap: 4, flex: "1 1 260px" }}>
                        <label className="field-label">URL do admin {websiteForm.websiteAdminEnabled && "*"}</label>
                        <input className="field-dark" placeholder="https://cliente.hbxsystem.com.br/admin"
                          value={websiteForm.websiteAdminUrl}
                          onChange={e => setWebsiteForm(f => ({ ...f, websiteAdminUrl: e.target.value }))} />
                      </div>
                      <div style={{ display: "grid", gap: 4, flex: "1 1 160px" }}>
                        <label className="field-label">Project ID {websiteForm.websiteAdminEnabled && "*"}</label>
                        <input className="field-dark"
                          value={websiteForm.websiteProjectId}
                          onChange={e => setWebsiteForm(f => ({ ...f, websiteProjectId: e.target.value }))} />
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 4, maxWidth: 260 }}>
                      <label className="field-label">Modo de abertura padrão</label>
                      <select className="field-dark" value={websiteForm.websiteLaunchMode}
                        onChange={e => setWebsiteForm(f => ({ ...f, websiteLaunchMode: e.target.value === "admin" ? "admin" : "public" }))}>
                        <option value="public">Público</option>
                        <option value="admin">Admin (exige admin habilitado)</option>
                      </select>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn-teal" disabled={websiteBusy} onClick={salvarWebsite}>
                        {websiteBusy ? "Salvando…" : "Salvar configuração"}
                      </button>
                      <button className="btn-ghost" disabled={websiteLaunchBusy != null || !websiteForm.websitePublicUrl.trim()}
                        onClick={() => abrirWebsiteLaunch("public")}>
                        {websiteLaunchBusy === "public" ? "Abrindo…" : "Abrir público"}
                      </button>
                      <button className="btn-ghost" disabled={websiteLaunchBusy != null || !websiteForm.websiteAdminEnabled}
                        onClick={() => abrirWebsiteLaunch("admin")}>
                        {websiteLaunchBusy === "admin" ? "Abrindo…" : "Abrir admin"}
                      </button>
                    </div>
                  </div>
                )}

                {detailTab === "Auditoria" && (
                  <div style={{ padding: "12px 16px 16px", display: "grid", gap: 8, maxHeight: 480, overflowY: "auto" }}>
                    {auditoria.length === 0 && <span style={{ fontSize: "var(--fz-m1)", color: "var(--text-muted)" }}>Sem eventos de auditoria.</span>}
                    {auditoria.map(a => (
                      <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: "var(--fz-m1)", padding: "7px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)" }}>
                        <span className={String(a.severity || "").toUpperCase() === "WARN" ? "tag warn" : "tag"}>{a.scope || "—"}</span>
                        <strong style={{ fontSize: "var(--fz-m2)" }}>{a.action || "—"}</strong>
                        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>{fmtDataHora(a.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
              )}
            </div>
          </div>
        </div>
      )}

      {provOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) { setProvOpen(false); setProvStep(1); setProvMsg(null); } }}>
          <div className="hbx-modal" style={{ width: "min(520px, 100%)", maxHeight: "90vh", overflowY: "auto", display: "grid", gap: 16, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-t9)", fontWeight: 800 }}>Nova empresa cliente</h3>
              <span style={{ color: "var(--text-muted)", cursor: "pointer" }} onClick={() => { setProvOpen(false); setProvStep(1); setProvMsg(null); }}>✕</span>
            </div>
            <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)", lineHeight: 1.5 }}>
              Rota de exceção (Empresarial) — o caminho normal é o cliente entrar sozinho pelo self-signup.
            </span>

            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              {["Empresa", "Admin", "Avançado"].map((label, i) => (
                <React.Fragment key={label}>
                  <span className={`prov-step${provStep === i + 1 ? " is-active" : ""}${provStep > i + 1 ? " is-done" : ""}`}>
                    {i + 1}. {label}
                  </span>
                  {i < 2 && <span className="prov-step-arrow">›</span>}
                </React.Fragment>
              ))}
            </div>

            {provMsg && <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{provMsg}</div>}

            {provStep === 1 && (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="field-label">Nome da empresa *</label>
                  <input className="field-dark" maxLength={140} autoFocus value={provForm.companyName}
                    onChange={e => setProvForm(f => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="field-label">Slug (opcional)</label>
                  <input className="field-dark" maxLength={80} placeholder="gerado do nome se vazio" value={provForm.slug}
                    onChange={e => setProvForm(f => ({ ...f, slug: e.target.value }))} />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="field-label">CNPJ / CPF (opcional)</label>
                  <input className="field-dark" maxLength={20} placeholder="apenas dígitos ou com pontuação" value={provForm.taxDocument}
                    onChange={e => setProvForm(f => ({ ...f, taxDocument: e.target.value }))} />
                  <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>Opcional agora — exigido no caminho de cobrança (F6).</span>
                </div>
              </div>
            )}

            {provStep === 2 && (
              <div style={{ display: "grid", gap: 10 }}>
                <strong style={{ fontSize: "var(--fz-l2)" }}>Admin inicial</strong>
                <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Com e-mail preenchido o backend cria o admin. Defina uma senha para ele já entrar com ela;
                  deixe a senha vazia e o backend gera uma temporária (mostrada uma única vez, trocada no 1º login).
                  Deixe o e-mail vazio para criar a empresa sem usuário.
                </span>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="field-label">E-mail do admin</label>
                  <input className="field-dark" type="email" maxLength={180} value={provForm.adminEmail}
                    onChange={e => setProvForm(f => ({ ...f, adminEmail: e.target.value }))} />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="field-label">Senha (opcional — vazio = temporária)</label>
                  <input className="field-dark" type="text" autoComplete="new-password" maxLength={72} placeholder="deixe vazio para gerar automática"
                    value={provForm.adminPassword} onChange={e => setProvForm(f => ({ ...f, adminPassword: e.target.value }))} />
                  <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>Mínimo 6 caracteres. Se você definir a senha, o admin NÃO é obrigado a trocá-la no primeiro login.</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="field-label">Nome</label>
                    <input className="field-dark" maxLength={120} value={provForm.adminName}
                      onChange={e => setProvForm(f => ({ ...f, adminName: e.target.value }))} />
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="field-label">Telefone</label>
                    <input className="field-dark" maxLength={30} value={provForm.adminPhone}
                      onChange={e => setProvForm(f => ({ ...f, adminPhone: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            {provStep === 3 && (
              <div style={{ display: "grid", gap: 10 }}>
                <strong style={{ fontSize: "var(--fz-l2)" }}>Avançado</strong>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fz-l3)", fontWeight: 600 }}>
                  <input type="checkbox" checked={provForm.manualAccess} onChange={e => setProvForm(f => ({ ...f, manualAccess: e.target.checked }))} />
                  Acesso liberado desde a criação (sem checkout)
                </label>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="prov-fld-adv-lbl">Assentos / teto de acessos (vazio = sem teto)</label>
                  <input className="field-dark" type="number" min={0} style={{ width: 140 }} value={provForm.seatCap}
                    onChange={e => setProvForm(f => ({ ...f, seatCap: e.target.value }))} />
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="prov-fld-adv-lbl">Créditos iniciais (0 = sem concessão)</label>
                  <input className="field-dark" type="number" min={0} style={{ width: 140 }} value={provForm.initialCredits}
                    onChange={e => setProvForm(f => ({ ...f, initialCredits: e.target.value }))} />
                  <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)" }}>Pré-preenchido com o lote de boas-vindas padrão.</span>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="prov-fld-adv-lbl">Preço/mês override (R$) — vazio = sem cobrança automática</label>
                  <input className="field-dark" type="number" min={0} step="0.01" style={{ width: 160 }} placeholder="vazio = sem cobrança automática"
                    value={provForm.monthlyValueOverride} onChange={e => setProvForm(f => ({ ...f, monthlyValueOverride: e.target.value }))} />
                  <span style={{ fontSize: "var(--hbx-font-min)", color: "var(--text-muted)", lineHeight: 1.5 }}>
                    Override = exceção marcada no registro. Preço 0 → empresa criada em <b>pending_checkout</b> (sem acesso, aguarda contato comercial).
                  </span>
                  {provForm.monthlyValueOverride.trim() === "0" && (
                    <div className="prov-warn-msg">
                      Preço 0: empresa criada em pending_checkout — aguarda contato comercial.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <div>
                {provStep > 1 && (
                  <button className="btn-ghost" style={{ minHeight: 38 }} disabled={provBusy}
                    onClick={() => { setProvMsg(null); setProvStep(s => s - 1); }}>
                    ← Voltar
                  </button>
                )}
              </div>
              <div>
                {provStep < 3 && (
                  <button className="btn-teal" style={{ minHeight: 38 }} onClick={avancarPasso}>
                    Próximo →
                  </button>
                )}
                {provStep === 3 && (
                  <button className="btn-teal" style={{ minHeight: 38 }} disabled={provBusy} onClick={provisionar}>
                    {provBusy ? "Criando…" : "Criar empresa"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {empOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setEmpOpen(false); }}>
          <form className="hbx-modal" onSubmit={salvarEmpresa}
            style={{ width: "min(460px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-t9)", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Editar empresa
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setEmpOpen(false)}>✕</span>
            </h3>
            {empMsg && <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{empMsg}</div>}
            {([
              ["name", "Razão social / nome"],
              ["primaryContactName", "Contato principal"],
              ["contactEmail", "E-mail de contato"],
              ["contactPhone", "Telefone"],
              ["taxDocument", "CNPJ / documento"],
            ] as [keyof typeof EMP_VAZIO, string][]).map(([k, label]) => (
              <div key={k} style={{ display: "grid", gap: 6 }}>
                <label className="field-label">{label}</label>
                <input className="field-dark" maxLength={200} value={empForm[k]}
                  onChange={e => setEmpForm(f => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <button className="btn-teal" type="submit" disabled={empBusy} style={{ minHeight: 42 }}>
              {empBusy ? "Salvando…" : "Salvar empresa"}
            </button>
          </form>
        </div>
      )}

      {pagOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setPagOpen(false); }}>
          <form className="hbx-modal" onSubmit={registrarPagamento}
            style={{ width: "min(420px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-t9)", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Registrar pagamento manual
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setPagOpen(false)}>✕</span>
            </h3>
            {pagMsg && !pagMsg.startsWith("✓") && (
              <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{pagMsg}</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="field-label">Valor (R$) *</label>
                <input className="field-dark" required inputMode="decimal" placeholder="0,00" value={pagForm.value}
                  onChange={e => setPagForm(f => ({ ...f, value: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="field-label">Competência</label>
                <input className="field-dark" placeholder="AAAA-MM" maxLength={20} value={pagForm.competence}
                  onChange={e => setPagForm(f => ({ ...f, competence: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="field-label">Pago em</label>
                <input className="field-dark" type="date" value={pagForm.paidAt}
                  onChange={e => setPagForm(f => ({ ...f, paidAt: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="field-label">Método</label>
                <select className="field-dark" value={pagForm.paymentMethod} onChange={e => setPagForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="TRANSFER">Transferência</option>
                  <option value="CASH">Dinheiro</option>
                  <option value="OTHER">Outro</option>
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label className="field-label">Observação</label>
              <input className="field-dark" maxLength={280} value={pagForm.observation}
                onChange={e => setPagForm(f => ({ ...f, observation: e.target.value }))} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fz-l3)", fontWeight: 600 }}>
              <input type="checkbox" checked={pagForm.settlePending} onChange={e => setPagForm(f => ({ ...f, settlePending: e.target.checked }))} />
              Quitar pendências em aberto com este pagamento
            </label>
            <button className="btn-teal" type="submit" disabled={pagBusy} style={{ minHeight: 42 }}>
              {pagBusy ? "Registrando…" : "Registrar pagamento"}
            </button>
          </form>
        </div>
      )}

      {walletGrantOpen && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setWalletGrantOpen(false); }}>
          <form className="hbx-modal" onSubmit={concederCredito}
            style={{ width: "min(420px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-t9)", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Conceder crédito
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setWalletGrantOpen(false)}>✕</span>
            </h3>
            {walletGrantMsg && (
              <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{walletGrantMsg}</div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label className="field-label">Quantidade de créditos *</label>
              <input className="field-dark" type="number" min={1} required value={walletGrantForm.amount}
                onChange={e => setWalletGrantForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label className="field-label">Tipo</label>
              <select className="field-dark" value={walletGrantForm.grantType}
                onChange={e => setWalletGrantForm(f => ({ ...f, grantType: e.target.value as typeof f.grantType }))}>
                <option value="courtesy_internal">Concessão interna (grátis)</option>
                <option value="paid">Pago (recebido fora do sistema)</option>
                <option value="promo">Promoção</option>
              </select>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label className="field-label">Motivo (opcional)</label>
              <input className="field-dark" maxLength={200}
                value={walletGrantForm.reason} onChange={e => setWalletGrantForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <button className="btn-teal" type="submit" disabled={walletGrantBusy} style={{ minHeight: 42 }}>
              {walletGrantBusy ? "Concedendo…" : "Conceder crédito"}
            </button>
          </form>
        </div>
      )}

      {userEdit && (
        <div className="hbx-veil" onClick={e => { if (e.target === e.currentTarget) setUserEdit(null); }}>
          <form className="hbx-modal" onSubmit={salvarUsuario}
            style={{ width: "min(440px, 100%)", display: "grid", gap: 12, padding: 24 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--fz-t9)", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Editar usuário #{userEdit.id}
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setUserEdit(null)}>✕</span>
            </h3>
            {userMsg && !userMsg.startsWith("✓") && (
              <div style={{ fontSize: "var(--fz-m1)", fontWeight: 700, color: "var(--hbx-warning)", lineHeight: 1.5 }}>{userMsg}</div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label className="field-label">Nome</label>
              <input className="field-dark" maxLength={120} value={userEdit.name}
                onChange={e => setUserEdit(u => u && ({ ...u, name: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label className="field-label">E-mail</label>
              <input className="field-dark" type="email" maxLength={180} value={userEdit.email}
                onChange={e => setUserEdit(u => u && ({ ...u, email: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="field-label">Username</label>
                <input className="field-dark" maxLength={120} value={userEdit.username}
                  onChange={e => setUserEdit(u => u && ({ ...u, username: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="field-label">Telefone</label>
                <input className="field-dark" maxLength={30} value={userEdit.phone}
                  onChange={e => setUserEdit(u => u && ({ ...u, phone: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="field-label">Papel</label>
                <select className="field-dark" value={userEdit.role} onChange={e => setUserEdit(u => u && ({ ...u, role: e.target.value }))}>
                  <option value="USER">Vendedor</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fz-l3)", fontWeight: 600, alignSelf: "end", paddingBottom: 8 }}>
                <input type="checkbox" checked={userEdit.isActive} onChange={e => setUserEdit(u => u && ({ ...u, isActive: e.target.checked }))} />
                Ativo
              </label>
            </div>
            <button className="btn-teal" type="submit" disabled={userBusy} style={{ minHeight: 42 }}>
              {userBusy ? "Salvando…" : "Salvar usuário"}
            </button>
          </form>
        </div>
      )}
    </React.Fragment>
  );
}
