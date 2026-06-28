"use client";

// Store do "momento de conquista" (28/06, Camada 1). UM componente central
// dispara TODA "1ª vez" da jornada — marcante, premium e SEMPRE igual (decisão
// travada do dono). Fila simples: se dois marcos caem juntos, mostram em
// sequência. Vive no app-shell (conquista-host) e portala pro <body>.
//
// Padrão external-store (useSyncExternalStore), igual ao tutorial-coach-store.

export type ConquistaKind = "vitoria" | "ativado" | "venda" | "marco";

export type Conquista = {
  id: number;
  title: string;
  subtitle?: string;
  kind: ConquistaKind;
  // selo curto no topo do medalhão (ex.: "Vitória #1", "Ativado").
  badge?: string;
};

const queue: Conquista[] = [];
let current: Conquista | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

function pump() {
  if (!current && queue.length) {
    current = queue.shift() || null;
    emit();
  }
}

export function fireConquista(c: Omit<Conquista, "id">) {
  seq += 1;
  queue.push({ ...c, id: seq });
  pump();
}

// Fecha a conquista atual e puxa a próxima da fila (se houver). O host chama no
// auto-dismiss ou no clique de "Continuar".
export function dismissConquista() {
  current = null;
  emit();
  pump();
}

export function subscribeConquista(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getCurrentConquista() {
  return current;
}
