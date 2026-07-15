"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { apiFetch } from "@/lib/api";

import styles from "./lead-pull-progress-overlay.module.css";

type ClaimResponse = {
  ok?: boolean;
  [key: string]: unknown;
};

type PullLeadMeta = {
  name?: string | null;
  location?: string | null;
  segment?: string | null;
};

type PullPhase = "running" | "success" | "error";

type PullContact = {
  value: string;
  sourceLabel: string;
  whatsappStatus?: string | null;
};

type PullVisual = {
  token: number;
  phase: PullPhase;
  stage: number;
  current: number;
  lead: PullLeadMeta | null;
  startedAt: number;
  error: string | null;
  contactAccessGranted: boolean;
  phones: PullContact[];
  emails: PullContact[];
};

type LeadProcessContextValue = {
  claimLead: (leadId: string, meta?: PullLeadMeta) => Promise<ClaimResponse>;
  dismiss: () => void;
  visual: PullVisual | null;
};

type Stage = {
  label: string;
  detail: string;
};

const STAGES: Stage[] = [
  { label: "Preparando o lead", detail: "Conferindo a empresa selecionada" },
  { label: "Confirmando crédito", detail: "O débito acontece uma única vez" },
  {
    label: "Liberando os contatos",
    detail: "Telefones e e-mails só aparecem depois do débito",
  },
  {
    label: "Enriquecendo agora",
    detail: "RFB, motor, site e verificação de WhatsApp",
  },
  {
    label: "Enviando para Vendas",
    detail: "O card entra no seu funil e o restante continua em segundo plano",
  },
];

const LeadProcessContext = createContext<LeadProcessContextValue | null>(null);

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sourceLabel(value: unknown) {
  const source = String(value || "").toLowerCase();
  if (source.includes("rfb_secondary")) return "Secundário · Receita Federal";
  if (source.includes("rfb") || source.includes("receita"))
    return "Receita Federal";
  if (source.includes("google")) return "Google";
  if (source.includes("brave")) return "Brave";
  if (source.includes("site") || source.includes("web"))
    return "Site da empresa";
  if (source.includes("whatsapp")) return "WhatsApp";
  return "Motor HBX";
}

function leadRecordFrom(payload: unknown) {
  const root = recordOf(payload);
  if (!root) return null;
  const operation = recordOf(root.operation);
  return (
    [
      recordOf(root.item),
      recordOf(root.lead),
      recordOf(root.currentLead),
      recordOf(operation?.currentLead),
      Array.isArray(operation?.recentLeads)
        ? recordOf(operation.recentLeads[0])
        : null,
      root,
    ].find(Boolean) || null
  );
}

function accessGranted(payload: unknown, lead: Record<string, unknown> | null) {
  const root = recordOf(payload);
  const operation = recordOf(root?.operation);
  return (
    lead?.contactAccessGranted === true ||
    root?.contactAccessGranted === true ||
    operation?.contactAccessGranted === true
  );
}

function collectContacts(
  lead: Record<string, unknown> | null,
  kind: "phone" | "email",
) {
  if (!lead) return [];
  const structured = kind === "phone" ? lead.phoneContacts : lead.emailContacts;
  const legacy = kind === "phone" ? lead.phones : lead.emails;
  const primary = kind === "phone" ? lead.phone : lead.email;
  const values = [
    ...(Array.isArray(structured) ? structured : []),
    ...(Array.isArray(legacy) ? legacy : []),
    ...(typeof primary === "string" ? [primary] : []),
  ];
  const seen = new Set<string>();
  const result: PullContact[] = [];
  for (const candidate of values) {
    const record = recordOf(candidate);
    const value = String(
      typeof candidate === "string" ? candidate : record?.value || "",
    ).trim();
    const key =
      kind === "phone" ? value.replace(/\D/g, "") : value.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({
      value,
      sourceLabel:
        String(record?.sourceLabel || "").trim() || sourceLabel(record?.source),
      whatsappStatus:
        typeof record?.whatsappStatus === "string"
          ? record.whatsappStatus
          : null,
    });
    if (result.length === 3) break;
  }
  return result;
}

