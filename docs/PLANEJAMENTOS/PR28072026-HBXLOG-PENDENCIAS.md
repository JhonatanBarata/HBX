# HBXLOG — o que ficou de pé e o que falta (28/07/2026, madrugada)

> Handoff pra próxima sessão. Ler junto com a memória `hbxlog` (regra de teste no celular,
> 10 Leis de UI, build/publish/ADB). Aparelho: moto g15 `ZF5255SMWF`, cabo plugado.
> **NO AR agora: Loghbx v85** (backend + APK publicados 28/07 ~03:15) — instalado no g15.

---

## 1. O que ENTROU e está no ar (não refazer)

| # | Pedido do dono | Onde vive | Provado na tela? |
|---|---|---|---|
| 1 | Endereço conferido **antes** de montar a rota; tela só com os erros; a parte errada marcada | `checarEnderecos` (backend) + `checagemModal` (app.js) | ✅ 26 de 52 na segunda, montagem barrada |
| 2 | Fora "Corrigir" e o liga/desliga do Gerenciador | `conferenciaParadaRow` | ✅ |
| 3 | Fora a linha "Créditos atual / Aceitar Debitará" | `custoPreviewBanner` | ✅ (sobra só o aviso de saldo que NÃO cobre) |
| 4 | "+" da Rota vira **Rota rápida** (entrega avulsa morreu) | `montagemRapidaModal` + `encaixarParadaNaRota` | ⚠️ modal ✅ / **encaixe por proximidade NÃO testado com rota de pé** |
| 6 | Mapa parado mostra você + endereço; bolinha azul abre balão | `updateMapaOcioso`, `abrirBalaoLocal` | ✅ |
| 7 | Voltar limpa rota **não aceita**; rota aceita não morre | carimbo `logistica-rota-aceita-dia` | ⚠️ código pronto, **não testado ao vivo** |
| 8 | Fim da piscada do mapa + entrada "aproximando/montando" | garagem do mapa + `animarEntradaDoMapa` | ✅ (vídeo do aparelho) |

**Arquivos tocados:** `EntregaShell/app/src/logistica/assets/app/app.js`,
`EntregaShell/app/src/main/assets/app/app.css`,
`EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/NativeApiClient.kt` (allowlist),
`backend/src/logistica/logistica-conferencia.service.ts` (`checarEnderecos`),
`backend/src/logistica/logistica.controller.ts` (`POST rota/checar-enderecos`, `POST rota/tirar-do-dia`),
`backend/src/logistica/dto/logistica.dto.ts`.

---

## 2. FALTOU TESTAR (fila 1 — é o que fecha a leva de 28/07)

Tudo abaixo já está **publicado**; o que falta é dirigir o app e ver acontecer.

1. **"Remover da Rota (N)"** — nunca foi apertado. Esperado: os N clientes ficam fora da montagem de
   HOJE (a seleção da rota é filtrada em `aplicarExcluidosDaRota`), o cadastro **não** muda, a rota
   monta com o resto e cai no Gerenciador.
2. **"Remover do dia (N)"** — nunca foi apertado. Esperado: confirmação → `POST /logistica/rota/tirar-do-dia`
   → aqueles clientes perdem aquele dia no cadastro (`definirDiasDoCliente` + espelho da agenda) →
   reconfere sozinho → se zerou, monta. **Testar em cliente de teste antes da base real** (é escrita
   de cadastro; 26 clientes de uma vez é irreversível na mão).
3. **Toque numa linha da tela de erros** → abre o cadastro real → salvar/fechar → volta pra tela de erros
   já reconferindo (guard `state.checagemRetorno` em `closeOverlay`).
4. **Rota salva com dia fixo** passa pelo mesmo portão (`apply-route-modelo`).
5. **Item 4 — encaixe da Rota rápida**: com rota montada, "+" → CEP+número → "No caminho" deve inserir
   na perna mais barata (OSRM `table`; sem rede cai em linha reta) e o toast diz "Entra depois de
   Fulano."; "Primeira parada" fura a fila. **Nada disso foi visto rodando.**
6. **Item 7**: aceitar uma rota, reabrir o Gerenciador e apertar Voltar — a rota **não** pode sumir.
   Com rota não aceita, Voltar continua desfazendo.
7. **Item 8 (header cortado)**: reproduzir a rolagem herdada (lista de Clientes → modal alto → voltar
   pra Rota) e conferir que o topo não fica mais escondido sob a barra do sistema.

---

## 3. ITEM 5 — "Buscar online" (dono escolheu: **prospecção**)

> "Eu vou querer ver um barzinho aqui perto." Decisão do dono: **não** competir com o Google Maps em
> "achar um bar"; o que vale dinheiro é **"quem por aqui pode virar meu cliente"**.

### Dado medido (28/07, base do VPS — `hbx_prod.CnpjPublicCompany`)
- **Rio Claro: 1.223 bares/restaurantes ATIVOS** (CNAE `5611%`), **1.166 com telefone (95%)**.
- 355 mercearias/minimercados (`4712%`).
- Custo por consulta: **zero** (base nossa). Google Places faria ~US$32/1.000 buscas — mata a margem.
- Índices que já existem: `(normalizedCity, cnae)`, `(state, cnae)`, `(phoneDigits)`.

