# PR18072026 — App entregador: entregar pro cliente (9 itens do feedback)

Decisões do dono (18/07): migração de entrega entre rotas comerciais é DE GRAÇA; "Limpar dia"
cancela abertas do dia; implantar Ondas 1-3 inteiras, publicar, atualizar APK, lapidar depois
no celular junto.

## Frentes
| Frente | Executor | Arquivos |
|---|---|---|
| W1 backend (não-billing) | Sonnet | schema.prisma, migrations, logistica-rota/logistica/nucleo services+controllers+DTOs |
| W2 billing (fix 409 + migração grátis) | **Opus direto** (frente financeira) | logistica-route-billing.service.ts + teste |
| W3 app.js Onda 1 (erro humano, produtos, preço/cliente, observação) | Sonnet | EntregaShell/app/src/logistica/assets/app/app.js |
| W4 app.js Onda 2 (chegada simples, fiado, toggle) | Sonnet (após W3) | app.js |
| W5 app.js Onda 3 (minha ordem, rotas salvas, limpar dia) | Sonnet (após W4) | app.js |
| Consolidação: allowlist Kotlin, revisão, checks, build APK, publish, adb install | Opus | NativeApiClient.kt |

W1 é dono ÚNICO de schema.prisma/migrations (inclui a coluna do W2). W3-W5 sequenciais
(mesmo arquivo). Ninguém commita — Opus commita por frente após revisão.

## Contratos de API (novos/alterados — fonte da verdade p/ W3-W5)
- `POST /logistica/rota/limpar-dia` `{date?}` → cancela entregas ABERTAS do dia; resumo `{canceladas}`.
- `POST /logistica/rota/planejar|iniciar` ganham `ordemManual?: string[]` (deliveryIds na ordem do usuário; presentes = ordem dada; ausentes = apêndice no fim). 
- `GET/POST /logistica/rota-modelos`, `PATCH/DELETE /logistica/rota-modelos/:id` — `{id, nome, diaSemana(1-7|null), paradas:[{customerProfileId, localId?}]}` em ordem.
- `PATCH /logistica/produtos/:id` (editar nome/unidade/preço/estoque/ativo) — façade company-scoped ADMIN.
- `CustomerProfile.observacoes` (VarChar 500) — aceito no POST/PATCH de contas (nucleo), exposto em listRota (cliente.observacoes), lista/detalhe de clientes e dia-preview.
- `LogisticaConfig.cobrancaSimples Boolean @default(false)` — PATCH /logistica/config.
- listRota expõe `cliente.debitoAtual` (número) quando moduloFinanceiroAtivo.
- Erro 409 de rota comercial: body ganha `code:'ENTREGA_EM_OUTRA_ROTA'`, mensagem SEM id cru.
- `formaPagamento` já aceita `'pendura'` (fiado livre) — UI passa a oferecer; pendura não exige diaFechamento e charge nasce pending (nunca auto-quita).
- `precoAcordado` já existe em Create/UpdateClienteProdutoDto — UI passa a enviar.

## Allowlist do APK (lei de 17/07 — endpoint novo sem isso = bloqueio client-side)
Adicionar em `NativeApiClient.kt isMobileEndpointAllowed`: POST rota/limpar-dia; GET/POST
rota-modelos; PATCH/DELETE rota-modelos/:id; PATCH produtos/:id. Conferir PATCH nucleo/contas/:id
(observações na edição do cliente). Rebuild APK obrigatório.

## Guardrails
- Migrations ADITIVAS; NUNCA `prisma format`; NUNCA `git add -A`; nada de branch.
- Billing/créditos: só Opus toca (W2). FinanceiroCharge do tenant: W1 pode (fiado), sem tocar créditos.
- Nada é removido do app: todo comportamento novo é opcional/toggle (decisão do dono, item 8).
