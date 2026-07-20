# W — Player do tutorial corta vídeo em pé (retrato) na web

## Dor (provada, 20/07)
Vídeo do tutorial gravado **em pé (retrato, celular)** aparece **gigante e cortado** na web
(`/tutorialexterno`). No Picture-in-Picture do navegador fica perfeito — ou seja, o ARQUIVO está
certo; o que corta é o CSS do player. Causa exata em `public-entry.css`:
```css
.f1-tut__media { position: relative; aspect-ratio: 16 / 9; overflow: hidden; ... }
.f1-tut__media video { object-fit: cover; }
```
A caixa é forçada a **16:9** (paisagem) e o vídeo usa **`object-fit: cover`** → um vídeo retrato é
ampliado pra cobrir a largura e topo/base são cortados. Precisa respeitar a proporção real do
arquivo (retrato OU paisagem), sem cortar.

## Correção (2 arquivos, cirúrgica)
O embed (YouTube/Vimeo, iframe) e o estado vazio DEVEM continuar 16:9 — só o **vídeo enviado
(upload)** ganha proporção natural. Faz-se isso com uma classe modificadora só no caso `<video>`.

### 1. `frontend/src/app/tutorialexterno/page.client.tsx` (~linha 138)
O wrapper hoje é `<div className="f1-tut__media">`. Adicionar a modificadora `--file` **apenas
quando o playback é vídeo enviado** (kind === "video"); iframe e vazio ficam sem a classe:
```tsx
<div className={"f1-tut__media" + (playback && playback.kind === "video" ? " f1-tut__media--file" : "")}>
```
`playback` já está em escopo (o bloco logo abaixo é `{playback ? ... : ...}`). NÃO mexer em mais nada.

### 2. `frontend/src/app/hbx-theme/public-entry.css`
Logo APÓS a regra `.f1-tut__media video { object-fit: cover; }` (a ~linha 622), acrescentar o
bloco abaixo. Usar o seletor COMPOSTO (`.f1-tut__media.f1-tut__media--file`) pra garantir maior
especificidade que as regras base, independente de ordem:
```css
/* Vídeo ENVIADO (upload) pode ser retrato (celular em pé) ou paisagem. Não forçamos
   16:9 nem cortamos: respeitamos a proporção real do arquivo, com teto de altura pra
   vídeo em pé não estourar a tela. Embed (YouTube) e estado vazio seguem 16:9 acima. */
.f1-tut__media.f1-tut__media--file {
  aspect-ratio: auto;
  display: grid;
  place-items: center;
  max-height: min(74vh, 640px);
}
.f1-tut__media.f1-tut__media--file video {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: min(74vh, 640px);
  object-fit: contain;
}
```

## Regras do repo
- Trabalhar direto na master; NÃO commitar (o orquestrador publica). NÃO criar branch. NÃO publicar.
- SÓ estes 2 arquivos. Comentário PT-BR no estilo do arquivo.
- NÃO introduzir cor nova (hex) nem `#` em comentário (quebra o `check-pele.mjs`). O bloco acima
  é 100% layout, sem cor — manter assim.

## Checks obrigatórios (rodar e colar saída real)
```
cd frontend && node scripts/check-pele.mjs   (ou: npm run lint, se for o gate de pele)
cd frontend && npx tsc --noEmit -p tsconfig.json
```
Se `check-pele.mjs` não existir nesse caminho, procure o script real do gate de pele e rode-o.
Reportar: diff dos 2 arquivos + saída literal dos checks.
