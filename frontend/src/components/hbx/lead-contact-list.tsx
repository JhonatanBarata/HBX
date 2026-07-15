"use client";

import { useState } from "react";

import { formatBrPhone, onlyDigits } from "@/lib/br-phone";

import { whatsappIsExplicitlyConfirmed } from "./lead-contact-verification";
import styles from "./lead-contact-list.module.css";

export type LeadContactRecord = {
  id?: string | null;
  kind?: string | null;
  value?: string | null;
  valueNormalized?: string | null;
  rank?: number | null;
  source?: string | null;
  label?: string | null;
  confidence?: number | null;
  whatsappStatus?: string | boolean | null;
  whatsappConfirmed?: boolean | null;
};

type LeadContactListProps = {
  phone?: string | null;
  email?: string | null;
  phones?: string[] | null;
  emails?: string[] | null;
  phoneContacts?: LeadContactRecord[] | null;
  emailContacts?: LeadContactRecord[] | null;
  phonesWhatsapp?: Record<string, boolean> | null;
  emptyLabel?: string;
  compact?: boolean;
};

type ContactView = {
  key: string;
  kind: "phone" | "email";
  value: string;
  rank: number;
  source: string | null;
  label: string;
  whatsappConfirmed: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  rfb_primary: "Receita Federal · principal",
  rfb_secondary: "Receita Federal · secundário",
  rfb_email: "Receita Federal · cadastral",
  receita_primary: "Receita Federal · principal",
  receita_secondary: "Receita Federal · secundário",
  cnpj_public_primary: "Receita Federal · principal",
  cnpj_public_secondary: "Receita Federal · secundário",
  cnpj_public: "Receita Federal",
  receita: "Receita Federal",
  cnpj_l4: "Receita Federal",
  website_crawl: "Site oficial",
  web_crawl: "Site oficial",
  google: "Google",
  brave: "Brave",
  hbx_engine: "Motor HBX",
  lead_plus_engine: "Motor HBX",
  lead_harvest_import: "Motor HBX",
  metadatajson_backfill: "Histórico HBX",
  metadata: "Base HBX",
  legacy: "Histórico HBX",
  manual: "Manual",
  primary: "Contato principal",
  unknown: "Origem não informada",
};

function normalizeSource(source: string | null | undefined) {
  return String(source || "").trim().toLowerCase().replace(/[.\s-]+/g, "_");
}

function sourceLabel(source: string | null, rank: number) {
  const key = normalizeSource(source);
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  if (key.includes("rfb") || key.includes("receita") || key.includes("cnpj_public")) {
    return `Receita Federal · ${rank === 1 ? "principal" : "secundário"}`;
  }
  if (key.includes("website") || key.includes("crawl")) return "Site oficial";
  if (!key) return rank === 1 ? "Contato principal" : `Contato ${rank}`;
  return source!.replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function buildViews({
  phone,
  email,
  phones,
  emails,
  phoneContacts,
  emailContacts,
  phonesWhatsapp,
}: LeadContactListProps): ContactView[] {
  const whatsappMap = phonesWhatsapp || {};
  const phoneCandidates: LeadContactRecord[] = [
    ...(Array.isArray(phoneContacts) ? phoneContacts : []),
    ...(phone ? [{ kind: "phone", value: phone, rank: 1 }] : []),
    ...(Array.isArray(phones) ? phones.map((value, index) => ({ kind: "phone", value, rank: index + 1 })) : []),
  ];
  const emailCandidates: LeadContactRecord[] = [
    ...(Array.isArray(emailContacts) ? emailContacts : []),
    ...(email ? [{ kind: "email", value: email, rank: 1 }] : []),
    ...(Array.isArray(emails) ? emails.map((value, index) => ({ kind: "email", value, rank: index + 1 })) : []),
  ];

  function normalize(candidates: LeadContactRecord[], kind: "phone" | "email") {
    const seen = new Set<string>();
    return candidates
      .map((contact, index) => {
        const value = String(contact.value || contact.valueNormalized || "").trim();
        const normalized = kind === "phone" ? onlyDigits(value) : value.toLowerCase();
        const rank = Number.isFinite(Number(contact.rank)) && Number(contact.rank) > 0
          ? Math.trunc(Number(contact.rank))
          : index + 1;
        return { contact, value, normalized, rank, index };
      })
      .filter(item => Boolean(item.value && item.normalized))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .filter(item => {
        if (seen.has(item.normalized)) return false;
        seen.add(item.normalized);
        return true;
      })
      .slice(0, 3)
      .map((item, index): ContactView => {
        const rank = index + 1;
        const source = item.contact.source ? String(item.contact.source) : null;
        return {
          key: `${kind}-${item.normalized}`,
          kind,
          value: item.value,
          rank,
          source,
          label: item.contact.label || sourceLabel(source, rank),
          whatsappConfirmed: kind === "phone" && whatsappIsExplicitlyConfirmed(item.contact, whatsappMap),
        };
      });
  }

  return [...normalize(phoneCandidates, "phone"), ...normalize(emailCandidates, "email")];
}

function waHref(value: string) {
  const digits = onlyDigits(value);
  const international = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${international}`;
}

export function LeadContactList(props: LeadContactListProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const contacts = buildViews(props);

  function copy(contact: ContactView) {
    navigator.clipboard?.writeText(contact.value).then(
      () => {
        setCopiedKey(contact.key);
        window.setTimeout(() => setCopiedKey(current => current === contact.key ? null : current), 1600);
      },
      () => undefined,
    );
  }

  if (contacts.length === 0) {
    return props.emptyLabel ? <p className={styles.empty}>{props.emptyLabel}</p> : null;
  }

  return (
    <div className={`${styles.list} ${props.compact ? styles.compact : ""}`} aria-label="Contatos do lead">
      {contacts.map(contact => {
        const display = contact.kind === "phone" ? formatBrPhone(contact.value) || contact.value : contact.value;
        const typeLabel = contact.kind === "phone" ? `Telefone ${contact.rank}` : `E-mail ${contact.rank}`;
        return (
          <div className={styles.contact} key={contact.key}>
            <span className={styles.icon} aria-hidden="true">{contact.kind === "phone" ? "☎" : "@"}</span>
            <span className={styles.copy}>
              <span className={styles.type}>{typeLabel}</span>
              <strong>{display}</strong>
              <span className={styles.source}>{contact.label}</span>
            </span>
            <span className={styles.actions}>
              {contact.whatsappConfirmed ? (
                <a className={styles.whatsapp} href={waHref(contact.value)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir WhatsApp de ${display}`}>
                  WhatsApp
                </a>
              ) : null}
              <a
                className={styles.action}
                href={contact.kind === "phone" ? `tel:${onlyDigits(contact.value)}` : `mailto:${contact.value}`}
                aria-label={contact.kind === "phone" ? `Ligar para ${display}` : `Enviar e-mail para ${display}`}
              >
                {contact.kind === "phone" ? "Ligar" : "E-mail"}
              </a>
              <button className={styles.action} type="button" onClick={() => copy(contact)} aria-label={`Copiar ${typeLabel}`}>
                {copiedKey === contact.key ? "Copiado" : "Copiar"}
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
