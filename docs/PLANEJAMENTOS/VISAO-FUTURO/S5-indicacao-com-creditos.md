# S5 — INDICAÇÃO COM CRÉDITOS (DORMENTE — flag OFF)

> Frente VISAO-FUTURO, 11/07/2026. Cliente indica → os DOIS ganham créditos. Canal de aquisição
> mais barato que existe; a engine de créditos já faz 90% do trabalho.

## Desenho (anti-farm)
- Cada empresa tem um **código de indicação opaco** (novo `Company.indicacaoCode String? @unique`,
  gerado tipo `ind_` + 8 hex — NUNCA derivado do nome; padrão do slug `co_...` em auth.service.ts:1549).
- Link: `https://<host>/?ref=<code>` → o front guarda o ref e envia no signup.
- No signup, resolver o code → gravar `Company.indicadaPorCompanyId Int?` na empresa NOVA.
- **O bônus NÃO sai no cadastro** (senão vira farm de contas): sai quando a indicada faz a
  **1ª recarga PAGA aprovada**. Nesse evento: grant pros dois lados via `CreditWalletService.grant`
  (`backend/src/credits/credit-wallet.service.ts:245` — idempotente por usageKey):
  - indicador: `usageKey: 'referral:indicador:<indicadaCompanyId>'`
  - indicada:  `usageKey: 'referral:indicada:<indicadaCompanyId>'`
  - `kind:'promo', grantType:'promo', sourceRef:'referral_program'`
  - Quantidade: `CreditGlobalConfig` se houver campo natural; senão constante clara no flags file
    (ex.: 25 cada) — deixar em UM lugar só, fácil do master mudar.
- ⚠️ `Company.referralCode`/`referralReferrerName` EXISTENTES têm OUTRA semântica (atribuição de venda
  HBX / comissão de parceiro — auth.service.ts:1540-1541, hbx-partner-referral). NÃO reusar esses campos;
  criar os novos acima. Nomear tudo `indicacao*` pra não colidir.

## O que construir
1. **Migration FORMAL** (arquivo só): `Company.indicacaoCode String? @unique` +
   `Company.indicadaPorCompanyId Int?` (+ index). ⚠️ regiões do schema.prisma: Company está no topo;
   a sprint S6 pode estar mexendo em LogisticaConfig em paralelo — se um Edit falhar por mudança
   concorrente, RELEIA o schema e reaplique (regiões distantes, não conflitam semanticamente).
2. **Flag global** `HBX_INDICACAO_ENABLED` default OFF (`backend/src/credits/indicacao.flags.ts`,
   formato credits.flags.ts). OFF = endpoints 404, signup IGNORA ref (não grava), zero grant.
3. **Backend**:
   - Serviço pequeno `backend/src/credits/indicacao.service.ts`: `getOrCreateCode(companyId)`,
     `resolveCode(code)`, `onPrimeiraRecargaAprovada(companyId)` (acha `indicadaPorCompanyId`,
     verifica que é a 1ª recarga paga aprovada da empresa, dispara os 2 grants). Registrar no módulo
     de créditos (`credits.module.ts`) — NÃO em app.module.ts.
   - Hook no ponto onde recarga vira aprovada (achar onde o webhook/sync marca recarga de crédito
     como paga — procurar quem chama `grant` com kind 'recharge'/aprovação de charge de recarga;
     chamar `onPrimeiraRecargaAprovada` best-effort `.catch(log)`, NUNCA quebrar o fluxo de pagamento).
   - Signup (`backend/src/auth/auth.service.ts:1462+`): aceitar `indicacaoRef` no DTO inline; com flag ON,
     resolver e gravar `indicadaPorCompanyId` no `tx.company.create` (:1605-1636). Best-effort: ref inválido = ignora.
   - Endpoint `GET /credits/indicacao/me` (JWT, admin do tenant): retorna code + link montado + contagem
     de indicadas convertidas (count simples por indicadaPorCompanyId + grant existente).
4. **Frontend** (mínimo):
   - Captura do `?ref=` na entrada pública: a porta única `/` é intocável — capturar no client do
     REGISTER (`frontend/src/app/register/` — conferir nome real da rota pública de cadastro) via
     searchParam persistido em sessionStorage até o submit do signup.
   - Card "Indique e ganhe" em Configurações (`frontend/src/app/(app)/configuracoes/` — admin):
     mostra o link com botão copiar + quantas indicações converteram. Renderiza SÓ se o endpoint
     responder 200 (404 = feature OFF → não renderiza nada).

## O que NÃO fazer
- NÃO conceder crédito no cadastro (só na 1ª recarga paga). NÃO permitir auto-indicação
  (indicadaPorCompanyId == própria empresa → ignorar). NÃO reusar referralCode legado.
- NÃO tocar: shell.tsx, globals.css, app.module.ts, financeiro-tenant/, logistica/* (a S6 está lá).
- NÃO mexer no fluxo de pagamento além do hook best-effort. NÃO commitar; NÃO criar branch.

## Testes (node:test co-locado)
`indicacao.service.test.ts`: (1) flag OFF → tudo no-op/404; (2) grant idempotente (2 chamadas, 1 bônus);
(3) auto-indicação ignorada; (4) 2ª recarga não gera bônus de novo; (5) ref inválido no signup não quebra.

## Critérios de aceite
1. Sem a env: deploy 100% inerte (signup idêntico, endpoints 404, zero UI).
2. Migration é arquivo; tsc backend verde; testes verdes; lint front verde.
