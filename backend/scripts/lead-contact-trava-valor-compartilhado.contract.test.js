// Fiscal da TRAVA DE VALOR COMPARTILHADO (01/08/2026).
//
// LEI: "contato que serve a muitos não é de ninguém".
// Contexto: o enriquecimento profundo tratava DIRETÓRIO como se fosse o site do
// lead, varria 12 páginas + 24 links e trazia o contato das empresas VIZINHAS.
// O telefone da própria Solutudo ficou colado em 803 leads, o Instagram do
// diretório em 80, `seu@email.com` em 11, um DSN do Sentry em 23.
//
// Este teste NÃO precisa de banco: ele lê a migration e trava as decisões que
// custaram caro pra descobrir. Trava sem fiscal vira decoração — alguém apaga o
// gatilho num refactor e o veneno volta calado.

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const backendRoot = join(__dirname, '..');
const schema = readFileSync(join(backendRoot, 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    backendRoot,
    'prisma',
    'migrations',
    '20260801030000_lead_contact_trava_valor_compartilhado',
    'migration.sql',
  ),
  'utf8',
);

test('a trava mora no LeadContact, antes da escrita — vale pra TODO gravador', () => {
  // Se ela morasse só no worker do enriquecimento, backfill/import/crawl novo
  // continuariam entrando por fora. O ponto de estrangulamento é a tabela.
  assert.match(
    migration,
    /CREATE TRIGGER "hbx_trava_valor_compartilhado"\s+BEFORE INSERT ON public\."LeadContact"/,
  );
  assert.match(migration, /FOR EACH ROW/);
});

test('recusa a linha, não estoura exceção — uma missão inteira não morre por 1 contato sujo', () => {
  // RETURN NULL num BEFORE INSERT descarta só aquela linha. Quem chama já trata
  // "não inseriu" (ON CONFLICT DO NOTHING + RETURNING no commit do enriquecimento).
  assert.match(migration, /RETURN NULL;/);
  assert.doesNotMatch(migration, /RAISE EXCEPTION/);
});

test('o que foi recusado fica registrado — trava que engole em silêncio é bug invisível', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\."LeadContactBloqueado"/);
  assert.match(migration, /INSERT INTO public\."LeadContactBloqueado"/);
  // E o Prisma precisa conhecer a tabela, senão o schema deriva do banco.
  assert.match(schema, /model LeadContactBloqueado \{/);
  assert.match(schema, /leadsComOValor\s+Int/);
});

test('registro OFICIAL da Receita passa direto — repetição ali é a verdade legal', () => {
  // `cesup.platbh.mg@bb.com.br` está em 103 CNPJs porque o Banco do Brasil
  // declarou esse e-mail pras 103 agências; o fiscal da Schindler em 78 filiais.
  // Travar isso apagaria dado bom — foi o erro pego no ensaio antes de apagar.
  assert.match(migration, /hbx_fonte_oficial_v1/);
  assert.match(migration, /'cnpj_public',\s*'cnpj_l4'/);
  assert.match(
    migration,
    /IF public\.hbx_fonte_oficial_v1\(NEW\."source"\) THEN\s*\n\s*RETURN NEW;/,
  );
});

test('só canal de contato entra na conta, e o teto mora num lugar só', () => {
  assert.match(
    migration,
    /NEW\."kind" NOT IN \('phone', 'email', 'whatsapp', 'instagram', 'facebook'\)/,
  );
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.hbx_teto_valor_compartilhado_v1/);
  // Teto medido: compartilhamento legítimo (grupo, contador, agência) morre em
  // ~6 leads; o veneno de diretório vive em 20+. 10 erra pro lado de deixar entrar.
  assert.match(migration, /SELECT 10/);
});

test('a contagem usa o índice existente e para no teto — não varre as 803 linhas por insert', () => {
  assert.match(schema, /@@index\(\[kind, valueNormalized\]\)/);
  assert.match(migration, /LIMIT teto/);
});
