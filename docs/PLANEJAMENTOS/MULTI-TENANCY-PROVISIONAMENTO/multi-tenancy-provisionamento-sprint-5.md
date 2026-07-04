# Multi-tenancy — Sprint 5 (gatilho, NÃO agendar): RLS + cofre de credenciais

> Arquitetura nº7. Ordem de trabalho para 1 subagente QUANDO o gatilho disparar.
> Ler `docs/Rules/BACKEND.md` antes. Auth/secrets/env de produção = só com ordem
> explícita do dono (lista de segurança do CLAUDE.md).

## Gatilho (só executar se UM destes acontecer)
- Cliente enterprise/due diligence pedindo garantia formal de isolamento;
- Primeiro incidente real de escopo pego pelo tenant-guard (sprint 1) em produção;
- Auditoria LGPD externa marcada.
Sem gatilho, o custo não se paga — sprints 1–4 já cobrem o risco operacional.

## Parte A — RLS no PostgreSQL (defesa que cobre até SQL cru)
1. Piloto em 3 tabelas quentes: `CustomerProfile`, `VendasLead`, `Message`
   (CompanyMessage). Policy `USING ("companyId" = current_setting('app.company_id')::int)`
   + role de aplicação sem `BYPASSRLS`.
2. Propagação do contexto: wrapper de transação no `PrismaService`
   (`SET LOCAL app.company_id = ...` lido do TenantContext do sprint 1) — toda query
   tenant passa a rodar dentro de transação com o SET.
3. Bypass explícito para master/jobs (`app.company_id = 0` + policy de master) —
   mesma allowlist do tenant-guard.
4. Medir latência antes/depois no piloto (RLS custa pouco, mas medir, não supor);
   expandir para o resto das tabelas tenant só com o piloto estável 2 semanas.

## Parte B — Cofre de credenciais por tenant
Hoje `whatsappAccessToken`/`mercadoPagoAccessToken` (e endpoints WhatsApp) vivem em
texto claro na `Company`, e a proteção de resposta é BLACKLIST
(`sanitizeCompany` deleta campos — um select novo que esqueça o sanitize vaza token).
1. Tabela `CompanyCredential` (companyId, kind, cipherText, keyVersion, updatedAt),
   cifra AES-256-GCM com chave em env do VPS (`HBX_CREDENTIAL_KEY`, rotável por
   keyVersion). KMS externo fica pra quando houver multi-servidor.
2. Serviço único `CompanyCredentialService` (get/set/rotate) — nenhum outro service
   lê token direto da Company.
3. Migrar os campos atuais (backfill cifrado + limpar colunas antigas em migration
   separada, destrutiva → ordem do dono).
4. Inverter blacklist→whitelist nas respostas de Company: DTO explícito de
   apresentação (campos permitidos), `sanitizeCompany` morre.

## Fora de escopo
Trocar provedor de pagamento/WhatsApp; multi-banco por tenant (não se justifica
nesta escala — banco único + RLS é o padrão de mercado até muito além do porte atual).

## Checks (BACKEND.md)
- Piloto RLS: e2e de isolamento do sprint 1 rodando COM RLS ativo (prova dupla).
- `npm run prisma:validate`, `npm run build`, testes de payments/whatsapp verdes.
- Rotação de chave testada localmente (keyVersion 1→2 sem downtime).

## Aceite
- Query crua sem `SET app.company_id` volta vazio nas tabelas piloto (provado em teste).
- Nenhum token em coluna de `Company`; resposta de Company é whitelist.
- Latência do piloto documentada.
