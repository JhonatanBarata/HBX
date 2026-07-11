"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { CascaLoading, toggleCascaFullscreen } from "@/components/casca";
import { getToken } from "@/lib/api";

import { ArrivalSheet } from "./ArrivalSheet";
import { EntregaScaffold } from "./EntregaScaffold";
import { GestaoDia } from "./GestaoDia";
import { I, ICON_PATHS } from "./icons";
import { Onboarding, jaViuOnboarding } from "./Onboarding";
import {
  avisarChegando,
  cancelarEntrega,
  distanciaMetros,
  enderecoCurto,
  getRota,
  hhmm,
  iniciarRota,
  mapsHref,
  paradasAbertas,
  resumoItens,
  type ReceiptMethod,
  type RotaItem,
  type RotaResult,
} from "./entrega-api";
import {
  beep,
  buzz,
  getPosicaoUma,
  primeAudio,
  useGeofence,
  useOfflineSync,
  useWakeLock,
  type PosicaoAoVivo,
} from "./entrega-hooks";
import { fmtMoney, getConfig, getResumoDia, type ResumoDia } from "./gestao-api";
import { shellAbrirMaps, shellClearRota, shellDisponivel, shellSetRota } from "./shell-bridge";

// B2 — MapLibre só entra no bundle da rota /entrega (client-only: WebGL/
// `navigator` não existem no server). Zero peso extra pro dashboard/demais rotas.
const RotaMapa = dynamic(() => import("./RotaMapa").then((m) => m.RotaMapa), { ssr: false });

// ================================================================
// LOGÍSTICA-MOBILE M4 — O APP DO ENTREGADOR (as 3 telas reais).
//  · "Hoje"   : lista do dia (GET /logistica/rota) → "Iniciar rota".
//  · "Rota"   : card da parada atual, swipe ←/→ (dots + X/N + término),
//               Navegar (deep-link mapa), geofence → vibra + folha de chegada.
//  · Chegada  : folha (stepper por item + Entregue) — ArrivalSheet.
// Dado REAL dos endpoints; estados de loading/vazio honestos. ZERO texto
// explicativo (Lei da seção 2): ícone + número + verbo.
// ================================================================

type View = "hoje" | "rota";

// B3 (data VIVA) — a data NÃO pode ser constante de módulo: um PWA aberto da noite
// pro dia seguinte mostraria "ontem" pra sempre. Vira função e é recalculada em
// visibilitychange/foco (barato, sem interval agressivo).
function formatarDataHoje(): string {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}
const RAIO_CHEGADA_FALLBACK_M = 60; // default do LogisticaConfig (schema); só usado se GET /logistica/config falhar.
const SWIPE_THRESHOLD_PX = 60;
const SUCESSO_DURACAO_MS = 1600; // D1 — flash "aprovado" some sozinho (1,4–1,8s pedido).
const AUTO_NAV_COUNTDOWN_N = 5; // ROTA-AUTOPILOT F1/F3 — contagem "5,4,3,2,1…" antes de abrir o Maps sozinho.

// ROTA-AUTOPILOT F1/F3 — countdown que abre o Maps sozinho (1º cliente ao
// iniciar / próximo cliente ao confirmar). `manual` é o fallback do bloqueador
// de pop-up: sem gesto do usuário o window.open() pode voltar null — em vez de
// sumir mudo, o overlay vira um botão grande (o clique TEM gesto, funciona).
interface AutoNav {
  paradaId: string;
  rotulo: "abrindo" | "proxima";
  n: number;
  manual: boolean;
}

// D1 — dado do flash otimista ao confirmar (nome + itens + valor JÁ na tela;
// nunca "avisado" — a fila é assíncrona, sem sinal síncrono de envio real).
interface SucessoEntrega {
  nome: string;
  itens: string;
  valor: number | null;
}

// D1 — valor REALMENTE confirmado: mesma conta do stepper na folha de chegada
// (ArrivalSheet.valorAtual), mas a partir do payload final (qtdEntregue), não
// da quantidade prevista — honesto com o que o entregador de fato marcou.
function valorConfirmado(parada: RotaItem, payload: { itens: Array<{ id: string; qtdEntregue: number }> }): number {
  const temPreco = parada.itens.some((it) => it.valorUnit > 0);
  if (!temPreco) return Math.max(0, parada.valor ?? 0);
  const somaItens = payload.itens.reduce((s, p) => {
    const it = parada.itens.find((i) => i.id === p.id);
    return s + (it ? p.qtdEntregue * it.valorUnit : 0);
  }, 0);
  const itensReaisExistiam = parada.itens.length > 0;
  const base = itensReaisExistiam ? 0 : Math.max(0, parada.valor ?? 0);
  return Math.round((base + somaItens) * 100) / 100;
}

// ROTA-AUTOPILOT (fix 09/07, achado no teste ao vivo) — `.ent-countdown` e
// `.ent-gpsaviso` são overlays fixos (z-index:60 no entrega.css) renderizados
// DENTRO do EntregaScaffold, cujo `.casca-stage` tem `transform` (swipe entre
// módulos — casca.css FIX5) e todo `transform` cria stacking context próprio
// (spec CSS): o z-index:60 só é comparado DENTRO desse contexto. O véu do
// CascaSheet (`.casca-sheet-veil`, z-index:40 — casca.css) já portala pro
// document.body (CascaPortal em components/casca/transitions.tsx) e por isso
// vive no stacking context RAIZ — fora do `.casca-stage` — vencendo o overlay
// mesmo com z-index menor (contextos diferentes não se comparam por número, o
// navegador empilha pelo CONTAINER). Sintoma ao vivo: com a folha aberta +
// aviso de GPS na tela, o 1º toque em "Sim"/"Não" era capturado pelo véu (que
// fechava a folha) e só o 2º toque respondia o aviso.
// Fix: portalar estes 2 overlays pro MESMO document.body — aí entram no MESMO
// stacking context raiz do véu e o z-index:60 finalmente vale contra o 40.
// CSS ainda bate: EntregaSkinGate (entrega-skin-gate.tsx) já espelha
// data-skin="entrega" no <html> justamente pra portais pro body continuarem
// no escopo do entrega.css (mesmo problema resolvido pra folha "Novo cliente").
function EntregaOverlayPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}

