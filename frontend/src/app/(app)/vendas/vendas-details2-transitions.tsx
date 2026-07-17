"use client";

import { useEffect } from "react";

const TYPE_SELECTOR = [
  ".lead-cockpit__txt",
  ".lead-cockpit__preview-subj",
  ".copiloto__hint",
  ".lead-cockpit__noconn .hint",
  ".lead-cockpit__noconn .muted-note",
].join(",");

function activeTab(root: HTMLElement): string {
  const selected = root.querySelector<HTMLElement>('.lead-cockpit__tab[aria-selected="true"]');
  const text = selected?.textContent?.trim().toLowerCase() || "atendimento";
  if (text.includes("cadastro")) return "cadastro";
  if (text.includes("financeiro")) return "financeiro";
  return "atendimento";
}

function animateScore(root: HTMLElement) {
  const badge = root.querySelector<HTMLElement>(".lead-cockpit__score");
  if (!badge || badge.dataset.vndScoreReady === "1") return;

  const target = Math.max(0, Math.min(100, Number(badge.textContent?.match(/\d+/)?.[0] || 0)));
  badge.dataset.vndScoreReady = "1";
  badge.setAttribute("aria-label", `Score de oportunidade ${target} de 100`);
  badge.innerHTML = '<strong class="vnd-d2-score-number">0</strong><small>/100</small>';

  const number = badge.querySelector<HTMLElement>(".vnd-d2-score-number");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (reduceMotion) {
    if (number) number.textContent = String(target);
    badge.style.setProperty("--vnd-d2-score", `${target}%`);
    return;
  }

  let started = 0;
  const duration = 1550;
  const tick = (time: number) => {
    if (!started) started = time;
    const progress = Math.min(1, (time - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * eased);
    if (number) number.textContent = String(value);
    badge.style.setProperty("--vnd-d2-score", `${value}%`);
    if (progress < 1) window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

function animateText(element: HTMLElement, order: number) {
  if (element.dataset.vndTyped || element.children.length > 0) return;
  const text = element.textContent?.trim() || "";
  if (text.length < 12 || text.length > 520) return;

  element.dataset.vndTyped = "running";
  element.textContent = "";
  element.classList.add("vnd-d2-typing");

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (reduceMotion) {
    element.textContent = text;
    element.dataset.vndTyped = "done";
    element.classList.remove("vnd-d2-typing");
    return;
  }

  let index = 0;
  const delay = Math.min(300, 55 + order * 42);
  window.setTimeout(() => {
    const interval = window.setInterval(() => {
      index += 1;
      element.textContent = text.slice(0, index);
      if (index >= text.length) {
        window.clearInterval(interval);
        element.dataset.vndTyped = "done";
        element.classList.remove("vnd-d2-typing");
      }
    }, 18);
  }, delay);
}

function decorate(root: HTMLElement) {
  root.classList.add("vnd-d2-live");
  root.dataset.vndTab = activeTab(root);
  animateScore(root);
  root.querySelectorAll<HTMLElement>(TYPE_SELECTOR).forEach((element, index) => animateText(element, index));
}

export function VendasDetails2Transitions() {
  useEffect(() => {
    let frame = 0;
    const locate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        document.querySelectorAll<HTMLElement>(".hbx-modal.lead-cockpit").forEach(decorate);
      });
    };

    const observer = new MutationObserver(locate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-selected"],
    });
    document.addEventListener("click", locate, true);
    locate();

    return () => {
      observer.disconnect();
      document.removeEventListener("click", locate, true);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
