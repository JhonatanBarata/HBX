// ================================================================
// FISCAL DAS COPIES DE FÁBRICA DO 1º CONTATO (06/08/2026)
//
// Por que este arquivo existe: o dono reprovou 6 textos de primeiro contato e
// depois reprovou o MÉTODO de consertar — *"tudo isso quem tem q enviar é o HBX,
// não é vc! vc é o treinador!"*. A entrega não é "6 mensagens boas", é "o sistema
// produz mensagens boas". O gerador (prompt + validador) foi consertado no commit
// anterior; falta a outra metade: o que o sistema entrega **de fábrica**, para o
// tenant que nunca escreveu texto nenhum.
//
// Essa copy não passa por validador nenhum em produção — ela É o default. O único
// lugar onde ela pode ser reprovada é aqui. E a régua é a MESMA função que a IA de
// variações usa (`reprovarPrimeiroContato`), de propósito: duas réguas pra mesma
// pergunta é como nasce "passou no preparo e morreu no envio".
//
// Diferença de rigor, e ela é consciente:
//   - variação de frase da PESSOA → o convite só é cobrado se a base dela convida;
//   - copy de FÁBRICA → convite SEMPRE, porque aqui não existe "a pessoa escolheu
//     outro estilo": não tem pessoa nenhuma, só a régua do dono.
// ================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import { SAFE_FIRST_CONTACT_TEMPLATE, SAFE_FIRST_CONTACT_VARIANTS } from './prospecting-safety';
import { VARIACAO_MAX_CHARS, reprovarPrimeiroContato } from './vendas-copy-variacoes';

// Consts de 1º contato que NÃO são emitidas — são impressão digital de texto
// antigo, guardadas só pra isSystemGeneratedProspectingTemplate reconhecer campanha
// velha e migrar. Reprovar estas seria pedir pra apagar a memória da migração.
const FINGERPRINTS_LEGADOS = new Set([
  'LEGACY_JHONATAN_FIRST_CONTACT_TEMPLATE',
  'LEGACY_JHONATAN_FIRST_CONTACT_VARIANTS',
]);

// Consts vivas que este fiscal cobre.
const FISCALIZADAS = new Set([
  'SAFE_FIRST_CONTACT_TEMPLATE',
  'SAFE_FIRST_CONTACT_VARIANTS',
  'DEFAULT_FIRST_CONTACT_VARIANTS',
]);

// ── 3ª SUPERFÍCIE: os templates do link wa.me, por categoria de segmento ──────
//
// As duas consts acima são a copy que o MOTOR dispara. Mas existe uma terceira
// porta por onde sai primeiro contato, e ela não passava por régua nenhuma: os
// templates do `?text=` do link wa.me (o vendedor clica no telefone do card e o
// WhatsApp abre com a mensagem pronta). Quem lê não sabe se veio de robô ou de
// clique — pro lead é a mesma primeira mensagem, e a régua do dono é a mesma.
//
// O arquivo é DUPLICADO de propósito (não há infra de monorepo pra o front
// importar do backend), e o `_comment` dos dois manda "mantenha em sincronia" —
// pedido que, até aqui, nada obrigava. Divergência aqui é do pior tipo: a tela
// mostra um texto e o cliente recebe outro.
const WA_TEMPLATES_ARQUIVOS = {
  backend: '../../src/webscraping/radar/shared/wa-message-templates.json',
  frontend: '../../../frontend/src/lib/wa-message-templates.json',
} as const;

/**
 * Comprimento se mede RENDERIZADO. `{{cumprimentacao}}` tem 18 caracteres no código
 * e vira "Bom dia" (7) no celular do lead — cobrar o teto no texto cru reprovaria
 * copy que chega curtinha.
 */
function renderizar(texto: string): string {
  return String(texto || '')
    .replace(/\{\{\s*cumprimentacao\s*\}\}/g, 'Bom dia')
    .replace(/\{\{\s*funcionario\s*\}\}/g, 'Maria Clara')
    .replace(/\{\{\s*empresa\s*\}\}/g, 'Aguas do Vale')
    .replace(/\{\{\s*cliente\s*\}\}/g, 'Distribuidora Sao Jorge')
    .replace(/\{\{\s*cidade\s*\}\}/g, 'Rio Claro')
    .replace(/\{\{\s*segmento\s*\}\}/g, 'distribuicao de agua')
    .replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, 'algo');
}

function lerFonte(arquivo: string): string {
  // dist/vendas/*.test.js roda a partir de dist/vendas/ → 2 níveis até a raiz do backend
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  return fs.readFileSync(path.resolve(__dirname, '../../src/vendas', arquivo), 'utf8');
}

/**
 * Lê o JSON de templates do FONTE (não do dist): é o arquivo que a pessoa edita
 * que precisa ser fiscalizado, e o do front nem chega a passar por tsc daqui.
 */
