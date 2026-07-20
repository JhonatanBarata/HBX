# SPEC — Leitura de Rota (cadastrador de rota em campo) — HBX

> Documento autocontido para implementação. Contém contexto do sistema, modelos de dados existentes, fluxo UX exato e critérios de aceite. Não inventar estruturas novas quando uma existente cobre o caso.

## 0. Contexto do sistema (LER ANTES)

- **Stack:** Backend NestJS 10 + Prisma 5.22 + PostgreSQL (porta 3000). Frontend Next.js 16 / React 19 + Tailwind v4 (porta 3001 em dev). O app do entregador é o próprio frontend web rodando dentro de um WebView Android (`EntregaShell/`).
- **App do entregador (mobile-first):** `frontend/src/app/entrega/` — tab bar, GPS via `navigator.geolocation` (`entrega/entrega-hooks.ts`, `shell-bridge.ts`), geocoding gratuito via ViaCEP + Nominatim (`entrega/geo.ts`), suporte offline (`entrega/entrega-offline.ts`).
- **Painel admin de logística:** `frontend/src/app/(app)/logistica/`.
- **Backend do domínio:** `backend/src/logistica/` (logistica.service.ts, logistica-rota.service.ts, logistica-tracking.service.ts, logistica-operacao.service.ts, controller, DTOs).
- **Regra de estilo do frontend:** todo visual usa tokens/classes centrais de `frontend/src/app/hbx-theme/` — PROIBIDO cor/hex/borda/sombra/radius inline em tela (o lint `check-pele.mjs` reprova). Público-alvo: usuários maduros, novatos em app — botões grandes, um passo por tela, zero digitação evitável.

### Models Prisma relevantes (backend/prisma/schema.prisma — NÃO duplicar, REUSAR)

| Model | Papel | Campos-chave |
|---|---|---|
| `CustomerProfile` (~linha 1028) | Cliente/conta | endereço embutido, `lat`, `lng`, `geoFonte` (`geocode\|gps_cadastro\|gps_entrega`), `precoPadrao`, `isCliente` |
| `Contato` (~1163) | Pessoas de contato da conta | telefone |
| `LocalEntrega` (~1610) | MULTILOCAL: N endereços de entrega por conta | lat/lng/geoFonte próprios |
| `Product` (~4535) | Catálogo | `price` (preço padrão), `unidade` (ex.: "galão 20L") |
| `ClienteProduto` (~1574) | Vínculo cliente×produto + recorrência | `precoAcordado` (vence o preço do catálogo), agenda "N unidades a cada Z dias" |
| `Entrega` (~1192) | Entrega concreta | ciclo `agendada→em_rota→entregue\|cancelada`, `deliveredLat/Lng` |
| `EntregaItem` (~1641) | Itens da entrega | `valorUnit` (preço praticado naquela entrega) |
| `LogisticaRoute` (~1288) / `LogisticaRouteStop` (~1326) | Rota do dia por entregador, paradas ordenadas | `routeDate`, modo `ESSENTIAL\|TRACKED` |
| `LogisticaRotaModelo` (~1352) | **Rota salva/reaplicável (rota-modelo)** — é AQUI que a rota gravada vai parar | |
| `LogisticaTrackingSession/Point/Event` (~1370–1449) | Tracking GPS ao vivo | eventos `START\|PERIODIC\|ARRIVAL\|END` |
| `LogisticaConfig` (~1662) | Config por empresa | `raioChegadaM` (geofence), avisos WhatsApp |

### Hierarquia de preço (JÁ EXISTE — respeitar)
`Product.price` (catálogo) → `CustomerProfile.precoPadrao` (por cliente) → `ClienteProduto.precoAcordado` (por vínculo, vence os anteriores) → `EntregaItem.valorUnit` (o que foi praticado na entrega).

---

## 1. Feature: "Leitura de Rota"

Modo de **captura de rota em campo**: o entregador/dono percorre a rota real de um dia, e a cada parada registra cliente + produto + preço + horário. No fim, a sequência vira uma **rota-modelo** (`LogisticaRotaModelo`) vinculada a um dia da semana, reaplicável.

### 1.1 Fluxo UX (seguir EXATAMENTE esta ordem)

**Tela inicial do app entrega:** novo botão grande **"Iniciar Leitura de Rota"**.

1. **Iniciar** → cria sessão de leitura (pode reusar `LogisticaTrackingSession` com um tipo/flag novo, ex.: `modo: 'LEITURA'`). Começa a gravar. UI mostra estado ativo: "Leitura de rota em andamento — N paradas registradas".

2. **Chegou num local** → botão grande **"Cadastrar Local"**. Captura imediatamente: `timestamp` e `lat/lng` do GPS (accuracy incluída).

3. **Pergunta: "Cliente novo ou existente?"** (dois botões grandes)
   - **Existente:** busca por nome/telefone (autocomplete em `CustomerProfile` + `Contato`); sugerir primeiro clientes com `lat/lng` num raio de ~200m da posição atual (usar `raioChegadaM` da `LogisticaConfig` como referência de raio se fizer sentido).
   - **Novo:** formulário mínimo — **nome** e **telefone** apenas. Endereço: NÃO pedir digitação — usar lat/lng do GPS (`geoFonte: 'gps_cadastro'`) + reverse geocode Nominatim (já existe em `entrega/geo.ts`) para preencher rua/bairro como sugestão editável. Cria `CustomerProfile` (`isCliente: true`) + `LocalEntrega` com as coordenadas.

