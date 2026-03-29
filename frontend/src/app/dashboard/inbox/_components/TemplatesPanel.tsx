"use client";

import type {
  RecoveryMetaTemplateItem,
  RecoveryMetaTemplatesPayload,
} from "@/app/hbx-recovery/recovery-model";
import styles from "../page.module.css";

export type TemplateComposer = {
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  language: string;
  bodyText: string;
  footerText: string;
  buttonsText: string;
  activateInHbx: boolean;
  headerFormat: "NONE" | "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO";
  headerText: string;
  headerHandle: string;
  headerMediaUrl: string;
};

type TemplatesPanelProps = {
  loadingTemplates: boolean;
  syncingTemplates: boolean;
  metaTemplates: RecoveryMetaTemplatesPayload;
  templateComposer: TemplateComposer;
  creatingTemplate: boolean;
  deletingTemplateId: string | null;
  editingTemplateLabel?: string | null;
  onReload: () => void;
  onSync: () => void;
  onToggleActivation: (template: RecoveryMetaTemplateItem, active: boolean) => void;
  onComposerChange: (updater: (current: TemplateComposer) => TemplateComposer) => void;
  onCreateTemplate: () => void;
  onDeleteTemplate: (template: RecoveryMetaTemplateItem) => void;
  onEditTemplate: (template: RecoveryMetaTemplateItem) => void;
  onResetComposer: () => void;
};

const TEMPLATE_VARIABLE_SUGGESTIONS = [
  { key: "cliente", example: "Jhonatan" },
  { key: "empresa", example: "HBX" },
  { key: "funcionario", example: "Ana" },
  { key: "data_servico", example: "27/03/2026" },
  { key: "valor", example: "R$ 245,90" },
  { key: "link_pagamento", example: "https://..." },
] as const;

