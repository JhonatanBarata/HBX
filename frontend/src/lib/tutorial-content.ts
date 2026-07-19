// TUTORIAL FRONT — conteúdo ESTÁTICO das 3 guias do tutorial público
// (/tutorialexterno) e do painel de upload no /master ("Tutorial front").
// Cada passo: id (chave do vídeo no manifesto) + título + descrição de 1 linha.
// O vídeo de cada passo é subido pelo dono no master (tutorial-media) e cai em
// /uploads/tutorial/<id>.<ext>. Mudar texto aqui = muda nos DOIS lugares.
//
// Os ids são estáveis: NÃO renomear depois de o dono subir vídeo (o manifesto
// mapeia por id). Adicionar passo novo é seguro; renomear quebra o vínculo.

export type TutorialStep = { id: string; title: string; desc: string };
export type TutorialGuide = { id: string; label: string; hint: string; steps: TutorialStep[] };

export const TUTORIAL_GUIDES: TutorialGuide[] = [
  {
    id: "sistema",
    label: "Sistema",
    hint: "No computador (navegador)",
    steps: [
      { id: "sis-login", title: "Como logar", desc: "E-mail e senha na porta única; já cai direto no painel." },
      { id: "sis-dashboard", title: "Dashboard", desc: "Visão do dia: números, atalhos e o que precisa de você agora." },
      { id: "sis-radar", title: "Buscar empresas (Radar)", desc: "Ache clientes reais por região e perfil, dentro de Vendas." },
      { id: "sis-puxar", title: "Puxar para Vendas", desc: "Um clique leva a empresa do Radar pro funil (baixa 1 da cota)." },
      { id: "sis-funil", title: "Funil de Vendas", desc: "Arraste o lead entre as etapas até fechar." },
      { id: "sis-agenda", title: "Agenda", desc: "O que fazer hoje: tarefas e retornos do vendedor." },
      { id: "sis-conversas", title: "Conversas", desc: "Atenda todos os contatos numa caixa só, estilo WhatsApp Web." },
      { id: "sis-wpp-comum", title: "Conectar WhatsApp comum", desc: "Leia o QR Code e ligue seu número do dia a dia." },
      { id: "sis-wpp-meta", title: "Conectar Meta (oficial)", desc: "Ligue a API oficial da Meta para envio em escala." },
      { id: "sis-empresas", title: "Empresas", desc: "Suas contas PJ, puxadas do Radar ou criadas à mão." },
      { id: "sis-contatos", title: "Contatos / Clientes", desc: "Pessoas (dono, comprador, quem recebe) e seus clientes." },
      { id: "sis-produtos", title: "Produtos", desc: "Catálogo do que vende: unidade, preço e flag de entrega." },
      { id: "sis-automacoes", title: "Automações", desc: "Cadências e gatilhos que trabalham o lead sozinho." },
      { id: "sis-bot", title: "Bot / Assistente IA", desc: "Monte um atendente de IA e teste antes de ligar no chip." },
      { id: "sis-concierge", title: "Concierge IA", desc: "Busca do Radar guiada por conversa, em linguagem natural." },
      { id: "sis-financeiro", title: "Financeiro", desc: "Quem te deve, extrato e baixa de cobrança." },
      { id: "sis-relatorios", title: "Relatórios", desc: "Resultado do período em números." },
      { id: "sis-website", title: "Website", desc: "Publique um site simples do negócio pelo sistema." },
      { id: "sis-config", title: "Configurações", desc: "Conta, equipe, módulos e preferências." },
    ],
  },
  {
    id: "android",
    label: "Celular Android",
    hint: "Aplicativo de entrega (APK)",
    steps: [
      { id: "and-instalar", title: "Instalar o app", desc: "Baixe o APK pelo link e instale no Android." },
      { id: "and-entrar", title: "Entrar", desc: "Login com a conta do entregador/empresa." },
      { id: "and-montar-rota", title: "Montar rota do dia", desc: "Escolha os clientes e monte a sequência de entrega." },
      { id: "and-navegar", title: "Navegar", desc: "Abra a rota no Waze/Maps até o cliente." },
      { id: "and-chegada", title: "Chegada / Entrega", desc: "Marque Pago ou Próximo ao chegar." },
      { id: "and-avulsa", title: "Entrega avulsa", desc: "Adicione uma entrega fora da rota na hora." },
      { id: "and-clientes", title: "Clientes", desc: "Cadastre com pino no mapa, produtos e preço próprio." },
      { id: "and-produtos", title: "Produtos", desc: "Ajuste item, preço e observação pelo celular." },
      { id: "and-financeiro", title: "Financeiro / Cobrança", desc: "Veja quem deve, cobre no Pix e dê baixa." },
      { id: "and-recarga", title: "Recarga / Saldo", desc: "(admin) Recarregue saldo e controle o limite." },
      { id: "and-encerrar", title: "Encerrar a rota", desc: "Feche o dia; entrega aberta vira pendência, nada some." },
    ],
  },
  {
    id: "iphone",
    label: "Celular iPhone",
    hint: "Pela web (sem loja de apps)",
    steps: [
      { id: "ios-navegador", title: "Abrir no navegador", desc: "No iPhone, acesse pelo Safari (sem loja de apps)." },
      { id: "ios-add-tela", title: "Adicionar à tela", desc: "\"Adicionar à Tela de Início\" pra abrir como app." },
      { id: "ios-entrar", title: "Entrar", desc: "Login com e-mail e senha, igual ao computador." },
      { id: "ios-usar", title: "Usar no celular", desc: "As mesmas telas do sistema, adaptadas ao toque." },
      { id: "ios-entregas", title: "Entregas no iPhone", desc: "Rota, clientes e cobrança pela web, sem instalar nada." },
    ],
  },
];
