import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * NÚCLEO-CRM N6 (05/07) — DTOs de ESCRITA do módulo Logística (app de entrega).
 *
 * Padrão do repo: class-validator + ValidationPipe global
 * (whitelist + forbidNonWhitelisted + transform). Só campos declarados passam;
 * qualquer chave extra no body é rejeitada (400). companyId NUNCA vem do body —
 * sai sempre do JWT no controller.
 */

// ── Criar uma ENTREGA (agendar) ──────────────────────────────────────────────
export class CreateEntregaDto {
  // O cliente (Conta = CustomerProfile). Obrigatório: uma entrega é sempre PARA alguém.
  @IsString()
  @MaxLength(60)
  customerProfileId!: string;

  // Quem recebe (Contato) — opcional (default: o principal da conta).
  @IsOptional()
  @IsString()
  @MaxLength(60)
  contatoId?: string;

  // O que entrega (Product) — opcional.
  @IsOptional()
  @IsInt()
  productId?: number;

  // MULTILOCAL (10/07) — onde entregar (LocalEntrega) — opcional. O serviço valida
  // que o local é do MESMO cliente+empresa; ausente/inválido = endereço do perfil.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  localId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  quantidade?: number;

  // Valor da entrega. Se omitido, o serviço resolve por precoPadrao/preço do produto.
  @IsOptional()
  @IsNumber()
  @Min(0)
  valor?: number;

  // ISO date; se omitido = hoje (entra na rota do dia).
  @IsOptional()
  @IsString()
  @MaxLength(40)
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /**
   * 🔴 28/07 — "esta entrega é da MINHA rota de hoje" (Rota rápida do APK).
   *
   * Sem isto a entrega nascia com `entregadorId: null` e o Iniciar estourava
   * "Atribua as entregas a exatamente um motorista antes de iniciar a rota" —
   * uma parada avulsa envenenava o dia inteiro. É a MESMA regra que o
   * admin-route/prepare já aplica (quem monta a rota adota as abertas sem
   * dono); a Rota rápida não passa por lá, então diz explicitamente.
   *
   * Opt-in de propósito: o painel web (admin agendando pra OUTRO motorista)
   * não manda o campo e segue nascendo sem dono, pro prepare adotar depois.
   */
  @IsOptional()
  @IsBoolean()
  paraMinhaRota?: boolean;
}

// ── Confirmar entrega (recebe o GPS do celular do entregador) ────────────────
export class ConfirmarEntregaDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  // B1 (07/07) — precisão do GPS em metros (navigator.geolocation coords.accuracy).
  // Usada SÓ pra decidir se este ponto é bom o bastante pra realimentar o cadastro
  // do cliente (accuracy<=60m); nunca bloqueia a confirmação em si.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  accuracy?: number;

  // M4 — pagamento condicional: método escolhido na folha de chegada. SÓ chega
  // quando o cliente é 'aberto' (chips visíveis) e o módulo financeiro está ON;
  // costumeiro/OFF nunca manda. Aceito e persistido (receiptMethod); a criação
  // do charge é M6 — aqui só registra o desfecho.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  // 04/08 — 'cartao' aditivo (maquininha); app antigo nunca manda.
  @IsIn(['pix', 'dinheiro', 'cartao', 'fiado'])
  receiptMethod?: string; // pix | dinheiro | cartao | fiado

  // M4 — quantidades efetivamente entregues (stepper por item). Best-effort:
  // se ausente, mantém a qtdPrevista de cada EntregaItem (M6 reconcilia).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmarEntregaItemDto)
  itens?: ConfirmarEntregaItemDto[];

  // F2 (08/07) — produtos NOVOS incluídos/trocados na folha de chegada (não
  // previstos). SÓ productId + qtd — o preço NUNCA vem daqui (regra de ouro): o
  // serviço resolve o valorUnit pelo catálogo (Product company-scoped) ou pelo
  // ClienteProduto.precoAcordado desse cliente+produto, se existir. Whitelist do
  // DTO garante que nenhum campo de preço passe (ValidationPipe forbidNonWhitelisted).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmarNovoItemDto)
  novosItens?: ConfirmarNovoItemDto[];

  // M8 (offline-first) — chave de idempotência gerada no celular (uuid) antes de
  // enfileirar a confirmação. O reenvio da MESMA confirmação (mesma key, típico da
  // fila offline drenando após reconectar) NÃO dispara efeito 2× (WhatsApp/charge):
  // se a key já foi gravada na Entrega, o serviço devolve o desfecho anterior sem
  // re-executar. Opcional: sem key = comportamento clássico (idempotência por status).
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;

  // Comprovantes já enviados pelo endpoint multipart. O backend valida empresa,
  // entrega, tipo, status e (para entregador) o ator que fez o upload.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  comprovanteFotoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  comprovanteAssinaturaId?: string;

  // Código de 6 dígitos gerado pelo admin. O valor esperado não fica em claro.
  @IsOptional()
  @IsString()
  @MaxLength(12)
  comprovanteCodigo?: string;

  // BOTÃO "PAGO" DA CHEGADA (22/07) — o dono pediu que Pago cobrisse o VALOR
  // TOTAL (dívida velha + entrega de hoje), não só a entrega do dia. Sem isto o
  // app quitava só a cobrança nova e a dívida antiga ficava órfã no financeiro.
  // Só tem efeito junto de receiptMethod imediato (pix|dinheiro): fiado não quita.
  @IsOptional()
  @IsBoolean()
  quitarAberto?: boolean;

  // CARIMBO DE CHEGADA (06/08, etapa B do PR06082026) — hora em que o entregador
  // CHEGOU na parada, medida no CELULAR quando a folha de chegada abriu.
  //
  // Por que viaja no desfecho em vez de ter endpoint próprio: a folha de chegada
  // tem que abrir SEM REDE. Um POST no toque do "Cheguei" ou morre offline (e o
  // carimbo se perde) ou vira mais uma fila offline pra manter. O desfecho já é
  // idempotente e já drena da fila — a chegada pega carona nele e chega junto.
  //
  // 🔴 RELÓGIO DE CLIENTE NÃO É FONTE DE VERDADE. O servidor apara (nunca futuro,
  // nunca antes de a entrega existir) e a 1ª gravação vence. Ver aparaChegada().
  @IsOptional()
  @IsString()
  @MaxLength(40)
  arrivedAt?: string;
}

