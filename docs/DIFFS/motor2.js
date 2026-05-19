const fs = require('fs');
const path = require('path');

const file = path.join('backend', 'src', 'webscraping', 'webscraping.service.ts');
if (!fs.existsSync(file)) {
  throw new Error(`Arquivo não encontrado: ${file}. Rode da raiz do repo App.`);
}

let content = fs.readFileSync(file, 'utf8');
if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

function findMethodBounds(source, name) {
  const signature = `\n  private ${name}(`;
  const start = source.indexOf(signature);
  if (start < 0) return null;
  const braceStart = source.indexOf('{', start);
  if (braceStart < 0) throw new Error(`Achei ${name}, mas sem chave inicial.`);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        let end = i + 1;
        while (source[end] === '\r' || source[end] === '\n') end += 1;
        return { start: start + 1, end };
      }
    }
  }
  throw new Error(`Não consegui fechar o método ${name}.`);
}

function replaceMethod(source, name, replacement) {
  const bounds = findMethodBounds(source, name);
  if (!bounds) return null;
  return source.slice(0, bounds.start) + replacement.trimEnd() + '\n\n' + source.slice(bounds.end);
}

function insertBeforeMethod(source, targetName, block) {
  const signature = `\n  private ${targetName}(`;
  const idx = source.indexOf(signature);
  if (idx < 0) throw new Error(`Método alvo não encontrado: ${targetName}`);
  return source.slice(0, idx + 1) + block.trimEnd() + '\n\n' + source.slice(idx + 1);
}

const expandHbxSegmentAliases = `
  private expandHbxSegmentAliases(segments: string[]) {
    const aliases = new Map<string, string[]>([
      ['acougue', ['açougue', 'açougues', 'casa de carnes', 'carnes', 'boutique de carnes', 'frigorífico varejo']],
      ['acougues', ['açougue', 'açougues', 'casa de carnes', 'carnes', 'boutique de carnes', 'frigorífico varejo']],
      ['casa de carnes', ['casa de carnes', 'açougue', 'açougues', 'carnes']],
    ]);
    const expanded: string[] = [];
    for (const segment of segments) {
      const raw = String(segment || '').replace(/\\s+/g, ' ').trim();
      if (!raw) continue;
      expanded.push(raw);
      const key = normalizeLookupValue(raw);
      for (const [aliasKey, values] of aliases.entries()) {
        if (key === aliasKey || key.includes(aliasKey)) expanded.push(...values);
      }
    }
    return Array.from(new Set(expanded.map((item) => item.replace(/\\s+/g, ' ').trim()).filter(Boolean))).slice(0, 30);
  }
`;

const splitHbxBatchSegments = `
  private splitHbxBatchSegments(segment: string) {
    const raw = String(segment || '').trim();
    const categoryKey = normalizeLookupValue(raw);
    if (categoryKey && HBX_CATEGORY_SEGMENTS[categoryKey]) {
      return this.expandHbxSegmentAliases(HBX_CATEGORY_SEGMENTS[categoryKey].slice(0, 20)).slice(0, 30);
    }
    const segments = raw.includes(',')
      ? raw.split(',').map((item) => item.replace(/\\s+/g, ' ').trim()).filter(Boolean)
      : [raw].filter(Boolean);
    return this.expandHbxSegmentAliases(Array.from(new Set(segments))).slice(0, 30);
  }
`;

const getSearchCityTargets = `
  private getSearchCityTargets(input: NormalizedSearchInput) {
    const primary = {
      city: input.city,
      state: input.state,
      normalizedCity: input.normalizedCity,
      distanceKm: 0,
    };
    const region = input.radiusKm > 0 && input.regionalCities.length > 0
      ? input.regionalCities
      : [];
    const ordered = [primary, ...region]
      .filter((item) => item.city || item.state);
    const seen = new Set<string>();
    return ordered.filter((item) => {
      const key = \`${normalizeLookupValue(item.city)}|${String(item.state || '').trim().toUpperCase()}\`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
`;

const buildHbxBatchQueryVariants = `
  private buildHbxBatchQueryVariants(input: NormalizedSearchInput, segment: string, target: RegionalCity) {
    const city = target.city;
    const state = target.state;
    const ddd = this.extractDddFromSegment(segment);
    const { role, niche } = this.parseHbxRoleNiche(segment, input.targetType);
    const normalizedNiche = normalizeLookupValue(niche);
    const normalizedRole = normalizeLookupValue(role);
    const effectiveNiche = normalizedNiche && normalizedNiche !== 'empresa' && normalizedNiche !== normalizedRole
      ? niche
      : segment;
    return input.targetType === 'pj'
      ? [
          this.compactQuery([effectiveNiche, city, state]),
          this.compactQuery([effectiveNiche, city, state, 'telefone']),
          this.compactQuery([effectiveNiche, city, state, 'whatsapp']),
          this.compactQuery([effectiveNiche, city, state, 'empresa']),
          this.compactQuery([effectiveNiche, city, state, 'maps']),
          this.compactQuery([effectiveNiche, city, state, 'site']),
          this.compactQuery(['site:solutudo.com.br', effectiveNiche, city, state]),
          this.compactQuery(['site:guiamais.com.br', effectiveNiche, city, state]),
          this.compactQuery(['site:instagram.com', effectiveNiche, city, state]),
          ddd ? this.compactQuery([effectiveNiche, 'DDD', ddd]) : this.compactQuery([effectiveNiche, city, state]),
        ].filter(Boolean)
      : [
          this.compactQuery([role, niche, city, state, 'whatsapp']),
          this.compactQuery([role, niche, city, state, 'telefone']),
          this.compactQuery([niche, city, state, 'contato']),
          this.compactQuery([role, city, state, 'celular']),
          ddd ? this.compactQuery([role, niche, 'DDD', ddd]) : this.compactQuery([role, niche, city, state]),
        ].filter(Boolean);
  }
`;

const existingAlias = findMethodBounds(content, 'expandHbxSegmentAliases');
if (existingAlias) content = replaceMethod(content, 'expandHbxSegmentAliases', expandHbxSegmentAliases);
else content = insertBeforeMethod(content, 'splitHbxBatchSegments', expandHbxSegmentAliases);

for (const [name, replacement] of [
  ['splitHbxBatchSegments', splitHbxBatchSegments],
  ['getSearchCityTargets', getSearchCityTargets],
  ['buildHbxBatchQueryVariants', buildHbxBatchQueryVariants],
]) {
  const next = replaceMethod(content, name, replacement);
  if (next == null) throw new Error(`Método não encontrado: ${name}`);
  content = next;
}

content = content.replace(/\s+$/u, '\n');
fs.writeFileSync(file, content, 'utf8');
console.log('OK: motor query planner patch aplicado.');
console.log('Confira com: git diff -- backend/src/webscraping/webscraping.service.ts');
