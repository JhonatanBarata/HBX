import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarWebSourceGateService } from './radar-web-source-gate.service';
import { RadarQualityGateService } from './radar-quality-gate.service';
import { RadarWebscrapingCoreService } from '../radar-webscraping-core.service';

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

// ── F3 REFUNDAÇÃO (28/07): porta de realidade — casos REAIS de Zacarias/SP e Aguaí/SP ──

test('F3: portal global MORRE mesmo com telefone proprio (eBay/CBS/KSDK/Climatempo/Buser em Zacarias)', () => {
  const cases = [
    { name: 'eBay', sourceUrl: 'https://www.ebay.com/b/agua-mineral' },
    { name: 'CBS Sports', sourceUrl: 'https://www.cbssports.com/nfl/news' },
    { name: 'KSDK', sourceUrl: 'https://www.ksdk.com/article/news/local' },
    { name: 'Climatempo', sourceUrl: 'https://www.climatempo.com.br/previsao-do-tempo/cidade/5427/zacarias-sp' },
    { name: 'Buser', sourceUrl: 'https://www.buser.com.br/onibus/zacarias' },
    { name: 'Mercado Livre', sourceUrl: 'https://www.mercadolivre.com.br/galao-agua-20l' },
    { name: 'Amazon', website: 'https://www.amazon.com.br/agua' },
    { name: 'Magazine Luiza', sourceUrl: 'https://www.magazineluiza.com.br/busca/agua' },
  ];
  for (const item of cases) {
    const result = gate.evaluate({
      candidate: { source: 'hbx_engine', phoneDigits: '11999990001', ...item },
      filters: { city: 'Zacarias', state: 'SP' } as any,
    });
    assert.equal(result.passed, false, item.name);
    assert.equal(result.reason, 'web_gate:global_portal', item.name);
  }
});

test('F3: portal global tambem morre so pelo NOME exato ("eBay" sem host mapeavel)', () => {
  const result = gate.evaluate({
    candidate: { source: 'hbx_engine', name: 'eBay', phoneDigits: '11999990001' },
  });
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'web_gate:global_portal');
});

test('F3: pagina de diretorio "Distribuidores de Agua em Aguai" NAO e empresa — morre por titulo', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Distribuidores de Água em Aguaí',
      sourceUrl: 'https://guia-generico-qualquer.com.br/distribuidores',
      phoneDigits: '19999990001',
    },
    filters: { city: 'Aguaí', state: 'SP' } as any,
  });
  assert.equal(result.passed, false);
  assert.match(result.reason || '', /title_list_pattern/);
});

test('F3: empresa real singular com "de" no nome NAO cai no padrao de diretorio', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Distribuidora de Água Chagas',
      sourceUrl: 'https://distribuidorachagas.com.br',
      phoneDigits: '19999990001',
    },
    filters: { city: 'Aguaí', state: 'SP' } as any,
  });
  assert.equal(result.passed, true);
});

test('F3 sinal local: cidade pequena SEM nenhum sinal (DDD errado, cidade fora do conteudo, sem RFB) REPROVA', () => {
  const result = gate.evaluateLocalReality({
    candidate: {
      source: 'hbx_engine',
      name: 'Portal Aleatorio de Ofertas',
      sourceUrl: 'https://ofertas-globais.com/agua',
      phoneDigits: '11999990001', // DDD 11 (SP capital) — Zacarias é 18
    },
    filters: { city: 'Zacarias', state: 'SP' } as any,
    rfbMatched: false,
    rfbUnavailable: false,
    cityDddHints: ['18'],
  });
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'web_gate:no_local_signal');
});

test('F3 sinal local: DDD da cidade no telefone PASSA', () => {
  const result = gate.evaluateLocalReality({
    candidate: { source: 'hbx_engine', name: 'Distribuidora Regional', phoneDigits: '18999990001' },
    filters: { city: 'Zacarias', state: 'SP' } as any,
    cityDddHints: ['18'],
  });
  assert.equal(result.passed, true);
});

