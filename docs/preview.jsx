import React, { useMemo, useState } from "react";

const engines = [
  {
    id: "official",
    name: "Webscraping Oficial",
    title: "Google Oficial",
    status: "online",
    detail: "Até 20 resultados",
  },
  {
    id: "pj",
    name: "HBX Scraping PJ",
    title: "Empresas locais",
    status: "waiting",
    detail: "Até 50 resultados",
  },
  {
    id: "pf",
    name: "HBX Scraping PF",
    title: "Pessoas por perfil",
    status: "testing",
    detail: "Até 100 resultados",
  },
  {
    id: "agenda",
    name: "HBX Agenda PF",
    title: "Agenda pública por cidade",
    status: "active",
    detail: "Só nomes de pessoa",
  },
];

const chips = [
  "Lanchonetes",
  "Oficinas",
  "Clínicas",
  "Mercados",
  "Academias",
  "Pet shop",
  "Outros",
];

const recent = [
  { city: "Rio Claro - SP", segment: "plano de saúde", qty: "20", when: "Hoje, 18:42" },
  { city: "Americana - SP", segment: "clínica", qty: "50", when: "Ontem, 21:10" },
  { city: "Campinas - SP", segment: "academia", qty: "20", when: "Segunda, 09:18" },
];

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Icon({ name, size = 18, className = "" }) {
  const paths = {
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16.5 9" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    cursor: (
      <>
        <path d="M4 3 15.5 14.5 11 15.5 9.5 20 4 3Z" />
        <path d="m13 13 5 5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16.5 16.5 4 4" />
      </>
    ),
    wifi: (
      <>
        <path d="M5 13a10 10 0 0 1 14 0" />
        <path d="M8.5 16.5a5 5 0 0 1 7 0" />
        <path d="M12 20h.01" />
      </>
    ),
    zap: <path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z" />,
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="M4.93 4.93 6.34 6.34" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </>
    ),
    moon: <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z" />,
    play: <path d="M7 5v14l12-7L7 5Z" />,
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Badge({ children, tone = "blue", icon }) {
  const tones = {
    blue: "border-blue-300 bg-blue-50 text-blue-900 dark:border-cyan-500/40 dark:bg-cyan-400/10 dark:text-cyan-100",
    muted: "border-slate-200 bg-white/70 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
    success: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-cyan-300/40 dark:bg-cyan-300/10 dark:text-cyan-100",
  };

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold tracking-wide",
        tones[tone]
      )}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

function ClickableCard({ selected, children, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "group relative w-full rounded-3xl border p-5 text-left transition-all duration-200",
        "focus:outline-none focus:ring-4 focus:ring-blue-400/25 dark:focus:ring-cyan-300/25",
        selected
          ? "border-blue-500 bg-blue-50 shadow-[0_18px_50px_rgba(37,99,235,0.16)] dark:border-cyan-300 dark:bg-cyan-300/10 dark:shadow-[0_18px_50px_rgba(34,211,238,0.12)]"
          : "border-blue-100 bg-white/80 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-white hover:shadow-xl dark:border-white/10 dark:bg-white/5 dark:hover:border-cyan-300/40 dark:hover:bg-white/10",
        className
      )}
    >
      <Icon
        name="cursor"
        size={18}
        className={cx(
          "absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100",
          selected ? "text-blue-700 dark:text-cyan-200" : "text-blue-500 dark:text-cyan-300"
        )}
      />
      {children}
    </button>
  );
}

function EngineStatus({ status }) {
  const map = {
    online: { label: "Online", icon: "wifi", cls: "text-cyan-700 dark:text-cyan-200" },
    waiting: { label: "Aguardando", icon: "clock", cls: "text-slate-500 dark:text-slate-300" },
    testing: { label: "Teste", icon: "zap", cls: "text-blue-700 dark:text-cyan-200" },
    active: { label: "Selecionado", icon: "check", cls: "text-blue-700 dark:text-cyan-200" },
  };

  const current = map[status];

  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em]", current.cls)}>
      <Icon name={current.icon} size={14} />
      {current.label}
    </span>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="mb-4 text-[11px] font-black uppercase tracking-[0.26em] text-blue-600 dark:text-cyan-300">
      {children}
    </div>
  );
}

