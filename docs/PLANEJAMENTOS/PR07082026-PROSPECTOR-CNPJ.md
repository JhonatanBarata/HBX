# PR07082026-PROSPECTOR-CNPJ — a rota que prospecta (APK logístico)

Origem: brainstorm do dono 07/08 ("localizar empresas cujo passa entre a rota, modo falante,
ativável no Ajustes"). Fechado no mesmo chat com as regras do dono (seção 0). Método fable.md.
**Regra de ouro do dono: NÃO FAZER NADA DO ZERO — temos quase tudo.** A seção 2 é o mapa do
reuso, conferido arquivo por arquivo em 07/08.

## Prova de mercado (medida em produção, 07/08, VPS)

Rota real da company 41 (Rio Claro-SP, 27 paradas entregues nos últimos 30 dias) cruzada com
`CnpjGeo` (pino nível 1-2) num raio de 150 m por parada:

| Medição | Número |
|---|---|
| CNPJs a ≤150 m de alguma parada (pino nível 1-2) | 1.513 (1.428 ativos) — **~53 por parada** |
| Cesta "sede de água" (salão, saúde, escritório, academia, escola, alimentação, oficina, imobiliária) | **463** ativos — 457 com telefone na RFB, 251 MEI |
| CNAE nº1 do corredor | cabeleireiro/manicure (75) |
| Possível REVENDA (varejo de bebidas) | 22 |
| Exemplos | serralheria a 2 m, varejo de bebidas a 2 m, engenharia a 5 m de clientes atuais |

A consulta roda em ~1 s com os índices existentes (`CnpjGeo @@index([lat,lng])` + `nivelGeo`).
Conclusão que dimensiona o produto: **53/parada obriga funil** — o produto é ESCOLHER, não listar.

---

## 0. Decisões CRAVADAS pelo dono (chat 07/08 — não reabrir sem ele)

1. **Empresas aparecem no MAPA do APK, APAGADAS** (dimmed) como possíveis — e **acendem
   sozinhas 3 a 5 vezes no dia** (se o prospector estiver ativado).
2. **Acende/fala SÓ quando o GPS não tem o que falar** — a fala do prospector NUNCA corta a
   voz de navegação/chegada. Não é "5 minutos fixos": é vaga de fala calculada (seção 3.F1).
3. **Clique na empresa acesa → fala NA HORA** (prioridade de usuário). Se aceitar o disparo,
   **consome** (do teto do disparo).
4. **Aceite por voz é desejado** ("pode enviar", "aceito", "confirmo", "sim") — entra como
   fase própria gateada (F5), botão é sempre o fallback.
5. **Ajustes**: toggle "Prospector CNPJ" no MESMO padrão da cobrança e do aviso de chegada,
   cada um com sua **mensagem cadastrada** — e os 3 ficam ORGANIZADOS juntos ("arrume isso").
   ⚠️ conferido 07/08: aviso de chegada JÁ tem template (`avisoChegandoTemplate`); a cobrança
   whats tem toggle (`cobrancaWhatsAtiva`) mas a MENSAGEM É FIXA em código — o "arrume" inclui
   dar template à cobrança (F4).
6. **Só admin**; motorista SÓ se o admin liberar — mesmo padrão do `passeioEquipe`.
7. **Disparo pela MESMA LEI do disparo frio e pelo MESMO MECANISMO** (janela de horário, teto
   do nível de disparo, freio anti-ban, zap-check, ponte única do motor). O disparo do
   prospector CONSOME o mesmo teto diário da empresa ("consumir a lei do disparo se estiver
   ativo na empresa") — contador ÚNICO, nunca um paralelo.
8. **Disparos automáticos são LIMITADOS e COBRADOS como automação** — chave liga/desliga no
   /master (padrão dos gates de nível/master que já existem na logística).
9. **Clicar na empresa e ABRIR O LEAD cobra 1 crédito** (igual ao claim do sistema) **e já
   salva a empresa na mesa de leads do /vendas — DESKTOP** (o APK captura; o lead MORA no
   /vendas, o celular não ganha bancada de lead).

## 1. Leis herdadas que mordem aqui

- **Chip real NUNCA é cobaia** — teste de disparo só em número descartável ([WHATSAPP.md]).
- **Trava de horário é fonte única** — clique às 19h = disparo agendado pro próximo slot da
  janela, e a UI DIZ isso honesto ("envio amanhã às 8h"), nunca envia fora.
- **Fila offline do APK é LISTA BRANCA** — campo novo do desfecho que não entrar na lista
  some calado (armadilha documentada em hbxapk.md).
- **Cor nasce token, nunca hex solto** (cascalogistica.md) — o "apagado" e o "aceso" do pino
  são tokens da pele 2.0.
- **Enfeite não derruba rota**: a consulta de corredor falhando = rota monta SEM prospectos
  **com alarme no log** (lição CNEFE: best-effort que engole erro precisa de alarme). Nunca
  bloquear o iniciar-rota por causa do prospector.
- **Multi-tenant**: corredor exclui quem JÁ é cliente/lead do tenant; nada atravessa empresa.
- **LEI DO VENDEDOR**: motorista vê o FATO (pino, nome, ramo), nunca saldo/valor.
- **Pino honesto**: só nível 1-2 entra. Nível 3-4 não vira anúncio de proximidade (31/47
  "duplicatas" da company 41 eram pino grosseiro — memória endereco-identidade).
- **Entregar LIGADO**: default OFF por empresa (opt-in do admin), mas a feature nasce
  funcional de ponta a ponta, sem chavinha interna pela metade.

## 2. MAPA DO REUSO (conferido em 07/08 — nada do zero)

| Preciso de | JÁ EXISTE em | Uso |
|---|---|---|
| Pino do CNPJ | `backend/prisma/schema.prisma` → `CnpjGeo` (lat/lng/nivelGeo/spreadM + índices) | consulta de corredor |
| RFB (nome, CNAE, fone) | `CnpjPublicCompany` (+ `cnaeSecundarias` GIN) | ficha e cesta CNAE |
| Paradas com pino | `CustomerProfile.lat/lng`, `LocalEntrega.lat/lng`, `Entrega.arrivedAt/deliveredAt` | corredor + gatilho de fala |
| Padrão toggle+template+condição | `logistica-config.service.ts` → `avisoChegandoEnabled/Template/DistanciaM` | copiar shape pro prospector |
| Liberação admin→equipe | `passeioEquipe` (mesmo arquivo) | `prospectorEquipe` |
| Gate global por env | `logistica-cobranca.flags.ts` (`isCobrancaWhatsEnabled`) | `HBX_PROSPECTOR_ENABLED` |
| Gate de plano/master | `logisticaNivel` + `setNivel` (MasterGuard no controller) | cobrança da automação no /master |
| Render de template | `renderTemplateAviso` (função pura, mesmo arquivo) | mensagem do prospector |
| Janela de horário | `backend/src/vendas/business-hours.util.ts` (America/Sao_Paulo) | trava do disparo |
| Teto/nível de disparo | `backend/src/vendas/vendas-nivel-disparo.ts` ("nível é INTENÇÃO; freio é FÍSICA") | consumo do teto único |
| Runner de envio | `backend/src/cadencia/` (scheduler + service) | disparo agendado/imediato |
| Porta única do motor | `backend/src/messaging/webwhats-bridge.service.ts` + `zap-check-guard.service.ts` | envio + freio físico |
| Crédito universal | `backend/src/credits/credit-wallet.service.ts` (já injetado na logística) | débito do claim (1 crédito) |
| Claim que vira lead | `webscraping/radar/05-delivery/*` (claim track-first) + mesa do /vendas | lead origem `prospector-rota` |
| Voz no APK | `NativeAppBridge.kt` → `speak()/speakStop()` (TTS pt-BR lazy) + `HbxSoundEngine.vozHabilitada` | fala do prospector |
| Anti-atropelo de voz | `RotaService.kt` → `vozPendente` + `ANTI_ATROPELO_VOZ_MS` + `tts.isSpeaking` | vaga de fala (F1) |
| Mapa no APK | Leaflet em `EntregaShell/app/src/main/assets/app/` | pinos apagados/acesos |
| Molde de pipeline de aviso | `logistica-cobranca-aviso.service.ts` ("consentimento → teto → claim → mensagem → caminho blindado") | prospector segue o mesmo desenho |

**Trabalho genuinamente NOVO**: a consulta de corredor como serviço (a SQL está provada — só
virar código), a tabela `ProspectoRota`, os pinos no mapa do APK, a vaga de fala, e o template
da cobrança (arrume F4). Todo o resto é ligação de peça existente.

---

## 3. FASES (ordem de execução; cada uma com portão de prova)

### F0 — Fundação backend: o corredor embarca na folha
- Migration: tabela `ProspectoRota` — `companyId`, `cnpj`, `nome`, `cnaeDescricao`, `lat`,
  `lng`, `distM`, `phoneDigits`, `estado` (`embarcado|aceso|clicado|lead|dispensado`),
  `rotaDia`, `acesoAt`, `clicadoAt`, `cooldownAte`, `leadId?`. `@@unique([companyId,cnpj])`
  vivo por cooldown (dispensado/ignorado 3× = cooldown 90 dias; virou lead = sai pra sempre).
- Campos em `LogisticaConfig` (padrão avisoChegando): `prospectorAtivo` (default false),
  `prospectorTemplate`, `prospectorRaioM` (default 150, clamp 50–500), `prospectorMaxDia`
  (default 4, clamp 1–8 — o "3 a 5" do dono), `prospectorEquipe` (default false).
- Master (padrão setNivel): `prospectorAutomacaoAtiva` por empresa + limite de disparos
  automáticos/dia — **cobrado como automação** (decisão nº8). Env global `HBX_PROSPECTOR_ENABLED`.
- Serviço `prospector-corredor.service.ts` (logística): no INICIAR da rota (mesmo ponto onde a
  reserva de estoque do B4 entra), roda a consulta provada: paradas do dia → bbox → `CnpjGeo`
  nível ≤2 → `CnpjPublicCompany` ativa → cesta CNAE → **exclui cliente/lead existente do
  tenant e cooldown** → ranqueia (CNAE fit > distância > porte) → **cap `prospectorMaxDia`×2
  embarcados** (acende só `prospectorMaxDia`, o dobro dá reserva pro clique manual) → grava
  `ProspectoRota` e devolve no payload da folha. Falha = rota segue sem prospectos + `logger.error`.
- **Portão F0**: rota real no g15 (company de teste) com JSON da folha mostrando os
  prospectos embarcados; consulta medida (<2 s); teste multi-tenant (company 5 logística-only
  não vaza pra 41).

### F1 — APK: pinos apagados, acendimento e a VAGA DE FALA
- Mapa da rota ganha os pinos dos prospectos EMBARCADOS em estilo "apagado" (token novo da
  pele 2.0 — opacidade/cor de token, nunca hex). Só renderiza se `prospectorAtivo` E ator
  autorizado (admin, ou motorista com `prospectorEquipe`).
- **Acendimento** (o "acende sozinha 3-5×/dia"): orçamento diário `prospectorMaxDia`; um
  prospecto acende quando (a) o veículo está a ≤ raio dele E (b) há VAGA DE FALA. Acendeu =
  pino ganha destaque + **uma frase curta de TTS** ("À direita, 60 metros: Salão Bela Vista")
  via `NativeAppBridge.speak()` — 1 frase, nunca repete no dia.
- **VAGA DE FALA (a resposta ao "tem como calcular?" — SIM):** predicado recalculado a cada
  tick do GPS, tudo com peça existente:
  1. `tts.isSpeaking == false` (já exposto pro HbxSoundEngine);
  2. `vozPendente` vazio (anti-atropelo do RotaService);
  3. nenhum alarme/sentinela ativo;
  4. **tempo previsto até a PRÓXIMA fala do GPS > ~30 s** — a próxima fala é conhecida: é o
     "Chegou: nome" no raio de chegada da próxima parada (e o aviso-chegando a 500 m).
     `ETA = distância até o raio ÷ velocidade atual` (fallback `velocidadeMediaKmH` da config).
  Ou seja: não é timer fixo — é "nenhuma fala prevista na janela da frase". Exatamente o que o
  dono pediu ("não precisa ser os 5 minutos, mas não pode cortar o GPS").
- **Clique no pino aceso (ou apagado) = fala NA HORA** (prioridade de usuário — só respeita
  `isSpeaking` do momento, fura o resto): fala nome, ramo e distância, e abre o card (F2).
- **Portão F1**: vídeo/print no g15 — pino apagado, pino acendendo SEM cortar o "Chegou",
  clique falando na hora. Prova negativa: com `prospectorAtivo=false` nada aparece.

### F2 — Clique → LEAD: 1 crédito e a mesa do /vendas (desktop)
- Card do prospecto no APK: nome, ramo, distância + 2 ações:
  - **"Abrir lead"** → débito de **1 crédito** no `CreditWalletService` (mesmo trilho
    track-first do claim do Radar) → cria lead no /vendas com origem `prospector-rota`
    (dedupe por CNPJ no tenant; se já existe, aponta pro existente SEM cobrar) → card confirma
    "na sua mesa do /vendas". O lead aparece na mesa DESKTOP — o APK não ganha tela de lead.
  - **"Dispensar"** → `cooldownAte` (90 dias); 3 dispensas = silêncio permanente.
- Sem crédito: mensagem honesta (o booleano `creditosEsgotados` JÁ viaja na config pro app).
- Offline: ação entra na fila offline (⚠️ LISTA BRANCA — adicionar os campos novos!); o
  débito acontece no replay server-side; UI otimista com estado "aguardando sinal".
- **Portão F2**: clique no g15 → extrato de crédito mostra o débito → lead visível na mesa do
  /vendas desktop com origem certa. Clique repetido no mesmo CNPJ não cobra 2×. Teste offline
  (modo avião → replay).

### F3 — DISPARO: a mensagem cadastrada pelo trilho do disparo frio
- No card do lead aberto (APK) e na ficha do lead (/vendas): botão "Enviar mensagem" →
  monta com `prospectorTemplate` (placeholders `{empresa} {ramo} {cidade} {saudacao}` via
  `renderTemplateAviso`) → **pipeline EXISTENTE**: janela business-hours → teto único do
  nível de disparo (consome o MESMO contador do disparo frio da empresa) → zap-check →
  `webwhats-bridge`. Nenhum caminho novo até o motor.
- Fora da janela: agenda pro próximo slot (mecanismo da cadência) e a UI diz quando.
- **Automático** (a empresa ligou automação no /master): prospecto que virou lead pode entrar
  na cadência sozinho, LIMITADO pelo teto de automação do master (decisão nº8) — e o teto do
  nível de disparo continua mandando (nível é intenção; freio é física).
- **Portão F3**: disparo de teste SÓ em número descartável; prova da trava (clique 19h → job
  agendado 8h, nada sai à noite); prova do teto (11º disparo do dia não sai no nível médio);
  contador único conferido (disparo do prospector aparece no mesmo extrato do disparo frio).

### F4 — ORGANIZAR OS 3 (o "arrume isso")
- **Cobrança ganha template**: `cobrancaWhatsTemplate` em `LogisticaConfig` (hoje a mensagem
  é fixa em `logistica-cobranca-aviso.service.ts`) — mesmo trim/slice/placeholders do
  avisoChegando; template vazio = texto atual (zero regressão).
- **Ajustes (APK admin + /logistica config desktop)**: seção única "Mensagens automáticas"
  com os 3 lado a lado, MESMO layout: Aviso de chegada · Cobrança · Prospector CNPJ — cada um
  com toggle + mensagem cadastrada + condição (distância / vencimento / raio+vezes por dia).
  Padronizar = IGUALAR, não decorar.
- **Portão F4**: print da seção nos 2 lugares; template de cobrança editado no Ajustes sai
  numa cobrança de teste; template vazio manda o texto de sempre.

### F5 — ACEITE POR VOZ (gateada — ⬜ GO do dono depois do F1-F3 provados em campo)
- `SpeechRecognizer` do Android com janela curta (~5 s) após a fala do prospector, gramática
  mínima ("sim", "aceito", "confirmo", "pode enviar", "não"). Botão SEMPRE como fallback.
- Riscos que gatearam: ruído de cabine, permissão de microfone, falso positivo (rádio do
  carro dizendo "sim"). Mitigação: só escuta na janela pós-pergunta + exige a palavra dentro
  da gramática + confirmação falada de volta ("Enviando pra Salão Bela Vista").
- **Portão F5**: teste em campo com veículo em movimento; taxa de falso positivo ZERO no
  teste (falso positivo aqui dispara WhatsApp — tolerância é zero).

---

## 4. Decisões em ABERTO (⬜ dono)
1. ⬜ Default de acendimentos/dia (proposto 4; range 1–8 no Ajustes).
2. ⬜ Raio default (proposto 150 m — o medido; range 50–500).
3. ⬜ Preço/limite da AUTOMAÇÃO no /master (o disparo automático é cobrado — quanto/dia?).
4. ⬜ Nome comercial da feature (toggle fica "Prospector CNPJ" como pedido; sugestão de
   marketing: "Radar de Rota").
5. ⬜ GO da F5 (voz de comando) após campo.
6. ⬜ Cobertura fora de SP: `CnpjGeo` hoje é SP-only (CNEFE). Rio Claro = 83% N1+N2, piloto
   perfeito; outras UFs entram pela carga noturna já agendada — feature avisa "sem cobertura
   na sua região" honesto onde não houver pino.

## 5. Ordem pro orquestrador (Opus ultracode)
F0 → F1 → F2 → F3 → F4 (F5 só com GO). F0 e F4-template-cobrança podem andar em paralelo
(não se tocam). Cada fase fecha com o PORTÃO provado (print/medida no g15) antes da próxima.
Commits locais na master (lei do dono: sem branch); publish SÓ quando o dono mandar.
Teste de disparo: número descartável, nunca chip do dono. Backend local não hot-reloada
(container — `docker restart backend` após editar).
