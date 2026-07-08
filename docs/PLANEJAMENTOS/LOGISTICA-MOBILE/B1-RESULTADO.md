# B1 — RESULTADO (07/07, worker Sonnet)

## O que entrou

1. **Raio de chegada REAL no app do entregador** — `page.client.tsx` busca
   `GET /logistica/config` 1× no mount (best-effort; erro mantém o fallback 60m) e
   usa `raioChegadaM` no alvo do geofence (`useGeofence`). Antes o valor editado em
   Ajustes (M5) nunca era lido pelo app — `RAIO_CHEGADA_FALLBACK_M=60` hardcoded era
   sempre usado, o admin editava um número que não fazia NADA.

2. **GPS de ouro realimenta o cadastro do cliente** — `CustomerProfile.geoFonte`
   (novo, aditivo: `geocode` | `gps_cadastro` | `gps_entrega` | null):
   - Cadastro/edição do cliente (`/entrega/clientes`) manda a origem da coordenada
     junto: CEP→Nominatim = `geocode`; "Usar este local" (GPS) = `gps_cadastro`
     (decisão humana explícita — NUNCA sobrescrita depois).
   - `confirmarEntrega` (backend) recebe `accuracy` do GPS do celular (novo campo
     opcional no DTO/payload) e, quando `accuracy<=60m` **e** o cliente não está
     marcado `gps_cadastro`, atualiza `CustomerProfile.lat/lng` +
     `geoFonte='gps_entrega'` — best-effort, FORA da transação do confirmar (mesmo
     padrão do `persistirDesfecho` de F1/R4: falha aqui nunca reverte a entrega).
     Última entrega vence (a porta converge a cada confirmação).
   - Fila offline (M8) propaga `accuracy` de ponta a ponta — aditivo, itens já
     enfileirados sem esse campo continuam funcionando (`accuracy: undefined`).

## Blindagens preservadas (conferidas)

Idempotência do confirmar intacta (replay por key/status não re-executa nada,
incluindo a realimentação — ela só roda no caminho normal do Passo 1); F1 (recálculo
do valor pelo stepper) e o bloco de cobrança/WhatsApp de F1/N6 intocados; zero
loop/retry novo (a realimentação é 1 UPDATE best-effort, sem fila própria).

## Checks

`npx prisma validate` OK · `backend npm run build` OK · **testes logistica 55/55**
(52 pré-existentes + 3 novos B1: GPS preciso em cliente `geocode` atualiza,
`gps_cadastro` nunca é sobrescrito, sem `accuracy`/`accuracy>60m` não realimenta) ·
`frontend npx tsc --noEmit` OK · zero CSS tocado (check-pele não se aplica).

## Arquivos

- **Migration** (aditiva, à mão):
  `backend/prisma/migrations/20260707210000_customer_geo_fonte/migration.sql`
  (`CustomerProfile.geoFonte TEXT`). Aplicada no deploy pelo dono (padrão N1).
- **Backend**: `prisma/schema.prisma` (campo `geoFonte`); `logistica/dto/logistica.dto.ts`
  (`ConfirmarEntregaDto.accuracy`); `logistica/logistica.controller.ts` (propaga
  `accuracy`); `logistica/logistica.service.ts` (`ConfirmarGps.accuracy` +
  `realimentarCoordenadaCliente` + chamada pós-Passo1); `logistica/logistica.service.test.ts`
  (mock `customerProfile.update` + 3 testes B1); `nucleo/dto/nucleo.dto.ts`
  (`CreateContaDto.geoFonte`/`UpdateContaDto.geoFonte`, `IsIn(['geocode','gps_cadastro'])`);
  `nucleo/nucleo-cadastro.service.ts` (`createConta`/`updateConta`/`getCliente` leem e
  gravam `geoFonte`; helper `normalizeGeoFonteInput`).
- **Frontend**: `entrega/page.client.tsx` (raio real via `getConfig`, propaga
  `accuracy` no confirmar); `entrega/entrega-hooks.ts` (`getPosicaoUma` devolve
  `accuracy`); `entrega/entrega-api.ts` (`ConfirmarPayload.accuracy`);
  `entrega/entrega-offline.ts` (`PendenciaPayload.accuracy`);
  `entrega/clientes-api.ts` (`geoFonte` em `CriarClientePayload`/`EditarClientePayload`/
  `ClienteDetail`); `entrega/clientes/page.client.tsx` (estado `coordFonte`, setado nos
  3 caminhos de coordenada, enviado no salvar).

## Pendências (fora do B1)

- Migration aplicada no deploy (dono publica quando quiser).
- `geoFonte` não aparece na UI da ficha (só é lido/gravado) — se o dono quiser
  mostrar "pino confirmado por GPS na entrega" como selo de confiança, é frente nova.
