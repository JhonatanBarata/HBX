import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Command,
  CreditCard,
  Globe,
  LayoutGrid,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCog,
  WalletCards,
  Workflow,
  Wrench,
} from 'lucide-react';

const engines = [
  { key: 'whatsapp', label: 'WhatsApp', status: 'Operacional', tone: 'success', detail: 'API oficial conectada' },
  { key: 'payment', label: 'Pagamento', status: 'Atenção', tone: 'warning', detail: '1 cobrança pendente' },
  { key: 'webscraping', label: 'Webscraping', status: 'Online', tone: 'success', detail: 'Runtime saudável' },
  { key: 'assistant', label: 'Assistente', status: 'Pronto', tone: 'info', detail: 'Codex-ready ativo' },
];

const commercialModules = [
  {
    key: 'atendimento',
    name: 'Atendimento',
    short: 'AT',
    href: '/dashboard/inbox',
    description: 'Inbox, agenda conectada e bot do atendimento.',
    summary: 'Fila viva com atendimento humano, automação e contexto comercial no mesmo lugar.',
    metric: '128 conversas vivas',
    badge: 'Principal',
    icon: MessageCircleMore,
    gradient: 'from-cyan-400/30 via-blue-500/10 to-transparent',
  },
  {
    key: 'vendas',
    name: 'Vendas',
    short: 'VD',
    href: '/dashboard/vendas',
    description: 'CRM agenda viva com leads, retornos e próximos passos.',
    summary: 'Radar comercial com retornos quentes, funil e negociação priorizada.',
    metric: '36 leads quentes',
    badge: 'Comercial',
    icon: TrendingUp,
    gradient: 'from-violet-400/30 via-fuchsia-500/10 to-transparent',
  },
  {
    key: 'website',
    name: 'Website',
    short: 'WB',
    href: '/dashboard/website',
    description: 'Abrir o site da empresa e entrar no admin com segurança.',
    summary: 'Entrada rápida no site e administração sem quebrar o fluxo da operação.',
    metric: '3 sites ativos',
    badge: 'Canal',
    icon: Globe,
    gradient: 'from-sky-400/30 via-indigo-500/10 to-transparent',
  },
  {
    key: 'webscraping',
    name: 'Webscraping',
    short: 'WS',
    href: '/dashboard/webscraping',
    description: 'Prospecção local integrada ao workspace.',
    summary: 'Coleta inteligente para alimentar abordagem, prospecção e enriquecimento.',
    metric: '412 empresas mapeadas',
    badge: 'Aquisição',
    icon: Workflow,
    gradient: 'from-emerald-400/30 via-teal-500/10 to-transparent',
  },
  {
    key: 'follow_up_internacional',
    name: 'Follow Up',
    short: 'FU',
    href: '/dashboard/importacoes/followup-global',
    description: 'Importações, histórico e follow-up global.',
    summary: 'Acompanhamento internacional com visão de histórico e próximos passos.',
    metric: '19 processos ativos',
    badge: 'Global',
    icon: BriefcaseBusiness,
    gradient: 'from-amber-400/30 via-orange-500/10 to-transparent',
  },
];

const structuralGuides = [
  {
    key: 'cadastro',
    name: 'Cadastro',
    href: '/dashboard/importacoes/cadastros',
    description: 'Base estrutural de clientes e tabelas operacionais.',
    icon: LayoutGrid,
  },
  {
    key: 'financeiro',
    name: 'Financeiro',
    href: '/dashboard/financeiro',
    description: 'Conta, cobrança, trial e regularização do acesso.',
    icon: WalletCards,
  },
  {
    key: 'gerencial',
    name: 'Gerencial',
    href: '/dashboard/gerencial',
    description: 'Usuários, permissões e operação da equipe.',
    icon: UserCog,
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    href: '/dashboard/whatsapp',
    description: 'Conexão do motor oficial ou temporário.',
    icon: Activity,
  },
];

const systemModules = [
  {
    key: 'master',
    name: 'Master',
    href: '/dashboard/master',
    description: 'Empresas, billing, acessos e configurações globais.',
    icon: ShieldCheck,
  },
];

const timeline = [
  ['08:42', 'Atendimento assumiu 14 conversas automaticamente com contexto preservado.'],
  ['09:03', 'Financeiro marcou 2 empresas em atenção por pendência de cobrança.'],
  ['09:18', 'Webscraping entregou novos leads locais para a fila comercial.'],
  ['09:31', 'Assistente Técnico gerou prompt pronto para ajuste cirúrgico no frontend.'],
];

function toneClasses(tone) {
  if (tone === 'success') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100';
  if (tone === 'warning') return 'border-amber-400/20 bg-amber-400/10 text-amber-100';
  return 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100';
}

