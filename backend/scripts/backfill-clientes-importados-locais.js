'use strict';

/**
 * Corrige clientes inseridos diretamente em CustomerProfile que ficaram sem
 * LocalEntrega ativo. O app considera o local ativo como fonte operacional do
 * endereço; por isso editar e salvar o CEP manualmente fazia o cliente “voltar”.
 *
 * Uso:
 *   node scripts/backfill-clientes-importados-locais.js --dry-run
 *   node scripts/backfill-clientes-importados-locais.js --companyId=42
 *
 * Idempotente