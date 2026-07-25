'use strict';

/**
 * ESPELHAMENTO DE CADASTRO DE LOGÍSTICA ENTRE TENANTS (25/07).
 *
 * Pedido do dono: visita o cliente André AMANHÃ e quer ver, na conta de TESTE dele
 * (empresa 45, "Jhonatan Barata", user ADMIN id 55), EXATAMENTE o cadastro de
 * logística que o André tem hoje na conta real (empresa 41, "Andre Barata") — incluindo
 * as datas/frequência que o André já arrumou (ClienteProduto.diasSemana/proximaData).
 * Autorização textual do dono: "pode deletar tudo q eu tenho, essa conta jbinformatica...
 * é uma conta feita para testes de logística, então não tenha medo".
 *
 *   ORIGEM  = empresa 41 — cliente REAL. SOMENTE LEITURA. Este arquivo não tem UMA
 *             única escrita (update/create/delete/upsert) cujo where/data resolva
 *             para companyId=41 — nem com flags, nem por engano (guard abaixo).
 *   DESTINO = empresa 45 — conta de teste do dono. Pode ser apagada por completo.
 *
 * O QUE É COPIADO (4 tabelas, o "cadastro de logística" que alimenta a tela — nada de
 * entrega/rota histórica, sessão, financeiro, usuário ou WhatsApp):
 *   · CustomerProfile (isCliente=true)  — nome/telefone/documento/endereço/geo/contrato
 *     de cobrança por cliente. NÃO copiado: sourceConnectionId/externalSource/
 *     externalCustomerId (integração é por-conexão, não existe em 45), firstInboundAt/
 *     lastInboundAt/botOff* (rastro de conversa/bot — fora do escopo "cadastro").
 *   · LocalEntrega               — locais de entrega (coordenada, isPrincipal, acesso).
 *   · Product (usaLogistica=true, ou referenciado por ClienteProduto do cliente copiado)
 *     — catálogo (galão, preço...). NÃO copiado: createdByUserId/updatedByUserId
 *     (User não existe/não é copiado; apontar pro id da 41 seria corrupção) nem
 *     sourceConnectionId/externalSource/externalProductId (idem CustomerProfile).
 *   · ClienteProduto             — o vínculo cliente↔produto: diasSemana, frequenciaDias,
 *     proximaData, qtdPadrao, precoAcordado, localId. É onde vive a agenda que o André
 *     já ajustou — o motivo #1 deste script.
 *   · LogisticaConfig do destino — só GARANTIDA (upsert sem tocar em nenhum campo se já
 *     existir). `agendaV2Ativa` NUNCA é copiada nem alterada — o dono liga isso à parte.
 *
 * REMAPEAMENTO DE IDS (ponto crítico): CustomerProfile/LocalEntrega/ClienteProduto usam
 * cuid *global* (não composto) e Product usa Int autoincrement *global* — em ambos os
 * casos o id da origem já pertence à LINHA da empresa 41 dentro da MESMA tabela; não dá
 * pra reusar. Toda linha nova recebe id novo (cuid/autoincrement do Prisma) e o script
 * guarda 3 mapas em memória (idOrigem → idDestino: cliente, local, produto) — os vínculos
 * de ClienteProduto são recriados apontando pros ids NOVOS via esses mapas, nunca pros
 * ids da origem. Se um vínculo não resolver em algum mapa (não deveria acontecer, dado
 * que locais/produtos são coletados a partir dos MESMOS clientes copiados), o script
 * ABORTA a transação inteira (nenhuma escrita parcial) em vez de gravar um vínculo torto.
 * As demais tabelas com chave composta `[id, companyId]` no schema (LogisticaRoute,
 * LogisticaTrackingSession, LogisticaPlanoEntrega, LogisticaRotaModelo...) NÃO são
 * tocadas por este script (fora de escopo — são rota/tracking histórico), então essa
 * composição não entra em jogo aqui.
 *
 * BACKUP/ROLLBACK — mesmo contrato do backfill-pinos-suspeitos.js: ANTES de qualquer
 * escrita, o estado ATUAL da empresa 45 (as 4 tabelas acima, linha completa) é gravado
 * em JSON em /app/storage/espelhar-logistica-<timestamp>.json. `--rollback=<arquivo>`
 * apaga o que este script criou e devolve exatamente essas linhas (mesmos ids, mesmos
 * valores — inclusive createdAt/updatedAt originais).
 *
 * ⚠️ CASCATA DO BANCO: apagar CustomerProfile/LocalEntrega da empresa 45 dispara
 * `onDelete: Cascade` do Postgres em tabelas FORA do escopo deste script (Entrega,
 * Contato, ClienteHistorico, DebtCase, VendasLead, FinanceiroCharge, CompanyConversation,
 * AtendimentoCustomer, HbxRecoveryCustomer, RecoveryDebtItem, LogisticaPlanoEntrega,
 * LogisticaRotaModeloParada, LogisticaLeituraParada) SE a empresa 45 já tiver linhas
 * nelas hoje. Este script NÃO faz backup dessas tabelas (fora do escopo "cadastro de
 * logística" combinado com o dono) — o plano (dry-run) IMPRIME a contagem de risco antes
 * de qualquer `--aplicar`, mas o `--rollback` NÃO as restaura. Ver RELATÓRIO.
 *
 * IDEMPOTENTE: cada `--aplicar` APAGA a empresa 45 (nas 4 tabelas) e recria a partir da
 * 41 — rodar 2× seguidas dá o mesmo ESTADO (mesmos dados; os ids internos mudam a cada
 * rodada, isso é esperado num espelhamento por overwrite, não um sync incremental).
 *
 * USO (dry-run é o DEFAULT — não escreve nada sem --aplicar):
 *   node scripts/espelhar-logistica-tenant.js                       # plano, não escreve
 *   node scripts/espelhar-logistica-tenant.js --aplicar             # espelha 41 → 45
 *   node scripts/espelhar-logistica-tenant.js --rollback=/app/storage/espelhar-logistica-20260725201500.json
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── Constantes de escopo — DELIBERADAMENTE hardcoded, não vêm de CLI. O pedido é
// específico (41 → 45); permitir "qualquer empresa" via flag aumentaria o raio de erro
// exatamente no script que promete "a origem nunca é escrita". ─────────────────────────
const ORIGEM_COMPANY_ID = 41; // "Andre Barata" — cliente real. SOMENTE LEITURA.
const DESTINO_COMPANY_ID = 45; // "Jhonatan Barata" (ADMIN id 55) — conta de teste.
const STORAGE_DIR = '/app/storage';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const rollbackArg = args.find((a) => a.startsWith('--rollback='));
const ROLLBACK_FILE = rollbackArg ? rollbackArg.slice('--rollback='.length) : null;

function log(...a) {
  console.log(...a);
}

// ── GUARD estrutural: nenhuma escrita deste script pode alcançar a empresa 41, em
// nenhuma circunstância (não existe flag que desative isto). Toda chamada de
// create/update/delete/upsert abaixo é feita com DESTINO_COMPANY_ID — nunca com a
// constante ORIGEM_COMPANY_ID nem com uma variável que possa valer 41. Esta função é
// chamada uma única vez, antes de abrir a transação de escrita, como prova em runtime
// do invariante (e trava para sempre se algum dia alguém trocar as constantes acima).
function garantirEscritaSoNoDestino() {
  if (ORIGEM_COMPANY_ID === DESTINO_COMPANY_ID) {
    throw new Error('GUARD: ORIGEM_COMPANY_ID === DESTINO_COMPANY_ID — abortando (a empresa não pode espelhar em si mesma).');
  }
  if (DESTINO_COMPANY_ID === 41) {
    throw new Error('GUARD: DESTINO_COMPANY_ID não pode ser 41 — essa é a empresa do André, somente leitura, para sempre.');
  }
}

// ── Campos copiados de cada tabela (select explícito — o que não está aqui não é lido
// da origem, então não pode ir para o destino por acidente). ───────────────────────────
const SELECT_CLIENTE = {
  id: true,
  name: true,
  profileName: true,
  nameSource: true,
  nameConfirmed: true,
  phone: true,
  phoneNormalized: true,
  email: true,
  document: true,
  status: true,
  notes: true,
  observacoes: true,
  searchName: true,
  tipo: true,
  cnpj: true,
  endereco: true,
  numero: true,
  bairro: true,
  cidade: true,
  uf: true,
  cep: true,
  lat: true,
  lng: true,
  geoFonte: true,
  isLead: true,
  isCliente: true,
  isFornecedor: true,
  origin: true,
  modeloCobranca: true,
  diaFechamento: true,
  precoPadrao: true,
  formaPagamento: true,
  metodoPadrao: true,
  contabilizar: true,
  limiteFiado: true,
  avisarEntrega: true,
  avisarCobranca: true,
};

const SELECT_LOCAL = {
  id: true,
  customerProfileId: true,
  apelido: true,
  endereco: true,
  numero: true,
  bairro: true,
  cidade: true,
  uf: true,
  cep: true,
  lat: true,
  lng: true,
  geoFonte: true,
  isPrincipal: true,
  ativo: true,
  acessoTipo: true,
  acessoAndares: true,
  acessoTemElevador: true,
  acessoObservacao: true,
};

const SELECT_PRODUTO = {
  id: true,
  kind: true,
  status: true,
  sku: true,
  name: true,
  description: true,
  category: true,
  price: true,
  priceCents: true,
  currency: true,
  billingCycle: true,
  saleMode: true,
  planKey: true,
  externalUrl: true,
  allowDiscount: true,
  maxDiscountPercent: true,
  minPriceCents: true,
  defaultCommissionPercent: true,
  sortOrder: true,
  stock: true,
  unidade: true,
  usaLogistica: true,
  categoryId: true, // Category é tabela GLOBAL (sem companyId) — copia direto, sem remapear.
};

const SELECT_CLIENTE_PRODUTO = {
  id: true,
  customerProfileId: true,
  productId: true,
  localId: true,
  qtdPadrao: true,
  precoAcordado: true,
  frequenciaDias: true,
  diasSemana: true,
  proximaData: true,
  ativo: true,
};

// ── Tabelas fora do escopo de cópia, mas dependentes de CustomerProfile/LocalEntrega
// via onDelete:Cascade — se a empresa 45 já tiver linhas aqui, o DELETE de
// CustomerProfile/LocalEntrega arrasta elas de calças arriadas (fora do nosso backup).
// Só CONTAMOS pra avisar no plano; não lemos linha nem restauramos no rollback. ────────
async function contarRiscoCascata(client, companyId) {
  const [
    entregas,
    contatos,
    debtCases,
    vendasLeads,
    clienteHistoricos,
    financeiroCharges,
    recoveryDebtItems,
    conversations,
    atendimentoCustomers,
    hbxRecoveryCustomers,
  ] = await Promise.all([
    client.entrega.count({ where: { companyId } }).catch(() => 0),
    client.contato.count({ where: { companyId } }).catch(() => 0),
    client.debtCase.count({ where: { companyId } }).catch(() => 0),
    client.vendasLead.count({ where: { companyId } }).catch(() => 0),
    client.clienteHistorico.count({ where: { companyId } }).catch(() => 0),
    client.financeiroCharge.count({ where: { companyId } }).catch(() => 0),
    client.recoveryDebtItem.count({ where: { companyId } }).catch(() => 0),
    client.companyConversation.count({ where: { companyId } }).catch(() => 0),
    client.atendimentoCustomer.count({ where: { companyId } }).catch(() => 0),
    client.hbxRecoveryCustomer.count({ where: { companyId } }).catch(() => 0),
  ]);
  return {
    entregas,
    contatos,
    debtCases,
    vendasLeads,
    clienteHistoricos,
    financeiroCharges,
    recoveryDebtItems,
    conversations,
    atendimentoCustomers,
    hbxRecoveryCustomers,
  };
}

function totalRisco(r) {
  return Object.values(r).reduce((acc, n) => acc + n, 0);
}

// ── Detecta duplicidade em campos com índice único por-empresa (phoneNormalized, cnpj)
// — se a ORIGEM já tiver duas linhas colidindo, a transação de escrita vai falhar (e
// fazer rollback inteiro, sem gravar nada pela metade); isto aqui só avisa ANTES, no
// dry-run, pra não ser uma surpresa no --aplicar. ───────────────────────────────────────
function detectarDuplicidade(clientes, campo) {
  const vistos = new Map();
  const duplicados = new Set();
  for (const c of clientes) {
    const v = c[campo];
    if (!v) continue;
    if (vistos.has(v)) duplicados.add(v);
    vistos.set(v, true);
  }
  return [...duplicados];
}

async function coletarOrigem() {
  const clientes = await prisma.customerProfile.findMany({
    where: { companyId: ORIGEM_COMPANY_ID, isCliente: true },
    select: SELECT_CLIENTE,
    orderBy: { id: 'asc' },
  });
  const clienteIds = clientes.map((c) => c.id);

  const locais = await prisma.localEntrega.findMany({
    where: { companyId: ORIGEM_COMPANY_ID, customerProfileId: { in: clienteIds } },
    select: SELECT_LOCAL,
    orderBy: { id: 'asc' },
  });

  const clienteProdutos = await prisma.clienteProduto.findMany({
    where: { companyId: ORIGEM_COMPANY_ID, customerProfileId: { in: clienteIds } },
    select: SELECT_CLIENTE_PRODUTO,
    orderBy: { id: 'asc' },
  });

  const productIdsVinculados = [...new Set(clienteProdutos.map((cp) => cp.productId))];
  const produtos = await prisma.product.findMany({
    where: {
      companyId: ORIGEM_COMPANY_ID,
      OR: [{ usaLogistica: true }, { id: { in: productIdsVinculados } }],
    },
    select: SELECT_PRODUTO,
    orderBy: { id: 'asc' },
  });

  return { clientes, locais, clienteProdutos, produtos };
}

// Estado ATUAL do destino — é isto que vira backup, e é isto que será apagado.
async function coletarDestinoAtual() {
  const clientes = await prisma.customerProfile.findMany({ where: { companyId: DESTINO_COMPANY_ID } });
  const locais = await prisma.localEntrega.findMany({ where: { companyId: DESTINO_COMPANY_ID } });
  const clienteProdutos = await prisma.clienteProduto.findMany({ where: { companyId: DESTINO_COMPANY_ID } });
  const produtos = await prisma.product.findMany({ where: { companyId: DESTINO_COMPANY_ID, usaLogistica: true } });
  return { clientes, locais, clienteProdutos, produtos };
}

function imprimirPlano({ origem, destinoAtual, risco, empresas }) {
  log('');
  log(`== ESPELHAMENTO DE LOGÍSTICA ${APLICAR ? '(APLICANDO)' : '(DRY-RUN — nada é escrito)'} ==`);
  log(`origem  : empresa ${ORIGEM_COMPANY_ID} "${empresas.origem?.name ?? '???'}" (SOMENTE LEITURA)`);
  log(`destino : empresa ${DESTINO_COMPANY_ID} "${empresas.destino?.name ?? '???'}"`);
  log('');
  log('vai COPIAR da origem:');
  log(`  · CustomerProfile (isCliente=true) : ${origem.clientes.length}`);
  log(`  · LocalEntrega                     : ${origem.locais.length}`);
  log(`  · Product (usaLogistica/vinculado) : ${origem.produtos.length}`);
  log(`  · ClienteProduto (vínculo cliente↔produto, com diasSemana/proximaData) : ${origem.clienteProdutos.length}`);
  log('');
  log('vai APAGAR no destino antes de copiar (backup completo dessas linhas primeiro):');
  log(`  · CustomerProfile : ${destinoAtual.clientes.length}`);
  log(`  · LocalEntrega    : ${destinoAtual.locais.length}`);
  log(`  · Product (usaLogistica) : ${destinoAtual.produtos.length}`);
  log(`  · ClienteProduto  : ${destinoAtual.clienteProdutos.length}`);
  log('');
  const riscoTotal = totalRisco(risco);
  if (riscoTotal > 0) {
    log(`⚠️  RISCO DE CASCATA no destino (empresa ${DESTINO_COMPANY_ID}) — estas tabelas NÃO são copiadas nem`);
    log('    restauradas pelo --rollback, mas o Postgres apaga em cascata se apagarmos CustomerProfile/LocalEntrega:');
    for (const [k, v] of Object.entries(risco)) {
      if (v > 0) log(`      - ${k}: ${v}`);
    }
    log('    Se isto tiver algo que importa, PARE e avise o dono antes de --aplicar.');
  } else {
    log('risco de cascata no destino: nenhum (as tabelas dependentes estão vazias em 45).');
  }
  log('');
  const dupTelefone = detectarDuplicidade(origem.clientes, 'phoneNormalized');
  const dupCnpj = detectarDuplicidade(origem.clientes, 'cnpj');
  if (dupTelefone.length) log(`⚠️  telefone duplicado na origem (vai colidir no índice único por-empresa): ${dupTelefone.length}`);
  if (dupCnpj.length) log(`⚠️  cnpj duplicado na origem (vai colidir no índice único por-empresa): ${dupCnpj.length}`);
  log('');
  if (!APLICAR) {
    log('DRY-RUN: nada foi escrito. Rode de novo com --aplicar pra valer.');
  }
}

async function gravarBackup(destinoAtual) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const arquivo = path.join(STORAGE_DIR, `espelhar-logistica-${stamp}.json`);
  fs.writeFileSync(
    arquivo,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        origem: ORIGEM_COMPANY_ID,
        destino: DESTINO_COMPANY_ID,
        // BACKUP = estado ANTES do --aplicar (o --rollback devolve exatamente isto,
        // linha completa, mesmos ids, mesmos createdAt/updatedAt).
        clientes: destinoAtual.clientes,
        locais: destinoAtual.locais,
        clienteProdutos: destinoAtual.clienteProdutos,
        produtos: destinoAtual.produtos,
      },
      null,
      2,
    ),
  );
  return arquivo;
}

// ── APLICAR: 1 transação — wipe do destino + recria a partir da origem com ids novos e
// mapas idOrigem→idDestino. Qualquer erro (inclusive um vínculo que não resolve em algum
// mapa) joga uma exceção dentro do callback → Prisma desfaz TUDO (nenhuma escrita parcial).
async function aplicarEspelhamento(origem) {
  garantirEscritaSoNoDestino();

  const resumo = await prisma.$transaction(
    async (tx) => {
      // (1) WIPE — só empresa 45, só estas 4 tabelas, nesta ordem (dependentes primeiro).
      const apagouVinculos = await tx.clienteProduto.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouLocais = await tx.localEntrega.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouClientes = await tx.customerProfile.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouProdutos = await tx.product.deleteMany({ where: { companyId: DESTINO_COMPANY_ID, usaLogistica: true } });

      // (2) LogisticaConfig do destino só precisa EXISTIR — nunca tocamos em campo
      // nenhum se já existir (em especial agendaV2Ativa, que é decisão à parte do dono).
      await tx.logisticaConfig.upsert({
        where: { companyId: DESTINO_COMPANY_ID },
        update: {},
        create: { companyId: DESTINO_COMPANY_ID },
      });

      // (3) PRODUTOS — id novo (Int autoincrement é GLOBAL; o id da origem já é de OUTRA
      // linha, da empresa 41). Guarda mapa productId(origem) → productId(destino).
      const mapaProduto = new Map();
      for (const p of origem.produtos) {
        const { id: idOrigem, ...campos } = p;
        const criado = await tx.product.create({ data: { ...campos, companyId: DESTINO_COMPANY_ID } });
        mapaProduto.set(idOrigem, criado.id);
      }

      // (4) CLIENTES — id novo (cuid é GLOBAL). Guarda mapa customerProfileId(origem) →
      // customerProfileId(destino).
      const mapaCliente = new Map();
      for (const c of origem.clientes) {
        const { id: idOrigem, ...campos } = c;
        const criado = await tx.customerProfile.create({ data: { ...campos, companyId: DESTINO_COMPANY_ID } });
        mapaCliente.set(idOrigem, criado.id);
      }

      // (5) LOCAIS — remapeia customerProfileId pro id NOVO do cliente (nunca o da
      // origem). Guarda mapa localId(origem) → localId(destino) pro passo (6).
      const mapaLocal = new Map();
      for (const l of origem.locais) {
        const { id: idOrigem, customerProfileId: clienteIdOrigem, ...campos } = l;
        const clienteIdDestino = mapaCliente.get(clienteIdOrigem);
        if (!clienteIdDestino) {
          throw new Error(`Integridade: LocalEntrega ${idOrigem} referencia customerProfileId ${clienteIdOrigem} que não foi copiado.`);
        }
        const criado = await tx.localEntrega.create({
          data: { ...campos, companyId: DESTINO_COMPANY_ID, customerProfileId: clienteIdDestino },
        });
        mapaLocal.set(idOrigem, criado.id);
      }

      // (6) VÍNCULO CLIENTE↔PRODUTO — a agenda que o André já ajustou (diasSemana,
      // proximaData, frequenciaDias). Remapeia os 3 ids (cliente/produto/local) pros
      // NOVOS ids do destino; aborta a transação inteira se algum não resolver.
      let vinculosCriados = 0;
      for (const cp of origem.clienteProdutos) {
        const { id: idOrigem, customerProfileId: clienteIdOrigem, productId: produtoIdOrigem, localId: localIdOrigem, ...campos } = cp;
        const clienteIdDestino = mapaCliente.get(clienteIdOrigem);
        const produtoIdDestino = mapaProduto.get(produtoIdOrigem);
        if (!clienteIdDestino || !produtoIdDestino) {
          throw new Error(
            `Integridade: ClienteProduto ${idOrigem} referencia cliente/produto que não foi copiado ` +
              `(cliente=${clienteIdOrigem}→${clienteIdDestino ?? 'FALTA'}, produto=${produtoIdOrigem}→${produtoIdDestino ?? 'FALTA'}).`,
          );
        }
        const localIdDestino = localIdOrigem ? mapaLocal.get(localIdOrigem) : null;
        if (localIdOrigem && !localIdDestino) {
          throw new Error(`Integridade: ClienteProduto ${idOrigem} referencia localId ${localIdOrigem} que não foi copiado.`);
        }
        await tx.clienteProduto.create({
          data: {
            ...campos,
            companyId: DESTINO_COMPANY_ID,
            customerProfileId: clienteIdDestino,
            productId: produtoIdDestino,
            localId: localIdDestino,
          },
        });
        vinculosCriados++;
      }

      return {
        apagou: {
          clienteProdutos: apagouVinculos.count,
          locais: apagouLocais.count,
          clientes: apagouClientes.count,
          produtos: apagouProdutos.count,
        },
        criou: {
          produtos: mapaProduto.size,
          clientes: mapaCliente.size,
          locais: mapaLocal.size,
          clienteProdutos: vinculosCriados,
        },
      };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  return resumo;
}

// ── ROLLBACK: apaga o que o --aplicar criou (estado ATUAL do destino, nas 4 tabelas) e
// devolve exatamente as linhas do backup (mesmos ids, mesmos valores, inclusive
// createdAt/updatedAt originais). NÃO toca em LogisticaConfig (nunca foi alterada) nem
// nas tabelas de risco-cascata (nunca foram lidas — ver aviso no cabeçalho do arquivo).
async function rollback(arquivo) {
  garantirEscritaSoNoDestino();

  const caminho = path.isAbsolute(arquivo) ? arquivo : path.resolve(process.cwd(), arquivo);
  const dump = JSON.parse(fs.readFileSync(caminho, 'utf8'));

  if (Number(dump.destino) !== DESTINO_COMPANY_ID) {
    throw new Error(
      `Backup é de destino=${dump.destino}, mas este script está travado em DESTINO_COMPANY_ID=${DESTINO_COMPANY_ID}. Abortando rollback.`,
    );
  }

  const DATE_FIELDS_CLIENTE = ['firstInboundAt', 'lastInboundAt', 'botOffAt', 'createdAt', 'updatedAt'];
  const DATE_FIELDS_LOCAL = ['createdAt', 'updatedAt'];
  const DATE_FIELDS_PRODUTO = ['sourceUpdatedAt', 'createdAt', 'updatedAt'];
  const DATE_FIELDS_CLIENTE_PRODUTO = ['proximaData', 'createdAt', 'updatedAt'];

  function reviverDatas(row, campos) {
    const copia = { ...row };
    for (const campo of campos) {
      if (copia[campo]) copia[campo] = new Date(copia[campo]);
    }
    return copia;
  }

  const resumo = await prisma.$transaction(
    async (tx) => {
      const apagouVinculos = await tx.clienteProduto.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouLocais = await tx.localEntrega.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouClientes = await tx.customerProfile.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouProdutos = await tx.product.deleteMany({ where: { companyId: DESTINO_COMPANY_ID, usaLogistica: true } });

      for (const p of dump.produtos || []) {
        await tx.product.create({ data: reviverDatas(p, DATE_FIELDS_PRODUTO) });
      }
      for (const c of dump.clientes || []) {
        await tx.customerProfile.create({ data: reviverDatas(c, DATE_FIELDS_CLIENTE) });
      }
      for (const l of dump.locais || []) {
        await tx.localEntrega.create({ data: reviverDatas(l, DATE_FIELDS_LOCAL) });
      }
      for (const cp of dump.clienteProdutos || []) {
        await tx.clienteProduto.create({ data: reviverDatas(cp, DATE_FIELDS_CLIENTE_PRODUTO) });
      }

      return {
        apagou: {
          clienteProdutos: apagouVinculos.count,
          locais: apagouLocais.count,
          clientes: apagouClientes.count,
          produtos: apagouProdutos.count,
        },
        restaurou: {
          produtos: (dump.produtos || []).length,
          clientes: (dump.clientes || []).length,
          locais: (dump.locais || []).length,
          clienteProdutos: (dump.clienteProdutos || []).length,
        },
      };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  log(`ROLLBACK aplicado a partir de ${caminho}:`);
  log(`  apagou  : ${JSON.stringify(resumo.apagou)}`);
  log(`  restaurou: ${JSON.stringify(resumo.restaurou)}`);
}

async function main() {
  garantirEscritaSoNoDestino();

  if (ROLLBACK_FILE) {
    await rollback(ROLLBACK_FILE);
    return;
  }

  const [empresaOrigem, empresaDestino] = await Promise.all([
    prisma.company.findUnique({ where: { id: ORIGEM_COMPANY_ID }, select: { id: true, name: true } }),
    prisma.company.findUnique({ where: { id: DESTINO_COMPANY_ID }, select: { id: true, name: true } }),
  ]);
  if (!empresaOrigem) throw new Error(`Empresa origem ${ORIGEM_COMPANY_ID} não encontrada — abortando.`);
  if (!empresaDestino) throw new Error(`Empresa destino ${DESTINO_COMPANY_ID} não encontrada — abortando.`);

  const origem = await coletarOrigem();
  const destinoAtual = await coletarDestinoAtual();
  const risco = await contarRiscoCascata(prisma, DESTINO_COMPANY_ID);

  imprimirPlano({ origem, destinoAtual, risco, empresas: { origem: empresaOrigem, destino: empresaDestino } });

  if (!APLICAR) {
    return;
  }

  // Backup ANTES de qualquer escrita — mesmo se a transação abaixo falhar, o backup já
  // está em disco (não faz mal: só significa que não era necessário desta vez).
  const backupFile = await gravarBackup(destinoAtual);
  log(`backup gravado: ${backupFile}`);
  log('');

  const resumo = await aplicarEspelhamento(origem);

  log('APLICADO:');
  log(`  apagou (destino, antes de copiar): ${JSON.stringify(resumo.apagou)}`);
  log(`  criou  (espelho da origem)       : ${JSON.stringify(resumo.criou)}`);
  log(`rollback: node scripts/espelhar-logistica-tenant.js --rollback=${backupFile}`);
}

main()
  .catch((e) => {
    console.error('ERRO:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
