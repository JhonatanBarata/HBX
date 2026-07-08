# MASTER-REFAB — /master no modelo CRÉDITO (plano em sprints)

> Planejado 07/07/2026 (Opus orquestra, workers executam 1 sprint por vez).
> Motivo: **self-checkout + créditos viraram o modelo ÚNICO** (Fase 2 `bacb2725`: paywall por
> plano/tier removido, tier sempre `full`, assento grátis, cota count-based não bloqueia) e
> **módulos foram liberados** (kill-switch only: comerciais nascem `defaultEnabled:true`;
> `bot/email/website/vc` seguem kill-switch real). O FASE2-RESULTADO deixou o /master de fora
> DE PROPÓSITO ("continuam editando o catálogo de plano legado") — esta é a dívida.

## O mundo novo (fatos, não opinião)
- Cliente nasce SOZINHO: cadastro → email+telefone → 50 créditos → conta **courtesy** (C1 LIVE).
- Dinheiro entra por **recarga de crédito** (MP one-off, S3-p2) — não por assinatura recorrente.
- Módulo não é mais moeda de plano; é kill-switch global + toggle por empresa (suporte).
- O teto real de consumo é o **crédito** (`enforceLeadDeliveryDebit`), não cota/plano.
- Flags de enforcement (R1 gate, R2 kill-switch) OFF — **ligar é decisão do dono, fora deste plano**.

## Diagnóstico tela por tela (11 janelas)

| Janela | Linhas | Veredito |
|---|---|---|
| **Cockpit** | 642 | KPI central é **"MRR ativo"** — métrica de um modelo que não existe mais. Refazer no S4. |
| **Empresas** | 1933 | Aba Comercial ~60% morta: Plano, Degustação, Trial ("leva ao checkout" PR-002B), Condições de cobrança (desconto/meses grátis/ciclo), Limites cards/mês·dia (R5 aposentou). Aba Financeiro gira em assinatura MP (cancelar/refund) — falta a CARTEIRA. Wizard Nova empresa tem steps Plano+Ciclo mortos. Refazer no S2. |
| **Self-Checkout** | 347 | Editor do catálogo de planos legado (4 planos × preço/trial/cotas/módulos/assento). Guias Módulos (por plano) e Acentos = mortas por R2/R4. Política (desconto anual/indicação) = modelo assinatura. **Decisão do dono** (S3). |
| **Créditos** | 381 | Coração do modelo novo e a janela mais RASA: só packs CRUD + validade + grant. Falta tudo de operação. Crescer no S1. |
| **Pagamentos** | 154 | Só histórico de webhooks MP. Vira guia dentro de Créditos (S1). |
| **Online** | 197 | OK — modelo-agnóstico. Não tocar. |
| **Integrações** | 282 | OK. Não tocar. |
| **E-mails** | 574 | Revisar vocabulário: templates de trial/checkout do modelo velho (inventário no S6). |
| **Tickets** | 192 | OK. Não tocar. |
| **Contabil** | 1211+931 | Recém-construído (S1–S7 CONTABIL). Não tocar. |
| **Sistema** | 468 | `global-integrations` ainda carrega política de desconto anual (assinatura). Limpar no S5/S6. |

Órfãos transversais: `STATUS_LABEL` do page.client (trial/pending_checkout/charging), colunas
"Trial / Período" na lista de empresas, `PLANOS` hardcoded em 2 arquivos.

## Decisões ABERTAS (dono responde antes do sprint que as consome)
1. **Self-Checkout (S3):** matar a janela e fundir o que sobra em Créditos? Ou re-propósito
   como "vitrine/checkout" (o que o cliente vê = packs + bônus de cadastro)? Recomendo o segundo:
   o nome já comunica a função certa, só o conteúdo está errado.
2. **Trial como conceito (S2/S5):** aposentar de vez (todo mundo nasce courtesy+créditos)?
   Recomendo sim — dois funis de entrada é confusão de suporte.
3. **Pagamento manual (S2):** mantém como rota de exceção (PIX fora do MP) ou morre?
   Recomendo manter — mas registrando como CRÉDITO concedido, não como fatura.
4. **Vitrine pública `/?ver=planos`:** ainda aponta pro catálogo legado que a Self-Checkout
   edita. Vitrine créditos v2 (`38c109f1`) substitui? Se sim, a fonte PlanModuleConfig morre junto.

## Sprints (ordem = valor pro dono primeiro, remoção de backend por último)

