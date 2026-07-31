import test from 'node:test';
import assert from 'node:assert/strict';

import { ConciergeService } from './concierge.service';

// ============================================================================
// A CENA DO PRINT (31/07/2026) — vacina do papagaio.
//
// O dono mandou esta conversa REAL, em produção:
//   cliente> Quero mais empresas de distribuidoras agua em VITORIA DAS MISSOES - RS
//   HBX>     Vou buscar 10 distribuidoras de água em Vitória das Missões - RS - RS ...
//   cliente> teria como pesquisar em outro estado?
//   HBX>     Vou buscar 10 distribuidoras de água em Vitória das Missões - RS - RS ...
//   cliente> ainda não poxa, vc consegue me responder?
//   HBX>     Vou buscar 10 distribuidoras de água em Vitória das Missões - RS - RS ...
//
// Dois defeitos numa tela só: a UF colada duas vezes e, pior, a máquina SURDA —
// em PREVIEW, toda resposta era sobrescrita pelo template do resumo. Um cliente
// querendo comprar em outro estado foi barrado por isso: venda perdida.
//
// Este arquivo roda o service DE VERDADE (fakes só nas bordas: banco, Radar,
// cota e Ollama) e reprova se qualquer um dos dois voltar.
// ============================================================================

const DONO = { id: 7, companyId: 3, role: 'USERMASTER', canViewBilling: true };

// ── Fakes de borda ───────────────────────────────────────────────────────────

