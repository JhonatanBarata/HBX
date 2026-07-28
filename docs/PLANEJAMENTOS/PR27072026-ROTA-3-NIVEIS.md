# PR27072026 — GERENCIADOR DE ROTA EM 3 NÍVEIS (Basic / Advanced / Full)

> **ESTADO (28/07 ~06h) — TUDO DESTE ARQUIVO ESTÁ NO AR E TESTADO EM PRODUÇÃO.**
> F0 motor confiável ✅ · F1 três níveis ✅ · F2 estoque+parada amarela ✅ ·
> F3 rastreamento-produto ✅ · F4 quarentena de importação ✅ (deploy `2284edcd`).
> Depois disso, na madrugada de 28/07, entraram e foram publicadas 3 coisas —
> ver "O que entrou na madrugada de 28/07" logo abaixo.
>
> **✅ PÁGINA DE LOGÍSTICA NO WEBSITE — FEITA (28/07, commit `6cb79ce7`), aguardando
> `npm run publish`.** Era a última peça da frente. Detalhe na seção "A página do
> site" no fim deste arquivo.
>
> Incidentes desta frente: [[tx-any-engole-erro-prisma]] e
> [[guerra-de-sessoes-paralelas-add-a]].

## O que entrou na madrugada de 28/07 (tudo publicado e verificado em prod)

**1. Repassada das pendências** (`6cdedca9`) — o que estava pela metade:
- **Tela do extrato de eventos da agenda na ficha do cliente**: o endpoint existia
  desde 27/07 e NENHUMA tela lia (F0 item 3 entregue pela metade). Painel só-leitura
  no drawer de Contatos (que `/logistica/clientes` reusa), com o que mudou em
  de→para, origem, autor e dia/hora em `America/Sao_Paulo` fixo.
- **Estoque no BASIC**: o 403 do gate virou o selo "Disponível no Advanced"
  (ver-mas-não-usar), no lugar da tela vermelha de erro.

**2. Família do dinheiro órfão** — 3 bugs da mesma raiz, ver seção abaixo
(`6cdedca9`, `b3f92dad`, `189b849c`, `1aa54630`), **publicados e testados E2E em
produção**, mais o reparo dos 3 registros reais.

**3. Preço HÍBRIDO dos 3 níveis** (`40aef2ab`) — plano-mestre próprio em
[docs/PLANEJAMENTOS/PR28072026-ROTA-PRECO-HIBRIDO.md](PR28072026-ROTA-PRECO-HIBRIDO.md).
Mensalidade fixa **99/199/299** + **franquia de paradas** inclusa no mês
(300/600/1000); o excedente segue consumindo crédito. Preço e franquia editáveis
no Master (janela Créditos → guia **Rota**). O tenant vê "usou X de Y paradas do
plano neste mês" na tela de regras.

