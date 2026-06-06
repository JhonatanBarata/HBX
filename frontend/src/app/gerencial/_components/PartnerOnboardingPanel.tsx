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
  uploadOnboardingAttachment: (kind: SellerOnboardingAttachment["kind"], file: File | null | undefined, required: boolean) => void;
  updateOnboardingDocumentRequirement: (kind: SellerOnboardingAttachment["kind"], required: boolean) => void;
  downloadOnboardingAttachment: (attachment: SellerOnboardingAttachment) => void;
  removeOnboardingAttachment: (kind: SellerOnboardingAttachment["kind"], attachment?: SellerOnboardingAttachment | null) => void;
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
  uploadOnboardingAttachment,
  updateOnboardingDocumentRequirement,
  downloadOnboardingAttachment,
  removeOnboardingAttachment,
  generateOnboardingContract,
  sendOnboardingEmail,
  activateOnboardingPartner,
}: PartnerOnboardingPanelProps) {
  const documentReadiness = new Map((onboardingReadiness?.documents || []).map((item) => [String(item.kind), item]));
  const missingRequiredLabels = onboardingReadiness?.missingRequiredDocuments.map((item) => item.label) || [];
  const pendingAttachmentCount = Object.keys(pendingOnboardingAttachments).length;
  const activeOnboardingAttachments = onboardingAttachments.filter((item) => item.status !== "deleted");
  const generatedContractAttachment = activeOnboardingAttachments.find((item) => item.kind === "generated_contract") || null;
  const visibleDocumentAttachments = activeOnboardingAttachments.filter((item) => item.kind !== "generated_contract");

  return (
    <div className="hbx-partner-popup__panel" data-disabled={!canUseDocs}>
      <div className="hbx-partner-popup__status">
        <strong>{canUseDocs ? "Documentação do parceiro" : "Documentação disponível para vendedor"}</strong>
        <span>
          {canUseDocs
            ? canPersistDocs
              ? canActivatePartner
                ? "Tudo em ordem. Criar Parceiro envia login e senha por e-mail."
                : missingRequiredLabels.length
                  ? `Pendências obrigatórias: ${missingRequiredLabels.join(", ")}.`
                  : "Gere o PDF, envie por e-mail e aguarde o PDF assinado voltar."
              : pendingAttachmentCount
                ? `${pendingAttachmentCount} arquivo(s) pronto(s). Eles serão anexados ao cadastrar o vendedor.`
                : "Anexe o que você já recebeu e marque obrigatório/opcional antes de cadastrar."
            : "Troque o perfil para vendedor para anexar documentos."}
        </span>
      </div>
      {canUseDocs ? (
        <div className="hbx-partner-popup__contract-note">
          <b>Assinatura</b>
          <span>Assine pelo gov.br ou por assinatura digital de sua preferência.</span>
        </div>
      ) : null}
      <div className="hbx-partner-popup__docs">
        {DOCUMENT_SLOTS.map((slot) => {
          const attachment = onboardingAttachments.find((item) => item.kind === slot.kind && item.status !== "deleted");
          const displayAttachment = slot.kind === "contract_pdf" && !attachment ? generatedContractAttachment : attachment;
          const displayGeneratedContract = slot.kind === "contract_pdf" && !attachment && Boolean(generatedContractAttachment);
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
              data-generated={Boolean(displayGeneratedContract)}
            >
              <span>
                <b>{slot.label}</b>
                <small>
                  {displayAttachment
                    ? displayGeneratedContract
                      ? `${displayAttachment.originalFilename || "contrato-parceria-hbx.pdf"} gerado`
                      : displayAttachment.originalFilename
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
        <button type="button" disabled={!canPersistDocs || generatingContract} onClick={generateOnboardingContract} className="btn btn-secondary btn-sm">
          {generatingContract ? "Gerando..." : "Gerar contrato PDF"}
        </button>
        <button type="button" disabled={!canPersistDocs || sendingOnboardingEmail} onClick={sendOnboardingEmail} className="btn btn-primary btn-sm">
          {sendingOnboardingEmail ? "Enviando..." : "Solicitar documentos"}
        </button>
        <button type="button" disabled={!canActivatePartner || togglingActiveUserId === onboardingUserId} onClick={activateOnboardingPartner} className="btn btn-success btn-sm">
          {togglingActiveUserId === onboardingUserId ? "Criando..." : "Criar parceiro"}
        </button>
      </div>
      {visibleDocumentAttachments.length || pendingAttachmentCount ? (
        <div className="hbx-partner-popup__chips">
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
