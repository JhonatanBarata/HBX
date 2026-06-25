# A — Pré-preenchimento do checkout (Opus / financeiro)

**Pedido:** o vendedor fecha; o que o card já tem (e o que ele digitou no pré-cadastro) chega
pré-preenchido no cadastro/cartão do cliente. Cliente só completa o que falta. Caminho Google = ainda
mais simples (login Google + só o cartão).

## Decisões travadas
- **Transporte por token, não por URL.** O link já leva `hbxLead=<leadId>` (cuid opaco). A página de
  cadastro busca os dados por ele. **Nunca** colocar CPF/telefone/senha na query string.
- **Mapa de campos** (card/pré-cadastro → cadastro "Criar conta"):
  - Nome → `Como deseja ser chamado` **e** `Empresa` (clona o nome como default editável).
  - E-mail → `E-mail` (se veio; senão fica vazio pro cliente/Google).
  - Telefone → guardado pro pagamento (payer do MP).
  - CPF/CNPJ → guardado pro pagamento (identification do MP).
- **Senha:** caminho **Google é o herói** (sem senha). No caminho e-mail, o cliente cria a própria
  senha (tudo o resto pré-preenchido). **Pré-senha do vendedor = OPCIONAL**: se setada, vai com flag de
  **troca obrigatória no 1º login** (não deixa o vendedor com a chave da conta do cliente).

## Backend
- **Endpoint público** `GET /vendas/handoff/:leadId/prefill` (sem auth — leadId é o token):
  retorna só o seguro: `{ companyNameSuggested, name, email, phone, cpf, planKey, hasPrefill }`.
  Fonte: campos do `VendasLead` (nome/telefone/email/cpf — ver plano B, que passa a persisti-los no handoff).
  - Guard: só responde se o lead tem handoff HBX gerado (`saleStatus` em activation/pending) — senão 404.
    Endurecimento opcional (token dedicado) = fase 2; cuid já é não-adivinhável.
- Arquivo: novo método em `vendas.service.ts` + rota em `vendas.controller.ts` (rota pública, ver como
  `public-catalog` é exposto sem auth).

## Frontend
- `frontend/src/app/register/page.client.tsx` (`RegisterPanel`):
  - Ler `hbxLead` da URL → `GET /vendas/handoff/:leadId/prefill` na montagem → pré-preencher
    `empresa`(=name)/`email`/`nome`; guardar `phone`/`cpf` em estado.
  - Passar `phone`, `cpf`, (e nome/email) pro `CheckoutPanel` (já recebe phone/email/name; **add cpf**).
  - **Google-first:** quando há prefill, destacar o botão Google ("ative em 1 clique"); o `POST /auth/google`
    já manda `selectedPlanKey` — anexar o `hbxLead` pra amarrar comissão/identidade (ver plano B handoff link).
- `frontend/src/components/hbx/checkout-panel.tsx` (MP):
  - Pré-preencher CPF + telefone no formulário do cartão. **CONFIRMAR primeiro** se é Bricks/transparente
    (aceita `payer` pré-preenchido) ou hosted (init_point — pré-fill limitado). Grep já achou `CardForm`/`bricks`
    em checkout-panel — provável transparente; validar no arquivo antes de prometer.

## Verificar (runtime, não só build)
- Gerar link de uma lead com nome+telefone → abrir o link → ver Empresa/Nome/E-mail pré-preenchidos e
  CPF/telefone já no cartão. Caminho Google idem (sem senha).
- `cd frontend && npm run lint && npm run build`; backend `npm run build`. Conferir endpoint via API.

## Riscos / reversão
- Endpoint público expõe dados do lead por leadId → mitigado por guard (só com handoff ativo) + cuid opaco.
  Tudo `git revert`. Sem migration se os campos do lead já existem (validar no plano B).
