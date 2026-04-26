"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { apiFetch } from "./_lib/api";
import { useRequireAuth } from "./_lib/useRequireAuth";
import {
  compareUserModules,
  getFirstOperationalModule,
  isModuleBlocked,
  isModuleVisible,
  normalizeUserModuleKey,
  resolveModuleBlockedHref,
  resolveModuleHref,
  type UserModule,
} from "@/lib/hbx-modules";
import styles from "./page.module.css";

type CurrentUser = {
  id: number;
  name?: string | null;
  username?: string | null;
  role?: string | null;
  isSystemMaster?: boolean;
  company?: {
    id: number;
    name?: string | null;
    paymentStatus?: string | null;
    subscriptionStatus?: string | null;
    trialEndsAt?: string | null;
  } | null;
};

type DashboardTab = "tutorial" | "modules";

type TutorialContent = {
  purpose: string;
  start: string;
  steps: string[];
  tips: string[];
  mistakes: string[];
};

const MODULE_FALLBACK_NAMES: Record<string, string> = {
  atendimento: "Atendimento",
  vendas: "Vendas",
  webscraping: "Webscraping",
  financeiro: "Financeiro",
  website: "Website",
  gerencial: "Gerencial",
  master: "Master",
  exclusoes: "Exclusoes",
  follow_up_internacional: "Follow-up Internacional",
  whatsapp: "WhatsApp",
};

