"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { isValidMapCoordinate, OPENFREEMAP_STYLE_URL } from "@/lib/openfreemap";

import type { TrackingHistoryPoint, TrackingPosition } from "./tracking-live-api";

const MAP_LOAD_TIMEOUT_MS = 10_000;
const TRAIL_SOURCE_ID = "hbx-tracking-trail";
const TRAIL_LAYER_ID = "hbx-tracking-trail-line";

interface TrackingLiveMapProps {
  sessionId: string;
  driverName: string;
  points: TrackingHistoryPoint[];
  currentPosition: TrackingPosition | null;
}

type MapPoint = {
  latitude: number;
  longitude: number;
  capturedAt: string;
};

function cssToken(element: Element, name: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}

function toValidPoint(point: TrackingPosition | TrackingHistoryPoint): MapPoint | null {
  if (!isValidMapCoordinate(point.latitude, point.longitude)) return null;
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    capturedAt: point.capturedAt,
  };
}

export function TrackingLiveMap({ sessionId, driverName, points, currentPosition }: TrackingLiveMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const fittedSessionRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const validPoints = useMemo(() => {
    const trail = points
      .map(toValidPoint)
      .filter((point): point is MapPoint => point !== null)
      .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
    const current = currentPosition ? toValidPoint(currentPosition) : null;
    if (current) {
      const last = trail[trail.length - 1];
      if (!last || last.capturedAt !== current.capturedAt) trail.push(current);
    }
    return trail;
  }, [currentPosition, points]);

  const hasPosition = validPoints.length > 0;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let loadTimer: number | null = null;
    const mapElement = document.createElement("div");
    mapElement.className = "log-live-map__gl";
    host.appendChild(mapElement);

    let map: maplibregl.Map;
    try {
      const first = validPoints[0];
      map = new maplibregl.Map({
        container: mapElement,
        style: OPENFREEMAP_STYLE_URL,
        center: first ? [first.longitude, first.latitude] : [-47.8825, -15.7942],
        zoom: first ? 13 : 4,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    } catch {
      mapElement.remove();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fallback necessário quando WebGL não pode ser inicializado.
      setFailed(true);
      return;
    }

    mapRef.current = map;
    fittedSessionRef.current = null;

    map.on("load", () => {
      if (!cancelled) setReady(true);
    });
    // Um tile isolado pode falhar e se recuperar; o timeout é quem decide se o
    // mapa inteiro ficou indisponível.
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
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapElement.remove();
      mapRef.current = null;
      fittedSessionRef.current = null;
      setReady(false);
    };
    // O mapa é recriado apenas quando passa a ter posição ou o usuário tenta
    // novamente; os pontos seguintes atualizam source/marker sem novo WebGL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, hasPosition]);

  useEffect(() => {
    const map = mapRef.current;
    const host = hostRef.current;
    if (!map || !host || !ready || validPoints.length === 0) return;

    const coordinates: [number, number][] = validPoints.map((point) => [point.longitude, point.latitude]);
    const trail: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coordinates.length > 1 ? coordinates : [] },
    };

    const source = map.getSource(TRAIL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(trail);
    } else {
      map.addSource(TRAIL_SOURCE_ID, { type: "geojson", data: trail });
      map.addLayer({
        id: TRAIL_LAYER_ID,
        type: "line",
        source: TRAIL_SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": cssToken(host, "--hbx-brand-strong", cssToken(host, "--hbx-brand", "gray")),
          "line-width": 4,
          "line-opacity": 0.82,
        },
      });
    }

    const latest = validPoints[validPoints.length - 1];
    const latestLngLat: [number, number] = [latest.longitude, latest.latitude];
    if (markerRef.current) {
      markerRef.current.setLngLat(latestLngLat);
    } else {
      const marker = document.createElement("div");
      marker.className = "log-live-map__driver";
      marker.setAttribute("aria-label", `Posição atual de ${driverName}`);
      marker.title = `Posição atual de ${driverName}`;
      markerRef.current = new maplibregl.Marker({ element: marker, anchor: "center" })
        .setLngLat(latestLngLat)
        .addTo(map);
    }

    if (fittedSessionRef.current !== sessionId) {
      fittedSessionRef.current = sessionId;
      const bounds = new maplibregl.LngLatBounds();
      coordinates.forEach((coordinate) => bounds.extend(coordinate));
      if (coordinates.length === 1) map.jumpTo({ center: latestLngLat, zoom: 15 });
      else map.fitBounds(bounds, { padding: 54, maxZoom: 16, duration: 0 });
    } else {
      map.easeTo({ center: latestLngLat, duration: 450 });
    }
  }, [driverName, ready, sessionId, validPoints]);

  return (
    <div className="log-live-map">
      <div className="log-live-map__canvas" ref={hostRef} aria-label={`Trajeto de ${driverName}`} />
      {!ready && !failed ? <div className="log-live-map__state">Carregando mapa…</div> : null}
      {ready && !failed && !hasPosition ? (
        <div className="log-live-map__empty-note">
          <strong>Posição ainda não recebida</strong>
          <span>O mapa acende com o primeiro sinal do motorista.</span>
        </div>
      ) : null}
      {failed ? (
        <div className="log-live-map__state log-live-map__state--error" role="alert">
          <strong>Mapa indisponível</strong>
          <span>Confira a conexão e tente novamente.</span>
          <button
            type="button"
            className="btn-ghost btn-xs"
            onClick={() => {
              setFailed(false);
              setReady(false);
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
    </div>
  );
}
