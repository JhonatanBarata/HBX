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


def test_parse_jsonld_item_list_local_businesses() -> None:
    html = """
    <html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "url": "https://www.solutudo.com.br/empresas/sp/boituva/farmacias/farmacia-bifarma-156947",
            "item": {
              "@type": "LocalBusiness",
              "name": "Farmacia Bifarma",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "R Coronel Eugenio Motta, 453",
                "addressCountry": "BR"
              },
              "telephone": "+55 15 3268-7519"
            }
          },
          {
            "@type": "ListItem",
            "position": 2,
            "url": "https://www.solutudo.com.br/empresas/sp/boituva/farmacias/pharmapele-boituva-farmacia-de-manipulacao-21679603",
            "item": {
              "@type": "LocalBusiness",
              "name": "Pharmapele Boituva - Farmácia de Manipulação",
              "telephone": "+55 15 99768-6417"
            }
          }
        ]
      }
      </script>
    </head><body></body></html>
    """

    contacts, _ = parse_page(html, "https://www.solutudo.com.br/empresas/sp/boituva/farmacias", city="Boituva")

    assert [contact["name"] for contact in contacts] == [
        "Farmacia Bifarma",
        "Pharmapele Boituva",
    ]
    assert contacts[0]["phoneDigits"] == "1532687519"
    assert contacts[0]["website"] is None
    assert contacts[1]["phoneDigits"] == "15997686417"


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


def test_parse_official_page_extracts_social_links_before_scoring() -> None:
    html = """
    <html>
      <head><title>Oficina Boa - Contato</title></head>
      <body>
        <h1>Oficina Boa</h1>
        <a href="tel:+551934611234">Ligar</a>
        <a href="https://instagram.com/oficinaboa">Instagram</a>
        <a href="https://facebook.com/oficinaboa/">Facebook</a>
        <a href="https://instagram.com/oficinaboa/reel/123">Reel</a>
      </body>
    </html>
    """

    contacts, _ = parse_page(html, "https://oficinaboa.example.com.br/contato")

    assert len(contacts) == 1
    assert contacts[0]["instagramUrl"] == "https://instagram.com/oficinaboa"
    assert contacts[0]["facebookUrl"] == "https://facebook.com/oficinaboa"
    assert contacts[0]["website"] == "https://oficinaboa.example.com.br"


def test_parse_rejects_invalid_social_urls() -> None:
    html = """
    <html>
      <head><title>Oficina Boa - Contato</title></head>
      <body>
        <h1>Oficina Boa</h1>
        <a href="tel:+551934611234">Ligar</a>
        <a href="https://instagram.com/p/abc">Post</a>
        <a href="https://instagram.com/oficinaboa/reel/123">Reel</a>
        <a href="https://instagram.com/stories/oficinaboa/123">Stories</a>
        <a href="https://facebook.com/sharer/sharer.php?u=https://oficinaboa.example.com.br">Share</a>
      </body>
    </html>
    """

    contacts, _ = parse_page(html, "https://oficinaboa.example.com.br/contato")

    assert len(contacts) == 1
    assert "instagramUrl" not in contacts[0]
    assert "facebookUrl" not in contacts[0]
    assert contacts[0]["website"] == "https://oficinaboa.example.com.br"


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


def test_parse_blocks_directory_listing_title_as_generic_name() -> None:
    html = """
    <html>
      <head><title>Confira as melhores opções em "Farmácias" em Boituva, SP</title></head>
      <body>
        <h1>Confira as melhores opções em "Farmácias" em Boituva, SP</h1>
        <a href="https://api.whatsapp.com/send?phone=5514996340966">WhatsApp</a>
      </body>
    </html>
    """

    contacts, _ = parse_page(html, "https://www.solutudo.com.br/empresas/sp/boituva/farmacias", city="Boituva")

    assert contacts == []