function fakePrisma() {
  const drafts = new Map<string, any>();
  let seq = 0;

  const matches = (row: any, where: any): boolean => {
    for (const [key, cond] of Object.entries(where || {})) {
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        const c = cond as any;
        if (c.gt != null && !(row[key] > c.gt)) return false;
        if (c.lt != null && !(row[key] < c.lt)) return false;
        if (Array.isArray(c.in) && !c.in.includes(row[key])) return false;
        continue;
      }
      if (row[key] !== cond) return false;
    }
    return true;
  };
  const list = (where: any) => [...drafts.values()].filter((row) => matches(row, where));

  return {
    _drafts: drafts,
    aiConciergeDraft: {
      create: async ({ data }: any) => {
        const id = `draft-${(seq += 1)}`;
        const row = {
          id,
          runId: null,
          confirmToken: null,
          confirmExpiresAt: null,
          slotsHash: null,
          costPreviewJson: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        drafts.set(id, row);
        return row;
      },
      findFirst: async ({ where }: any) => list(where).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null,
      findUnique: async ({ where }: any) => drafts.get(where.id) ?? null,
      findMany: async ({ where }: any) => list(where || {}),
      update: async ({ where, data }: any) => {
        const row = drafts.get(where.id);
        if (!row) throw new Error('draft inexistente');
        Object.assign(row, data, { updatedAt: new Date(Date.now() + (seq += 1)) });
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        const rows = list(where);
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
    },
    company: { findUnique: async () => ({ prospectingSegmentsJson: '[]' }) },
    $queryRaw: async () => [],
  };
}

const fakeWebscraping = {
  started: [] as any[],
  async listBrazilianCities(term: string) {
    const flat = String(term || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    if (flat.includes('vitoria das missoes')) return { items: ['Vitória das Missões - RS'] };
    if (flat.includes('santa maria')) return { items: ['Santa Maria - RS', 'Santa Maria da Vitória - BA'] };
    return { items: [] };
  },
  async startRadarSearchRunForUser(_user: any, input: any) {
    fakeWebscraping.started.push(input);
    return { runId: 'run-1' };
  },
};

const fakeUsage = {
  async getUsageSnapshot() {
    return { cards: { dailyRemaining: 500, remaining: 5000, perUserLimit: null } };
  },
  async limitRequestedCardsBySellerActiveQuota(_c: number, _u: number, qty: number) {
    return { quota: { seller: false }, limit: qty };
  },
};
const fakeCredits = { async isEnforceActiveForCompany() { return true; } };
const fakeCreditActions = { async resolveEffective() { return { mode: 'debit', cost: 1 }; } };

function buildService() {
  return new ConciergeService(
    fakePrisma() as any,
    fakeWebscraping as any,
    fakeUsage as any,
    fakeCredits as any,
    fakeCreditActions as any,
  );
}

// ── Ollama fingido: o extrator (JSON) e o redator (texto livre) ──────────────

function userTextOf(messages: Array<{ content: string }>): string {
  const last = messages[messages.length - 1]?.content || '';
  const inner = last.split('<msg_usuario>')[1]?.split('</msg_usuario>')[0] ?? last;
  return inner.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Respostas que o 4B dá HOJE para cada frase do print (medido no bench). */
function fakeExtractorJson(text: string): string {
  const slots = (over: Record<string, unknown>) =>
    JSON.stringify({
      intent: 'unclear',
      targetSegment: null,
      city: null,
      state: null,
      desiredCount: null,
      channels: [],
      topic: null,
      changeTarget: null,
      confidence: 0.9,
      ...over,
    });
  if (text.includes('distribuidoras agua') || text.includes('distribuidora de agua')) {
    return slots({ intent: 'radar_search', targetSegment: 'distribuidoras de água', city: 'Vitória das Missões', state: 'RS' });
  }
  if (text.includes('outro estado')) return slots({ intent: 'question', topic: 'coverage' });
  if (text.includes('consegue me responder')) return slots({ intent: 'question', topic: 'other' });
  if (text.includes('quanto') && text.includes('custa')) return slots({ intent: 'question', topic: 'cost' });
  if (text.includes('santa maria')) return slots({ intent: 'change_request', changeTarget: 'city', city: 'Santa Maria' });
  if (text.includes('outra cidade')) return slots({ intent: 'change_request', changeTarget: 'city' });
  if (text.includes('esquece')) return slots({ intent: 'cancel' });
  return slots({ intent: 'unclear', confidence: 0.4 });
}

/**
 * Instala o Ollama fingido. `writer` decide a frase de abertura (a voz) e
 * `extractor` permite simular um modelo BURRO — inclusive o comportamento exato
 * que causou o loop em produção.
 */
function installFakeOllama(
  writer: (text: string) => string = () => 'Consigo sim, sem problema.',
  extractor: (text: string) => string = fakeExtractorJson,
) {
  const original = globalThis.fetch;
  const calls: Array<{ format?: string; text: string }> = [];
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const text = userTextOf(body.messages || []);
    calls.push({ format: body.format, text });
    const content = body.format === 'json' ? extractor(text) : writer(text);
    return { ok: true, status: 200, json: async () => ({ message: { content } }) } as any;
  }) as any;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function withEnv(vars: Record<string, string | undefined>, run: () => Promise<void>) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) prev[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return run().finally(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

const ON = {
  HBX_AI_CONCIERGE_ENABLED: 'true',
  HBX_LLM_CLASSIFIER_ENABLED: 'true',
  HBX_LLM_CLASSIFIER_URL: 'http://ollama.fake:11434',
  HBX_AI_GATEWAY_ENABLED: 'false',
};

// ── A CENA ───────────────────────────────────────────────────────────────────

test('CENA DO PRINT: cliente pergunta 2x em cima do resumo e recebe 3 respostas DIFERENTES (fim do papagaio)', async () => {
  await withEnv({ ...ON, HBX_AI_CONCIERGE_VOICE: 'off' }, async () => {
    const ollama = installFakeOllama();
    try {
      const service = buildService();

      // 1) O pedido do print.
      const turno1 = await service.message(DONO, { message: 'Quero mais empresas de distribuidoras agua em VITORIA DAS MISSOES - RS' });
      assert.equal(turno1.draft?.state, 'PREVIEW');
      assert.ok(turno1.reply?.includes('Confirma?'), 'o resumo com custo tem de aparecer normalmente');

      // BUG 1 — a UF colada duas vezes.
      assert.ok(
        !/RS\s*-\s*RS/.test(turno1.reply || ''),
        `UF duplicada voltou ao resumo: ${turno1.reply}`,
      );
      assert.equal(turno1.draft?.slots.placeLabel, 'Vitória das Missões - RS');

      const draftId = turno1.draft!.id;
      const tokenAntes = turno1.draft!.confirmToken;
      assert.ok(tokenAntes, 'o resumo tem de nascer com token de confirmação');

      // 2) A pergunta que virou loop em produção.
      const turno2 = await service.message(DONO, { draftId, message: 'teria como pesquisar em outro estado?' });
      assert.notEqual(turno2.reply, turno1.reply, 'PAPAGAIO: respondeu a pergunta repetindo o resumo');
      assert.match(String(turno2.reply), /Brasil/i, 'a resposta tem de dizer que dá pra buscar em outra praça');
      assert.equal(turno2.draft?.confirmToken, tokenAntes, 'perguntar não pode matar a busca já montada');

      // 3) A cobrança do cliente ("vc consegue me responder?").
      const turno3 = await service.message(DONO, { draftId, message: 'ainda não poxa, vc consegue me responder?' });
      assert.notEqual(turno3.reply, turno1.reply);
      assert.notEqual(turno3.reply, turno2.reply, 'duas perguntas seguidas não podem receber a mesma frase');
      assert.equal(turno3.draft?.confirmToken, tokenAntes);

      // 4) E a troca que ele queria fazer desde o começo.
      const turno4 = await service.message(DONO, { draftId, message: 'então muda pra Santa Maria' });
      assert.equal(turno4.draft?.slots.city, 'Santa Maria - RS');
      assert.equal(turno4.draft?.slots.placeLabel, 'Santa Maria - RS');
      assert.ok(!/RS\s*-\s*RS/.test(turno4.reply || ''), `UF duplicada na troca: ${turno4.reply}`);
      assert.ok(turno4.reply?.includes('Confirma?'), 'trocar a cidade tem de remontar o resumo');
    } finally {
      ollama.restore();
    }
  });
});

test('VACINA: mesmo com o modelo BURRO (classifica tudo como busca vazia), o resumo não se repete', async () => {
  // Este é o caminho EXATO do print: o 4B, sem repertório, devolvia
  // intent=radar_search com todos os campos null. O merge preservava o pedido,
  // o estado continuava PREVIEW e o template do resumo era reemitido — 3x.
  // Aqui o modelo continua burro DE PROPÓSITO: quem tem de segurar é o código.
  const modeloBurro = () =>
    JSON.stringify({
      intent: 'radar_search',
      targetSegment: null, city: null, state: null, desiredCount: null,
      channels: [], topic: null, changeTarget: null, confidence: 0.9,
    });

  await withEnv({ ...ON, HBX_AI_CONCIERGE_VOICE: 'off' }, async () => {
    const ollama = installFakeOllama(() => '-', (text) =>
      text.includes('distribuidoras agua')
        ? JSON.stringify({
            intent: 'radar_search', targetSegment: 'distribuidoras de água',
            city: 'Vitória das Missões', state: 'RS', desiredCount: null,
            channels: [], topic: null, changeTarget: null, confidence: 0.9,
          })
        : modeloBurro(),
    );
    try {
      const service = buildService();
      const t1 = await service.message(DONO, { message: 'Quero mais empresas de distribuidoras agua em VITORIA DAS MISSOES - RS' });
      const draftId = t1.draft!.id;
      const t2 = await service.message(DONO, { draftId, message: 'teria como pesquisar em outro estado?' });
      const t3 = await service.message(DONO, { draftId, message: 'ainda não poxa, vc consegue me responder?' });

      assert.notEqual(t2.reply, t1.reply, 'PAPAGAIO: o resumo voltou como resposta');
      assert.notEqual(t3.reply, t1.reply, 'PAPAGAIO: o resumo voltou como resposta');
      assert.ok(!/Vou buscar/.test(String(t2.reply)), `turno mudo devolveu o resumo: ${t2.reply}`);
      // E, mesmo sem entender, a máquina mostra as saídas e não perde a busca.
      assert.match(String(t2.reply), /confirmar|mudar/i);
      assert.equal(t2.draft?.confirmToken, t1.draft?.confirmToken);
    } finally {
      ollama.restore();
    }
  });
});

test('pergunta de custo respeita a LEI DO VENDEDOR: dono ouve "crédito", vendedor nunca', async () => {
  await withEnv({ ...ON, HBX_AI_CONCIERGE_VOICE: 'off' }, async () => {
    const ollama = installFakeOllama();
    try {
      const dono = await buildService().message(DONO, { message: 'quanto isso vai me custar?' });
      assert.match(String(dono.reply), /crédito/i);

      const vendedor = { id: 9, companyId: 3, role: 'USER' };
      const seller = await buildService().message(vendedor, { message: 'quanto isso vai me custar?' });
      assert.doesNotMatch(String(seller.reply), /crédito/i, 'vendedor não pode ver custo em crédito');
      assert.match(String(seller.reply), /responsável/i);
    } finally {
      ollama.restore();
    }
  });
});

test('"pode ser" com o resumo na tela NÃO dispara busca — o gatilho é o clique', async () => {
  await withEnv({ ...ON, HBX_AI_CONCIERGE_VOICE: 'off' }, async () => {
    const ollama = installFakeOllama();
    const antes = fakeWebscraping.started.length;
    try {
      const service = buildService();
      const preview = await service.message(DONO, { message: 'Quero mais empresas de distribuidoras agua em VITORIA DAS MISSOES - RS' });
      const sim = await service.message(DONO, { draftId: preview.draft!.id, message: 'pode ser' });
      assert.match(String(sim.reply), /Confirmar busca/);
      assert.equal(fakeWebscraping.started.length, antes, 'texto NUNCA dispara busca');
      assert.equal(sim.draft?.confirmToken, preview.draft?.confirmToken, 'o token continua vivo pro clique');
    } finally {
      ollama.restore();
    }
  });
});

test('cancelar é cancelar: o rascunho morre e a conversa volta ao começo', async () => {
  await withEnv({ ...ON, HBX_AI_CONCIERGE_VOICE: 'off' }, async () => {
    const ollama = installFakeOllama();
    try {
      const service = buildService();
      const preview = await service.message(DONO, { message: 'Quero mais empresas de distribuidoras agua em VITORIA DAS MISSOES - RS' });
      const out = await service.message(DONO, { draftId: preview.draft!.id, message: 'deixa pra lá, esquece' });
      assert.equal(out.draft, undefined, 'depois de cancelar não sobra rascunho na tela');
      assert.match(String(out.reply), /Cancelei/i);
    } finally {
      ollama.restore();
    }
  });
});

test('IA fora do ar com resumo na tela: avisa e PRESERVA a busca montada (não repete o resumo)', async () => {
  await withEnv({ ...ON, HBX_AI_CONCIERGE_VOICE: 'off' }, async () => {
    const ollama = installFakeOllama();
    let service: ConciergeService;
    let preview: any;
    try {
      service = buildService();
      preview = await service.message(DONO, { message: 'Quero mais empresas de distribuidoras agua em VITORIA DAS MISSOES - RS' });
    } finally {
      ollama.restore();
    }
    // Ollama cai no meio da conversa.
    const original = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('ECONNREFUSED'); }) as any;
    try {
      const out = await service!.message(DONO, { draftId: preview.draft.id, message: 'e em outro estado?' });
      assert.match(String(out.reply), /sem a IA/i);
      assert.equal(out.draft?.confirmToken, preview.draft.confirmToken, 'IA fora não pode derrubar a busca pronta');
    } finally {
      globalThis.fetch = original;
    }
  });
});

test('erro interno no meio do turno vira frase honesta, nunca 500 na cara do cliente', async () => {
  await withEnv({ ...ON, HBX_AI_CONCIERGE_VOICE: 'off' }, async () => {
    const ollama = installFakeOllama();
    try {
      const prisma = fakePrisma();
      // O banco quebra no meio do turno (foi o 500 relatado pelo dono).
      prisma.aiConciergeDraft.findFirst = async () => { throw new Error('connection terminated'); };
      const service = new ConciergeService(prisma as any, fakeWebscraping as any, fakeUsage as any, fakeCredits as any, fakeCreditActions as any);
      const out = await service.message(DONO, { message: '20 padarias em Recife' });
      assert.equal(out.ok, true, 'o cliente recebe resposta, não um erro seco');
      assert.match(String(out.reply), /nada foi gasto/i);
    } finally {
      ollama.restore();
    }
  });
});

// ── VOZ (degrau 2): a IA fala, mas não pode mentir número ────────────────────

test('VOZ: frase segura do redator entra na resposta, com os fatos do código intactos', async () => {
  await withEnv({ ...ON, HBX_AI_CONCIERGE_VOICE: 'true' }, async () => {
    const ollama = installFakeOllama(() => 'Consigo sim, sem problema.');
    try {
      const service = buildService();
      const preview = await service.message(DONO, { message: 'Quero mais empresas de distribuidoras agua em VITORIA DAS MISSOES - RS' });
      const out = await service.message(DONO, { draftId: preview.draft!.id, message: 'teria como pesquisar em outro estado?' });
      assert.match(String(out.reply), /^Consigo sim, sem problema\./, 'a abertura humana abre a resposta');
      assert.match(String(out.reply), /Brasil/i, 'e os fatos do código continuam lá');
    } finally {
      ollama.restore();
    }
  });
});

test('VOZ: redator que inventa preço/quantidade é DESCARTADO — sai só o texto oficial', async () => {
  await withEnv({ ...ON, HBX_AI_CONCIERGE_VOICE: 'true' }, async () => {
    // O pior caso: o modelo alucina desconto e número.
    const ollama = installFakeOllama(() => 'Claro! Te dou 50 leads de graça hoje, garantido.');
    try {
      const service = buildService();
      const preview = await service.message(DONO, { message: 'Quero mais empresas de distribuidoras agua em VITORIA DAS MISSOES - RS' });
      const out = await service.message(DONO, { draftId: preview.draft!.id, message: 'teria como pesquisar em outro estado?' });
      assert.doesNotMatch(String(out.reply), /50|gr[áa]tis|garantido/i, 'promessa inventada pela IA não pode chegar ao cliente');
      assert.match(String(out.reply), /Brasil/i);
    } finally {
      ollama.restore();
    }
  });
});

test('VOZ: nem no resumo com custo a IA encosta nos números', async () => {
  await withEnv({ ...ON, HBX_AI_CONCIERGE_VOICE: 'true' }, async () => {
    const ollama = installFakeOllama(() => 'Fechado, são só 3 créditos.');
    try {
      const out = await buildService().message(DONO, { message: 'Quero mais empresas de distribuidoras agua em VITORIA DAS MISSOES - RS' });
      assert.doesNotMatch(String(out.reply), /3 cr[ée]ditos/i);
      assert.match(String(out.reply), /custo 10 créditos/, 'o número é sempre o do servidor');
    } finally {
      ollama.restore();
    }
  });
});
