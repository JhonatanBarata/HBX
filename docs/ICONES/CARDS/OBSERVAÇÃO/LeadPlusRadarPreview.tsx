// LeadPlusRadarPreview.tsx
// Componente visual para preview/encaixe da tela HBX Radar Lead+.
// Não remove observação nem fluxo de vendas: este é o bloco superior "Lead+" completo.

import "./LeadPlusRadarPreview.css";

export default function LeadPlusRadarPreview() {
  return (
    <main className="leadPlusPage">
      <header className="leadPlusTopbar">
        <div className="leadPlusTitle">
          <h1>HBX Radar</h1>
          <p>Leads identificados com alto potencial de negócio.</p>
        </div>

        <div className="leadPlusToolbar">
          <button className="leadPlusSort">Ordenar por: <strong>Mais relevantes</strong>⌄</button>
          <button className="leadPlusFilter">⌯ Filtros (2)</button>
          <button className="leadPlusIconBtn">☷</button>
        </div>
      </header>

      <section className="leadPlusLayout">
        <aside className="leadPlusListCard">
          <div className="leadPlusMini">
            <div className="leadPlusLogo"><span>A</span></div>
            <div>
              <div className="leadPlusMiniTitle">Alugtec Rio Claro</div>
              <div className="leadPlusMiniCity">Rio Claro - SP</div>
              <span className="leadPlusSegment">🏷 Locação de Equipamentos</span>
            </div>
            <div className="leadPlusMiniBadges">
              <span className="leadPlusBadge green">● Entregue</span>
              <span className="leadPlusBadge lead">♛ Lead+</span>
            </div>
          </div>

          <div className="leadPlusPhone">
            ☎ (19) 3524-3850
            <span />
            <strong>🪙 - 2 créditos</strong>
          </div>

          <div className="leadPlusMiniFoot">
            <div className="leadPlusTags">
              <span className="leadPlusTag whats">☘ WhatsApp confirmado</span>
              <span className="leadPlusTag gray">👥 Social parcial</span>
            </div>
            <button className="leadPlusOpen">Abrir ›</button>
          </div>
        </aside>

        <article className="leadPlusDetails">
          <header className="leadPlusDetailHeader">
            <div className="leadPlusLogo leadPlusBigLogo"><span>A</span></div>

            <div>
              <div className="leadPlusCompanyName">
                Alugtec Rio Claro <span className="leadPlusVerified">✓</span>
              </div>

              <div className="leadPlusMeta">
                <span>📍 Rio Claro - SP</span>
                <span>🏷 Locação de Equipamentos</span>
              </div>

              <div className="leadPlusStatuses">
                <span className="leadPlusStatus green">● Entregue</span>
                <span className="leadPlusStatus blue">◌ Enriquecendo</span>
                <span className="leadPlusStatus gray">👥 Social parcial</span>
                <span className="leadPlusStatus whats">☘ WhatsApp confirmado</span>
              </div>
            </div>

            <button className="leadPlusHeaderLead">♛ Lead+</button>
            <div className="leadPlusCost">🪙 - 2 créditos <small>Custo por lead</small></div>
            <button className="leadPlusCollapse">⌃</button>
          </header>

          <div className="leadPlusDivider" />

          <nav className="leadPlusChannels">
            {[
              ["📷", "Instagram"],
              ["🔵", "Facebook"],
              ["🟢", "WhatsApp"],
              ["🌐", "Site"],
              ["✉️", "E-mail"],
              ["📍", "Mapa"],
            ].map(([icon, label]) => (
              <div className="leadPlusChannel" key={label}>
                <div className="leadPlusChannelIcon">{icon}</div>
                {label}
              </div>
            ))}
          </nav>

          <section className="leadPlusCardGrid">
            <div className="leadPlusInfoCard leadPlusCompanyCard">
              <div className="leadPlusCardTitle">▦ Dados da empresa</div>
              <div className="leadPlusDataRows">
                <div><span>CNPJ</span><strong>18.597.642/0001-42</strong><em>▢</em></div>
                <div><span>E-mail</span><strong>contato@alugtecriocl...</strong><em>▢</em></div>
                <div><span>Site</span><strong>www.alugtecriocl...</strong><em>↗</em></div>
                <div><span>Telefone</span><strong>🟢 (19) 3524-3850</strong><em>▢</em></div>
                <div><span>Endereço</span><strong>Av. 38, 645 - Vila Operária<br />Rio Claro - SP, 13504-110</strong><em>▢</em></div>
              </div>
            </div>

            <div className="leadPlusInfoCard">
              <div className="leadPlusCardTitle">🛡 Qualidade do lead</div>
              <div className="leadPlusScoreCard">
                <div className="leadPlusGauge"><div><strong>82</strong><small>de 100</small></div></div>
                <div>
                  <h3>Excelente</h3>
                  <p>Lead com alta qualidade e dados consistentes.</p>
                </div>
              </div>
            </div>

            <div className="leadPlusInfoCard">
              <div className="leadPlusCardTitle">💡 Insight de oportunidade</div>
              <p className="leadPlusInsight">
                Empresa do setor de locação de equipamentos em expansão na região de Rio Claro - SP.
                Alta demanda por soluções de gestão, manutenção e controle de frota.
              </p>
              <div className="leadPlusPotential"><strong>↗ Potencial: Alto</strong><span>Boa aderência ao seu produto/serviço.</span></div>
            </div>

            <div className="leadPlusInfoCard">
              <div className="leadPlusCardTitle">🛡 Confiança / Evidências</div>
              <ul className="leadPlusEvidence">
                <li>Empresa ativa e com CNPJ válido</li>
                <li>Presença digital encontrada</li>
                <li>WhatsApp comercial confirmado</li>
                <li>Atividade recente nas redes sociais</li>
              </ul>
              <div className="leadPlusAvatars">● ● ● ● ● ● <span>+18 evidências</span></div>
            </div>

            <div className="leadPlusInfoCard">
              <div className="leadPlusCardTitle">🎯 Canal recomendado</div>
              <div className="leadPlusChannelBox">
                <div className="leadPlusWhatsBig">☘</div>
                <div>
                  <strong>WhatsApp <span>Score 92</span></strong>
                  <p>Canal com maior taxa de resposta e engajamento para este perfil.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="leadPlusNextAction">
            <div>
              <strong>ϟ Próxima melhor ação</strong>
              <span>Iniciar conversa via WhatsApp com apresentação de solução para locadoras.</span>
            </div>
            <button>💬 Ver modelo de mensagem</button>
            <button className="primary">☘ Iniciar no WhatsApp</button>
          </section>
        </article>
      </section>
    </main>
  );
}
