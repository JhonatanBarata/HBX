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

// PublishDto foi removido na S20 (MOTOR-ÚNICO) junto com AssistenteController
// — era usado só pelo @Body() de POST /assistente/publish (rota removida, zero
// consumidor vivo). `AssistenteService.publish(user, on: boolean)` recebe o
// booleano direto, nunca usou este tipo.

// ── COPILOTO NO LEAD (LEADS-FINAL/05) ──────────────────────────────────────
// O front manda o CONTEXTO pronto (ultimas mensagens + ficha RFB) — o backend
// so gera texto. Nada aqui toca Webwhats; a coleta das mensagens é feita no
// front pelas rotas de leitura ja existentes do Atendimento.
export type CopilotoMensagemDto = {
  // 'lead' | 'voce' (ou direction bruto 'inbound'|'outbound').
  autor?: string;
  direcao?: string;
  texto?: string;
};

export type CopilotoFichaDto = {
  nome?: string;
  razaoSocial?: string;
  cnpj?: string;
  cnae?: string;
  segmento?: string;
  cidade?: string;
  uf?: string;
  situacao?: string;
};

export type CopilotoRascunhoDto = {
  mensagens?: CopilotoMensagemDto[];
  ficha?: CopilotoFichaDto;
  // Pedido opcional do vendedor ("responder que temos desconto", etc.).
  instrucao?: string;
};

export type CopilotoResumoDto = {
  mensagens?: CopilotoMensagemDto[];
  ficha?: CopilotoFichaDto;
};

export type CopilotoSugestaoDto = {
  mensagens?: CopilotoMensagemDto[];
  ficha?: CopilotoFichaDto;
};
