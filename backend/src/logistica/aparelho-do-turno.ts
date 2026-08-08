/**
 * O APARELHO DO TURNO (08/08) — qual celular está com a pessoa AGORA.
 *
 * ── O que quebrou ───────────────────────────────────────────────────────────
 * Recado era endereçado à PESSOA e o primeiro aparelho que puxasse carimbava
 * `entregueEm` pra todo mundo. Dois celulares no mesmo login = o segundo nunca
 * recebia nada, e o painel ainda mostrava ✓ "entregue". Foi assim que o celular
 * do cliente ficou mudo enquanto o aparelho de teste do dono comia os recados.
 *
 * ── Por que NÃO é "manda pra todos os aparelhos" ────────────────────────────
 * Celular de entrega é FERRAMENTA DA EMPRESA, não celular pessoal (regra do
 * dono, 08/08). A empresa tem N aparelhos e entrega um por turno. Espalhar o
 * recado em todos faria o alarme tocar no aparelho que está na base carregando
 * — barulho no escritório, ninguém responde, e em duas semanas a equipe inteira
 * aprendeu a ignorar alarme. Alarme que toca onde não tem gente mata o alarme.
 *
 * ── Por que NÃO é "escolher na hora de mandar" ──────────────────────────────
 * Escolher a cada mensagem joga no despachante, no meio da correria, uma
 * decisão que o sistema já tem como saber. Errou o clique, o alarme toca na
 * gaveta. A escolha existe — mas é ESTADO do aparelho (quem está com ele), não
 * um campo do disparo. A tela mostra o alvo já resolvido e deixa trocar.
 *
 * ── A escada, em ordem ──────────────────────────────────────────────────────
 *  1. `recebeOperacao = false` → aparelho de teste/base: NUNCA recebe operação.
 *  2. `principalDesde` → o escritório fixou este como o aparelho da pessoa.
 *     Mais recente vence (fixar de novo é trocar de aparelho).
 *  3. senão → o que deu sinal por último (tela ou heartbeat). É a leitura mais
 *     honesta de "está na mão de alguém agora".
 *
 * Régua PURA de propósito: sem Prisma aqui dentro, o juiz é o teste ao lado.
 */

export interface AparelhoCandidato {
  id: string;
  name?: string | null;
  /** Sessão derrubada — aparelho morto pro sistema. */
  revokedAt?: Date | null;
  /** "Removido" do painel: fora da lista é fora da operação. */
  ocultoEm?: Date | null;
  /** false = aparelho de teste/base (marcado no painel do master). */
  recebeOperacao?: boolean | null;
  /** Fixado pelo escritório como o aparelho desta pessoa. */
  principalDesde?: Date | null;
  ultimaTelaAt?: Date | null;
  lastUsedAt?: Date | null;
}

/** Último sinal de vida do aparelho: a tela pulsando OU a ponte nativa batendo. */
export function ultimoSinal(aparelho: AparelhoCandidato): number {
  const tela = aparelho.ultimaTelaAt ? new Date(aparelho.ultimaTelaAt).getTime() : 0;
  const ponte = aparelho.lastUsedAt ? new Date(aparelho.lastUsedAt).getTime() : 0;
  const maior = Math.max(Number.isFinite(tela) ? tela : 0, Number.isFinite(ponte) ? ponte : 0);
  return maior > 0 ? maior : 0;
}

/**
 * Aparelhos que PODEM receber operação. Tudo que decide entrega passa por aqui
 * — inclusive a campainha do push, senão o aparelho de teste continua tocando.
 */
export function elegiveisParaOperacao<T extends AparelhoCandidato>(aparelhos: readonly T[]): T[] {
  return (aparelhos || []).filter(
    (aparelho) =>
      !!aparelho &&
      !aparelho.revokedAt &&
      !aparelho.ocultoEm &&
      aparelho.recebeOperacao !== false,
  );
}

/**
 * O aparelho que recebe o recado desta pessoa agora. `null` = ela não tem
 * nenhum aparelho elegível (o recado ainda é gravado; entra no primeiro que
 * aparecer — recado não se perde por falta de celular).
 */
export function resolverAparelhoDoTurno<T extends AparelhoCandidato>(
  aparelhos: readonly T[],
): T | null {
  const elegiveis = elegiveisParaOperacao(aparelhos);
  if (!elegiveis.length) return null;

  const fixados = elegiveis
    .filter((aparelho) => !!aparelho.principalDesde)
    .sort((a, b) => new Date(b.principalDesde!).getTime() - new Date(a.principalDesde!).getTime());
  if (fixados.length) return fixados[0];

  // Desempate por id mantém a escolha ESTÁVEL: dois aparelhos zerados (nenhum
  // sinal) não podem alternar de alvo a cada disparo.
  return [...elegiveis].sort((a, b) => {
    const diferenca = ultimoSinal(b) - ultimoSinal(a);
    if (diferenca !== 0) return diferenca;
    return String(a.id).localeCompare(String(b.id));
  })[0];
}
