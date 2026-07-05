// Fix 3 (PR05072026): backfill one-shot dos avatares quebrados no /atendimento.
//
// Diagnóstico (medido em prod 05/07): 163 conversas Webwhats — 45 já com avatar local estável
// (`/uploads/avatars/...`), 44 com URL crua `pps.whatsapp.net` (assinada, EXPIRA → some sozinha),
// 74 sem avatar (fetch null: privacidade ou rate-limit do WhatsApp na época).
//
// Este script é NODE PURO (sem Nest DI) pra rodar dentro do container já buildado:
//   docker exec hbx-backend node scripts/backfill-avatars.js [--dry-run] [--incluir-sem-foto]
//
// Reusa o MESMO esquema de cache por conteúdo do `cacheProfilePictureLocally`
// (backend/src/messaging/webwhats-bridge.service.ts): chave = sha1(pathname da URL), sem a
// query que rota — mesma foto não baixa 2x, foto trocada vira arquivo novo. Idempotente: rodar
// 2x não duplica (já local → pula sem chamar o motor).
'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalizeText(value) {
  const text = String(value == null ? '' : value).trim();
  return text || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// MESMOS envs que `webwhats-bridge.service.ts#readConfig` lê — sem isso o script chamaria
// o motor errado (ou nenhum) e o backfill viraria um no-op silencioso.
function readMotorConfig() {
  const enabled = String(process.env.WHATSAPP_MODAL_ENABLED || 'false').trim().toLowerCase() === 'true';
  const internalUrl = normalizeText(process.env.WHATSAPP_MODAL_INTERNAL_URL);
  const apiKey = normalizeText(process.env.WHATSAPP_MODAL_API_KEY);
  const timeoutMs = Math.max(2000, Math.min(30000, Number(process.env.WHATSAPP_MODAL_TIMEOUT_MS || process.env.WHATSAPP_PROVIDER_TIMEOUT_MS || 12000)));
  return {
    enabled,
    configured: Boolean(internalUrl && apiKey),
    internalUrl,
    apiKey,
    timeoutMs,
  };
}

// Mesma pasta física que o backend serve em runtime (`getBackendPublicUploadDir` resolve
// `<dist>/../public/uploads`); daqui (`backend/scripts/`) o equivalente é `../public/uploads`.
function resolveAvatarsDir() {
  return path.resolve(__dirname, '..', 'public', 'uploads', 'avatars');
}

// Mesmo esquema de nome de `cacheProfilePictureLocally`: sha1(pathname sem query) + extensão
// (default .jpg se a URL não trouxer uma extensão de imagem reconhecida).
function resolveAvatarCachePath(cdnUrl) {
  let pathname;
  try {
    pathname = new URL(cdnUrl).pathname;
  } catch {
    return null;
  }
  const rawExt = path.extname(pathname).toLowerCase().replace(/[^.a-z0-9]/g, '');
  const ext = /^\.(jpe?g|png|webp|gif)$/.test(rawExt) ? rawExt : '.jpg';
  const filename = `${crypto.createHash('sha1').update(pathname).digest('hex')}${ext}`;
  const dir = resolveAvatarsDir();
  return { filePath: path.join(dir, filename), publicUrl: `/uploads/avatars/${filename}`, dir };
}

async function downloadAndCache(cdnUrl) {
  const url = normalizeText(cdnUrl);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const resolved = resolveAvatarCachePath(url);
  if (!resolved) return null;
  const { filePath, publicUrl, dir } = resolved;
  if (fs.existsSync(filePath)) return publicUrl; // já local (idempotente) → não re-baixa

  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    maxContentLength: 8 * 1024 * 1024,
    validateStatus: (status) => status >= 200 && status < 300,
  });
  const contentType = String(res.headers?.['content-type'] || '').toLowerCase();
  if (contentType && !contentType.startsWith('image/')) return null;
  const buffer = Buffer.from(res.data);
  if (!buffer.length) return null;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return publicUrl;
}

// Mesma rota que a bridge usa (`fetchProfilePictureUrl/{tenantKey}`); resposta null = privacidade
// ou rate-limit do WhatsApp na hora, não é erro — o chamador trata como "sem foto".
async function fetchProfilePictureUrl(motorConfig, tenantKey, remoteJid) {
  const url = new URL(
    `chat/fetchProfilePictureUrl/${encodeURIComponent(tenantKey)}`,
    `${motorConfig.internalUrl.replace(/\/+$/, '')}/`,
  ).toString();
  const res = await axios.request({
    method: 'POST',
    url,
    data: { number: remoteJid },
    timeout: motorConfig.timeoutMs,
    headers: {
      apikey: motorConfig.apiKey,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  });
  if (res.status === 404) return null;
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`motor respondeu status ${res.status}`);
  }
  return normalizeText(res.data && res.data.profilePictureUrl);
}

