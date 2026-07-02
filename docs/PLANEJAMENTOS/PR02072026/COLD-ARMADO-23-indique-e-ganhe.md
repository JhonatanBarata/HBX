# COLD-23 — ARMADO (indique e ganhe) — disparar quando ≥20 pagantes ativos

> Blueprint estratégico: `docs/PLANEJAMENTOS/cold/23-indique-e-ganhe.md`. NÃO deletar até disparar.
> **Gatilho:** ≥20 empresas pagantes ativas. Antes disso, boca-a-boca do dono rende mais.
> **Frente FINANCEIRA** (credita recompensa) → **execução por Opus DIRETO + revisão de diff**, não
> subagente (regra da casa). Este .md é o roteiro de execução; ao disparar, Opus segue por ele.

## Decisão de produto (já batida no blueprint)
Recompensa **NÃO é desconto** (desmonetiza). É **leads validados bônus** OU **1 recurso a mais por
1 mês** (ex.: +1 automação ativa). Custo marginal ~zero, valor percebido alto.
Recompensa credita **no 1º PAGAMENTO do indicado** — nunca no cadastro (senão vira farm).

## Modelo de dados
```
Referral {
  id            String  @id @default(cuid())
  referrerId    Int     // Company que indicou
  referredId    Int?    // Company nova (preenchido no cadastro)
  refCode       String  // código no link ?ref=  (= slug/hash do referrerId, não o id cru)
  status        String  // pending | signed_up | rewarded | void
  rewardKind    String  // 'bonus_leads' | 'feature_month'
  rewardValue   Int?    // qtd de leads OU id do recurso
  signedUpAt    DateTime?
  rewardedAt    DateTime?
  createdAt     DateTime @default(now())
  @@index([referrerId]) @@index([referredId]) @@unique([refCode, referredId])
}
```
Seguir o padrão raw-SQL `CREATE TABLE IF NOT EXISTS` do projeto (ver `website-runtime.ts`) OU migration
Prisma formal — conferir como as tabelas recentes (`MetaLeadConnection`, `CompanyWebsiteConfig`) foram
criadas e seguir o mesmo caminho.

## Sprint (2-3 dias)
1. **Captura do ref** no registro: link `?ref={refCode}` → grava `Referral{status:'signed_up'}` ligando
   referrer↔referred. Anti-fraude leve: mesmo IP/mesmo CNPJ raiz não credita.
2. **Job de recompensa:** ao detectar 1º pagamento aprovado do indicado (plugar no fluxo de pagamento
   já existente — procurar o webhook/handler de "pagamento aprovado" em `backend/src/payments`),
   credita `rewardKind` ao referrer + marca `status:'rewarded'` + **notifica os DOIS via WhatsApp**
   (reusar rotina de envio existente — NUNCA tocar em conexão de chip).
3. **Tela "Indique":** link copiável + status das indicações. Momento do pedido = **pós-venda-fechada**
   ("fechou negócio? conhece alguém?") — dopamina. Divulgar também no rodapé do painel.
4. Respeitar **5 Leis do Design System** na tela (tokens, sem hex solto) — ver `docs/Rules/FRONTEND.md`.

## Testes
Farm bloqueado (cadastro não credita); recompensa só no 1º pagamento; mesmo CNPJ raiz não credita a si;
idempotência (pagar 2x não credita 2x).

## Custo/risco
Baixo. Risco = farm (mitigado: crédito só no pagamento + anti-fraude por IP/CNPJ). Financeiro → diff revisado.