function lerTemplatesWa(lado: keyof typeof WA_TEMPLATES_ARQUIVOS): Record<string, string> {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const caminho = path.resolve(__dirname, WA_TEMPLATES_ARQUIVOS[lado]);
  return JSON.parse(fs.readFileSync(caminho, 'utf8')) as Record<string, string>;
}

/** As chaves que são template de verdade — `_comment` é documentação, não mensagem. */
function chavesDeTemplate(json: Record<string, string>): string[] {
  return Object.keys(json).filter((chave) => chave !== '_comment');
}

// ── ORÇAMENTO DE PIOR CASO, e por que não é "um lead" ────────────────────────
//
// A 1ª versão deste fiscal media com UM lead real. Não serve: fiscal que passa
// ou reprova dependendo do nome do cliente que eu escolhi não é fiscal. O
// `alimentacao` dava 194 com "Água Santo Agostinho" e 211 com "Rinagua
// Distribuidora de Água Ltda." — mesma copy, mesmo dia, dois veredictos.
//
// Então a medida é o PIOR CASO. E os três valores são os MAIORES REAIS da base
// (empresa 5), não estimativa minha — o teto tem que vir do dado, senão vira
// número escolhido pra dar verde.
//
// ⚠️ Não há encurtamento no caminho: `formatCompanyName` (front) só arruma
// maiúscula/acento, e o backend nem isso — o nome inteiro entra na mensagem.
const LEAD_PIOR_CASO = {
  nome: 'Rinagua Distribuidora de Água Ltda.', // 35 — o mais comprido da base
  segmento: 'Distribuidora de agua mineral', //    29
  cidade: "Santa Bárbara d'Oeste", //              21
};

/**
 * Espelha `buildWaMessage` (radar-core-shared.ts / frontend wa-link.ts) — inclusive
 * o `.replace` de string, que troca só a PRIMEIRA ocorrência de cada marcador.
 *
 * ⚠️ Aqui o marcador é `{chave}`, chave simples — NÃO o `{{chave}}` do resto do
 * módulo. Reaproveitar o `renderizar()` de cima mediria o teto no texto CRU e o
 * fiscal julgaria um tamanho que ninguém recebe.
 */
function renderizarWa(template: string): string {
  return String(template || '')
    .replace('{nome}', LEAD_PIOR_CASO.nome ? ` ${LEAD_PIOR_CASO.nome}` : '')
    .replace('{segmento}', LEAD_PIOR_CASO.segmento ? LEAD_PIOR_CASO.segmento.toLowerCase() : 'sua área')
    .replace('{cidade}', LEAD_PIOR_CASO.cidade ? ` em ${LEAD_PIOR_CASO.cidade}` : '');
}

/** Extrai os literais de um `const NOME = [...]` direto do fonte. */
function literaisDaConst(fonte: string, nome: string): string[] {
  const bloco = fonte.match(new RegExp(`const\\s+${nome}\\s*=\\s*\\[([\\s\\S]*?)\\n\\]`));
  if (!bloco) return [];
  return [...bloco[1].matchAll(/'((?:[^'\\]|\\.)+)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
}

function fiscalizar(rotulo: string, texto: string) {
  const motivo = reprovarPrimeiroContato(renderizar(texto), {
    tetoChars: VARIACAO_MAX_CHARS,
    exigirConvite: true, // fábrica: sempre
  });
  assert.equal(
    motivo,
    null,
    `${rotulo}: copy de FÁBRICA reprovada na régua do 1º contato.\nMotivo: ${motivo}\nTexto: ${texto}`,
  );
}

test('copy de fábrica do 1º contato passa na MESMA régua da IA de variações', () => {
  fiscalizar('SAFE_FIRST_CONTACT_TEMPLATE', SAFE_FIRST_CONTACT_TEMPLATE);
  SAFE_FIRST_CONTACT_VARIANTS.forEach((texto, i) => fiscalizar(`SAFE_FIRST_CONTACT_VARIANTS[${i}]`, texto));

  // As 5 do motor não são exportadas: leio do fonte. O assert de quantidade é a
  // trava contra o pior modo de falha de um fiscal — extrair 0 itens e ficar verde.
  const fonte = lerFonte('vendas-automation.service.ts');
  const doMotor = literaisDaConst(fonte, 'DEFAULT_FIRST_CONTACT_VARIANTS');
  assert.ok(
    doMotor.length >= 5,
    `DEFAULT_FIRST_CONTACT_VARIANTS: esperava as 5 copies do motor, li ${doMotor.length}. ` +
      'Se a const mudou de forma, o fiscal parou de fiscalizar — conserte a extração, não este número.',
  );
  doMotor.forEach((texto, i) => fiscalizar(`DEFAULT_FIRST_CONTACT_VARIANTS[${i}]`, texto));
});

