# Multi-tenancy — Sprint 4: Pipeline único de nascimento de tenant

> Arquitetura nº7. Ordem de trabalho para 1 subagente. Ler `docs/Rules/BACKEND.md` antes.
> **Backend é contrato:** os 3 endpoints existentes NÃO mudam de rota nem de payload —
> muda só a fundação por trás deles.

## Correção da análise anterior (importante)
A análise de 01/07 disse que "signup seeda módulos default e as portas divergem".
Revisado: `seedDefaultCompanyModulesTx` é **no-op deliberado** (modelo post-it
PB2 — empresa segue a caixa do plano AO VIVO; `CompanyModule` guarda só exceção
explícita do master). A divergência real entre as portas é outra:
- **Signup** (`auth.service.ts:1614`): seeda produtos default; empresa converge no
  checkout (trial exige cartão — regra travada do dono 16/06).
- **createByMaster** (`companies.service.ts:384`): NÃO seeda produtos nem canais.
- **provisionTenant** (`master-provisioning.service.ts:297`): seeda produtos,
  entitlements E **upserta `CompanyModule` por default — brigando com o modelo
  post-it** que o signup respeita.

## Por quê ($)
Empresa que nasce diferente conforme a porta = suporte manual depois (cliente do
convite sem produto seed, provisionada com post-it que ignora edição de plano).
Pipeline único = onboarding previsível, menos ticket, e o master-provisioning vira a
única fonte de verdade de "o que é uma empresa recém-nascida".

## Escopo
1. **Extrair o pipeline:** `backend/src/master-provisioning/tenant-provisioning.pipeline.ts`
   com a lógica de `provisionTenant` parametrizada por preset:
   - `self_service`: status `pending_checkout`, produtos default, sem entitlement,
     sem admin (o user já vem do signup) — chamado por `auth.service.signup`.
   - `master_invite`: idem + contato/convite — chamado por `createByMaster`
     (convite/e-mail continua na porta, fora do pipeline).
   - `master_full`: comportamento atual do provisioning (cortesia/trial, entitlements,
     admin com senha temporária, canais, implantação assistida).
2. **Alinhar ao modelo post-it:** no `master_full`, só gravar `CompanyModule` quando
   `modules` vier EXPLÍCITO no input (exceção real do master). Default (módulos do
   plano) = NÃO gravar nada — a caixa do plano ao vivo resolve
   (`module-access-policy.ts`). Documentar no código o porquê.
3. **Ledger de nascimento:** persistir os passos executados (o `plan.steps` já existe
   em memória) — coluna `provisioningLedgerJson` na Company ou tabela
   `TenantProvisioningRun` — para o suporte saber COMO cada empresa nasceu.
4. **Idempotência:** re-chamada com mesmo slug não duplica nada (hoje já recusa por
   slug; manter e cobrir seeds parciais — retomar do passo que faltou).
5. **Testes:** 3 presets nascem com o mesmo núcleo (produtos default idênticos,
   nenhum post-it implícito, status correto por preset); teste de regressão dos 3
   endpoints com payloads atuais inalterados.

## Fora de escopo
Mudar o funil de checkout/trial (regra do cartão é travada); telas; RLS; segredos.

## Checks (BACKEND.md)
- `npm run build` + testes de master-provisioning e auth (signup) verdes.
- Signup local ponta a ponta (cadastro → confirmação mock → checkout mock) intacto.
- Provisionamento master local nasce SEM linhas em `CompanyModule` quando `modules`
  não foi enviado.

## Aceite
- 3 portas chamam o mesmo pipeline; diffs entre presets são declarativos e legíveis.
- Post-it: `CompanyModule` só com exceção explícita.
- Ledger consultável por empresa.
