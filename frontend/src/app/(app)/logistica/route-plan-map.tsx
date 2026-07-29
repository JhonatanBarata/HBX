"use client";

// PR29072026 — mapa da rota EM MONTAGEM (/logistica no computador).
// Paridade com o APK: quem monta vê onde as paradas caem, na ordem, com o
// traçado viário real (proxy OSRM do backend — `/logistica/osrm/route`).
//
// 🔴 A CÂMERA TEM UM DONO SÓ (lição que custou piscada no APK): o mapa só
// reenquadra quando a ASSINATURA dos pontos muda (ordem + coordenadas). Sem
// isso, cada re-render da conferência puxava a câmera de volta e o operador
// não conseguia arrastar o mapa pra lugar nenhum.
//
// WebGL não lê `var()`: as cores saem de getComputedStyle sobre o host (mesmo
// caminho do TrackingLiveMap), então tema claro/escuro continua valendo.

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { isValidMapCoordinate, OPENFREEMAP_STYLE_URL } from "@/lib/openfreemap";

import { getRoadGeometry } from "./route-conference-api";
import styles from "./route-builder.module.css";

const LINE_SOURCE_ID = "hbx-plan-line";
const LINE_LAYER_ID = "hbx-plan-line-layer";
const MAP_LOAD_TIMEOUT_MS = 10_000;

export type PlanMapStop = {
  id: string;
  nome: string;
  lat: number | null;
  lng: number | null;
  alerta: boolean;
};

function cssToken(element: Element, name: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}

export function RoutePlanMap({ stops }: { stops: PlanMapStop[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const fittedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const pontos = useMemo(
    () => stops.filter((stop) => isValidMapCoordinate(Number(stop.lat), Number(stop.lng))),
    [stops],
  );
  // A assinatura é o que a câmera escuta — muda só quando a ordem ou alguma
  // coordenada muda de verdade (mexer nas setas ▲▼ reenquadra; re-render não).
  const assinatura = useMemo(
    () => pontos.map((stop) => `${stop.id}:${Number(stop.lat).toFixed(5)},${Number(stop.lng).toFixed(5)}`).join("|"),
    [pontos],
  );
  const temPonto = pontos.length > 0;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let loadTimer: number | null = null;
    const mapElement = document.createElement("div");
    mapElement.className = styles.mapGl;
    host.appendChild(mapElement);

    let map: maplibregl.Map;
    try {
      const primeiro = pontos[0];
      map = new maplibregl.Map({
        container: mapElement,
        style: OPENFREEMAP_STYLE_URL,
        center: primeiro ? [Number(primeiro.lng), Number(primeiro.lat)] : [-47.8825, -15.7942],
        zoom: primeiro ? 12 : 4,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    } catch {
      mapElement.remove();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fallback quando o WebGL não inicializa.
      setFailed(true);
      return;
    }

    mapRef.current = map;
    fittedRef.current = null;
    map.on("load", () => { if (!cancelled) setReady(true); });
    map.on("error", () => {});
    loadTimer = window.setTimeout(() => {
      if (!cancelled && !map.loaded() && document.visibilityState === "visible") setFailed(true);
    }, MAP_LOAD_TIMEOUT_MS);

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.resize()) : null;
    resizeObserver?.observe(host);

    return () => {
      cancelled = true;
      if (loadTimer !== null) window.clearTimeout(loadTimer);
      resizeObserver?.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapElement.remove();
      mapRef.current = null;
      fittedRef.current = null;
      setReady(false);
    };
    // Recria só quando passa a ter ponto (ou no "tentar de novo"); ponto novo
    // depois disso atualiza marcador/linha sem WebGL novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, temPonto]);

  // Pinos numerados — recriados quando a sequência muda (o número faz parte do pino).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = pontos.map((stop, index) => {
      const element = document.createElement("div");
      element.className = `${styles.mapPin}${stop.alerta ? ` ${styles.mapPinAlert}` : ""}`;
      element.textContent = String(index + 1);
      element.title = stop.nome;
      element.setAttribute("aria-label", `Parada ${index + 1}: ${stop.nome}`);
      return new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([Number(stop.lng), Number(stop.lat)])
        .addTo(map);
    });
  }, [assinatura, pontos, ready]);

  // Traçado: reta na hora (resposta imediata) e o viário real por cima quando o
  // OSRM responde. OSRM fora do ar = fica a reta, nunca some o mapa.
  useEffect(() => {
    const map = mapRef.current;
    const host = hostRef.current;
    if (!map || !host || !ready) return;
    let cancelled = false;

    const retas: Array<[number, number]> = pontos.map((stop) => [Number(stop.lng), Number(stop.lat)]);
    const desenhar = (coordinates: Array<[number, number]>) => {
      const linha: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coordinates.length > 1 ? coordinates : [] },
      };
      const source = map.getSource(LINE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (source) { source.setData(linha); return; }
      map.addSource(LINE_SOURCE_ID, { type: "geojson", data: linha });
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: LINE_SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": cssToken(host, "--hbx-brand-strong", cssToken(host, "--hbx-brand", "gray")),
          "line-width": 4,
          "line-opacity": 0.75,
        },
      });
    };

    desenhar(retas);
    void getRoadGeometry(pontos.map((stop) => ({ lat: Number(stop.lat), lng: Number(stop.lng) })))
      .then((viaria) => { if (!cancelled && viaria) desenhar(viaria); });

    return () => { cancelled = true; };
  }, [assinatura, pontos, ready]);

  // Enquadramento: SÓ quando a assinatura muda.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !pontos.length || fittedRef.current === assinatura) return;
    fittedRef.current = assinatura;
    if (pontos.length === 1) {
      map.jumpTo({ center: [Number(pontos[0].lng), Number(pontos[0].lat)], zoom: 15 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    pontos.forEach((stop) => bounds.extend([Number(stop.lng), Number(stop.lat)]));
    map.fitBounds(bounds, { padding: 52, maxZoom: 16, duration: 420 });
  }, [assinatura, pontos, ready]);

  const semCoordenada = stops.length - pontos.length;

  return (
    <div className={styles.map}>
      <div className={styles.mapCanvas} ref={hostRef} aria-label="Mapa da rota em montagem" />
      {!ready && !failed ? <span className={styles.mapState}>Carregando mapa…</span> : null}
      {ready && !failed && !temPonto ? <span className={styles.mapState}>Nenhuma parada com localização.</span> : null}
      {ready && !failed && temPonto && semCoordenada > 0 ? (
        <span className={styles.mapNote}>
          {semCoordenada} {semCoordenada === 1 ? "parada fora do mapa" : "paradas fora do mapa"}
        </span>
      ) : null}
      {failed ? (
        <span className={`${styles.mapState} ${styles.mapStateError}`} role="alert">
          Mapa indisponível.
          <button
            type="button"
            className={styles.mapRetry}
            onClick={() => { setFailed(false); setReady(false); setAttempt((value) => value + 1); }}
          >
            Tentar de novo
          </button>
        </span>
      ) : null}
    </div>
  );
}
