// Fix 3 (PR05072026): backfill one-shot dos avatares quebrados no /atendimento.
//
// Diagnóstico (medido em prod 05/07): 163 conversas Webwhats — 45 já com avatar local estável
// (`/uploads/avatars/...`), 44 com URL crua `pps.whatsapp.net` (assinada, EXPIRA → some sozinha),
// 74 sem avatar (fetch null: privacidade ou rate-limit do WhatsApp na época).
//
// Fix 4 (PR05072026, "AVATAR-LID-FALLBACK"): `fetchProfilePictureUrl` ao vivo TRAVA (>25s, sem
// resposta) pra contato migrado pra `@lid` — provado em prod tanto buscando pelo número quanto
// pelo lid. A tabela `Contact` do motor (webhook `contacts.update`) JÁ TEM o `profilePicUrl` de
// boa parte desses contatos, e estava sendo ignorada. Nova ordem de fontes por conversa-alvo:
//   a) REST `/chat/findContacts/{tenantKey}` do motor (leitura de banco, NÃO faz IO ao vivo no
//      WhatsApp) — procurado por `remoteJid` E pelo `whatsappRemoteJidAlt` do metadata (o lid).
//   b) Só se (a) não render nada: `fetchProfilePictureUrl` ao vivo, MAS com timeout curto e
//      PULADO por inteiro quando a conversa é/tem `@lid` (provado que trava).
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
//
// `timeoutMs` (config geral) fica como estava; o fetch ao vivo do avatar usa um teto PRÓPRIO
// mais curto (`LIVE_AVATAR_FETCH_TIMEOUT_MS`) porque é sabido que trava pra contato @lid — não
// faz sentido pagar 12-30s de espera numa chamada que, quando não é lid, responde em <1s.
const LIVE_AVATAR_FETCH_TIMEOUT_MS = 8000;

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