export default function HBXWebscrapingIdealPage() {
  const [dark, setDark] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState("agenda");
  const [selectedChip, setSelectedChip] = useState("Outros");

  const selected = useMemo(
    () => engines.find((engine) => engine.id === selectedEngine),
    [selectedEngine]
  );

  return (
    <div className={cx("min-h-screen overflow-hidden", dark ? "dark" : "")}>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe_0,#eef6ff_34%,#f8fbff_72%)] text-slate-950 dark:bg-[radial-gradient(circle_at_top_left,#0f3b68_0,#071b34_42%,#061426_100%)] dark:text-white">
        <div className="mx-auto max-w-[1480px] px-5 py-5 lg:px-8">
          <header className="mb-5 rounded-[2rem] border border-blue-200 bg-white/78 p-4 shadow-[0_22px_70px_rgba(30,64,175,0.13)] backdrop-blur-xl dark:border-white/10 dark:bg-white/7 dark:shadow-[0_22px_70px_rgba(0,0,0,0.35)]">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-900 to-blue-500 text-lg font-black text-white shadow-xl dark:from-cyan-300 dark:to-blue-500 dark:text-slate-950">
                  HB
                </div>
                <div>
                  <div className="text-xl font-black tracking-tight">HBX Control Center</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone="success" icon="check">Status operacional</Badge>
                    <Badge tone="muted">Atendimento: 87</Badge>
                    <Badge tone="muted">Cobrança: 0</Badge>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-blue-100 bg-blue-50/80 px-6 py-3 text-center dark:border-cyan-300/20 dark:bg-cyan-300/10">
                <div className="text-[11px] font-black uppercase tracking-[0.34em] text-blue-700 dark:text-cyan-200">
                  Pesquisa principal
                </div>
                <div className="mt-1 text-lg font-black">HBX Agenda PF</div>
              </div>

              <div className="flex flex-wrap items-center justify-start gap-3 lg:justify-end">
                <button
                  type="button"
                  onClick={() => setDark((value) => !value)}
                  className="inline-flex items-center gap-3 rounded-3xl border border-blue-200 bg-white px-4 py-3 text-left font-black shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-lg dark:border-white/10 dark:bg-white/10 dark:hover:border-cyan-300/50"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-2xl bg-blue-600 text-white dark:bg-cyan-300 dark:text-slate-950">
                    <Icon name={dark ? "moon" : "sun"} size={18} />
                  </span>
                  <span>
                    <span className="block text-[10px] uppercase tracking-[0.22em] text-blue-700 dark:text-cyan-200">
                      Tema visual
                    </span>
                    <span className="block text-sm">Midnight Blue</span>
                  </span>
                </button>

                <div className="flex items-center gap-3 rounded-3xl border border-blue-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/10">
                  <div className="grid h-9 w-9 place-items-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-cyan-300/15 dark:text-cyan-200">
                    <Icon name="user" size={17} />
                  </div>
                  <div className="text-sm font-black leading-tight">
                    User: HBX
                    <br />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                      Empresa HBX
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="space-y-5">
            <section className="rounded-[2rem] border border-blue-200 bg-white/80 p-5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-white/7">
              <SectionTitle>Motores</SectionTitle>

              <div className="grid gap-4 lg:grid-cols-4">
                {engines.map((engine) => (
                  <ClickableCard
                    key={engine.id}
                    selected={engine.id === selectedEngine}
                    onClick={() => setSelectedEngine(engine.id)}
                  >
                    <EngineStatus status={engine.id === selectedEngine ? "active" : engine.status} />
                    <h3 className="mt-4 text-lg font-black tracking-tight">{engine.name}</h3>
                    <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200">{engine.title}</p>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">{engine.detail}</p>
                  </ClickableCard>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-blue-200 bg-white/80 p-5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-white/7">
              <SectionTitle>Busca</SectionTitle>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.22em] text-blue-700 dark:text-cyan-200">
                    Cidade
                  </span>
                  <div className="flex items-center rounded-2xl border border-blue-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/8">
                    <input
                      className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                      defaultValue="Rio Claro - SP"
                    />
                    <Icon name="chevron" size={18} className="text-blue-600 dark:text-cyan-200" />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.22em] text-blue-700 dark:text-cyan-200">
                    Quantidade
                  </span>
                  <div className="flex items-center rounded-2xl border border-blue-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/8">
                    <select className="w-full bg-transparent text-sm font-semibold outline-none" defaultValue="20 contatos">
                      <option>20 contatos</option>
                      <option>50 contatos</option>
                      <option>100 contatos</option>
                    </select>
                  </div>
                </label>
              </div>

              <div className="mt-5">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.22em] text-blue-700 dark:text-cyan-200">
                  Segmento
                </span>

                <div className="flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setSelectedChip(chip)}
                      className={cx(
                        "rounded-full border px-4 py-2 text-sm font-black transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-400/20 dark:focus:ring-cyan-300/20",
                        selectedChip === chip
                          ? "border-blue-600 bg-blue-600 text-white dark:border-cyan-300 dark:bg-cyan-300 dark:text-slate-950"
                          : "border-blue-200 bg-white text-blue-950 hover:border-blue-400 hover:bg-blue-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:border-cyan-300/40 dark:hover:bg-cyan-300/10"
                      )}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-blue-100 bg-blue-50/70 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="font-black">{selected?.name}</div>

                <div className="flex gap-2">
                  <button
                    className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-white px-5 py-3 font-black text-blue-950 opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white"
                    disabled
                  >
                    <Icon name="download" size={18} />
                    Exportar Excel
                  </button>

                  <button className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 font-black text-white shadow-[0_16px_40px_rgba(37,99,235,0.28)] transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_20px_50px_rgba(37,99,235,0.36)] focus:outline-none focus:ring-4 focus:ring-blue-400/25 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200">
                    <Icon name="play" size={18} />
                    Buscar contatos
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-blue-200 bg-white/80 p-5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-white/7">
              <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
                <div>
                  <SectionTitle>Resultados</SectionTitle>

                  <div className="rounded-3xl border border-dashed border-blue-300 bg-blue-50/70 p-6 dark:border-cyan-300/30 dark:bg-cyan-300/10">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white dark:bg-cyan-300 dark:text-slate-950">
                        <Icon name="search" size={22} />
                      </div>
                      <div>
                        <div className="text-lg font-black">Pronto para sua próxima busca</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <SectionTitle>Pesquisas recentes</SectionTitle>

                  <div className="space-y-2">
                    {recent.map((item) => (
                      <button
                        key={`${item.city}-${item.segment}`}
                        className="w-full rounded-2xl border border-blue-100 bg-white/75 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50 hover:shadow-lg dark:border-white/10 dark:bg-white/5 dark:hover:border-cyan-300/40 dark:hover:bg-cyan-300/10"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-black">{item.city}</div>
                          <Icon name="cursor" size={16} className="text-blue-600 dark:text-cyan-200" />
                        </div>
                        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {item.segment} · {item.qty} contatos · {item.when}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}