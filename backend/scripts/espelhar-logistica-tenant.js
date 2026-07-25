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
 *   · CustomerProfile (isCliente=true OU tem pelo menos 1 ClienteProduto) — nome/
 *     telefone/documento/endereço/geo/contrato de cobrança por cliente. O critério NÃO
 *     é só isCliente=true: achado em dry-run real (25/07) mostrou perfis com
 *     isCliente=false que têm ClienteProduto e por isso ENTRAM na Agenda V2 do André —
 *     filtrar só por isCliente deixava vínculo órfão e a conta espelhada com menos
 *     planos que a do André (mesmo espírito do critério já usado pra Product, abaixo).
 *     NÃO copiado: sourceConnectionId/externalSource/externalCustomerId (integração é
 *     por-conexão, não existe em 45), firstInboundAt/lastInboundAt/botOff* (rastro de
 *     conversa/bot — fora do escopo "cadastro").
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
 *
 * ⚠️ FIX 25/07 — LIMPEZA DO DESTINO BARRADA POR FK (achado em --aplicar real): apagar
 * CustomerProfile cascateia pra Entrega, mas várias tabelas de ROTA/AGENDA referenciam
 * Entrega/CustomerProfile/LocalEntrega/Product com FK `onDelete: Restrict` — o Postgres
 * BARRA a limpeza em vez de arrastar (erro real: `LogisticaRouteStop_deliveryId_
 * companyId_fkey`). Mapeei TODA @relation do schema.prisma que aponta pra essas 4
 * tabelas (conferido contra a migration SQL real, não só o schema.prisma) — a lista
 * completa das 15 tabelas bloqueantes e a ordem topológica de exclusão vivem em
 * `CADEIA_BLOQUEIO` (logo abaixo). Resumo da cadeia (folha → raiz): LogisticaTrackingPoint/
 * TrackingEvent/TrackedCreditClaim/RouteStop (bloqueiam Entrega) → LogisticaTrackingSession/
 * EssentialCreditClaim/Route (agora livres) → EntregaComprovante/EntregaItem (filhos de
 * Entrega) → Entrega → LogisticaRotaModeloParadaItem/RotaModeloParada/RotaModelo e
 * LogisticaPlanoEntregaItem/PlanoEntrega (bloqueiam CustomerProfile/LocalEntrega, e
 * dependiam de Entrega já ter sumido). Estas 15 tabelas usam chave composta
 * `[id, companyId]` no schema — mas como aqui elas são só APAGADAS/RESTAURADAS por id
 * (nunca remapeadas pra um id novo), a composição não exige tratamento especial:
 * o backup guarda a linha inteira e o rollback recria com o MESMO id original.
 *
 * BACKUP/ROLLBACK — mesmo contrato do backfill-pinos-suspeitos.js, agora cobrindo as 4
 * tabelas de cadastro + as 15 da cadeia-bloqueio (19 no total): ANTES de qualquer escrita,
 * o estado ATUAL da empresa 45 (linha completa de cada uma) é gravado em JSON em
 * /app/storage/espelhar-logistica-<timestamp>.json. `--rollback=<arquivo>` apaga o que
 * este script criou e devolve exatamente essas linhas (mesmos ids, mesmos valores —
 * inclusive createdAt/updatedAt originais). DUAS exceções de fidelidade, ditas explícito
 * no plano do dry-run (não silenciadas): (1) EntregaComprovante volta só como metadata —
 * o ARQUIVO físico (foto/assinatura) em disco não é copiado nem restaurado; (2) Entrega
 * volta com `contatoId=null` — Contato não é backupado (é destruído via cascade do
 * CustomerProfile, ver risco abaixo) e o rollback não tem como saber se o Contato
 * original ainda existiria.
 *
 * ⚠️ CASCATA DO BANCO (fora do escopo deste script, não backupado, não restaurado):
 * apagar CustomerProfile/LocalEntrega/Product ainda dispara `onDelete: Cascade`/`SetNull`
 * do Postgres em tabelas que continuam FORA do escopo "cadastro de logística" — Contato,
 * ClienteHistorico, DebtCase, RecoveryDebtItem (DESTRUÍDOS via cascade) e VendasLead,
 * FinanceiroCharge, CompanyConversation, AtendimentoCustomer, HbxRecoveryCustomer
 * (sobrevivem, só perdem o vínculo via SetNull), além de ProductVersion e
 * RecoveryDebtItemProduct (DESTRUÍDOS via cascade, side-effect de apagar Product) — SE a
 * empresa 45 já tiver linhas nelas hoje. O plano (dry-run) IMPRIME a contagem de cada uma
 * e diz explicitamente qual é destruída vs. qual só desvincula, antes de qualquer
 * `--aplicar`; o `--rollback` NÃO as restaura. Ver RELATÓRIO.
 *
 * IDEMPOTENTE: cada `--aplicar` APAGA a empresa 45 (cadeia-bloqueio + as 4 tabelas de
 * cadastro) e recria a partir da 41 — rodar 2× seguidas dá o mesmo ESTADO (mesmos dados;
 * os ids internos mudam a cada rodada, isso é esperado num espelhamento por overwrite,
 * não um sync incremental).
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
// 25/07 21h: o dono APAGOU a conta 45 e recriou como 48 (jbinformatica1100@gmail.com,
// ADMIN id 58). Destino atualizado — a 45 não existe mais no banco.
const DESTINO_COMPANY_ID = 48; // conta de teste do dono, recriada.
const STORAGE_DIR = '/app/storage';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
// --sem-limpar: NÃO apaga nada no destino, só injeta o cadastro da origem. Use quando o
// dono já limpou a conta na mão — evita a cadeia de FK (LogisticaRouteStop → Entrega etc.)
// que é o único motivo de o wipe ser complicado. Sem limpeza não há o que backupear:
// o rollback deste modo é simplesmente apagar o que foi injetado.
const SEM_LIMPAR = args.includes('--sem-limpar');
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

