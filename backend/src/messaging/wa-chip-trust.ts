/**
 * CONFIANÇA DO CHIP — o teto de primeiro contato deixa de ser um número fixo e
 * passa a ser CONQUISTADO (ordem do dono, 03/08/2026).
 *
 * Cena que ele descreveu: *"os novos serão apenas 3, e este limite vai aumentando
 * conforme recebe resposta, inicia conversa... 1 conversa frutífera já gera +1
 * limite"* — e o chip antigo dele (…884) fica nos 10, espalhados das 08:00 às 18:00.
 *
 * Antes disto o teto era `HBX_WA_COLD_MAX_PER_DAY`, UM número por EMPRESA. Com 5
 * vendedoras e 5 chips na mesma empresa, os cinco dividiriam a MESMA cota de 10 —
 * dois chips novos zerariam o dia do chip bom. O teto é do CHIP, não da empresa.
 *
 * ── Por que "conversa que respondeu" é a régua certa ────────────────────────
 * O que a Meta declara observar em número novo é bloqueio/denúncia de quem recebe
 * — ou seja, o oposto de gente respondendo. Um chip com muita gente conversando de
 * volta é, por definição, um chip que as pessoas querem. Então a mesma medida que
 * o dono quer usar pra soltar volume é a que o WhatsApp usa pra confiar. Não é
 * proxy: é o sinal.
 *
 * MEDIDO, NUNCA CRAVADO: o …884 não ganha 10 por estar escrito no código, ganha
 * porque tem 60+ conversas com resposta (conferido em prod 03/08). Chip recém-
 * pareado tem zero e começa em 3. Se um dia o chip bom parar de receber resposta,
 * ele desce sozinho — número cravado nunca desceria.
 *
 * Puro de propósito (zero I/O): quem conta no banco é o gate; aqui só mora a
 * aritmética, que é a parte que precisa de teste barato e determinístico.
 */

/** Teto de quem acabou de parear: 3 de manhã + 3 à tarde (dono, 04/08). */
export const CHIP_TRUST_BASE_PADRAO = 6;
/** Teto máximo da rampa de aquecimento por chip/dia (dono, 04/08: "até 12"). */
export const CHIP_TRUST_MAX_PADRAO = 12;

export interface TetoDoChipInput {
  /** Piso de chip novo (env `HBX_WA_COLD_BASE_PER_CHIP`). */
  base?: number;
  /** Quantas conversas DISTINTAS já responderam para este chip (histórico + hoje). */
  conversasComResposta?: number;
  /** Teto máximo por dia (env `HBX_WA_COLD_MAX_PER_DAY`). */
  max?: number;
  /**
   * O limite/dia que a PESSOA configurou (VendasComercialConfig.dailyLimitPerSender).
   * Chip em aquecimento roda METADE disso (dono, 04/08: "sempre dividir no meio o
   * limite q a pessoa colocar, para chips novos"), respeitando piso e teto da rampa.
   */
  limiteConfigurado?: number;
  /**
   * A pessoa REMOVEU a trava de aquecimento (direito dela, dono 04/08: "ter como
   * remover essa trava... se a pessoa quiser forçar"). Com a trava fora, vale o
   * limite configurado CHEIO — a rampa não opina mais.
   */
  travaRemovida?: boolean;
}

/**
 * base + 1 por conversa que respondeu, limitado ao teto do dia.
 *
 * Conta o histórico INTEIRO (não só hoje) de propósito: o dono pediu que a
 * resposta de hoje solte limite HOJE, e uma janela "só hoje" faria o chip bom
 * amanhecer todo dia valendo a base de novo — o contrário de confiança acumulada.
 *
 * O teto do dia (04/08): metade do limite que a pessoa configurou, nunca abaixo
 * da base (6) nem acima da rampa (12). Sem limite configurado, vale só a rampa.
 * Trava removida = o limite configurado cheio, sem rampa.
 */
export function tetoDoChip(input: TetoDoChipInput = {}): number {
  const max = inteiroSeguro(input.max, CHIP_TRUST_MAX_PADRAO, 1);
  const base = Math.min(max, inteiroSeguro(input.base, CHIP_TRUST_BASE_PADRAO, 1));
  const configurado = inteiroSeguro(input.limiteConfigurado, 0, 1);
  const ganhoBruto = inteiroSeguro(input.conversasComResposta, 0, 0);

  // ── CHIP SEM HISTÓRIA NÃO DISPARA. TETO ZERO. (17/08/2026) ────────────────
  // Custou o chip da Maria Clara (5519920064405): 12 dias pareado e MUDO, zero
  // conversa humana, e a PRIMEIRA ação da vida dele foi um texto frio pra
  // desconhecido. `stream:error 401 / device_removed` no MESMO minuto — não houve
  // volume nenhum, foi 1 mensagem. O que a Meta pontuou foi o PERFIL: número sem
  // história fazendo abertura por multi-device é a assinatura exata de descartável.
  //
  // A base de 6 era a porta: `tetoDoChip({})` devolvia 6 pra um chip que nunca
  // recebeu resposta de ninguém. Confiança se GANHA — quem tem zero conversa de
  // volta tem zero, e a rampa começa do primeiro humano que responder.
  //
  // Isto NÃO tranca ninguém: envio HUMANO não passa por aqui. O caminho pra
  // destravar é o certo (e é o que o mercado chama de aquecimento) — a pessoa usa
  // o chip como gente por alguns dias, gente responde, o teto sobe sozinho.
  //
  // Vence até a trava removida DE PROPÓSITO: `coldWarmupOff` é o direito da
  // pessoa de acelerar um chip que JÁ tem história, nunca de mandar um recém-
  // nascido pro abate. Sem esta ordem, a chavinha vira a porta dos fundos do freio.
  if (ganhoBruto <= 0) return 0;

  if (input.travaRemovida === true && configurado > 0) return configurado;
  const tetoDaRampa = configurado > 0 ? Math.min(max, Math.max(base, Math.floor(configurado / 2))) : max;
  return Math.min(tetoDaRampa, base + ganhoBruto);
}

