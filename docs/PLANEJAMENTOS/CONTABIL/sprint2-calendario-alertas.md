# CONTABIL S2 — Calendário fiscal + alertas (o app que não te deixa tomar multa)

**Objetivo:** máquina de estados das obrigações fiscais + alertas nos canais que o dono JÁ usa.
Depende do S1 (motor + modelos).

## Leia antes
- `backend/src/master-alert/master-alert.service.ts` — infra de alerta EXISTENTE (e-mail + zap via
  WebwhatsBridge + log). Best-effort, módulo-folha. É AQUI que o Contabil pluga; não criar canal novo.
- `docs/PLANEJAMENTOS/CONTABIL/README.md` (nota sobre Cockpit nº8/MasterEvent).

## Entregas

### 1. Migration `FiscalObligation`
```prisma
model FiscalObligation {
  id           String   @id @default(cuid())
  competencia  String                    // "2026-07"
  tipo         String                    // PGDASD | DAS | ESOCIAL_S1200 | DCTFWEB | DARF_INSS | DEFIS | LIVRO_CAIXA
  dueDate      DateTime
  estado       String   @default("AGUARDANDO_DADOS")
  // AGUARDANDO_DADOS -> PRONTO -> ARMADO -> TRANSMITIDO -> PAGO -> CONFERIDO ; + ATRASADO (overlay)
  payloadJson  String?                   // números prontos p/ transmitir (S5)
  resultJson   String?                   // recibo/nº protocolo/comprovante
  naoAplicavel Boolean  @default(false)  // ex.: mês sem pró-labore não tem ESOCIAL/DARF
  alertasEnviados String @default("[]")  // ["D-7","D-3"] — idempotência do alertador
  updatedAt    DateTime @updatedAt
  createdAt    DateTime @default(now())
  @@unique([competencia, tipo])
}
```

### 2. `obligation-scheduler.service.ts` (cron diário, padrão de cron da casa)
- **Gerador:** na virada de competência, cria as obrigações do mês:
  - PGDASD + DAS → vence dia 20 (antecipa p/ dia útil anterior se fds/feriado — usar tabela de
    feriados nacionais fixos + regra de fds; feriado móvel: aproximar pelo dia útil, boa o bastante);
  - ESOCIAL_S1200 + DCTFWEB → dia 15; DARF_INSS → dia 20 — **só se** `folhaMesCents > 0`
    (senão `naoAplicavel=true` — Fase 0 do manual: sem pró-labore, sem essas obrigações);
  - DEFIS → 31/03 (gerada 1x/ano, competência "AAAA-ANUAL");
  - LIVRO_CAIXA → lembrete mensal soft (nunca vira ATRASADO crítico).
- **Transições automáticas:** AGUARDANDO_DADOS → PRONTO quando o motor tem os números do mês
  (receita consolidada + folha definida); qualquer estado (exceto CONFERIDO/naoAplicavel) com
  `now > dueDate` ganha overlay ATRASADO.
- **Alertador:** D-7, D-3, D-1, D0 e ATRASADO(diário, máx 3) via `MasterAlertService` — criar
  método novo `fiscalObligationAlert(...)` no padrão dos existentes (best-effort, não derruba
  chamador). Idempotente via `alertasEnviados`. Teto global: máx 2 zaps fiscais/dia (anti-spam,
  mesma filosofia do teto do watcher do Cockpit nº8).
  - Texto do alerta com número pronto, ex.: *"⚠️ D-1: DAS de jun/2026 vence amanhã (20/07).
    Valor previsto: R$ 600,00. Abrir Contabil → Fechar o mês."*

### 3. Endpoints (owner-only)
- `GET /master/contabil/obrigacoes?competencia=` — lista com estados
- `POST /master/contabil/obrigacoes/:id/marcar` — body `{ estado, resultJson? }` (transições manuais:
  dono marcou TRANSMITIDO/PAGO com nº de recibo — é o modo semi-auto)
- `GET /master/contabil/proximas` — as 5 próximas (badge do master)

## Aceite
- Teste de integração: simular competência nova → obrigações geradas certas nos 2 cenários
  (com e sem pró-labore); simular D-1 → alerta disparado 1x (re-rodar cron NÃO duplica).
- Teste das regras de data (dia 20 caindo no sábado → sexta).
- tsc + suíte verde. Alerta de teste real chegando no zap do dono (1 disparo controlado,
  combinado no chat antes).

## Guardrails
- Alertas best-effort: falha de zap NUNCA quebra o cron (padrão master-alert).
- Não usar MasterEvent (worktree nº8 não publicado) — plugin direto no MasterAlertService; deixar
  comentário `// TODO(cockpit-n8): migrar p/ trilha MasterEvent quando aterrissar`.
