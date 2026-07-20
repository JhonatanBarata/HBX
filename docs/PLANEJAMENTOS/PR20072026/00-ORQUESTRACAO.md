# PR20072026 — Leitura de Rota + Criar Rota Manual

Spec do dono: `SPEC-LEITURA-DE-ROTA.md` (nesta pasta). Adições do dono por cima da spec:
1. **Criar rota manualmente** — mesmo cadastro, SEM usar localização, salvar no final.
2. **Nome da rota** — opcional, pré-preenchido com o dia da semana, **não pode repetir** (por empresa).

## Decisões fechadas com o dono (20/07 — NÃO reabrir)
- **Item 8 da spec (materializar entregas) = CORTADO.** Leitura NUNCA cria `Entrega`/`EntregaItem`.
  Só salva rota-modelo. Consequência: **PROIBIDO tocar** `logistica-route-billing*`, `credits`,
  tracking, Webwhats.
- **Manual só salva a rota** (nada de "registrar como entregas de hoje").

## Correção de arquitetura sobre a spec
A spec aponta o front em `frontend/src/app/entrega/` (web). **ERRADO para este trabalho**: o APK
carrega o app EMBUTIDO (`EntregaShell/app/src/logistica/assets/app/app.js` + CSS em
`EntregaShell/app/src/main/assets/app/app.css`). Todo o fluxo vai NO APP EMBUTIDO. O front web
`/entrega` NÃO é tocado neste PR.

## Desenho (contrato entre workers — seguir EXATAMENTE)
Um único conceito no backend: **sessão de leitura** (`modo: 'LEITURA' | 'MANUAL'`), paradas com
lat/lng **opcionais** (LEITURA manda GPS; MANUAL não manda). O modo manual do app usa os MESMOS
endpoints. Finalizar cria `LogisticaRotaModelo` (já existe, tem `nome` + `diaSemana` 1=seg..7=dom)
com paradas na ordem capturada.

### Endpoints novos (módulo `backend/src/logistica/`)
- `POST /logistica/leitura/iniciar` body `{ modo: 'LEITURA'|'MANUAL' }` → idempotente: se já há
  sessão ABERTA do usuário, retorna ela (com paradas). Resposta: `{ id, modo, startedAt, paradas: [...] }`.
- `GET /logistica/leitura/atual` → sessão ABERTA do usuário + paradas (ou `null`) — retomada após
  restart do app.
- `POST /logistica/leitura/:id/parada` — TRANSACIONAL e idempotente por `(sessaoId, clientKey)`:
  ```
  { clientKey: string,            // id gerado no app p/ replay offline
    capturadoEm: ISO, lat?, lng?, accuracy?,
    customerProfileId?: string,   // OU clienteNovo
    clienteNovo?: { nome, telefone?, cep?, endereco?, numero?, bairro?, cidade?, uf?, lat?, lng?, geoFonte? },
    localEntregaId?: string,
    itens: [{ productId: number, qtd: number, valorUnit: number }],
    telefoneConfirmado?: boolean,
    atualizarPrecoAcordado?: boolean }
  ```
  Cliente novo → cria `CustomerProfile` (`isCliente: true`) + telefone + `LocalEntrega` (se tiver
  lat/lng) na MESMA transação. `atualizarPrecoAcordado` → upsert `ClienteProduto.precoAcordado`
  por par cliente×produto. Resposta inclui a parada criada (com `customerProfileId` resolvido).
- `GET /logistica/leitura/:id/resumo` → `{ paradas: [{ id, ordem, hora, clienteNome, itens, subtotal }], total, count }`.
- `PATCH /logistica/leitura/:id/parada/:paradaId` (editar itens/qtd/valor) e `DELETE` (remover).
- `POST /logistica/leitura/:id/finalizar` body `{ nome?, diaSemana, ordemParadaIds?: string[] }`
  — `ordemParadaIds` (opcional, modo manual) reordena as paradas antes de salvar (ids ausentes
  mantêm posição relativa no fim; ids estranhos → 400). Valida ≥1 parada, valida
  nome único, cria `LogisticaRotaModelo` com `paradasJson` = `[{ customerProfileId, localId?, horaRef? }]`
  na ordem das paradas, marca sessão FINALIZADA. Se `nome` vazio → default = label do dia
  ("Segunda-feira"…"Domingo"), aplicando unicidade. Resposta: `{ modeloId, nome }`.
- `POST /logistica/leitura/:id/cancelar` → descarta a sessão.

### Nome único (rota-modelo)
`LogisticaRotaModeloService.create/update`: nome normalizado (trim), comparação case-insensitive
por empresa; conflito → `ConflictException` com `code: 'ROTA_NOME_DUPLICADO'`, mensagem
"Já existe uma rota com esse nome.". SEM constraint no banco (dados legados podem ter duplicata).

### Dia da semana
Convenção EXISTENTE do model: `diaSemana Int?` 1(seg)..7(dom). Labels:
Segunda-feira, Terça-feira, Quarta-feira, Quinta-feira, Sexta-feira, Sábado, Domingo.

## Workers (1 subagente por .md; app.js é sequencial W2→W3)
- `W1-BACKEND.md` — migration + service/controller/DTOs + nome único + testes.
- `W2-APP-LEITURA.md` — wizard GPS no app.js + fila offline + allowlist Kotlin + humanApiError.
- `W3-APP-MANUAL.md` — modo manual (mesma sessão, sem GPS) + salvar com nome + destaque do
  modelo do dia no Montar Rota (§1.2 da spec).

## Regras duras
- Trabalhar direto na branch atual (master). NÃO commitar — commit/publish é do orquestrador.
- Migration ADITIVA. Relations Prisma de verdade (FK sem relation já deu P2003 — memória 17/07).
- Copies de UI: usar EXATAMENTE os textos da spec/deste doc; zero textão inventado.
- app.css: tokens existentes (var(--surface)/--line/--accent…), padrão `rp2-`; sem hex novo.
- Checks mínimos por worker no próprio .md. Publish/APK/celular = orquestrador.
