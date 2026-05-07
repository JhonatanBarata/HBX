"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { BRAZIL_CITIES_BY_STATE, BRAZIL_STATES } from "@/lib/brazil-locations";
import { HBX_SEGMENT_SUGGESTIONS } from "@/lib/hbx-segment-suggestions";
import styles from "./prospecting-filters.module.css";

export type HbxEngineValue = "hbx" | "google";
export type HbxTargetTypeValue = "pj" | "pf" | "agenda_pf" | "both";

export type HbxAdvancedFiltersValue = {
  minRating?: string | number | null;
  minReviews?: string | number | null;
  onlyWithWebsite?: boolean;
  noWebsite?: boolean;
  highOpportunity?: boolean;
  ddd?: string;
  scoreRange?: string;
  status?: string;
};

type Option = {
  value: string;
  label: string;
  count?: number;
};

type OptionInput = string | Option;

function normalizeSearchText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isKnownState(value: string) {
  const uf = String(value || "").trim().toUpperCase();
  return BRAZIL_STATES.some((item) => item.uf === uf);
}

function Chevron() {
  return (
    <svg className={styles.chevron} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function filterOptions(options: Option[], query: string) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return options;
  const filtered = options.filter((item) => normalizeSearchText(`${item.label} ${item.value}`).includes(normalized));
  return filtered.length ? filtered : options;
}

function normalizeOptionInput(item: OptionInput): Option {
  if (typeof item === "string") return { value: item, label: item };
  return {
    value: String(item.value || "").trim(),
    label: String(item.label || item.value || "").trim(),
    count: typeof item.count === "number" ? item.count : undefined,
  };
}

function normalizeOptionList(items?: OptionInput[] | null) {
  const seen = new Set<string>();
  const options: Option[] = [];
  for (const item of items || []) {
    const option = normalizeOptionInput(item);
    if (!option.value || seen.has(option.value)) continue;
    seen.add(option.value);
    options.push(option);
  }
  return options;
}

function optionLabelWithCount(option: Option) {
  return typeof option.count === "number" ? `${option.label} (${option.count})` : option.label;
}

export function HbxStateCityPicker({
  state,
  city,
  onStateChange,
  onCityChange,
  disabled = false,
  requiredCity = false,
  helperText,
  allowAllCities = false,
  allCitiesLabel = "Todas as cidades",
  availableStates,
  availableCities,
  availableCitiesByState,
}: {
  state: string;
  city: string;
  onStateChange: (value: string) => void;
  onCityChange: (value: string) => void;
  disabled?: boolean;
  requiredCity?: boolean;
  helperText?: string;
  allowAllCities?: boolean;
  allCitiesLabel?: string;
  availableStates?: OptionInput[];
  availableCities?: OptionInput[];
  availableCitiesByState?: Record<string, OptionInput[]>;
}) {
  const stateListId = useId();
  const cityListId = useId();
  const [stateOpen, setStateOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [activeStateIndex, setActiveStateIndex] = useState(0);
  const [activeCityIndex, setActiveCityIndex] = useState(0);
  const normalizedState = String(state || "").trim().toUpperCase();
  const configuredStateOptions = useMemo(() => normalizeOptionList(availableStates), [availableStates]);
  const hasConfiguredStates = configuredStateOptions.length > 0;
  const stateBaseOptions = useMemo(
    () => hasConfiguredStates
      ? configuredStateOptions
      : BRAZIL_STATES.map((item) => ({ value: item.uf, label: `${item.uf} - ${item.name}` })),
    [configuredStateOptions, hasConfiguredStates],
  );
  const knownState = isKnownState(normalizedState) || stateBaseOptions.some((item) => item.value === normalizedState);
  const stateOptions = useMemo(
    () => filterOptions(stateBaseOptions, normalizedState),
    [normalizedState, stateBaseOptions],
  );
  const cityOptions = useMemo<Option[]>(() => {
    const configuredByState = normalizeOptionList(availableCitiesByState?.[normalizedState]);
    const configuredCities = configuredByState.length ? configuredByState : normalizeOptionList(availableCities);
    const cities = configuredCities.length
      ? configuredCities
      : knownState
        ? (BRAZIL_CITIES_BY_STATE[normalizedState] || []).map((item) => ({ value: item, label: item }))
        : [];
    const normalizedCity = normalizeSearchText(city);
    const base = cities
      .filter((item) => !normalizedCity || normalizeSearchText(`${item.label} ${item.value}`).includes(normalizedCity))
      .sort((left, right) => {
        const leftStarts = normalizeSearchText(left.label).startsWith(normalizedCity) ? 0 : 1;
        const rightStarts = normalizeSearchText(right.label).startsWith(normalizedCity) ? 0 : 1;
        return leftStarts - rightStarts || left.label.localeCompare(right.label, "pt-BR");
      });
    return allowAllCities ? [{ value: "", label: allCitiesLabel }, ...base] : base;
  }, [allowAllCities, allCitiesLabel, availableCities, availableCitiesByState, city, knownState, normalizedState]);
  const cityDisabled = disabled || !knownState || (hasConfiguredStates && !normalizedState);
  const showStateOptions = stateOpen && !disabled && stateOptions.length > 0;
  const showCityOptions = cityOpen && !cityDisabled && cityOptions.length > 0;

  const selectState = (nextState: string) => {
    onStateChange(nextState);
    onCityChange("");
    setStateOpen(false);
    setActiveStateIndex(0);
  };

  const selectCity = (nextCity: Option) => {
    onCityChange(nextCity.value);
    setCityOpen(false);
    setActiveCityIndex(0);
  };

  const handleStateKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showStateOptions) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveStateIndex((current) => Math.min(current + 1, stateOptions.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveStateIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectState(stateOptions[Math.min(activeStateIndex, stateOptions.length - 1)]?.value || normalizedState);
    }
    if (event.key === "Escape") setStateOpen(false);
  };

  const handleCityKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showCityOptions) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveCityIndex((current) => Math.min(current + 1, cityOptions.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveCityIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = cityOptions[Math.min(activeCityIndex, cityOptions.length - 1)];
      if (option) selectCity(option);
    }
    if (event.key === "Escape") setCityOpen(false);
  };

  return (
    <div className={styles.locationGrid}>
      <label className={styles.field} onBlur={() => window.setTimeout(() => setStateOpen(false), 120)}>
        <span className={styles.label}>Estado</span>
        <span className={styles.inputWrap}>
          <input
            className={styles.input}
            value={normalizedState}
            onChange={(event) => {
              onStateChange(event.target.value.slice(0, 2).toUpperCase());
              onCityChange("");
              setStateOpen(true);
            }}
            onFocus={() => setStateOpen(true)}
            onKeyDown={handleStateKeyDown}
            placeholder="Digite ou escolha o estado"
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showStateOptions}
            aria-controls={stateListId}
          />
          <Chevron />
        </span>
        {showStateOptions ? (
          <div id={stateListId} className={styles.menu} role="listbox" aria-label="Estados">
            {stateOptions.map((item, index) => (
              <button
                key={item.value}
                type="button"
                className={index === activeStateIndex || normalizedState === item.value ? styles.optionActive : styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectState(item.value)}
                role="option"
                aria-selected={normalizedState === item.value}
              >
                {optionLabelWithCount(item)}
              </button>
            ))}
          </div>
        ) : null}
        <small className={styles.helper}>{helperText || "Escolha um estado para carregar as cidades."}</small>
      </label>

      <label className={styles.field} onBlur={() => window.setTimeout(() => setCityOpen(false), 120)}>
        <span className={styles.label}>Cidade</span>
        <span className={styles.inputWrap}>
          <input
            className={styles.input}
            value={city}
            onChange={(event) => {
              onCityChange(event.target.value);
              setCityOpen(true);
            }}
            onFocus={() => setCityOpen(true)}
            onKeyDown={handleCityKeyDown}
            placeholder={!knownState ? "Selecione o estado primeiro" : allowAllCities ? allCitiesLabel : "Digite ou escolha a cidade"}
            disabled={cityDisabled}
            required={requiredCity}
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showCityOptions}
            aria-controls={cityListId}
          />
          <Chevron />
        </span>
        {showCityOptions ? (
          <div id={cityListId} className={styles.menu} role="listbox" aria-label="Cidades">
            {cityOptions.map((item, index) => (
              <button
                key={`${item.value || item.label}-${index}`}
                type="button"
                className={index === activeCityIndex || city === item.value ? styles.optionActive : styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectCity(item)}
                role="option"
                aria-selected={city === item.value}
              >
                {optionLabelWithCount(item)}
              </button>
            ))}
          </div>
        ) : null}
        <small className={styles.helper}>
          {!knownState ? "Escolha um estado para carregar as cidades." : "Cidades oficiais do estado selecionado."}
        </small>
      </label>
    </div>
  );
}

