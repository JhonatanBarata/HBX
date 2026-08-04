/**
 * HBX COMEX — TABELA CURADA CNAE → NCM (a peça que tapa o buraco do MDI).
 *
 * LEI 1 do Analista: "código NCM é SEMPRE do servidor" — a IA local deduz a
 * SUBSTÂNCIA mas erra 100% dos códigos com cara de certeza (medido 01/08,
 * memory/ia-local-30b-medicoes.md). Esta tabela é o conhecimento setorial
 * VALIDADO; cresce por uso (fábrica noturna F2.5 gera candidatos, curadoria
 * aprova) e mora no código de propósito: versionada, revisável em PR e
 * deployada sem SFTP. Quando ganhar escrita em runtime (flywheel), migra
 * pra tabela própria no Postgres — não editar à mão em produção.
 *
 * Regra de entrada: só código conferido contra a tabela oficial
 * (comex-motor/data/raw/tabelas/NCM.csv). Nada de "provavelmente é esse".
 */

export interface CnaeNcmInsumo {
  ncm: string; // 8 dígitos, sem pontos
  nome: string;
}

export interface CnaeNcmEntrada {
  setor: string;
  /** SH4 do que o setor VENDE — chave da matriz produto→insumo (a lente forte). */
  produtoSh4?: string;
  insumos: CnaeNcmInsumo[];
  /** Quando/como foi validada — curadoria é rastreável. */
  validacao: string;
}

export const CNAE_NCM_CURADA: Record<string, CnaeNcmEntrada> = {
  // Caso Ask Crios — códigos conferidos 1 a 1 contra o NCM.csv em 01/08/2026
  // (teste que reprovou o 30b: ele acertou as substâncias e errou os 8 códigos).
  // ⚠️ CNAE correto é 2032 ("Fabricação de resinas termofixas" no cadastro SECEX
  // do próprio CNPJ 44246528000110) — os testes de 01/08 citavam "2072" por engano.
  '2032': {
    setor: 'Fabricação de resinas termofixas',
    produtoSh4: '3909',
    validacao: '01/08/2026 — códigos conferidos contra NCM.csv na sessão que reprovou o 30b',
    insumos: [
      { ncm: '29071100', nome: 'Fenol e seus sais' },
      { ncm: '29071200', nome: 'Cresóis e seus sais' },
      { ncm: '29121100', nome: 'Formaldeído (metanal)' },
      { ncm: '29051100', nome: 'Metanol (álcool metílico)' },
      { ncm: '29321200', nome: '2-Furaldeído (furfural)' },
      { ncm: '29291010', nome: 'Diisocianato de difenilmetano (MDI)' },
      { ncm: '39093100', nome: 'Poli(isocianato de fenil metileno) — MDI polimérico' },
    ],
  },
};
