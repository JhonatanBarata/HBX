import { useState } from "react";

import type { PendingOnboardingAttachment, SellerOnboardingAttachment, SellerOnboardingReadiness } from "./types";

const DOCUMENT_SLOTS = [
  { kind: "photo_id", label: "Documento", required: true },
  { kind: "curriculum", label: "Currículo", required: false },
  { kind: "contract_pdf", label: "Contrato assinado", required: true },
  { kind: "other", label: "Outro", required: false },
] as const;

type PartnerOnboardingPanelProps = {
  canUseDocs: boolean;
  canPersistDocs: boolean;
  canActivatePartner: boolean;
  onboardingReadiness?: SellerOnboardingReadiness | null;
  pendingOnboardingAttachments: Record<string, PendingOnboardingAttachment>;
  pendingDocumentRequirements: Record<string, boolean>;
  onboardingAttachments: SellerOnboardingAttachment[];
  uploadingAttachmentKind: string | null;
  downloadingOnboardingAttachmentId: string | null;
  removingOnboardingAttachmentId: string | null;
  generatingContract: boolean;
  sendingOnboardingEmail: boolean;
  togglingActiveUserId: number | null;
  onboardingUserId: number | null;
  onboardingAttachmentLabel: (kind?: string | null) => string;
  contractTemplateDraft: string;
  setContractTemplateDraft: (value: string) => void;
  contractTemplateVariables: string[];
  savingContractTemplate: boolean;
  contractTextDraft: string;
  setContractTextDraft: (value: string) => void;
  savingContractText: boolean;
  resettingContractText: boolean;
  uploadOnboardingAttachment: (kind: SellerOnboardingAttachment["kind"], file: File | null | undefined, required: boolean) => void;
  updateOnboardingDocumentRequirement: (kind: SellerOnboardingAttachment["kind"], required: boolean) => void;
  downloadOnboardingAttachment: (attachment: SellerOnboardingAttachment) => void;
  removeOnboardingAttachment: (kind: SellerOnboardingAttachment["kind"], attachment?: SellerOnboardingAttachment | null) => void;
  saveOnboardingContractTemplate: (template?: string) => Promise<void> | void;
  saveOnboardingContractText: () => void;
  resetOnboardingContractText: () => void;
  generateOnboardingContract: () => void;
  sendOnboardingEmail: () => void;
  activateOnboardingPartner: () => void;
};

