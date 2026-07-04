# M8 — Offline-first (RESULTADO)

> Sprint M8 do `PLANO.md`: a entrega funciona SEM sinal. Fila IndexedDB de
> confirmações + sync com teto/backoff + SW cacheia o GET da rota +
> `confirmar` idempotente por `idempotencyKey`. Executado LOCAL no `master`,
> NÃO publicado. Flags de efeito (WhatsApp/charge) seguem atrás de
> `HBX_LOGISTICA_ENABLED` (default OFF) — M8 não liga nada disso.

## O que entrou

### Frontend (`/entrega`, skin entrega)
- **Fila IndexedDB** (`entrega-offline.ts`, novo): store `pendencias` no DB
  `hbx-entrega`, keyPath = `idempotencyKey`. `enqueue/listAll/countPending/drain`.
  Ao confirmar, a UI gera um `idempotencyKey` (uuid via `crypto.randomUUID`, com
  fallback) e enfileira `{entregaId, payload(lat/lng/receiptMethod/itens), ts,
  attempts, nextTryAt, status}`. Sem IndexedDB (SSR/browser antigo) → no-op gracioso.
- **Sync com FREIO DURO** (`useOfflineSync` em `entrega-hooks.ts`): 1 passada por
  gatilho — evento `online` + intervalo de **20s** + logo após enfileirar. NUNCA
  loop apertado. O `drain`:
  - **TETO de tentativas = `MAX_ATTEMPTS = 5`** (em `entrega-offline.ts`). Ao
    estourar, o item vira `status: 'needs_attention'` e **PARA de tentar** (não
    martela o servidor). Onde: `drain()` → `estourou = attempts >= MAX_ATTEMPTS`.
  - **backoff exponencial** por item entre tentativas: `5s, 10s, 20s, 40s, 80s…`
    travado em `MAX_BACKOFF_MS = 5min` (`nextTryAt` guarda o próximo horário).
  - guarda `rodando` (ref) evita 2 drains concorrentes (online + timer juntos).
  - cada envio manda o `idempotencyKey` ao servidor (a idempotência dura mora lá).
- **Indicador de pendências** no header (`page.client.tsx`): badge `⇅ N` (ícone +
  número, sem texto — Lei nº1). Vira alerta (`.is-attention`, cor `--ent-danger`)
  quando algum item estourou o teto. CSS novo em `entrega.css` (`.ent-head-actions`,
  `.ent-pendencias`) — só tokens, `check-pele` verde.
- **`onEntregue` agora é offline-first**: enfileira (gera key) + tenta enviar já;
  online some da fila na hora, offline fica e sincroniza ao reconectar. Erro de rede
  no `carregar()` pós-confirm NÃO reverte a confirmação enfileirada.

### Service Worker (`frontend/public/hbx-sw.js`)
- **stale-while-revalidate SÓ do GET da rota do dia** (`…/logistica/rota`): responde
  o cache na hora e revalida em background; sem sinal serve o cache; sem cache e sem
  sinal o fetch propaga o erro (UI offline honesta). Cache nomeado `hbx-rota-v1`;
  `activate` limpa versões antigas.
- **ADITIVO E CIRÚRGICO**: `isRotaRequest()` casa APENAS o GET cujo path termina em
  `/logistica/rota` (cobre o proxy `/hbx/api/...` e a chamada direta), ignora a
  querystring. TODO O RESTO continua passando direto pra rede (mesmo comportamento
  de antes: nada de página/asset em cache → sem risco de ressuscitar tela velha).

### Backend (idempotência dura)
- **`confirmarEntrega` idempotente por `idempotencyKey`** (`logistica.service.ts`):
  - DTO/controller aceitam `idempotencyKey?` (opcional, ≤80).
  - REPLAY: se a entrega já tem a MESMA key gravada → devolve o desfecho anterior
    (`replayed: true`) SEM re-executar status/WhatsApp/charge.
  - A key é gravada na `Entrega.idempotencyKey` (unique) DENTRO da transação do
    Passo 1 (junto com status/GPS), só na 1ª confirmação.
  - Corrida de reentregas com a MESMA key: a unique (P2002) barra o 2º INSERT →
    tratado como replay (relê o desfecho persistido, não re-executa efeito).
  - Casa com a idempotência de status já existente (`jaEntregue` barra o Passo 2);
    sem key = comportamento clássico.

## Checks (todos VERDES)
- Backend: `npm run build` ✅ · `npx prisma validate` ✅ (schema válido) ·
  `node --test dist/logistica/logistica.service.test.js` → **22/22 pass** (20
  pré-existentes + 2 novos M8).
- Frontend: `npm run build` ✅ (Compiled successfully, `/entrega` estático) ·
  `npx tsc --noEmit` ✅ (exit 0) · `check-pele` → **0 violação nos meus arquivos**
  (as violações listadas são pré-existentes em `bot-builder.css`/`screens.css`/
  `whatsapp.css`, fora do escopo do M8).

### Teste automatizado da idempotência (prova pedida)
`M8 (a)`: confirmar 2× com a MESMA `idempotencyKey` → **WhatsApp 1× + charge 1×**;
o 2º confirma vira `replayed: true`, `queueOutboundForCompany` NÃO é chamado de novo
e nenhum charge novo é criado (mesmo forçando a corrida que reabre status/cobrança).
Resultado idêntico ao original. `M8 (b)`: sem key → idempotência clássica por status
segue intacta (2ª confirmação já-entregue não redispara nada).

## Roteiro de QA — modo avião (manual)
1. Logar no app em `http://localhost:3001/entrega` no Chrome (sessão do dashboard).
   Ter uma rota do dia com ≥3 paradas abertas (gerar via `/logistica` se preciso).
2. **Cachear a rota**: abrir "Hoje" com sinal 1× (o SW guarda o GET `/logistica/rota`).
3. DevTools → Network → **Offline** (ou modo avião). Recarregar `/entrega`:
   - "Hoje" ainda carrega (SW serve o cache da rota).
4. Confirmar **3 entregas** (Cheguei → Entregue) OFFLINE:
   - o badge `⇅` no header sobe pra 1, 2, 3 (confirmações na fila).
   - as paradas somem da lista otimista (sheet fecha; o sync fecha no servidor depois).
5. Network → **Online** (ou sair do modo avião). Em até ~20s (ou já no evento
   `online`) o badge zera: as 3 confirmações drenam.
6. Conferir no backend (com `HBX_LOGISTICA_ENABLED=1`, chip DESCARTÁVEL, ver M9):
   cada entrega tem **1** WhatsApp e **1** charge — **sem duplicação** (idempotência
   por key). Reabrir/reenviar a mesma confirmação NÃO dispara efeito 2×.
7. **Teto**: para provar o freio, deixar offline e forçar erro persistente (ex.: token
   inválido) → após 5 tentativas o item vira `needs_attention`, o badge fica vermelho
   (`.is-attention`) e o app **PARA de tentar** aquele item (não martela o servidor).

## Não feito / fora do escopo
- Não publicado (regra do sprint). Migration da coluna `idempotencyKey` já existe no
  schema (`Entrega.idempotencyKey String? @unique`) desde o M2 — aplicar no deploy.
- Cancelamento ("Não entregue") NÃO entra na fila offline (M8 é sobre confirmações;
  cancelar segue online direto, como antes).
- UI de "resolver" um item `needs_attention` (reenfileirar manual) fica pra M9/QA de
  campo — hoje ele só sinaliza (badge vermelho) e para de tentar.
