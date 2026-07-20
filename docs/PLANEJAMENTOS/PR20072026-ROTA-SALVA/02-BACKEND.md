# 02 — AGENT-BACKEND (Sonnet)

Escopo: SÓ `backend/**` e `scripts/ops/deploy-vps.js`. Leia `docs/Rules/BACKEND.md` antes.
NÃO toque em `EntregaShell/`. NÃO commite. Rode `cd backend && npm run typecheck` + os testes
dos arquivos tocados ao terminar.

## Tarefa 1 — F1: rota salva sem dia
Arquivo: `backend/src/logistica/dto/logistica-leitura.dto.ts` + `backend/src/logistica/logistica-leitura.service.ts`.
- `FinalizarLeituraDto.diaSemana`: hoje `@IsInt() @Min(1) @Max(7) diaSemana!: number`. Tornar
  **opcional**: `@IsOptional() @IsInt() @Min(1) @Max(7) diaSemana?: number | null`.
- `finalizar()` (logistica-leitura.service.ts ~313): hoje exige 1–7 e lança BadRequest. Aceitar
  ausente/null → grava `diaSemana: null` no `logisticaRotaModelo.create`. Quando `nome` vazio E
  sem dia, default do nome = `"Rota " + dd/mm` (data local); com dia mantém `diaLabel` como antes
  (compat com APK atual que ainda manda 1–7).
- Schema `LogisticaRotaModelo.diaSemana` JÁ é `Int?` — não mexer no schema.
- Teste: `logistica-leitura.service.test.ts` — adicionar caso "finaliza sem diaSemana → modelo com
  diaSemana null e nome Rota dd/mm"; manter o caso com dia passando.

## Tarefa 2 — F2a: ponte Leitura → cadastro (ClienteProduto SEM dia)
Arquivo: `backend/src/logistica/logistica-leitura.service.ts`.
- Hoje `upsertPrecoAcordado` só roda quando `atualizarPrecoAcordado` (preço difere do padrão), então
  produto digitado com preço normal MORRE com a sessão. Mudar: no `saveParada`/adicionar item da
  leitura, **sempre** garantir o vínculo `ClienteProduto` (produto + `qtdPadrao` + `precoAcordado`)
  de cada item, **sem dia** (`diasSemana:null`, `frequenciaDias:null`, `proximaData:null`).
  Renomear/estender o helper (ex.: `ensureVinculoSemDia`) mantendo o comportamento de preço.
- SEGURO por quê: `buscarVencidosPorCliente` (logistica-recorrencia.service.ts) filtra
  `OR:[{proximaData:{lte}}, {diasSemana:{not:null}}]` → vínculo sem dia é INVISÍVEL pra
  recorrência/"Por dia". CONFIRME essa query antes de codar (não quebrar isso).
- Idempotência: se já existe vínculo (companyId, customerProfileId, productId), atualiza preço/qtd;
  não duplica. Teste cobrindo: leitura de cliente sem vínculo → cria vínculo sem dia; com vínculo
  com dia → NÃO apaga o dia (só atualiza preço).

## Tarefa 3 — F2: aplicar rota salva roda a lista EXATA
Arquivos: `logistica-rota-modelo.service.ts` (+ controller + module se precisar).
- Novo `POST /logistica/rota-modelos/:id/gerar` body `{ date?: string }` (default hoje).
- Para cada parada do modelo (na ORDEM), materializa Entrega espelhando `gerarDia`
  (logistica-recorrencia.service.ts:463) — MESMO shape: contatoId resolvido, `localId`, escalares
  coerentes (quantidade/valor = soma), `status:'agendada'`, `origem:'avulsa'`, `cobrancaStatus:'pendente'`,
  `itens.create`. Itens vêm dos **ClienteProduto ATIVOS do cliente** (qtd=`qtdPadrao`,
  valor=`resolveValorUnit`), IGNORANDO dia/vencimento. Cliente sem vínculo ativo → Entrega SEM itens
  (valor 0). Reusa `resolveValorUnit`/`resolvePrincipalContatoId` já existentes.
- **Idempotência** idêntica ao gerarDia: já existe Entrega (companyId, customerProfileId, localId, dia)
  → REUSA o id (não duplica; claim de cobrança é por delivery). Rodar 2× no mesmo dia = idempotente.
- **NÃO** debita crédito na criação. **NÃO** avança `proximaData` de vínculo nenhum.
- Cliente de outra empresa / excluído → pula + adiciona string em `avisos[]`.
- Retorno `{ deliveryIds: [...na ordem do modelo], avisos: string[] }`.
- Company-scoped/fail-closed (id de outra empresa → 404, padrão do service).
- Testes: cliente com vínculo (entrega com itens do "de sempre"); sem vínculo (entrega vazia);
  já agendado hoje (reusa id, sem duplicar); 2× no mesmo dia; proximaData intocada.

## Tarefa 4 — F3.2: geocode reverso (GPS → endereço)
Arquivos: `logistica.controller.ts` + service; reusar `backend/src/nucleo/nucleo-geo.util.ts`.
- Novo `GET /logistica/geo/reverse?lat=&lng=` → `{ endereco, numero, bairro, cidade, uf, cep, fonte }`.
- Implementar `resolveServerReverse(lat,lng)` no MESMO estilo de `nucleo-geo.util.ts`: Nominatim
  `/reverse` server-side, User-Agent `HBX-Logistica/1.0 (contato@hbxsystem.com.br)`, timeout 2,5s,
  atrás da flag `HBX_GEO_SERVER_ENABLED` (default OFF → retorna `fonte:"nenhum"` com campos vazios,
  NUNCA 500). Cache em memória por célula ~30m (arredonda lat/lng a ~3 casas), TTL 24h, pra respeitar
  rate-limit 1req/s. Parseia `address` do Nominatim (road→endereco, house_number→numero,
  suburb/neighbourhood→bairro, city/town/village→cidade, state code→uf, postcode→cep).
- 200 sempre; validação de lat∈[-90,90], lng∈[-180,180] (fora → 400).
- Teste: com flag OFF retorna fonte nenhum; parser de um payload Nominatim fixture → campos certos.

## Tarefa 5 — F4: emitir version.json no publish
Arquivo: `scripts/ops/deploy-vps.js`.
- Onde já builda `assembleLogisticaRelease` e sobe o APK pra `HOSTINGER_ANDROID_LOGISTICA_APK_PATH`
  (~linha 160-181): DEPOIS de subir o APK, gerar e subir `version-logistica.json` no MESMO diretório
  público (`/var/www/hbx-downloads/version-logistica.json`).
- Conteúdo derivado do APK REAL buildado (não hardcode):
  - `versionCode`/`versionName`: extrair do APK (`aapt dump badging` OU ler de
    `EntregaShell/app/build.gradle.kts` flavor logistica) — escolha o método mais robusto no ambiente.
  - `sha256`: hash do arquivo APK.
  - `url`: URL pública do APK (deduza do mapeamento hbx-downloads que o script já usa; se não houver
    constante, use `${WEB_BASE_URL}/downloads/hbx-logistica.apk` e deixe TODO comentado pro dono
    conferir o nginx).
  - `obrigatoria: false`, `nota: ""`.
- NÃO quebrar o fluxo se algo falhar aqui: envolver em try/catch com log (o publish do APK não pode
  falhar por causa do JSON). Comentar que o dono confere a rota pública 1x.

## Entregar
Resumo do que mudou + resultado do typecheck + testes. Liste QUALQUER decisão que precise do dono
(ex.: URL pública real do hbx-downloads).