// ── FIX 25/07 (achado em --aplicar real, coordenador): apagar CustomerProfile cascateia
// pra Entrega, mas várias tabelas de ROTA/AGENDA referenciam Entrega/CustomerProfile/
// LocalEntrega/Product com FK `onDelete: Restrict` (não Cascade) — o Postgres BARRA a
// limpeza em vez de arrastar. O erro real foi `LogisticaRouteStop_deliveryId_companyId_
// fkey`. Mapeei TODA @relation do schema.prisma que aponta pra Entrega/CustomerProfile/
// LocalEntrega/Product (todas as ocorrências de "Entrega @relation", "CustomerProfile
// @relation", "LocalEntrega @relation", "Product @relation") e conferi o onDelete de cada
// uma contra a migration SQL real (não só o schema, pra não confiar em default implícito
// errado). Resultado — SÓ estas 15 tabelas têm FK Restrict nessa direção; todas as outras
// (Contato, DebtCase, VendasLead, FinanceiroCharge, ClienteHistorico, CompanyConversation,
// AtendimentoCustomer, HbxRecoveryCustomer, RecoveryDebtItem, RecoveryDebtItemProduct,
// ProductVersion) são Cascade ou SetNull — não bloqueiam, só aparecem no risco-cascata
// abaixo (informativo, fora do backup, como já era).
//
// ORDEM: da mais dependente (folha) pra menos dependente (raiz) — é a ordem de APAGAR.
// A ordem de RESTAURAR (rollback) é o INVERSO exato desta lista (raiz primeiro, folha
// por último) — verificado à mão que o inverso é uma ordem de inserção válida (todo FK
// obrigatório de cada tabela já foi recriado por uma entrada anterior na lista invertida).
//
//   1-4  bloqueiam Entrega (Restrict em deliveryId): TrackingPoint, TrackingEvent,
//        TrackedCreditClaim, RouteStop — folhas, sem filhos, sem ordem entre si.
//   5-7  agora seguros (filhos já foram embora): TrackingSession, EssentialCreditClaim,
//        Route — nenhum bloqueia Entrega/CustomerProfile/LocalEntrega diretamente, mas
//        fazem parte da "cadeia de logística" que o dono autorizou apagar por completo.
//   8-9  filhos diretos de Entrega (Cascade — não bloqueiam, mas entram no backup pra
//        restaurar com fidelidade): EntregaComprovante, EntregaItem.
//   10   Entrega — agora que 1-4 sumiram, nada mais restringe a deleção.
//   11-13 bloqueiam LogisticaPlanoEntrega/CustomerProfile/LocalEntrega (RotaModeloParada
//        tem Restrict em customerProfileId/localId/planoEntregaId): RotaModeloParadaItem,
//        RotaModeloParada, RotaModelo (RotaModelo só é liberado depois que Entrega, no
//        passo 10, parou de referenciá-lo via rotaModeloOrigem, também Restrict).
//   14-15 bloqueiam CustomerProfile/LocalEntrega diretamente (Restrict em
//        customerProfileId/localId) e também dependiam de Entrega (planoEntregaOrigem,
//        Restrict) já ter sumido no passo 10: PlanoEntregaItem, PlanoEntrega.
//
// Depois disto, ClienteProduto/LocalEntrega/CustomerProfile/Product (as 4 tabelas
// originais de cadastro) ficam livres pra apagar sem violação de FK.
const CADEIA_BLOQUEIO = [
  { chave: 'trackingPoints', modelo: 'logisticaTrackingPoint', where: (id) => ({ companyId: id }) },
  { chave: 'trackingEvents', modelo: 'logisticaTrackingEvent', where: (id) => ({ companyId: id }) },
  { chave: 'trackedCreditClaims', modelo: 'logisticaTrackedCreditClaim', where: (id) => ({ companyId: id }) },
  { chave: 'routeStops', modelo: 'logisticaRouteStop', where: (id) => ({ companyId: id }) },
  { chave: 'trackingSessions', modelo: 'logisticaTrackingSession', where: (id) => ({ companyId: id }) },
  { chave: 'essentialCreditClaims', modelo: 'logisticaEssentialCreditClaim', where: (id) => ({ companyId: id }) },
  { chave: 'routes', modelo: 'logisticaRoute', where: (id) => ({ companyId: id }) },
  { chave: 'entregaComprovantes', modelo: 'entregaComprovante', where: (id) => ({ companyId: id }) },
  // EntregaItem NÃO tem coluna companyId própria (só entregaId) — filtra pela empresa
  // da Entrega via relação.
  { chave: 'entregaItens', modelo: 'entregaItem', where: (id) => ({ entrega: { companyId: id } }) },
  { chave: 'entregas', modelo: 'entrega', where: (id) => ({ companyId: id }) },
  { chave: 'rotaModeloParadaItens', modelo: 'logisticaRotaModeloParadaItem', where: (id) => ({ companyId: id }) },
  { chave: 'rotaModeloParadas', modelo: 'logisticaRotaModeloParada', where: (id) => ({ companyId: id }) },
  { chave: 'rotaModelos', modelo: 'logisticaRotaModelo', where: (id) => ({ companyId: id }) },
  { chave: 'planoEntregaItens', modelo: 'logisticaPlanoEntregaItem', where: (id) => ({ companyId: id }) },
  { chave: 'planoEntregas', modelo: 'logisticaPlanoEntrega', where: (id) => ({ companyId: id }) },
];