function contactResult(...payloads: unknown[]) {
  for (const payload of payloads) {
    const lead = leadRecordFrom(payload);
    if (!accessGranted(payload, lead)) continue;
    return {
      contactAccessGranted: true,
      phones: collectContacts(lead, "phone"),
      emails: collectContacts(lead, "email"),
    };
  }
  return { contactAccessGranted: false, phones: [], emails: [] };
}

function claimWasRejected(payload: unknown) {
  const root = recordOf(payload);
  const operation = recordOf(root?.operation);
  const status = String(operation?.status || "").trim().toLowerCase();
  return root?.ok === false || ["failed", "refunded", "refund_pending"].includes(status);
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v13" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function LeadProcessProvider({ children }: { children: ReactNode }) {
  const [visual, setVisual] = useState<PullVisual | null>(null);
  const tokenRef = useRef(0);
  const currentRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  }, []);

  useEffect(
    () => () => {
      tokenRef.current += 1;
      clearTimers();
    },
    [clearTimers],
  );

  const dismiss = useCallback(() => {
    currentRef.current = 0;
    setVisual(null);
  }, []);

  const claimLead = useCallback(
    async (leadId: string, meta?: PullLeadMeta) => {
      clearTimers();
      const token = ++tokenRef.current;
      const current = ++currentRef.current;
      const startedAt = Date.now();
      setVisual({
        token,
        phase: "running",
        stage: 0,
        current,
        lead: meta || null,
        startedAt,
        error: null,
        contactAccessGranted: false,
        phones: [],
        emails: [],
      });

      // A animação acompanha apenas o tempo da requisição. Ela nunca confirma
      // débito, posse ou liberação; essas três decisões vêm exclusivamente da
      // resposta do backend abaixo.
      [1, 2, 3, 4].forEach((stage, index) => {
        timersRef.current.push(
          window.setTimeout(() => {
            setVisual((previous) =>
              previous?.token === token && previous.phase === "running"
                ? { ...previous, stage }
                : previous,
            );
          }, 420 + index * 520),
        );
      });

      try {
        const response = await apiFetch<ClaimResponse>(
          `/webscraping/radar/leads/${encodeURIComponent(leadId)}/send-to-vendas`,
          { method: "POST", body: JSON.stringify({}) },
        );
        if (claimWasRejected(response)) {
          throw new Error(
            "A entrega não foi confirmada. Nenhum contato foi liberado e nenhum sucesso será exibido.",
          );
        }
        let contacts = contactResult(response);
        if (!contacts.contactAccessGranted) {
          const detail = await apiFetch<unknown>(
            `/webscraping/radar/leads/${encodeURIComponent(leadId)}`,
          );
          contacts = contactResult(response, detail);
        }
        if (!contacts.contactAccessGranted) {
          throw new Error(
            "O backend ainda não confirmou o débito e a liberação deste lead. Os contatos continuam protegidos.",
          );
        }
        if (token === tokenRef.current) {
          clearTimers();
          setVisual((previous) =>
            previous?.token === token
              ? {
                  ...previous,
                  phase: "success",
                  stage: STAGES.length - 1,
                  error: null,
                  ...contacts,
                }
              : previous,
          );
          timersRef.current.push(
            window.setTimeout(() => {
              setVisual((previous) => {
                if (previous?.token !== token) return previous;
                currentRef.current = 0;
                return null;
              });
            }, 2_600),
          );
        }
        return response;
      } catch (cause) {
        if (token === tokenRef.current) {
          clearTimers();
          setVisual((previous) =>
            previous?.token === token
              ? {
                  ...previous,
                  phase: "error",
                  error:
                    cause instanceof Error
                      ? cause.message
                      : "Não foi possível puxar este lead.",
                }
              : previous,
          );
        }
        throw cause;
      }
    },
    [clearTimers],
  );

  const value = useMemo<LeadProcessContextValue>(
    () => ({ claimLead, dismiss, visual }),
    [claimLead, dismiss, visual],
  );
  return (
    <LeadProcessContext.Provider value={value}>
      {children}
    </LeadProcessContext.Provider>
  );
}

export function useLeadClaim() {
  const context = useContext(LeadProcessContext);
  if (!context)
    throw new Error(
      "useLeadClaim precisa estar dentro de LeadProcessProvider.",
    );
  return context;
}

