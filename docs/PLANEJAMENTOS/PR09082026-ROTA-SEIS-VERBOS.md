# PR09082026 — ROTA: SEIS VERBOS, UMA LISTA SÓ

> Ordem do dono (09/08): "é rota. fazer a rota, limpar a rota, usar a rota,
> fechar a rota, faturamento, histórico. Cabou. Não tem que ter lista nenhuma
> além disso — plano destrutivo pra arrancar o resto."

## 1. O SINTOMA (por que as telas não batem)

Toda divergência recente é a MESMA doença: **a agenda da empresa existe em 4
cópias e a ordem da rota em 4 números**, cada tela lê uma cópia diferente.

- "52 paradas" com rota cancelada → tela lia a AGENDA vestida de rota.
- "107 paradas" na lista e "Sem paradas hoje" na barra → uma lê `Entrega`, outra lê `rotaOrdem`.
- Montagem não via entrega avulsa → `dia-preview` lê a AGENDA, não `Entrega`.
- Modelo `cms0xmqd0...` (empresa 41): **JSON diz 9 paradas, tabela diz 7** — dessincronizado HOJE, em produção.

Enquanto houver 2+ listas respondendo à mesma pergunta, isso volta a cada feature.

## 2. O QUE FOI MEDIDO EM PRODUÇÃO (09/08, hbx_prod)

### 2a. A triplicação da agenda (os números são idênticos porque É a mesma lista)

| Tabela | Linhas | O que é |
|---|---|---|
| `LogisticaPlanoEntrega` / `Item` | **714 / 716** | Agenda V2 — a fonte real |
| `LogisticaRotaModeloParada` / `Item` | **714 / 716** | CÓPIA relacional dentro do modelo de rota |
| `ClienteProduto` | **703** | Agenda V1 legada, espelhada da V2 pelo `logistica-agenda-espelho.util.ts` |
| `LogisticaRotaModelo.paradasJson` | 28 arrays | 4ª cópia, "espelho de compatibilidade" JSON |

**As 9 empresas com `LogisticaConfig` têm `agendaV2Ativa = true`. NINGUÉM roda
o caminho V1.** O gerador V1 (`logistica-occurrence.service.ts`, 725 linhas), o
chaveador (`logistica-recorrencia-occurrence.service.ts`) e o espelho são ramo
morto mantido vivo — e o espelho é a máquina de dessincronizar.

### 2b. Modelos de rota

- 19 SEMANAL: vivem no JSON **e** na tabela (1 já divergente: 9≠7).
- 9 LIVRE: vivem **só** no JSON (0 linhas relacionais) — metade do sistema num formato, metade no outro.

### 2c. Tabelas MORTAS (produção, hoje)

| Tabela | Linhas | Veredito |
|---|---|---|
| `LogisticaLeituraSessao` / `Parada` | 17 / **0** — **todas as 17 CANCELADAS** | Leitura de Rota nunca foi terminada por ninguém |
| `LogisticaImportacaoLote` / `Item` | 0 / 0 | Tela `/logistica/importar` nunca usada |
| `LogisticaCargaDia` / `Item` | 0 / 0 | Balcão B4, publicada 04/08, sem uso |
| `LogisticaRotaIndicada` | 4 | "Rota Pronta" usada 4× na vida |
| `zz_backup_cp48_*` / `zz_backup_planos48_*` | 246 / 245 | Backup da faxina de 09/08 |

### 2d. O que está VIVO e é dinheiro/história (não se toca)

`Entrega` 5.054 · `EntregaItem` 5.038 · `LogisticaAgendaEvento` 4.448 ·
`LogisticaRouteStop` 2.000 · claims (Tracked 283 / Essential 240) ·
`ClienteHistorico` 50 · tracking (sessões/pontos/eventos) · `ProspectoRota` 32.

## 3. A ESPINHA — os 6 verbos e a ÚNICA tabela de cada um

