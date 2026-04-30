"use client";

import { useMemo, useRef, useState } from "react";
import type { ProviderCapabilities } from "@/lib/provider-capabilities";
import type {
  AtendimentoAgendaConfig,
  AtendimentoBotButton,
  AtendimentoBotConfig,
  AtendimentoBotVariableDefinition,
} from "../../../atendimento/inbox-model";
import { renderConfigText } from "../model";
import styles from "./BotGameBuilderModal.module.css";

type Step = "module" | "message" | "choices" | "simulate" | "publish";
type BotModule = "vendas" | "recovery";
type MessageMode = "known" | "unknown";

type Props = {
  open: boolean;
  botConfig: AtendimentoBotConfig;
  agendaConfig: AtendimentoAgendaConfig;
  providerCapabilities: ProviderCapabilities;
  saving: boolean;
  recoveryEnabled: boolean;
  onClose: () => void;
  onChange: (config: AtendimentoBotConfig) => void;
  onSave: (config: AtendimentoBotConfig) => void;
};

const STEPS: Step[] = ["module", "message", "choices", "simulate", "publish"];
const UNKNOWN_CONTACT_MESSAGE =
  "Ola, tudo bem?\nEu sou o atendimento digital da {{empresa}}. Nao localizamos em nosso cadastro seu telefone.";
const LEGACY_UNKNOWN_CONTACT_MESSAGE =
  "Ola, tudo bem?\nSou o atendimento da {{empresa}} e vou concluir seu cadastro rapido antes de seguir com a triagem principal.";

function safeButtons(buttons: AtendimentoBotButton[]) {
  return (buttons || []).slice(0, 5);
}

function makeButtonId(title: string, index: number) {
  return String(title || `opcao_${index + 1}`)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || `opcao_${index + 1}`;
}

function ensureDefaultConfig(config: AtendimentoBotConfig): AtendimentoBotConfig {
  const welcomeMessage = !String(config.welcomeMessage || "").trim() || config.welcomeMessage === LEGACY_UNKNOWN_CONTACT_MESSAGE
    ? UNKNOWN_CONTACT_MESSAGE
    : config.welcomeMessage;
  const baseConfig = {
    ...config,
    welcomeMessage,
  };

  if ((baseConfig.mainMenuButtons || []).length) return baseConfig;

  return {
    ...baseConfig,
    mainMenuButtons: [
      {
        buttonId: "quero_comprar",
        title: "Quero comprar",
        actionId: "continue_journey",
        nextNodeId: "postActionPrompt",
      },
      {
        buttonId: "falar_com_atendente",
        title: "Falar com atendente",
        actionId: "talk_human",
        nextNodeId: "humanAckMessage",
      },
    ],
  };
}

function updateButton(
  config: AtendimentoBotConfig,
  index: number,
  patch: Partial<AtendimentoBotButton>,
): AtendimentoBotConfig {
  const current = safeButtons(config.mainMenuButtons);
  const next = current.map((button, buttonIndex) =>
    buttonIndex === index
      ? {
          ...button,
          ...patch,
          buttonId: patch.title ? makeButtonId(patch.title, buttonIndex) : button.buttonId,
        }
      : button,
  );

  return {
    ...config,
    mainMenuButtons: next,
  };
}

function addButton(config: AtendimentoBotConfig): AtendimentoBotConfig {
  const current = safeButtons(config.mainMenuButtons);
  if (current.length >= 5) return config;
  const index = current.length;
  return {
    ...config,
    mainMenuButtons: [
      ...current,
      {
        buttonId: `opcao_${index + 1}`,
        title: `Opção ${index + 1}`,
        actionId: "continue_journey",
        nextNodeId: "postActionPrompt",
      },
    ],
  };
}

function nextNodeLabel(value?: string | null) {
  switch (value) {
    case "humanAckMessage":
      return "Humano";
    case "closeTopicMessage":
      return "Fim";
    case "agendaDispatch":
      return "Agenda";
    case "recoveryDetectedMessage":
      return "Recovery";
    default:
      return "Vendas";
  }
}

