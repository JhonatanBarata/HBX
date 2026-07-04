# N1 — RESULTADO (espinha Conta + Contato)

> Sprint N1 do plano NÚCLEO-CRM. Executado 04/07 na branch `claude/nucleo-crm`
> (base = `origin/master` @ `7fd01a26`, sem divergência no início). **NÃO publicado.**
> Escopo: SÓ schema + serviço INERTE. ZERO UI, ZERO endpoint, ZERO efeito colateral.

## O que mudou (arquivos)

| Arquivo | Mudança |
|---|---|
| `backend/prisma/schema.prisma` | `CustomerProfile` estendido (12 colunas aditivas + 3 índices) + back-relations `contatos`; novo model `Contato`; back-relation `contatos` em `Company`. |
| `backend/prisma/migrations/20260705000000_nucleo_conta_contato/migration.sql` | Migração **aditiva** (novo arquivo). |
| `backend/src/nucleo/nucleo-cadastro.service.ts` | Novo. `NucleoCadastroService` INERTE: `upsertContaFromCnpj()` + `upsertContatoPrincipal()`. |
| `backend/src/nucleo/nucleo.module.ts` | Novo. `NucleoModule` (só provider+export, sem controller). |
| `backend/src/app.module.ts` | Registra `NucleoModule` (import + entrada em `imports[]`). |

### Schema — `CustomerProfile` (a CONTA)
Colunas ADITIVAS (todas opcionais / com `@default`, nada quebra o legado):
`tipo String @default("pf")`, `cnpj String?`, `endereco/cidade/uf/cep String?`,
`lat/lng Float?`, `isLead/isCliente/isFornecedor Boolean @default(false)`,
`origin String @default("manual")`. Índices novos: `[companyId,isCliente]`,
`[companyId,tipo]`, `[companyId,cnpj]`. Back-relation `contatos Contato[]`.

### Schema — `Contato` (a PESSOA, model novo)
`id` cuid, `companyId Int` (+relation Company), `customerProfileId String` (+relation
CustomerProfile, onDelete Cascade), `nome String`, `cargo/whatsapp/phone/email String?`,
`isPrincipal Boolean @default(false)`, `source String @default("manual")`,
`createdAt/updatedAt`. Índices: `[companyId,customerProfileId]`, `[companyId,isPrincipal]`.
Back-relation `contatos Contato[]` também adicionada em `Company`.

## SQL da migração (`20260705000000_nucleo_conta_contato/migration.sql`)
100% aditivo/idempotente (`IF NOT EXISTS`), sem `DROP`/`ALTER … DROP`:
- `ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS …` para as 12 colunas
  (`tipo` default `'pf'`, `cnpj`, `endereco`, `cidade`, `uf`, `cep`, `lat`, `lng`,
  `isLead`/`isCliente`/`isFornecedor` default `false`, `origin` default `'manual'`).
- `CREATE INDEX IF NOT EXISTS` para os 3 índices de `CustomerProfile`.
- `CREATE TABLE IF NOT EXISTS "Contato" (…)` + PK + 2 índices + 2 FKs
  (`companyId → Company`, `customerProfileId → CustomerProfile`, ambos `ON DELETE CASCADE`).

**Migração escrita À MÃO** porque `prisma migrate dev --create-only` falhou no shadow DB
por uma migração PRÉ-EXISTENTE E NÃO-RELACIONADA (`20260402_add_financeiro_self_service_fields`
→ `P3006`/`P1014`: "tabela de `MasterGlobalIntegrationConfig` não existe" no shadow). Não é
problema desta sprint; só impede o caminho automático de gerar o diff. O SQL escrito espelha
exatamente as colunas/índices/FKs acima, no mesmo padrão dos aditivos do repo
(`20260703_add_company_provisioning_ledger`, `20260703_hbx_recovery_payment_event`).
**Postgres local down/desatualizado — migração NÃO aplicada em banco vivo (por design).**

## O que ficou INERTE / sem efeito
- `NucleoCadastroService` **não tem caller**: os 2 métodos existem pra N2/N3 chamarem;
  nada os invoca ainda. SEM controller, SEM endpoint, SEM cron/boot, SEM WhatsApp, SEM I/O externo.
- Não usei flag `HBX_NUCLEO_ENABLED` porque não há nenhuma superfície para ligar/desligar
  (não expus endpoint). O módulo só fica disponível na injeção. Se em N2 aparecer endpoint,
  aí sim entra atrás de flag default OFF, conforme o plano.
- Os métodos são idempotentes (acha-ou-cria por `(companyId,cnpj)` / principal único por conta)
  e papéis são **acumulativos** (só LIGAM, nunca desligam um papel já marcado).

## Checks (todos VERDES)
- `npx prisma validate` → `valid`.
- `npx prisma generate` → cliente gerado (tipos de `Contato` + campos novos de `CustomerProfile` OK).
- `npm run build` (tsc estrito) → **verde, 0 erro**.
- Testes: nenhum teste existente toca `nucleo`/`Contato`/os métodos novos (verificado por grep).

## Decisões / ambiguidades pro dono revisar de manhã
1. **`CustomerProfile.tipo` default = `"pf"`** (conforme o plano). Como todo registro
   legado de `CustomerProfile` (leads/atendimento/recovery) já existente vira `tipo='pf'`
   ao aplicar a migração, e a maioria hoje é lead PJ do Radar, N2 (ingestão) vai marcar
   `tipo='pj'` no upsert do pull. Se preferir default `"pj"`, é trocar 1 linha + o SQL.
2. **`cnpj` NÃO tem `@@unique([companyId, cnpj])`** — só índice comum. Motivo: a mesma
   base pode ter registros legados sem cnpj (NULL) e o unique com muitos NULLs + o backfill
   de N2 poderia colidir. A idempotência do upsert é feita no serviço (findFirst por
   `companyId+cnpj`). Se você quiser unicidade dura no banco, dá pra promover a
   `@@unique` numa migração futura — deixei como índice por segurança nesta sprint aditiva.
3. **`Contato` é model NOVO** (não estendi `LeadPerson`), como o plano manda. `LeadPerson`
   segue como FONTE de seed pra N2 (ligado a `RadarLeadPool`, não a `CustomerProfile`).
4. **Migração à mão** (ver acima) por causa do shadow DB quebrado por migração antiga não
   relacionada — vale conferir/aplicar em ordem quando o Postgres estiver de pé.
5. **NÃO publiquei nada.** Branch `claude/nucleo-crm`, 1 commit. `buscar-empresas.tsx` e
   `vendas/page.client.tsx` NÃO foram tocados (guard confirmado por `git diff --name-only`).
