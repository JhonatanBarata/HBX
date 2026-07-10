# W8 — P1.2: análise p/ virar MP_WEBHOOK_SIGNATURE_MODE=enforce
VPS READ-ONLY: env atual do container, logs desde 08/07 — assinaturas válidas vs inválidas, origem das
inválidas, algum webhook legítimo do MP SEM assinatura? Veredito: seguro virar enforce? Incluir comando
exato de recreate (INFRA.md). O flip quem faz é o orquestrador, não este worker.