export default function PartnerOnboardingPanel({
  canUseDocs,
  canPersistDocs,
  canActivatePartner,
  onboardingReadiness,
  pendingOnboardingAttachments,
  pendingDocumentRequirements,
  onboardingAttachments,
  uploadingAttachmentKind,
  downloadingOnboardingAttachmentId,
  removingOnboardingAttachmentId,
  generatingContract,
  sendingOnboardingEmail,
  togglingActiveUserId,
  onboardingUserId,
  onboardingAttachmentLabel,
  contractTemplateDraft,
  setContractTemplateDraft,
  contractTemplateVariables,
  savingContractTemplate,
  contractTextDraft,
  setContractTextDraft,
  savingContractText,
  resettingContractText,
  uploadOnboardingAttachment,
  updateOnboardingDocumentRequirement,
  downloadOnboardingAttachment,
  removeOnboardingAttachment,
  saveOnboardingContractTemplate,
  saveOnboardingContractText,
  resetOnboardingContractText,
  generateOnboardingContract,
  sendOnboardingEmail,
  activateOnboardingPartner,
}: PartnerOnboardingPanelProps) {
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateVariablesOpen, setTemplateVariablesOpen] = useState(false);
  const [templateEditorDraft, setTemplateEditorDraft] = useState(contractTemplateDraft);
  const documentReadiness = new Map((onboardingReadiness?.documents || []).map((item) => [String(item.kind), item]));
  const missingRequiredLabels = onboardingReadiness?.missingRequiredDocuments.map((item) => item.label) || [];
  const missingActivationLabels = onboardingReadiness?.missingActivationRequirements?.map((item) => item.label).filter(Boolean) || [];
  const onboardingIssueLabels = [
    ...missingRequiredLabels.map((label) => `Falta: ${label}`),
    ...missingActivationLabels.map((label) => `Falta: ${label}`),
  ];
  const pendingAttachmentCount = Object.keys(pendingOnboardingAttachments).length;
  const activeOnboardingAttachments = onboardingAttachments.filter((item) => item.status !== "deleted");
  const generatedContractAttachment = activeOnboardingAttachments.find((item) => item.kind === "generated_contract") || null;
  const visibleDocumentAttachments = activeOnboardingAttachments.filter((item) => item.kind !== "generated_contract");
  const createPartnerDisabledReason = onboardingIssueLabels.join(", ");

  function openTemplateEditor() {
    setTemplateEditorDraft(contractTemplateDraft);
    setTemplateVariablesOpen(false);
    setTemplateEditorOpen(true);
  }

  return (
    <div className="hbx-partner-popup__panel" data-disabled={!canUseDocs}>
      {templateEditorOpen ? (
        <div className="hbx-popup-layer hbx-popup-layer--contract-template" data-clickable="true" role="presentation">
          <section className="hbx-popup2 hbx-popup2--contract-template" data-tone="info" role="dialog" aria-modal="true" aria-label="Editar modelo do contrato">
            <header className="hbx-partner-popup__header">
              <div>
                <strong>Modelo padrão do contrato</strong>
                <span>Vale para os próximos contratos de vendedor.</span>
              </div>
              <button type="button" className="hbx-popup2__close" onClick={() => setTemplateEditorOpen(false)} aria-label="Fechar">
                ×
              </button>
            </header>
            <div className="hbx-contract-template-modal__body">
              {templateVariablesOpen ? (
                <div className="hbx-partner-popup__contract-vars">
                  {contractTemplateVariables.map((variable) => (
                    <code key={variable}>{variable}</code>
                  ))}
                </div>
              ) : null}
              <textarea
                value={templateEditorDraft}
                onChange={(event) => setTemplateEditorDraft(event.target.value)}
                disabled={savingContractTemplate}
                spellCheck
              />
            </div>
            <footer className="hbx-contract-template-modal__footer">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTemplateVariablesOpen((value) => !value)} disabled={savingContractTemplate}>
                Variáveis
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={savingContractTemplate}
                onClick={async () => {
                  setContractTemplateDraft(templateEditorDraft);
                  await saveOnboardingContractTemplate(templateEditorDraft);
                  setTemplateEditorOpen(false);
                }}
              >
                {savingContractTemplate ? "Salvando..." : "Salvar"}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTemplateEditorOpen(false)} disabled={savingContractTemplate}>
                Cancelar
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {canUseDocs ? (
        <div className="hbx-partner-popup__contract-editor">
          <div className="hbx-partner-popup__contract-editor-head">
            <span>
              <b>Contrato deste vendedor</b>
              <small>{onboardingUserId ? "Texto usado no PDF gerado" : "Disponível após cadastrar"}</small>
            </span>
            <div>
              <button type="button" disabled={!canPersistDocs || savingContractText} onClick={saveOnboardingContractText} className="btn btn-secondary btn-sm">
                {savingContractText ? "Salvando..." : "Salvar texto"}
              </button>
              <button type="button" disabled={!canPersistDocs || resettingContractText} onClick={resetOnboardingContractText} className="btn btn-secondary btn-sm">
                {resettingContractText ? "Aplicando..." : "Aplicar modelo"}
              </button>
            </div>
          </div>
          <textarea
            value={contractTextDraft}
            onChange={(event) => setContractTextDraft(event.target.value)}
            disabled={!canPersistDocs || savingContractText || resettingContractText}
            spellCheck
          />
        </div>
      ) : null}
      {generatedContractAttachment ? (
        <div className="hbx-partner-popup__generated-contract">
          <span>
            <b>PDF gerado para envio</b>
            <small>{generatedContractAttachment.originalFilename || "contrato-parceria-hbx.pdf"}</small>
          </span>
          <button type="button" disabled={downloadingOnboardingAttachmentId === generatedContractAttachment.id} onClick={() => downloadOnboardingAttachment(generatedContractAttachment)}>
            {downloadingOnboardingAttachmentId === generatedContractAttachment.id ? "Baixando..." : "Baixar"}
          </button>
          <button type="button" disabled={removingOnboardingAttachmentId === generatedContractAttachment.id} onClick={() => removeOnboardingAttachment("generated_contract", generatedContractAttachment)}>
            {removingOnboardingAttachmentId === generatedContractAttachment.id ? "Removendo..." : "Remover"}
          </button>
        </div>
      ) : null}
      <div className="hbx-partner-popup__docs">
        {DOCUMENT_SLOTS.map((slot) => {
          const attachment = onboardingAttachments.find((item) => item.kind === slot.kind && item.status !== "deleted");
          const displayAttachment = attachment;
          const pendingAttachment = pendingOnboardingAttachments[slot.kind];
          const readiness = documentReadiness.get(slot.kind);
          const pendingRequirement = pendingDocumentRequirements[slot.kind];
          const required = readiness ? readiness.required : pendingRequirement ?? pendingAttachment?.required ?? slot.required;
          return (
            <label
              key={slot.kind}
              className="hbx-partner-popup__upload"
              data-pending={Boolean(pendingAttachment)}
              data-ready={Boolean(attachment)}
            >
              <span>
                <b>{slot.label}</b>
                <small>
                  {displayAttachment
                    ? displayAttachment.originalFilename
                    : pendingAttachment
                      ? `${pendingAttachment.file.name} pronto`
                      : required
                        ? "Obrigatório pendente"
                        : "Opcional"}
                </small>
              </span>
              <input
                type="file"
                accept={slot.kind === "contract_pdf" ? ".pdf" : ".pdf,.jpg,.jpeg,.png"}
                disabled={!canUseDocs || uploadingAttachmentKind === slot.kind}
                onChange={(event) => {
                  uploadOnboardingAttachment(slot.kind, event.target.files?.[0], required);
                  event.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                disabled={!canUseDocs}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  updateOnboardingDocumentRequirement(slot.kind, !required);
                }}
              >
                {required ? "Obrigatório" : "Opcional"}
              </button>
              {displayAttachment ? (
                <button
                  type="button"
                  disabled={downloadingOnboardingAttachmentId === displayAttachment.id}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    downloadOnboardingAttachment(displayAttachment);
                  }}
                >
                  {downloadingOnboardingAttachmentId === displayAttachment.id ? "Baixando..." : "Baixar"}
                </button>
              ) : null}
              {attachment || pendingAttachment ? (
                <button
                  type="button"
                  disabled={removingOnboardingAttachmentId === attachment?.id}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    removeOnboardingAttachment(slot.kind, attachment);
                  }}
                >
                  {removingOnboardingAttachmentId === attachment?.id ? "Removendo..." : "Remover"}
                </button>
              ) : null}
            </label>
          );
        })}
      </div>
      <div className="hbx-partner-popup__actions">
        <button type="button" disabled={!canUseDocs} onClick={openTemplateEditor} className="btn btn-secondary btn-sm">
          Editar modelo
        </button>
        <button type="button" disabled={!canPersistDocs || generatingContract} onClick={generateOnboardingContract} className="btn btn-secondary btn-sm">
          {generatingContract ? "Gerando..." : "Gerar contrato PDF"}
        </button>
        <button type="button" disabled={!canPersistDocs || sendingOnboardingEmail} onClick={sendOnboardingEmail} className="btn btn-primary btn-sm">
          {sendingOnboardingEmail ? "Enviando..." : "Solicitar documentos"}
        </button>
        <button
          type="button"
          disabled={!canActivatePartner || togglingActiveUserId === onboardingUserId}
          onClick={activateOnboardingPartner}
          className="btn btn-success btn-sm"
          title={!canActivatePartner && createPartnerDisabledReason ? createPartnerDisabledReason : undefined}
        >
          {togglingActiveUserId === onboardingUserId ? "Criando..." : "Liberar vendedor"}
        </button>
      </div>
      {visibleDocumentAttachments.length || pendingAttachmentCount || onboardingIssueLabels.length ? (
        <div className="hbx-partner-popup__chips">
          {onboardingIssueLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
          {visibleDocumentAttachments.slice(0, 6).map((item) => (
            <span key={item.id}>{onboardingAttachmentLabel(item.kind)}</span>
          ))}
          {Object.values(pendingOnboardingAttachments).map((item) => (
            <span key={String(item.kind)}>{onboardingAttachmentLabel(item.kind)} pronto</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