test('F3 sinal local: nome da cidade no CONTEUDO passa (endereco/snippet), mas city/state carimbados NAO contam', () => {
  const comConteudo = gate.evaluateLocalReality({
    candidate: {
      source: 'hbx_engine',
      name: 'Distribuidora Regional',
      address: 'Rua Principal, 100 - Centro, Zacarias - SP',
      phoneDigits: '11999990001',
    },
    filters: { city: 'Zacarias', state: 'SP' } as any,
    cityDddHints: ['18'],
  });
  assert.equal(comConteudo.passed, true);

  const soCarimbo = gate.evaluateLocalReality({
    candidate: {
      source: 'hbx_engine',
      name: 'Distribuidora Regional',
      city: 'Zacarias',
      state: 'SP',
      phoneDigits: '11999990001',
    },
    filters: { city: 'Zacarias', state: 'SP' } as any,
    cityDddHints: ['18'],
  });
  assert.equal(soCarimbo.passed, false);
});

test('F3 sinal local: match RFB passa direto', () => {
  const result = gate.evaluateLocalReality({
    candidate: { source: 'hbx_engine', name: 'Distribuidora Regional', phoneDigits: '11999990001' },
    filters: { city: 'Zacarias', state: 'SP' } as any,
    rfbMatched: true,
    cityDddHints: ['18'],
  });
  assert.equal(result.passed, true);
});

test('F3 sinal local: capital/cidade grande NAO exige sinal local (nao quebrar o que funciona)', () => {
  const result = gate.evaluateLocalReality({
    candidate: { source: 'hbx_engine', name: 'Empresa Qualquer', phoneDigits: '21999990001' },
    filters: { city: 'São Paulo', state: 'SP' } as any,
    cityDddHints: ['11'],
  });
  assert.equal(result.passed, true);
});

test('F3 sinal local: RFB indisponivel + sem DDD conhecido = gracioso, passa (nunca trava a entrega)', () => {
  const result = gate.evaluateLocalReality({
    candidate: { source: 'hbx_engine', name: 'Distribuidora Regional', phoneDigits: '11999990001' },
    filters: { city: 'Zacarias', state: 'SP' } as any,
    rfbMatched: false,
    rfbUnavailable: true,
    cityDddHints: null,
  });
  assert.equal(result.passed, true);
});

test('F3 sinal local: fonte Receita/database nao passa por esta porta', () => {
  const result = gate.evaluateLocalReality({
    candidate: { source: 'cnpj_public', name: 'Empresa da Receita' },
    filters: { city: 'Zacarias', state: 'SP' } as any,
    cityDddHints: ['18'],
  });
  assert.equal(result.passed, true);
});

// ── E4 ESTABILIZAÇÃO (29/07) — cidade na URL deixou de ser sinal local ──────────────────────
// Caso real de Analândia/SP: tiempo.com/brasil/analandia/por-horas (previsão do tempo) e
// querobrasil.com.br/sp/analandia/agua-saneamento (página de categoria) passavam no sinal
// local só porque o CAMINHO do link tem o nome da cidade — o padrão exato de portal com
// página por cidade. Sinal por texto agora é só o que a empresa DIZ (nome/endereço/descrição).

test('E4 sinal local: cidade SO na sourceUrl (portal com pagina por cidade) REPROVA', () => {
  const result = gate.evaluateLocalReality({
    candidate: {
      source: 'hbx_engine',
      name: 'Meteored',
      sourceUrl: 'https://www.tiempo.com/brasil/analandia/por-horas',
      phoneDigits: '1130001000', // DDD 11 — Analândia é 19
    },
    filters: { city: 'Analândia', state: 'SP' } as any,
    rfbMatched: false,
    rfbUnavailable: false,
    cityDddHints: ['19'],
  });
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'web_gate:no_local_signal');
});

test('E4 sinal local: cidade SO no website (pagina de categoria) REPROVA', () => {
  const result = gate.evaluateLocalReality({
    candidate: {
      source: 'hbx_engine',
      name: 'Quero Brasil',
      website: 'https://www.querobrasil.com.br/sp/analandia/agua-saneamento',
      phoneDigits: '1130001001',
    },
    filters: { city: 'Analândia', state: 'SP' } as any,
    rfbMatched: false,
    rfbUnavailable: false,
    cityDddHints: ['19'],
  });
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'web_gate:no_local_signal');
});

