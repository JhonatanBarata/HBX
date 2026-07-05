# A3 — Clientes no app (skin entrega, cara de app) — RESULTADO

Sprint A3 do `PLANO-APPIFICACAO.md`: gerir clientes 100% dentro do app `/entrega`,
skin entrega (`ent-*`), sem jargão ERP e reusando os endpoints prontos. Feito no
**master** (sem branch/stash), NÃO publicado.

## Telas (todas no skin entrega, componentes `ent-*`)
Arquivo único da aba: `frontend/src/app/entrega/clientes/page.client.tsx`.

1. **Lista + busca** — cards grandes (`.ent-card`: nome + cidade/UF + chevron), campo
   de busca com debounce 300ms, estado vazio honesto ("Nenhum cliente ainda" /
   "Nada encontrado"), spinner no load, erro com "Tentar de novo". Barra de ação
   fixa com **"Novo cliente"**.
2. **Editor (criar/editar)** — 1 coluna, app-like, dentro da mesma casca (header +
   tab bar). Campos: **nome**, **WhatsApp**, **endereço**, **cidade/UF**,
   **"Salvar local daqui"** (botão que chama `getPosicaoUma()` →
   `navigator.geolocation` → guarda `lat/lng` e manda no payload), **forma de
   pagamento** (chips: Pergunta na hora / Na hora / Mensal / Fiado), **Recebe por**
   (pix|dinheiro, só quando "Na hora"), **Fecha todo dia** (dia do mês, só quando
   "Mensal"), toggle **"Entra na contabilidade"** (`.ent-switch`).
3. **Produtos do cliente** (dentro da ficha, só em edição — precisa do id da conta):
   lista dos vínculos (`ClienteProduto`) com qtd + frequência + preço + toggle
   Ativo/Pausado, e um bloco "Adicionar produto" (seletor do catálogo já filtrado
   pra não repetir vínculo, qtd, "a cada N dias", preço combinado opcional).

CSS novo (só tokens/classes) em `frontend/src/app/hbx-theme/entrega.css`:
`.ent-search .ent-input .ent-card* .ent-form .ent-field* .ent-section .ent-toggle
.ent-switch .ent-hint .ent-erro .ent-prod*` — `entrega.css` está na lista de
isentos do check-pele (arquivo de pele), TSX fica 100% limpo.

## Endpoints REUSADOS (zero endpoint novo de escrita)
Camada de dados: `frontend/src/app/entrega/clientes-api.ts` (wrappers sobre `apiFetch`).

| Ação | Endpoint | Origem |
|---|---|---|
| Listar/buscar clientes | `GET /nucleo/clientes?query=&pageSize=100` | N4 (existia) |
| Criar cliente + contato principal | `POST /nucleo/contas` (com `lat/lng`, `isCliente`, `tipo=pf`) | N4 (existia) |
| Editar dados da conta | `PATCH /nucleo/contas/:id` | N4 (existia) |
| Editar telefone do principal | `PATCH /nucleo/contatos/:id` | N4 (existia) |
| Forma de pagamento (contrato) | `PATCH /logistica/clientes/:id/financeiro` | M6 (existia, ADMIN) |
| Catálogo de produtos | `GET /logistica/produtos` | M2 (existia) |
| Produtos do cliente | `GET/POST/PATCH /logistica/cliente-produtos` | M2 (existia) |

## Ajuste ADITIVO de backend (mínimo, sem lógica de negócio/dinheiro)
**Motivo:** a ficha de EDIÇÃO precisa pré-preencher endereço + coordenada + telefone
+ os eixos do contrato financeiro de UM cliente, mas não havia GET de detalhe que
servisse PF. O `GET /nucleo/empresas/:id` existente TRAVA em `tipo='pj'` (retorna null
pra PF) e não devolve os campos financeiros. Um cliente cadastrado no app nasce PF.

**Adicionado (só leitura, company-scoped, 404 cross-tenant — R5):**
- `backend/src/nucleo/nucleo-cadastro.service.ts`: método `getCliente(companyId, id)`
  + interface `ClienteDetail`. Lê PF **ou** PJ; devolve endereço/coord + telefone do
  contato principal + `formaPagamento/metodoPadrao/contabilizar/diaFechamento`.
- `backend/src/nucleo/nucleo.controller.ts`: rota `GET /nucleo/clientes/:id`
  (JwtAuthGuard; `NotFoundException` se não existir/for de outro tenant).

Nenhuma escrita nova, nenhuma regra de cobrança/dinheiro tocada. Os DTOs de escrita
(`CreateContaDto` já aceitava `lat/lng`; `UpdateFinanceiroClienteDto`) NÃO precisaram
de mudança.

## Checks
- `cd backend && npm run build` → **VERDE** (tsc estrito + prisma generate).
- `cd frontend && npx tsc --noEmit` → **VERDE**.
- `cd frontend && npm run build` (Next) → **VERDE** (`/entrega/clientes` estática).
- `npx eslint` nos meus 2 arquivos front → **VERDE**.
- `check-pele.mjs` → **0 violação nos meus arquivos**. As violações que o script
  reporta são PRÉ-EXISTENTES em `hbx-theme/bot-builder.css`, `screens.css`,
  `whatsapp.css` (não tocados por mim) — build alheio já vermelho, reportado.

## Roteiro de QA (login exige credencial do dono — Chrome, localhost:3001)
Criar a "Dona Maria" INTEIRA sem sair do app:
1. Logar; ir em `/entrega` → aba **Clientes**.
2. Tocar **"Novo cliente"** → digitar nome "Dona Maria", WhatsApp, endereço,
   cidade/UF.
3. Tocar **"Salvar local daqui"** → aceitar o prompt de GPS do Chrome → botão vira
   "Local salvo ✓" (payload leva `lat/lng`).
4. Escolher forma de pagamento (ex.: "Mensal" → aparece "Fecha todo dia"; ou "Na
   hora" → aparece "Recebe por" pix/dinheiro). Deixar/alternar "Entra na
   contabilidade".
5. **"Cadastrar cliente"** → volta pra lista, "Dona Maria" aparece no card.
6. Tocar no card dela → editar → seção **Produtos** → "Adicionar produto" (escolher
   do catálogo, qtd 2, "a cada 3 dias", preço opcional) → "Adicionar produto" →
   aparece na lista de produtos → "Salvar".
7. Reabrir a ficha → confirmar que endereço, forma de pagamento e produto voltam
   pré-preenchidos (prova do `GET /nucleo/clientes/:id`).

Obs.: a forma de pagamento usa o endpoint `PATCH /logistica/clientes/:id/financeiro`
que é **ADMIN-only** — o dono loga como USERMASTER/ADMIN, então passa. Vendedor puro
receberia 403 nesse PATCH (o resto do cadastro é livre); se virar requisito, é ajuste
de guard, fora do escopo do A3.
