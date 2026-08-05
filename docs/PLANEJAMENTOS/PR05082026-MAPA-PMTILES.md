# PR05082026 — MAPA PMTILES (troca do OpenFreeMap)

> **GO do dono 05/08/2026.** Direção literal: *"remover esse free map e deixar outro grátis q existe,
> e já baixa na instalação do app"* · *"prefiro sobrecarregar o celular do cliente"* ·
> *"queria sobrecarregar o server dos outros não o meu"* · *"sem inventar moda, quero padrão do mercado"*.

## Por que existe

O mapa offline de hoje (`MapaOffline.kt`, 31/07) **nunca gravou um único tile** e ainda diz
"Mapa pronto pra usar sem internet". Três defeitos medidos em 04-05/08 no moto g15 (v151):

| # | Defeito | Prova |
|---|---|---|
| 1 | **Colisão de caminho mata 100% dos tiles.** O TileJSON é `.../planet` (vira ARQUIVO `mapa-offline/planet`); os tiles são `.../planet/<versão>/{z}/{x}/{y}.pbf` (precisam da PASTA de mesmo nome). `mkdirs()` false → `writeBytes` ENOTDIR → `salvar()` engole no `runCatching` **sem else** → `guardados++` mesmo assim | Reproduzido no FS do aparelho: `mkdir -p planet/x` → *"Not a directory"*. Tela promete 38 MB (60 km) e mostra **4,6 MB no aparelho** (= estilo+sprites+fontes+relevo, tudo que mora FORA de `planet/`) |
| 2 | **Lento por construção.** 1 tile por vez e `conexao.disconnect()` mata o keep-alive → TLS novo a cada pedaço | Medido: **415 ms/tile** · 153 ms com keep-alive · **49 ms com 8 paralelos**. 60 km = 4.011 tiles ⇒ **~28 min** |
| 3 | **Sequestra o app.** `executor` do `NativeAppBridge` é `newSingleThreadExecutor()` — o MESMO de `request()` (toda chamada de API), `stopRoute`, comprovante e download do APK | `NativeAppBridge.kt:55` |

Extras: trava em "Baixando · 0%" pra sempre quando o nativo dá `return` silencioso; sem foreground
service (Doze corta); fontes/sprites/relevo não são pré-baixados pelo botão.

Contagem real de tiles (Rio Claro, z8–14): **10 km = 131 · 30 km = 1.065 · 60 km = 4.011** (z14 = 74%).

## Decisões cravadas pelo dono

| Assunto | Decisão |
|---|---|
| Fonte do mapa | **Protomaps basemap** (OSM, ODbL — só exige o crédito). Gerador open source, sem chave, sem conta |
| Formato | **PMTiles v3** — 1 arquivo, leitura por Range request |
| Cobertura no storage | **BRASIL INTEIRO**, arquivo único (estimado 1,5–3 GB z0-14 — **F0 mede**) |
| Onde mora o arquivo | **Cloudflare R2** — NUNCA o VPS dele (84% cheio, 33 GB livres). 10 GB grátis permanente, **egress $0**, 10M leituras/mês. Cartão do dono já cadastrado |
| Quanto o celular guarda | **60 km** em volta da base, na primeira paulada |
| Quem decide baixar | **Ninguém.** Sem botão, sem chips 10/30/60. O app se vira sozinho |
| Estilo/fontes/ícones | **Dentro do APK** (~1 MB). Hoje as LETRAS vêm da internet e somem sem sinal |

### As 3 regras do download (padrão de mercado — Google Maps / Spotify / Netflix)

1. **Segundo plano, nunca trava o app.** Funciona online enquanto baixa. Zero tela de "aguarde".
2. **Só no wi-fi por padrão.** Muito tempo sem wi-fi + vai montar rota → pergunta **uma vez**:
   "usar ~60 MB de dados?".
3. **Retoma de onde parou.** Caiu no meio, continua — não recomeça do zero.

### Limitação honesta que FICA (dizer ao dono, não esconder)

Offline desenha rua, nome de rua, a bolinha do GPS e mantém o traço já calculado. **Não recalcula
rota** — o OSRM mora no VPS. Mesmo buraco do Waze. Roteador embarcado (Valhalla) segue congelado.

## Desenho técnico

### 🔴 A armadilha, e como se desvia dela

