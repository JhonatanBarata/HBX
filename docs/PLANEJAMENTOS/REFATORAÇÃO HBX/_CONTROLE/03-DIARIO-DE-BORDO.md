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
