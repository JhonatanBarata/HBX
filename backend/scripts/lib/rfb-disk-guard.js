'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// FREIO DO DISCO DA RFB — os ZIPs da Receita não moram na VPS (05/08/2026).
// ============================================================================
// O QUE ACONTECEU: o timer systemd `hbx-rfb-monthly` roda dia 15 de cada mês,
// baixa ~7 GB de zips da Receita pra /root/hbx-data/rfb/<AAAA-MM>/ e NUNCA
// apagava nada. Vazamento medido: ~7 GB/mês, para sempre. Em 05/08/2026 a pasta
// 2026-07 tinha 7,2 GB de arquivo já importado, parado, sem ninguém lendo — e a
// VPS estava em 84% de disco.
//
// A regra da casa: "bug que gera X → a correção é o FREIO, nunca tapar o
// sintoma da vez". Apagar 2026-07 à mão é o sintoma; sem este freio a pasta
// 2026-08 nasce em 16/08 e o vazamento recomeça.
//
// POR QUE APAGAR É SEGURO: o zip é fonte FRIA e RECONSTRUÍVEL — vive no share
// da Receita e o download é retomável (curl -C - + conferência de tamanho). O
// ativo é o resultado da carga (CnpjPublicCompany etc.), não o zip.
//
// A CONDIÇÃO É O SUCESSO — é o coração do freio, e ela mora em QUEM CHAMA.
//
// ⚠️ ARMADILHA PEGA NA REVISÃO (05/08): não basta chamar isto "depois do
// verifyAcceptance()" do importador. Aquele aceite NÃO REPROVA — foi conferido
// linha por linha e tem ZERO `throw`: ele mede e loga ("OK <500ms",
// "ATENCAO <7") e segue em frente de qualquer jeito. Uma carga com 0 empresa
// passaria batido e a fonte dos 7 GB seria apagada em cima de uma base vazia —
// a armadilha do CNEFE ("best-effort que engole erro precisa de alarme") quase
// entrando junto com o conserto.
//
// Por isso o importador confere NÚMERO antes de chamar aqui
// (`loadLooksHealthy()`: fases do ledger concluídas + piso de linhas na tabela
// final). Quem for reusar este módulo em outro job precisa fazer o mesmo: a
// condição é uma medida, nunca um log. Se a limpeza rodasse independente do
// resultado, uma carga torta perderia a fonte — no melhor caso 7 GB de
// re-download, no pior uma base pela metade sem como reconstruir.
//
// TETO EXPLÍCITO (HBX_RFB_KEEP_MONTHS, default 0):
//   0 = não guarda mês nenhum (o do aceite sai também — default, porque o share
//       da Receita é a fonte e o download é retomável);
//   1 = guarda o mês que acabou de entrar; 2 = ele e o anterior; etc.
// O corte é sempre pelos meses MAIS RECENTES (nome AAAA-MM é ordenável).
//
// SEMPRE LOGA O QUE REMOVEU, com tamanho e contagem — freio silencioso que
// apaga coisa é pior que disco cheio. E tem `dryRun` de verdade: em dry-run
// calcula e reporta exatamente o mesmo, sem tocar em disco.
// ============================================================================

