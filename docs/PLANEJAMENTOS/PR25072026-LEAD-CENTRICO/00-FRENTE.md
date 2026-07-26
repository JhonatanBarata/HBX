# FRENTE LEAD-CÊNTRICO — Reposicionamento do /vendas (25/07/2026)

## Tese (fechada em brainstorm 25/07, dono + Fable, filtrando o PDF "Reposicionamento do HBX")
O lead é o centro; canais (WhatsApp, e-mail, observação, tarefa) viram EVENTOS na história do lead,
dentro do /vendas/detalhes. Nada de disparo cego: achou → analisou → planejou → liberou → executou →
interpretou → escalou ou encerrou. A REGRA tem autoridade; a IA interpreta e recomenda; o humano
entra no momento de alavancagem ("te chamou"). Módulo Conversas será REBAIXADO por flag (não
deletado) — vira central de atendimento opcional pra empresa de volume.

## Decisões do dono (25/07 — registro vinculante)
1. **Reembolso de crédito**: vai existir, mas NÃO nos primeiros sprints. Critério aprovado:
   devolve só **defeito de dado verificável** (nenhum canal funcionou de fato, empresa baixada,
   segmento comprovadamente errado). **Silêncio NÃO reembolsa** (é o jogo; alívio = volta mais
   rápido ao pool). Preço do lead em créditos pode subir junto — posicionamento "lead com
   garantia". Taxa de reembolso vira termômetro do Radar. Estados + motivo de encerramento nascem
   no modelo DESDE JÁ pra viabilizar a análise depois (custo zero agora, migração dolorosa depois).
2. **Automação opt-in por lead ("robozinho")**: NUNCA existe "puxou lead → disparou" — remover
   PELA RAIZ quando chegar o sprint do motor. Fluxo: abre detalhes → lê → planeja (painel/popup) →
   clica no robozinho (com aviso de que a IA não se responsabiliza). Freios de canal continuam por
   baixo SEMPRE, robozinho ligado ou não: parou na primeira resposta, janela de horário, teto por
   user/chip, opt-out global. O aviso protege juridicamente; quem protege o chip são os freios.
3. **Regras de disparo existentes: APROVEITAR TODAS, NÃO PERDER** (ordem literal do dono).
   Já existem e são boas: `backend/src/cadencia/cadencia.service.ts` (WORM-13: personas, aplicar,
   runner diário atrás de `HBX_AUTOMATION_RUNNER_ENABLED` default OFF, teto WhatsApp 10/dia e
   e-mail 50/dia por empresa) reusando o caminho provado do bot (disjuntor, 1 número=1 conexão,
   outbox com retry). Muda o GATILHO (robozinho por lead), não a regra.
4. **Config do admin ENXUTA**: só janela de horário + limites de disparo por user/chip + intervalo.
   O cadastro imenso/incansável de prospecção SOME; o resto se decide na hora de planejar o lead.
   Agendamento slot-aware (tipo agenda de consultório): ao agendar disparo, mostrar o próximo
   horário livre respeitando os limites; resposta fora da janela → bloqueia e oferece agendar o
   próximo dia útil no horário do adm.
5. **E-mail: SMTP primeiro, sem pedágio OAuth por ora** ("vamos ver como fica"). Assinatura sóbria
   (nome, cargo | empresa, telefone, site — sem banner), registro no lead, resposta detectada só
   nas threads que o HBX enviou (Message-ID). `CompanyMailerService`/`EmailOutboxService` já
   existem. Sem pixel de abertura (piora spam score; o sinal que vale é resposta).
6. **NÃO TOCAR em atendimento nem recovery** — negociar depois.
7. **5 guias = etapas novas + selo de tentativa** (escolha do dono na pergunta de 25/07):
   Planejar / Robô trabalhando / Te chamou / Negociação / Fechado, mapeadas SOBRE as chaves
   persistidas atuais `novo/contato/retorno/qualificado/encerrado` — SEM migração. Tentativa
   (1º/2º/3º contato) é SELO no card, nunca coluna. Lead morto sai do quadro pro pool com
   marquinha (backend, sprint futuro): negou = supressão ~12 meses; não atendeu = resfriamento
   ~90 dias (silêncio é 80%+ da prospecção fria — excluir pra sempre derreteria a base);
   opt-out = permanente. Histórico privado NUNCA legível pra outra empresa.