function parseMetadata(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function isRawWhatsappAvatarUrl(value) {
  const text = normalizeText(value);
  if (!text) return false;
  return /^https?:\/\//i.test(text) && !text.startsWith('/uploads/');
}

// Seleciona as conversas-alvo: sempre as com URL crua pps.whatsapp.net (prioridade — são as
// que QUEBRAM sozinhas quando a assinatura vence); com --incluir-sem-foto também entram as
// sem avatar nenhum (best-effort, pode continuar null se o WhatsApp recusar por privacidade).
function selectTargetConversations(conversations, incluirSemFoto) {
  const alvo = [];
  for (const conversation of conversations) {
    const metadata = parseMetadata(conversation.metadata);
    const remoteJid = normalizeText(metadata.whatsappRemoteJid) || normalizeText(conversation.contact);
    if (!remoteJid) continue;
    const tenantKey = normalizeText(conversation.sourceTenantKey);
    if (!tenantKey) continue;
    const avatarUrl = normalizeText(metadata.whatsappAvatarUrl);
    if (isRawWhatsappAvatarUrl(avatarUrl)) {
      alvo.push({ conversation, metadata, remoteJid, tenantKey, reason: 'url_crua' });
    } else if (incluirSemFoto && !avatarUrl) {
      alvo.push({ conversation, metadata, remoteJid, tenantKey, reason: 'sem_foto' });
    }
  }
  return alvo;
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const incluirSemFoto = hasFlag('--incluir-sem-foto');
  const motorConfig = readMotorConfig();

  if (!motorConfig.configured) {
    console.error('[backfill-avatars] WHATSAPP_MODAL_INTERNAL_URL/WHATSAPP_MODAL_API_KEY ausentes — abortando.');
    process.exitCode = 1;
    return;
  }

  const conversations = await prisma.companyConversation.findMany({
    where: { sourceTenantKey: { not: null } },
    select: {
      id: true,
      companyId: true,
      contact: true,
      sourceTenantKey: true,
      metadata: true,
    },
  });

  const alvo = selectTargetConversations(conversations, incluirSemFoto);

  const summary = { varridas: conversations.length, alvo: alvo.length, consertadas: 0, null_: 0, erro: 0 };

  console.log(
    `[backfill-avatars] modo=${dryRun ? 'dry-run' : 'apply'} incluirSemFoto=${incluirSemFoto} ` +
    `varridas=${summary.varridas} alvo=${summary.alvo}`,
  );

  for (const [index, item] of alvo.entries()) {
    const { conversation, metadata, remoteJid, tenantKey, reason } = item;
    const label = `conversation=${conversation.id} company=${conversation.companyId} tenantKey=${tenantKey} motivo=${reason}`;

    if (dryRun) {
      console.log(`[backfill-avatars] (dry-run) buscaria foto — ${label}`);
      continue;
    }

    try {
      const profilePictureUrl = await fetchProfilePictureUrl(motorConfig, tenantKey, remoteJid);
      if (!profilePictureUrl) {
        summary.null_ += 1;
        console.log(`[backfill-avatars] sem foto (privacidade/rate-limit) — ${label}`);
      } else {
        const localUrl = await downloadAndCache(profilePictureUrl);
        if (!localUrl) {
          summary.null_ += 1;
          console.log(`[backfill-avatars] foto retornada mas download/cache falhou — ${label}`);
        } else {
          const nextMetadata = {
            ...metadata,
            whatsappAvatarUrl: localUrl,
            whatsappAvatarCheckedAt: Date.now(),
          };
          await prisma.companyConversation.update({
            where: { id: conversation.id },
            data: { metadata: JSON.stringify(nextMetadata) },
          });
          summary.consertadas += 1;
          console.log(`[backfill-avatars] consertado -> ${localUrl} — ${label}`);
        }
      }
    } catch (error) {
      summary.erro += 1;
      console.warn(`[backfill-avatars] erro (pulando) — ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Espaça as chamadas ao motor (rate-limit): 2s + jitter. Só entre chamadas reais, não
    // depois da última.
    if (index < alvo.length - 1) {
      await sleep(2000 + Math.floor(Math.random() * 500));
    }
  }

  console.log(
    `[backfill-avatars] fim — varridas=${summary.varridas} alvo=${summary.alvo} ` +
    `consertadas=${summary.consertadas} sem_foto=${summary.null_} erro=${summary.erro}`,
  );
}

main()
  .catch((error) => {
    console.error('[backfill-avatars] falha fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
