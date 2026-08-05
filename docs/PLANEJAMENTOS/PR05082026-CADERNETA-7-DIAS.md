# PR05082026 — CADERNETA DE 7 DIAS (a caderneta de papel do André, com ouro)

**GO do dono 05/08** (brainstorm na sessão): a caderneta DEIXA de ser reconhecimento de rota.
Ela vira caderneta de papel de verdade: **7 páginas, uma por dia da semana**, abre na página de
hoje, toque no cliente → folha de preço/quantidade que já existe → registrar. **Sem GPS** ("só
vai gastar energia"). Do que ele anota, o sistema tira ouro sozinho.

## As cenas (aceite)

1. **Página do dia**: André abre a caderneta numa quinta → página QUI já aberta, com os clientes
   de quinta e as vendas da semana nessa página. Chips SEG…DOM no topo folheiam; registrar numa
   página folheada etiqueta a venda naquele dia (passar a limpo a caderneta de papel).
2. **Ouro nº1 — o cadastro se organiza sozinho**: cliente SEM dia nenhum vendido 2 vezes (datas
   distintas) na página de quinta → "Dias de entrega" dele vira QUI sozinho, pela porta canônica
   (`definirDiasDoCliente` + espelho da agenda). Cliente que JÁ tem dia diferente → chip "+ QUI"
   na linha (sugestão; nunca sobrescreve calado — errado é pior que vazio).
3. **Ouro nº2 — o sumiço grita**: cliente da página que não compra há 2 semanas seguidas (e
   comprava antes) ganha chip "Sumiu" na linha.
4. **Aprendiz**: na virada da semana (1º resumo da semana nova), as vendas da semana FECHADA
   viram/atualizam "Caderneta de Segunda"…"Caderneta de Domingo" nas **Rotas salvas**
   (`LogisticaRotaModelo` tipo LIVRE, `diaSemana`, ordem = ordem de registro, `versao` sobe
   quando muda). Sem botão.
5. **Aviso 1×/dia** (copy CRAVADA do dono): *"Olá, {Nome}, já temos seu histórico de semana
   passada, que tal tentar pelo GPS?"* → abre Gerenciador de Rota → Rotas salvas com a caderneta
   do dia na frente. Marca d'água gravada AO APARECER (4 saídas não renascem o popup).
6. **FINALIZAR — caderneta** (ordem 05/08, 2ª leva): botão Finalizar depois do card Fechamento →
   pergunta CRAVADA "Qual dia podemos registrar?" (7 dias, hoje marcado) →
   `POST /logistica/caderneta/finalizar {dia}`: dia ≠ hoje re-etiqueta a SESSÃO de hoje
   (passar a limpo a caderneta de papel; venda editada num dia do histórico não se move),
   salva a "Caderneta de <dia>" NA HORA e a tela limpa (marca `caderneta-fechada-<data>`;
   venda nova reabre o dia).
7. **FINALIZAR — rota normal** (mesma ordem): satélite "Finalizar" com rota ativa/pausada.
   Com parada aberta → modal CRAVADO "Salvar ou descartar pendências?" [Salvar]/[Descartar]:
   Salvar = `rota/encerrar` (abertas viram pendência e voltam — máquina existente);
   Descartar = o limpar-dia de sempre (cancela o que faltou). Fundo/Voltar = desiste.
   Sem parada aberta → encerra direto com som de rota.
8. **Histórico embaixo da tela** (ordem 05/08): os dias da janela COM venda ("SEG a DOM bem
   bonito, só o que tiver dados"), com DATA; toque reabre a caderneta daquele dia na MESMA
   tela (cabeçalho com dia + data), editável (vender + segurar pra apagar). `historicoDias`
   no resumo.
9. **Multi-produto conferido** (pedido "confere o histórico"): o 1º produto da venda vive
   ESCALAR na Entrega e os extras em EntregaItem — o histórico e a página agora fazem o
   MERGE do principal (unitário = total − extras, nunca catálogo).

## O que MORRE no APK

GPS na venda (`currentPosition` do `cadernetaVender`), medidor "Mapa: X de N", convite antigo
por base provada (`caderneta-convite` + `caderneta-ativar-gps`). O toggle de Ajustes fica.

## Contratos

- **Dinheiro nunca muda**: a venda carimba `deliveredAt = agora` sempre; fechamento oficial,
  fiado e extrato seguem o dia real. O dia da semana é SÓ organização (etiqueta
  `Entrega.cadernetaDiaSemana`, migration `20260805190000_caderneta_sete_dias`).
- **Janela da página** = 7 dias civis SP terminando hoje (cada dia da semana aparece 1×).
  Venda sem etiqueta (legado) cai no dia real do `deliveredAt` em SP.
- **Resumo é ADITIVO**: `dia`/`base`/`fechamento` intocados (APK velho ignora o resto).
  Novos: `pagina{diaSemana,vendas,fechamento,sumidos}` e `conviteGps{elegivel,nome}`.
- **Registro em lote não envenena ordem** (freio do aprendiz, fase 2 do consenso): por ora a
  ordem é a de registro da semana fechada, dedupe por cliente+local, só cliente vivo.
- Aprendiz/ouro são **best-effort com WARN**: nunca derrubam venda nem resumo.
- Endpoints: nenhum novo (só query param `dia` no resumo) → allowlist Kotlin intocada.

## Gates

tsc backend limpo · suíte da caderneta (novos testes: etiqueta, janela, auto-dia, sugestão,
sumiu, aprendiz idempotente, convite) · check-pele nos tocados · APK builda local. Publish =
gate do dono; depois teste no g15 pela regra §1 do hbxapk (aviso de update sozinho).
