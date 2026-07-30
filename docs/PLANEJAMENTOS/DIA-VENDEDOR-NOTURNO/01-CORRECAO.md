# CORREÇÃO DO MODO NOTURNO — plano de sprints (30/07/2026, pós-reprova do teste)

> Ordem do dono: "não quero lembretes". O popup de agendar deixa de ser lembrete de
> CRM e vira AGENDAR DISPARO de verdade (data+hora, slot reservado, inscrição criada).
> Base: relatório do chip noturno (11 bugs, B1/B2 bloqueadores) — os detalhes de repro
> estão na memória da frente `dia-de-vendedor-frente.md`, seção TESTE NOTURNO.
> O motor certo JÁ EXISTE: `AgendaDisparoService.reservarProximoSlot` (mutex por
> empresa, janela/teto/intervalo, testado) — só não tem porta HTTP nem tela.

## S1 — AGENDAR DISPARO DE VERDADE (mata B1+B2+B3+B4+B6) 🔴 BLOQUEADOR
Backend:
- `POST /vendas/lead/:leadId/agendar-disparo { desiredAt: ISO, message? }`:
  valida hora REAL (regex de hora de verdade no DTO — mata B7), chama
  `reservarProximoSlot` e CRIA a inscrição/job com `nextStepAt` = slot reservado.
  Resposta: slot final + `conflito/motivoConflito` (se pediu 09:00 e ganhou 09:15,
  a tela DIZ). Fora da janela (03:00) → slot cai pro próximo horário útil NA
  CRIAÇÃO (o motor já acerta; a escrita passa a consultá-lo — mata B6/f).
- "Ligar robô" ganha `startAt` opcional (default = próximo slot livre de AMANHÃ,
  nunca `new Date()` cru) — mata B2.
- `GET próximo-slot` do front SEMPRE envia `desiredAt` (mata B3).
- O caminho antigo de `returnAt`-lembrete SOME das telas de disparo (o dono não
  quer lembrete; `returnAt` continua existindo só como retorno de CRM em quem já
  é cliente — decisão de tela: nenhum botão de PROSPECÇÃO grava lembrete).
Front (Central do Lead + página): campo DATA+HORA, preview verdadeiro do slot, e
texto honesto do que foi agendado ("dispara sex 31/07 às 09:10").
Aceite (vacinas): 2 agendamentos no mesmo minuto → 2º reagenda com aviso; 11º do
dia → NEGA com motivo; 03:00 → vira 08:00 na criação; "99:99" → 400 legível.

## S2 — "NEM QUE EU FORCE" TAMBÉM NO PREPARO (mata B5 + burla e)
- Teto exibido na tela = `min(config do tenant, teto físico do cold gate)` — a tela
  para de prometer 40 quando o freio entrega 10.
- Anti-carimbo NO AGENDAMENTO: ao agendar, medir a copy contra as já agendadas de
  24h com a MESMA régua (`coldTextSimilarity` ≥85% = recusa na hora, com motivo) —
  o vendedor descobre HOJE, não amanhã quando o gate cancelar.
- `HBX_SUPPRESSION`/gate: conferir supressão do contato JÁ no agendamento (não
  deixar agendar pra quem pediu pra não ser chamado).

## S3 — VARIAÇÕES IA SEM 500 (mata B8)
- Timeout do backend DEVE caber no proxy: 25s (o 45s atual é inalcançável — proxy
  corta em 30s). Estouro → 200 com `erro` legível, nunca 500.
- Front manda `quantidade` (default 3) e frase é truncada com aviso; `numPredict`
  reduzido pra caber no tempo.
- Aquecimento: 1 ping barato ao Ollama quando o drawer de Prospecção abre
  (mata o cold-load de ~35s antes do clique) — decisão de implementação no sprint.

## S4 — PAINEL/ALERTA SEM CAMPANHA (mata B11)
`disparo-panel` ativo quando há AGENDADOS futuros OU conversa de prospecção viva —
não só `campaign.status === "running"`. Alerta de lead quente independente de
campanha (a cena Tagliágua aconteceu exatamente no modo manual).

## S5 — RADAR (mata B9+B10)
- Vitrine "Linhas" não emite fetch (0 de 317) — corrigir o fetch no modo Linhas.
- Termo do segmento no ranque (reincidência do achado nº5 do dia 1; a base TEM as
  distribuidoras certas, elas não sobem).

## S6 — DECISÃO DO DONO: fail-open do cold gate
Hoje erro de banco LIBERA o envio frio (fail-open consciente, `:357`).
Recomendação: fail-closed SÓ para primeiro-contato frio (resposta a lead quente
continua passando). Custo: banco fora = frio para. Decidir antes de mexer.

## Ordem de execução
S1+S2 na mesma sessão (é um produto só) → S3 (rápida) → S4 → S5 → S6 (decisão).
Regra de sempre: vacina por bug, bateria dos módulos tocados, 1 publish no fim.
