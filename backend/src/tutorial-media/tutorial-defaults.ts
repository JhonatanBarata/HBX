import type { TutorialGuide } from './tutorial-media.types';

// SEMENTE do tutorial. Só é usada quando ainda não existe manifesto no disco
// (primeira subida). A partir daí a fonte da verdade é o manifest.json, que o
// dono edita pelo /master (título, descrição, adicionar/remover tela, vídeo).
// Mexer aqui NÃO muda o que já está no ar — só o estado inicial de um ambiente novo.
export const DEFAULT_GUIDES: TutorialGuide[] = [
  {
    id: 'sistema',
    label: 'Sistema',
    hint: 'No computador (navegador)',
    steps: [
      { id: 'sis-login', title: 'Como logar', desc: 'E-mail e senha na porta única; já cai direto no painel.', media: null },
      { id: 'sis-dashboard', title: 'Dashboard', desc: 'Visão do dia: números, atalhos e o que precisa de você agora.', media: null },
      { id: 'sis-radar', title: 'Buscar empresas (Radar)', desc: 'Ache clientes reais por região e perfil, dentro de Vendas.', media: null },
      { id: 'sis-puxar', title: 'Puxar para Vendas', desc: 'Um clique leva a empresa do Radar pro funil (baixa 1 da cota).', media: null },
      { id: 'sis-funil', title: 'Funil de Vendas', desc: 'Arraste o lead entre as etapas até fechar.', media: null },
      { id: 'sis-agenda', title: 'Agenda', desc: 'O que fazer hoje: tarefas e retornos do vendedor.', media: null },
      { id: 'sis-conversas', title: 'Conversas', desc: 'Atenda todos os contatos numa caixa só, estilo WhatsApp Web.', media: null },
      { id: 'sis-wpp-comum', title: 'Conectar WhatsApp comum', desc: 'Leia o QR Code e ligue seu número do dia a dia.', media: null },
      { id: 'sis-wpp-meta', title: 'Conectar Meta (oficial)', desc: 'Ligue a API oficial da Meta para envio em escala.', media: null },
      { id: 'sis-empresas', title: 'Empresas', desc: 'Suas contas PJ, puxadas do Radar ou criadas à mão.', media: null },
      { id: 'sis-contatos', title: 'Contatos / Clientes', desc: 'Pessoas (dono, comprador, quem recebe) e seus clientes.', media: null },
      { id: 'sis-produtos', title: 'Produtos', desc: 'Catálogo do que vende: unidade, preço e flag de entrega.', media: null },
      { id: 'sis-automacoes', title: 'Automações', desc: 'Cadências e gatilhos que trabalham o lead sozinho.', media: null },
      { id: 'sis-bot', title: 'Bot / Assistente IA', desc: 'Monte um atendente de IA e teste antes de ligar no chip.', media: null },
      { id: 'sis-concierge', title: 'Concierge IA', desc: 'Busca do Radar guiada por conversa, em linguagem natural.', media: null },
      { id: 'sis-financeiro', title: 'Financeiro', desc: 'Quem te deve, extrato e baixa de cobrança.', media: null },
      { id: 'sis-relatorios', title: 'Relatórios', desc: 'Resultado do período em números.', media: null },
      { id: 'sis-website', title: 'Website', desc: 'Publique um site simples do negócio pelo sistema.', media: null },
      { id: 'sis-config', title: 'Configurações', desc: 'Conta, equipe, módulos e preferências.', media: null },
    ],
  },
  {
    id: 'android',
    label: 'Celular Android',
    hint: 'Aplicativo de entrega (APK)',
    steps: [
      { id: 'and-instalar', title: 'Instalar o app', desc: 'Baixe o APK pelo link e instale no Android.', media: null },
      { id: 'and-entrar', title: 'Entrar', desc: 'Login com a conta do entregador/empresa.', media: null },
      { id: 'and-montar-rota', title: 'Montar rota do dia', desc: 'Escolha os clientes e monte a sequência de entrega.', media: null },
      { id: 'and-navegar', title: 'Navegar', desc: 'Abra a rota no Waze/Maps até o cliente.', media: null },
      { id: 'and-chegada', title: 'Chegada / Entrega', desc: 'Marque Pago ou Próximo ao chegar.', media: null },
      { id: 'and-avulsa', title: 'Entrega avulsa', desc: 'Adicione uma entrega fora da rota na hora.', media: null },
      { id: 'and-clientes', title: 'Clientes', desc: 'Cadastre com pino no mapa, produtos e preço próprio.', media: null },
      { id: 'and-produtos', title: 'Produtos', desc: 'Ajuste item, preço e observação pelo celular.', media: null },
      { id: 'and-financeiro', title: 'Financeiro / Cobrança', desc: 'Veja quem deve, cobre no Pix e dê baixa.', media: null },
      { id: 'and-recarga', title: 'Recarga / Saldo', desc: '(admin) Recarregue saldo e controle o limite.', media: null },
      { id: 'and-encerrar', title: 'Encerrar a rota', desc: 'Feche o dia; entrega aberta vira pendência, nada some.', media: null },
    ],
  },
  {
    id: 'iphone',
    label: 'Celular iPhone',
    hint: 'Pela web (sem loja de apps)',
    steps: [
      { id: 'ios-navegador', title: 'Abrir no navegador', desc: 'No iPhone, acesse pelo Safari (sem loja de apps).', media: null },
      { id: 'ios-add-tela', title: 'Adicionar à tela', desc: '"Adicionar à Tela de Início" pra abrir como app.', media: null },
      { id: 'ios-entrar', title: 'Entrar', desc: 'Login com e-mail e senha, igual ao computador.', media: null },
      { id: 'ios-usar', title: 'Usar no celular', desc: 'As mesmas telas do sistema, adaptadas ao toque.', media: null },
      { id: 'ios-entregas', title: 'Entregas no iPhone', desc: 'Rota, clientes e cobrança pela web, sem instalar nada.', media: null },
    ],
  },
];
