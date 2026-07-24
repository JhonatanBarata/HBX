"use client";

// ================================================================
// LOGISTICA-MOBILE B2 — mapa embutido da rota (visão geral).
// MapLibre GL JS + tiles OpenFreeMap (R$0, sem chave). O Waze CONTINUA sendo
// o turn-by-turn (deep-link "Navegar" já existente) — este mapa é só pra ver
// as paradas + a bolinha do entregador de relance, sem sair do app.
//
// Client-only por natureza (WebGL/`navigator`/`window`): só é importado via
// next/dynamic({ ssr:false }) em page.client.tsx — nunca roda no server.
//
// PROGRESSIVO/best-effort (Lei do PLANO B2): sem paradas com coordenada, sem
// rede, tiles fora do ar ou WebGL indisponível → o painel simplesmente NÃO
// aparece (`return null`). Zero erro na tela, zero watcher de GPS novo (a
// posição do entregador vem de fora, já capturada pelo useGeofence).
// ================================================================

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { OPENFREEMAP_STYLE_URL } from "@/lib/openfreemap";

import type { RotaItem } from "./entrega-api";
import type { PosicaoAoVivo } from "./entrega-hooks";

// Sem 'load' dentro desse prazo = trata como indisponível (offline / tiles fora do ar).
const CARREGAR_TIMEOUT_MS = 9000;

interface RotaMapaProps {
  /** Paradas ABERTAS, na ordem da rota (mesma fonte do carrossel — abertas). */
  paradas: RotaItem[];
  /** Índice da parada atual dentro de `paradas` (sincroniza com o swipe). */
  indiceAtual: number;
  /** Tocar um pino → mesma função do dot do carrossel (vai pro slide). */
  onSelecionarParada: (indice: number) => void;
  /** Última posição do entregador capturada pelo geofence (null = sem fix ainda). */
  posicaoEntregador: PosicaoAoVivo | null;
}

type PontoValido = { p: RotaItem; i: number; lat: number; lng: number };

/** Lê um token --ent-* já resolvido (cor real, não var()) — pro paint do WebGL. */
function lerTokenCor(el: Element, nome: string): string {
  const v = getComputedStyle(el).getPropertyValue(nome).trim();
  return v || "gray";
}

function pontosValidos(paradas: RotaItem[]): PontoValido[] {
  const out: PontoValido[] = [];
  paradas.forEach((p, i) => {
    if (typeof p.cliente.lat === "number" && typeof p.cliente.lng === "number") {
      out.push({ p, i, lat: p.cliente.lat, lng: p.cliente.lng });
    }
  });
  return out;
}

