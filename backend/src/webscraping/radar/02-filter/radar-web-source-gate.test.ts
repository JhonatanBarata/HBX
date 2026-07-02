import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarWebSourceGateService } from './radar-web-source-gate.service';

const gate = new RadarWebSourceGateService();

test('web gate MATA host telelistas.com.br (diretorio/blacklist)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Pizzaria Brock',
      sourceUrl: 'https://www.telelistas.com.br/fortaleza/pizzarias',
      city: 'Fortaleza',
      state: 'CE',
    },
  });
  assert.equal(result.passed, false);
  assert.match(result.reason || '', /^web_gate:/);
});

test('web gate MATA nome titulo-lista ("As 10 melhores pizzarias de Fortaleza")', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'As 10 melhores pizzarias de Fortaleza',
      sourceUrl: 'https://exemplo-qualquer.com.br/blog',
      city: 'Fortaleza',
      state: 'CE',
    },
  });
  assert.equal(result.passed, false);
  assert.match(result.reason || '', /^web_gate:/);
});

test('web gate MATA cidade conflitante (pedida != candidato, ambas presentes)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Pizzaria Brock',
      sourceUrl: 'https://pizzariabrock.com.br',
      city: 'Sao Paulo',
      state: 'SP',
    },
    filters: { city: 'Fortaleza', state: 'CE' } as any,
  });
  assert.equal(result.passed, false);
  assert.match(result.reason || '', /geo_conflict/);
});

test('web gate DEIXA passar "Pizzaria Brock" com site proprio e cidade certa', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Pizzaria Brock',
      sourceUrl: 'https://pizzariabrock.com.br',
      city: 'Fortaleza',
      state: 'CE',
    },
    filters: { city: 'Fortaleza', state: 'CE' } as any,
  });
  assert.equal(result.passed, true);
  assert.equal(result.reason, null);
});

test('web gate DEIXA passar quando cidade/UF do candidato estao ausentes (nao inventa exigencia)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Pizzaria Brock',
      sourceUrl: 'https://pizzariabrock.com.br',
    },
    filters: { city: 'Fortaleza', state: 'CE' } as any,
  });
  assert.equal(result.passed, true);
});

test('web gate NAO roda pra source cnpj_public (sempre passa, mesmo com lixo aparente)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'cnpj_public',
      name: 'As 10 melhores pizzarias de Fortaleza',
      sourceUrl: 'https://www.telelistas.com.br/fortaleza/pizzarias',
      city: 'Sao Paulo',
      state: 'SP',
    },
    filters: { city: 'Fortaleza', state: 'CE' } as any,
  });
  assert.equal(result.passed, true);
  assert.equal(result.reason, null);
  assert.equal(gate.appliesTo({ source: 'cnpj_public' }), false);
});

test('web gate NAO roda pra source radar_database', () => {
  assert.equal(gate.appliesTo({ source: 'radar_database' }), false);
  assert.equal(gate.appliesTo({ sourceEngine: 'radar_database' }), false);
});

test('web gate RODA pra qualquer fonte que nao seja cnpj_public/radar_database', () => {
  assert.equal(gate.appliesTo({ source: 'hbx_engine' }), true);
  assert.equal(gate.appliesTo({ sourceEngine: 'google' }), true);
  assert.equal(gate.appliesTo({}), true);
});

// C3 (calibracao round-2, 01/07): hosts de agendamento/diretorio que vazaram em run real
// (barbearia/Goiânia) — item deles passava como "found".
test('web gate MATA hosts novos de agendamento/diretorio (booksy, trinks, fresha, curtamais...)', () => {
  const hosts = [
    'https://booksy.com/pt-br/dsdb/barbearia-marista',
    'https://www.trinks.com/estabelecimento/soul-blues-barbearia',
    'https://fresha.com/a/barbearia-general-brook',
    'https://agendaboa.com/new-vikings',
    'https://appbarber.com.br/loja/exemplo',
    'https://www.curtamais.com.br/salao/exemplo',
    'https://vidabrilhante.com/estabelecimento/exemplo',
  ];
  for (const sourceUrl of hosts) {
    const result = gate.evaluate({ candidate: { source: 'hbx_engine', name: 'Barbearia Exemplo', sourceUrl } });
    assert.equal(result.passed, false, sourceUrl);
    assert.match(result.reason || '', /^web_gate:/, sourceUrl);
  }
});

