// Configuração mantida apenas para leitura de instalações antigas no cockpit.
// O worker e todo pré-enriquecimento noturno foram removidos: enriquecimento ocorre na puxada.
export type NightFactoryConfig = {
  enabled: boolean;
  startHour: number;
  endHour: number;
  maxConcurrency: number;
  batchSize: number;
  maxLeadsPerNight: number;
  enrichOnlyNewLeads: boolean;
  allowWebsiteFetch: boolean;
  allowScreenshot: boolean;
  allowAiSuggestions: boolean;
  allowRecoveryRevival: boolean;
  allowVendasQueuePush: boolean;
  cpuSoftLimitPercent: number;
  memorySoftLimitPercent: number;
};

export const DEFAULT_NIGHT_FACTORY_CONFIG: NightFactoryConfig = {
  enabled: false,
  startHour: 0,
  endHour: 0,
  maxConcurrency: 0,
  batchSize: 0,
  maxLeadsPerNight: 0,
  enrichOnlyNewLeads: false,
  allowWebsiteFetch: false,
  allowScreenshot: false,
  allowAiSuggestions: false,
  allowRecoveryRevival: false,
  allowVendasQueuePush: false,
  cpuSoftLimitPercent: 0,
  memorySoftLimitPercent: 0,
};
