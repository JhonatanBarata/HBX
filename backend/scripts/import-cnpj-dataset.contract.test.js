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

test('fax não entra no contrato público nem no materializador de contatos 3x3', () => {
  const commercialProjectionFiles = [
    'src/webscraping/radar/providers/cnpj-public/cnpj-public-types.ts',
    'src/webscraping/radar/providers/cnpj-public/cnpj-base-query.service.ts',
    'src/webscraping/radar/05-delivery/radar-core-delivery.mixin.ts',
    'src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts',
  ];

  for (const relativePath of commercialProjectionFiles) {
    assert.doesNotMatch(read(relativePath), /\bfax(?:Digits)?\b/i, relativePath);
  }
});
