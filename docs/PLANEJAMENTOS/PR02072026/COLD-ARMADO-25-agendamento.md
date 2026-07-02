# COLD-25 — ARMADO (agendamento próprio) — disparar após WORM-12 + 1 pedido real

> Blueprint estratégico: `docs/PLANEJAMENTOS/cold/25-apps-integracoes.md`. NÃO deletar até disparar.
> **Gatilho:** WORM-12 (Atividades/agenda) ENTREGUE + pedido de 1 cliente real. Hoje WORM-12 ainda é
> plano (`worm/12-tela-atividades-agenda.md`), não foi construído → **este cold está BLOQUEADO por
> dependência**, não por decisão. Não disparar antes de WORM-12 aterrissar.

## A jogada (mais BR e barata que Calendly)
Não é marketplace de apps. É **agendamento próprio** com a vantagem que o Calendly não tem:
**lembrete via WhatsApp do sistema** (nosso território — motor já manda mensagem).

## Escopo
1. **Página pública** `hbx.app/agenda/{vendedor}`: o vendedor define janelas de horário; visitante
   escolhe slot livre. Confirmar → cria uma **Atividade (WORM-12)** no card do lead/oportunidade.
   Reusar o padrão de rota pública do `meta-lead-ads.webhook.controller.ts` / do endpoint de captura
   do COLD-22 (sem JwtAuthGuard, rate-limit, honeypot).
2. **Lembrete automático via WhatsApp** 1h antes (rotina de envio existente do motor — **NUNCA** tocar
   conexão de chip; só ENVIAR). Isto é o diferencial vs Calendly.
3. **Convite .ics** no e-mail de confirmação (padrão, sem integração paga).
4. **Adapter Calendly** (SÓ sob demanda): se um cliente já usa Calendly, o webhook deles é simples →
   adapter de ~1 dia que também cria a Atividade. Não fazer antes de pedido real.

## Modelo de dados (mínimo)
```
AvailabilitySlot { id, userId, weekday, startTime, endTime, active }   // janelas do vendedor
Appointment { id, companyId, sellerId, leadId?, name, phone, email, startsAt, status, icsUid,
              reminderSentAt?, source ('agenda_publica'|'calendly'), createdAt }
```
Confirmação de `Appointment` → chama o serviço de Atividades do WORM-12 (por isso a dependência dura).

## Testes
Slot ocupado não reserva 2x; lembrete dispara 1x (idempotente); confirmação cria Atividade no card;
honeypot/rate-limit na página pública.

## Custo/risco
Médio. Bloqueado por WORM-12. O lembrete-WhatsApp é o valor real — priorizar ele quando destravar.
