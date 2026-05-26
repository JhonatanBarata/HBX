import { useMemo, useState } from "react";
import { getProviderLabel, type ProviderCapabilities } from "@/lib/provider-capabilities";
import BotPanel from "../../_components/BotPanel";
import {
  buildAgendaActionId,
  isAtendimentoRecoveryActionId,
  type AtendimentoAgendaConfig,
  type AtendimentoBotButton,
  type AtendimentoBotConfig,
} from "../../inbox-model";
import type { BotQrActionOption } from "../model";
import styles from "../page.module.css";

type BotSupremeFlowWorkspaceProps = {
  botConfig: AtendimentoBotConfig;
  agendaConfig: AtendimentoAgendaConfig;
  loadingBot: boolean;
  savingBot: boolean;
  actionOptions: BotQrActionOption[];
  providerCapabilities: ProviderCapabilities;
  recoveryEnabled: boolean;
  hasUnsavedChanges: boolean;
  onSave: (config: AtendimentoBotConfig) => void;
  onConfigChange: (config: AtendimentoBotConfig) => void;
  onOpenTemplates?: () => void;
};

type FlowView = "overview" | "architecture" | "client" | "advanced" | "guides" | "settings";

const FLOW_VIEWS: Array<{ id: FlowView; label: string; helper: string }> = [
  { id: "overview", label: "Visao geral", helper: "Resumo executivo" },
  { id: "architecture", label: "Arquitetura do Bot", helper: "Menu e organograma" },
  { id: "client", label: "Como o cliente ve", helper: "Preview WhatsApp" },
  { id: "advanced", label: "Editor avancado", helper: "Canvas tecnico" },
  { id: "guides", label: "Guias e fallback", helper: "Evolution e Meta" },
  { id: "settings", label: "Configuracoes", helper: "Publico e interno" },
];

