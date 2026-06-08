export type TeamAccessGroupKey =
  | 'modules'
  | 'radar'
  | 'vendas'
  | 'communication'
  | 'commission'
  | 'sellerNetwork'
  | 'products'
  | 'admin';

export type TeamAccessRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type TeamAccessCatalogGroup = {
  key: TeamAccessGroupKey;
  label: string;
  description: string;
};

export type TeamAccessCatalogItem = {
  key: string;
  group: TeamAccessGroupKey;
  label: string;
  description: string;
  defaultForAdmin: boolean;
  defaultForSeller: boolean;
  requiresModule?: string;
  riskLevel: TeamAccessRiskLevel;
  sellerVisible: boolean;
  backendEnforced: boolean;
};

export type TeamAccessMap = Record<string, boolean>;

export type MissingBackendEnforcement = {
  key: string;
  group: TeamAccessGroupKey;
  label: string;
};

export const TEAM_ACCESS_GROUPS: TeamAccessCatalogGroup[] = [
  {
    key: 'modules',
    label: 'Modulos',
    description: 'Entrada geral nos modulos operacionais da empresa.',
  },
  {
    key: 'radar',
    label: 'Radar',
    description: 'Busca, estoque, cards e distribuicao de oportunidades.',
  },
  {
    key: 'vendas',
    label: 'Vendas',
    description: 'Esteira comercial, agenda de retorno e cards do vendedor.',
  },
  {
    key: 'communication',
    label: 'Comunicacao',
    description: 'Envios comerciais por WhatsApp, e-mail e canais de suporte.',
  },
  {
    key: 'commission',
    label: 'Comissao',
    description: 'Visualizacao e configuracao de comissao direta e herdada.',
  },
  {
    key: 'sellerNetwork',
    label: 'Vendedores',
    description: 'Indicacoes, heranca comercial e documentos de vendedores.',
  },
  {
    key: 'products',
    label: 'Catalogos',
    description: 'Catalogos de produtos, ofertas e materiais comerciais.',
  },
  {
    key: 'admin',
    label: 'Gerencial',
    description: 'Cadastro, bloqueio e politica de acesso da equipe.',
  },
];