const TUTORIALS: Record<string, TutorialContent> = {
  vendas: {
    purpose:
      "Organizar contatos e oportunidades em um funil simples. Voce acompanha leads novos, contatos de hoje, atrasados, programados e encerrados sem perder o historico.",
    start:
      "Abra Vendas e escolha uma fila. Comece pelos contatos de hoje ou pelos novos leads que ainda nao tiveram retorno.",
    steps: [
      "Abra um lead e confira nome, telefone, origem e observacoes.",
      "Registre a proxima acao: ligar, enviar mensagem, retornar depois ou encerrar.",
      "Se precisar, edite os dados do lead antes de continuar o atendimento.",
      "Quando fizer sentido, envie ou importe o contato para o Inbox para seguir a conversa.",
      "Leads vindos do Webscraping podem virar agenda comercial e receber acompanhamento no funil.",
    ],
    tips: [
      "Use a fila de atrasados no inicio do dia.",
      "Sempre salve um proximo retorno quando o cliente pedir tempo.",
      "Mantenha observacoes curtas e objetivas para qualquer operador entender.",
    ],
    mistakes: [
      "Encerrar lead sem registrar o motivo.",
      "Deixar contato sem proxima acao.",
      "Criar lead duplicado quando o telefone ja existe.",
    ],
  },
  webscraping: {
    purpose:
      "Encontrar contatos por cidade e segmento para alimentar sua prospeccao comercial.",
    start:
      "Informe a cidade, escolha o segmento e defina a quantidade desejada. Use filtros avancados quando quiser refinar a busca.",
    steps: [
      "Digite a cidade onde quer buscar empresas.",
      "Escolha o segmento, por exemplo clinicas, oficinas, mercados ou prestadores.",
      "Defina a quantidade de resultados e revise os filtros avancados.",
      "Consulte o historico/cache para reaproveitar buscas recentes.",
      "Exporte Excel ou envie os resultados para Vendas para trabalhar os leads.",
    ],
    tips: [
      "Comece com quantidades menores para validar o segmento.",
      "Use o historico para evitar repetir buscas iguais.",
      "Envie apenas contatos relevantes para Vendas.",
    ],
    mistakes: [
      "Buscar segmentos muito amplos sem filtro.",
      "Exportar antes de revisar os dados.",
      "Nao separar cidade e segmento com clareza.",
    ],
  },
  atendimento: {
    purpose:
      "Centralizar conversas, respostas e historico dos clientes no Inbox. E o lugar para acompanhar quem chamou e continuar o atendimento.",
    start:
      "Abra o Inbox, escolha uma conversa e veja o historico antes de responder.",
    steps: [
      "Entre na fila de conversas e identifique quem precisa de resposta.",
      "Abra o cliente para ver mensagens, dados e contexto.",
      "Responda com clareza e registre o que foi combinado.",
      "Use o WhatsApp quando estiver conectado para manter a operacao online.",
      "Se houver bot configurado, acompanhe quando ele responde e quando passa para humano.",
    ],
    tips: [
      "Leia as ultimas mensagens antes de responder.",
      "Use filas para separar novo, aberto, agenda e arquivados.",
      "Mantenha o historico limpo para outro operador continuar.",
    ],
    mistakes: [
      "Responder sem verificar o contexto.",
      "Deixar conversa importante sem status.",
      "Misturar atendimento humano com automacao sem revisar o historico.",
    ],
  },
  financeiro: {
    purpose:
      "Acompanhar pagamentos, cobrancas, pendencias e regularizacoes da operacao.",
    start:
      "Abra Financeiro e veja primeiro os status principais: pendente, pago, atrasado e em regularizacao.",
    steps: [
      "Confira os cards de status para entender a situacao geral.",
      "Abra uma pendencia para ver cliente, valor, vencimento e historico.",
      "Registre pagamentos ou acompanhe a regularizacao quando disponivel.",
      "Use filtros para encontrar clientes ou periodos especificos.",
    ],
    tips: [
      "Olhe pendencias antes de iniciar cobrancas.",
      "Confirme o status antes de falar com o cliente.",
      "Use informacoes financeiras para orientar o atendimento.",
    ],
    mistakes: [
      "Cobrar cliente ja regularizado.",
      "Ignorar vencimentos antigos.",
      "Nao conferir valor e status antes de agir.",
    ],
  },
  website: {
    purpose:
      "Acompanhar e configurar a entrada publica do cliente, como site, area publica ou ponto de apresentacao conforme sua rota ativa.",
    start:
      "Abra Website para ver o que esta publicado e quais ajustes estao disponiveis.",
    steps: [
      "Confira a pagina ou area publica vinculada a empresa.",
      "Revise informacoes principais, identidade e chamadas de contato.",
      "Acompanhe se a entrada publica esta coerente com a operacao atual.",
    ],
    tips: [
      "Mantenha telefone e chamada principal atualizados.",
      "Revise a pagina depois de grandes mudancas comerciais.",
      "Use a entrada publica como apoio para gerar contatos.",
    ],
    mistakes: [
      "Deixar dados antigos publicados.",
      "Nao conferir a experiencia em celular.",
      "Tratar Website como separado da operacao comercial.",
    ],
  },
  gerencial: {
    purpose:
      "Dar uma visao administrativa para acompanhar indicadores, movimentos e desempenho da operacao.",
    start:
      "Abra Gerencial quando quiser entender o panorama antes de decidir prioridades.",
    steps: [
      "Veja os indicadores principais do dia ou periodo.",
      "Compare volume, status e resultados por modulo.",
      "Use os sinais para decidir onde o time deve atuar primeiro.",
    ],
    tips: [
      "Use Gerencial como ponto de leitura, nao como fila de execucao.",
      "Compare resultados antes e depois de mudancas no processo.",
      "Olhe indicadores junto com Vendas, Atendimento e Financeiro.",
    ],
    mistakes: [
      "Tomar decisao sem olhar periodo correto.",
      "Confundir indicador com tarefa.",
      "Ignorar gargalos que aparecem repetidamente.",
    ],
  },
  master: {
    purpose:
      "Gerenciar empresas, modulos, integracoes, permissoes e operacao geral do sistema.",
    start:
      "Use Master para liberar acessos, revisar empresas e acompanhar configuracoes sensiveis.",
    steps: [
      "Escolha a empresa ou contexto que precisa ajustar.",
      "Revise modulos ativos, permissoes e integracoes.",
      "Acompanhe alertas operacionais antes de liberar mudancas.",
      "Salve apenas configuracoes revisadas.",
    ],
    tips: [
      "Use Master com cuidado: ele afeta outras empresas.",
      "Confira empresa selecionada antes de alterar modulo.",
      "Documente mudancas sensiveis.",
    ],
    mistakes: [
      "Alterar modulo da empresa errada.",
      "Liberar integracao sem validar credenciais.",
      "Mudar permissao sem saber quem usa o acesso.",
    ],
  },
  exclusoes: {
    purpose:
      "Tratar exclusoes e auditoria em uma area sensivel, reservada para operacao master.",
    start:
      "Abra Exclusoes apenas quando precisar revisar remocoes, rastros ou acao administrativa sensivel.",
    steps: [
      "Identifique o registro ou contexto que precisa analisar.",
      "Confira historico, impacto e responsavel antes de agir.",
      "Execute a acao somente quando tiver certeza do efeito.",
    ],
    tips: [
      "Revise duas vezes antes de confirmar.",
      "Prefira bloquear ou arquivar quando exclusao definitiva nao for necessaria.",
      "Mantenha rastreabilidade.",
    ],
    mistakes: [
      "Excluir sem verificar impacto.",
      "Atuar fora do contexto master correto.",
      "Nao registrar motivo operacional.",
    ],
  },
  follow_up_internacional: {
    purpose:
      "Acompanhar importacoes e follow-up global de contatos ou processos internacionais de forma organizada.",
    start:
      "Abra Follow-up Internacional para revisar registros importados, pendencias e proximas etapas.",
    steps: [
      "Confira a lista de acompanhamentos ativos.",
      "Abra um registro para entender o status e a proxima acao.",
      "Atualize observacoes e acompanhe retornos importantes.",
      "Use filtros para localizar pais, origem, status ou periodo.",
    ],
    tips: [
      "Mantenha cada acompanhamento com proxima acao clara.",
      "Use filtros antes de criar novos registros.",
      "Revise pendencias globais com frequencia.",
    ],
    mistakes: [
      "Importar dados sem revisar colunas.",
      "Deixar follow-up sem responsavel ou data.",
      "Misturar registros de origens diferentes sem filtro.",
    ],
  },
  whatsapp: {
    purpose:
      "Conectar o WhatsApp da empresa e manter a operacao online para atendimento, envio e diagnostico.",
    start:
      "Abra WhatsApp para conferir status, conexao, QR Code ou canal oficial configurado.",
    steps: [
      "Veja se o canal esta conectado e pronto para operar.",
      "Use o QR Code ou a configuracao oficial conforme o canal da empresa.",
      "Confira diagnosticos quando o envio ou recebimento nao parecer normal.",
      "Mantenha a conexao ativa antes de depender do Inbox ou do bot.",
    ],
    tips: [
      "Cheque o status antes de iniciar campanhas ou atendimento intenso.",
      "Reconecte quando o painel indicar atencao.",
      "Use diagnostico para entender o que precisa ser ajustado.",
    ],
    mistakes: [
      "Achar que o bot funciona sem canal online.",
      "Ignorar alerta de conexao.",
      "Trocar canal sem revisar impacto nos templates e botoes.",
    ],
  },
};

