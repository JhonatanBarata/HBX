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

### A3 — A VASSOURA DA VIRADA (a RAIZ do "puxava rota atrasada")
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

## 6. DECISÕES DO DONO (gate)

- **D1 — a vassoura pode cancelar sozinha?** (única que muda dado).
  Recomendo SIM: é o que a faxina manual já fez 2×, o desfecho fica no
  histórico e é reversível por dado. Alternativa conservadora: só esconder
  da tela (mantém o pus no banco).
- **D2 — o rótulo "Não entregues" pro grupo `cancelada`** na Rota de hoje
  fica? Recomendo SIM (é a língua do desfecho do motorista), mas registro o
  atrito com [[cancelar-e-cancelar-um-verbo-so]].
- **D3 — a semana aparece na Montagem também com lista cheia?** Recomendo
  NÃO: só no estado vazio — com lista cheia os chips já contam os dias.

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

- [ ] GO do dono (D1–D3)
- [ ] A1 — modo agenda morre
- [ ] A2 — moradias (semana, créditos, dataLonga)
- [ ] A3 — vassoura da virada
- [ ] A4 — prova no g15