// Um item confirmado no stepper (id do EntregaItem + qtd entregue).
export class ConfirmarEntregaItemDto {
  @IsString()
  @MaxLength(60)
  id!: string;

  @IsInt()
  @Min(0)
  @Max(9999)
  qtdEntregue!: number;

  // PREÇO DE HOJE (22/07, pedido do dono: "clicou em cima do valor, altera —
  // MAS É O VALOR ATUAL: se ontem vendeu por 10 e hoje é 50, vai ficar 60").
  // ABERTURA CONSCIENTE da regra de ouro do preço: aqui o preço VEM do aparelho
  // porque quem negocia na porta é o entregador. O alcance é UMA entrega: grava
  // no EntregaItem DESTA entrega e nada mais — não toca Product.precoCatalogo
  // nem ClienteProduto.precoAcordado, e não reescreve entrega passada. Ausente =
  // comportamento de sempre (preço que já estava no item).
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999)
  valorUnit?: number;
}

// F2 (08/07) — um produto NOVO adicionado/trocado na folha de chegada. Só
// productId + qtd; o preço é resolvido pelo servidor (Product/ClienteProduto),
// NUNCA aceito daqui — não existe campo de preço nesta classe (whitelist estrito).
export class ConfirmarNovoItemDto {
  @IsInt()
  productId!: number;

  @IsInt()
  @Min(0)
  @Max(9999)
  qtdEntregue!: number;

  // Mesma abertura do ConfirmarEntregaItemDto.valorUnit (preço de HOJE, escopo
  // de UMA entrega). Ausente = preço de catálogo, como sempre foi.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999)
  valorUnit?: number;
}

// ── Cancelar entrega ─────────────────────────────────────────────────────────
export class CancelarEntregaDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;

  // CARIMBO DE CHEGADA (06/08) — "não entregue"/"não atendeu" TAMBÉM é desfecho
  // de visita: o entregador chegou lá. Sem este campo aqui, a parada visitada e
  // não entregue ficaria sem hora de chegada — justamente a que mais interessa
  // quando o cliente reclama. Mesmo tratamento do confirmar (ver ali).
  @IsOptional()
  @IsString()
  @MaxLength(40)
  arrivedAt?: string;
}

// ── Operação por entregador ─────────────────────────────────────────────────
export class AtribuirEntregaDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  entregadorId?: number | null;
}

export class TipoComprovanteDto {
  @IsString()
  @IsIn(['foto', 'assinatura'])
  tipo!: 'foto' | 'assinatura';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clientKey?: string;
}

// ── LOGÍSTICA-MOBILE M2 — vínculo produto×cliente ────────────────────────────
// "O cliente X leva N do produto Y, neste local, pelo preço P."
//
// 🔴 27/07 (ordem do dono, SEM LEGADO): **dia da semana NÃO existe em produto.**
// O dia é do CLIENTE (a visita) e se define em UM lugar só —
// `PATCH /logistica/clientes/:id/dias`. Motivo real (medido em prod 27/07): com
// o dia preso ao produto, dois produtos do mesmo cliente podiam cair em dias
// diferentes, a contagem do dia virava contagem de produto e "terça com 7
// clientes" aparecia como vazia.
//
// 🔴 F2 (09/08): CADÊNCIA TAMBÉM SAIU DAQUI. `diasSemana`/`frequenciaDias`/
// `proximaData` do `ClienteProduto` eram a agenda V1; a agenda mora inteira em
// `LogisticaPlanoEntrega`. `frequenciaDias` e `proximaData` seguem DECLARADOS
// abaixo e são IGNORADOS pelo serviço — o `ValidationPipe` global roda com
// `forbidNonWhitelisted`, então apagar o campo daria 400 na cara de cliente já
// publicado (tela /contatos, APK em campo). Quem ainda mandar sai no log.
// PENDÊNCIA F5: tirar o campo da tela /contatos e só então destes DTOs.
export class CreateClienteProdutoDto {
  @IsString()
  @MaxLength(60)
  customerProfileId!: string;

  @IsInt()
  productId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  qtdPadrao?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precoAcordado?: number;

