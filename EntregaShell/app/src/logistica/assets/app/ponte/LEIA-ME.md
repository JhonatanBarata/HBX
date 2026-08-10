# A PONTE É GERADA — a fonte é `ponte/src/`

`../ponte.js` (o que o `index.html` carrega e o que vai dentro do APK) **é SAÍDA**,
gerado por `scripts/ponte-costurar.js`. Quem se edita é `ponte/src/NN-nome.js`.

| Quero | Rode |
|---|---|
| gerar o `ponte.js` a partir da fonte | `node scripts/ponte-costurar.js` |
| provar que o embarcado É a costura da fonte | `node scripts/ponte-conferir.js` |
| repicar do zero (uso único, 10/08) | `node scripts/ponte-picar.js --forcar` |

## As três regras

1. **O gerado não se edita.** Conserto feito em `ponte.js` some no próximo
   `costurar` — a mesma lição que já custou duas vezes o cordão de update no
   `index.html`. O `ponte-conferir` reprova exatamente esse caso, e ele roda no
   publish (`scripts/ops/deploy-vps.js`) antes do commit e antes da digital do APK.
2. **Um arquivo de fonte não passa de 1.000 linhas** (ordem do dono, 10/08). O
   `ponte-conferir` reprova quem passar.
3. **A costura é concatenação pura, na ordem do NOME** (`00`, `10`, … `A0`, `B0`).
   Sem wrapper, sem cabeçalho, sem `export`: os pedaços são fatias contíguas do
   MESMO IIFE, então o escopo léxico volta inteiro e os `let` de topo continuam
   se enxergando. Nome novo entra no lugar certo da ordem — nome torto embaralha
   o arquivo, e por isso o padrão `NN-nome.js` é conferido.