4. **Fixa o cliente e confirma, nesta ordem:**
   a. **Número/telefone** — mostra o telefone e pede confirmação (botões "Confirmar" / "Corrigir").
   b. **Produto** — lista de botões grandes com os produtos do catálogo (`Product` com `usaLogistica`), com a `unidade` visível ("Galão 20L"). Seleciona + quantidade (stepper −/+, default 1).
   c. **Valor DO cliente** — campo já preenchido com o preço resolvido pela hierarquia (se existe `ClienteProduto.precoAcordado`, mostrar esse; senão `precoPadrao` do cliente; senão `Product.price`). Se o usuário alterar, gravar/atualizar `ClienteProduto.precoAcordado` para esse par cliente×produto (é o preço combinado do cliente, não um valor avulso).

5. **Botão "Próximo"** → salva a parada na sessão (timestamp, lat/lng, clienteId, localEntregaId, produto(s), qtd, valor) e volta para o estado "em andamento", pronto para a próxima parada. Deve funcionar offline (fila local, padrão de `entrega/entrega-offline.ts`) — sincroniza quando houver rede.

6. **Fim do dia** → botão **"Finalizar Leitura de Rota"** → tela de **resumo em timeline**, formato exato:
   ```
   08:30  Josefina — 2 galões — R$ 14,00
   08:40  José — 1 galão — R$ 10,00
   ...
   Total: N paradas · R$ XXX,XX
   ```
   Cada linha editável (corrigir qtd/valor) e removível antes de salvar.

7. **"Salvar rota?"** →
   - Pergunta 1: **"Salvar Rotativo <dia da semana atual>?"** (ex.: capturou numa segunda → "Salvar Rotativo Segunda-Feira?") com **S/N** (botões grandes "Sim"/"Não").
     - **Sim** → salva como `LogisticaRotaModelo` vinculada àquele dia da semana → feedback **"Feito."**
     - **Não** → **"Selecione o dia da semana"** (7 botões) → salva no dia escolhido → **"Feito."**
   - Salvar = criar a rota-modelo com as paradas NA ORDEM capturada (a ordem/horário da leitura é a informação valiosa — preservar horários como referência da parada).
   - Se `LogisticaRotaModelo` não tiver campo de dia-da-semana hoje, adicionar (ex.: `diaSemana Int?` 0–6) via migration Prisma.

8. **Aproveitamento imediato (opcional, perguntar depois do salvar):** "Registrar essas entregas como realizadas hoje?" — se sim, materializar `Entrega` + `EntregaItem` (com `valorUnit` = valor confirmado, status `entregue`, `deliveredLat/Lng` da parada) para o dia da captura. Isso evita retrabalho: a leitura do dia também É o registro das vendas do dia.

### 1.2 Correção no fluxo existente: "Montar Rota"

Hoje a rota-modelo salva não aparece no lugar/hora certa do fluxo. Ajustar: na ação **"Montar Rota"** (montagem da rota do dia — painel `(app)/logistica/` e/ou app entrega, onde o dia é gerado via `POST /logistica/gerar-dia` e `logistica-rota.service.ts`), as rotas-modelo (`LogisticaRotaModelo`) do **dia da semana correspondente** devem ser oferecidas como ponto de partida: "Aplicar rota de Segunda-Feira (12 paradas)?" → aplica → gera as `Entrega`/`LogisticaRouteStop` do dia na ordem do modelo. Investigar onde a rota salva aparece hoje e mover para este momento do fluxo.

### 1.3 Backend — endpoints sugeridos (módulo `backend/src/logistica/`)

- `POST /logistica/leitura/iniciar` — abre sessão de leitura.
- `POST /logistica/leitura/:id/parada` — registra parada (payload: timestamp, lat, lng, accuracy, clienteId OU dados de cliente novo, localEntregaId?, itens [{productId, qtd, valorUnit}], telefoneConfirmado). Endpoint **composto e transacional**: se cliente novo, cria `CustomerProfile` + `Contato` + `LocalEntrega` + upsert de `ClienteProduto` na mesma transação.
- `GET /logistica/leitura/:id/resumo` — timeline para a tela de finalização.
- `PATCH /logistica/leitura/:id/parada/:paradaId` / `DELETE ...` — edição no resumo.
- `POST /logistica/leitura/:id/finalizar` — payload: `{ diaSemana, materializarEntregasHoje: boolean }` → cria `LogisticaRotaModelo` (+ `Entrega`s se solicitado).

Seguir os padrões do módulo (DTOs com class-validator, service + controller, multi-tenant por empresa como o resto do `logistica`).

### 1.4 Critérios de aceite

1. Fluxo completo operável com uma mão, sem digitar endereço em nenhum momento.
2. Cliente novo criado em campo aparece no CRM (`CustomerProfile`) com `geoFonte: 'gps_cadastro'` e coordenadas reais.
3. Valor alterado na captura persiste em `ClienteProduto.precoAcordado` e é o preço sugerido na próxima entrega daquele cliente.
4. Resumo final mostra horário real de cada parada no formato `HH:MM Nome — Nqtd unidade — R$ V,VV`.
5. "Salvar Rotativo <dia>? S" grava e responde "Feito."; "N" abre seletor de dia e depois "Feito.".
6. A rota salva aparece na ação "Montar Rota" do dia da semana correto e é aplicável em 1 toque.
7. Paradas registradas offline não se perdem (fila + sync).
8. Nenhum estilo inline novo — só tokens de `hbx-theme/` (lint `check-pele.mjs` passa).
9. `npm run typecheck`/build do backend e frontend passam.

### 1.5 Fora de escopo (NÃO fazer)

- Não mexer no `Webwhats/` nem em conexão de chips WhatsApp.
- Não criar model nova de "cliente/endereço/preço" — reusar as existentes listadas acima.
- Não trocar Nominatim/MapLibre por Google Maps.
- Não criar branch — trabalhar na branch indicada pelo dono.
