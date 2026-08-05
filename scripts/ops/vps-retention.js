'use strict';

// ============================================================================
// RETENÇÃO DA VPS — o freio dos arquivos que ninguém apaga (05/08/2026).
// ============================================================================
// O QUE ACONTECEU: a VPS de produção chegou a 162 GB de 194 GB (84%) e ninguém
// soube. Parte da sujeira era backup sem prazo de validade: tarballs de
// 02/05/2026 (~1 GB) ainda no /root em agosto, mais pastas de backup ad-hoc
// criadas à mão por operações antigas (clone de empresa, pré-migration,
// pareamento do Google) que nunca tiveram dono nem data de morte.
//
// "Backup sem retenção é disco cheio garantido" — só que o produtor aqui não é
// um script: são operações manuais via SSH, cada uma criando sua pasta. Não há
// um lugar único onde pendurar o freio. Então o freio é este VARREDOR, com teto
// explícito por categoria.
//
// ---------------------------------------------------------------------------
// AS 3 REGRAS QUE ESTE SCRIPT NUNCA QUEBRA
// ---------------------------------------------------------------------------
// 1. DRY-RUN É O DEFAULT. Rodar sem argumento nenhum não apaga nada: lista o
//    que sairia, com tamanho. Apagar exige `--apply` explícito.
// 2. TETO EXPLÍCITO POR CATEGORIA. Nenhuma categoria tem "apaga tudo que for
//    velho": cada uma diz quantos itens ficam. Sem teto, um bug de data apaga
//    a coleção inteira.
// 3. LOGA CADA REMOÇÃO, com caminho e tamanho. Freio silencioso que apaga
//    coisa é pior que disco cheio.
//
// ---------------------------------------------------------------------------
// O QUE ESTE SCRIPT NÃO FAZ (de propósito)
// ---------------------------------------------------------------------------
//   • não toca em Docker (isso é do freio do publish: scripts/lib/vps-disk-guard.js);
//   • não toca em volume, banco, container nem serviço;
//   • não mexe no journal (o journald já tem SystemMaxUse=1G na VPS desde
//     04/05 e ele FUNCIONA — medido em 05/08: 200 MB de 1 GB);
//   • não apaga NADA fora das categorias listadas em CATEGORIES;
//   • não instala cron/timer sozinho. Ver "AGENDAMENTO" no fim.
//
// USO
//   node scripts/ops/vps-retention.js                 # dry-run (default)
//   node scripts/ops/vps-retention.js --apply         # aplica a retenção
//   node scripts/ops/vps-retention.js --json          # saída pra máquina
// ============================================================================

const path = require('path');
const { loadEnvFromFiles, repoRoot, requireEnv } = require('../lib/runtime');

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// AS CATEGORIAS E SEUS TETOS
// ---------------------------------------------------------------------------
// `keep` = quantos itens MAIS RECENTES ficam (por mtime). Os números são
// deliberadamente conservadores: o objetivo é travar o crescimento, não
// esvaziar o disco. Quem quiser mais agressivo mexe aqui, num lugar só.
const CATEGORIES = [
  {
    id: 'tarballs-root',
    label: 'tarballs de backup soltos em /root (HBX_FULL_* / HBX_BACKUP_*)',
    // Estes eram os grandes: ~1 GB de 02/05/2026 parados até agosto.
    // keep 1 = a cópia mais nova sobrevive; o histórico sai.
    keep: 1,
    kind: 'glob',
    // `find -maxdepth 1` pra não descer em /root inteiro.
    findArgs: "/root -maxdepth 1 \\( -name 'HBX_FULL_*' -o -name 'HBX_BACKUP_*' \\)",
  },
  {
    id: 'hbx-backups',
    label: 'pastas/arquivos de backup ad-hoc em /root/hbx-backups',
    keep: 4,
    kind: 'children',
    dir: '/root/hbx-backups',
  },
  {
    id: 'HBX-backups',
    label: 'pastas de backup em /root/HBX-backups',
    keep: 2,
    kind: 'children',
    dir: '/root/HBX-backups',
  },
  {
    id: 'hbx-hotfix-backups',
    label: 'pastas de backup de hotfix em /root/hbx-hotfix-backups',
    keep: 2,
    kind: 'children',
    dir: '/root/hbx-hotfix-backups',
  },
  {
    id: 'nginx-backups',
    label: 'cópias de configuração do nginx em /root/nginx-backups',
    // Config é texto (KB): o teto aqui é higiene, não espaço.
    keep: 3,
    kind: 'children',
    dir: '/root/nginx-backups',
  },
  {
    id: 'rfb-months',
    label: 'meses de zips da RFB em /root/hbx-data/rfb (rede de segurança)',
    // O freio de verdade dos zips mora no importador
    // (backend/scripts/lib/rfb-disk-guard.js), condicionado ao SUCESSO da carga.
    // Esta categoria é só a rede: pega o caso de a carga ter morrido no meio e
    // deixado o mês para trás. keep 1 nunca tira o mês corrente.
    keep: 1,
    kind: 'children',
    dir: '/root/hbx-data/rfb',
    childPattern: '^[0-9]{4}-[0-9]{2}$',
  },
];