  /** @deprecated ACEITO E IGNORADO (F2) — cadência mora em LogisticaPlanoEntrega. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  frequenciaDias?: number;

  /** @deprecated ACEITO E IGNORADO (F2) — cadência mora em LogisticaPlanoEntrega. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  proximaData?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  // MULTILOCAL (10/07) — em qual LocalEntrega este vínculo é entregue (default =
  // local principal do cliente). O serviço valida que o local é do mesmo cliente.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  localId?: string;
}

// Update: todos opcionais (PATCH parcial). customerProfileId/productId NÃO mudam
// (a identidade do vínculo) — para trocar produto/cliente, cria outro vínculo.
export class UpdateClienteProdutoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  qtdPadrao?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precoAcordado?: number;

  /** @deprecated ACEITO E IGNORADO (F2) — cadência mora em LogisticaPlanoEntrega. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  frequenciaDias?: number;

  // (sem `diasSemana`: dia é do CLIENTE — ver o cabeçalho do Create acima)

  /** @deprecated ACEITO E IGNORADO (F2) — cadência mora em LogisticaPlanoEntrega. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  proximaData?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  // MULTILOCAL (10/07) — trocar o local de entrega deste vínculo (valida cliente).
  @IsOptional()
  @IsString()
  @MaxLength(60)
  localId?: string;
}

// ── LOGÍSTICA-MOBILE M2 — gerar entregas do dia ──────────────────────────────
export class GerarDiaDto {
  // ISO date do dia a gerar; se omitido = hoje.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;
}

// ── LOGÍSTICA-MOBILE M3 — motor de rota + ETA ────────────────────────────────
// Planejar: ordena a rota do dia (NN+2-opt Haversine), grava rotaOrdem/etaAt e
// devolve a previsão de término. origemLat/Lng = GPS do entregador (ponto de
// partida); se ausente, começa pela 1ª parada com coordenada.
export class PlanejarRotaDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  origemLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  origemLng?: number;

  // Quando o operador monta uma rota por dia(s), só essas entregas entram no
  // cálculo. As demais continuam agendadas para uma próxima montagem.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  deliveryIds?: string[];

  // PR18072026 — "Minha ordem": ids na ordem que o entregador arrastou na
  // tela. Presentes = ordem dada; ausentes = apêndice no fim. Pula NN+2-opt.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  ordemManual?: string[];
}

// Iniciar: re-planeja com a origem atual e marca a 1ª parada em rota.
export class IniciarRotaDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  origemLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  origemLng?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  deliveryIds?: string[];

  // PR18072026 — mesmo contrato do PlanejarRotaDto acima.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  ordemManual?: string[];
}

// S3 (25/07, PR25072026-ROTA-CONFERIDA) — conferir: DRY-RUN do motor de rota (mesmo
// contrato de entrada do planejar). S5 (furo achado pela própria S4): ganhou
// `ordemManual` — sem ele, uma rota com ordem manual ativa era reconferida na ordem que
// o MOTOR produziria hoje, não a ordem que o entregador vai RODAR de verdade (ver
// LogisticaConferenciaService.conferir, que agora usa planRouteManual quando presente,
// mesmo desvio do planejar).
export class ConferirRotaDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  origemLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  origemLng?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  deliveryIds?: string[];

  // S5 — mesma validação do ordemManual de IniciarRotaDto/PlanejarRotaDto.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  ordemManual?: string[];
}

// SANITIZADOR (27/07) — correção em massa do pop-up do Gerenciador.
// `executar` ausente/false = só o placar (classifica, não escreve nada).
export class SanitizarRotaDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;

  @IsOptional()
  @IsBoolean()
  executar?: boolean;

  /**
   * Quantos alvos JÁ TENTADOS pular (27/07 — anti-loop). O sanitizador não tem cursor
   * por design: o curado sai da fila sozinho e a próxima chamada pega os seguintes.
   * Com a regra estrita (bairro + porta exata) a maioria NÃO cura, então os mesmos 12
   * ficavam eternamente na frente e o app repetia a chamada pra sempre — loop medido
   * em produção. Quem tentou e não curou é PULADO na rodada seguinte.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  pular?: number;
}

// ── PR17072026 Onda 1 — encerrar rota (transacional, tudo-ou-nada) ───────────
// Substitui o loop `cancelar` por parada: abertas (agendada/em_rota) voltam
// para PENDÊNCIA (nunca cancelamento); entregues/canceladas ficam intocadas.
// Ver docs/PLANEJAMENTOS/PR17072026/01-backend-encerrar-rota.md (contrato
// congelado). motivo é só para log/auditoria — não persiste em nenhuma tabela.
export class EncerrarRotaDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}

// ── PR18072026 Onda 1 — limpar dia (transacional, CANCELA as abertas) ────────
// Mesma guarda/shape do EncerrarRotaDto — decisão do dono (18/07): "Limpar dia"
// cancela as entregas abertas (diferente de encerrar, que pausa p/ pendência).
export class LimparDiaDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}

// ── LOGÍSTICA-MOBILE M5 — regras do admin (LogisticaConfig) ───────────────────
// PATCH parcial da config da empresa: template do aviso + toggles + params de rota.
// Só campos declarados passam (whitelist). companyId NUNCA vem do body (JWT).
export class UpdateLogisticaConfigDto {
  // ── 26/07 — `trackingAtivo` e `modoRotaPadrao` NÃO MORAM MAIS AQUI ───────────
  // Eles migraram para o UpdateLogisticaRouteModeDto (PATCH /logistica/config/
  // modo-rota). Motivo: o APK VELHO já instalado em campo ainda mandava esses
  // dois campos neste PATCH e, se quem estivesse logado fosse o dono da conta,
  // a troca passava. Fora daqui, o ValidationPipe global (whitelist +
  // forbidNonWhitelisted, main.ts) devolve 400 pro payload antigo ANTES de
  // qualquer código rodar — a porta fecha por CONTRATO, sem depender de
  // User-Agent (string de cliente é forjável). Não reintroduzir os campos.
  @IsOptional()
  @IsBoolean()
  avisoWhatsEnabled?: boolean;

  // Template do aviso "entregue". Variáveis: {saudacao} {cliente} {itens} {qtd} {produto}.
  // Vazio → volta ao fallback (a mensagem fixa do N6).
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  templateAviso?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(5000)
  raioChegadaM?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  velocidadeMediaKmH?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  tempoParadaMin?: number;

  // SENTINELA (03/08) — réguas do vigia. 0 = desliga aquela pergunta.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  sentinelaSemSinalMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  sentinelaParadoMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  sentinelaAtrasoMin?: number;

  @IsOptional()
  @IsBoolean()

  @IsOptional()
  @IsBoolean()
  cobrancaNaEntrega?: boolean;

  // W1-BACKEND (18/07) — toggle "Cobrança simples na chegada" do app do entregador.
  @IsOptional()
  @IsBoolean()
  cobrancaSimples?: boolean;

  // MODO PASSEIO (29/07) — liberação do modo pra equipe (operacional, padrão
  // do cobrancaSimples: @Admin() do PATCH já basta).
  @IsOptional()
  @IsBoolean()
  passeioEquipe?: boolean;

  @IsOptional()
  @IsBoolean()
  moduloFinanceiroAtivo?: boolean;

  // PR18072026 W-A — módulo Financeiro (3 níveis) + painel Avançado. Todos
  // operacionais (mesmo padrão do cobrancaSimples): não exigem billing owner.
  @IsOptional()
  @IsBoolean()
  aceitaNaHora?: boolean;

  @IsOptional()
  @IsBoolean()
  aceitaMensal?: boolean;

  @IsOptional()
  @IsBoolean()
  aceitaFiado?: boolean;

  @IsOptional()
  @IsBoolean()
  precoPorClienteAtivo?: boolean;

  @IsOptional()
  @IsBoolean()
  cobrancaAutomatica?: boolean;

  @IsOptional()
  @IsBoolean()
  moduloRecoveryAtivo?: boolean;

  // TASK 4 — dias da semana em que a empresa trabalha. CSV ISO "1,2,3,4,5,6,7"
  // (1=segunda…7=domingo); validação de conteúdo (1..7, dedupe+sort) no serviço.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  diasTrabalho?: string;

  // F1 — Pix direto do tenant (BR Code gerado no app, sem MP). Vazio limpa/desliga.
  @IsOptional()
  @IsString()
  @MaxLength(77)
  pixChave?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  pixNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  pixCidade?: string;

  // AVISO-CHEGANDO (11/07) — toggle global INDEPENDENTE do avisoWhatsEnabled
  // (entregue): a empresa liga um, o outro, os dois ou nenhum. DEFAULT false.
  @IsOptional()
  @IsBoolean()
  avisoChegandoEnabled?: boolean;

  // Template do aviso "chegando" (~500m). Mesmas variáveis do template "entregue"
  // ({saudacao} {cliente} {itens} {qtd} {produto} {empresa}). Vazio → fallback fixo.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  avisoChegandoTemplate?: string;

  // Raio do "tô chegando" em metros — clamp 100..2000 no serviço (default 500).
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(2000)
  avisoChegandoDistanciaM?: number;

  // S2 COBRANÇA-WHATS (11/07) — toggle POR TENANT da cobrança por WhatsApp
  // (aviso ao lançar + lembrete no vencimento). Gravar é livre; efeito só com a
  // flag global HBX_COBRANCA_WHATS_ENABLED ligada (default OFF, dormente).
  @IsOptional()
  @IsBoolean()
  cobrancaWhatsAtiva?: boolean;

  // F4 (PR07082026-PROSPECTOR-CNPJ, 07/08) — "organize os 3 disparos": a cobrança
  // tinha toggle e MENSAGEM FIXA em código; agora tem texto cadastrado, com as
  // MESMAS variáveis e o MESMO tratamento do avisoChegandoTemplate. Vazio →
  // fallback fixo (a mensagem de sempre). Comercial: exige billing owner no serviço.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cobrancaWhatsTemplate?: string;

  // ── PROSPECTOR CNPJ (PR07082026 F0, 07/08) ─────────────────────────────────
  // MESMO shape do trio avisoChegando (toggle + template + condição). Todos
  // OPERACIONAIS: @Admin() do PATCH basta, não exigem billing owner (padrão do
  // passeioEquipe). Gravar é livre; efeito só com a flag global
  // HBX_PROSPECTOR_ENABLED ligada (default OFF, dormente).
  //
  // 🔴 `prospectorAutomacaoAtiva`/`prospectorAutomacaoMaxDia` NÃO MORAM AQUI —
  // disparo automático é COBRADO como automação (decisão nº8 do dono) e só entra
  // pelo endereço do Master (PUT /logistica/master/company/:id/prospector-automacao,
  // MasterGuard). Fora daqui, o ValidationPipe global (whitelist +
  // forbidNonWhitelisted) devolve 400 pra quem tentar por este PATCH, e o serviço
  // ainda tem o cinto-e-suspensório com 403. Não reintroduzir os campos.
  @IsOptional()
  @IsBoolean()
  prospectorAtivo?: boolean;

  // Mensagem cadastrada do prospector. Mesmas variáveis do renderTemplateAviso.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prospectorTemplate?: string;

  // Raio do corredor em metros — clamp 50..500 no serviço (default 150, o medido).
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(500)
  prospectorRaioM?: number;

  // Quantas empresas acendem sozinhas no dia — clamp 1..8 no serviço (default 4).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  prospectorMaxDia?: number;

  // Liberação pra EQUIPE (motorista), mesma regra do passeioEquipe.
  @IsOptional()
  @IsBoolean()
  prospectorEquipe?: boolean;

  // ── ITEM 9 DO DONO (07/08) — desligar módulos do app PELO DESKTOP ──────────
  // CSV das chaves desativadas: fechamento,clientes,produtos,chat,ajustes.
  // Validação de conteúdo (allowlist, dedupe+sort, vazio→null) no serviço —
  // mesmo desenho do diasTrabalho. 🔴 "rota" é descartada e nunca gravada.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  appModulosDesativados?: string;

  // S3 RESUMO-DIÁRIO (11/07) — toggle POR TENANT do resumo do dono no WhatsApp
  // + hora LOCAL do envio (0-23). Gravar é livre; efeito só com a flag global
  // HBX_RESUMO_DIARIO_ENABLED ligada (default OFF, dormente).
  @IsOptional()
  @IsBoolean()
  resumoDiarioAtivo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  resumoDiarioHora?: number;

  // S6 PORTAL-PEDIDO (11/07) — toggle POR TENANT do pedido público pelo link
  // /pedido/<token>. Gravar é livre; efeito só com a flag global
  // HBX_PEDIDO_PUBLICO_ENABLED ligada (default OFF, dormente). O TOKEN não é
  // patchável (whitelist) — só nasce/roda pelos endpoints pedido-publico/*.
  @IsOptional()
  @IsBoolean()
  pedidoPublicoAtivo?: boolean;

  // Requisitos combináveis: nenhum, um, dois ou os três. Defaults false no
  // schema mantêm tenants existentes sem bloqueio após a migration.
  @IsOptional()
  @IsBoolean()
  comprovanteFotoObrigatoria?: boolean;

  @IsOptional()
  @IsBoolean()
  comprovanteAssinaturaObrigatoria?: boolean;

  @IsOptional()
  @IsBoolean()
  comprovanteCodigoObrigatorio?: boolean;

  // PR27072026 F2 — modo de tratamento do devedor na rota de hoje. OPERACIONAL
  // (não exige billing owner, mesmo padrão do cobrancaAutomatica) + gate de
  // nível ADVANCED+ pra COBRANCA/EXCLUIR (NORMAL sempre passa, mesmo no BASIC —
  // ver LogisticaConfigService).
  @IsOptional()
  @IsIn(['COBRANCA', 'EXCLUIR', 'NORMAL'])
  devedorNaRota?: 'COBRANCA' | 'EXCLUIR' | 'NORMAL';
}

// ── 26/07 — MODO DA ROTA (Simples × Rastreada) EM ENDEREÇO PRÓPRIO ───────────
// PATCH /logistica/config/modo-rota. Endpoint separado de propósito: é a ÚNICA
// porta da escolha comercial do modo, e o bundle do APK (nem o velho em campo,
// nem o novo) chama esta rota — o celular não decide modo comercial (ordem do
// dono 26/07). Quem liga é o administrador NO PC, em /logistica/config.
// Admin-only no controller + billing owner no serviço, como era antes.
export class UpdateLogisticaRouteModeDto {
  @IsOptional()
  @IsBoolean()
  trackingAtivo?: boolean;

  @IsOptional()
  @IsIn(['ESSENTIAL', 'TRACKED'])
  modoRotaPadrao?: 'ESSENTIAL' | 'TRACKED';
}

// ── MODO PASSEIO (29/07) — POST /logistica/passeio/iniciar ──────────────────
// tourId nasce no APK (H.uuid) e é a chave de idempotência do débito: retry de
// rede com o mesmo id nunca cobra 2×. Formato exato validado no serviço.
export class IniciarPasseioDto {
  @IsString()
  @MaxLength(80)
  tourId!: string;
}

// ── PR27072026 F1 — NÍVEL DO PLANO (Basic/Advanced/Full) ────────────────────
// PUT /logistica/master/company/:companyId/nivel. Endereço PRÓPRIO, só Master
// (MasterGuard no controller — mesmo motivo do modo-rota acima: fechar a porta
// por CONTRATO). Aplicar grava logisticaNivel E o preset de toggles da matriz
// do plano (LogisticaConfigService.setNivel) num gesto só — a UI segue livre
// pra ajustar toggle a toggle depois (preset é atalho, não algema).
export class SetLogisticaNivelDto {
  // ROTA v2 F2b (10/08) — CREDITO é o 4º nível: "Rota Avulsa" (débito por dia
  // rodado, sem mensalidade), o berço de toda empresa nova.
  @IsIn(['BASIC', 'ADVANCED', 'FULL', 'CREDITO'])
  nivel!: string;

  // ROTA v2 F2c (10/08) — override de ASSENTOS por empresa, na MESMA ficha que
  // já troca o nível (1 PUT, 1 tela). Ausente = não mexe (mantém o que já tinha
  // ou o default do nível); presente = grava o override. Range 1–999 é a mesma
  // régua do sanitize do catálogo de níveis (logistica-nivel-catalog.ts).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  logisticaAssentos?: number;
}

// ── PROSPECTOR: AUTOMAÇÃO COBRADA (PR07082026, decisão nº8 do dono) ──────────
// PUT /logistica/master/company/:companyId/prospector-automacao. Endereço
// PRÓPRIO, só Master (MasterGuard) — MESMO motivo do nível acima: o disparo
// automático do prospector é COBRADO como automação, então o tenant não liga
// sozinho nem por engano nem por payload forjado. Os 2 campos são opcionais
// (PATCH parcial); corpo vazio devolve 400 no serviço ("Nada para alterar").
export class SetProspectorAutomacaoDto {
  @IsOptional()
  @IsBoolean()
  prospectorAutomacaoAtiva?: boolean;

  // Teto de disparos automáticos por dia. 0 = sem cota (nada sai sozinho).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  prospectorAutomacaoMaxDia?: number;
}

// Toggle "avisar entrega" de UM cliente (2º nível de silêncio, soma com o global).
export class SetAvisarClienteDto {
  @IsBoolean()
  avisar!: boolean;
}

// ── NÚCLEO-CRM R2 — fechar o mês (modelo mensal) ─────────────────────────────
// Agrupa as entregas 'aguardando_fechamento' por cliente e cria 1 charge. Ambos
// opcionais: clienteId → fecha só ele; mesRef ("YYYY-MM") → mês de referência
// (default hoje). companyId NUNCA vem do body (JWT). ADMIN-only no controller.
export class FecharMesDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  clienteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  mesRef?: string; // "YYYY-MM"
}

// ── DIAS DE ENTREGA DO CLIENTE (27/07, ordem do dono) ────────────────────────
// O ÚNICO lugar do sistema que define dia da semana. `dias` = ISO 1(seg)…7(dom);
// lista vazia = cliente sem dia fixo (some da agenda semanal, os vínculos ficam).
export class UpdateDiasClienteDto {
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  dias!: number[];
}

// ── LOGÍSTICA-MOBILE M6 — editar a forma de pagamento do cliente (na ficha) ───
// PATCH parcial dos DOIS eixos do contrato (regra do dono 04/07, NÃO misturar):
// formaPagamento (COMO/QUANDO paga) + contabilizar (entra na contabilidade?) +
// metodoPadrao (pix|dinheiro, só p/ na_hora) + diaFechamento (modelo mensal).
// companyId NUNCA vem do body (JWT). ADMIN-only no controller. Não dispara nada.
export class UpdateFinanceiroClienteDto {
  // aberto | mensal | na_hora | pendura. Enum travado no DTO (rejeita fora do conjunto);
  // o serviço ainda normaliza/valida por segurança.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsIn(['aberto', 'mensal', 'na_hora', 'pendura'])
  formaPagamento?: string;

  // pix | dinheiro (só p/ na_hora). '' limpa o método. Enum travado no DTO.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsIn(['pix', 'dinheiro', ''])
  metodoPadrao?: string;

  @IsOptional()
  @IsBoolean()
  contabilizar?: boolean;

  // Dia do mês em que fecha a fatura (modelo mensal). 1..31 (clampado no serviço).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaFechamento?: number;

  // F1 — teto de fiado do cliente (R$). null limpa (sem limite). O app só AVISA
  // o entregador quando o saldo em aberto estoura — nunca bloqueia a entrega.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  limiteFiado?: number | null;

  // S2 COBRANÇA-WHATS (11/07) — opt-out POR CLIENTE do aviso de cobrança no zap
  // (independente do avisarEntrega). Só grava o toggle; não dispara nada.
  @IsOptional()
  @IsBoolean()
  avisarCobranca?: boolean;
}

// ── LOGÍSTICA-MOBILE M7 — recovery opt-in (varrer cobranças vencidas) ─────────
export class VarrerRecoveryDto {
  // Data de corte (ISO YYYY-MM-DD); charges com dueDate < esse dia entram. Omitido = hoje.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;
}

// ── PR18072026 W1 — rota-modelo (roteiro salvo, aplicado client-side) ────────
// Uma parada do molde: cliente + local opcional (mesmo par que ordemManual usa
// pra montar a lista de aplicação — o app resolve id→ordemManual na hora de
// aplicar o modelo; não existe endpoint "aplicar" no backend).
//
// 🔴 F3 (09/08) — `itens` SAIU DA PORTA. O modelo de rota é só ORDEM: o que a
// visita leva mora no PLANO (`LogisticaPlanoEntrega`), que é onde o dono
// combina. O snapshot aqui era cópia byte a byte do `PlanoEntregaItem` e só
// servia pra envelhecer sozinho. O APK sempre mandou apenas cliente+porta; o
// desktop mandava `itens` e parou no mesmo commit (route-builder.tsx).
export class RotaModeloParadaDto {
  @IsString()
  @MaxLength(80)
  customerProfileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  localId?: string;
}

export class CreateRotaModeloDto {
  @IsString()
  @MaxLength(80)
  nome!: string;

  // 1(segunda)..7(domingo); omitido/null = sem dia fixo.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  diaSemana?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RotaModeloParadaDto)
  paradas?: RotaModeloParadaDto[];
}

// PATCH parcial — os MESMOS campos, todos opcionais.
export class UpdateRotaModeloDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nome?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  diaSemana?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RotaModeloParadaDto)
  paradas?: RotaModeloParadaDto[];
}

// PR20072026-ROTA-SALVA F2 — POST /rota-modelos/:id/gerar: materializa a lista
// EXATA do modelo (ver LogisticaRotaModeloService.gerar). date opcional; se
// omitido = hoje (mesmo contrato do GerarDiaDto).
export class GerarRotaModeloDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  date?: string;
}

// ── PR18072026 W1 — façade de produtos sob /logistica (allowlist do APK) ─────
// O app do entregador só fala com endpoints `logistica/*` (isMobileEndpointAllowed
// no NativeApiClient.kt) — este é o par POST/PATCH que faltava pra editar o
// catálogo sem sair do prefixo. Arquivar (ativo=false) mapeia pra Product.status
// ('active'|'archived') — o Product não tem coluna `ativo` própria.
export class CreateProdutoDto {
  @IsString()
  @MaxLength(140)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  unidade?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  preco?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  estoque?: number;
}

export class UpdateProdutoDto {
  @IsOptional()
  @IsString()
  @MaxLength(140)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  unidade?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  preco?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  estoque?: number;

  // false arquiva (status='archived', some do picker); true reativa.
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/**
 * ITEM 1 (28/07, ordem do dono) — checagem de endereco ANTES de montar a rota.
 * `dias` = dias da semana que vao entrar na rota; `dates` = as datas exatas que o
 * app vai montar (mesma lista que ele manda no prepare) — paralelas a `dias`.
 * Nada aqui materializa entrega nem toca em credito.
 */
export class ChecarEnderecosDto {
  @IsOptional()
  @IsArray()
  dias?: number[];

