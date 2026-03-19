"use client";

import {
  type AtendimentoBotActionKind,
  type AtendimentoBotConfig,
  type AtendimentoBotVariableScope,
} from "../inbox-model";
import styles from "../page.module.css";

const VARIABLE_SCOPE_LABELS: Record<AtendimentoBotVariableScope, string> = {
  shared: "Compartilhado",
  atendimento: "Atendimento",
  recovery: "Recovery",
};

const ACTION_KIND_LABELS: Record<AtendimentoBotActionKind, string> = {
  reply: "Responder",
  human_handoff: "Humano",
  recovery_handoff: "Recovery",
  close: "Encerrar",
  show_menu: "Mostrar menu",
  agenda: "Agenda",
};

const BOT_TEXT_FIELDS: Array<{
  key:
    | "welcomeMessage"
    | "returningCustomerMessage"
    | "mainMenuPrompt"
    | "recoveryDetectedMessage"
    | "postActionPrompt"
    | "humanAckMessage"
    | "closeTopicMessage"
    | "blockedMessage";
  label: string;
  description: string;
  scopes: AtendimentoBotVariableScope[];
}> = [
  { key: "welcomeMessage", label: "Mensagem para cliente novo", description: "Primeira resposta para contato novo no Atendimento.", scopes: ["shared", "atendimento"] },
  { key: "returningCustomerMessage", label: "Mensagem para cliente recorrente", description: "Usada quando o cliente volta a falar depois do primeiro contato.", scopes: ["shared", "atendimento"] },
  { key: "mainMenuPrompt", label: "Prompt do menu principal", description: "Texto que acompanha os botoes principais do Atendimento.", scopes: ["shared", "atendimento"] },
  { key: "recoveryDetectedMessage", label: "Mensagem quando encontrar debito", description: "Parede entre Atendimento e Recovery para clientes inadimplentes.", scopes: ["shared", "recovery"] },
  { key: "postActionPrompt", label: "Prompt apos acoes", description: "Mensagem curta para continuar guiando depois de agenda ou resposta custom.", scopes: ["shared", "atendimento"] },
  { key: "humanAckMessage", label: "Confirmacao de atendimento humano", description: "Aviso enviado quando a conversa vai para humano.", scopes: ["shared", "atendimento"] },
  { key: "closeTopicMessage", label: "Mensagem de encerramento", description: "Texto quando o bot encerra a conversa.", scopes: ["shared", "atendimento"] },
  { key: "blockedMessage", label: "Mensagem de bloqueio", description: "Referencia visual do estado bloqueado no editor.", scopes: ["shared", "atendimento"] },
];

type ActionOption = { value: string; label: string };

type BotPanelProps = {
  botConfig: AtendimentoBotConfig;
  loadingBot: boolean;
  savingBot: boolean;
  actionOptions: ActionOption[];
  agendaOptions: Array<{ id: string; title: string }>;
  onSave: () => void;
  onUpdateRoutingRule: (field: keyof AtendimentoBotConfig["routingRules"], value: boolean) => void;
  onAppendVariable: (field: keyof AtendimentoBotConfig, variableKey: string) => void;
  onUpdateBotText: (
    field:
      | "welcomeMessage"
      | "returningCustomerMessage"
      | "mainMenuPrompt"
      | "recoveryDetectedMessage"
      | "postActionPrompt"
      | "humanAckMessage"
      | "closeTopicMessage"
      | "blockedMessage",
    value: string,
  ) => void;
  onUpdateButtonSection: (
    section: "mainMenuButtons" | "recoveryDetectedButtons" | "postActionButtons",
    index: number,
    field: "actionId" | "title",
    value: string,
  ) => void;
  onAddButtonSection: (section: "mainMenuButtons" | "recoveryDetectedButtons" | "postActionButtons") => void;
  onRemoveButtonSection: (section: "mainMenuButtons" | "recoveryDetectedButtons" | "postActionButtons", index: number) => void;
  onUpdateActionGuide: (
    actionId: string,
    field: "title" | "description" | "route" | "kind" | "enabled" | "responseMessage" | "agendaGroupId",
    value: string | boolean,
  ) => void;
  onAddCustomAction: () => void;
  onRemoveCustomAction: (actionId: string) => void;
};

