# PR10082026 — A LEI DO DESAPARECER + revisão do dia + o fim dos CEPs vazios

> GO do dono (10/08, ~03h), as três ordens juntas porque são o mesmo organismo:
> 1. *"rota criada q não foi processada, e já passou do dia de voltar o crédito, ela
>    DESAPARECE. (…) crie um plano para não se repetir esse pensamento, a lei q estou
>    falando é absoluta!"* — **nunca mais existe "faxina": lixo não se acumula.**
> 2. Revisão de processos do `LEVANTAMENTO-10082026-LIMPAR-DIA-SEM-RASTRO.md` — *"bora!"*
> 3. CEPs vazios: *"eu já fiz umas 3 vezes (…) pesquise melhor antes de me perguntar."*

---

## §1 — A LEI ABSOLUTA (a mudança de PENSAMENTO, antes do código)

**"Faxina" é sintoma de arquitetura errada.** Se um dado morto precisa de alguém pra
varrê-lo, o sistema guardou o que nunca devia ter ficado. A lei do dono:

> **Entrega/rota criada que NÃO foi processada (nada entregue, nada cobrado, nenhum
> comprovante), passada a janela de estorno do crédito → DESAPARECE SOZINHA.**

Nenhum relatório, fechamento ou tela pode depender de linha morta. O que foi
PROCESSADO (entregue, cobrado, comprovado) é história e fica pra sempre — a lei fala
do que nunca aconteceu.

### O que a lei mata (medido em produção, company 41, 10/08 03h)
- 6 levas de gerar⇄limpar por dia: 06/08 tem **353 entregas para 1 dia de trabalho,
  320 canceladas**; o acumulado passa de **1.000 canceladas órfãs**.
- 7 `LogisticaRoute` ACTIVE de dias passados (07–09/08 + julho).
- 3 `LogisticaTrackingSession` ACTIVE penduradas.
- 6 entregas de teste abertas de dias passados (1 `em_rota` de 07/08 etc.).

---

## §2 — FASES

### F4 · A MONTAGEM ABRE SEM DIA (dono, 10/08, com a foto da tela)
> *"ao entrar no montagem de rota, não carregar o dia automaticamente, deixe nessa tela"*

A porta de entrada da Montagem passa a ser o estado **Rota avulsa** (chip nenhum
aceso): "Rota avulsa — adicione as paradas", a semana ("Os dias que você entrega",
com a contagem de cada dia), o histórico de 14 dias e o dock "Adicionar parada".
O dia só entra quando o dedo toca o chip — **carregar é decisão, não boas-vindas**.
É a conclusão natural do que já foi feito hoje ("entrar não grava nada"): agora
entrar também não *carrega* nada.

### F5 · O HISTÓRICO REGISTRA O QUE NÃO FOI COMPLETADO (dono, 10/08)
> *"tem q ficar registrado rotas que eu criei e cancelei. Canceladas com 0 registro
> ficam salvas por apenas 24 horas, junto com os créditos. Rotas q tiveram algum
> registro de verdade ficam salvas, mas ambas ficam VERMELHAS: não foram completadas."*

O histórico de 14 dias hoje só enxerga dia que teve entrega. Passa a ter três cores,
e a cor é o desfecho:

| caso | o que é | quanto tempo fica | cor |
|---|---|---|---|
| completa | todas as paradas resolvidas | 14 dias | normal |
| **2b** — incompleta COM registro | alguma coisa aconteceu de verdade (entregue, cobrado, comprovante) | 14 dias | **vermelha** |
| **2** — cancelada SEM registro NENHUM | criou e cancelou, nada aconteceu | **24 h** (e some junto com o crédito, §F1) | **vermelha** |

**É a mesma lei do §1 vista pela tela:** o caso 2 aparece em vermelho enquanto o
crédito ainda pode voltar, e some com ele — não é "lixo guardado 24 h", é a janela
de estorno tendo rosto. O que o histórico mostra dos dois é **o que não foi
completado** (quantas paradas ficaram), nunca um "dia vazio" mudo.

### F0 · Medir a janela de estorno (é ELA que dita o relógio)
✅ **MEDIDO (10/08).** O estorno fecha em MINUTOS, não em dias:
- ESSENTIAL — `PREPARED_ROUTE_STALE_MS = 5 min` (`logistica-route-billing.service.ts`):
  rota PLANNED parada 5 min é estornada pelo `reconcilePendingRefunds`, que roda a
  cada 5 min.
- TRACKED — `REFUND_LEASE_MS = 90 s` + reconciliador a cada 5 min
  (`logistica-offline-reservation-reconciler.service.ts`).

