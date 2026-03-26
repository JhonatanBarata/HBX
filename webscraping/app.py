from __future__ import annotations

from io import BytesIO
import json
import os

from openpyxl.utils import get_column_letter
import pandas as pd
import streamlit as st
import streamlit.components.v1 as components
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


def build_call_script(
    name: str,
    segment: str,
    city: str,
    user_name: str = "",
    company_name: str = "",
) -> str:
    speaker = user_name.strip() or "[SEU NOME]"
    company = company_name.strip() or "[SUA EMPRESA]"
    return (
        f"Oi, tudo bem? Aqui e {speaker} da {company}. "
        f"Vi a {name} em {city} e trabalho com solucao para {segment.lower()} "
        "que ajuda a aumentar vendas e retorno de clientes. "
        "Posso te explicar em 1 minuto e ver se faz sentido para voces?"
    )


def render_copy_button(text_to_copy: str, key: str) -> None:
    safe_text = json.dumps(text_to_copy)
    safe_key = "".join(ch for ch in key if ch.isalnum() or ch in ("_", "-"))
    html = f"""
    <div style="margin-top:6px;margin-bottom:4px;">
      <button id="btn-{safe_key}" style="padding:6px 10px;border-radius:8px;border:1px solid #ddd;cursor:pointer;">
        Copiar roteiro
      </button>
    </div>
    <script>
      const btn = document.getElementById("btn-{safe_key}");
      if (btn) {{
        btn.onclick = async () => {{
          try {{
            await navigator.clipboard.writeText({safe_text});
            const old = btn.innerText;
            btn.innerText = "Copiado";
            setTimeout(() => btn.innerText = old, 1200);
          }} catch (e) {{
            btn.innerText = "Falhou ao copiar";
          }}
        }};
      }}
    </script>
    """
    components.html(html, height=44)


def render_send_via_hbx_button(phone_number: str, message_text: str, key: str) -> None:
    payload = json.dumps(
        {
            "type": "HBX_SEND_WHATSAPP",
            "payload": {"to": str(phone_number or "").strip(), "body": str(message_text or "")},
        }
    )
    safe_key = "".join(ch for ch in key if ch.isalnum() or ch in ("_", "-"))
    html = f"""
    <div style="margin-top:6px;margin-bottom:4px;">
      <button id="btn-send-{safe_key}" style="padding:6px 10px;border-radius:8px;border:1px solid #0f172a;background:#0f172a;color:#fff;cursor:pointer;">
        Enviar mensagem
      </button>
    </div>
    <script>
      const sendBtn = document.getElementById("btn-send-{safe_key}");
      if (sendBtn) {{
        sendBtn.onclick = () => {{
                    window.parent.postMessage({payload}, window.location.origin);
          const old = sendBtn.innerText;
          sendBtn.innerText = "Enfileirada";
          setTimeout(() => sendBtn.innerText = old, 1200);
        }};
      }}
    </script>
    """
    components.html(html, height=44)


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
) -> pd.DataFrame:
    export_rows: list[dict[str, object]] = []

    for _, row in df.iterrows():
        script = build_call_script(str(row["Nome"]), segment, city, user_name, company_name)
        website = str(row["Website"] or "").strip()
        google_maps = str(row["Google Maps"] or "").strip()
        export_rows.append(
            {
                "Nome": row["Nome"],
                "Telefone": row["Telefone"],
                "WhatsApp (provavel)": row["WhatsApp (provavel)"],
                "Porte estimado": row["Porte estimado"],
                "Nota": row["Nota"],
                "Avaliacoes": row["Avaliacoes"],
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
    places = search_places(query=query, limit=quantity * 4)

    rows = []
    seen_phones: set[str] = set()

    for place in places:
        place_id = place.get("place_id")
        if not place_id:
            continue

        details = get_place_details(place_id)
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
                "Telefone canonico": canonical_phone,
                "WhatsApp (provavel)": "Sim" if is_likely_whatsapp(phone) else "Nao",
                "Porte estimado": estimated_size,
                "Nota": rating,
                "Avaliacoes": reviews,
                "Endereco": details.get("formatted_address", ""),
                "Website": details.get("website", ""),
                "Google Maps": details.get("url", ""),
            }
        )
        if len(rows) >= quantity:
            break

    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values(by=["Nota", "Avaliacoes"], ascending=[False, False]).reset_index(
            drop=True
        )
    return df


