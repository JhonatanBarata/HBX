# Multi-tenancy — Sprint 3: Deleção declarativa + exclusão LGPD em 2 fases

> Arquitetura nº7. Ordem de trabalho para 1 subagente. Ler `docs/Rules/BACKEND.md` antes.
> Mexe em FKs (migrations de constraint, não-destrutivas de dado) e no fluxo de
> exclusão de empresa. Reembolso/cancelamento MP existentes NÃO mudam de regra.

## Por quê ($)
`permanentlyDeleteCompanyInternal` (`companies.service.ts:1197-1377`) apaga empresa com
~40 `deleteMany` numa lista de memória. Já quebrou 2× em produção (comentários no
próprio código: FK `WebscrapingSearchRun_userId_fkey`, `CompanyEmailSettings`). Cada
tabela nova criada daqui pra frente ou TRAVA a exclusão (500 no master) ou deixa dado
do cliente excluído vivo no banco — violação direta do direito de eliminação (LGPD
art. 18). Declarativo = modelo novo entra na cascata de graça, para sempre.

## Escopo
1. **Tabela de decisão de FKs (entregável no próprio PR):** listar toda FK que
   referencia `Company` ou `User` (hoje: 164 relações no schema, só 48 com Cascade) e
   classificar: `CASCADE` (dado do tenant), `RESTRICT` (proteção deliberada — ex.:
   nada; justificar se sobrar), `SET NULL` (autoria em registro que sobrevive, ex.:
   `DeletionRecord.deletedByUserId`, `ProductVersion.authorId`).
2. **Migrations de constraint:** aplicar `onDelete: Cascade`/`SetNull` conforme a
   tabela de decisão. São `ALTER TABLE ... DROP/ADD CONSTRAINT` — não destroem dado.
   Atenção às tabelas runtime-ensure fora do schema Prisma
   (`MasterBillingLedgerEntry`, `WebsiteAdminEntryToken`, `CompanyWebsiteConfig`,
   `FinanceiroCharge` via raw SQL na cascata): ou entram no schema de vez, ou ganham
   FK com cascade via migration SQL manual.
3. **Reescrever a exclusão:** manter na ordem atual (1) cancelar assinaturas MP,
   (2) reembolso proporcional best-effort, (3) **novo: export LGPD** — snapshot JSON
   completo por módulo gravado no `DeletionRecord` (hoje o snapshot é raso: empresa +
   usuários + counts), (4) `company.delete()` único — o banco cascateia.
4. **Exclusão em 2 fases (aproveitar o mecanismo de órfã que JÁ existe):**
   generalizar o fluxo `orphan_cleanup` (suspende → agenda `DeletionRecord` → purge
   após carência com restore automático) para TAMBÉM cobrir `master_hard_delete` e
   `admin_self_delete`: excluir = suspender + agendar purge em N dias
   (`COMPANY_DELETE_GRACE_DAYS`, default 30; órfã mantém 7). Master ganha
   "desfazer exclusão" de graça dentro da carência. Purge = passo 3.
   - Cancelamento MP/reembolso rodam NA HORA da exclusão (fase 1) — cliente não pode
     continuar sendo cobrado durante a carência.
5. **Teste de completude:** e2e que cria empresa, semeia 1 registro em CADA model com
   companyId (gerar a lista do schema, mesma fonte do tenant-guard do sprint 1),
   exclui, e roda query de auditoria provando zero linhas órfãs.

## Fora de escopo
Mudar regra de reembolso/cobrança; UI nova além do texto do confirm do master
(informar a carência); RLS.

## Checks (BACKEND.md)
- `npm run prisma:validate`, `npm run build`, testes de companies verdes.
- Migration testada em banco local com dado semeado antes de ir pra produção
  (migrations rodam no container via `start-prod.sh`).
- e2e de completude de deleção verde.

## Aceite
- `permanentlyDeleteCompanyInternal` reduzido a: MP + reembolso + export + delete.
- Tabela de decisão de FKs revisada no PR.
- Exclusão de master/admin passa pela carência com restore possível.
- Teste prova zero órfãos após purge.