function normalizeAction(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isAgendaAction(button: AtendimentoBotButton) {
  const actionId = normalizeAction(button.actionId);
  return actionId === "schedule_service" || actionId.startsWith("agenda:");
}

function publicMenuButtons(config: AtendimentoBotConfig, recoveryEnabled: boolean) {
  return (config.mainMenuButtons || []).filter((button) => {
    if (!recoveryEnabled && isAtendimentoRecoveryActionId(button.actionId)) return false;
    return true;
  });
}

function hasPublicRecovery(config: AtendimentoBotConfig, recoveryEnabled: boolean) {
  if (!recoveryEnabled) return false;
  if (!config.routingRules.checkRecoveryBeforeReply && !config.routingRules.autoRouteDebtorsToRecovery) {
    return false;
  }
  return (config.mainMenuButtons || []).some((button) => isAtendimentoRecoveryActionId(button.actionId));
}

function activeAgendaCount(agendaConfig: AtendimentoAgendaConfig) {
  return (agendaConfig.groups || []).filter((group) => group.isActive).length;
}

function statusBadge(value: "public" | "internal" | "blocked" | "active" | "inactive") {
  if (value === "public") return "Publico";
  if (value === "internal") return "Interno";
  if (value === "blocked") return "Nao liberado";
  if (value === "active") return "Ativo";
  return "Inativo";
}

function ChannelCard({
  active,
  title,
  body,
  note,
}: {
  active: boolean;
  title: string;
  body: string;
  note: string;
}) {
  return (
    <article className={styles.supremeChannelCard} data-active={active ? "true" : "false"}>
      <div className={styles.supremeChannelIcon}>{title.slice(0, 1)}</div>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      <span className={styles.supremeMiniBadge}>{active ? "Canal configurado" : note}</span>
    </article>
  );
}

function ModuleCard({
  title,
  description,
  state,
}: {
  title: string;
  description: string;
  state: "public" | "internal" | "blocked" | "active" | "inactive";
}) {
  return (
    <article className={styles.supremeModuleCard} data-state={state}>
      <div className={styles.supremeModuleTop}>
        <strong>{title}</strong>
        <span className={styles.supremeBadge} data-state={state}>{statusBadge(state)}</span>
      </div>
      <p>{description}</p>
    </article>
  );
}

function WhatsAppPreview({
  providerCapabilities,
  botConfig,
  recoveryEnabled,
}: {
  providerCapabilities: ProviderCapabilities;
  botConfig: AtendimentoBotConfig;
  recoveryEnabled: boolean;
}) {
  const buttons = publicMenuButtons(botConfig, recoveryEnabled).slice(0, 5);
  const isMeta = providerCapabilities.canUseOfficialButtons;
  return (
    <article className={styles.supremePhonePanel}>
      <div className={styles.supremePanelHeader}>
        <div>
          <span className={styles.sectionEyebrow}>Como o cliente ve</span>
          <h3 className={styles.cardTitle}>Preview WhatsApp</h3>
        </div>
        <span className={styles.supremeBadge} data-state={isMeta ? "active" : "public"}>
          {isMeta ? "Meta botoes oficiais" : "Evolution texto/lista"}
        </span>
      </div>

      <div className={styles.whatsappMock}>
        <div className={styles.whatsappTopbar}>
          <span className={styles.whatsappBack}>‹</span>
          <div className={styles.whatsappAvatar}>HBX</div>
          <div>
            <strong>HBX Bot</strong>
            <span>online</span>
          </div>
        </div>
        <div className={styles.whatsappBody}>
          <div className={styles.whatsappDate}>Hoje</div>
          <div className={styles.whatsappBubble}>
            {botConfig.mainMenuPrompt || "Ola! Como posso ajudar?"}
          </div>
          <div className={styles.whatsappBubble}>
            {isMeta ? "Escolha uma opcao:" : "Escolha uma opcao digitando o numero da opcao desejada:"}
            {isMeta ? (
              <div className={styles.whatsappButtonStack}>
                {buttons.map((button) => (
                  <span key={`${button.buttonId}-${button.title}`}>{button.title}</span>
                ))}
              </div>
            ) : (
              <ol className={styles.whatsappNumberList}>
                {buttons.map((button) => (
                  <li key={`${button.buttonId}-${button.title}`}>{button.title}</li>
                ))}
              </ol>
            )}
          </div>
        </div>
        <div className={styles.whatsappComposer}>
          <span>Mensagem</span>
          <strong>●</strong>
        </div>
      </div>

      <p className={styles.supremeInfoNote}>
        {isMeta
          ? "No canal Meta, botoes, listas e templates oficiais podem aparecer quando aprovados."
          : "No canal Evolution, o menu vira texto numerado e o cliente responde com o numero da opcao."}
      </p>
    </article>
  );
}

function MenuMap({
  botConfig,
  agendaConfig,
  recoveryEnabled,
}: {
  botConfig: AtendimentoBotConfig;
  agendaConfig: AtendimentoAgendaConfig;
  recoveryEnabled: boolean;
}) {
  const buttons = publicMenuButtons(botConfig, recoveryEnabled);
  const agendaPublic = activeAgendaCount(agendaConfig) > 0 || buttons.some(isAgendaAction);
  const recoveryPublic = hasPublicRecovery(botConfig, recoveryEnabled);

  return (
    <article className={styles.supremeWidePanel}>
      <div className={styles.supremePanelHeader}>
        <div>
          <span className={styles.sectionEyebrow}>Menu principal do cliente</span>
          <h3 className={styles.cardTitle}>O que aparece no WhatsApp</h3>
        </div>
        <span className={styles.supremeBadge} data-state="public">Menu publico</span>
      </div>
      <div className={styles.menuFlow}>
        <div className={styles.menuRoot}>{botConfig.mainMenuPrompt || "Como posso ajudar?"}</div>
        <div className={styles.menuBranches}>
          {buttons.map((button, index) => {
            const recovery = isAtendimentoRecoveryActionId(button.actionId);
            const agenda = isAgendaAction(button);
            return (
              <div key={`${button.buttonId}-${index}`} className={styles.menuBranch} data-muted={recovery && !recoveryEnabled ? "true" : "false"}>
                <span>{index + 1}</span>
                <strong>{button.title}</strong>
                <small>{recovery ? "Financeiro / Recovery" : agenda ? "Agenda Bot publica" : "Atendimento"}</small>
                <em>{recovery && !recoveryEnabled ? "Nao liberado" : "Publico"}</em>
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.supremeRuleGrid}>
        <div>Recovery {recoveryPublic ? "aparece porque o plano libera." : "fica oculto quando o plano nao libera."}</div>
        <div>Agenda Bot {agendaPublic ? "esta disponivel no menu publico." : "nao tem guia publica ativa."}</div>
        <div>Agenda interna nao entra como agenda publica.</div>
      </div>
    </article>
  );
}

function ArchitectureMap({
  botConfig,
  agendaConfig,
  recoveryEnabled,
}: {
  botConfig: AtendimentoBotConfig;
  agendaConfig: AtendimentoAgendaConfig;
  recoveryEnabled: boolean;
}) {
  const buttons = publicMenuButtons(botConfig, recoveryEnabled).slice(0, 4);
  const activeGroups = (agendaConfig.groups || []).filter((group) => group.isActive).slice(0, 3);

  return (
    <article className={styles.archPanel}>
      <div className={styles.archNode}>Entrada<br /><span>Mensagem do cliente</span></div>
      <div className={styles.archLine} />
      <div className={styles.archNode}>Menu Supremo<br /><span>Opcoes exibidas ao cliente</span></div>
      <div className={styles.archBranchGrid}>
        {buttons.map((button) => (
          <div key={`${button.buttonId}-${button.title}`} className={styles.archSmallNode}>
            <strong>{button.title}</strong>
            <span>{isAgendaAction(button) ? "Agenda Bot" : isAtendimentoRecoveryActionId(button.actionId) ? "Recovery" : "Atendimento"}</span>
          </div>
        ))}
      </div>
      {activeGroups.length ? (
        <div className={styles.archAgendaStack}>
          {activeGroups.map((group) => (
            <div key={group.id} className={styles.archSmallNode} data-green="true">
              <strong>{group.title}</strong>
              <span>{group.buttonLabel || "Guia publica"}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className={styles.archInternalNode}>
        Agenda interna<br /><span>Fluxo interno separado. Nao faz parte deste menu.</span>
      </div>
    </article>
  );
}

export default function BotSupremeFlowWorkspace({
  botConfig,
  agendaConfig,
  loadingBot,
  savingBot,
  actionOptions,
  providerCapabilities,
  recoveryEnabled,
  hasUnsavedChanges,
  onSave,
  onConfigChange,
  onOpenTemplates,
}: BotSupremeFlowWorkspaceProps) {
  const [activeView, setActiveView] = useState<FlowView>("overview");
  const providerLabel = getProviderLabel(providerCapabilities.provider);
  const isMeta = providerCapabilities.provider === "meta";
  const agendaCount = activeAgendaCount(agendaConfig);
  const recoveryPublic = hasPublicRecovery(botConfig, recoveryEnabled);
  const agendaOptions = useMemo(
    () => (agendaConfig.groups || []).filter((group) => group.isActive).map((group) => ({ id: group.id, title: group.title })),
    [agendaConfig.groups],
  );
  const publicButtons = useMemo(() => publicMenuButtons(botConfig, recoveryEnabled), [botConfig, recoveryEnabled]);
  const agendaGuideIds = useMemo(
    () => agendaOptions.map((agenda) => buildAgendaActionId(agenda.id)),
    [agendaOptions],
  );

  return (
    <div className={styles.supremeShell}>
      <aside className={styles.supremeSideNav}>
        <div className={styles.supremeBrandBlock}>
          <div className={styles.supremeBrandIcon}>HBX</div>
          <div>
            <strong>Bot Control</strong>
            <span>Automacao WhatsApp</span>
          </div>
        </div>
        <nav aria-label="Navegacao do Menu Supremo">
          {FLOW_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              className={styles.supremeNavButton}
              data-active={activeView === view.id ? "true" : "false"}
              onClick={() => setActiveView(view.id)}
            >
              <strong>{view.label}</strong>
              <span>{view.helper}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className={styles.supremeMain}>
        <header className={styles.supremeHero}>
          <div>
            <h2>Menu Supremo do Bot</h2>
            <p>Configure conexao, fluxo e publicacao do bot em um so lugar.</p>
          </div>
          <div className={styles.supremeHeroActions}>
            <span className={styles.supremeBadge} data-state={hasUnsavedChanges ? "inactive" : "active"}>
              {hasUnsavedChanges ? "Rascunho alterado" : "Fluxo salvo"}
            </span>
            <span className={styles.supremeBadge} data-state="active">Canal configurado: {providerLabel}</span>
          </div>
        </header>

        {activeView === "advanced" ? (
          <section className={styles.supremeAdvancedPanel}>
            <div className={styles.supremePanelHeader}>
              <div>
                <span className={styles.sectionEyebrow}>Editor avancado</span>
                <h3 className={styles.cardTitle}>Canvas tecnico do fluxo completo</h3>
              </div>
              {providerCapabilities.canUseTemplates ? (
                <button type="button" className={styles.secondaryButton} onClick={onOpenTemplates}>
                  Templates Meta
                </button>
              ) : null}
            </div>
            <BotPanel
              botConfig={botConfig}
              loadingBot={loadingBot}
              savingBot={savingBot}
              actionOptions={actionOptions}
              agendaOptions={agendaOptions}
              providerCapabilities={providerCapabilities}
              recoveryEnabled={recoveryEnabled}
              onSave={onSave}
              onConfigChange={onConfigChange}
              onOpenSettings={onOpenTemplates}
            />
          </section>
        ) : null}

        {activeView !== "advanced" ? (
          <div className={styles.supremeContentGrid}>
            <section className={styles.supremeLeftColumn}>
              {activeView === "overview" ? (
                <>
                  <div className={styles.supremeStepBlock}>
                    <div className={styles.supremeStepTitle}><span>1</span><strong>Canal configurado</strong></div>
                    <div className={styles.supremeChannelGrid}>
                      <ChannelCard
                        active={!isMeta}
                        title="Evolution"
                        body="Texto numerado e lista de texto. Sem templates oficiais."
                        note="Sem botoes nativos"
                      />
                      <ChannelCard
                        active={isMeta}
                        title="Meta Cloud API"
                        body="Templates, botoes e listas oficiais quando aprovados pela Meta."
                        note="Exige aprovacao"
                      />
                    </div>
                  </div>

                  <div className={styles.supremeStepBlock}>
                    <div className={styles.supremeStepTitle}><span>2</span><strong>Modulos liberados</strong></div>
                    <div className={styles.supremeModuleGrid}>
                      <ModuleCard title="Atendimento" description="Entrada principal do menu publico." state="public" />
                      <ModuleCard
                        title="Recovery"
                        description={recoveryEnabled ? "Pode aparecer para financeiro quando houver regra ativa." : "Fica oculto para o cliente neste plano."}
                        state={recoveryEnabled ? "public" : "blocked"}
                      />
                      <ModuleCard
                        title="Agenda Bot"
                        description={agendaCount ? `${agendaCount} guia(s) publica(s) ativa(s).` : "Disponivel, mas sem guia ativa."}
                        state="public"
                      />
                      <ModuleCard title="Agenda interna" description="Fluxo interno. Nao aparece no menu publico." state="internal" />
                    </div>
                  </div>

                  <MenuMap botConfig={botConfig} agendaConfig={agendaConfig} recoveryEnabled={recoveryEnabled} />
                </>
              ) : null}

              {activeView === "architecture" ? (
                <>
                  <div className={styles.supremeStepBlock}>
                    <div className={styles.supremeStepTitle}><span>1</span><strong>Arquitetura do Bot</strong></div>
                    <div className={styles.supremeModuleGrid}>
                      <ModuleCard title="Canal ativo" description={`${providerLabel}. ${isMeta ? "Botoes nativos disponiveis." : "Usar texto/lista."}`} state="active" />
                      <ModuleCard title="Guias por canal" description={isMeta ? "Meta pode usar listas e templates." : "Evolution recebe fallback numerado."} state="public" />
                      <ModuleCard title="Templates oficiais" description={isMeta ? "Liberados no canal Meta." : "Bloqueados no Evolution."} state={isMeta ? "active" : "blocked"} />
                      <ModuleCard title="Recovery" description={recoveryEnabled ? "Disponivel por plano." : "Nao liberado para este plano."} state={recoveryEnabled ? "active" : "blocked"} />
                    </div>
                  </div>
                  <div className={styles.architectureGrid}>
                    <MenuMap botConfig={botConfig} agendaConfig={agendaConfig} recoveryEnabled={recoveryEnabled} />
                    <ArchitectureMap botConfig={botConfig} agendaConfig={agendaConfig} recoveryEnabled={recoveryEnabled} />
                  </div>
                </>
              ) : null}

              {activeView === "client" ? (
                <section className={styles.clientCompareGrid}>
                  <article className={styles.supremeWidePanel}>
                    <div className={styles.supremePanelHeader}>
                      <div>
                        <span className={styles.sectionEyebrow}>Canal Evolution</span>
                        <h3 className={styles.cardTitle}>Sem botoes nativos</h3>
                      </div>
                      <span className={styles.supremeBadge} data-state="public">Texto numerado</span>
                    </div>
                    <p className={styles.supremeInfoNote}>O cliente responde digitando o numero. Este e o fallback seguro para Evolution.</p>
                    <ol className={styles.channelExampleList}>
                      {publicButtons.slice(0, 4).map((button) => <li key={button.buttonId}>{button.title}</li>)}
                    </ol>
                  </article>
                  <article className={styles.supremeWidePanel}>
                    <div className={styles.supremePanelHeader}>
                      <div>
                        <span className={styles.sectionEyebrow}>Canal Meta</span>
                        <h3 className={styles.cardTitle}>Botoes e templates oficiais</h3>
                      </div>
                      <span className={styles.supremeBadge} data-state={isMeta ? "active" : "inactive"}>{isMeta ? "Ativo" : "Disponivel ao migrar"}</span>
                    </div>
                    <div className={styles.metaButtonPreview}>
                      {publicButtons.slice(0, 4).map((button) => <span key={button.buttonId}>{button.title}</span>)}
                    </div>
                    <p className={styles.supremeInfoNote}>Templates oficiais continuam exclusivos do canal Meta WhatsApp Oficial.</p>
                  </article>
                </section>
              ) : null}

              {activeView === "guides" ? (
                <section className={styles.supremeWidePanel}>
                  <div className={styles.supremePanelHeader}>
                    <div>
                      <span className={styles.sectionEyebrow}>Guias e fallback</span>
                      <h3 className={styles.cardTitle}>Cada canal tem sua propria exibicao</h3>
                    </div>
                    <span className={styles.supremeBadge} data-state="active">{agendaGuideIds.length} guia(s)</span>
                  </div>
                  <div className={styles.guideGrid}>
                    <ModuleCard title="Evolution" description="Guia principal por texto/lista. Fallback sem botao e encaminhamento para atendente." state="public" />
                    <ModuleCard title="Meta Cloud API" description="Botoes rapidos, lista interativa e templates oficiais aprovados." state={isMeta ? "active" : "inactive"} />
                    <ModuleCard title="Agenda Bot" description={agendaCount ? "Guias publicas entram no menu do cliente." : "Sem agenda publica ativa no momento."} state="public" />
                    <ModuleCard title="Agenda interna" description="Responde hora a hora e nao entra como agenda publica." state="internal" />
                  </div>
                </section>
              ) : null}

              {activeView === "settings" ? (
                <section className={styles.supremeWidePanel}>
                  <div className={styles.supremePanelHeader}>
                    <div>
                      <span className={styles.sectionEyebrow}>Configuracoes</span>
                      <h3 className={styles.cardTitle}>Regras visiveis para o dono da empresa</h3>
                    </div>
                    <span className={styles.supremeBadge} data-state="active">Sem regra nova</span>
                  </div>
                  <div className={styles.supremeRuleGrid}>
                    <div>Evolution transforma botoes em lista numerada.</div>
                    <div>Meta libera botoes, listas e templates oficiais.</div>
                    <div>Recovery so aparece se o plano liberar.</div>
                    <div>Agenda Bot e publica; agenda interna fica separada.</div>
                    <div>Templates oficiais continuam bloqueados fora da Meta.</div>
                    <div>O editor completo fica em Editor avancado.</div>
                  </div>
                </section>
              ) : null}
            </section>

            <aside className={styles.supremeRightColumn}>
              <WhatsAppPreview providerCapabilities={providerCapabilities} botConfig={botConfig} recoveryEnabled={recoveryEnabled} />
              <article className={styles.supremeChecklistPanel}>
                <strong>Leitura rapida</strong>
                <div className={styles.supremeChecklistItem} data-ok="true">Canal ativo: {providerLabel}</div>
                <div className={styles.supremeChecklistItem} data-ok={isMeta ? "true" : "false"}>Templates: {isMeta ? "liberados" : "Meta-only"}</div>
                <div className={styles.supremeChecklistItem} data-ok={recoveryEnabled ? "true" : "false"}>Recovery: {recoveryEnabled ? "liberado" : "nao liberado"}</div>
                <div className={styles.supremeChecklistItem} data-ok={agendaCount ? "true" : "false"}>Agenda Bot: {agendaCount ? "com guia publica" : "sem guia ativa"}</div>
                <div className={styles.supremeChecklistItem} data-ok="true">Agenda interna: separada</div>
                <div className={styles.supremeChecklistItem} data-ok={recoveryPublic ? "true" : "false"}>Financeiro publico: {recoveryPublic ? "visivel" : "oculto/condicional"}</div>
              </article>
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  );
}