function parseTemplateButtons(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function renderHeaderLabel(templateComposer: TemplateComposer) {
  if (templateComposer.headerFormat === "TEXT") {
    return templateComposer.headerText || "Cabecalho em texto";
  }
  if (
    templateComposer.headerFormat === "IMAGE" ||
    templateComposer.headerFormat === "DOCUMENT" ||
    templateComposer.headerFormat === "VIDEO"
  ) {
    return templateComposer.headerMediaUrl || templateComposer.headerHandle || "Midia vinculada";
  }
  return "Sem cabecalho";
}

export default function TemplatesPanel({
  loadingTemplates,
  syncingTemplates,
  metaTemplates,
  templateComposer,
  creatingTemplate,
  deletingTemplateId,
  editingTemplateLabel,
  onReload,
  onSync,
  onToggleActivation,
  onComposerChange,
  onCreateTemplate,
  onDeleteTemplate,
  onEditTemplate,
  onResetComposer,
}: TemplatesPanelProps) {
  const templateButtons = parseTemplateButtons(templateComposer.buttonsText);

  const appendVariable = (variableKey: string) => {
    onComposerChange((current) => {
      const currentValue = String(current.bodyText || "");
      const suffix =
        currentValue && !currentValue.endsWith(" ") && !currentValue.endsWith("\n") ? " " : "";
      return {
        ...current,
        bodyText: `${currentValue}${suffix}{{${variableKey}}}`,
      };
    });
  };

  return (
    <section className={styles.templateGrid}>
      <article className={styles.workspaceCard}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.sectionEyebrow}>Catalogo oficial</p>
            <h3>Templates Meta</h3>
            <small>Mesmo backend do Recovery, agora acessivel dentro do Atendimento.</small>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onReload}>
              Recarregar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onSync}
              disabled={syncingTemplates}
            >
              {syncingTemplates ? "Sincronizando..." : "Sincronizar Meta"}
            </button>
          </div>
        </div>

        <div className={styles.metricStrip}>
          <div>
            <strong>{metaTemplates.counters.total}</strong>
            <span>Total</span>
          </div>
          <div>
            <strong>{metaTemplates.counters.approved}</strong>
            <span>Aprovados</span>
          </div>
          <div>
            <strong>{metaTemplates.counters.pending}</strong>
            <span>Pendentes</span>
          </div>
          <div>
            <strong>{metaTemplates.counters.hbxActive}</strong>
            <span>Ativos no HBX</span>
          </div>
        </div>

        <div className={styles.templateCatalog}>
          {loadingTemplates ? (
            <div className={styles.emptyState}>Carregando templates...</div>
          ) : metaTemplates.templates.length === 0 ? (
            <div className={styles.emptyState}>Nenhum template encontrado.</div>
          ) : (
            metaTemplates.templates.map((template) => {
              const deletingKey = `${template.name}:${template.language}`;
              return (
                <article key={deletingKey} className={styles.templateCard}>
                  <div className={styles.templateCardHeader}>
                    <div>
                      <strong>{template.name}</strong>
                      <span>
                        {template.language} • {template.category}
                      </span>
                    </div>
                    <div className={styles.templateActions}>
                      <label className={styles.switchRow}>
                        <input
                          type="checkbox"
                          checked={template.hbxActive}
                          onChange={(event) => onToggleActivation(template, event.target.checked)}
                        />
                        <span>Ativo</span>
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onEditTemplate(template)}
                      >
                        Verificar ou editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => onDeleteTemplate(template)}
                        disabled={deletingTemplateId === deletingKey}
                      >
                        {deletingTemplateId === deletingKey ? "Removendo..." : "Excluir"}
                      </button>
                    </div>
                  </div>
                  <p>{template.normalized?.body?.text || template.bodyText}</p>
                  <div className={styles.templateFlags}>
                    <span>{template.status}</span>
                    <span>{template.metaApproved ? "Meta approved" : "Aguardando Meta"}</span>
                    <span>{template.hbxActive ? "HBX ativo" : "HBX desligado"}</span>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </article>

      <article className={styles.workspaceCard}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.sectionEyebrow}>Criacao rapida</p>
            <h3>{editingTemplateLabel ? "Editor de template" : "Novo template"}</h3>
            <small>
              {editingTemplateLabel
                ? `Base carregada a partir de ${editingTemplateLabel}.`
                : "Cadastre e revise o template sem sair do Atendimento."}
            </small>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onResetComposer}>
              Limpar
            </button>
          </div>
        </div>
        <div className={styles.templateComposerWorkspace}>
          <div className={styles.templateComposerFormRail}>
            <div className={styles.formGrid}>
              <label className={styles.fieldBlock}>
                <span>Nome interno</span>
                <input
                  className="field"
                  value={templateComposer.name}
                  onChange={(event) =>
                    onComposerChange((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className={styles.fieldBlock}>
                <span>Categoria</span>
                <select
                  className="field"
                  value={templateComposer.category}
                  onChange={(event) =>
                    onComposerChange((current) => ({
                      ...current,
                      category: event.target.value as TemplateComposer["category"],
                    }))
                  }
                >
                  <option value="UTILITY">UTILITY</option>
                  <option value="MARKETING">MARKETING</option>
                  <option value="AUTHENTICATION">AUTHENTICATION</option>
                </select>
              </label>
              <label className={styles.fieldBlock}>
                <span>Idioma</span>
                <input
                  className="field"
                  value={templateComposer.language}
                  onChange={(event) =>
                    onComposerChange((current) => ({ ...current, language: event.target.value }))
                  }
                />
              </label>
              <label className={styles.fieldBlock}>
                <span>Cabecalho</span>
                <select
                  className="field"
                  value={templateComposer.headerFormat}
                  onChange={(event) =>
                    onComposerChange((current) => ({
                      ...current,
                      headerFormat: event.target.value as TemplateComposer["headerFormat"],
                    }))
                  }
                >
                  <option value="NONE">Sem cabecalho</option>
                  <option value="TEXT">Texto</option>
                  <option value="IMAGE">Imagem</option>
                  <option value="DOCUMENT">Documento</option>
                  <option value="VIDEO">Video</option>
                </select>
              </label>
              {templateComposer.headerFormat === "TEXT" ? (
                <label className={styles.fieldBlock}>
                  <span>Texto do cabecalho</span>
                  <input
                    className="field"
                    value={templateComposer.headerText}
                    onChange={(event) =>
                      onComposerChange((current) => ({ ...current, headerText: event.target.value }))
                    }
                  />
                </label>
              ) : null}
              {templateComposer.headerFormat === "IMAGE" ||
              templateComposer.headerFormat === "DOCUMENT" ||
              templateComposer.headerFormat === "VIDEO" ? (
                <>
                  <label className={styles.fieldBlock}>
                    <span>Header handle da Meta</span>
                    <input
                      className="field"
                      value={templateComposer.headerHandle}
                      onChange={(event) =>
                        onComposerChange((current) => ({
                          ...current,
                          headerHandle: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={styles.fieldBlock}>
                    <span>URL publica da midia</span>
                    <input
                      className="field"
                      value={templateComposer.headerMediaUrl}
                      onChange={(event) =>
                        onComposerChange((current) => ({
                          ...current,
                          headerMediaUrl: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              ) : null}
            </div>

            <div className={styles.templateVariableChipRow}>
              {TEMPLATE_VARIABLE_SUGGESTIONS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={styles.templateVariableChip}
                  onClick={() => appendVariable(item.key)}
                  title={item.example}
                >
                  <strong>{`{{${item.key}}}`}</strong>
                  <span>{item.example}</span>
                </button>
              ))}
            </div>

            <label className={styles.fieldBlock}>
              <span>Corpo</span>
              <textarea
                className="field"
                rows={7}
                value={templateComposer.bodyText}
                onChange={(event) =>
                  onComposerChange((current) => ({ ...current, bodyText: event.target.value }))
                }
              />
            </label>
            <label className={styles.fieldBlock}>
              <span>Rodape</span>
              <input
                className="field"
                value={templateComposer.footerText}
                onChange={(event) =>
                  onComposerChange((current) => ({ ...current, footerText: event.target.value }))
                }
              />
            </label>
            <label className={styles.fieldBlock}>
              <span>Botoes, um por linha</span>
              <textarea
                className="field"
                rows={4}
                value={templateComposer.buttonsText}
                onChange={(event) =>
                  onComposerChange((current) => ({ ...current, buttonsText: event.target.value }))
                }
              />
              <small>Use ate 3 botoes de resposta rapida.</small>
            </label>
            <label className={styles.switchRow}>
              <input
                type="checkbox"
                checked={templateComposer.activateInHbx}
                onChange={(event) =>
                  onComposerChange((current) => ({
                    ...current,
                    activateInHbx: event.target.checked,
                  }))
                }
              />
              <span>Ativar no HBX apos criar</span>
            </label>
            <div className={styles.footerActions}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onCreateTemplate}
                disabled={creatingTemplate}
              >
                {creatingTemplate ? "Criando..." : editingTemplateLabel ? "Duplicar template" : "Criar template"}
              </button>
            </div>
          </div>

          <aside className={styles.templatePreviewRail}>
            <div className={styles.templatePreviewCardCompact}>
              <div className={styles.templatePreviewHeaderCompact}>
                <div>
                  <p className={styles.sectionEyebrow}>Preview do template</p>
                  <strong>{templateComposer.name || "novo_template_meta"}</strong>
                </div>
                <span className={styles.metaBadge}>{templateComposer.language || "pt_BR"}</span>
              </div>

              <div className={styles.templatePreviewSection}>
                <span>Cabecalho</span>
                <p>{renderHeaderLabel(templateComposer)}</p>
              </div>

              <div className={styles.templatePreviewSection}>
                <span>Corpo</span>
                <pre className={styles.templatePreviewBodyCompact}>{templateComposer.bodyText || "Digite a mensagem do template."}</pre>
              </div>

              <div className={styles.templatePreviewSection}>
                <span>Rodape</span>
                <p>{templateComposer.footerText || "Sem rodape"}</p>
              </div>

              <div className={styles.templatePreviewSection}>
                <span>Botoes</span>
                {templateButtons.length > 0 ? (
                  <div className={styles.templatePreviewButtonsCompact}>
                    {templateButtons.map((button) => (
                      <div key={button} className={styles.templatePreviewButtonCompact}>
                        {button}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Sem botoes configurados.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </article>
    </section>
  );
}