test('nenhuma copy de 1º contato nasce fora do fiscal', () => {
  // O buraco que isto tampa: alguém cria DEFAULT_FIRST_CONTACT_VARIANTS_V2 amanhã,
  // o fiscal acima continua verde e a copy nova nunca é medida.
  const arquivos = ['prospecting-safety.ts', 'vendas-automation.service.ts'];
  const encontradas: string[] = [];
  for (const arquivo of arquivos) {
    for (const m of lerFonte(arquivo).matchAll(/(?:const|export const)\s+([A-Z][A-Z0-9_]*FIRST_CONTACT[A-Z0-9_]*)\s*=/g)) {
      encontradas.push(m[1]);
    }
  }
  assert.ok(encontradas.length > 0, 'varredura não achou const nenhuma — o padrão de busca quebrou');
  for (const nome of encontradas) {
    assert.ok(
      FISCALIZADAS.has(nome) || FINGERPRINTS_LEGADOS.has(nome),
      `${nome}: copy de 1º contato fora do fiscal. Acrescente em FISCALIZADAS (se é emitida) ` +
        'ou em FINGERPRINTS_LEGADOS (se só serve pra reconhecer campanha antiga).',
    );
  }
});

test('template do link wa.me passa na régua do 1º contato — nos DOIS arquivos', () => {
  // Não há lista de chaves fiscalizadas aqui de propósito: o teste varre TODAS as
  // chaves do arquivo. Template de categoria nova já nasce medido, sem ninguém
  // precisar lembrar de cadastrar em lugar nenhum.
  for (const lado of Object.keys(WA_TEMPLATES_ARQUIVOS) as (keyof typeof WA_TEMPLATES_ARQUIVOS)[]) {
    const json = lerTemplatesWa(lado);
    const chaves = chavesDeTemplate(json);
    // Mesma trava do fiscal de cima: o pior modo de falha é varrer 0 item e ficar verde.
    assert.ok(
      chaves.length >= 10,
      `${lado}: esperava as 10 categorias de wa-message-templates.json, li ${chaves.length}. ` +
        'Se o arquivo mudou de forma, conserte a leitura — não este número.',
    );

    for (const chave of chaves) {
      const renderizado = renderizarWa(json[chave]);

      // Marcador que sobrou é o {{funcionario}} cru de 31/07 nascendo de novo em
      // outra porta: chega literal no WhatsApp do lead. Como `buildWaMessage` troca
      // só a 1ª ocorrência, isto pega tanto marcador novo ({empresa}) quanto
      // marcador repetido ({nome} duas vezes na mesma frase).
      const sobrou = renderizado.match(/\{[a-zA-Z0-9_]+\}/);
      assert.equal(
        sobrou,
        null,
        `wa-message-templates[${lado}].${chave}: marcador ${sobrou?.[0]} chega CRU no lead — ` +
          'buildWaMessage só conhece {nome}, {segmento} e {cidade}, e troca a primeira ocorrência de cada.',
      );

      const motivo = reprovarPrimeiroContato(renderizado, {
        tetoChars: VARIACAO_MAX_CHARS,
        exigirConvite: true, // é copy de fábrica: aqui não existe "a pessoa escolheu outro estilo"
      });
      assert.equal(
        motivo,
        null,
        `wa-message-templates[${lado}].${chave}: reprovado na régua do 1º contato.\n` +
          `Motivo: ${motivo}\nRenderizado (${renderizado.length} chars): ${renderizado}`,
      );
    }
  }
});

test('as duas cópias de wa-message-templates.json não podem divergir', () => {
  // O `_comment` dos dois arquivos PEDE sincronia e nada obrigava — pedido escrito
  // em comentário é torcida, não regra. Divergência aqui é do tipo que só aparece
  // quando o cliente recebe um texto diferente do que a tela mostrou.
  //
  // O `_comment` em si fica de fora da comparação: ele descreve o caminho do
  // arquivo IRMÃO, então é legítimo que os dois textos sejam diferentes.
  const backend = lerTemplatesWa('backend');
  const frontend = lerTemplatesWa('frontend');

  const chavesBackend = chavesDeTemplate(backend).sort();
  const chavesFrontend = chavesDeTemplate(frontend).sort();
  assert.deepEqual(
    chavesFrontend,
    chavesBackend,
    'wa-message-templates.json: as duas cópias têm categorias diferentes.\n' +
      `só no backend:  ${chavesBackend.filter((c) => !chavesFrontend.includes(c)).join(', ') || '—'}\n` +
      `só no frontend: ${chavesFrontend.filter((c) => !chavesBackend.includes(c)).join(', ') || '—'}`,
  );

  const divergentes = chavesBackend.filter((chave) => backend[chave] !== frontend[chave]);
  assert.deepEqual(
    divergentes,
    [],
    'wa-message-templates.json: mesma categoria com TEXTO diferente nas duas cópias — ' +
      'o lead recebe uma coisa e a outra superfície manda outra.\n' +
      divergentes
        .map((c) => `[${c}]\n  backend:  ${backend[c]}\n  frontend: ${frontend[c]}`)
        .join('\n'),
  );
});
