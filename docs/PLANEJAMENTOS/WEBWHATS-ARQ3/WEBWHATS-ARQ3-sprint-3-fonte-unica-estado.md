# WEBWHATS-ARQ3 — Sprint 3: Fonte única do estado de conexão

> Mata a raiz transversal documentada no WHATSAPP.md ("estado mora em ~5 lugares → arruma um,
> quebra outro"). Sprint SÓ de leitura/projeção — **zero mudança no fluxo de conectar/reconectar**
> (guardrail: disjuntor e conexão intocáveis). Depende do Sprint 2 (eventos `connection.update`
> fluindo pela espinha durável). Índice: [sprint 0](WEBWHATS-ARQ3-sprint-0-visao.md).

## Problema ($)
O estado de UM chip vive em 5 lugares que divergem:
1. socket vivo no motor (`waInstances[x].connectionStatus.state`) — a VERDADE;
2. `webwhats_prod.Instance.connectionStatus` — atrasa;
3. app `WhatsAppConnectionSession` — `connectedAt` não atualiza em reconexão;
4. `Company.whatsappModalStatus` — ponteiro legado;
5. cache do front.

Sintomas já catalogados (RUIM#1/2 + selo fantasma): painel "Equipe" mostra Conectado com chip
morto (vendedora perde dia de venda achando que o problema é o cliente), UI esconde "Derrubar
conexão" quando mais precisa, selo do admin mente. Cada bug desses vira suporte + desconfiança.

## Fatos verificados
| Fato | Onde |
|---|---|
| Reconciler central JÁ existe (motor ao vivo, cooldown por tenantKey) | `backend/src/companies/whatsapp-modal.service.ts:648-717` |
| Fleet-health backend JÁ lê motor ao vivo (Master only) | `backend/src/messaging/webwhats-fleet-health.service.ts` |
| Painel "Equipe" ainda lê `WhatsAppConnectionSession` do banco | pendência RUIM#1 (WHATSAPP.md) |
| Anti-flap `holdSnapshotIfMotorAlive` já confirma na fonte autoritativa | commit `3bc9db33` |
| Evento `connection.update` chega pela outbox (S2) com estado novo | `EventManager.emit()` grava tudo |

## Desenho-alvo
**Verdade = motor ao vivo.** O app mantém UMA projeção (`WhatsAppConnectionSession`) com carimbo
de frescor, alimentada por DOIS caminhos que já existem: (a) eventos `connection.update` da
espinha durável (push), (b) reconciler existente (pull, cooldown). Todo consumidor de estado
(painéis, selos, guards de envio) lê a PROJEÇÃO — nunca mais um query direto criativo.

## Entregas
1. **Projeção canônica**: colunas `lastReconciledAt` + `motorState` na `WhatsAppConnectionSession`
   (migration aditiva); writer ÚNICO (um service, chamado pelo consumer S2 e pelo reconciler).
   `connectedAt` passa a atualizar em TODA transição close→open (mata a "data velha").
2. **Consumidores migrados** (só leitura):
   - Painel "Modelo de atendimento → Equipe" lê a projeção (com badge "visto há Xs" do carimbo);
   - Selo do Atendimento do admin em visão-empresa reflete a EQUIPE (fix front já desenhado no
     WHATSAPP.md, aterrissa aqui);
   - "Derrubar conexão" visível sempre que a PROJEÇÃO diz que o motor tem sessão viva (mata o
     órfão que a UI não deixa limpar — RUIM#2).
3. **Deprecação assistida**: `Company.whatsappModalStatus` vira derivado (getter da projeção);
   grep + teste garantem que nenhum caminho de DECISÃO lê os lugares antigos.

## Aceite
- [ ] Derrubar chip descartável → painel Equipe reflete em ≤ 15 s sem F5 (via evento) e nunca
      mostra "Conectado" com socket morto no teste dirigido.
- [ ] Reconectar chip descartável → `connectedAt` atualiza; freio S3/S4 (warm-up) lê idade certa.
- [ ] "Derrubar conexão" disponível com sessão órfã simulada; rotina `disconnectCompanySession`
      limpa motor + projeção juntos.
- [ ] Suíte: teste de caracterização ANTES (comportamento atual dos 3 painéis) + testes novos;
      typecheck backend + front verdes.
- [ ] ZERO diff em `whatsapp.baileys.service.ts` (nada de tocar conexão).

## Riscos / rollback
- Regressão de painel: mudanças são de leitura — rollback = revert do commit, sem migration
  destrutiva (colunas novas ficam, inofensivas).
- Teste de conexão/queda SÓ em número descartável meu (regra dura).
- Não tocar no worktree vivo do dono (`vendas-automation.service.ts`/`schema.prisma` costumam
  estar em edição — conferir `git status` antes; regra 18/06).
