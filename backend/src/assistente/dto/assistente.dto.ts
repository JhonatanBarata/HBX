// WORM-14 DTOs. Padrao leve (sem class-validator, igual WORM-12/13/15): o service
// sanitiza tudo via sanitizeAssistenteConfig. Tipos = contrato p/ controller/front.

export type FluxoPassoDto = {
  id?: string;
  tipo?: string;
  texto?: string;
};

export type FluxoCondicaoDto = {
  id?: string;
  rotulo?: string;
  comportamento?: string;
  exemplos?: string[];
  proximoPassoId?: string | null;
};

export type FluxoJsonDto = {
  entradaPassoId?: string | null;
  passos?: FluxoPassoDto[];
  condicoes?: FluxoCondicaoDto[];
};

export type SaveAssistenteDto = {
  nome?: string;
  tom?: string;
  perfil?: string;
  produtos?: string;
  empresaNome?: string;
  fluxo?: FluxoJsonDto;
};

// Sandbox: manda a config ATUAL (ou usa a salva) + o historico + a nova mensagem.
export type SandboxDto = {
  message?: string;
  history?: Array<{ role?: string; content?: string }>;
  // Opcional: quando o wizard ainda nao salvou, testa com a config em edicao.
  config?: SaveAssistenteDto;
};

// Publicar no chip (atras de flag). Body pode trazer on:boolean.
export type PublishDto = {
  on?: boolean;
};
