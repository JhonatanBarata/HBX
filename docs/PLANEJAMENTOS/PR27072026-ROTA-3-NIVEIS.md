# PR27072026 — GERENCIADOR DE ROTA EM 3 NÍVEIS (Basic / Advanced / Full)

> **ESTADO FINAL (28/07 ~00h): TODAS AS FRENTES NO AR** (deploy 2284edcd, verificado
> dentro do container + link público testado com HTTP 200 real na empresa 41).
> F0 motor confiável ✅ · F1 três níveis ✅ · F2 estoque+parada amarela ✅ ·
> F3 rastreamento-produto ✅ (secret armado na VPS — nasceu LIGADO) ·
> F4 quarentena de importação ✅. Incidente do dia documentado em
> [[tx-any-engole-erro-prisma]] e [[guerra-de-sessoes-paralelas-add-a]].
> **REPASSADA DAS PENDÊNCIAS (28/07, commit `6cdedca9` — LOCAL, publish não pedido):**
> ✅ tela do extrato de eventos da agenda na ficha do cliente (o endpoint existia
> desde 27/07 e nenhuma tela mostrava — F0 item 3 estava pela metade);
> ✅ estoque no BASIC mostra o selo "Disponível no Advanced" em vez do 403 vermelho;
> ✅ causa do caso Dejanira encontrada e travada (ver "Incidente do reabrir" abaixo).
> ABERTO (decisões do dono): preço dos 3 níveis; taxa de implantação (destrava
> IA de visão da F4 fase 2); as 3 entregas com dinheiro órfão em produção.
> MVPs mantidos de propósito: estoque = 1 caminhão/dia sem seletor de motorista
> (multi-caminhão é trimestre); {eta} vazio sem rota rastreada é degradação
> prevista, não bug (o render já limpa o espaço órfão).

## Incidente do reabrir (achado em 28/07 ao resolver a pendência da Dejanira)

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

⚠️ **O código do freio está só no master local** (`6cdedca9`, `b3f92dad`,
`189b849c`) — **publish não foi pedido**. Até publicar, a produção segue com o
reabrir/cancelar antigos e o buraco pode nascer de novo.

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

## Regras que este plano obedece
- Entregar LIGADO (26/07): cada frente sai funcionando, sem chavinha morta.
- Teste verde no meu fuso não vale (26/07): tudo que toca data roda nos 3 fusos.
- Prova é a TELA DO CELULAR (27/07): F1-F3 seguem a regra de teste do hbxlog.
- Publicar só com ordem do dono.