  @IsOptional()
  @IsArray()
  dates?: string[];
}

/** Item 1 — "remover todos os clientes e o dia salvo deles" (ordem do dono). */
export class TirarDoDiaDto {
  @IsOptional()
  @IsArray()
  dias?: number[];

  @IsOptional()
  @IsArray()
  customerProfileIds?: string[];
}

/**
 * COCKPIT (03/08) — recado do escritório pro motorista.
 * `paraUserId` ausente/null = broadcast pra todo mundo com trabalho hoje.
 */
export class EnviarRecadoDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  paraUserId?: number | null;

  /**
   * APARELHO DO TURNO (08/08) — em qual celular o recado cai. A tela manda já
   * preenchido com o aparelho do turno; ausente = o servidor resolve sozinho.
   * Ignorado no broadcast (lá cada pessoa tem o aparelho dela).
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;

  @IsString()
  @MaxLength(500)
  texto!: string;

  @IsOptional()
  @IsIn(['normal', 'urgente', 'alarme'])
  nivel?: 'normal' | 'urgente' | 'alarme';

  @IsOptional()
  @IsString()
  @MaxLength(10)
  date?: string;
}

/** APK: resposta do motorista no mesmo fio. */
export class ResponderRecadoDto {
  @IsString()
  @MaxLength(500)
  texto!: string;

