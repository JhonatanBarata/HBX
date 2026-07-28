/**
 * 🔴 PORTA — "duas linhas de cadastro são a MESMA porta?" (28/07, ordem do dono na
 * Rota rápida do APK: "que tipo de cadastro é esse que o nome é opcional, e nem
 * compara se já existe o endereço? comece a barrar lixo pra dentro do sistema").
 *
 * Régua FAIL-CLOSED, e o motivo é concreto: duplicata FALSA é pior que duplicata
 * nenhuma. Dizer "já existe" pra duas casas diferentes faz o app reaproveitar a
 * conta errada — a entrega vai pro cliente errado e um endereço some da rota. Na
 * dúvida esta função responde `false` e o cadastro segue como novo.
 *
 * O que prova a mesma porta:
 *  1. NÚMERO igual (dos dois lados). Sem número não se decide nada — endereço sem
 *     porta não identifica ninguém (é a mesma lei do freio do pino).
 *     O número vale da coluna `numero` OU de dentro do texto composto do legado
 *     ("Rua 3a, 1354 - Jd. Ypê"), via `extrairNumeroPorta`.
 *  2. VIA compatível pela MESMA régua do resolver CNEFE (`viasCompativeisCnefe`):
 *     "Rua 8" ≡ "RUA OITO", "Av. M22A" ≡ "Avenida M 22 A", e "rua 8" ≠ "rua 80".
 *     A via sai do texto livre por `logradouroDoCadastro` (pega o trecho que começa
 *     com tipo de via — metade da base real começa pelo BAIRRO).
 *  3. + CEP igual OU CIDADE igual. Via numerada repete entre cidades ("Rua 8" existe
 *     em toda cidade do interior), então via sozinha nunca fecha.
 *
 * Sem texto de via de um dos lados, sobra o CEP: CEP específico JÁ É o logradouro,
 * então (CEP, número) fecha. CEP genérico de cidade inteira (terminado em 000) não
 * vale — nele o mesmo número cai em ruas diferentes.
 */
import { extrairNumeroPorta, viasCompativeisCnefe } from './cnefe-resolver.util';
import { logradouroDoCadastro } from '../logistica/logistica-cep.util';
import { normalizeSearch } from './nucleo-search.util';

export interface PortaCadastro {
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}

/** Número da porta (coluna `numero` ou de dentro do texto composto). null = sem porta. */
export function numeroDaPorta(reg: PortaCadastro): number | null {
  return extrairNumeroPorta({ numero: reg.numero ?? null, endereco: reg.endereco ?? null });
}

/** CEP em 8 dígitos, ou null (mascarado, curto ou vazio não vale como prova). */
export function cepDaPorta(reg: PortaCadastro): string | null {
  const digits = String(reg.cep ?? '').replace(/\D+/g, '');
  return digits.length === 8 ? digits : null;
}

/** CEP de cidade inteira ("13500-000"): aponta o município, não o logradouro. */
export function cepGenerico(cep: string | null): boolean {
  return !!cep && cep.endsWith('000');
}

/** Só o logradouro, sem número/bairro, do texto livre do cadastro. */
export function viaDaPorta(reg: PortaCadastro): string {
  return logradouroDoCadastro(reg.endereco ?? null).trim();
}

/** Cidade normalizada (sem acento/caixa) — '' quando o cadastro não tem cidade. */
export function cidadeDaPorta(reg: PortaCadastro): string {
  return normalizeSearch(reg.cidade ?? '');
}

/** true SÓ com prova de que os dois cadastros apontam a mesma porta (ver topo). */
export function mesmaPorta(a: PortaCadastro, b: PortaCadastro): boolean {
  const numeroA = numeroDaPorta(a);
  const numeroB = numeroDaPorta(b);
  if (!numeroA || !numeroB || numeroA !== numeroB) return false;

  const cepA = cepDaPorta(a);
  const cepB = cepDaPorta(b);
  const cepIgual = !!cepA && cepA === cepB;
  const cidadeA = cidadeDaPorta(a);
  const cidadeB = cidadeDaPorta(b);
  const cidadeIgual = !!cidadeA && cidadeA === cidadeB;

  const viaA = viaDaPorta(a);
  const viaB = viaDaPorta(b);
  if (viaA && viaB) {
    if (!viasCompativeisCnefe(viaA, viaB)) return false;
    return cepIgual || cidadeIgual;
  }
  return cepIgual && !cepGenerico(cepA);
}
