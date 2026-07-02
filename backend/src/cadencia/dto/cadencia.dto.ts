// WORM-13 DTOs. Sem class-validator (padrao leve do WORM-12/15): o service
// sanitiza. Tipos servem de contrato para o controller/frontend.

export type CadenciaPassoDto = {
  dia?: number;
  canal?: string;
  titulo?: string;
  corpo?: string;
  atividadeTipo?: string;
};

export type CreateCadenciaDto = {
  nome?: string;
  persona?: string;
  descricao?: string;
  passos?: CadenciaPassoDto[];
};

export type UpdateCadenciaDto = {
  nome?: string;
  descricao?: string;
  passos?: CadenciaPassoDto[];
  ativa?: boolean;
};

// Aplicar cadencia a uma lista/filtro: ou uma lista explicita de leadIds, ou um
// savedSearchId (WORM-15) cujo resultado vira a lista de inscritos.
export type AplicarCadenciaDto = {
  leadIds?: string[];
  savedSearchId?: string;
  responsavelId?: number | null;
};

// 13b — gatilho
export type CreateGatilhoDto = {
  nome?: string;
  evento?: string;
  acoes?: Array<Record<string, unknown>>;
};

export type UpdateGatilhoDto = {
  nome?: string;
  evento?: string;
  acoes?: Array<Record<string, unknown>>;
  ativo?: boolean;
};

// 13c — rotina
export type CreateRotinaDto = {
  nome?: string;
  savedSearchId?: string;
  assignedSellerId?: number | null;
  everyWeeks?: number;
  weekdays?: number[];
  maxLeads?: number;
  startsAt?: string;
  endsAt?: string | null;
  visibleOnlyToOwner?: boolean;
};

export type UpdateRotinaDto = Partial<CreateRotinaDto> & { ativa?: boolean };
