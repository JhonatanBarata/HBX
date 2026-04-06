export default function HbxAtendimentoPremium() {
  const dates = [
    '01 Abr',
    '02 Abr',
    '03 Abr',
    '04 Abr',
    '05 Abr',
    '06 Abr',
    '07 Abr',
  ];

  const clients = [
    {
      id: 1,
      name: 'Auto Socorro Rio Claro',
      segment: 'Suporte prioritário',
      status: 'Em andamento',
      value: '12 interações hoje',
      owner: 'Marina',
      tags: ['WhatsApp', 'Financeiro', 'Urgente'],
    },
    {
      id: 2,
      name: 'Clínica Prime Santé',
      segment: 'Atendimento comercial',
      status: 'Aguardando retorno',
      value: '8 interações hoje',
      owner: 'Felipe',
      tags: ['Lead quente', 'Follow-up'],
    },
    {
      id: 3,
      name: 'Grupo Atlas Logística',
      segment: 'Pós-venda',
      status: 'Resolvido parcial',
      value: '5 tickets abertos',
      owner: 'Beatriz',
      tags: ['Operacional', 'SLA'],
    },
    {
      id: 4,
      name: 'Colsani Benefícios',
      segment: 'Relacionamento',
      status: 'Nova atividade',
      value: '21 mensagens não lidas',
      owner: 'Gustavo',
      tags: ['Recuperação', 'Bot ativo'],
    },
    {
      id: 5,
      name: 'Vision Odonto Center',
      segment: 'Atendimento ativo',
      status: 'Em negociação',
      value: 'R$ 3.840 em aberto',
      owner: 'Larissa',
      tags: ['Cobrança', 'Alta chance'],
    },
    {
      id: 6,
      name: 'Mercado Lume',
      segment: 'Atendimento digital',
      status: 'Fluxo automático',
      value: '16 contatos aquecidos',
      owner: 'Rafael',
      tags: ['Bot', 'Campanha'],
    },
  ];

  const selectedClient = clients[0];

  return (
    <div className="min-h-screen bg-[#07111f] text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(38,99,255,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(0,204,255,0.16),transparent_22%),radial-gradient(circle_at_bottom_center,rgba(110,77,255,0.18),transparent_28%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative z-10 px-6 py-6 md:px-10 lg:px-12">
        <header className="mb-8 flex flex-col gap-6 rounded-[28px] border border-white/10 bg-white/5 px-6 py-5 backdrop-blur-xl shadow-[0_0_80px_rgba(0,0,0,0.35)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-cyan-200">
              Atendimento SaaS Premium
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-4xl">
              Central inteligente de clientes e operações
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">
              Um painel elegante inspirado em fluxos modernos de atendimento, com foco em visual premium,
              distribuição limpa dos cartões e visão detalhada por cliente.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 md:grid-cols-3">
            {[
              ['Conversões', '+18.4%'],
              ['Tickets ativos', '124'],
              ['Tempo médio', '4m 21s'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right shadow-lg">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
                <div className="mt-1 text-lg font-semibold text-white md:text-xl">{value}</div>
              </div>
            ))}
          </div>
        </header>

        <section className="mb-8 rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Filtro interativo</div>
              <h2 className="mt-1 text-lg font-medium text-white">Datas no topo, compactas e elegantes</h2>
            </div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
              Hoje selecionado
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-1">
            {dates.map((date, index) => (
              <button
                key={date}
                className={`group min-w-[92px] rounded-2xl border px-4 py-3 text-left transition-all duration-300 ${
                  index === 4
                    ? 'border-cyan-300/30 bg-cyan-300/15 shadow-[0_0_24px_rgba(34,211,238,0.18)]'
                    : 'border-white/8 bg-black/20 hover:border-white/20 hover:bg-white/10'
                }`}
              >
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Data</div>
                <div className="mt-1 text-sm font-semibold text-white">{date}</div>
                <div className="mt-1 text-[11px] text-slate-400 group-hover:text-slate-300">Ver clientes</div>
              </button>
            ))}
          </div>
        </section>

        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[30px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_25px_100px_rgba(0,0,0,0.35)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Clientes do período</div>
                <h2 className="mt-1 text-xl font-semibold">Cartões bem distribuídos</h2>
              </div>
              <div className="flex gap-2">
                <button className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">Todos</button>
                <button className="rounded-xl border border-cyan-300/30 bg-cyan-300/15 px-3 py-2 text-xs text-cyan-100">Em alta</button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {clients.map((client, index) => (
                <button
                  key={client.id}
                  className={`group rounded-[24px] border p-4 text-left transition-all duration-300 ${
                    index === 0
                      ? 'border-cyan-300/30 bg-[linear-gradient(180deg,rgba(22,34,64,0.95),rgba(9,15,29,0.95))] shadow-[0_0_30px_rgba(34,211,238,0.12)]'
                      : 'border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{client.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{client.segment}</div>
                    </div>
                    <div className="h-10 w-10 rounded-2xl bg-[linear-gradient(135deg,#22d3ee,#2563eb)] opacity-90 shadow-lg" />
                  </div>

                  <div className="mb-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
                    <div className="mt-1 text-sm text-white">{client.status}</div>
                  </div>

                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Resumo</div>
                      <div className="mt-1 text-sm text-slate-200">{client.value}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Responsável</div>
                      <div className="mt-1 text-sm text-slate-200">{client.owner}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {client.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_25px_100px_rgba(0,0,0,0.35)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Visão do cliente</div>
                <h2 className="mt-1 text-xl font-semibold">Tela interna de operação</h2>
              </div>
              <div className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs text-violet-100">
                Cliente selecionado
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,30,0.95),rgba(7,11,21,0.95))] p-4 shadow-inner">
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
                <div>
                  <div className="text-lg font-semibold text-white">{selectedClient.name}</div>
                  <div className="mt-1 text-sm text-slate-400">Centro de ações, timeline e automações do cliente</div>
                </div>
                <div className="flex gap-2">
                  <button className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">Perfil</button>
                  <button className="rounded-xl border border-cyan-300/30 bg-cyan-300/15 px-3 py-2 text-xs text-cyan-100">Abrir fluxo</button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="mb-3 text-sm font-medium text-white">Opções do cliente</div>
                    <div className="grid gap-3">
                      {[
                        'Abrir atendimento humano',
                        'Executar automação Recovery',
                        'Enviar template WhatsApp',
                        'Gerar link de pagamento',
                        'Visualizar histórico',
                      ].map((item) => (
                        <button key={item} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10">
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-medium text-white">Indicadores</div>
                      <div className="text-xs text-emerald-300">+12% hoje</div>
                    </div>
                    <div className="space-y-3">
                      {[
                        ['SLA atual', '97%'],
                        ['Tempo de resposta', '01m 42s'],
                        ['Chance de conversão', '84%'],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
                          <span className="text-sm text-slate-300">{label}</span>
                          <span className="text-sm font-semibold text-white">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">Tudo acontecendo aqui</div>
                      <div className="mt-1 text-xs text-slate-400">Timeline, mensagens, eventos e tarefas em tempo real</div>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200">
                      Ao vivo
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      ['08:42', 'Bot iniciou contato de cobrança com template financeiro.', 'Automação'],
                      ['09:03', 'Cliente respondeu e pediu segunda via do boleto.', 'Mensagem'],
                      ['09:08', 'Sistema gerou link Mercado Pago e registrou no histórico.', 'Financeiro'],
                      ['09:15', 'Atendente assumiu a conversa para fechamento manual.', 'Humano'],
                    ].map(([time, title, type]) => (
                      <div key={time + title} className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs uppercase tracking-[0.18em] text-cyan-200">{time}</span>
                          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300">{type}</span>
                        </div>
                        <div className="text-sm text-slate-100">{title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
