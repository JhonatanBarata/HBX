const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');

test('importador RFB preserva fax e dígitos em campos separados', () => {
  const source = read('scripts/import-cnpj-dataset.js');

  assert.match(source, /"phone2", "fax", "faxDigits", "cnaeSecundarias"/);
  assert.match(source, /coalesce\(e\.ddd_fax, ''\) \|\| coalesce\(e\.fax, ''\)/);
  assert.match(source, /"fax" = COALESCE\(EXCLUDED\."fax", "CnpjPublicCompany"\."fax"\)/);
  assert.match(source, /"faxDigits" = COALESCE\(EXCLUDED\."faxDigits", "CnpjPublicCompany"\."faxDigits"\)/);
});

test('fax preserva a origem RFB e entra como terceiro telefone ligável', () => {
  const query = read('src/webscraping/radar/providers/cnpj-public/cnpj-base-query.service.ts');
  const delivery = read('src/webscraping/radar/05-delivery/radar-core-delivery.mixin.ts');
  const harvest = read('src/webscraping/lead-harvest/lead-harvest-import.service.ts');

  assert.match(query, /phone3:\s*row\.fax/);
  assert.match(delivery, /source:\s*'rfb_fax'/);
  assert.match(delivery, /\[phone1,\s*phone2,\s*phone3\]/);
  assert.match(harvest, /source:\s*isRfb\s*\?\s*'rfb_fax'/);
});
