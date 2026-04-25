from __future__ import annotations

from datetime import datetime
from io import BytesIO
import os
from urllib.parse import quote

from openpyxl.utils import get_column_letter
import pandas as pd
import streamlit as st
from dotenv import load_dotenv

from services.cities import load_brazilian_cities
from services.google_places import (
    GooglePlacesError,
    get_place_details,
    inspect_google_places_runtime,
    search_places,
)
from utils.phone import (
    canonical_br_phone,
    is_likely_valid_br_phone,
    is_likely_whatsapp,
)


load_dotenv()

SEGMENT_OPTIONS = [
    "Lanchonetes",
    "Oficinas",
    "Bares",
    "Clinicas",
    "Mercados",
    "Saloes de beleza",
    "Academias",
    "Outro (digitar)",
]

DEFAULT_SCRIPT_TEMPLATE = (
    "Oi, tudo bem? Aqui é {speaker} da {company}. "
    "Vi a {name} em {city} e trabalho com solução para {segment} "
    "que ajuda a aumentar vendas e retorno de clientes. "
    "Posso te explicar em 1 minuto e ver se faz sentido para vocês?"
)
SEARCH_HISTORY_KEY = "webscraping_search_history_v1"
SEARCH_HISTORY_LIMIT = 10


def build_call_script(
    name: str,
    segment: str,
    city: str,
    user_name: str = "",
    company_name: str = "",
    template: str = DEFAULT_SCRIPT_TEMPLATE,
) -> str:
    speaker = user_name.strip() or "[SEU NOME]"
    company = company_name.strip() or "[SUA EMPRESA]"
    script_template = template.strip() or DEFAULT_SCRIPT_TEMPLATE
    try:
        return script_template.format(
            speaker=speaker,
            company=company,
            name=name,
            city=city,
            segment=segment.lower(),
        )
    except KeyError:
        return DEFAULT_SCRIPT_TEMPLATE.format(
            speaker=speaker,
            company=company,
            name=name,
            city=city,
            segment=segment.lower(),
        )


def build_whatsapp_url(phone_number: str, message_text: str) -> str:
    digits = canonical_br_phone(phone_number)
    if not digits:
        return ""
    return f"https://wa.me/55{digits}?text={quote(str(message_text or ''), safe='')}"


def build_call_url(phone_number: str) -> str:
    digits = canonical_br_phone(phone_number)
    if not digits:
        return ""
    return f"tel:+55{digits}"


@st.cache_data(ttl=60 * 60 * 12, show_spinner=False)
def cached_search_places(query: str, limit: int) -> list[dict[str, object]]:
    return search_places(query=query, limit=limit)


@st.cache_data(ttl=60 * 60 * 12, show_spinner=False)
def cached_place_details(place_id: str) -> dict[str, object]:
    return get_place_details(place_id)


def get_search_history() -> list[dict[str, object]]:
    return list(st.session_state.get(SEARCH_HISTORY_KEY, []))


def save_search_history(entry: dict[str, object]) -> None:
    current = get_search_history()
    signature = (
        str(entry.get("city") or "").strip().lower(),
        str(entry.get("segment") or "").strip().lower(),
        int(entry.get("quantity") or 0),
        float(entry.get("min_rating") or 0),
        int(entry.get("min_reviews") or 0),
        str(entry.get("company_size_filter") or "").strip().lower(),
    )
    filtered = []
    for item in current:
        item_signature = (
            str(item.get("city") or "").strip().lower(),
            str(item.get("segment") or "").strip().lower(),
            int(item.get("quantity") or 0),
            float(item.get("min_rating") or 0),
            int(item.get("min_reviews") or 0),
            str(item.get("company_size_filter") or "").strip().lower(),
        )
        if item_signature != signature:
            filtered.append(item)
    st.session_state[SEARCH_HISTORY_KEY] = [entry, *filtered][:SEARCH_HISTORY_LIMIT]


