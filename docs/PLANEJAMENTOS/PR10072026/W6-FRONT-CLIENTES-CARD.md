# W6 — Front /entrega/clientes: card com pendências + débito + duplicidade, filtro semana, excluir admin

Frente do card de clientes (pedido do dono 10/07, sessão 2 — paralela a W1–W4). Leia `CONTRATOS.md` antes.
**Só tocar em `frontend/src/app/entrega/*`** e, se precisar de estilo novo, a folha do módulo em
`frontend/src/app/hbx-theme/` (classes `ent-*`; zero hex/inline — 5 Leis; `check-pele.mjs` reprova).
ATENÇÃO: W4 roda em paralelo e pode tocar `EntregaTabBar.tsx`/`ajustes/page.client.tsx` — nesses dois, NÃO mexer
(nada da nossa frente precisa deles). Nossa frente: `clientes/page.client.tsx`, `clientes-api.ts`, `entrega-api.ts`
(helpers), `icons.tsx` se precisar de ícone.

Contrato W5 (backend, mesma frente — pode aterrissar minutos depois; tipar e consumir fail-soft):
`GET /nucleo/clientes` items ganham `pendencias?: Array<'endereco'|'numero'|'gps'|'dia'|'whatsapp'>`,
`diasEntrega?: number[]` (ISO 1..7), `duplicataDe?: {id,nome}|null`, `debitoAtual?: number` (só com
moduloFinanceiroAtivo), `entregasCount?: number`. Campo ausente/undefined → comportamento atual (nunca quebrar).
`DELETE /nucleo/contas/:id` (novo consumo): 409 body `{error:'CLIENTE_COM_DEBITO', saldo}`.
`POST /nucleo/contas/:id/merge` body `{into, motivo?}` (existe; admin-only no backend).

## 1. Card da lista (page.client.tsx ~200)
- Linha 2: se `pendencias.length > 0` → chips vermelhos clicáveis, 1 linha (máx 2 visíveis + "+N"), labels:
  endereco→"Endereço", numero→"Número", gps→"Localização", dia→"Dia", whatsapp→"WhatsApp". Se `duplicataDe` →
  chip "Duplicidade" junto (também vermelho). Sem pendências/duplicata → cidade/UF como hoje (não mudar).
- Clique num chip de pendência abre o editor do cliente JÁ focado no campo: estender o `View` local
  (`{tela:'editor', id, focus?: 'endereco'|'numero'|'gps'|'dia'|'whatsapp'}`); no editor, focus/scroll:
  numero→`numeroRef` (já existe), endereco/whatsapp→ref novo no input, gps→scroll até o botão "Localização Atual",
  dia→scroll até a seção Produtos. Clique no chip NÃO pode disparar o onAbrir genérico do card 2x (stopPropagation).
- Linha 3: SÓ quando `cfg.moduloFinanceiroAtivo && debitoAtual !== undefined`:
  `Débitos atuais: R$ 0,00` (fmtMoney já existe). Valor > 0 → classe de alerta vermelha; 0 → tom neutro do card.
  Clique → abre o editor do cliente com scroll na seção Conta/extrato (a tela /entrega/financeiro do W4 ainda não
  existe nesta working tree; deixar o alvo do clique num helper único `abrirFinanceiroCliente(id)` p/ o W4 trocar
  depois por deep-link). Campo ausente → linha não renderiza.
- Vermelho/alerta: reutilizar token de danger existente da folha `ent-*`; se não houver, criar classe na folha do
  módulo (ex. `.ent-card-flag`) usando var de token — NUNCA hex solto.

## 2. Filtro da semana (lista)
- Entre a busca e a lista: 1 linha de balões (chips) — "Todos" + dias de `diasPermitidos(cfg.diasTrabalho)`
  (helper já existe em entrega-api.ts:234; cfg já é buscado na tela). Seleção única, default "Todos".
- Filtra por `diasEntrega.includes(diaSelecionado)`. Cliente sem dia → só em "Todos".
- `diasTrabalho` null → 7 balões (helper já resolve). Balões seguem padrão de chips existente do módulo.

## 3. Excluir cliente (editor)
- Botão "Excluir cliente" VERMELHO (padrão `ent-btn ent-btn--ghost ent-btn--danger`, igual produtos/page.client.tsx:285)
  logo ABAIXO do `<ProdutosDoCliente>` (page.client.tsx ~739), antes da actionbar Salvar. Só em modo edição
  (id != null) e SÓ para admin (item 5). Fluxo: toque → confirmação no padrão do módulo (2 toques, sem textão:
  "Excluir cliente?" + Excluir/Cancelar) → `DELETE /nucleo/contas/:id` → sucesso: volta pra lista e remove da
  listagem. 409 CLIENTE_COM_DEBITO → aviso inline vermelho: `Deve R$ {saldo} — quite ou zere antes de excluir`.
- Nova função em clientes-api.ts: `excluirCliente(id)` → DELETE `/nucleo/contas/${id}`.

## 4. Pop-up de duplicidade
- Clique no chip "Duplicidade" → sheet/modal no padrão de navegação já usado no módulo (CascaView/sheet igual às
  telas existentes), comparando os DOIS clientes lado a lado: nome, WhatsApp, endereço+número, cidade/UF,
  `entregasCount`, `debitoAtual` (dados: os dois itens já estão na lista carregada; detalhe extra se precisar via
  GET /nucleo/clientes/:id). Se o endpoint `GET /logistica/clientes/:id/entregas` já existir quando for testar
  (W2 está criando em paralelo), listar as últimas entregas de cada um; se 404 → mostrar só contagem (fail-soft).
- Ação (só admin): escolher qual MANTER → `POST /nucleo/contas/{perde}/merge` `{into: mantem}` → recarregar lista.
  Não-admin: vê a comparação, sem botões de merge.

## 5. Papel (admin) no módulo
- O módulo hoje não sabe role. Criar helper leve em entrega/ (ex. `entrega-user.ts`): fetch `GET /profile/current-user`
  com cache em módulo (mesma pegada do cache de cfg), decidir com `isTenantAdmin` de `frontend/src/lib/roles.ts`
  (pode importar de lib/). NÃO importar de `components/hbx/shell.tsx` (W3 mexe nele). Gate: botão Excluir + botões
  de merge. Falha do fetch → tratar como não-admin (fail-closed).

## Regras duras
- PT-BR mínimo em tela — SÓ os textos definidos aqui; zero frase inventada.
- NUNCA criar branch; editar direto na working tree (master). **NÃO commitar** — o orquestrador commita.
- `*/` em comentário CSS derruba o app; `.next` cacheia "Can't resolve" de arquivo novo (apagar `.next` se acontecer).

## Checks obrigatórios
- `cd frontend && npx tsc --noEmit` (erros fora de `app/entrega/*`: ignorar e anotar).
- `node scripts/check-pele.mjs` se existir (ou o script de lint de pele do package.json).
- Retornar JSON: `{status, filesTouched[], checks, pendencias[], notas[]}`.
