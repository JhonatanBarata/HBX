// ================================================================
// NÍVEL DE DISPARO — pedido do dono, 31/07/2026:
//   "IA e bot seguem depois da sua configuração, mas qual nível ele está? nos
//    disparos? conservador, médio, agressivo? tudo isso está muito confuso!"
//
// A resposta honesta era: NÍVEL NÃO EXISTIA. A configuração do disparo eram 12
// campos numéricos soltos em 6 peças (ritmo, digitação, limite, alvo, mensagens,
// palavras) e nenhuma tela dizia onde a empresa estava. Quem abria a gaveta tinha
// que ler "intervalo 15, variação 30, limite 17, tentativas 1" e deduzir sozinho
// se aquilo era pouco ou muito — e "deduzir sozinho" é como se estoura um chip.
//
// Este módulo faz o caminho dos dois lados:
//   - APLICAR: escolher um nível preenche os 4 campos que mandam no risco.
//   - RECONHECER: dada uma config qualquer (inclusive as que já existem no banco),
//     dizer em qual nível ela está — ou 'personalizado', sem julgar.
//
// SÓ 4 CAMPOS entram no nível, e de propósito: quantos por dia, de quanto em quanto
// tempo, quanta variação nesse tempo e quantas tentativas por lead. É o que muda o
// RISCO. Tempo de digitação, horário e estoque de leads não entram: não é risco de
// banimento, é realismo/alvo — misturar tudo num "nível" só recria a confusão.
//
// O nível NÃO passa por cima do freio anti-ban (cold gate). Pedir 20/dia com o freio
// em 10 continua saindo 10 — quem promete o número efetivo é o `tetoEfetivoPorDia`.
// Nível é INTENÇÃO; freio é FÍSICA. A tela mostra os dois.
// ================================================================

export type NivelDisparo = 'conservador' | 'medio' | 'agressivo';
export type NivelDisparoDetectado = NivelDisparo | 'personalizado';

/** Os 4 campos que definem o risco de um nível. */
export interface NivelDisparoValores {
  dailyLimit: number;
  intervalMinutes: number;
  intervalVarianceMinutes: number;
  maxAttemptsPerLead: number;
}

export interface NivelDisparoDef extends NivelDisparoValores {
  chave: NivelDisparo;
  titulo: string;
  /** Uma linha, sem jargão: pra quem é este nível. */
  resumo: string;
}

// Números escolhidos em cima do incidente de 30/07 (3 disparos em 3 minutos com copy
// quase igual = dispositivo removido pela Meta) e do default do freio (10/dia).
// Conservador é o modo "chip se recuperando"; médio é onde a maioria deve ficar;
// agressivo só faz sentido com número maduro E com o freio global levantado.
export const NIVEIS_DISPARO: NivelDisparoDef[] = [
  {
    chave: 'conservador',
    titulo: 'Conservador',
    resumo: 'Poucos contatos por dia, bem espaçados. Para chip novo, recém-pareado ou que já levou susto.',
    dailyLimit: 5,
    intervalMinutes: 25,
    intervalVarianceMinutes: 20,
    maxAttemptsPerLead: 1,
  },
  {
    chave: 'medio',
    titulo: 'Médio',
    resumo: 'O equilíbrio recomendado — volume de trabalho sem chamar atenção. É onde a maioria fica.',
    dailyLimit: 10,
    intervalMinutes: 15,
    intervalVarianceMinutes: 15,
    maxAttemptsPerLead: 1,
  },
  {
    chave: 'agressivo',
    titulo: 'Agressivo',
    resumo: 'Volume alto e ritmo curto. Só com chip maduro (mais de 30 dias, conversa dos dois lados).',
    dailyLimit: 20,
    intervalMinutes: 8,
    intervalVarianceMinutes: 6,
    maxAttemptsPerLead: 2,
  },
];

export const NIVEL_DISPARO_PADRAO: NivelDisparo = 'medio';

export function definicaoDoNivel(nivel: NivelDisparo): NivelDisparoDef {
  return NIVEIS_DISPARO.find((n) => n.chave === nivel) ?? NIVEIS_DISPARO[1];
}

export function isNivelDisparo(valor: unknown): valor is NivelDisparo {
  return NIVEIS_DISPARO.some((n) => n.chave === String(valor || '').trim().toLowerCase());
}

/** Os valores que um nível grava na campanha (só os 4 campos de risco). */
export function valoresDoNivel(nivel: NivelDisparo): NivelDisparoValores {
  const def = definicaoDoNivel(nivel);
  return {
    dailyLimit: def.dailyLimit,
    intervalMinutes: def.intervalMinutes,
    intervalVarianceMinutes: def.intervalVarianceMinutes,
    maxAttemptsPerLead: def.maxAttemptsPerLead,
  };
}

/**
 * Em que nível esta config ESTÁ? Casamento exato nos 4 campos; qualquer coisa fora
 * disso é 'personalizado' — e personalizado não é erro, é escolha. A tela mostra os
 * números do jeito que estão, sem empurrar ninguém pra um preset.
 */
export function detectarNivel(config: Partial<NivelDisparoValores> | null | undefined): NivelDisparoDetectado {
  if (!config) return 'personalizado';
  for (const def of NIVEIS_DISPARO) {
    if (
      Number(config.dailyLimit) === def.dailyLimit &&
      Number(config.intervalMinutes) === def.intervalMinutes &&
      Number(config.intervalVarianceMinutes) === def.intervalVarianceMinutes &&
      Number(config.maxAttemptsPerLead) === def.maxAttemptsPerLead
    ) {
      return def.chave;
    }
  }
  return 'personalizado';
}

/**
 * Frase de UMA LINHA do estado atual, já contando o freio anti-ban. É esta frase que
 * responde a pergunta do dono ("qual nível ele está?") sem obrigar ninguém a abrir
 * seis gavetas. `tetoEfetivo` é o que REALMENTE sai por dia (min(config, freio)).
 */
export function fraseDoNivel(input: {
  nivel: NivelDisparoDetectado;
  valores: Partial<NivelDisparoValores>;
  tetoEfetivo?: number | null;
}): string {
  const pedido = Number(input.valores?.dailyLimit);
  const intervalo = Number(input.valores?.intervalMinutes);
  const efetivo = Number.isFinite(Number(input.tetoEfetivo)) ? Number(input.tetoEfetivo) : pedido;
  const nome =
    input.nivel === 'personalizado' ? 'Personalizado' : definicaoDoNivel(input.nivel as NivelDisparo).titulo;

  const partes: string[] = [];
  if (Number.isFinite(efetivo)) partes.push(`${efetivo} primeiro(s) contato(s) por dia`);
  if (Number.isFinite(intervalo)) partes.push(`um a cada ~${intervalo} min`);
  const corpo = partes.length ? ` — ${partes.join(', ')}` : '';
  // Só fala do freio quando ele REALMENTE está cortando. Aviso que aparece sempre
  // vira paisagem e ninguém lê no dia em que importa.
  const cortado = Number.isFinite(pedido) && Number.isFinite(efetivo) && efetivo < pedido;
  const nota = cortado ? ` (sua config pede ${pedido}; o freio anti-ban libera ${efetivo})` : '';
  return `${nome}${corpo}${nota}.`;
}
