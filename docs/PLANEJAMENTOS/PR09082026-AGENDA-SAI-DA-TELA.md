# PR09082026 — A AGENDA SAI DA TELA (fica no dado; a Montagem é a tela)

> Pergunta do dono (09/08): "estou inclinado a remover o agenda, não vejo
> utilidade que o montar rota não tem — e a agenda atrapalhava: ao entrar em
> montar rota, ele puxava rota atrasada da agenda. Peso do mercado 90%."

## 1. A CENA (os 2 prints do dono)

- **Print 1 — "Agenda de hoje"** (domingo): `0 agendadas · 0 entregues`, a
  semana ("Os dias que você entrega"), créditos, e **"Não entregues · 137"** —
  137 cartões mortos rolando na tela de um dia que tem ZERO cliente.
- **Print 2 — "Montagem de rota"**: chips de dia, lista ordenada por
  distância, soma, Salvar/Montar. Completa e limpa.

Duas telas respondendo "o que é o meu dia?" — a mesma doença das 4 cópias da
agenda no banco (`PR09082026-ROTA-SEIS-VERBOS`), agora em pixel.

## 2. O MEDIDO (mock + ponte, 09/08)

1. **"Agenda de hoje" não é uma tela — é a 2ª personalidade da `T.rotalista`.**
   A régua `temRota` (mock `logistica-2.0.html:3474`) escolhe o título:
   com rota montada = "Rota de hoje" (a lista da operação); sem rota =
   "Agenda de hoje". O modo agenda é o que está em julgamento; a "Rota de
   hoje" NÃO está.
2. **Os "137 Não entregues" são o grupo `cancelada`** (`DESFECHOS`, mock
   `:3311` — `['cancelada','Não entregues']`). A tela exibe o cemitério dos
   cancelamentos do dia num domingo sem agenda. E na MESMA tela o KPI diz
   "0 agendadas" — dois números discordando na mesma dobra.
