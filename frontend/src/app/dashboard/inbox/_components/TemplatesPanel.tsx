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
  onReload: () => void;
  onSync: () => void;
  onToggleActivation: (template: RecoveryMetaTemplateItem, active: boolean) => void;
  onComposerChange: (updater: (current: TemplateComposer) => TemplateComposer) => void;
  onCreateTemplate: () => void;
  onDeleteTemplate: (template: RecoveryMetaTemplateItem) => void;
};

export default function TemplatesPanel({
  loadingTemplates,
  syncingTemplates,
  metaTemplates,
  templateComposer,
  creatingTemplate,
  deletingTemplateId,
  onReload,
  onSync,
  onToggleActivation,
  onComposerChange,
  onCreateTemplate,
  onDeleteTemplate,
}: TemplatesPanelProps) {
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
            <h3>Novo template</h3>
          </div>
        </div>
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
          <span>Botoes de resposta rapida</span>
          <textarea
            className="field"
            rows={4}
            value={templateComposer.buttonsText}
            onChange={(event) =>
              onComposerChange((current) => ({ ...current, buttonsText: event.target.value }))
            }
          />
          <small>Um botao por linha.</small>
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
            {creatingTemplate ? "Criando..." : "Criar template"}
          </button>
        </div>
      </article>
    </section>
  );
}
