import { Injectable, Logger } from '@nestjs/common';

/**
 * COMEX — Notícias (N3). Agregador RSS de comércio exterior em 3 idiomas.
 *
 * Modelo jurídico "Google News": manchete + fonte NOMEADA + link pro original —
 * nunca o texto integral (isso exigiria licença). Parser RSS próprio e tolerante
 * (zero dependência nova — o volume de node_modules do container dev não
 * acompanha package.json; ver memória da frente). Feed fora do ar é PULADO em
 * silêncio: notícia é acessório, nunca derruba o módulo.
 *
 * Tags por dicionário (porto/tema) — determinístico e instantâneo. Upgrade
 * planejado (N4): qwen local via ai-gateway taggeando por NCM.
 */

export type ComexNoticia = {
  titulo: string;
  link: string;
  fonte: string;
  lang: 'pt' | 'en' | 'es';
  data: string | null;
  tags: string[];
};

const FEEDS: Array<{ url: string; fonte: string; lang: ComexNoticia['lang'] }> = [
  { url: 'https://comexdobrasil.com/feed', fonte: 'Comex do Brasil', lang: 'pt' },
  { url: 'https://www.datamarnews.com/feed', fonte: 'DatamarNews', lang: 'pt' },
  { url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', fonte: 'Agência Brasil', lang: 'pt' },
  { url: 'https://gcaptain.com/feed/', fonte: 'gCaptain', lang: 'en' },
  { url: 'https://theloadstar.com/feed/', fonte: 'The Loadstar', lang: 'en' },
  { url: 'https://splash247.com/feed/', fonte: 'Splash 247', lang: 'en' },
  { url: 'https://www.hellenicshippingnews.com/feed/', fonte: 'Hellenic Shipping News', lang: 'en' },
  { url: 'https://portalportuario.cl/feed/', fonte: 'PortalPortuario', lang: 'es' },
  { url: 'https://www.webpicking.com/feed/', fonte: 'Webpicking', lang: 'es' },
];

// Dicionário de tags — chave canônica → termos que a acionam (minúsculo, sem acento).
const TAG_TERMS: Record<string, string[]> = {
  Santos: ['santos'],
  'Itajaí/Navegantes': ['itajai', 'navegantes'],
  Paranaguá: ['paranagua'],
  Suape: ['suape'],
  'Rio Grande': ['rio grande'],
  Manaus: ['manaus'],
  Itaqui: ['itaqui'],
  Pecém: ['pecem'],
  greve: ['greve', 'strike', 'huelga', 'paralisa'],
  frete: ['frete', 'freight', 'flete'],
  contêiner: ['conteiner', 'container', 'contenedor', 'teu'],
  tarifa: ['tarifa', 'tariff', 'arancel', 'imposto de importacao'],
  câmbio: ['cambio', 'dolar', 'dollar', 'exchange rate'],
  China: ['china', 'chinese', 'chino'],
  aduana: ['aduana', 'alfandega', 'customs', 'receita federal', 'duimp', 'siscomex'],
  porto: ['porto ', 'port of', 'puerto', 'portuari'],
};

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function tagsFor(titulo: string): string[] {
  const alvo = ` ${normalize(titulo)} `;
  const out: string[] = [];
  for (const [tag, termos] of Object.entries(TAG_TERMS)) {
    if (termos.some((t) => alvo.includes(t))) out.push(tag);
  }
  return out.slice(0, 4);
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/<[^>]+>/g, '')
    .trim();
}

// Parser RSS 2.0 tolerante: só title/link/pubDate de cada <item>. Atom (<entry>)
// coberto no mesmo passo. Feed que não casar nada devolve [] — nunca lança.
function parseRss(xml: string): Array<{ titulo: string; link: string; data: string | null }> {
  const items: Array<{ titulo: string; link: string; data: string | null }> = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/g) || [];
  for (const block of blocks) {
    const titulo = decodeEntities(block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '');
    const linkTag = block.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.trim()
      || block.match(/<link[^>]*href="([^"]+)"/)?.[1]
      || '';
    const link = decodeEntities(linkTag);
    const data = block.match(/<(?:pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/)?.[1]?.trim() || null;
    if (titulo && link.startsWith('http')) items.push({ titulo, link, data });
  }
  return items;
}

const CACHE_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class ComexNewsService {
  private readonly logger = new Logger('ComexNews');
  private cache: { at: number; noticias: ComexNoticia[] } | null = null;
  private inflight: Promise<ComexNoticia[]> | null = null;

  async noticias(lang?: string): Promise<{ atualizadoEm: string | null; itens: ComexNoticia[] }> {
    const all = await this.getAll();
    const filtro = ['pt', 'en', 'es'].includes(String(lang)) ? lang : null;
    return {
      atualizadoEm: this.cache ? new Date(this.cache.at).toISOString() : null,
      itens: (filtro ? all.filter((n) => n.lang === filtro) : all).slice(0, 60),
    };
  }

  private async getAll(): Promise<ComexNoticia[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.noticias;
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }
    // Cache velho serve enquanto atualiza; primeira chamada espera o fetch.
    return this.cache ? this.cache.noticias : this.inflight;
  }

  private async refresh(): Promise<ComexNoticia[]> {
    const results = await Promise.allSettled(
      FEEDS.map(async (feed) => {
        const res = await fetch(feed.url, {
          signal: AbortSignal.timeout(10_000),
          headers: { 'user-agent': 'Mozilla/5.0 (HBX Comex reader)' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        return parseRss(xml).slice(0, 12).map((item) => ({
          titulo: item.titulo,
          link: item.link,
          fonte: feed.fonte,
          lang: feed.lang,
          data: item.data ? new Date(item.data).toISOString() : null,
          tags: tagsFor(item.titulo),
        }));
      }),
    );
    const noticias: ComexNoticia[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') noticias.push(...r.value);
      else this.logger.warn(`feed fora do ar (pulado): ${FEEDS[i].fonte} — ${r.reason?.message || r.reason}`);
    });
    noticias.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
    this.cache = { at: Date.now(), noticias };
    return noticias;
  }
}
