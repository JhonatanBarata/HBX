import test from 'node:test';
import assert from 'node:assert/strict';
import { findRadarSegmentExclusionMatch, resolveSegmentExclusionRules } from './radar-segment-exclusion.util';

test('resolveSegmentExclusionRules: "distribuidora" tem mapa de exclusao (varias categorias)', () => {
  const rules = resolveSegmentExclusionRules('distribuidora');
  assert.ok(rules.length >= 4);
  assert.ok(rules.some((rule) => rule.code === 'energia_agua_combustivel'));
  assert.ok(rules.some((rule) => rule.code === 'transporte_carga'));
  assert.ok(rules.some((rule) => rule.code === 'varejo_puro'));
  assert.ok(rules.some((rule) => rule.code === 'servicos_financeiros'));
});

test('resolveSegmentExclusionRules: tolera plural ("distribuidoras") e segmento composto ("distribuidora de bebidas")', () => {
  assert.ok(resolveSegmentExclusionRules('distribuidoras').length > 0);
  assert.ok(resolveSegmentExclusionRules('distribuidora de bebidas').length > 0);
});

test('resolveSegmentExclusionRules: segmento sem mapa devolve lista vazia (nao quebra, so nao exclui nada)', () => {
  assert.deepEqual(resolveSegmentExclusionRules('padaria'), []);
  assert.deepEqual(resolveSegmentExclusionRules(''), []);
  assert.deepEqual(resolveSegmentExclusionRules(null), []);
});

// Caso literal do briefing (dono 25/07): "Distribuidora de Energia X" nao entra no
// segmento "distribuidora" mesmo o nome tendo a palavra "distribuidora" (similaridade
// textual venceria um match ingenuo por token) — a exclusao tem que vencer.
test('findRadarSegmentExclusionMatch: exclusao vence nome parecido ("Distribuidora de Energia X" nao entra em distribuidora)', () => {
  const match = findRadarSegmentExclusionMatch('distribuidora', 'Distribuidora de Energia X', 'Distribuidora de Energia X Ltda');
  assert.ok(match);
  assert.equal(match?.code, 'energia_agua_combustivel');
});

test('findRadarSegmentExclusionMatch: pega pelo CNAE/descricao mesmo com nome neutro', () => {
  const match = findRadarSegmentExclusionMatch(
    'distribuidora',
    'Comercial ABC',
    'Comercial ABC Ltda',
    '4930-2/02',
    'Transporte rodoviario de carga',
  );
  assert.ok(match);
  assert.equal(match?.code, 'transporte_carga');
});

test('findRadarSegmentExclusionMatch: candidato realmente do segmento (distribuidora de bebidas) nao e excluido', () => {
  const match = findRadarSegmentExclusionMatch(
    'distribuidora',
    'Distribuidora de Bebidas Boa Vista',
    'Distribuidora de Bebidas Boa Vista Ltda',
    '4635-4/99',
    'Comercio atacadista de bebidas',
  );
  assert.equal(match, null);
});

test('findRadarSegmentExclusionMatch: sem segmento pedido nunca exclui', () => {
  assert.equal(findRadarSegmentExclusionMatch('', 'Distribuidora de Energia X'), null);
  assert.equal(findRadarSegmentExclusionMatch(null, 'Banco Comercial Y'), null);
});

test('findRadarSegmentExclusionMatch: segmento sem mapa proprio nunca exclui (comportamento intacto)', () => {
  assert.equal(findRadarSegmentExclusionMatch('padaria', 'Distribuidora de Energia X'), null);
});

// ── 30/07 (DDD 19): 18 farmacêuticas/hospitalares passaram VIVAS em "distribuidora de água"
// (Sanofi 54 > JOBEMA água 49). CNAE/nome de medicamentos É evidência positiva de outro ramo —
// o mapa tinha 5 regras e nenhuma de farma, então a porta só via "não sei" (unconfirmed).
test('exclusao distribuidora: farmaceutico/hospitalar e evidencia positiva de outro ramo', () => {
  const match = findRadarSegmentExclusionMatch('distribuidora de agua', 'Suplefar',
    'Comércio atacadista de medicamentos e drogas de uso humano');
  assert.equal(match?.code, 'farma_hospitalar');
  const porNome = findRadarSegmentExclusionMatch('distribuidora de agua', 'Sanofi Medley Farmaceutica');
  assert.equal(porNome?.code, 'farma_hospitalar');
});

// MINA pré-existente (relatório 30/07): o segmento PEDIDO pelo dono caía na própria regra de
// exclusão — "distribuidora de energia" morria na regra energia_agua_combustivel (token
// 'energia' e 'distribuicao de energia' no CNAE) e a busca se auto-excluía inteira, na porta
// da Receita E no gate web. Regra cuja atividade É o pedido sai do jogo.
test('exclusao NAO auto-exclui o segmento pedido ("distribuidora de energia" vive)', () => {
  const match = findRadarSegmentExclusionMatch(
    'distribuidora de energia',
    'Distribuidora de Energia Alfa Ltda',
    'Distribuição de energia elétrica',
  );
  assert.equal(match, null);
});