function resolveKeepMonths(env = process.env) {
  const parsed = Number(env.HBX_RFB_KEEP_MONTHS);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

/** Meses AAAA-MM presentes no diretório base, do mais recente pro mais antigo. */
function listMonthDirs(baseDir) {
  if (!fs.existsSync(baseDir)) return [];
  return fs
    .readdirSync(baseDir)
    .filter((name) => /^\d{4}-\d{2}$/.test(name))
    .filter((name) => {
      try { return fs.statSync(path.join(baseDir, name)).isDirectory(); } catch { return false; }
    })
    .sort()
    .reverse();
}

/** Bytes e nº de arquivos de um diretório (1 nível — os zips são planos). */
function measureDir(dir) {
  let bytes = 0;
  let files = 0;
  try {
    for (const entry of fs.readdirSync(dir)) {
      try {
        const stat = fs.statSync(path.join(dir, entry));
        if (stat.isFile()) { bytes += stat.size; files += 1; }
      } catch { /* arquivo sumiu no meio da conta */ }
    }
  } catch { /* pasta ilegível: reporta 0 e segue */ }
  return { bytes, files };
}

/**
 * PLANO da retenção (puro: não toca em disco além de ler metadados).
 * Devolve o que ficaria e o que sairia, com tamanhos.
 */
function planRfbRetention(baseDir, options = {}) {
  const keepMonths = options.keepMonths != null ? Math.max(0, Math.trunc(options.keepMonths)) : resolveKeepMonths();
  const months = listMonthDirs(baseDir);
  const keep = months.slice(0, keepMonths);
  const keepSet = new Set(keep);
  const remove = months
    .filter((month) => !keepSet.has(month))
    .map((month) => {
      const dir = path.join(baseDir, month);
      const { bytes, files } = measureDir(dir);
      return { month, dir, bytes, files };
    });
  return {
    baseDir,
    keepMonths,
    keep,
    remove,
    freedBytes: remove.reduce((sum, item) => sum + item.bytes, 0),
  };
}

function gb(bytes) {
  return (bytes / 1024 / 1024 / 1024).toFixed(2);
}

/**
 * Aplica (ou simula) a retenção. `log` é injetável pra teste.
 * NUNCA lança: quem chama já mediu a saúde da carga antes de chegar aqui, e uma
 * faxina que falhou não pode invalidar uma carga boa. Mas GRITA no log —
 * silêncio aqui seria repetir a armadilha do CNEFE.
 */
function pruneRfbDownloads(baseDir, options = {}) {
  const log = options.log || ((message) => console.log(message));
  const dryRun = Boolean(options.dryRun);
  const currentMonth = options.currentMonth || null;
  const prefix = dryRun ? '[freio-disco][DRY-RUN]' : '[freio-disco]';

  try {
    const plan = planRfbRetention(baseDir, options);
    const keptLabel = plan.keep.join(', ') || 'nenhum';

    if (!plan.remove.length) {
      log(`${prefix} nada a limpar em ${plan.baseDir} (guardando ${plan.keepMonths} mes(es): ${keptLabel})`);
      return { ...plan, applied: false, dryRun };
    }

    for (const item of plan.remove) {
      const tag = item.month === currentMonth ? ' (mes desta carga; ja importado e aceito)' : ' (mes antigo)';
      log(`${prefix} ${dryRun ? 'apagaria' : 'apagado'} ${item.dir} — ${item.files} arquivo(s), ${gb(item.bytes)} GB${tag}`);
      if (!dryRun) fs.rmSync(item.dir, { recursive: true, force: true });
    }
    log(
      `${prefix} total ${dryRun ? 'que sairia' : 'liberado'}: ${gb(plan.freedBytes)} GB · ` +
        `guardando ${plan.keepMonths} mes(es): ${keptLabel} (env HBX_RFB_KEEP_MONTHS)`,
    );
    return { ...plan, applied: !dryRun, dryRun };
  } catch (error) {
    log(
      `${prefix} ATENCAO: limpeza dos zips FALHOU (${String((error && error.message) || error)}). ` +
        `Os ~7 GB do mes ficaram no disco — apague a mao: rm -rf ${baseDir}/<AAAA-MM>`,
    );
    return { baseDir, keepMonths: resolveKeepMonths(), keep: [], remove: [], freedBytes: 0, applied: false, dryRun, error: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A GUARDA DURA — decide se a carga está saudável o bastante pra perder a fonte
// ─────────────────────────────────────────────────────────────────────────────
// Mora aqui (e não solta no importador) por dois motivos: é a decisão mais
// perigosa de todo o freio, e é PURA se as leituras entrarem como dependência —
// logo, testável sem banco. O importador injeta `psqlValue`/`ledgerDone`.
//
// Regra: as DUAS condições são obrigatórias.
//   1. as fases que produzem a base terminaram (ledger do mês);
//   2. a tabela final tem pelo menos `minCompanies` linhas.
// Falhando qualquer uma — ou falhando a própria conferência — devolve false.
// "Não consegui conferir" NUNCA é o mesmo que "está tudo bem": guardar 7 GB é
// barato, perder a fonte de uma carga quebrada custa uma re-importação inteira.
const REQUIRED_LEDGER_STEPS = ['transform:companies', 'transform:create_indexes'];
const DEFAULT_MIN_COMPANIES = 20_000_000;

function resolveMinCompanies(env = process.env) {
  const parsed = Number(env.HBX_RFB_MIN_COMPANIES);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : DEFAULT_MIN_COMPANIES;
}

function evaluateLoadHealth(month, deps = {}) {
  const log = deps.log || ((message) => console.log(message));
  const minCompanies = deps.minCompanies != null ? Math.trunc(deps.minCompanies) : resolveMinCompanies();

  try {
    const missing = REQUIRED_LEDGER_STEPS.filter((step) => !deps.ledgerDone(month, step));
    if (missing.length) {
      log(`[freio-disco] zips MANTIDOS: fase(s) sem conclusao no ledger de ${month}: ${missing.join(', ')}.`);
      log('[freio-disco] a carga nao terminou — a fonte fica no disco pra retomar sem re-baixar 7 GB.');
      return { healthy: false, reason: 'ledger_incompleto', missing };
    }

    const companies = Number(deps.countCompanies());
    if (!Number.isFinite(companies) || companies < minCompanies) {
      const shown = Number.isFinite(companies) ? companies.toLocaleString('pt-BR') : '?';
      log(
        `[freio-disco] zips MANTIDOS: CnpjPublicCompany tem ${shown} linhas, ` +
          `abaixo do piso de ${minCompanies.toLocaleString('pt-BR')} (env HBX_RFB_MIN_COMPANIES).`,
      );
      log('[freio-disco] carga suspeita — NAO vou apagar a fonte. Confira o log acima e rode de novo com --no-download.');
      return { healthy: false, reason: 'poucas_linhas', companies: Number.isFinite(companies) ? companies : null };
    }

    log(
      `[freio-disco] carga saudavel: ${companies.toLocaleString('pt-BR')} empresas ` +
        `(piso ${minCompanies.toLocaleString('pt-BR')}) — liberado apagar os zips.`,
    );
    return { healthy: true, reason: 'ok', companies };
  } catch (error) {
    log(`[freio-disco] zips MANTIDOS: nao consegui conferir a saude da carga (${String((error && error.message) || error)}).`);
    return { healthy: false, reason: 'conferencia_falhou' };
  }
}

module.exports = {
  resolveKeepMonths,
  listMonthDirs,
  measureDir,
  planRfbRetention,
  pruneRfbDownloads,
  REQUIRED_LEDGER_STEPS,
  DEFAULT_MIN_COMPANIES,
  resolveMinCompanies,
  evaluateLoadHealth,
};
