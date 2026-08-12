import { saoPauloDateKey } from './logistica-dia.util';

/**
 * PROSPECTOR v2 (12/08) — A SEMANA, e ela é a de SÃO PAULO.
 *
 * 🔴 A LEI QUE ESTE ARQUIVO CARREGA é a mesma do `logistica-dia.util.ts`, um degrau
 * acima: data de operação é dia CIVIL DE SÃO PAULO, explicitamente. A semana da
 * escolha NASCE do `saoPauloDateKey` de propósito — não existe aqui um segundo jeito
 * de perguntar "que dia é hoje". O MESMO código roda no Windows do dono (-03) e num
 * container UTC, e os dois têm que decidir a MESMA semana.
 *
 * O que quebra sem isso, medido em precedente (incidente 26/07 da Agenda): domingo
 * 23h30 em Brasília já é segunda em UTC. Com a semana saindo do fuso do processo, a
 * escolha da pessoa expiraria 3 horas antes da virada da semana dela — o prospector
 * ficaria mudo no fim do domingo, e ninguém ia entender por quê.
 *
 * 🔴 SEMANA ISO (segunda a domingo), não "7 dias corridos desde a escolha". Duas
 * razões, as duas de produto:
 *  · a pessoa pensa em SEMANA ("o que eu vou caçar essa semana"), e semana começa na
 *    segunda pra quem trabalha na rua;
 *  · janela deslizante nunca expira de verdade — quem escolheu na quinta ficaria com
 *    a escolha viva na quinta seguinte, e o "quieto de novo na segunda" (que é a
 *    decisão do dono) nunca aconteceria.
 *
 * O formato 'YYYY-Www' (ex.: '2026-W33') é ordenável como TEXTO, que é o que permite
 * a chave única no banco ser String sem virar armadilha de comparação.
 */

/** Formato da chave de semana: 4 dígitos de ano ISO + 'W' + 2 dígitos (01–53). */
export const SEMANA_ISO_REGEX = /^\d{4}-W\d{2}$/;

/**
 * "YYYY-MM-DD" (dia civil) → "YYYY-Www" (semana ISO). Devolve `null` pra data
 * inválida — quem chama trata ausência como "sem escolha", nunca como exceção na cara
 * de quem está dirigindo.
 *
 * A conta inteira é feita em UTC (`Date.UTC` + métodos `getUTC*`) porque aqui a data
 * JÁ É um dia civil resolvido: usar método local do Date reintroduziria exatamente o
 * fuso do processo que a linha de cima acabou de tirar.
 *
 * Regra ISO-8601, na letra: a semana pertence ao ano da sua QUINTA-FEIRA. É isso que
 * faz 2026-01-01 (uma quinta) cair na semana 01 e 2027-01-01 (uma sexta) cair na
 * semana 53 DE 2026 — a virada de ano não parte a semana de quem está na rua.
 */
export function semanaIsoDeDiaCivil(dateKey: unknown): string | null {
  const texto = String(dateKey ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!match) return null;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  // Data de calendário que não existe (31/02) rola pro mês seguinte no Date — aqui
  // isso é lixo de entrada, não uma data "quase certa".
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    return null;
  }
  // Anda até a QUINTA-FEIRA da mesma semana ISO (segunda=1 … domingo=7).
  const diaDaSemana = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() + 4 - diaDaSemana);
  const anoIso = data.getUTCFullYear();
  const primeiroDeJaneiro = Date.UTC(anoIso, 0, 1);
  const semana = Math.ceil(((data.getTime() - primeiroDeJaneiro) / 86400000 + 1) / 7);
  return `${anoIso}-W${String(semana).padStart(2, '0')}`;
}

/**
 * A semana VIGENTE, do jeito que a operação enxerga: instante → dia civil de São Paulo
 * → semana ISO. É a única porta que o serviço e o gate usam.
 *
 * Devolve '' (nunca null) quando nem o instante é válido, porque o chamador usa este
 * valor como chave de banco: string vazia não casa com nada e fecha o gate sozinha.
 *
 * ⚠️ `null` EXPLÍCITO NÃO VIRA "AGORA", e isso é regra da casa paga com um teste que
 * ficou verde por um dia e quebrou sozinho na virada da meia-noite (ver o comentário
 * do `date` em logistica-rota-prospector.test.ts). Default de parâmetro do JS vale só
 * pra `undefined`; escrever `agora ?? new Date()` aqui dentro faria "não tenho
 * instante" virar "o instante de agora" em silêncio — e um gate que responde "agora"
 * quando não sabe é um gate que abre sozinho. Omitir é omitir; passar nada é nada.
 */
export function semanaIsoVigente(agora: Date | string | null | undefined = new Date()): string {
  const dia = saoPauloDateKey(agora);
  if (!dia) return '';
  return semanaIsoDeDiaCivil(dia) ?? '';
}

/** true = o texto tem a cara de uma chave de semana ('2026-W33'). */
export function ehSemanaIso(valor: unknown): boolean {
  return SEMANA_ISO_REGEX.test(String(valor ?? '').trim());
}