3. **O "puxava rota atrasada" tem corrente medida:**
   `admin-route/prepare` materializa entregas no dia operacional de HOJE →
   `encerrar` as devolve VIVAS (`'agendada'`, de propósito) → o `planejar`
   do servidor monta "tudo que está aberto hoje" → e **abrir a Montagem JÁ
   chama `montarRota()`** (`ponte.js:4587`, ordem do dono de 08/08: "é pra
   funcionar já no carregamento"). Entrega pendurada de ontem = rota
   atrasada ressuscitando no toque. O filtro por `origem` (09/08) limpou a
   LISTA da prévia; a raiz — entrega aberta atravessando a meia-noite sem
   dono — segue viva, e já cobrou 2 faxinas manuais (André: 236; empresa
   48: 52×N).
4. **Tudo que o modo agenda mostra tem cópia:**

   | Peça da "Agenda de hoje" | Onde já existe |
   |---|---|
   | Semana com contagem por dia | Chips da Montagem (mesma fonte: `totalClientesDia`) |
   | Lista de quem espera hoje | Montagem (`dia-preview` + avulsas) |
   | "+ Parada" | Dock da Montagem (o "+" de 09/08) |
   | "Ver mapa" | A própria aba Rota (o mapa É a tela) |
   | "Montar rota" | Dock da Montagem |
   | Créditos "monte a rota pra saber" | ÚNICO sem cópia → muda de casa (§5.2) |
   | Data por extenso (`dataLonga`) | ÚNICO sem cópia → muda de casa (§5.4) |

## 3. O MERCADO (o peso de 90%)

- **App de motorista das líderes** (Circuit for Teams, Onfleet, Bringg,
  OptimoRoute, Routific, SimpliRoute): a tela do motorista é **A ROTA DE
  HOJE** — paradas + mapa + prova de entrega. Planejamento mora no despacho
  (web). **Nenhuma dá ao motorista uma segunda superfície "agenda".**
- **Dono-entregador** (Circuit solo, RoadWarrior — o perfil do André): UMA
  superfície de planejar: carrega o dia → otimiza → dirige. A recorrência
  ("toda quarta") é **atributo do cliente no cadastro**, nunca tela própria.
- **Calendário só existe em negócio de HORA MARCADA** (Jobber, Housecall
  Pro, ServiceTitan) — e mesmo lá o app do técnico mostra "os jobs de
  hoje". Água em carteira é CADÊNCIA, não compromisso com hora: o caso mais
  fraco possível pra uma agenda na mão do motorista.
- **A conta de conversão do segmento:** cada tela entre abrir o app e
  dirigir custa adoção. Duas telas dizendo "seu dia" com números diferentes
  (0 × 137 na mesma dobra) é o que fabrica desconfiança e suporte — o
  André abandonou a ROTA, não o app, exatamente por dado que não batia.

**Veredito de mercado: o dono está certo, com uma lapidação** — o que morre é
o MODO agenda (a personalidade sem-rota da lista), não a tela "Rota de hoje"
(que é o padrão da categoria e fica byte a byte), e não a agenda-DADO
(`LogisticaPlanoEntrega`), que é o verbo Agendar da espinha dos 6 verbos.

## 4. A PERGUNTA DO DESKTOP — respondida

**"O admin no desktop precisa que o motorista continue com agenda, pra ele
enviar as coisas?" NÃO.** A conversa admin→motorista é
**servidor→rota**, nunca tela→tela: o desktop edita `LogisticaPlanoEntrega`,
o `gerar-dia`/`prepare` materializa, o app recebe a ROTA. No modo central do
`PR08082026-ROTA-DOIS-MODOS`, o admin manda a rota pronta e o motorista de PO
nem planeja. A tela "Agenda de hoje" do app é decoração read-only — nada no
desktop lê ou depende dela.

## 5. O PLANO

### A1 — O MODO AGENDA MORRE (mock + ponte, 1 commit)
- Sem rota montada, a `T.rotalista` **não se abre**: o botão "Lista" da barra
  do mapa só é desenhado com `temRota` (sem rota, a barra segue com o fato —
  "Sem paradas hoje" — e o dock com "Montar rota", que já existem).
- Morrem no mock, com varredura de leitor órfão no MESMO commit (lei
  [[chave-morta-vira-parede]]): `tituloAgenda`, o ramo `!temRota` da
  rotalista, o KPI "agendadas", `qtdAgendadas/qtdEntreguesDia/qtdNaoEntregues`
  (se o grep confirmar que só este ramo lia), `semanaAgenda()` desta tela.
- "Rota de hoje" (com rota): fica intacta — desfechos, saldo, dinheiro/pix,
  filtros, gestos.

### A2 — MUDANÇAS DE MORADIA (o que era único ganha casa ANTES do machado)
1. **A semana** → estado vazio da Montagem: "Nada a exibir hoje" ganha o
   bloco "Os dias que você entrega" embaixo (mesma fonte que os chips já
   pedem no boot — zero fetch novo). É a resposta ao domingo: "então quando
   eu entrego?" continua respondida, agora na tela onde a ação mora.
2. **Créditos** ("monte a rota pra saber") → pé da Montagem, junto do
   "Montar rota <dia>" — o custo-preview já roda nesse fluxo; dinheiro
   aparece onde a decisão acontece.
3. **"+ Parada" / "Ver mapa"**: já têm casa (dock da Montagem · aba Rota).
   Só conferir que o caminho "domingo sem nada" ainda alcança o "+" (alcança:
   a Montagem abre pelo dock do mapa).
4. **`dataLonga`** ("Domingo, 9 de agosto") → cabeçalho da Montagem, que
   virou a dona do dia.

### A3 — A VASSOURA DA VIRADA — ⚠️ O PLANO ESTAVA ERRADO EM DOIS PONTOS (medido 09/08)

**1. A torneira já foi fechada, e não por mim.** O commit `c690e4bc` ("a
torneira — o prepare parou de materializar no dia de hoje", publicado 03:36)
matou a causa que eu descrevi: escolher "Seg" no domingo agora PREPARA A
SEGUNDA, e as entregas nascem no dia delas. O "puxava rota atrasada" que o dono
viveu tinha essa origem.

**2. A vassoura já existia — o que faltava era o ALCANCE.**
`encerrarDiasAnteriores` (`logistica-fechamento-caixa.util.ts`, F0 27/07) já
fecha rota e entrega de dia passado, lazy, no início de
`prepare`/`start`/`materializeForRoute`. Construir outra teria sido inventar
bug em cima de mecanismo pronto.
O que ela tinha era um ponto cego: o `WHERE` exigia `agendaOcorrenciaKey` ou
`rotaModeloId` — "só o que a montagem trouxe". **Medido em produção: das 109
entregas abertas de dias passados, 107 não tinham nenhum dos dois** (company 5
com 14 de 21/07, bancada 39 com 93 de 11/07, `origem` nulo, nenhuma tocada).
Toda entrega nascida fora da agenda — a avulsa do "+", o painel web, a
importação — ficava `agendada` para sempre, invisível dos dois lados.
✅ **Feito (`0b6e8be4`):** a cláusula saiu; as quatro que protegem de verdade
ficam (sem `startedAt`, sem comprovante, cobrança `pendente`, `stopLivreWhere`).
Produção se cura sozinha na próxima montagem de cada empresa — nenhum UPDATE
na mão. Vacinas: órfã de dia passado fecha; órfã com cobrança contabilizada não.

O desenho original desta fase, mantido como registro:
- Regra nova no servidor: **entrega `'agendada'` de dia operacional passado,
  sem `LogisticaRoute` ACTIVE pendurada, ganha desfecho automático**
  (`'cancelada'`, motivo "dia encerrado", evento no `AgendaEvento`).
  Dinheiro e histórico intocados; a cadência regenera o cliente no próximo
  dia dele (medido: o gerador só materializa o dia corrente — dia passado
  não renasce).
- **Respeita a madrugada:** dia com rota ACTIVE não é "passado" até
  encerrar — a pendência "rota some à meia-noite" segue frente própria; a
  vassoura não a piora nem a cura.
- Onde roda: no primeiro toque do dia por empresa (dentro do
  `getDayPreview`/`prepare`, idempotente) — sem cron novo.
- É a mesma limpeza que já foi feita NA MÃO duas vezes (André 236, empresa
  48) — vira lei em vez de plantão.

### A4 — PROVA (cena de aceite, g15)
- **Domingo, empresa 48:** abrir app → mapa "Sem paradas hoje" + "Montar
  rota"; sem botão Lista; Montagem → "Nada a exibir hoje" + semana + créditos
  no pé; **ZERO "137"**.
- **Quarta:** Montagem abre já montada (o auto de 08/08 continua) com a
  agenda de quarta + avulsas — nada de ontem.
- **Rota montada:** "Lista" volta na barra; "Rota de hoje" idêntica.
- Portões: `casca-conferir` 66/66 · `antes-e-depois` só acusa as telas
  mexidas · teste da vassoura (fixture: entrega de ontem `'agendada'` → 1ª
  leitura de hoje a cancela; com rota ACTIVE → fica).

## 6. DECISÕES DO DONO — GO DADO (09/08)

- **D1 — a vassoura pode cancelar sozinha? SIM.** Aplicado como AUMENTO DE
  ALCANCE da vassoura que já existia (§A3), não como mecanismo novo.
- **D2 — o rótulo "Não entregues" pro grupo `cancelada`: a pergunta se
  dissolveu.** Os três grupos só existiam no modo agenda; com o modo fora,
  `DESFECHOS` e `listaParadasSeparada` morreram inteiros. Durante a rota quem
  conta desfecho é o filtro "Fila / Entregue", que já existia.
- **D3 — semana só no vazio da Montagem: SIM.** Implementado assim.

## 7. O QUE NÃO MUDA

- **Agenda-DADO** (`LogisticaPlanoEntrega` + Item) — é o verbo Agendar do
  `PR09082026-ROTA-SEIS-VERBOS`; desktop segue editando, gerar-dia segue
  bebendo. Este plano é o irmão de TELA daquele plano de BANCO; rodam
  independentes, qualquer ordem.
- Caderneta, DOIS MODOS, fechamento, tela de créditos, "Rota de hoje".
- O auto-montar ao abrir a Montagem (ordem explícita do dono, 08/08) — com a
  vassoura, ele volta a puxar só o dia REAL.

## 8. CONTA

- Mock: ~40 linhas do ramo agenda + campos órfãos. Ponte: publicação da
  semana muda de alvo. Backend: vassoura ~80 linhas + teste. **Saldo
  negativo de linhas; uma pergunta ("o que é meu dia?") passa a ter UMA
  resposta na tela — a mesma cura do SEIS VERBOS, no pixel.**

## 9. STATUS

- [x] GO do dono (D1–D3) — 09/08
- [x] **A1 — modo agenda morre** (`a8974fdc`): porta (`temRotaNoDia`),
      `tituloAgenda`, KPI "agendadas", rótulo "O que está agendado",
      `DESFECHOS`, `listaParadasSeparada`, `qtd*` — e a tela de reserva
      `T.rotafoto`, que era cópia sem porta com 6 clientes de mentira.
- [x] **A2 — moradias** (`a8974fdc`): semana no vazio da Montagem, créditos no
      topo dela, data por extenso como subtítulo.
- [x] **A3 — alcance da vassoura** (`0b6e8be4`): ver §A3 — o plano estava
      errado, a vassoura já existia e a raiz já tinha sido tapada.
- [ ] **A4 — prova no g15**: pendente por construção. O front vive no APK, e
      APK só se refaz no `npm run publish` — o código publicado às 05:02 é
      ANTERIOR a estes dois commits. Cena a conferir no aparelho: domingo sem
      botão "Lista"; Montagem com semana + créditos + data; quarta montando só
      o dia real; rota montada com a "Rota de hoje" idêntica.

## 10. PORTÕES DESTA ENTREGA

`casca-conferir` 60/60 (mock == pele, 30 telas × 2 modos) ·
`casca-antes-e-depois` acusa só `montagem` (a tela mexida) · prova de cena com
45 asserts nos 7 estados da rota · `fechamento-caixa` 5/5 · `admin-route` 7/7 ·
`tsc` 0.
