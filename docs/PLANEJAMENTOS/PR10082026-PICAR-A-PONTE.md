# PR10082026 — PICAR A PONTE: o app sai de UM arquivo pra módulos com DONO

> Ordem do dono (10/08): *"vc criou um código imenso, ponte.js. pode começar picando ele,
> refaça inteira a arquitetura."* · Atualização (10/08, manhã): *"arquivos chaves (js) não
> podem passar de 1000 linhas (exceções raras). Não vão ser 5 noites — vai ser tudo feito
> agora, com workers. Exijo mudança 0 no front, com exceção da rota que se auto cria e eu
> não vejo ela criada, e o cancelar que não deleta. Não publique no final — eu testo."*

## §0 — ESTADO ATUAL (medido 10/08 ~05h40, pós-publish `f949cab9`)

| Fato | Medida |
|---|---|
| `ponte.js` | **11.037 linhas** (cresceu: sessão paralela pôs `outroDia`/chip-gente) |
| Bug do Iniciar do mapa | **VIVO** — `ponte.js:3036` ainda decide `avulsa` lendo `montarDia` da Montagem |
| F0 | **NÃO feito** (o publish das 05:25 só levou este plano; ad2431ed/e4e3baf8 são outra frente) |
| Produção, dia 10/08, company 41 | 51 `agendada` criadas ~03h BRT **sem gesto visível** + 714 `cancelada` acumuladas |
| "Mão invisível" | cron `gerarDiaAutomatico` morto em `431da2ed` — mas ALGO criou as 51 depois; investigar |
| Cancelar | carimba `cancelada` e deixa o corpo; só o expurgo de 24h limpa — o dono quer DELETE |

## §1 — AS REGRAS DESTA EXECUÇÃO (ordens do dono, 10/08)

1. **Arquivo-chave JS ≤ 1.000 linhas.** Exceção rara e justificada. Arquivo GERADO
   (mock.js, ponte.js costurado) não conta — a régua é da FONTE.
2. **Mudança 0 no front.** Pixel por pixel, gesto por gesto — com DUAS exceções pedidas:
   (a) rota/dia que se auto-cria sem o dono ver → morre o criador sem gesto E a tela
   passa a MOSTRAR o dia que existe (a barra que dizia "Sem paradas hoje" com 51
   agendadas); (b) cancelar DELETA o que não foi processado, não carimba defunto.
3. **Tudo agora, com workers em paralelo** — territórios disjuntos, portões por entrega.
4. **NÃO publicar.** Commits locais na master. O dono publica e testa no celular.

## §2 — AS TRÊS LEIS DA ARQUITETURA (inalteradas)

1. **ESTADO TEM UM DONO.** Módulo de fora lê por função com nome; escrever não existe.
2. **INTENÇÃO VIAJA COMO ARGUMENTO.** `iniciar({escopo:'dia'})` do mapa;
   `iniciar({escopo:'avulsa', ids})` da Montagem. Porta nunca adivinha por variável
   ambiente. *Com esta lei, a regressão de hoje é impossível de escrever.*
3. **ESTADO DE TELA MORRE COM A TELA.** Chip, prévia, rascunho: nascem na Montagem,
   morrem ao sair sem gravar (exceção já-lei: RASCUNHO vive em rapida/ficha/novocliente).

## §3 — O MECANISMO DA PICADA (mudança 0 garantida por HASH)

A fonte vira `EntregaShell/app/src/logistica/ponte-src/NN-nome.js` — FORA de `assets/`,
que é embarcado no APK (14 arquivos ≤1.000 linhas, partição por FRONTEIRA de instrução top-level do IIFE).
`scripts/ponte-costurar.js` concatena na ordem e gera o `ponte.js` embarcado —
**byte-idêntico ao original no primeiro corte (portão: hash igual)**. É o MESMO desenho
da casca (fonte HTML → mock.js gerado), que a casa já sabe operar.

- `scripts/ponte-conferir.js`: falha se o gerado ≠ costura(fonte) — vacina contra edição
  à mão no gerado (a lição do cordão de update, perdida 2× no index.html).
- Costura entra no fluxo do publish ao lado do `casca-injetar` (o publish nunca embarca
  ponte velho).
- `index.html` NÃO muda (continua carregando um `ponte.js`).

## §4 — OS WORKERS (territórios disjuntos, rodando AGORA)

| Worker | Território | Entrega | Estado |
|---|---|---|---|
| **W1 picador** | `ponte-src/` + `scripts/ponte-*` | Split ≤1.000/arquivo por script + costura + conferidor + F0 (portas declaram `{escopo}`) + vacina "porta suja" + fonte fora do APK + demolição | ✅ `9e15eac9` · `e8d2d97e` · `a9aa2f4f` · `e324730d` · `f21cc204` |
| **W2 coveiro** | `backend/` (+ leitura VPS) | (a) autópsia das 51: era a passada de boot do cron VELHO (backend das 03:51 ainda sem o `431da2ed`; zero criações desde que ele subiu às 05:26) — nenhum criador sem gesto sobrou; (b) cancelar = DELETE do lixo nunca processado (ensaio em prod: 714 apagariam, 56 com crédito debitado ficam) + expurgo apertado (rota com parada fica inteira) | ✅ `9db7c2f6` · tsc limpo · logística 922/922 |
| **W3 casca** | mockup + gerados | Barra do `montar` com abertas>0: "N paradas agendadas" + dica; "Sem paradas hoje" só com dia vazio de verdade | ✅ `5c176c28` · casca 62/62 |
| **W4+ (onda 2)** | `ponte-src/` módulo a módulo | De-ambientização dos 79 `let`: cada estado preso no seu arquivo, namespace `PONTE` explícito, RASTRO (últimas 50 transições com ator) + mover retardatários pro módulo certo | ⬜ roda DEPOIS do teste do dono no celular (não empilhar mudança não testada) |

