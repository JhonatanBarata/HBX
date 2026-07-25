# S7 — Saúde da base (painel web da véspera)

Pré-requisito: `01-CONTRATO-WORKER.md`, `docs/Rules/FRONTEND.md` (5 Leis — todo
visual nasce em token; check-pele reprova hex/inline) e `docs/Rules/BACKEND.md`.
Depende SÓ do S3 (reusa o validador). Roda em paralelo com S4–S6 — **NÃO tocar
em `app.js` do APK nem nos arquivos que S4–S6 editam** (`logistica-rota.service.ts`
é da S1/S2/S3 — aqui só IMPORTAR de `logistica-conferencia.util.ts`).

## Tese
O APK é o ÚLTIMO filtro; endereço se arruma na véspera, no PC. O painel
transforma a acusação ("2 pendências na sua rota") em serviço ("154 clientes da
sua base precisam de pino — 7 se resolvem sozinhos na próxima entrega").

## Entregável backend
1. `GET /logistica/base-saude` — read-only, computa pro tenant INTEIRO
   (perfis `isCliente` ativos + seus LocalEntrega):
```jsonc
{
  "totalClientes": 248,
  "verdes": 94, "amarelos": 62, "vermelhos": 92,
  "resolvemSozinhos": 7,   // sem pino MAS com recorrência/entrega futura → 1ª entrega grava a porta
  "percentVerde": 37.9,
  "clientes": [{ "id": ..., "nome": "...", "semaforo": "...", "motivos": [ ... ],
                  "localId": ..., "localApelido": ... }]
}
```
   - Semáforo REUSA `logistica-conferencia.util.ts` (S3) — regras que fazem
     sentido base-a-base: `sem_pino`, `pino_compartilhado` (célula ~4 casas na
     BASE inteira — é aqui que os 154/248 da empresa 41 aparecem),
     `geocode_nao_provado_em_campo`, `nunca_entregue`. As regras de ROTA
     (`fora_do_casulo`, `perna_outlier`) NÃO se aplicam aqui.
   - 1 query agregada por tabela, paginação/take sane (base pode ter milhares);
     NADA de N+1. Lembrar da lição pool-storm: count barato, sem count vivo em
     tabela gigante.
2. Teste unit do agregado (mock Prisma) + invariante read-only.

## Entregável frontend web
1. Página/aba no módulo logística (investigar navegação existente em
   `frontend/src/app/(app)/logistica/` e encaixar onde é natural — provavelmente
   junto de clientes/agenda; seguir o padrão de abas existente).
2. Topo: os 4 números grandes + % verde (stat tiles no padrão visual existente
   do módulo — reusar classes/tokens, NUNCA criar cor nova).
3. Lista com filtro por semáforo; cada linha → motivos em linguagem humana +
   link pro cadastro do cliente (edição JÁ existente — só linkar, não criar
   editor novo).
4. Destaque honesto: "N se resolvem sozinhos na próxima entrega" (o GPS de ouro
   da 1ª entrega grava a porta — `realimentarCoordenadaPorta`).
5. SEM histórico semanal nesta sprint (sem tabela nova, sem migration) — a
   métrica anti-enfeite (% verde semana a semana) fica pra quando houver
   storage; deixar o % atual visível já cobra evolução.

## Aceite
- `cd backend && npm run build` + testes verdes.
- `cd frontend && npm run lint` sem violação nova (check-pele).
- Relatório: rota da página, prints descritos, custo das queries (explain
  mental: quais índices usa).