def apply_history_entry(entry: dict[str, object]) -> None:
    segment = str(entry.get("segment") or "").strip()
    st.session_state["webscraping_city"] = str(entry.get("city") or "").strip() or None
    st.session_state["webscraping_segment_choice"] = (
        segment if segment in SEGMENT_OPTIONS else "Outro (digitar)"
    )
    st.session_state["webscraping_custom_segment"] = "" if segment in SEGMENT_OPTIONS else segment
    st.session_state["webscraping_quantity"] = int(entry.get("quantity") or 10)
    st.session_state["webscraping_min_rating"] = float(entry.get("min_rating") or 3.5)
    st.session_state["webscraping_min_reviews"] = int(entry.get("min_reviews") or 10)
    st.session_state["webscraping_company_size_filter"] = str(
        entry.get("company_size_filter") or "Todos"
    )
    st.session_state["webscraping_script_template"] = str(
        entry.get("script_template") or DEFAULT_SCRIPT_TEMPLATE
    )


def read_identity_from_query() -> tuple[str, str]:
    query_params = st.query_params

    def read_value(key: str) -> str:
        value = query_params.get(key, "")
        if isinstance(value, list):
            value = value[0] if value else ""
        return str(value or "").strip()

    return read_value("user_name"), read_value("company_name")


def render_runtime_banner(payload: dict[str, object]) -> None:
    code = str(payload.get("code") or "")
    message = str(payload.get("message") or "")

    if code == "missing_google_api_key":
        st.error(message)
        st.caption(
            "A interface abriu, mas o modulo nao consegue consultar Google Places ate a credencial master ser configurada."
        )
        return

    if code == "mock_mode":
        st.warning(message)
        st.caption("Os resultados exibidos sao demonstrativos enquanto o servico estiver em MOCK_MODE.")
        return

    st.success(message)


def build_export_dataframe(
    df: pd.DataFrame,
    segment: str,
    city: str,
    user_name: str,
    company_name: str,
    script_template: str,
) -> pd.DataFrame:
    export_rows: list[dict[str, object]] = []

    for _, row in df.iterrows():
        script = build_call_script(
            str(row["Nome"]),
            segment,
            city,
            user_name,
            company_name,
            template=script_template,
        )
        website = str(row["Website"] or "").strip()
        google_maps = str(row["Google Maps"] or "").strip()
        export_rows.append(
            {
                "Nome": row["Nome"],
                "Telefone": row["Telefone"],
                "WhatsApp (provável)": row["WhatsApp (provável)"],
                "Porte estimado": row["Porte estimado"],
                "Nota": row["Nota"],
                "Avaliações": row["Avaliações"],
                "Endereco": row["Endereco"],
                "Website": f'=HYPERLINK("{website}", "Abrir site")' if website else "",
                "Google Maps": f'=HYPERLINK("{google_maps}", "Abrir mapa")'
                if google_maps
                else "",
                "Roteiro pronto": script,
            }
        )

    return pd.DataFrame(export_rows)


def build_excel_bytes(df: pd.DataFrame) -> bytes:
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Contatos")
        worksheet = writer.sheets["Contatos"]

        for idx, column in enumerate(df.columns, start=1):
            max_len = max(
                [len(str(column))]
                + [len(str(value)) for value in df[column].fillna("")],
            )
            column_letter = get_column_letter(idx)
            worksheet.column_dimensions[column_letter].width = min(max(max_len + 2, 14), 60)

    buffer.seek(0)
    return buffer.getvalue()