function resolveDisplayName(user: CurrentUser | null) {
  return String(user?.name || user?.username || user?.company?.name || "bem-vindo").trim();
}

function getModuleDisplayName(moduleItem: UserModule) {
  const normalized = normalizeUserModuleKey(moduleItem.key);
  return String(moduleItem.name || MODULE_FALLBACK_NAMES[normalized] || moduleItem.key).trim();
}

function getTutorialForModule(moduleItem: UserModule): TutorialContent {
  const normalized = normalizeUserModuleKey(moduleItem.key);
  return (
    TUTORIALS[normalized] || {
      purpose: String(moduleItem.description || "Este modulo ajuda sua operacao em uma etapa especifica do HBX."),
      start: "Abra o modulo, revise as informacoes principais e siga as acoes sugeridas na tela.",
      steps: [
        "Confira o que aparece na primeira tela.",
        "Abra um registro ou card para ver detalhes.",
        "Salve mudancas importantes antes de sair.",
      ],
      tips: ["Use este modulo junto com os demais para manter a operacao organizada."],
      mistakes: ["Avancar sem ler os avisos da tela."],
    }
  );
}

function isTutorialEligible(moduleItem: UserModule, isSystemMaster: boolean) {
  const normalized = normalizeUserModuleKey(moduleItem.key);
  if (!isModuleVisible(moduleItem) || !moduleItem.accessible || isModuleBlocked(moduleItem)) return false;
  if ((normalized === "master" || normalized === "exclusoes") && !isSystemMaster) return false;
  return true;
}

