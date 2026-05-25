"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  AtendimentoAgendaConfig,
  AtendimentoBotConfig,
} from "../../../atendimento/inbox-model";
import type { ProviderCapabilities } from "@/lib/provider-capabilities";
import type { WhatsAppCenterPayload, WhatsAppModalPayload } from "@/lib/whatsapp-center";
import BotGameBuilderModal from "./BotGameBuilderModal";
import styles from "./BotAutomationPremiumEntry.module.css";

type Props = {
  botConfig: AtendimentoBotConfig;
  agendaConfig: AtendimentoAgendaConfig;
  centerPayload: WhatsAppCenterPayload | null;
  modalPayload: WhatsAppModalPayload | null;
  providerCapabilities: ProviderCapabilities;
  publishing: boolean;
  recoveryEnabled: boolean;
  hasUnsavedChanges: boolean;
  onConfigChange: (config: AtendimentoBotConfig) => void;
  onSave: (config: AtendimentoBotConfig) => void;
};

export default function BotAutomationPremiumEntry({
  botConfig,
  agendaConfig,
  centerPayload,
  modalPayload,
  providerCapabilities,
  publishing,
  recoveryEnabled,
  hasUnsavedChanges,
  onConfigChange,
  onSave,
}: Props) {
  const [builderOpen, setBuilderOpen] = useState(false);
  const connected =
    centerPayload?.center.mode === "OFFICIAL"
      ? Boolean(centerPayload.center.official.connected)
      : modalPayload?.status === "connected";

  return (
    <section className={styles.entry}>
      <div className={styles.statusRail}>
        <span data-on={connected} />
        <b>{providerCapabilities.provider === "meta" ? "META" : "QRCODE"}</b>
        <i>{hasUnsavedChanges ? "EDIT" : "OK"}</i>
      </div>

      <div className={styles.hero}>
        <button type="button" className={styles.mainOrb} onClick={() => setBuilderOpen(true)}>
          <span aria-hidden="true" />
          <strong>Bot</strong>
        </button>

        <div className={styles.actionStack}>
          <button type="button" className={styles.primaryAction} onClick={() => setBuilderOpen(true)}>
            EDITAR
          </button>
          <button type="button" className={styles.secondaryAction} onClick={() => setBuilderOpen(true)}>
            TESTAR
          </button>
          <Link className={styles.secondaryAction} href="/vendas/automacao?tab=connection">
            CONEXÃO
          </Link>
        </div>
      </div>

      <BotGameBuilderModal
        open={builderOpen}
        botConfig={botConfig}
        agendaConfig={agendaConfig}
        providerCapabilities={providerCapabilities}
        saving={publishing}
        recoveryEnabled={recoveryEnabled}
        onClose={() => setBuilderOpen(false)}
        onChange={onConfigChange}
        onSave={onSave}
      />
    </section>
  );
}
