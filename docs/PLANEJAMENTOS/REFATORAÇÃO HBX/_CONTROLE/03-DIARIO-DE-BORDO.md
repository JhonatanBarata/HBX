# Diário de Bordo — Refatoração HBX

## Checkpoint inicial

Branch:
refactor/master-tenant-clean-cut

Estamos migrando o HBX para arquitetura onde:
- HBX é tenant comum.
- Master é plataforma/infra/provisionamento.
- Gerencial accessMap manda nas capacidades.
- Produtos são dados de tenant.
- Vendas respeita accessMap.

Próxima ação:
Aplicar fix(products): ajustar catalogo tenant e mascaramento de preco.

## Fix Products — catálogo tenant e preço

Aplicado:
- Product.kind padrão corrigido para tenant_product.
- Migration incremental criada para backfill de kind service para tenant_product.
- Produtos HBX seguem como platform_plan apenas dentro do tenant HBX.
- Payload de Vendas oculta preço de produto quando products.viewPrice=false.
- ProductsService deixou de expor métodos legados por companyId cru.
- commission.viewInherited voltou para backendEnforced=false.

Validação:
- prisma:validate passou.
- build backend passou.
- testes focados de products, tenant-product-seed, team-access-runtime e vendas passaram.

Próxima ação:
Comunicação por tenant.

## Review fix — mascaramento fail-closed

Aplicado:
- buildLeadPayload passou a ocultar preço de produto quando não recebe accessContext.
- Retornos de card para usuário continuam passando contexto de accessMap.
- getLeadConversationSnapshotForUser não retorna card/preço de produto; retorna apenas conversa/mensagens.
- Testes adicionados para chamada sem accessContext, updateLeadForUser, createManualLeadForUser e importWebscrapingLeadsForUser.

Validação parcial:
- build backend passou.
- teste focado de Vendas passou.

Próxima ação:
Rodar validações obrigatórias completas e publicar commit.

## Comunicação por tenant

Aplicado:
- Company recebeu supportEmail, replyToEmail, supportWhatsapp e communicationSettingsJson.
- Migration incremental criada com backfill apenas para tenants.
- TenantCommunicationModule criado com GET/PATCH /tenant-communication/settings.
- platform_infra foi bloqueado para comunicacao comercial de tenant.
- Leitura de canais exige communication.support.viewCompanySupportChannels.
- Edicao de canais exige team.access.manage.
- MasterProvisioning passou a persistir canais de suporte/reply-to/WhatsApp e mostra persistence=ready.
- Vendas passou a usar reply-to da empresa somente quando communication.email.useCompanyReplyTo permite.
- Pedido explicito de reply-to da empresa sem capability e bloqueado.
- Gerencial recebeu guia Comunicacao consumindo o endpoint backend.
- Catalogo marcou communication.email.useCompanyReplyTo e communication.support.viewCompanySupportChannels como backendEnforced=true.
- communication.support.contactAdmin ficou backendEnforced=false porque o envio real de suporte nao foi implementado nesta fase.

Validação:
- prisma:validate passou.
- build backend passou.
- teste de tenant-communication passou.
- teste de master-provisioning passou.
- teste de vendas passou.
- teste de team-access-runtime passou.
- frontend lint passou.
- frontend build passou.
- grep obrigatorio de runtime retornou zero ocorrencias.

Próxima ação:
Revisar o bloco de comunicacao por tenant antes de liberar teste local.

## Handoff WhatsApp operacional HBX

Aplicado:
- Migration incremental MIGRATION_ONLY criada para transferir o WhatsApp operacional historico para o tenant HBX comum.
- Quando ha credencial oficial configurada no Master, o tenant HBX passa a usar Token Master com masterWhatsAppCredentialKey, whatsappConnectionMode=OFFICIAL e whatsappStatus=CONNECTED.
- A credencial do Master prioriza a entrada importada da empresa tecnica quando sourceCompanyId corresponde ao hbx-master-whatsapp-engine.
- Se nao houver credencial Master mas houver token oficial na empresa tecnica, a migration copia o token oficial para o tenant HBX.
- Sessao QR/modal antiga nao e renomeada por copia de banco: como a instancia do provider usa a chave criada originalmente, o runtime passa a aceitar a tenantKey da sessao ativa atual.
- Segunda migration incremental reatribui a sessao Webwhats ativa da empresa tecnica ao tenant HBX e aponta currentWhatsappConnectionSessionId para ela.
- WebwhatsBridge usa a tenantKey da sessao ativa para envio/controle.
- WhatsAppModalService usa a tenantKey da sessao ativa para status/health quando ela existe.

Validação:
- prisma:validate passou.
- build backend passou.
- migrations 20260609_hbx_tenant_whatsapp_handoff e 20260609_hbx_tenant_whatsapp_session_handoff aplicadas no banco local.
- testes focados de whatsapp-modal e webwhats-bridge passaram.
- backend Docker reconstruido/reiniciado e ficou healthy.
- HBX local verificado com whatsappModalStatus=CONNECTED, currentWhatsappConnectionSessionId preenchido e sessao Webwhats ativa no tenant.
