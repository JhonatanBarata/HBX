# S2 — Importar sequência pronta (o furo mais caro)

**Dor:** o André já tem a ordem do sábado (95 paradas) — na rota salva e/ou numa Leitura de
Rota feita em campo. O backend já aceita a lista inteira (`PATCH logistica/agenda/dias/:dia/ordem`
com `planoIds[]`), o APK já usa. Falta o botão no site. Sem ele, ordenar é parada a parada.

## Fonte da sequência (já existe, não criar nada novo de captura)

`LogisticaRotaModelo.paradasJson` — array ordenado de
`{ customerProfileId, localId?, horaRef, itens }`. A Leitura de Rota, ao finalizar
(`logistica-leitura.service.ts` → `finalizar`), já cria um `LogisticaRotaModelo` com esse
formato. Ou seja: **fonte = qualquer rota salva da empresa** (inclui as nascidas da Leitura).

## Backend — 2 endpoints novos em `logistica-agenda.controller.ts` (+service)

Seguir o padrão dos endpoints vizinhos (guards, `@Controller('logistica/agenda')`).

1. `GET logistica/agenda/dias/:dia/sequencias`
   Lista as rotas salvas candidatas: `{ id, nome, diaSemana, totalParadas, updatedAt }` de
   `LogisticaRotaModelo` da empresa, ordenado por `updatedAt desc`. Não filtrar por dia
   (rota salva pode não ter dia — `diaSemana: null`), mas mandar o campo pro front destacar.

2. `GET logistica/agenda/dias/:dia/importar-preview?modeloId=...`
   Faz o matching NO SERVIDOR e devolve o preview, SEM ESCREVER NADA:
   - Carrega os planos do dia (mesma fonte do `getDay`) e o `paradasJson` do modelo.
   - Chave de match, nesta ordem: (a) `customerProfileId + localId` exatos;
     (b) `customerProfileId` sozinho **somente se** o cliente tem UM único plano no dia.
   - **Lei anti-erro-grave nº1:** cliente com 2+ planos no dia e parada sem `localId` que
     desempate = NÃO casa. Nunca chutar.
   - Resposta:
     ```
     {
       ordem: [{ planoId, clienteNome, posicao }],        // casados, na ordem do modelo
       foraDaSequencia: [{ planoId, clienteNome }],        // planos do dia sem parada no modelo → vão pro FIM, ordem relativa atual preservada
       semPlano: [{ clienteNome, endereco? }],             // paradas do modelo sem plano no dia → só informativo
       ambiguos: [{ clienteNome, motivo }],                // não casados por ambiguidade → também vão pro fim + listados
       aplicavel: boolean                                  // false se ordem.length === 0
     }
     ```
   - `ordem + foraDaSequencia + ambiguos` juntos = TODOS os planos do dia (a validação do
     `reorderDay` exige lista completa sem repetição).

A aplicação em si NÃO ganha endpoint novo: o front manda a lista completa pro
`PATCH dias/:dia/ordem` já existente (que passa pelo `writeRouteOrder` corrigido na S1).

## Front — `frontend/src/app/(app)/logistica/weekly-agenda.tsx` (+`weekly-agenda-api.ts`)

- Botão **"Importar sequência"** no cabeçalho do dia (junto das ações existentes do dia).
- Fluxo: clicar → modal lista as rotas salvas (destacar as do mesmo dia) → escolher →
  preview (3 blocos: “vai ficar nesta ordem”, “fica no fim (sem parada na sequência)”,
  “na sequência mas sem plano no dia — nada será criado”) → botão "Aplicar ordem" →
  `PATCH dias/:dia/ordem` com a lista completa → recarregar o dia + toast.
- Copy mínima (lei do dono): sem textão. Os 3 blocos acima já são a explicação.
- Visual 100% por token/classe do design system — zero cor solta (check-pele reprova).
- Estados: carregando skeleton; erro = toast humano; `aplicavel=false` → botão desabilitado.

## O que NÃO fazer

- NÃO criar plano automaticamente pra parada `semPlano` (isso é decisão comercial do cliente).
- NÃO escrever ordem no preview. Escrita SÓ no "Aplicar".
- NÃO tocar no APK.

## Prova (gate da sprint)

1. Builds verdes (backend + frontend).
2. Local, empresa de teste: criar dia com 6 planos; criar rota salva com 4 desses clientes em
   ordem invertida + 1 cliente sem plano. Importar → preview tem que mostrar 4 casados
   invertidos, 2 "fora da sequência" no fim, 1 "sem plano". Aplicar → GET do dia confirma a
   ordem exata.
3. Ambiguidade: cliente com 2 planos no dia (2 locais) e parada sem local → tem que cair em
   `ambiguos`, nunca casar sozinho.
4. Reaplicar a MESMA sequência 2× → segunda vez não muda nada e não dá erro.
5. F5 no meio do preview → nada foi escrito (preview é GET puro).