function HaloColumn({ side = 'left' }) {
  return (
    <div
      className={`pointer-events-none absolute ${side === 'left' ? 'left-0' : 'right-0'} top-0 hidden h-full w-[19rem] overflow-hidden xl:block`}
      aria-hidden="true"
    >
      <div className={`absolute ${side === 'left' ? '-left-16' : '-right-16'} top-10 h-[88%] w-72 rounded-full border border-cyan-300/10 bg-[radial-gradient(circle_at_center,rgba(120,119,255,0.14),transparent_62%)] blur-2xl`} />
      {[...Array(14)].map((_, i) => (
        <div
          key={i}
          className={`absolute ${side === 'left' ? 'left-10' : 'right-10'} rounded-full bg-gradient-to-b from-cyan-200/70 via-violet-300/25 to-transparent opacity-60`}
          style={{
            top: `${4 + i * 6.7}%`,
            width: `${2 + (i % 3)}px`,
            height: `${58 + (i % 4) * 22}px`,
            transform: `rotate(${side === 'left' ? 32 : -32}deg) translateX(${i % 2 === 0 ? 0 : 14}px)`,
            filter: 'blur(0.2px)',
          }}
        />
      ))}
      {[...Array(9)].map((_, i) => (
        <div
          key={`orb-${i}`}
          className={`absolute ${side === 'left' ? 'left-12' : 'right-12'} h-2.5 w-2.5 rounded-full bg-cyan-200/70 shadow-[0_0_18px_rgba(103,232,249,0.55)]`}
          style={{ top: `${10 + i * 9}%`, transform: `translateX(${i % 2 === 0 ? 14 : -12}px)` }}
        />
      ))}
    </div>
  );
}

