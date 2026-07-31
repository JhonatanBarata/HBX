/**
 * PAINEL DAS COSTAS (dono, 31/07/2026) — o verso do menu lateral.
 *
 * Cada módulo do menu tem um painel que conta, em silêncio, o que está
 * acontecendo lá dentro. O painel é SÓ LEITURA (o dono pediu: "informações
 * inclicáveis, somente visual") e é montado no backend porque é aqui que a
 * verdade mora — a casca só desenha o que chega neste contrato.
 *
 * Um contrato ÚNICO para os 11 painéis: nenhum módulo inventa um formato
 * próprio, e a tela nunca precisa saber de qual módulo o dado veio.
 */

/** Cor do estado — a mesma linguagem do painel de disparos (COR diz o estado). */
export type PainelTom = 'ok' | 'atencao' | 'risco' | 'neutro';

/** Célula grande: número em destaque com rótulo curto. */
export interface PainelMetrica {
  rotulo: string;
  valor: string;
  tom?: PainelTom;
}

/** Barra de distribuição: parte de um todo, já com o percentual calculado. */
export interface PainelBarra {
  rotulo: string;
  valor: number;
  /** 0..100, calculado no serviço (a tela nunca divide). */
  pct: number;
  /** O que aparece escrito no lugar do número cru (ex.: dinheiro formatado). */
  texto?: string;
  tom?: PainelTom;
}

/** Linha "rótulo → valor" do rodapé do painel. */
export interface PainelFato {
  rotulo: string;
  valor: string;
  tom?: PainelTom;
}

export interface PainelModulo {
  /** id de navegação da sidebar (vendas, agenda, atend, …). */
  modulo: string;
  titulo: string;
  /** Recorte do que está sendo mostrado ("hoje", "este mês", "no funil"). */
  legenda: string;
  tom: PainelTom;
  hero: { valor: string; rotulo: string; nota?: string } | null;
  /** Série curta (7 pontos) para o gráfico do topo. Vazia = sem gráfico. */
  serie: number[];
  serieRotulo: string | null;
  metricas: PainelMetrica[];
  barras: PainelBarra[];
  fatos: PainelFato[];
  rodape: string | null;
}
