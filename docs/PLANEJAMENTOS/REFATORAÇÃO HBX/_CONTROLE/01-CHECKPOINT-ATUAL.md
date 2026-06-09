# Checkpoint Atual — Refatoração HBX

Branch:
refactor/master-tenant-clean-cut

Último bloco analisado:
fix(vendas): fechar mascaramento de preco de produto

Último commit base analisado:
e3a0798b

Status:
Aplicado review fix do mascaramento de preço de produto em Vendas. Pronto para teste local após commit/push.

Alterações extras de engine/deploy/docker/env:
Intencionais. Não reverter neste bloco.

Tarefa ativa:
Comunicação por tenant

Pendências atuais:
1. supportEmail/replyToEmail/supportWhatsapp por tenant ainda precisam bloco próprio.
2. SMTP futuro por tenant ainda pendente.
3. Master Provisioning completo ainda pendente.
4. Transferência assistida dos dados antigos para tenant HBX ainda pendente.
5. Frontend ainda precisa parar de calcular permissões e consumir capabilities do backend.
6. Auditoria final de runtime sem HBX especial ainda pendente.
7. Não mexer/reverter engine/deploy/docker/env.

Concluído neste bloco:
1. Product.kind agora usa tenant_product como padrão canônico.
2. Backfill Product.kind='service' -> 'tenant_product' criado em migration incremental MIGRATION_ONLY.
3. Vendas mascara preço de produto para usuário sem products.viewPrice.
4. ProductsService removeu métodos legados com companyId cru.
5. commission.viewInherited voltou para backendEnforced=false.
6. products.* permaneceram backendEnforced=true com testes focados.
7. buildLeadPayload agora é fail-closed para preço de produto sem accessContext.
8. Retornos de card em Vendas passam contexto de acesso onde há usuário.
9. Testes cobrem board, createManualLeadForUser, updateLeadForUser, importWebscrapingLeadsForUser e chamada sem accessContext.

Aviso final combinado:
HBX CHECKPOINT: pronto para teste local