Ler `pmtiles://` pelo **JavaScript** exige Range request atravessando o
`shouldInterceptRequest` do WebView — histórico ruim, vira madrugada (ver a lição do
`isStyleLoaded()`, 31/07).

**Caminho escolhido — à prova de bala:** o **Kotlin** lê o PMTiles (Range requests direto no R2),
extrai os tiles e grava no disco **no mesmo formato de arquivo que o `resposta()` já serve hoje**.
O `app.js` **não muda uma linha** do jeito de pedir tile. Mesma velocidade, risco quase zero.

### PMTiles v3 em Kotlin puro — sem dependência nova

Header de **127 bytes** fixos, diretórios em varint little-endian comprimidos (gzip), TileID em
curva de Hilbert. `java.util.zip.GZIPInputStream` é nativo do Android. Leitor cabe em ~250 linhas.

| Offset | Campo |
|---|---|
| 0–6 | magic `PMTiles` · 7 = versão `0x03` |
| 8–23 | root dir offset + length (LE uint64) |
| 40–55 | leaf dirs offset + length |
| 56–71 | tile data offset + length |
| 97/98/99 | compressão interna / compressão do tile / tipo do tile |
| 100/101 | minzoom / maxzoom |

Resolução z/x/y: header → root dir (descomprime, decodifica) → busca binária por TileID →
`RunLength > 0` = tile (offset+length no tile data); `RunLength == 0` = ponteiro pra leaf dir
(recursivo).

## Fases

| Fase | O que | Depende de |
|---|---|---|
| **F0** | ✅ **FEITO 05/08 — MEDIDO, não estimado** (ver abaixo) | — |
| **F1** | ✅ **FEITO 05/08** — `brasil.pmtiles` gerado (3.021.173.073 B) e **no ar** em `https://mapa.hbxsystem.com.br/brasil-20260804.pmtiles` | — |
| **F2** | ✅ **FEITO 05/08** — `PmTilesReader.kt` (Kotlin puro, zero dependência nova) + 25 testes de formato + 4 de rede. **Medida que fecha a tese abaixo** | — |
| **F3** | ✅ **FEITO 05/08** — `assets/app/mapa/`: 2 estilos + 3 fontes + ícones 1x/2x = **0,83 MB** (teto era 2 MB). Marcador `__HBX_TILES__` no source; crédito ODbL no "i" do mapa; nenhuma URL remota sobrando | — |
| **F4** | Reescrever `MapaOffline.kt`: puxa faixas grandes do R2 (pool próprio, keep-alive, paralelo), grava tiles, **retoma**, wi-fi-first, foreground service. Morre o caminho openfreemap | F1+F2+F3 |
| **F5** | `app.js`: morre o cartão com chips e botão; nasce a linha de status + o gatilho automático (1º login / montar rota / renovação) | F4 |
| **F6** | Publish → teste no g15 pelo ADB → **prova final: volta de carro em modo avião (dono ou André)** | tudo |

## F0 — números MEDIDOS (05/08/2026, build `20260804` do planeta)

Método: o PMTiles guarda `offset`+`length` de cada tile no diretório, então dá pra **somar sem
baixar tile nenhum**. Foram lidas as leaf dirs que cruzam o Brasil — **~36 MB de rede pra medir
3 GB de mapa**. Conferido por mim de forma independente: header, root dir 15.549 B,
1.431.655.765 tiles endereçados, gzip/MVT/clustered, 127,75 GiB — tudo bate.

| Recorte | z0-14 | z0-13 |
|---|---|---|
| **Brasil (bbox)** | **3,015 GB** ± 2% — **30% da cota grátis do R2** | 1,551 GB |
| São Paulo estado | 438,2 MB | — |
| **60 km em volta (o que o celular guarda)** | **23,8 MB** quadrado · **17,9 MB** círculo | — |

**Validação cruzada mais forte:** a contagem de tiles do quadrado de 60 km deu **exatamente 4.011**
— o mesmo número que eu tinha calculado à mão sobre o `MapaOffline.kt` antes de existir medição.

### O que isso muda no plano

1. **60 km custa 23,8 MB, não 38 MB.** PMTiles é **37% mais leve** que os tiles soltos de hoje.
2. **Círculo economiza 25%** sobre o quadrado, com o mesmo raio útil — o `caixaDeTiles` de hoje usa
   quadrado.