// Converte string ISO-8601 completa (a forma que JSON.stringify dá a um Date real) de
// volta pra Date, campo por campo, SEM precisar listar à mão o nome de cada coluna
// DateTime de cada uma das 19 tabelas envolvidas — genérico e à prova de o schema ganhar
// uma coluna nova amanhã. Datas "curtas" (routeDate 'YYYY-MM-DD', diasSemana '1,3,5') não
// batem o regex (falta o "THH:MM:SS"), então não são tocadas por engano.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function reviverDatas(row) {
  const copia = {};
  for (const [k, v] of Object.entries(row)) {
    copia[k] = typeof v === 'string' && ISO_DATETIME_RE.test(v) ? new Date(v) : v;
  }
  return copia;
}

// Estado ATUAL da cadeia-bloqueio no destino (o que existe hoje em 45) — mesmo espírito
// de coletarDestinoAtual: isto vira backup e é o que será apagado.
async function coletarCadeiaBloqueioDestino(client) {
  const resultado = {};
  for (const t of CADEIA_BLOQUEIO) {
    resultado[t.chave] = await client[t.modelo].findMany({ where: t.where(DESTINO_COMPANY_ID) });
  }
  return resultado;
}

// Apaga a cadeia-bloqueio inteira, na ordem (folha → raiz) declarada em CADEIA_BLOQUEIO.
// Retorna a contagem por tabela pro resumo do --aplicar.
async function apagarCadeiaBloqueio(tx) {
  const contagens = {};
  for (const t of CADEIA_BLOQUEIO) {
    const r = await tx[t.modelo].deleteMany({ where: t.where(DESTINO_COMPANY_ID) });
    contagens[t.chave] = r.count;
  }
  return contagens;
}

