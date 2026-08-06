# mapa/ — assets locais do Protomaps (F3, PR05082026-MAPA-PMTILES)

Estilo + fontes (glyphs) + ícones (sprites) do basemap **embutidos no APK**, pra que os NOMES
DAS RUAS não sumam sem sinal (hoje eles vêm da internet a cada desenho de tela). Não tem tile
aqui dentro — só a "casca" visual. Os tiles em si (PMTiles no R2) são F1+F4, fora desta pasta.

## De onde veio

| Peça | Fonte | Comando/URL exato |
|---|---|---|
| `style-light.json` / `style-dark.json` | Gerado com o pacote **`@protomaps/basemaps@5.7.2`** (npm, sucessor mantido do `protomaps-themes-base`, que está DEPRECATED) | `npm view @protomaps/basemaps` → `dist-tags.latest = 5.7.2`, instalado em 05/08/2026. Script gerador: `gen-style.mjs` (ver "Como regenerar" abaixo) |
| `glyphs/**/*.pbf` | `https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf` (host oficial dos assets do Protomaps, GitHub Pages) | Baixado em 05/08/2026, `Last-Modified: 31/10/2025` (ETag `69046b9b-...`) |
| `sprites/*.json` + `sprites/*.png` | `https://protomaps.github.io/basemaps-assets/sprites/v4/{light,dark}[@2x].{json,png}` | Baixado em 05/08/2026, mesmo `Last-Modified`/ETag acima — é o v4 |

## O marcador `__HBX_TILES__`

Os dois estilos têm:

```json
"sources": { "protomaps": { "type": "vector", "url": "__HBX_TILES__", ... } }
```

`__HBX_TILES__` é um literal único e sozinho (`grep -r __HBX_TILES__` acha as 2 ocorrências,
uma por arquivo) **no lugar da URL de tiles**. Esta frente (F3) só monta a casca — quem decide
de onde os tiles vêm em runtime é a F4 (leitor PMTiles em Kotlin). Duas formas de preencher,
ambas válidas, a decisão é da F4:

1. **Troca de string** — antes de `map.setStyle(...)`, substituir a substring `__HBX_TILES__`
   por uma URL de TileJSON real (ex.: uma rota local tipo
   `https://appassets.androidplatform.net/assets/app/mapa/tiles.json` que a F4 sirva
   dinamicamente, com `tiles`, `minzoom`, `maxzoom` dentro).
2. **Troca de campo** — remover a chave `"url"` e escrever `"tiles": ["<padrão>/{z}/{x}/{y}.pbf"]`
   direto (mais simples pro interceptor Kotlin já que dispensa uma segunda requisição de
   TileJSON; foi o formato usado no `MapaOffline.kt` antigo pro openfreemap).

Nenhuma das duas exige tocar em `glyphs`/`sprite` — só o campo `url` do source `protomaps` muda.

## Caminhos de glyphs/sprite — por que são relativos a `assets/app/`, não a `mapa/`

```json
"glyphs": "mapa/glyphs/{fontstack}/{range}.pbf",
"sprite": "mapa/sprites/light"   // (ou "mapa/sprites/dark")
```

O MapLibre resolve URL relativa de `glyphs`/`sprite` contra a localização do **documento**
(`index.html`, que mora em `assets/app/`) e não contra a URL do style JSON — é assim que o
`app.js` já referencia `vendor/maplibre-gl.js` hoje (relativo a `assets/app/`, não a si mesmo).
Por isso os caminhos aqui começam com `mapa/…`, não `./glyphs/…` nem `glyphs/…` sozinho. Isso
funciona tanto se o F5 carregar o style por `fetch()+JSON.parse` quanto se passar o objeto
direto pro `maplibregl.Map({style: ...})` — os dois casos resolvem relativo ao documento.
⚠️ Se o F5 decidir mover o style pra fora de `assets/app/mapa/`, ou carregar o app por outra
origem, estes caminhos têm que ser conferidos de novo (não são auto-mágicos).

As pastas de fonte têm ESPAÇO no nome (`Noto Sans Regular/`) de propósito — é a mesma
convenção do host oficial (`{fontstack}` vira literalmente o nome da fonte, URL-encoded pelo
MapLibre na hora do fetch, ex. `Noto%20Sans%20Regular`). Não renomear as pastas: o
`{fontstack}` do template é preenchido pelo próprio MapLibre a partir do `text-font` da layer
(ver tabela de fontstacks abaixo) e tem que bater com o nome exato da pasta.

