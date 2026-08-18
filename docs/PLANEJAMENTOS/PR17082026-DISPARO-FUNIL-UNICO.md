# PR17082026 — DISPARO: UM FUNIL, UM MOTOR, UMA TELA

> Nascido do incidente de 17/08 17:39: seleção em massa na tela `/automacao?secao=prospeccao`
> inscreveu 124 leads na cadência, o passo "dia 0" venceu na hora pra todos e **126 mensagens
> idênticas saíram pelo chip do dono num minuto** — atravessando um sistema que TINHA freio de
> 10 frios/dia publicado. O chip não caiu por sorte (número com anos de história real).
> Decisão do dono: **regras fechadas aqui; a limpeza/execução qualquer sessão executa depois.**

## A CENA DE ACEITE (Encomenda com Foto)

"Abro `/automacao`, configuro 3 blocos (quem envia / o que sai / ritmo), aperto **LIGAR** uma
vez. Daí em diante: a tela mostra *'hoje: 4 de 10 enviados · próximo às 14:32'*; **nenhuma**
mensagem sai fora disso; selecionar 200 leads muda a AGENDA dos próximos dias, nunca o volume
de hoje. No `/vendas` eu só trabalho lead — lá não existe configuração."

## AS 7 REGRAS DE FERRO (o contrato do sistema)

**R1 — UM CANO.** Todo envio automático de WhatsApp sai por um único ponto de despacho
(`messaging.service`), onde moram TODOS os freios. Enviar por fora **não compila** (o método
cru de envio à bridge fica privado/renomeado; caminho paralelo = erro de build, não code review).

**R2 — TETO É DO CHIP E É AUTOMÁTICO.** Cada chip tem teto diário calculado da própria
história (idade + conversas que RESPONDERAM). **Chip sem história = teto 0 frio** (o furo que
matou a Maria Clara: hoje chip zerado ganha teto 6). Teto de chip não é editável em tela nenhuma.
**E o teto diário vale pra TODO disparo automático — contato "conhecido" também.** (Hoje
contato conhecido não tem limite NENHUM de volume — foi o furo central de 17/08.)

**R3 — SELEÇÃO NUNCA É ENVIO.** Ação em massa (selecionar N, importar lista, ligar) só produz
**AGENDA** distribuída em dias, dentro dos tetos. "Enviar agora" não existe para N>1. O passo
"dia 0" da cadência morre — vira "primeiro slot livre da agenda".

**R4 — RITMO É UM SELETOR SÓ.** Conservador / Médio / Agressivo + janela de horário são os
únicos números que o usuário toca. Todo o resto (intervalo, variação, tentativas) deriva do
seletor. Config numérica solta em tela = bug.

**R5 — COPY NUNCA REPETE.** Variantes obrigatórias na sequência; mesma copy para 2 contatos
frios na mesma janela → o 2º é cancelado com motivo legível (o anti-carimbo já existe — passa
a morar DENTRO do cano, valendo pra todo caminho, não só pra um).

**R6 — RESPONDEU, SAIU.** Resposta do lead cancela os passos futuros na hora e vira conversa
(IA/humano). Robô nunca fala em cima de quem já respondeu.

**R7 — PAPEL DO CHIP.** Todo chip conectado declara papel na tela: **"Atende"** ou
**"Prospecta"**. Chip "Atende" nunca dispara frio — regra de produto, não exceção de código.
(Resolve o chip pessoal do dono por REGRA: ele fica "Atende".)

## O QUE MORRE (kill list — regra do corte: configura disparo e não é a cadência? deleta)

- `VendasAutomationCampaign` **inteira** e tudo que a lê (aposentada 25/07 como depósito de
  texto — os `firstContactVariants` migram pra dentro da sequência da cadência; tabela dropa).
