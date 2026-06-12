# TRILHA — Produtos, Comissão e Trabalhe Conosco (visão do dono, 12/06/2026)

> Princípio do dono: o HBX cresce usando as MESMAS features que vende.
> Tudo é feature de TENANT (produtos, comissão, fechamento, e-mails);
> a única função exclusiva do HBX-admin é o Trabalhe Conosco/parceiros.
> Nunca special-case por empresa (PAGAMENTOS.md).

## O que JÁ EXISTE no backend (auditado 12/06/2026)

1. **Produtos por empresa**: CRUD `/products` completo. Modelo rico:
   price/priceCents, billingCycle, saleMode, planKey, allowDiscount,
   maxDiscountPercent, minPriceCents, **defaultCommissionPercent**.
   O card de Vendas já guarda SNAPSHOTS do produto (nome, preço, comissão).
2. **Sob consulta → fechamento master**: `POST /vendas/lead/:id/hbx-handoff`
   (vendedor encaminha) + `GET /vendas/hbx-closing-pipeline` (fila de
   fechamento) + `hbx-assisted-signup`.
3. **Comissão ponta a ponta**: user.commissionPercent, snapshots no card,
   commissionBase/Amount/Status/DueAt (D+3), payouts
   (`/vendas/commission/summary`, `POST /vendas/commission/payout`),
   gerencial `PATCH commission/settings|:leadId|sale-status`,
   `hbxCommissionSync` (cliente indicado ativou → comissão sincroniza).
4. **Candidatura/onboarding com anexos**: `gerencial/hbx-partners/*/onboarding`
   com upload/download de ANEXOS, requisitos de documento, contrato gerado,
   purga de expirados — e endpoints **PÚBLICOS** (`onboarding/public`,
   `public/attachments`, `public/complete`) + fila de aprovação
   (`hbx-partner-referrals pending/approve/reject`).

## Desenho do fluxo (aprovação pendente do dono)

### Venda com produto (qualquer tenant — HBX incluso)
1. Empresa cadastra produtos (tela nova em Configurações → Produtos, CRUD já existe).
2. Fechamento do card: vendedor escolhe o produto → preço vira `saleValue`,
   comissão = defaultCommissionPercent do produto (ou % do vendedor) →
   snapshots no card. HBX tenant: List e Lead prontos para fechar na hora.
3. Produto "sob consulta" (Full): em vez de fechar → `hbx-handoff` → entra na
   closing pipeline → master/admin fecha com o PREÇO REAL → saleValue
   preenchido → comissão calculada sobre o valor real.
4. **Transparência (pedido do dono)**: o vendedor vê no próprio card o valor
   fechado (saleValue) e o status da comissão (pending → released D+3 →
   paid), e acompanha o andamento pela closing pipeline (status do handoff).

### Trabalhe Conosco (única função "extra" do HBX admin)
1. Página pública `/trabalhe-conosco` (padrão da landing): nome, WhatsApp,
   cidade, experiência + upload de currículo → endpoints públicos de
   onboarding QUE JÁ EXISTEM.
2. Candidato cai em `hbx-partner-referrals/pending` → aprovação dispara o
   convite de vendedor (e-mail do rascunho do dono, na CHAVE CERTA — amarra
   com o item E2 da fila: separar template cliente × vendedor).

## Item 1 — CONCLUÍDO (12/06/2026): fechamento com produto + link

DESCOBERTA do modelo real (melhor que o desenho original): a venda NUNCA é
confirmada na mão (`saleStatus` confirmado/trial/ativação são AUTOMÁTICOS —
nascem de cadastro do cliente, confirmação de e-mail ou pagamento). O
fechamento do vendedor é GERAR O LINK de contratação:
`POST /vendas/lead/:id/hbx-handoff {productId, origin}` →
`/register?plan=X&hbxLead=card` + mensagem pronta; o card vira
"Aguardando ativação" com valor do produto e comissão projetada; quando o
cliente ativa, `hbxCommissionSync` confirma a venda e libera a comissão D+3.

Implementado no front: modal "Fechar venda" no card (select de produto real
de GET /products, valor auto, Gerar link → copiar mensagem / Enviar no
WhatsApp wa.me), "Salvar produto/valor" (PATCH sem status), painel do card
com Venda/Valor/Produto/Comissão reais, /register lê `?plan=`. Validado E2E
na conta trial: card "Padaria do Teste" → link gerado (Plano Lead Mensal
R$ 99) → card em "Aguardando ativação", valor R$ 99, comissão projetada.

## Item 2 — CONCLUÍDO fase 1 (12/06/2026): /gerencial restaurada com Produtos

Ordem do dono: produto (valor, código, descrição) é ADMIN-ONLY, e a tela
/gerencial volta em paralelo como o hub do administrador.

- Rota `/gerencial` (kit padrão): guard de admin no front (vendedor vê aviso
  "Área do administrador"; backend já barra por team policy). Acesso pelo
  menu do avatar (item "Gerencial", visível só para admin/master).
- Aba PRODUTOS real: tabela (nome, código, preço, ciclo, comissão, status),
  Novo produto (modal: nome, SKU, preço, ciclo, comissão padrão, descrição —
  envia `priceCents`, contornando o E3), Editar e Arquivar com
  confirmação em 2 cliques. Editar/arquivar esbarram no E4 (500 do
  versionamento) e a tela explica honestamente apontando para a fila.
- Validado E2E (admin trial): produto "HBX List (via tela)" criado com
  R$ 45/Mensal/8% correto; edição exibindo o aviso do E4.
