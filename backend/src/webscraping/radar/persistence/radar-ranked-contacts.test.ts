import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRankedRadarContacts } from './radar-ranked-contacts';

test('buildRankedRadarContacts preserva ordem, proveniencia e limita email/telefone a 3', () => {
  const result = buildRankedRadarContacts({
    primaryEmail: 'vendas@empresa.com.br',
    primaryPhone: '(19) 99999-1111',
    sourceEngine: 'hbx',
    evidenceJson: {
      extractedFields: {
        emails: ['vendas@empresa.com.br', 'contato@empresa.com.br', 'financeiro@empresa.com.br', 'quarto@empresa.com.br'],
        phones: ['(19) 99999-1111', '(19) 98888-2222', '(19) 3333-4444', '(19) 3222-5555'],
      },
    },
  });

  assert.deepEqual(result.emails, ['vendas@empresa.com.br', 'contato@empresa.com.br', 'financeiro@empresa.com.br']);
  assert.deepEqual(result.phones, ['19999991111', '19988882222', '1933334444']);
  assert.deepEqual(result.candidates.filter((item) => item.kind === 'email').map((item) => [item.rank, item.source]), [
    [1, 'hbx'],
    [2, 'website_crawl_light'],
    [3, 'website_crawl_light'],
  ]);
});

test('buildRankedRadarContacts reaproveita metadata sem duplicar formatos de telefone', () => {
  const result = buildRankedRadarContacts({
    primaryPhone: '5519999991111',
    evidenceJson: { extractedFields: { whatsappPhoneDigits: ['551988887777'] } },
    existingMetadataJson: {
      emails: ['contato@empresa.com.br'],
      phones: ['+55 (19) 99999-1111', '1933334444'],
    },
  });

  assert.deepEqual(result.emails, ['contato@empresa.com.br']);
  assert.deepEqual(result.phones, ['19999991111', '19988887777', '1933334444']);
  assert.equal(result.phones.filter((phone) => phone.includes('999991111')).length, 1, '+55 e local representam o mesmo telefone');
  assert.equal(result.candidates.find((item) => item.value === '19988887777')?.source, 'website_crawl_light');
  assert.equal(result.candidates.find((item) => item.value === '1933334444')?.source, 'metadata_existing');
});

test('buildRankedRadarContacts elimina ruido antes de limitar e renumera aprovados por kind', () => {
  const result = buildRankedRadarContacts({
    primaryEmail: 'logo@2x.png',
    primaryPhone: '11999999999',
    sourceEngine: 'hbx',
    evidenceJson: {
      extractedFields: {
        emails: [
          'admin@example.com',
          'contato@empresa.com.br',
          'financeiro@empresa.com.br',
          'vendas@empresa.com.br',
          'quarto@empresa.com.br',
        ],
        phones: ['12345678', '(19) 99999-1111', '(19) 98888-2222', '(19) 3333-4444', '(19) 3222-5555'],
      },
    },
  });

  assert.deepEqual(result.emails, ['contato@empresa.com.br', 'financeiro@empresa.com.br', 'vendas@empresa.com.br']);
  assert.deepEqual(result.phones, ['19999991111', '19988882222', '1933334444']);
  assert.deepEqual(result.candidates.filter((item) => item.kind === 'email').map((item) => item.rank), [1, 2, 3]);
  assert.deepEqual(result.candidates.filter((item) => item.kind === 'phone').map((item) => item.rank), [1, 2, 3]);
  assert.ok(!JSON.stringify(result).includes('logo@2x.png'));
  assert.ok(!JSON.stringify(result).includes('example.com'));
  assert.ok(!JSON.stringify(result).includes('11999999999'));
  assert.ok(!JSON.stringify(result).includes('12345678'));
});