8. **Frontend grande (cockpit do detalhes): ÚLTIMO passo, perguntar antes de fazer.**

## Fila de sprints (1 briefing .md por sprint; execução SEQUENCIAL, 1 worker por vez — sem
## worktree/branch, então NUNCA 2 workers em paralelo no mesmo repo)
> STATUS 25/07 noite: S1 ✅ ENTREGUE (commit local `e40fa40b`). Dono deu GO 25/07 pro RESTANTE
> (S2–S7). Cockpit visual grande do detalhes segue FORA — perguntar antes (decisão nº8).
- **S1 ✅** — `01-guias-vendas.md`: 5 guias na lista do /vendas + renome das colunas do
  quadro + selo de tentativa no card. Frontend puro, sem migração. Commit `e40fa40b`.
- **S2 ✅** — `02-radar-limpo.md`: filtro duro restaurado + mapa de exclusões + motivo de
  inclusão persistido/exposto/badge. Commit `9a2225bd`. Nota do worker: 11 falhas de teste
  PRÉ-existentes no radar catalogadas (alheias ao escopo; detalhe no transcript do sprint).
- **S3 ✅** — `03-pre-voo.md`: `GET /vendas/lead/:id/pre-voo` (dono via QSA com confiança por
  fonte; regra dura do nome; heurística de persona) + aba "Planejar" no cockpit modal (botão
  "Ligar robô" desabilitado até S4). Flag `HBX_PREVOO_ENRICH_ENABLED` default OFF ("Buscar
  dados" reusa POST /vendas/lead/:id/enrichment existente). Commit `8c837870`. Strings de UI
  novas listadas no transcript do sprint pro dono revisar.
- **S4 ✅** — `04-robozinho.md`: POST/DELETE /vendas/lead/:id/robo (opt-in idempotente),
  `cadencia-gatilho.service` (paradas globais), `vendas-robo-heat` (quente com hook pra IA;
  opt-out não é quente), `closureReason` no VendasLead (migration aditiva IF NOT EXISTS),
  selo 🤖 + botão na aba Planejar. Commit `58539570`. Worker morreu APÓS commitar (relatório
  perdido); orquestrador re-rodou os checks 26/07: build limpo, 38/38 novas + 94/94
  vendas/cadência. ⚠️ Publish do dono `660bee43` (25/07 23:48) levou S1–S4 pra PROD —
  runner segue OFF (nada dispara sozinho).
- **S5 ✅** — `05-agenda-slots.md`: tabela nova `VendasComercialConfig` (1/empresa, defaults
  08:00–18:00, 10/dia, 15min; campanha NÃO promovida — morre no S7), `business-hours.util`
  (regras colhidas por CÓPIA, original intacto), `agenda-disparo.service` (slots com mutex
  por empresa; limitação multi-réplica documentada), runner soldado (adia pra próximo dia
  útil NO horário configurado), config no drawer "Automações comerciais" + preview de slot
  no popup Agendar Retorno. Commit `5e536f53`. Checks 12/12 novos + 246/246 vendas/cadência.
- **S6 ✅** — `06-email-v1.md`: `UserSenderProfile` (cargo/telefone/site — migration
  aditiva) + `SenderIdentityService` (assinatura HTML sóbria + regra dura "sem
  identidade não sai") embutida em todo e-mail comercial (cadência via `bodyHtml`
  novo no outbox + envio manual do detalhes); bounce síncrono do SMTP invalida o
  e-mail (`CommercialEmailMessageLog`) e vira evento na história do lead; cadência
  passa a checar essa supressão antes de enviar; `POST /vendas/leads/:id/email/opt-out`
  registra manualmente pedido de remoção (marca `closureReason` do S4 + suprime).
  Campos Cargo/Telefone/Site em Configurações → Perfil. Commit `2fcdf766`. Checks
  37/37 novos (`sender-identity`, `company-presentation-email`, `email-outbox-worker`,
  `cadencia`) + 278/278 vendas/cadência/mail. ⚠️ SEM IMAP/webhook de recepção hoje —
  resposta por thread (item 5 do briefing) fica de fora, documentado como gap; a
  detecção manual de "sem interesse/remover" cobre a regra dura de supressão.
- **S7 ✅** — `07-pool-raiz.md`: `VendasContactSuppression` (append-only, janelas 365d/90d/
  permanente via env `HBX_SUPPRESSION_*_DIAS`; leitura só boolean, fail-open) com gatilhos
  automáticos no encerramento/cadência-esgotada/opt-out; solda no import e na vitrine do
  Radar (contador logado; ⚠️ COUNT `totalAvailable` ainda não desconta supressão — registrado);
  puxa→dispara MORTO (start/resume recusam com ForbiddenException apontando pro robozinho;
  `enqueueLeadsForActiveCampaignForUser` virou no-op, original preservado `_legacyUnused`;
  painel "Bot de prospecção" removido do /vendas); Conversas = módulo próprio `conversas`
  (só TELA/nav; `atendimento` NÃO tocado — ele gateia pairing/recovery/mensageria; empresa
  nova nasce OFF nas 3 portas de nascimento, existente fica como está). Commit `befc4802`.
  Checks: 14 testes novos verdes; 462/467 nas suítes tocadas (4 falhas pré-existentes
  alheias). ⚠️ 1 campanha automática `running` viva em prod (companyId=5, de 30/06) —
  SÓ RELATADA; parar é decisão do dono no publish.

## FRENTE COMPLETA (S1–S7) — FECHAMENTO 26/07 (ordens do dono executadas)
**TUDO EM PROD** — VPS conferida no `f0cc0b35` (publish novo não deixa commit `chore: publish`;
mudou em `a5050b38`). Fechamento por ordem do dono 26/07:
- (a) ✅ publish confirmado pelo dono e conferido na VPS.
- (b) ✅ campanha running da empresa 5 CANCELADA de vez na VPS (semântica do
  `cancelProspectingForUser` em SQL: campanha `canceled`, 0 jobs pendentes, 0 enrollments)
  + cópia legada `_legacyUnused` removida (`547e84c6`, LOCAL — entra no próximo publish).
  Motor de campanha (live-status etc.) ficou INERTE, demolição total = frente futura.
- (c) ✅ CHAVES: runner + email da cadência JÁ ESTAVAM VIVOS no container (nomes legados
  `HBX_CADENCIA_RUNNER_ENABLED`/`HBX_CADENCIA_EMAIL_ENABLED=true`, o código aceita fallback);
  `HBX_AUTOMATION_RUNNER_ENABLED=true` + `HBX_PREVOO_ENRICH_ENABLED=true` ARMADAS no
  `/root/HBX/backend/.env` (linhas 147–148) — valem no próximo recreate/publish (liga o botão
  "Buscar dados"). LIÇÃO GRAVADA: chave desligada esquecida = "bug" pro dono; ligar na entrega.
- (d) strings de UI → entram JUNTO com o cockpit visual grande (chip aberto em sessão própria).
- Restam (futuro): gap IMAP (resposta por thread); motor de reembolso (dados já sendo
  colhidos); demolição total do motor de campanha.

## S8 (26/07, ordem nova do dono) — DESTRAVAR O ROBÔ
`08-destravar-robo.md` — regra: travas de ativação = SÓ config do Admin (S5) feita + WhatsApp
conectado; bloqueio SEMPRE com explicação + próximo passo (primordial); resto remove/auto-cura.
Worker despachado 26/07.
- (Adiado, sem sprint): motor de reembolso — depende dos dados de encerramento acumulados.

## Guardrails de TODO worker desta frente
- Branch atual (master) SEMPRE; NUNCA criar branch/worktree. Commit LOCAL; publish só o dono.
- Working tree tem trabalho paralelo do dono (logística/backend) — NÃO tocar, NÃO reverter,
  `git add` só por caminho dos arquivos próprios (NUNCA `git add -A`).
- Não tocar em atendimento, recovery, Webwhats.
- Frontend: 5 Leis do design (tokens/classes centrais, zero hex — `check-pele.mjs` reprova).
- Ler `docs/Rules/FRONTEND.md` (front) / `docs/Rules/BACKEND.md` (back) antes de editar.
