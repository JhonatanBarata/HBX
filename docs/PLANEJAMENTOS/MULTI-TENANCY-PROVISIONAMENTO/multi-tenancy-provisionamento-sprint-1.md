# Multi-tenancy — Sprint 1: Trava de escopo + prova de isolamento

> Arquitetura nº7. Ordem de trabalho para 1 subagente. Ler `docs/Rules/BACKEND.md` antes.
> **Não muda schema. Não muda contrato de endpoint vivo.**

## Por quê ($)
Hoje o isolamento entre tenants é convenção: cada service escreve `where: { companyId }`
na mão e nada barra uma query esquecida. Exemplo REAL encontrado na revisão de 01/07:
`gerencial.service.ts:657` — `satisfactionSurvey.findMany` sem filtro de empresa, puxa
as 300 pesquisas mais recentes de TODOS os tenants (com nome+telefone do cliente) e
filtra depois em memória. Um vazamento desses num B2B = cliente cancela + exposição
LGPD (multa até 2% do faturamento). Este sprint compra ~90% da proteção por ~10% do
custo total do plano.

## Escopo
1. **Tenant guard no Prisma (`$extends`)** — novo arquivo
   `backend/src/prisma/tenant-guard.extension.ts`, aplicado no `PrismaService`:
   - Lista de modelos tenant-scoped GERADA do schema (todo model com campo
     `companyId`/`empresaId`) + allowlist explícita de modelos globais
     (`SystemModule`, catálogos, `Company` em si, tabelas master).
   - Para `findMany/findFirst/count/aggregate/groupBy/updateMany/deleteMany` em modelo
     tenant-scoped SEM `companyId` no `where` (em qualquer nível do AND raiz):
     - `HBX_TENANT_GUARD_MODE=report` (default em prod): loga estruturado
       `[tenant-guard] unscoped model=X op=Y stack=...` e DEIXA PASSAR.
     - `enforce`: lança exceção. `off`: desliga.
     - Em dev/test: default `enforce` (quebra cedo, na mesa do dev).
   - Escape hatch consciente: helper `withoutTenantScope(reason)` (ou flag no args
     via extensão) para chamadas master legítimas — SEMPRE com motivo logado.
   - `$queryRaw/$executeRaw` NÃO são cobertos — deixar claro no log de boot.
2. **Corrigir os unscoped conhecidos** que o guard vai acusar de cara:
   - `gerencial.service.ts:657` (`satisfactionSurvey.findMany` — escopar por
     `conversation.companyId` ou aposentar a leitura; ver sprint 2).
   - Triagem dos demais hits do modo report (listar no PR, corrigir os de tenant,
     allowlistar os master com motivo).
3. **Suíte e2e de isolamento** — `backend/test/tenant-isolation.e2e-spec.ts` (ou
   pasta e2e existente): sobe 2 empresas seed (A e B) com 1 registro em cada domínio
   quente (customerProfile, atendimentoCustomer, vendasLead, cadastro cliente,
   companyConversation) e verifica com o token de A:
   - GET por id de recurso de B → 404/403 (nunca 200);
   - listagens → zero itens de B;
   - PATCH/DELETE em id de B → 404/403 e dado de B intacto.
4. **Lint de escopo** — script `backend/scripts/check-tenant-scope.mjs` (mesmo espírito
   do `check-pele.mjs`): varre services por `findMany(`/`findFirst(` de modelos tenant
   sem literal `companyId` próximo; heurístico, roda no lint, complementa o guard em
   runtime cobrindo o que só aparece em código morto/raro.
5. **Fechar porta órfã** — remover `POST /companies` + `CompaniesService.create` +
   a re-associação `usersService.updateCompany` do controller
   (`companies.controller.ts:361-370`). Frontend NÃO chama (verificado 01/07); é
   superfície onde qualquer autenticado cria empresa e se re-associa sem auditoria.
   ⚠️ Item toca autorização → **executar SÓ com OK explícito do dono nesta tarefa**
   (regra do CLAUDE.md); o resto do sprint não depende dele.

## Fora de escopo
RLS, mudanças de schema, criptografia de segredo, pipeline de nascimento (sprints 2–5).

## Checks (BACKEND.md)
- `cd backend && npm run build` e typecheck verdes.
- Testes novos passando; rodar testes direcionados de gerencial/companies.
- Subir local (`npm run up`) com `HBX_TENANT_GUARD_MODE=report` e exercitar
  dashboard/atendimento/vendas → coletar hits do guard no log e triar.

## Aceite
- Guard ativo em report na publicação, com contagem de hits documentada no PR.
- e2e de isolamento verde com 2 tenants.
- `satisfactionSurvey` do gerencial escopado (ou leitura removida).
- Nenhum endpoint vivo mudou payload/contrato.
