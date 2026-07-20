# W2 — App embutido: wizard "Leitura de Rota" (GPS) + allowlist Kotlin

Ler ANTES: `00-ORQUESTRACAO.md` (contrato de endpoints = LEI) e `SPEC-LEITURA-DE-ROTA.md` §1.1.
Arquivos: `EntregaShell/app/src/logistica/assets/app/app.js` (app do entregador),
`EntregaShell/app/src/main/assets/app/app.css`,
`EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/NativeApiClient.kt` (allowlist) +
`EntregaShell/app/src/test/java/br/com/hbxsystem/entrega/NativeApiClientPathPolicyTest.kt`.
NÃO tocar: backend, Webwhats, frontend web, billing.

## Contexto do app.js (espiar antes)
- IIFE única, `state` + `render()`; overlays via `state.modal`/`state.confirm`; ações por
  `data-action`; `H.api(path, {method, body})`; `H.vibrate`; `toast()`; `humanApiError` traduz
  `code` de erro em frase.
- Cadastro de cliente já existe (`new-client-form`, `useCurrentLocationForNewClient` ~l.779 com
  reverse Nominatim, `locateNewClientAddress` geocode). Clientes carregados em `state.clients`;
  produtos em `state.products`; produtos do cliente (`state.clientProducts`) têm `precoAcordado`.
- Voltar do Android: `window.HBXApp.handleBack` — TODO passo novo do wizard precisa entrar lá
  (fechar folha/voltar passo), senão o back quebra (memória L4B).
- Visual: classes `rp2-` do Montar rota são o padrão aprovado (botões grandes, CTA gradiente
  verde, tokens `var(--...)` do app.css). Público: gente madura, novata em app — 1 pergunta por
  tela, alvos ≥52px, ZERO digitação evitável.

## Fluxo (spec §1.1 — textos EXATOS)
1. **Entrada:** na tela Rota, botão grande **"Iniciar Leitura de Rota"** (visível quando NÃO há
   leitura ativa; posição: junto dos controles de montar/iniciar rota, sem atrapalhar rota ativa).
   Toque → `POST /logistica/leitura/iniciar { modo: 'LEITURA' }` → guarda `state.leitura`
   (sessão + paradas) e persiste id em localStorage p/ retomada; no boot, se
   `GET /logistica/leitura/atual` devolver sessão ABERTA modo LEITURA, retoma a faixa ativa.
2. **Estado ativo:** faixa fixa "Leitura de rota em andamento — N paradas registradas" + botões
   grandes **"Cadastrar Local"** e **"Finalizar Leitura de Rota"** (+ ação discreta de cancelar
   com confirm).
3. **Cadastrar Local:** captura IMEDIATA de GPS (padrão `currentPosition()` já existente, mas com
   enableHighAccuracy e timeout 15s) + timestamp → abre folha "Cliente novo ou existente?" — dois
   botões grandes **"Existente"** / **"Novo"**.
   - **Existente:** busca em `state.clients` (nome/telefone), ordenando por distância haversine da
     posição capturada (mais perto primeiro; destacar os ≤200m com a distância "35 m"). Sem GPS
     válido, lista alfabética com busca.
   - **Novo:** formulário mínimo NOME + TELEFONE (2 campos, mais nada). Endereço NÃO digitado:
     reverse geocode Nominatim da posição (reusar o padrão do `useCurrentLocationForNewClient`)
     preenche rua/bairro/cidade como sugestão EDITÁVEL (colapsada, "Endereço: Rua X, 12 — editar").
     O cliente será criado pelo BACKEND na parada (payload `clienteNovo` com lat/lng,
     `geoFonte: 'gps_cadastro'`) — o app NÃO chama /nucleo/contas neste fluxo.
