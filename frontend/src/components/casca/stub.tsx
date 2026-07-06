"use client";

// MOBILE-CASCA/W1 — STUB de tela provisória (W2–W6 trocam pelo miolo real).
// Fica dentro do slot de conteúdo da casca; só a moldura (topo/tab bar) é
// permanente. Zero visual solto — classes .casca-stub__* (casca.css).

import React from "react";

import { I, ICONS } from "@/components/hbx/shell";

export function CascaStub({ label, msg }: { label: string; msg?: string }) {
  return (
    <div className="casca-stub">
      <I d={ICONS.bolt} size={28} />
      <span className="casca-stub__label">{label}</span>
      {msg ? <p className="casca-stub__msg">{msg}</p> : null}
    </div>
  );
}
