-- A entrega de lead custa sempre 1 crédito. Overrides antigos de modo/custo são removidos;
-- o runtime também ignora e recusa novas tentativas de sobrescrever esta ação.
DELETE FROM "CreditActionConfig"
WHERE "actionKey" = 'lead_delivery';