test('web gate MATA por brand_name quando o nome do candidato e EXATAMENTE a marca conhecida ("Booksy")', () => {
  const result = gate.evaluate({
    candidate: { source: 'hbx_engine', name: 'Booksy', sourceUrl: 'https://exemplo-qualquer.com.br/pagina' },
  });
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'web_gate:brand_name');
});

test('web gate NAO mata por brand_name quando o nome so CONTEM a marca (nao e exato)', () => {
  const result = gate.evaluate({
    candidate: { source: 'hbx_engine', name: 'Barbearia Booksy Parceira', sourceUrl: 'https://pizzariabrock.com.br' },
  });
  assert.equal(result.passed, true);
});

// R2 (calibracao round-3, 01/07): MEDIDO — 13 pizzarias reais (nome proprio + fone proprio
// via schema.org de pagina agregadora) mortas por sourceUrl bloqueado. Em nicho delivery/
// cidade menor, quase todo lead real chega assim; matar cego joga a riqueza fora. Agora:
// candidato com canal proprio acionavel (fone/instagram/facebook) + nome nao-marca +
// nao-titulo-lista -> passa com website zerado (nao com sourceUrl mentindo "site oficial").
test('web gate: sourceUrl de agregador NAO mata quando ha canal proprio (fone) + nome nao-marca — passa com website zerado', () => {
  const candidate: Record<string, any> = {
    source: 'hbx_engine',
    name: 'Oeste Barbearia',
    sourceUrl: 'https://trinks.com/oestebarbearia',
    website: 'https://trinks.com/oestebarbearia',
    phoneDigits: '62999990001',
  };
  const result = gate.evaluate({ candidate });
  assert.equal(result.passed, true);
  assert.equal(result.reason, null);
  assert.equal(candidate.website, null);
});

test('web gate: sourceUrl de agregador com instagram proprio (sem fone) tambem passa', () => {
  const candidate: Record<string, any> = {
    source: 'hbx_engine',
    name: 'Pizzaria Real Delivery',
    sourceUrl: 'https://ifood.com.br/delivery/goiania/pizzaria-real',
    instagramUrl: 'https://instagram.com/pizzariareal',
  };
  const result = gate.evaluate({ candidate });
  assert.equal(result.passed, true);
  assert.equal(result.reason, null);
});

test('web gate: sourceUrl de agregador SEM canal proprio ainda mata o item (procedencia decide)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Oeste Barbearia',
      sourceUrl: 'https://trinks.com/oestebarbearia',
    },
  });
  assert.equal(result.passed, false);
  assert.match(result.reason || '', /^web_gate:/);
});

test('web gate: sourceUrl de agregador com canal proprio, mas nome EXATO de marca conhecida, continua morto (brand_name)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Trinks',
      sourceUrl: 'https://trinks.com/oestebarbearia',
      phoneDigits: '62999990001',
    },
  });
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'web_gate:brand_name');
});

test('web gate: sourceUrl de agregador com canal proprio, mas nome titulo-lista, continua morto', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'As 10 melhores pizzarias de Goiânia',
      sourceUrl: 'https://trinks.com/lista-pizzarias',
      phoneDigits: '62999990001',
    },
  });
  assert.equal(result.passed, false);
  assert.match(result.reason || '', /^web_gate:/);
});

test('web gate: sourceUrl telelistas SEM contato proprio continua morto', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Pizzaria Sem Contato',
      sourceUrl: 'https://www.telelistas.com.br/fortaleza/pizzarias',
    },
  });
  assert.equal(result.passed, false);
  assert.match(result.reason || '', /^web_gate:/);
});

test('web gate: website em host de diretorio NAO mata sozinho quando ha fone proprio — so zera o website', () => {
  const candidate: Record<string, any> = {
    source: 'hbx_engine',
    name: 'Oeste Barbearia',
    website: 'https://trinks.com/oestebarbearia',
    phoneDigits: '62999990001',
  };
  const result = gate.evaluate({ candidate });
  assert.equal(result.passed, true);
  assert.equal(result.reason, null);
  assert.equal(candidate.website, null);
});

test('web gate: website em host de diretorio SEM canal proprio ainda mata o item', () => {
  const candidate: Record<string, any> = {
    source: 'hbx_engine',
    name: 'Oeste Barbearia',
    website: 'https://trinks.com/oestebarbearia',
  };
  const result = gate.evaluate({ candidate });
  assert.equal(result.passed, false);
  assert.match(result.reason || '', /^web_gate:/);
});