// Guarda da regra nova: pedir "distribuidora de medicamentos" não pode cair na regra farma.
test('exclusao NAO mata o proprio segmento pedido (farma pedida explicitamente)', () => {
  assert.equal(findRadarSegmentExclusionMatch('distribuidora de medicamentos',
    'Camp Life Distribuidora de Medicamentos', 'Comércio atacadista de medicamentos'), null);
});

// ── S5 CORREÇÃO DO NOTURNO (30/07): 13,8% da entrega de "distribuidora de água" tinha
// CARA DE GÁS — reincidência do achado nº5. O mapa só tinha as frases de CNAE
// ('gas natural'/'gas liquefeito'); o revendedor de botijão da lane web se anuncia
// pelo NOME ("Gás e Água do Zé"), e passava batido.

test('B10 — revendedor de GÁS nao entra em "distribuidora de agua" (pelo nome)', () => {
  const porNome = findRadarSegmentExclusionMatch('distribuidora de agua', 'Gas e Agua do Ze');
  assert.equal(porNome?.code, 'gas_glp');
  const botijao = findRadarSegmentExclusionMatch('distribuidora de agua', 'Deposito de Botijoes Sao Jorge');
  assert.equal(botijao?.code, 'gas_glp');
  // Com o CNAE oficial, a exclusão pode vir por varejo/energia antes — o que importa é
  // que o card MORRE. A regra nova é o que garante a morte quando só existe o nome.
  const glp = findRadarSegmentExclusionMatch('distribuidora de agua', 'Comercial Bom Preco',
    'Comércio atacadista de gás liquefeito de petróleo (GLP)');
  assert.ok(glp, 'atacadista de GLP tem que ser excluído de "distribuidora de água"');
  assert.equal(findRadarSegmentExclusionMatch('distribuidora de agua', 'GLP Center Campinas')?.code, 'gas_glp');
});

test('B10 — token curto "gas" casa PALAVRA INTEIRA: Vargas/gastronomia/Gaspar vivem', () => {
  assert.equal(findRadarSegmentExclusionMatch('distribuidora de agua', 'Distribuidora Vargas Ltda'), null);
  assert.equal(findRadarSegmentExclusionMatch('distribuidora de agua', 'Distribuidora Gastronomica Sul'), null);
  assert.equal(findRadarSegmentExclusionMatch('distribuidora de agua', 'Distribuidora Gaspar e Filhos'), null);
});

test('B10 — a regra NOVA do gás sai do jogo pra quem PEDE gás (não auto-exclui)', () => {
  assert.equal(resolveSegmentExclusionRules('distribuidora de gas').some((r) => r.code === 'gas_glp'), false);
  assert.equal(findRadarSegmentExclusionMatch('distribuidora de gas', 'Ultra Gas Campinas'), null);
});

// ⚠️ MINA PRÉ-EXISTENTE (não é desta correção, fica REGISTRADA aqui pra não virar
// "descoberta nova" amanhã): quem busca "distribuidora de gás" continua morrendo na
// regra ANTIGA energia_agua_combustivel quando o CNAE oficial fala 'gas liquefeito' —
// `ruleTargetsRequestedSegment` compara o token INTEIRO contra o pedido, e
// "distribuidora de gas" não contém a frase "gas liquefeito". Consertar isso por
// sobreposição de palavras derrubaria a mesma regra em "distribuidora de ÁGUA" (token
// 'agua e esgoto'), soltando saneamento/SANASA na busca do dono — decisão de produto,
// não de código. Este teste CONGELA o comportamento de hoje.
test('MINA CONHECIDA: "distribuidora de gas" ainda cai na regra antiga via CNAE oficial', () => {
  assert.equal(
    findRadarSegmentExclusionMatch('distribuidora de gas', 'Ultra Gas Campinas',
      'Comércio atacadista de gás liquefeito de petróleo')?.code,
    'energia_agua_combustivel',
  );
});

test('casamento por palavra inteira preserva o plural que o mapa cobria com includes', () => {
  // 'energia' tem que continuar pegando "Energias do Brasil"; 'transporte' pega "Transportes".
  assert.equal(findRadarSegmentExclusionMatch('distribuidora', 'Energias do Brasil SA')?.code, 'energia_agua_combustivel');
  assert.equal(findRadarSegmentExclusionMatch('distribuidora', 'Transportes Rapidos Ltda')?.code, 'transporte_carga');
  assert.equal(findRadarSegmentExclusionMatch('distribuidora', 'Imobiliaria Central')?.code, 'imobiliaria');
  assert.equal(findRadarSegmentExclusionMatch('distribuidora', 'Banco Comercial Y')?.code, 'servicos_financeiros');
});

test('a distribuidora de ÁGUA de verdade continua passando', () => {
  assert.equal(findRadarSegmentExclusionMatch('distribuidora de agua', 'Tagliagua Atacadao das Aguas',
    'Comércio atacadista de água mineral'), null);
  assert.equal(findRadarSegmentExclusionMatch('distribuidora de agua', 'JOBEMA Distribuidora de Agua Mineral'), null);
});
