# Os 17 .ogg de `res/raw/` deste flavor sao a identidade MADEIRA (v2)

> Este arquivo mora AQUI e nao dentro de `res/raw/` porque `res/` so aceita nome
> de recurso valido (a-z, 0-9, underscore). `LEIA-ME.md` la dentro QUEBRA O BUILD:
> `'L' is not a valid file-based resource name character` (medido, nao suposto).

O dono escolheu MADEIRA de ouvido entre 3 vozes candidatas (09/08), no mesmo
metodo do 07/08. Timbre: barra percutida — os parciais NAO sao multiplos
inteiros (1 : 3,93 : 9,55), e essa inarmonicidade e o que o ouvido le como
"madeira" em vez de "nota". E a voz que menos cansa, que e o que importa num som
que toca dezenas de vezes por dia.

Vocabulario constante de proposito, o MESMO desde a v1: subir = deu certo ·
descer = acabou/erro · repetir = atencao · 4 notas = a marca. Trocar a voz nao
pode obrigar o motorista a reaprender o app. O alarme de chegada e o unico feito
pra INCOMODAR: duas notas alternadas, sem sala, renderizado EM CIRCULO (o que
passa do fim volta pro comeco) pra emendar em loop sem clique.

Nada gravado: onda calculada + envelope, encodado em ogg/vorbis. O gerador fica
versionado em `scripts/sons-hbx-estudio.js` — regerar e uma linha, e a receita de
cada som e legivel (nao e um binario opaco que ninguem sabe de onde veio).

## Trocar de voz (aco | madeira | prisma)
```
node scripts/sons-hbx-estudio.js ./tmp-sons --instalar=madeira
```
Sobrescreve os 17 mantendo o nome. Se nao gostar: `git checkout` na pasta.
⚠️ Instalar aqui NAO leva o som pro celular — o `.ogg` so chega no aparelho no
proximo build do APK (`npm run publish`, onde o APK e o ULTIMO passo).

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
- **09/08 — v2 MADEIRA** entra no lugar de MARCADO. O que a v1 nao fazia e que
  valia mais que a escolha de timbre: estalo de contato no ataque, queda em dois
  estagios, agudo morrendo antes do grave, sala curta, e nivelamento por
  LOUDNESS em vez de por pico. (Nivelar por pico era o que obrigava a tabela de
  volume do `HbxSoundEngine.kt` a ter 17 valores corrigidos na mao — ela agora e
  ajuste fino, nao conserto.) A ARMADILHA que custou uma rodada: aplicar a queda
  em DOIS lugares (dentro do timbre e no envelope) dobra o expoente e encurta a
  paleta inteira sem nenhum numero explicando por que.
