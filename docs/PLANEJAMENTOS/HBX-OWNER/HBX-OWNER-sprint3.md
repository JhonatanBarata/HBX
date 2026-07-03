# HBX-OWNER — Sprint 3: Regra de lixo única no backend (fim da cópia manual)

> Arquitetura nº9 (HBX Owner). Escopo: backend (`webscraping` owner routes) + agent.
> Regras: docs/Rules/BACKEND.md (rotas owner exigem guard master) e docs/Rules/INFRA.md.

## Por quê (ROI)
`server.js` copia à mão `looksLikeNonBusinessName`, `isRealisticBrPhone` e `isJunkLead`
(linhas ~1302–1336) espelhando `backend/src/webscraping/radar/shared/radar-core-shared.ts` —
que JÁ tem teste próprio (`radar-core-shared.junk-name.test.ts`). Na primeira mudança de
critério no backend, o "Limpar lixo" do Owner passa a apagar coisa DIFERENTE do que o filtro
de entrada aceita. Divergência silenciosa em cima do banco de leads (o ativo que vira dinheiro).

## Tarefas
1. **Backend** — nova rota owner (mesmo guard das rotas `/modules/owner/radar/*`):
   - `POST /modules/owner/radar/clean-junk` com body `{ confirm?: boolean }`.
   - Sem `confirm`: varre o pool (mesma paginação interna do `listMasterDatabaseCards`) usando
     o `isJunkLead` REAL do `radar-core-shared` e devolve `{ preview:true, scanned, junk, sample[8] }`.
   - Com `confirm:true`: apaga (mesmo caminho do `permanentDeleteMasterDatabaseCards`) e devolve
     `{ scanned, junk, cleared }`.
   - Teste unitário do serviço (o critério já é testado; testar a costura preview/confirm).
   - `cd backend && npx tsc --noEmit` verde.
2. **Agent** — `/owner/clean-junk-leads` vira proxy fino pra rota nova (mantém o contrato que a
   UI já consome: `{ preview, scanned, junk, sample }` / `{ cleared }`).
3. **Apagar** do server.js: `NON_BIZ_EN_STOPWORDS`, `looksLikeNonBusinessName`,
   `VALID_BR_DDDS`, `isRealisticBrPhone`, `isJunkLead` (~60 linhas de cópia).

## Critérios de aceite
- Preview no painel mostra os mesmos totais de antes (ou melhores — critério oficial).
- Confirmar apaga e o total do banco local reflete.
- Nenhuma duplicação da regra sobra em `hbx-owner/` (grep `looksLikeNonBusinessName` = 0 fora
  do backend).

## Não fazer
- NÃO mudar o critério de lixo em si neste sprint (mover ≠ mexer na régua).
- A rota nova NÃO roda na VPS automaticamente — limpar produção continua decisão manual do dono.
