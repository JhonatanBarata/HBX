# NÚCLEO-CRM — a espinha de cadastro (Empresas · Contatos · Produtos · Logística)

> Ordem do dono 04/07 (05h, "cria o plano, vou dormir e vc trabalha"). Objetivo: transformar os
> cadastros soltos do HBX numa **espinha única** de onde Vendas, Logística e Atendimento bebem, e
> plugar o módulo **Logística** (cliente água) por cima. Opus planeja (este doc); execução por
> workers LOCAL, **não publica**; dono revisa o diff e publica. **Nunca sobrescrever o trabalho
> paralelo do dono** (`buscar-empresas.tsx` + `vendas/page.client.tsx` estão sujos no working tree).

---

## 1. A grande sacada — 5 itens = 1 espinha + 2 consumidores

O dono pediu 5 "módulos": (1) Empresas, (2) Contatos, (3) Produtos, (4) Logística, (5) "Clientes ou
Contatos?". A leitura certa **não** é 5 tabelas paralelas — é isto:

```
        ┌─────────── ESPINHA (cadastro único, por empresa/tenant) ───────────┐
Radar → │  CONTA  ──tem──►  CONTATO(s)      + PAPÉIS: lead | cliente | forn.  │
(pull)  │  (PJ c/ CNPJ       (pessoa: dono,                                    │
        │   ou PF pessoa)     comprador, quem recebe)                         │
        └────────────────────────────────────────────────────────────────────┘
              ▲ Empresas (janela PJ)   ▲ Contatos (janela pessoas)   ▲ Clientes (janela papel=cliente)
                                   │
                   PRODUTOS (catálogo) ─────► LOGÍSTICA (Entrega = Conta+Produto+Contato)
```

- **Empresas**, **Contatos** e **Clientes** são **três JANELAS filtradas da MESMA base**, não três
  cadastros. Zero digitação dupla, zero divergência.
- **Produtos** é o catálogo (já existe: `Product`, `kind='tenant_product'`).
- **Logística** é o primeiro consumidor pesado da espinha (o cliente água).

### Resposta ao item 5 — "Clientes OU Contatos?" → os DOIS, em camadas
- **Conta** = o "quem" macro. Uma organização (PJ, tem CNPJ) **ou** uma pessoa-cadastro (PF, ex.: Dona
  Maria do galão). Carrega endereço, lat/lng, telefone.
- **Contato** = a **pessoa** dentro da conta (o dono, o comprador, quem recebe a entrega). Uma conta
  tem **N contatos**. Numa PF, o contato é ela mesma.
- **Cliente** = **não é entidade nova — é um PAPEL da conta** (virou comprador / recebe entrega).
  "Clientes" = a mesma base filtrada por `papel=cliente`.

> Logo: **Contato = pessoa. Cliente = conta que compra.** A aba de Logística se chama "Clientes" e cada
> cliente, ao abrir, lista seus **Contatos** (pessoas) + endereço + produtos + histórico de entregas.
> Quando o vendedor de água cadastra "Dona Maria" e o endereço, ele cria uma **Conta (PF, papel
> cliente)** com **1 Contato** — e isso é exatamente "vai na aba Contatos/Clientes" que o dono falou.

---

## 2. Modelo de dados — REUSO máximo, tabela nova só onde falta

| Papel na espinha | Reusa o que já existe | O que adiciona |
|---|---|---|
| **Conta** | `CustomerProfile` (já é por-tenant, já tem `name`/`phone`/`email`/`document`, já liga em `VendasLead`/`DebtCase`) | `tipo` (`pj`/`pf`), `cnpj`, `endereco`/`lat`/`lng`, papéis (`isCliente`/`isLead`/`isFornecedor`), `origin` (`radar`/`manual`) |
| **Contato** | `LeadPerson` (pessoa num lead do Radar) como FONTE de seed | novo `Contato` filho de `CustomerProfile` (`nome`, `cargo`, canais wa/tel/email, `isPrincipal`) |
| **Fonte CNPJ** | `CnpjPublicCompany` (razão/fantasia/cnae/endereço/cidade/`ownerName`) + `CnpjPublicPartner` (quadro societário; `identificador` 1=PJ/2=PF) | — (é a "CNPJ.biz" que o dono citou; já está no banco, dump RFB 28M) |
| **Produtos** | `Product` (`kind='tenant_product'`, `sku`, `status`, preço) | `unidade` (ex.: "galão 20L"), flag `usaLogistica` |
| **Logística** | `ConversationsService` (WhatsApp blindado), `Cadencia` (cobrança agendada), `FinanceiroCharge` | novo `Entrega` (ciclo `agendada→em_rota→entregue`, `deliveredLat/Lng/At`, `modeloCobranca`) |

