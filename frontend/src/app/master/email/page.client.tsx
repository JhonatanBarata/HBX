"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch, getDirectDashboardApiBaseUrl, type ApiFetchError } from "@/app/_lib/api";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type TemplateKind = "normal" | "password_reset" | "email_confirmation" | "seller_welcome" | "seller_onboarding_request";
type TemplateVariableGroupKey = "contato" | "vendedor" | "card" | "links" | "sistema";

type TemplateVariableDefinition = {
  key: string;
  token: string;
  label: string;
  group: TemplateVariableGroupKey;
  description: string;
};

type EmailTemplate = {
  kind: TemplateKind;
  subject: string;
  text: string;
  html?: string | null;
  updatedAt?: string | null;
  variables: string[];
  variableDefinitions?: TemplateVariableDefinition[];
  requiredVariable?: string | null;
  usesSignature: boolean;
  usesAttachment: boolean;
};

type MasterEmailState = {
  sender: {
    from: string | null;
    replyTo: string | null;
    ready: boolean;
    mode: string;
    missing: string[];
  };
  attachment: {
    originalName: string;
    uploadedAt: string;
    size: number;
  } | null;
  businessCard: {
    originalName: string;
    uploadedAt: string;
    size: number;
    mimeType?: string | null;
    previewDataUrl?: string | null;
  } | null;
  formState?: MasterEmailFormState | null;
};

type Draft = {
  subject: string;
  text: string;
  html: string;
};

type MasterEmailFormState = {
  recipientName: string;
  recipientEmail: string;
  testEmail: string;
  sampleName: string;
  sampleCompany: string;
};

type MasterEmailSendResponse = {
  ok: boolean;
  sentAt: string;
  recipientName: string;
  recipientEmail: string;
  delivery?: {
    transport?: string;
    messageId?: string | null;
    previewUrl?: string | null;
  };
};

const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  normal: "E-mail normal",
  password_reset: "Recuperação",
  email_confirmation: "Confirmação",
  seller_onboarding_request: "Pré boas-vindas vendedor",
  seller_welcome: "Boas-vindas vendedor",
};

