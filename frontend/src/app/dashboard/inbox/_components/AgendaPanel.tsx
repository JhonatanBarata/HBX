"use client";

import {
  formatAgendaPreview,
  formatWeekday,
  type AtendimentoAgendaConfig,
} from "../inbox-model";
import styles from "../page.module.css";

type AgendaPanelProps = {
  agendaConfig: AtendimentoAgendaConfig;
  loadingAgenda: boolean;
  savingAgenda: boolean;
  onAddGroup: () => void;
  onRemoveGroup: (groupId: string) => void;
  onSave: () => void;
  onUpdateGroup: (
    groupId: string,
    field: "title" | "description" | "buttonLabel" | "introMessage" | "emptyMessage",
    value: string,
  ) => void;
  onAddSlot: (groupId: string) => void;
  onRemoveSlot: (groupId: string, slotId: string) => void;
  onUpdateSlot: (
    groupId: string,
    slotId: string,
    field: "label" | "dayOfWeek" | "startTime" | "endTime" | "enabled",
    value: string | number | boolean,
  ) => void;
};

export default function AgendaPanel({
  agendaConfig,
  loadingAgenda,
  savingAgenda,
  onAddGroup,
  onRemoveGroup,
  onSave,
  onUpdateGroup,
  onAddSlot,
  onRemoveSlot,
  onUpdateSlot,
}: AgendaPanelProps) {
  return (
    <section className={styles.stackSection}>
      <article className={styles.workspaceCard}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.sectionEyebrow}>Agenda dinamica</p>
            <h3>Guias e horarios que o bot pode oferecer</h3>
            <small>Os gerentes podem criar, editar e excluir agendas e faixas de horario.</small>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onAddGroup}>
              Nova agenda
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onSave}
              disabled={savingAgenda || loadingAgenda}
            >
              {savingAgenda ? "Salvando..." : "Salvar agenda"}
            </button>
          </div>
        </div>

        {loadingAgenda ? (
          <div className={styles.emptyState}>Carregando agenda...</div>
        ) : (
          <div className={styles.agendaGrid}>
            {agendaConfig.groups.map((group) => (
              <article key={group.id} className={styles.agendaCard}>
                <div className={styles.agendaCardHeader}>
                  <div>
                    <p className={styles.sectionEyebrow}>Guia</p>
                    <strong>{group.title}</strong>
                    <small>{formatAgendaPreview(group) || "Sem slots ativos"}</small>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => onRemoveGroup(group.id)}
                  >
                    Excluir
                  </button>
                </div>

                <div className={styles.formGrid}>
                  <label className={styles.fieldBlock}>
                    <span>Titulo</span>
                    <input
                      className="field"
                      value={group.title}
                      onChange={(event) => onUpdateGroup(group.id, "title", event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldBlock}>
                    <span>Botao do bot</span>
                    <input
                      className="field"
                      value={group.buttonLabel}
                      onChange={(event) => onUpdateGroup(group.id, "buttonLabel", event.target.value)}
                    />
                  </label>
                </div>

                <label className={styles.fieldBlock}>
                  <span>Descricao</span>
                  <textarea
                    className="field"
                    rows={3}
                    value={group.description}
                    onChange={(event) => onUpdateGroup(group.id, "description", event.target.value)}
                  />
                </label>

                <label className={styles.fieldBlock}>
                  <span>Mensagem com horarios</span>
                  <textarea
                    className="field"
                    rows={4}
                    value={group.introMessage}
                    onChange={(event) => onUpdateGroup(group.id, "introMessage", event.target.value)}
                  />
                </label>

                <label className={styles.fieldBlock}>
                  <span>Mensagem sem horarios</span>
                  <input
                    className="field"
                    value={group.emptyMessage}
                    onChange={(event) => onUpdateGroup(group.id, "emptyMessage", event.target.value)}
                  />
                </label>

                <div className={styles.slotHeader}>
                  <strong>Horarios</strong>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onAddSlot(group.id)}
                  >
                    Adicionar horario
                  </button>
                </div>

                <div className={styles.slotList}>
                  {group.slots.map((slot) => (
                    <div key={slot.id} className={styles.slotRow}>
                      <input
                        className="field"
                        value={slot.label}
                        onChange={(event) => onUpdateSlot(group.id, slot.id, "label", event.target.value)}
                      />
                      <select
                        className="field"
                        value={slot.dayOfWeek}
                        onChange={(event) =>
                          onUpdateSlot(group.id, slot.id, "dayOfWeek", Number(event.target.value))
                        }
                      >
                        {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                          <option key={day} value={day}>
                            {formatWeekday(day)}
                          </option>
                        ))}
                      </select>
                      <input
                        className="field"
                        type="time"
                        value={slot.startTime}
                        onChange={(event) => onUpdateSlot(group.id, slot.id, "startTime", event.target.value)}
                      />
                      <input
                        className="field"
                        type="time"
                        value={slot.endTime}
                        onChange={(event) => onUpdateSlot(group.id, slot.id, "endTime", event.target.value)}
                      />
                      <label className={styles.switchRow}>
                        <input
                          type="checkbox"
                          checked={slot.enabled}
                          onChange={(event) => onUpdateSlot(group.id, slot.id, "enabled", event.target.checked)}
                        />
                        <span>Ativo</span>
                      </label>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => onRemoveSlot(group.id, slot.id)}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  {group.slots.length === 0 ? (
                    <div className={styles.emptyState}>Nenhum horario cadastrado nesta agenda.</div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
