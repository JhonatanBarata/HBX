# Multi-tenancy — Sprint 2: Aposentar o Inbox legado (Customer global)

> Arquitetura nº7. Ordem de trabalho para 1 subagente. Ler `docs/Rules/BACKEND.md` antes.
> **Contém migration DESTRUTIVA — preparar tudo, mas o DROP só roda com ordem
> explícita do dono nesta tarefa (regra dura do BACKEND.md).**

## Correção da análise anterior (importante)
A análise de 01/07 (outra inteligência) tratou `model Customer` (`phone @unique`, sem
companyId) como "PII vazando entre tenants HOJE". Revisado: o trio legado
`Customer` / `Conversation` (@@map `InboxConversation`) / `Message` (@@map `InboxMessage`)
**não tem NENHUMA escrita viva** — o atendimento real usa `CompanyConversation`,
`CompanyMessage` (@@map "Message"), `AtendimentoCustomer` e `CustomerProfile`, todos com
`companyId`. Únicos usos do legado: a cascata de deleção (`companies.service.ts:1273-1276`)
e uma LEITURA sem escopo no gerencial (`satisfactionSurvey`, tratada no sprint 1).
`SatisfactionSurvey` também não tem writer vivo.
**Logo: NÃO migrar Customer para per-tenant (retrabalho em código morto). Aposentar.**

## Por quê ($)
Tabela global de clientes com PII residual de produção é passivo LGPD parado no banco
(art. 15/16 — dado sem finalidade). Dropar legado elimina o risco na raiz, encurta a
cascata de deleção e remove ~4 modelos do schema. Custo baixo; benefício = risco a menos
em due diligence.

## Escopo
1. **Censo em produção (ANTES de qualquer código):** dentro do container `hbx-backend`
   (nunca `npx prisma` do host), contar linhas de `Customer`, `InboxConversation`,
   `InboxMessage`, `SatisfactionSurvey` e a data do registro mais recente de cada.
   Registrar no PR. Se houver dado recente (< 90 dias), PARAR e reportar ao dono —
   hipótese de writer não mapeado.
2. **Export de segurança:** se houver linhas, gerar dump JSON das 4 tabelas
   (snapshot no padrão `DeletionRecord` ou arquivo no VPS) antes do DROP.
3. **Remover código morto que referencia o legado:**
   - Cascata: `companies.service.ts:1273-1276` (satisfactionSurvey/message/
     conversation/customer deleteMany) e o `customer.deleteMany` de GC.
   - Leitura de surveys no `gerencial.service.ts` (se sprint 1 ainda não removeu).
   - Contagens no `loadCompanyForPermanentDeletion` (`_count` de
     `inboundMessages`... conferir quais apontam pro legado × pros vivos).
4. **Schema:** remover os models `Customer`, `Conversation`, `Message` (legado) e
   `SatisfactionSurvey`; migration com `DROP TABLE` correspondente.
   **Rodar em produção SÓ com ordem explícita do dono.** Local primeiro
   (`prisma migrate dev`), depois publicação normal (migrations rodam no container
   via `start-prod.sh`).
5. **Plano B (se o dono quiser preservar histórico em vez de dropar):** renomear
   tabelas para `_archive_*` fora do schema Prisma, e mesmo assim remover os models
   do código. Não fazer meio-termo de "manter model sem uso".

## Fora de escopo
Qualquer mudança no atendimento vivo (`CompanyMessage`/`AtendimentoCustomer`);
cascata declarativa (sprint 3).

## Checks (BACKEND.md)
- `cd backend && npm run prisma:validate` e `npm run build`.
- Testes de companies (`company-operational-status`, deleção) verdes.
- e2e de isolamento do sprint 1 continua verde.
- Deleção de empresa local de teste (fluxo master hard delete) funciona sem o legado.

## Aceite
- Censo + export documentados no PR.
- Zero referência aos 4 models no `src/` e no schema.
- Hard delete de empresa segue funcionando ponta a ponta.
