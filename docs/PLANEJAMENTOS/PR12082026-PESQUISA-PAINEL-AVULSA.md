# PR12082026 — O PAINEL DE PESQUISA da parada avulsa (2c)

**Pedido do dono (12/08):** refazer a pesquisa da parada avulsa como painel interativo,
"do jeito que o mercado trabalha", GPS-ranqueado ("Bar do Zé → o mais perto de mim
primeiro"), talvez com voz. Mock de altíssimo nível para aprovação:
**`docs/mockups/pesquisa-avulsa-v2.html`**.

**Escopo da lei do CEP (dono, 12/08):** "o CEP manda em tudo" vale para CADASTRO/FILTRO,
NÃO para pesquisa. Busca interativa por rua/comércio está liberada; o resultado escolhido,
ao virar cadastro, continua nascendo com CEP (o CNEFE entrega o CEP junto do pino).

---

## A doença de hoje (raio-x 12/08)
Duas abas que não conversam ("Meus clientes" × "Endereço"); cliente é substring sem
tolerância a erro de digitação (teto 100, ordem alfabética); endereço é UM campo cego —
digita tudo, aperta botão, e uma regex decide em silêncio se cai no CNEFE (só com CEP) ou
no Nominatim público (1 req/s, fraco no interior, até ~7 s de espera). Zero sugestão por
tecla, zero recentes, zero ranking por distância.

## A visão: UMA busca, TRÊS fontes, TODAS locais (zero Google, zero Nominatim no digitar)
`GET /logistica/busca?q=&lat=&lng=` — debounce ~250 ms no app, resposta <100 ms:

| Grupo | Fonte (já no nosso banco) | Ranking |
|---|---|---|
| 👤 Meus clientes | `searchName` (unaccent) + **pg_trgm** (fuzzy: "Mracia"→Márcia) | similaridade × proximidade × recência de entrega |
| 📍 Endereços | **CNEFE** `cnefe_via` (rua por município, pino do trecho) + `via_canon_dict` ("av 84" ↔ "Avenida Oitenta e Quatro") | prefixo + distância; escolheu a rua → campo NÚMERO → `cnefe_porta` dá pino de porta + CEP |
| 🏪 Comércios | **RFB 28M** (`CnpjPublicCompany` nome fantasia/razão) × `CnpjGeo` | nome × distância do GPS — "Bar do Zé" mais perto vem 1º |

- O Nominatim público SAI do caminho do digitar (autocomplete nele viola ToS = ban);
  continua só como fallback do botão "não achei" para texto livre exótico.
- ⚠️ `CnpjGeo` cobre SP hoje — comércios GPS-ranqueados nascem perfeitos para o cliente
  atual; outros estados degradam para busca por cidade (anotado, não bloqueia).
- Link do Maps / coordenada colada: continuam funcionando (caminho `geo/link` atual).

## Fases
- **F1 — backend `busca` + fuzzy de clientes** [M]: `CREATE EXTENSION pg_trgm` + índices
  GIN (searchName; `cnefe_via.via_canon`; RFB nome) + endpoint único com os 3 grupos e
  distância calculada. Prova: ranking por proximidade, fuzzy, ZERO chamada externa.
- **F2 — o PAINEL no app** [M]: a tela `rapida` vira o painel do mock: input único grande,
  chips de recentes (últimas 6 escolhas, local), grupos com cabeçalho, cartão com
  distância + badge da fonte, fluxo do número (stepper com "S/N"), ação direta
  "Adicionar à rota" (o `encaixarAvulsa` já existe e resolve a posição). Nasce no mock
  HTML (fonte) + ponte-src; portões casca/ponte de sempre.
- **F3 — VOZ** [P/M]: microfone no input → `SpeechRecognizer` NATIVO do Android (1 intent
  + callback pela ponte, offline no g15). Não é moda: motorista com luva/sol digitando é a
  cena real. Só preenche o input — o fluxo é o mesmo, sem verbo novo.
- **F4 — cadastro herdando a lei** [P]: resultado escolhido carrega CEP/rua/pino do CNEFE
  → a conta "Direção" nasce com CEP certo, `geoFonte` correta (as 6 regras do CEP
  intactas).

## O que NÃO entra (freio)
- Nada de mapa novo dentro do painel (o pino confere na tela que já existe).
- Nada de POI Google/Places. Nada de autocomplete no Nominatim.
- A cura automática por nome de rua continua MORTA (lei 10/08) — aqui quem escolhe é o
  humano, e escolha grava com CEP.

## Prova da cena (aceite do dono)
Digitar "bar do ze" no g15 em Rio Claro → o Bar do Zé da cidade em 1º com a distância
("350 m"), o de outra cidade lá embaixo. Digitar "rua 8" → Rua 8 do município com pino.
Digitar "Mracia" → Márcia. Tudo sem internet externa.

## Tamanho total: M. Custo: R$ 0/mês (tudo local).
