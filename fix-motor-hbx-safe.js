const fs = require("fs");

const file = "backend/src/webscraping/webscraping.service.ts";

if (!fs.existsSync(file)) {
  throw new Error(`Arquivo não encontrado: ${file}. Rode da raiz do repo.`);
}

let content = fs.readFileSync(file, "utf8");

function findMethodRange(text, methodName) {
  const marker = `private ${methodName}(`;
  const start = text.indexOf(marker);
  if (start < 0) {
    throw new Error(`Não achei método: ${methodName}`);
  }

  const braceStart = text.indexOf("{", start);
  if (braceStart < 0) {
    throw new Error(`Não achei abertura { de ${methodName}`);
  }

  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    const char = text[i];

    if (char === "{") depth++;
    if (char === "}") depth--;

    if (depth === 0) {
      let end = i + 1;
      while (text[end] === "\r" || text[end] === "\n") end++;
      return { start, end };
    }
  }

  throw new Error(`Não achei fechamento } de ${methodName}`);
}

function replaceMethod(methodName, replacement) {
  const range = findMethodRange(content, methodName);
  content = content.slice(0, range.start) + replacement.trimEnd() + "\n\n" + content.slice(range.end);
  console.log(`OK: substituído ${methodName}`);
}

const splitHbxBatchSegments = `
  private splitHbxBatchSegments(segment: string) {
    const raw = String(segment || '').replace(/\\s+/g, ' ').trim();
    if (!raw) return [];

    const categoryKey = normalizeLookupValue(raw);
    if (categoryKey && HBX_CATEGORY_SEGMENTS[categoryKey]) {
      return Array.from(new Set(
        HBX_CATEGORY_SEGMENTS[categoryKey]
          .map((item) => String(item || '').replace(/\\s+/g, ' ').trim())
          .filter(Boolean),
      )).slice(0, 20);
    }

    const segments = raw.includes(',')
      ? raw.split(',').map((item) => item.replace(/\\s+/g, ' ').trim()).filter(Boolean)
      : [raw];

    return Array.from(new Set(segments)).slice(0, 12);
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

    if (input.targetType === 'pj') {
      const base = this.compactQuery([effectiveNiche, city, state]);
      return Array.from(new Set([
        base,
        this.compactQuery([effectiveNiche, city, state, 'telefone']),
        this.compactQuery([effectiveNiche, city, state, 'whatsapp']),
        this.compactQuery([effectiveNiche, city, state, 'contato']),
        ddd ? this.compactQuery([effectiveNiche, 'DDD', ddd]) : '',
      ].filter(Boolean)));
    }

    return Array.from(new Set([
      this.compactQuery([role, niche, city, state, 'whatsapp']),
      this.compactQuery([role, niche, city, state, 'telefone']),
      this.compactQuery([niche, city, state, 'contato']),
      ddd ? this.compactQuery([role, niche, 'DDD', ddd]) : '',
    ].filter(Boolean)));
  }
`;

replaceMethod("splitHbxBatchSegments", splitHbxBatchSegments);
replaceMethod("buildHbxBatchQueryVariants", buildHbxBatchQueryVariants);

fs.writeFileSync(file, content, "utf8");

console.log("OK: motor HBX contido.");
console.log("Agora rode:");
console.log("git diff -- backend/src/webscraping/webscraping.service.ts");