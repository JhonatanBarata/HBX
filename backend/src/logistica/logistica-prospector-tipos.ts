/**
 * PROSPECTOR v2 (12/08) — OS TIPOS QUE A PESSOA PODE ESCOLHER NA SEMANA.
 *
 * 🔴 O QUE MUDOU NO PRODUTO. O prospector v1 embarcava TUDO que tinha pino no corredor
 * e ordenava por uma cesta fixa ("sede de água"). A decisão do dono (12/08) é outra: a
 * pessoa liga o prospector e diz o que INTERESSA A ELA nesta semana. O corredor
 * continua trazendo o bairro inteiro (é o AMBIENTE — os prédios azuis, mudos), mas só
 * o TIPO escolhido acende, fala e ganha rótulo (os verdes).
 *
 * ┌─ AS LEIS DESTE ARQUIVO ──────────────────────────────────────────────────────┐
 * │ 1. A LISTA MORA AQUI, UMA VEZ. Rótulo, slug e prefixos de CNAE saem da mesma │
 * │    constante — servidor, payload da tela e prova. Segunda cópia escrita à    │
 * │    mão em outro lugar é como as duas metades divergem em silêncio.           │
 * │ 2. PREFIXO CASA A DIVISÃO INTEIRA. O CNAE da RFB tem 7 dígitos sem           │
 * │    pontuação; '4711' casa todo hiper/supermercado, '9602' todo salão.        │
 * │ 3. NÃO É EXCLUSÃO, É ESCOLHA. Quem está fora do tipo continua embarcando e   │
 * │    aparecendo — só não acende. Filtrar no corredor deixaria a rua vazia e    │
 * │    mataria a sensação de "tem mundo aí fora", que é metade do valor da cena. │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ A CURADORIA É AJUSTÁVEL PELO DONO e nasce deliberadamente CURTA (8 tipos). Ela é
 * uma aposta comercial, não uma verdade: são os ramos que uma distribuidora de água/
 * bebida encontra na rua e consegue vender no mesmo dia. Mexer aqui — acrescentar um
 * tipo, trocar um prefixo, renomear um rótulo — é edição de UMA constante e não pede
 * migration nenhuma: `tipo` é gravado como slug e slug que sumiu da lista é lido como
 * AUSENTE (a pessoa simplesmente escolhe de novo).
 *
 * ⚠️ SLUG É CONTRATO GRAVADO. O texto do rótulo pode mudar à vontade; o `slug` está em
 * `LogisticaProspectorSemana.tipo` de quem já escolheu. Renomear slug = trocar a
 * escolha de todo mundo por "nenhuma" no meio da semana.
 */

export type ProspectorTipo = {
  /** Chave gravada no banco e trafegada no payload. NUNCA renomear (ver acima). */
  slug: string;
  /** O que a pessoa lê no chip da folha. Livre pra mudar. */
  rotulo: string;
  /** Prefixos de CNAE (só dígitos) que definem o tipo. */
  prefixos: readonly string[];
};

/**
 * OS 8 TIPOS. A ordem é a da folha — do que mais aparece na rua pro que menos aparece.
 *
 * Notas de curadoria (o porquê de cada recorte, pro dono poder discordar com dado):
 *  · mercado    — 4711 (super/hiper), 4712 (mini/mercearia/armazém) e 4729 (outros
 *                 alimentícios) são a mesma prateleira pra quem vende galão.
 *  · bar        — 5611-2/02 e /03 (servir bebidas, sem e com entretenimento). Fica
 *                 SEPARADO de restaurante de propósito: o dono pediu os dois na lista.
 *  · restaurante— 5611-2/01 (restaurantes), /04 (lanchonetes, casas de chá e sucos),
 *                 /05 e 5612 (ambulante). Prefixos de 7 dígitos aqui porque a divisão
 *                 5611 inteira misturaria bar e restaurante num tipo só.
 *  · padaria    — 1091 (produção própria) + 4721-1/02 (predominância de revenda). São
 *                 duas SEÇÕES diferentes do CNAE pra mesma padaria da esquina.
 *  · farmacia   — 4771 (drogarias e farmácias de manipulação).
 *  · salao      — 9602 (cabeleireiro, manicure, barbearia, estética).
 *  · oficina    — 4520 (manutenção de veículos) + 4530 (peças e acessórios).
 *  · construcao — 4741/4742/4743/4744 (tintas, material elétrico, vidro e o
 *                 "materiais de construção em geral").
 */
export const PROSPECTOR_TIPOS: readonly ProspectorTipo[] = [
  { slug: 'mercado', rotulo: 'Mercados e mercearias', prefixos: ['4711', '4712', '4729'] },
  { slug: 'restaurante', rotulo: 'Restaurantes e lanchonetes', prefixos: ['5611201', '5611204', '5611205', '5612'] },
  { slug: 'bar', rotulo: 'Bares', prefixos: ['5611202', '5611203'] },
  { slug: 'padaria', rotulo: 'Padarias e confeitarias', prefixos: ['1091', '4721102'] },
  { slug: 'farmacia', rotulo: 'Farmácias e drogarias', prefixos: ['4771'] },
  { slug: 'salao', rotulo: 'Salões e barbearias', prefixos: ['9602'] },
  { slug: 'oficina', rotulo: 'Oficinas e autopeças', prefixos: ['4520', '4530'] },
  { slug: 'construcao', rotulo: 'Materiais de construção', prefixos: ['4741', '4742', '4743', '4744'] },
];

/** O tipo curado deste slug, ou `null` — slug desconhecido é AUSENTE, nunca erro. */
export function tipoPorSlug(slug: unknown): ProspectorTipo | null {
  const chave = String(slug ?? '').trim().toLowerCase();
  if (!chave) return null;
  return PROSPECTOR_TIPOS.find((t) => t.slug === chave) ?? null;
}

/** true = o slug é um tipo que existe HOJE na curadoria (o que o POST aceita gravar). */
export function ehTipoValido(slug: unknown): boolean {
  return tipoPorSlug(slug) !== null;
}

/**
 * A EMPRESA É DO TIPO ESCOLHIDO? A pergunta é de CÓDIGO de CNAE, nunca de texto.
 *
 * `cnae` sem dígito nenhum (null, '', lixo) é `false` — "não sei" e "não é" pintam
 * igual aqui de propósito: prédio que ninguém classificou nasce AZUL (ambiente, mudo),
 * que é o estado seguro. Acender um prédio por engano é o app convidando o motorista
 * a parar o carro por nada.
 */
export function cnaeEhDoTipo(cnae: unknown, tipo: ProspectorTipo | null | undefined): boolean {
  if (!tipo) return false;
  const codigo = String(cnae ?? '').replace(/\D/g, '');
  if (!codigo) return false;
  return tipo.prefixos.some((prefixo) => codigo.startsWith(prefixo));
}

/** A lista enxuta que a folha do app desenha: só slug e rótulo (prefixo é do servidor). */
export function tiposParaEscolha(): Array<{ slug: string; rotulo: string }> {
  return PROSPECTOR_TIPOS.map((t) => ({ slug: t.slug, rotulo: t.rotulo }));
}
