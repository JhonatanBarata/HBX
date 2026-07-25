'use strict';

/**
 * BACKFILL DE PINO SUSPEITO (25/07) — rescaldo do incidente da empresa 41
 * ("Terra Hydra Mary": endereço na Rua 12/Jd. Consolação, pino a 2.991 m, na "Rua Doze"
 * do Jardim Olinda). O freio do geocode (nucleo-geo.util.ts) impede que isso NASÇA de
 * novo; este script trata o que já está gravado.
 *
 * Duas passadas, nesta ordem:
 *
 *  A) RECONCILIAR — onde a porta REAL já é conhecida (`geoFonte='gps_entrega'`, GPS de
 *     ouro do entregador na porta), propaga a coordenada entre PERFIL e LOCAL PRINCIPAL.
 *     É o conserto retroativo do bug que a correção de hoje mata na origem: a
 *     realimentação escrevia só um dos dois lados e a leitura (`local ?? perfil`) usava
 *     o outro. Nada é inventado aqui — só se copia GPS de porta real.
 *
 *  B) LIMPAR — apaga o pino PROVADAMENTE mentiroso, virando pendência "GPS" no card
 *     (a 1ª entrega grava a porta real, agora que (A) e o fix do serviço funcionam):
 *       · `geoFonte='cidade'`  → centro do município. Nunca foi endereço: na empresa 41
 *         eram 45 clientes empilhados no MESMO ponto (-22.3984,-47.5546).
 *       · `geoFonte='geocode'` cujo pino é compartilhado por endereços de BAIRROS (ou
 *         cidades) DIFERENTES → prova documental de que o geocode ignorou o endereço.
 *
 *  O que NÃO se toca, de propósito:
 *   · `gps_cadastro` (o dono apertou "Usar este local" — decisão humana) e `gps_entrega`;
 *   · pino compartilhado por endereços do MESMO bairro/rua (centroide de via: números
 *     diferentes da mesma rua). É aproximado, mas aponta pra rua certa e ainda serve pra
 *     ordenar a rota — e a 1ª entrega refina pro número exato. Tirar isso seria trocar
 *     um erro de uma quadra por um cliente sem pino nenhum.
 *   Quem quiser a varredura dura (todo pino compartilhado, mesmo do mesmo bairro) roda
 *   com `--estrito`.
 *
 * USO (dry-run é o DEFAULT — não escreve nada sem `--apply`):
 *   node scripts/backfill-pinos-suspeitos.js                    # relatório, todas as empresas
 *   node scripts/backfill-pinos-suspeitos.js --company=41       # só uma empresa
 *   node scripts/backfill-pinos-suspeitos.js --company=41 --apply
 *   node scripts/backfill-pinos-suspeitos.js --apply --estrito
 *
 * Antes de escrever, grava BACKUP JSON (id + coordenada + fonte de cada linha tocada)
 * em `backfill-pinos-YYYYMMDDHHmmss.json` no diretório de trabalho. O rollback é o
 * próprio arquivo: `--rollback=<arquivo>` devolve linha por linha ao valor anterior.
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ESTRITO = args.includes('--estrito');
const companyArg = args.find((a) => a.startsWith('--company='));
const COMPANY_ID = companyArg ? Number(companyArg.split('=')[1]) : null;
const rollbackArg = args.find((a) => a.startsWith('--rollback='));

const FONTES_INTOCAVEIS = ['gps_cadastro', 'gps_entrega'];

function log(...a) {
  console.log(...a);
}

function normalize(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const whereCompany = (alias) => (COMPANY_ID ? `AND ${alias}."companyId" = ${Number(COMPANY_ID)}` : '');

// ── (A) RECONCILIAR perfil ↔ local principal usando a porta real ───────────────
async function coletarReconciliacoes() {
  // perfil TEM gps_entrega e o local principal está em palpite → local recebe a porta.
  const localRecebe = await prisma.$queryRawUnsafe(`
    SELECT l.id AS "localId", l.lat AS "latAntes", l.lng AS "lngAntes", l."geoFonte" AS "fonteAntes",
           c.lat AS "latNova", c.lng AS "lngNova", c.name AS nome, l."companyId"
    FROM "LocalEntrega" l
    JOIN "CustomerProfile" c ON c.id = l."customerProfileId"
    WHERE l.ativo = true AND l."isPrincipal" = true
      AND c."geoFonte" = 'gps_entrega' AND c.lat IS NOT NULL AND c.lng IS NOT NULL
      AND (l."geoFonte" IS NULL OR l."geoFonte" IN ('geocode','cidade'))
      ${whereCompany('l')}`);

  // o espelho: o local principal tem a porta real e o PERFIL está em palpite.
  const perfilRecebe = await prisma.$queryRawUnsafe(`
    SELECT c.id AS "contaId", c.lat AS "latAntes", c.lng AS "lngAntes", c."geoFonte" AS "fonteAntes",
           l.lat AS "latNova", l.lng AS "lngNova", c.name AS nome, c."companyId"
    FROM "CustomerProfile" c
    JOIN "LocalEntrega" l ON l."customerProfileId" = c.id AND l.ativo = true AND l."isPrincipal" = true
    WHERE l."geoFonte" = 'gps_entrega' AND l.lat IS NOT NULL AND l.lng IS NOT NULL
      AND (c."geoFonte" IS NULL OR c."geoFonte" IN ('geocode','cidade'))
      ${whereCompany('c')}`);

  return { localRecebe, perfilRecebe };
}

// ── (B) LIMPAR pino provadamente mentiroso ────────────────────────────────────
// Um pino é suspeito quando é `cidade` (centro do município) ou quando o MESMO ponto
// serve endereços de bairros/cidades diferentes (o geocode ignorou o endereço).
// `--estrito` amplia pra qualquer ponto repetido.
function sqlSuspeitos(tabela, alias, extraJoin = '') {
  const criterioCompartilhado = ESTRITO
    ? 'p.n > 1'
    : 'p.n > 1 AND (p.bairros_distintos > 1 OR p.cidades_distintas > 1)';
  return `
    WITH pinos AS (
      SELECT "companyId", lat, lng, count(*) AS n,
             count(DISTINCT lower(btrim(coalesce(bairro, '')))) FILTER (WHERE btrim(coalesce(bairro,'')) <> '') AS bairros_distintos,
             count(DISTINCT lower(btrim(coalesce(cidade, '')))) FILTER (WHERE btrim(coalesce(cidade,'')) <> '') AS cidades_distintas
      FROM "${tabela}"
      WHERE lat IS NOT NULL AND lng IS NOT NULL AND "geoFonte" = 'geocode'
      GROUP BY 1, 2, 3
    )
    SELECT ${alias}.id, ${alias}."companyId", ${alias}.lat, ${alias}.lng, ${alias}."geoFonte",
           ${alias}.endereco, ${alias}.bairro, ${alias}.cidade, 'pino_compartilhado' AS motivo
    FROM "${tabela}" ${alias}
    JOIN pinos p ON p."companyId" = ${alias}."companyId" AND p.lat = ${alias}.lat AND p.lng = ${alias}.lng
    ${extraJoin}
    WHERE ${alias}."geoFonte" = 'geocode' AND ${criterioCompartilhado}
      ${whereCompany(alias)}
    UNION ALL
    SELECT ${alias}.id, ${alias}."companyId", ${alias}.lat, ${alias}.lng, ${alias}."geoFonte",
           ${alias}.endereco, ${alias}.bairro, ${alias}.cidade, 'centro_da_cidade' AS motivo
    FROM "${tabela}" ${alias}
    ${extraJoin}
    WHERE ${alias}."geoFonte" = 'cidade' AND ${alias}.lat IS NOT NULL
      ${whereCompany(alias)}`;
}

async function coletarSuspeitos() {
  const locais = await prisma.$queryRawUnsafe(sqlSuspeitos('LocalEntrega', 'l'));
  const perfis = await prisma.$queryRawUnsafe(sqlSuspeitos('CustomerProfile', 'c'));
  return { locais, perfis };
}

function resumoPorEmpresa(rows) {
  const por = new Map();
  for (const r of rows) {
    const k = Number(r.companyId);
    por.set(k, (por.get(k) || 0) + 1);
  }
  return [...por.entries()].sort((a, b) => b[1] - a[1]);
}

async function rollback(arquivo) {
  const dump = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  let n = 0;
  for (const r of dump.locais || []) {
    await prisma.localEntrega.update({
      where: { id: r.id },
      data: { lat: r.lat, lng: r.lng, geoFonte: r.geoFonte },
    });
    n++;
  }
  for (const r of dump.perfis || []) {
    await prisma.customerProfile.update({
      where: { id: r.id },
      data: { lat: r.lat, lng: r.lng, geoFonte: r.geoFonte },
    });
    n++;
  }
  log(`rollback aplicado: ${n} linhas voltaram ao valor anterior (${arquivo})`);
}

async function main() {
  if (rollbackArg) {
    await rollback(rollbackArg.split('=')[1]);
    return;
  }

  const { localRecebe, perfilRecebe } = await coletarReconciliacoes();
  const { locais, perfis } = await coletarSuspeitos();

  log('');
  log(`== BACKFILL DE PINO SUSPEITO ${APPLY ? '(APLICANDO)' : '(DRY-RUN — nada é escrito)'} ==`);
  log(`escopo: ${COMPANY_ID ? `empresa ${COMPANY_ID}` : 'TODAS as empresas'} · modo: ${ESTRITO ? 'ESTRITO' : 'conservador'}`);
  log('');
  log('(A) RECONCILIAR com a porta real (GPS de entrega já conhecido):');
  log(`    · locais que recebem a porta do perfil : ${localRecebe.length}`);
  log(`    · perfis que recebem a porta do local  : ${perfilRecebe.length}`);
  for (const r of localRecebe.slice(0, 10)) {
    const metros = Math.round(
      111320 *
        Math.sqrt(
          Math.pow(Number(r.latAntes ?? r.latNova) - Number(r.latNova), 2) +
            Math.pow((Number(r.lngAntes ?? r.lngNova) - Number(r.lngNova)) * Math.cos((Number(r.latNova) * Math.PI) / 180), 2),
        ),
    );
    log(`      - ${r.nome}: local saía ${metros} m da porta real`);
  }
  log('');
  log('(B) LIMPAR pino mentiroso (vira pendência "GPS"):');
  log(`    · LocalEntrega   : ${locais.length}  ${JSON.stringify(resumoPorEmpresa(locais))}`);
  log(`    · CustomerProfile: ${perfis.length}  ${JSON.stringify(resumoPorEmpresa(perfis))}`);
  const porMotivo = (rows) =>
    rows.reduce((acc, r) => ((acc[r.motivo] = (acc[r.motivo] || 0) + 1), acc), {});
  log(`    · motivos (locais): ${JSON.stringify(porMotivo(locais))}`);
  log(`    · motivos (perfis): ${JSON.stringify(porMotivo(perfis))}`);
  log('');

  if (!APPLY) {
    log('DRY-RUN: nada foi escrito. Rode de novo com --apply pra valer.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupFile = path.resolve(process.cwd(), `backfill-pinos-${stamp}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        escopo: COMPANY_ID ?? 'todas',
        modo: ESTRITO ? 'estrito' : 'conservador',
        // BACKUP = estado ANTES (o rollback devolve exatamente isto).
        locais: [
          ...locais.map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, geoFonte: r.geoFonte })),
          ...localRecebe.map((r) => ({ id: r.localId, lat: r.latAntes, lng: r.lngAntes, geoFonte: r.fonteAntes })),
        ],
        perfis: [
          ...perfis.map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, geoFonte: r.geoFonte })),
          ...perfilRecebe.map((r) => ({ id: r.contaId, lat: r.latAntes, lng: r.lngAntes, geoFonte: r.fonteAntes })),
        ],
      },
      null,
      2,
    ),
  );
  log(`backup gravado: ${backupFile}`);

  // (A) primeiro: resgata o que a porta real já sabe…
  let nReconc = 0;
  for (const r of localRecebe) {
    await prisma.localEntrega.update({
      where: { id: r.localId },
      data: { lat: r.latNova, lng: r.lngNova, geoFonte: 'gps_entrega' },
    });
    nReconc++;
  }
  for (const r of perfilRecebe) {
    await prisma.customerProfile.update({
      where: { id: r.contaId },
      data: { lat: r.latNova, lng: r.lngNova, geoFonte: 'gps_entrega' },
    });
    nReconc++;
  }

  // …(B) depois limpa o resto. Ordem importa: o alvo de (A) sai de 'geocode'/'cidade'
  // e portanto já não é candidato de (B) — a lista de (B) foi coletada antes, então o
  // filtro explícito de fonte intocável abaixo é o cinto de segurança.
  let nLimpos = 0;
  for (const r of locais) {
    const res = await prisma.localEntrega.updateMany({
      where: { id: r.id, geoFonte: { notIn: FONTES_INTOCAVEIS } },
      data: { lat: null, lng: null, geoFonte: null },
    });
    nLimpos += res.count;
  }
  for (const r of perfis) {
    const res = await prisma.customerProfile.updateMany({
      where: { id: r.id, geoFonte: { notIn: FONTES_INTOCAVEIS } },
      data: { lat: null, lng: null, geoFonte: null },
    });
    nLimpos += res.count;
  }

  log(`APLICADO: ${nReconc} linhas reconciliadas com a porta real · ${nLimpos} pinos mentirosos viraram pendência.`);
  log(`rollback: node scripts/backfill-pinos-suspeitos.js --rollback=${backupFile}`);
}

main()
  .catch((e) => {
    console.error('ERRO:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