export const TEAM_ACCESS_CATALOG: TeamAccessCatalogItem[] = [
  {
    key: 'radar.access',
    group: 'modules',
    label: 'Acessar Radar',
    description: 'Permite abrir o modulo Radar quando a empresa tem o modulo liberado.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.access',
    group: 'modules',
    label: 'Acessar Vendas',
    description: 'Permite abrir o modulo Vendas quando a empresa tem o modulo liberado.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'atendimento.access',
    group: 'modules',
    label: 'Acessar Atendimento',
    description: 'Permite abrir a caixa de atendimento quando a empresa tem o modulo liberado.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'atendimento',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'cadastro.access',
    group: 'modules',
    label: 'Acessar Cadastro',
    description: 'Permite abrir cadastros comerciais e registros compartilhados.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'cadastro',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'gerencial.access',
    group: 'modules',
    label: 'Acessar Gerencial',
    description: 'Permite abrir a area Gerencial da empresa.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'gerencial',
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: true,
  },
  {
    key: 'website.access',
    group: 'modules',
    label: 'Acessar Website',
    description: 'Permite abrir recursos de site e paginas comerciais da empresa.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'website',
    riskLevel: 'medium',
    sellerVisible: false,
    backendEnforced: true,
  },
  {
    key: 'financeiro.access',
    group: 'modules',
    label: 'Acessar Financeiro',
    description: 'Permite abrir recursos financeiros quando a empresa tem o modulo liberado.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'financeiro',
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: true,
  },
  {
    key: 'radar.search.run',
    group: 'radar',
    label: 'Rodar busca no Radar',
    description: 'Permite iniciar buscas externas para gerar oportunidades.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'high',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'radar.cards.pull',
    group: 'radar',
    label: 'Puxar cards do Radar',
    description: 'Permite puxar cards prontos do banco para trabalho comercial.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'high',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'radar.cards.viewOwn',
    group: 'radar',
    label: 'Ver cards proprios',
    description: 'Permite ver cards do Radar ja atribuidos ao proprio usuario.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'webscraping',
    riskLevel: 'low',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'radar.cards.viewUnassigned',
    group: 'radar',
    label: 'Ver cards sem dono',
    description: 'Permite ver cards livres da empresa no Radar.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: true,
  },
  {
    key: 'radar.cards.assignToSelf',
    group: 'radar',
    label: 'Assumir card',
    description: 'Permite reservar um card do Radar para si.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'webscraping',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'radar.cards.assignToOthers',
    group: 'radar',
    label: 'Atribuir para outros',
    description: 'Permite reservar ou transferir cards do Radar para outro vendedor.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'radar.cards.sendToVendas',
    group: 'radar',
    label: 'Enviar para Vendas',
    description: 'Permite transformar um card do Radar em card de Vendas.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'high',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'radar.stock.replenish',
    group: 'radar',
    label: 'Repor estoque do Radar',
    description: 'Permite acionar reposicao de estoque para filtros de Radar.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: true,
  },
  {
    key: 'radar.cards.distribute',
    group: 'radar',
    label: 'Distribuir cards',
    description: 'Permite distribuir cards do Radar para vendedores da empresa.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'critical',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'radar.filters.useSegments',
    group: 'radar',
    label: 'Usar filtro de segmentos',
    description: 'Permite filtrar ou restringir buscas do Radar por segmento.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'radar.filters.useCities',
    group: 'radar',
    label: 'Usar filtro de cidades',
    description: 'Permite filtrar ou restringir buscas do Radar por cidade.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'radar.filters.useStates',
    group: 'radar',
    label: 'Usar filtro de estados',
    description: 'Permite filtrar ou restringir buscas do Radar por estado.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'radar.enrichment.manual',
    group: 'radar',
    label: 'Enriquecer manualmente',
    description: 'Permite acionar enriquecimento manual de oportunidade no Radar.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'high',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'radar.enrichment.auto',
    group: 'radar',
    label: 'Enriquecimento automatico',
    description: 'Permite usar enriquecimento automatico em buscas e rotinas do Radar.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'radar.distribution.manage',
    group: 'radar',
    label: 'Gerir distribuicao',
    description: 'Permite criar e alterar regras de distribuicao automatica do Radar.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'webscraping',
    riskLevel: 'critical',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'vendas.cards.viewOwn',
    group: 'vendas',
    label: 'Ver proprios cards',
    description: 'Permite ver cards de Vendas atribuidos ao proprio usuario.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'low',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.cards.viewCompany',
    group: 'vendas',
    label: 'Ver cards da empresa',
    description: 'Permite ver cards de Vendas de todos os usuarios da empresa.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'vendas',
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: true,
  },
  {
    key: 'vendas.cards.createManual',
    group: 'vendas',
    label: 'Criar card manual',
    description: 'Permite criar oportunidades manualmente em Vendas.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.cards.assign',
    group: 'vendas',
    label: 'Atribuir cards',
    description: 'Permite atribuir ou transferir cards entre vendedores.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'vendas',
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: true,
  },
  {
    key: 'vendas.cards.edit',
    group: 'vendas',
    label: 'Editar card',
    description: 'Permite alterar dados comerciais de cards em Vendas.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.cards.transfer',
    group: 'vendas',
    label: 'Transferir card',
    description: 'Permite transferir cards de Vendas entre usuarios.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'vendas',
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'vendas.cards.close',
    group: 'vendas',
    label: 'Encerrar card',
    description: 'Permite encerrar oportunidades no Vendas.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.cards.reopen',
    group: 'vendas',
    label: 'Reabrir card',
    description: 'Permite reabrir oportunidades encerradas no Vendas.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.cards.delete',
    group: 'vendas',
    label: 'Excluir card',
    description: 'Permite excluir cards de Vendas.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'vendas',
    riskLevel: 'critical',
    sellerVisible: false,
    backendEnforced: true,
  },
  {
    key: 'vendas.status.change',
    group: 'vendas',
    label: 'Alterar status',
    description: 'Permite mover cards entre etapas e status comerciais.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.sale.markActivationPending',
    group: 'vendas',
    label: 'Marcar ativacao pendente',
    description: 'Permite marcar uma venda como aguardando ativacao.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'high',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.sale.markTrialStarted',
    group: 'vendas',
    label: 'Marcar teste iniciado',
    description: 'Permite marcar inicio de teste ou avaliacao comercial.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'high',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.sale.markConfirmed',
    group: 'vendas',
    label: 'Marcar venda confirmada',
    description: 'Permite confirmar venda no card comercial.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'high',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.sale.markInactive',
    group: 'vendas',
    label: 'Marcar inativo',
    description: 'Permite marcar cliente ou oportunidade como inativo.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'vendas',
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: true,
  },
  {
    key: 'vendas.timeline.comment',
    group: 'vendas',
    label: 'Comentar timeline',
    description: 'Permite registrar interacoes e notas comerciais nos proprios cards.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'low',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.return.schedule',
    group: 'vendas',
    label: 'Agendar retorno',
    description: 'Permite mover cards para retorno e agenda comercial.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'low',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'vendas.complaints.view',
    group: 'vendas',
    label: 'Ver reclamacoes',
    description: 'Permite consultar sinais de reclamacao ligados a cards comerciais.',
    defaultForAdmin: true,
    defaultForSeller: false,
    requiresModule: 'vendas',
    riskLevel: 'medium',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'communication.whatsapp.useCompanyNumber',
    group: 'communication',
    label: 'Usar numero da empresa',
    description: 'Permite enviar WhatsApp usando o numero conectado da empresa.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'high',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'communication.whatsapp.sendManual',
    group: 'communication',
    label: 'Enviar WhatsApp',
    description: 'Permite iniciar ou continuar contato manual pelo WhatsApp.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'high',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'communication.email.send',
    group: 'communication',
    label: 'Enviar e-mail',
    description: 'Permite preparar e enviar mensagens comerciais por e-mail.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: true,
  },
  {
    key: 'communication.email.useCompanyReplyTo',
    group: 'communication',
    label: 'Usar reply-to da empresa',
    description: 'Permite usar remetente ou resposta configurado pela empresa.',
    defaultForAdmin: true,
    defaultForSeller: true,
    requiresModule: 'vendas',
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'communication.support.contactAdmin',
    group: 'communication',
    label: 'Chamar responsavel',
    description: 'Permite solicitar apoio do responsavel da empresa.',
    defaultForAdmin: true,
    defaultForSeller: true,
    riskLevel: 'low',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'communication.support.viewCompanySupportChannels',
    group: 'communication',
    label: 'Ver canais de suporte',
    description: 'Permite consultar canais de suporte e responsaveis da empresa.',
    defaultForAdmin: true,
    defaultForSeller: true,
    riskLevel: 'low',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'commission.viewOwn',
    group: 'commission',
    label: 'Ver propria comissao',
    description: 'Permite ao vendedor ver a propria regra de comissao quando a visibilidade permitir.',
    defaultForAdmin: true,
    defaultForSeller: true,
    riskLevel: 'low',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'commission.viewTeam',
    group: 'commission',
    label: 'Ver comissao da equipe',
    description: 'Permite consultar comissoes dos vendedores da empresa.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'commission.editPercent',
    group: 'commission',
    label: 'Editar percentual',
    description: 'Permite configurar percentual de comissao direta do usuario.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'commission.editDueDays',
    group: 'commission',
    label: 'Editar D+',
    description: 'Permite configurar prazo de liberacao de comissao.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'commission.markPaid',
    group: 'commission',
    label: 'Marcar como pago',
    description: 'Permite registrar pagamento de comissao.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'critical',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'commission.cancel',
    group: 'commission',
    label: 'Cancelar comissao',
    description: 'Permite cancelar comissao calculada ou pendente.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'critical',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'commission.viewInherited',
    group: 'commission',
    label: 'Ver comissao herdada',
    description: 'Permite consultar comissoes herdadas por indicacao.',
    defaultForAdmin: true,
    defaultForSeller: true,
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'commission.inheritance.configure',
    group: 'commission',
    label: 'Definir heranca de comissao',
    description: 'Permite configurar indicador, heranca e percentual herdado do vendedor.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'sellerNetwork.recruitSellers',
    group: 'sellerNetwork',
    label: 'Indicar vendedores',
    description: 'Permite criar ou indicar novos vendedores para a empresa.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'sellerNetwork.viewReferrals',
    group: 'sellerNetwork',
    label: 'Ver indicacoes',
    description: 'Permite consultar indicacoes e vendedores indicados.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'sellerNetwork.approveReferrals',
    group: 'sellerNetwork',
    label: 'Aprovar indicacoes',
    description: 'Permite aprovar ou rejeitar indicacoes de vendedores.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'sellerNetwork.receiveInheritedCommission',
    group: 'sellerNetwork',
    label: 'Receber heranca',
    description: 'Permite vincular o usuario para receber comissao herdada por indicacao.',
    defaultForAdmin: true,
    defaultForSeller: true,
    riskLevel: 'medium',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'seller.documents.request',
    group: 'sellerNetwork',
    label: 'Solicitar documentos',
    description: 'Permite exigir documentos do funcionario antes ou depois de criar o acesso.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'seller.documents.store',
    group: 'sellerNetwork',
    label: 'Salvar documentos',
    description: 'Permite armazenar documentos do funcionario no cadastro da empresa.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'products.view',
    group: 'products',
    label: 'Ver produtos',
    description: 'Permite consultar produtos e catalogos comerciais da empresa.',
    defaultForAdmin: true,
    defaultForSeller: true,
    riskLevel: 'low',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'products.sell',
    group: 'products',
    label: 'Vender produtos',
    description: 'Permite usar produtos em propostas, cards e interacoes comerciais.',
    defaultForAdmin: true,
    defaultForSeller: true,
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'products.edit',
    group: 'products',
    label: 'Editar produtos',
    description: 'Permite criar e alterar produtos, ofertas e materiais comerciais.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'medium',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'products.discount',
    group: 'products',
    label: 'Aplicar desconto',
    description: 'Permite aplicar desconto em produtos e propostas comerciais.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'high',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'products.viewPrice',
    group: 'products',
    label: 'Ver preco',
    description: 'Permite visualizar precos de produtos e ofertas.',
    defaultForAdmin: true,
    defaultForSeller: true,
    riskLevel: 'medium',
    sellerVisible: true,
    backendEnforced: false,
  },
  {
    key: 'products.changePrice',
    group: 'products',
    label: 'Alterar preco',
    description: 'Permite alterar preco de produto ou proposta comercial.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'critical',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'team.access.view',
    group: 'admin',
    label: 'Ver politicas',
    description: 'Permite consultar as politicas de acesso da equipe.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: true,
  },
  {
    key: 'team.access.manage',
    group: 'admin',
    label: 'Editar politicas',
    description: 'Permite alterar acessos, limites e regras comerciais da equipe.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'critical',
    sellerVisible: false,
    backendEnforced: true,
  },
  {
    key: 'team.users.create',
    group: 'admin',
    label: 'Criar usuarios',
    description: 'Permite criar acesso de vendedor ou admin no Gerencial.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'critical',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'team.users.edit',
    group: 'admin',
    label: 'Editar usuarios',
    description: 'Permite editar cadastro e dados operacionais de usuarios.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'critical',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'team.users.disable',
    group: 'admin',
    label: 'Desativar usuarios',
    description: 'Permite bloquear ou desativar usuarios da empresa.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'critical',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'team.users.delete',
    group: 'admin',
    label: 'Excluir usuarios',
    description: 'Permite excluir usuarios quando o fluxo permitir.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'critical',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'team.access.applyPreset',
    group: 'admin',
    label: 'Aplicar preset',
    description: 'Permite aplicar presets de acesso no Gerencial.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
  {
    key: 'team.access.viewAudit',
    group: 'admin',
    label: 'Ver auditoria',
    description: 'Permite consultar historico de alteracoes de politica da equipe.',
    defaultForAdmin: true,
    defaultForSeller: false,
    riskLevel: 'high',
    sellerVisible: false,
    backendEnforced: false,
  },
];

const TEAM_ACCESS_KEY_SET = new Set(TEAM_ACCESS_CATALOG.map((item) => item.key));
const TEAM_ACCESS_CANONICAL_KEY_BY_LOWER = new Map(
  [
    ...TEAM_ACCESS_CATALOG.map((item) => [item.key.toLowerCase(), item.key] as const),
    ['cadastros.access', 'cadastro.access'] as const,
    ['whatsapp.access', 'communication.whatsapp.useCompanyNumber'] as const,
    ['communication.whatsapp.send', 'communication.whatsapp.sendManual'] as const,
    ['communication.email.presentation', 'communication.email.send'] as const,
    ['products.catalog.view', 'products.view'] as const,
    ['products.catalog.manage', 'products.edit'] as const,
    ['commission.own.view', 'commission.viewOwn'] as const,
    ['commission.own.configure', 'commission.editPercent'] as const,
    ['commission.payout.view', 'commission.viewTeam'] as const,
    ['commission.payout.manage', 'commission.markPaid'] as const,
    ['sellernetwork.recruit', 'sellerNetwork.recruitSellers'] as const,
    ['sellernetwork.referral.receive', 'sellerNetwork.receiveInheritedCommission'] as const,
    ['team.user.create', 'team.users.create'] as const,
    ['team.user.deactivate', 'team.users.disable'] as const,
  ],
);

const MODULE_ACCESS_EQUIVALENTS: Record<string, string[]> = {
  vendas: [
    'vendas.access',
    'vendas.cards.viewOwn',
    'vendas.cards.createManual',
    'vendas.cards.edit',
    'vendas.cards.close',
    'vendas.cards.reopen',
    'vendas.status.change',
    'vendas.sale.markActivationPending',
    'vendas.sale.markTrialStarted',
    'vendas.sale.markConfirmed',
    'vendas.timeline.comment',
    'vendas.return.schedule',
    'communication.whatsapp.useCompanyNumber',
    'communication.whatsapp.sendManual',
    'communication.email.send',
    'communication.email.useCompanyReplyTo',
  ],
  webscraping: [
    'radar.access',
    'radar.search.run',
    'radar.cards.pull',
    'radar.cards.viewOwn',
    'radar.cards.assignToSelf',
    'radar.cards.sendToVendas',
    'radar.filters.useSegments',
    'radar.filters.useCities',
    'radar.filters.useStates',
    'radar.enrichment.manual',
  ],
  radar: [
    'radar.access',
    'radar.search.run',
    'radar.cards.pull',
    'radar.cards.viewOwn',
    'radar.cards.assignToSelf',
    'radar.cards.sendToVendas',
    'radar.filters.useSegments',
    'radar.filters.useCities',
    'radar.filters.useStates',
    'radar.enrichment.manual',
  ],
  radar_premium: [
    'radar.access',
    'radar.search.run',
    'radar.cards.pull',
    'radar.cards.viewOwn',
    'radar.cards.assignToSelf',
    'radar.cards.sendToVendas',
    'radar.filters.useSegments',
    'radar.filters.useCities',
    'radar.filters.useStates',
    'radar.enrichment.manual',
  ],
  atendimento: ['atendimento.access'],
  whatsapp: ['communication.whatsapp.useCompanyNumber', 'communication.whatsapp.sendManual'],
  cadastro: ['cadastro.access'],
  cadastros: ['cadastro.access'],
  website: ['website.access'],
  gerencial: [
    'gerencial.access',
    'team.access.view',
    'team.access.manage',
    'team.access.applyPreset',
    'team.access.viewAudit',
    'team.users.create',
    'team.users.edit',
    'team.users.disable',
  ],
  financeiro: ['financeiro.access'],
};

function normalizeAccessKey(value: unknown) {
  const raw = String(value || '').trim();
  return TEAM_ACCESS_CANONICAL_KEY_BY_LOWER.get(raw.toLowerCase()) || raw;
}

function normalizeModuleKey(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function isTeamAccessKey(value: unknown) {
  return TEAM_ACCESS_KEY_SET.has(normalizeAccessKey(value));
}

export function normalizeTeamAccessKey(value: unknown) {
  return normalizeAccessKey(value);
}

export function getTeamAccessCatalog() {
  return TEAM_ACCESS_CATALOG;
}

export function getTeamAccessGroups() {
  return TEAM_ACCESS_GROUPS;
}

export function getTeamAccessCatalogItem(key: unknown) {
  const normalized = normalizeAccessKey(key);
  return TEAM_ACCESS_CATALOG.find((item) => item.key === normalized) || null;
}

export function normalizeTeamAccessMap(value: unknown): TeamAccessMap {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([key, allowed]) => ({ key, allowed }))
      : [];
  const map: TeamAccessMap = {};
  for (const row of rows) {
    const key = normalizeAccessKey((row as any)?.key);
    if (!isTeamAccessKey(key)) continue;
    map[key] = Boolean((row as any)?.allowed);
  }
  return map;
}

export function mergeTeamAccessMaps(...maps: Array<TeamAccessMap | null | undefined>): TeamAccessMap {
  return maps.reduce<TeamAccessMap>((accumulator, map) => {
    for (const [key, allowed] of Object.entries(map || {})) {
      if (isTeamAccessKey(key)) accumulator[key] = Boolean(allowed);
    }
    return accumulator;
  }, {});
}

export function buildDefaultTeamAccessMapForRole(roleOrKind: unknown): TeamAccessMap {
  const normalized = String(roleOrKind || '').trim().toLowerCase();
  const admin = ['admin', 'usermaster', 'system_master', 'company_admin'].includes(normalized);
  return TEAM_ACCESS_CATALOG.reduce<TeamAccessMap>((accumulator, item) => {
    accumulator[item.key] = admin ? item.defaultForAdmin : item.defaultForSeller;
    return accumulator;
  }, {});
}

export function buildTeamAccessMapFromModuleAccess(value: unknown): TeamAccessMap {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([key, allowed]) => ({ key, allowed }))
      : [];
  const map: TeamAccessMap = {};
  for (const row of rows) {
    const moduleKey = normalizeModuleKey((row as any)?.key);
    const allowed = Boolean((row as any)?.allowed);
    if (!moduleKey || !allowed) continue;
    for (const accessKey of MODULE_ACCESS_EQUIVALENTS[moduleKey] || []) {
      if (isTeamAccessKey(accessKey)) map[accessKey] = true;
    }
  }
  return map;
}