### O buraco técnico (único)
A tabela **não tem lat/lng nem CEP** (`rawJson` vem NULL) — o endereço é texto composto:
`"RUA CAIXA DAGUA, 730, CENTRO"`. A coordenada sai do CNEFE, e o índice necessário **já existe**:
`cnefe.cnefe_endereco (cod_municipio, logradouro_norm)` + coluna `numero`, `lat`, `lng`.
→ Reusar `normalizarVia`/`resolverCnefeLote` (mesmo motor da cura de pino, com as armadilhas já
documentadas: abreviação com ponto, endereço que começa pelo bairro, rua comprida com vários CEPs).
Taxa de acerto esperada 60-80% — **medir e publicar o número**, não chutar.

### Desenho proposto
1. **Backend** `GET /logistica/perto?q=<texto|cnae>&lat=&lng=&raio=` (allowlist do APK):
   - dicionário curto de sinônimo → CNAE ("barzinho/boteco/bar" → `5611`, "mercearia/mercadinho" → `4712`,
     "padaria" → `4721`, "salão" → `9602`, "academia" → `9313`…);
   - `WHERE normalizedCity = <cidade do GPS> AND cnae LIKE '<prefixo>%' AND situacao='ativa'` — **sempre com
     LIMIT, nunca COUNT** (lição do pool-storm da RFB 28M);
   - geocodifica em LOTE pelo CNEFE, ordena por haversine da posição do motorista, devolve 20;
   - marca quem **já é cliente** (`CustomerProfile` por CNPJ/telefone) pra sumir da lista.
2. **App**: tela de busca (cartão central, Lei nº3) com chips de ramo + "perto de mim"; linha =
   `Nome — rua, nº · 320 m`. Toque = ficha curta (telefone, CNAE) com 2 ações: **"Virar lead"**
   (cria em `/vendas` com o pino e o telefone da Receita) e **"Ir agora"** (vira parada pela
   Rota rápida que já existe).
3. **Decisão do dono antes de codar:** cobra crédito por busca/lead (como o Radar) ou entra no plano?
   Isso muda o gate e a LEI DO VENDEDOR na tela.

### Ideia extra (barata, usa o que já existe)
**Radar de rua:** durante a rota, cruzar a trilha GPS já gravada com a base RFB e, no fim do dia:
"Você passou na porta de 14 bares hoje; 9 não são seus clientes." Zero API nova.

---

## 4. Pendências de INFRA que vão morder a próxima sessão

1. **`npm run publish` (full) está quebrado**: conflito de nome nos engines
   (`hbx-engine-20 already in use`) — e a queda derruba o `hbx-backend` junto. Há containers duplicados
   com prefixo de hash (`c41cb7443d02_hbx-engine-7` etc). **Limpar os duplicados** antes de tentar full
   de novo. Enquanto isso: **`npm run new`** (selective) resolve backend+APK sem tocar nos engines.
2. **Levantar backend na mão é `docker compose --env-file .env -f docker-compose.hostinger.yml up -d backend`.**
   NUNCA `-f docker-compose.yml` — cria `backend`/`hbx-db-1` errados (nomes fora do padrão de produção).
3. **Publish + frentes do dono no mesmo tree:** o `add -A` carimba versão intermediária dos arquivos
   dele e quebra o build (aconteceu com `master/janela-creditos.tsx`). Saída usada:
   `HBX_PUBLISH_COMMITTED_ONLY=1 npm run new`, commitando só o arquivo já corrigido.
4. **Piso do versionCode:** está em **84** no gradle; publicado **85**. Instalou build na mão? sobe o piso
   antes de publicar, senão o celular do dono nunca vê a atualização.
5. Ainda dirty no tree do dono (não commitar sem ele): `logistica-route-billing.service.ts(.test)`,
   `credit-action-*.test.ts`.

---

## 5. Fila antiga que continua aberta (do roteiro anterior)

- **R9**: varredura em massa `sem_pino` via CNEFE + job por UF às 20h (o único do R1–R10 que falta).
- Carimbo "endereço já conferido" (travado: Docker Desktop parado → sem `migrate dev`).
- "Salvar como minha rota do dia" sem moradia na UI.
- `prompt()` nativo em `app.js` (código de 6 dígitos do comprovante) — Kotlin não implementa `onJsPrompt`,
  entrega com `codigoObrigatorio` nunca confirma no aparelho.
- Sons `pairing_success` (não toca) e `sync_complete` (só na Leitura).
- Decisões do dono paradas: APK de vendas (congelar × investir); chegada financeiro-OFF; piso de accuracy
  no `gps_cadastro`; preço final dos 3 níveis (agora com o modelo híbrido que ele mesmo commitou 28/07).

---

## 6. Como testar (resumo da regra do dono)

1. Só front (`app.js`/`app.css`) → build local + `adb install -r` → **eu dirijo até a tela e deixo aberta** →
   dono só olha e responde. Depois publica.
2. Mexeu em backend/Kotlin/allowlist → **publica primeiro**, testa depois.
3. Release não abre CDP: diagnóstico de UI é `adb shell screenrecord` + `ffmpeg fps/tile` (contact sheet).
   Foi assim que apareceu o `fitBounds` rodando a cada render.
4. Nunca anunciar conserto que não foi visto acontecer na tela.
