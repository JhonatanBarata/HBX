# S5 — Agenda de slots + config ENXUTA do admin

## Conceito (decisão do dono 25/07)
"Admin faz a primeira config, que é o horário, limites de disparo por user/chip e tempo. O resto
é na hora." Agendamento tipo consultório: ao agendar um disparo, o sistema MOSTRA o próximo
horário livre respeitando janela e limites. Fora da janela → bloqueia e oferece o próximo dia
útil no horário do adm. As regras de horário JÁ EXISTEM no motor de Prospecção automática
(`backend/src/vendas/vendas-automation.service.ts`: `workingHoursStart/End` 08:00–18:00,
`isInsideWorkingHours`, `moveToBusinessDay`, status "dormindo") — COLHER, não reescrever.
NADA das regras se perde (ordem literal do dono); o cadastro imenso morre depois (S7).

## Entrega
1. **Config comercial enxuta por empresa** (1 lugar só): janela de horário (início/fim, dias
   úteis), teto de disparos por user/chip/dia, intervalo mínimo entre disparos. Fonte da
   verdade única — se o registro da campanha de prospecção já guarda isso, PROMOVER esse
   registro a config da empresa (sem duplicar em tabela nova se der pra reaproveitar).
   Tela mínima de admin (1 cartão, 3 campos + salvar) — sem textão, tokens centrais.
2. **Serviço de slots**: dado empresa+chip/user, devolve o próximo horário livre considerando
   janela + teto + intervalo + o que JÁ está agendado. API `GET /vendas/agenda-disparo/proximo-slot`
   (+ variação com data desejada → devolve "ocupado, próximo livre é X").
3. **Solda no runner da cadência**: quando o runner (S4) for agendar um passo, usa o serviço de
   slots (nunca fura janela/teto/intervalo — hoje o runner diário já adia por teto; unificar a
   decisão no serviço de slots).
4. **Solda na UI**: onde o vendedor agenda disparo/retorno (agenda de retornos do /vendas),
   mostrar o próximo slot livre e acusar conflito na hora ("08:00 ocupado — próximo livre
   08:15"). Copy mínima; strings novas no relatório.
5. **Duas agendas separadas** (conceito do plano): disparos do robô NÃO poluem a agenda humana
   de retornos — o vendedor vê os SEUS compromissos; a fila do robô aparece só no detalhes do
   lead (próximo passo) e no selo do card.

## O que NÃO fazer
- NÃO remover o cadastro/motor antigo de Prospecção automática (S7 mata a raiz; aqui só se
  COLHE as regras). NÃO mexer nos freios físicos de envio.
- NÃO tocar na agenda da Logística (é outro domínio). NÃO tocar atendimento/recovery/Webwhats.

## Aceite
- Testes: slot respeita janela/teto/intervalo; fora da janela → próximo dia útil no horário
  configurado; concorrência de 2 agendamentos no mesmo slot não fura teto.
- Typecheck + suítes tocadas verdes. Commit local:
  `feat(vendas): agenda de slots de disparo + config enxuta do admin (S5 LEAD-CENTRICO)`.
- Guardrails gerais: `00-FRENTE.md`.