3. "Cada zoom dobra" confirmado: **~1,9×**. Por isso z0-13 é 51% de z0-14, não 25%.
4. 🔴 **A média nacional mente: 436 B/tile no Brasil × 28 KB/tile em SP capital (205×).**
   **Barra de progresso da F5 tem que ser por BYTES, nunca por contagem de tiles** — numa capital
   ela mentiria feio. *(Cheiro conhecido: é o mesmo erro do "224 MB" do snapshot fantasma.)*
5. Bônus: z15 do Brasil custaria +2,99 GB (6,01 GB no total, 60% da cota) — registrado, não feito.
6. **Não medido, dito na cara:** o recorte é por **bbox**, não pelo polígono do Brasil — inclui
   borda de Peru, Bolívia, Guianas, Paraguai, Uruguai e norte da Argentina. Sai de graça porque
   oceano/vazio custa ~0 B por run-length, e cabe com 7 GB de sobra.

## F2 — A MEDIDA QUE JUSTIFICA A TROCA (05/08, rodada por mim, contra o servidor real)

`PmTilesReaderRedeTest` (opt-in por `HBX_TESTE_REDE=1`, nunca roda no publish) baixou os
**60 km de Rio Claro de verdade**, pelo mesmo agrupamento que vai pro APK:

```
BAIXADO DE VERDADE: 23 MB · 4011 tiles · 63 requisições · 7,7 s
(hoje, 1 requisição por tile: ~28 min)
```

| | hoje | PMTiles |
|---|---|---|
| requisições HTTP | **4.011** | **63** (64× menos) |
| tempo | ~28 min | **7,7 s** |
| bytes | 38 MB prometidos | **23 MB** |

Os 4.011 tiles batem em **três** contas independentes: minha, à mão, sobre o `MapaOffline.kt`;
a medição da F0 sobre os diretórios; e o `faixas()` do Kotlin. O teste ainda prova **byte a byte**
que fatiar a faixa baixada dá o mesmo que ler o tile direto — offset relativo errado desenharia
lixo, e lixo que desenha é pior que buraco.

*(7,7 s são do PC no wi-fi lendo o build público. No 4G do motorista será mais lento; do R2 com
CDN, provavelmente mais rápido. A ordem de grandeza é que decide.)*

### Armadilhas do formato que a F2 encontrou (não redescobrir)

1. **O rotate do Hilbert do PMTiles não é o de livro** — usa `a - 1 - y` com `a` = máscara do bit
   atual, não o lado total. Portar a versão clássica dá TileID errado só em alguns quadrantes.
2. 🔴 **HTTP 200 no lugar de 206 é a armadilha cara** — CDN que ignora `Range` devolve o arquivo
   INTEIRO. Num planeta de GB isso mata o aparelho. O leitor recusa sem ler o corpo.
3. **`Accept-Encoding: identity` é obrigatório** — se o CDN gzipar o trecho na linha, offset não
   quer dizer mais nada.
4. 🔴 **Os limites lat/lon do cabeçalho são INFORMATIVOS, não a verdade.** A F4 **não pode** usar o
   bounds do header pra decidir o que baixar — tem que usar base + raio.
5. Offset `0` na entrada 0 é ambíguo (a referência JS segue com offset −1 calado) — aqui lança erro.

## F1 — infra do R2 pronta e PROVADA (05/08)

- Conta Cloudflare do dono (a mesma do `hbxsystem.com.br`), account id `009995882d600328f40633b5111acd24`.
- Bucket **`hbx-mapa`** criado pelo dono (o token dele é *Object Read & Write* — escreve objeto,
  **não** cria bucket nem lista; a API de gerenciamento recusa com `Authentication error`).
- Credenciais em **`.env.local`** da raiz (`R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/API_TOKEN/
  ENDPOINT/BUCKET`) — gitignored por `**/.env.local`, confirmado com `git check-ignore`.
  ⚠️ As chaves passaram pelo chat: **rotacionar quando a frente fechar**.
- **Domínio público `mapa.hbxsystem.com.br`** ligado ao bucket (Active/Enabled). Provado com um
  arquivo de 1 MB de padrão conhecido:

