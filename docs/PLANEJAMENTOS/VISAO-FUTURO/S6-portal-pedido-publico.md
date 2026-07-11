# S6 — PORTAL PÚBLICO DE PEDIDO v1 (DORMENTE — flag OFF)

> Frente VISAO-FUTURO, 11/07/2026. O anti-iFood da distribuidora: link próprio "peça seu galão",
> sem app, sem taxa. Pedido cai como entrega AGENDADA pendente na operação. v1 enxuto e blindado.

## Desenho
- URL pública: `/pedido/<token>` — token OPACO rotacionável por empresa (NUNCA slug/ID — padrão
  `websiteCaptureToken`, ver `backend/src/website/website.service.ts:867,884` e runtime :108).
- Front: página nova FORA do grupo `(app)` (padrão do `/entrega`: `frontend/src/app/entrega/layout.tsx`
  fora do shell): `frontend/src/app/pedido/[token]/` — mobile-first, skin própria enxuta usando tokens
  centrais (check-pele!): nome da empresa, lista de produtos (nome/preço/unidade), quantidade,
  nome + telefone + endereço (ou escolher local salvo? NÃO — v1 sem login não tem local salvo),
  botão "Pedir". Confirmação simples na tela. PT-BR, zero textão.
- Backend: controller público NOVO `backend/src/logistica/logistica-pedido-publico.controller.ts`
  — molde EXATO: `backend/src/website/website-lead-capture.controller.ts` (`@Controller('public/...')`,
  `@Post(':token')`, `@HttpCode(200)`, `@Throttle({limit:5,ttl:60})`, honeypot `_hp`, resposta genérica).
  Registrar em `logistica.module.ts` (NÃO app.module.ts).
  - `GET /public/pedido/:token` → { empresaNome, produtos: [id, nome, preco, unidade] } (só produtos
    `usaLogistica`; preço de exibição — o preço REAL é resolvido server-side no POST, regra de ouro
    logistica.service.ts:511-517).
  - `POST /public/pedido/:token` → { itens: [{productId, quantidade}], nome, telefone, endereco, obs? , _hp }.
    Fluxo: valida token+flag → acha/cria `CustomerProfile` por `[companyId, phoneNormalized]` (unique
    existente schema:1010; novo cliente nasce `isLead:true`/`isCliente:false` com endereço informado) →
    cria `Entrega` status `agendada` para HOJE (ou próximo dia de trabalho — reusar helper de diasTrabalho
    se existir no service; senão hoje) com `EntregaItem`s e preço do servidor; `rotaOrdem` null (cai no
    fim, o replanejar existente pega). Anotar origem em campo de observação EXISTENTE da entrega
    (SEM campo novo; se Entrega não tiver obs, prefixar na observação do item ou usar receiptMethod? —
    NÃO: conferir o model; existe `Entrega.observacao`? Se não existir NENHUM campo de texto livre,
    aceitar sem anotação de origem no v1 e registrar isso no relatório).
- **TenantContext**: rota pública não tem req.user — o companyId vem do token; passar explicitamente
  aos serviços/queries (padrão do lead-capture; conferir como ele injeta o tenant fora do interceptor).
- Token: coluna nova `LogisticaConfig.pedidoPublicoToken String? @unique` via **migration FORMAL**
  + método `ensure/rotate` no `logistica-config.service` (molde: ensureWebsiteCaptureToken).
  ⚠️ S5 pode estar editando a região Company do schema.prisma em paralelo — regiões distantes;
  se Edit falhar por mudança concorrente, RELEIA e reaplique.

## Flag e anti-spam (blindagem)
- Flag global `HBX_PEDIDO_PUBLICO_ENABLED` default OFF (`logistica-pedido.flags.ts`): OFF → GET e POST
  respondem 404 seco (rota "não existe"); front público mostra estado vazio neutro se API 404.
- Por tenant: `LogisticaConfig.pedidoPublicoAtivo Boolean @default(false)` — os DOIS precisam estar ON.
- `@Throttle` apertado (5/min por IP) + honeypot `_hp` (preenchido → 200 fake sem efeito, molde lead-capture)
  + teto de pedidos/dia por empresa (ex.: 100, em memória) + teto de itens por pedido (ex.: 20) +
  quantidade máx por item (ex.: 50) + validação de telefone BR normalizável (rejeita lixo com 200 genérico? NÃO —
  400 de validação normal é ok em campo obrigatório; honeypot é que finge sucesso).
- Cliente NOVO criado como lead + entrega `agendada` é visível na operação normal — a "aprovação" v1 é
  o operador ver a entrega do dia (sem workflow novo de aprovação).
- UI nos Ajustes da entrega (`frontend/src/app/entrega/ajustes/page.client.tsx` — ⚠️ S3 acabou de mexer;
  puxar estado atual): card "Pedidos pelo link" admin-only: toggle + link com copiar + botão "gerar novo link"
  (rotate). Aparece só se config derivado disser que a feature global está ON (padrão S2/S3).

## O que NÃO fazer
- NÃO expor preço acordado por cliente (só preço de catálogo no GET público).
- NÃO criar model novo de "PedidoPublico" (v1 usa Entrega direto; se ficar claro no meio que Entrega
  não comporta, PARE e registre no relatório em vez de inventar migration grande).
- NÃO mexer em CORS/main.ts (mesmo domínio do app; portal externo é fase 2).
- NÃO tocar: app.module.ts, shell.tsx, globals.css, financeiro-tenant/, auth/* e credits/* (S5 está lá).
- NÃO commitar; NÃO criar branch.

## Testes (node:test co-locado)
`logistica-pedido-publico.test.ts`: (1) flag OFF → 404; (2) tenant OFF → 404; (3) honeypot → 200 sem efeito;
(4) telefone repetido reusa CustomerProfile (não duplica); (5) preço vem do servidor (payload com preço é ignorado);
(6) teto de quantidade respeitado.

## Critérios de aceite
1. Sem a env: deploy 100% inerte — rota pública 404, zero UI nova visível.
2. Migration é arquivo; tsc backend verde; testes verdes; front lint + check-pele verdes.
3. Fluxo manual (quando o master ativar): abrir /pedido/<token> no celular → pedir 2 itens → entrega
   aparece na rota do dia da empresa com cliente novo criado.
