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

// ── O DICIONÁRIO DE REPARO (04/08/2026) ──────────────────────────────────
// Duas avarias diferentes chegam no mesmo campo:
//   (a) ACENTO SUMIU, LETRA FICOU — "AGUA", "SAUDE", "PECAS". Vem da Receita,
//       que grava sem acento por desenho, e dos normalizadores do motor.
//       Medido: 16.115 dos 18.449 nomes do pool (87,4%) não têm um acento.
//   (b) A LETRA FOI APAGADA — "gua", "Gs", "Comrcio", "INFORMTICA". Medido: 9.
//       Investigado em 04/08 até a origem, e a conclusão desmentiu as duas
//       primeiras suspeitas: NÃO é o nosso decodificador (23 de 23 sites
//       sorteados decodificam idêntico) e NÃO é a IA de saneamento (ela
//       recebeu "Pereira gua e Gs" já quebrado). É a FONTE: o diretório
//       indaiatubafacil.com.br publica `alt="Logo Pereira gua e Gs"` e
//       `<a ...>gua Mineral</a>` no HTML dele. O scraper copiou fielmente um
//       dado que já nasceu podre. Não dá pra consertar o site dos outros —
//       conserta-se na leitura.
//
// A LISTA SÓ TEM SUBSTANTIVO GENÉRICO DE COMÉRCIO. Nada de nome próprio, nada
// de marca: "Aquaja" continua "Aquaja", porque pode ser "Aquajá" e pode não
// ser — e chutar acento em marca é inventar o nome do cliente. Palavra comum
// ("água", "gás", "serviços") não tem essa ambiguidade.
//
// É EXIBIÇÃO. Nada é regravado, então errar aqui custa uma linha pra desfazer.
const REPARO: Record<string, string> = {
  // (a) só falta o acento
  agua: "água", aguas: "águas", gas: "gás", saude: "saúde", servico: "serviço",
  servicos: "serviços", comercio: "comércio", industria: "indústria",
  alimenticios: "alimentícios", farmacia: "farmácia", otica: "ótica", otico: "ótico",
  veiculos: "veículos", moveis: "móveis", movel: "móvel", ceramica: "cerâmica",
  nutricao: "nutrição", construcao: "construção", distribuicao: "distribuição",
  refeicoes: "refeições", solucoes: "soluções", informatica: "informática",
  eletronica: "eletrônica", hidraulica: "hidráulica", mecanica: "mecânica",
  acessorios: "acessórios", negocios: "negócios", imoveis: "imóveis",
  clinica: "clínica", odontologica: "odontológica", patio: "pátio",
  escritorio: "escritório", bebe: "bebê", cafe: "café", acougue: "açougue",
  irmaos: "irmãos", pecas: "peças", medico: "médico", medica: "médica",
  analise: "análise", analises: "análises", tecnico: "técnico", tecnica: "técnica",
  eletrico: "elétrico", eletrica: "elétrica", quimica: "química",
  logistica: "logística", grafica: "gráfica", estetica: "estética",
  textil: "têxtil", agencia: "agência", jose: "josé", joao: "joão", sao: "são",
  // (b) a letra foi apagada na origem
  gua: "água", guas: "águas", servios: "serviços", comrcio: "comércio",
  indstria: "indústria", alimentcios: "alimentícios", farmcia: "farmácia",
  veculos: "veículos", mveis: "móveis", mvel: "móvel", cermica: "cerâmica",
  nutrio: "nutrição", construo: "construção", distribuio: "distribuição",
  refeies: "refeições", solues: "soluções", informtica: "informática",
  eletrnica: "eletrônica", hidrulica: "hidráulica", mecnica: "mecânica",
  acessrios: "acessórios", negcios: "negócios", imveis: "imóveis",
  clnica: "clínica", ptio: "pátio", escritrio: "escritório", aougue: "açougue",
  irmos: "irmãos", peas: "peças", mdico: "médico", anlise: "análise",
  tcnico: "técnico", eltrico: "elétrico", eltrica: "elétrica", qumica: "química",
  logstica: "logística", grfica: "gráfica", esttica: "estética", txtil: "têxtil",
  agncia: "agência", jos: "josé", joo: "joão", beb: "bebê", caf: "café",
  servio: "serviço", sade: "saúde",
};

