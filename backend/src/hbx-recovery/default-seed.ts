export type RecoverySeedCustomer = {
  name: string;
  whatsappNumber: string;
  openAmount: number;
  workdaySaleDay: number;
  recurringDelays: number;
  paymentHistoryScore: number;
  totalPaid: number;
  averageDelay: number;
  lastContact: string;
};

export const DEFAULT_RECOVERY_SEED: RecoverySeedCustomer[] = [
  { name: 'Orion Ferramentas Ltda', whatsappNumber: '+5511910000001', openAmount: 18700, workdaySaleDay: 5, recurringDelays: 4, paymentHistoryScore: 4, totalPaid: 6400, averageDelay: 36, lastContact: 'Hoje, 09:12' },
  { name: 'Brisa Alimentos ME', whatsappNumber: '+5511910000002', openAmount: 13200, workdaySaleDay: 8, recurringDelays: 3, paymentHistoryScore: 5, totalPaid: 3900, averageDelay: 28, lastContact: 'Ontem, 16:47' },
  { name: 'Vortex Engenharia', whatsappNumber: '+5511910000003', openAmount: 25900, workdaySaleDay: 12, recurringDelays: 5, paymentHistoryScore: 3, totalPaid: 7600, averageDelay: 44, lastContact: 'Hoje, 08:35' },
  { name: 'Atlas Moveis Planejados', whatsappNumber: '+5511910000004', openAmount: 9800, workdaySaleDay: 16, recurringDelays: 2, paymentHistoryScore: 6, totalPaid: 5100, averageDelay: 19, lastContact: 'Hoje, 11:02' },
  { name: 'Solaris Comercio Digital', whatsappNumber: '+5511910000005', openAmount: 14700, workdaySaleDay: 21, recurringDelays: 3, paymentHistoryScore: 5, totalPaid: 4300, averageDelay: 26, lastContact: 'Ontem, 14:18' },
  { name: 'Nativa Agro Solutions', whatsappNumber: '+5511910000006', openAmount: 11000, workdaySaleDay: 24, recurringDelays: 2, paymentHistoryScore: 6, totalPaid: 5200, averageDelay: 21, lastContact: 'Hoje, 10:27' },
  { name: 'Lumen Clinica Integrada', whatsappNumber: '+5511910000007', openAmount: 8900, workdaySaleDay: 26, recurringDelays: 2, paymentHistoryScore: 7, totalPaid: 3800, averageDelay: 15, lastContact: 'Hoje, 13:14' },
  { name: 'Prisma Auto Pecas', whatsappNumber: '+5511910000008', openAmount: 16600, workdaySaleDay: 27, recurringDelays: 4, paymentHistoryScore: 4, totalPaid: 4700, averageDelay: 31, lastContact: 'Ontem, 19:02' },
  { name: 'Delta Sistemas Industriais', whatsappNumber: '+5511910000009', openAmount: 20500, workdaySaleDay: 3, recurringDelays: 5, paymentHistoryScore: 3, totalPaid: 6200, averageDelay: 39, lastContact: 'Hoje, 07:50' },
  { name: 'Aurora Eventos Corporativos', whatsappNumber: '+5511910000010', openAmount: 12100, workdaySaleDay: 9, recurringDelays: 3, paymentHistoryScore: 5, totalPaid: 4500, averageDelay: 24, lastContact: 'Hoje, 12:02' },
  { name: 'Boreal Logistica Integrada', whatsappNumber: '+5511910000011', openAmount: 0, workdaySaleDay: 6, recurringDelays: 1, paymentHistoryScore: 8, totalPaid: 11800, averageDelay: 4, lastContact: 'Hoje, 10:43' },
  { name: 'Vega Saude Ocupacional', whatsappNumber: '+5511910000012', openAmount: 0, workdaySaleDay: 11, recurringDelays: 1, paymentHistoryScore: 9, totalPaid: 9400, averageDelay: 3, lastContact: 'Hoje, 09:58' },
  { name: 'Croma Comunicacao Visual', whatsappNumber: '+5511910000013', openAmount: 0, workdaySaleDay: 14, recurringDelays: 0, paymentHistoryScore: 9, totalPaid: 8600, averageDelay: 2, lastContact: 'Ontem, 17:09' },
  { name: 'Nexus Seguranca Eletronica', whatsappNumber: '+5511910000014', openAmount: 0, workdaySaleDay: 18, recurringDelays: 1, paymentHistoryScore: 8, totalPaid: 10400, averageDelay: 4, lastContact: 'Hoje, 11:21' },
  { name: 'Estrela Vidros Tecnicos', whatsappNumber: '+5511910000015', openAmount: 0, workdaySaleDay: 22, recurringDelays: 1, paymentHistoryScore: 8, totalPaid: 9200, averageDelay: 4, lastContact: 'Ontem, 15:41' },
  { name: 'Futura Educacao Executiva', whatsappNumber: '+5511910000016', openAmount: 0, workdaySaleDay: 25, recurringDelays: 0, paymentHistoryScore: 9, totalPaid: 7800, averageDelay: 1.5, lastContact: 'Hoje, 08:49' },
  { name: 'Porto Sul Materiais', whatsappNumber: '+5511910000017', openAmount: 0, workdaySaleDay: 7, recurringDelays: 1, paymentHistoryScore: 8, totalPaid: 11300, averageDelay: 4, lastContact: 'Hoje, 14:05' },
  { name: 'Arco Norte Distribuicao', whatsappNumber: '+5511910000018', openAmount: 0, workdaySaleDay: 13, recurringDelays: 0, paymentHistoryScore: 9, totalPaid: 9900, averageDelay: 2, lastContact: 'Ontem, 12:33' },
  { name: 'Mosaico Arquitetura', whatsappNumber: '+5511910000019', openAmount: 0, workdaySaleDay: 17, recurringDelays: 1, paymentHistoryScore: 8, totalPaid: 8700, averageDelay: 3, lastContact: 'Hoje, 10:06' },
  { name: 'Pontal Tecnologia Agricola', whatsappNumber: '+5511910000020', openAmount: 0, workdaySaleDay: 20, recurringDelays: 0, paymentHistoryScore: 9, totalPaid: 12100, averageDelay: 2, lastContact: 'Hoje, 09:31' },
];