Ou seja: **10 minutos depois, o dinheiro já voltou.** A janela do dono ("24 horas,
junto com os créditos") é folgada por cima disso — e é ela que vale, porque é a que
ele vê na tela (§F5). **`JANELA_EXPURGO = 24 h`**, com a trava dura de segurança:
nenhuma linha some enquanto houver claim em estado não-terminal (DEBITED/PROCESSING/
REFUNDING) — se o dinheiro ainda está no ar, a linha espera o reconciliador.

### F1 · O EXPURGO — o "desaparece" de verdade
Passada diária no cron que já existe (`sweepGerarDiaAutomatico`, 1×/dia + boot —
ganha um irmão `sweepExpurgo`), por empresa:
1. **Entrega morta some:** `status='cancelada'` + sem desfecho comercial (sem
   comprovante, sem cobrança feita, `cobrancaStatus='pendente'`, sem `deliveredAt`)
   + `scheduledAt < hoje − JANELA_EXPURGO` → **DELETE** (não é soft: desaparecer é
   desaparecer). O extrato de agenda (`LogisticaAgendaEvento`) NÃO é apagado — evento
   é história de decisão, não linha morta.
2. **Rota que nunca rodou some:** `LogisticaRoute` de dia passado sem NENHUMA entrega
   processada no dia → DELETE; com trabalho feito → só `operationalEndedAt` (como hoje).
3. **TrackingSession ACTIVE de dia passado → ENDED** (carimbo, não delete: tem trilha).
4. **Backfill inicial = a própria lei rodando** na primeira passada: o passivo de
   ~1.000 da 41 e o das outras empresas some sem "operação de faxina".
**Portões:** teste da régua (morta some · processada NUNCA some · aberta de hoje não
some) + contagem antes/depois em produção no relatório. Fechamento/relatórios
re-medidos depois do expurgo (a soma não pode mudar — se mudar, algo dependia de lixo).

### F2 · Revisão do limpar-dia (o §5 do levantamento, GO dado)
1. **Carimbo, não apagão:** `agendaOcorrenciaKeyOrigem` (nova coluna, imutável) guarda
   a ocorrência ao cancelar; a chave viva continua zerada (não trava o cliente). Vale
   pros 3 canceladores em massa (`limparDia`, `descartarMontagem`, fechamento-caixa).
2. **Evento obrigatório:** `limparDia` grava linha no extrato com ator (userId +
   aparelho), motivo e contagem — hoje ele é MUDO e a única testemunha morre no
   restart do container.
3. **Cursor da agenda com dono:** régua explícita pra `proximaData` (196 planos NULL +
   57 vencidos na 41): NULL = "gera sempre que o dia bater"; vencida = atrasada (gera
   e avança no desfecho — contrato F0 27/07 mantido). Documentar no código, não mudar
   o contrato.
4. **Idempotência do dia:** gerar 2× não cria 2 levas — com o carimbo do item 1, o
   `generateDay` pode consultar a ORIGEM cancelada dentro da janela e não recriar a
   ocorrência que o humano acabou de matar (cancelar passa a valer até o expurgo,
   inclusive através de restart do backend — hoje um publish ressuscita o dia).
5. **O botão:** Cancelar exige confirmação digitada quando o dia tem >10 paradas
   montadas (3 acidentes registrados no código).

### F3 · CEP: os 76 viram ~16 — e os 16 ganham NOME
Pesquisa feita (10/08): **nada reverte desde os portões de 09/08** (updateConta julga
o resultado; Bete 13506566 e Alfredo 13506661 persistem). O "reverteu 3 vezes" era o
buraco antigo do PATCH — está fechado. Composição real dos 76 sem CEP (isCliente, 41):
- **43 com pino** e sem CEP → a régua de 27/07 ("CEP só na porta exata") era
  conservadora demais pra ordem atual do dono ("preencher"). Muda assim:
  · pino `cnefe` (porta exata OU vizinho provado na mesma quadra/bairro): carimba o
    **CEP da porta do Censo** (CEP no Brasil é do trecho da rua — vizinho de quadra
    é o mesmo CEP na prática; fonte marcada `cnefe_vizinho`).
  · pino de outra fonte com rua+cidade válidas: **ViaCEP por rua** (CEP geral da rua).
  · Só preenche VAZIO. Nunca sobrescreve CEP digitado.
- **16 sem rua/número digitados** → impossíveis por máquina; o relatório final lista
  os NOMES pro dono completar (única parte humana).
- **17 com rua que o Censo não acha** ("Rua38", "Avm19"…) → tentativa ViaCEP-rua; o
  que sobrar entra na lista nominal junto.
`LocalEntrega` entra na mesma regra (o local é que manda na entrega).
**Portões:** contagem antes/depois na 41 + os mesmos portões de 09/08 (pino errado é
pior que pino vazio — a régua de PINO não afrouxa, só a de CEP).

---

## §3 — Ordem de execução e prova
F0 (medida) ✅ → F3 (CEP) ✅ `25166875` → **F4** (Montagem abre sem dia — é a foto que o
dono mandou) → F2.1/2.2 (carimbo+evento, migration aditiva) → F2.4 (cancelar vale) →
**F5** (histórico vermelho, que já lê o carimbo da F2.1) → F1 (expurgo, por último: só
depois que a história está preservada é que a linha pode sumir) → F2.3/2.5.
Cada fase: prova de bancada + medida em produção no relatório. Nada atrás de chave.

**Por que F5 antes de F1:** a tela tem que saber contar o que aconteceu ANTES de o
expurgo apagar a linha. Invertido, o dono veria sumir o que ele nunca chegou a ver.

*Plano da sessão 10/08 madrugada. Irmão do `LEVANTAMENTO-10082026-LIMPAR-DIA-SEM-RASTRO.md`.*
