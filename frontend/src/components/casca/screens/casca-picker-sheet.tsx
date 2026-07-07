"use client";

// MOBILE-CASCA — picker seletivo reutilizável (single-select buscável), pop-up
// em cima de outra folha (CascaSheet aninhada). Nasce do pedido do dono: os
// campos de texto livre "Cidade" e "Segmento" em Vendas→Buscar viram seletores
// com busca. Genérico o bastante pra qualquer lista simples ou agrupada por
// categoria (ex.: RADAR_SEGMENT_CATEGORIES) — zero fonte de dado nova aqui,
// só apresentação; quem chama passa as opções.
//
// `allowFreeText`: quando ligado, o texto digitado na busca pode ser
// confirmado como valor mesmo sem casar com nenhuma opção da lista (segmento
// de nicho não é lista fechada — ver radar-segments.ts).

import { useCallback, useMemo, useState } from "react";

import { I, ICONS } from "@/components/hbx/shell";

import { CascaSheet } from "../transitions";

export type CascaPickerOption = { value: string; label: string };
export type CascaPickerGroup = { label: string; options: CascaPickerOption[] };

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function CascaPickerSheet({
  open,
  title,
  groups,
  value,
  onSelect,
  onClose,
  allowFreeText = false,
  searchPlaceholder = "Buscar…",
  freeTextLabel = "Usar",
}: {
  open: boolean;
  title: string;
  groups: CascaPickerGroup[];
  value: string;
  onSelect: (next: string) => void;
  onClose: () => void;
  allowFreeText?: boolean;
  searchPlaceholder?: string;
  freeTextLabel?: string;
}) {
  const [query, setQuery] = useState("");

  // Reset da busca ao (re)abrir — ajuste de state DURANTE o render (mesmo
  // padrão "adjust state while rendering" de mais-sheet.tsx/transitions.tsx),
  // sem useEffect/set-state-in-effect.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setQuery("");
  }

  const filteredGroups = useMemo(() => {
    const q = normalize(query);
    if (!q) return groups;
    return groups
      .map((g) => ({ label: g.label, options: g.options.filter((o) => normalize(o.label).includes(q)) }))
      .filter((g) => g.options.length > 0);
  }, [groups, query]);

  const hasExactMatch = useMemo(() => {
    const q = normalize(query);
    if (!q) return true;
    return groups.some((g) => g.options.some((o) => normalize(o.label) === q));
  }, [groups, query]);

  const pick = useCallback((next: string) => {
    onSelect(next);
    onClose();
  }, [onSelect, onClose]);

  const trimmedQuery = query.trim();

  return (
    <CascaSheet open={open} title={title} onClose={onClose}>
      <div className="casca-picker">
        <div className="casca-picker__search">
          <I d={ICONS.search} size={15} />
          <input
            className="casca-picker__search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
            aria-label={searchPlaceholder}
          />
        </div>

        {allowFreeText && trimmedQuery && !hasExactMatch ? (
          <button
            type="button"
            className="casca-picker__freetext"
            onClick={() => pick(trimmedQuery)}
          >
            <I d={ICONS.plus} size={14} />
            <span>{freeTextLabel} &quot;{trimmedQuery}&quot;</span>
          </button>
        ) : null}

        <div className="casca-picker__list" role="listbox" aria-label={title}>
          {filteredGroups.length === 0 ? (
            <p className="casca-picker__empty">Nada encontrado.</p>
          ) : (
            filteredGroups.map((g) => (
              <div className="casca-picker__group" key={g.label}>
                {g.label ? <span className="casca-picker__group-label">{g.label}</span> : null}
                {g.options.map((o) => (
                  <button
                    type="button"
                    key={o.value}
                    className={"casca-picker__opt" + (o.value === value ? " is-on" : "")}
                    role="option"
                    aria-selected={o.value === value}
                    onClick={() => pick(o.value)}
                  >
                    <span>{o.label}</span>
                    {o.value === value ? <I d={ICONS.check} size={15} /> : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </CascaSheet>
  );
}