export function moduleAccessRowsFromMap(value: unknown) {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([key, allowed]) => ({ key, allowed }))
      : [];
  return rows
    .map((row: any) => ({
      key: normalizeModuleKey(row?.key),
      allowed: Boolean(row?.allowed),
    }))
    .filter((row) => row.key && !row.key.includes('.'));
}

export function buildTeamAccessRows(map: TeamAccessMap) {
  return Object.entries(map || {})
    .filter(([key]) => isTeamAccessKey(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, allowed]) => ({ key, allowed: Boolean(allowed) }));
}

export function listMissingBackendEnforcement(accessMap: TeamAccessMap): MissingBackendEnforcement[] {
  return TEAM_ACCESS_CATALOG
    .filter((item) => Boolean(accessMap?.[item.key]) && !item.backendEnforced)
    .map((item) => ({
      key: item.key,
      group: item.group,
      label: item.label,
    }));
}

export function resolveTeamAccessAllowed(accessMap: TeamAccessMap | null | undefined, key: unknown) {
  const normalized = normalizeAccessKey(key);
  if (!normalized || !isTeamAccessKey(normalized) || !accessMap) return undefined;
  if (!Object.prototype.hasOwnProperty.call(accessMap, normalized)) return undefined;
  return Boolean(accessMap[normalized]);
}

export function hasTeamAccess(accessMap: TeamAccessMap | null | undefined, key: unknown) {
  return resolveTeamAccessAllowed(accessMap, key) === true;
}