// Restaura a cadeia-bloqueio a partir do backup, na ordem INVERSA (raiz → folha, senão
// os FKs obrigatórios de cada linha não resolveriam). `entregas` tem uma exceção: força
// contatoId=null — Contato não é backupado por este script (fora de escopo; cai no
// "risco de cascata"), então o Contato original pode não existir mais pra a Entrega
// restaurada apontar. Ver aviso explícito no plano do dry-run.
async function restaurarCadeiaBloqueio(tx, backup) {
  const contagens = {};
  for (const t of [...CADEIA_BLOQUEIO].reverse()) {
    const linhas = backup[t.chave] || [];
    for (const row of linhas) {
      const dados = reviverDatas(row);
      if (t.chave === 'entregas') dados.contatoId = null;
      await tx[t.modelo].create({ data: dados });
    }
    contagens[t.chave] = linhas.length;
  }
  return contagens;
}

// ── Tabelas fora do escopo de cópia, dependentes de CustomerProfile/LocalEntrega/Product
// via onDelete:Cascade (ou destruídas indiretamente por eles) — se a empresa 45 já tiver
// linhas aqui, apagar o cadastro arrasta elas junto, DE CALÇAS ARRIADAS: fora do nosso
// backup, o --rollback NÃO as restaura. `entrega` SAIU desta lista (25/07) — agora é
// backupada/restaurada de verdade via CADEIA_BLOQUEIO. Só CONTAMOS pra avisar no plano;
// não lemos linha nem restauramos no rollback. `contatos`/`debtCases`/`clienteHistoricos`/
// `recoveryDebtItems`/`productVersoes`/`recoveryDebtItemProdutos` são DESTRUÍDOS (Cascade);
// os demais SOBREVIVEM desvinculados (SetNull) — distinção explícita no plano.
async function contarRiscoCascata(client, companyId, produtoIdsDestino) {
  const [
    contatos,
    debtCases,
    vendasLeads,
    clienteHistoricos,
    financeiroCharges,
    recoveryDebtItems,
    conversations,
    atendimentoCustomers,
    hbxRecoveryCustomers,
    productVersoes,
    recoveryDebtItemProdutos,
  ] = await Promise.all([
    client.contato.count({ where: { companyId } }).catch(() => 0),
    client.debtCase.count({ where: { companyId } }).catch(() => 0),
    client.vendasLead.count({ where: { companyId } }).catch(() => 0),
    client.clienteHistorico.count({ where: { companyId } }).catch(() => 0),
    client.financeiroCharge.count({ where: { companyId } }).catch(() => 0),
    client.recoveryDebtItem.count({ where: { companyId } }).catch(() => 0),
    client.companyConversation.count({ where: { companyId } }).catch(() => 0),
    client.atendimentoCustomer.count({ where: { companyId } }).catch(() => 0),
    client.hbxRecoveryCustomer.count({ where: { companyId } }).catch(() => 0),
    produtoIdsDestino.length
      ? client.productVersion.count({ where: { productId: { in: produtoIdsDestino } } }).catch(() => 0)
      : 0,
    produtoIdsDestino.length
      ? client.recoveryDebtItemProduct.count({ where: { productId: { in: produtoIdsDestino } } }).catch(() => 0)
      : 0,
  ]);
  return {
    contatos, // DESTRUÍDO (Cascade)
    debtCases, // DESTRUÍDO (Cascade)
    vendasLeads, // sobrevive desvinculado (SetNull)
    clienteHistoricos, // DESTRUÍDO (Cascade)
    financeiroCharges, // sobrevive desvinculado (SetNull)
    recoveryDebtItems, // DESTRUÍDO (Cascade)
    conversations, // sobrevive desvinculado (SetNull)
    atendimentoCustomers, // sobrevive desvinculado (SetNull)
    hbxRecoveryCustomers, // sobrevive desvinculado (SetNull)
    productVersoes, // DESTRUÍDO (Cascade, side-effect do apagar Product)
    recoveryDebtItemProdutos, // DESTRUÍDO (Cascade, side-effect do apagar Product)
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
  // FIX 25/07 (achado em dry-run real, coordenador): Agenda V2 gera plano a partir de
  // QUALQUER CustomerProfile com ClienteProduto — não só isCliente=true. Na empresa 41
  // existem perfis com isCliente=false que TÊM vínculo (e entram na agenda do André).
  // Filtrar só por isCliente deixava esses vínculos órfãos de propósito — a conta
  // espelhada saía com menos planos que a do André, quebrando a regra nº1 do dono
  // ("EU QUERO VER O Q O ANDRÉ VAI VER AMANHÃ"). Mesmo espírito do critério já usado
  // pra Product (usaLogistica=true OU referenciado por um vínculo copiado): aqui,
  // isCliente=true OU tem pelo menos 1 ClienteProduto.
  //
  // Por isso a ordem de leitura é invertida: primeiro TODOS os vínculos da empresa 41
  // (sem filtrar por cliente), depois os perfis (isCliente OU aparece nesses vínculos).
  const todosVinculosOrigem = await prisma.clienteProduto.findMany({
    where: { companyId: ORIGEM_COMPANY_ID },
    select: SELECT_CLIENTE_PRODUTO,
    orderBy: { id: 'asc' },
  });
  const clienteIdsComVinculo = [...new Set(todosVinculosOrigem.map((cp) => cp.customerProfileId))];

  const clientes = await prisma.customerProfile.findMany({
    where: {
      companyId: ORIGEM_COMPANY_ID,
      OR: [{ isCliente: true }, { id: { in: clienteIdsComVinculo } }],
    },
    select: SELECT_CLIENTE,
    orderBy: { id: 'asc' },
  });
  const clienteIds = clientes.map((c) => c.id);
  const clienteIdSet = new Set(clienteIds);

  const locais = await prisma.localEntrega.findMany({
    where: { companyId: ORIGEM_COMPANY_ID, customerProfileId: { in: clienteIds } },
    select: SELECT_LOCAL,
    orderBy: { id: 'asc' },
  });

  // Todo customerProfileId citado por um vínculo da 41 devia estar em `clientes` — o OR
  // acima inclui explicitamente esses ids. Se algum não aparecer (não deveria acontecer;
  // só se o dado da origem já estivesse inconsistente — ex.: vínculo com companyId=41
  // mas customerProfileId de OUTRA empresa), o vínculo fica de fora aqui (não é copiado
  // torto) e o plano REPORTA a contagem pra investigar antes de --aplicar.
  const clienteProdutos = todosVinculosOrigem.filter((cp) => clienteIdSet.has(cp.customerProfileId));
  const vinculosOrfaos = todosVinculosOrigem.length - clienteProdutos.length;

  const productIdsVinculados = [...new Set(clienteProdutos.map((cp) => cp.productId))];
  const produtos = await prisma.product.findMany({
    where: {
      companyId: ORIGEM_COMPANY_ID,
      OR: [{ usaLogistica: true }, { id: { in: productIdsVinculados } }],
    },
    select: SELECT_PRODUTO,
    orderBy: { id: 'asc' },
  });

  return {
    clientes,
    locais,
    clienteProdutos,
    produtos,
    totalVinculosOrigem: todosVinculosOrigem.length,
    vinculosOrfaos,
  };
}

// Estado ATUAL do destino — é isto que vira backup, e é isto que será apagado.
async function coletarDestinoAtual() {
  const clientes = await prisma.customerProfile.findMany({ where: { companyId: DESTINO_COMPANY_ID } });
  const locais = await prisma.localEntrega.findMany({ where: { companyId: DESTINO_COMPANY_ID } });
  const clienteProdutos = await prisma.clienteProduto.findMany({ where: { companyId: DESTINO_COMPANY_ID } });
  const produtos = await prisma.product.findMany({ where: { companyId: DESTINO_COMPANY_ID, usaLogistica: true } });
  const cadeiaBloqueio = await coletarCadeiaBloqueioDestino(prisma);
  return { clientes, locais, clienteProdutos, produtos, cadeiaBloqueio };
}

function imprimirPlano({ origem, destinoAtual, risco, empresas }) {
  log('');
  log(`== ESPELHAMENTO DE LOGÍSTICA ${APLICAR ? '(APLICANDO)' : '(DRY-RUN — nada é escrito)'} ==`);
  log(`origem  : empresa ${ORIGEM_COMPANY_ID} "${empresas.origem?.name ?? '???'}" (SOMENTE LEITURA)`);
  log(`destino : empresa ${DESTINO_COMPANY_ID} "${empresas.destino?.name ?? '???'}"`);
  log('');
  log('vai COPIAR da origem:');
  log(`  · CustomerProfile (isCliente=true OU com ClienteProduto) : ${origem.clientes.length}`);
  log(`  · LocalEntrega                     : ${origem.locais.length}`);
  log(`  · Product (usaLogistica/vinculado) : ${origem.produtos.length}`);
  log(`  · ClienteProduto (vínculo cliente↔produto, com diasSemana/proximaData) : ${origem.clienteProdutos.length}`);
  log('');
  log('conferência da aritmética (vínculos) — precisa bater ANTES de --aplicar:');
  log(`  · total de ClienteProduto na empresa ${ORIGEM_COMPANY_ID} (sem filtrar por cliente) : ${origem.totalVinculosOrigem}`);
  log(`  · vínculos que SERÃO copiados                                          : ${origem.clienteProdutos.length}`);
  if (origem.vinculosOrfaos > 0) {
    log(`  ⚠️  vínculos ÓRFÃOS (customerProfileId não resolveu em nenhum perfil da empresa ${ORIGEM_COMPANY_ID}) : ${origem.vinculosOrfaos}`);
    log('      Razão provável: dado pré-existente inconsistente na origem (ClienteProduto.companyId=41 mas');
    log('      customerProfileId aponta pra um perfil de outra empresa — a FK do schema não é composta aqui,');
    log('      então o Postgres não impede isso). Estes NÃO são copiados (evita vínculo torto no destino).');
    log('      PARE e confirme com o dono antes de --aplicar se isto não é esperado.');
  } else {
    log('  ✓ total origem === vínculos copiados (nenhum vínculo ficou de fora).');
  }
  log('');
  log('vai APAGAR no destino, NA ORDEM (backup completo de cada linha ANTES de apagar):');
  log('  -- cadeia de rota/agenda que BLOQUEIA a limpeza do cadastro (FK Restrict; achado em');
  log('     --aplicar real de 25/07 — ver cabeçalho do arquivo) — backupada e restaurável --');
  const cb = destinoAtual.cadeiaBloqueio;
  const rotulos = {
    trackingPoints: 'LogisticaTrackingPoint',
    trackingEvents: 'LogisticaTrackingEvent',
    trackedCreditClaims: 'LogisticaTrackedCreditClaim',
    routeStops: 'LogisticaRouteStop',
    trackingSessions: 'LogisticaTrackingSession',
    essentialCreditClaims: 'LogisticaEssentialCreditClaim',
    routes: 'LogisticaRoute',
    entregaComprovantes: 'EntregaComprovante',
    entregaItens: 'EntregaItem',
    entregas: 'Entrega',
    rotaModeloParadaItens: 'LogisticaRotaModeloParadaItem',
    rotaModeloParadas: 'LogisticaRotaModeloParada',
    rotaModelos: 'LogisticaRotaModelo',
    planoEntregaItens: 'LogisticaPlanoEntregaItem',
    planoEntregas: 'LogisticaPlanoEntrega',
  };
  let totalCadeia = 0;
  for (const t of CADEIA_BLOQUEIO) {
    const n = cb[t.chave].length;
    totalCadeia += n;
    log(`  ${String(n).padStart(4)}  · ${rotulos[t.chave]}`);
  }
  if (totalCadeia === 0) {
    log('     (vazio — nada de rota/agenda hoje na empresa 45; a limpeza do cadastro não deve bloquear.)');
  }
  log('  -- as 4 tabelas de cadastro (motivo original deste script) --');
  log(`  ${String(destinoAtual.clienteProdutos.length).padStart(4)}  · ClienteProduto`);
  log(`  ${String(destinoAtual.locais.length).padStart(4)}  · LocalEntrega`);
  log(`  ${String(destinoAtual.clientes.length).padStart(4)}  · CustomerProfile`);
  log(`  ${String(destinoAtual.produtos.length).padStart(4)}  · Product (usaLogistica)`);
  log('');
  log('fidelidade do --rollback nesta cadeia nova — 2 exceções conhecidas, ditas explícito:');
  log('  · EntregaComprovante: a LINHA do banco volta (metadata), mas o ARQUIVO físico (foto/');
  log('    assinatura) em disco NÃO é copiado nem restaurado por este script — só a metadata.');
  log('  · Entrega.contatoId: se a Entrega original tinha um Contato vinculado (quem recebe),');
  log('    o rollback recria a Entrega SEM esse vínculo (contatoId volta null) — Contato não é');
  log('    backupado (cai no risco de cascata abaixo, é destruído com o CustomerProfile e este');
  log('    script não traz ele de volta).');
  log('');
  const riscoTotal = totalRisco(risco);
  if (riscoTotal > 0) {
    log(`⚠️  RISCO DE CASCATA no destino (empresa ${DESTINO_COMPANY_ID}) — fora do backup deste script,`);
    log('    o --rollback NÃO restaura nada disto:');
    const destruido = new Set(['contatos', 'debtCases', 'clienteHistoricos', 'recoveryDebtItems', 'productVersoes', 'recoveryDebtItemProdutos']);
    for (const [k, v] of Object.entries(risco)) {
      if (v > 0) log(`      - ${k}: ${v}  (${destruido.has(k) ? 'DESTRUÍDO — cascade' : 'sobrevive desvinculado — SetNull'})`);
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
        // Cadeia de rota/agenda que bloqueia a limpeza (FIX 25/07) — chaves
        // trackingPoints/trackingEvents/.../planoEntregas, uma por tabela de
        // CADEIA_BLOQUEIO. Ver restaurarCadeiaBloqueio() pro contrato do rollback.
        ...destinoAtual.cadeiaBloqueio,
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
      // (0) CADEIA-BLOQUEIO primeiro — FIX 25/07: sem isto, o deleteMany de CustomerProfile
      // abaixo bate em `LogisticaRouteStop_deliveryId_companyId_fkey` (e outras Restrict)
      // e o Postgres barra a transação inteira. Ordem topológica em CADEIA_BLOQUEIO.
      const apagouCadeia = SEM_LIMPAR ? {} : await apagarCadeiaBloqueio(tx);

      // (1) WIPE — só empresa 45, só estas 4 tabelas, nesta ordem (dependentes primeiro).
      // Agora seguro: a cadeia acima já removeu tudo que restringia CustomerProfile/
      // LocalEntrega/Product (LogisticaPlanoEntrega/LogisticaRotaModeloParada).
      // Em --sem-limpar nada é apagado: o destino já foi limpo à mão pelo dono.
      const vazio = { count: 0 };
      const apagouVinculos = SEM_LIMPAR ? vazio : await tx.clienteProduto.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouLocais = SEM_LIMPAR ? vazio : await tx.localEntrega.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouClientes = SEM_LIMPAR ? vazio : await tx.customerProfile.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouProdutos = SEM_LIMPAR ? vazio : await tx.product.deleteMany({ where: { companyId: DESTINO_COMPANY_ID, usaLogistica: true } });

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
        apagouCadeia,
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
    // FIX 25/07 — a cadeia-bloqueio pode incluir centenas de LogisticaTrackingPoint (GPS
    // por segundo de rota rastreada); tempo aumentado de 120s pra 300s de folga.
    { timeout: 300_000, maxWait: 20_000 },
  );

  return resumo;
}

// ── ROLLBACK: apaga o estado ATUAL do destino (a cadeia-bloqueio primeiro, mesma ordem
// do --aplicar — o destino pode ter ganhado rota/tracking novos desde o mirror) e devolve
// exatamente as linhas do backup (mesmos ids, mesmos valores, inclusive createdAt/
// updatedAt originais). NÃO toca em LogisticaConfig (nunca foi alterada) nem nas tabelas
// de risco-cascata (nunca foram lidas — ver aviso no cabeçalho do arquivo). Exceção de
// fidelidade conhecida: Entrega volta com contatoId=null (ver restaurarCadeiaBloqueio).
async function rollback(arquivo) {
  garantirEscritaSoNoDestino();

  const caminho = path.isAbsolute(arquivo) ? arquivo : path.resolve(process.cwd(), arquivo);
  const dump = JSON.parse(fs.readFileSync(caminho, 'utf8'));

  if (Number(dump.destino) !== DESTINO_COMPANY_ID) {
    throw new Error(
      `Backup é de destino=${dump.destino}, mas este script está travado em DESTINO_COMPANY_ID=${DESTINO_COMPANY_ID}. Abortando rollback.`,
    );
  }

  const resumo = await prisma.$transaction(
    async (tx) => {
      // Mesma ordem do --aplicar: cadeia-bloqueio primeiro (senão o deleteMany de
      // CustomerProfile abaixo pode bater na mesma FK Restrict que motivou este fix).
      const apagouCadeia = await apagarCadeiaBloqueio(tx);

      const apagouVinculos = await tx.clienteProduto.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouLocais = await tx.localEntrega.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouClientes = await tx.customerProfile.deleteMany({ where: { companyId: DESTINO_COMPANY_ID } });
      const apagouProdutos = await tx.product.deleteMany({ where: { companyId: DESTINO_COMPANY_ID, usaLogistica: true } });

      for (const p of dump.produtos || []) {
        await tx.product.create({ data: reviverDatas(p) });
      }
      for (const c of dump.clientes || []) {
        await tx.customerProfile.create({ data: reviverDatas(c) });
      }
      for (const l of dump.locais || []) {
        await tx.localEntrega.create({ data: reviverDatas(l) });
      }
      for (const cp of dump.clienteProdutos || []) {
        await tx.clienteProduto.create({ data: reviverDatas(cp) });
      }

      // Cadeia-bloqueio por último — todo FK obrigatório dela (customerProfileId,
      // localId, productId, planoEntregaId, rotaModeloId, deliveryId...) já foi
      // recriado acima com o MESMO id original.
      const restaurouCadeia = await restaurarCadeiaBloqueio(tx, dump);

      return {
        apagouCadeia,
        apagou: {
          clienteProdutos: apagouVinculos.count,
          locais: apagouLocais.count,
          clientes: apagouClientes.count,
          produtos: apagouProdutos.count,
        },
        restaurouCadeia,
        restaurou: {
          produtos: (dump.produtos || []).length,
          clientes: (dump.clientes || []).length,
          locais: (dump.locais || []).length,
          clienteProdutos: (dump.clienteProdutos || []).length,
        },
      };
    },
    // FIX 25/07 — a cadeia-bloqueio pode incluir centenas de LogisticaTrackingPoint (GPS
    // por segundo de rota rastreada); tempo aumentado de 120s pra 300s de folga.
    { timeout: 300_000, maxWait: 20_000 },
  );

  log(`ROLLBACK aplicado a partir de ${caminho}:`);
  log(`  apagou (cadeia) : ${JSON.stringify(resumo.apagouCadeia)}`);
  log(`  apagou (cadastro): ${JSON.stringify(resumo.apagou)}`);
  log(`  restaurou (cadastro): ${JSON.stringify(resumo.restaurou)}`);
  log(`  restaurou (cadeia)  : ${JSON.stringify(resumo.restaurouCadeia)}`);
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
  const produtoIdsDestino = destinoAtual.produtos.map((p) => p.id);
  const risco = await contarRiscoCascata(prisma, DESTINO_COMPANY_ID, produtoIdsDestino);

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
  log(`  apagou (cadeia bloqueio, antes do cadastro): ${JSON.stringify(resumo.apagouCadeia)}`);
  log(`  apagou (destino, antes de copiar)          : ${JSON.stringify(resumo.apagou)}`);
  log(`  criou  (espelho da origem)                 : ${JSON.stringify(resumo.criou)}`);
  log(`rollback: node scripts/espelhar-logistica-tenant.js --rollback=${backupFile}`);
}

main()
  .catch((e) => {
    console.error('ERRO:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