def run_search(
    city: str,
    segment: str,
    quantity: int,
    min_rating: float,
    min_reviews: int,
    company_size_filter: str,
) -> pd.DataFrame:
    query = f"{segment} em {city}"
    places = cached_search_places(query=query, limit=quantity * 4)

    rows = []
    seen_phones: set[str] = set()

    for place in places:
        place_id = place.get("place_id")
        if not place_id:
            continue

        details = cached_place_details(place_id)
        phone = details.get("international_phone_number") or details.get(
            "formatted_phone_number", ""
        )
        if not phone or not is_likely_valid_br_phone(phone):
            continue

        canonical_phone = canonical_br_phone(phone)
        if not canonical_phone or canonical_phone in seen_phones:
            continue

        rating = float(details.get("rating", 0) or 0)
        reviews = int(details.get("user_ratings_total", 0) or 0)
        if rating < min_rating or reviews < min_reviews:
            continue
        estimated_size = estimate_company_size(reviews=reviews)
        if company_size_filter != "Todos" and estimated_size != company_size_filter:
            continue

        seen_phones.add(canonical_phone)
        rows.append(
            {
                "Nome": details.get("name", ""),
                "Telefone": phone,
                "Telefone canônico": canonical_phone,
                "WhatsApp (provável)": "Sim" if is_likely_whatsapp(phone) else "Não",
                "Porte estimado": estimated_size,
                "Nota": rating,
                "Avaliações": reviews,
                "Endereco": details.get("formatted_address", ""),
                "Website": details.get("website", ""),
                "Google Maps": details.get("url", ""),
            }
        )
        if len(rows) >= quantity:
            break

    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values(by=["Nota", "Avaliações"], ascending=[False, False]).reset_index(
            drop=True
        )
    return df


def estimate_company_size(reviews: int) -> str:
    # A API do Google Places não retorna capital social.
    # Usamos o volume de avaliações como proxy operacional de porte.
    if reviews >= 200:
        return "Grande"
    if reviews >= 50:
        return "Medio"
    return "Pequeno"