function parseArgs(argv) {
  const args = argv.slice(2).map((value) => String(value || '').trim().toLowerCase());
  return {
    apply: args.includes('--apply'),
    json: args.includes('--json'),
  };
}

function loadOperationsEnv() {
  return {
    ...loadEnvFromFiles([
      path.join(repoRoot, '.env.production.local'),
      path.join(repoRoot, '.env.ops.local'),
      path.join(repoRoot, '.env.operations.local'),
      path.join(repoRoot, '.env.ops-control'),
    ]),
    ...process.env,
  };
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Script remoto que INVENTARIA (nunca apaga) cada categoria.
 * Saída por linha: <categoria>\t<mtime epoch>\t<bytes>\t<caminho>
 */
function buildInventoryScript() {
  const lines = ['set -u'];
  for (const category of CATEGORIES) {
    if (category.kind === 'glob') {
      lines.push(
        `find ${category.findArgs} -printf '${category.id}\\t%T@\\t%s\\t%p\\n' 2>/dev/null || true`,
      );
    } else {
      // Filhos de 1º nível (pasta ou arquivo). `du -sb` pra pasta ter tamanho real.
      const patternFilter = category.childPattern
        ? ` | grep -E ${shellSingleQuote(`/(${category.childPattern.replace(/^\^|\$$/g, '')})$`)}`
        : '';
      lines.push(
        `if [ -d ${shellSingleQuote(category.dir)} ]; then ` +
          `find ${shellSingleQuote(category.dir)} -mindepth 1 -maxdepth 1 -printf '%T@\\t%p\\n' 2>/dev/null${patternFilter} ` +
          `| while IFS=$'\\t' read -r mt p; do ` +
          `sz=$(du -sb "$p" 2>/dev/null | cut -f1); ` +
          `printf '${category.id}\\t%s\\t%s\\t%s\\n' "$mt" "\${sz:-0}" "$p"; ` +
          `done; fi`,
      );
    }
  }
  return lines.join('\n');
}

function parseInventory(stdout) {
  const byCategory = new Map();
  for (const line of String(stdout || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [id, mtime, bytes, ...rest] = trimmed.split('\t');
    const filePath = rest.join('\t');
    if (!id || !filePath) continue;
    if (!byCategory.has(id)) byCategory.set(id, []);
    byCategory.get(id).push({
      path: filePath,
      mtime: Number(mtime) || 0,
      bytes: Number(bytes) || 0,
    });
  }
  return byCategory;
}

/** PLANO puro (testável): inventário + tetos → o que fica e o que sai. */
function planRetention(byCategory, categories = CATEGORIES) {
  const plan = [];
  for (const category of categories) {
    const items = (byCategory.get(category.id) || []).slice().sort((a, b) => b.mtime - a.mtime);
    const keep = items.slice(0, category.keep);
    const remove = items.slice(category.keep);
    plan.push({
      id: category.id,
      label: category.label,
      keepLimit: category.keep,
      keep,
      remove,
      freedBytes: remove.reduce((sum, item) => sum + item.bytes, 0),
    });
  }
  return plan;
}

function human(bytes) {
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function stamp(mtime) {
  if (!mtime) return '?';
  return new Date(mtime * 1000).toISOString().slice(0, 10);
}

/**
 * Script remoto de REMOÇÃO. Só recebe caminhos que o plano aprovou, e cada
 * `rm -rf` é de um caminho literal — nunca de um glob montado na hora.
 * Guarda dupla: recusa qualquer caminho que não comece pelos prefixos
 * permitidos (se um bug de parsing produzir "/" ou "/root", nada acontece).
 */
const ALLOWED_PREFIXES = ['/root/hbx-backups/', '/root/HBX-backups/', '/root/hbx-hotfix-backups/', '/root/nginx-backups/', '/root/hbx-data/rfb/', '/root/HBX_FULL_', '/root/HBX_BACKUP_'];

function isPathAllowed(target) {
  const value = String(target || '');
  if (value.includes('\n') || value.includes('..')) return false;
  return ALLOWED_PREFIXES.some((prefix) => value.startsWith(prefix) && value.length > prefix.length);
}

function buildRemovalScript(targets) {
  const lines = ['set -u', 'echo "[retencao] disco antes:"', 'df -hP /'];
  for (const target of targets) {
    lines.push(
      `if [ -e ${shellSingleQuote(target)} ]; then ` +
        `sz=$(du -sh ${shellSingleQuote(target)} 2>/dev/null | cut -f1); ` +
        `rm -rf ${shellSingleQuote(target)} && echo "[retencao] REMOVIDO ${target} ($sz)"; ` +
        `else echo "[retencao] já não existia: ${target}"; fi`,
    );
  }
  lines.push('echo "[retencao] disco depois:"', 'df -hP /');
  return lines.join('\n');
}

function runRemote(env, script, options = {}) {
  const { run } = require('../lib/runtime');
  const sshHost = requireEnv(env, 'HOSTINGER_SSH_HOST');
  const sshUser = requireEnv(env, 'HOSTINGER_SSH_USER');
  const sshPort = String(env.HOSTINGER_SSH_PORT || '').trim();
  const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];
  if (sshPort) args.push('-p', sshPort);
  args.push(`${sshUser}@${sshHost}`, 'bash', '-s');
  return run('ssh', args, {
    cwd: repoRoot,
    captureOutput: true,
    stdin: script,
    timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    // O inventário usa `find`, que sai != 0 por qualquer pasta ausente. Isso não
    // é erro: pasta que não existe simplesmente não tem nada pra reter.
    allowFailure: options.allowFailure === true,
  });
}

function main() {
  const options = parseArgs(process.argv);
  const env = loadOperationsEnv();

  const inventory = runRemote(env, buildInventoryScript(), { allowFailure: true });
  const byCategory = parseInventory(inventory.stdout);
  const plan = planRetention(byCategory);
  const totalFreed = plan.reduce((sum, item) => sum + item.freedBytes, 0);
  const targets = plan.flatMap((item) => item.remove.map((entry) => entry.path));
  const blocked = targets.filter((target) => !isPathAllowed(target));
  const allowed = targets.filter((target) => isPathAllowed(target));

  if (options.json) {
    console.log(JSON.stringify({ mode: options.apply ? 'apply' : 'dry-run', plan, totalFreed, blocked }, null, 2));
  } else {
    console.log(options.apply
      ? '=== RETENÇÃO DA VPS — MODO APPLY (vai apagar) ==='
      : '=== RETENÇÃO DA VPS — DRY-RUN (não apaga nada; use --apply) ===');
    for (const item of plan) {
      console.log(`\n[${item.id}] ${item.label}`);
      console.log(`  teto: guardar ${item.keepLimit} mais recente(s)`);
      if (!item.keep.length && !item.remove.length) {
        console.log('  (nada encontrado)');
        continue;
      }
      for (const entry of item.keep) {
        console.log(`  FICA  ${stamp(entry.mtime)}  ${human(entry.bytes).padStart(9)}  ${entry.path}`);
      }
      for (const entry of item.remove) {
        console.log(`  ${options.apply ? 'SAI  ' : 'SAIRIA'} ${stamp(entry.mtime)}  ${human(entry.bytes).padStart(9)}  ${entry.path}`);
      }
      if (item.remove.length) console.log(`  subtotal liberado: ${human(item.freedBytes)}`);
    }
    console.log(`\nTOTAL ${options.apply ? 'liberado' : 'que seria liberado'}: ${human(totalFreed)} em ${targets.length} item(ns).`);
    if (blocked.length) {
      console.log(`\n⚠️  ${blocked.length} caminho(s) RECUSADO(s) pela guarda de prefixo (não serão tocados):`);
      for (const target of blocked) console.log(`   ${target}`);
    }
  }

  if (!options.apply) {
    console.log('\nNada foi apagado. Para aplicar: node scripts/ops/vps-retention.js --apply');
    return;
  }
  if (!allowed.length) {
    console.log('\nNada a remover.');
    return;
  }

  const removal = runRemote(env, buildRemovalScript(allowed));
  console.log(String(removal.stdout || ''));
  if (removal.status !== 0) {
    throw new Error(`remoção terminou com status ${removal.status}: ${String(removal.stderr || '').slice(0, 400)}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  }
}

module.exports = { CATEGORIES, planRetention, parseInventory, isPathAllowed, buildRemovalScript };

// ============================================================================
// AGENDAMENTO — DE PROPÓSITO NÃO INSTALADO (gate do dono)
// ============================================================================
// Este script NÃO se agenda sozinho, por dois motivos:
//   1. em 05/08 havia outro trabalho avaliando quais backups antigos podiam
//      sair. Ligar um automatismo que apaga backup no meio dessa avaliação é
//      exatamente o risco que a casa proíbe;
//   2. "nada de cron que rode comando destrutivo sem teto" — os tetos existem
//      (CATEGORIES), mas quem decide ligar automatismo destrutivo é o dono.
//
// Para agendar semanalmente DEPOIS do aval (roda do PC do dono, que é quem tem
// as credenciais SSH — não precisa de unit na VPS):
//   • Windows (Agendador de Tarefas), semanal:
//       schtasks /create /tn "HBX retencao VPS" /sc weekly /d SUN /st 04:00 ^
//         /tr "cmd /c cd /d C:\\Users\\Jhonatan\\Desktop\\App && node scripts\\ops\\vps-retention.js --apply >> retencao.log 2>&1"
//   • Antes de ligar: rode 1x sem --apply e confira o que sairia.
// ============================================================================
