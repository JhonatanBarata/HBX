'use strict';

// ============================================================================
// FREIO DE DISCO DO PUBLISH — fonte ÚNICA da faxina pós-deploy (05/08/2026).
// ============================================================================
// O QUE ACONTECEU: todo publish builda na VPS e nunca limpava. Em ~3 meses isso
// virou 33,73 GB de cache de build (425 entradas) + 31,91 GB de imagens órfãs —
// 65 dos 162 GB do disco. A VPS bateu 84% e ninguém soube; o dono descobriu por
// acaso num brainstorm sobre outro assunto.
//
// A regra da casa: "bug que gera X → a correção é o FREIO, nunca tapar o
// sintoma da vez". Faxina à mão sem freio é sintoma tapado — em 3 meses enche
// de novo. Então o próprio publish limpa o que o próprio publish sujou.
//
// POR QUE MORA AQUI E NÃO NOS DOIS DEPLOYS: existem dois caminhos que buildam
// na VPS (scripts/ops/deploy-vps.js, o `npm run publish` de hoje, e
// scripts/deploy-hostinger.js, o caminho legado/force). Dois freios diferentes
// dariam dois comportamentos diferentes pro MESMO problema — "padronizar =
// igualar". Um módulo, um teto, um log.
//
// ---------------------------------------------------------------------------
// O TETO DO CACHE — 15 GB (HBX_PUBLISH_BUILD_CACHE_KEEP_GB)
// ---------------------------------------------------------------------------
// Prune cego (`docker builder prune -af`, o que o caminho legado fazia) troca
// "disco cheio" por "publish lento": zera o cache e o build seguinte recompila
// tudo. O dono publica várias vezes por dia — isso é caro. Então o corte é por
// TETO, não por tudo:
//   • um ciclo completo (backend NestJS + frontend Next + webscraping + engine
//     Python) gira em ~5-8 GB de cache útil; 15 GB guarda ~2 ciclos, então o
//     build seguinte continua quente;
//   • o pior caso do disco deixa de ser INFINITO e passa a ser 15 GB fixos;
//   • folga deliberada pra rodada mensal da RFB (timer hbx-rfb-monthly, próxima
//     em 16/08): ela precisa de ~7 GB de download + ~25 GB de staging no
//     Postgres. Com o cache travado em 15 GB, a rodada cabe sem aperto.
//
// ---------------------------------------------------------------------------
// AS IMAGENS — dangling, e só as com mais de 48h
// ---------------------------------------------------------------------------
// HBX_PUBLISH_IMAGE_PRUNE_UNTIL_H (default 48). Depois do `--force-recreate` a
// imagem anterior perde a tag (fica dangling): o filtro de 48h preserva
// justamente ela — o rollback rápido da janela recente — e remove as camadas
// velhas. Nunca `-a`: `-a` levaria imagem COM tag que só não tem container de
// pé (é o que o `npm run docker:clean:vps` faz, e por isso ele exige o
// hbx-backend rodando antes).
//
// ---------------------------------------------------------------------------
// GARANTIAS (o que este freio NUNCA faz)
// ---------------------------------------------------------------------------
//   • não toca em VOLUME nenhum: `docker volume prune` mataria o
//     hbx_postgres_data (76 GB, o banco de produção) se ele aparecesse sem link
//     por um instante. Volume não entra, nem com filtro;
//   • não reinicia container, nem o dockerd;
//   • não derruba o publish: roda como ÚLTIMO passo, depois dos health-waits, e
//     cada comando termina em `|| true`. Publish verde com faxina falhada é ok;
//     publish vermelho por causa da faxina, não;
//   • LOGA o antes e o depois (`df -hP /` + `docker system df`) — freio
//     silencioso que apaga coisa é pior que disco cheio.
//
// Desligar num publish específico: HBX_PUBLISH_SKIP_CLEANUP=1 npm run publish
// ============================================================================

const DEFAULT_KEEP_GB = 15;
const DEFAULT_IMAGE_UNTIL_HOURS = 48;

function envOn(name) {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function envPositiveInt(name, fallback, min = 1) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= min ? Math.trunc(parsed) : fallback;
}

function resolveDiskGuardConfig() {
  const keepGb = envPositiveInt('HBX_PUBLISH_BUILD_CACHE_KEEP_GB', DEFAULT_KEEP_GB);
  return {
    skipped: envOn('HBX_PUBLISH_SKIP_CLEANUP'),
    keepGb,
    // Bytes puros em vez de "15GB": elimina o risco de o docker de plantão não
    // aceitar o sufixo e o comando morrer por sintaxe.
    keepBytes: keepGb * 1024 * 1024 * 1024,
    imageUntilHours: envPositiveInt('HBX_PUBLISH_IMAGE_PRUNE_UNTIL_H', DEFAULT_IMAGE_UNTIL_HOURS),
  };
}

/**
 * Linhas de shell da faxina, pra concatenar no FIM do script remoto do deploy.
 * Todas idempotentes e todas com `|| true`.
 */
function buildDiskGuardShellLines() {
  const config = resolveDiskGuardConfig();
  if (config.skipped) {
    return ['echo "[faxina] pulada por HBX_PUBLISH_SKIP_CLEANUP=1 — o disco vai crescer neste publish."'];
  }

  return [
    'echo ""',
    'echo "[faxina] ===== FREIO DE DISCO DO PUBLISH ====="',
    'echo "[faxina] ANTES:"',
    'df -hP / || true',
    'docker system df || true',
    `echo "[faxina] cache de build: mantendo ate ${config.keepGb} GB (o excedente sai; o build segue quente)."`,
    `docker builder prune -f --keep-storage ${config.keepBytes} || true`,
    `echo "[faxina] imagens orfas (dangling) com mais de ${config.imageUntilHours}h — a anterior fica pro rollback."`,
    `docker image prune -f --filter "until=${config.imageUntilHours}h" || true`,
    'echo "[faxina] DEPOIS:"',
    'df -hP / || true',
    'docker system df || true',
    'echo "[faxina] volumes e banco INTOCADOS (volume nunca entra em prune)."',
    'echo "[faxina] ===== fim ====="',
  ];
}

module.exports = {
  DEFAULT_KEEP_GB,
  DEFAULT_IMAGE_UNTIL_HOURS,
  resolveDiskGuardConfig,
  buildDiskGuardShellLines,
};
