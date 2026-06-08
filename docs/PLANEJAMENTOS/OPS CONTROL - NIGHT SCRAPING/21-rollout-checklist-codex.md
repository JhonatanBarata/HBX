# Passo 21 - Rollout, checklist e ordem de PRs Codex

## Objetivo

Executar a conversa inteira em PRs pequenos, reversiveis e testaveis.

## Ordem recomendada de PRs

PR 1 - Contratos:

- aplicar Passo 13;
- criar tipos e normalizadores;
- testes pequenos.

PR 2 - Import API MVP:

- aplicar Passo 14;
- criar endpoint de import e consulta;
- sem Local Lab ainda.

PR 3 - Importador seguro:

- aplicar Passo 16;
- dedupe, negativos, opt-out e rejeicoes.

PR 4 - Enriquecimento gratis v2:

- aplicar Passo 17;
- melhorar e-mail, evidencias e action plan sem API paga.

PR 5 - Local Lab:

- aplicar Passo 15;
- servico local separado;
- export JSONL.

PR 6 - OPS Email Lab:

- aplicar Passo 20;
- UI e wrappers seguros.

PR 7 - Observacao desktop:

- aplicar Passo 19;
- separar List/Lead Plus/Full visual e funcionalmente.

PR 8 - Cost Ledger:

- aplicar Passo 18;
- budget, ledger e providers mockados.

PR 9 - Google/Email provider real:

- somente depois do ledger;
- chamadas reais atras de flags;
- sem chamada real em teste automatizado.

## Flags recomendadas

```env
HBX_LEAD_HARVEST_IMPORT_ENABLED=false
HBX_LOCAL_LAB_IMPORT_ENABLED=false
HBX_EMAIL_SMART_ENRICH_V2_ENABLED=false
HBX_PAID_ENRICHMENT_LEDGER_ENABLED=false
HBX_GOOGLE_PAID_FALLBACK_ENABLED=false
HBX_EMAIL_PROVIDER_FALLBACK_ENABLED=false
```

## Gates de rollout

Gate 1 - local:

- build backend;
- testes de contrato/importador;
- batch pequeno importado localmente.

Gate 2 - staging/manual:

- importar batch fake;
- rejeitar duplicado;
- rejeitar negativo;
- conferir payload List/Lead Plus.

Gate 3 - VPS controlada:

- habilitar apenas import;
- sem provider pago;
- sem Local Lab escrevendo direto;
- revisar logs por segredo.

Gate 4 - produto:

- Observacao desktop ativa;
- List/Lead Plus separados;
- owner consegue ver custos e rejeicoes.

Gate 5 - API paga:

- ledger ativo;
- budget ativo;
- cache ativo;
- fallback atras de flag;
- chamada real so por score alto e motivo registrado.

## Comandos de verificacao

Checklist rapido do pacote Email Lab/Lead Harvest:

```bash
npm run rollout:email-lab:check
```

Backend:

```bash
cd backend && npm run prisma:validate
cd backend && npm run build
```

Frontend:

```bash
cd frontend && npm run lint
cd frontend && npm run build
```

Ops Control:

```bash
node --check ops-control/server.js
node --check ops-control/public/app.js
```

Root:

```bash
git diff --check
```

## Riscos altos

- List receber inteligencia premium pelo backend.
- Importador recriar negativo.
- Local Lab ter token da VPS.
- Provider pago rodar sem ledger.
- Budget ser tratado so no frontend.
- Scraper experimental entrar na VPS.
- Card ser criado sem empresa real.
- E-mail provavel ser vendido como confirmado.

## Checklist final por PR

- fortalece Radar -> Vendas -> WhatsApp -> Retorno;
- nao mexe em cobranca/acesso sem pedido explicito;
- nao bypassa plano, entitlement ou quota;
- preserva negativos e opt-outs;
- nao expoe segredo;
- diffs pequenos;
- testes relevantes rodados ou falha explicada;
- docs atualizadas quando alterar operacao.

## Artefatos implementados

- `scripts/validate-email-lab-rollout.js`: checklist automatizado sem deploy, sem migracao e sem chamada externa real.
- `npm run rollout:email-lab:check`: executa checks de docs, flags, rotas, separacao Local Lab/VPS, sintaxe do Ops Control e `git diff --check`.
- `backend/.env.example`: mantem as flags de rollout em `false` por padrao.

## Prompts Codex completos

### PR 1

```text
Leia `AGENTS.md` e os docs de planejamento na pasta `docs/PLANEJAMENTOS/OPS CONTROL - NIGHT SCRAPING`.
Implemente apenas o Passo 13. Crie contratos e normalizadores de lead/email harvest com testes. Nao crie endpoints.
```

### PR 2

```text
Leia `AGENTS.md` e aplique o Passo 14. Crie a API oficial de importacao/consulta de batches na VPS. Nao crie Local Lab e nao envie direto para Vendas.
```

### PR 3

```text
Leia `AGENTS.md` e aplique o Passo 16. Fortaleca importacao com dedupe, negativos, opt-outs, rejeicoes e sourceMode imported_lab. Nao ignore historico negativo.
```

### PR 4

```text
Leia `AGENTS.md` e aplique o Passo 17. Evolua enriquecimento gratis de e-mail, evidencias e actionPlan. Nao ligue Google pago, Hunter ou provider externo.
```

### PR 5

```text
Leia `AGENTS.md` e aplique o Passo 15. Crie `hbx-local-lab` local, descartavel, com jobs e export JSONL no contrato HBX. Nao use credencial da VPS.
```

### PR 6

```text
Leia `AGENTS.md` e aplique o Passo 20. Adicione Email Lab no Ops Control com status, Local/VPS/Ambos, export/import e rejeicoes. Nao criar shell livre.
```

### PR 7

```text
Leia `AGENTS.md` e aplique o Passo 19. Crie/ajuste a Observacao desktop do Radar para separar HBX List, HBX Lead Plus e HBX Full visual e funcionalmente. Use padroes HBX e PT-BR.
```

### PR 8

```text
Leia `AGENTS.md` e aplique o Passo 18. Crie ledger e budget de API paga com providers mockados. Nenhuma chamada real externa neste PR.
```

### PR 9

```text
Leia `AGENTS.md` e os passos 18 e 21. Ligue provider externo real apenas atras de flag, ledger, budget, cache e testes com mock. Nao executar chamada real em teste automatizado.
```
