# Worker: Fusão por campo no dedup web×receita (o duplicado DOA antes de morrer)

**Ler antes:** `docs/Rules/BACKEND.md`. **Escopo:** `backend/src/webscraping/radar/` (+ testes). NÃO tocar: Python engine, migrations, Webwhats, VPS, filtros de porta (web gate/quality gate/lead-quality-v2).
**Ao concluir:** typecheck + suite radar verdes → DELETAR este .md.

## Problema (medido no run cmr2te6yl, Rio Verde)
Hoje a "fusão" é dedup cego a campo: "Pizza It" (web, com site+fone) foi salvo primeiro; "PIZZA IT" (cnpj_public, com CNPJ+razão+situação) chegou depois, virou `duplicate` e foi descartado INTEIRO — o CNPJ morreu com ele. Se a ordem invertesse, morreria o site. Quem perde o empate joga a riqueza fora.

## Fix: doação aditiva no momento do duplicate
No `saveSearchRunResults` (`03-enrichment/radar-core-quality-enrichment.mixin.ts:~1116-1330`), quando `classifyRunItem` devolve `status='duplicate'` (placeId/phone/websiteKey/compositeKey repetidos):
1. Localizar o run item SOBREVIVENTE: `findFirst` em `WebscrapingSearchRunItem` por `runId` + a chave que causou o dup (a razão vem em `duplicateReason`; usar phoneDigits/websiteKey/placeId/compositeKey conforme o caso — atenção: o dedup snapshot atual só guarda Sets de chaves, não ids; cross-batch [web salvo num batch, receita no seguinte] exige esse lookup no banco mesmo).
2. **Doar campos VAZIOS** do sobrevivente a partir do descartado (nunca sobrescrever não-nulo): `cnpj`, `legalName`, `cnae`, `cnaeDescription`, situação (campo/rawJson conforme shape), `website`, `instagramUrl`, `facebookUrl`, `email`, `address`, `phone`/`phoneDigits` (só se sobrevivente sem fone válido). Merge de evidência: `rawJson`/`evidenceJson` do sobrevivente ganha bloco `mergedFrom: { source, placeId, campos_doados }` — proveniência auditável.
3. Se existir linha correspondente no `RadarLeadPool` (mesma empresa/placeId, localizável pelo caminho que o save já usa), aplicar a MESMA doação fill-empty no pool (metadataJson aditivo, padrão L4 `enrichRow`).
4. O run item duplicado continua sendo persistido como `duplicate` (auditoria card-por-card do dono) — só que agora depois de doar.
5. Falha na doação → log warn e segue (nunca derrubar o save por causa do merge).

## Testes (padrão node:test do domínio)
- receita chega depois: web sobrevivente ganha cnpj/razão; site intacto.
- web chega depois: receita sobrevivente ganha website/instagram; cnpj intacto.
- campo não-nulo NUNCA sobrescrito (fone do web não é trocado pelo frio da RFB).
- doação com lookup falhando → save segue normal.
- `mergedFrom` gravado na evidência.

## Aceite
1. `npm run build` + suite radar verdes.
2. Nenhum arquivo fora do escopo.
3. Deletar este .md.
