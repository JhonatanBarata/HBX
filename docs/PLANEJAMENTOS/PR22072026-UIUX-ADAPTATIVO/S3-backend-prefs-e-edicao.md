# S3 — Backend: UI-prefs por usuário + edição inline do lead + canais no board

> Pode rodar em paralelo com S1/S2 (arquivos disjuntos). S4 depende desta.

## O que o front vai precisar (contrato)

1. **Layout de grade POR USUÁRIO** ("cada pessoa tem o seu"): colunas visíveis, ordem,
   larguras, ordenação — JSON por tela (`vendas-grid`, futuramente outras).
2. **Edição inline estilo Excel**: PATCH de campos simples do lead direto da célula.
3. **Colunas de canal/social** (6~7 ícones do Buscar) dentro do board de vendas.

## Tarefas

1. **`UiPreferencesService`** em `backend/src/auth/`, ESPELHANDO o padrão de
   `theme-preferences.service.ts` (coluna JSON no `User` via raw SQL + ensure de schema
   em runtime — NÃO criar migration Prisma; há drift conhecido no schema e o padrão da
   casa é runtime-ensure). Coluna nova: `uiPreferenceConfig` (JSON string,
   `Record<telaKey, unknown>` com teto de tamanho ~32KB e validação de shape).
   Endpoints no `profile.controller.ts`:
   - `GET /profile/ui-preferences?screen=vendas-grid` → config da tela (ou null).
   - `PATCH /profile/ui-preferences` body `{ screen, config }` (merge raso) e
     `{ screen, reset: true }` (apaga a chave → é o botão "Reiniciar layout").
   Escopo SÓ user — sem company/system (diferente do theme).
2. **PATCH inline do lead.** Levantar em `backend/src/vendas/` o que já existe de update
   (nextAction/retorno/valor/etapa já têm rotas próprias — reusar, não duplicar). Criar/
   completar UM endpoint `PATCH /vendas/leads/:id/inline` aceitando o subconjunto
   editável: `name, phone, email, segment, city, state, nextAction, shortNote, saleValue`
   (valor respeita `canViewValues`/LEI DO VENDEDOR — vendedor sem permissão não edita
   valor). Validação: mesmo saneamento dos endpoints atuais; telefone chega só dígitos.
   Multi-tenant: escopo por companyId + dono do card, como as rotas vizinhas.
3. **Canais no board.** Conferir o payload do board (`vendas.service.ts`): se a presença
   de canal (site/instagram/facebook/whatsapp/e-mail/maps — o que o Radar já sabe,
   `ChannelPresence`) não vem por card, incluir campo `channels` no card do board
   reaproveitando a MESMA fonte que o Buscar/LeadsClient usa. Sem chamada nova por linha —
   vem junto no board.
4. **Testes de fumaça** com curl (localhost): salvar/ler/resetar prefs; PATCH inline de
   nome e telefone; board devolvendo `channels`.

## NÃO-fazer

- NÃO criar migration Prisma (runtime-ensure, padrão theme-preferences).
- NÃO abrir edição de campos de máquina (score, engagement, status calculado, block).
- NÃO tocar em regras comerciais/planos.

## Checks

- `cd backend && npm run build` verde; curls de fumaça colados no RESULTADO.
- Prefs de um usuário NÃO vazam pra outro (testar com 2 logins de teste).

## Pronto-quando

Os 3 contratos acima respondem no localhost com prova por curl, build verde, zero
migration nova.
