# Os 17 .ogg de `res/raw/` deste flavor sao SILENCIO DE PROPOSITO

> Este arquivo mora AQUI e nao dentro de `res/raw/` porque `res/` so aceita nome
> de recurso valido (a-z, 0-9, underscore). `LEIA-ME.md` la dentro QUEBRA O BUILD:
> `'L' is not a valid file-based resource name character` (medido, nao suposto).

Ordem do dono (07/08): "remova os sons do app, vamos projetar outros (nao tire os
caminhos so os audios)". O app novo (flavor `logistica2`) fica COMPLETAMENTE MUDO
ate os sons novos entrarem. Chegada e despertador ficam so com vibracao + tela.

## Como funciona
Cada arquivo em `logistica2/res/raw/` tem o MESMO NOME de um som real em
`app/src/main/res/raw/`. No Android, recurso de flavor VENCE o de `main`. Entao o
`logistica2` toca estes silencios, e o `main` — usado pelo flavor `logistica`, o app
EM PRODUCAO do cliente — continua com os sons de verdade, intocado.

**NAO apagar arquivo e NAO mexer em `main/res/raw/`.** Apagar quebra o build (19
referencias `R.raw.*` em HbxSoundEngine.kt, ChegadaActivity.kt e MissaoAlarmeActivity.kt),
e mexer no `main` faria o proximo publish carimbar versao nova e mandar um app mudo
pro cliente de producao (a pasta `main` entra na impressao digital do APK em
`scripts/ops/deploy-vps.js`).

## Por que 2 segundos e nao 0 byte
`MediaPlayer.prepare()` estoura em arquivo invalido ou curto demais. Se estourar,
`ChegadaActivity.iniciarSomRaw()` retorna false e cai no `iniciarSomFallback()`,
que toca o ALARME PADRAO DO SISTEMA — o oposto de silenciar. Silencio valido de
2 s prepara e "toca" normalmente, sem barulho nenhum.

## Como repor um som novo
Sobrescreva o arquivo em `res/raw/` com o som novo de mesmo nome. **Zero linha de
codigo.** Toda a fiacao continua de pe: HbxSoundEngine, as Activities, os `R.raw.*`,
o `soundPrefs` e a previa da folha "Sons".

## Onde estao os originais
- No git, commit `e1afcd82` ("S1 fundacao de audio - HbxSoundEngine + 16 OGG em res/raw").
- E vivos, agora mesmo, em `app/src/main/res/raw/`.
