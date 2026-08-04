"use client";

// COCKPIT (03/08) — O MAPA DO PALCO.
//
// A primeira versão do cockpit pendurou o TrackingLiveMap cru no centro: um
// mapa que só mostra a posição de quem tem rastreamento ativo — na prática,
// quase sempre vazio ("Posição ainda não recebida"). O mock prometia outra
// coisa, e é isso que este arquivo entrega:
//   · um PINO NUMERADO por parada do dia (a ordem da rota no mapa);
//   · a trilha do motorista selecionado;
//   · o pino do próprio motorista (crachá com iniciais), pulsando quando é o
//     selecionado;
//   · o chip "N sem ponto no mapa" — o problema aparece ONDE ele dói.
//
// Decisões herdadas de quem já pagou bug de mapa neste repo:
//   · pinos são DOM markers (não layer de símbolo): herdam o CSS da página,
//     então tema claro/escuro sai de graça e o fiscal de pele continua valendo;
//   · a CÂMERA TEM UM DONO SÓ: enquadra quando a ASSINATURA das coordenadas
//     muda, nunca a cada render (lição do APK — re-enquadrar em cima do
//     usuário que estava olhando um canto é roubar o mapa da mão dele).

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useEffect, useMemo, useRef } from "react";

import { isValidMapCoordinate, OPENFREEMAP_STYLE_URL } from "@/lib/openfreemap";

import type { Parada } from "./cockpit-api";
import type { TrackingHistoryPoint, TrackingLiveRoute } from "./rastreamento/tracking-live-api";

const TRILHA_SOURCE = "cok-trilha";
const TRILHA_LAYER = "cok-trilha-linha";

/** Teto de aproximação (uma parada só não vira zoom de telhado). */
const ZOOM_MAXIMO = 15.5;

