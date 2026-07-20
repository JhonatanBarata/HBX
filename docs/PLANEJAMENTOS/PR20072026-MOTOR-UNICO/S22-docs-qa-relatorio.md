# S22 — Docs/Rules + roteiro QA VPS + relatório final

**Fase 5 · Worker: Sonnet · Depende de: S21 verde**

## Objetivo
Fechar a frente: documentação viva atualizada, roteiro de QA pro pós-publish e o relatório que o
dono lê em 2 minutos.

## Tarefas
1. `docs/Rules/BACKEND.md` + `docs/Rules/FRONTEND.md` + `docs/Rules/WHATSAPP.md`: seções sobre
   bot/assistente/cadência atualizadas pro mundo novo (módulo automation, AutomationAgent, router,
   orquestrador, flags novas). Curto e certeiro — regra viva, não changelog.
2. `docs/Rules/MOTOR.md`: NADA a mudar (Radar/scraping não foi tocado) — confirmar e não tocar.
3. Tutorial (`tutorial-coach-steps.ts` + conteúdo do /tutorialexterno se citar as telas velhas):
   textos finais das rotas/nomes novos.
4. CRIAR `docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/QA-VPS.md` — roteiro pós-publish, na ordem:
   a. `docker ps` + logs backend (boot limpo; executores registrados no log do orquestrador).
   b. Rodar backfill: `node scripts/automation-agent-backfill.js` (idempotente).
   c. Login empresa de teste → hub → 4 seções → sandbox 2 cérebros → criar gatilho/rotina →
      aplicar cadência → redirects das 3 URLs velhas.
   d. Flags: dono injeta as `HBX_AUTOMATION_*` (valores no relatório) — flags de disparo REAL
      continuam OFF até decisão do dono.
   e. Teste de chip SÓ com número descartável (jamais o chip do dono) e SÓ se o dono mandar.
   f. Se S20 liberou DDL: rodar `automation-pre-drop-dump.sh` ANTES de mover a migration do hold.
5. CRIAR `RELATORIO-FINAL.md`: o que mudou (5 bullets), o que morreu, o que o dono precisa fazer
   (publish → backfill → flags → QA), mapa de rollback (backup Desktop + `127b9166`).

## Critérios de aceite
- Docs/Rules refletem o estado real do código; QA-VPS.md executável linha a linha; relatório final
  sem jargão (analogia de dinheiro onde couber — padrão da casa).

## DoD
Commit local: `docs(automation): S22 — regras, QA e relatório final da fusão`
