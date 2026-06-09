# Checkpoint Atual — Refatoração HBX

Branch:
refactor/master-tenant-clean-cut

Ultimo bloco analisado:
feat(tenant-communication): configurar canais de suporte por tenant

Ultimo commit base analisado:
aea69b05

Status:
Comunicacao por tenant aplicada como configuracao comum de empresa. Aguardando revisao apos commit/push.

Alterações extras de engine/deploy/docker/env:
Intencionais. Não reverter neste bloco.

Tarefa ativa:
Comunicacao por tenant

Pendências atuais:
1. SMTP futuro por tenant ainda pendente.
2. contactAdmin real ainda pendente; communication.support.contactAdmin permanece backendEnforced=false.
3. Master Provisioning completo ainda pendente fora dos canais de comunicacao.
4. Transferencia assistida dos dados antigos para tenant HBX ainda pendente.
5. Frontend ainda precisa continuar reduzindo calculos locais de permissao em outros blocos.
6. Auditoria final ampla de runtime sem HBX especial ainda pendente.
7. Nao mexer/reverter engine/deploy/docker/env.

Concluído neste bloco:
1. Company recebeu supportEmail, replyToEmail, supportWhatsapp e communicationSettingsJson.
2. Migration incremental MIGRATION_ONLY criada com backfill apenas para companyKind='tenant'.
3. Novo TenantCommunicationModule expõe GET/PATCH /tenant-communication/settings.
4. platform_infra fica bloqueado para comunicacao comercial de tenant.
5. GET exige communication.support.viewCompanySupportChannels e respeita explicit false de ADMIN.
6. PATCH exige team.access.manage e grava os canais no tenant.
7. MasterProvisioning grava os canais na Company e mostra persistence=ready.
8. Vendas usa replyToEmail/supportEmail/contactEmail do tenant quando communication.email.useCompanyReplyTo permite.
9. Requisicao explicita de reply-to da empresa sem capability e bloqueada.
10. Gerencial recebeu guia Comunicacao consumindo o endpoint do backend.
11. Catalogo marca communication.email.useCompanyReplyTo e communication.support.viewCompanySupportChannels como backendEnforced=true.
12. communication.support.contactAdmin permanece backendEnforced=false por nao haver envio real neste commit.
13. Grep obrigatorio de runtime retornou zero ocorrencias.

Aviso final combinado:
HBX CHECKPOINT: pronto para revisão