export default function BotGameBuilderModal({
  open,
  botConfig,
  agendaConfig,
  providerCapabilities,
  saving,
  recoveryEnabled,
  onClose,
  onChange,
  onSave,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedModule, setSelectedModule] = useState<BotModule>("vendas");
  const [messageMode, setMessageMode] = useState<MessageMode>("unknown");
  const [selectedChoice, setSelectedChoice] = useState(0);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const step = STEPS[stepIndex];
  const config = useMemo(() => ensureDefaultConfig(botConfig), [botConfig]);
  const buttons = safeButtons(config.mainMenuButtons);
  const selectedButton = buttons[selectedChoice] || buttons[0] || null;
  const activeAgenda = (agendaConfig.groups || []).some((group) => group.isActive);
  const messageField = messageMode === "known" ? "returningCustomerMessage" : "welcomeMessage";
  const messageValue = messageMode === "known" ? config.returningCustomerMessage : config.welcomeMessage;
  const visibleVariables = useMemo(
    () =>
      (config.variableCatalog || []).filter((variable) => {
        if (variable.scope === "recovery" && !recoveryEnabled) return false;
        return true;
      }),
    [config.variableCatalog, recoveryEnabled],
  );

  if (!open) return null;

  const goNext = () => setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
  const goBack = () => setStepIndex((current) => Math.max(0, current - 1));

  const commit = (nextConfig: AtendimentoBotConfig) => {
    onChange(nextConfig);
  };

  const updateMessage = (value: string) => {
    commit({ ...config, [messageField]: value });
  };

  const insertVariable = (variable: AtendimentoBotVariableDefinition) => {
    const token = `{{${variable.key}}}`;
    const textarea = textareaRef.current;
    if (!textarea) {
      updateMessage(`${messageValue}${token}`);
      return;
    }

    const start = textarea.selectionStart ?? messageValue.length;
    const end = textarea.selectionEnd ?? messageValue.length;
    const nextValue = `${messageValue.slice(0, start)}${token}${messageValue.slice(end)}`;
    updateMessage(nextValue);
    window.requestAnimationFrame(() => {
      textarea.focus();
      const nextCursor = start + token.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <button className={styles.backdrop} type="button" onClick={onClose} aria-label="Fechar" />
      <section className={styles.modal} data-step={step}>
        <header className={styles.header}>
          <div className={styles.progress}>
            {STEPS.map((item, index) => (
              <span key={item} data-active={index <= stepIndex} />
            ))}
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar">
            X
          </button>
        </header>

        <main className={styles.body}>
          {step === "module" ? (
            <div className={styles.moduleStage}>
              <div className={styles.cardGrid}>
                <button
                  type="button"
                  className={styles.heroCard}
                  data-active={selectedModule === "vendas"}
                  onClick={() => setSelectedModule("vendas")}
                >
                  <span aria-hidden="true" />
                  <strong>VENDAS</strong>
                  <i>{selectedModule === "vendas" ? "OK" : "--"}</i>
                </button>
                <button
                  type="button"
                  className={styles.heroCard}
                  data-active={selectedModule === "recovery"}
                  data-locked={!recoveryEnabled}
                  disabled={!recoveryEnabled}
                  onClick={() => setSelectedModule("recovery")}
                >
                  <span aria-hidden="true" />
                  <strong>RECOVERY</strong>
                  <i>{recoveryEnabled ? selectedModule === "recovery" ? "OK" : "--" : "OFF"}</i>
                </button>
              </div>
              <div className={styles.orgRail}>
                <span data-active="true">QRCODE</span>
                <b />
                <span data-active={providerCapabilities.provider === "meta"}>META</span>
                <b />
                <span data-active={providerCapabilities.canUseTemplates}>TEMPLATES</span>
              </div>
            </div>
          ) : null}

          {step === "message" ? (
            <div className={styles.editorGrid}>
              <div className={styles.messageEditor}>
                <div className={styles.messageModes}>
                  <button
                    type="button"
                    data-active={messageMode === "known"}
                    onClick={() => setMessageMode("known")}
                  >
                    Localizou cliente
                  </button>
                  <button
                    type="button"
                    data-active={messageMode === "unknown"}
                    onClick={() => setMessageMode("unknown")}
                  >
                    Nao localizou
                  </button>
                </div>
                <textarea
                  ref={textareaRef}
                  value={messageValue || ""}
                  onChange={(event) => updateMessage(event.target.value)}
                  rows={7}
                />
              </div>
              <div className={styles.phoneMock}>
                <div className={styles.phoneTop} />
                <div className={styles.clientBubble}>
                  {messageMode === "known" ? "Cliente localizado" : "Telefone novo"}
                </div>
                <div className={styles.bubble}>
                  {renderConfigText(messageValue || UNKNOWN_CONTACT_MESSAGE, config, {
                    cliente: "Marina Costa",
                    empresa: "HBX Prime",
                    funcionario: "Time HBX",
                    valor_formatado: "R$ 480,00",
                    agenda_nome: "Instalacao",
                    agenda_slots: "Qui 14:00",
                  })}
                </div>
                <button
                  type="button"
                  className={styles.variableButton}
                  onClick={() => setVariablesOpen((current) => !current)}
                >
                  Variaveis
                </button>
                {variablesOpen ? (
                  <div className={styles.variablePopover}>
                    {visibleVariables.map((variable) => (
                      <button
                        key={variable.key}
                        type="button"
                        onClick={() => insertVariable(variable)}
                      >
                        <strong>{`{{${variable.key}}}`}</strong>
                        <span>{variable.example}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === "choices" ? (
            <div className={styles.choiceGrid}>
              <div className={styles.choiceList}>
                {buttons.map((button, index) => (
                  <div
                    key={`choice-${index}`}
                    className={styles.choiceItem}
                    data-active={selectedChoice === index}
                    onClick={() => setSelectedChoice(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelectedChoice(index);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <b>{index + 1}</b>
                    <input
                      value={button.title}
                      onFocus={() => setSelectedChoice(index)}
                      onChange={(event) => {
                        commit(updateButton(config, index, { title: event.target.value }));
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <em>{nextNodeLabel(button.nextNodeId)}</em>
                  </div>
                ))}
                <button type="button" className={styles.addChoice} onClick={() => commit(addButton(config))}>
                  +
                </button>
              </div>

              <div className={styles.nextPanel}>
                {selectedButton ? (
                  <>
                    <button
                      type="button"
                      data-active={selectedButton.nextNodeId === "postActionPrompt"}
                      onClick={() => commit(updateButton(config, selectedChoice, {
                        actionId: "continue_journey",
                        nextNodeId: "postActionPrompt",
                      }))}
                    >
                      Vendas
                    </button>
                    <button
                      type="button"
                      data-active={selectedButton.nextNodeId === "humanAckMessage"}
                      onClick={() => commit(updateButton(config, selectedChoice, {
                        actionId: "talk_human",
                        nextNodeId: "humanAckMessage",
                      }))}
                    >
                      Humano
                    </button>
                    <button
                      type="button"
                      data-active={selectedButton.nextNodeId === "agendaDispatch"}
                      disabled={!activeAgenda}
                      onClick={() => commit(updateButton(config, selectedChoice, {
                        actionId: "schedule_service",
                        nextNodeId: "agendaDispatch",
                      }))}
                    >
                      Agenda
                    </button>
                    <button
                      type="button"
                      data-active={selectedButton.nextNodeId === "closeTopicMessage"}
                      onClick={() => commit(updateButton(config, selectedChoice, {
                        actionId: "close_topic",
                        nextNodeId: "closeTopicMessage",
                      }))}
                    >
                      Fim
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === "simulate" ? (
            <div className={styles.simulation}>
              <div className={styles.phoneMock} data-large="true">
                <div className={styles.phoneTop} />
                <div className={styles.clientBubble}>Oi</div>
                <div className={styles.bubble}>{config.welcomeMessage || "Olá, tudo bem?"}</div>
                <div className={styles.buttonStack}>
                  {buttons.map((button, index) => (
                    <button
                      key={`${button.buttonId}-sim-${index}`}
                      type="button"
                      onClick={() => setSelectedChoice(index)}
                      data-active={selectedChoice === index}
                    >
                      {button.title}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.resultOrb}>
                <strong>{nextNodeLabel(buttons[selectedChoice]?.nextNodeId)}</strong>
              </div>
            </div>
          ) : null}

          {step === "publish" ? (
            <div className={styles.publishGrid}>
              <div className={styles.publishOrb}>
                <span />
                <strong>OK</strong>
              </div>
              <button
                type="button"
                className={styles.publishButton}
                disabled={saving}
                onClick={() => onSave(config)}
              >
                {saving ? "..." : "PUBLICAR"}
              </button>
            </div>
          ) : null}
        </main>

        <footer className={styles.footer}>
          <button type="button" className={styles.navButton} onClick={goBack} disabled={stepIndex === 0}>
            {"<"}
          </button>
          {step !== "publish" ? (
            <button type="button" className={styles.navButtonPrimary} onClick={goNext}>
              {">"}
            </button>
          ) : (
            <button type="button" className={styles.navButtonPrimary} onClick={onClose}>
              OK
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