  /** Identidade estável gerada pelo aparelho para retry/toque duplo. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  clientMessageId?: string;

  /** Recado que será confirmado atomicamente junto com a resposta. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  recadoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  date?: string;
}

/** APK: "abri a lista" — marca visto sem exigir o Entendi do portão. */
export class VistoRecadoDto {
  @IsArray()
  @ArrayMaxSize(50)
  ids!: string[];
}

/** APK: confirma que o lote chegou e foi persistido no aparelho. */
export class RecebidosRecadoDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids!: string[];
}

/**
 * PULSO DO APP (PR04082026-PULSO-DO-APP, 04/08) — body do poll de 5s dos
 * recados. O aparelho manda de carona o NOME da tela aberta; nenhuma
 * requisição nova nasce por causa disso.
 *
 * 🔴 `@Allow()` e não `@IsString()/@MaxLength()` DE PROPÓSITO: com
 * `forbidNonWhitelisted` global, campo não declarado vira 400 — mas campo
 * declarado com validador vira 400 do MESMO jeito quando o valor não bate.
 * Os dois derrubariam o poll do app, que é a campainha da rota. Aqui o
 * contrato é: aceita QUALQUER coisa e o serviço decide o que presta
 * (`sanitizarTela`); lixo é ignorado em silêncio, o poll responde 200 sempre.
 * APK velho não manda o campo — `undefined` também é caminho normal.
 */
export class PulsoRecadosDto {
  @Allow()
  tela?: unknown;

