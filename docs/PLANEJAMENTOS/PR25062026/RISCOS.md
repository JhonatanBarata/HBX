# RISCOS — 25/06

Tudo localhost/reversível. Nada live disparado. Builds verdes.

## Descoberta de leads: Brave ligado + scraping free reforçado (working tree, NÃO commitado)
- **Brave Search LIGADO** (`.env` raiz, gitignored): `BRAVE_SEARCH_API_KEY=…`. Provider tier **free** (2.000 buscas/mês) — entra na cascata de enriquecimento como reforço quando DuckDuckGo/motor não acham. Confirmado **dentro do motor** (provider `enabled=True`). Recriei os **20 motores + backend** pra pegar a chave.
  **Reverter:** apaga a linha do `.env` + `npm run engines:up -- -Count 20`.
- **SearXNG self-hosted** (`docker-compose.yml` + `searxng/settings.yml`): metabuscador free, profile `hbx-engines` (NÃO sobe no `up` padrão). Subir: `docker compose --profile hbx-engines up searxng -d`.
  **Reverter:** `git checkout docker-compose.yml && rm -rf searxng/`.
- **Google HTML ligado SÓ no localhost** (`.env`: `HBX_GOOGLE_HTML_ENABLED=true`). No VPS fica false (não sobe — `.env` é gitignored).
  **Reverter:** apaga a linha.
- **Instagram/Facebook — mais variações de @** (`radar-web-enrichment.service.ts`, `buildDirectSocialSlugs`): pool maior de candidatos; teto de requisições inalterado (10).
  **Reverter:** `git checkout` do arquivo.
- **Cano do pago — torneira FECHADA** (`enrichment-paid-policy.ts` novo + 2 pontos do radar + `.env.example`): backend passa `allowPaid`/`allowPremium` pro motor lendo `HBX_ENRICH_ALLOW_PAID`/`_PREMIUM` (default **false**). Sem chave de provider pago, nada dispara, mesmo ligando o flag.
  **Reverter:** `git checkout` dos 2 pontos + apaga o helper.

## Plano base CNPJ — CONGELADO até o 1º cliente FULL
Cotado (Casa dos Dados 1º; Speedio/Econodata = upgrade). NÃO construído. Ver [PLAN-BASE-CNPJ-LIST-LEAD-COMPANY.md](PLAN-BASE-CNPJ-LIST-LEAD-COMPANY.md). Pendência minha quando ligar pago de verdade: amarrar `allowPaid` ao plano ≥250.

## Pendente do ciclo anterior (24/06) — dados de teste no banco
Se você ainda NÃO limpou (rodar: `docker compose exec db psql -U admin -d jhonatan_dev -c "…"`):
1. Comissão de teste no teu usuário: `UPDATE "User" SET "commissionPercent"=0 WHERE id=36;`
2. Lead **Camila Barsotti** fechada de exemplo: `UPDATE "VendasLead" SET "saleStatus"='none',"commissionStatus"='none',"assignedUserId"=NULL,"commissionPercentSnapshot"=0,"saleValue"=NULL,"setupValue"=NULL,"salePlanKey"=NULL WHERE id='cmqrkt3ji0070132d8sumhc74';`
3. Log de implantação demo: `DELETE FROM "MasterPaymentNotificationLog" WHERE target='implantacao';`

## Bot — auto-ligar (atenção antes de publicar)
A reforma do Construtor de Bot faz o bot **ligar sozinho** quando o pré-voo fica OK. Pros **proativos** (Recovery/Prospecção) isso pula o antigo "confirma? começa devagar" — fica travado só pelo teste-feito. Em localhost não dispara (sem chip). Se quiser o freio de confirmação de volta antes de publicar, pede que é rápido.
