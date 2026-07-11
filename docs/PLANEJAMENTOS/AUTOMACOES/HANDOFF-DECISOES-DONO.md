# Automações — o que é DECISÃO DO DONO (não faço sozinho)

Auditoria 11/07 (Opus orquestrador). O reversível (F1 e-mail real + F3 ponte visual) está sendo
orquestrado com workers, tudo LOCAL e atrás de flag OFF. As duas alavancas abaixo são AO VIVO /
irreversíveis ou expansão de escopo — ficam com o dono.

## Estado real em prod (medido, não suposto)
| Peça | Prod | Observação |
|---|---|---|
| Backend `/cadencia/*` | ✅ NO AR | rotas mapeadas, boot limpo, migration `20260702240000_add_cadencia` aplicada, 4 tabelas, 6 cadências-seed |
| Frontend `/automacoes` v2 | ✅ NO AR | redesenho publicado no `47ae2e7a` (hero/stats/auto-fit/fix trilha) |
| **Gatilhos** | ✅ AO VIVO | disparam sem flag (hook inbound). Movem etapa / criam atividade / notificam. FUNCIONANDO |
| WhatsApp da cadência | ⚙️ pronto, gated | sai pelo cano do bot de prospecção quando o runner liga |
| **Runner (cadência+rotina)** | ⛔ OFF | `HBX_CADENCIA_RUNNER_ENABLED` AUSENTE do `.env` da VPS |
| E-mail da cadência | 🔧 stub→F1 | vira envio real por-tenant, flag OFF (worker em execução) |

## DECISÃO 1 — Ligar o motor de cadência/rotina (F2)  ⚠️ AÇÃO AO VIVO
Ligar `HBX_CADENCIA_RUNNER_ENABLED=1` faz as cadências devidas DISPARAREM sozinhas — inclusive
**WhatsApp para leads reais** (pelo cano do bot, teto 10/dia/empresa). É a máquina que o dono
sempre pediu cautela. NÃO ligo sozinho (guardrail WhatsApp + "não decidir sem o dono").
- Como ligar (quando o dono mandar): adicionar no `.env` da VPS e **RECREATE** o container
  (mudar env_file = recreate, não restart — regra INFRA). Comando cirúrgico:
  `HBX_CADENCIA_RUNNER_ENABLED=1` + (opcional) `HBX_CADENCIA_EMAIL_ENABLED=1` depois do F1 publicado.
- Recomendação de rollout (padrão dos créditos): ligar PRIMEIRO só com cadência de teste numa
  empresa minha/descartável, ver o `[cadencia] tick` no log sem loop por uns minutos, e só então
  abrir. Nunca ligar direto no chip do dono.
- **Pré-requisito:** F1 publicado antes de ligar o e-mail; senão o passo de e-mail continua stub.

## DECISÃO 2 — Gatilho aciona o Bot na conversa (F4)  ⚠️ EXPANSÃO + toca WhatsApp
Hoje o gatilho reage no funil (move etapa/atividade/notifica). F4 = nova ação "ligar o bot de
prospecção nessa conversa" quando o lead responde. É onde Bot e Automações se casam de verdade.
Mas: (a) é feature nova, não só acabamento; (b) toca o caminho vivo do bot/WhatsApp. Precisa go
explícito do dono + desenho (qual bot, com que teto, reaproveitando o IntentEngine já em prod com
flag OFF). NÃO construído nesta rodada. Se o dono quiser, vira o próximo .md.

## Gaps menores (opcionais, fase 2 — não bloqueiam nada)
- Rotina não deixa escolher o vendedor de destino na criação (`assignedSellerId` existe no back,
  falta no modal).
- "N leads dentro" no card não abre a lista de inscritos (back tem `cancelarInscricoes`, falta UI).
- Só o evento `lead_respondeu_whatsapp` é exposto no gatilho (back suporta `email_lido`).
Nenhum é urgente; levanto porque escopo fechado sem item de fase 2 vira buraco silencioso.

## O que EU faço nesta rodada (reversível, sem publish)
- F1 e-mail real (flag OFF) + testes.
- F3 ponte visual Bot↔Automações.
- Reviso os diffs, rodo build/typecheck/lint/jest, provo F3 no Chrome. Deixo commitado LOCAL.
- **Publish é do dono.** As duas flags nascem OFF; nada dispara sozinho.