export default function HbxDashboardInicialPremium() {
  const [selectedModuleKey, setSelectedModuleKey] = useState('atendimento');

  const selectedModule = useMemo(() => {
    return commercialModules.find((item) => item.key === selectedModuleKey) ?? commercialModules[0];
  }, [selectedModuleKey]);

  const SelectedIcon = selectedModule.icon;

  return (
    <div className="min-h-screen overflow-hidden bg-[#030617] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(56,189,248,0.18),transparent_22%),radial-gradient(circle_at_86%_12%,rgba(99,102,241,0.16),transparent_20%),radial-gradient(circle_at_50%_84%,rgba(168,85,247,0.18),transparent_24%),linear-gradient(180deg,#030617_0%,#081023_36%,#040816_100%)]" />
      <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="absolute inset-x-0 bottom-0 h-[34rem] bg-[radial-gradient(circle_at_bottom,rgba(96,165,250,0.22),transparent_44%)]" />
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-cyan-300/0 via-cyan-300/50 to-cyan-300/0 opacity-55" />
      <div className="absolute left-1/2 top-[18%] h-40 w-40 -translate-x-1/2 rounded-full bg-cyan-300/12 blur-[100px]" />
      <HaloColumn side="left" />
      <HaloColumn side="right" />

      <div className="relative z-10 px-5 py-5 md:px-8 xl:px-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-5 rounded-[30px] border border-white/10 bg-white/[0.06] p-4 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" />
                HBX Start Layer
              </div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
                Página inicial premium, real e pronta para operar.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                Não é login. Não é dashboard falso. É uma camada de entrada nobre para abrir operação,
                enxergar motores críticos e cair rápido no módulo certo.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[430px]">
              {[
                ['Empresa ativa', 'Colsani Benefícios', 'contexto atual'],
                ['Primeiro módulo', 'Atendimento', 'entrada sugerida'],
                ['Assistente', 'Codex-ready', 'cirúrgico'],
              ].map(([label, value, hint]) => (
                <div key={label} className="rounded-[24px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{value}</div>
                  <div className="mt-1 text-xs text-slate-400">{hint}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.04 }}
          className="mb-5 rounded-[30px] border border-white/10 bg-white/[0.05] p-4 shadow-[0_30px_120px_rgba(0,0,0,0.4)] backdrop-blur-2xl"
        >
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Barra de motores</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Saúde operacional no topo, antes de entrar</h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
              <CircleDot className="h-4 w-4 text-cyan-200" />
              Top status bar inspirada no fluxo real do produto
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {engines.map((engine) => (
              <div key={engine.key} className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium text-white">{engine.label}</div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${toneClasses(engine.tone)}`}>
                    {engine.status}
                  </span>
                </div>
                <div className="text-sm text-slate-300">{engine.detail}</div>
              </div>
            ))}
          </div>
        </motion.section>

        <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-5">
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08 }}
              className="rounded-[32px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.38)] backdrop-blur-2xl"
            >
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Entrada principal</div>
                  <h2 className="mt-1 text-2xl font-semibold">Abra o módulo certo em segundos</h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-300">
                    Baseado na estrutura do HBX, separei a entrada por Módulos, Guias e Sistema — sem bagunçar a navegação.
                  </p>
                </div>
                <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100">
                  Pronto para plugar em /dashboard
                </div>
              </div>

              <div className="mb-5 grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
                <div className="relative overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(7,18,38,0.96),rgba(4,10,22,0.98))] p-5 shadow-[0_0_50px_rgba(34,211,238,0.12)]">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.18),transparent_34%)]" />
                  <div className="relative z-10">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-100">
                      <Command className="h-3.5 w-3.5" />
                      Entrada inteligente
                    </div>
                    <h3 className="text-2xl font-semibold text-white md:text-3xl">Continuar operação em Atendimento</h3>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                      Abertura forte para quem quer entrar rápido, enxergar o estado do sistema e seguir direto para a operação principal.
                    </p>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      {[
                        ['Conversas', '128 vivas'],
                        ['Resposta média', '4m 21s'],
                        ['Acordos hoje', 'R$ 8.420'],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-[20px] border border-white/10 bg-black/20 p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
                          <div className="mt-2 text-lg font-semibold text-white">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/30 bg-cyan-300/12 px-4 py-3 text-sm font-medium text-cyan-100 shadow-[0_0_26px_rgba(34,211,238,0.16)]">
                        Abrir Atendimento
                        <ArrowRight className="h-4 w-4" />
                      </button>
                      <button className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
                        Ir para Financeiro
                        <CreditCard className="h-4 w-4" />
                      </button>
                      <button className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">
                        Ver motor WhatsApp
                        <Activity className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Radar do dia</div>
                      <div className="mt-1 text-lg font-semibold text-white">Pulso inicial</div>
                    </div>
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-100">
                      Vivo
                    </span>
                  </div>

                  <div className="mb-4 flex h-32 items-end gap-2 rounded-[22px] border border-white/10 bg-black/20 p-3">
                    {[42, 58, 49, 76, 70, 92, 66, 88, 60, 96].map((bar, i) => (
                      <div key={i} className="flex-1 rounded-t-xl bg-gradient-to-t from-cyan-500/50 via-blue-500/70 to-cyan-200/90" style={{ height: `${bar}%` }} />
                    ))}
                  </div>

                  <div className="space-y-3">
                    {[
                      ['Fila ativa', '14 atendentes assistidos'],
                      ['Motores críticos', '3 online / 1 atenção'],
                      ['Retomada', 'Última sessão há 12 min'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between rounded-[18px] border border-white/10 bg-black/20 px-3 py-3">
                        <span className="text-sm text-slate-300">{label}</span>
                        <span className="text-sm font-medium text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Módulos</div>
                    <div className="mt-1 text-xl font-semibold text-white">Áreas comercializáveis e operacionais</div>
                  </div>
                  <div className="text-xs text-slate-400">Clique e destaque o módulo</div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {commercialModules.map((module) => {
                    const Icon = module.icon;
                    const selected = selectedModuleKey === module.key;
                    return (
                      <motion.button
                        key={module.key}
                        whileHover={{ y: -3, scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => setSelectedModuleKey(module.key)}
                        className={`group relative overflow-hidden rounded-[28px] border p-4 text-left transition-all duration-300 ${
                          selected
                            ? 'border-cyan-300/30 bg-[linear-gradient(180deg,rgba(11,20,38,0.96),rgba(7,13,24,0.98))] shadow-[0_0_40px_rgba(34,211,238,0.14)]'
                            : 'border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] hover:border-white/20'
                        }`}
                      >
                        <div className={`absolute inset-0 bg-gradient-to-br ${module.gradient} opacity-100`} />
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-60" />
                        <div className="relative z-10">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                              <div className="text-base font-semibold text-white">{module.name}</div>
                              <div className="mt-1 text-xs text-slate-400">{module.description}</div>
                            </div>
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-lg backdrop-blur-xl">
                              <Icon className="h-5 w-5 text-white/90" />
                            </div>
                          </div>

                          <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Resumo</div>
                              <div className="mt-1 text-sm text-slate-100">{module.metric}</div>
                            </div>
                            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-100">
                              {module.badge}
                            </span>
                          </div>

                          <p className="text-sm leading-6 text-slate-300">{module.summary}</p>

                          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
                            <span>{module.href}</span>
                            <span className="inline-flex items-center gap-1">
                              {selected ? 'Selecionado' : 'Abrir'}
                              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </span>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.12 }}
              className="rounded-[32px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.38)] backdrop-blur-2xl"
            >
              <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Guias e sistema</div>
                  <h2 className="mt-1 text-2xl font-semibold">Estrutural sem poluir a entrada</h2>
                </div>
                <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
                  Separado como no repo
                </div>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_0.7fr]">
                <div>
                  <div className="mb-3 text-sm font-medium text-white">Guias</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {structuralGuides.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button key={item.key} className="group rounded-[24px] border border-white/10 bg-black/20 p-4 text-left transition hover:border-white/20 hover:bg-white/10">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
                              <Icon className="h-5 w-5 text-white/90" />
                            </div>
                            <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{item.href}</span>
                          </div>
                          <div className="text-base font-semibold text-white">{item.name}</div>
                          <div className="mt-2 text-sm leading-6 text-slate-300">{item.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-3 text-sm font-medium text-white">Sistema</div>
                  <div className="space-y-3">
                    {systemModules.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button key={item.key} className="w-full rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4 text-left transition hover:border-white/20">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
                              <Icon className="h-5 w-5 text-white/90" />
                            </div>
                            <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-violet-100">System</span>
                          </div>
                          <div className="text-base font-semibold text-white">{item.name}</div>
                          <div className="mt-2 text-sm leading-6 text-slate-300">{item.description}</div>
                          <div className="mt-4 text-xs text-slate-500">{item.href}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.section>
          </div>

          <div className="space-y-5">
            <motion.section
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="rounded-[34px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
            >
              <div className="mb-4 flex items-center justify-between rounded-[24px] border border-cyan-300/10 bg-cyan-300/5 px-4 py-3 text-sm text-slate-300">
                <span>
                  <span className="text-cyan-100">Fluxo:</span> Entrada → módulo selecionado → execução
                </span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] text-cyan-100">
                  Etapa 1
                </span>
              </div>

              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Módulo em foco</div>
                  <h2 className="mt-1 text-2xl font-semibold">Janela de decisão inicial</h2>
                </div>
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                  Pronto para abrir
                </div>
              </div>

              <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,14,28,0.96),rgba(5,9,20,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="border-b border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/10 shadow-lg backdrop-blur-xl">
                        <SelectedIcon className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Selecionado</div>
                        <div className="mt-1 text-xl font-semibold text-white">{selectedModule.name}</div>
                        <div className="mt-1 text-sm text-slate-400">{selectedModule.description}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-2xl border border-cyan-300/30 bg-cyan-300/12 px-3 py-2 text-xs text-cyan-100">Abrir agora</button>
                      <button className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">Ver contexto</button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-4">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-medium text-white">Leitura rápida</div>
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ['Resumo', selectedModule.summary],
                        ['Métrica principal', selectedModule.metric],
                        ['Rota', selectedModule.href],
                        ['Natureza', selectedModule.badge],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-[18px] border border-white/10 bg-black/20 p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
                          <div className="mt-2 text-sm font-medium leading-6 text-white">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-medium text-white">Ações rápidas</div>
                      <Wrench className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="grid gap-3">
                      {[
                        ['Abrir módulo principal', ArrowRight],
                        ['Ver dependências de motor', Activity],
                        ['Checar cobrança e acesso', CreditCard],
                        ['Abrir contexto da empresa', Building2],
                      ].map(([label, Icon]) => (
                        <button
                          key={label}
                          className="flex items-center justify-between rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
                        >
                          <span>{label}</span>
                          <Icon className="h-4 w-4 text-slate-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.14 }}
              className="rounded-[34px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Assistente Técnico HBX</div>
                  <h2 className="mt-1 text-2xl font-semibold">Copiloto real da entrada</h2>
                </div>
                <div className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs text-violet-100">
                  Premium interno
                </div>
              </div>

              <div className="mb-4 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
                    <BrainCircuit className="h-6 w-6 text-cyan-200" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">Assistente Técnico HBX</div>
                    <div className="mt-1 text-sm text-slate-400">Lido com seu fluxo real: página atual, erro, contexto e prompt cirúrgico.</div>
                  </div>
                </div>
                <div className="grid gap-3">
                  {[
                    ['Analisar página atual', LayoutGrid],
                    ['Analisar erro', Wrench],
                    ['Gerar prompt para Codex', Bot],
                    ['Checklist pré-publicação', ShieldCheck],
                  ].map(([label, Icon]) => (
                    <button key={label} className="flex items-center justify-between rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10">
                      <span>{label}</span>
                      <Icon className="h-4 w-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 text-sm font-medium text-white">Timeline de retomada</div>
                <div className="space-y-3">
                  {timeline.map(([time, text], index) => (
                    <motion.div
                      key={time + text}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.18 + index * 0.05 }}
                      className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4"
                    >
                      <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-cyan-300 via-blue-500 to-violet-500" />
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-[0.18em] text-cyan-200">{time}</span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                          Hoje
                        </span>
                      </div>
                      <div className="pl-2 text-sm leading-6 text-slate-100">{text}</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    </div>
  );
}