test('E4 sinal local: cidade no ENDERECO segue passando (conteudo proprio continua valendo)', () => {
  const result = gate.evaluateLocalReality({
    candidate: {
      source: 'hbx_engine',
      name: 'Distribuidora Regional',
      address: 'Av. Central, 45 - Centro, Analândia - SP',
      sourceUrl: 'https://distribuidoraregional.com.br',
      phoneDigits: '1130001002',
    },
    filters: { city: 'Analândia', state: 'SP' } as any,
    rfbMatched: false,
    rfbUnavailable: false,
    cityDddHints: ['19'],
  });
  assert.equal(result.passed, true);
});

// ── E3 ESTABILIZAÇÃO (29/07) — cidade por EVIDÊNCIA na procedência ──────────────────────────
// Caso real: "PA PINGO D AGUA" veio de qualotelefone.com/sp/campinas/... e saiu carimbado
// "Analândia" — o carimbo herdado da busca fazia o checkGeoConflict comparar consigo mesmo,
// e o DDD 19 cobre as duas cidades. O slug só conta se for município REAL do estado.

test('E3 geo-evidencia: URL /sp/campinas com busca em Analandia REPROVA (geo_conflict_source)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'PA Pingo D Agua Distribuidora de Agua',
      sourceUrl: 'https://www.qualotelefone.com/sp/campinas/pa-pingo-d-agua',
      phoneDigits: '19999990010',
      city: 'Analândia',
      state: 'SP',
    },
    filters: { city: 'Analândia', state: 'SP' } as any,
  });
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'web_gate:geo_conflict_source');
});

test('E3 geo-evidencia: URL com a MESMA cidade da busca segue passando (nao vira aprovacao)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Distribuidora Local',
      sourceUrl: 'https://www.qualotelefone.com/sp/analandia/distribuidora-local',
      phoneDigits: '19999990011',
    },
    filters: { city: 'Analândia', state: 'SP' } as any,
  });
  assert.equal(result.passed, true);
});

test('E3 geo-evidencia: cidade vizinha do RAIO (regionalCities) e permitida', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Distribuidora Vizinha',
      sourceUrl: 'https://www.qualotelefone.com/sp/campinas/distribuidora-vizinha',
      phoneDigits: '19999990012',
    },
    filters: { city: 'Analândia', state: 'SP', regionalCities: [{ city: 'Campinas', state: 'SP' }] } as any,
  });
  assert.equal(result.passed, true);
});

test('E3 geo-evidencia: segmento de CATEGORIA depois da UF nao vira cidade por engano', () => {
  // "/sp/agua-saneamento" — "agua saneamento" nao e municipio de SP; nada a acusar.
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Empresa Qualquer',
      sourceUrl: 'https://www.diretorio-exemplo.com.br/sp/agua-saneamento/empresa-qualquer',
      phoneDigits: '19999990013',
    },
    filters: { city: 'Analândia', state: 'SP' } as any,
  });
  assert.equal(result.passed, true);
});

// ── LOTE 1 (17/08 — PR17082026): a evidência positiva de CNAE também vale na LANE WEB ───────
// "ÁGUA MINERAL DISTRIBUIDORA RICCI" veio da web e morreu na MESMA trava da porta da Receita:
// a regra `varejo_puro` mata o CNAE 4723-7/00, que é onde a distribuidora de água mora. Aqui o
// CNAE existe porque a reconciliação RFB roda ANTES deste gate. Sem CNAE nada muda.
const qualityGate = new RadarQualityGateService();
const hostDePassagem = {
  isGenericDirectoryName: () => false,
  nameConflictsWithRequestedSegment: () => false,
  hasUsablePublicContactChannel: () => true,
  isBlockedLeadOfficialWebsite: () => false,
};
const filtrosValinhos = { city: 'Valinhos', state: 'SP', segment: 'distribuidoras de água' } as any;

function avaliarNaLaneWeb(candidate: Record<string, any>) {
  return qualityGate.evaluate({ candidate, filters: filtrosValinhos, host: hostDePassagem as any });
}

test('LOTE 1 lane web: RICCI reconciliada com CNAE 4723700 nao morre mais em varejo_puro', () => {
  const result = avaliarNaLaneWeb({
    source: 'hbx_engine',
    name: 'ÁGUA MINERAL DISTRIBUIDORA RICCI',
    city: 'Valinhos',
    state: 'SP',
    phoneDigits: '19999990001',
    cnae: '4723-7/00',
    cnaeDescription: 'Comercio varejista de bebidas',
  });
  assert.ok(!result.hardBlockers.some((item) => item.startsWith('segment_excluded_')), result.reason);
});

