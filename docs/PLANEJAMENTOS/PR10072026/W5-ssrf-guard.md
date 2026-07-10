# W5 — P0.5: guard SSRF no website-crawl (antes de ligar a flag)
Validador central: resolve A/AAAA e bloqueia loopback/RFC1918/link-local/ULA/multicast/IPv4-mapped/metadata;
fetch redirect:'manual' com revalidação por hop (máx 3), caps de tempo/bytes. Aplicar no provider do
website-crawl (cobre radar source + night-factory). Testes unit com DNS mockado.
