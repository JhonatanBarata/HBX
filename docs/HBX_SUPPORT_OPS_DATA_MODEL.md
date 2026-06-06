# HBX Support Ops Data Model

Documento tecnico, sem migration.

## SupportTicket

Campos: id, code, companyId, requester, source, status, classification, priority, emotionalTone, createdAt, updatedAt.
Indices: code unico, companyId + status, classification + priority.
Riscos: PII e dados comerciais.

## SupportMessage

Campos: id, ticketId, direction, authorType, body, receivedAt, metadata.
Indices: ticketId + receivedAt.
Riscos: PII, prints e tokens acidentais.

## SupportAttachment

Campos: id, ticketId, messageId, fileName, mimeType, storageKey, size, createdAt.
Indices: ticketId.
Riscos: arquivos sensiveis.

## SupportTriage

Campos: id, ticketId, classification, emotionalTone, confidence, holdReason, humanRequired, createdAt.
Indices: ticketId + createdAt.
Riscos: classificacao errada liberar automacao.

## SupportCodexTask

Campos: id, ticketId, status, branch, prNumber, promptPath, riskFlags, createdAt, updatedAt.
Indices: ticketId, status.
Riscos: tocar auth, billing, secrets, migrations ou deploy.

## SupportCustomerReply

Campos: id, ticketId, status, body, approvedBy, sentAt, createdAt.
Indices: ticketId + status.
Riscos: resposta automatica indevida.
