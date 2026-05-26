"use client";

import { useMemo, useState } from "react";
import DashboardScaffold from "@/components/DashboardScaffold";
import { useRequireAuth } from "@/app/_lib/useRequireAuth";
import styles from "./page.module.css";

type LinkItem = {
  key: string;
  title: string;
  href: string;
  category: "Master" | "Pagamento" | "Operação" | "Cliente" | "Mobile" | "Sistema";
  detail: string;
};

const FRONT_LINKS: LinkItem[] = [
  { key: "pagamento-mock-card", title: "Checkout cartão", href: "/pagamento?mock=front&reason=pending_checkout&focus=payment", category: "Pagamento", detail: "Preview visual do checkout com cartão, sem passar pelo fluxo real." },
  { key: "pagamento-mock-pix", title: "Checkout Pix", href: "/pagamento?mock=front&reason=pending_checkout&focus=payment&method=pix", category: "Pagamento", detail: "Preview visual da área de Pix." },
  { key: "pagamento", title: "Financeiro real", href: "/pagamento", category: "Pagamento", detail: "Tela real do financeiro da conta autenticada." },
  { key: "checkout", title: "Checkout alias", href: "/checkout?mock=front&reason=pending_checkout", category: "Pagamento", detail: "Alias existente para a tela de pagamento." },
  { key: "pre-checkout", title: "Pre-checkout", href: "/pre-checkout?reason=pending_checkout", category: "Pagamento", detail: "Tela que antecede o checkout." },
  { key: "planos", title: "Planos", href: "/planos", category: "Pagamento", detail: "Seleção e troca de plano." },

  { key: "master", title: "Master", href: "/master", category: "Master", detail: "Command Center principal." },
  { key: "master-financeiro", title: "Master financeiro", href: "/master/financeiro", category: "Master", detail: "Leitura financeira do Master." },
  { key: "master-operacao", title: "Master operação", href: "/master/operacao", category: "Master", detail: "Painel operacional." },
  { key: "master-planos", title: "Master planos", href: "/master/planos", category: "Master", detail: "Gestão de planos." },
  { key: "master-clientes", title: "Master clientes", href: "/master/clientes", category: "Master", detail: "Clientes no Master." },
  { key: "master-whatsapp", title: "Master WhatsApp", href: "/master/whatsapp", category: "Master", detail: "Operação WhatsApp no Master." },
  { key: "master-email", title: "Master email", href: "/master/email", category: "Master", detail: "Email comercial e transacional." },
  { key: "master-exclusoes", title: "Master exclusões", href: "/master/exclusoes", category: "Master", detail: "Exclusões e retenção." },
  { key: "master-webscraping", title: "Master Radar", href: "/master/webscraping", category: "Master", detail: "Radar dentro do Master." },
  { key: "master-night", title: "Night Factory", href: "/master/night-factory", category: "Master", detail: "Tela Night Factory." },

  { key: "radar", title: "Radar Digital", href: "/radar-digital", category: "Operação", detail: "Busca de oportunidades." },
  { key: "vendas", title: "Vendas", href: "/vendas", category: "Operação", detail: "Esteira comercial." },
  { key: "atendimento-automacao", title: "Automação de atendimento", href: "/atendimento/automacao", category: "Operação", detail: "Builder de automação." },
  { key: "atendimento", title: "Atendimento", href: "/atendimento", category: "Operação", detail: "Inbox e conversas." },
  { key: "whatsapp", title: "WhatsApp", href: "/atendimento/automacao?tab=connection", category: "Operação", detail: "Conexão e status." },
  { key: "website", title: "Website", href: "/website", category: "Operação", detail: "Site e publicação." },
  { key: "gerencial", title: "Gerencial", href: "/gerencial", category: "Operação", detail: "Painel gerencial." },
  { key: "banco", title: "Banco de Dados", href: "/bancodedados", category: "Operação", detail: "Base operacional." },
  { key: "cadastros", title: "Cadastros", href: "/cadastros", category: "Operação", detail: "Cadastros do sistema." },
  { key: "layouts", title: "Layouts", href: "/layouts", category: "Operação", detail: "Layouts e modelos." },
  { key: "auto-replies", title: "Respostas automáticas", href: "/auto-replies", category: "Operação", detail: "Regras de resposta." },
  { key: "messages", title: "Mensagens", href: "/messages", category: "Operação", detail: "Central de mensagens." },
  { key: "recovery", title: "HBX Recovery", href: "/hbx-recovery", category: "Operação", detail: "Cobrança e recuperação." },

  { key: "home", title: "Home pública", href: "/", category: "Cliente", detail: "Página inicial pública." },
  { key: "login", title: "Login", href: "/login", category: "Cliente", detail: "Entrada do usuário." },
  { key: "register", title: "Cadastro", href: "/register", category: "Cliente", detail: "Criação de conta." },
  { key: "confirm-email", title: "Confirmar email", href: "/confirm-email", category: "Cliente", detail: "Confirmação de email." },
  { key: "reset-password", title: "Resetar senha", href: "/reset-password", category: "Cliente", detail: "Recuperação de senha." },
  { key: "boasvindas", title: "Boas-vindas", href: "/boasvindas", category: "Cliente", detail: "Onboarding inicial." },
  { key: "tutorial", title: "Tutorial", href: "/tutorial", category: "Cliente", detail: "Tutorial do produto." },

  { key: "mobile", title: "Mobile home", href: "/mobile", category: "Mobile", detail: "Entrada mobile." },
  { key: "mobile-login", title: "Mobile login", href: "/mobile/login", category: "Mobile", detail: "Login mobile." },
  { key: "mobile-radar", title: "Mobile Radar", href: "/mobile/radar-digital", category: "Mobile", detail: "Radar no mobile." },
  { key: "mobile-vendas", title: "Mobile Vendas", href: "/mobile/vendas", category: "Mobile", detail: "Vendas no mobile." },
  { key: "mobile-planos", title: "Mobile Planos", href: "/mobile/planos", category: "Mobile", detail: "Planos no mobile." },
  { key: "mobile-tutorial", title: "Mobile Tutorial", href: "/mobile/tutorial", category: "Mobile", detail: "Tutorial mobile." },

  { key: "termos", title: "Termos de uso", href: "/termos-de-uso", category: "Sistema", detail: "Documento legal." },
  { key: "termos-comerciais", title: "Termos comerciais", href: "/termos-comerciais", category: "Sistema", detail: "Documento comercial." },
  { key: "privacidade", title: "Privacidade", href: "/politica-de-privacidade", category: "Sistema", detail: "Política de privacidade." },
  { key: "reembolso", title: "Reembolso", href: "/politica-de-reembolso", category: "Sistema", detail: "Política de reembolso." },
  { key: "direitos", title: "Direitos autorais", href: "/direitos-autorais", category: "Sistema", detail: "Documento de direitos." },
];

