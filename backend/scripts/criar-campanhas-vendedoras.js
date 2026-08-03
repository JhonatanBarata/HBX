// Monta a campanha de cada vendedora — uma por PESSOA (04/08/2026).
//
// Uso (dry-run por padrão):
//   node scripts/criar-campanhas-vendedoras.js
//   node scripts/criar-campanhas-vendedoras.js --apply
//   node scripts/criar-campanhas-vendedoras.js --company-id 5 --apply
//
// ⚠️ ORDEM OBRIGATÓRIA: rodar SÓ DEPOIS de publicar o código que faz a campanha
// ser da PESSOA (`latestCampaign(companyId, ownerUserId)`). Antes disso o app
// procura a campanha por `findFirst({ companyId })` — com seis linhas na mesma
// empresa ele pegaria "a mais recente", ou seja: a tela do dono abriria a
// campanha de uma vendedora qualquer e a reserva de copy sortearia texto de
// outra pessoa. Rodar antes do publish QUEBRA a prospecção de hoje.
//
// O que faz: cria a campanha de cada vendedora com as 5 mensagens dela e o
// roteiro de passagem pro gerente. NÃO arma nada — status `paused` e
// `triagemConfirmedAt` null, que é o que o 5º muro exige pra nunca disparar
// sozinho. Idempotente: quem já tem campanha é PULADA (nunca sobrescreve texto).

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value == null ? fallback : value;
}
const APPLY = process.argv.includes('--apply');
const COMPANY_ID = Number(arg('--company-id', 5));

// ── ROTEIRO DE PASSAGEM PRO GERENTE ──────────────────────────────────────────
// Correção do dono (04/08): o lead NÃO liga pra ninguém. Quem liga é o gerente.
// A versão anterior mandava o telefone 19 997024884 — que é o número do próprio
// chip do dono: o lead recebia da Bianca e era mandado ligar pro número dele.
const HANDOFF = [
  'fico muito feliz que tenha interesse, vc não vai se arrepender! daqui pra frente meu gerente vai entrar em contato, o nome dele é Jhonatan — ele vai te ligar',
];
const HANDOFF_DEPOIS = ['se tiver alguma dúvida, qualquer coisa só chamar!'];

// ── AS 25 MENSAGENS DE PRIMEIRO CONTATO (copy aprovada pelo dono, "1ok") ──────
// Nenhuma cumprimenta: o `preMessageVariants` manda um "oi" curto ANTES.
// Medidas contra a régua real (coldTextSimilarity): pior par 48,1%, todas
// ≤176 caracteres, sem link e sem prova social inventada.
const VENDEDORAS = [
  {
    login: 'bianca',
    tema: 'entrega / rota',
    textos: [
      'Vi que vocês entregam água aqui na região. A gente montou um sistema que organiza a rota do entregador e avisa o cliente. Faz sentido pra vocês ou já usam alguma coisa?',
      'Trabalho com um sistema que monta a rota das entregas do dia sozinho, na ordem certa. Separei algumas distribuidoras pra mostrar sem custo. Vocês controlam a entrega como hoje?',
      'Uma dúvida rápida: o entregador de vocês sai com a lista no papel? A gente resolve isso pelo celular dele, e dá pra testar de graça antes.',
      'Ajudo distribuidoras a saber onde o entregador está e quanto falta pra fechar o dia. Tô abrindo algumas vagas de teste por aqui. Interessa dar uma olhada?',
      'O que mais escuto de distribuidora é entrega que se perde no meio do dia. Montamos algo bem simples pra isso, roda no celular. Como vocês fazem hoje?',
    ],
  },
  {
    login: 'mariaclara',
    tema: 'pedido pelo WhatsApp',
    textos: [
      'Vocês atendem pedido pelo WhatsApp? Tenho um sistema que anota sozinho e já joga na rota do dia. Escolhi algumas distribuidoras da região pra testar sem pagar nada.',
      'Deve tocar bastante o WhatsApp de vocês, né? A gente junta esses pedidos num lugar só, sem perder nenhum. Posso te contar como funciona?',
      'Tô falando com algumas distribuidoras que vendem só pelo WhatsApp. O sistema anota o pedido e o endereço sem ninguém digitar. Teriam interesse em experimentar?',
      'Pergunta simples: quantos pedidos somem por dia porque ninguém viu a mensagem a tempo? É isso que a gente resolve, e o teste não custa nada.',
      'Trabalho com distribuidoras de água e gás organizando o atendimento do WhatsApp. Separei algumas da região pra liberar o teste. Vocês topam dar uma olhada?',
    ],
  },
  {
    login: 'flavia',
    tema: 'fiado / quem pagou',
    textos: [
      'Vocês controlam no caderno quem tá devendo? Tenho um sistema que mostra isso na hora, cliente por cliente. Separei algumas distribuidoras pra liberar o teste.',
      'O que mais dói em distribuidora é saber quem pagou e quem ficou devendo. Isso fica numa tela só aqui. Faz sentido eu te explicar?',
      'Tem um jeito de acabar com a planilha de fiado: o entregador marca no celular e você vê na hora. Vocês usam planilha hoje?',
      'Fechar o caixa do dia leva quanto tempo aí? Com a gente sai num toque, e dá pra experimentar antes sem custo nenhum.',
      'Ajudo distribuidoras a parar de perder dinheiro com venda fiado esquecida. É bem prático de usar. Queria saber como vocês controlam isso hoje.',
    ],
  },
  {
    login: 'leticia',
    tema: 'cliente que sumiu',
    textos: [
      'Vocês conseguem saber qual cliente parou de comprar? A gente avisa antes de você perder ele. Tô liberando teste pra algumas distribuidoras daqui.',
      'Cliente que some é o que mais custa em distribuidora. Nosso sistema mostra quem tá atrasado no galão e chama sozinho. Vocês acompanham isso hoje?',
      'Uma pergunta: vocês sabem quem não pede há duas semanas? Isso aqui entrega pronto, e dá pra experimentar de graça.',
      'Escolhi algumas distribuidoras da região pra mostrar uma coisa: o sistema lembra o cliente de pedir de novo, no dia certo. Interessa ver?',
      'Trabalho ajudando distribuidora a segurar cliente que ia sumir. Nada complicado, roda no celular mesmo. Como vocês fazem essa parte hoje?',
    ],
  },
  {
    login: 'anajulia',
    tema: 'organizar tudo',
    textos: [
      'A gente organiza venda, entrega e atendimento da distribuidora num sistema só. Separei algumas empresas daqui pra liberar sem custo. Vocês olhariam?',
      'Tô com algumas vagas de teste pra distribuidoras da região. É um sistema que junta pedido, rota e cobrança no mesmo lugar. Faz sentido pra vocês?',
      'Vocês usam algum sistema hoje ou é tudo no caderno e no WhatsApp mesmo? Pergunto porque é exatamente essa bagunça que a gente arruma.',
      'Ajudo distribuidoras de água e gás a tirar o dia a dia do papel. É simples e o teste não custa nada. Posso te explicar em duas linhas?',
      'Queria entender como vocês tocam a distribuidora hoje. Trabalho com um sistema feito pra esse ramo e liberei teste pra algumas empresas daqui.',
    ],
  },
];