- O disparo em massa da tela `/automacao?secao=prospeccao` (a ação passa a ser "inscrever na
  agenda", R3).
- Toda config de janela/ritmo fora de `VendasComercialConfig` (fonte única; a tela edita só ela).
- Cartão de nível escrevendo em campos de campanha (`vendas-nivel-disparo` passa a ler/escrever
  só a casa do risco).
- Passo "dia 0 = agora" em `cadencia-personas.ts`.
- Qualquer chamada outbound à bridge do Webwhats fora do cano (anexo A lista os call-sites).

## O QUE FICA

- **Cadência = único motor.** Runner ganha teto por giro (máx. 1 msg por chip por giro) —
  restart de backend nunca mais drena fila represada de uma vez.
- **`messaging.service` = o cano** (R1), com os freios já publicados (cold gate, janela
  comercial, throttle, chip-trust) tornados INEVITÁVEIS.
- **`/automacao` = única tela de config** (3 blocos + botão). **`/vendas` = só trabalho.**

## A TELA (config uma vez, depois só ligar)

1. **Quem envia** — chips conectados: selo de saúde (motor ao vivo), papel (Atende/Prospecta),
   teto do dia calculado (só leitura).
2. **O que sai** — a sequência com variantes (entrevista/persona da IA já mora aqui).
3. **Ritmo** — seletor Conservador/Médio/Agressivo + janela.
4. **LIGAR/DESLIGAR** + painel vivo: "hoje: X de Y · próximo às HH:MM · fila: N leads, termina ~DD/MM".

## VACINA (teste que gruda o incidente na parede)

Reproduzir 17/08: inscrever 100 leads às 17:39 → **0 envios no minuto**; agenda gerada respeita
teto/dia e janela; derrubar e subir o backend no meio → nada dispara no boot além do slot
normal. Esse teste nasce ANTES da correção (fixture do incidente) e reprova o código atual.

## FASES DE EXECUÇÃO (cada uma = 1 cena visível + vacina; qualquer sessão executa)

- **F1 O CANO** — fechar todo bypass; R1+R2 (teto 0 pra chip virgem); vacina do blast.
- **F2 A AGENDA** — R3: massa→slots; dia-0 morre; runner com teto por giro.
- **F3 A FAXINA** — kill list inteira; migração dos textos; drop de tabelas/colunas mortas.
- **F4 A TELA** — 3 blocos + botão + painel vivo; R7 (papel do chip); `/vendas` sem config.

## DECISÕES

- ✅ Dono (17/08): cancelar a sequência dos 124 do blast — **FEITO** (124 `cancelada` no banco).
- ✅ Dono (17/08): regras fechadas neste doc; execução por qualquer sessão depois.
- ⬜ Rumo do frio em escala (Baileys em gota × API oficial da Meta com template, ~R$0,30–0,45/
  conversa e zero ban — como o mercado escala). NÃO bloqueia este plano; fica pra depois da fusão.

## ESTADO JÁ EXECUTADO (17/08, emergência)

- 100 inscrições ativas pausadas 17/08 ~17:50 (`FREIO-EMERGENCIA-17/08-blast`), matando a onda
  das 08:00 de 18/08; em seguida **124 canceladas** (`CANCELADA-DECISAO-DONO-17/08`) por decisão
  do dono. Fila zerada: nenhuma inscrição ativa na empresa 5.
- Chip do dono `company-5-user-6` seguia `open` após o blast (126 fromMe em 12h, medido no
  `webwhats_prod`).

## ANEXO A — autópsia técnica (por que o freio de 10/dia não pegou)

**Não houve bypass.** O envio passou pelo ponto único e por TODOS os gates
(`messaging.service.ts` `sendOne`: contact-control → supressão → janela → throttle → cold gate).
Os 4 furos, medidos em 17/08:

1. **"Conhecido" = sem limite nenhum.** `wa-cold-contact-gate.service.ts:393` — se o contato
   não é frio, `return allow` pula teto, espaçamento E anti-carimbo de uma vez.
   `isColdContact` (`:311-360`) marca "conhecido" se existir QUALQUER mensagem prévia em
   qualquer conversa irmã — inclusive conversa importada pelo sync do motor
   (`company-whatsapp-customer-sync.service.ts:338`). O dono selecionou leads do board (gente
   com histórico) → gate inerte pra todos. Contato conhecido não tem teto de volume em lugar
   NENHUM do caminho comercial.
2. **A porta de massa não agenda nem varia copy.** `POST /automation/plays/cadencia/:id/aplicar`
   (`automation.controller.ts:96` → `cadencia.service.ts:289` `aplicarForUser`) grava
   `nextStepAt = now` pra todos (passo `dia: 0` de `cadencia-personas.ts:54`) sem reservar slot
   na agenda e sem reservar variante (`aberturaCopy` fica NULL → todos recebem o `corpo` FIXO,
   `cadencia.service.ts:839-840`). A porta certa já existe e faz tudo isso —
   `vendas.service.ts:6085` `ligarRoboForUser` (slot + carimbo + variante) — mas só pra 1 lead.
   Rota legada duplicada ainda viva: `POST /cadencia/:id/aplicar` (`cadencia.controller.ts:53`).
   Na tela, "Selecionar visíveis" marca até ~240 leads (`secao-prospeccao.tsx:751`, board
   `secao-prospeccao.tsx:618-620`); modo "Pesquisa salva" resolve até 500
   (`cadencia.service.ts:376-403`).
3. **O "teto diário" do runner é por MINUTO (bug).** `cadencia.service.ts:45-48` promete teto
   por empresa/dia (`CADENCIA_WHATS_DAILY_CAP_PER_COMPANY=10`), mas o contador é um `Map` local
   ao tick (`:436`) — zera a cada giro de 60s. Teto real: 10/empresa/**minuto**. Runner pega 50
   vencidas por tick (`:416-419`, `RUNNER_BATCH=50`) e drena até esvaziar.
4. **Throttle ligado, mas é ritmo, não volume.** `HBX_WA_SEND_THROTTLE_ENABLED=true` confirmado
   no container em 17/08 — limitou a ~8/min e deixou os 126 saírem ao longo de ~16min (teto de
   120/h não morde).

**Bypass real da bridge (fora do funil, NÃO comerciais — viram exceções documentadas ou entram
no cano na F1):** `auth.service.ts:2292` (código de confirmação), `master-alert.service.ts:377,556`,
`master-payment-notifications.controller.ts:104`, `messaging.service.ts:2693` (auto-alerta),
`fiscal-envio.service.ts:123` (sendMedia).

## ANEXO B — inventário das superfícies de config (o mapa da faxina F3)

- **`VendasComercialConfig`** (schema:4998) — a casa do risco. **DUAS telas escrevem**:
  `automacao/regras-casa.tsx:72` (`PATCH /vendas/agenda-disparo/config`) e o drawer "Disparo
  frio" `bot-prospeccao-panel.tsx` (`PATCH /vendas/automation/prospecting/config` →
  `vendas-automation.service.ts:1655-1680`). → vira UMA porta de escrita.
- **`VendasAutomationCampaign`** (schema:4707) — aposentada, sobrou alvo + `messageTemplate` +
  `filtersJson.firstContactVariants` + buffers. Lida por `vendas-automation.service.ts:1558,
  2222, 3024, 4061` e `messaging.service.ts:2503`. → MORRE; variantes migram pra cadência.
- **`Cadencia`/`CadenciaInscricao`/personas** — o motor. Duas portas de inscrição com regras
  diferentes (`aplicarForUser` massa sem agenda × `ligarRoboForUser` certinho). → UMA porta.
- **`vendas-nivel-disparo.ts`** — presets que expandem pra VendasComercialConfig. FICA (é o R4).
- **`wa-chip-trust.ts`** — teto por chip (base 6/máx 12), sem tela. FICA com R2 (virgem=0).
- **Cold gate / janela / throttle** — envs sem tela (`wa-cold-contact-gate.service.ts:152-195`,
  `wa-janela-comercial.gate.ts:69`, `wa-send-throttle.service.ts:66-98`). FICAM dentro do cano;
  throttle deixa de depender de env (sempre ON no caminho automático).
- **`agenda-disparo.service.ts`** — os slots. Hoje só cobre passo N+1 do runner e o robô
  por-lead; a porta de massa não passa por ele. → passa a ser O calendário de TODO disparo (R3).
- **Flags do runner** — `HBX_AUTOMATION_RUNNER_ENABLED`/`HBX_CADENCIA_TICK_MS`/caps
  (`cadencia-scheduler.service.ts:22-36`, `outbound-orchestrator.service.ts:56`). Cap por
  empresa/dia vira contagem PERSISTIDA (mata o Map por tick).