- Abas Visão geral / Comissões / Parceiros: placeholders honestos — chegam
  na sequência (contratos prontos no backend).

## Item 3 — CONCLUÍDO (12/06/2026): cliente no fechamento + carta + regras novas do dono

Raciocínio do dono incorporado:
1. **Cliente nasce no fechamento (se o vendedor quiser)**: botão "Cadastrar
   cliente" no card de Vendas abre o formulário JÁ PREENCHIDO com os dados
   do card (nome, telefone, e-mail) → `POST /cadastros/customer-profiles`;
   vínculo com o card é pelo telefone (shared profile). Validado E2E.
2. **Atalho da carta 🃏**: ícone no card abre o drawer "Card do cliente"
   (`GET /cadastros/customer-profiles/by-phone`) com nome, contato,
   documento, status e a linha de INTEGRAÇÃO; sem cadastro, oferece
   "Cadastrar agora". Validado E2E.
3. **Comissão NÃO é do produto**: o % é acordado por VENDEDOR
   (user.commissionPercent — o backend já calcula por ele). Campo/coluna de
   comissão padrão REMOVIDOS da tela de Produtos, com nota explicando.
   Produto fixando % atropelaria o acordo da equipe ("o pessoal vai surtar").
4. **Points de integração (TOTVS e cia)**: Product e CustomerProfile já têm
   `externalSource`/`externalCustomerId`/`sourceConnectionId`; conector novo
   = clonar o padrão TagPlus em `integrations/`. IMPORTANTE (dono): logo/
   marca TOTVS na tela SÓ depois da autorização de uso que ele vai buscar —
   até lá, a UI fala "integração/ERP" genérico (como o drawer da carta faz).

## Item 4 — CONCLUÍDO fase leitura (12/06/2026): aba Comissões + regras de ciclo/cancelamento

- **Ciclo de cobrança saiu do formulário de produto** (raciocínio do dono):
  produto define o preço-base; o CICLO é escolha do cliente no pagamento
  (anual = desconto de 20% do catálogo) e a comissão incide sobre o valor
  realmente pago. Nota explicativa no próprio formulário.
- **E5 gravado na fila** (desenho aprovado): caso de cancelamento com
  saldoARestituir; master sempre avisado na hora (fila filtrável); vendedor
  avisado conforme o saldo (0 = imediato e factual; >0 = só no desfecho);
  payout travado por caso aberto; estorno/desvínculo só por decisão do
  master; pago fica pago.
- **Aba Comissões do /gerencial (leitura real)**: KPIs (a pagar, vencidas,
  aguardando ativação, pagas + D+N úteis), tabela de comissões a pagar
  (cliente, venda, valores, vencimento), aguardando ativação e payouts.
  Validado E2E: a venda do link (Padaria, R$ 99) aparece em "Aguardando
  ativação (1 cliente)".
- **Ações de payout (12/06/2026)**: botão "Marcar como pago" (gated por
  canPayout) com modal: vendedor (todos ou um), toggle "incluir não
  vencidas", referência → `POST /vendas/commission/payout`; cancelar payout
  pago (2 cliques) → `POST .../payout/:id/cancel` reabre as comissões.
  Validado E2E: regra do backend respondida na tela ("Nenhuma comissão
  vencida em D+ para registrar pagamento").

## Item 5 — CONCLUÍDO (12/06/2026): Trabalhe Conosco

Decisões de design (cuidado pedido pelo dono):
- Candidatura aberta NÃO entra no pipeline de indicações (que carrega
  herança de comissão do indicador) — tabela própria `HbxJobApplication`
  (runtime-ensure), por empresa (multi-tenant: qualquer tenant pode ter a
  sua página).
- Endereçamento por `companySlug`: a página lê
  `NEXT_PUBLIC_HIRING_COMPANY_SLUG` (env por ambiente; `?c=` sobrepõe).
  Dev: frontend/.env.local (gitignored). PRODUÇÃO: setar a env no deploy.
- Currículo v1 = LINK (Drive/LinkedIn); upload de documentos acontece no
  onboarding oficial pós-aprovação (fluxo de anexos já existente).
- Aprovar NÃO cria usuário: devolve a instrução de convidar pela Equipe
  (convite oficial = e-mail de vendedor na chave certa). Rejeitar marca.
- Aviso no sino do admin a cada candidatura (audiência customer).

Implementado e validado E2E: página pública `/trabalhe-conosco` (linguagem
da landing) com formulário → POST público (throttle 10/min) → sino do admin
→ aba Candidaturas do /gerencial (contato, cidade, experiência, currículo,
Aprovar/Rejeitar em 2 cliques) → aprovação com next-step. Link discreto no
rodapé da landing ("Quer vender COM a HBX?").

## Front a construir (ordem sugerida)
2. Tela Produtos em Configurações (CRUD).
3. Comissões do vendedor (summary no Vendas/Relatórios) + closing pipeline
   (vista admin).
4. `/trabalhe-conosco` público.

## Lacunas reais de backend (únicas encontradas)
- Caixa de e-mail própria por empresa (SMTP por tenant): NÃO encontrado —
  mail service é global. Confirmar e, se faltar, trilha própria.
- Disparo de e-mail automático configurável POR EMPRESA: templates hoje são
  do master — verificar escopo por tenant.

## Foco vigente (rigidez pedida pelo dono)
Funil de Ads primeiro: fila E1 (vitrine pública) + E2 (e-mail cliente ×
vendedor) + termos no /register. Esta trilha entra na sequência.