const TEMPLATE_ORDER: TemplateKind[] = ["normal", "seller_onboarding_request", "seller_welcome", "password_reset", "email_confirmation"];
const DEFAULT_NAME = "Amanda";
const DEFAULT_COMPANY = "Empresa Teste";
const MAX_PPTX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_BUSINESS_CARD_UPLOAD_BYTES = 15 * 1024 * 1024;
const TEMPLATE_VARIABLE_KEYS = "nome|primeironome|email|empresa|linkRecuperacao|linkConfirmacao|acesso|senha|linkAcesso|linkMobile|tipoAcesso|ano|vendedor|emailvendedor|senhavendedor|comissao|comissaoheranca|d3|diascomissao|sellerName|sellerCpf|sellerEmail|sellerPhone|sellerAddress|commissionPercent|commissionDueBusinessDays|contractDate|documentosConfirmados|documentosRecebidos|documentosPendentes|documentosFaltantes|contrato|saudacao|nomecard|razaosocialcard|telefonecard|whatsappcard|emailcard|cidadecard|estadocard|enderecocard|bairrocard|segmentocard|sitecard|instagramcard|facebookcard|responsavelcard|observacaocard";
const VARIABLE_GROUP_LABELS: Record<TemplateVariableGroupKey, string> = {
  contato: "Contato",
  vendedor: "Vendedor",
  card: "Card e bot",
  links: "Links",
  sistema: "Sistema",
};
const VARIABLE_GROUP_ORDER: TemplateVariableGroupKey[] = ["contato", "vendedor", "card", "links", "sistema"];
const SELLER_WELCOME_BASE_DRAFT: Draft = {
  subject: "Bem-vindo à equipe HBX, {vendedor}",
  text: [
    "Olá {vendedor}, seja bem-vindo à equipe HBX.",
    "",
    "Seu cadastro como vendedor HBX foi realizado com sucesso e seu acesso já está pronto.",
    "",
    "Seu acesso é {acesso}",
    "Senha temporária: {senha}",
    "",
    "Sua comissão direta: {comissao}",
    "Comissão por herança/indicação: {comissaoheranca}",
    "Liberação da comissão: {d3}",
    "",
    "No primeiro login, pedimos a gentileza de trocar essa senha temporária. O HBX vai direcionar você para essa etapa antes de liberar a rotina comercial.",
    "",
    "Acesse pelo desktop: {{linkAcesso}}",
    "Acesse pelo mobile: {{linkMobile}}",
    "",
    "Use o mobile para acompanhar seus leads, retornar contatos e manter seu funil atualizado durante o dia.",
    "",
    "Conte com a gente e boas vendas.",
    "",
    "Equipe HBX",
  ].join("\n"),
  html: "",
};
const SELLER_CONTRACT_EDITOR_TEXT = `CONTRATO DE PARCERIA COMERCIAL AUTÔNOMA E INDICAÇÃO COMISSIONADA

CONTRATANTE:
HBX SYSTEM, doravante denominada HBX.

PARCEIRO COMERCIAL:
Nome: {{sellerName}}
CPF: {{sellerCpf}}
E-mail: {{sellerEmail}}
Telefone/WhatsApp: {{sellerPhone}}
Endereço declarado: {{sellerAddress}}

1. OBJETO
O presente contrato regula a atuação do PARCEIRO como parceiro comercial autônomo para indicação e intermediação comercial dos planos HBX List e HBX Lead Plus.

2. AUSÊNCIA DE VÍNCULO EMPREGATÍCIO
As partes reconhecem que este contrato não cria vínculo empregatício, salário, jornada, subordinação, exclusividade, obrigação de comparecimento, meta obrigatória ou controle de horário. O PARCEIRO atua com autonomia, assumindo seus próprios meios de atuação.

3. PLANOS COMERCIALIZADOS
HBX List: R$ 45,00 por mês.
HBX Lead Plus: R$ 99,00 por mês, com trial de 14 dias quando aplicável.
Não há taxa de implantação nesses planos.

4. COMISSÃO
O PARCEIRO receberá comissão de {{commissionPercent}}% sobre mensalidades efetivamente pagas por clientes vinculados ao seu link rastreável ou cadastro assistido no HBX.

5. RECORRÊNCIA
A comissão será recorrente enquanto o cliente permanecer ativo, adimplente e vinculado ao PARCEIRO no sistema HBX, salvo fraude, chargeback, cancelamento, inadimplência, violação contratual ou uso indevido da plataforma.

6. PRAZO DE PAGAMENTO
As comissões elegíveis serão pagas em até {{commissionDueBusinessDays}} dias úteis após confirmação do pagamento do cliente e validação interna da venda.

7. VENDA RASTREADA
Somente geram comissão as vendas registradas por:
a) link gerado dentro do card de Vendas do HBX;
b) cadastro assistido registrado no card de Vendas do HBX.
Vendas fora do fluxo rastreado não geram comissão.

8. REGRAS DE CONDUTA
O PARCEIRO não poderá prometer funcionalidades, descontos, garantias, resultados financeiros ou condições que não estejam autorizadas pela HBX. O PARCEIRO também deverá respeitar opt-out, privacidade, boas práticas de contato comercial e regras contra spam.

9. USO DA PLATAFORMA
O acesso ao HBX é pessoal e intransferível. O PARCEIRO não poderá compartilhar login, exportar dados sem autorização, revender base de leads ou usar dados do HBX fora da finalidade comercial autorizada.

10. DADOS E DOCUMENTOS
O PARCEIRO autoriza o tratamento dos dados e documentos fornecidos exclusivamente para cadastro, validação, contrato, auditoria comercial e pagamento de comissão. Os anexos temporários poderão ser enviados ao e-mail de arquivo da HBX e removidos do backend em até 7 dias após confirmação do envio.

11. ENCERRAMENTO
Qualquer parte poderá encerrar a parceria. Comissões futuras dependem de cliente ativo, adimplente, venda rastreada e ausência de violação contratual.

12. ACEITE
O PARCEIRO declara que leu, entendeu e aceitou os termos acima.

Data: {{contractDate}}

HBX SYSTEM

{{sellerName}}`;

