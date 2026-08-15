# PR15082026 — ÚLTIMA PASSADA DA ROTA (v2 — decisões do dono fechadas em 15/08)

Raio-x de 15/08 (9 investigadores + rastreador da rota fantasma), fatos com arquivo:linha
no HEAD `cd8f07e1`. Fonte do app: `docs/mockups/logistica2.0/logistica-2.0.html` (mock.js/css
GERADOS por casca-injetar) + `EntregaShell/app/src/logistica/ponte-src/` (ponte.js GERADO).
Execução: **1 lote por vez, dono testa cada um** antes do próximo. Commit local por lote;
publish é gesto do dono.

## DECISÕES DO DONO (15/08) — registro
- **F3 (chegada):** ✓ só no confirmar (chegada nunca vira entrega). **Correção do dono
  15/08:** a tela "Você chegou" **abre NA FRENTE sozinha, igual nos 2 modos (2D e 3D)** —
  uma peça só, mesmo desenho, sobre o mapa em que o motorista está, sem trocar de tela.
- **F1 (pré-menu) e F8 (arquitetura de vínculo/admin): GELADEIRA.** Assuntos delicados,
  fora da sprint — arrumar depois com cuidado. Nada deles entra nos lotes.
- **F9:** nasce o desenho novo — **2 tipos de parada avulsa**: "só chegar lá" (GPS) ×
  "entregar algo" (venda). Detalhe no LOTE 5.
- **Demais decisões abertas: fechadas com a recomendação do Claude** (registradas em cada lote).

## FATOS-BASE (mudam a conversa)
1. **Cobrança é no MONTAR, não no Iniciar**: débito `logistica_dia_de_rota` (6 créditos,
   nível CREDITO) sai no `planejarRota` → `garantirDiaPago` (logistica-rota.service.ts:473 →
   logistica-rota-cobranca.service.ts:50). Rota montada = dia já pago; Iniciar não recobra;
   custo-preview é leitura; montar dia futuro debita aquele dia; cancelar não estorna.
2. **Regressão TRACKED curada e publicada** desde 12/08 (`cd7c59d5` em `608edad5`).
3. **Prod (SELECT 15/08):** zero rota pendurada viva (12 lápides by design); **205 entregas
   `agendada` de dias passados órfãs** que o expurgo não alcança (LOTE 9).

---

## GELADEIRA — PLANOS COMPLETOS, EXECUÇÃO SÓ QUANDO O DONO PUXAR

### PLANO G1 — PRÉ-MENU DO MONTAR ROTA (item 1 do dono)
**Cena-alvo:** tocar "Montar rota" → folha sobe com **Semanal · Rota Avulsa · Pedidos (N)**
e, embaixo, **histórico resumido** com "Expandir". Um toque leva ao fluxo certo já armado.