### S1 — Créditos vira o centro financeiro do /master (front, risco baixo)
A janela Créditos ganha guias: **Visão geral** (receita de recarga 30d, saldo agregado em
circulação, expirações próximas 30d) · **Empresas** (tabela: saldo, lotes, último consumo,
grant manual inline — endpoints `credits/master` já existem) · **Packs** (o CRUD atual) ·
**Recargas** (funde a janela Pagamentos: charges + webhooks; a janela Pagamentos sai do menu).
- Arquivos: `janela-creditos.tsx`, `janela-pagamentos.tsx` (absorvida), `page.client.tsx` (menu),
  `screens.css` se precisar de classe nova (Lei 5). Backend: só endpoints de LEITURA novos se
  faltar agregado (ex.: `GET /credits/master/overview`).
- Pronto quando: dono responde "quanto entrou de recarga este mês / quem está sem saldo" em 1 tela.

### S2 — Empresas: ficha no modelo crédito (front + leitura, risco médio)
- Aba Comercial: REMOVER blocos Plano, Degustação, Trial, Condições de cobrança, Limites
  cards/mês·dia (assento-teto FICA — é operacional). MANTER Cortesia, Suspensão, Excluir,
  Credenciais master, Bot chave-mestra. Módulos vira explícito: "kill-switch (bot/email/website/vc)"
  + toggles de suporte.
- Aba Financeiro: bloco **Carteira** no topo (saldo, lotes, conceder crédito, ledger da empresa);
  cancelar-assinatura/refund ficam num "Legado (assinaturas)" colapsado enquanto existir 1 registro.
- Lista: coluna "Trial / Período" → "Créditos" (saldo + tag sem-saldo).
- Wizard Nova empresa: Empresa → Admin → Avançado (steps Plano e Ciclo somem; campo "créditos
  iniciais" default 50). Wizard vira rota de EXCEÇÃO — o normal é self-signup.
- `STATUS_LABEL`: enxugar pro vocabulário vivo (courtesy/active/suspended/canceled + legados marcados).
- Pronto quando: nenhuma ação da ficha dispara endpoint de plano; carteira visível e operável na ficha.

### S3 — Self-Checkout re-propósito (front, depende das decisões 1 e 4)
Se re-propósito: guias viram **Packs & preços** (link/duplicação fina do S1) · **Bônus de
cadastro** (os 50 créditos do C1 viram configurável) · **Política** (só o que sobrevive:
indicação; desconto anual morre com a assinatura). Guias Planos/Módulos/Acentos removidas.
Se morte: janela sai do menu, Política migra pra Créditos.
- Pronto quando: nada no /master edita mais `PlanModuleConfig`.

### S4 — Cockpit no modelo crédito (front + 1 endpoint agregado)
- "MRR ativo" → **Receita de recarga (30d)** + **créditos em circulação** + **burn 7d**.
- Funil novo: cadastros C1 → ativou (1º consumo) → 1ª recarga (a métrica que paga boleto).
- Roster: coluna MRR → saldo/consumo 30d.
- Backend: estender `/master-cockpit/overview` (só leitura, agregados do ledger de crédito).
- Pronto quando: cockpit não menciona MRR/assinatura em lugar nenhum.

### S5 — Backend: aposentadoria do modelo plano (estilo Fase 2, risco alto — POR ÚLTIMO)
Só depois que S1–S4 tiram TODAS as chamadas do front: aposentar `company/:id/plan`,
`plan-taste`, `trial`, `card-quota`, `finance-settings` (desconto/meses/ciclo),
`/modules/master/plan/:key/modules` (PUT), `billing-policy` (parte anual). NÃO apagar tabelas
nem histórico (mesma regra do R4: código órfão pode ficar em disco, dado NUNCA some). Testes
reescritos, não deletados. `pending_checkout`/`trial` no enum de status: manter aceitação em
leitura (empresas antigas), bloquear escrita nova.
- Pronto quando: typecheck + suíte verde; grep no front por endpoint aposentado = zero.

### S6 — Vocabulário, e-mails e faxina final (baixo risco)
- Inventário dos templates de e-mail: matar/reescrever os de trial/checkout; welcome fala de
  créditos. `janela-sistema`: remover restos de política anual. CSS órfão (Lei 5), textos.

## Guardrails
- **1 worker por sprint, 1 sprint por vez**; diff revisado pelo orquestrador antes do próximo.
- Frente financeira (preço/cobrança/checkout): **Opus edita direto** onde o sprint tocar
  cobrança viva (S1 grant/recarga) — regra do dono.
- NÃO ligar flags de enforcement, NÃO mexer em migration destrutiva, NÃO tocar WhatsApp.
- Commit local por sprint; **publish só quando o dono mandar** (1 publish, teste no VPS).
