// ===========================================================================
// FISCAL F3 — parser do XML da NF-e de COMPRA (entrada de estoque por upload).
// XML da SEFAZ é máquina-gerado e bem-formado — extração determinística por
// regex (mesmo estilo do nfse-national.client), sem dependência nova de npm.
// Lemos SÓ o que a entrada precisa: chave de acesso, emitente e os itens
// (código, nome, NCM, unidade, quantidade, valor unitário comercial).
// ===========================================================================

export interface NfeCompraItem {
  cProd: string;
  nome: string;
  ncm: string | null;
  unidade: string | null;
  quantidade: number;
  valorUnit: number | null;
}

export interface NfeCompraParsed {
  chaveAcesso: string;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  itens: NfeCompraItem[];
}

function tag(src: string, nome: string): string | null {
  const m = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`).exec(src);
  return m ? m[1].trim() : null;
}

function num(v: string | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Aceita nfeProc (o "procNFe" distribuído após autorização) ou NFe crua.
 * Chave: preferimos o Id do infNFe ("NFe" + 44 dígitos); fallback chNFe do
 * protocolo. Lança Error com mensagem CLARA quando o arquivo não é NF-e.
 */
export function parseNfeCompra(xmlRaw: string): NfeCompraParsed {
  const xml = String(xmlRaw || '');
  if (!/<(?:nfeProc|NFe)[\s>]/.test(xml)) {
    throw new Error('O arquivo não parece ser um XML de NF-e (esperado nfeProc/NFe da SEFAZ).');
  }

  let chave: string | null = null;
  const idMatch = /<infNFe[^>]*Id="NFe(\d{44})"/.exec(xml);
  if (idMatch) chave = idMatch[1];
  if (!chave) {
    const ch = tag(xml, 'chNFe');
    if (ch && /^\d{44}$/.test(ch)) chave = ch;
  }
  if (!chave) throw new Error('XML sem chave de acesso da NF-e (infNFe Id / chNFe).');

  const emitBloco = tag(xml, 'emit') || '';
  const emitenteNome = tag(emitBloco, 'xNome');
  const emitenteCnpj = tag(emitBloco, 'CNPJ');

  const itens: NfeCompraItem[] = [];
  const detRe = /<det[^>]*>([\s\S]*?)<\/det>/g;
  let m: RegExpExecArray | null;
  while ((m = detRe.exec(xml)) !== null) {
    const prod = tag(m[1], 'prod');
    if (!prod) continue;
    const quantidade = num(tag(prod, 'qCom'));
    itens.push({
      cProd: tag(prod, 'cProd') || '',
      nome: tag(prod, 'xProd') || 'Produto',
      ncm: tag(prod, 'NCM'),
      unidade: tag(prod, 'uCom'),
      quantidade: quantidade ?? 0,
      valorUnit: num(tag(prod, 'vUnCom')),
    });
  }
  if (itens.length === 0) throw new Error('XML de NF-e sem itens (<det>/<prod>).');

  return { chaveAcesso: chave, emitenteNome, emitenteCnpj, itens };
}
