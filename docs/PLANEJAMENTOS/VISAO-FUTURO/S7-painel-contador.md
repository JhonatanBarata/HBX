# S7 — PAINEL DO CONTADOR (PLANO — não construído; executar quando houver 1 contador piloto)

> Canal de distribuição embutido: 1 contador enxerga N empresas (read-only fiscal). Contador não
> paga — indica e lucra tempo (com S6/S7 do Contábil ligados, o HBX faz o braçal dele).
> GATE de negócio: só construir com 1 contador real disposto a pilotar com 5+ empresas.

## Desenho
- **NÃO** dar role cross-tenant a User comum (auth é 1-user-1-company). Criar vínculo explícito:
  tabela `AccountantLink` (id, accountantUserId, companyId, status convite→aceito, createdAt,
  @@unique([accountantUserId, companyId])) via migration formal.
- Contador é um User de uma company própria "escritório" (kind próprio? conferir `Company.companyKind`,
  schema.prisma:16). O vínculo dá acesso READ-ONLY a um subconjunto: obrigações fiscais
  (FiscalObligation), NFS-e emitidas (FiscalInvoice), DAS armado (S7 Serpro), status do FiscalProfile.
- Convite parte do TENANT (admin digita e-mail do contador em Configurações → Contábil); contador
  aceita logado. Revogável pelos dois lados.
- Tela nova `/contador` (grupo app): lista de empresas vinculadas → drill-down read-only do relógio
  fiscal de cada uma. NUNCA valores de venda/financeiro do tenant (LEI DO VENDEDOR + minimização LGPD):
  só o fiscal.
- Flag `HBX_CONTADOR_ENABLED` default OFF; endpoints 404 com OFF.

## Segurança (o motivo de isto ser sprint própria)
- Todo endpoint do contador re-verifica o vínculo ATIVO por request (nunca confiar em cache/JWT claim).
- TenantContext: queries do contador rodam com companyId da EMPRESA-ALVO explicitado; guard novo
  `AccountantLinkGuard` que valida (userId, companyId da rota) contra a tabela. Auditar acesso (log).
- Rate-limit normal; sem export em massa no v1.

## Amarração com indicação (S5)
Contador com link ativo ganha código de indicação automático (mesma engine S5) — cada empresa que
ele traz gera crédito/bonificação. Comissão em R$ (recorrente) é decisão de negócio do dono — a engine
de comissão de vendedor existente (`HBX_COMMISSION_*`) é o precedente se quiser dinheiro em vez de crédito.

## Esforço estimado: 2-3 sprints de worker (migration+guard+endpoints; tela lista+drill; convite/revogação+testes).
