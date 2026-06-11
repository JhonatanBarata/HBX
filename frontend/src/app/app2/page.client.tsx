"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CORPORATE_LABELS,
  HbxCorporateAvatar,
  HbxCorporateIcon,
  HbxCorporateKpis,
  HbxCorporatePanel,
  HbxCorporateShell,
  HbxCorporateTag,
  hbxCorporateStyles as styles,
  type HbxCorporateSection,
} from "@/components/corporate/HbxCorporateShell";

const kpis = [
  { label: "Receita prevista", value: "R$ 428 mil", delta: "+18%", icon: "money" as const },
  { label: "Leads ativos", value: "1.284", delta: "+11%", icon: "leads" as const },
  { label: "Conversas hoje", value: "342", delta: "+24%", icon: "msg" as const },
  { label: "Tempo medio", value: "3m 42s", delta: "-9%", icon: "clock" as const, down: true },
];

const leads = [
  ["Mercado Norte", "WhatsApp", "88", "Proposta", "Mariana", "10:42"],
  ["Clínica Vitta", "E-mail", "76", "Contato", "Rafael", "09:18"],
  ["Auto Peças Lima", "Instagram", "69", "Qualificação", "Bruna", "Ontem"],
  ["Padaria Central", "WhatsApp", "92", "Fechamento", "Mariana", "Ontem"],
];

const deals = [
  { stage: "Novo", total: "R$ 48k", cards: ["Mercado Norte", "Drogaria Sul", "Studio Fit"] },
  { stage: "Contato", total: "R$ 82k", cards: ["Clínica Vitta", "Oficina Real"] },
  { stage: "Proposta", total: "R$ 126k", cards: ["Padaria Central", "Móveis Alfa"] },
  { stage: "Negociação", total: "R$ 98k", cards: ["Hotel Serena", "Auto Peças Lima"] },
  { stage: "Fechado", total: "R$ 74k", cards: ["Restaurante Bela Vista"] },
];

const conversations = [
  ["Mercado Norte", "WhatsApp", "Pode me mandar a proposta ainda hoje?", "2"],
  ["Clínica Vitta", "E-mail", "Recebemos o material, vamos avaliar.", ""],
  ["Padaria Central", "WhatsApp", "Fechamos. Como avançamos?", "1"],
  ["Auto Peças Lima", "Instagram", "Qual o prazo da implantação?", ""],
];

const CORPORATE_SECTIONS: HbxCorporateSection[] = [
  "dashboard",
  "leads",
  "webscraping",
  "vendas",
  "atendimento",
  "bot",
  "relatorios",
  "configuracoes",
  "login",
];

function normalizeSection(value: string | null): HbxCorporateSection {
  const normalized = String(value || "").trim().toLowerCase();
  return CORPORATE_SECTIONS.includes(normalized as HbxCorporateSection)
    ? (normalized as HbxCorporateSection)
    : "dashboard";
}

const bars: Array<[string, number]> = [
  ["Jan", 54],
  ["Fev", 72],
  ["Mar", 66],
  ["Abr", 94],
  ["Mai", 82],
  ["Jun", 108],
];

