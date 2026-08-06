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
