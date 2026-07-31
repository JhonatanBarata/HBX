/**
 * 31/07 (frente APK-ROTA, pedido do dono: "quero abrir localização vinda do
 * whatsapp, ou copiar pelo menos e colar no HBX") — LEITURA DE LINK/TEXTO DE
 * LOCALIZAÇÃO.
 *
 * O caminho limpo é o `geo:` do Android (o "Abrir com" do WhatsApp), que o APK
 * resolve sozinho, sem servidor. Este arquivo cobre o OUTRO caso: o texto/link
 * que a pessoa COLA — e aí aparece o link curto do Google (maps.app.goo.gl), que
 * só vira coordenada depois de seguir o redirecionamento. Redirecionamento é
 * chamada de rede: mora no servidor, com cache e teto, nunca solto no aparelho.
 *
 * Regras duras (o resto do arquivo é consequência):
 * - Só hosts de mapa CONHECIDOS. Nada de "siga qualquer URL que me mandarem" —
 *   isso é o buraco clássico de SSRF (o servidor viraria proxy pra rede interna).
 * - Sem corpo de resposta: só o cabeçalho `Location`. Não lemos, não guardamos e
 *   não repassamos conteúdo do mapa de ninguém — só a coordenada que o próprio
 *   usuário já tinha em mãos.
 * - Coordenada fora da faixa válida é descartada como se não existisse.
 */

/** Faixa válida de verdade — lat/lng invertidos ou lixo não passam daqui. */
export function coordenadaValida(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) && la >= -90 && la <= 90 && ln >= -180 && ln <= 180 && !(la === 0 && ln === 0);
}

export interface DestinoLido {
  lat: number | null;
  lng: number | null;
  rotulo: string;
  /** 'url' = veio do próprio link; 'redirecionamento' = precisou abrir o link curto; 'nenhum' = não achei. */
  fonte: 'url' | 'redirecionamento' | 'texto' | 'nenhum';
}

const VAZIO: DestinoLido = { lat: null, lng: null, rotulo: '', fonte: 'nenhum' };

/**
 * Hosts que o servidor aceita ABRIR (seguir redirecionamento). Lista fechada de
 * propósito: qualquer host novo é decisão consciente, não efeito colateral.
 */
const HOSTS_MAPA = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'maps.google.com.br',
  'www.google.com',
  'google.com',
  'www.google.com.br',
  'google.com.br',
  'g.co',
]);

export function hostDeMapa(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return HOSTS_MAPA.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** "-22.4149,-47.5615" em qualquer pedaço de texto (o par vem SEMPRE junto). */
const PAR_COORDENADA = /(-?\d{1,2}(?:[.,]\d{3,8}))\s*,\s*(-?\d{1,3}(?:[.,]\d{3,8}))/;

function parseNumero(bruto: string): number {
  // Coordenada colada de app brasileiro às vezes vem com vírgula decimal; o
  // separador do PAR é a vírgula do meio, que a regex já isolou.
  return Number(String(bruto).replace(',', '.'));
}

/**
 * Extrai a coordenada da PRÓPRIA URL, sem abrir nada. Cobre os formatos que o
 * Google usa hoje: `@lat,lng,zoom`, `?q=lat,lng`, `?ll=`, `?daddr=`, `!3dlat!4dlng`.
 */
export function coordenadaDaUrl(url: string): DestinoLido {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return VAZIO;
  }
  const rotulo = decodeURIComponent(String(u.searchParams.get('q') || u.searchParams.get('destination') || ''))
    .replace(PAR_COORDENADA, '')
    .replace(/^[\s,;]+|[\s,;]+$/g, '')
    .slice(0, 120);

  for (const chave of ['q', 'll', 'daddr', 'destination', 'center', 'viewpoint']) {
    const valor = u.searchParams.get(chave);
    if (!valor) continue;
    const achado = PAR_COORDENADA.exec(valor);
    if (achado) {
      const lat = parseNumero(achado[1]);
      const lng = parseNumero(achado[2]);
      if (coordenadaValida(lat, lng)) return { lat, lng, rotulo, fonte: 'url' };
    }
  }
  // `/@-22.41,-47.56,17z` — o pino que o mapa está mostrando.
  const arroba = /@(-?\d{1,2}(?:\.\d{3,8})),(-?\d{1,3}(?:\.\d{3,8}))/.exec(u.pathname + u.search);
  if (arroba) {
    const lat = Number(arroba[1]);
    const lng = Number(arroba[2]);
    if (coordenadaValida(lat, lng)) return { lat, lng, rotulo, fonte: 'url' };
  }
  // `!3d-22.41!4d-47.56` — a coordenada do LUGAR (mais precisa que a da câmera).
  const dados = /!3d(-?\d{1,2}(?:\.\d{3,8}))!4d(-?\d{1,3}(?:\.\d{3,8}))/.exec(u.pathname + u.search);
  if (dados) {
    const lat = Number(dados[1]);
    const lng = Number(dados[2]);
    if (coordenadaValida(lat, lng)) return { lat, lng, rotulo, fonte: 'url' };
  }
  return { ...VAZIO, rotulo };
}

/** Primeiro link http(s) de um texto colado (mensagem do WhatsApp vem com texto junto). */
export function primeiroLink(texto: string): string {
  const achado = /https?:\/\/[^\s<>"']+/i.exec(String(texto || ''));
  return achado ? achado[0].replace(/[.,;)]+$/, '') : '';
}

/**
 * Lê um texto colado: coordenada solta ("-22.41, -47.56") ou link. Não abre rede
 * — quem abre é o serviço, e só pra host de mapa conhecido.
 */
export function lerTextoColado(texto: string): { destino: DestinoLido; link: string } {
  const bruto = String(texto || '').trim();
  if (!bruto) return { destino: VAZIO, link: '' };
  const link = primeiroLink(bruto);
  if (link) {
    const daUrl = coordenadaDaUrl(link);
    return { destino: daUrl, link };
  }
  const achado = PAR_COORDENADA.exec(bruto);
  if (achado) {
    const lat = parseNumero(achado[1]);
    const lng = parseNumero(achado[2]);
    if (coordenadaValida(lat, lng)) {
      const rotulo = bruto.replace(PAR_COORDENADA, '').replace(/^[\s,;-]+|[\s,;-]+$/g, '').slice(0, 120);
      return { destino: { lat, lng, rotulo, fonte: 'texto' }, link: '' };
    }
  }
  return { destino: VAZIO, link: '' };
}