| Verbo | Tabela dona | Regra |
|---|---|---|
| **Agendar** (quem leva o quê, que dia) | `LogisticaPlanoEntrega` + `Item` | Única agenda. Ponto. |
| **Fazer a rota** | `Entrega` (+`rotaOrdem`) | `materializeForRoute` é o ÚNICO gerador agenda→dia |
| **Limpar a rota** | `Entrega.rotaOrdem = null` + `LogisticaRoute` encerrada | Limpar apaga ORDEM, nunca a entrega/dinheiro |
| **Usar a rota** | `Entrega.status` + desfechos | O dia rodando é `Entrega`, nada mais |
| **Fechar a rota** | fechamento-dia + `LogisticaRoute.operationalEndedAt` | |
| **Faturar** | `LogisticaRoute`/`RouteStop`/claims | Snapshot comercial imutável — anti-fraude, FICA como está |
| **Histórico** | `ClienteHistorico` + `LogisticaAgendaEvento` + snapshots na `Entrega` | Append-only, nunca editado |

E **uma ordem por pergunta**: `RotaModeloParada.ordem` = molde ·
`Entrega.rotaOrdem` = operação · `RouteStop.snapshotOrder` = dinheiro (NUNCA
lido pra tela). Tela que inventar uma 4ª ordem é bug.

O modelo de rota (a ordem salva que o dono reaplica) **fica**, mas vira SÓ
ordem: lista de (parada → plano/cliente, posição). Zero item, zero snapshot,
zero JSON.

## 4. O QUE MORRE — sem pergunta (ramo morto MEDIDO)

| # | Morre | Como se sabe que é seguro |
|---|---|---|
| M1 | `logistica-occurrence.service.ts` (gerador V1) + teste | 9/9 empresas em V2; nenhum caminho vivo chega nele fora do `if (!agendaV2)` |
| M2 | `logistica-recorrencia-occurrence.service.ts` (chaveador) | Só existe pra escolher V1×V2; sem V1 é um `extends` vazio |
| M3 | Flag `agendaV2Ativa` + todos os `isAgendaV2Active()` | true nas 9; V2 vira O sistema, não uma opção |
| M4 | `logistica-agenda-espelho.util.ts` + chamadas (cadastro/agenda) | O espelho só existe pra alimentar a V1 morta |
| M5 | Cadência em `ClienteProduto` (`diasSemana`, `frequenciaDias`, `proximaData`) | Vira coluna morta com M1–M4; a tabela SOBREVIVE só como **preço acordado** (o fechamento grava `precoAcordado` nela — isso fica) |
| M6 | `LogisticaRotaModelo.paradasJson` | Duplo-armazenamento; já divergiu (9≠7). LIVRE migra pro relacional ANTES do drop |
| M7 | `LogisticaRotaModeloParadaItem` + snapshots da parada (janela/acesso/adicional) | 716=716: é cópia byte a byte do `PlanoEntregaItem`; o item da visita mora no plano |

## 5. O QUE MORRE — com GO do dono (é feature publicada, não ramo morto)

| # | Feature | Medida | Recomendação |
|---|---|---|---|
| G1 | **Leitura de Rota** (montar andando) — 2 tabelas, ~1.500 linhas back + telas APK | 17 sessões, TODAS canceladas, 0 paradas capturadas | MATAR |
| G2 | **Importação** (`/logistica/importar`) — 2 tabelas, ~1.200 linhas + tela | 0 lotes desde que nasceu | MATAR |
| G3 | **Rota Indicada** (indicar rota → popup no app) — 1 tabela + serviço + UI web/APK | 4 usos na vida | MATAR |
| G4 | **Carga do dia** (balcão B4) — 2 tabelas | 0 linhas, mas publicada há 5 dias | Prazo: 30 dias sem uso → morre em 08/09 |
| G5 | Modelo LIVRE sem itens | Itens passam a morar SÓ no plano; LIVRE vira ordem de clientes | Aceitar (quem precisa de item ganha plano) |
| G6 | `zz_backup_*` de 09/08 | Backup da agenda 48 | DROP depois que F2 rodar 7 dias limpa |

## 6. FASES — cada fase é UM publish, DROP sempre em 2 tempos