test('LOTE 1 lane web: CNAE fora da allowlist continua morrendo (roupa segue roupa)', () => {
  const result = avaliarNaLaneWeb({
    source: 'hbx_engine',
    name: 'AGUA VIVA MODAS',
    city: 'Valinhos',
    state: 'SP',
    phoneDigits: '19999990002',
    cnae: '4781-4/00',
    cnaeDescription: 'Comercio varejista de artigos do vestuario',
  });
  assert.ok(result.hardBlockers.includes('segment_excluded_varejo_puro'));
});

test('LOTE 1 lane web: candidato SEM CNAE tem o comportamento de hoje, intacto', () => {
  const result = avaliarNaLaneWeb({
    source: 'hbx_engine',
    name: 'Distribuidora de Energia Alfa',
    city: 'Valinhos',
    state: 'SP',
    phoneDigits: '19999990003',
    cnaeDescription: 'Distribuicao de energia eletrica',
  });
  assert.ok(result.hardBlockers.includes('segment_excluded_energia_agua_combustivel'));
});

// ── LOTE 1 · O SINAL TEXTUAL DA ALLOWLIST NÃO ENXERGAVA A RAZÃO SOCIAL (17/08) ──────────────
// Na porta da Receita a evidência positiva varre [nomeFantasia, razaoSocial, cnae,
// cnaeDescription] (cnpj-public-provider.service.ts). Na lane WEB o gate varria
// [name, cnaeDescription, category] e o mixin de qualidade [name, cnaeDescription,
// businessCategory, category] — a razão social ficava de fora nos DOIS. E a reconciliação RFB
// (cnpj-rfb-reconcile.service.ts) preenche `cnae`, `cnaeDescription` e `razaoSocial` no
// candidato, mas NUNCA o `name` (na web ele é o título raspado do diretório).
//
// Entrada real de Valinhos: name "Ricci Distribuidora" (sem 'agua'), cnae 4723700, razão social
// "RICCI & RICCI COMERCIO DE AGUA MINERAL LTDA". A entrada 4723700 do mapa EXIGE o sinal
// 'agua' — o sinal existia, só que na razão social. A evidência não desarmava e o lead morria
// em `varejo_puro`, exatamente o que o Lote 1 nasceu pra consertar na lane web.
const nucleoDeQualidade = new RadarWebscrapingCoreService({
  hasTable: async () => true,
  hasColumn: async () => true,
} as any) as any;

function avaliarQualidadeNoMixin(candidate: Record<string, any>) {
  return nucleoDeQualidade.evaluateLeadQuality(candidate, {
    requestedSegment: 'distribuidoras de água',
    requestedCity: 'Valinhos',
    requestedState: 'SP',
    targetType: 'pj',
  });
}

// Candidato da lane web DEPOIS da reconciliação RFB: CNAE e razão social vieram da Receita, o
// nome continua sendo o título raspado ("Ricci Distribuidora", sem a palavra 'agua').
const RICCI_RECONCILIADA = {
  source: 'hbx_engine',
  name: 'Ricci Distribuidora',
  city: 'Valinhos',
  state: 'SP',
  phoneDigits: '19999990004',
  cnae: '4723700',
  cnaeDescription: 'Comercio varejista de bebidas',
  businessCategory: 'Comercio varejista de bebidas',
  razaoSocial: 'RICCI & RICCI COMERCIO DE AGUA MINERAL LTDA',
};

test('LOTE 1 lane web: sinal "agua" SO na razao social desarma a exclusao (Ricci Distribuidora)', () => {
  const result = avaliarNaLaneWeb({ ...RICCI_RECONCILIADA });
  assert.ok(
    !result.hardBlockers.some((item) => item.startsWith('segment_excluded_')),
    `esperava sobreviver, morreu com: ${result.hardBlockers.join(', ')} (${result.reason})`,
  );
});

test('LOTE 1 mixin de qualidade: RICCI reconciliada nao vira segment_mismatch', () => {
  const quality = avaliarQualidadeNoMixin({ ...RICCI_RECONCILIADA });
  assert.notEqual(quality.status, 'segment_mismatch', quality.reasons.join(' · '));
});

