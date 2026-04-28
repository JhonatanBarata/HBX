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
    onboardingStatus?: string | null;
    paymentStatus?: string | null;
    subscriptionStatus?: string | null;
    trialEndsAt?: string | null;
    trialRemainingDays?: number | null;
    subscriptionCurrentPeriodEnd?: string | null;
    selectedPlanKey?: string | null;
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

type StepVisual = {
  from: string;
  to: string;
  title: string;
  lines: string[];
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
      "Compare volume, status e resultados por área.",
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
      "Gerenciar empresas, acessos, integrações, permissões e operação geral do sistema.",
    start:
      "Use Master para liberar acessos, revisar empresas e acompanhar configuracoes sensiveis.",
    steps: [
      "Escolha a empresa ou contexto que precisa ajustar.",
      "Revise acessos ativos, permissões e integrações.",
      "Acompanhe alertas operacionais antes de liberar mudancas.",
      "Salve apenas configuracoes revisadas.",
    ],
    tips: [
      "Use Master com cuidado: ele afeta outras empresas.",
      "Confira empresa selecionada antes de alterar acesso.",
      "Documente mudancas sensiveis.",
    ],
    mistakes: [
      "Alterar acesso da empresa errada.",
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

const STEP_VISUALS: Record<string, StepVisual[]> = {
  vendas: [
    {
      from: "Fila de leads",
      to: "Lead aberto",
      title: "Vendas",
      lines: ["Novos leads", "Contato de hoje", "Atrasados"],
    },
    {
      from: "Sem retorno",
      to: "Proxima acao salva",
      title: "Lead",
      lines: ["Ligar hoje", "Enviar mensagem", "Retornar depois"],
    },
    {
      from: "Dados incompletos",
      to: "Cadastro revisado",
      title: "Dados do lead",
      lines: ["Nome", "Telefone", "Origem"],
    },
    {
      from: "Lead qualificado",
      to: "Conversa no Inbox",
      title: "Encaminhar",
      lines: ["Enviar para Inbox", "Historico junto", "Atendente continua"],
    },
    {
      from: "Webscraping",
      to: "Agenda comercial",
      title: "Origem",
      lines: ["Contato encontrado", "Virou lead", "Entrou no funil"],
    },
  ],
  webscraping: [
    {
      from: "Cidade",
      to: "Busca pronta",
      title: "Nova busca",
      lines: ["Sao Paulo", "Campinas", "Belo Horizonte"],
    },
    {
      from: "Segmento",
      to: "Publico filtrado",
      title: "Segmento",
      lines: ["Clinicas", "Oficinas", "Mercados"],
    },
    {
      from: "Quantidade",
      to: "Resultados limpos",
      title: "Filtros",
      lines: ["50 contatos", "Com telefone", "Com cidade"],
    },
    {
      from: "Busca repetida",
      to: "Historico/cache",
      title: "Historico",
      lines: ["Busca salva", "Reusar lista", "Evitar duplicar"],
    },
    {
      from: "Resultados",
      to: "Excel ou Vendas",
      title: "Saida",
      lines: ["Exportar Excel", "Enviar para Vendas", "Trabalhar leads"],
    },
  ],
  atendimento: [
    {
      from: "Fila do Inbox",
      to: "Conversa aberta",
      title: "Inbox",
      lines: ["Novas", "Em atendimento", "Arquivadas"],
    },
    {
      from: "Mensagem solta",
      to: "Cliente com contexto",
      title: "Cliente",
      lines: ["Historico", "Dados", "Ultimas mensagens"],
    },
    {
      from: "Cliente aguardando",
      to: "Resposta registrada",
      title: "Resposta",
      lines: ["Mensagem enviada", "Combinado salvo", "Status atualizado"],
    },
    {
      from: "Canal offline",
      to: "WhatsApp online",
      title: "Canal",
      lines: ["Conexao ativa", "Envio liberado", "Operacao online"],
    },
    {
      from: "Bot respondeu",
      to: "Humano assume",
      title: "Handoff",
      lines: ["Bot atende", "Cliente pede ajuda", "Atendente continua"],
    },
  ],
  financeiro: [
    {
      from: "Resumo geral",
      to: "Status do cliente",
      title: "Financeiro",
      lines: ["Pendente", "Pago", "Atrasado"],
    },
    {
      from: "Pendencia",
      to: "Detalhe aberto",
      title: "Cobranca",
      lines: ["Cliente", "Valor", "Vencimento"],
    },
    {
      from: "Pagamento recebido",
      to: "Regularizacao",
      title: "Atualizar",
      lines: ["Registrar", "Confirmar", "Status em dia"],
    },
    {
      from: "Lista grande",
      to: "Filtro aplicado",
      title: "Filtros",
      lines: ["Periodo", "Cliente", "Status"],
    },
  ],
  website: [
    {
      from: "Entrada publica",
      to: "Pagina revisada",
      title: "Website",
      lines: ["Pagina", "Area publica", "Contato"],
    },
    {
      from: "Dados antigos",
      to: "Informacoes atuais",
      title: "Conteudo",
      lines: ["Telefone", "Identidade", "Chamada"],
    },
    {
      from: "Operacao mudou",
      to: "Publico coerente",
      title: "Revisao",
      lines: ["Oferta", "Contato", "Proximo passo"],
    },
  ],
  gerencial: [
    {
      from: "Dados soltos",
      to: "Indicadores",
      title: "Gerencial",
      lines: ["Volume", "Status", "Resultado"],
    },
    {
      from: "Área por área",
      to: "Comparativo",
      title: "Visao",
      lines: ["Vendas", "Atendimento", "Financeiro"],
    },
    {
      from: "Duvida de prioridade",
      to: "Acao do time",
      title: "Decisao",
      lines: ["Gargalo", "Prioridade", "Proxima acao"],
    },
  ],
  master: [
    {
      from: "Empresas",
      to: "Empresa selecionada",
      title: "Master",
      lines: ["Empresa", "Plano", "Responsavel"],
    },
    {
      from: "Acesso atual",
      to: "Acesso liberado",
      title: "Acessos",
      lines: ["Permissoes", "Integracoes", "Acessos"],
    },
    {
      from: "Alerta",
      to: "Configuracao revisada",
      title: "Operacao",
      lines: ["Pagamento", "WhatsApp", "Usuarios"],
    },
    {
      from: "Mudanca revisada",
      to: "Salvo",
      title: "Confirmar",
      lines: ["Conferir", "Salvar", "Acompanhar"],
    },
  ],
  exclusoes: [
    {
      from: "Registro sensivel",
      to: "Analise aberta",
      title: "Auditoria",
      lines: ["Registro", "Origem", "Responsavel"],
    },
    {
      from: "Acao pendente",
      to: "Impacto revisado",
      title: "Conferencia",
      lines: ["Historico", "Impacto", "Motivo"],
    },
    {
      from: "Duvida",
      to: "Acao confirmada",
      title: "Exclusao",
      lines: ["Revisar", "Confirmar", "Registrar"],
    },
  ],
  follow_up_internacional: [
    {
      from: "Importacao",
      to: "Lista de follow-up",
      title: "Global",
      lines: ["Origem", "Pais", "Contato"],
    },
    {
      from: "Registro",
      to: "Proxima etapa",
      title: "Acompanhamento",
      lines: ["Status", "Responsavel", "Data"],
    },
    {
      from: "Observacao nova",
      to: "Historico atualizado",
      title: "Registro",
      lines: ["Nota", "Retorno", "Pendencia"],
    },
    {
      from: "Lista cheia",
      to: "Filtro certo",
      title: "Filtros",
      lines: ["Pais", "Origem", "Periodo"],
    },
  ],
  whatsapp: [
    {
      from: "Canal",
      to: "Status online",
      title: "WhatsApp",
      lines: ["Conectado", "Atencao", "Offline"],
    },
    {
      from: "Sem conexao",
      to: "QR ou canal oficial",
      title: "Conectar",
      lines: ["QR Code", "Meta Oficial", "Instancia"],
    },
    {
      from: "Falha de envio",
      to: "Diagnostico",
      title: "Saude",
      lines: ["Envio", "Recebimento", "Alertas"],
    },
    {
      from: "Operacao parada",
      to: "Inbox e bot ativos",
      title: "Impacto",
      lines: ["Inbox", "Bot", "Mensagens"],
    },
  ],
};

function resolveDisplayName(user: CurrentUser | null) {
  return String(user?.name || user?.username || user?.company?.name || "bem-vindo").trim();
}

function commercialBanner(user: CurrentUser | null) {
  const company = user?.company;
  if (!company) return null;
  const onboardingStatus = String(company.onboardingStatus || "").trim().toLowerCase();
  const paymentStatus = String(company.paymentStatus || "").trim().toUpperCase();
  const subscriptionStatus = String(company.subscriptionStatus || "").trim().toLowerCase();
  if (subscriptionStatus === "trialing" || paymentStatus === "TRIAL" || onboardingStatus === "active_trial") {
    const days = typeof company.trialRemainingDays === "number" ? company.trialRemainingDays : null;
    return {
      tone: "trial",
      title: `Trial ativo${days !== null ? ` — ${days} dias restantes` : ""}`,
      text: "Sem cobrança automática.",
      href: "/dashboard/financeiro",
      cta: "Ver financeiro",
    };
  }
  if (subscriptionStatus === "pending_checkout" || paymentStatus === "PENDING" || onboardingStatus === "pending_checkout") {
    return {
      tone: "pending",
      title: "Pagamento pendente",
      text: "Finalize PIX ou cartão para liberar o plano.",
      href: "/dashboard/financeiro",
      cta: "Finalizar checkout",
    };
  }
  if (subscriptionStatus === "active" || paymentStatus === "PAID") {
    return {
      tone: "paid",
      title: "Plano ativo",
      text: "Seu ciclo pago está liberado.",
      href: "/dashboard/financeiro",
      cta: "Gerenciar plano",
    };
  }
  return null;
}

function getModuleDisplayName(moduleItem: UserModule) {
  const normalized = normalizeUserModuleKey(moduleItem.key);
  return String(moduleItem.name || MODULE_FALLBACK_NAMES[normalized] || moduleItem.key).trim();
}

function getTutorialForModule(moduleItem: UserModule): TutorialContent {
  const normalized = normalizeUserModuleKey(moduleItem.key);
  return (
    TUTORIALS[normalized] || {
      purpose: String(moduleItem.description || "Este acesso ajuda sua operação em uma etapa específica do HBX."),
      start: "Abra a área, revise as informações principais e siga as ações sugeridas na tela.",
      steps: [
        "Confira o que aparece na primeira tela.",
        "Abra um registro ou card para ver detalhes.",
        "Salve mudancas importantes antes de sair.",
      ],
      tips: ["Use esta área junto com as demais para manter a operação organizada."],
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
  if (engine.toLowerCase() === "whatsapp") return "Conecte ou revise o WhatsApp para liberar este acesso.";
  if (engine.toLowerCase() === "payment") return "Revise o financeiro para liberar este acesso.";
  return "Existe uma configuração pendente antes de usar este acesso.";
}

function getStepVisual(moduleKey: string, index: number, step: string): StepVisual {
  const visuals = STEP_VISUALS[moduleKey] || [];
  return (
    visuals[index] || {
      from: `Passo ${index + 1}`,
      to: "Concluido",
      title: "Guia",
      lines: [step, "Salvar", "Continuar"],
    }
  );
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
  const selectedModuleKey = normalizeUserModuleKey(selectedModule?.key || "");
  const atendimentoLiberado = tutorialModules.some(
    (moduleItem) => normalizeUserModuleKey(moduleItem.key) === "atendimento",
  );
  const banner = commercialBanner(user);

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
    <DashboardScaffold title="Painel HBX" description="Guia dos seus acessos ativos.">
      <div className={styles.page}>
        {loading ? (
          <section className={styles.loadingHero} aria-live="polite">
            <div className={styles.loadingOrb} />
            <div>
              <p className={styles.eyebrow}>Preparando guia</p>
              <h1>Carregando seus acessos ativos...</h1>
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

            {banner ? (
              <section className={styles.commercialBanner} data-tone={banner.tone}>
                <div>
                  <strong>{banner.title}</strong>
                  <p>{banner.text}</p>
                </div>
                <Link href={banner.href}>{banner.cta}</Link>
              </section>
            ) : null}

            {!isSystemMaster ? (
              <section className={styles.firstWinPanel}>
                <div className={styles.firstWinCopy}>
                  <span className={styles.heroBadge}>Primeiro ganho</span>
                  <h2>Vamos gerar sua primeira oportunidade de venda?</h2>
                  <p>
                    Em poucos minutos você pode encontrar contatos, salvar leads e começar a acompanhar retornos.
                  </p>
                </div>
                <div className={styles.firstWinActions}>
                  <Link href="/dashboard/webscraping" className={styles.firstWinAction} data-primary="true">
                    <strong>Encontrar novos clientes</strong>
                    <span>Busque contatos por cidade e segmento.</span>
                  </Link>
                  <Link href="/dashboard/vendas" className={styles.firstWinAction}>
                    <strong>Organizar minhas vendas</strong>
                    <span>Salve leads e marque o próximo retorno.</span>
                  </Link>
                  <Link
                    href={atendimentoLiberado ? "/dashboard/inbox" : "/dashboard/planos"}
                    className={styles.firstWinAction}
                  >
                    <strong>Configurar atendimento</strong>
                    <span>
                      {atendimentoLiberado
                        ? "Centralize conversas para não perder vendas."
                        : "Atendimento Chat está disponível no Padrão e Melhor."}
                    </span>
                  </Link>
                  <Link href="/dashboard/planos" className={styles.firstWinAction}>
                    <strong>Conhecer os planos</strong>
                    <span>Compare acessos, buscas Google por dia e pagamento.</span>
                  </Link>
                </div>
              </section>
            ) : null}

            <section className={styles.hero}>
              <div className={styles.heroContent}>
                <span className={styles.heroBadge}>Guia do sistema</span>
                <h1>Painel HBX</h1>
                <p>
                  Olá, {resolveDisplayName(user)}. Veja seus acessos liberados e siga tutoriais visuais
                  com pequenos prints do caminho dentro do sistema.
                </p>
                <div className={styles.heroActions}>
                  <button type="button" className={styles.primaryButton} onClick={openFirstTutorial}>
                    Começar tutorial
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
                  <span>Acessos ativos</span>
                  <strong>{tutorialModules.length}</strong>
                  <small>para começar</small>
                </article>
                <article>
                  <span>Comece por</span>
                  <strong>{recommendedModule ? getModuleDisplayName(recommendedModule) : "Aguardando liberacao"}</strong>
                  <small>recomendado</small>
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
                Meus acessos
              </button>
            </div>

            {activeTab === "tutorial" ? (
              <section className={styles.tutorialShell}>
                {tutorialModules.length ? (
                  <>
                    <aside className={styles.moduleRail} aria-label="Acessos ativos">
                      {tutorialModules.map((moduleItem) => {
                        const normalized = normalizeUserModuleKey(moduleItem.key);
                        return (
                          <button
                            key={`${moduleItem.key}-${moduleItem.name}`}
                            type="button"
                            data-active={selectedModuleKey === normalized ? "true" : "false"}
                            onClick={() => setActiveModuleKey(normalized)}
                          >
                            <strong>{getModuleDisplayName(moduleItem)}</strong>
                            <span>{moduleItem.description || "Guia rápido do acesso"}</span>
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
                            <p>{selectedModule.description || "Aprenda o fluxo principal deste acesso."}</p>
                          </div>
                          <Link
                            href={resolveModuleHref(selectedModule.key, selectedModule.serviceUrl)}
                            className={styles.primaryButton}
                          >
                            Abrir
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
                          <div className={styles.visualStepList}>
                            {selectedTutorial.steps.map((step, index) => {
                              const visual = getStepVisual(selectedModuleKey, index, step);
                              return (
                                <article key={step} className={styles.visualStep}>
                                  <div className={styles.stepCopy}>
                                    <span>{String(index + 1).padStart(2, "0")}</span>
                                    <p>{step}</p>
                                  </div>
                                  <div className={styles.stepMockup} aria-label={`Print guia: ${visual.from} para ${visual.to}`}>
                                    <div className={styles.mockHeader}>
                                      <i />
                                      <strong>{visual.title}</strong>
                                    </div>
                                    <div className={styles.mockBody}>
                                      {visual.lines.slice(0, 3).map((line) => (
                                        <span key={line}>{line}</span>
                                      ))}
                                    </div>
                                  </div>
                                  <div className={styles.stepBridge} aria-hidden="true">
                                    <small>{visual.from}</small>
                                    <b>{"->"}</b>
                                    <small>{visual.to}</small>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
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
                    <span>Nenhum acesso ativo ainda</span>
                    <h2>Seu guia aparece assim que seu acesso for liberado.</h2>
                    <p>
                      Fale com o responsável pela conta para liberar o plano da empresa. Se você for master,
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
                      Abrir
                    </Link>
                  </article>
                ))}
              </section>
            )}

            {blockedModules.length ? (
              <section className={styles.blockedSection}>
                <div className={styles.sectionTitle}>
                  <span>!</span>
                  <h2>Acessos que precisam de atenção</h2>
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
