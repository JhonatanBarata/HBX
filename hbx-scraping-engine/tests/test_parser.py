from app.services.parser import parse_page


def test_parse_jsonld_local_business() -> None:
    html = """
    <html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "AutoRepair",
        "name": "Auto Mecânica Teste",
        "telephone": "+55 19 99999-9999",
        "url": "https://automecanica.example.com.br",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "Rua A, 123",
          "addressLocality": "Americana",
          "addressRegion": "SP"
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.7",
          "reviewCount": "42"
        }
      }
      </script>
    </head><body></body></html>
    """

    contacts, _ = parse_page(html, "https://automecanica.example.com.br")

    assert contacts[0]["name"] == "Auto Mecânica Teste"
    assert contacts[0]["phoneDigits"] == "19999999999"
    assert contacts[0]["rating"] == 4.7
    assert contacts[0]["reviews"] == 42
    assert contacts[0]["address"] == "Rua A, 123, Americana, SP"
    assert contacts[0]["website"] == "https://automecanica.example.com.br"
    assert "probableWhatsApp" not in contacts[0]
    assert "googleMapsUrl" not in contacts[0]


def test_parse_tel_link() -> None:
    html = """
    <html>
      <head><title>Oficina Boa - Contato</title></head>
      <body>
        <h1>Oficina Boa</h1>
        <a href="tel:+551934611234">Ligar</a>
      </body>
    </html>
    """

    contacts, _ = parse_page(html, "https://oficinaboa.example.com.br/contato")

    assert len(contacts) == 1
    assert contacts[0]["name"] == "Oficina Boa"
    assert contacts[0]["phone"] == "(19) 3461-1234"
    assert contacts[0]["phoneDigits"] == "1934611234"


def test_parse_blocks_generic_name() -> None:
    html = """
    <html>
      <head><title>Oficina Mecânica</title></head>
      <body>
        <h1>Oficina Mecânica</h1>
        <a href="tel:+551934611234">Ligar</a>
      </body>
    </html>
    """

    contacts, _ = parse_page(html, "https://oficinagenerica.example.com.br")

    assert contacts == []