4. **Confirmações em ordem (uma tela por vez):**
   a. **Telefone** — mostra o telefone grande + botões **"Confirmar"** / **"Corrigir"** (corrigir
      abre input tel). Cliente existente sem telefone: passo vira "Adicionar telefone?" opcional.
   b. **Produto** — botões grandes com nome + `unidade` visível, dos produtos ativos
      (`state.products`); stepper de quantidade −/+ (default 1, alvo grande). Permitir mais de um
      produto na parada (lista "adicionar outro produto" discreta) — payload `itens[]`.
   c. **Valor DO cliente** — campo numérico já preenchido pela hierarquia: `precoAcordado` do
      par cliente×produto (buscar nos dados do cliente se carregados) → senão `precoPadrao` do
      cliente → senão preço do catálogo. Se o usuário ALTERAR → manda
      `atualizarPrecoAcordado: true`.
5. **"Próximo"** → monta a parada `{ clientKey: id local único, capturadoEm, lat, lng, accuracy,
   customerProfileId | clienteNovo, itens, telefoneConfirmado, atualizarPrecoAcordado }`,
   **enfileira em localStorage** e tenta `POST /logistica/leitura/:id/parada`. OFFLINE-FIRST:
   falha de rede NÃO perde a parada — fica na fila, contador local incrementa, replay em ordem
   na próxima ação/online (clientKey garante idempotência; `window.addEventListener('online')` +
   tentativa antes de finalizar). Volta pra faixa ativa pronta pra próxima parada.
6. **Finalizar Leitura de Rota** → sincroniza fila pendente (se ainda houver pendência sem rede:
   avisar "N paradas aguardando rede" e NÃO finalizar) → `GET resumo` → tela timeline formato
   EXATO da spec:
   `08:30  Josefina — 2 galões — R$ 14,00` … `Total: N paradas · R$ XXX,XX`
   (usar `qtd × unidade` do produto; `H.money`). Cada linha com editar (qtd/valor → PATCH) e
   remover (DELETE, com confirm).
7. **Salvar:** pergunta **"Salvar Rotativo {dia}?"** (dia da semana de HOJE, ex. "Salvar Rotativo
   Segunda-Feira?") com botões grandes **"Sim"**/**"Não"**; "Não" → **"Selecione o dia da semana"**
   com 7 botões. Na MESMA folha, campo **"Nome da rota"** pré-preenchido com o label do dia
   escolhido ("Segunda-feira"); se já existir modelo com esse nome (checar em
   `GET /logistica/rota-modelos`, case-insensitive), pré-preencher "Segunda-feira 2" (3, 4…).
   Confirmar → `POST /logistica/leitura/:id/finalizar { nome, diaSemana }` → feedback **"Feito."**
   (toast/tela) e volta pra tela Rota. 409 `ROTA_NOME_DUPLICADO` → mensagem no campo, sem perder
   o estado.
8. **humanApiError:** mapear `ROTA_NOME_DUPLICADO` → "Já existe uma rota com esse nome.".

## Kotlin (allowlist — memória: sem isso o app recebe "não pertence")
Em `NativeApiClient.kt`, permitir: `POST logistica/leitura/iniciar`, `GET logistica/leitura/atual`,
`POST logistica/leitura/{id}/parada`, `GET logistica/leitura/{id}/resumo`,
`PATCH|DELETE logistica/leitura/{id}/parada/{paradaId}`, `POST logistica/leitura/{id}/finalizar`,
`POST logistica/leitura/{id}/cancelar` — no padrão dos vizinhos (segments). Atualizar
`NativeApiClientPathPolicyTest.kt` cobrindo cada rota nova (allow) + um negativo. Conferir também
`mobile-contract.js`/OperationalPolicy se interceptam paths `/logistica/*` (não devem reescrever
os novos).

## CSS
Classes novas prefixadas `lrt-` no app.css, SÓ tokens existentes (var(--surface)/--line/--accent/
--danger…); CTA verde = mesmo gradiente do `.route-transmux`/rp2. Sem hex novo.

## Checks (obrigatório)
`node --check` no app.js; teste Kotlin do path policy (`gradlew :app:testLogisticaDebugUnitTest`
ou o alvo usado nos PRs anteriores — espiar; se o sandbox barrar o gradlew, relatar em vez de
pular silenciosamente). NÃO commitar. Relatar arquivos tocados + o que ficou de fora.
