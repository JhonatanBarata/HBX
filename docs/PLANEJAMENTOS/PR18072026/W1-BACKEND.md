# W1 — Backend não-billing (Sonnet)

Leia antes: `00-ORQUESTRACAO.md` (contratos), `docs/Rules/BACKEND.md`.
Arquivos-base: `backend/src/logistica/logistica-rota.service.ts` (planejarRota ~:60, encerrarRota ~:366),
`backend/src/logistica/logistica.service.ts`, `backend/src/logistica/dto/logistica.dto.ts`,
`backend/src/nucleo/*`, `backend/prisma/schema.prisma`.

## Tarefas (todas aditivas)

1. **Schema/migrations (você é o dono único do schema neste PR):**
   - `CustomerProfile.observacoes String? @db.VarChar(500)`
   - `LogisticaConfig.cobrancaSimples Boolean @default(false)`
   - model `LogisticaRotaModelo` { id cuid, companyId Int, nome VarChar(80), diaSemana Int?,
     paradasJson Json, createdAt, updatedAt, @@index([companyId]) } (+ relation Company)
   - **`LogisticaRouteStop.billingExempt Boolean @default(false)`** ← é do W2 (Opus), mas a
     migration é sua para não conflitar no schema. Só a coluna; não toque no billing service.
   - 1 migration aditiva com tudo (`20260718...`). NÃO rodar `prisma format`.

2. **`POST /logistica/rota/limpar-dia`** (`{date?}`, mesma guarda do encerrar): transacional —
   entregas ABERTAS (agendada/em_rota) do escopo do dia (mesmo OR do encerrarRota: range do dia
   + sem-data abertas) viram `cancelada`; entregues/canceladas/FinanceiroCharge/comprovantes
   INTOCADOS; marca `operationalEndedAt` das rotas vivas do dia (mesmo updateMany do encerrar).
   Retorna `{ok, resumo:{canceladas}}`. Idempotente.

3. **Ordem manual:** `PlanejarRotaInput.ordemManual?: string[]` (DTO whitelisted, ids string,
   max ~500). Quando presente em planejar/iniciar: valida que os ids pertencem ao conjunto
   aberto do dia/motorista; paradas listadas recebem rotaOrdem na ordem dada; não listadas vão
   pro fim (ordem natural do fetch); pula NN+2-opt; ETA cumulativo igual ao de hoje
   (mesma velocidade/tempo de parada, mesma persistência rotaOrdem/etaAt).

4. **Rota-modelos CRUD** (controller logistica, mesma guarda admin do gerar-dia):
   GET lista da empresa; POST cria; PATCH :id; DELETE :id. Validação: nome 1-80, diaSemana 1-7
   ou null, paradas = array de `{customerProfileId, localId?}` (max 500), company-scoped
   fail-closed (404 cross-tenant). Aplicar modelo é client-side (app manda ordemManual) — NÃO
   criar endpoint "aplicar".

5. **Fiado (pendura):** conferir `lancarCobranca`/fluxo do confirmar para `formaPagamento='pendura'`:
   charge nasce `pending` (nunca auto-quita), `diaFechamento` não exigido, sem WhatsApp extra.
   Ajustar se houver furo; reportar o que encontrou.

6. **Observações do cliente:** aceitar `observacoes` no create/update de contas (nucleo, DTO
   whitelist + trim + max 500); expor em: listRota (`cliente.observacoes`), lista/detalhe de
   clientes usados pelo app, dia-preview.

7. **Produtos façade:** garantir `PATCH /logistica/produtos/:id` (nome/unidade/preco/estoque/
   ativo) company-scoped ADMIN; se POST /logistica/produtos não existir (app usa), criar par.
   Arquivar = `ativo=false` (produto inativo some do picker mas não quebra vínculos).

8. **listRota expõe `cliente.debitoAtual`** quando `moduloFinanceiroAtivo` (reusar o helper de
   saldo aberto por cliente já existente — fonte canônica logistica.service; não recalcular na mão).

9. **precoAcordado end-to-end:** teste provando vínculo com precoAcordado → gerarDia → item da
   entrega usa o preço acordado → charge com o valor certo. Fechar furo se houver.

## Regras
- Testes node runner do repo para 2,3,4,5,6,8,9; `npx tsc --noEmit` limpo no backend inteiro.
- NÃO commitar, NÃO criar branch, NÃO tocar: logistica-route-billing.service.ts, app.js, Kotlin.
- Relatório final: contratos exatos implementados (paths/DTOs), arquivos tocados, testes (N/N),
  furos achados no item 5/9.
