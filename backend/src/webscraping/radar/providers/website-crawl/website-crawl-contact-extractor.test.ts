import test from 'node:test';
import assert from 'node:assert/strict';
import { WebsiteCrawlContactExtractor } from './website-crawl-contact-extractor';

const PAGE_URL = 'https://clinicahorizonte.com.br/contato';

test('extrai email plano, mailto e whatsapp como antes', () => {
  const html = `
    <html><body>
      <p>Fale com a gente: contato@clinicahorizonte.com.br</p>
      <a href="mailto:vendas@clinicahorizonte.com.br?subject=oi">E-mail</a>
      <a href="https://wa.me/5519999998888">Chame no WhatsApp</a>
    </body></html>`;
  const fields = new WebsiteCrawlContactExtractor().extract(html, PAGE_URL);

  assert.ok(fields.emails.includes('contato@clinicahorizonte.com.br'));
  assert.ok(fields.emails.includes('vendas@clinicahorizonte.com.br'));
  assert.deepEqual(fields.whatsappPhoneDigits, ['5519999998888']);
});

test('extrai email ofuscado com arroba/ponto por extenso', () => {
  const html = `
    <html><body>
      <footer>Contato: comercial (arroba) clinicahorizonte (ponto) com (ponto) br</footer>
    </body></html>`;
  const fields = new WebsiteCrawlContactExtractor().extract(html, PAGE_URL);

  assert.ok(fields.emails.includes('comercial@clinicahorizonte.com.br'));
});

test('extrai email, telefone e sameAs de JSON-LD', () => {
  const html = `
    <html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": "Clinica Horizonte",
        "email": "mailto:atendimento@clinicahorizonte.com.br",
        "telephone": "+55 19 3333-4444",
        "sameAs": [
          "https://www.instagram.com/clinicahorizonte",
          "https://www.facebook.com/clinicahorizonte"
        ]
      }
      </script>
    </head><body>Sem contato visível no corpo.</body></html>`;
  const fields = new WebsiteCrawlContactExtractor().extract(html, PAGE_URL);

  assert.ok(fields.emails.includes('atendimento@clinicahorizonte.com.br'));
  assert.ok(fields.phoneDigits.includes('551933334444'));
  assert.ok(fields.instagramUrls.some((url) => url.includes('instagram.com/clinicahorizonte')));
  assert.ok(fields.facebookUrls.some((url) => url.includes('facebook.com/clinicahorizonte')));
});

test('json-ld malformado nao quebra a extracao', () => {
  const html = `
    <html><head>
      <script type="application/ld+json">{ "email": "quebrado@</script>
    </head><body><p>suporte@clinicahorizonte.com.br</p></body></html>`;
  const fields = new WebsiteCrawlContactExtractor().extract(html, PAGE_URL);

  assert.ok(fields.emails.includes('suporte@clinicahorizonte.com.br'));
});