type PinoDado = {
  id: string;
  lat: number;
  lng: number;
  rotulo: string;
  estado: "feita" | "agora" | "fila" | "cobranca";
  nome: string;
};

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function CockpitMapa({
  stops,
  liveRoutes,
  trilha,
  selecionadoId,
  onOpenStop,
}: {
  stops: Parada[];
  /** Posições ao vivo de todos os motoristas com sessão de rastreamento. */
  liveRoutes: TrackingLiveRoute[];
  /** Trilha (histórico) do motorista selecionado, quando há. */
  trilha: TrackingHistoryPoint[];
  selecionadoId: number | null;
  onOpenStop: (stopId: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const prontoRef = useRef(false);
  const pinosRef = useRef(new Map<string, maplibregl.Marker>());
  const motoristasRef = useRef(new Map<number, maplibregl.Marker>());
  const assinaturaRef = useRef("");
  const onOpenStopRef = useRef(onOpenStop);

  useEffect(() => {
    onOpenStopRef.current = onOpenStop;
  }, [onOpenStop]);

  // ── Derivar os pinos (fora do ciclo do mapa) ─────────────────────────────
  const abertas = useMemo(
    () => stops.filter((s) => s.status === "agendada" || s.status === "em_rota"),
    [stops],
  );
  const semPonto = useMemo(
    () => abertas.filter((s) => !isValidMapCoordinate(Number(s.cliente.lat), Number(s.cliente.lng))).length,
    [abertas],
  );
  const pinos = useMemo<PinoDado[]>(() => {
    const agoraPorMotorista = new Map<number, string>();
    for (const stop of abertas) {
      const dono = Number(stop.entregador?.id);
      if (!dono || agoraPorMotorista.has(dono)) continue;
      agoraPorMotorista.set(dono, stop.id);
    }
    return stops
      .filter((s) => s.status !== "cancelada")
      .filter((s) => isValidMapCoordinate(Number(s.cliente.lat), Number(s.cliente.lng)))
      .map((s) => ({
        id: s.id,
        lat: Number(s.cliente.lat),
        lng: Number(s.cliente.lng),
        rotulo: s.status === "entregue" ? "✓" : typeof s.rotaOrdem === "number" ? String(s.rotaOrdem + 1) : "—",
        estado: s.status === "entregue"
          ? "feita" as const
          : s.somenteCobranca
            ? "cobranca" as const
            : agoraPorMotorista.get(Number(s.entregador?.id)) === s.id
              ? "agora" as const
              : "fila" as const,
        nome: s.cliente.nome || "Cliente",
      }));
  }, [abertas, stops]);

  // ── Nascimento e morte do mapa ───────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return;
    const map = new maplibregl.Map({
      container: host,
      style: OPENFREEMAP_STYLE_URL,
      center: [-51.9, -14.2],
      zoom: 3.4,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // Os efeitos de pintura abaixo se penduram no "load" quando chegam cedo
    // demais — aqui só vira a chave de pronto.
    map.on("load", () => { prontoRef.current = true; map.resize(); });
    mapRef.current = map;

    // 🔴 O MAPA MEDE O HOST UMA VEZ, NO NASCIMENTO. Enquanto o host do cockpit
    // não tinha altura (a classe `.log-cockpit-host` era referenciada e não
    // existia), o canvas nascia com ~90px e continuava desenhando nessa medida
    // mesmo depois do CSS certo — pino no lugar errado sem nada no console.
    // O observador cobre também o inspetor abrindo/fechando e o menu lateral
    // colapsando, que mudam a largura do palco sem passar por window.resize.
    const observador = new ResizeObserver(() => map.resize());
    observador.observe(host);

    return () => {
      observador.disconnect();
      prontoRef.current = false;
      pinosRef.current.forEach((m) => m.remove());
      pinosRef.current.clear();
      motoristasRef.current.forEach((m) => m.remove());
      motoristasRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Pinos das paradas (reconciliação por id — nunca recriar tudo) ────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const pintar = () => {
      const vivos = new Set<string>();
      for (const pino of pinos) {
        vivos.add(pino.id);
        const existente = pinosRef.current.get(pino.id);
        if (existente) {
          existente.setLngLat([pino.lng, pino.lat]);
          const el = existente.getElement();
          // 🔴 NUNCA `el.className = …` aqui: o elemento é do maplibre, e é a
          // classe `maplibregl-marker` (que ele põe) que carrega o
          // `position:absolute` do posicionamento. Sobrescrever a className
          // apagava ela — os pinos largavam o mapa e empilhavam em coluna no
          // canto (print do dono, 03/08 19h). Elemento entregue a uma lib que
          // o posiciona por classe própria não é meu: eu só ADICIONO e REMOVO
          // as MINHAS classes nele.
          el.classList.remove("is-feita", "is-agora", "is-fila", "is-cobranca");
          el.classList.add(`is-${pino.estado}`);
          el.textContent = pino.rotulo;
          el.setAttribute("aria-label", `Abrir ${pino.nome}`);
          continue;
        }
        const el = document.createElement("button");
        el.type = "button";
        el.className = `cok-pino is-${pino.estado}`;
        el.textContent = pino.rotulo;
        el.setAttribute("aria-label", `Abrir ${pino.nome}`);
        // O listener vive tanto quanto o marker; o callback, não. O ref garante
        // que um pino antigo sempre abre os dados mais novos da parada.
        el.addEventListener("click", () => onOpenStopRef.current(pino.id));
        pinosRef.current.set(
          pino.id,
          new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([pino.lng, pino.lat]).addTo(map),
        );
      }
      for (const [id, marker] of pinosRef.current) {
        if (!vivos.has(id)) { marker.remove(); pinosRef.current.delete(id); }
      }

      // A câmera: só quando o CONJUNTO de coordenadas muda.
      const assinatura = pinos.map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
      if (assinatura !== assinaturaRef.current) {
        assinaturaRef.current = assinatura;
        if (!assinatura) return;
        const bounds = new maplibregl.LngLatBounds();
        pinos.forEach((p) => bounds.extend([p.lng, p.lat]));
        const camera = map.cameraForBounds(bounds, { padding: 56, maxZoom: ZOOM_MAXIMO });
        if (camera) {
          // O enquadramento precisa mostrar TODOS os pontos. Forçar um zoom
          // mínimo de cidade escondia justamente os cadastros distantes que o
          // operador precisa localizar e corrigir.
          map.easeTo({ center: camera.center, zoom: camera.zoom, duration: 700 });
        }
      }
    };

    if (prontoRef.current) {
      pintar();
      return undefined;
    }
    map.once("load", pintar);
    return () => { map.off("load", pintar); };
  }, [pinos]);

  // ── Pinos dos MOTORISTAS (posição ao vivo) ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const vivos = new Set<number>();
    for (const rota of liveRoutes) {
      const pos = rota.lastPosition;
      if (!pos || !isValidMapCoordinate(pos.latitude, pos.longitude)) continue;
      vivos.add(rota.driver.id);
      const selecionado = rota.driver.id === selecionadoId;
      const existente = motoristasRef.current.get(rota.driver.id);
      if (existente) {
        existente.setLngLat([pos.longitude, pos.latitude]);
        // Mesma regra do pino da parada: só as MINHAS classes (ver comentário lá).
        existente.getElement().classList.toggle("is-foco", selecionado);
        continue;
      }
      const el = document.createElement("span");
      el.className = `cok-pino-motorista${selecionado ? " is-foco" : ""}`;
      el.textContent = iniciaisDe(rota.driver.nome || `M${rota.driver.id}`);
      motoristasRef.current.set(
        rota.driver.id,
        new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([pos.longitude, pos.latitude])
          .addTo(map),
      );
    }
    for (const [id, marker] of motoristasRef.current) {
      if (!vivos.has(id)) { marker.remove(); motoristasRef.current.delete(id); }
    }
  }, [liveRoutes, selecionadoId]);

  // ── Trilha do selecionado ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const desenhar = () => {
      const pontos = trilha
        .filter((p) => isValidMapCoordinate(p.latitude, p.longitude))
        .map((p) => [p.longitude, p.latitude] as [number, number]);
      const dado: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: pontos },
      };
      const source = map.getSource(TRILHA_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(dado);
        return;
      }
      map.addSource(TRILHA_SOURCE, { type: "geojson", data: dado });
      // Cor via token computado: camada WebGL não lê var() — mesma lição do
      // TrackingLiveMap. Lida UMA vez na criação; a trilha é enfeite de rota,
      // não precisa reagir a troca de tema ao vivo.
      const cor = getComputedStyle(document.documentElement).getPropertyValue("--hbx-teal").trim() || "#0f766e";
      map.addLayer({
        id: TRILHA_LAYER,
        type: "line",
        source: TRILHA_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": cor, "line-width": 3, "line-opacity": 0.75, "line-dasharray": [1.6, 1.4] },
      });
    };
    if (prontoRef.current) {
      desenhar();
      return undefined;
    }
    map.once("load", desenhar);
    return () => { map.off("load", desenhar); };
  }, [trilha]);

  return (
    <div className="cok-mapa-host">
      <div ref={hostRef} className="cok-mapa-tela" aria-label="Mapa das paradas de hoje" />
      {semPonto > 0 && (
        <span className="cok-mapa-chip" role="status">
          <i aria-hidden />
          {semPonto} sem ponto no mapa
        </span>
      )}
      {pinos.length === 0 && (
        <span className="cok-mapa-vazio">
          Nenhuma parada com endereço no mapa ainda.
        </span>
      )}
    </div>
  );
}
