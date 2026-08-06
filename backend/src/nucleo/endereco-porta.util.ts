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
 *
 * ── 06/08: A UNIDADE DESEMPATA (ordem do dono) ─────────────────────────────────
 * "Os clientes podem ter o mesmo CEP (morar no mesmo condomínio); o que difere um do
 * outro é o número. E se repetir, tem que perguntar se é apartamento."
 *
 * Prédio é o caso em que TODA a prova acima bate (mesma via, mesmo número, mesmo CEP)
 * e mesmo assim são portas DIFERENTES — o que separa é o apartamento/bloco. Então
 * `complemento` entra como VETO: duas unidades declaradas e diferentes nunca são a
 * mesma porta, por mais que o resto seja idêntico.
 *
 * O silêncio continua sendo silêncio: unidade em branco de um dos lados NÃO prova
 * nada (pode ser o mesmo apto cadastrado duas vezes, uma delas sem o complemento) —
 * segue sendo a mesma porta, que é o caso que o dono quer ver perguntado.
 */
import { extrairNumeroPorta, viasCompativeisCnefe } from './cnefe-resolver.util';
import { logradouroDoCadastro } from '../logistica/logistica-cep.util';
import { normalizeSearch } from './nucleo-search.util';

export interface PortaCadastro {
  endereco?: string | null;
  numero?: string | null;
  /** Apartamento/bloco/sala — a UNIDADE dentro do número. Null/'' = não informado. */
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}

/** Palavras que só dizem o TIPO da unidade — sozinhas não identificam ninguém.
 *  "Apto 32" e "AP 32" são a MESMA unidade; comparar o texto cru diria que não. */
const TIPO_UNIDADE = new Set([
  'apto', 'apt', 'ap', 'apartamento', 'bloco', 'bl', 'torre', 'casa', 'cs', 'sala', 'sl',
  'conjunto', 'cj', 'unidade', 'un', 'lote', 'lt', 'quadra', 'qd', 'andar', 'n', 'no',
  'num', 'numero', 'de', 'da', 'do',
]);

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

/**
 * A UNIDADE, sem as palavras de tipo: "Apto 32" → "32", "AP. 32" → "32",
 * "Bloco B apto 32" → "b 32". '' = não informado.
 *
 * Se sobrar NADA depois de tirar os tipos, vale o texto inteiro — "Fundos" e "Casa"
 * são unidade de verdade em cadastro brasileiro, e virar '' faria a régua parar de
 * distinguir "casa 1" de "casa 2".
 */
export function unidadeDaPorta(reg: PortaCadastro): string {
  const tokens = normalizeSearch(reg.complemento ?? '')
    .replace(/[.,/\\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return '';
  const semTipo = tokens.filter((t) => !TIPO_UNIDADE.has(t));
  return (semTipo.length ? semTipo : tokens).join(' ');
}

/** true SÓ com prova de que os dois cadastros apontam a mesma porta (ver topo). */
export function mesmaPorta(a: PortaCadastro, b: PortaCadastro): boolean {
  const numeroA = numeroDaPorta(a);
  const numeroB = numeroDaPorta(b);
  if (!numeroA || !numeroB || numeroA !== numeroB) return false;

  // Prédio: mesmo número, unidades declaradas e diferentes = portas diferentes, fim.
  // (Unidade em branco não prova nada e segue o fluxo normal — ver cabeçalho.)
  const unidadeA = unidadeDaPorta(a);
  const unidadeB = unidadeDaPorta(b);
  if (unidadeA && unidadeB && unidadeA !== unidadeB) return false;

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