/**
 * ESSA "RESPOSTA" VEIO DE UMA PESSOA PRA MIM? (06/08/2026)
 *
 * Medido em produção, empresa 5: a confiança do chip estava sendo inflada por
 * conversa que não é conversa.
 * - `company-5-user-28`: **19 das 67** "conversas que responderam" eram GRUPOS
 *   (`...@g.us`) — avisos de igreja, escala de reunião, nota de falecimento.
 * - `company-5-user-60` (chip novo da Maria Clara): a ÚNICA "resposta" dela era
 *   `contact = "0"` com o texto *"Welcome to WhatsApp Business"* — mensagem que
 *   o próprio WhatsApp manda ao parear. O chip ganhou +1 de confiança de si mesmo.
 *
 * Isso quebra a premissa inteira do arquivo: o teto sobe porque *"gente está
 * conversando de volta"*. Mensagem que alguém postou num grupo de igreja não é
 * ninguém querendo falar com este chip, e mensagem do WhatsApp pra ele mesmo,
 * muito menos. Um freio anti-ban que erra pra CIMA é o único erro caro aqui —
 * o próprio comentário do gate diz que o lado seguro de errar é pra baixo.
 *
 * Régua deliberadamente de ALLOWLIST (o que eu não reconheço, não conta):
 * telefone 1:1 conta; LID conta (é gente de verdade, só com o número oculto —
 * ver o caso do Atacadão); grupo, broadcast e lixo não contam.
 */
export function contatoContaConfianca(contactRaw: unknown): boolean {
  const contact = String(contactRaw ?? '').trim().toLowerCase();
  if (!contact) return false;
  // Grupo (@g.us) e lista de transmissão: muita gente falando entre si, nenhuma
  // delas respondendo a este chip.
  if (contact.includes('@g.us') || contact.includes('@broadcast')) return false;
  // LID: pessoa real com o telefone oculto pelo WhatsApp.
  if (contact.includes('@lid')) return /\d{6,}/.test(contact);
  // Telefone 1:1 (com ou sem "+", com ou sem sufixo de device/servidor).
  const digitos = contact.replace(/\D/g, '');
  return digitos.length >= 10 && digitos.length <= 15;
}

export interface EspacamentoInput {
  /** Teto de hoje para este chip (saída de `tetoDoChip`). */
  teto: number;
  /** Tamanho da janela de trabalho em ms (ex.: 08:00→18:00 = 10h). */
  janelaMs: number;
  /** Piso absoluto entre dois frios (env `HBX_WA_COLD_MIN_SPACING_MINUTES`). */
  minimoMs?: number;
}

/**
 * ESPALHA O DIA INTEIRO — ordem literal do dono: *"pode usar os 10, respeitando o
 * limite (o dia inteiro) 08 às 18:00"*.
 *
 * O espaçamento fixo de 10 min fazia os 10 frios saírem todos até as 09:40 e o chip
 * ficava mudo o resto do dia: rajada de manhã é exatamente a cara de robô que o
 * freio existe pra evitar. Aqui a distância nasce da divisão da janela pelo teto —
 * 10 em 10h = 1 por hora; 3 em 10h = 1 a cada 3h20. Quanto MENOR a confiança, mais
 * espaçado: chip novo aparece devagar, chip antigo trabalha.
 *
 * Nunca desce abaixo do piso configurado (o freio antigo continua valendo como
 * chão) e nunca devolve zero.
 */
export function espacamentoDoDia(input: EspacamentoInput): number {
  const teto = inteiroSeguro(input.teto, 1, 1);
  const janela = Math.max(0, Number(input.janelaMs) || 0);
  const minimo = Math.max(0, Number(input.minimoMs) || 0);
  const porFatia = teto > 0 ? Math.floor(janela / teto) : 0;
  return Math.max(1, minimo, porFatia);
}

function inteiroSeguro(valor: unknown, padrao: number, piso: number): number {
  const n = Math.trunc(Number(valor));
  return Number.isFinite(n) && n >= piso ? n : padrao;
}

/**
 * Janela de trabalho em ms a partir de "HH:MM"→"HH:MM". Fim menor ou igual ao
 * início devolve 0 — quem chama decide o que fazer com janela vazia (o gate cai
 * no piso), porque inventar 24h aqui liberaria disparo de madrugada.
 */
export function janelaDeTrabalhoMs(inicioHHMM: string, fimHHMM: string): number {
  const inicio = minutosDoDia(inicioHHMM);
  const fim = minutosDoDia(fimHHMM);
  if (inicio == null || fim == null || fim <= inicio) return 0;
  return (fim - inicio) * 60 * 1000;
}

function minutosDoDia(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
