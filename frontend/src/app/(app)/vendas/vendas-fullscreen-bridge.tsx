"use client";

import { useEffect } from "react";

const LEAD_SELECTOR = [
  "tr[id^='vnd-row-']",
  ".vnd-card",
].join(",");

const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "[role='button']",
  "[role='checkbox']",
  "[contenteditable='true']",
].join(",");

function leadFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const lead = target.closest<HTMLElement>(LEAD_SELECTOR);
  if (!lead) return null;
  if (!lead.closest("#vendas-panel-funil.vnd-layer.is-on")) return null;
  return lead;
}

function openCockpit(lead: HTMLElement) {
  lead.classList.remove("is-cockpit-opening");
  void lead.offsetWidth;
  lead.classList.add("is-cockpit-opening");

  // O handler real já existe no card/linha como onDoubleClick. Dispará-lo aqui
  // preserva toda a lógica atual do cockpit sem duplicar estado ou endpoints.
  lead.dispatchEvent(new MouseEvent("dblclick", {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    detail: 2,
  }));

  window.setTimeout(() => lead.classList.remove("is-cockpit-opening"), 520);
}

export function VendasFullscreenBridge() {
  useEffect(() => {
    let frame = 0;

    const decorate = () => {
      document
        .querySelectorAll<HTMLElement>(`#vendas-panel-funil ${LEAD_SELECTOR}`)
        .forEach((lead) => {
          lead.dataset.cockpitOpen = "single-click";
          if (!lead.hasAttribute("tabindex")) lead.tabIndex = 0;
          if (!lead.hasAttribute("title")) lead.title = "Clique para abrir os detalhes completos";
        });
    };

    const scheduleDecorate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(decorate);
    };

    const handleClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest(INTERACTIVE_SELECTOR)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;

      const lead = leadFromTarget(event.target);
      if (!lead) return;

      // Aguarda o onClick atual selecionar o lead; no frame seguinte o mesmo
      // card abre o cockpit grande com Atendimento, Cadastro e Financeiro.
      window.requestAnimationFrame(() => openCockpit(lead));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.matches(INTERACTIVE_SELECTOR) || event.target.closest(INTERACTIVE_SELECTOR)) return;
      const lead = leadFromTarget(event.target);
      if (!lead) return;
      event.preventDefault();
      openCockpit(lead);
    };

    decorate();
    const observer = new MutationObserver(scheduleDecorate);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return null;
}
