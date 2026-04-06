import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CalendarDays, ChevronRight, Clock3, Filter, MessageCircleMore, Sparkles, TrendingUp, UserRound, WalletCards } from 'lucide-react';

export default function HbxAtendimentoPremium() {
  const [selectedDate, setSelectedDate] = useState('05 Abr');
  const [selectedClientId, setSelectedClientId] = useState(1);
  const dates = [
    { label: '01 Abr', total: 18 },
    { label: '02 Abr', total: 24 },
    { label: '03 Abr', total: 31 },
    { label: '04 Abr', total: 28 },
    { label: '05 Abr', total: 42, active: true },
    { label: '06 Abr', total: 36 },
    { label: '07 Abr', total: 22 },
  ];

  const clients = [
    {
      id: 1,
      name: 'Auto Socorro Rio Claro',
      lane: 'Atendimento prioritário',
      status: 'Em atendimento ativo',
      unread: 12,
      value: '12 interações hoje',
      owner: 'Marina',
      health: 'SLA 97%',
      tags: ['WhatsApp', 'Financeiro', 'Urgente'],
      amount: 'R$ 8.420',
      gradient: 'from-cyan-400/30 via-blue-500/10 to-transparent',
    },
    {
      id: 2,
      name: 'Clínica Prime Santé',
      lane: 'Comercial / conversão',
      status: 'Aguardando retorno',
      unread: 8,
      value: 'Lead aquecido',
      owner: 'Felipe',
      health: 'Chance 84%',
      tags: ['Lead quente', 'Follow-up'],
      amount: 'R$ 3.180',
      gradient: 'from-violet-400/30 via-fuchsia-500/10 to-transparent',
    },
    {
      id: 3,
      name: 'Grupo Atlas Logística',
      lane: 'Pós-venda',
      status: 'Resolvido parcial',
      unread: 5,
      value: '5 tickets abertos',
      owner: 'Beatriz',
      health: 'SLA 91%',
      tags: ['Operacional', 'SLA'],
      amount: 'R$ 2.440',
      gradient: 'from-emerald-400/30 via-teal-500/10 to-transparent',
    },
    {
      id: 4,
      name: 'Colsani Benefícios',
      lane: 'Relacionamento',
      status: 'Nova atividade',
      unread: 21,
      value: 'Fluxo automático ativo',
      owner: 'Gustavo',
      health: 'Bot 100%',
      tags: ['Recovery', 'Bot ativo'],
      amount: 'R$ 14.050',
      gradient: 'from-amber-400/30 via-orange-500/10 to-transparent',
    },
    {
      id: 5,
      name: 'Vision Odonto Center',
      lane: 'Cobrança / acordo',
      status: 'Em negociação',
      unread: 6,
      value: 'Alta chance de fechamento',
      owner: 'Larissa',
      health: 'Win rate 78%',
      tags: ['Cobrança', 'Alta chance'],
      amount: 'R$ 3.840',
      gradient: 'from-sky-400/30 via-indigo-500/10 to-transparent',
    },
    {
      id: 6,
      name: 'Mercado Lume',
      lane: 'Campanha ativa',
      status: 'Fluxo automático',
      unread: 16,
      value: '16 contatos aquecidos',
      owner: 'Rafael',
      health: 'Entrega 99%',
      tags: ['Bot', 'Campanha'],
      amount: 'R$ 6.770',
      gradient: 'from-pink-400/30 via-rose-500/10 to-transparent',
    },
  ];

  const selectedClient = useMemo(() => {
    return clients.find((client) => client.id === selectedClientId) ?? clients[0];
  }, [clients, selectedClientId]);

  const miniBars = [42, 66, 48, 82, 61, 73, 94, 76, 58, 88, 72, 98];

  return (
    <div className="min-h-screen overflow-hidden bg-[#040816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(59,130,246,0.22),transparent_22%),radial-gradient(circle_at_85%_10%,rgba(34,211,238,0.18),transparent_18%),radial-gradient(circle_at_55%_85%,rgba(168,85,247,0.18),transparent_22%),linear-gradient(180deg,#040816_0%,#07101f_35%,#040816_100%)]" />
      <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="absolute left-[-8%] top-[18%] h-72 w-72 rounded-full bg-cyan-500/20 blur-[120px]" />
      <div className="absolute right-[-10%] top-[5%] h-96 w-96 rounded-full bg-blue-600/20 blur-[140px]" />
      <div className="absolute bottom-[-10%] left-[30%] h-80 w-80 rounded-full bg-violet-600/20 blur-[140px]" />

      <div className="relative z-10 px-5 py-5 md:px-8 xl:px-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-5 rounded-[30px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
        >
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" />
                HBX Atendimento Premium
              </div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
                Operação de atendimento com cara de SaaS premium, fino e vendável.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                Fluxo visual de alto nível: datas filtráveis no topo, clientes em cartões nobres no centro e,
                ao selecionar um cliente, uma experiência interna com timeline, métricas, automações e ação humana.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[430px]">
              {[
                ['Conversões', '+18.4%', 'vs ontem'],
                ['Tickets vivos', '124', 'em tempo real'],
                ['Tempo médio', '4m 21s', 'resposta total'],
              ].map(([label, value, hint]) => (
                <div key={label} className="rounded-[24px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
                  <div className="mt-1 text-xs text-slate-400">{hint}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.05 }}
              className="rounded-[30px] border border-white/10 bg-white/[0.06] p-4 shadow-[0_30px_120px_rgba(0,0,0,0.38)] backdrop-blur-2xl"
            >
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Filtro inteligente por data</div>
                  <h2 className="mt-1 text-xl font-semibold text-white">Datas pequenas no topo, com leitura premium</h2>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
                  <Filter className="h-4 w-4" />
                  Interativo
                </div>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-1">
                {dates.map((date) => (
                  <button
                    key={date.label}
                    onClick={() => setSelectedDate(date.label)}
                    className={`group relative min-w-[98px] overflow-hidden rounded-[22px] border px-4 py-3 text-left transition-all duration-300 ${
                      selectedDate === date.label
                        ? 'border-cyan-300/30 bg-cyan-300/12 shadow-[0_0_30px_rgba(34,211,238,0.18)]'
                        : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-60" />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Dia</span>
                      <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white">{date.label}</div>
                    <div className="mt-1 text-xs text-slate-400">{date.total} clientes</div>
                    {selectedDate === date.label && (
                      <div className="mt-2 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-100">
                        Selecionado
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08 }}
              className="rounded-[32px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.38)] backdrop-blur-2xl"
            >
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Clientes do dia</div>
                  <h2 className="mt-1 text-2xl font-semibold">Cards finos, bem espaçados e cara de produto forte</h2>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">Todos</button>
                  <button className="rounded-2xl border border-cyan-300/30 bg-cyan-300/12 px-3 py-2 text-xs text-cyan-100">Ativos</button>
                  <button className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">Recovery</button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {clients.map((client) => (
                  <motion.button
                    whileHover={{ y: -4, scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setSelectedClientId(client.id)}
                    key={client.id}
                    className={`group relative overflow-hidden rounded-[28px] border p-4 text-left transition-all duration-300 ${
                      selectedClientId === client.id
                        ? 'border-cyan-300/30 bg-[linear-gradient(180deg,rgba(11,20,38,0.96),rgba(7,13,24,0.96))] shadow-[0_0_40px_rgba(34,211,238,0.14)]'
                        : 'border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] hover:border-white/20'
                    }`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${client.gradient} opacity-100`} />
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-60" />
                    <div className="relative z-10">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-white">{client.name}</div>
                          <div className="mt-1 text-xs text-slate-400">{client.lane}</div>
                        </div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-lg backdrop-blur-xl">
                          <UserRound className="h-5 w-5 text-white/90" />
                        </div>
                      </div>

                      <div className="mb-4 grid grid-cols-2 gap-2">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
                          <div className="mt-1 text-sm text-white">{client.status}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Mensagens</div>
                          <div className="mt-1 text-sm text-white">{client.unread} não lidas</div>
                        </div>
                      </div>

                      <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Potencial</div>
                          <div className="mt-1 text-sm text-slate-200">{client.amount}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Saúde</div>
                          <div className="mt-1 text-sm text-slate-200">{client.health}</div>
                        </div>
                      </div>

                      <div className="mb-4 flex items-center justify-between text-sm text-slate-300">
                        <span>{client.value}</span>
                        <span>{client.owner}</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {client.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
                        <span>{selectedClientId === client.id ? 'Cliente aberto' : 'Abrir cliente'}</span>
                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.section>
          </div>

          <motion.section
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.1 }}
            className="rounded-[34px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
          >
            <div className="mb-4 flex items-center justify-between rounded-[24px] border border-cyan-300/10 bg-cyan-300/5 px-4 py-3 text-sm text-slate-300">
              <span>
                <span className="text-cyan-100">Fluxo UX:</span> {selectedDate} → cliente selecionado → operação detalhada
              </span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] text-cyan-100">
                Etapa 3 de 3
              </span>
            </div>

            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Tela do cliente</div>
                <h2 className="mt-1 text-2xl font-semibold">Tudo acontecendo aqui dentro</h2>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                Operação ao vivo
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={selectedClient.id}
                initial={{ opacity: 0, y: 18, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.985 }}
                transition={{ duration: 0.28 }}
                className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,14,28,0.96),rgba(5,9,20,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
              >
                <div className="border-b border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Cliente selecionado</div>
                      <div className="mt-1 text-xl font-semibold text-white">{selectedClient.name}</div>
                      <div className="mt-1 text-sm text-slate-400">Hub interno do cliente com timeline, KPIs, bot e financeiro</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">Perfil</button>
                      <button className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">Histórico</button>
                      <button className="rounded-2xl border border-cyan-300/30 bg-cyan-300/12 px-3 py-2 text-xs text-cyan-100">Abrir fluxo</button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-white">Resumo do cliente</div>
                          <div className="mt-1 text-xs text-slate-400">Contexto puxado da etapa anterior</div>
                        </div>
                        <Bell className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[18px] border border-white/10 bg-black/20 p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
                          <div className="mt-2 text-base font-semibold text-white">{selectedClient.status}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-black/20 p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Mensagens</div>
                          <div className="mt-2 text-base font-semibold text-white">{selectedClient.unread} não lidas</div>
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-black/20 p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Responsável</div>
                          <div className="mt-2 text-base font-semibold text-white">{selectedClient.owner}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-black/20 p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Potencial</div>
                          <div className="mt-2 text-base font-semibold text-white">{selectedClient.amount}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-medium text-white">Ações do cliente</div>
                        <Bell className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="grid gap-3">
                        {[
                          ['Abrir atendimento humano', MessageCircleMore],
                          ['Executar automação recovery', Sparkles],
                          ['Enviar template WhatsApp', Clock3],
                          ['Gerar link de pagamento', WalletCards],
                          ['Ver métricas operacionais', TrendingUp],
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

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="mb-3 text-sm font-medium text-white">Indicadores nobres</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          ['SLA atual', selectedClient.health],
                          ['Tempo resposta', '01m 42s'],
                          ['Conversão', '84%'],
                          ['Receita provável', selectedClient.amount],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-[18px] border border-white/10 bg-black/20 p-3">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
                            <div className="mt-2 text-lg font-semibold text-white">{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-medium text-white">Mini gráfico operacional</div>
                        <div className="text-xs text-cyan-200">+22% impulso</div>
                      </div>
                      <div className="flex h-28 items-end gap-2 rounded-[20px] border border-white/10 bg-black/20 p-3">
                        {miniBars.map((bar, i) => (
                          <div key={i} className="flex-1 rounded-t-xl bg-gradient-to-t from-cyan-500/50 via-blue-500/70 to-cyan-200/90" style={{ height: `${bar}%` }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-white">Timeline viva do cliente</div>
                        <div className="mt-1 text-xs text-slate-400">Atendimento, bot, financeiro e ações humanas no mesmo lugar</div>
                      </div>
                      <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200">
                        Ao vivo
                      </div>
                    </div>

                    <div className="space-y-3">
                      {[
                        ['08:42', `Bot iniciou contato com ${selectedClient.name} usando template oficial da empresa.`, 'Automação'],
                        ['09:03', 'Cliente respondeu pedindo segunda via e condição de pagamento.', 'Mensagem'],
                        ['09:08', 'Sistema gerou link Mercado Pago e registrou evento no histórico.', 'Financeiro'],
                        ['09:15', 'Atendente assumiu a conversa para fechamento manual com contexto preservado.', 'Humano'],
                        ['09:24', 'Novo lembrete agendado e etapa do funil atualizada para acompanhamento.', 'Workflow'],
                      ].map(([time, title, type], index) => (
                        <motion.div
                          key={time + title}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.35, delay: 0.12 + index * 0.05 }}
                          className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4"
                        >
                          <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-cyan-300 via-blue-500 to-violet-500" />
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-[0.18em] text-cyan-200">{time}</span>
                            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">{type}</span>
                          </div>
                          <div className="pl-2 text-sm leading-6 text-slate-100">{title}</div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