  /**
   * VERSÃO DO CONTRATO DE RESPOSTA (PR05082026-VER-TELA, 05/08).
   *
   * Este poll respondia — e continua respondendo — uma LISTA CRUA de recados.
   * Envelopar a resposta pra caber o espelho quebraria todo APK já instalado no
   * mundo. Então quem pede o envelope é o APP: `v: 2` no corpo significa "eu sei
   * ler `{recados, espelho, ...}`". Sem `v`, a resposta é a lista de sempre,
   * byte por byte. É o mesmo padrão de content negotiation, só que no corpo.
   */
  @Allow()
  v?: unknown;

  /**
   * ERROS QUE O CLIENTE VIU (V3) — só chega quando há novidade; poll normal não
   * carrega o campo. Mesma regra do `tela`: validador estrito aqui derrubaria a
   * campainha da rota por causa de um enfeite de suporte.
   */
  @Allow()
  erros?: unknown;
}

/**
 * VER TELA (PR05082026-VER-TELA V2, 05/08) — um QUADRO do espelho do app.
 *
 * Mesmo contrato frouxo do poll (`@Allow`), pela mesma razão: o espelho é
 * suporte, e um 400 aqui vira ruído no aparelho de quem está trabalhando. O que
 * presta é decidido no serviço (teto de tamanho, janela aberta, empresa do JWT).
 * A marcação chega SANITIZADA do aparelho — sem script e com digitação
 * mascarada; quem mascara é o app.js, antes de sair de lá.
 */
export class EspelhoQuadroDto {
  @Allow()
  tela?: unknown;