export function HbxSegmentCombobox({
  value,
  onChange,
  suggestions = HBX_SEGMENT_SUGGESTIONS,
  placeholder = "Digite ou escolha um segmento",
  helperText = "Ex: clínicas odontológicas, oficinas mecânicas, energia solar",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const items = useMemo(() => {
    const normalized = normalizeSearchText(value);
    const source = suggestions.map((item) => String(item || "").trim()).filter(Boolean);
    if (!normalized) return source;
    const filtered = source.filter((item) => normalizeSearchText(item).includes(normalized));
    return filtered.length ? filtered : source;
  }, [suggestions, value]);
  const showOptions = open && !disabled && items.length > 0;

  const selectItem = (item: string) => {
    onChange(item);
    setOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showOptions) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, items.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectItem(items[Math.min(activeIndex, items.length - 1)] || value);
    }
    if (event.key === "Escape") setOpen(false);
  };

  return (
    <label className={styles.field} onBlur={() => window.setTimeout(() => setOpen(false), 120)}>
      <span className={styles.label}>Segmento</span>
      <span className={styles.inputWrap}>
        <input
          className={styles.input}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showOptions}
          aria-controls={listId}
        />
        <Chevron />
      </span>
      {showOptions ? (
        <div id={listId} className={styles.menu} role="listbox" aria-label="Segmentos">
          {items.map((item, index) => (
            <button
              key={item}
              type="button"
              className={index === activeIndex || value === item ? styles.optionActive : styles.option}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectItem(item)}
              role="option"
              aria-selected={value === item}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
      <small className={styles.helper}>{helperText}</small>
    </label>
  );
}

export function HbxEngineSelector({
  value,
  onChange,
  allowedEngines = ["hbx", "google"],
  showDescription = true,
}: {
  value: HbxEngineValue;
  onChange: (value: HbxEngineValue) => void;
  allowedEngines?: HbxEngineValue[];
  showDescription?: boolean;
}) {
  const options: Array<{ value: HbxEngineValue; label: string; description: string }> = [
    { value: "hbx", label: "HBX", description: "Frota HBX M1-M4" },
    { value: "google", label: "Google", description: "Google oficial / fallback controlado" },
  ];

  return (
    <div className={styles.field}>
      <span className={styles.label}>Engine</span>
      <div className={styles.choiceGrid} role="radiogroup" aria-label="Engine">
        {options.filter((item) => allowedEngines.includes(item.value)).map((item) => (
          <button
            key={item.value}
            type="button"
            className={value === item.value ? styles.choiceActive : styles.choice}
            onClick={() => onChange(item.value)}
            role="radio"
            aria-checked={value === item.value}
          >
            <strong>{item.label}</strong>
            {showDescription ? <small>{item.description}</small> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HbxTargetTypeSelector({
  value,
  onChange,
  allowedTypes = ["pj", "pf", "agenda_pf"],
}: {
  value: HbxTargetTypeValue;
  onChange: (value: HbxTargetTypeValue) => void;
  allowedTypes?: HbxTargetTypeValue[];
}) {
  const options: Array<{ value: HbxTargetTypeValue; label: string; description: string }> = [
    { value: "pj", label: "PJ — Empresas/CNPJ", description: "Empresas e negócios locais." },
    { value: "pf", label: "PF — Pessoas públicas", description: "Pessoas em páginas públicas." },
    { value: "agenda_pf", label: "Agenda PF", description: "Agenda pública regional." },
    { value: "both", label: "PF + PJ", description: "Somente MASTER." },
  ];

  return (
    <div className={styles.field}>
      <span className={styles.label}>Tipo</span>
      <div className={styles.choiceGrid} role="radiogroup" aria-label="Tipo">
        {options.filter((item) => allowedTypes.includes(item.value)).map((item) => (
          <button
            key={item.value}
            type="button"
            className={value === item.value ? styles.choiceActive : styles.choice}
            onClick={() => onChange(item.value)}
            role="radio"
            aria-checked={value === item.value}
          >
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function HbxQuantitySelector({
  value,
  onChange,
  options,
  limitLabel,
  helperText,
}: {
  value: number;
  onChange: (value: number) => void;
  options: number[];
  limitLabel: string;
  helperText?: string;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{limitLabel}</span>
      <select className={styles.select} value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option} {limitLabel.toLowerCase().includes("limite") ? "por dia" : "contatos"}
          </option>
        ))}
      </select>
      {helperText ? <small className={styles.helper}>{helperText}</small> : null}
    </label>
  );
}

function hasAdvancedFilterValue(value: unknown) {
  if (typeof value === "boolean") return value;
  return String(value ?? "").trim().length > 0;
}

export function HbxAdvancedFilters({
  filters,
  onChange,
  mode,
}: {
  filters: HbxAdvancedFiltersValue;
  onChange: (value: HbxAdvancedFiltersValue) => void;
  mode: "automation" | "webscraping" | "radar" | "master";
}) {
  const [open, setOpen] = useState(false);
  const canUseBusinessQuality = true;
  const canUseRadarFilters = mode === "radar";
  const canUseWebsiteFilters = mode !== "master";
  const activeSummary = [
    hasAdvancedFilterValue(filters.minRating) ? `nota >= ${filters.minRating}` : "",
    hasAdvancedFilterValue(filters.minReviews) ? `${filters.minReviews} avaliações` : "",
    filters.onlyWithWebsite ? "com website" : "",
    filters.noWebsite ? "sem website" : "",
    filters.highOpportunity ? "alta oportunidade" : "",
    hasAdvancedFilterValue(filters.ddd) ? `DDD ${filters.ddd}` : "",
    hasAdvancedFilterValue(filters.scoreRange) ? `score ${filters.scoreRange}` : "",
    hasAdvancedFilterValue(filters.status) ? `status ${filters.status}` : "",
  ].filter(Boolean);

  const update = (patch: HbxAdvancedFiltersValue) => onChange({ ...filters, ...patch });

  return (
    <div className={styles.advanced}>
      <button type="button" className={styles.advancedToggle} onClick={() => setOpen((value) => !value)}>
        <span>Filtros avançados</span>
        <small>{activeSummary.length ? activeSummary.join(" · ") : "Nenhum filtro ativo"}</small>
      </button>

      {open ? (
        <div className={styles.advancedGrid}>
          {canUseBusinessQuality ? (
            <>
              <label className={styles.field}>
                <span className={styles.label}>Avaliação mínima</span>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={filters.minRating ?? ""}
                  onChange={(event) => update({ minRating: event.target.value })}
                  placeholder="Opcional"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Mínimo de avaliações</span>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="1"
                  value={filters.minReviews ?? ""}
                  onChange={(event) => update({ minReviews: event.target.value })}
                  placeholder="Opcional"
                />
              </label>
            </>
          ) : null}

          {canUseRadarFilters ? (
            <>
              <label className={styles.field}>
                <span className={styles.label}>DDD</span>
                <input
                  className={styles.input}
                  value={filters.ddd ?? ""}
                  onChange={(event) => update({ ddd: event.target.value.replace(/\D/g, "").slice(0, 2) })}
                  placeholder="19"
                  inputMode="numeric"
                  maxLength={2}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Score/oportunidade</span>
                <select className={styles.select} value={filters.scoreRange ?? ""} onChange={(event) => update({ scoreRange: event.target.value })}>
                  <option value="">Todos</option>
                  <option value="high">Alta oportunidade</option>
                  <option value="medium">Média oportunidade</option>
                  <option value="low">Baixa oportunidade</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Status</span>
                <select className={styles.select} value={filters.status ?? ""} onChange={(event) => update({ status: event.target.value })}>
                  <option value="">Todos</option>
                  <option value="clean">Novo</option>
                  <option value="approved">Aprovado</option>
                  <option value="sent_to_vendas">Em Vendas</option>
                  <option value="in_attendance">Em atendimento</option>
                  <option value="converted">Convertido</option>
                  <option value="contacted">Contato feito</option>
                  <option value="no_whatsapp">Contato inválido</option>
                  <option value="discarded">Descartado</option>
                  <option value="negative">Negativo</option>
                  <option value="blocked">Bloqueado</option>
                  <option value="opt_out">Opt-out</option>
                </select>
              </label>
            </>
          ) : null}

          {canUseWebsiteFilters ? (
            <div className={styles.checkGrid}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={filters.onlyWithWebsite === true}
                  onChange={(event) => update({ onlyWithWebsite: event.target.checked, noWebsite: event.target.checked ? false : filters.noWebsite })}
                />
                <span>Somente com website</span>
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={filters.noWebsite === true}
                  onChange={(event) => update({ noWebsite: event.target.checked, onlyWithWebsite: event.target.checked ? false : filters.onlyWithWebsite })}
                />
                <span>Sem website</span>
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={filters.highOpportunity === true}
                  onChange={(event) => update({ highOpportunity: event.target.checked })}
                />
                <span>Alta oportunidade</span>
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