## Fontstacks — a lista exata (não chutada, varrida programaticamente)

Rodei um script que percorre `layers[].*.text-font` de AMBOS os estilos (direto e dentro de
expressões `case`/`coalesce`, olhando os nós `["literal", [...]]`). Resultado, idêntico em
light e dark:

| Fontstack | Baixado? | Por quê |
|---|---|---|
| `Noto Sans Regular` | ✅ sim | rótulo padrão (ruas, a maioria dos POIs) |
| `Noto Sans Italic` | ✅ sim | rótulos de água/natureza (padrão do estilo Protomaps) |
| `Noto Sans Medium` | ✅ sim | rótulos de lugar/cidade (destaque) |
| `Noto Sans Devanagari Regular v1` | ❌ **não** | só entra num `case` que testa `["==", ["get","script"], "Devanagari"]` — condição de dado (feature com script devanágari), nunca verdadeira em OSM do Brasil (só Latin). Testado: o `.pbf` desse fontstack no host oficial é **byte-idêntico** ao de `Noto Sans Regular` (mesmo ETag) — mesmo se alguém baixasse, não muda nada visualmente pro Brasil |

Ranges baixados por fontstack: **`0-255` e `256-511`** (256 code points cada, é o range padrão
dos glyphs PBF tipo Mapbox/MapLibre). `0-255` = ASCII + Latin-1 Supplement, cobre TODA
acentuação do português (á é í ó ú â ê ô à ã õ ç, maiúsculas, ü) porque esses caracteres vivem
entre os code points 192–255. `256-511` (Latin Extended-A/B) foi pedido por segurança/margem —
não é estritamente necessário pro pt-BR (não usamos ĳ, ő, ř etc.), mas o custo é baixo
(~130 KB a mais no total) e cobre nome de rua com grafia estrangeira preservada (ex. bairros/
ruas com nome francês, alemão, polonês em cidades de colonização). Nenhum fontstack do estilo
pede um range diferente desses dois.

## Sprites (ícones)

`sprites/light.{json,png}` + `sprites/light@2x.{json,png}` e o par `dark`. 53 ícones em cada
folha (shields de rodovia, símbolos de POI). 1x e 2x baixados pra telas de densidade alta
(a maioria dos Android atuais) não ficarem borradas.

## Licença e atribuição (ODbL — OBRIGATÓRIO)

Os dados são © OpenStreetMap contributors, licença ODbL — **exige crédito visível**. Os dois
estilos têm, no source `protomaps`:

```json
"attribution": "<a href=\"https://github.com/protomaps/basemaps\">Protomaps</a> © <a href=\"https://osm.org/copyright\">OpenStreetMap</a> contributors"
```

O `app.js` já monta os 3 mapas do app (`route-live-map`, leitura ao vivo, passeio) com
`attributionControl: { compact: true }` — o MapLibre GL JS lê esse `attribution` do source
sozinho e mostra automaticamente. **Na tela**: aparece um botão pequeno "i" no canto
inferior direito do mapa; tocando nele expande e mostra o crédito com os dois links. Não
precisei tocar em `app.js` pra isso — já está ligado.

## Armadilha checada: fonte extra tipo relevo sombreado?

**Não tem.** O style gerado só declara **1 source** (`protomaps`, vetorial). Diferente do
OpenFreeMap (que serve hillshade como raster separado), o basemap do Protomaps é auto-contido:
71 layers (1 background + 15 fill + 41 line + 14 symbol), todas do mesmo source vetorial. Não
precisa de segunda fonte de tiles nem de configuração extra pra funcionar.

## Tamanhos (medido em 05/08/2026)

| Grupo | Bytes | ~KB |
|---|---:|---:|
| `style-light.json` | 65.584 | 64,0 |
| `style-dark.json` | 65.562 | 64,0 |
| **Estilos (2)** | **131.146** | **128,1** |
| `glyphs/Noto Sans Regular/*` | 203.770 | 199,0 |
| `glyphs/Noto Sans Italic/*` | 212.320 | 207,3 |
| `glyphs/Noto Sans Medium/*` | 207.263 | 202,4 |
| **Glyphs (3 fontstacks × 2 ranges = 6 arquivos)** | **623.353** | **608,7** |
| `sprites/light.json` + `.png` + `@2x.json` + `@2x.png` | 52.154 | 50,9 |
| `sprites/dark.json` + `.png` + `@2x.json` + `@2x.png` | 51.589 | 50,4 |
| **Sprites (8 arquivos)** | **103.743** | **101,3** |
| **TOTAL da pasta `mapa/`** | **858.242** | **≈ 838 KB (0,82 MB)** |

