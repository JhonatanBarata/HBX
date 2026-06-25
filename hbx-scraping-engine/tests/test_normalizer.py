from app.schemas import ContactResult
from app.services.discovery import _is_allowed_url
from app.services.filters import expected_ddds, is_generic_name, is_pf_technical_blocked_domain, name_conflicts_with_requested_segment
from app.services.normalizer import dedupe_contacts, fallback_name, format_phone, normalize_phone_digits


def test_normalize_phone_digits_removes_country_code() -> None:
    assert normalize_phone_digits("+55 (19) 99999-9999") == "19999999999"
    assert normalize_phone_digits("55 19 3461-1234") == "1934611234"


def test_blocks_national_generic_phone_numbers() -> None:
    assert normalize_phone_digits("0800 123 4567") is None
    assert normalize_phone_digits("(11) 4003-1234") is None
    assert normalize_phone_digits("(11) 3003-1234") is None
    assert normalize_phone_digits("(11) 3004-1000") is None
    assert normalize_phone_digits("(55) 4000-1179") is None
    assert normalize_phone_digits("(01) 93461-2811") is None
    assert normalize_phone_digits("(80) 0665-1515") is None


def test_rio_claro_uses_local_ddd_19_override() -> None:
    assert expected_ddds("Rio Claro", "SP") == {"19"}


def test_format_phone() -> None:
    assert format_phone("19999999999") == "(19) 99999-9999"
    assert format_phone("1934611234") == "(19) 3461-1234"


def test_dedupe_contacts_by_phone_digits() -> None:
    contacts = dedupe_contacts(
        [
            {"name": "Oficina A", "phone": "(19) 99999-9999"},
            {"name": "Oficina A duplicada", "phoneDigits": "19999999999", "phone": "+55 19 99999-9999"},
        ]
    )

    assert len(contacts) == 1
    assert contacts[0]["phoneDigits"] == "19999999999"


def test_pf_uses_fallback_for_generic_name() -> None:
    assert fallback_name("Contato", "Americana", "pf") == "Contato encontrado - Americana"
    assert fallback_name("", "Americana", "pf") == "Contato encontrado - Americana"


def test_dedupe_limits_same_domain_and_name_to_two_phones() -> None:
    contacts = dedupe_contacts(
        [
            {"name": "Centro Automotivo Bom", "phone": "(19) 99999-0001", "website": "https://bom.example.com"},
            {"name": "Centro Automotivo Bom", "phone": "(19) 99999-0002", "website": "https://bom.example.com"},
            {"name": "Centro Automotivo Bom", "phone": "(19) 99999-0003", "website": "https://bom.example.com"},
        ],
        city="Americana",
    )

    assert len(contacts) == 2