  @Allow()
  html?: unknown;

  /** Tema e classes do body — sem eles o espelho renderiza no tema errado. */
  @Allow()
  tema?: unknown;

  @Allow()
  bodyClass?: unknown;

  /** O CSS do app viaja 1× por versão, só quando o servidor pede. */
  @Allow()
  css?: unknown;
}

/**
 * COCKPIT (03/08) — atribuição em LOTE. Nasceu da tela do dono com 51 paradas
 * órfãs: uma por uma eram 51 arrastadas. `entregadorId` null desatribui (mesma
 * semântica do PATCH de uma entrega só).
 */
export class AtribuirLoteDto {
  @IsArray()
  @ArrayMaxSize(300)
  ids!: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  entregadorId?: number | null;
}

// ── VENDER POR TOQUE no cliente, sem rota (PR04082026) ──────────────────────
export class VenderItemDto {
  @IsInt()
  @Min(1)
  productId!: number;

  @IsInt()
  @Min(1)
  @Max(9999)
  quantidade!: number;

  // PREÇO COMBINADO COM ESTE CLIENTE (05/08) — só chega quando o dono TOCOU no
  // valor na folha da venda. Mesma abertura consciente do
  // ConfirmarEntregaItemDto.valorUnit (quem negocia na porta é quem vende), com
  // UMA diferença deliberada: na venda por toque o preço editado FICA
  // (ClienteProduto.precoAcordado), porque foi isso que o dono pediu — "ficar o
  // preço fixo até a próxima". Ausente = o servidor resolve sozinho
  // (precoAcordado > catálogo > precoPadrao) e NADA no cadastro é reescrito.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999)
  valorUnit?: number;
}

/** Apagar a venda errada do dia (segurar pressionado na linha do dia). */
export class ApagarVendaDto {
  @IsString()
  @MaxLength(60)
  entregaId!: string;
}

export class VenderGpsDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  accuracy?: number;
}

