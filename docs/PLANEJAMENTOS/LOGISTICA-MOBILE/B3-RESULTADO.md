# B3 — Polimento de confiança: RESULTADO (08/07)

Worker Sonnet, direto no master (sem branch/worktree/stash). NÃO publicado. Os 3 alvos
do B3-POLIMENTO fechados; B1 (geoFonte) preservado intacto — nada de conflito.

## 1) Confirmação offline VISÍVEL
A fila IndexedDB (`entrega-offline.ts`) foi só LIDA (teto/backoff/idempotência INTACTOS).

- **`entrega-hooks.ts`** (`useOfflineSync`): expõe `entregaIdsPendentes: Set<string>`
  (ids com confirmação na fila: pending + needs_attention) e `sincronizados: number`
  (contador que sobe quando o `drain` de fundo envia ≥1 item). O Set mantém a MESMA
  referência quando não muda (`setsIguais`) — não refiltra o carrossel à toa a cada
  varredura de 20s.
- **`page.client.tsx`**:
  - `abertas` agora filtra `!sync.entregaIdsPendentes.has(p.id)` → a parada confirmada
    SOME do carrossel na hora (todo o resto — índice, geofence, dots — herda a lista
    filtrada). Fim da reconfirmação de parada já marcada.
  - Lista "Hoje": parada na fila ganha a tag **⇅** (`ent-row-tag.is-sync`) no lugar do
    ETA, com `title="Aguardando sincronizar"`.
  - Efeito novo: quando `sync.sincronizados` sobe (drain de FUNDO esvaziou a fila, ex.:
    volta de sinal), recarrega a rota — sem isso a parada reapareceria como "agendada"
    ao sair da fila enquanto o `rota` local ainda estava velho.
- **`entrega.css`**: regra `.ent-row-tag.is-sync { color: var(--ent-accent); }` (mesmo
  idioma visual do badge ⇅ do topo; token, zero hex/inline).

## 2) Data VIVA
- **`page.client.tsx`**: `DATA_HOJE` (const de módulo, congelava o dia) virou a função
  `formatarDataHoje()`; estado `dataHoje` recalculado em `focus` + `visibilitychange`
  (barato, sem interval). PWA aberto da noite pro dia mostra o dia certo ao voltar.
  `ViewHoje` recebe `data` por prop (3 usos de `DATA_HOJE` trocados).

## 3) Endereço ESTRUTURADO (aditivo, dupla escrita)
`CustomerProfile` ganhou `numero`/`bairro` em coluna própria — B1 (`geoFonte`) NÃO tocado.

- **Migration** `20260708000000_customer_endereco_partes` — `ADD COLUMN IF NOT EXISTS
  numero/bairro TEXT` (aditiva/idempotente, padrão N1/B1/F1; o dono aplica no deploy).
- **`schema.prisma`**: `numero String?` + `bairro String?` no `CustomerProfile`.
- **Backend** (`nucleo-cadastro.service.ts` + `dto/nucleo.dto.ts`): `getCliente` devolve
  as partes; `createConta`/`updateConta` aceitam e gravam (DUPLA ESCRITA — o texto
  `endereco` composto continua sendo gravado como hoje; rota/deep-link/telas antigas
  seguem lendo `endereco` inteiro). DTOs `CreateContaDto`/`UpdateContaDto` liberam
  `numero`(≤30)/`bairro`(≤120) no whitelist.
- **Front** (`clientes/page.client.tsx` + `clientes-api.ts`): helper `separarEndereco`
  (INVERSO exato de `comporEndereco`) reconstrói rua/numero/bairro no load a partir das
  colunas novas (fallback ao texto inteiro quando legado, sem colunas). Save manda as
  partes + o texto composto. **Fim da degradação** ("Rua X, 123 - Centro, 456").

## Checks (números)
- `backend`: `npx prisma validate` ✅ · `npm run build` (tsc) ✅ ·
  `node --test dist/logistica/*.test.js` → **59/59** (0 fail) ·
  `node --test dist/nucleo/*.test.js` → **33/33** (0 fail).
- `frontend`: `npx tsc --noEmit` → **exit 0** ·
  `node scripts/check-pele.mjs` → catraca 504/495 (JÁ estourada por arquivos do DONO —
  master/gerencial/relatorios/vendas/agenda). Meus arquivos NÃO somam violação: os
  únicos `style=` em `entrega/page.client.tsx` são os 3 dinâmicos pré-existentes
  (2 barras de progresso + transform do carrossel); os demais tocados têm zero inline/hex.

## Guardrails respeitados
- Fila offline (teto/backoff/idempotência) só LIDA, nunca alterada.
- Nada de WhatsApp/cobrança/flags/motor de rota.
- Commit local só dos meus arquivos; NÃO publicado.