> ⛔ **FRONTEIRA DO DELETE (ordem do dono, 10/08):** *"não é para deletar históricos —
> o cliente pode querer reaproveitar, saber o quanto gastou, ou reaproveitar as rotas já
> gastas."* O DELETE (do cancelar E do expurgo de 24h) só come **lixo nunca processado**
> (`agendada`/`em_rota` sem desfecho + filhos diretos). INTOCÁVEIS para sempre: a linha da
> rota (`LogisticaRoute`, mesmo cancelada — é o "quanto gastou"), `LogisticaRouteStop`
> (reuso de rota já rodada), claims/extrato de crédito, entregas com desfecho de rua
> (`entregue` e `cancelada` com `rotaOrdem`), fechamento/caderneta, eventos da agenda,
> modelos de rota e a agenda. Prova: "quanto gastei no mês" e "remontar a rota de ontem"
> respondem IGUAL antes e depois. **Implementada como `SEM_SINAL_DE_VIDA`, régua ÚNICA
> compartilhada entre limpar-dia e expurgo.**

Guerra de sessão: cada worker fica no SEU território; commit local pequeno por entrega;
se `index.lock`, espera e tenta de novo. Nenhum worker publica, nenhum cria branch.

## §5 — A FONTE PICADA COMO FICOU (14 arquivos, maior 997 linhas)

`EntregaShell/app/src/logistica/ponte-src/` (fora de `assets/` — o APK não carrega fonte):
`00-nucleo` 839 · `10-geofence-montagem` 928 · `20-montagem-previa` 783 · `30-verbos-rota`
850 · `40-mapa-palcos` 856 · `50-cena-ruas` 997 · `60-prospector-nav` 807 ·
`70-traco-camera` 795 · `80-gps-rotas-salvas` 816 · `90-ajustes-financeiro` 679 ·
`A0-chat-produtos` 673 · `B0-clientes-ficha` 814 · `C0-encaixe-semana` 618 ·
`D0-porta-entrega` 626. Nomes seguem a ordem física do corte; a onda 2 move os
retardatários e renomeia pro mapa-alvo de módulos (núcleo/estado/verbos/montagem/mapa/
gps/entrega/clientes/plataforma).

## §6 — DEMOLIÇÃO (feita em `f21cc204`, fio conferido peça a peça)

| Peça | Veredito | Fio |
|---|---|---|
| `mobile-contract.js` (12 KB) | ⚰️ morreu | ninguém carrega/refere |
| `offline-controls.js` (7,6 KB) | ⚰️ morreu | idem; pacote offline morto desde 06/08 |
| `opening.html` (35 KB) | FICA | `OpeningActivity.kt:139` carrega no boot |
| `matriz.js` (11 KB) | FICA | `frontend/scripts/check-matriz.mjs` (fiscal APK×web) |

Colateral consertado: o passo de CI "Packaged JavaScript syntax" apontava pros 2 mortos
e pro `app.js` (morto na fusão de 07/08) — estava vermelho por ausência e cego pro app
real; repontado pra `native`/`mock`/`ponte` + `main/native.js` + `matriz.js`.
⚠️ Achado fora do território (registrado, decisão do dono): `check-matriz.mjs` está
QUEBRADO desde 07/08 (lê `assets/app/app.js`, que não existe — `ENOENT` antes de
fiscalizar qualquer coisa, dentro do `lint` do frontend).

## §7 — O QUE NÃO SE TOCA

Casca/mock (fora a exceção W3, pedida pelo dono) · backend seis-verbos (frente própria) ·
nativo Kotlin · Webwhats · nada de branch, nada de publish.

## §8 — ESTADO FINAL (10/08, pronto pro teste do dono; NADA publicado)

7 commits locais na master: `5c176c28` (barra fala a verdade) · `9e15eac9` (picada
hash-idêntica) · `e8d2d97e` (F0 — intenção como argumento) · `a9aa2f4f` (vacina porta
suja) · `9db7c2f6` (cancelar apaga + expurgo apertado) · `e324730d` (fonte fora do APK)
· `f21cc204` (demolição + CI).

Portões no HEAD final: `ponte-conferir` ✅ (14 fontes, sha256 `ac5210d9…`) ·
`casca-conferir` ✅ 62/62 · `prova-fluxo-rota` 80/80 · backend tsc limpo + logística
922/922. Peso tirado do APK: ~609 KB.

Pendências com moradia:
- ⬜ **Onda 2 (W4+)**: de-ambientização dos 79 `let` + RASTRO — roda após o teste do dono.
- ⬜ Histórico do DESKTOP (`admin-route/history`) conta lendo as linhas: dia 100%
  cancelado some da lista de lá (no APK fica, pela trilha). Espelhar é decisão do dono.
- ⬜ `descartarMontagem` e `encerrarDiasAnteriores` ainda carimbam `cancelada` (expurgo
  limpa em 24h); levar o DELETE às 3 portas é o próximo corte natural.
- ⬜ `check-matriz.mjs` quebrado (frontend) — consertar o alvo das catracas.
