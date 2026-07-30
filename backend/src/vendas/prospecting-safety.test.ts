import test from 'node:test';
import assert from 'node:assert/strict';
import { SAFE_FIRST_CONTACT_TEMPLATE, SAFE_FIRST_CONTACT_VARIANTS } from './prospecting-safety';

// VACINA contra o vazamento de 30/07/2026: o default de primeiro contato do PRODUTO
// tinha "Jhonatan" (dono da HBX) hardcoded + a consultoria dele descrita em 1ª pessoa.
// Qualquer tenant real que ligasse a prospecção sem customizar o texto ia se apresentar
// como o dono e vender o negócio DELE. Ver AUDITORIA-COPY-VAZADA (auditoria original).

// Nomes/marcas/negócio DO DONO que nunca podem estar num default de mensagem
// outbound de tenant. Se o texto é do dono, ele é do TENANT dele — vem de
// User.name / Company.name / UserSenderProfile, nunca hardcoded.
const IDENTIDADE_PROIBIDA = [
  /\bjhonatan\b/i,
  /\bbarata\b/i,
  /hbxsystem\.com\.br/i,
  /\bhbx\b/i,
  /5519997024884/,
];

const NEGOCIO_DO_DONO_PROIBIDO = [
  /melhorar\s+processos/i,
  /melhoria\s+de\s+processos/i,
  /automatizar\s+tarefas\s+repetitivas/i,
  /consultoria\s+e\s+implanta/i,
  /\bretrabalho\b/i,
  /7\s+dias\s+gr[áa]tis/i,
];

// Nome próprio solto: "Me chamo X", "Aqui é o X", "Sou o X", "Meu nome é X"
// com X capitalizado e SEM placeholder {{...}} logo depois.
const APRESENTACAO_COM_NOME_LITERAL =
  /(me\s+chamo|aqui\s+é\s+o|aqui\s+é\s+a|sou\s+o|sou\s+a|meu\s+nome\s+é)\s+(?!\{\{)[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{2,}/;

function reprovar(rotulo: string, texto: string) {
  for (const padrao of IDENTIDADE_PROIBIDA) {
    assert.ok(
      !padrao.test(texto),
      `${rotulo}: identidade da plataforma/dono hardcoded (${padrao}). Use {{funcionario}}/{{empresa}} ou SenderIdentityService.\n${texto}`,
    );
  }
  for (const padrao of NEGOCIO_DO_DONO_PROIBIDO) {
    assert.ok(
      !padrao.test(texto),
      `${rotulo}: descreve o negócio do DONO, não do tenant (${padrao}).\n${texto}`,
    );
  }
  assert.ok(
    !APRESENTACAO_COM_NOME_LITERAL.test(texto),
    `${rotulo}: apresentação com nome próprio literal. Deve ser "Me chamo {{funcionario}}".\n${texto}`,
  );
}

test('default de primeiro contato não carrega identidade nem negócio do dono', () => {
  reprovar('SAFE_FIRST_CONTACT_TEMPLATE', SAFE_FIRST_CONTACT_TEMPLATE);
  SAFE_FIRST_CONTACT_VARIANTS.forEach((texto, i) =>
    reprovar(`SAFE_FIRST_CONTACT_VARIANTS[${i}]`, texto),
  );
});

// Fingerprints de texto ANTIGO (pré 30/07/2026), congelados de propósito só para
// isSystemGeneratedProspectingTemplate (vendas-automation.service.ts) RECONHECER
// campanhas já salvas com esse texto (ex.: companyId 5 em prod, com "Jhonatan"
// literal no messageTemplate) e trocar pelo default novo (neutro) na próxima vez que
// a campanha for salva/renderizada. NUNCA são emitidos como mensagem nova — não são
// "default vivo" e por isso ficam fora da varredura de literais abaixo. O segundo
// teste desta suíte garante que eles continuam citados no reconhecedor (senão viram
// órfãos e o texto do dono para de ser migrado).
const NOMES_FINGERPRINT_LEGADO = new Set([
  'LEGACY_DEFAULT_MESSAGE_TEMPLATE',
  'LEGACY_SEGMENT_MISMATCH_FALLBACK_MESSAGE',
  'LEGACY_GENERICA_CASO_ERRO_MESSAGE',
  'GENERICA_CASO_ERRO_MESSAGE',
  'LEGACY_JHONATAN_FIRST_CONTACT_TEMPLATE',
  'LEGACY_JHONATAN_FIRST_CONTACT_VARIANTS',
]);

test('todo default de mensagem outbound do motor de prospecção passa no mesmo filtro', async () => {
  // Varredura do ARQUIVO-FONTE: pega qualquer const SCREAMING_SNAKE_CASE de texto
  // outbound, inclusive as que forem criadas depois deste teste (não deixa nascer
  // buraco novo). Escopo: só os 2 arquivos desta fatia (prospecting-safety.ts e
  // vendas-automation.service.ts).
  //
  // ⚠️ PENDÊNCIA (fora do escopo deste worker — não travar teste por dívida alheia):
  // a mesma varredura reprova HOJE em backend/src/vendas/vendas-lead-enrichment.ts
  // (16 templates "A HBX ajuda...") e em backend/src/vendas/vendas.service.ts
  // (buildHbxPresentationEmailDraft + companyName:'HBX' hardcoded). Ambos description
  // a marca HBX no lugar da marca do tenant — mesma família de defeito, dono de outro
  // worker. Ver AUDITORIA-COPY-VAZADA seção 1.B.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const alvos = ['prospecting-safety.ts', 'vendas-automation.service.ts'];
  const constBlockPattern = /const\s+([A-Z][A-Z0-9_]*)\s*=([\s\S]*?);\r?\n/g;
  const literalPt = /'((?:[^'\\]|\\.){40,})'/g; // string longa = copy, não chave/keyword curto
  for (const arquivo of alvos) {
    // dist/**/*.test.js roda a partir de dist/vendas/ → 2 níveis até a raiz do backend
    const src = path.resolve(__dirname, '../../src/vendas', arquivo);
    if (!fs.existsSync(src)) continue;
    const conteudo = fs.readFileSync(src, 'utf8');
    for (const bloco of conteudo.matchAll(constBlockPattern)) {
      const nome = bloco[1];
      if (NOMES_FINGERPRINT_LEGADO.has(nome)) continue;
      const corpo = bloco[2];
      for (const m of corpo.matchAll(literalPt)) {
        const texto = m[1];
        if (!/[?!.]/.test(texto)) continue; // não é frase
        if (/^\s*(SELECT|INSERT|https?:)/i.test(texto)) continue;
        reprovar(`${arquivo}:${nome} literal`, texto);
      }
    }
  }
});

test('fingerprints legados continuam citados no reconhecedor de template do sistema', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const src = path.resolve(__dirname, '../../src/vendas', 'vendas-automation.service.ts');
  const conteudo = fs.readFileSync(src, 'utf8');
  for (const nome of NOMES_FINGERPRINT_LEGADO) {
    const ocorrencias = conteudo.split(nome).length - 1;
    assert.ok(
      ocorrencias >= 2,
      `${nome}: fingerprint legado ficou órfão (só a declaração, sumiu de isSystemGeneratedProspectingTemplate) — campanha antiga com texto do dono pararia de ser migrada.`,
    );
  }
});