export function LeadPullProgressOverlay() {
  const { visual, dismiss } = useLeadClaim();
  const [now, setNow] = useState(() => Date.now());
  const modalRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const visualToken = visual?.token;

  useEffect(() => {
    if (!visualToken) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [visualToken]);

  useEffect(() => {
    if (!visualToken) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => modalRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (!focusable.length) {
        event.preventDefault();
        modalRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [dismiss, visualToken]);

  if (typeof document === "undefined" || !visual) return null;

  const success = visual.phase === "success";
  const failed = visual.phase === "error";
  const contactsUnlocked = success && visual.contactAccessGranted;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - visual.startedAt) / 1000),
  );
  const companyName = visual.lead?.name || "Lead selecionado";
  const companyContext =
    [visual.lead?.location, visual.lead?.segment].filter(Boolean).join(" · ") ||
    "Dados comerciais protegidos";
  const title = success
    ? contactsUnlocked
      ? "Lead pronto no Vendas"
      : "Lead enviado para processamento"
    : failed
      ? "Não foi possível concluir"
      : "Puxando e enriquecendo agora";
  const subtitle = success
    ? contactsUnlocked
      ? "O crédito foi confirmado, os contatos foram liberados e o card seguiu para o funil."
      : "A solicitação foi recebida. Os contatos continuam protegidos até o backend confirmar o débito."
    : failed
      ? visual.error ||
        "A entrega foi interrompida antes de liberar os contatos."
      : "Você já pode acompanhar a liberação. O enriquecimento complementar não prende esta tela.";

  return createPortal(
    <div
      className={styles.veil}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-pull-title"
    >
      <section
        ref={modalRef}
        tabIndex={-1}
        className={`${styles.modal} ${success ? styles.success : ""} ${failed ? styles.failed : ""}`}
        aria-busy={!success && !failed}
      >
        <header className={styles.header}>
          <span className={styles.heroIcon}>
            {success ? <CheckIcon /> : failed ? <AlertIcon /> : <ArrowIcon />}
          </span>
          <div className={styles.heading}>
            <span>Radar HBX · liberação para Vendas</span>
            <h2 id="lead-pull-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <span className={styles.liveBadge}>
            <i /> {success ? "Concluído" : failed ? "Interrompido" : "Ao vivo"}
          </span>
        </header>

        <div className={styles.body}>
          <section className={styles.journey} aria-label="Etapas da puxada">
            <div className={styles.leadCard}>
              <span className={styles.avatar}>
                {companyName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part.charAt(0))
                  .join("")
                  .toUpperCase() || "HB"}
              </span>
              <div>
                <strong>{companyName}</strong>
                <span>{companyContext}</span>
              </div>
              <b>
                {contactsUnlocked
                  ? "EM VENDAS"
                  : success
                    ? "RECEBIDO"
                    : failed
                      ? "PROTEGIDO"
                      : "PROCESSANDO"}
              </b>
            </div>

            <div className={styles.stages}>
              {STAGES.map((stage, index) => {
                const state = contactsUnlocked
                  ? "done"
                  : success
                    ? index === 0
                      ? "done"
                      : "pending"
                    : failed
                      ? index < visual.stage
                        ? "done"
                        : index === visual.stage
                          ? "error"
                          : "pending"
                      : index < visual.stage
                        ? "done"
                        : index === visual.stage
                          ? "active"
                          : "pending";
                return (
                  <div
                    className={`${styles.stage} ${styles[`stage_${state}`]}`}
                    key={stage.label}
                  >
                    <span className={styles.stageMark}>
                      {state === "done" ? (
                        <CheckIcon />
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <div>
                      <strong>{stage.label}</strong>
                      <small>
                        {state === "done" ? "Concluído" : stage.detail}
                      </small>
                    </div>
                    {state === "active" ? (
                      <i className={styles.spinner} />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className={styles.revealPanel}
            aria-label="Liberação dos contatos"
          >
            <div className={styles.revealHead}>
              <div>
                <span>Dados do lead</span>
                <h3>
                  {contactsUnlocked
                    ? "Contatos sendo liberados"
                    : "Contatos protegidos"}
                </h3>
              </div>
              <span
                className={`${styles.lockBadge} ${contactsUnlocked ? styles.lockBadgeOpen : ""}`}
              >
                {contactsUnlocked ? "Débito confirmado" : "Aguardando débito"}
              </span>
            </div>

            <div
              className={`${styles.contactPreview} ${contactsUnlocked ? styles.contactPreviewOpen : ""}`}
            >
              {contactsUnlocked
                ? [
                    ...visual.phones.map((contact, index) => ({
                      ...contact,
                      label: `Telefone ${index + 1}`,
                    })),
                    ...visual.emails.map((contact, index) => ({
                      ...contact,
                      label: `E-mail ${index + 1}`,
                    })),
                  ].map((contact) => (
                    <div key={`${contact.label}-${contact.value}`}>
                      <span>{contact.label}</span>
                      <strong>{contact.value}</strong>
                      <small>
                        {contact.sourceLabel}
                        {contact.whatsappStatus === "confirmed"
                          ? " · WhatsApp confirmado"
                          : ""}
                      </small>
                    </div>
                  ))
                : ["Telefone principal", "Telefones adicionais", "E-mails"].map(
                    (label) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>•••••••••••</strong>
                        <small>Protegido até confirmar o crédito</small>
                      </div>
                    ),
                  )}
              {contactsUnlocked &&
              visual.phones.length + visual.emails.length === 0 ? (
                <p className={styles.noContacts}>
                  Débito confirmado. Nenhum telefone ou e-mail utilizável foi
                  localizado até agora.
                </p>
              ) : null}
            </div>

            <div className={styles.enrichmentTrack}>
              <span
                className={
                  contactsUnlocked
                    ? styles.trackDone
                    : !failed
                      ? styles.trackWorking
                      : ""
                }
              >
                <i /> Receita Federal
              </span>
              <span
                className={
                  contactsUnlocked
                    ? styles.trackDone
                    : !failed
                      ? styles.trackWorking
                      : ""
                }
              >
                <i /> Motor HBX
              </span>
              <span
                className={
                  contactsUnlocked
                    ? styles.trackActive
                    : !failed
                      ? styles.trackWorking
                      : ""
                }
              >
                <i /> Site
              </span>
              <span
                className={
                  contactsUnlocked
                    ? styles.trackActive
                    : !failed
                      ? styles.trackWorking
                      : ""
                }
              >
                <i /> WhatsApp
              </span>
            </div>

            <div className={styles.note}>
              <span className={styles.notePulse} />
              <div>
                <strong>
                  {success
                    ? contactsUnlocked
                      ? "Pronto para trabalhar"
                      : "Processamento confirmado"
                    : "Enriquecimento complementar em segundo plano"}
                </strong>
                <small>
                  {success
                    ? contactsUnlocked
                      ? "Abra o card no Vendas para ver e usar os contatos liberados."
                      : "Os contatos continuam protegidos enquanto o backend conclui o débito e a entrega."
                    : "O lead entra no funil assim que a entrega principal termina; o restante continua sem bloquear você."}
                </small>
              </div>
            </div>
          </section>
        </div>

        <footer className={styles.footer}>
          <div>
            <span>Tempo nesta tela</span>
            <strong>
              00:{String(Math.min(elapsedSeconds, 59)).padStart(2, "0")}
            </strong>
          </div>
          <div>
            <span>Lead atual</span>
            <strong>{visual.current}</strong>
          </div>
          <div>
            <span>Etapa</span>
            <strong>
              {success
                ? "Concluído"
                : failed
                  ? "Interrompido"
                  : `${visual.stage + 1} de ${STAGES.length}`}
            </strong>
          </div>
          {failed ? (
            <button type="button" onClick={dismiss}>
              Fechar
            </button>
          ) : !success && elapsedSeconds >= 3 ? (
            <button type="button" onClick={dismiss}>
              Continuar usando o HBX
            </button>
          ) : (
            <span className={styles.outcome}>
              <i />{" "}
              {contactsUnlocked
                ? "Enviado"
                : success
                  ? "Recebido"
                  : "Em andamento"}
            </span>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