function Bars() {
  return (
    <div className={styles.bars}>
      {bars.map(([label, value]) => (
        <div key={label} className={styles.barItem}>
          <span className={styles.bar} style={{ height: `${value}px` }} />
          <span className={styles.barLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  return (
    <>
      <HbxCorporateKpis items={kpis} />
      <div className={styles.grid2}>
        <HbxCorporatePanel title="Receita dos últimos 6 meses" meta={<span className={styles.mono}>R$ 428.300</span>}>
          <Bars />
        </HbxCorporatePanel>
        <HbxCorporatePanel title="Funil comercial" meta="Atualizado agora">
          <div className={styles.list}>
            {["Leads captados", "Contato iniciado", "Proposta enviada", "Fechamento"].map((item, index) => (
              <div key={item} className={styles.listItem}>
                <span className={styles.dot} />
                <div>
                  <strong>{item}</strong>
                  <p className={styles.muted}>{[1284, 612, 244, 78][index]} oportunidades em movimento</p>
                </div>
              </div>
            ))}
          </div>
        </HbxCorporatePanel>
      </div>
      <div className={styles.grid2}>
        <HbxCorporatePanel title="Atividade recente">
          {["Lead quente entrou no Radar", "Proposta aceita no WhatsApp", "Bot transferiu conversa crítica"].map((item) => (
            <div key={item} className={styles.listItem}>
              <span className={styles.dot} />
              <div>
                <strong>{item}</strong>
                <p className={styles.muted}>Agora há pouco</p>
              </div>
            </div>
          ))}
        </HbxCorporatePanel>
        <HbxCorporatePanel title="Top vendedores">
          {["Mariana Souza", "Rafael Lima", "Bruna Costa"].map((name, index) => (
            <div key={name} className={styles.listItem}>
              <HbxCorporateAvatar name={name} size={32} />
              <div style={{ flex: 1 }}>
                <strong>{name}</strong>
                <div className={styles.progressBar}>
                  <span style={{ width: `${[86, 74, 62][index]}%` }} />
                </div>
              </div>
            </div>
          ))}
        </HbxCorporatePanel>
      </div>
    </>
  );
}

function Leads() {
  return (
    <>
      <HbxCorporateKpis items={kpis} />
      <HbxCorporatePanel title="Leads priorizados" meta={<button className={styles.ghostButton}>Filtrar etapa</button>}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Canal</th>
              <th>Score</th>
              <th>Etapa</th>
              <th>Responsável</th>
              <th>Último contato</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, index) => (
              <tr key={lead[0]} data-selected={index === 0}>
                <td><strong>{lead[0]}</strong></td>
                <td><span className={styles.channel} data-channel={lead[1] === "WhatsApp" ? "whatsapp" : lead[1] === "E-mail" ? "email" : "instagram"}>{lead[1]}</span></td>
                <td><span className={styles.score}>{lead[2]}</span></td>
                <td><HbxCorporateTag tone={index === 3 ? "teal" : "info"}>{lead[3]}</HbxCorporateTag></td>
                <td>{lead[4]}</td>
                <td className={styles.mono}>{lead[5]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HbxCorporatePanel>
    </>
  );
}

function Webscraping() {
  return (
    <>
      <HbxCorporateKpis items={[
        { label: "Coletas hoje", value: "18", delta: "+6%", icon: "scrape" as const },
        { label: "Empresas válidas", value: "742", delta: "+14%", icon: "check" as const },
        { label: "Duplicadas", value: "31", delta: "-4%", icon: "leads" as const, down: true },
        { label: "Canais achados", value: "1.942", delta: "+19%", icon: "mail" as const },
      ]} />
      <HbxCorporatePanel title="Coleta ativa" meta={<button className={styles.tealButton}>Executar coleta</button>}>
        <div className={styles.miniGrid}>
          {["Segmento", "Cidade", "Origem"].map((label) => (
            <label key={label} className={styles.miniCard}>
              <span className={styles.muted}>{label}</span>
              <input className={styles.field} placeholder={`Selecionar ${label.toLowerCase()}`} />
            </label>
          ))}
        </div>
      </HbxCorporatePanel>
      <Leads />
    </>
  );
}

function Vendas() {
  return (
    <>
      <HbxCorporateKpis items={kpis} />
      <HbxCorporatePanel title="Pipeline de vendas" meta={<span className={styles.mono}>R$ 428.300</span>}>
        <div className={styles.kanban}>
          {deals.map((column, columnIndex) => (
            <section key={column.stage} className={styles.kanbanColumn}>
              <header className={styles.columnHead}>
                <strong>{column.stage}</strong>
                <span>{column.total}</span>
              </header>
              {column.cards.map((card, cardIndex) => (
                <article key={card} className={styles.kanbanCard} data-selected={columnIndex === 2 && cardIndex === 0}>
                  <strong>{card}</strong>
                  <span className={styles.muted}>Contato: Paula Andrade</span>
                  <span className={styles.mono}>R$ {[18, 24, 42][cardIndex % 3]}.000</span>
                  <span className={styles.muted}>Próximo passo: WhatsApp hoje</span>
                </article>
              ))}
            </section>
          ))}
        </div>
      </HbxCorporatePanel>
    </>
  );
}

function Atendimento() {
  return (
    <>
      <HbxCorporateKpis items={kpis} />
      <section className={styles.panel}>
        <div className={styles.chatShell}>
          <aside className={styles.conversationList}>
            {conversations.map((conversation, index) => (
              <button key={conversation[0]} className={styles.conversationItem} data-selected={index === 0}>
                <HbxCorporateAvatar name={conversation[0]} size={32} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{conversation[0]}</strong>
                  <p className={styles.muted}>{conversation[2]}</p>
                </div>
                {conversation[3] ? <span className={styles.bubble}>{conversation[3]}</span> : null}
              </button>
            ))}
          </aside>
          <div className={styles.thread}>
            <div className={styles.messages}>
              <div className={styles.message}><p className={styles.bubbleMsg}>Pode me mandar a proposta ainda hoje?</p></div>
              <div className={styles.message} data-side="out"><p className={styles.bubbleMsg}>Envio agora com implantação e próximos passos.</p></div>
              <div className={styles.message}><p className={styles.bubbleMsg}>Perfeito. Quero fechar até sexta.</p></div>
            </div>
            <div className={styles.composer}>
              <input className={styles.field} placeholder="Responder no WhatsApp..." />
              <button className={styles.sendButton} aria-label="Enviar"><HbxCorporateIcon name="send" /></button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Bot() {
  return (
    <>
      <HbxCorporatePanel title="Construtor de bot" meta={<><button className={styles.ghostButton}>Testar bot</button><button className={styles.tealButton}>Publicar</button></>}>
        <div className={styles.botLayout}>
          <aside className={styles.subnav}>
            {["Mensagem", "Pergunta", "Condição", "WhatsApp", "Handoff", "Finalizar"].map((item, index) => (
              <button key={item} data-active={index === 0}>{item}</button>
            ))}
          </aside>
          <div className={styles.nodeCanvas}>
            <div className={styles.node} style={{ left: 70, top: 56 }}><strong>Entrada</strong><span className={styles.muted}>Lead respondeu campanha</span></div>
            <div className={styles.node} style={{ left: 330, top: 150 }}><strong>Condição</strong><span className={styles.muted}>Tem interesse agora?</span></div>
            <div className={styles.node} style={{ left: 590, top: 74 }}><strong>Handoff</strong><span className={styles.muted}>Enviar para vendedor</span></div>
          </div>
        </div>
      </HbxCorporatePanel>
    </>
  );
}

function Relatorios() {
  return (
    <>
      <HbxCorporateKpis items={kpis} />
      <div className={styles.grid2}>
        <HbxCorporatePanel title="Receita por mês" meta={<button className={styles.ghostButton}>Exportar CSV</button>}>
          <Bars />
        </HbxCorporatePanel>
        <HbxCorporatePanel title="Leads por canal">
          {["WhatsApp", "E-mail", "Instagram"].map((channel, index) => (
            <div key={channel} className={styles.listItem}>
              <span className={styles.channel} data-channel={index === 0 ? "whatsapp" : index === 1 ? "email" : "instagram"}>{channel}</span>
              <div className={styles.progressBar} style={{ flex: 1 }}><span style={{ width: `${[82, 54, 38][index]}%` }} /></div>
            </div>
          ))}
        </HbxCorporatePanel>
      </div>
    </>
  );
}

function Configuracoes() {
  return (
    <HbxCorporatePanel title="Configurações do workspace" meta="Equipe e plano">
      <div className={styles.settingsLayout}>
        <aside className={styles.subnav}>
          {["Perfil", "Empresa", "Equipe", "Notificações", "Plano"].map((item, index) => (
            <button key={item} data-active={index === 2}>{item}</button>
          ))}
        </aside>
        <div className={styles.list}>
          {["Mariana Souza", "Rafael Lima", "Bruna Costa"].map((name) => (
            <div key={name} className={styles.listItem}>
              <HbxCorporateAvatar name={name} size={34} />
              <div style={{ flex: 1 }}>
                <strong>{name}</strong>
                <p className={styles.muted}>Permissões herdadas do plano empresarial</p>
              </div>
              <HbxCorporateTag tone="teal">Ativo</HbxCorporateTag>
            </div>
          ))}
        </div>
      </div>
    </HbxCorporatePanel>
  );
}

function LoginPreview() {
  return (
    <section className={styles.loginPreview}>
      <div className={styles.loginPitch}>
        <HbxCorporateTag tone="teal">HBX Corporativo</HbxCorporateTag>
        <h2>O vazamento de receita está no WhatsApp.</h2>
        <p className={styles.muted}>Entre com a operação inteira em uma só esteira: leads, vendas, atendimento, bot e retorno.</p>
      </div>
      <div className={styles.loginCard}>
        <form>
          <strong>Acessar workspace</strong>
          <input className={styles.field} placeholder="E-mail" />
          <input className={styles.field} placeholder="Senha" type="password" />
          <button type="button" className={styles.tealButton}>Entrar</button>
          <button type="button" className={styles.ghostButton}>Ver implantação</button>
        </form>
      </div>
    </section>
  );
}

function ContextPanel({ section }: { section: HbxCorporateSection }) {
  return (
    <>
      <h3 style={{ margin: 0 }}>{CORPORATE_LABELS[section]}</h3>
      <div className={styles.miniCard}>
        <strong>Contexto do lead</strong>
        <p className={styles.muted}>Mercado Norte está quente, com score 88 e próxima ação marcada para hoje.</p>
        <HbxCorporateTag tone="teal">Prioridade alta</HbxCorporateTag>
      </div>
      <div className={styles.miniCard}>
        <strong>Próximas ações</strong>
        <div className={styles.listItem}><span className={styles.dot} /><span>Enviar proposta</span></div>
        <div className={styles.listItem}><span className={styles.dot} /><span>Confirmar implantação</span></div>
      </div>
      <button className={styles.tealButton}>Abrir WhatsApp</button>
    </>
  );
}

export default function HbxCorporatePreview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<HbxCorporateSection>(() => normalizeSection(searchParams.get("section")));
  const handleNavigate = (nextSection: HbxCorporateSection) => {
    setSection(nextSection);
    router.replace(`/app2?section=${nextSection}`, { scroll: false });
  };
  const content = useMemo(() => {
    if (section === "dashboard") return <Dashboard />;
    if (section === "leads") return <Leads />;
    if (section === "webscraping") return <Webscraping />;
    if (section === "vendas") return <Vendas />;
    if (section === "atendimento") return <Atendimento />;
    if (section === "bot") return <Bot />;
    if (section === "relatorios") return <Relatorios />;
    if (section === "configuracoes") return <Configuracoes />;
    return <LoginPreview />;
  }, [section]);

  return (
    <HbxCorporateShell active={section} onNavigate={handleNavigate} context={<ContextPanel section={section} />}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {CORPORATE_SECTIONS.map((item) => (
          <button key={item} type="button" className={item === section ? styles.tealButton : styles.ghostButton} onClick={() => handleNavigate(item)}>
            {CORPORATE_LABELS[item]}
          </button>
        ))}
      </div>
      {content}
    </HbxCorporateShell>
  );
}
