# PLANO DE REVISÃO — ENDEREÇO E ROTA
**Origem:** teste de rota ao vivo em Rio Claro/SP, 01/08/2026. Dono dirigindo, eu despachando.
O teste **reprovou** — e reprovou na fundação: transformar um endereço em um ponto no mapa.

---

## O DIAGNÓSTICO EM UMA FRASE

O sistema tem um motor de endereço **bom** (CNEFE do IBGE local + ViaCEP + Nominatim com freio,
em `logistica-geo.service.ts` e `nucleo/cnefe-resolver.util.ts`) — **e ele estava desligado por
um cast de tipo**, além de mal ligado nas telas. O problema não era falta de tecnologia.

---

## 🔴 A CAUSA RAIZ (achada e CORRIGIDA em 01/08) — um cast derrubava a base inteira

`cnefe_endereco.cep` é `character(8)` (bpchar). O Prisma manda parâmetro como **text**, e
`bpchar = text` faz o Postgres converter a **COLUNA** — o que descarta os índices
`idx_cnefe_end_cep` / `idx_cnefe_end_cep_numero` e vira **Parallel Seq Scan nas 22.953.725 linhas**.

Medido na produção, a MESMA consulta:

| SQL | Plano | Tempo |
|---|---|---|
| `WHERE cep = $1` | Parallel Seq Scan · 7,6M linhas descartadas por worker | **18.832 ms** |
| `WHERE cep = $1::bpchar` | Bitmap Index Scan | **0,285 ms** |

O teto por consulta é **4 s**. Ou seja: **desde a carga da base (27/07) o CNEFE nunca respondeu a
tempo, uma vez sequer.** E como o resolver é best-effort (engole o erro e devolve `null` calado),
não aparecia em lugar nenhum — só no contador **"SEM MAPA"** subindo e na rota entrando por texto
com km e ETA errados. Prova colhida no container de produção:

```
[cnefe] consulta estourou 4000ms (sem cooldown — próxima sai quente): cnefe timeout
resolverCnefe => null
```

**Correção aplicada:** `::bpchar` em toda comparação de `cep` (`CEP_PARAM` em
`backend/src/nucleo/cnefe-resolver.util.ts`), incluindo o `IN (...)` do lote — mais um teste que
lê o SQL e reprova qualquer consulta de `cep` sem o cast, para não voltar calado nunca mais.

> Isto sozinho é o conserto de maior alcance do plano: ele reacende a cura de pino de **todo**
> cadastro, importação e conferência de rota do sistema — não só da logística.

---

## OS 4 BURACOS DE FUNDAÇÃO

### F1 — Endereço não vira ponto no mapa
**O que aconteceu:** cadastrei `Avenida Ápia, 150, Jardim Paulista, Rio Claro/SP` com CEP.
O cliente nasceu com `lat: null, lng: null`. O contador "SEM MAPA" subiu de 93 → 94.
O tabuleiro avisou sozinho: *"entram na rota por texto, então o plano de km e o ETA saem errados"*.

**Causa:** salvar cliente (`PATCH /nucleo/contas/:id`, `POST /nucleo/contas`) **não chama
geocodificador nenhum**. O pino só aparece se alguém rodar `backend/scripts/backfill-logistica-coords.js`
depois. Ou seja: o pino é um trabalho de faxina noturna, não parte do cadastro.

**Correção do gatilho já existia** (`maybeResolveServerGeo` roda no create e no update) — ela só
nunca conseguia resposta, por causa do cast acima.