export function EntregaHome() {
  const router = useRouter();
  const wakeLock = useWakeLock();
  const sync = useOfflineSync(); // M8 — fila offline + pendências no header.
  // B3 (data VIVA) — recalcula em foco/visibilidade (só aparece pós-load; sem risco
  // de mismatch de hidratação — o primeiro paint é o loading).
  const [dataHoje, setDataHoje] = useState<string>(formatarDataHoje);

  const [rota, setRota] = useState<RotaResult | null>(null);
  // B1 — raio de chegada REAL do admin (Ajustes M5); 1× no mount, best-effort
  // (o Ajustes já edita LogisticaConfig.raioChegadaM — o app do entregador
  // nunca lia esse valor antes, ficava com 60m hardcoded pra sempre).
  const [raioChegadaM, setRaioChegadaM] = useState<number>(RAIO_CHEGADA_FALLBACK_M);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [view, setView] = useState<View>("hoje");
  const [iniciando, setIniciando] = useState(false);
  const [indice, setIndice] = useState(0); // parada atual no carrossel
  const [sheetAberta, setSheetAberta] = useState(false);
  // ROTA-AUTOPILOT F2 — true só quando a sheet abriu pelo geofence (chegada
  // automática); o "Cheguei" manual passa false — vira o rótulo da ArrivalSheet.
  const [chegouPeloGps, setChegouPeloGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // D1 — flash "aprovado" ao confirmar (nível de page, não da folha: precisa
  // sobreviver ao fechamento da ArrivalSheet e ao avanço do carrossel).
  const [sucesso, setSucesso] = useState<SucessoEntrega | null>(null);
  const sucessoTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (sucessoTimeoutRef.current != null) window.clearTimeout(sucessoTimeoutRef.current);
    };
  }, []);
  // ROTA-AUTOPILOT F1/F3 — countdown ativo (overlay) + flag "pendente" (setado
  // logo após iniciar/confirmar; um efeito à parte dispara o countdown quando
  // `paradaAtual` já refletir a lista pós-recarga — ela é derivada de estado
  // assíncrono, por isso o flag+efeito em vez de chamada direta).
  const [autoNav, setAutoNav] = useState<AutoNav | null>(null);
  const [autoNavPendente, setAutoNavPendente] = useState<"abrindo" | "proxima" | null>(null);
  // ROTA-AUTOPILOT F4 — confirmação bloqueante quando o GPS não bate com o
  // endereço cadastrado; a Promise segura o onEntregue até Sim/Não.
  const [gpsAviso, setGpsAviso] = useState<{ resolve: (ok: boolean) => void } | null>(null);
  // M9 — onboarding do 1º acesso (3 telas visuais). Lazy init no cliente evita
  // efeito só para setar estado e mantém o primeiro paint estável.
  const [onboarding, setOnboarding] = useState<boolean | null>(() =>
    typeof window === "undefined" ? null : !jaViuOnboarding(),
  );

  // AUTH: reusa a sessão do app. Sem token → landing com login aberto
  // ("/?entrar" — /login morreu como tela, W1 10/07).
  useEffect(() => {
    if (!getToken()) router.replace("/?entrar");
  }, [router]);

  // B3 (data VIVA) — reavalia a data ao voltar o foco/visibilidade (o PWA que
  // ficou aberto da noite pro dia mostra o dia certo ao voltar pro app).
  useEffect(() => {
    const atualizar = () => setDataHoje(formatarDataHoje());
    const onVis = () => {
      if (document.visibilityState === "visible") atualizar();
    };
    window.addEventListener("focus", atualizar);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", atualizar);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // ROTA-AUTOPILOT (fix 09/07, achado no teste ao vivo) — DUAS recargas da rota
  // podem estar em voo ao mesmo tempo: o `await carregar()` do onEntregue e o
  // `carregar()` disparado pelo efeito `sync.sincronizados` (fila offline
  // drenando). No VPS a resposta VELHA (GET que saiu ANTES do POST /confirmar
  // commitar) resolveu por ÚLTIMO e sobrescreveu o estado novo — a parada já
  // entregue no servidor "voltava" a aparecer como atual até dar F5. Guarda de
  // ordem: um contador incrementa a cada chamada; só aplica a resposta se o
  // valor local ainda for o mais recente no momento em que ela chega — resposta
  // de uma chamada já superada por outra mais nova é descartada em silêncio.
  const carregarSeqRef = useRef(0);
  const carregar = useCallback(async () => {
    const minhaSeq = ++carregarSeqRef.current;
    setLoading(true);
    setErro(null);
    try {
      const r = await getRota();
      if (carregarSeqRef.current !== minhaSeq) return; // resposta obsoleta — descarta
      setRota(r);
    } catch (e) {
      if (carregarSeqRef.current !== minhaSeq) return; // idem — outra chamada já é a atual
      setErro(e instanceof Error ? e.message : "Falha ao carregar a rota");
    } finally {
      if (carregarSeqRef.current === minhaSeq) setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await carregar(); })(); }, [carregar]);

  // B3 (offline VISÍVEL) — quando o sync de FUNDO esvazia a fila, recarrega a rota:
  // a parada que estava só na fila (escondida do carrossel) vira "entregue" no
  // servidor. Sem isso, ao sair da fila ela reapareceria como "agendada".
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recarrega a rota quando a fila offline esvazia (ver comentário acima); efeito legítimo
    if (sync.sincronizados > 0) void carregar();
  }, [sync.sincronizados, carregar]);

  // B1 — lê o raio configurado 1× no mount; falha mantém o fallback (60m).
  useEffect(() => {
    void (async () => {
      try {
        const cfg = await getConfig();
        if (typeof cfg.raioChegadaM === "number" && cfg.raioChegadaM > 0) setRaioChegadaM(cfg.raioChegadaM);
      } catch {
        /* mantém o fallback — best-effort */
      }
    })();
  }, []);

  // Paradas abertas na ordem da rota (fonte do carrossel + progresso).
  // B3 (offline VISÍVEL) — as paradas com confirmação AINDA na fila somem do
  // carrossel (o entregador não reconfirma o que já marcou); elas seguem na lista
  // "Hoje" com a tag ⇅ (ver ViewHoje). Todo o resto (índice, geofence, dots)
  // herda essa lista filtrada de graça.
  const abertas = useMemo(
    () => (rota ? paradasAbertas(rota).filter((p) => !sync.entregaIdsPendentes.has(p.id)) : []),
    [rota, sync.entregaIdsPendentes],
  );
  const totalDia = rota?.items.length ?? 0;
  const feitas = useMemo(() => (rota ? rota.items.filter((i) => i.status === "entregue").length : 0), [rota]);
  const termino = useMemo<string | null>(() => {
    // Término previsto = etaAt da última parada aberta com ETA (M3).
    const comEta = abertas.filter((p) => p.etaAt);
    return comEta.length > 0 ? comEta[comEta.length - 1].etaAt ?? null : null;
  }, [abertas]);

  const paradaAtual: RotaItem | null = abertas[indice] ?? null;

  // Geofence foreground na parada atual (só quando em "Rota" e a folha fechada).
  const alvo = useMemo(() => {
    if (!paradaAtual || typeof paradaAtual.cliente.lat !== "number" || typeof paradaAtual.cliente.lng !== "number") {
      return null;
    }
    return { id: paradaAtual.id, lat: paradaAtual.cliente.lat, lng: paradaAtual.cliente.lng, raioM: raioChegadaM };
  }, [paradaAtual, raioChegadaM]);

  const onChegada = useCallback(() => {
    buzz([24, 40, 24]);
    beep(); // ROTA-AUTOPILOT F2 — chegada automática soma som ao buzz já existente.
    setChegouPeloGps(true);
    setSheetAberta(true);
  }, []);

  // AVISO-CHEGANDO — 2º anel (~500m), só armado quando o backend liga o recurso
  // (rota.avisoChegandoAtivo — trava tripla + idempotência vivem lá). O POST é
  // fire-and-forget e best-effort; o guard de "1× por parada" é do useGeofence.
  const aproximacao = useMemo(() => {
    if (!rota?.avisoChegandoAtivo) return undefined;
    return {
      raioM: rota.avisoChegandoDistanciaM ?? 500,
      onAproximar: (id: string) => void avisarChegando(id),
    };
  }, [rota]);

  // B2 — `posicaoEntregador` é a MESMA leitura do watchPosition do geofence
  // (zero watcher novo): o mapa embutido usa pra desenhar a bolinha ao vivo.
  const { posicao: posicaoEntregador } = useGeofence(alvo, view === "rota" && !sheetAberta, onChegada, aproximacao);

  // WEB-BRIDGE — alimenta o serviço nativo de GPS de fundo (casca Android) com
  // a rota inteira sempre que ela muda; em navegador comum (sem HBXShell) os
  // helpers são no-op — zero mudança de comportamento fora da casca.
  useEffect(() => {
    if (view === "rota" && shellDisponivel()) {
      const paradas = abertas
        .filter((p) => typeof p.cliente.lat === "number" && typeof p.cliente.lng === "number")
        .map((p) => ({
          id: p.id,
          nome: p.cliente.nome ?? "Cliente",
          lat: p.cliente.lat as number,
          lng: p.cliente.lng as number,
        }));
      if (paradas.length > 0) shellSetRota(raioChegadaM, paradas);
      else shellClearRota();
    } else {
      shellClearRota();
    }
    // Cleanup do efeito (deps mudaram) e do unmount: desliga o GPS de fundo —
    // o corpo do efeito religa na sequência se a condição ainda valer.
    return () => shellClearRota();
  }, [view, abertas, raioChegadaM]);

  // ── ROTA-AUTOPILOT F1/F3 — countdown "abrindo navegador sozinho" ───────────
  // Dispara o countdown assim que `paradaAtual` refletir a lista pós-recarga
  // (onIniciar/onEntregue setam só o flag — a lista `abertas` é derivada de
  // estado assíncrono, então o efeito espera o render onde ela já chegou).
  useEffect(() => {
    if (!autoNavPendente) return;
    if (!paradaAtual) {
      // Confirmou a ÚLTIMA parada do dia: não há próxima e não vai ter — a
      // lista `abertas`/`paradaAtual` já é a final aqui (efeito roda pós-
      // `await carregar()`). Sem limpar, o flag ficaria pendente pra sempre e
      // um lote novo de entregas (GestaoDia) disparava o countdown do nada
      // na tela "Hoje". Deferido (callback, não síncrono no corpo do efeito)
      // — mesmo padrão do ramo abaixo.
      const t = window.setTimeout(() => setAutoNavPendente(null), 0);
      return () => window.clearTimeout(t);
    }
    const rotulo = autoNavPendente;
    const paradaId = paradaAtual.id;
    const t = window.setTimeout(() => {
      setAutoNav({ paradaId, rotulo, n: AUTO_NAV_COUNTDOWN_N, manual: false });
      setAutoNavPendente(null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [autoNavPendente, paradaAtual]);

  // Tenta abrir o Maps da parada do countdown. Sucesso fecha o overlay; falha
  // (bloqueador de pop-up — sem gesto do usuário) vira modo `manual`: um botão
  // grande primário, porque O CLIQUE nele TEM gesto e o window.open funciona.
  // Recebe o AutoNav atual por parâmetro em vez de ler dentro de um updater
  // de setState: updater tem que ser puro (StrictMode/replays podem invocar
  // 2×, o que abriria 2 abas) — window.open/buzz/beep viram efeito colateral
  // FORA do setAutoNav, que aqui só recebe o resultado já decidido.
  const tentarAbrirAutoNav = useCallback(
    (atual: AutoNav) => {
      const parada = abertas.find((p) => p.id === atual.paradaId);
      if (!parada) {
        setAutoNav(null); // parada sumiu da lista (ex.: cancelada em outro dispositivo)
        return;
      }
      // WEB-BRIDGE — na casca nativa o Maps abre via Intent (sem pop-up, sem
      // bloqueador): sucesso garantido, sem passar pelo window.open abaixo.
      // O modo `manual` (fallback do bloqueador) só existe pro navegador comum.
      if (shellAbrirMaps(mapsHref(parada.cliente))) {
        setAutoNav(null);
        return;
      }
      // SEM a feature "noopener": por spec (MDN), window.open com noopener
      // retorna null MESMO EM SUCESSO — sempre cairia no modo manual/buzz
      // mesmo com o Maps aberto de verdade. Sem a feature o retorno volta a
      // ser confiável (janela = sucesso, null = bloqueado); corta o vínculo
      // na mão pra manter o isolamento que o noopener dava.
      const janela = window.open(mapsHref(parada.cliente), "_blank");
      if (janela) {
        try {
          janela.opener = null;
        } catch {
          /* best-effort */
        }
        setAutoNav(null);
        return;
      }
      if (atual.manual) return; // já em modo manual: só re-tentativa do próprio clique
      buzz([30, 60, 30]);
      beep();
      setAutoNav({ ...atual, manual: true });
    },
    [abertas],
  );

  useEffect(() => {
    if (!autoNav || autoNav.manual) return;
    if (autoNav.n <= 0) {
      // Deferido (mesmo padrão do tick abaixo): setState só dentro do callback,
      // nunca síncrono no corpo do efeito.
      const atual = autoNav;
      const t = window.setTimeout(() => tentarAbrirAutoNav(atual), 0);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setAutoNav((prev) => (prev ? { ...prev, n: prev.n - 1 } : prev));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [autoNav, tentarAbrirAutoNav]);

  // ROTA-AUTOPILOT F4 — segura o onEntregue até o entregador responder Sim/Não
  // (Promise resolvida pelos botões do overlay .ent-gpsaviso).
  const confirmarApesarDoGps = useCallback((): Promise<boolean> => {
    return new Promise<boolean>((resolve) => setGpsAviso({ resolve }));
  }, []);

  // ── Iniciar rota (manda GPS de origem) ─────────────────────────────────────
  const onIniciar = useCallback(async () => {
    setIniciando(true);
    setErro(null);
    buzz(14);
    primeAudio(); // ROTA-AUTOPILOT F2 — gesto real está AQUI; libera o beep() de chegada, sem gesto próprio, depois.
    void wakeLock.enable(); // tela acesa durante a rota
    // LEI nº3 (fullscreen "especialmente no Rota"): oferece tela cheia em 1
    // toque ao iniciar — a lib central já emite o aviso ("deslize a borda de
    // cima pra sair"); se o device recusar/não suportar, segue sem travar o
    // fluxo (best-effort, igual ao wakeLock).
    void toggleCascaFullscreen();
    let origem: { lat: number; lng: number } | undefined;
    try {
      origem = await getPosicaoUma();
    } catch {
      origem = undefined; // sem GPS: o backend começa pela 1ª parada com coord
    }
    try {
      await iniciarRota(origem);
      await carregar(); // recarrega com rotaOrdem/etaAt já gravados
      setIndice(0);
      setView("rota");
      // ROTA-AUTOPILOT F1 — já abre o 1º cliente sozinho (via flag+efeito acima).
      setAutoNavPendente("abrindo");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao iniciar a rota");
    } finally {
      setIniciando(false);
    }
  }, [carregar, wakeLock]);

  // ── Swipe do carrossel ─────────────────────────────────────────────────────
  const dragStart = useRef<number | null>(null);
  const [dragDx, setDragDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const irPara = useCallback(
    (novo: number) => {
      const max = abertas.length - 1;
      const clamped = Math.max(0, Math.min(max, novo));
      if (clamped !== indice) buzz(8);
      setIndice(clamped);
    },
    [abertas.length, indice],
  );

  // WEB-BRIDGE — chegada detectada NATIVAMENTE (o shell re-dispara no resume
  // se aconteceu em background) abre a mesma folha do geofence JS. PODE
  // chegar duplicado e PODE chegar junto do geofence — por isso a checagem de
  // `sheetAberta` primeiro. Listener registrado 1x (mount); lê estado atual
  // via ref pra não precisar re-registrar a cada render.
  const chegadaNativaRef = useRef({ sheetAberta, paradaAtual, abertas, irPara, onChegada });
  useEffect(() => {
    chegadaNativaRef.current = { sheetAberta, paradaAtual, abertas, irPara, onChegada };
  });
  useEffect(() => {
    const onChegadaNativa = (e: Event) => {
      const paradaId = (e as CustomEvent<{ paradaId?: string }>).detail?.paradaId;
      if (!paradaId) return;
      const atual = chegadaNativaRef.current;
      if (atual.sheetAberta) return; // idempotência — evita beep/reabertura duplicada
      if (paradaId === atual.paradaAtual?.id) {
        atual.onChegada();
        return;
      }
      const idx = atual.abertas.findIndex((p) => p.id === paradaId);
      if (idx >= 0) {
        atual.irPara(idx);
        atual.onChegada();
      }
    };
    document.addEventListener("hbxshell:chegada", onChegadaNativa);
    return () => document.removeEventListener("hbxshell:chegada", onChegadaNativa);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientX;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current == null) return;
    setDragDx(e.clientX - dragStart.current);
  };
  const onPointerUp = () => {
    if (dragStart.current == null) return;
    const dx = dragDx;
    dragStart.current = null;
    setDragging(false);
    setDragDx(0);
    if (dx <= -SWIPE_THRESHOLD_PX) irPara(indice + 1);
    else if (dx >= SWIPE_THRESHOLD_PX) irPara(indice - 1);
  };

  // ── Confirmar entrega (Entregue) ───────────────────────────────────────────
  const onEntregue = useCallback(
    async (payload: {
      itens: Array<{ id: string; qtdEntregue: number }>;
      // F2 (08/07) — produtos novos incluídos/trocados na chegada (ArrivalSheet).
      novosItens?: Array<{ productId: number; qtdEntregue: number }>;
      receiptMethod?: ReceiptMethod;
    }) => {
      if (!paradaAtual) return;
      setSubmitting(true);
      buzz([16, 20, 16]);
      let gps: { lat: number; lng: number; accuracy?: number } | undefined;
      try {
        gps = await getPosicaoUma();
      } catch {
        gps = undefined;
      }
      // ROTA-AUTOPILOT F4 — checagem honesta: o GPS bateu longe do endereço
      // cadastrado do cliente? Pergunta ANTES de enfileirar. `limiteGpsM` serve
      // duas vezes: teto de distância (folga p/ imprecisão urbana) E teto de
      // "accuracy confiável" — accuracy pior que isso não dá pra confiar, então
      // segue direto (comportamento de hoje) em vez de acusar falso positivo.
      const clienteLat = paradaAtual.cliente.lat;
      const clienteLng = paradaAtual.cliente.lng;
      const limiteGpsM = Math.max(raioChegadaM * 2, 120);
      const accuracyConfiavel = gps == null || gps.accuracy == null || gps.accuracy <= limiteGpsM;
      if (typeof clienteLat === "number" && typeof clienteLng === "number" && gps && accuracyConfiavel) {
        const dist = distanciaMetros(gps, { lat: clienteLat, lng: clienteLng });
        if (dist > limiteGpsM) {
          const confirmaMesmoAssim = await confirmarApesarDoGps();
          if (!confirmaMesmoAssim) {
            setSubmitting(false);
            return;
          }
        }
      }
      // M8 — OFFLINE-FIRST: enfileira a confirmação (gera idempotencyKey) e tenta enviar
      // já. Online → some da fila na hora; offline/falha → fica na fila e sincroniza ao
      // reconectar (teto + backoff). Nunca perde a entrega por falta de sinal. O servidor
      // dedupe pela key: reenviar o mesmo item não dispara WhatsApp/charge 2×.
      try {
        await sync.enqueueConfirmacao(paradaAtual.id, {
          lat: gps?.lat,
          lng: gps?.lng,
          accuracy: gps?.accuracy, // B1 — o backend só realimenta o cadastro se accuracy<=60m.
          receiptMethod: payload.receiptMethod,
          itens: payload.itens,
          novosItens: payload.novosItens,
        });
        // D1 — momento "aprovado": flash otimista com o que já está na tela
        // (a fila é assíncrona — nada de "cliente avisado" sem sinal de envio
        // confirmado). O buzz([16, 20, 16]) já disparado no início deste
        // handler É o padrão de sucesso existente no app (Onboarding usa o
        // mesmo pattern na conclusão) — não duplica vibração aqui.
        const valor = rota?.moduloFinanceiroAtivo ? valorConfirmado(paradaAtual, payload) : 0;
        setSucesso({
          nome: paradaAtual.cliente.nome ?? "Cliente",
          itens: resumoItens(paradaAtual),
          valor: valor > 0 ? valor : null,
        });
        if (sucessoTimeoutRef.current != null) window.clearTimeout(sucessoTimeoutRef.current);
        sucessoTimeoutRef.current = window.setTimeout(() => setSucesso(null), SUCESSO_DURACAO_MS);
        setSheetAberta(false);
        // Recarrega best-effort: online reflete 'entregue'; offline mantém a parada (o
        // sync a fecha depois). Erro de rede aqui NÃO reverte a confirmação enfileirada.
        await carregar().catch(() => {});
        // Avança para a próxima parada (o índice se mantém: a lista encurtou).
        setIndice((i) => Math.max(0, Math.min(i, abertas.length - 2)));
        // ROTA-AUTOPILOT F3 — confirmou → tenta abrir o Maps da PRÓXIMA parada
        // sozinho (mesmo flag+efeito do F1). Sem próxima parada, o efeito não
        // acha `paradaAtual` e não faz nada — o empty "Rota concluída" já cuida.
        setAutoNavPendente("proxima");
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao confirmar");
      } finally {
        setSubmitting(false);
      }
    },
    [abertas.length, carregar, confirmarApesarDoGps, paradaAtual, raioChegadaM, rota, sync],
  );

  const onNaoEntregue = useCallback(
    async (motivo: string) => {
      if (!paradaAtual) return;
      setSubmitting(true);
      try {
        await cancelarEntrega(paradaAtual.id, motivo);
        setSheetAberta(false);
        await carregar();
        setIndice((i) => Math.max(0, Math.min(i, abertas.length - 2)));
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao registrar");
      } finally {
        setSubmitting(false);
      }
    },
    [abertas.length, carregar, paradaAtual],
  );

  // ── RENDER ─────────────────────────────────────────────────────────────────
  // M9 — 1º acesso: cobre a tela com o onboarding de 3 telas até "Começar".
  if (onboarding) {
    return (
      <EntregaScaffold title="Rota">
        <Onboarding onDone={() => setOnboarding(false)} />
      </EntregaScaffold>
    );
  }

  return (
    <EntregaScaffold
      title={view === "rota" ? "Rota" : "Hoje"}
      headerActions={
        <>
          {/* M8 — pendências não sincronizadas (fila offline). Ícone + número, sem texto
              (Lei nº1). Vira alerta quando algum item estourou o teto de tentativas. */}
          {sync.pendentes > 0 ? (
            <span
              className={`ent-pendencias${sync.precisamAtencao > 0 ? " is-attention" : ""}`}
              role="status"
              aria-label={`${sync.pendentes} confirmações não sincronizadas`}
              title={
                sync.precisamAtencao > 0
                  ? `${sync.pendentes} não sincronizadas (${sync.precisamAtencao} precisam de atenção)`
                  : `${sync.pendentes} aguardando sincronizar`
              }
            >
              <span aria-hidden="true">⇅</span>
              {sync.pendentes}
            </span>
          ) : null}
          {view === "rota" ? (
            <button type="button" className="casca-top__act" aria-label="Ver Hoje" onClick={() => setView("hoje")}>
              <I d={ICON_PATHS.route} size={18} />
            </button>
          ) : null}
        </>
      }
    >
      {loading ? (
        <div className="ent-empty">
          <CascaLoading caption="Carregando" />
        </div>
      ) : erro ? (
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">
            ⚠
          </div>
          <div className="ent-empty-title">Erro</div>
          <div>{erro}</div>
          <button type="button" className="ent-btn ent-btn--secondary" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      ) : view === "hoje" ? (
        <ViewHoje
          rota={rota}
          data={dataHoje}
          feitas={feitas}
          total={totalDia}
          termino={termino}
          abertas={abertas}
          pendentesIds={sync.entregaIdsPendentes}
          iniciando={iniciando}
          onIniciar={onIniciar}
          onGerou={carregar}
          onComecarRota={onIniciar}
        />
      ) : (
        <ViewRota
          abertas={abertas}
          indice={indice}
          feitas={feitas}
          total={totalDia}
          termino={termino}
          dragDx={dragging ? dragDx : 0}
          dragging={dragging}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDot={irPara}
          onChegar={() => {
            buzz(14);
            // ROTA-AUTOPILOT F2 — "Cheguei" é manual (botão), NÃO pelo geofence:
            // a ArrivalSheet não repete o óbvio ("Você chegou no endereço").
            setChegouPeloGps(false);
            setSheetAberta(true);
          }}
          posicaoEntregador={posicaoEntregador}
        />
      )}

      <ArrivalSheet
        open={sheetAberta && !!paradaAtual}
        parada={paradaAtual}
        moduloFinanceiroAtivo={rota?.moduloFinanceiroAtivo ?? false}
        pix={rota?.pix ?? null}
        chegouPeloGps={chegouPeloGps}
        onEntregue={onEntregue}
        onNaoEntregue={onNaoEntregue}
        onClose={() => {
          // ROTA-AUTOPILOT F4 (fix 09/07) — o aviso de GPS é uma decisão
          // BLOQUEANTE (segura o onEntregue via Promise); um fechamento
          // acidental da folha (ex.: o véu ainda capturando o 1º toque antes
          // do fix do portal acima) não pode se sobrepor à resposta Sim/Não.
          if (gpsAviso) return;
          setSheetAberta(false);
        }}
        submitting={submitting}
      />

      {/* D1 — flash "aprovado" (some sozinho via SUCESSO_DURACAO_MS acima). */}
      {sucesso ? (
        <div className="ent-sucesso" role="status" aria-live="polite">
          <div className="ent-sucesso-card">
            <div className="ent-sucesso-check" aria-hidden="true">✓</div>
            <div className="ent-sucesso-nome">{sucesso.nome}</div>
            <div className="ent-sucesso-itens">{sucesso.itens}</div>
            {sucesso.valor != null ? <div className="ent-sucesso-valor">{fmtMoney(sucesso.valor)}</div> : null}
          </div>
        </div>
      ) : null}

      {/* ROTA-AUTOPILOT F1/F3 — countdown "abrindo navegador"/"carregando
          próxima rota". Tocar em qualquer ponto (fora do Cancelar) aproveita o
          gesto e abre já; sem gesto (autoplay do timer) o bloqueador de pop-up
          pode barrar — vira modo `manual` com botão grande. */}
      {autoNav ? (
        <EntregaOverlayPortal>
          <div
            className="ent-countdown"
            role="alertdialog"
            aria-live="assertive"
            aria-label={autoNav.rotulo === "abrindo" ? "Abrindo navegador" : "Carregando próxima rota"}
            onClick={() => {
              if (!autoNav.manual) tentarAbrirAutoNav(autoNav);
            }}
          >
            <div className="ent-countdown-card">
              <div className="ent-countdown-label">
                {autoNav.rotulo === "abrindo" ? "Abrindo navegador" : "Carregando próxima rota"}
              </div>
              {autoNav.manual ? (
                <button
                  type="button"
                  className="ent-btn ent-btn--primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    tentarAbrirAutoNav(autoNav);
                  }}
                >
                  Abrir navegador
                </button>
              ) : (
                <div className="ent-countdown-num">{autoNav.n}</div>
              )}
              {autoNav.rotulo === "abrindo" && !shellDisponivel() ? (
                <div className="ent-countdown-hint">
                  Iniciou a navegação? Volte pro app — o Maps vira janelinha.
                </div>
              ) : null}
              <button
                type="button"
                className="ent-countdown-cancel"
                onClick={(e) => {
                  e.stopPropagation();
                  setAutoNav(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </EntregaOverlayPortal>
      ) : null}

      {/* ROTA-AUTOPILOT F4 — GPS longe do endereço combinado: confirmação
          bloqueante (mesmo padrão visual do countdown), Sim/Não seguram o
          onEntregue via Promise (confirmarApesarDoGps). */}
      {gpsAviso ? (
        <EntregaOverlayPortal>
          <div className="ent-gpsaviso" role="alertdialog" aria-live="assertive">
            <div className="ent-countdown-card">
              <div className="ent-countdown-label">
                Pelo GPS você não está no local combinado. Confirma mesmo assim?
              </div>
              <div className="ent-sheet-actions">
                <button
                  type="button"
                  className="ent-btn ent-btn--primary"
                  onClick={() => {
                    gpsAviso.resolve(true);
                    setGpsAviso(null);
                  }}
                >
                  Sim
                </button>
                <button
                  type="button"
                  className="ent-btn ent-btn--secondary"
                  onClick={() => {
                    gpsAviso.resolve(false);
                    setGpsAviso(null);
                  }}
                >
                  Não
                </button>
              </div>
            </div>
          </div>
        </EntregaOverlayPortal>
      ) : null}
    </EntregaScaffold>
  );
}

// ── TELA "Hoje" ────────────────────────────────────────────────────────────────
function ViewHoje({
  rota,
  data,
  feitas,
  total,
  termino,
  abertas,
  pendentesIds,
  iniciando,
  onIniciar,
  onGerou,
  onComecarRota,
}: {
  rota: RotaResult | null;
  data: string;
  feitas: number;
  total: number;
  termino: string | null;
  abertas: RotaItem[];
  pendentesIds: Set<string>;
  iniciando: boolean;
  onIniciar: () => void;
  onGerou: () => void;
  onComecarRota: () => void;
}) {
  // A4 — faixa de gestão do dia (gerar entregas + resumo) SEMPRE no topo, mesmo
  // sem entregas: é daqui que o dono do negócio materializa a rota do dia.
  if (!rota || total === 0) {
    return (
      <>
        <div className="ent-head-sub ent-head-sub--standalone">{data}</div>
        <GestaoDia onGerou={onGerou} onComecarRota={onComecarRota} />
        <div className="ent-empty">
          <div className="ent-empty-icon" aria-hidden="true">
            ✓
          </div>
          <div className="ent-empty-title">Sem entregas hoje</div>
        </div>
      </>
    );
  }
  const pct = total > 0 ? Math.round((feitas / total) * 100) : 0;
  return (
    <>
      <div className="ent-head-sub ent-head-sub--standalone">{data}</div>
      <GestaoDia onGerou={onGerou} onComecarRota={onComecarRota} />
      <section className="ent-progress" aria-label="Progresso do dia">
        <div className="ent-progress-row">
          <div className="ent-progress-count">
            <b>{feitas}</b>/{total}
          </div>
          <div className="ent-progress-eta">
            término
            <strong>{hhmm(termino)}</strong>
          </div>
        </div>
        <div className="ent-progress-bar">
          <div className="ent-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <div className="ent-list">
        {rota.items.map((it, i) => {
          const done = it.status === "entregue" || it.status === "cancelada";
          // B3 (offline VISÍVEL) — confirmação ainda na fila: ⇅ no lugar do ETA
          // (o servidor ainda não sabe; ao drenar, vira ✓ sozinho).
          const sincronizando = !done && pendentesIds.has(it.id);
          return (
            <div className={`ent-row${done ? " is-done" : ""}`} key={it.id}>
              <div className="ent-row-idx">{i + 1}</div>
              <div className="ent-row-main">
                <div className="ent-row-name">{it.cliente.nome ?? "Cliente"}</div>
                <div className="ent-row-sub">{resumoItens(it)}</div>
              </div>
              <div
                className={`ent-row-tag${it.status === "entregue" ? " is-done" : sincronizando ? " is-sync" : ""}`}
                title={sincronizando ? "Aguardando sincronizar" : undefined}
              >
                {it.status === "entregue" ? "✓" : it.status === "cancelada" ? "—" : sincronizando ? "⇅" : hhmm(it.etaAt)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="ent-actionbar">
        <button
          type="button"
          className="ent-btn ent-btn--primary"
          onClick={onIniciar}
          disabled={iniciando || abertas.length === 0}
        >
          {iniciando ? "Iniciando…" : abertas.length === 0 ? "Rota concluída" : "Iniciar rota"}
        </button>
      </div>
    </>
  );
}

// ── TELA "Rota" (card + swipe) ──────────────────────────────────────────────────
function ViewRota({
  abertas,
  indice,
  feitas,
  total,
  termino,
  dragDx,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDot,
  onChegar,
  posicaoEntregador,
}: {
  abertas: RotaItem[];
  indice: number;
  feitas: number;
  total: number;
  termino: string | null;
  dragDx: number;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onDot: (i: number) => void;
  onChegar: () => void;
  posicaoEntregador: PosicaoAoVivo | null;
}) {
  if (abertas.length === 0) {
    return (
      <div className="ent-empty">
        <div className="ent-empty-icon" aria-hidden="true">
          ✓
        </div>
        <div className="ent-empty-title">Rota concluída</div>
        {/* D2 — fechamento do dia: reusa getResumoDia (mesmos 3 stats da faixa
            de gestão). Best-effort: falha não derruba o empty-state acima. */}
        <FechamentoDia />
      </div>
    );
  }
  const atual = abertas[indice] ?? abertas[0];
  const pct = total > 0 ? Math.round((feitas / total) * 100) : 0;
  // translateX = índice + arraste em curso (px convertido pra % via container).
  const trackStyle = { transform: `translateX(calc(${-indice * 100}% + ${dragDx}px))` };

  return (
    <>
      <section className="ent-progress" aria-label="Progresso do dia">
        <div className="ent-progress-row">
          <div className="ent-progress-count">
            <b>{indice + 1}</b>/{abertas.length}
          </div>
          <div className="ent-progress-eta">
            término
            <strong>{hhmm(termino)}</strong>
          </div>
        </div>
        <div className="ent-progress-bar">
          <div className="ent-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {/* B2 — visão geral no mapa (progressivo: some sozinho sem coordenada/rede/tiles). */}
      <RotaMapa paradas={abertas} indiceAtual={indice} onSelecionarParada={onDot} posicaoEntregador={posicaoEntregador} />

      <div
        className="ent-carousel"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className={`ent-track${dragging ? " is-dragging" : ""}`} style={trackStyle}>
          {abertas.map((p, i) => (
            <div className="ent-slide" key={p.id}>
              <article className="ent-stop-card">
                {/* FIX rota: numeração SEQUENCIAL pela posição na rota (abertas já
                    vem ordenado por rotaOrdem do backend) — antes usava rotaOrdem
                    que nunca chegava e deixava TODO card como "Parada 1". */}
                <span className="ent-stop-badge">Parada {i + 1}</span>
                <div className="ent-stop-name">{p.cliente.nome ?? "Cliente"}</div>
                {/* MULTILOCAL 10/07 (W-E) — apelido do local (ex. "· Loja") junto do
                    endereço, discreto (herda o ent-stop-addr já suave); null = nada muda. */}
                <div className="ent-stop-addr">
                  {enderecoCurto(p.cliente)}
                  {p.localApelido ? ` · ${p.localApelido}` : ""}
                </div>
                <div className="ent-stop-items">
                  <b>{p.itens.length > 0 ? p.itens.reduce((s, it) => s + it.qtdPrevista, 0) : p.quantidade}</b>
                  <span>{p.produto?.nome ?? p.itens[0]?.produto?.nome ?? "itens"}</span>
                </div>
                {p.etaAt ? (
                  <div className="ent-stop-eta">
                    chegada <strong>{hhmm(p.etaAt)}</strong>
                  </div>
                ) : null}
              </article>
            </div>
          ))}
        </div>
      </div>

      <div className="ent-dots" aria-hidden="true">
        {abertas.map((p, i) => (
          <span
            key={p.id}
            className={`ent-dot${i === indice ? " is-on" : ""}`}
            onClick={() => onDot(i)}
          />
        ))}
      </div>

      <div className="ent-actionbar">
        <a
          className="ent-btn ent-btn--secondary"
          href={mapsHref(atual.cliente)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Navegar
        </a>
        <button type="button" className="ent-btn ent-btn--primary" onClick={onChegar}>
          Cheguei
        </button>
      </div>
    </>
  );
}

// ── D2: FECHAMENTO DO DIA (fim da rota) ─────────────────────────────────────
// Reusa getResumoDia() — os MESMOS 3 stats da faixa de gestão (GestaoDia),
// buscados 1× ao entrar neste estado. Best-effort: falha some sozinha (null),
// o empty-state "Rota concluída ✓" continua valendo sem quebrar.
function FechamentoDia() {
  const [resumo, setResumo] = useState<ResumoDia | null>(null);

  useEffect(() => {
    let vivo = true;
    void getResumoDia()
      .then((r) => { if (vivo) setResumo(r); })
      .catch(() => { /* best-effort: sem resumo, o empty-state seco basta */ });
    return () => { vivo = false; };
  }, []);

  if (!resumo) return null;

  return (
    <div className="ent-stats ent-fechamento">
      <div className="ent-stat">
        <span className="ent-stat-num">{resumo.entregues}</span>
        <span className="ent-stat-lbl">Entregues</span>
      </div>
      <div className="ent-stat">
        <span className="ent-stat-num is-ok">{fmtMoney(resumo.recebidoHoje)}</span>
        <span className="ent-stat-lbl">Recebido</span>
      </div>
      <div className="ent-stat">
        <span className="ent-stat-num is-due">{fmtMoney(resumo.aReceber)}</span>
        <span className="ent-stat-lbl">A receber</span>
      </div>
    </div>
  );
}
