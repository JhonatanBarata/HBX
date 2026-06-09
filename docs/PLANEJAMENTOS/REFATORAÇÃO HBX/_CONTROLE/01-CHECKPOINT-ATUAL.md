# Checkpoint Atual — Refatoração HBX

Branch:
refactor/master-tenant-clean-cut

Ultimo bloco analisado:
fix(master): transferir whatsapp operacional para tenant hbx

Ultimo commit base analisado:
c27dba89

Status:
Handoff do WhatsApp operacional antigo para o tenant HBX aplicado via migration MIGRATION_ONLY. Aguardando revisao apos commit/push.

Alterações extras de engine/deploy/docker/env:
Intencionais. Não reverter neste bloco.

Tarefa ativa:
Handoff WhatsApp operacional HBX

Pendências atuais:
1. SMTP futuro por tenant ainda pendente.
2. contactAdmin real ainda pendente; communication.support.contactAdmin permanece backendEnforced=false.
3. Master Provisioning completo ainda pendente fora dos canais de comunicacao.
4. Sessao QR antiga nao deve ser renomeada por copia de banco, pois a instancia do provider usa a chave criada originalmente. O runtime agora aceita a tenantKey da sessao ativa apontada em currentWhatsappConnectionSessionId.
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
14. Migration MIGRATION_ONLY 20260609_hbx_tenant_whatsapp_handoff liga o tenant HBX ao Token Master quando ha credencial oficial configurada.
15. O tenant HBX recebe whatsappConnectionMode=OFFICIAL, useMasterWhatsAppToken=true, masterWhatsAppCredentialKey e whatsappStatus=CONNECTED quando a credencial oficial existe.
16. Como fallback, se nao houver credencial no Master mas houver token oficial na empresa tecnica, o token oficial e copiado para o tenant HBX.
17. QR/modal antigo nao e renomeado por copia direta; quando encontrado sem credencial oficial, a sessao ativa Webwhats e reatribuida ao tenant HBX e mantem a tenantKey original do provider.
18. WebwhatsBridge e WhatsAppModalService passam a usar a tenantKey da sessao ativa atual quando existir, sem regra runtime por slug HBX.

Aviso final combinado:
HBX CHECKPOINT: pronto para revisão
