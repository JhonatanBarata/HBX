# Runtime schema ensures

Este documento lista mutacoes de schema que ainda rodam em runtime. Elas continuam ativas por compatibilidade, mas devem sair gradualmente para migrations versionadas.

## Relatorio de health

Comando:

```bash
cd backend
node scripts/schema-health-report.js
```

O script apenas consulta `information_schema`. Ele nao executa `ALTER TABLE`, `CREATE TABLE` ou `CREATE INDEX`.

Quando o banco nao esta disponivel, o script imprime um JSON com `dbAvailable: false`, `ok: false` e sai sem falhar o processo. Para usar como gate operacional quando o banco estiver disponivel:

```bash
cd backend
node scripts/schema-health-report.js --strict
```

## Ensures no bootstrap do PrismaService

Arquivo: `backend/src/prisma/prisma.service.ts`

| Ensure | Alvo | Status |
| --- | --- | --- |
| `ensureCompanyCommissionSettingsColumns` | `Company.commissionDueBusinessDays` | deve virar migration |
| `ensureUserSalesProfileColumns` | colunas comerciais e de distribuicao em `User` | deve virar migration |
| `ensureHbxPartnerReferralCandidateTables` | tabela `HbxPartnerReferralCandidate`, constraints e indexes | deve virar migration |
| `ensureVendasLeadAssignmentColumns` | colunas de atribuicao, venda e comissao em `VendasLead` | deve virar migration |
| `ensureVendasCommissionPayoutTables` | tabela `VendasCommissionPayout`, constraints e indexes | deve virar migration |
| `ensureVendasCommissionReceivableTables` | tabela `VendasCommissionReceivable`, constraints e indexes | deve virar migration |
| `ensureRadarAutoDistributionRuleTables` | tabela `RadarAutoDistributionRule`, constraints e indexes | deve virar migration |
| `ensureRadarDistributionDailyUsageTables` | limites diarios em `RadarAutoDistributionRule` e tabela `RadarDistributionDailyUsage` | deve virar migration |
| `ensureMasterNoticeTables` | tabelas `MasterNotice` e `MasterNoticeAck`, constraints e indexes | deve virar migration |

O bootstrap agora registra log para cada ensure:

- quando inicia;
- quando termina com sucesso;
- quando falha;
- se o alvo ainda deve virar migration.

## Ensures sob demanda em outros modulos

Estes ensures nao rodam no `onModuleInit`, mas ainda fazem mutacao de schema em runtime quando certos fluxos sao acessados.

| Ensure | Arquivo | Alvo | Status |
| --- | --- | --- | --- |
| `ensureMasterBillingRuntimeSchema` | `backend/src/modules/master-runtime.ts` | billing, Mercado Pago, WhatsApp, ledger financeiro, assinaturas e planos provider | deve virar migrations em lotes |
| `ensureWebsiteRuntimeSchema` | `backend/src/website/website-runtime.ts` | `CompanyWebsiteConfig` e `WebsiteAdminEntryToken` | deve virar migration |
| `ensureVendasComplaintsRuntimeSchema` | `backend/src/vendas/vendas-complaints-runtime.ts` | `VendasCardComplaint` e colunas de resolucao | deve virar migration |

## Plano de remocao gradual

1. Manter os ensures ativos enquanto o health report mede divergencia real entre ambientes.
2. Para cada ensure, confirmar se ja existe migration equivalente em `backend/prisma/migrations`.
3. Criar migration faltante para os alvos ainda cobertos apenas por runtime.
4. Rodar `node scripts/schema-health-report.js --strict` em ambiente com banco atualizado.
5. Depois de uma janela sem divergencias, remover o ensure correspondente em uma camada pequena e atomica.
6. Repetir por grupo funcional: Prisma bootstrap, billing/master, website, vendas complaints.

## Alvos recentes ja cobertos por migration

O health report tambem verifica tabelas criticas recentes que nao dependem de runtime ensure:

- `ExternalWebhookEvent`;
- `WhatsappConsentLedger`.

Elas ficam no relatorio para evidenciar se migrations de seguranca/compliance foram aplicadas antes de operacao real.