function formatBlockedReason(moduleItem: UserModule) {
  const reason = String(moduleItem.blockedReason || "").trim();
  if (reason) return reason;
  const engine = String(moduleItem.criticalEngine || "").trim();
  if (engine.toLowerCase() === "whatsapp") return "Conecte ou revise o WhatsApp para liberar este modulo.";
  if (engine.toLowerCase() === "payment") return "Revise o financeiro para liberar este modulo.";
  return "Existe uma configuracao pendente antes de usar este modulo.";
}

export default function DashboardClientPage() {
  const hasToken = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [modules, setModules] = useState<UserModule[]>([]);
  const [activeTab, setActiveTab] = useState<DashboardTab>("tutorial");
  const [activeModuleKey, setActiveModuleKey] = useState<string | null>(null);

  useEffect(() => {
    if (hasToken !== true) return;
    let cancelled = false;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const [me, userModules] = await Promise.all([
          apiFetch<CurrentUser>("/profile/current-user"),
          apiFetch<UserModule[]>("/modules/me"),
        ]);

        if (cancelled) return;
        setUser(me);
        setModules(Array.isArray(userModules) ? userModules : []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Falha ao carregar seu painel.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  const isSystemMaster = Boolean(user?.isSystemMaster);

  const tutorialModules = useMemo(
    () => modules.filter((moduleItem) => isTutorialEligible(moduleItem, isSystemMaster)).sort(compareUserModules),
    [isSystemMaster, modules],
  );

  const blockedModules = useMemo(
    () => modules.filter((moduleItem) => isModuleVisible(moduleItem) && isModuleBlocked(moduleItem)).sort(compareUserModules),
    [modules],
  );

  const recommendedModule = useMemo(
    () => getFirstOperationalModule(tutorialModules) || tutorialModules[0] || null,
    [tutorialModules],
  );

  useEffect(() => {
    if (!tutorialModules.length) {
      setActiveModuleKey(null);
      return;
    }
    const currentStillExists = tutorialModules.some(
      (moduleItem) => normalizeUserModuleKey(moduleItem.key) === activeModuleKey,
    );
    if (!currentStillExists) {
      setActiveModuleKey(normalizeUserModuleKey(recommendedModule?.key || tutorialModules[0].key));
    }
  }, [activeModuleKey, recommendedModule?.key, tutorialModules]);

  const selectedModule = useMemo(
    () =>
      tutorialModules.find((moduleItem) => normalizeUserModuleKey(moduleItem.key) === activeModuleKey) ||
      recommendedModule ||
      null,
    [activeModuleKey, recommendedModule, tutorialModules],
  );

  const selectedTutorial = selectedModule ? getTutorialForModule(selectedModule) : null;

  const openFirstTutorial = useCallback(() => {
    setActiveTab("tutorial");
    if (recommendedModule) {
      setActiveModuleKey(normalizeUserModuleKey(recommendedModule.key));
    }
  }, [recommendedModule]);

  if (hasToken === null) {
    return (
      <main className="app-shell">
        <div className="app-container">
          <div className={styles.loadingCard}>Carregando painel HBX...</div>
        </div>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Painel HBX" description="Tutorial dos seus modulos ativos.">
      <div className={styles.page}>
        {loading ? (
          <section className={styles.loadingHero} aria-live="polite">
            <div className={styles.loadingOrb} />
            <div>
              <p className={styles.eyebrow}>Preparando tutorial</p>
              <h1>Carregando seus modulos ativos...</h1>
              <p>Estamos montando um guia simples com base nos acessos liberados para sua empresa.</p>
            </div>
          </section>
        ) : (
          <>
            {error ? (
              <div className={styles.alertCard} role="alert">
                Nao foi possivel carregar tudo agora. {error}
              </div>
            ) : null}

            <section className={styles.hero}>
              <div className={styles.heroContent}>
                <span className={styles.heroBadge}>Central de tutorial</span>
                <h1>Bem-vindo ao painel HBX</h1>
                <p>
                  Ola, {resolveDisplayName(user)}. Aprenda a usar seus modulos ativos em poucos minutos,
                  com passos simples e atalhos para abrir cada area real do sistema.
                </p>
                <div className={styles.heroActions}>
                  <button type="button" className={styles.primaryButton} onClick={openFirstTutorial}>
                    Comecar tutorial
                  </button>
                  {recommendedModule ? (
                    <Link
                      href={resolveModuleHref(recommendedModule.key, recommendedModule.serviceUrl)}
                      className={styles.secondaryButton}
                    >
                      Abrir {getModuleDisplayName(recommendedModule)}
                    </Link>
                  ) : isSystemMaster ? (
                    <Link href="/dashboard/master" className={styles.secondaryButton}>
                      Abrir Master
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className={styles.heroMetrics} aria-label="Resumo do painel">
                <article>
                  <span>Modulos ativos</span>
                  <strong>{tutorialModules.length}</strong>
                  <small>Disponiveis para tutorial</small>
                </article>
                <article>
                  <span>Comece por</span>
                  <strong>{recommendedModule ? getModuleDisplayName(recommendedModule) : "Aguardando liberacao"}</strong>
                  <small>Atalho recomendado</small>
                </article>
                <article>
                  <span>Precisam configurar</span>
                  <strong>{blockedModules.length}</strong>
                  <small>{blockedModules.length ? "Revise antes de usar" : "Tudo certo por aqui"}</small>
                </article>
              </div>
            </section>

            <div className={styles.topTabs} role="tablist" aria-label="Guias do dashboard">
              <button
                type="button"
                data-active={activeTab === "tutorial" ? "true" : "false"}
                onClick={() => setActiveTab("tutorial")}
                role="tab"
                aria-selected={activeTab === "tutorial"}
              >
                Tutorial
              </button>
              <button
                type="button"
                data-active={activeTab === "modules" ? "true" : "false"}
                onClick={() => setActiveTab("modules")}
                role="tab"
                aria-selected={activeTab === "modules"}
              >
                Meus modulos
              </button>
            </div>

            {activeTab === "tutorial" ? (
              <section className={styles.tutorialShell}>
                {tutorialModules.length ? (
                  <>
                    <aside className={styles.moduleRail} aria-label="Modulos ativos">
                      {tutorialModules.map((moduleItem) => {
                        const normalized = normalizeUserModuleKey(moduleItem.key);
                        return (
                          <button
                            key={`${moduleItem.key}-${moduleItem.name}`}
                            type="button"
                            data-active={normalizeUserModuleKey(selectedModule?.key || "") === normalized ? "true" : "false"}
                            onClick={() => setActiveModuleKey(normalized)}
                          >
                            <strong>{getModuleDisplayName(moduleItem)}</strong>
                            <span>{moduleItem.description || "Guia rapido do modulo"}</span>
                          </button>
                        );
                      })}
                    </aside>

                    {selectedModule && selectedTutorial ? (
                      <article className={styles.tutorialCard}>
                        <div className={styles.tutorialHeader}>
                          <div>
                            <span className={styles.eyebrow}>Tutorial ativo</span>
                            <h2>{getModuleDisplayName(selectedModule)}</h2>
                            <p>{selectedModule.description || "Aprenda o fluxo principal deste modulo."}</p>
                          </div>
                          <Link
                            href={resolveModuleHref(selectedModule.key, selectedModule.serviceUrl)}
                            className={styles.primaryButton}
                          >
                            Abrir modulo
                          </Link>
                        </div>

                        <div className={styles.lessonGrid}>
                          <section className={styles.lessonBlock}>
                            <span>01</span>
                            <h3>Para que serve</h3>
                            <p>{selectedTutorial.purpose}</p>
                          </section>
                          <section className={styles.lessonBlock}>
                            <span>02</span>
                            <h3>Como comecar</h3>
                            <p>{selectedTutorial.start}</p>
                          </section>
                        </div>

                        <section className={styles.stepPanel}>
                          <div className={styles.sectionTitle}>
                            <span>03</span>
                            <h3>Passo a passo</h3>
                          </div>
                          <ol className={styles.stepList}>
                            {selectedTutorial.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        </section>

                        <div className={styles.assistGrid}>
                          <section className={styles.tipPanel}>
                            <h3>Dicas rapidas</h3>
                            <ul>
                              {selectedTutorial.tips.map((tip) => (
                                <li key={tip}>{tip}</li>
                              ))}
                            </ul>
                          </section>
                          <section className={styles.mistakePanel}>
                            <h3>Erros comuns</h3>
                            <ul>
                              {selectedTutorial.mistakes.map((mistake) => (
                                <li key={mistake}>{mistake}</li>
                              ))}
                            </ul>
                          </section>
                        </div>
                      </article>
                    ) : null}
                  </>
                ) : (
                  <section className={styles.emptyState}>
                    <span>Nenhum modulo ativo ainda</span>
                    <h2>Seu tutorial aparece assim que os modulos forem liberados.</h2>
                    <p>
                      Fale com o responsavel pela conta para ativar os modulos da empresa. Se voce for master,
                      abra o Master para liberar acessos.
                    </p>
                    {isSystemMaster ? (
                      <Link href="/dashboard/master" className={styles.primaryButton}>
                        Abrir Master
                      </Link>
                    ) : null}
                  </section>
                )}
              </section>
            ) : (
              <section className={styles.modulesGrid}>
                {tutorialModules.map((moduleItem) => (
                  <article key={`${moduleItem.key}-${moduleItem.name}`} className={styles.moduleCard}>
                    <div>
                      <span>{normalizeUserModuleKey(moduleItem.key)}</span>
                      <h3>{getModuleDisplayName(moduleItem)}</h3>
                      <p>{moduleItem.description || getTutorialForModule(moduleItem).purpose}</p>
                    </div>
                    <Link href={resolveModuleHref(moduleItem.key, moduleItem.serviceUrl)} className={styles.cardLink}>
                      Abrir modulo
                    </Link>
                  </article>
                ))}
              </section>
            )}

            {blockedModules.length ? (
              <section className={styles.blockedSection}>
                <div className={styles.sectionTitle}>
                  <span>!</span>
                  <h2>Modulos que precisam atencao</h2>
                </div>
                <div className={styles.blockedGrid}>
                  {blockedModules.map((moduleItem) => (
                    <article key={`${moduleItem.key}-${moduleItem.name}`} className={styles.blockedCard}>
                      <div>
                        <strong>{getModuleDisplayName(moduleItem)}</strong>
                        <p>{formatBlockedReason(moduleItem)}</p>
                      </div>
                      <Link href={resolveModuleBlockedHref(moduleItem)} className={styles.secondaryButton}>
                        Resolver
                      </Link>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </DashboardScaffold>
  );
}