**4. Painel de controle do Master** (pedido do dono: *"é importante eu ter controle
sem depender de vc"*) — na guia **Empresas** da janela de Créditos, uma linha por
empresa com **Conta HBX** (Crédito × Empresarial, só leitura), **Plano de Rota**
(troca na hora), **franquia do mês**, saldo/lotes e as ações **Conceder** e
**Debitar** (com atalho "Zerar saldo"). O débito nunca deixa saldo negativo, exige
motivo e é idempotente. Regra que nasceu daí: [[dono-controla-sozinho-no-master]].

⚠️ **Não confundir os DOIS eixos de "plano"** (correção do dono, 28/07): *Conta
HBX* (`accountType` Crédito × Empresarial, com a chavinha de contrato empresarial
que já faz valor fixo) é da PLATAFORMA; *Plano de Rota* (Basic/Advanced/Full) é do
PRODUTO. Não criar um terceiro.

⚠️ **Mudança de unidade feita por outra sessão em 28/07** (`26a6090d`): a Logística
Simples passou a cobrar **por parada (0,4 crédito)** no lugar do bloco de 5
(2 créditos) — 5 paradas seguem custando 2, mas 6 custam 2,4 em vez de 4. Quem
mexer em franquia/billing precisa saber: **1 claim = 1 parada** (`PARADAS_POR_BLOCO
= 1`), na Simples e na Rastreada.

### Aberto (decisão do dono)
- **Taxa de implantação** (destrava a IA de visão da F4 fase 2).
- **Cobrar a mensalidade automaticamente**: nenhuma empresa tem `CompanySubscription`
  — os R$ 199 são ato comercial FORA do app. Amarrar no MercadoPago é decisão dele.
- **Reembolso** no Master: adiado por ele (*"vou sofrer quando chegar"*). Antes de
  codar, definir se é estornar crédito, devolver o dinheiro da recarga, ou os dois.
- Se os 3 níveis viram família de plano própria no checkout (a 41 é logística-only,
  então "Rota Basic 99" bateria de frente com o "Padrão 99" da plataforma).

### MVPs mantidos de propósito
Estoque = 1 caminhão/dia sem seletor de motorista (multi-caminhão é trimestre);
`{eta}` vazio sem rota rastreada é degradação prevista, não bug.

### Não verificado por mim
A **tela do Master** (não tenho a senha do usuário master `Jhonatan`; a credencial
de teste é a da empresa 5) e a **montagem de rota do piloto da 41** das ~6h de
28/07 — que é o primeiro caso real da franquia e do freio do reabrir rodando juntos.

## Dinheiro órfão: 3 bugs da mesma família (achados ao resolver a Dejanira)

`POST /logistica/entregas/:id/reabrir` devolvia a entrega pra 'agendada' e NÃO
olhava o dinheiro que o confirmar tinha criado. Quem reabria e não reconfirmava
deixava uma entrega "a fazer" com cobrança viva dentro — invisível pra todo
mundo (o fechamento de caixa se recusa a tocar cobrança resolvida, e faz certo).

Varredura no banco de produção: **3 linhas no sistema inteiro**, todas da mesma
família, todas na noite de 23/07 e 26/07 —

| Empresa | Cliente | Entrega | Cobrança | Valor |
|---|---|---|---|---|
| 41 | Dejanira | agendada (reaberta) | paga | R$ 20 |
| 41 | Fran | cancelada (reaberta e cancelada) | paga | R$ 20 |
| 48 | Daniela | cancelada (reaberta e cancelada) | pendente (fiado) | R$ 11 |

**Freio publicado no código (`6cdedca9`):** reabrir entrega JÁ PAGA é recusado
com o valor na mensagem e o caminho pra resolver; fiado ainda pendente reabre
normal (nada foi recebido); toda reabertura vira linha `ENTREGA_REABERTA` no
extrato da agenda, com dia, hora e autor, na ficha do cliente.

**Porta do cancelar, fechada por ordem do dono (`b3f92dad`):** cancelar entrega
passa a cancelar junto a cobrança DELA que ainda não foi recebida (trava dupla
`status='pending'` + `paidAt IS NULL` — dinheiro recebido nunca é desfeito por
ali). Nenhum ramo lança exceção: `cancelarEntrega` é o mesmo caminho da fila
offline do APK e um throw quebraria o replay do motorista.

**Reparo dos 3 registros em produção (28/07, decisão "vale o último gesto"):**
Dejanira virou `entregue` (ninguém cancelou, o dinheiro entrou); as cobranças da
Fran (R$ 20) e da Daniela (R$ 11) foram canceladas — entrega cancelada não
cobra. Cada uma virou linha `CORRECAO_MANUAL` no extrato da agenda, então a
ficha do cliente mostra o conserto com de→para. Conferido depois: a query
`FinanceiroCharge JOIN Entrega WHERE status <> 'entregue'` não devolve mais
nenhuma cobrança viva.

**3º bug da família — O BUG DO VALOR (`1aa54630`):** reabrir existe pra "corrigir
quantidade ou incluir itens" e era exatamente nisso que falhava. O reconfirmar
recalcula `Entrega.valor` pelos itens, mas pula o bloco de efeitos inteiro
(`reabertaParaCorrecao` — e faz certo: não pode disparar WhatsApp nem criar 2ª
cobrança), então o charge ficava com o valor VELHO. **Entregou 3 galões, cobrou 2.**
`sincronizarCobrancaReaberta` aplica a MESMA regra dos outros dois freios: dinheiro
não recebido segue a entrega, dinheiro recebido não se mexe. Valor corrigido pra
ZERO (cortesia) cancela a cobrança em vez de deixar R$ 0,00 pendente — senão a
cobrança automática cobraria zero real no WhatsApp do cliente.

✅ **TUDO PUBLICADO E TESTADO EM PRODUÇÃO** (28/07 ~04h, deploy `1aa54630`). E2E real
na empresa sandbox 5 (nenhum cliente da 41/48 tocado, dados do teste apagados):
corrigiu 2→3 unidades ⇒ entrega R$ 30 **e cobrança R$ 30** (era o bug), 1 só
cobrança; `[Pago]` do APK quitou normal; reabrir entrega paga ⇒ **400** "Esta
entrega já foi paga (R$ 30,00). Cancele o recebimento no financeiro do cliente
antes de reabrir."

Detalhe da API pra quem for testar: `POST /auth/login` usa **`username`**, não `email`.

> Decisão do dono (27/07): o produto de logística vira ESCADA de 3 planos vendáveis.
> Este arquivo é o plano-mestre. Regra de ouro da arquitetura (dono, 27/07):
> **"os dias são organização; o financeiro começa quando confirma na porta"** —
> organizar nunca escreve, só executar escreve.

## Os 3 níveis (visão de venda)

| | **1º BASIC** | **2º ADVANCED** | **3º FULL** |
|---|---|---|---|
| Slogan | "Caderneta eletrônica que te coloca na localização" | "O app cobra por você" | "iFood da sua distribuidora" |
| Agenda + rota + endereços | ✔ | ✔ | ✔ |
| Histórico do cliente (dia/hora exatos) | ✔ | ✔ | ✔ |
| Registrar recebimento (pix/dinheiro/anotado) | ✔ (só registro, sem financeiro real) | ✔ | ✔ |
| Aviso "tô chegando" (WhatsApp) | ✔ | ✔ | ✔ |
| Financeiro real (saldo, fiado, fechamento, limite) | ✗ | ✔ | ✔ |
| Cobrança automática educada (aviso WhatsApp) | ✗ | ✔ | ✔ |
| Estoque de carga (saiu/vendeu/voltou) | ✗ | ✔ | ✔ |
| Devedor/inativo tratado na montagem da rota | ✗ | ✔ | ✔ |
| Rastreamento ao vivo + link "acompanhe sua entrega" | ✗ | ✗ | ✔ |

Preço de referência (mercado BR do nicho água/gás: SGA ~R$100-200, Gestor Gás ~R$80-150,
rastreador veicular avulso ~R$60-90/veículo/mês SÓ o rastreio):
**Basic R$ 79-99 · Advanced R$ 179-199 · Full R$ 279-299** (decisão final = dono).
Argumento de venda Advanced em dinheiro: 1 galão ≈ R$ 12-15 → o plano se paga
recuperando ~13 fiados esquecidos/mês.

## O que JÁ EXISTE no código (não reescrever — empacotar)

- Aviso "tô chegando": `avisoChegandoEnabled/Template/DistanciaM` (AVISO-CHEGANDO 11/07).
- Limite de crédito por cliente: `limiteCredito` no cadastro (schema + service + mobile).
- Toggle do financeiro: `moduloFinanceiroAtivo` (PR18072026 W-A, operacional, 3 níveis de folha de chegada).
- Financeiro real: charge nasce SÓ no confirmarEntrega (fiado/pago-na-hora, unique por entrega).
- Cobrança educada: `logistica-cobranca-aviso.service` (aviso WhatsApp de cobrança).
- Rastreamento: modo TRACKED, sessão GPS, trilha, ETA, link público de tracking.
- Recovery de devedor: `moduloRecoveryAtivo`.
- Billing da plataforma por parada (ESSENTIAL/TRACKED) com snapshot anti-fraude.
- Filtro de inativo na montagem: `CLIENTE_VIVO` no generateDay.
- Onboarding pela rua: Leitura de Rota / Registrar Caminho (a carteira nasce entregando).

**Conclusão de engenharia: NÃO deletar backend.** ~100 arquivos só de logística com
peças caras já pagas (billing anti-fraude, offline, fuso, CNEFE, disjuntor WhatsApp).
O defeito era UMA viga da agenda (incidente "sexta que não volta", fix `88c131f5`
publicado 27/07 17:46) + falta de empacotamento comercial.

## Frentes

### F0 — MOTOR CONFIÁVEL (hoje) — pré-requisito de tudo
1. Cursor `proximaData` só avança no DESFECHO da ocorrência (entregue/pulada/descartada
   devolve), nunca na montagem. Mata a família "comeu uma semana calada".
2. Rota de dia passado se encerra sozinha (auto `operationalEndedAt` — fechamento de caixa).
3. **Extrato de eventos da agenda** (pedido explícito do dono): toda mudança — dia da
   semana, avanço, devolução, descarte, materialização — vira linha com timestamp
   exato, autor e de→para, visível na ficha do cliente. Append-only.
4. Erro do prepare fala a verdade ("as paradas de sexta estão presas na rota de DD/MM").
5. Reparo de dados cia 48: 3 planos (21/08 → 07/08); devolver as 4 entregas de
   31/07 (hoje em 27/07) pra sexta — decidido pelo dono ("volta pro lugar").
6. **Reparo assistido cia 41 (cliente-piloto):** encerrar as 3 rotas zumbis
   (17/18/20-07), varrer as 511 entregas presas de dias passados (sem chave —
   cancelar/devolver com critério, sem tocar em dinheiro), corrigir os 3 planos
   de sexta 14/08 → 31/07, e conferir se o motor dela está no caminho V2 ou
   legado (presas sem chave sugerem legado). Sucesso = a rota de amanhã da 41
   monta limpa com as 54 de hoje + dias seguintes girando.
6. Suíte nos 3 fusos (`npm run test:agenda-fuso`) cobrindo os novos caminhos.

### F1 — OS 3 PLANOS COMO PRODUTO (1-2 dias)
1. Preset de 1 clique: escolher Basic/Advanced/Full seta o conjunto de toggles
   (nada de painel de chavinhas pro tenant). Matriz acima é o contrato.
2. Basic = financeiro real OFF (registro de recebimento continua; sem saldo/limite/fechamento).
3. Recurso bloqueado aparece acinzentado com "Disponível no Advanced" (ver-mas-não-usar
   é o motor de upgrade do mercado). Zero textão.
4. Full = liga TRACKED por padrão de rota.
5. Amarrar no sistema de módulos/planos existente (teto masterEnabled×enabled).
6. **Grandfathering (regra dura):** tenant existente NUNCA perde recurso em uso
   quando os níveis ligarem. Cia 41 usa financeiro real → entra como Advanced
   sem desligar nada; o que ela não usa (tracking, aviso chegando) segue OFF
   até alguém ligar. Virar a chave dos níveis não pode ser sentido por quem já opera.

### F2 — ADVANCED COMPLETO (2-3 dias)
1. **Estoque de carga** (única peça estrutural nova): conferência de caminhão do dia —
   carregou X, vendeu Y (soma dos EntregaItem, já existe), voltou Z; bateu/estourou.
   NÃO é almoxarifado/WMS. 1 tela, 2 números por produto.
2. **Devedor na montagem** (usa `limiteCredito` + saldo existentes):
   - default recomendado: devedor NÃO some — vira parada de COBRANÇA (amarela, sem
     produto novo; recuperar dinheiro > esconder cliente);
   - opção por config: excluir da rota (o pedido literal do dono vira toggle).
   - inativo: já filtrado (CLIENTE_VIVO) — manter.
3. Cobrança automática empacotada (aviso existente vira feature nomeada do plano).

### F3 — FULL POLIDO (1-2 dias)
1. Link "acompanhe sua entrega" pro cliente final (tracking existente, cara de produto).
2. Painel "onde está meu caminhão" pro dono do tenant.
3. Aviso de chegada com ETA fino (usa `etaAt` existente).

### F4 — MÁQUINA DE ENGOLIR LISTA PODRE (onboarding de base suja) — decisão dono 27/07
> Lição da empresa 41: cliente novo SEMPRE chega com lista nojenta e não vai digitar
> um por um no celular. Onboarding difícil = abandono no 1º mês.
1. **Quarentena obrigatória**: toda importação entra como rascunho; sanitizador
   existente (CNEFE, correção em massa, lista Cliente-problema) pinta verde/vermelho;
   dono confere só os vermelhos; efetiva → SÓ ENTÃO a agenda enxerga o cliente.
   A agenda NUNCA materializa em cima de rascunho (pecado original da 41).
2. **Boca única de importação**: arrastar arquivo (xlsx/csv), colar texto de WhatsApp,
   **enviar foto** (print/planilha/lista impressa = IA local; caderneta manuscrita =
   API de visão paga, centavos/página → cobrar como taxa de implantação R$ 99-299,
   padrão de mercado: vira RECEITA, não custo).
3. Consertar o upload web atual (dono: "pelo web está complicado esse upload"),
   inclusive mandando foto direto do celular.
4. **Empresa 41 é CLIENTE REAL esperando (correção 27/07 — NÃO arquivar!).** Ela é o
   cliente-piloto do reparo: base importada suja (245 planos), operação travou nas
   2 primeiras semanas. Inventário do entulho (banco 27/07): 3 rotas nunca
   encerradas (17, 18 e 20/07) prendendo 257 paradas congeladas; **511 entregas
   'agendada' penduradas em dias passados (10→25/07), TODAS SEM
   agendaOcorrenciaKey** (vieram do caminho antigo/importação → o resgate por
   chave do fix 88c131f5 NÃO as alcança — reparo assistido obrigatório na F0);
   3 planos de sexta (INTERVALO) saltados pra 14/08 (mesmos 3 clientes da 48).
   A segunda de HOJE (27/07) dela está intacta: 54/54 geradas aguardando rota.
   Config dela: financeiro real LIGADO, rotas ESSENTIAL → nível Advanced natural.

## Decisões do dono (27/07)
- ✅ Regra-mãe do motor (ponto 1): **"Registrou entrega? Blz. Não registrou? Volta
  tudo pro seu lugar."** Pedido extra (Maria liga segunda) = avulsa, NÃO mexe na
  recorrência (já é assim). Adiantar ocorrência = só por ordem explícita; consumida
  1x, volta no ciclo seguinte. Sistema NUNCA decide sozinho.
- ✅ Devedor: parada AMARELA "só cobrar" como default + opção na config de excluir.
- ✅ As 4 entregas de 31/07 em 27/07 = artefato de bug → devolver pra 31/07 (executar
  junto com F0, quando o dono liberar).
- ✅ Cia 41 = **cliente real esperando o sistema** (corrigido 27/07; a nota anterior
  "arquivar" estava ERRADA — era suposição minha). Ela vira cliente-piloto: reparo
  assistido completo na F0 + grandfathering na F1.
- ✅ Ordem de execução: F0 → F1 → F2 → **F4** → F3 (onboarding antes do polimento Full).
- ⚠️ NADA implantado ainda — dono trava execução até liberar ("preciso entregar esse
  sistema em ordem"). Reparo de dados TAMBÉM aguarda.

## Decisões ainda abertas (dono)
- Preço final dos 3 níveis e nome público (sugestão: Rota Basic / Rota Advanced / Rota Full).
- Taxa de implantação com importação assistida: valor (referência R$ 99-299).

## A página do site (28/07, commit `6cb79ce7` — LOCAL, publish não pedido)

`/rota` — pública, sem login, na casca da landing (`.public-entry`). A rota
`/logistica` é o app do tenant, por isso a vitrine é `/rota`, o mesmo nome
comercial dos planos.

**A escada é a página.** Clicar Basic/Advanced/Full troca ao mesmo tempo: preço,
franquia, slogan, a conta de venda, a lista de recursos e a tela do celular. O
que o nível não tem aparece TRAVADO com o selo "Disponível no Advanced/Full" —
o mesmo ver-mas-não-usar que roda dentro do app (F1 item 3), agora como motor de
upgrade também na venda.

**Preço não é texto fixo** (foi a decisão de engenharia da entrega): a página lê
`GET /public/logistica/planos`, que serve o MESMO catálogo que o Master edita
(Créditos → guia **Rota**). Mudou lá, muda no site — sem isso a página passaria a
mentir no dia em que o preço mudasse, e ninguém avisaria. Sem API no ar, cai no
catálogo de fábrica (99/199/299) e a página nunca aparece sem preço.
Mesma ideia na conta de venda: `1 galão ≈ R$ 13` → "recuperou N fiados esquecidos
no mês? já se pagou", com N recalculado em cima do preço vivo (Advanced 199 → 16).

**Portas de entrada:** botão "Rota" no cabeçalho da landing e "Ver planos e
preços" no card do app Android.

**Demo do rastreamento:** a tela do celular no nível Full é a réplica fiel da
página `/acompanhar/<token>` (mesmos passos, ETA, "3 de 9 paradas"), com nomes
fictícios. **Não é um link real** — link vivo exige uma entrega real de um cliente
real e isso não vai numa página pública. Se você quiser um link vivo de demo,
gere um numa empresa sandbox e eu ligo na página.

**Conferido:** Chrome 1366×768 sem scroll vertical (regra do FRONTEND.md), 768 e
375 sem overflow horizontal, claro e escuro, nos 3 níveis; `next build` verde com
`/rota` estática; 16/16 testes do catálogo de níveis (3 novos pra vitrine).

**Brinde:** o botão de tema abria o pop-up "Ops, algo deu errado" em TODA página
pública (reproduzido no `/tutorialexterno`, intocado) — as promessas
`ready`/`updateCallbackDone` da view transition rejeitam quando o navegador aborta
o cross-fade e ninguém dava `catch`. Corrigido em `theme-attributes.tsx`.

**O que a página NÃO faz (decisão sua):** não tem checkout. O botão principal é
"Falar com a gente" (WhatsApp) + "Criar minha conta" — coerente com a pendência
aberta de os 3 níveis virarem ou não família de plano no catálogo comercial.

## Regras que este plano obedece
- Entregar LIGADO (26/07): cada frente sai funcionando, sem chavinha morta.
- Teste verde no meu fuso não vale (26/07): tudo que toca data roda nos 3 fusos.
- Prova é a TELA DO CELULAR (27/07): F1-F3 seguem a regra de teste do hbxlog.
- Publicar só com ordem do dono.