| prova | resultado |
|---|---|
| leitura **sem credencial** | HTTP 200 (o APK não carrega segredo nenhum) |
| leitura **por pedaço** | HTTP 206, `content-range` exato, **bytes certos no offset pedido** |
| CDN | `MISS` → `HIT` na 2ª leitura — corta leitura cobrada e aproxima do motorista |

### O arquivo do Brasil — gerado, validado e no ar

Extractor PMTiles v3 escrito em **Node puro** (npm `pmtiles`, nenhum binário baixado) —
`<scratchpad>/f1-extrair/` (`pmlib.js`, `extract.js`, `validar.js`, `exaustivo.js`).

| | valor |
|---|---|
| `brasil.pmtiles` | **3.021.173.073 B** — +0,0% sobre a previsão da F0 |
| conteúdo | 4.484.767 tiles · 2.773.970 entradas · 2.469.141 blobs únicos · z0-14 · clustered |
| diretórios | root 2.639 B + **678 folhas** de 4096 entradas (5,56 MB) |
| extração | **440 requisições · 3,027 GB · 1m29s** (0,37% de byte desperdiçado) |
| upload pro R2 | 3,02 GB em **5m21s** (9,0 MB/s), multipart |
| URL pública | `https://mapa.hbxsystem.com.br/brasil-20260804.pmtiles` (`immutable`, 1 ano de cache) |

**Prova final, rodada por mim (`PmTilesReaderRedeTest`, 6 testes / 0 falhas):**

```
fonte: https://mapa.hbxsystem.com.br/brasil-20260804.pmtiles · z0-14 · 2773970 entradas
conferidos byte a byte contra o planeta: 10 (e 0 não existiam no planeta)
R2 (Brasil): 23 MB · 4011 tiles · 63 requisições · 7,7 s
```

Três implementações independentes concordando: escritor JS → leitor Kotlin → planeta original.
Tóquio ausente do recorte (fora do bbox devolve nada, não lixo).

### Armadilhas da extração (não redescobrir)

1. 🔴 **O recorte pequeno NÃO testa o caso perigoso.** Rio Claro é área densa: 0 runs cortados. Quem
   quebra é o oceano, onde 1 blob serve centenas de TileIDs e o corte precisa fatiar o run no meio.
   Testado à parte: 871 tiles de 8 blobs, 44 runs cortados, maior run 213 — os 871 conferidos um a um.
2. **Dedup quebra a monotonia** src→destino (aponta pra trás) ⇒ gravar por acesso aleatório em arquivo
   pré-alocado, nunca por append.
3. **Root não cabe** com 2,77M entradas ⇒ folhas de 4096, com laço genérico (nada de número mágico).
4. **`.buffer` do zlib no Node é view de um pool maior** — passar o Buffer direto pro deserializador.
5. **Retomada provada com SIGKILL** aos 42%: o SHA do arquivo retomado é idêntico ao da corrida limpa.
   Progresso gravado a cada 3 s ⇒ crash custa no máximo 3 s.
6. Modelo de custo chutado escolheu gap errado e desperdiçou **62%** de banda no 1º arquivo. Calibrado
   contra a rede real (14,6 req/s a conc=8; 35 MB/s), o Brasil saiu com 0,37%. **Achado que muda a
   intuição:** com faixas de 16 MB o Brasil precisa de só ~1.491 requisições mesmo com gap=0 — a curva
   de Hilbert deixa tudo contíguo. Latência é irrelevante; o que importa é não pedir byte à toa.

### Gates (não negociáveis)

- Endpoint/ponte nova → `app.js` + allowlist `NativeApiClient.kt` + rebuild: **os três ou nada**.
- `check-pele.mjs` limpo nos arquivos tocados (R6/R7 cobre `EntregaShell/app/src/**`).
- Kotlin muda ⇒ **publica primeiro, testa no celular depois** (regra §3 do hbxapk).
- `salvar()` **nunca mais** engole falha de disco calada — falha de DISCO conta separada da de REDE.
- Commit antes de publicar (`npm run publish` faz `git reset --hard`).

## Pendências do dono

- ⬜ **Token de API do R2** (Access Key + Secret, S3-compatible) → gravar em `.env.local` da raiz
  (gitignored por `**/.env.local`). Sem isso a F1 para.
- ⬜ Autorizar o publish quando a F5 fechar.
- ⬜ A volta de carro em modo avião (F6) — prova que só ele pode dar.
