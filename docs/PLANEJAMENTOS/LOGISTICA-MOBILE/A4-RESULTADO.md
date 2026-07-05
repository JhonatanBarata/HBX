# A4 — Produtos no app + Gestão do dia + Ajustes (skin entrega)

Sprint A4 do `PLANO-APPIFICACAO.md`. Preenchidas as cascas A2 e ligada a gestão
na aba Rota. Tudo no skin `entrega` (`ent-*`), 1 coluna, app-like, zero jargão
ERP. Reuso 100% dos endpoints existentes — ZERO endpoint novo. Trabalhado direto
no `master` (sem branch/stash), `git add` por caminho.

## Telas entregues

### `/entrega/produtos` (aba Produtos)
- Lista de produtos em cards (nome · unidade · preço · badge "Logística");
  arquivados aparecem apagados (`is-off`) no fim, com "· Inativo".
- Estado vazio honesto ("Nenhum produto ainda").
- "Novo produto" / tocar num card → editor 1 coluna: **nome · unidade (chips
  Galão | kg | Unidade) · preço · toggle "Usa na Logística"**. Criar / editar /
  **inativar** (arquivar) / **reativar** no próprio editor.

### `/entrega` (aba Rota, home) — faixa de gestão no topo (`GestaoDia`)
- Botão grande **"Gerar entregas de hoje"** (POST /gerar-dia) com feedback do nº
  criadas ("N entregas geradas" / "Já estava tudo gerado" / "Nada recorrente
  para hoje") que some sozinho em 4s.
- **Resumo do dia** como 3 stats do app: **Entregues · Recebido · A receber**,
  sempre `0` / `R$ 0,00` (B2 morto — sem travessão). Aditivo: se o GET falhar, os
  stats não aparecem (não polui). A faixa aparece mesmo sem entregas (é daqui que
  o dono materializa a rota).

### `/entrega/ajustes` (aba Ajustes)
- **Regras:** toggle "avisar o cliente na entrega" · editor da mensagem WhatsApp
  com chips de variáveis (`{saudacao} {cliente} {itens} {qtd} {produto}`) +
  **preview ao vivo** (mesma lógica de `renderTemplateAviso` do backend) ·
  raio de chegada (m) · velocidade média (km/h) · toggle "gerar entregas do dia
  sozinho". Todos gravam via PATCH /logistica/config (patch por campo, blur/toggle).
- **Fechar o mês:** POST /logistica/fechar-mes com `window.confirm` + feedback do
  nº de faturas.
- **Instalar o app:** QR do `/entrega` (gerador local `QrCanvas`, sem CDN) +
  "Copiar link do app".
- **Sair da conta:** `clearToken()` + volta ao `/login`.

`(app)/logistica` (dashboard/desktop) foi mantida intacta.

## Arquivos
- `frontend/src/app/entrega/produtos-api.ts` (novo) — wrappers `/products` (list/POST/PATCH/DELETE) + helpers.
- `frontend/src/app/entrega/gestao-api.ts` (novo) — wrappers gerar-dia / resumo-dia / fechar-mes / config.
- `frontend/src/app/entrega/GestaoDia.tsx` (novo) — faixa de gestão da home.
- `frontend/src/app/entrega/produtos/page.client.tsx` (preenchido) — lista + editor de produtos.
- `frontend/src/app/entrega/ajustes/page.client.tsx` (preenchido) — regras + fechar-mês + instalar + sair.
- `frontend/src/app/entrega/page.client.tsx` (editado) — `GestaoDia` no topo do `ViewHoje`.
- `frontend/src/app/hbx-theme/entrega.css` (editado) — classes A4 (`ent-gestao`, `ent-stats`, `ent-stat`, `ent-textarea`, `ent-preview`, `ent-qr`, `ent-sair`).

## Endpoints reusados (nenhum novo)
- Produtos: `GET /products` (lista tudo, inclui inativos), `POST /products`,
  `PATCH /products/:id`, `DELETE /products/:id` (archive). Catálogo do cliente (A3)
  segue em `GET /logistica/produtos` (só ativos + usaLogistica).
- Gestão: `POST /logistica/gerar-dia`, `GET /logistica/resumo-dia`,
  `POST /logistica/fechar-mes` (@Admin), `GET/PATCH /logistica/config` (PATCH @Admin).
- O dono do negócio de água loga como tenant-admin (USERMASTER) → passa nos @Admin.

## Checks
- `npx tsc --noEmit` → **VERDE** (0 erro).
- `cd frontend && npm run build` → **VERDE** (`✓ Compiled successfully`; rotas
  `/entrega/produtos` e `/entrega/ajustes` no output, estáticas).
- `check-pele` → **VERMELHO PRÉ-EXISTENTE, NÃO MEU**: só R1 em `whatsapp.css`,
  `screens.css`, `bot-builder.css` (arquivos que NÃO toquei e NÃO modificados no
  working tree). Meus arquivos (`entrega.css` + TSX A4) = 0 violação. `entrega.css`
  é isento no `CSS_ALLOWED`; TSX A4 sem hex/inline/arbitrary.

## Roteiro de QA (Chrome mobile, localhost:3001, logado como dono)
1. **Produtos:** abrir aba Produtos → "Novo produto" → nome "Galão 20L", unidade
   Galão, preço 12,00, toggle "Usa na Logística" ON → Cadastrar. Card aparece.
   Tocar no card → editar preço → Salvar. Tocar → "Inativar" → some pro fim
   apagado. Reabrir → "Reativar".
2. **Rota (home):** faixa no topo → "Gerar entregas de hoje" → feedback do nº;
   stats Entregues/Recebido/A receber mostram 0 / R$ 0,00 (nunca travessão).
3. **Ajustes:** editar a mensagem (inserir variáveis pelos chips) → preview muda
   ao vivo → "Salvar mensagem". Mexer raio/velocidade (blur salva). Toggle
   "avisar" e "gerar sozinho". "Fechar o mês" (confirm). QR do "Instalar o app" +
   copiar link. "Sair da conta" → volta ao /login.
4. Navegação por abas Rota · Clientes · Produtos · Ajustes fluida (alvos ≥52px).

## Vertical água dentro do app
Fecha 100%: cadastrar produto (Produtos) + cadastrar cliente com produtos/rota
(Clientes, A3) + gerar o dia e ver resumo (Rota) + regras/fechar-mês/instalar
(Ajustes) — tudo no skin entrega, sem sair pro dashboard ERP. Falta só o QA vivo
no Chrome/celular do dono (não rodei preview: exige backend + sessão logada).