test('LOTE 1 mixin de qualidade: candidato da Receita fala por legalName (FERREIRAGUA)', () => {
  // Na lane RFB o campo é `legalName` (cnpj-public-provider.service.ts:246), não `razaoSocial`.
  // "FERREIRAGUA" não casa 'agua' por palavra inteira — quem carrega o sinal é a razão.
  const quality = avaliarQualidadeNoMixin({
    source: 'cnpj_public',
    name: 'FERREIRAGUA',
    city: 'Valinhos',
    state: 'SP',
    phoneDigits: '19999990005',
    cnae: '4723700',
    cnaeDescription: 'Comercio varejista de bebidas',
    businessCategory: 'Comercio varejista de bebidas',
    legalName: 'FERREIRA & CIA COMERCIO DE AGUA MINERAL LTDA',
  });
  assert.notEqual(quality.status, 'segment_mismatch', quality.reasons.join(' · '));
});

test('LOTE 1 lane web: SEM CNAE a razao social nao afrouxa nada (varejo_puro segue matando)', () => {
  const { cnae, ...semCnae } = RICCI_RECONCILIADA;
  const result = avaliarNaLaneWeb({ ...semCnae, phoneDigits: '19999990006' });
  assert.ok(result.hardBlockers.includes('segment_excluded_varejo_puro'), result.reason);
  const quality = avaliarQualidadeNoMixin({ ...semCnae, phoneDigits: '19999990006' });
  assert.equal(quality.status, 'segment_mismatch');
});

test('LOTE 1 lane web: razao social nao e curinga — CNAE fora da allowlist continua morrendo', () => {
  const result = avaliarNaLaneWeb({
    source: 'hbx_engine',
    name: 'Agua Viva Modas',
    city: 'Valinhos',
    state: 'SP',
    phoneDigits: '19999990007',
    cnae: '4781-4/00',
    cnaeDescription: 'Comercio varejista de artigos do vestuario',
    razaoSocial: 'AGUA VIVA COMERCIO DE AGUA E CONFECCOES LTDA',
  });
  assert.ok(result.hardBlockers.includes('segment_excluded_varejo_puro'), result.reason);
});

test('LOTE 1 lane web: razao social de TRANSPORTE mata (evidencia legitima de outro ramo)', () => {
  const result = avaliarNaLaneWeb({
    source: 'hbx_engine',
    name: 'Ricci Distribuidora',
    city: 'Valinhos',
    state: 'SP',
    phoneDigits: '19999990008',
    razaoSocial: 'RICCI & RICCI TRANSPORTES LTDA',
  });
  assert.ok(result.hardBlockers.includes('segment_excluded_transporte_carga'), result.reason);
});

test('LOTE 1 lane web: saneamento e energia continuam mortos com CNAE fora da allowlist', () => {
  const saneamento = avaliarNaLaneWeb({
    source: 'hbx_engine',
    name: 'Aguas de Valinhos',
    city: 'Valinhos',
    state: 'SP',
    phoneDigits: '19999990009',
    cnae: '3600601',
    cnaeDescription: 'Captacao, tratamento e distribuicao de agua',
    razaoSocial: 'COMPANHIA DE SANEAMENTO DE VALINHOS SA',
  });
  assert.ok(saneamento.hardBlockers.includes('segment_excluded_energia_agua_combustivel'), saneamento.reason);

  const energia = avaliarNaLaneWeb({
    source: 'hbx_engine',
    name: 'Alfa Distribuidora',
    city: 'Valinhos',
    state: 'SP',
    phoneDigits: '19999990010',
    cnae: '3514000',
    cnaeDescription: 'Distribuicao de energia eletrica',
    razaoSocial: 'ALFA DISTRIBUIDORA DE ENERGIA ELETRICA SA',
  });
  assert.ok(energia.hardBlockers.includes('segment_excluded_energia_agua_combustivel'), energia.reason);
});

test('E3 geo-evidencia: nome COMPLETO do estado no caminho tambem conta (/sao-paulo/rio-claro)', () => {
  const result = gate.evaluate({
    candidate: {
      source: 'hbx_engine',
      name: 'Agua Gelada Express',
      sourceUrl: 'https://www.cervejaria24h.com.br/sao-paulo/rio-claro/agua-tonica-gelada',
      phoneDigits: '19999990014',
    },
    filters: { city: 'Analândia', state: 'SP' } as any,
  });
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'web_gate:geo_conflict_source');
});
