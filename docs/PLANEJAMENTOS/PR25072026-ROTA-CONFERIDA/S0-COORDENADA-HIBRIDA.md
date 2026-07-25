# S0 — Coordenada híbrida no route-builder (fix cirúrgico)

Pré-requisito: ler `01-CONTRATO-WORKER.md` e `docs/Rules/FRONTEND.md`.

## O bug (real, confirmado)
`frontend/src/app/(app)/logistica/route-builder.tsx:139`:
```ts
lat: stop.local?.lat ?? stop.cliente.lat ?? null,
lng: stop.local?.lng ?? stop.cliente.lng ?? null,
```
Cada eixo resolve sozinho → pode sair lat do LOCAL com lng do PERFIL = pino no
meio do nada. O backend já tem a regra certa em
`backend/src/logistica/logistica-geo-fonte.util.ts` (`resolverCoordenadaMultilocal`):
**fonte inteira primeiro** (local só vale com lat E lng finitos; senão perfil
inteiro; senão null/null). Leia o comentário de topo desse util — ele explica
os dois modos de errar.

## O que fazer
1. Criar no frontend um helper puro espelhando a regra (mesma semântica, mesmo
   nome se possível: `resolverCoordenadaMultilocal`) — pode ser local ao
   `route-builder.tsx` ou num util compartilhado do módulo logística se já
   existir lugar natural. NÃO importar nada do backend.
2. Usar o helper na linha 139 (normalizeAgendaPreview).
3. Varrer o `frontend/src` INTEIRO pelo padrão eixo-separado
   (`grep -n "lat \?\?" e variantes`, `local?.lat ?? `, `cliente.lat ?? `) e
   corrigir TODAS as ocorrências do mesmo bug. Hoje o grep acusa 1; confirme.
4. NÃO tocar em nada além disso (nada de refactor de vizinhança).

## Aceite
- Impossível montar coordenada com eixos de fontes diferentes em qualquer ponto
  do frontend web.
- `cd frontend && npm run lint` limpo (sem violação NOVA).
- Relatório: ocorrências encontradas × corrigidas.