**Leis da faxina** (valem pra toda fase):
1. Backup `zz_backup_<oquê>_<data>` antes de qualquer DROP/backfill.
2. O publish que apaga CÓDIGO nunca é o que apaga TABELA — tabela cai no
   publish seguinte, com a produção provada estável (lei "conserto em 2 tempos").
3. Dinheiro (`Route`/`RouteStop`/claims/tracking) e história (`AgendaEvento`,
   `ClienteHistorico`, snapshots da `Entrega`) NÃO entram na faxina.
4. Prova de cada fase: empresas vivas **41 e 48** (gerar-dia + montar + barra do
   app idênticos antes/depois) + bancada 39 + testes do módulo.
5. Cada fase termina com grep de LEITOR órfão (lei "apagar arquivo apaga chamador").

### F1 — UM GERADOR SÓ (mata M1, M2, M3)
- `prepare`/`gerar-dia`/`dia-preview` chamam a agenda V2 direto, sem `if`.
- `LogisticaRecorrenciaService` continua existindo só pelo CRUD que o núcleo usa; o override vira o próprio serviço.
- Apagar: occurrence.service + teste, recorrencia-occurrence, flag no schema (2º tempo).
- Prova: `dia-preview` e `prepare` byte-idênticos nas 41/48 antes/depois.

### F2 — CLIENTEPRODUTO DEIXA DE SER AGENDA (mata M4, M5)
- Espelho morre; cadastro que grava "dia da semana" escreve DIRETO no plano (a ponte já sabe o caminho — inverte a mão).
- `ClienteProduto` vira registro de preço: fechamento (`gravarPrecoCombinado`) continua igual.
- Portar leitores restantes de cadência (grep no ato; hoje: núcleo-cadastro, rota-modelo).
- 2º tempo: DROP das 3 colunas de cadência.
- Prova: cliente novo cadastrado com dia → aparece no gerar-dia; preço combinado no fechamento continua gravando.

### F3 — MODELO DE ROTA VIRA SÓ ORDEM (mata M6, M7 · precisa G5)
- Backfill: os 9 modelos LIVRE saem do JSON pra `RotaModeloParada` (JSON vence no LIVRE; tabela vence no SEMANAL — resolve o 9≠7 registrando o caso no `AgendaEvento`).
- Leitores de `paradasJson` portados pra tabela (route-builder, rota-modelo.service, aplicar modelo).
- 2º tempo: DROP `paradasJson`, DROP `RotaModeloParadaItem`, DROP colunas snapshot da parada.
- Prova: aplicar cada um dos 28 modelos gera a MESMA lista de antes (script de conferência antes/depois).

### F4 — ENTERRAR AS MORTAS (G1–G4, G6)
- Por feature aprovada: controller + service + testes + telas (web e APK) + tabela (2 tempos).
- Ordem sugerida: G2 importação (zero risco) → G3 indicada → G1 leitura (tem código no APK: `LeituraTrilhaSync.kt` etc.) → G4 no prazo.

### F5 — O CONTRATO DAS ORDENS (fecha a porta pro câncer voltar)
- Varredura: toda leitura de ordem no front/app aponta pra `Entrega.rotaOrdem`; `snapshotOrder` fica proibido em tela (comentário-contrato no schema + teste que falha se um endpoint expor).
- `docs/Rules/BACKEND.md` ganha a tabela dos 6 verbos (seção curta, apontando pra este plano).

## 7. CONTA DO LIXO

- **Código:** ~6.000–8.000 linhas mortas (occurrence 725 + recorrencia ~600 + espelho ~400 + leitura ~1.500 + importação ~1.800 + indicada ~600 + testes/telas).
- **Tabelas:** 8 dropadas (Leitura×2, Importacao×2, CargaDia×2, RotaIndicada, zz_backup×2) + 1 JSON + ~17 colunas.
- **O que o dono ganha:** cada pergunta tem UMA resposta no banco — divergência de tela vira classe de bug extinta, não whack-a-mole.

## 8. STATUS

- [ ] GO do dono nas decisões G1–G6
- [ ] F1 — um gerador só
- [ ] F2 — ClienteProduto vira só preço
- [ ] F3 — modelo vira só ordem
- [ ] F4 — enterrar as mortas
- [ ] F5 — contrato das ordens