// Alvo da busca (decisão do dono): a base é Rio Claro e região — DDD 19.
const CIDADE = 'Rio Claro';
const ESTADO = 'SP';
const SEGMENTO = 'distribuidora de água e gás';

function montarFiltros(textos) {
  return JSON.stringify({
    firstContactVariants: textos,
    handoffGerenteVariants: HANDOFF,
    handoffGerenteFollowUpVariants: HANDOFF_DEPOIS,
    // ⚠️ O "oi" curto que sairia ANTES do primeiro contato. ELE NÃO SAI no motor
    // que dispara hoje: a pré-mensagem é do caminho de campanha
    // (VendasAutomationJob, aposentado em 25/07) — a cadência por lead, que é
    // quem realmente envia, manda a abertura direto. Ou seja: as 25 chegam SEM
    // saudação nenhuma. Fica ligado porque é a decisão de projeto do dono, mas
    // quem for revisar a copy precisa saber que hoje não há "oi" antes.
    preMessageEnabled: true,
  });
}

async function main() {
  console.log(`[campanhas] empresa ${COMPANY_ID} · modo ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  let criadas = 0;
  let puladas = 0;

  for (const vendedora of VENDEDORAS) {
    const user = await prisma.user.findFirst({
      where: { companyId: COMPANY_ID, username: vendedora.login },
      select: { id: true, name: true, username: true },
    });
    if (!user) {
      console.log(`  ✖ ${vendedora.login}: não existe na empresa ${COMPANY_ID} — PULADA`);
      puladas += 1;
      continue;
    }
    // Sem nome de exibição a persona cai de volta no nome da empresa/dono — e aí
    // o chip dela assinaria "Jhonatan". Melhor recusar do que disparar errado.
    if (!String(user.name || '').trim()) {
      console.log(`  ✖ ${vendedora.login} (user ${user.id}): sem nome de exibição — PULADA (a persona assinaria o nome errado)`);
      puladas += 1;
      continue;
    }

    const existente = await prisma.vendasAutomationCampaign.findFirst({
      where: { companyId: COMPANY_ID, createdByUserId: user.id },
      select: { id: true, status: true },
    });
    if (existente) {
      console.log(`  = ${user.name} (user ${user.id}): já tem campanha ${existente.id} (${existente.status}) — PULADA, nada sobrescrito`);
      puladas += 1;
      continue;
    }

    const data = {
      companyId: COMPANY_ID,
      createdByUserId: user.id,
      // Nasce PAUSADA e sem triagem: o 5º muro exige `triagemConfirmedAt` pra
      // qualquer envio. Quem arma é o dono, na tela, quando quiser.
      status: 'paused',
      triagemConfirmedAt: null,
      city: CIDADE,
      state: ESTADO,
      segment: SEGMENTO,
      messageTemplate: vendedora.textos[0],
      filtersJson: montarFiltros(vendedora.textos),
      lastStatusText: 'Campanha montada. Pronta para o dono revisar.',
    };

    if (!APPLY) {
      console.log(`  + ${user.name} (user ${user.id}): criaria campanha — ${vendedora.textos.length} textos · tema "${vendedora.tema}"`);
      criadas += 1;
      continue;
    }
    const nova = await prisma.vendasAutomationCampaign.create({ data, select: { id: true } });
    console.log(`  ✔ ${user.name} (user ${user.id}): campanha ${nova.id} criada — ${vendedora.textos.length} textos`);
    criadas += 1;
  }

  console.log(`[campanhas] ${criadas} ${APPLY ? 'criada(s)' : 'a criar'} · ${puladas} pulada(s)`);
  if (!APPLY) console.log('[campanhas] DRY-RUN — rode de novo com --apply pra gravar.');
}

main()
  .catch((error) => {
    console.error('[campanhas] FALHOU:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
