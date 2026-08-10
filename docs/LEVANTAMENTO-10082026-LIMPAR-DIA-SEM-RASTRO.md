# LEVANTAMENTO — o dia da rota é cancelado e recriado, e ninguém fica sabendo

**10/08/2026, 01h.** Company **41**, produção. Levantamento a pedido do dono
("faça um levantamento desse bug, vou corrigir em outra janela com uma revisão de
processos… talvez marcar histórico de canceladas, deixar carimbado, assim não fica
voltando este erro"). **Nada foi corrigido aqui — este arquivo é só o retrato.**

---

## 1. O estado AGORA (o que mais urge)

```
Entregas com scheduledAt = hoje (10/08), company 41:
  cancelada | 102
  (abertas) |   0
```

O dia de segunda-feira está **zerado**. O log do backend confirma o efeito na ponta:

```
3:44:32  rota planejada 2026-08-10 company=41: 0 parada(s)
3:44:25  GET /logistica/rota/custo-preview -> 400 :: "Nenhuma entrega aberta neste dia."
3:45:02  (o mesmo 400, repetindo até 3:46:41)
```

A agenda **regenera sozinha** quando alguém abrir o app (foi o que aconteceu às
00:09), porque os planos de segunda estão com `proximaData = 2026-08-03` — uma
semana no passado, portanto sempre "atrasados". Mas o que renasce é a agenda
crua: **ordem, arrasto e ajustes feitos na véspera não voltam.**

---

## 2. A sequência medida (banco + nginx + log do backend)

| hora (local) | o que aconteceu | fonte |
|---|---|---|
| 09/08 03:49 | 51 entregas criadas para o dia 10/08, **sem** `agendaOcorrenciaKey`, com `planoEntregaId` e 1 `rotaModeloId` | banco |
| 09/08 **22:36** | `POST /logistica/rota/limpar-dia` — **do APK** | nginx |
| 10/08 **00:06** | `POST /logistica/rota/limpar-dia` — as 51 de domingo viram `cancelada` | nginx + banco |
| 10/08 00:09 | agenda gera 51 novas, já com `rotaOrdem` e com chave (`OCORRENCIA_GERADA` ×51 no extrato) | banco |
| 10/08 **00:44** | `POST /logistica/rota/limpar-dia` → `canceladas=51 planosLiberados=0` | log + banco |
| 10/08 00:44→00:46 | o app fica pedindo `planejar` + `custo-preview` num dia vazio (400 em série) | log |

As três chamadas saíram do **mesmo IP e do mesmo agente**:
`HBX-logistica/alpha1 Android/35`.

---

## 3. Os cinco defeitos, na ordem em que mordem

### 3.1 O cancelamento em massa não deixa rastro
`limparDia` cancela N entregas e **não grava evento nenhum**. O extrato
(`LogisticaAgendaEvento`) das últimas 8 h da 41 só tem `OCORRENCIA_GERADA` (56
linhas). Quem cancelou, quando, de qual aparelho e por quê — não existe no banco.

A única testemunha é o log do container. **E ele morre no primeiro publish:** o
deploy de hoje (03:08 UTC) recriou o `hbx-backend` e levou embora o log das 22:36
e das 00:06. Sobrou só o das 00:44, por acaso.

> É exatamente o "carimbar" que o dono propôs. Sem carimbo, todo diagnóstico
> deste bug depende de o container não ter reiniciado desde o estrago.

### 3.2 A cancelada perde a identidade da ocorrência — de propósito
`limparDia` e `descartarMontagem` gravam `agendaOcorrenciaKey: null` ao cancelar.
O motivo está escrito no código e é legítimo:

> *"A chave é ÚNICA por empresa: presa na entrega cancelada, o `generateDay` acha
> 'já existe' e pula o cliente PARA SEMPRE"* — `logistica-rota.service.ts:932`

Só que a cura criou o ponto cego: **a entrega cancelada deixa de saber de que
ocorrência veio.** Não dá para responder "esta cancelada é a mesma visita que
depois renasceu?" nem "quantas vezes esta ocorrência já foi recriada?".

A saída não é deixar a chave presa (isso volta a travar o cliente) — é **mover**:
guardar a chave num campo de histórico (`agendaOcorrenciaKeyOrigem`, imutável) e
zerar só a chave viva, que é a que tem o índice único.

### 3.3 O verbo promete devolver a agenda e hoje devolveu ZERO
O comentário do `cancelarRota` (ponte.js) diz que o `limpar-dia` é o verbo certo
justamente porque *"DESFAZ a ocorrência recorrente, isto é, devolve o
`proximaData` do plano; sem isso o dia virava pedra"*.

Medido hoje: `canceladas=51 **planosLiberados=0**`.

E o estado dos planos ativos da 41 reforça que essa contabilidade não está de pé:

| dia da semana | planos | `proximaData` |
|---|---|---|
| 1 (segunda) | 54 | **2026-08-03** (uma semana no passado) |
| 5 | 3 | 2026-07-31 (passado) |
| 2, 3, 4, 5, 6 | **196** | **NULL** |

196 planos ativos sem `proximaData` e 57 com data vencida: o cursor da agenda não
está sendo mantido por ninguém. É por isso que o dia "sempre pode ser gerado de
novo" — e o ciclo do §3.4 nunca fecha.

### 3.4 O ciclo gera lixo em escala industrial
Entregas por dia agendado (company 41), contando levas distintas de criação:

| dia | total | canceladas | levas |
|---|---|---|---|
| 05/08 | 25 | 18 | **13** |
| **06/08** | **353** | **320** | **37** |
| 07/08 | 97 | 96 | 3 |
| 08/08 | 100 | 100 | 2 |
| 09/08 | 195 | 190 | **19** |
| 10/08 | 102 | **102** | 2 |

353 entregas para um único dia de trabalho, das quais 320 canceladas, em 37
materializações. Isso não é o dono cancelando 37 vezes — é o par
**gerar ⇄ limpar** rodando em laço, cada volta deixando uma camada de canceladas.

Efeito colateral já conhecido nesta casa: relatórios e fechamento que varrem
"entregas do dia" passam por cima de 3,5× mais linhas do que existe de trabalho.

### 3.5 O gatilho é um botão vermelho no lugar onde antes ficava o verde
`cancelarRota()` (ponte.js:2875) é o único chamador de `limpar-dia` no app
inteiro. Ele pergunta *"Tem certeza que deseja cancelar?"* → Não / Sim.

O próprio código já registra o histórico do acidente:

> *"`perigo` continua (09/08): o 'Sim' é vermelho. **Vestido do verde do
> 'Iniciar', no mesmo lugar da tela, ele me fez encerrar a rota do dono três
> vezes sem querer — provado no log do servidor.**"*

Hoje foram **três chamadas em 22 horas**. O portão de confirmação existe, mas ele
protege contra o toque errado — não contra o toque certo dado por engano, e não
deixa nenhum rastro depois.

---

## 4. O que este levantamento NÃO consegue afirmar

**Quem tocou.** Das três chamadas, duas (22:36 de domingo e 00:06) aconteceram
antes de eu abrir o app (00:09). A das 00:44 aconteceu 6 minutos depois do meu
último toque na tela — eu estava operando o aparelho por coordenada de toque
entre 00:32 e 00:38 para tentar chegar na tela de dirigir, e **não posso descartar
que um toque meu tenha caído no botão Cancelar**, ainda que o portão exija um
segundo toque no "Sim".

E é justamente esse "não posso afirmar" que é o defeito §3.1: **o banco deveria
responder isso, e não responde.**

---

## 5. O que a correção precisa entregar (para a revisão de processos)

1. **Carimbo, não apagão** — `agendaOcorrenciaKeyOrigem` (ou equivalente) preserva
   a ocorrência na cancelada; a chave viva continua sendo zerada para não travar
   o cliente. Vale para os **três** caminhos que cancelam em massa:
   `limparDia`, `descartarMontagem` e o fechamento (`fechamento-caixa.util`).
2. **Evento obrigatório no extrato** — toda cancelada em massa vira linha em
   `LogisticaAgendaEvento` com motivo, ator (userId + aparelho) e contagem. Hoje
   só o `descartarMontagem` grava evento; o `limparDia` é mudo.
3. **O cursor da agenda tem dono** — 196 planos com `proximaData` NULL e 57
   vencidos precisam de uma régua explícita: quem avança, quem devolve, e o que
   significa NULL.
4. **Idempotência do dia** — gerar o dia duas vezes não pode criar duas levas.
   Hoje a chave é a única defesa, e ela é solta no cancelamento.
5. **Faxina do passivo** — decidir o que fazer com as ~1.000 canceladas órfãs
   acumuladas (06/08 sozinho tem 320).
6. **O botão** — reavaliar o lugar do Cancelar no dock (o código já documenta 3
   acidentes) e considerar exigir dia vazio ou digitar confirmação quando houver
   mais de N paradas montadas.

---

## 6. Consultas usadas (para reproduzir)

```sql
-- estado do dia
select status, count(*) from "Entrega"
where "companyId"=41 and "scheduledAt"::date = current_date group by 1;

-- levas por dia (o ciclo gerar/limpar)
select "scheduledAt"::date, count(*) total,
       count(*) filter (where status='cancelada') canceladas,
       count(distinct date_trunc('minute',"createdAt")) levas
from "Entrega" where "companyId"=41 and "scheduledAt" >= current_date - 21
group by 1 order by 1;

-- cursor da agenda
select "diaSemana", "proximaData"::date, count(*) from "LogisticaPlanoEntrega"
where "companyId"=41 and ativo group by 1,2 order by 2,1;
```

```bash
# quem chamou (o nginx é a única testemunha que sobrevive ao publish)
grep -h "limpar-dia" /var/log/nginx/*.log
# o que o backend disse (morre no restart do container)
docker logs hbx-backend --since 12h | grep -iE "limpar-dia|descartar|planejada"
```