const CATEGORIES: Array<LinkItem["category"] | "Todos"> = ["Todos", "Pagamento", "Master", "Operação", "Cliente", "Mobile", "Sistema"];

export default function MasterLinksPage() {
  const hasToken = useRequireAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LinkItem["category"] | "Todos">("Todos");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const filteredLinks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return FRONT_LINKS.filter((item) => {
      const matchesCategory = category === "Todos" || item.category === category;
      const matchesQuery = !normalized || (
        item.title.toLowerCase().includes(normalized) ||
        item.href.toLowerCase().includes(normalized) ||
        item.detail.toLowerCase().includes(normalized) ||
        item.category.toLowerCase().includes(normalized)
      );
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  async function copyLink(item: LinkItem) {
    await navigator.clipboard.writeText(`${window.location.origin}${item.href}`);
    setCopiedKey(item.key);
    window.setTimeout(() => setCopiedKey((current) => (current === item.key ? null : current)), 1400);
  }

  if (hasToken === null) {
    return (
      <main className={styles.page}>
        <div className={styles.state}>Carregando links...</div>
      </main>
    );
  }

  if (!hasToken) return null;

  return (
    <DashboardScaffold title="Links HBX" hideHeader>
      <main className={styles.page}>
        <section className={styles.header}>
          <div>
            <span>MASTER</span>
            <h1>Front HBX</h1>
            <p>Catálogo simples das telas do HBX para abrir em nova aba, revisar visual e remover o que não presta.</p>
          </div>
        </section>

        <section className={styles.toolbar}>
          <label htmlFor="master-links-search">Buscar tela</label>
          <input
            id="master-links-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pagamento, checkout, master, vendas..."
          />
          <div className={styles.filters} aria-label="Filtrar por categoria">
            {CATEGORIES.map((item) => (
              <button key={item} type="button" data-active={category === item} onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.list} aria-label="Telas disponíveis no HBX">
          {filteredLinks.length === 0 ? <div className={styles.state}>Nenhuma tela encontrada.</div> : null}
          {filteredLinks.map((item) => (
            <article key={item.key} className={styles.row}>
              <div>
                <span>{item.category}</span>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
                <small>{item.href}</small>
              </div>
              <div className={styles.actions}>
                <a href={item.href} target="_blank" rel="noopener noreferrer">Abrir</a>
                <button type="button" onClick={() => void copyLink(item)}>
                  {copiedKey === item.key ? "Copiado" : "Copiar"}
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </DashboardScaffold>
  );
}
