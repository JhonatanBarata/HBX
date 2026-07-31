// COMEX — ISO 3166-1 alpha-3 (Comex Stat / aux_pais.CO_PAIS_ISOA3) → alpha-2
// (classes do pacote `flag-icons`: fi fi-<a2>). Cobre os parceiros comerciais
// relevantes do Brasil; código fora do mapa → sem bandeira (badge neutro com a
// sigla — dado sem contrato mostra "—", nunca bandeira errada).
const ISO3_TO_ISO2: Record<string, string> = {
  AFG: "af", AGO: "ao", ALB: "al", AND: "ad", ARE: "ae", ARG: "ar", ARM: "am",
  AUS: "au", AUT: "at", AZE: "az", BEL: "be", BGD: "bd", BGR: "bg", BHR: "bh",
  BHS: "bs", BIH: "ba", BLR: "by", BLZ: "bz", BMU: "bm", BOL: "bo", BRA: "br",
  BRB: "bb", BRN: "bn", BTN: "bt", BWA: "bw", CAN: "ca", CHE: "ch", CHL: "cl",
  CHN: "cn", CIV: "ci", CMR: "cm", COD: "cd", COG: "cg", COL: "co", CRI: "cr",
  CUB: "cu", CUW: "cw", CYP: "cy", CZE: "cz", DEU: "de", DNK: "dk", DOM: "do",
  DZA: "dz", ECU: "ec", EGY: "eg", ESP: "es", EST: "ee", ETH: "et", FIN: "fi",
  FJI: "fj", FRA: "fr", GAB: "ga", GBR: "gb", GEO: "ge", GHA: "gh", GIN: "gn",
  GRC: "gr", GTM: "gt", GUY: "gy", HKG: "hk", HND: "hn", HRV: "hr", HTI: "ht",
  HUN: "hu", IDN: "id", IND: "in", IRL: "ie", IRN: "ir", IRQ: "iq", ISL: "is",
  ISR: "il", ITA: "it", JAM: "jm", JOR: "jo", JPN: "jp", KAZ: "kz", KEN: "ke",
  KGZ: "kg", KHM: "kh", KOR: "kr", KWT: "kw", LAO: "la", LBN: "lb", LBY: "ly",
  LKA: "lk", LTU: "lt", LUX: "lu", LVA: "lv", MAC: "mo", MAR: "ma", MDA: "md",
  MDG: "mg", MEX: "mx", MKD: "mk", MLI: "ml", MLT: "mt", MMR: "mm", MNE: "me",
  MNG: "mn", MOZ: "mz", MRT: "mr", MUS: "mu", MYS: "my", NAM: "na", NER: "ne",
  NGA: "ng", NIC: "ni", NLD: "nl", NOR: "no", NPL: "np", NZL: "nz", OMN: "om",
  PAK: "pk", PAN: "pa", PER: "pe", PHL: "ph", PNG: "pg", POL: "pl", PRI: "pr",
  PRT: "pt", PRY: "py", QAT: "qa", ROU: "ro", RUS: "ru", SAU: "sa", SDN: "sd",
  SEN: "sn", SGP: "sg", SLV: "sv", SRB: "rs", SUR: "sr", SVK: "sk", SVN: "si",
  SWE: "se", SYR: "sy", THA: "th", TJK: "tj", TKM: "tm", TTO: "tt", TUN: "tn",
  TUR: "tr", TWN: "tw", TZA: "tz", UKR: "ua", URY: "uy", USA: "us", UZB: "uz",
  VEN: "ve", VNM: "vn", YEM: "ye", ZAF: "za", ZMB: "zm", ZWE: "zw",
};

export function iso3ToIso2(iso3: string | null | undefined): string | null {
  if (!iso3) return null;
  return ISO3_TO_ISO2[String(iso3).trim().toUpperCase()] || null;
}