| # | Correção | Onde | Estado |
|---|---|---|---|
| F1.0 | **Cast do CEP** — o que fazia o CNEFE inteiro devolver `null` | `nucleo/cnefe-resolver.util.ts` | ✅ **FEITO** |
| F1.1 | Resolver recebe a **via limpa + número separado** em vez do blob "Rua, número, bairro" do campo único | `nucleo-cadastro.service.ts` | ✅ **FEITO** |
| F1.2 | Sem número + CEP → grava o **pino do trecho** com fonte própria `cnefe_cep` (aproximado, sobrescrito pela 1ª entrega com GPS) | `nucleo-cadastro.service.ts` | ✅ **FEITO** |
| F1.3 | **Tela para corrigir o pino**: o selo *"Revisar GPS"* vira botão, abre mapa, arrasta e salva | `frontend/src/app/(app)/contatos/page.client.tsx` | ⬜ |
| F1.4 | Campo **CEP no cadastro novo** (hoje só existe no Editar) + autopreencher rua/bairro/cidade/UF pelo CEP | `frontend/src/components/hbx/editar-nucleo-modais.tsx` | ⬜ |
| F1.5 | **Recuperar os 94 sem mapa**: rodar `backfill-logistica-coords.js` agora que a base responde | `backend/scripts/` | ⬜ |

---

### F2 — "Sem número" não existe (o erro que travou o dono na rua)
**O que aconteceu:** na *Rota rápida* do celular, digitou o CEP `13502190` e levou
**"Falta o número da casa"** — num lugar que **não tem número**.

**Causa (confirmada no código):** `extrairNumeroPorta()` em
`backend/src/nucleo/cnefe-resolver.util.ts:86` só aceita **dígito > 0**. `"S/N"` vira vazio, `"0"`
é rejeitado. E `geo/cep` (`logistica-geo.service.ts:149`) devolve **400** se o número não for
inteiro positivo. Não há caminho para endereço sem número — e metade do Brasil é sem número
(posto, chácara, praça, comércio, estrada).

| # | Correção | Onde | Estado |
|---|---|---|---|
| F2.1 | `geo/cep` aceita **número ausente / "S/N" / "0"**: devolve o pino do trecho com `precisao:'cep'` em vez de 400. Só o número absurdo (>6 dígitos) segue 400 | `logistica-geo.service.ts` + `resolverCnefeCep` | ✅ **FEITO** |
| F2.2 | Botão **"Sem número"** na Rota rápida e no cadastro (o backend já aceita) | `EntregaShell/app/src/logistica/assets/app/app.js` + modais do front | ⬜ |
| F2.3 | O campo "Para onde" aceita **as 5 formas**: CEP · endereço · **nome de lugar** · link do Maps · coordenada colada. Os endpoints **já existem** (`geo/busca`, `geo/link`) e não estão ligados nesse campo | `app.js` (Rota rápida) | ⬜ |
| F2.4 | **Sugestão enquanto digita** (autocomplete) + confirmação no mapa antes de virar parada | `app.js` | ⬜ |
| F2.5 | A conferência de rota trata `endereco_sem_numero` como **impeditivo** — com pino de CEP provado, tem que virar informativo | `logistica-conferencia.service.ts` | ⬜ |

---

### F3 — A rota é uma foto que ninguém pode mexer
**O que aconteceu:** criei a parada do Atacadão **depois** de a rota rastreada já ter iniciado.
Na hora de confirmar a entrega, o app respondeu:
*"Esta entrega ainda não pertence ao snapshot da rota rastreada. Recalcule a rota."*
**E não existe botão de recalcular nessa tela** — "Recalcular rota" só aparece num popup de outro
caso (drift de origem, `app.js:7744`).

**Causa:** `logistica-tracked-billing.service.ts:459` recusa entrega fora do snapshot da rota ACTIVE.
A regra está certa (é ela que protege a cobrança); o que falta é **a saída**.

| # | Correção | Onde |
|---|---|---|
| F3.1 | Parada nova em rota ativa **entra no snapshot automaticamente** (re-snapshot incremental, sem recobrar o dia) | `logistica-tracked-billing.service.ts` + `logistica-rota.service.ts` |
| F3.2 | Enquanto F3.1 não existir: o erro **traz o botão que resolve** ("Recalcular rota agora") na própria folha de chegada | `app.js` (`ROUTE_NOTICE_CARDS`, linha ~5643) |
| F3.3 | 🎯 **PARADA AVULSA COM ENCAIXE INTELIGENTE** (pedido do dono): endereço novo entra na rota em andamento **na posição mais próxima do caminho**, não no fim da fila | `logistica-rota.service.ts` (usar o OSRM self-host que já roda em `172.18.0.1:5000`) |