def main() -> None:
    st.set_page_config(page_title="Prospeccao Local", layout="wide")
    runtime_payload = inspect_google_places_runtime()

    st.title("Prospecção Local de Negócios")
    st.caption(
        "Busque negócios por cidade e segmento com telefone válido, nota e provável WhatsApp."
    )
    render_runtime_banner(runtime_payload)

    with st.expander("Possibilidades e limites", expanded=True):
        st.markdown(
            "- Usa API oficial (mais estável que scraping bruto).\n"
            "- Nem todo negócio publica telefone.\n"
            "- WhatsApp é por heurística (número móvel), sem confirmação oficial.\n"
            "- Porte estimado usa volume de avaliações; capital social não é fornecido pela API."
        )

    try:
        cities = load_brazilian_cities()
    except Exception as exc:
        st.error(f"Erro ao carregar cidades do IBGE: {exc}")
        return

    user_name, company_name = read_identity_from_query()

    history = get_search_history()
    if history:
        with st.expander("Historico recente", expanded=False):
            selected_history_index = st.selectbox(
                "Reaproveitar filtros",
                options=list(range(len(history))),
                format_func=lambda idx: (
                    f"{history[idx].get('city')} | {history[idx].get('segment')} | {history[idx].get('saved_at')}"
                ),
                key="webscraping_history_index",
            )
            if st.button("Carregar pesquisa anterior", use_container_width=True):
                apply_history_entry(history[selected_history_index])
                st.rerun()

    col1, col2, col3 = st.columns(3)
    with col1:
        city = st.selectbox(
            "Qual cidade?",
            options=cities,
            index=None,
            placeholder="Digite para buscar cidade...",
            key="webscraping_city",
        )
    with col2:
        segment_choice = st.selectbox(
            "Qual Segmento?",
            options=SEGMENT_OPTIONS,
            index=0,
            key="webscraping_segment_choice",
        )
        custom_segment = ""
        if segment_choice == "Outro (digitar)":
            custom_segment = st.text_input(
                "Digite o segmento",
                placeholder="Ex: pet shop",
                key="webscraping_custom_segment",
            )
        segment = custom_segment.strip() if custom_segment.strip() else segment_choice
    with col3:
        quantity = st.selectbox(
            "Listar Quantidades",
            options=list(range(10, 101, 10)),
            index=0,
            key="webscraping_quantity",
        )

    f1, f2, f3 = st.columns(3)
    with f1:
        min_rating = st.select_slider(
            "Nota minima",
            options=[0.0, 2.5, 3.0, 3.5, 4.0, 4.5],
            value=3.5,
            key="webscraping_min_rating",
        )
    with f2:
        min_reviews = st.selectbox(
            "Minimo de avaliacoes",
            options=[0, 5, 10, 20, 50, 100, 200],
            index=2,
            key="webscraping_min_reviews",
        )
    with f3:
        company_size_filter = st.selectbox(
            "Porte estimado",
            options=["Todos", "Pequeno", "Medio", "Grande"],
            index=0,
            help="Estimativa por volume de avaliacoes no Google. Capital social nao e retornado pela API.",
            key="webscraping_company_size_filter",
        )

    script_template = st.text_area(
        "Template do roteiro",
        value=st.session_state.get("webscraping_script_template", DEFAULT_SCRIPT_TEMPLATE),
        key="webscraping_script_template",
        height=120,
        help=(
            "Voce pode editar o texto-base. Variaveis disponiveis: {speaker}, {company}, {name}, {city}, {segment}."
        ),
    )

    search_clicked = st.button("Buscar contatos", type="primary", use_container_width=True)
    if not search_clicked:
        return

    if not city:
        st.warning("Selecione uma cidade.")
        return
    if not segment or segment == "Outro (digitar)":
        st.warning("Informe um segmento valido.")
        return
    if str(runtime_payload.get("code") or "") == "missing_google_api_key":
        return

    with st.spinner("Pesquisando negocios e validando contatos..."):
        try:
            df = run_search(
                city=city,
                segment=segment,
                quantity=quantity,
                min_rating=float(min_rating),
                min_reviews=min_reviews,
                company_size_filter=company_size_filter,
            )
        except GooglePlacesError as exc:
            st.error(exc.message)
            return
        except Exception as exc:
            st.error(f"Erro durante a busca: {exc}")
            return

    if df.empty:
        st.info("Nenhum contato encontrado com os filtros atuais.")
        return

    save_search_history(
        {
            "city": city,
            "segment": segment,
            "quantity": quantity,
            "min_rating": float(min_rating),
            "min_reviews": int(min_reviews),
            "company_size_filter": company_size_filter,
            "script_template": script_template,
            "saved_at": datetime.now().strftime("%d/%m %H:%M"),
        }
    )

    export_df = build_export_dataframe(df, segment, city, user_name, company_name, script_template)

    st.success(f"{len(df)} contatos unicos encontrados.")
    st.dataframe(
        df.drop(columns=["Telefone canonico"]),
        column_config={
            "Website": st.column_config.LinkColumn("Website"),
            "Google Maps": st.column_config.LinkColumn("Google Maps"),
        },
        use_container_width=True,
    )
    st.download_button(
        "Baixar Excel com links",
        data=build_excel_bytes(export_df),
        file_name=f"contatos_{segment}_{city}.xlsx".replace(" ", "_"),
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        use_container_width=True,
    )
    st.caption(
        "O arquivo vem com links clicaveis para site/mapa e roteiro pronto. As buscas repetidas iguais passam a reaproveitar cache para economizar API."
    )

    st.subheader("Roteiro de ligacao por contato")
    for idx, row in df.iterrows():
        script_key = f"script_{idx}_{row['Telefone canonico']}"
        if script_key not in st.session_state:
            st.session_state[script_key] = build_call_script(
                str(row["Nome"]),
                segment,
                city,
                user_name,
                company_name,
                template=script_template,
            )
        with st.container(border=True):
            st.markdown(f"**{row['Nome']}**")
            st.write(f"Telefone: {row['Telefone']}")
            st.write(f"Nota: {row['Nota']} | Avaliacoes: {row['Avaliacoes']}")
            edited_script = st.text_area(
                "Edite o roteiro antes de agir",
                key=script_key,
                height=120,
            )
            whatsapp_url = build_whatsapp_url(str(row["Telefone canonico"]), edited_script)
            call_url = build_call_url(str(row["Telefone canonico"]))
            action_col1, action_col2, action_col3 = st.columns(3)
            with action_col1:
                if whatsapp_url:
                    st.link_button("Abrir no WhatsApp", whatsapp_url, use_container_width=True)
            with action_col2:
                if call_url:
                    st.link_button("Ligar agora", call_url, use_container_width=True)
            with action_col3:
                st.caption("Edite o texto acima e copie manualmente se quiser ajustar mais.")


if __name__ == "__main__":
    main()