function formatFileSize(value?: number | null) {
  const size = Number(value || 0);
  if (!size) return "-";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(value: string) {
  return escapeHtml(value)
    .split("\n")
    .map((line) => line || "&nbsp;")
    .join("<br>");
}

function renderTemplate(value: string, variables: Record<string, string | number>) {
  return String(value || "").replace(new RegExp(`\\{\\{\\s*(${TEMPLATE_VARIABLE_KEYS})\\s*\\}\\}|\\{\\s*(${TEMPLATE_VARIABLE_KEYS})\\s*\\}`, "g"), (_, doubleKey: string, singleKey: string) => {
    const key = doubleKey || singleKey;
    return String(variables[key] ?? "");
  });
}

function buildDirectApiPath(path: string) {
  return `${getDirectDashboardApiBaseUrl()}${path}`;
}

function getImageFilename(file: File) {
  if (file.name) return file.name;
  if (file.type === "image/jpeg") return "cartao-visitas.jpg";
  if (file.type === "image/webp") return "cartao-visitas.webp";
  return "cartao-visitas.png";
}

function isApiFetchError(error: unknown): error is ApiFetchError {
  return error !== null && typeof error === "object" && "status" in error;
}

function getUploadErrorMessage(error: unknown, fallback: string) {
  if (isApiFetchError(error) && error.status === 413) {
    return "Arquivo grande demais para o servidor. Reduza o arquivo e tente novamente.";
  }
  if (error instanceof TypeError) {
    return "O navegador não recebeu resposta da API. O upload pode ter sido bloqueado pelo proxy; tente novamente após atualizar a página.";
  }
  return error instanceof Error ? error.message : fallback;
}

function emptyDraft(): Draft {
  return { subject: "", text: "", html: "" };
}

function templateToDraft(template: EmailTemplate): Draft {
  return {
    subject: template.subject || "",
    text: template.text || "",
    html: template.html || "",
  };
}

function getNormalSendBlocker(input: {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  text: string;
  hasAttachment: boolean;
}) {
  if (!input.recipientName.trim()) return "Informe o nome do contato.";
  if (!input.recipientEmail.trim()) return "Informe o e-mail do contato.";
  if (!input.recipientEmail.includes("@")) return "Informe um e-mail de contato válido.";
  if (!input.subject.trim()) return "Informe o assunto do e-mail.";
  if (!input.text.trim()) return "Informe a mensagem do e-mail.";
  if (!input.hasAttachment) return "Faça upload do PPTX. Sem anexo salvo no servidor, o e-mail comercial não pode ser enviado.";
  return null;
}

function hasAnyToken(value: string, tokens: string[]) {
  return tokens.some((token) => value.includes(token));
}

function buildVariableDefinitions(template?: EmailTemplate | null): TemplateVariableDefinition[] {
  if (template?.variableDefinitions?.length) return template.variableDefinitions;
  return (template?.variables || []).map((token) => {
    const key = token.replace(/[{}]/g, "").trim();
    return {
      key,
      token,
      label: token,
      group: "sistema",
      description: "Variável disponível para este modelo.",
    };
  });
}

function groupVariableDefinitions(definitions: TemplateVariableDefinition[]) {
  return VARIABLE_GROUP_ORDER.map((group) => ({
    group,
    items: definitions.filter((definition) => definition.group === group),
  })).filter((entry) => entry.items.length > 0);
}

export function MasterEmailWorkspace({ embedded = false }: { embedded?: boolean }) {
  const hasToken = useRequireAuth();
  const [activeTemplate, setActiveTemplate] = useState<TemplateKind>("normal");
  const [templates, setTemplates] = useState<Record<TemplateKind, EmailTemplate | null>>({
    normal: null,
    seller_onboarding_request: null,
    seller_welcome: null,
    password_reset: null,
    email_confirmation: null,
  });
  const [drafts, setDrafts] = useState<Record<TemplateKind, Draft>>({
    normal: emptyDraft(),
    seller_onboarding_request: emptyDraft(),
    seller_welcome: emptyDraft(),
    password_reset: emptyDraft(),
    email_confirmation: emptyDraft(),
  });
  const [state, setState] = useState<MasterEmailState | null>(null);
  const [recipientName, setRecipientName] = useState(DEFAULT_NAME);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [sampleName, setSampleName] = useState(DEFAULT_NAME);
  const [sampleCompany, setSampleCompany] = useState(DEFAULT_COMPANY);
  const [loadingKind, setLoadingKind] = useState<TemplateKind | "all" | null>("all");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingBusinessCard, setUploadingBusinessCard] = useState(false);
  const [removingAttachment, setRemovingAttachment] = useState(false);
  const [removingBusinessCard, setRemovingBusinessCard] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<MasterEmailSendResponse | null>(null);
  const [variablesOpen, setVariablesOpen] = useState(false);

  async function loadAll() {
    setLoadingKind("all");
    setError(null);
    try {
      const [templatePayload, masterPayload] = await Promise.all([
        apiFetch<{ templates: EmailTemplate[] }>("/master/email/templates", { requireAuth: true }),
        apiFetch<MasterEmailState>("/master/email", { requireAuth: true }),
      ]);
      const nextTemplates = {
        normal: null,
        seller_onboarding_request: null,
        seller_welcome: null,
        password_reset: null,
        email_confirmation: null,
      } as Record<TemplateKind, EmailTemplate | null>;
      const nextDrafts = {
        normal: emptyDraft(),
        seller_onboarding_request: emptyDraft(),
        seller_welcome: emptyDraft(),
        password_reset: emptyDraft(),
        email_confirmation: emptyDraft(),
      };
      for (const template of templatePayload.templates) {
        nextTemplates[template.kind] = template;
        nextDrafts[template.kind] = templateToDraft(template);
      }
      setTemplates(nextTemplates);
      setDrafts(nextDrafts);
      setState(masterPayload);
      applyFormState(masterPayload.formState);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar modelos de e-mail.");
    } finally {
      setLoadingKind(null);
    }
  }

  const loadAllRef = useRef(loadAll);

  useEffect(() => {
    loadAllRef.current = loadAll;
  });

  useEffect(() => {
    if (hasToken === true) void loadAllRef.current();
  }, [hasToken]);

  useEffect(() => {
    if (!error && !message) return;
    const timeout = window.setTimeout(() => {
      setError(null);
      setMessage(null);
    }, error ? 6500 : 4200);
    return () => window.clearTimeout(timeout);
  }, [error, message]);

  const activeDraft = drafts[activeTemplate];
  const activeTemplateData = templates[activeTemplate];
  const senderReady = state?.sender.ready;
  const isNormal = activeTemplate === "normal";
  const usesAttachment = Boolean(activeTemplateData?.usesAttachment);
  const usesSignature = Boolean(activeTemplateData?.usesSignature);
  const requiredVariable = activeTemplateData?.requiredVariable || null;
  const operationBusy = saving || testing || sending || uploading || uploadingBusinessCard || removingAttachment || removingBusinessCard || Boolean(loadingKind);
  const hasSavedAttachment = Boolean(state?.attachment);
  const hasSavedSignature = Boolean(state?.businessCard?.previewDataUrl);
  const activeVariableDefinitions = useMemo(() => buildVariableDefinitions(activeTemplateData), [activeTemplateData]);
  const activeVariableGroups = useMemo(() => groupVariableDefinitions(activeVariableDefinitions), [activeVariableDefinitions]);

  useEffect(() => {
    if (!activeVariableDefinitions.length) setVariablesOpen(false);
  }, [activeVariableDefinitions.length]);

  useEffect(() => {
    if (!variablesOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVariablesOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [variablesOpen]);

  const sampleVariables = useMemo(() => ({
    nome: sampleName.trim() || DEFAULT_NAME,
    primeironome: (sampleName.trim() || DEFAULT_NAME).split(/\s+/)[0],
    email: testEmail.trim() || "cliente@empresa.com.br",
    empresa: sampleCompany.trim() || DEFAULT_COMPANY,
    linkRecuperacao: "https://hbxsystem.com.br/reset-password?token=exemplo",
    linkConfirmacao: "https://hbxsystem.com.br/confirm-email?token=exemplo",
    acesso: testEmail.trim() || "vendedor@hbxsystem.com.br",
    senha: "Tmp@ExemploA1",
    linkAcesso: "https://hbxsystem.com.br/login",
    linkMobile: "https://hbxsystem.com.br/mobile/login",
    tipoAcesso: "vendedor",
    ano: new Date().getFullYear(),
    vendedor: sampleName.trim() || DEFAULT_NAME,
    emailvendedor: testEmail.trim() || "vendedor@hbxsystem.com.br",
    senhavendedor: "Tmp@ExemploA1",
    comissao: "20%",
    comissaoheranca: "2%",
    d3: "D+3 úteis",
    diascomissao: 3,
    sellerName: sampleName.trim() || DEFAULT_NAME,
    sellerCpf: "123.456.789-00",
    sellerEmail: testEmail.trim() || "vendedor@hbxsystem.com.br",
    sellerPhone: "(11) 99999-0000",
    sellerAddress: "Endereço declarado pelo parceiro",
    commissionPercent: "20",
    commissionDueBusinessDays: 3,
    contractDate: new Date().toLocaleDateString("pt-BR"),
    saudacao: "Boa tarde",
    nomecard: sampleCompany.trim() || DEFAULT_COMPANY,
    razaosocialcard: `${sampleCompany.trim() || DEFAULT_COMPANY} LTDA`,
    telefonecard: "(11) 99999-0000",
    whatsappcard: "5511999990000",
    emailcard: "contato@empresaexemplo.com.br",
    cidadecard: "São Paulo",
    estadocard: "SP",
    enderecocard: "Av. Paulista, 1000",
    bairrocard: "Bela Vista",
    segmentocard: "serviços locais",
    sitecard: "https://empresaexemplo.com.br",
    instagramcard: "@empresaexemplo",
    facebookcard: "facebook.com/empresaexemplo",
    responsavelcard: sampleName.trim() || DEFAULT_NAME,
    observacaocard: "Lead com bom potencial para apresentação HBX.",
  }), [sampleCompany, sampleName, testEmail]);

  const preview = useMemo(() => {
    const subject = renderTemplate(activeDraft.subject, sampleVariables);
    const text = renderTemplate(activeDraft.text, sampleVariables);
    return {
      subject,
      text,
      html: textToHtml(text),
    };
  }, [activeDraft.subject, activeDraft.text, sampleVariables]);

  function updateDraft(patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [activeTemplate]: {
        ...current[activeTemplate],
        ...patch,
      },
    }));
  }

  function buildFormState(): MasterEmailFormState {
    return {
      recipientName,
      recipientEmail,
      testEmail,
      sampleName,
      sampleCompany,
    };
  }

  function applyFormState(formState?: MasterEmailFormState | null) {
    if (!formState) return;
    setRecipientName(formState.recipientName ?? DEFAULT_NAME);
    setRecipientEmail(formState.recipientEmail ?? "");
    setTestEmail(formState.testEmail ?? "");
    setSampleName(formState.sampleName ?? DEFAULT_NAME);
    setSampleCompany(formState.sampleCompany ?? DEFAULT_COMPANY);
  }

  async function saveFormState() {
    const payload = await apiFetch<{ ok: boolean; formState: MasterEmailFormState }>("/master/email/settings", {
      method: "PUT",
      body: JSON.stringify(buildFormState()),
      requireAuth: true,
    });
    setState((current) => (current ? { ...current, formState: payload.formState } : current));
    applyFormState(payload.formState);
    return payload.formState;
  }

  function validateDraft(kind: TemplateKind, draft: Draft) {
    if (!draft.subject.trim()) return "Informe o assunto do modelo.";
    if (!draft.text.trim()) return "Informe o corpo do modelo.";
    const template = templates[kind];
    const required = template?.requiredVariable || null;
    if (required && !draft.text.includes(required)) {
      return `Este modelo precisa conter ${required}.`;
    }
    const hasSellerAccess = hasAnyToken(draft.text, ["{{acesso}}", "{acesso}", "{emailvendedor}"]);
    const hasSellerPassword = hasAnyToken(draft.text, ["{{senha}}", "{senha}", "{senhavendedor}"]);
    if (kind === "seller_welcome" && (!hasSellerAccess || !hasSellerPassword)) {
      return "Este modelo precisa conter {acesso} e {senha}.";
    }
    return null;
  }

  function injectSellerWelcomeTemplate() {
    setDrafts((current) => ({
      ...current,
      seller_welcome: SELLER_WELCOME_BASE_DRAFT,
    }));
    setActiveTemplate("seller_welcome");
    setError(null);
    setMessage("Template de boas-vindas injetado no editor.");
  }

  function injectSellerContractTemplate() {
    setDrafts((current) => ({
      ...current,
      seller_welcome: {
        subject: "Contrato de parceria comercial HBX - {{sellerName}}",
        text: SELLER_CONTRACT_EDITOR_TEXT,
        html: "",
      },
    }));
    setActiveTemplate("seller_welcome");
    setError(null);
    setMessage("Contrato carregado no editor.");
  }

  async function saveTemplate() {
    const validationError = validateDraft(activeTemplate, activeDraft);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await apiFetch<{ ok: boolean; template: EmailTemplate }>(`/master/email/templates/${activeTemplate}`, {
        method: "PUT",
        body: JSON.stringify({
          subject: activeDraft.subject,
          text: activeDraft.text,
          html: activeDraft.html || "",
        }),
        requireAuth: true,
      });
      setTemplates((current) => ({ ...current, [activeTemplate]: payload.template }));
      setDrafts((current) => ({ ...current, [activeTemplate]: templateToDraft(payload.template) }));
      await saveFormState();
      setMessage("Modelo e campos salvos com sucesso.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar modelo.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreTemplate() {
    setLoadingKind(activeTemplate);
    setError(null);
    setMessage(null);
    try {
      const payload = await apiFetch<{ ok: boolean; template: EmailTemplate }>(`/master/email/templates/${activeTemplate}/restore`, {
        method: "POST",
        requireAuth: true,
      });
      setTemplates((current) => ({ ...current, [activeTemplate]: payload.template }));
      setDrafts((current) => ({ ...current, [activeTemplate]: templateToDraft(payload.template) }));
      setMessage("Modelo padrão restaurado.");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Falha ao restaurar modelo.");
    } finally {
      setLoadingKind(null);
    }
  }

  async function sendTemplateTest() {
    const validationError = validateDraft(activeTemplate, activeDraft);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }
    if (!testEmail.trim()) {
      setError("Informe o e-mail que receberá o teste.");
      setMessage(null);
      return;
    }
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      const savePayload = await apiFetch<{ ok: boolean; template: EmailTemplate }>(`/master/email/templates/${activeTemplate}`, {
        method: "PUT",
        body: JSON.stringify({
          subject: activeDraft.subject,
          text: activeDraft.text,
          html: activeDraft.html || "",
        }),
        requireAuth: true,
      });
      setTemplates((current) => ({ ...current, [activeTemplate]: savePayload.template }));
      setDrafts((current) => ({ ...current, [activeTemplate]: templateToDraft(savePayload.template) }));
      await saveFormState();
      const payload = await apiFetch<{ ok: boolean; sentAt: string }>(`/master/email/templates/${activeTemplate}/test`, {
        method: "POST",
        body: JSON.stringify({
          to: testEmail,
          sampleName,
          sampleCompany,
        }),
        requireAuth: true,
        timeoutMs: 30000,
      });
      setMessage(payload.ok ? `Teste enviado para ${testEmail}.` : "Teste processado, mas o provedor não confirmou o envio.");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Falha ao enviar teste.");
    } finally {
      setTesting(false);
    }
  }

  async function uploadAttachment(file: File | null | undefined) {
    if (!file) return;
    const isPptx = file.name.toLowerCase().endsWith(".pptx") || file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (!isPptx) {
      setError("O anexo precisa ser um arquivo PPTX.");
      setMessage(null);
      return;
    }
    if (file.size > MAX_PPTX_UPLOAD_BYTES) {
      setError(`O PPTX pode ter no máximo ${formatFileSize(MAX_PPTX_UPLOAD_BYTES)}.`);
      setMessage(null);
      return;
    }
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const payload = await apiFetch<{ ok: boolean; attachment: MasterEmailState["attachment"] }>(buildDirectApiPath("/master/email/attachment"), {
        method: "POST",
        body: form,
        requireAuth: true,
        timeoutMs: 120000,
      });
      const refreshed = await apiFetch<MasterEmailState>("/master/email", { requireAuth: true });
      setState({ ...refreshed, attachment: payload.attachment || refreshed.attachment });
      setMessage("Anexo PPTX salvo no servidor.");
    } catch (uploadError) {
      setError(getUploadErrorMessage(uploadError, "Falha ao enviar o PPTX."));
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment() {
    if (!hasSavedAttachment) return;
    setRemovingAttachment(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch(buildDirectApiPath("/master/email/attachment"), {
        method: "DELETE",
        requireAuth: true,
        timeoutMs: 30000,
      });
      const refreshed = await apiFetch<MasterEmailState>("/master/email", { requireAuth: true });
      setState(refreshed);
      setMessage("Anexo PPTX removido do servidor.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Falha ao remover o anexo.");
    } finally {
      setRemovingAttachment(false);
    }
  }

  async function uploadBusinessCard(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("A assinatura precisa ser uma imagem PNG, JPG ou WEBP.");
      return;
    }
    if (file.size > MAX_BUSINESS_CARD_UPLOAD_BYTES) {
      setError(`A assinatura pode ter no máximo ${formatFileSize(MAX_BUSINESS_CARD_UPLOAD_BYTES)}.`);
      setMessage(null);
      return;
    }
    setUploadingBusinessCard(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file, getImageFilename(file));
      const payload = await apiFetch<{ ok: boolean; businessCard: MasterEmailState["businessCard"] }>(buildDirectApiPath("/master/email/business-card"), {
        method: "POST",
        body: form,
        requireAuth: true,
        timeoutMs: 60000,
      });
      const refreshed = await apiFetch<MasterEmailState>("/master/email", { requireAuth: true });
      setState({ ...refreshed, businessCard: payload.businessCard || refreshed.businessCard });
      setMessage("Assinatura digital salva no servidor.");
    } catch (uploadError) {
      setError(getUploadErrorMessage(uploadError, "Falha ao salvar assinatura."));
    } finally {
      setUploadingBusinessCard(false);
    }
  }

  async function removeBusinessCard() {
    if (!state?.businessCard) return;
    setRemovingBusinessCard(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch(buildDirectApiPath("/master/email/business-card"), {
        method: "DELETE",
        requireAuth: true,
        timeoutMs: 30000,
      });
      const refreshed = await apiFetch<MasterEmailState>("/master/email", { requireAuth: true });
      setState(refreshed);
      setMessage("Assinatura digital removida do servidor.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Falha ao remover assinatura.");
    } finally {
      setRemovingBusinessCard(false);
    }
  }

  async function sendNormalEmail() {
    const validationError = validateDraft("normal", drafts.normal);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }
    const blocker = getNormalSendBlocker({
      recipientName,
      recipientEmail,
      subject: drafts.normal.subject,
      text: drafts.normal.text,
      hasAttachment: hasSavedAttachment,
    });
    if (blocker) {
      setError(blocker);
      setMessage(null);
      return;
    }
    setSending(true);
    setMessage(null);
    setError(null);
    setLastSent(null);
    try {
      await saveFormState();
      const payload = await apiFetch<MasterEmailSendResponse>("/master/email/send", {
        method: "POST",
        body: JSON.stringify({
          recipientName,
          recipientEmail,
          subject: drafts.normal.subject,
          text: drafts.normal.text,
          html: drafts.normal.html || "",
        }),
        requireAuth: true,
        timeoutMs: 30000,
      });
      setLastSent(payload);
      setMessage(`E-mail enviado para ${payload.recipientEmail}.`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Falha ao enviar o e-mail.");
    } finally {
      setSending(false);
    }
  }

  if (hasToken === null || loadingKind === "all") {
    if (embedded) {
      return <div className="panel p-4 text-sm text-muted">Carregando central de e-mails...</div>;
    }
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className="panel p-4 text-sm text-muted">Carregando central de e-mails...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  const content = (
    <div className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <span>Central de modelos</span>
            <h2>{TEMPLATE_LABELS[activeTemplate]}</h2>
          </div>
          <strong data-ready={senderReady ? "true" : "false"}>
            {senderReady ? "SMTP pronto" : "SMTP incompleto"}
          </strong>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Modelos de e-mail">
          {TEMPLATE_ORDER.map((kind) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={activeTemplate === kind}
              className={styles.tabButton}
              data-active={activeTemplate === kind ? "true" : "false"}
              onClick={() => {
                setActiveTemplate(kind);
                setError(null);
                setMessage(null);
              }}
            >
              {TEMPLATE_LABELS[kind]}
            </button>
          ))}
        </div>

        {!isNormal && (activeTemplate === "password_reset" || activeTemplate === "email_confirmation") ? (
          <div className={styles.warning}>
            {activeTemplate === "password_reset"
              ? "Este modelo é usado automaticamente quando o usuário pede recuperação de senha."
              : "Este modelo é usado automaticamente no cadastro e reenvio de confirmação."}
          </div>
        ) : null}

        {isNormal ? (
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Nome do contato</span>
              <input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Amanda" />
            </label>
            <label className={styles.field}>
              <span>E-mail do contato</span>
              <input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="cliente@empresa.com.br" />
            </label>
          </div>
        ) : null}

        <label className={styles.field}>
          <span>Assunto</span>
          <input value={activeDraft.subject} onChange={(event) => updateDraft({ subject: event.target.value })} placeholder="Assunto do e-mail" />
        </label>

        <div className={styles.editorHeader}>
          <span>Mensagem</span>
          <div className={styles.editorTools}>
            {activeTemplate === "seller_welcome" ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={injectSellerContractTemplate} disabled={operationBusy}>
                Editar contrato
              </button>
            ) : null}
            {activeTemplate === "seller_welcome" ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={injectSellerWelcomeTemplate} disabled={operationBusy}>
                Injetar boas-vindas
              </button>
            ) : null}
            {activeVariableGroups.length ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVariablesOpen(true)} disabled={operationBusy}>
                Variáveis
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateDraft({ text: "", html: "" })} disabled={operationBusy}>
              Limpar mensagem
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={restoreTemplate} disabled={operationBusy}>
              Usar modelo padrão
            </button>
          </div>
        </div>

        <textarea
          className={styles.emailEditor}
          value={activeDraft.text}
          onChange={(event) => updateDraft({ text: event.target.value, html: "" })}
          onPaste={(event) => {
            const hasImage = Array.from(event.clipboardData?.items || []).some((item) => item.kind === "file" && item.type.startsWith("image/"));
            if (hasImage) event.preventDefault();
          }}
          onDrop={(event) => {
            if (Array.from(event.dataTransfer?.files || []).some((file) => file.type.startsWith("image/"))) {
              event.preventDefault();
            }
          }}
          placeholder="Escreva o corpo do e-mail"
          spellCheck
          disabled={loadingKind === activeTemplate}
        />

        {usesAttachment ? (
          <div className={styles.attachmentBox}>
            <div>
              <span>Anexo PPTX</span>
              <strong>{state?.attachment?.originalName || "Nenhum PPTX salvo"}</strong>
              <p>
                {state?.attachment
                  ? `Salvo no servidor • ${formatFileSize(state.attachment.size)} • ${formatDate(state.attachment.uploadedAt)}`
                  : "Não há PPTX salvo no servidor. Faça upload antes do envio comercial."}
              </p>
            </div>
            <span className={styles.statusBadge} data-ok={hasSavedAttachment ? "true" : "false"}>
              {hasSavedAttachment ? "Salvo no servidor" : "Pendente"}
            </span>
            <div className={styles.assetActions}>
              {hasSavedAttachment ? (
                <button type="button" className={styles.assetRemoveButton} onClick={removeAttachment} disabled={operationBusy}>
                  {removingAttachment ? "Removendo..." : "Remover atual"}
                </button>
              ) : null}
              <label className={styles.uploadButton}>
                {uploading ? "Enviando..." : hasSavedAttachment ? "Trocar PPTX" : "Adicionar PPTX"}
                <input
                  type="file"
                  accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    event.currentTarget.value = "";
                    void uploadAttachment(file);
                  }}
                  disabled={operationBusy}
                />
              </label>
            </div>
          </div>
        ) : null}

        {!senderReady ? (
          <div className={styles.warning}>
            Configure SMTP/MAIL no servidor antes do envio real. Pendências: {state?.sender.missing.join(", ") || "provedor não configurado"}.
          </div>
        ) : null}

        <div className={styles.actions}>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveTemplate} disabled={operationBusy}>
            {saving ? "Salvando..." : "Salvar modelo"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={restoreTemplate} disabled={operationBusy}>
            Restaurar padrão
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={sendTemplateTest} disabled={operationBusy}>
            {testing ? "Enviando teste..." : "Enviar teste"}
          </button>
          {isNormal ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={sendNormalEmail} disabled={operationBusy}>
              {sending ? "Enviando..." : "Enviar e-mail"}
            </button>
          ) : null}
        </div>
      </section>

      <aside className={styles.side}>
        <div className={styles.sideCard}>
          <span>Teste</span>
          <label className={styles.sideField}>
            E-mail
            <input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="email@teste.com" />
          </label>
          <label className={styles.sideField}>
            Nome
            <input value={sampleName} onChange={(event) => setSampleName(event.target.value)} placeholder="Amanda" />
          </label>
          <label className={styles.sideField}>
            Empresa
            <input value={sampleCompany} onChange={(event) => setSampleCompany(event.target.value)} placeholder="Empresa Teste" />
          </label>
        </div>

        {usesSignature ? (
          <div className={styles.sideCard}>
            <span>Assinatura digital</span>
            <strong>{hasSavedSignature ? "Imagem salva no servidor" : "Sem imagem salva"}</strong>
            <p>{state?.businessCard ? `Salva no servidor • ${formatFileSize(state.businessCard.size)} • ${formatDate(state.businessCard.uploadedAt)}` : "Opcional. Entra automaticamente no final do e-mail e na prévia."}</p>
            <span className={styles.statusBadge} data-ok={hasSavedSignature ? "true" : "false"}>
              {hasSavedSignature ? "Salva no servidor" : "Pendente"}
            </span>
            {state?.businessCard ? (
              <button type="button" className={`${styles.assetRemoveButton} ${styles.fullButton}`} onClick={removeBusinessCard} disabled={operationBusy}>
                {removingBusinessCard ? "Removendo..." : "Remover assinatura atual"}
              </button>
            ) : null}
            <label className={`${styles.uploadButton} ${styles.fullButton}`}>
              {uploadingBusinessCard ? "Salvando..." : state?.businessCard ? "Trocar assinatura" : "Adicionar assinatura"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  void uploadBusinessCard(file);
                }}
                disabled={operationBusy}
              />
            </label>
            {state?.businessCard?.previewDataUrl ? (
              <img className={styles.signaturePreview} src={state.businessCard.previewDataUrl} alt="Assinatura comercial" />
            ) : null}
          </div>
        ) : null}

        <div className={styles.previewCard}>
          <span>Prévia</span>
          <strong>{preview.subject || "Sem assunto"}</strong>
          <div className={styles.previewBody} dangerouslySetInnerHTML={{ __html: preview.html || "&nbsp;" }} />
          {usesAttachment ? (
            <div className={styles.previewAttachment} data-ok={hasSavedAttachment ? "true" : "false"}>
              <span>Anexo fixo</span>
              <strong>{state?.attachment?.originalName || "Nenhum PPTX salvo"}</strong>
              <small>{state?.attachment ? `${formatFileSize(state.attachment.size)} • ${formatDate(state.attachment.uploadedAt)}` : "Pendente no servidor"}</small>
            </div>
          ) : null}
          {usesSignature && state?.businessCard?.previewDataUrl ? (
            <>
              <div className={styles.previewDivider}>Assinatura digital anexada ao final</div>
              <img className={styles.previewSignature} src={state.businessCard.previewDataUrl} alt="Assinatura digital no e-mail" />
            </>
          ) : null}
        </div>

        <div className={styles.sideCard}>
          <span>Remetente</span>
          <strong>{state?.sender.from || "HBX <jhonatan@hbxsystem.com.br>"}</strong>
          <p>Resposta para {state?.sender.replyTo || "jhonatan@hbxsystem.com.br"}</p>
        </div>

        {lastSent ? (
          <div className={styles.sideCard}>
            <span>Último envio</span>
            <strong>{lastSent.recipientName}</strong>
            <p>{lastSent.recipientEmail} • {formatDate(lastSent.sentAt)}</p>
          </div>
        ) : null}
      </aside>
    </div>
  );

  const variableDrawer = typeof document !== "undefined" && variablesOpen && activeVariableGroups.length
    ? createPortal(
        <aside className={styles.variableDrawer} role="dialog" aria-modal="false" aria-labelledby="master-email-variable-title">
          <header className={styles.variableDrawerHeader}>
            <div>
              <span>Biblioteca</span>
              <strong id="master-email-variable-title">Variáveis disponíveis</strong>
            </div>
            <button type="button" onClick={() => setVariablesOpen(false)} aria-label="Fechar variáveis">
              ×
            </button>
          </header>
          <div className={styles.variableDrawerBody}>
            {requiredVariable ? <p className={styles.variableRequired}>Obrigatória: {requiredVariable}</p> : null}
            <div className={styles.variableGroups}>
              {activeVariableGroups.map((entry) => (
                <section key={entry.group} className={styles.variableGroup}>
                  <strong>{VARIABLE_GROUP_LABELS[entry.group]}</strong>
                  <div>
                    {entry.items.map((variable) => (
                      <button
                        key={variable.token}
                        type="button"
                        onClick={() => updateDraft({ text: `${activeDraft.text}${activeDraft.text ? "\n" : ""}${variable.token}`, html: "" })}
                        className={styles.variableChip}
                        title={variable.description}
                      >
                        <span>{variable.token}</span>
                        <small>{variable.label}</small>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </aside>,
        document.body,
      )
    : null;

  const toast = typeof document !== "undefined" && (error || message)
    ? createPortal(
        <div className={styles.toastDock} aria-live="polite">
          <div
            className={`${styles.toast} ${error ? styles.toastError : styles.toastSuccess}`}
            role={error ? "alert" : "status"}
          >
            <span className={styles.toastEyebrow}>{error ? "Atenção" : "Confirmado"}</span>
            <strong>{error || message}</strong>
          </div>
        </div>,
        document.body,
      )
    : null;

  if (embedded) {
    return (
      <>
        {content}
        {variableDrawer}
        {toast}
      </>
    );
  }

  return (
    <>
      <DashboardScaffold
        title="E-mail"
        description="Central MASTER de modelos comerciais e transacionais do HBX."
        actions={<Link href="/master" className="btn btn-secondary btn-sm">Voltar ao Master</Link>}
      >
        {content}
      </DashboardScaffold>
      {variableDrawer}
      {toast}
    </>
  );
}

export default function MasterEmailClientPage() {
  return <MasterEmailWorkspace />;
}
