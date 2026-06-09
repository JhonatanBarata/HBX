# Arquitetura Suprema HBX

Regras supremas:

1. HBX é tenant comum.
2. System Master não é empresa.
3. platform_infra não opera módulos comerciais.
4. Produto HBX é dado cadastrado no tenant HBX, não regra especial.
5. Não usar slug hbx como privilégio runtime.
6. Slug hbx só pode aparecer em seed/backfill marcado como SEED_ONLY ou MIGRATION_ONLY.
7. Não usar companyId cru em service novo.
8. Frontend não decide permissão.
9. accessMap do Gerencial é a fonte de verdade do vendedor.
10. Se algo aparece para vendedor, precisa existir no catálogo de acessos.
11. backendEnforced=true só quando há enforcement real e teste.
12. Master cria/configura tenants; tenant opera o sistema.
13. platform_infra só serve para infraestrutura técnica, principalmente motor WhatsApp/engine.
14. Não criar fallback permissivo.
15. Não maquiar pendência.