export class VenderDto {
  @IsString()
  @MaxLength(60)
  clienteId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  localId?: string;

  // O preço do item é OPCIONAL e só existe quando o dono editou na tela; sem
  // ele o serviço resolve pela régua de sempre (ver VenderItemDto).
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => VenderItemDto)
  itens!: VenderItemDto[];

  // 'pagou' exige metodo; 'deveu' vira fiado (charge pendente, se financeiro ON).
  @IsString()
  @IsIn(['pagou', 'deveu'])
  desfecho!: string;

  @IsOptional()
  @IsString()
  @IsIn(['dinheiro', 'pix', 'cartao'])
  metodo?: string;

  // GPS calado — realimenta o pino (<=60m); ausência nunca trava a venda.
  @IsOptional()
  @ValidateNested()
  @Type(() => VenderGpsDto)
  gps?: VenderGpsDto;

  // Número da casa, opcional, só quando o cadastro não tem (a venda nunca trava).
  @IsOptional()
  @IsString()
  @MaxLength(20)
  numero?: string;

  // AS 7 PÁGINAS (05/08) — a página aberta quando ele registrou (1=seg..7=dom).
  // Ausente (APK velho) = o dia real em SP. É etiqueta de organização, nunca data
  // de dinheiro: deliveredAt segue "agora" sempre.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  diaSemana?: number;

  @IsString()
  @MaxLength(80)
  idempotencyKey!: string;
}

// FECHAR O DIA (05/08): "qual dia podemos registrar?" — o dia escolhido
// registra a página e salva a "Rota de <dia>" nas Rotas salvas.
export class FinalizarDiaDto {
  @IsInt()
  @Min(1)
  @Max(7)
  dia!: number;
}
