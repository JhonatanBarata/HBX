"use client";

// ================================================================
// LOGÍSTICA-MOBILE M8 — FILA OFFLINE (IndexedDB) das confirmações de entrega.
//
// O QUE FAZ: a entrega funciona SEM sinal. Ao confirmar, a UI gera um
// idempotencyKey (uuid) e ENFILEIRA o payload aqui; se estiver online, tenta
// enviar já — se falhar/offline, o item fica na fila e é drenado ao reconectar.
//
// FREIO DURO (regra do dono — loop = chip banido / martelar servidor = ruim):
//  · backoff EXPONENCIAL entre tentativas (nextTryAt), NUNCA loop apertado.
//  · TETO de tentativas (MAX_ATTEMPTS = 5): ao estourar, o item PARA de tentar e
//    é marcado 'needs_attention' — não fica batendo no servidor pra sempre.
//  · a idempotência é do SERVIDOR (idempotencyKey unique): reenviar o MESMO item
//    NÃO dispara efeito 2× (WhatsApp/charge). A fila só garante ENTREGA-AO-MENOS-1.
//
// Sem IndexedDB (browser antigo/SSR) → tudo vira no-op gracioso (a UI ainda tenta
// o envio direto no confirmar; só perde a resiliência offline).
// ================================================================

const DB_NAME = "hbx-entrega";
const DB_VERSION = 1;
const STORE = "pendencias";

export const MAX_ATTEMPTS = 5; // TETO de tentativas por item (depois: needs_attention).
const BASE_BACKOFF_MS = 5_000; // 5s, 10s, 20s, 40s, 80s (2^n) — teto de reentradas.
const MAX_BACKOFF_MS = 5 * 60_000; // trava o backoff em 5min (não cresce infinito).

export type PendenciaStatus = "pending" | "needs_attention";

// Payload gravado na fila (subset do ConfirmarPayload SEM a key — a key é a chave
// primária do item). Espelha os campos do confirmar do backend.
export interface PendenciaPayload {
  lat?: number;
  lng?: number;
  // B1 — precisão do GPS (metros); aditivo, não quebra itens já enfileirados
  // (fica undefined nos itens antigos, o backend trata como "sem accuracy").
  accuracy?: number;
  receiptMethod?: "pix" | "dinheiro" | "fiado";
  itens?: Array<{ id: string; qtdEntregue: number }>;
  // F2 (08/07) — produtos novos incluídos/trocados na chegada; aditivo (undefined
  // nos itens já enfileirados antes desta versão — o backend trata como "nenhum").
  novosItens?: Array<{ productId: number; qtdEntregue: number }>;
}

export interface PendenciaItem {
  // A idempotencyKey É a chave primária da fila (uuid gerado no confirmar). O servidor
  // dedupe por ela — reenviar o MESMO item nunca dispara efeito 2×.
  idempotencyKey: string;
  entregaId: string;
  payload: PendenciaPayload;
  ts: number; // quando foi enfileirado.
  attempts: number; // quantas tentativas de envio já rolaram.
  nextTryAt: number; // epoch ms: só tenta de novo depois disso (backoff).
  status: PendenciaStatus;
  lastError?: string | null;
}

/** uuid v4 (crypto.randomUUID onde houver; fallback simples). */
export function novaIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fallback abaixo */
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!hasIDB()) return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "idempotencyKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise(async (resolve) => {
    const db = await openDb();
    if (!db) return resolve(null);
    try {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const r = fn(store);
      r.onsuccess = () => resolve(r.result as T);
      r.onerror = () => resolve(null);
      t.oncomplete = () => db.close();
    } catch {
      resolve(null);
    }
  });
}

/** Enfileira uma confirmação pendente (dedupe por idempotencyKey — put = upsert). */
export async function enqueue(
  entregaId: string,
  payload: PendenciaPayload,
  idempotencyKey: string,
): Promise<void> {
  const item: PendenciaItem = {
    idempotencyKey,
    entregaId,
    payload,
    ts: Date.now(),
    attempts: 0,
    nextTryAt: 0, // 0 = pode tentar agora.
    status: "pending",
    lastError: null,
  };
  await tx("readwrite", (s) => s.put(item));
}

/** Todos os itens da fila (pending + needs_attention). */
export async function listAll(): Promise<PendenciaItem[]> {
  const all = await tx<PendenciaItem[]>("readonly", (s) => s.getAll() as IDBRequest<PendenciaItem[]>);
  return Array.isArray(all) ? all : [];
}

/** Contagem de pendências (o que ainda NÃO sincronizou): pending + needs_attention. */
export async function countPending(): Promise<number> {
  const all = await listAll();
  return all.length;
}

async function remove(key: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(key));
}

async function save(item: PendenciaItem): Promise<void> {
  await tx("readwrite", (s) => s.put(item));
}

/** Backoff exponencial com teto (5s, 10s, 20s, 40s, 80s… travado em 5min). */
function backoffMs(attempts: number): number {
  const ms = BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(ms, MAX_BACKOFF_MS);
}

export interface DrainResult {
  enviados: number; // itens que sincronizaram (removidos da fila).
  restantes: number; // itens ainda na fila (pending aguardando backoff + needs_attention).
  precisamAtencao: number; // itens que estouraram o teto.
}

/**
 * Drena a fila UMA passada: para cada item 'pending' cujo nextTryAt já venceu, tenta
 * enviar via `sender` (que deve mandar o idempotencyKey ao servidor). Sucesso → remove.
 * Falha → incrementa attempts + agenda o próximo backoff; ao ESTOURAR o teto, marca
 * 'needs_attention' e PARA de tentar (não martela o servidor). NUNCA faz loop próprio:
 * é 1 passada; quem chama reagenda (evento online + intervalo). Não lança.
 */
export async function drain(
  sender: (item: PendenciaItem) => Promise<void>,
): Promise<DrainResult> {
  const all = await listAll();
  const now = Date.now();
  let enviados = 0;

  for (const item of all) {
    if (item.status === "needs_attention") continue; // estourou o teto: não tenta mais.
    if (item.nextTryAt > now) continue; // ainda no backoff.

    try {
      await sender(item);
      await remove(item.idempotencyKey); // sincronizou → sai da fila.
      enviados += 1;
    } catch (e) {
      const attempts = item.attempts + 1;
      const estourou = attempts >= MAX_ATTEMPTS;
      const atualizado: PendenciaItem = {
        ...item,
        attempts,
        lastError: e instanceof Error ? e.message : String(e),
        // Estourou o teto → PARA (needs_attention). Senão, agenda o próximo backoff.
        status: estourou ? "needs_attention" : "pending",
        nextTryAt: estourou ? item.nextTryAt : now + backoffMs(attempts),
      };
      await save(atualizado);
    }
  }

  const restantesArr = await listAll();
  return {
    enviados,
    restantes: restantesArr.length,
    precisamAtencao: restantesArr.filter((i) => i.status === "needs_attention").length,
  };
}
