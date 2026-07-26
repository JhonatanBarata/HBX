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
- S4 — Robozinho: ligar cadência POR LEAD + paradas globais + classificador de resposta
  (qwen3:4b já roda em prod no WhatsApp) + alerta "te chamou" com contexto (quem, o quê, por quê,
  até quando, o que o HBX já fez).
- S5 — Agenda slot-aware + config enxuta do admin (migrar regras vivas, matar cadastro imenso).
- S6 — E-mail v1: perfil do remetente + assinatura + envio SMTP + registro + resposta por thread.
- S7 — Pool/marquinha/resfriamento + rebaixar Conversas por flag + **remover pela raiz** o
  disparo "puxa→dispara" do motor de prospecção antigo.
- (Adiado, sem sprint): motor de reembolso — depende dos dados de encerramento acumulados.

## Guardrails de TODO worker desta frente
- Branch atual (master) SEMPRE; NUNCA criar branch/worktree. Commit LOCAL; publish só o dono.
- Working tree tem trabalho paralelo do dono (logística/backend) — NÃO tocar, NÃO reverter,
  `git add` só por caminho dos arquivos próprios (NUNCA `git add -A`).
- Não tocar em atendimento, recovery, Webwhats.
- Frontend: 5 Leis do design (tokens/classes centrais, zero hex — `check-pele.mjs` reprova).
- Ler `docs/Rules/FRONTEND.md` (front) / `docs/Rules/BACKEND.md` (back) antes de editar.
