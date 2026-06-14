// Conteúdo do tutorial de entrada (capítulos List → Lead → Full) — FONTE ÚNICA,
// consumida pela página /tutorial E pelo portão de boas-vindas (primeiro acesso).
// Só dados/lógica de plano; nada de visual aqui.

export type TutorialCapitulo = {
  id: string;
  plano: string;
  titulo: string;
  resumo: string;
  passos: { t: string; d: string }[];
  cta: { label: string; href: string };
  upgradeLabel: string;
};

export const CAPITULOS: TutorialCapitulo[] = [
  {
    id: "list",
    plano: "HBX List",
    titulo: "Encontre empresas para vender",
    resumo: "O Radar busca empresas reais do segmento e da cidade que você escolher — com telefone, site e redes que conseguimos encontrar.",
    passos: [
      { t: "Abra o Radar", d: "Menu lateral → Radar. Escolha um segmento (ex.: clínica) e uma cidade." },
      { t: "Execute a coleta", d: "Clique em ▶ Executar coleta e acompanhe os resultados chegando na tabela." },
      { t: "Olhe o contato", d: "Clique numa empresa: telefone, site e redes ficam no painel da direita." },
      { t: "Mande para Vendas", d: "Gostou do lead? \"Adicionar ao CRM\" cria o card na sua esteira de Vendas." },
    ],
    cta: { label: "Abrir o Radar e rodar minha primeira coleta", href: "/webscraping" },
    upgradeLabel: "Disponível a partir do plano HBX List",
  },
  {
    id: "lead",
    plano: "HBX Lead",
    titulo: "Leads que chegam prontos para fechar",
    resumo: "No Lead, cada card chega trabalhado: prioridade, WhatsApp verificado pela HBX, canal recomendado e mensagem pronta para enviar.",
    passos: [
      { t: "Score e prioridade", d: "Os cards chegam ordenados por chance de fechar — comece pelos quentes." },
      { t: "WhatsApp verificado", d: "A HBX confirma o WhatsApp antes de você gastar tempo discando número morto." },
      { t: "Canal e mensagem prontos", d: "Cada lead diz por onde abordar e já sugere a primeira mensagem." },
      { t: "Esteira e agenda", d: "Distribua leads para vendedores e deixe a agenda de retornos puxar o seu dia (relógio no topo do Vendas)." },
    ],
    cta: { label: "Ver meus leads", href: "/leads" },
    upgradeLabel: "Disponível no plano HBX Lead",
  },
  {
    id: "full",
    plano: "HBX Full · Empresarial",
    titulo: "A operação completa dentro do HBX",
    resumo: "Para empresas: o WhatsApp inteiro dentro do sistema, bot que qualifica e transfere para humano, e o Recovery cobrando quem sumiu.",
    passos: [
      { t: "Atendimento integrado", d: "Conecte o WhatsApp da empresa e converse sem sair do HBX — histórico junto do lead." },
      { t: "Bot com handoff humano", d: "O bot recebe, qualifica e te chama quando o cliente é de verdade." },
      { t: "Recovery", d: "Parcela atrasada, orçamento parado e cliente sumido entram numa régua automática de cobrança." },
      { t: "Implantação assistida", d: "A equipe HBX configura mensagens, limites e horários com você antes de ligar tudo." },
    ],
    cta: { label: "Falar com a equipe (sob consulta)", href: "/configuracoes" },
    upgradeLabel: "Empresarial — sob consulta",
  },
];

// até onde o tutorial "é seu" por plano (índice do último capítulo liberado)
export function limiteDoPlano(planKey: string | null): number {
  if (planKey === "hbx_melhor") return 2;
  if (planKey === "hbx_padrao") return 1;
  if (planKey === "hbx_lite") return 0;
  return 1; // sem plano resolvido → mostra até Lead
}