export default function BotPanel({
  botConfig,
  loadingBot,
  savingBot,
  actionOptions,
  agendaOptions,
  onSave,
  onUpdateRoutingRule,
  onAppendVariable,
  onUpdateBotText,
  onUpdateButtonSection,
  onAddButtonSection,
  onRemoveButtonSection,
  onUpdateActionGuide,
  onAddCustomAction,
  onRemoveCustomAction,
}: BotPanelProps) {
  return (
    <section className={styles.stackSection}>
      <article className={styles.workspaceCard}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.sectionEyebrow}>Editor isolado do Recovery</p>
            <h3>Bot 100% controlavel no Atendimento</h3>
            <small>Regras para cliente novo, cliente recorrente, parede com Recovery e botoes ligados a agenda.</small>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={savingBot || loadingBot}>
            {savingBot ? "Salvando..." : "Salvar editor"}
          </button>
        </div>

        {loadingBot ? (
          <div className={styles.emptyState}>Carregando editor do bot...</div>
        ) : (
          <>
            <div className={styles.ruleGrid}>
              <label className={styles.switchCard}>
                <input type="checkbox" checked={botConfig.routingRules.checkRecoveryBeforeReply} onChange={(event) => onUpdateRoutingRule("checkRecoveryBeforeReply", event.target.checked)} />
                <div><strong>Checar Recovery antes</strong><span>Primeiro passo do Atendimento ao receber qualquer mensagem.</span></div>
              </label>
              <label className={styles.switchCard}>
                <input type="checkbox" checked={botConfig.routingRules.autoRouteDebtorsToRecovery} onChange={(event) => onUpdateRoutingRule("autoRouteDebtorsToRecovery", event.target.checked)} />
                <div><strong>Subir devedor para Recovery</strong><span>Clientes inadimplentes nao ficam misturados no Atendimento.</span></div>
              </label>
              <label className={styles.switchCard}>
                <input type="checkbox" checked={botConfig.routingRules.autoReopenClosedConversation} onChange={(event) => onUpdateRoutingRule("autoReopenClosedConversation", event.target.checked)} />
                <div><strong>Reabrir conversa encerrada</strong><span>Se o cliente voltar a falar, a conversa volta automaticamente.</span></div>
              </label>
              <label className={styles.switchCard}>
                <input type="checkbox" checked={botConfig.routingRules.notifyOnNewInbound} onChange={(event) => onUpdateRoutingRule("notifyOnNewInbound", event.target.checked)} />
                <div><strong>Notificar novas mensagens</strong><span>Alimenta o aviso visual do modulo e do topo do sistema.</span></div>
              </label>
            </div>

            <div className={styles.editorGrid}>
              <div className={styles.editorColumn}>
                {BOT_TEXT_FIELDS.map((field) => (
                  <article key={field.key} className={styles.editorCard}>
                    <div className={styles.cardHeader}>
                      <div>
                        <strong>{field.label}</strong>
                        <small>{field.description}</small>
                      </div>
                    </div>
                    <div className={styles.variableChipRow}>
                      {botConfig.variableCatalog
                        .filter((item) => field.scopes.includes(item.scope) || item.scope === "shared")
                        .map((item) => (
                          <button key={`${field.key}-${item.key}`} type="button" className={styles.variableChip} onClick={() => onAppendVariable(field.key, item.key)}>
                            {`{{${item.key}}}`}
                          </button>
                        ))}
                    </div>
                    <textarea className="field" rows={4} value={String(botConfig[field.key] || "")} onChange={(event) => onUpdateBotText(field.key, event.target.value)} />
                  </article>
                ))}
              </div>

              <div className={styles.editorColumn}>
                {[
                  { key: "mainMenuButtons" as const, title: "Botoes do menu principal", description: "Opcoes de quem esta no Atendimento normal." },
                  { key: "recoveryDetectedButtons" as const, title: "Botoes da parede Recovery", description: "Opcoes exibidas quando o cadastro estiver devendo." },
                  { key: "postActionButtons" as const, title: "Botoes apos agenda/acao", description: "Acoes de continuidade para nao deixar o cliente solto." },
                ].map((section) => (
                  <article key={section.key} className={styles.editorCard}>
                    <div className={styles.cardHeader}>
                      <div>
                        <strong>{section.title}</strong>
                        <small>{section.description}</small>
                      </div>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddButtonSection(section.key)}>
                        Adicionar botao
                      </button>
                    </div>
                    <div className={styles.buttonBuilderList}>
                      {botConfig[section.key].map((button, index) => (
                        <div key={`${section.key}-${index}`} className={styles.buttonBuilderRow}>
                          <select className="field" value={button.actionId} onChange={(event) => onUpdateButtonSection(section.key, index, "actionId", event.target.value)}>
                            {actionOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <input className="field" value={button.title} onChange={(event) => onUpdateButtonSection(section.key, index, "title", event.target.value)} />
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveButtonSection(section.key, index)}>
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}

                <article className={styles.editorCard}>
                  <div className={styles.cardHeader}>
                    <div>
                      <strong>Catalogo de acoes</strong>
                      <small>Define o que cada botao ou acao custom faz dentro do Atendimento.</small>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onAddCustomAction}>
                      Nova acao custom
                    </button>
                  </div>
                  <div className={styles.actionCatalogList}>
                    {botConfig.actionCatalog.map((action) => (
                      <div key={action.actionId} className={styles.actionCard}>
                        <div className={styles.formGrid}>
                          <label className={styles.fieldBlock}>
                            <span>Titulo</span>
                            <input className="field" value={action.title} onChange={(event) => onUpdateActionGuide(action.actionId, "title", event.target.value)} />
                          </label>
                          <label className={styles.fieldBlock}>
                            <span>Tipo</span>
                            <select className="field" value={action.kind} onChange={(event) => onUpdateActionGuide(action.actionId, "kind", event.target.value)}>
                              {Object.entries(ACTION_KIND_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </label>
                          <label className={styles.fieldBlock}>
                            <span>Destino</span>
                            <select className="field" value={action.route} onChange={(event) => onUpdateActionGuide(action.actionId, "route", event.target.value)}>
                              {Object.entries(VARIABLE_SCOPE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </label>
                          <label className={styles.switchRow}>
                            <input type="checkbox" checked={action.enabled} onChange={(event) => onUpdateActionGuide(action.actionId, "enabled", event.target.checked)} />
                            <span>Ativa</span>
                          </label>
                        </div>
                        <label className={styles.fieldBlock}>
                          <span>Descricao operacional</span>
                          <input className="field" value={action.description} onChange={(event) => onUpdateActionGuide(action.actionId, "description", event.target.value)} />
                        </label>
                        {action.kind === "agenda" ? (
                          <label className={styles.fieldBlock}>
                            <span>Agenda vinculada</span>
                            <select className="field" value={String(action.agendaGroupId || "")} onChange={(event) => onUpdateActionGuide(action.actionId, "agendaGroupId", event.target.value)}>
                              <option value="">Selecione</option>
                              {agendaOptions.map((group) => (
                                <option key={group.id} value={group.id}>{group.title}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {action.kind === "reply" ? (
                          <label className={styles.fieldBlock}>
                            <span>Mensagem da acao</span>
                            <textarea className="field" rows={3} value={action.responseMessage || ""} onChange={(event) => onUpdateActionGuide(action.actionId, "responseMessage", event.target.value)} />
                          </label>
                        ) : null}
                        {action.custom ? (
                          <div className={styles.footerActions}>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveCustomAction(action.actionId)}>
                              Excluir acao custom
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          </>
        )}
      </article>
    </section>
  );
}
