# App de Prospecção Local

App em Streamlit para buscar negócios por cidade e segmento e listar telefones com indicação de provável WhatsApp.

## Requisitos

- Python 3.10+
- Chave da Google Places API (`GOOGLE_PLACES_API_KEY`)

## Instalação

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edite `.env` e preencha sua chave:

```env
GOOGLE_PLACES_API_KEY=sua_chave
```

## Executar

```powershell
streamlit run app.py
```

## Fluxo no app

1. Escolher cidade (com busca por digitação).
2. Escolher segmento (ou digitar um personalizado).
3. Escolher quantidade (10 a 100).
4. Opcional: aplicar filtros de `nota minima` e `minimo de avaliacoes`.
5. Buscar, visualizar e exportar CSV dos resultados.
6. Copiar roteiro de ligacao individual por contato.

## Observações

- O campo `WhatsApp (provavel)` e heuristica, nao confirmacao oficial.
- Nem todos os negócios têm telefone público disponível.
- Contatos sao deduplicados por telefone canonico para reduzir repeticoes.
