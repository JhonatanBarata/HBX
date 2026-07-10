"use client";

// Tela ÚNICA do vendedor (ordem do dono, 14/06/2026): a MESMA tela cria e
// gerencia — antes eram dois modais divergentes (Novo acesso × Gerenciar) e isso
// era a bagunça. Agora `member` ausente = criar; `member` presente = gerenciar
// (mesma cara, mesmos campos, upload de documento sempre disponível).
//
// PR12062026005 (cadastro completo) + 13/06 (admin singular: dono cunha Vendedor
// ou Gerente; quem cunha admin-pagante é o Master). Acesso por CARGO mora em
// Configurações → Equipe → "Acesso do cargo Vendedor" (cargo-acessos-editor),
// NÃO mais aqui — a antiga aba "Acessos" por pessoa saiu.
// Contratos:
//   POST  /users/company/create        → cria (senha opcional; "salvar
//         documentação" = requiresSellerOnboarding → nasce inativa)
//   PATCH /users/:id/profile           → salva dados do vendedor existente
//   PATCH /users/:id/active            → liberar/ativar (boas-vindas) ou desativar
//   GET   /users/company/seat-billing  → assento é GRÁTIS (CRÉDITOS FASE 2/R4);
//         só resta o teto operacional do master (seatCap), quando configurado
//   GET   /company-email               → gate do disparo de e-mail manual
//   GET   /gerencial/hbx-partners/:id/onboarding             → estado + anexos
//   POST  /gerencial/hbx-partners/:id/onboarding/attachments (file+kind) → upload
//   PATCH /gerencial/hbx-partners/:id/onboarding/document-requirement
//   GET/PATCH /gerencial/hbx-partners/onboarding/contract-template
//   POST  /gerencial/hbx-partners/:id/onboarding/generate-contract
//   POST  /gerencial/hbx-partners/:id/onboarding/send-email  → Solicitar documentos

import React, { useEffect, useRef, useState } from "react";

import { Av } from "@/components/hbx/shell";
import { SignaturePad, type SignaturePadHandle } from "@/components/hbx/signature-pad";
import { apiFetch, getApiBase, getToken } from "@/lib/api";

type CompanyUser = { id: number; name?: string | null; username?: string | null; email?: string | null; role?: string | null; isActive?: boolean; commissionMonthlyCap?: number | null; setupCommissionCap?: number | null; phone?: string | null; commissionPercent?: number | null; referredByUserId?: number | null; sellerDistributionDailyLimitOverride?: number | null; deactivatedAt?: string | null };

// CRÉDITOS FASE 2 (R4): assento é grátis — só o teto operacional (seatCap)
// sobrevive nesta tela; planTitle/extraUserMonthlyPrice/nextUserIsExtra
// saíram (o backend ainda devolve por compat, mas não há mais custo a exibir).
type SeatBilling = { activeUsers?: number; seatCap?: number | null; capReached?: boolean } | null;

type OnboardingAttachment = { id: string; kind: string; status?: string | null; originalFilename?: string | null };

type Onboarding = {
  id?: string;
  status?: string | null;
  emailStatus?: string | null;
  phone?: string | null;
  cpf?: string | null;
  declaredAddress?: string | null;
  commissionPercent?: number | null;
  commissionDueBusinessDays?: number | null;
  attachments?: OnboardingAttachment[];
  documentRequirements?: Record<string, boolean> | null;
  user?: { emailConfirmedAt?: string | null } | null;
} | null;

const DOC_SLOTS: { kind: string; label: string; defaultRequired: boolean }[] = [
  { kind: "photo_id", label: "Documento", defaultRequired: true },
  { kind: "curriculum", label: "Currículo", defaultRequired: false },
  { kind: "contract_pdf", label: "Contrato assinado", defaultRequired: false },
  { kind: "other", label: "Outro", defaultRequired: false },
];

const FORM_VAZIO = {
  role: "USER" as "USER" | "ADMIN",
  username: "",
  name: "",
  email: "",
  phone: "",
  commissionPercent: "",
  commissionMonthlyCap: "",
  setupCommissionCap: "",
  commissionDueBusinessDays: "3",
  salvarDocumentacao: false,
  cpf: "",
  password: "",
  declaredAddress: "",
  referredByUserId: "",
  dailyLimit: "30",
};

// Rascunho do cadastro em andamento (ordem do dono 14/06: F5 não pode perder o
// que está aberto). Só no modo CRIAR. Guarda o necessário pra reabrir — NUNCA a
// senha. Some ao concluir/fechar; abertura por clique começa limpa (o pai apaga).
const DRAFT_KEY = "hbx:novo-acesso-draft";
type Draft = { form?: Partial<typeof FORM_VAZIO>; createdUserId?: number | null };
function lerRascunho(): Draft | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
}
function limparRascunho() {
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* sem storage */ }
}

