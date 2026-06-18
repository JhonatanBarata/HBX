# PLAN — Planos, Cobrança & Acesso + Master Self-Checkout

> Origem: ordem do dono 18/06 (organograma "planos"). **Um assunto, várias frentes**
> na ordem travada. Não confundir com `PLAN-WHATSAPP-PER-USER.md` (outro assunto).

## Regra de ouro (organograma único)

- **Preço vem de UM lugar: o PLANO.** Reajuste (ex.: +10%) = mexe no plano, 1 vez;
  toda empresa naquele plano sobe junto. Empresa **nunca copia** o preço — só aponta
  `plano + ciclo`.
- **Assinatura recorrente = `preço do plano + (assentos extras × R$ 24,90)`.** Tudo que
  mexe em dinheiro **recalcula esse número num lugar só** e empurra pro Mercado Pago.
- **Acesso nasce de 3 origens — nenhuma grátis por engano:**
  1. **PAGO** — assinatura/assento ativo e aprovado.
  2. **CORTESIA** — única liberação grátis, motivo obrigatório (`status='courtesy'`).
  3. **PREÇO 0 / PENDENTE** — cadastro feito, **sem acesso operacional** (`pending_checkout`),
     tela neutra "especialista entra em contato".
- **$ mora no ADMIN.** Gerente preenche (cadastra), Vendedor recebe. **Cadastro nunca
  cruza com dinheiro.**
- **Sem legado:** mata o `Plan` legado (prata/ouro/diamante) no passo do catálogo editável.

## Decisões travadas (18/06)

1. **Preço 0** → cria em `pending_checkout` + flag "contato comercial". **Não** é cortesia
   (cortesia libera acesso — não serve). Acesso = **read-only** (passeio), e a **tela de
   espera/showcase o DONO desenha** (fora deste plano). Backend só crava o **modo read-only**
   (o que é visível × bloqueado) pra não vazar feature/dado pago.
2. **Plano é dono do preço**; empresa só aponta; override por empresa = exceção rara e
   marcada; mata `Plan` legado.
3. **Cobrança MP:** assinatura recorrente = `plano + assentos`; ao mudar, recalcula e
   empurra pro MP (vale do próximo ciclo); **proporcional = cobrança avulsa na hora**
   (`24,90 × dias restantes / dias do ciclo`); **paga-primeiro** (assento só com cobrança
   aprovada).
4. **Bloco de assentos:** Admin compra capacidade ("+N acessos" paga o bloco na hora);
   Gerente preenche o cadastro sem nova cobrança. Cobrança no **bloco (capacidade)**, nunca
   na pessoa. `seatCap` (já existe) = capacidade paga; usuários ativos ≤ seatCap.
   Gerente **só módulo**, nunca assento/cobrança.

## O que JÁ existe (não reconstruir)

- `+ Nova empresa` (`frontend/.../master/janela-empresas.tsx` → `POST /master/provisioning/tenants`):
  já cria com `planKey`, `billingCycle`, `admin {nome,email,phone}`, slug, `taxDocument` (CNPJ/CPF).
- **MasterEd ~80% pronto** na aba *Comercial* da empresa: edita trial, plano, quota+`seatCap`,
  desconto, meses grátis, ciclo, setup, mensalidade override, liga/desliga módulo
  (gateado em `isFull` — "régua única" PR13062026007).
- **Catálogo em CÓDIGO** (`backend/src/commercial-plans/commercial-plan-catalog.ts`): preços,
  planos (List/Lead Plus/Pro/Implantação), assentos inclusos, extra R$24,90, módulos por plano,
  entitlements, quotas. **Não é editável em runtime.**
- **`Plan` legado** semeado em `backend/src/bootstrap/structural-defaults.json` (prata/ouro/diamante)
  — "unificação pendente".
- **"Gerente" já existe** = `ADMIN` com `canViewBilling=false` (não é papel novo). Papéis reais:
  `USER` (vendedor) e `ADMIN`. (`profile.controller.ts`, `financeiro.service.ts:670-672`,
  `Company.sellerCargoAccessJson` + `User.canViewBilling`.)
- **`seat-billing.util.ts`** já existe (base do assento extra).
- **Módulos hoje** (`structural-defaults.json`): `atendimento, vendas, gerencial, webscraping,
  cadastro`. **Bot e e-mail NÃO são módulos** — bot é a chave-mestra do master (`bot-armed.guard.ts`).
- **Estados comerciais canônicos** (`Company.status` + `resolveCompanyAccessState`):
  `pending_checkout | trial | active | courtesy | overdue | suspended`.

## Frentes (ordem de build travada)

### F1 — Bot e e-mail viram módulos  ✅ FEITO 18/06 (worker Sonnet, verificado)

> `bot`+`email` em `structural-defaults.json` (defaultEnabled:false), `team-access-catalog.ts`
> (`bot.access`/`email.access` + MODULE_ACCESS_EQUIVALENTS), `modules.service.ts` (display
> order + blocked p/ infra). 4 checks verdes. Chave-mestra intacta. **Aberto:** `email.access`
> `defaultForSeller` (worker pôs `true`); `bot` fora de SELLER_ELIGIBLE e serviceUrl null = F4/F5.

- **Escopo:** promover `bot` e `email` a módulos de 1ª classe (chaves de módulo), tratados
  como os demais (liga/desliga por empresa, distribuição por usuário via team policy).
- **Regra:** "atendimento sempre libera 1 user pro WhatsApp" (alinha com WHATSAPP.md
  1 número = 1 user). Acesso de módulo **nunca misturado** entre admin/users.