export function RotaMapa({ paradas, indiceAtual, onSelecionarParada, posicaoEntregador }: RotaMapaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinsRef = useRef<Array<{ i: number; marker: maplibregl.Marker }>>([]);
  const meuMarkerRef = useRef<maplibregl.Marker | null>(null);
  const fitFeitoRef = useRef(false);
  const onSelecionarRef = useRef(onSelecionarParada);
  // eslint-disable-next-line react-hooks/refs -- padrão "latest ref" pra evitar closure velha no useEffect do mapa abaixo
  onSelecionarRef.current = onSelecionarParada;

  const [pronto, setPronto] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [expandido, setExpandido] = useState(false);

  const pontos = pontosValidos(paradas);
  const temPontos = pontos.length > 0;

  // ── cria o mapa 1× quando a rota passa a ter coordenada (destrói se sumir) ──
  // O nó que vira `container` do MapLibre é criado NA MÃO (não é o `containerRef`
  // React em si, e sim um filho dele) e destruído explicitamente no cleanup: em
  // dev, o React roda mount→cleanup→mount 2× (StrictMode) pra pegar side-effect
  // mal limpo — reusar o MESMO elemento DOM pras duas instâncias de mapa faz a
  // segunda nunca disparar `load` (o MapLibre guarda estado interno no nó). Um
  // <div> novo a cada execução do efeito isola as duas por completo.
  useEffect(() => {
    const host = containerRef.current;
    if (!host || !temPontos) return;
    let cancelado = false;
    let falhaTimerId: number | null = null;
    let visListener: (() => void) | null = null;

    const glEl = document.createElement("div");
    glEl.className = "ent-map-rota__gl";
    host.appendChild(glEl);

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: glEl,
        style: OPENFREEMAP_STYLE_URL,
        center: [pontos[0].lng, pontos[0].lat],
        zoom: 12,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
    } catch {
      // WebGL indisponível/bloqueado — degrada gracioso (container some).
      host.removeChild(glEl);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fallback síncrono quando o construtor do MapLibre lança (sem WebGL); efeito legítimo
      setFalhou(true);
      return;
    }
    mapRef.current = map;
    fitFeitoRef.current = false;

    map.on("load", () => {
      if (!cancelado) setPronto(true);
    });
    // Erro de tile isolado não derruba o painel — só o timeout abaixo trata
    // "rede fora do ar" (o style inteiro não carregou).
    map.on("error", () => {});

    // A checagem dá outra chance se a aba estava em BACKGROUND no prazo (o
    // browser pausa o render loop de WebGL de aba oculta sozinho — isso NÃO é
    // "tile fora do ar", é só o navegador economizando bateria; contar como
    // falha aqui derrubaria o mapa toda vez que o entregador trocasse de app
    // no meio do carregamento). Só marca `falhou` de fato com a aba visível.
    const armarChecagem = () => {
      falhaTimerId = window.setTimeout(() => {
        if (cancelado || map.loaded()) return;
        if (document.visibilityState === "hidden") {
          visListener = () => {
            if (document.visibilityState !== "hidden") {
              document.removeEventListener("visibilitychange", visListener!);
              visListener = null;
              armarChecagem();
            }
          };
          document.addEventListener("visibilitychange", visListener);
          return;
        }
        setFalhou(true);
      }, CARREGAR_TIMEOUT_MS);
    };
    armarChecagem();

    return () => {
      cancelado = true;
      if (falhaTimerId != null) window.clearTimeout(falhaTimerId);
      if (visListener) document.removeEventListener("visibilitychange", visListener);
      pinsRef.current.forEach(({ marker }) => marker.remove());
      pinsRef.current = [];
      meuMarkerRef.current?.remove();
      meuMarkerRef.current = null;
      map.remove();
      glEl.remove();
      mapRef.current = null;
      setPronto(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só recria na virada sem-pontos/com-pontos
  }, [temPontos]);

  // ── pinos numerados + polyline (recalcula quando a ROTA muda, não a cada tick de GPS) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto) return;
    const el = containerRef.current;
    if (!el) return;

    pinsRef.current.forEach(({ marker }) => marker.remove());
    pinsRef.current = pontos.map(({ i, lat, lng }) => {
      const pinEl = document.createElement("div");
      pinEl.className = "ent-map-rota__pin" + (i === indiceAtual ? " is-current" : "");
      const num = document.createElement("span");
      num.className = "ent-map-rota__pin-num";
      // FIX rota: numeração SEQUENCIAL pela posição (paradas já vem ordenado por
      // rotaOrdem do backend). i é o índice na lista de abertas = a sequência real.
      num.textContent = String(i + 1);
      pinEl.appendChild(num);
      pinEl.addEventListener("click", () => onSelecionarRef.current(i));
      const marker = new maplibregl.Marker({ element: pinEl, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
      return { i, marker };
    });

    const brand = lerTokenCor(el, "--ent-brand");
    const coords: [number, number][] = [];
    if (posicaoEntregador) coords.push([posicaoEntregador.lng, posicaoEntregador.lat]);
    pontos.forEach(({ lat, lng }) => coords.push([lng, lat]));
    const linha: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords.length >= 2 ? coords : [] },
    };
    const fonte = map.getSource("ent-rota-linha") as maplibregl.GeoJSONSource | undefined;
    if (fonte) {
      fonte.setData(linha);
    } else {
      map.addSource("ent-rota-linha", { type: "geojson", data: linha });
      map.addLayer(
        {
          id: "ent-rota-linha",
          type: "line",
          source: "ent-rota-linha",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": brand, "line-width": 3, "line-opacity": 0.8 },
        },
        // paradas ABAIXO dos rótulos do mapa mas os pinos (HTML) ficam por cima de tudo naturalmente.
      );
    }

    // Visão geral 1× (primeiro fit): enquadra todos os pontos + a posição atual.
    if (!fitFeitoRef.current) {
      fitFeitoRef.current = true;
      const bounds = new maplibregl.LngLatBounds();
      pontos.forEach(({ lat, lng }) => bounds.extend([lng, lat]));
      if (posicaoEntregador) bounds.extend([posicaoEntregador.lng, posicaoEntregador.lat]);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 44, maxZoom: 15, duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage à ROTA (paradas); posição/indice têm efeitos próprios abaixo
  }, [pronto, paradas]);

  // ── realça o pino da parada ATUAL (swipe) sem recriar os demais ────────────
  useEffect(() => {
    pinsRef.current.forEach(({ i, marker }) => {
      marker.getElement().classList.toggle("is-current", i === indiceAtual);
    });
    const map = mapRef.current;
    if (!map || !pronto) return;
    const atual = pontos.find((pt) => pt.i === indiceAtual);
    if (atual) map.easeTo({ center: [atual.lng, atual.lat], duration: 260 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à troca de parada atual
  }, [indiceAtual, pronto]);

  // ── bolinha do entregador ao vivo (setLngLat barato — sem recriar marker) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pronto || !posicaoEntregador) return;
    const ll: [number, number] = [posicaoEntregador.lng, posicaoEntregador.lat];
    if (meuMarkerRef.current) {
      meuMarkerRef.current.setLngLat(ll);
    } else {
      const el = document.createElement("div");
      el.className = "ent-map-rota__you";
      meuMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(ll).addTo(map);
    }
    // atualiza a linha (origem móvel) sem re-fit nem recriar pinos.
    const fonte = map.getSource("ent-rota-linha") as maplibregl.GeoJSONSource | undefined;
    if (fonte && pontos.length > 0) {
      const coords: [number, number][] = [ll, ...pontos.map((pt): [number, number] => [pt.lng, pt.lat])];
      fonte.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à posição ao vivo
  }, [posicaoEntregador, pronto]);

  // ── expandir/recolher: o container muda de altura via CSS; ResizeObserver
  //    avisa o MapLibre pra recalcular o canvas (senão o mapa fica cortado). ──
  useEffect(() => {
    const el = containerRef.current;
    const map = mapRef.current;
    if (!el || !map || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [pronto]);

  if (!temPontos || falhou) return null;

  return (
    <div className={`ent-map-rota${expandido ? " is-expanded" : ""}`} data-swipe-opt-out="true">
      <div className="ent-map-rota__canvas" ref={containerRef} />
      <button
        type="button"
        className="ent-map-rota__toggle"
        aria-label={expandido ? "Recolher mapa" : "Expandir mapa"}
        aria-expanded={expandido}
        onClick={() => setExpandido((v) => !v)}
      >
        <span className="ent-map-rota__toggle-icon" aria-hidden="true">
          ›
        </span>
      </button>
    </div>
  );
}
