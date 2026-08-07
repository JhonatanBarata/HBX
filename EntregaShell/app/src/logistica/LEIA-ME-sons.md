# Os 17 .ogg de `res/raw/` deste flavor sao a identidade MARCADO

> Este arquivo mora AQUI e nao dentro de `res/raw/` porque `res/` so aceita nome
> de recurso valido (a-z, 0-9, underscore). `LEIA-ME.md` la dentro QUEBRA O BUILD:
> `'L' is not a valid file-based resource name character` (medido, nao suposto).

O dono escolheu MARCADO de ouvido entre 3 identidades sintetizadas (07/08).
Timbre: harmonicos IMPARES com queda seca — escolhido por cortar ruido de rua e
motor, que e onde o app vive. Cristal (sino) e Sopro (ar) perdiam a cauda no
barulho da cabine.

Vocabulario constante de proposito: subir = deu certo · descer = acabou/erro ·
repetir = atencao · 4 notas = a marca. O alarme de chegada e o unico feito pra
INCOMODAR: duas notas alternadas, sem cauda, emenda limpa pra repetir em loop
sem clique.

Nada gravado: onda calculada + envelope, encodado em ogg/vorbis. O gerador fica
versionado em `scripts/sons-hbx-gerar.js` — regerar e uma linha, e a receita de
cada som e legivel (nao e um binario opaco que ninguem sabe de onde veio).

## Como funciona
Cada arquivo em `logistica/res/raw/` tem o MESMO NOME de um som real em
`app/src/main/res/raw/`. No Android, recurso de flavor VENCE o de `main`. Entao o
app de LOGISTICA toca a identidade MARCADO, e o `main` — usado pelo flavor
`vendas` — continua com os sons antigos, intocado.

**NAO apagar arquivo.** Apagar quebra o build (19 referencias `R.raw.*` em
`HbxSoundEngine.kt`, `ChegadaActivity.kt` e `MissaoAlarmeActivity.kt`).

## Como repor um som novo
Sobrescreva o arquivo em `res/raw/` com o som novo de mesmo nome. **Zero linha de
codigo.** Toda a fiacao continua de pe: HbxSoundEngine, as Activities, os
`R.raw.*`, o `soundPrefs` e a previa da folha "Sons".

## Historia (nao repetir os erros)
- `e1afcd82` — S1, os 16 OGG originais nascem em `main/res/raw/`.
- `45f5e80a` — o flavor de bancada vira SILENCIO por override (ordem do dono:
  "remova os sons do app, vamos projetar outros"). Silencio de 2 s, nunca 0 byte:
  `MediaPlayer.prepare()` estoura em arquivo curto demais, `iniciarSomRaw()`
  devolve false e cai no `iniciarSomFallback()`, que toca o ALARME PADRAO DO
  SISTEMA — o oposto de silenciar.
- `562e4265` — MARCADO entra no lugar do silencio.
- **Fusao 07/08** — o flavor `logistica2` deixou de existir (o app novo virou O
  app) e estes 17 arquivos vieram junto pro `logistica`. Sem esta mudanca de
  pasta a identidade escolhida pelo dono sumiria com o flavor, calada.