- **Manter** a chave-mestra do master como trava anti-ban (bot).
- **Contrato backend:** add keys em `structural-defaults.json` + `team-access-catalog.ts`;
  refletir em `modules.service` e na lista de módulos do MasterEd.
- **Checks:** `cd backend && npm run prisma:validate && npm run build`; `cd frontend && npm run lint && npm run build`.

### F2 — Catálogo editável (Self-Checkout)  ◀ TRILHA BACKEND PRÓPRIA + TESTE
- **Escopo:** master edita por plano — nome, observação, **ativo/pausado**, preço, ciclo,
  módulos inclusos, assentos. Reflete no app e na página pública (`?ver=planos`).
- **Arquitetura limpa:** tabela DB sobrepondo o catálogo (seed = valores de hoje), **fonte
  única**; empresa só aponta. Invalidação de cache.
- **`Plan` legado: JÁ MORTO** (migration `20260613_remove_legacy_plan_feature` — drop de
  `Plan`/`Feature`/`_PlanFeatures`/`Company.planId`; código/schema/seed já limpos, confirmado
  18/06). Nota do `PAGAMENTOS.md` ("ainda semeia Plan legado") está **desatualizada**.
- **Pausar plano:** `status: paused` → card embaçado/inclicável na página de planos até liberar.
- **Risco:** lista sensível (preço/plano/paywall). Trilha planejada, com teste.
- **Confirmado:** `?ver=planos` é deste app/site — o pause reflete aqui mesmo.

### F3 — Wizard "+Nova empresa" + aba "MasterEd" + fronteira master/empresa
- **Wizard** (etapas: nome → plano → ciclo → admin inicial → avançado): em "avançado" seta
  preço/acentos/acessos; **preço 0 → `pending_checkout` read-only** (decisão 1).
- **MasterEd:** consolidar a aba Comercial; **gate `isFull` LIFTADO** — master edita
  módulo/preço/acento/trial de todas as empresas (List/Lead seguem rodando sozinhas).
- **Fronteira (#5):** master atua no nível **empresa**; quem distribui módulo a usuário é
  admin/gerente. Garantir/testar (já é a arquitetura: superfície master mínima + "assumir contexto").
- **CNPJ/CPF:** `taxDocument` **opcional na criação, exigido na cobrança**; validar CPF×CNPJ.

### F4 — Painel admin/gerente + delegação
- Admin e gerente (=ADMIN sem $) têm painel de módulos em "gerenciar"; vendedor não.
- **Delegação** ("do master pra baixo só libera o que você tem"): cada nível só concede o
  que possui. Gerente concede **só módulo** (nunca assento/cobrança).

### F5 — Agenda do bot (depende de F1)
- Sequência: 1º contato pela vendedora → retorno agendado (agenda revive). Opções: e-mail
  automático (se card tem e-mail), WhatsApp automático (se card tem whatsapp); avisar se os
  automáticos se cruzam em dias. Anexo de apresentação **próprio do vendedor**.
- Ao iniciar a agenda: perguntar retorno **automático × manual** — só se **bot é módulo**.
- Bot módulo presente mas **sem a chave-mestra do master** → aviso "faltando configuração,
  contate suporte (clique aqui)" + **dispara WhatsApp pro master** (quem pediu + telefone/empresa).
  (Master já tem chip de WhatsApp.) Quebrar em sub-itens.

### F6 — Cobrança de assento extra  ◀ TRILHA BACKEND PRÓPRIA + TESTE (POR ÚLTIMO)
- Implementa decisão 3+4: cartão on-file (MP recorrente), recálculo da assinatura, **cobrança
  proporcional avulsa na hora**, idempotência, **paga-primeiro** (reprovou → não libera).
- "+N acessos" = bloco pago; gerente preenche depois. Remover pessoa libera o assento pra
  reuso dentro do cap; recorrente só cai se admin remover **capacidade**.
- **Risco máximo:** provedor de pagamento. Confirmar cartão on-file no MP antes.

### F7 — Faxina / sem legado
- Varredura de vestígios; o kill do `Plan` legado já cai em F2. Passo final + contínuo.

## Decisões fechadas (18/06 — 2º bloco)

- **F3 gate `isFull`:** **LIFTADO** — master edita módulo/preço/acento/trial de **toda**
  empresa (List/Lead/Pro/Full). List/Lead seguem rodando sozinhas; o master só mexe se
  precisar. Um painel pra todos (mais simples).
- **F3 `taxDocument`:** **opcional na criação, exigido na cobrança** (billing precisa de
  CNPJ/CPF). Não trava o cadastro rápido / preço-0. Validar CPF×CNPJ.
- **F2 `?ver=planos`:** é **deste app/site** — o pause reflete aqui mesmo.
- **F2/F6 (financeiro):** cartão on-file no MP **confirmado**. O **DONO autorizou o
  orquestrador (Opus) a executar as frentes financeiras direto** — não delegar a worker Sonnet.

## Execução (orquestração)

- Workers **Sonnet** (subagente, worktree próprio) fazem: **F1, F3, F4, F5**.
- **Opus (orquestrador) faz direto: F2 e F6** (preço/cobrança — sensível).
- Ordem real (dependência): **F1 → F2 → F3 → F4/F5 → F6 → F7**.
- Worker volta com dúvida → orquestrador tria → pergunta ao dono → injeta SÓ o decidido → segue.
- Push / abrir PR / deploy = passo **explícito** do dono, nunca automático.

## Checks padrão por frente

- Backend: `cd backend && npm run prisma:validate && npm run build` + testes direcionados.
- Frontend: `cd frontend && npm run lint && npm run build`.
- F2/F6 (sensíveis): teste obrigatório do caminho de preço/cobrança; nada de paywall afrouxado no front.