def test_blocks_generic_names_and_bad_domains() -> None:
    assert is_generic_name("Oficina Mecânica", "Americana")
    assert is_generic_name("Mecânica em Americana", "Americana")
    assert is_generic_name("Pesquise outros bares em Boituva", "Boituva", "pj", "bares")
    assert is_generic_name("Farmacia &#8211; veja mais", "Boituva", "pj", "farmacias")
    assert is_generic_name("Imobiliárias em Rubiácea", "Rubiácea", "pj", "imobiliárias")
    assert is_generic_name("Conheça o Rio Paraná", "Santa Fé do Sul", "pj", "turismo")
    assert is_generic_name("10 MELHORES Farmácias e Drogarias em Santa Rita do Passa Quatro, SP", "Santa Rita do Passa Quatro", "pj", "farmacias")
    assert is_generic_name("Bares e Restaurantes em Cubatao, SP", "Cubatão", "pj", "bares")
    assert is_generic_name("WhatsApp da Mateus Auto Peças e Acessórios em Araraquara SP", "Araraquara", "pj", "auto peças")
    assert is_generic_name("Preço de Locação de Aparelho Básico para Clínica de Estética Rio Claro", "Rio Claro", "pj", "clinica de estetica")
    assert is_generic_name("Contato encontrado - Santa Cruz do Rio Pardo", "Santa Cruz do Rio Pardo", "pj", "telefone")
    assert is_generic_name("Clínicas de Estética e Esteticistas em Altair, SP", "Altair", "pj", "Beleza")
    assert is_generic_name("Clínicas de Saúde e Beleza Rio Claro SP", "Rio Claro", "pj", "beleza")
    assert is_generic_name("Instituto da Beleza em Rio Claro", "Rio Claro", "pj", "beleza")
    assert is_generic_name("Assistência Técnica da Brastemp: Tudo o Que Você Precisa Saber para Contratar o Serviço Ideal", "Tejupá", "pj", "assistência técnica")
    assert is_generic_name("Ar-Condicionado Split HW Inverter Hitachi AirHome 600 12.000 BTUs Só Frio 220V", "Arealva", "pj", "ar condicionado")
    assert is_generic_name("Produtos em destaque", "Taquaritinga", "pj", "lojas")
    assert is_generic_name("Hospedagem pé na areia na Praia das Toninhas em Ubatuba!", "Paraíso", "pj", "whatsapp")
    assert is_generic_name("Aromas para motéis: Redefinindo o conforto e a sedução olfativa", "Meridiano", "pj", "motéis")
    assert is_generic_name("Meridiano seguros: tipos de seguros y teléfonos", "Meridiano", "pj", "seguros")
    assert is_generic_name("Barbeiro de 26 anos é executado dentro de estabelecimento em Ubatuba", "Altair", "pj", "barbearias")
    assert is_generic_name("CEP 15430-959 Avenida Quatro, 290", "Altair", "pj", "perfumarias")
    assert is_generic_name("Morango do amor: a tendência que pede embalagens criativas", "Arealva", "pj", "embalagens")
    assert is_generic_name("DEPÓSITO DE BEBIDAS", "Mendonça", "pj", "depósitos de bebidas")
    assert is_generic_name("UNIFIPA realiza provas para Fellow Nível 4 nas áreas de Radiologia e Ginecologia", "Areias", "pj", "radiologia")
    assert is_generic_name("Contaminação em posto de combustível", "Taiaçu", "pj", "postos de combustível")
    assert is_generic_name("Governo lança sistema para aluno buscar instrutor e autoescola", "Areias", "pj", "autoescolas")
    assert is_generic_name("Associado Sindautoescola.SP, acesse sua área exclusiva. SÓ PRA SÓCIO", "Areias", "pj", "autoescolas")
    assert is_generic_name("Dúvidas Frequentes", "Catiguá", "pj", "motéis")
    assert is_generic_name("Relação das secretarias, diretorias e departamentos da Prefeitura Municipal de Catiguá e respectivos responsáveis", "Catiguá", "pj", "monitoramento")
    assert is_generic_name("Loja de máquinas e ferramentas", "Catiguá", "pj", "ferramentas")
    assert is_generic_name("Encontre seu imóvel aqui", "Catiguá", "pj", "corretoras")
    assert is_generic_name("Café Mourisco variedade Catiguá 500g", "Catiguá", "pj", "cafeterias")
    assert is_generic_name("Vidraçarias no Ipiranga", "Catiguá", "pj", "vidraçarias")
    assert is_generic_name("Te damos la bienvenida a Occident", "Catiguá", "pj", "seguros")
    assert is_generic_name("Prefeitura de Catiguá SP abre processo seletivo para psicólogo e assistente social", "Catiguá", "pj", "psicólogos")
    assert is_generic_name("Produtora de vídeo em Fortaleza", "Catiguá", "pj", "produtoras de vídeo")
    assert is_generic_name("Consulta de optante do Simples Nacional: veja como fazer e evitar erros", "Catiguá", "pj", "produtoras de vídeo")
    assert is_generic_name("PISCINAS PREFABRICADAS: CALIDAD PRECIO Y MODELOS PARA CADA ESPACIO", "Catiguá", "pj", "piscinas")
    assert is_generic_name("Papel de Parede Cantinho do Café Coffee Time", "São Paulo", "pj", "decoração")
    assert is_generic_name("Piscinas de areia", "São Paulo", "pj", "piscinas")
    assert not is_generic_name("Imobiliária Meu Imóvel em Rubiácea", "Rubiácea", "pj", "imobiliárias")
    assert not is_generic_name("Barbearia Santa Fé", "Santa Fé", "pj", "barbearias")
    assert not is_generic_name("Clínica de Estética Bella Forma", "Altair", "pj", "Beleza")
    assert not is_generic_name("Goulart Materiais Para Construcao", "Teodoro Sampaio", "pj", "materiais de construção")
    assert name_conflicts_with_requested_segment("Favelas modas & Barbearia", "imobiliárias")
    assert not name_conflicts_with_requested_segment("Barbearia Santa Fé", "barbearias")
    assert not is_generic_name("Maria Silva", "Americana", "pf")
    assert is_generic_name("Americana", "Americana", "pf")
    assert is_generic_name("Categorias", "Americana", "pf")
    assert is_generic_name("Planos de Saúde em Americana", "Americana", "pf", "plano de saúde")
    assert is_generic_name("Negócios", "Americana", "pf")
    assert is_generic_name("Curso Online", "Americana", "pf")
    assert is_generic_name("Relação de Unidades", "Americana", "pf")
    assert is_generic_name("Manutenção de confiança para seu Automóvel !", "Americana")
    assert not _is_allowed_url("https://querobolsa.com.br/cursos/engenharia-mecanica")
    assert not _is_allowed_url("https://instagram.com/oficina")
    assert is_pf_technical_blocked_domain("https://youtube.com/watch?v=1")
    assert not is_pf_technical_blocked_domain("https://exame.com/noticia")


def test_schema_extra_fields_are_stored() -> None:
    # ContactResult usa extra="allow" (decisão 25/06): qualquer campo extra é aceito,
    # não descartado — dado de graça não se joga fora.
    payload = {
        "name": "Oficina A",
        "phone": "(19) 99999-9999",
        "phoneDigits": "19999999999",
        "rating": None,
        "reviews": None,
        "address": None,
        "website": None,
        "source": "hbx_scraping:web",
        "score": 72,
        "probableWhatsApp": True,
    }
    result = ContactResult.model_validate(payload)
    assert result.name == "Oficina A"
    # campos extras aceitos (extra="allow")
    assert getattr(result, "probableWhatsApp", None) is True
