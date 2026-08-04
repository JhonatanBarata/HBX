// SANEAMENTO DE NOME DE EMPRESA (04/08/2026)
//
// POR QUE A BASE É ASSIM. O nome do lead chega de DUAS fontes que escrevem de
// jeitos diferentes, e nenhuma das duas está errada na origem:
//   • Receita Federal — grava razão social em CAIXA ALTA e SEM acento, por
//     desenho do cadastro. Daí "MDXS DISTRIBUIDORA DE BEBIDAS E ALIMENTOS
//     LTDA" e "PIZANI DISTRIBUIDORA DE AGUA".
//   • Google Maps / diretórios — grava o nome fantasia como o dono digitou,
//     em caixa natural e com acento. Daí "Só Água Distribuidora".
// Medido na base de produção em 04/08: 18.449 leads no pool, 11.520 em caixa
// alta, 6.680 mistos, 73 em caixa baixa. Não é descuido de cadastro — é a
// costura de duas fontes aparecendo na tela.
//
// O QUE ESTA FUNÇÃO FAZ E O QUE ELA NÃO FAZ. Ela iguala a CAIXA. Ela não
// inventa acento: "AGUA" sai "Agua", não "Água" — repor acento é adivinhar, e
// adivinhação em nome de cliente vira erro com cara de certeza (a mesma lei do
// "código NCM é sempre do servidor"). Acento é assunto do DADO, não da tela.
//
// É EXIBIÇÃO. O que está gravado não muda.

/** Ficam em baixo no meio do nome. No começo, sobem como qualquer palavra. */
const PARTICULAS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos",
  "a", "o", "as", "os", "ao", "aos", "à", "às", "com", "para", "por", "sob", "sobre", "d",
]);

/** Siglas jurídicas: são iniciais, não palavras — não viram "Me"/"Epp". */
const SIGLAS = new Set(["ME", "EPP", "EIRELI", "MEI", "SA", "S/A", "S.A", "S.A.", "LTD", "ME.", "CNPJ"]);

/** Numeral romano de filial ("Unidade III") não vira "Iii". */
const ROMANO = /^(?:M{0,3})(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;

const VOGAIS = /[aeiouáàâãéêíóôõúü]/i;
const UFS = new Set([
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE",
  "PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
]);

function subir(p: string): string {
  return p ? p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1) : p;
}

/**
 * Uma "palavra" aqui pode vir grudada por hífen, barra ou apóstrofo
 * ("26 DE JULHO-SUMARE", "AGUA/GAS", "D'OESTE"). Cada pedaço decide sozinho.
 */
function pedaco(bruto: string, primeira: boolean): string {
  if (!bruto) return bruto;

  // 1. Já tem letra maiúscula NO MEIO — é grafia de marca ("iFood", "AquaJá",
  //    "McDonald's"). Mexer aqui é estragar o nome que a empresa escolheu.
  if (/[a-zà-ÿ][A-ZÀ-Þ]/.test(bruto)) return bruto;

  const so = bruto.replace(/[().,]/g, "");
  const alto = so.toUpperCase();

  // 2. Sigla jurídica, UF e numeral romano: caixa alta é a grafia certa.
  if (SIGLAS.has(alto) || UFS.has(alto) || (alto.length > 1 && ROMANO.test(alto))) {
    return bruto.toUpperCase();
  }
  // 3. Palavra sem NENHUMA vogal é sigla ("MDXS", "WCG", "LJ", "RCS").
  //    Medido: 553 nomes na base têm uma dessas — virariam "Mdxs" num
  //    Título ingênuo, que é o defeito clássico deste tipo de conserto.
  if (so.length >= 2 && !VOGAIS.test(so) && /[a-z]/i.test(so)) return bruto.toUpperCase();
  // 4. Só número ou pontuação passa direto ("499", "&").
  if (!/[a-zà-ÿ]/i.test(so)) return bruto;

  const baixo = bruto.toLocaleLowerCase("pt-BR");
  // 5. LTDA vira "Ltda" — é abreviação de palavra, não sigla de iniciais.
  if (alto === "LTDA" || alto === "LTDA.") return subir(baixo);
  // 6. Partícula no meio do nome fica embaixo.
  if (!primeira && PARTICULAS.has(baixo)) return baixo;
  return subir(baixo);
}

/** Nome de empresa pronto pra ler, com a caixa igual em toda a base. */
export function formatCompanyName(raw: string | null | undefined): string {
  const bruto = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!bruto) return "";

  const guardado = lembrete.get(bruto);
  if (guardado !== undefined) return guardado;

  let indice = 0;
  const pronto = bruto
    .split(" ")
    .map(palavra => {
      // A sigla é testada INTEIRA antes de qualquer quebra: "S/A" partido no
      // "/" vira "S" + "A", e o "A" cai na regra de partícula — o resultado
      // era "S/a". Sigla com barra dentro é uma coisa só.
      if (SIGLAS.has(palavra.replace(/[().,]/g, "").toUpperCase())) {
        indice += 1;
        return palavra.toUpperCase();
      }
      // Hífen, barra e apóstrofo separam pedaços que também começam nome
      // ("26 de Julho-Sumaré", "d'Oeste"). O apóstrofo é o único que NÃO
      // reinicia a contagem de "primeira palavra".
      return palavra
        .split(/([-/])/)
        .map(parte => {
          if (parte === "-" || parte === "/") return parte;
          const ehPrimeira = indice === 0;
          indice += 1;
          return parte
            .split("'")
            .map((sub, i) => (i === 0 ? pedaco(sub, ehPrimeira) : subir(sub.toLocaleLowerCase("pt-BR"))))
            .join("'");
        })
        .join("");
    })
    .join(" ");

  lembrete.set(bruto, pronto);
  return pronto;
}

/* A lista chama isto por célula E por comparação de ordenação. Guardar a
   resposta custa menos que refazer a conta (mesma razão do br-cidade). */
const lembrete = new Map<string, string>();
