# Enriquecimento em camadas — grátis primeiro, captura TUDO, cadeado por plano

## Regra do dono (25/06, literal)
Enriquecer é enriquecer MESMO: tudo que dá de graça (whatsapp, site, email, IG, FB, dor, CNPJ,
CNAE, razão, **nome do sócio**, whatsapp-check do motor interno) entra — não tem "enriquece um
pedaço, outro não". **Primeiro grátis; só paga pro ALÉM.** Nunca descarta ouro (CNPJ) pra depois
pagar achando ele. **Sem forçar rede social** — o jogo é card BEM preenchido + **cadeado por plano**.

## Camadas grátis (acumula, para quando tem o alvo)
L0 busca · L1 parse (DDD/provável-whatsapp/dor) · L2 crawl do site (email/IG/FB/CNPJ rodapé/razão)
· L3 busca pública (DDG/Bing) · **L4 cofre CNPJ público** (CNPJ → razão/CNAE/**sócio**/endereço/situação, GRÁTIS)
· L5 whatsapp-check (motor interno). Pago (P1/P2) = só o que o grátis comprovadamente não alcança — depois.

## Worker 1 — BACKEND (enrichment core)
1. **Caçar o descarte de CNPJ/CNAE/razão**: motor captura (ContactResult extra=allow) mas algo na
   persistência (`persistRadarLeadPoolBatch`/history) ou presenter dropa. PARAR de dropar; guardar
   (coluna se existe, senão metadataJson).
2. **Ligar L4**: lead com CNPJ → `cnpj-public-provider` (já existe) → razão/CNAE/sócio/endereço/situação, grátis.
3. **Camadas acumulando** no 03-enrichment (estender, NÃO rewrite): L1 sinais + L2 crawl + L3 + L4.
4. **Surface no card** (`radar-lead-presenter`), campos OPCIONAIS: `cnpj, cnae, razaoSocial, ownerName,
   ownerNames[], companySituation, address` (+ os já existentes). Card antigo sem eles continua ok.
- NÃO toca: `hbx-engine-pool.service.ts`, `webscraping.controller.ts` (elástica não-commitada), financeiro, deploy.

## Worker 2 — FRONTEND (cadeado por plano)
- Card mostra tudo, mas **🔒 nos campos de inteligência/empresa pra List** (`canSeeLeadIntelligence=false`).
- Sempre visível (List incl.): nome, telefone, cidade, segmento, site, email, IG, FB.
- Cadeado no List: score, motivo, canal, mensagem pronta, WhatsApp VERIFICADO, + `cnpj/cnae/razaoSocial/ownerName/companySituation`.
- Lock = borrado + 🔒 + CTA "Ligue o HBX Lead+ pra ver". Reusar `DetalhesNegocio` + design system (check-pele reprova hex/inline).

## Reverter
`git revert` por camada (backend × frontend isolados). Sem migration destrutiva (preferir metadataJson). Nada deployado.