def estimate_company_size(reviews: int) -> str:
    # A API do Google Places nao retorna capital social.
    # Usamos o volume de avaliacoes como proxy operacional de porte.
    if reviews >= 200:
        return "Grande"
    if reviews >= 50:
        return "Medio"
    return "Pequeno"


def main() -> None:
    st.set_page_config(page_title="Prospeccao Local", layout="wide")
    runtime_payload = inspect_google_places_runtime()

    st.title("Prospeccao Local de Negocios")
    st.caption(
        "Busque negocios por cidade e segmento com telefone valido, nota e provavel WhatsApp."
    )
    render_runtime_banner(runtime_payload)

    with st.expander("Possibilidades e limites", expanded=True):
        st.markdown(
            "- Usa API oficial (mais estavel que scraping bruto).\n"
            "- Nem todo negocio publica telefone.\n"
            "- WhatsApp e por heuristica (numero movel), sem confirmacao oficial.\n"
            "- Porte estimado usa volume de avaliacoes; capital social nao e fornecido pela API."
        )

    try:
        cities = load_brazilian_cities()
    except Exception as exc:
        st.error(f"Erro ao carregar cidades do IBGE: {exc}")
        return

    user_name, company_name = read_identity_from_query()

    col1, col2, col3 = st.columns(3)
    with col1:
        city = st.selectbox(
            "Qual cidade?",
            options=cities,
            index=None,
            placeholder="Digite para buscar cidade...",
        )
    with col2:
        segment_choice = st.selectbox("Qual Segmento?", options=SEGMENT_OPTIONS, index=0)
        custom_segment = ""
        if segment_choice == "Outro (digitar)":
            custom_segment = st.text_input(
                "Digite o segmento",
                placeholder="Ex: pet shop",
            )
        segment = custom_segment.strip() if custom_segment.strip() else segment_choice
    with col3:
        quantity = st.selectbox(
            "Listar Quantidades",
            options=list(range(10, 101, 10)),
            index=0,
        )

    f1, f2, f3 = st.columns(3)
    with f1:
        min_rating = st.select_slider(
            "Nota minima",
            options=[0.0, 2.5, 3.0, 3.5, 4.0, 4.5],
            value=3.5,
        )
    with f2:
        min_reviews = st.selectbox(
            "Minimo de avaliacoes",
            options=[0, 5, 10, 20, 50, 100, 200],
            index=2,
        )
    with f3:
        company_size_filter = st.selectbox(
            "Porte estimado",
            options=["Todos", "Pequeno", "Medio", "Grande"],
            index=0,
            help="Estimativa por volume de avaliacoes no Google. Capital social nao e retornado pela API.",
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

    export_df = build_export_dataframe(df, segment, city, user_name, company_name)

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
        "O arquivo vem com links clicaveis para site/mapa e roteiro pronto. O envio WhatsApp e feito pelo botao no HBX."
    )

    st.subheader("Roteiro de ligacao por contato")
    for idx, row in df.iterrows():
        script = build_call_script(str(row["Nome"]), segment, city, user_name, company_name)
        with st.container(border=True):
            st.markdown(f"**{row['Nome']}**")
            st.write(f"Telefone: {row['Telefone']}")
            st.write(f"Nota: {row['Nota']} | Avaliacoes: {row['Avaliacoes']}")
            st.code(script, language="text")
            action_col1, action_col2 = st.columns(2)
            with action_col1:
                render_copy_button(script, key=f"copy_{idx}_{row['Telefone canonico']}")
            with action_col2:
                render_send_via_hbx_button(
                    phone_number=str(row["Telefone canonico"]),
                    message_text=script,
                    key=f"send_{idx}_{row['Telefone canonico']}",
                )


if __name__ == "__main__":
    main()