> **Decisão estrutural (tomada, confirmar):** estender `CustomerProfile` em vez de criar `Conta`
> paralela — ele JÁ é a ficha por-tenant e JÁ liga no funil; tabela nova duplicaria a verdade e brigaria
> com VENDAS-REFAB/CRÉDITOS que editam esse caminho. Alternativa (tabela `Conta` nova) fica registrada
> caso o dono prefira separar PF/PJ fisicamente.

---

## 3. Encaixe com o que JÁ está rodando (não duplicar, não brigar)

### 3a. VENDAS-REFAB (em execução AGORA nos mesmos arquivos)
- A tela `BuscarEmpresas` já consulta a base 28M (`POST /webscraping/radar/cnpj-base/query`) e "puxa"
  via `POST /webscraping/radar/cnpj-base/pull`. **Esse pull é o ponto de ingestão da espinha.**
- Hoje o pull materializa um `VendasLead` (card do funil). NÚCLEO-CRM torna o pull **também**
  materializar **Conta(PJ) + Contato(dono)** — aditivo, no MESMO choke, sem segundo caminho.
- `nome do lugar` → `Conta.nome` (nomeFantasia/razaoSocial). `nome do dono` → `Contato.nome`
  (`ownerName` / `CnpjPublicPartner.nome`). **Contato deixa de nascer do WhatsApp; nasce do Radar ou
  manual** (exatamente o pedido do item 2).

### 3b. CRÉDITOS (a régua de cobrança/acesso)
- **Precedência de bloqueio (LEI, ordem fixa):** estado comercial da empresa → kill-switch de módulo
  do master → RBAC do cargo → saldo de crédito. Os 4 módulos entram nessa régua sem inventar nada.
- **Módulo = kill-switch** (`SystemModule`/`CompanyModule`), não paywall. Logística vende/liga por
  empresa.
- **RBAC** (`UserTeamPolicy`) decide quem vê/edita conta/contato/entrega.
- **Crédito = só o LEAD puxado da base 28M custa (1 lead = 1 crédito = 1 baixa — D1/D2).** Cadastrar
  cliente MANUAL na Logística (o vendedor digitando Dona Maria) **é grátis** — não é lead da base, é
  cadastro próprio do tenant. Distinção dura: **puxado da base = 1 crédito; digitado à mão = R$0.**

### 3c. Front (shell + nav + tab bar)
- Cada módulo = 1 rota em `frontend/src/app/(app)/{empresas,contatos,produtos,logistica}/` + linha em
  `NAV_LINKS` + gate em `NAV_MODULE_KEY` (shell.tsx). ⚠️ **Registrar o ícone em `ICONS`** — nav sem
  chave em ICONS derruba a tela (foi o P0 do "assistente").
- Mobile: `MobileTabBar` troca "Buscar" pela aba **Rota** quando Logística está ativa pro tenant.

---

## 4. Sprints (N1–N6) — 1 worker por sprint, sequencial, NÃO publica

Fase A = espinha; Fase B = janelas/UI. Cada worker grava `N{n}-RESULTADO.md` nesta pasta e confere
`origin/master` antes de começar (worktree pode estar atrás — VENDAS-REFAB/CRÉDITOS mexem nos mesmos
arquivos).

### Fase A — ESPINHA
- **N1 — Modelo Conta + Contato (schema, backend).** Estende `CustomerProfile` (tipo/cnpj/endereço/
  lat/lng/papéis/origin) + novo `Contato`. Migration **aditiva** (nada destrutivo). Sem UI. Seeds a
  partir de `LeadPerson`/`CnpjPublicPartner`. Depende só de si. `build` + `prisma:validate` verdes.
- **N2 — Ingestão no PULL (backend).** Hook em `cnpj-base/pull`: materializa Conta(PJ)+Contato(dono)
  junto do `VendasLead` (aditivo, mesmo choke). Backfill dos leads já puxados. **Depende do pull do
  VENDAS-REFAB S3 existir** — se ainda não, N2 fica atrás de flag e trata ausência como no-op.