---

### F4 — O app fala com o motorista em língua de programador
*"snapshot da rota rastreada"*, *"Falta o número da casa"* num lugar sem número,
*"Recalcule a rota"* sem botão de recalcular.

| # | Correção | Onde |
|---|---|---|
| F4.1 | Varredura das mensagens de erro do app do entregador: toda mensagem diz **o que houve** e **oferece a ação** | `app.js` + `logistica-route-billing.service.ts:1331` |

---

## HIGIENE (rápido, mas conta)

| # | O quê | Prova |
|---|---|---|
| H1 | **`Editar cliente` abre com Endereço, Telefone, E-mail e CEP em branco** mesmo cheios — o chamador só passa `id, nome, cidade, uf` e as flags | `frontend/src/app/(app)/contatos/page.client.tsx:1601-1610` |
| H2 | **`+ Gerar entregas` cria entrega de cliente real com um clique** — sem prévia, sem desfazer. Um clique meu gerou 4 | `/logistica`, botão do tabuleiro |
| H3 | Limpar o rastro do teste: cliente `TESTE ROTA 1 - Atacadão` + a entrega `a5f7c0bc` + as 4 entregas geradas | painel |

---

---

## O QUE JÁ ESTÁ EM PRODUÇÃO (01/08)

| commit | o quê | prova |
|---|---|---|
| `3ccc8521` | cast do CEP + endereço sem número + via limpa no cadastro | resolver rodado no container: **105 ms** (era timeout de 4 s) |
| `7cf32715` | backfill manda via limpa + número, e cura o sem-número | **94 → 64** clientes sem mapa na empresa 48 |
| `b15bba5c` | busca do Modo Viagem + "sem número" na Rota rápida (APK novo) | `padaria` 347 ms/5 itens · `atacadao` 802 m · `farmacia` 12 itens, tudo ordenado por distância |

**Os 64 que sobraram não são bug:** 50 não têm CEP no cadastro, e parte do resto cai em
buraco do Censo — conferi `Av. M 55`, `Av. M 47` e `Rua 19` (Jd. Progresso / Recanto
Paraíso): o ViaCEP conhece, o CNEFE **não tem nenhuma delas em Rio Claro**. Para esses o
caminho é o pino na mão (F1.3) e o GPS da primeira entrega, que o sistema já grava.

⬜ **Decisão do dono:** rodar o backfill nas empresas **39** (204 de 206 sem mapa) e
**41** (109 de 230) — mesmo bug, dado ainda velho.

---

## ORDEM DE ATAQUE (o que vale mais por hora de trabalho)

1. **F2.1 + F2.2** — "sem número" para de travar motorista. É o menor conserto com o maior alívio.
2. **F1.1 + F1.2** — pino nasce com o cadastro. Sem isso, km, ETA e ordem de rota são chute.
3. **F3.2** — o erro passa a oferecer a saída. Barato, e tira o motorista da parede.
4. **H1** — o editor mostra o que existe.
5. **F1.3 + F1.4** — corrigir pino na mão e CEP no cadastro.
6. **F3.1** — snapshot incremental.
7. **F3.3** — encaixe inteligente (o pedido do dono).
8. **F4.1 + H2** — linguagem e freio do gerar.

---

## O QUE EU ERREI (para não repetir)

Criei a entrega do Atacadão **pela API, com a rota já iniciada**, porque a tela não tem "entrega
para um endereço". Isso pôs o dono numa parede no estacionamento do mercado. A ordem certa era:
montar a parada **antes** de ele iniciar a rota — ou não iniciar nada até a parada existir.