**G1-P1 — A folha.** Bottom-sheet no molde pronto de `T.semana` (.scrim + .sheet + handle,
HTML:5289), interceptando `ACOES.montar` (D0-porta-entrega.js:402) — ponto único por onde
TODAS as portas do Montar passam (dock semparada + satélite Montagem). Anti-fricção
(mitiga o toque extra no gesto mais usado): a folha **lembra a última escolha**
(`HBX.cache 'premenu-ultima'`) e o bloco dela vem destacado no topo; segurar o botão do
dock pula a folha e repete a última escolha.
**G1-P2 — Semanal.** Mantém gate de ADMIN (publicarMontarDias, 10-geofence:957): admin vê
os 7 chips com contagem por dia (dado JÁ pronto: `DADOS.rota.semana` via publicarSemana,
10-geofence:941 ← GET /logistica/agenda); toque → Montagem com o chip aceso. Motorista
comum não vê o bloco (vê Avulsa · Pedidos · histórico).
**G1-P3 — Rota Avulsa.** Toque → `T.rapida` DIRETO (a Montagem em -1 já é avulsa; o ganho
da opção é pular direto pra porta de pôr gente — busca 3 fontes). Voltar da rapida cai na
Montagem com o rascunho.
**G1-P4 — Pedidos (N), v1 sem endpoint novo.** Contador = avulsas ABERTAS de hoje lidas do
próprio GET /logistica/rota (origem por item já viaja — logistica.service.ts:571): zero
allowlist, zero rebuild. Toque → Montagem com as avulsas do dia no rascunho. **v2 (só se o
dono ligar o pedido público):** campo dedicado `Entrega.origemPedido` (migration aditiva)
distinguindo pedido-pelo-link de avulsa comum (hoje só o notes distingue — service:308),
endpoint GET de pendentes + linha na allowlist + REBUILD (regra dos TRÊS,
NativeApiClient.kt:311) + aviso ao motorista quando pedido novo entra (hoje não avisa nada).
**G1-P5 — Histórico.** O resumo dos 14 dias MUDA do pé da Montagem pro pré-menu (não
copia — dado em 2 lugares é bug de produto, régua da própria folha HTML:5405); "Expandir"
abre a Montagem com a lista completa (historico-usar continua lá). A tela órfã
`T.historico` dos Ajustes (HTML:6085, dados de desenho) MORRE.
**G1-P6 — Higiene junto:** comentário obsoleto D0:396-401 ("abrir a Montagem roda o
otimizador" — mentira desde 10/08).
**Portões:** prova-premenu red-first (folha sobe, blocos por papel, contador bate com a
lista, histórico em 1 lugar só) + casca + fluxo-rota + antes-e-depois acusando só as telas
mexidas.
**Cena de teste do dono:** tocar Montar rota → folha; como admin vê Semanal com contagens;
como motorista não vê; Pedidos(N) bate com as avulsas do dia; histórico não aparece em 2
lugares; segurar o botão repete a última escolha sem folha.

### PLANO G2 — ARQUITETURA DE VÍNCULO: 1 ADMIN, CELULAR, PAPÉIS (item 8 do dono)
⚠️ Mexe em conta/sessão viva — cada fase tem gate do dono e ensaio em empresa de bancada
(39) antes de encostar em gente real. Ordem pensada pra NUNCA derrubar aparelho errado.

**G2-P0 — AUDITORIA (read-only, sem risco, pode rodar quando quiser).** Relatório:
aparelhos ativos por usuário/empresa (MobileDevice), admins com 2+ aparelhos, e **em que
empresa o André realmente está** (google-pair com gmail desconhecido cria empresa nova
silenciosa — auth.service.ts:1630; se ele caiu numa empresa própria, planejar a migração
pro tenant certo ANTES de qualquer regra nova). Zero mudança de código.
**G2-P1 — Regra "admin-tier = 1 aparelho" com TAKEOVER.** Parear aparelho novo de
ADMIN/USERMASTER revoga os devices anteriores DO MESMO usuário (rotaciona tokenVersion —
mecânica já existente em mobile-device.service.ts:511), com aviso no pareamento ("este
código desconecta o aparelho anterior"). Motorista (USER) mantém teto 4
(session-policy.ts:6). Red-first: parear 2º de admin derruba o 1º; parear 2º de USER não
derruba nada; NUNCA derruba device de outro usuário.
**G2-P2 — Fechar a porta lateral do gmail.** No fluxo do APK, gmail desconhecido deixa de
criar empresa: portão "Este e-mail não pertence a nenhuma equipe — peça o código de
pareamento ao seu gestor". Criação de conta nova continua existindo só no site. (É o que
gera motorista órfão fora do tenant — caso André.)
**G2-P3 — accessProfile VIVO (celular do funcionário).** Implementar a cópia prometida
(pairing-code → device, schema:2744/2860) + corte STANDARD: aparelho padrão opera rota sem
financeiro (sem saldo devedor, sem passe, sem caderneta); ADMIN = pleno. Dono revisa a
lista exata do corte antes de ligar. UI esconde o que o guard nega (campo que volta 403 é
botão morto — lei de 12/08).
**G2-P4 — "Puxar como entregador".** O convite ganha escolha de capacidade
(SELLER/DRIVER) aplicada no aceite (hoje reescreve pra SELLER cravado —
company-invite.service.ts:425); elegibilidade v1 mantida.
**G2-P5 — Runbook do dono (sem código, vale HOJE):** testar como motorista = Gerencial →
Novo acesso (username+senha, capacidade DRIVER, sem gmail) + Configurações → Aplicativo →
código de pareamento PARA ele no celular de teste. O celular pessoal fica como admin, um só.
**Portões:** red-first no mobile-device.service por fase; ensaio completo na company 39;
G2-P1..P4 só entram com GO explícito do dono, um de cada vez.
**Cena de teste do dono (por fase):** P0 = relatório na mão; P1 = parear 2º celular de
admin → o 1º desloga na hora, motorista não é afetado; P2 = gmail estranho no APK → portão
educado, nenhuma empresa nova no banco; P3 = celular STANDARD sem financeiro na tela;
P4 = convite aceito já entra entregador.

---

# LOTES DE EXECUÇÃO (1 por 1, com cena de teste)

## LOTE 1 — ROTA FANTASMA + BECO DO CANCELAR ✅ worker rodando
1. Backend: checagem "sem paradas abertas" sai do `resolve()` da continuidade
   (logistica-rota-continuidade.service.ts:506) — **cancelar nunca tranca**; rota morta →
   `{ok:true, canceladas:0}` + limpeza. Lei: estado permanente não gateia verbo de escape.
2. Backend: apagar venda (fechamento-dia:1180) e transferência (admin-route:567) zeram
   `rotaOrdem`/`etaAt`/`startedAt` junto do `cancelada` (espelho do limparDia rota.service:1472).
3. Ponte: `PLANNED` com zero parada aberta = 'montar' (00-nucleo.js:515), não 'pronta'.
4. Ponte: 409/404 de continuidade re-sincroniza (esquecer+recarregar) ANTES do portão,
   com frase honesta.
**Cena de teste:** a rota do print (51 paradas mortas) → abrir o app → tela vira "Montar
rota" sozinha; se aparecer rota morta, Cancelar limpa sem "Não deu certo".

## LOTE 1.1 — CORREÇÕES DO FISCAL (revisão adversarial do `a707a1cd`, 15/08)
A revisão adversarial do lote 1 achou 6 furos; 2 são graves. **Entra antes do lote 3.**
- 🔴 **F2 — RESYNC NÃO PODE APAGAR CHAVE DE IDEMPOTÊNCIA (risco de dinheiro).** O lote 1
  passou a chamar `esquecerRotaCarregada()` em QUALQUER 409/404 de continuidade — inclusive
  erros legítimos e inofensivos ("Você já está com uma rota em andamento", "A rota mudou",
  "Esta rota já começou"). Se essa limpeza apagar `entrega-confirmar:<id>` (a chave de
  idempotência gravada antes do POST de confirmar e reusada no retry), um retry gera uuid
  novo ⇒ **confirmação/cobrança duplicada**. **LEI: carimbo de dinheiro não se apaga em
  limpeza de TELA** — só o próprio desfecho bem-sucedido o remove. (Instrução já corrigida
  no worker do lote 2, que era quem ia escrever essa limpeza.) Além disso, o resync deve ser
  o mais brando possível: recarregar sem destruir carimbos.
- 🔴 **F1 — CANCELAR VIRA NO-OP SILENCIOSO** — e o **banco de prod (SELECT, 15/08) provou
  que ESTA é a cena do print**, em versão pior que a hipótese:
  **A rota do print** é `cmsusrv6k05otsfjwx1wgdl1j` · company 41 · 15/08 · **status ACTIVE**
  (não PLANNED) · TRACKED · **ZERO `LogisticaRouteStop`** · criada e `startedAt` **no mesmo
  segundo** (16:57) · `operationalEndedAt` 2 min depois (16:59). No mesmo minuto o dia foi
  **remontado**: 51 entregas novas `agendada` com `rotaOrdem` 0..50 e **nenhuma delas dentro
  de stop**. Ou seja: **a tela desenha o DIA (51 abertas) e o servidor resolve a ROTA (0
  abertas)** — duas contabilidades diferentes olhando o mesmo motorista.
  **Três causas, todas confirmadas no dado:**
  1. **O Iniciar carimba `ACTIVE` + `startedAt` tendo congelado ZERO stops.** Já aconteceu
     **4 vezes em 6 dias**, sempre na company 41 (15/08, 14/08 e 2× em 10/08) — padrão, não
     acidente. Rota vazia "iniciada" é lápide fabricada.
  2. **`operationalEndedAt` esconde a rota do APP mas não do RESOLVEDOR**: o app volta a
     mostrar "Iniciar", enquanto o `routeId` reportado (metadata do tracking devolve
     qualquer rota do motorista+dia) continua apontando pra rota morta ⇒ todo verbo vira
     `route:<morta>` ⇒ 409 eterno.
  3. **Remontar o dia não cria rota nova** (a `LogisticaRoute` só nasce no Iniciar), então
     o dia planejado fica órfão e herda a ref da rota morta.
  **Cura proposta (3 pontas):** (a) metadata não reporta `routeId` de rota com
  `operationalEndedAt` — o app cai na ref do DIA e o Cancelar volta a funcionar de verdade;
  (b) Iniciar que congelou 0 stops **não** vira ACTIVE/`startedAt` — erro honesto "Nenhuma
  parada para iniciar"; (c) cancelar com alvo `route:` sem stops cai no escopo do DIA em vez
  do `{ok:true, canceladas:0}` mudo.
- 🟠 **Achados extras do banco (mesma família, entram na conta):** rota **COMPLETED com 14
  paradas ABERTAS presas dentro** (company 5, 17/07 — são 14 das 205 órfãs); **13 das 24
  rotas do banco estão ACTIVE eternas**, várias "encerradas" dias depois (`ACTIVE` virou
  estado-lixo, nada transiciona pra COMPLETED); company 48 com rota de 09/08 COMPLETED (52
  stops cancelados) e **98 abertas soltas no mesmo dia**; **nenhuma entrega `em_rota` no
  banco inteiro** (o estado intermediário não é usado); e as 93 órfãs da company 39 têm
  `scheduledAt` **00:00 UTC** enquanto todo o resto usa 03:00 UTC (convenção de dia
  divergente gravada em produção). **`INITIALIZING` preso: ZERO** — o F6 abaixo é risco
  teórico, nunca prendeu ninguém.
- 🟡 **F4 — sobrou um cancelador sem higiene:** `softDeleteEntrega` (`DELETE
  /logistica/entregas/:id`, logistica.service.ts ~1954) carimba `cancelada` sem zerar
  `rotaOrdem/etaAt/startedAt` — mesma classe dos 2 corrigidos no lote 1.
- 🟡 **F3 — dado VELHO continua desenhado:** sem backfill, as canceladas com `rotaOrdem`
  seguem alimentando `kpiParadas`/`filtroFila` (lista/foto/fechamento dizem "51 paradas"
  mesmo com o mapa curado). Precisa de rotina de cura (SQL idempotente) OU régua honesta
  de KPI. **Não descartar toda cancelada no app** — cancelada durante a rota deve continuar
  visível com "×" (é o histórico do dia).
- 🟡 **F5 —** o ramo `draft:` do `resolve()` ainda lança 404 antes da saída graciosa.
- 🟡 **F6 — irmã da fantasma (pré-existente):** `assertAssentoDoDia`/`congelarStops` estão
  FORA do try que chama `releaseInitialization` — um 402 ali deixa a rota **INITIALIZING
  para sempre**, e o app lê INITIALIZING como 'rodando' (dock sem Cancelar). Beco novo.
- Provas a acrescentar: cena da fantasma no `prova-fluxo-rota` (hoje o dublê do
  `continuidade/cancelar` devolve `canceladas:1` e esvazia o dia — não consegue reproduzir
  o defeito) + teste do lado do app para os fixes C e D do lote 1 (que hoje não têm nenhum).

## LOTE 2 — VÉU NO TOQUE + RESÍDUOS DO CANCELAR + FECHAMENTO HONESTO + CONTRASTE
(worker 2 — entra quando o LOTE 1 commitar; mesmos arquivos, serializado)
1. **Véu síncrono no montar**: espelho do fix do iniciar logo após 30-verbos-rota.js:551
   (véu acende ANTES do materializarRascunho da :558); `comTrava` ocupado ganha recibo
   (pulso) em vez de silêncio (:88).
2. **Resíduos do cancelar**: `esquecerRotaCarregada` limpa `chegada:<id>`/
   `entrega-confirmar:<id>`/`fim-visto:<dia>`/`rotaRefAtual`; `limparDia` carimba
   TrackingSession ENDED (fecha janela de 24h CONFLICT→REJECTED — rota.service:1036 como
   modelo, teste em limpar-dia.service.test).
3. **Fechamento honesto**: flag `carregando` + `fonteCaiu` + "Tentar de novo" na
   T.fechamento (10-geofence:517 + HTML:5221); estado vazio COM PALAVRA ("Nada registrado
   hoje ainda", HTML:5205); `fim-visto` só carimba com dado na tela (D0:302-303).
4. **Rótulo honesto na tela de dirigir**: "ENCERRAR ROTA" (que é porta, HTML:5085) vira
   **"Fechamento"**.
5. **Contraste** (decisão fechada = recomendação): `--danger-btn:#b3211c` no bloco claro +
   regra `.portao.perigo .acoes .principal{color:var(--white)}` depois da HTML:2921 (Sim:
   1,96 → ~6,7); `--btn-blue-1:#2563eb` (azul Atualizar 3,31 → ~6,0) + transmux claro
   (HTML:2925) vira token; `.recado` #1a1408 vira token. **Nasce
   `scripts/prova-contraste-dialogos.js`** (fiscal atual não abre portões — o 1,96 vivia
   invisível).
6. Comentários mentirosos: D0:396-401 (otimizador), D0:530-538 (geofence), schema:2859
   (accessProfile).
**Cena de teste:** montar rota grande → véu no MESMO toque; fechamento sem rede → aviso
com "Tentar de novo" (e reabre no mesmo dia); modo claro → Sim do cancelar legível.

## LOTE 3 — CHEGADA: UMA PEÇA SÓ, IGUAL NOS 2 MODOS (correção do dono, 15/08)
**Ordem literal do dono:** *"a tela que é 'impressa' ao chegar no cliente no 2d e 3d tem
que ser IGUAL"*. Vale a lei da casa: **padronizar = IGUALAR** (não "parecido").
1. Nasce **UMA peça única de chegada** (`cartaoChegada`) — mesmo HTML, mesmo texto, mesmos
   botões, mesmos tokens — renderizada IDENTICAMENTE em **T.rota (2D)** e **T.mapa (3D)**.
   Conteúdo: "Você chegou" + nome + endereço + GPS ±N m + ação principal **"Registrar
   entrega"** + secundária discreta. Fonte do desenho: o corpo que já existe em
   `T.mapachegou` (HTML:4941-4980) vira essa peça reutilizável.
2. **ABRE NA FRENTE, SOZINHO, NOS 2 PALCOS** (ordem do dono): ao chegar, o cartão é
   impresso POR CIMA do mapa atual — 2D ou 3D, tanto faz — com o som/vibração de hoje.
   Não é selo discreto e não depende de toque para aparecer. O ouvinte `hbx:arrival`
   (D0:198) passa a imprimir a MESMA peça nos dois casos (hoje ele abre a folha direto).
   **Não troca de tela:** o cartão vive sobre o palco em que o motorista está e, ao
   registrar/fechar, o mapa continua exatamente onde estava (a cena "continuar nessa tela"
   do pedido original). A ação principal do cartão abre a folha da entrega.
3. Pino âmbar `is-arrived` (40-mapa-palcos.js:208) continua nos 2 mapas; ✓ (`is-delivered`)
   **só** no desfecho confirmado — chegada nunca vira entrega.
4. **T.mapachegou morre como TELA** (tela sem porta é proibida) — seu corpo vira a peça do
   item 1; galeria e provas ajustadas.
5. Portão de igualdade: prova nova compara o HTML renderizado do cartão nos 2 palcos e
   reprova se divergir 1 byte (mesma doutrina do `casca-conferir`), nos 2 modos de luz.
**Cena de teste:** g15, rota iniciada — chegar numa parada estando na 2D e depois na 3D:
o "Você chegou" **abre na frente sozinho nos dois**, com a MESMA cara; nenhum dos dois
troca de tela; ação principal abre a folha; confirmar → ✓ no mapa e o mapa continua onde
estava.

## LOTE 4 — PÓS-INICIAR ELEGANTE (decisões fechadas = recomendação)
1. Estado **`iniciando`** próprio no transmux (rótulo "Iniciando…"), morre o "Montando…"
   emprestado (HTML:3520); véu com etapas reais também na T.rota (hoje só T.montagem tem o
   bloco, HTML:5510).
2. Nomes: dock rodando mantém **Cancelar | Navegar | Finalizar**; dentro da tela de
   dirigir, "Sair" vira **"Visão geral"** (volta pro 2D com rota viva — HTML:5087).
3. T.rota pós-iniciar ganha: **cartão da PRÓXIMA parada** (nº, nome, distância, ETA) +
   progresso **X/N** na barra (no lugar de "51 paradas · 0 entregues" cru).
**Cena de teste:** Iniciar → "Iniciando…" com véu (nunca "Montando…"); dirigindo → "Visão
geral" volta pro 2D; 2D mostra próxima parada + 3/51.

## LOTE 5 — OS 2 TIPOS DE PARADA AVULSA (decisão do dono 15/08)
Desenho (recomendação fechada): **tipo por PARADA**, rota pode misturar — cobre "rota só
GPS" e o dia real (entregas + passar no depósito). Cobrança do dia inalterada.
1. Migration aditiva: `Entrega.tipo` = `'entrega'` (default) | `'gps'`.
2. T.rapida: ao confirmar a parada escolhida na busca, degrau novo — **"Entregar aqui"** ×
   **"Só chegar lá (GPS)"**.
   - **Entregar** exige produto/valor: degrau de produto (default = vínculo principal do
     cliente; sem vínculo → picker do catálogo; preço SEMPRE do servidor — mata a avulsa
     R$0/'isenta' de C0:186/340 e logistica.service.ts:2348).
   - **GPS**: cria a parada sem produto/valor/cobrança.
3. Desfecho GPS: folha reduzida — só **"Concluir parada"** (+ Não consegui) — sem forma de
   pagamento; não gera FinanceiroCharge; ClienteHistorico só se tiver cliente vinculado
   (tipo 'sem_atendimento' com título "Passagem").
4. Fechamento/caixa ignora paradas GPS no dinheiro (e no balde fiado); KPI de paradas
   conta as duas.
**Cena de teste:** adicionar 1 parada GPS (ex.: depósito) + 1 entrega com produto → rota
mista; concluir a GPS sem folha de venda; entrega cobra certo; fechamento não mostra a GPS
no caixa.

## LOTE 6 — DINHEIRO DA PORTA (restante do item 9)
1. **"Editar valores" vira porta real** (decisão fechada): editar itens/quantidade ANTES
   de pagar (confirmar ganha `novosItens`; trava atual de dinheiro já recebido permanece —
   logistica.service.ts:1370).
2. **Botão "Pago"** (quitarAberto — quita o saldo do cliente na porta): backend pronto
   (controller:239), entra na folha.
3. Fechamento: receiptMethod nulo ganha balde **"sem forma"** (não infla mais o fiado —
   fechamento-dia.service:275).
4. Tela Semana com fonte: `historicoDias` com quebra por forma (a ponte já pede —
   90-ajustes-financeiro.js:423) + devedores com nº de marcações e data mais antiga.
**Cena de teste:** entregar 3 tendo registrado 1 → corrigir na folha antes de pagar;
cliente devedor → "Pago" quita e aparece no histórico; Semana mostra formas por dia.

## LOTE 7 — HISTÓRICO FINANCEIRO COMPLETO (CLAUDE edita, não desce pra worker)
1. Linha `pago` no ClienteHistorico quando `quitarCharge` (desktop) e quitação do
   fechar-mês baixarem fiado — reutiliza `registrarHistorico` (único create hoje:
   logistica.service.ts:3210). Fecha o "quando paguei?" da porta.
2. Verificação adversarial independente antes de commitar (lei do código financeiro).
**Cena de teste:** baixar fiado no desktop → linha "Pago" na ficha do cliente no app.

## LOTE 8 — DESKTOP ↔ MOTORISTA FECHA O CICLO (decisões fechadas = recomendação)
1. `decidirAnexo` gera **mensagem-sistema no fio** ("✔ Encaixou a rota · 07:32") → badge e
   feed acendem de graça (hoje encaixar/negar-sem-motivo é invisível — recado.service:373).
2. Coluna `decididoEm` (migration aditiva) + chip do cockpit com hora.
3. **Encaixar anexo de ROTA sem rota montada** (A5:62/144) — o gerar É quem monta o dia
   (rota-modelo.service:527 já atribui ao motorista).
4. **Atribuição direta toca campainha**: atribuir-lote dispara recado automático
   ("N paradas novas na sua rota") — hoje é muda (operacao.service:254).
**Cena de teste:** cockpit manda rota anexa pra motorista de dia vazio → ele encaixa → o
cockpit vê "encaixada · hora" sem abrir o fio; arrasto de parada → campainha no g15.

## LOTE 9 — AS 205 ÓRFÃS EXPIRAM SOZINHAS (Lei do Desaparecer)
1. Expurgo ganha regra: entrega `agendada` de dia passado, sem início/sinal de vida, com
   mais de **7 dias** → vira `cancelada` com motivo "expirada" (NÃO deleta — mantém
   trilha/histórico; expurgo-util:215 como vizinhança).
2. Red-first com as 3 empresas reais (5/39/48); contagem antes/depois no relatório.
**Cena de teste:** contagem em prod cai de 205 → 0 ao longo da janela; nenhuma entrega
com história é apagada.

---

## ORDEM E ESTADO
| Lote | O quê | Quem | Estado |
|---|---|---|---|
| 1 | Rota fantasma + beco cancelar | worker 1 | 🔄 rodando |
| 2 | Véu + resíduos + fechamento + contraste | worker 2 | ⏳ fila (após 1) |
| 3 | Chegada interativa 2D | worker | ⬜ |
| 4 | Pós-iniciar elegante | worker | ⬜ |
| 5 | 2 tipos de avulsa | worker + migration | ⬜ |
| 6 | Dinheiro da porta | worker | ⬜ |
| 7 | Histórico financeiro | **Claude** (financeiro) | ⬜ |
| 8 | Desktop↔motorista | worker + migration | ⬜ |
| 9 | Órfãs expiram | worker | ⬜ |

Portões por lote: costura/injeção + provas vizinhas + red-first novo + tsc/testes backend
quando tocar; commit local por lote; publish só quando o dono mandar. Cada lote entrega a
CENA acima pro dono testar antes do próximo.
