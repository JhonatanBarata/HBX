-- FISCAL DO TENANT F2a — comprovante sem valor fiscal na entrega (água/produto).
-- modoEmissaoProduto: quando a NF-e de produto é emitida (fechamento mensal ×
-- por entrega). comprovanteEntrega: entrega confirmada manda o PDF SEM VALOR
-- FISCAL no WhatsApp do cliente final (default OFF — é configuração de produto
-- por empresa; muda mensagem LIVE pra cliente, o tenant liga na tela fiscal).
-- ADITIVO: 2 colunas com default.
ALTER TABLE "FiscalTenantProfile" ADD COLUMN "modoEmissaoProduto" TEXT NOT NULL DEFAULT 'fechamento';
ALTER TABLE "FiscalTenantProfile" ADD COLUMN "comprovanteEntrega" BOOLEAN NOT NULL DEFAULT false;
