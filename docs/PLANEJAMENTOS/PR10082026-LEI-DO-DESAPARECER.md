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

### F0 · Medir a janela de estorno (é ELA que dita o relógio)
A régua "dia de voltar o crédito" já existe no código de crédito
(`LogisticaTrackedCreditClaim` / PAGAMENTOS): medir qual é (estorno no encerrar? D+1?
fim do dia?) e cravar `JANELA_EXPURGO = janela de estorno` — a lei usa a régua que o
dinheiro já usa, nunca uma nova. **Portão:** o número escrito neste doc + teste que lê
a constante do código de crédito.

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
F0 (medida) → F3 (CEP: independente e visível já) → F2.1/2.2 (carimbo+evento, migration
aditiva) → F2.4 (cancelar vale) → F1 (expurgo, com F2.1 no lugar — o carimbo preserva a
história ANTES de a linha sumir) → F2.3/2.5. Cada fase: prova de bancada + medida em
produção no relatório. Nada atrás de chave.

*Plano da sessão 10/08 madrugada. Irmão do `LEVANTAMENTO-10082026-LIMPAR-DIA-SEM-RASTRO.md`.*