// "Gs" fica FORA da lista solta de propósito: sozinho ele é sigla plausível
// (as iniciais do dono). Só vira "Gás" quando vem logo depois de um "e" — que
// é a forma em que ele aparece de verdade ("Água e Gás"). Regra estreita e
// explicável vale mais que regra esperta que erra o nome do cliente.
function repara(baixo: string, anterior: string | null): string | null {
  if (baixo === "gs") return anterior === "e" ? "gás" : null;
  return REPARO[baixo] ?? null;
}

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
function pedaco(bruto: string, primeira: boolean, anterior: string | null): string {
  if (!bruto) return bruto;

  // 1. Já tem letra maiúscula NO MEIO — é grafia de marca ("iFood", "AquaJá",
  //    "McDonald's"). Mexer aqui é estragar o nome que a empresa escolheu.
  if (/[a-zà-ÿ][A-ZÀ-Þ]/.test(bruto)) return bruto;

  const so = bruto.replace(/[().,]/g, "");
  const alto = so.toUpperCase();

  // 2. REPARO ANTES DE TUDO. Tem que vir antes da regra da sigla: "Gs" e
  //    "Gua" não têm vogal, e a regra 4 os promoveria a "GS"/"GUA" — o
  //    conserto de caixa disfarçando dado podre de sigla legítima.
  //
  //    A pontuação em volta VOLTA no lugar. Medido na varredura das 18.449:
  //    sem isto, "AGUA, SABORES E SABERES" saía "Água Sabores e Saberes" —
  //    o reparo comia a vírgula, porque a palavra era comparada já sem ela.
  //    Conserto que apaga pontuação do nome do cliente não é conserto.
  const cerca = bruto.match(/^([^0-9A-Za-zÀ-ÿ]*)(.*?)([^0-9A-Za-zÀ-ÿ]*)$/);
  const miolo = cerca ? cerca[2] : bruto;
  const consertado = repara(miolo.toLocaleLowerCase("pt-BR"), anterior);
  if (consertado && cerca) {
    const corpo = primeira || !PARTICULAS.has(consertado) ? subir(consertado) : consertado;
    return cerca[1] + corpo + cerca[3];
  }

  // 3. Sigla jurídica, UF e numeral romano: caixa alta é a grafia certa.
  if (SIGLAS.has(alto) || UFS.has(alto) || (alto.length > 1 && ROMANO.test(alto))) {
    return bruto.toUpperCase();
  }
  // 4. Palavra sem NENHUMA vogal é sigla ("MDXS", "WCG", "LJ", "RCS").
  //    Medido: 553 nomes na base têm uma dessas — virariam "Mdxs" num
  //    Título ingênuo, que é o defeito clássico deste tipo de conserto.
  if (so.length >= 2 && !VOGAIS.test(so) && /[a-z]/i.test(so)) return bruto.toUpperCase();
  // 5. Só número ou pontuação passa direto ("499", "&").
  if (!/[a-zà-ÿ]/i.test(so)) return bruto;

  const baixo = bruto.toLocaleLowerCase("pt-BR");
  // 6. LTDA vira "Ltda" — é abreviação de palavra, não sigla de iniciais.
  if (alto === "LTDA" || alto === "LTDA.") return subir(baixo);
  // 7. Partícula no meio do nome fica embaixo.
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
  // A palavra anterior EM MINÚSCULA — o "Gs" só vira "Gás" depois de um "e".
  let anterior: string | null = null;
  const pronto = bruto
    .split(" ")
    .map(palavra => {
      const antesDesta = anterior;
      anterior = palavra.toLocaleLowerCase("pt-BR");
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
            .map((sub, i) => (i === 0 ? pedaco(sub, ehPrimeira, antesDesta) : subir(sub.toLocaleLowerCase("pt-BR"))))
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