Meta era **abaixo de 2 MB** — fechou em **0,82 MB**, com folga de ~1,18 MB. O APK hoje tem
3,76 MB; isso empurra pra ~4,6 MB — ainda leve. JSON dos estilos foi salvo **minificado** (sem
indentação) — a versão "bonita"/indentada gerada pelo `gen-style.mjs` cru dava 524 KB pros
dois estilos juntos (4× maior); minificar não muda nem uma vírgula de comportamento, só
corta espaço em branco.

## Como regenerar do zero

```bash
mkdir /tmp/pmtiles-assets && cd /tmp/pmtiles-assets
npm init -y
npm install @protomaps/basemaps@5.7.2
```

Salvar como `gen-style.mjs` (mesma lógica do `generate_style.ts` oficial do pacote, mas com
`url` = marcador `__HBX_TILES__` e `glyphs`/`sprite` locais em vez dos hosts remotos):

```js
import { writeFile } from "fs/promises";
import { layers, namedFlavor } from "@protomaps/basemaps";

const TILES_MARKER = "__HBX_TILES__";
const LANG = "pt";

async function build(flavorName, outFile) {
  const flavor = namedFlavor(flavorName);
  const style = {
    version: 8,
    sources: {
      protomaps: {
        type: "vector",
        attribution:
          '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://osm.org/copyright">OpenStreetMap</a> contributors',
        url: TILES_MARKER,
      },
    },
    layers: layers("protomaps", flavor, { lang: LANG }),
    glyphs: "mapa/glyphs/{fontstack}/{range}.pbf",
    sprite: `mapa/sprites/${flavorName}`,
  };
  await writeFile(outFile, JSON.stringify(style)); // sem indent = minificado
}

await build("light", "style-light.json");
await build("dark", "style-dark.json");
```

```bash
node gen-style.mjs

# glyphs (as 3 fontstacks realmente usadas, ranges 0-255 e 256-511):
for font in "Noto Sans Regular" "Noto Sans Italic" "Noto Sans Medium"; do
  mkdir -p "glyphs/$font"
  for range in "0-255" "256-511"; do
    enc=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$font")
    curl -s -o "glyphs/$font/$range.pbf" \
      "https://protomaps.github.io/basemaps-assets/fonts/$enc/$range.pbf"
  done
done

# sprites (light + dark, 1x + 2x):
mkdir -p sprites
for v in light dark; do
  for suf in "" "@2x"; do
    curl -s -o "sprites/$v$suf.json" "https://protomaps.github.io/basemaps-assets/sprites/v4/$v$suf.json"
    curl -s -o "sprites/$v$suf.png"  "https://protomaps.github.io/basemaps-assets/sprites/v4/$v$suf.png"
  done
done
```

Depois: copiar `style-light.json`, `style-dark.json`, `glyphs/`, `sprites/` pra dentro desta
pasta (`EntregaShell/app/src/logistica/assets/app/mapa/`), por cima dos arquivos existentes.

Se o Protomaps publicar uma versão nova do `@protomaps/basemaps` ou do host de assets mudar de
`v4` pra `v5`, rodar de novo com a versão nova e comparar o diff de layers/fontstacks antes de
trocar — o app inteiro depende do nome exato dos fontstacks bater com as pastas em `glyphs/`.

## Licença deste pacote de assets

- Dados do mapa: **OpenStreetMap**, licença **ODbL** — https://osm.org/copyright (atribuição
  obrigatória, já embutida no style, ver seção acima).
- Estilo/gerador: **`@protomaps/basemaps`**, licença **BSD-3-Clause** (permissiva, sem
  obrigação de atribuição adicional além do crédito ao Protomaps já incluso no `attribution`).
- Fonte Noto Sans: **SIL Open Font License 1.1** (via Google Fonts/Noto, redistribuída pelo
  Protomaps como glyphs PBF).