// Contato migrado pra @lid TRAVA no fetch ao vivo (medido em prod 05/07: >25s sem resposta,
// tanto pelo número quanto pelo lid). Detecta @lid tanto no remoteJid principal quanto no alt
// (metadata.whatsappRemoteJidAlt) pra decidir se pula o fetch ao vivo.
function hasLid(...jids) {
  return jids.some((jid) => normalizeText(jid) && String(jid).toLowerCase().includes('@lid'));
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
// `timeoutMsOverride` permite o teto CURTO do fallback ao vivo (fonte b) sem mexer no timeout
// geral do motor usado pelas outras chamadas do script.
async function fetchProfilePictureUrl(motorConfig, tenantKey, remoteJid, timeoutMsOverride) {
  const url = new URL(
    `chat/fetchProfilePictureUrl/${encodeURIComponent(tenantKey)}`,
    `${motorConfig.internalUrl.replace(/\/+$/, '')}/`,
  ).toString();
  const res = await axios.request({
    method: 'POST',
    url,
    data: { number: remoteJid },
    timeout: timeoutMsOverride || motorConfig.timeoutMs,
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

// Mesma rota que a bridge usa pra listar contatos (`/chat/findContacts/{tenantKey}`) — é LEITURA
// de banco (Contact populado por webhook `contacts.update`), NÃO faz IO ao vivo no WhatsApp.
// Busca 1x por tenantKey e cacheia em memória pro processo inteiro do script (evita 1 findContacts
// por conversa-alvo — mesma economia que a bridge faz com `getCachedContacts`).
const contactsIndexCache = new Map();

async function fetchContactsIndex(motorConfig, tenantKey) {
  if (contactsIndexCache.has(tenantKey)) return contactsIndexCache.get(tenantKey);

  const url = new URL(
    `chat/findContacts/${encodeURIComponent(tenantKey)}`,
    `${motorConfig.internalUrl.replace(/\/+$/, '')}/`,
  ).toString();
  const res = await axios.request({
    method: 'POST',
    url,
    data: {},
    timeout: motorConfig.timeoutMs,
    headers: {
      apikey: motorConfig.apiKey,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`motor respondeu status ${res.status} em findContacts`);
  }
  const contacts = Array.isArray(res.data) ? res.data : [];
  const byJid = new Map();
  for (const contact of contacts) {
    const remoteJid = normalizeText(contact && contact.remoteJid);
    if (!remoteJid) continue;
    byJid.set(remoteJid, contact);
  }
  contactsIndexCache.set(tenantKey, byJid);
  return byJid;
}

// Fonte (a): procura o profilePicUrl já cravado no Contact do motor, por remoteJid E pelo
// whatsappRemoteJidAlt (o lid) — o webhook `contacts.update` pode ter salvo por qualquer um dos
// dois lados. URL pode estar vencida (expira); quem chama tenta baixar e cai pra próxima fonte
// se der falha no download.
async function findContactAvatarUrl(motorConfig, tenantKey, remoteJid, remoteJidAlt) {
  const byJid = await fetchContactsIndex(motorConfig, tenantKey);
  const viaRemoteJid = remoteJid ? byJid.get(remoteJid) : null;
  const viaAlt = remoteJidAlt ? byJid.get(remoteJidAlt) : null;
  return (
    normalizeText(viaRemoteJid && viaRemoteJid.profilePicUrl) ||
    normalizeText(viaAlt && viaAlt.profilePicUrl) ||
    null
  );
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

// Nova ordem de fontes (Fix 4, PR05072026) pra resolver a URL crua da foto de UMA conversa-alvo:
//   a) findContacts do motor (remoteJid + remoteJidAlt/lid) — leitura de banco, sempre tentada
//      primeiro e NUNCA trava (não é IO ao vivo no WhatsApp).
//   b) só se (a) não render nada: fetchProfilePictureUrl ao vivo, com timeout CURTO — e PULADO
//      por inteiro quando a conversa é/tem @lid (provado que trava >25s nesse caso).
// Retorna { profilePictureUrl, fonte } onde fonte é 'contact' | 'fetch_ao_vivo' | null (sem foto
// em nenhuma fonte, não é erro).
async function resolveProfilePictureUrl(motorConfig, { tenantKey, remoteJid, remoteJidAlt }) {
  const viaContact = await findContactAvatarUrl(motorConfig, tenantKey, remoteJid, remoteJidAlt);
  if (viaContact) {
    return { profilePictureUrl: viaContact, fonte: 'contact' };
  }

  if (hasLid(remoteJid, remoteJidAlt)) {
    // Contato @lid sem foto no Contact do motor: NÃO tenta o fetch ao vivo (trava). Fica sem
    // foto nesta passada — pode ser preenchido depois se o webhook trouxer o profilePicUrl.
    return { profilePictureUrl: null, fonte: null };
  }

  const viaFetch = await fetchProfilePictureUrl(motorConfig, tenantKey, remoteJid, LIVE_AVATAR_FETCH_TIMEOUT_MS);
  return { profilePictureUrl: viaFetch || null, fonte: viaFetch ? 'fetch_ao_vivo' : null };
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
    const remoteJidAlt = normalizeText(metadata.whatsappRemoteJidAlt);
    const tenantKey = normalizeText(conversation.sourceTenantKey);
    if (!tenantKey) continue;
    const avatarUrl = normalizeText(metadata.whatsappAvatarUrl);
    if (isRawWhatsappAvatarUrl(avatarUrl)) {
      alvo.push({ conversation, metadata, remoteJid, remoteJidAlt, tenantKey, reason: 'url_crua' });
    } else if (incluirSemFoto && !avatarUrl) {
      alvo.push({ conversation, metadata, remoteJid, remoteJidAlt, tenantKey, reason: 'sem_foto' });
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

  const summary = {
    varridas: conversations.length,
    alvo: alvo.length,
    consertadas: 0,
    viaContact: 0,
    viaFetchAoVivo: 0,
    null_: 0,
    erro: 0,
  };

  console.log(
    `[backfill-avatars] modo=${dryRun ? 'dry-run' : 'apply'} incluirSemFoto=${incluirSemFoto} ` +
    `varridas=${summary.varridas} alvo=${summary.alvo}`,
  );

  for (const [index, item] of alvo.entries()) {
    const { conversation, metadata, remoteJid, remoteJidAlt, tenantKey, reason } = item;
    const label = `conversation=${conversation.id} company=${conversation.companyId} tenantKey=${tenantKey} motivo=${reason}`;
    const lid = hasLid(remoteJid, remoteJidAlt);

    if (dryRun) {
      console.log(`[backfill-avatars] (dry-run) buscaria foto (lid=${lid}) — ${label}`);
      continue;
    }

    let fonte = null;
    try {
      const resolved = await resolveProfilePictureUrl(motorConfig, { tenantKey, remoteJid, remoteJidAlt });
      fonte = resolved.fonte;
      if (!resolved.profilePictureUrl) {
        summary.null_ += 1;
        const motivoNull = lid
          ? 'lid sem profilePicUrl no Contact do motor (fetch ao vivo pulado — trava)'
          : 'privacidade/rate-limit';
        console.log(`[backfill-avatars] sem foto (${motivoNull}) — ${label}`);
      } else {
        const localUrl = await downloadAndCache(resolved.profilePictureUrl);
        if (!localUrl) {
          summary.null_ += 1;
          console.log(`[backfill-avatars] foto retornada (fonte=${fonte}) mas download/cache falhou — ${label}`);
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
          if (fonte === 'contact') summary.viaContact += 1;
          else if (fonte === 'fetch_ao_vivo') summary.viaFetchAoVivo += 1;
          console.log(`[backfill-avatars] consertado (fonte=${fonte}) -> ${localUrl} — ${label}`);
        }
      }
    } catch (error) {
      summary.erro += 1;
      console.warn(`[backfill-avatars] erro (pulando) — ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Espaça as chamadas ao motor (rate-limit): findContacts é leitura de banco (mais barato,
    // 500ms alcança); só quando caiu no fetch ao vivo (fonte='fetch_ao_vivo') mantém o espaço
    // maior de 2s+jitter que já existia (é o caminho que fala com o WhatsApp de verdade).
    if (index < alvo.length - 1) {
      const wait = fonte === 'fetch_ao_vivo' ? 2000 + Math.floor(Math.random() * 500) : 500;
      await sleep(wait);
    }
  }

  console.log(
    `[backfill-avatars] fim — varridas=${summary.varridas} alvo=${summary.alvo} ` +
    `consertadas=${summary.consertadas} (via_contact=${summary.viaContact} via_fetch_ao_vivo=${summary.viaFetchAoVivo}) ` +
    `sem_foto=${summary.null_} erro=${summary.erro}`,
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