### Fase B — JANELAS / MÓDULOS
- **N3 — Módulo Empresas (front).** Rota `/empresas` = lista de Contas PJ (as puxadas); abre ficha com
  dados CNPJ + Contatos. Reusa `DetalhesNegocio`. Kill-switch + RBAC.
- **N4 — Módulo Contatos + papel Cliente (front).** Rota `/contatos` = pessoas; criar/editar manual;
  vincular a uma Conta. "Clientes" = filtro `papel=cliente` (mesma base).
- **N5 — Módulo Produtos (front+backend leve).** Rota `/produtos` = catálogo (`Product` kind
  tenant_product) com `unidade`/preço + flag `usaLogistica`. Sem migration pesada.
- **N6 — Módulo Logística (o app de entrega).** Novo `Entrega` (ciclo agendada→em_rota→entregue) + tela
  "Rota do dia" mobile (deep-link Waze + `navigator.geolocation`, custo R$0). Cliente = Conta(cliente)
  + endereço + Produto + Contato. Confirmar entrega → WhatsApp "entregue" (`ConversationsService`) +
  cobrança conforme contrato **configurável por cliente** (`modeloCobranca`: mensal | avulso |
  assinatura) via `Cadencia`+`FinanceiroCharge`. Frente com cobrança → Opus edita direto + revisão do
  diff. Depende de N1 (Conta/Contato) e N5 (Produtos).

**Dependências:** N1 pode ir já (schema isolado). N2 depois do pull (VENDAS-REFAB S3). N3/N4 depois de
N1. N5 independente. N6 depois de N1+N5. Tudo atrás de flag; nada em prod até o dono revisar o diff.

---

## 5. Decisões que TOMEI (confirmar de manhã) + perguntas abertas
1. **Espinha = estender `CustomerProfile`** (não criar `Conta` nova). Motivo: evita verdade dupla e
   colisão com VENDAS-REFAB/CRÉDITOS. ❓Confirma ou prefere tabela separada PF/PJ?
2. **"Empresas" = janela só de PJ; clientes PF (Dona Maria) vivem na janela "Clientes" da Logística**
   (mesma espinha, filtro por tipo/papel). ❓Os rótulos te servem, ou quer "Empresas" renomeado pra
   "Contas/Cadastros" já que guarda PF também?
3. **Produtos = reusa `Product` (`kind='tenant_product'`)** pros itens do vendedor (galão 20L), separado
   do catálogo de planos do HBX. ❓Confirma?
4. **Manual = grátis, puxado da base = 1 crédito.** ❓Confirma essa fronteira (é o que casa com D1 do
   CRÉDITOS)?
5. **Overnight:** eu **não** vou implementar/spawnar workers em cima do teu working tree sujo
   (buscar-empresas + vendas não-commitados) porque N1/N2 tocam `CustomerProfile`/`VendasLead` — os
   MESMOS arquivos que VENDAS-REFAB/CRÉDITOS estão editando. Construir agora = a colisão exata que as
   tuas próprias regras proíbem (falha 18/06 + guardrail dos planos). Plano pronto pra disparar assim
   que você acordar e (a) commitar/estabilizar o teu working tree e (b) confirmar os itens 1–4.

---

## 6. Por que isso é dinheiro (não é firula de arquitetura)
A espinha é o **moat**. Concorrente (Auvo/CRMs) te faz **digitar** cada cliente. O HBX **puxa** da base
federal 28M com o nome do dono já anexado, e o MESMO cadastro serve Vendas, Logística e Atendimento sem
retrabalho. Isso: (a) transforma o HBX de "punhado de ferramentas" em **sistema operacional do pequeno
negócio**; (b) faz cada módulo virar cross-sell (lead puxado no Vendas já é cliente potencial na
Logística); (c) **não cria nova superfície de cobrança** — o crédito continua debitando no pull (1
lead), a Logística manual é grátis. Vender Logística vira vender um assento a mais na MESMA base.

## Checks por sprint
Backend: `cd backend && npm run build` + `npm run prisma:validate` + suíte tocada verde. Front:
`check-pele.mjs` (5 Leis). **NÃO publicar**; cada worker grava `N{n}-RESULTADO.md`. Frente com cobrança
(N6): Opus edita direto + revisão do diff. Conferir `origin/master` antes de CADA sprint.
