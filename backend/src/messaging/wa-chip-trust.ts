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

/** Teto de quem acabou de parear: ninguém nasce com 10. */
export const CHIP_TRUST_BASE_PADRAO = 3;
/** Teto máximo por chip/dia — o número do dono (30/07), agora como TETO, não cota fixa. */
export const CHIP_TRUST_MAX_PADRAO = 10;

export interface TetoDoChipInput {
  /** Piso de chip novo (env `HBX_WA_COLD_BASE_PER_CHIP`). */
  base?: number;
  /** Quantas conversas DISTINTAS já responderam para este chip (histórico + hoje). */
  conversasComResposta?: number;
  /** Teto máximo por dia (env `HBX_WA_COLD_MAX_PER_DAY`). */
  max?: number;
}

/**
 * base + 1 por conversa que respondeu, limitado ao teto.
 *
 * Conta o histórico INTEIRO (não só hoje) de propósito: o dono pediu que a
 * resposta de hoje solte limite HOJE, e uma janela "só hoje" faria o chip bom
 * amanhecer todo dia valendo 3 de novo — o contrário de confiança acumulada.
 */
export function tetoDoChip(input: TetoDoChipInput = {}): number {
  const max = inteiroSeguro(input.max, CHIP_TRUST_MAX_PADRAO, 1);
  const base = Math.min(max, inteiroSeguro(input.base, CHIP_TRUST_BASE_PADRAO, 1));
  const ganho = inteiroSeguro(input.conversasComResposta, 0, 0);
  return Math.min(max, base + ganho);
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
