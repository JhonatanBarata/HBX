# PR12082026 — RADAR + VELOCIDADE (2a/2b), servido pelo Cloudflare R2

**Pedido do dono (12/08):** criar o plano; aproveitar o servidor Cloudflare (R2, ~6-7 GB
sobrando — os tiles `brasil-20260804.pmtiles` já moram lá, egress grátis).

**Decisão de arquitetura (a partir do raio-x de 12/08):** o dado de radar é PEQUENO e muda
POUCO — não merece tabela no Postgres do VPS nem endpoint novo. Vira **arquivo estático
versionado no R2**, igual aos tiles. O app baixa 1× por dia e casa os pontos com a rota que
JÁ recebe do OSRM. Zero serviço pago, zero carga nova no VPS, zero mexida no OSRM/tiles.

---

## A regra de ouro (mercado + honestidade)
- **Radar**: avisar radar FIXO é legal (Senatran 2024; o CTB proíbe detector ativo, não
  aviso informativo). Falso NEGATIVO é inevitável (radar não mapeado) → a feature é "aviso
  auxiliar", a copy nunca promete cobertura total.
- **Velocidade (2a)**: OSM Brasil tem maxspeed em ~7% das vias — NÃO sustenta placa
  contínua na cidade. O velocímetro avermelha contra **o limite do radar à frente** (que é
  o limite que custa dinheiro: multa R$130–R$880 + pontos). Placa contínua só em rodovia,
  como fase opcional futura.

## F1 — O DADO (extração → R2)  [P/M]
Fontes (todas abertas e de uso comercial livre):
1. **DNIT / PNCV** — radares de rodovias federais (dados abertos, CSV/XLSX: UF, rodovia,
   km, tipo, limite por veículo). ⚠️ Conferir se o dataset atual traz lat/lng; se vier só
   km, converter pelo SNV (shapefile aberto do DNIT). Risco anotado.
2. **DER-SP** — radares das rodovias estaduais de SP (dadosabertos.sp.gov.br, conjunto
   "Radar"; 649 equipamentos na malha não concedida — o interior do nosso cliente).
   ⚠️ Rodovia CONCEDIDA (ex.: SP-310) é ARTESP/concessionária — conferir cobertura; o que
   faltar, OSM cobre.
3. **OSM** — `highway=speed_camera` + relações `type=enforcement` (traz o maxspeed
   fiscalizado). Extração via `osmium tags-filter` do PBF do Sudeste (Geofabrik, ~850 MB —
   o VPS apagou o original; baixar, extrair, apagar: lição do FREIOS-DE-DISCO).
4. **PROIBIDO**: MapaRadar (CC BY-NC-ND — comercial só negociando) e SCDB (licença
   individual). Não usar "de graça".

Script novo `scripts/radares-gerar.mjs` (roda na bancada ou no VPS, 1× por mês):
baixa as 3 fontes → normaliza → dedup por proximidade (~40 m) → gera
`radares-sudeste-YYYYMMDD.json.gz`:
```json
[{ "lat": -22.41, "lng": -47.56, "limite": 60, "tipo": "fixo",
   "sentido": 245, "via": "SP-191", "fonte": "der-sp" }]
```
Estimativa: poucos milhares de pontos no Sudeste ≈ 1-2 MB gzip. Sobe pro R2 pelo mesmo
caminho dos tiles + `radares-manifest.json` (aponta a versão corrente). Nos 6-7 GB do R2
isso é arredondamento.

## F2 — O APP: baixar e avisar  [M]
- **Download**: 1× por dia operacional, do R2 (mesmo domínio dos tiles,
  `mapa.hbxsystem.com.br`). ⚠️ CORS: fetch JS do WebView precisa de header no R2 — se o
  bucket não liberar, a saída é a mesma dos tiles (ponte nativa Kotlin baixa e entrega) ou
  1 linha de proxy no backend. Cache local com a versão do manifesto; sem rede = usa a
  última baixada (aviso auxiliar degrada em silêncio, nunca quebra a navegação).
- **Matching** (client-side, de graça): radares num corredor de ~35 m da
  `navRota.geometria` (a polyline que o app JÁ guarda), à FRENTE da posição-presa-na-rua —
  mesma técnica do `manobraDaVez`/`presoNaRota`. Sem rota traçada, sem aviso (o corredor é
  da rota, não do mundo).
- **Aviso**: a ~8-10 s de distância (velocidade atual × tempo, piso 300 m / teto 600 m):
  chip visual no cromo da tela de dirigir (nasce no mock, padrão `.emp-chip`) + UMA fala
  ("Radar de 60 a 400 metros") com dedup por radar (mesma disciplina do `vozDitas`). A voz
  da MANOBRA tem prioridade — radar nunca fala por cima de "vire à esquerda".

## F3 — O VELOCÍMETRO QUE AVERMELHA  [P]
Na janela de aproximação (radar a <600 m à frente): `vel > limite do radar` ⇒ o
velocímetro ganha estado "acima" (classe no `.gps-vel`; cor via token, contraste nos 2
temas). Fora da janela, velocímetro normal de sempre. Perf: comparação por fix — zero peso
(o velocímetro já atualiza via `data-vivo`).

## F4 (OPCIONAL, não nasce junto) — placa de rodovia
Overlay `maxspeed` de rodovias OSM como PMTiles próprio no R2 → placa contínua em rodovia
(onde o dado existe de verdade). Só se o dono pedir depois de rodar F1-F3.

## Provas (vacina antes do fix, lei da casa)
`scripts/prova-radar-aviso.js` no harness sintético existente: radar no corredor à frente
⇒ 1 aviso e só 1; radar atrás/fora do corredor ⇒ mudo; vel acima na janela ⇒ classe
"acima" liga e desliga; sem download ⇒ navegação intacta.

## Estado e chaves
Nasce LIGADO (lei da casa). Sem flag de servidor: o app que não achar o manifesto no R2
simplesmente não avisa (fail-silent de enfeite — enfeite não derruba rota).

## Tamanho total: M (F1 P/M + F2 M + F3 P). Custo mensal: R$ 0.