const lbl = { fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" } as const;

// member ausente = criar; presente = gerenciar (mesma tela). O componente monta
// APENAS aberto (o pai condiciona a renderização).
export function NovoAcessoModal({ onClose, onDone, team, member = null, isSelf = false, onRequestExcluir }: {
  onClose: () => void;
  onDone: (message: string) => void;
  team: CompanyUser[];
  member?: CompanyUser | null;
  isSelf?: boolean;
  onRequestExcluir?: (m: CompanyUser) => void;
}) {
  const isEdit = Boolean(member);

  // restaura o rascunho UMA vez no mount (só CRIAR). No modo gerenciar o estado
  // nasce do `member` + onboarding do servidor.
  const rascunho0 = useRef<Draft | null | undefined>(undefined);
  if (rascunho0.current === undefined) rascunho0.current = isEdit ? null : lerRascunho();
  const [form, setForm] = useState(() => (isEdit
    ? {
        // Reaproveitar dados no Gerenciar (P4): pré-preenche tudo que o membro já
        // tem (a lista /users/company traz telefone, comissão, indicador, limite/dia).
        // O resto (CPF/endereço/D+) chega depois via refreshOnboarding.
        ...FORM_VAZIO,
        role: (String(member?.role || "").toUpperCase() === "ADMIN" ? "ADMIN" : "USER") as "USER" | "ADMIN",
        name: member?.name || "",
        email: member?.email || "",
        phone: member?.phone || "",
        commissionPercent: member?.commissionPercent != null ? String(member.commissionPercent) : "",
        commissionMonthlyCap: member?.commissionMonthlyCap != null ? String(member.commissionMonthlyCap) : "",
        setupCommissionCap: member?.setupCommissionCap != null ? String(member.setupCommissionCap) : "",
        referredByUserId: member?.referredByUserId != null ? String(member.referredByUserId) : "",
        dailyLimit: member?.sellerDistributionDailyLimitOverride != null ? String(member.sellerDistributionDailyLimitOverride) : "30",
      }
    : { ...FORM_VAZIO, ...(rascunho0.current?.form || {}) }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Cadastro simples (usuário+senha) é o padrão ao CRIAR; "Cadastro completo"
  // revela o formulário inteiro de hoje. Gerenciar não tem modo simples.
  const [modoCompleto, setModoCompleto] = useState(false);
  // Aviso ao vivo: o usuário já existe? (único GLOBAL). O create revalida no servidor.
  const [usernameCheck, setUsernameCheck] = useState<"" | "checking" | "free" | "taken">("");
  const [seatInfo, setSeatInfo] = useState<SeatBilling>(null);
  const [emailUsable, setEmailUsable] = useState(false);
  const [createdUserId, setCreatedUserId] = useState<number | null>(() => member?.id ?? rascunho0.current?.createdUserId ?? null);
  const [onboarding, setOnboarding] = useState<Onboarding>(null);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [liberarArm, setLiberarArm] = useState(false);
  const [senhaTemporaria, setSenhaTemporaria] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [busySenha, setBusySenha] = useState(false);
  const [reqState, setReqState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(DOC_SLOTS.map(s => [s.kind, s.defaultRequired])),
  );

  // Editar modelo do contrato
  const [modeloOpen, setModeloOpen] = useState(false);
  const [modeloText, setModeloText] = useState("");
  const [modeloBusy, setModeloBusy] = useState(false);
  const [modeloMsg, setModeloMsg] = useState<string | null>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [sigBusy, setSigBusy] = useState(false);
  const padRef = useRef<SignaturePadHandle | null>(null);

  // Fechar SÓ quando o clique NASCE e TERMINA no fundo escuro. Sem isso, começar o
  // clique dentro do formulário (selecionar texto) e soltar o mouse fora fechava o
  // modal e perdia tudo o que estava preenchido. (ordem do dono 15/06). Um ref por
  // veil — o submodal "Editar modelo" fica aninhado neste e não pode dividir o ref.
  const veilDownRef = useRef(false);
  const modeloDownRef = useRef(false);

  useEffect(() => {
    let alive = true;
    if (!isEdit) {
      apiFetch<SeatBilling>("/users/company/seat-billing")
        .then(res => { if (alive) setSeatInfo(res); })
        .catch(() => { if (alive) setSeatInfo(null); });
    }
    // Probe NÃO-gated: /company-email é travado por @ModuleAccess('email') e dá 403
    // (floodando o console) em empresa sem o módulo. /company-email/status só exige
    // login e devolve {enabled, ready} — é o probe certo pra acender o botão de e-mail.
    apiFetch<{ enabled?: boolean; ready?: boolean }>("/company-email/status")
      .then(res => { if (alive) setEmailUsable(Boolean(res?.enabled && res?.ready)); })
      .catch(() => { if (alive) setEmailUsable(false); });
    // gerenciar (ou F5 com cadastro já criado): recarrega documentos do servidor.
    const alvo = member?.id ?? rascunho0.current?.createdUserId;
    if (alvo) refreshOnboarding(alvo);
    return () => { alive = false; };
    // montagem única (carrega assento/e-mail + documentos do alvo). Reagir a
    // member/isEdit aqui reabriria fetch a cada render — intencionalmente fora.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persiste o rascunho a cada mudança (só CRIAR; sem a senha).
  useEffect(() => {
    if (isEdit || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: { ...form, password: "" }, createdUserId }));
    } catch { /* sem storage */ }
  }, [form, createdUserId, isEdit]);

  // Aviso "esse usuário já existe?" enquanto digita (debounce). Só ao CRIAR.
  // setState fica DENTRO do timeout (assíncrono) — não pode ser síncrono no corpo.
  useEffect(() => {
    if (isEdit) return;
    const u = form.username.trim().toLowerCase();
    const valido = u.length >= 2 && !u.includes("@");
    const t = setTimeout(() => {
      if (!valido) { setUsernameCheck(""); return; }
      setUsernameCheck("checking");
      apiFetch<{ available?: boolean }>(`/users/company/username-available?u=${encodeURIComponent(u)}`)
        .then(r => setUsernameCheck(r?.available ? "free" : "taken"))
        .catch(() => setUsernameCheck(""));
    }, valido ? 400 : 0);
    return () => clearTimeout(t);
  }, [form.username, isEdit]);

  function fechar() {
    if (!isEdit) {
      limparRascunho();
      if (createdUserId) onDone("✓ Acesso criado — documentação salva no cadastro do vendedor.");
    }
    onClose();
  }

  async function refreshOnboarding(userId: number) {
    try {
      const res = await apiFetch<Onboarding>(`/gerencial/hbx-partners/${userId}/onboarding`);
      setOnboarding(res);
      const reqs = res?.documentRequirements;
      if (reqs && typeof reqs === "object") setReqState(prev => ({ ...prev, ...reqs }));
      // gerenciar: completa os dados que só vêm do onboarding (não estão no member).
      if (isEdit) {
        setForm(f => ({
          ...f,
          phone: f.phone || res?.phone || "",
          commissionPercent: f.commissionPercent || (res?.commissionPercent != null ? String(res.commissionPercent) : ""),
          commissionDueBusinessDays: res?.commissionDueBusinessDays != null ? String(res.commissionDueBusinessDays) : f.commissionDueBusinessDays,
          cpf: f.cpf || res?.cpf || "",
          declaredAddress: f.declaredAddress || res?.declaredAddress || "",
        }));
      }
    } catch { /* painel segue com o estado local */ }
  }

  async function criar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isEdit) { salvarEdicao(); return; }
    if (busy || createdUserId) return;
    const usuario = form.username.trim();
    const temEmail = Boolean(form.email.trim());
    if (!usuario && !temEmail) { setMsg("Informe um usuário (ou um e-mail no cadastro completo)."); return; }
    if (usernameCheck === "taken") { setMsg("Esse usuário já existe — escolha outro."); return; }
    if (!temEmail && !form.password.trim()) { setMsg("Sem e-mail, defina uma senha — ela é o acesso do vendedor."); return; }
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        ...(usuario ? { username: usuario } : {}),
        ...(temEmail ? { email: form.email.trim() } : {}),
        role: form.role,
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.commissionPercent !== "" ? { commissionPercent: Number(form.commissionPercent) } : {}),
        ...(form.commissionMonthlyCap !== "" ? { commissionMonthlyCap: Number(form.commissionMonthlyCap) } : {}),
        ...(form.setupCommissionCap !== "" ? { setupCommissionCap: Number(form.setupCommissionCap) } : {}),
        ...(form.commissionDueBusinessDays !== "" ? { commissionDueBusinessDays: Number(form.commissionDueBusinessDays) } : {}),
        ...(form.password.trim() ? { password: form.password.trim() } : {}),
        ...(form.role === "USER" && form.salvarDocumentacao ? { requiresSellerOnboarding: true } : {}),
        ...(form.role === "USER" && form.cpf.trim() ? { cpf: form.cpf.trim() } : {}),
        ...(form.role === "USER" && form.declaredAddress.trim() ? { declaredAddress: form.declaredAddress.trim() } : {}),
        ...(form.role === "USER" && form.referredByUserId ? { referredByUserId: Number(form.referredByUserId) } : {}),
        ...(form.dailyLimit !== "" ? { sellerDistributionDailyLimitOverride: Number(form.dailyLimit) } : {}),
      };
      const res = await apiFetch<{ user?: { id?: number; isActive?: boolean } }>("/users/company/create", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const userId = Number(res?.user?.id || 0);
      const comDocumentacao = form.role === "USER" && (form.salvarDocumentacao || form.cpf.trim() || form.declaredAddress.trim());
      if (comDocumentacao && userId) {
        setCreatedUserId(userId);
        setMsg("✓ Acesso criado — agora anexe a documentação e gere o contrato.");
        await refreshOnboarding(userId);
      } else {
        limparRascunho();
        onDone(form.password.trim()
          ? "✓ Acesso criado com senha definida (troca obrigatória no 1º login)."
          : "✓ Acesso criado. Sem senha definida — libere o acesso (boas-vindas) ou edite e defina a senha.");
        onClose();
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível criar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  async function salvarEdicao() {
    if (!member || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const emailEditado = form.email.trim().toLowerCase();
      await apiFetch(`/users/${member.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(emailEditado && emailEditado !== String(member.email || "").toLowerCase() ? { email: emailEditado } : {}),
          ...(form.name.trim() ? { name: form.name.trim() } : {}),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.commissionPercent !== "" ? { commissionPercent: Number(form.commissionPercent) } : {}),
          ...(form.commissionMonthlyCap !== "" ? { commissionMonthlyCap: Number(form.commissionMonthlyCap) } : {}),
          ...(form.setupCommissionCap !== "" ? { setupCommissionCap: Number(form.setupCommissionCap) } : {}),
          ...(form.referredByUserId ? { referredByUserId: Number(form.referredByUserId) } : {}),
          ...(form.dailyLimit !== "" ? { sellerDistributionDailyLimitOverride: Number(form.dailyLimit) } : {}),
        }),
      });
      setMsg("✓ Dados salvos.");
      onDone("✓ Perfil do vendedor atualizado.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function redefinirSenha() {
    if (!member || busySenha || novaSenha.trim().length < 8) return;
    setBusySenha(true);
    setMsg(null);
    try {
      await apiFetch(`/users/${member.id}/reset-password`, {
        method: "PATCH",
        body: JSON.stringify({ password: novaSenha.trim() }),
      });
      setNovaSenha("");
      setMsg("✓ Senha redefinida — vendedor troca no próximo login.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível redefinir a senha.");
    } finally {
      setBusySenha(false);
    }
  }

  async function alternarAtivo() {
    if (!member || busy) return;
    setBusy(true);
    setMsg(null);
    setSenhaTemporaria(null);
    try {
      const res = await apiFetch<{ message?: string; temporaryPassword?: string | null }>(`/users/${member.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ active: member.isActive === false }),
      });
      if (res?.temporaryPassword) {
        // e-mail de boas-vindas falhou — credencial fica na tela pra entrega na mão
        setSenhaTemporaria(res.temporaryPassword);
        setMsg(`✓ ${res?.message || "Acesso liberado."}`);
        onDone(`✓ ${res?.message || "Acesso liberado."}`);
      } else {
        onDone(`✓ ${res?.message || "Status atualizado."}`);
        onClose();
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível alterar o status.");
    } finally {
      setBusy(false);
      setLiberarArm(false);
    }
  }

  function anexoDe(kind: string) {
    return (onboarding?.attachments || []).find(a => a.kind === kind && a.status !== "deleted") || null;
  }

  async function uploadDoc(kind: string, file: File | null | undefined) {
    if (!file || !createdUserId || docBusy) return;
    setDocBusy(kind);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      await apiFetch(`/gerencial/hbx-partners/${createdUserId}/onboarding/attachments`, { method: "POST", body: fd });
      await refreshOnboarding(createdUserId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha no upload do documento.");
    } finally {
      setDocBusy(null);
    }
  }

  async function alternarObrigatorio(kind: string) {
    if (!createdUserId || docBusy) return;
    const next = !reqState[kind];
    setDocBusy(kind);
    try {
      await apiFetch(`/gerencial/hbx-partners/${createdUserId}/onboarding/document-requirement`, {
        method: "PATCH",
        body: JSON.stringify({ kind, required: next }),
      });
      setReqState(prev => ({ ...prev, [kind]: next }));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível alterar a exigência.");
    } finally {
      setDocBusy(null);
    }
  }

  async function gerarContrato() {
    if (!createdUserId || docBusy) return;
    setDocBusy("contrato");
    setMsg(null);
    try {
      await apiFetch(`/gerencial/hbx-partners/${createdUserId}/onboarding/generate-contract`, { method: "POST", body: JSON.stringify({}) });
      setMsg("✓ Contrato PDF gerado — vai junto no e-mail de onboarding.");
      await refreshOnboarding(createdUserId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível gerar o contrato.");
    } finally {
      setDocBusy(null);
    }
  }

  async function baixarAnexo(att: OnboardingAttachment) {
    if (!createdUserId || docBusy) return;
    setDocBusy(`baixar:${att.id}`);
    setMsg(null);
    try {
      const res = await fetch(
        `${getApiBase()}/gerencial/hbx-partners/${createdUserId}/onboarding/attachments/${encodeURIComponent(att.id)}/download`,
        { headers: { Authorization: `Bearer ${getToken() || ""}` } },
      );
      if (!res.ok) throw new Error("Não foi possível baixar o arquivo.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.originalFilename || "documento";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha no download.");
    } finally {
      setDocBusy(null);
    }
  }

  async function removerDoc(att: OnboardingAttachment) {
    if (!createdUserId || docBusy) return;
    setDocBusy(`remover:${att.id}`);
    setMsg(null);
    try {
      await apiFetch(`/gerencial/hbx-partners/${createdUserId}/onboarding/attachments/${encodeURIComponent(att.id)}`, { method: "DELETE" });
      await refreshOnboarding(createdUserId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não foi possível remover o anexo.");
    } finally {
      setDocBusy(null);
    }
  }

  async function solicitarDocumentos() {
    if (!createdUserId || docBusy) return;
    setDocBusy("email");
    setMsg(null);
    try {
      const res = await apiFetch<{ ok?: boolean; delivery?: { errorMessage?: string | null } }>(
        `/gerencial/hbx-partners/${createdUserId}/onboarding/send-email`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setMsg(res?.ok ? "✓ E-mail de onboarding enviado — documentos solicitados." : res?.delivery?.errorMessage || "O envio falhou.");
      await refreshOnboarding(createdUserId);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "O envio do onboarding falhou.");
    } finally {
      setDocBusy(null);
    }
  }

  async function abrirModelo() {
    setModeloMsg(null);
    setModeloOpen(true);
    setModeloBusy(true);
    try {
      const res = await apiFetch<{ template?: string; contractTemplate?: string; text?: string }>("/gerencial/hbx-partners/onboarding/contract-template");
      setModeloText(String(res?.template ?? res?.contractTemplate ?? res?.text ?? ""));
      apiFetch<{ dataUrl?: string | null }>("/gerencial/hbx-partners/onboarding/company-signature")
        .then(r => setSigUrl(r?.dataUrl || null)).catch(() => setSigUrl(null));
    } catch (err) {
      setModeloMsg(err instanceof Error ? err.message : "Não foi possível carregar o modelo.");
    } finally {
      setModeloBusy(false);
    }
  }

  async function salvarAssinatura() {
    if (sigBusy) return;
    if (padRef.current?.isEmpty()) { setModeloMsg("Desenhe a assinatura antes de salvar."); return; }
    const dataUrl = padRef.current?.toDataUrl();
    if (!dataUrl) { setModeloMsg("Não foi possível ler a assinatura."); return; }
    setSigBusy(true);
    setModeloMsg(null);
    try {
      await apiFetch("/gerencial/hbx-partners/onboarding/company-signature", { method: "POST", body: JSON.stringify({ dataUrl }) });
      setSigUrl(dataUrl);
      setModeloMsg("✓ Assinatura salva — entra automática nos contratos.");
    } catch (err) {
      setModeloMsg(err instanceof Error ? err.message : "Não foi possível salvar a assinatura.");
    } finally {
      setSigBusy(false);
    }
  }

  async function removerAssinatura() {
    if (sigBusy) return;
    setSigBusy(true);
    setModeloMsg(null);
    try {
      await apiFetch("/gerencial/hbx-partners/onboarding/company-signature", { method: "DELETE" });
      setSigUrl(null);
      padRef.current?.clear();
      setModeloMsg("✓ Assinatura removida.");
    } catch (err) {
      setModeloMsg(err instanceof Error ? err.message : "Não foi possível remover a assinatura.");
    } finally {
      setSigBusy(false);
    }
  }

  async function salvarModelo() {
    if (modeloBusy) return;
    setModeloBusy(true);
    setModeloMsg(null);
    try {
      await apiFetch("/gerencial/hbx-partners/onboarding/contract-template", {
        method: "PATCH",
        body: JSON.stringify({ template: modeloText }),
      });
      setModeloMsg("✓ Modelo de contrato salvo.");
    } catch (err) {
      setModeloMsg(err instanceof Error ? err.message : "Não foi possível salvar o modelo.");
    } finally {
      setModeloBusy(false);
    }
  }

  const vendedor = form.role === "USER";
  const indicador = team.find(m => String(m.id) === form.referredByUserId) || null;
  const sellers = team.filter(m => String(m.role || "").toUpperCase() === "USER" && m.isActive !== false && m.id !== member?.id);
  const painelAtivo = Boolean(createdUserId);
  // CRIAR: trava o formulário depois que o acesso foi criado. GERENCIAR: campos
  // editáveis sempre; o que é só-de-cadastro (cargo/e-mail/CPF/senha/endereço/D+)
  // fica travado porque o backend não deixa editar depois.
  const travaForm = painelAtivo && !isEdit;
  const soCadastro = travaForm || isEdit;
  const ativo = member?.isActive !== false;
  const emailConfirmado = Boolean(onboarding?.user?.emailConfirmedAt);
  // Já foi liberado uma vez? (onboarding aprovado ou membro que já esteve ativo e
  // foi desativado). Quem já passou pela 1ª liberação reativa direto — sem checklist
  // de documentos e sem confirmação de e-mail (espelha a regra do backend).
  const jaLiberado = onboarding?.status === "approved" || Boolean(member?.deactivatedAt);
  const nomeMembro = member?.name || member?.username || member?.email || (member ? `Usuário ${member.id}` : "");
  const avisoUsuario = !isEdit && usernameCheck ? (
    usernameCheck === "checking"
      ? <span className="hint">Verificando…</span>
      : <span className={"tag " + (usernameCheck === "taken" ? "red" : "teal")}>
          {usernameCheck === "taken" ? "Esse usuário já existe — escolha outro." : "✓ Disponível"}
        </span>
  ) : null;

  return (
    <div className="hbx-veil"
      onMouseDown={e => { veilDownRef.current = e.target === e.currentTarget; }}
      onClick={e => { const ok = e.target === e.currentTarget && veilDownRef.current; veilDownRef.current = false; if (ok) fechar(); }}>
      <div className="hbx-modal" style={{ width: "min(880px, 100%)", maxHeight: "92vh", overflowY: "auto", display: "grid", gap: 14, padding: 22 }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {isEdit ? (
            <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
              <Av name={nomeMembro} size={34} />
              <span>
                {nomeMembro}
                <small style={{ display: "block", fontSize: "0.64rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  {vendedor ? "Vendedor" : "Gerente"} · {ativo ? "Ativo" : "Inativo"}
                </small>
              </span>
            </span>
          ) : (
            <span>Novo acesso <small style={{ display: "block", fontSize: "0.64rem", fontWeight: 600, color: "var(--text-muted)" }}>Cadastro de vendedor</small></span>
          )}
          <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={fechar}>✕</span>
        </h3>

        {/* CRÉDITOS FASE 2 (R4): assento é GRÁTIS — sem aviso de custo/assento
            extra. Só resta o teto operacional (seatCap), quando o master
            configurou um. */}
        {seatInfo && !painelAtivo && seatInfo.seatCap != null && (
          <div style={{ padding: "9px 11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", fontSize: "0.68rem", lineHeight: 1.5 }}>
            {seatInfo.capReached
              ? `Teto de ${seatInfo.seatCap} acesso(s) atingido — peça ao master para aumentar.`
              : `${seatInfo.activeUsers ?? "—"} de ${seatInfo.seatCap} acesso(s) em uso.`}
          </div>
        )}
        {msg && <div style={{ fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.5, color: msg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{msg}</div>}
        {senhaTemporaria && (
          <div className="ok show" style={{ display: "grid", gap: 4 }}>
            <strong style={{ fontSize: "0.74rem" }}>O e-mail de boas-vindas NÃO saiu — entregue a credencial na mão:</strong>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>{member?.email} · {senhaTemporaria}</span>
            <span style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>Troca obrigatória no primeiro login.</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
          {/* coluna esquerda — formulário */}
          <form onSubmit={criar} style={{ display: "grid", gap: 11 }}>
            {!isEdit && !modoCompleto ? (
              /* ===== CADASTRO SIMPLES: usuário + senha. Acabou. ===== */
              <React.Fragment>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>Usuário (login)</label>
                  <input className="field-dark" maxLength={60} autoFocus placeholder="ex.: joao.silva" value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                  {avisoUsuario}
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>Senha</label>
                  <input className="field-dark" type="password" minLength={8} maxLength={120} placeholder="mín. 8" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
                </div>
                <button className="btn-teal" type="submit" disabled={busy || usernameCheck === "taken" || !form.username.trim() || !form.password.trim()} style={{ minHeight: 42 }}>
                  {busy ? "Criando…" : "Criar acesso"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setModoCompleto(true)}>Cadastro completo ▸</button>
                <span className="hint">
                  Só usuário e senha — ele entra digitando o usuário. E-mail, comissão, documentos e contrato ficam no cadastro completo.
                </span>
              </React.Fragment>
            ) : (
              <React.Fragment>
            {!isEdit && (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Usuário (login)</label>
                <input className="field-dark" maxLength={60} placeholder="ex.: joao.silva" value={form.username} disabled={travaForm}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                {avisoUsuario}
              </div>
            )}
            {/* Régua única (PR13062026007 P5): Dono cunha Vendedor ou Gerente.
                Cargo só no cadastro — quem troca papel depois é o Master. */}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>Cargo</label>
              <select className="field-dark" value={form.role} disabled={soCadastro}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as "USER" | "ADMIN" }))}>
                <option value="USER">Vendedor</option>
                <option value="ADMIN">Gerente (não vê cobrança)</option>
              </select>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>Nome</label>
              <input className="field-dark" maxLength={120} value={form.name} disabled={travaForm}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>E-mail{isEdit ? " (login / Google)" : " (opcional)"}</label>
              {/* Editável no GERENCIAR (admin libera login com Google p/ vendedor — vínculo por e-mail). Travado só durante o painel pós-criação. */}
              <input className="field-dark" type="email" maxLength={180} value={form.email} disabled={travaForm}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>WhatsApp</label>
              <input className="field-dark" maxLength={30} placeholder="(11) 99999-9999" value={form.phone} disabled={travaForm}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Comissão (%)</label>
                <input className="field-dark" type="number" min={0} max={100} step="0.01" value={form.commissionPercent} disabled={travaForm}
                  onChange={e => setForm(f => ({ ...f, commissionPercent: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>D+ (dias úteis)</label>
                <input className="field-dark" type="number" min={0} max={30} value={form.commissionDueBusinessDays} disabled={soCadastro}
                  onChange={e => setForm(f => ({ ...f, commissionDueBusinessDays: e.target.value }))} />
              </div>
            </div>
            {/* Teto de comissão (PR13062026007): admin-only; o vendedor nunca vê este valor. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Teto comissão mensal (R$)</label>
                <input className="field-dark" type="number" min={0} step="0.01" placeholder="sem teto" value={form.commissionMonthlyCap} disabled={travaForm}
                  onChange={e => setForm(f => ({ ...f, commissionMonthlyCap: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Teto comissão implantação (R$)</label>
                <input className="field-dark" type="number" min={0} step="0.01" placeholder="sem teto" value={form.setupCommissionCap} disabled={travaForm}
                  onChange={e => setForm(f => ({ ...f, setupCommissionCap: e.target.value }))} />
              </div>
            </div>
            {vendedor && !isEdit && (
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-hairline)", background: "var(--hbx-surface-soft)", cursor: travaForm ? "default" : "pointer" }}>
                <input type="checkbox" checked={form.salvarDocumentacao} disabled={travaForm}
                  onChange={e => setForm(f => ({ ...f, salvarDocumentacao: e.target.checked }))} style={{ marginTop: 2 }} />
                <span style={{ fontSize: "0.7rem", lineHeight: 1.5 }}>
                  <strong>Salvar documentação deste vendedor</strong>
                  <span style={{ display: "block", color: "var(--text-muted)" }}>
                    Use quando quiser guardar documentos, contrato e liberar depois (o acesso nasce inativo). Desmarcado cria o acesso normalmente.
                  </span>
                </span>
              </label>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {vendedor && (
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>CPF</label>
                  <input className="field-dark" maxLength={20} value={form.cpf} disabled={soCadastro}
                    onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} />
                </div>
              )}
              {!isEdit && (
                <div style={{ display: "grid", gap: 6, gridColumn: vendedor ? undefined : "1 / -1" }}>
                  <label style={lbl}>Senha</label>
                  <input className="field-dark" type="password" minLength={8} maxLength={120} placeholder="opcional — mín. 8" value={form.password} disabled={travaForm}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
                </div>
              )}
            </div>
            {vendedor && (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={lbl}>Endereço</label>
                <input className="field-dark" maxLength={280} value={form.declaredAddress} disabled={soCadastro}
                  onChange={e => setForm(f => ({ ...f, declaredAddress: e.target.value }))} />
              </div>
            )}
            {vendedor && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>Indicado por</label>
                  <select className="field-dark" value={form.referredByUserId} disabled={travaForm}
                    onChange={e => setForm(f => ({ ...f, referredByUserId: e.target.value }))}>
                    <option value="">Direto</option>
                    {sellers.map(s => <option key={s.id} value={String(s.id)}>{s.name || s.username || s.email || `Usuário ${s.id}`}</option>)}
                  </select>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>Herança</label>
                  <input className="field-dark" readOnly value={indicador ? "definida pelo indicador" : "—"} />
                </div>
              </div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              <label style={lbl}>Enriquecimentos/dia</label>
              <input className="field-dark" type="number" min={0} max={500} value={form.dailyLimit} disabled={travaForm}
                onChange={e => setForm(f => ({ ...f, dailyLimit: e.target.value }))} />
            </div>

            {isEdit ? (
              <React.Fragment>
                <button className="btn-teal" type="submit" disabled={busy} style={{ minHeight: 40 }}>
                  {busy ? "Salvando…" : "Salvar dados"}
                </button>
                <div className="sep"></div>
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={lbl}>Redefinir senha</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="field-dark" type="password" minLength={8} maxLength={120}
                      placeholder="nova senha (mín. 8)" value={novaSenha} autoComplete="new-password"
                      onChange={e => setNovaSenha(e.target.value)} style={{ flex: 1 }} />
                    <button type="button" className="btn-ghost" disabled={busySenha || novaSenha.trim().length < 8}
                      onClick={redefinirSenha}>
                      {busySenha ? "Definindo…" : "Definir"}
                    </button>
                  </div>
                </div>
                <div className="sep"></div>
                <div style={{ display: "grid", gap: 8 }}>
                  {!ativo && vendedor && !jaLiberado ? (
                    liberarArm ? (
                      <button type="button" className="btn-teal" onClick={alternarAtivo} disabled={busy || isSelf} style={{ minHeight: 40 }}>
                        {busy ? "Liberando…" : "Confirmar liberação (envia usuário e senha)"}
                      </button>
                    ) : (
                      <button type="button" className="btn-teal" onClick={() => setLiberarArm(true)} disabled={busy || isSelf} style={{ minHeight: 40 }}
                        title="Confira os documentos recebidos ao lado antes de liberar">
                        Liberar acesso → envia boas-vindas com credenciais
                      </button>
                    )
                  ) : (
                    <button type="button" className="btn-ghost" onClick={alternarAtivo} disabled={busy || isSelf}
                      style={{ color: ativo ? "var(--hbx-danger)" : "var(--hbx-brand-strong)" }}>
                      {busy ? "Aguarde…" : ativo ? "Desativar acesso" : "Reativar acesso"}
                    </button>
                  )}
                  {onRequestExcluir && member && (
                    <button type="button" className="btn-ghost btn-danger" disabled={busy || isSelf}
                      onClick={() => { onClose(); onRequestExcluir(member); }}>
                      Excluir
                    </button>
                  )}
                  <span style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>
                    {isSelf
                      ? "Você não pode alterar o próprio acesso."
                      : "Perfil de acesso (admin/vendas) é definido pelo Master."}
                  </span>
                </div>
              </React.Fragment>
            ) : (
              !painelAtivo && (
                <button className="btn-teal" type="submit" disabled={busy || usernameCheck === "taken"} style={{ minHeight: 42 }}>
                  {busy ? "Criando…" : "Criar acesso"}
                </button>
              )
            )}
            {!isEdit && (
              <button type="button" className="btn-ghost" onClick={() => setModoCompleto(false)}>‹ Cadastro simples</button>
            )}
              </React.Fragment>
            )}
          </form>

          {/* coluna direita — documentação (mesmo painel para criar e gerenciar) */}
          <div style={{ display: "grid", gap: 10, alignContent: "start", opacity: vendedor ? 1 : 0.45 }}>
            {!vendedor ? (
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Gerentes não têm fluxo de documentação.</span>
            ) : (
              <React.Fragment>
                {isEdit && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span className={"tag" + (emailConfirmado ? " teal" : " warn")}>
                      {emailConfirmado ? "E-mail confirmado" : "E-mail não confirmado"}
                    </span>
                    {onboarding?.emailStatus && (
                      <span className={"tag" + (onboarding.emailStatus === "sent" ? " teal" : onboarding.emailStatus === "email_failed" ? " red" : "")}>
                        Onboarding: {onboarding.emailStatus === "sent" ? "enviado" : onboarding.emailStatus === "email_failed" ? "falhou" : onboarding.emailStatus}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {DOC_SLOTS.map(slot => {
                    const anexo = anexoDe(slot.kind);
                    const obrigatorio = Boolean(reqState[slot.kind]);
                    return (
                      <div key={slot.kind} style={{ display: "grid", gap: 6, padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--border-hairline)", background: "var(--hbx-surface-soft)" }}>
                        <strong style={{ fontSize: "0.74rem" }}>{slot.label}</strong>
                        <span style={{ fontSize: "0.62rem", color: anexo ? "var(--hbx-brand-strong)" : "var(--text-muted)" }}>
                          {anexo ? `✓ ${anexo.originalFilename || "anexado"}` : obrigatorio ? "Obrigatório pendente" : "Opcional"}
                        </span>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <label className="btn-ghost" style={{ minHeight: 26, fontSize: "0.62rem", padding: "0 8px", display: "inline-flex", alignItems: "center", cursor: painelAtivo ? "pointer" : "not-allowed", opacity: painelAtivo ? 1 : 0.55 }}>
                            {docBusy === slot.kind ? "Enviando…" : "Escolher arquivo"}
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} disabled={!painelAtivo || docBusy !== null}
                              onChange={e => { uploadDoc(slot.kind, e.target.files?.[0]); e.target.value = ""; }} />
                          </label>
                          <button type="button" className="btn-ghost" disabled={!painelAtivo || docBusy !== null}
                            style={{ minHeight: 26, fontSize: "0.62rem", padding: "0 8px", ...(obrigatorio ? { color: "var(--hbx-warning)", borderColor: "color-mix(in srgb, var(--hbx-warning) 40%, transparent)" } : {}) }}
                            onClick={() => alternarObrigatorio(slot.kind)}>
                            {obrigatorio ? "Obrigatório" : "Opcional"}
                          </button>
                          {anexo && (
                            <button type="button" className="btn-ghost btn-danger btn-xs" disabled={docBusy !== null}
                              onClick={() => removerDoc(anexo)}>
                              {docBusy === `remover:${anexo.id}` ? "Removendo…" : "Remover"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const gc = anexoDe("generated_contract");
                  if (!gc) return null;
                  return (
                    <div className="doc-slot filled" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>Contrato gerado (PDF)</strong>
                        <small className="ok">{gc.originalFilename || "gerado — vai junto no e-mail de onboarding"}</small>
                      </div>
                      <button type="button" className="btn-ghost btn-xs" disabled={docBusy !== null} onClick={() => baixarAnexo(gc)}>
                        {docBusy === `baixar:${gc.id}` ? "Baixando…" : "Baixar"}
                      </button>
                      <button type="button" className="btn-ghost btn-danger btn-xs" disabled={docBusy !== null} onClick={() => removerDoc(gc)}>
                        {docBusy === `remover:${gc.id}` ? "Removendo…" : "Remover"}
                      </button>
                    </div>
                  );
                })()}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn-ghost" onClick={abrirModelo}>Editar modelo</button>
                  <button type="button" className="btn-ghost" onClick={gerarContrato} disabled={!painelAtivo || docBusy !== null}>
                    {docBusy === "contrato" ? "Gerando…" : "Gerar contrato LINK"}
                  </button>
                  {emailUsable ? (
                    <button type="button" className="btn-teal" onClick={solicitarDocumentos} disabled={!painelAtivo || docBusy !== null}>
                      {docBusy === "email" ? "Enviando…" : "Solicitar documentos"}
                    </button>
                  ) : (
                    <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", alignSelf: "center", lineHeight: 1.4 }}>
                      Disparo de e-mail indisponível — ative e configure em Configurações → E-mail.
                    </span>
                  )}
                </div>
                {!isEdit && painelAtivo && (
                  <button type="button" className="btn-teal" onClick={fechar} style={{ minHeight: 40 }}>
                    Concluir cadastro
                  </button>
                )}
                {!isEdit && !painelAtivo && (
                  <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                    Crie o acesso para habilitar uploads, contrato e solicitação de documentos.
                  </span>
                )}
              </React.Fragment>
            )}
          </div>
        </div>
      </div>

      {modeloOpen && (
        <div className="hbx-veil"
          onMouseDown={e => { modeloDownRef.current = e.target === e.currentTarget; }}
          onClick={e => { const ok = e.target === e.currentTarget && modeloDownRef.current; modeloDownRef.current = false; if (ok) setModeloOpen(false); }}>
          <div className="hbx-modal" style={{ width: "min(640px, 100%)", maxHeight: "86vh", overflowY: "auto", display: "grid", gap: 12, padding: 22 }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Modelo do contrato
              <span style={{ color: "var(--text-muted)", cursor: "pointer", fontWeight: 400 }} onClick={() => setModeloOpen(false)}>✕</span>
            </h3>
            {modeloMsg && <div style={{ fontSize: "0.72rem", fontWeight: 700, color: modeloMsg.startsWith("✓") ? "var(--hbx-brand-strong)" : "var(--hbx-danger)" }}>{modeloMsg}</div>}
            <p style={{ margin: 0, fontSize: "0.66rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
              Use as variáveis {"{{sellerName}}"}, {"{{sellerCpf}}"}, {"{{sellerEmail}}"}, {"{{sellerPhone}}"}, {"{{sellerAddress}}"}, {"{{commissionPercent}}"}, {"{{commissionDueBusinessDays}}"}, {"{{commissionMonthlyCap}}"}, {"{{setupCommissionCap}}"}, {"{{commissionCapClause}}"} e {"{{contractDate}}"} — preenchidas na geração do PDF.
            </p>
            <textarea className="field-dark" rows={16} value={modeloText} disabled={modeloBusy}
              style={{ resize: "vertical", fontFamily: "var(--font-mono)", fontSize: "0.7rem", lineHeight: 1.55, padding: "10px 12px" }}
              onChange={e => setModeloText(e.target.value)} />
            <button className="btn-teal" onClick={salvarModelo} disabled={modeloBusy} style={{ minHeight: 40 }}>
              {modeloBusy ? "Salvando…" : "Salvar modelo"}
            </button>
            <div className="sep"></div>
            <div style={{ display: "grid", gap: 8 }}>
              <strong>Sua assinatura no contrato</strong>
              <span style={lbl}>Desenhe sua assinatura uma vez — ela entra automática em todo contrato gerado. Só falta a do vendedor.</span>
              <SignaturePad ref={padRef} value={sigUrl} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn-teal" disabled={sigBusy} onClick={salvarAssinatura}>
                  {sigBusy ? "Salvando…" : "Salvar assinatura"}
                </button>
                <button type="button" className="btn-ghost" disabled={sigBusy} onClick={() => padRef.current?.clear()}>Limpar</button>
                {sigUrl && (
                  <button type="button" className="btn-ghost btn-danger" disabled={sigBusy} onClick={removerAssinatura}>Remover salva</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
