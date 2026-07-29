# PR29072026 — CORRIGIR-O-LIXO (Modo Passeio do jeito que o dono pediu)

Veredito do dono 29/07: a v1 virou "um terror de digitações e telas infinitas"
(Modo passeio → novo roteiro → nome → "nenhum lugar ainda"). O certo nunca foi
um mini-app: é uma **PELE da tela Rota**. Regra deste plano: **zero tela nova,
zero digitação obrigatória, zero portão**. O mapa É a tela.

## A CENA (é o aceite — se a sequência abaixo não acontecer, não entregou)

1. Ajustes → toca **"Modo passeio"** → **cai na tela Rota** com os guias
   sumidos: fica o **hero de cima + BUSCA em cima do mapa + MAPA grande +
   "Iniciar passeio ›"** e um **ícone à direita no hero** (modo trabalho).
   MONTAR o passeio é AQUI, nesta tela: pino por toque OU por busca — não
   existe "onde eu monto", a tela É a montagem.
1b. **BUSCA (estilo Google Maps, 1 campo só):** digita "Catedral" ou
   "Av. 8, 500, Rio Claro" → lista curta de resultados → toca → **vira pino**
   no mapa (a câmera vai até ele). É o "onde eu pesquiso".
2. **Toca no mapa 3× = 3 pinos numerados** caem na hora (vibra). **NADA abre,
   NADA pergunta — nem nome, nem tempo, nem modal.** (Bronca literal do dono:
   "toque no mapa → nome (OUTRO NOME) kkkk → tempo no lugar → um 30 embaixo,
   totalmente aleatório" — TUDO isso morre. Toque = pino = pronto.)
3. Quer ajustar? **Toca no PINO** → balão compacto em cima do mapa: chips
   15/30/45/60 + "Remover" (+ nome opcional inline, 1 campo que ninguém é
   obrigado a tocar). **O campo numérico solto de minutos NÃO EXISTE** — só
   chips. Fechou o balão = salvo.
4. **"Iniciar passeio ›"** → debita (como hoje) → **cartão compacto sobre o
   mapa** (molde do painel "Próxima parada"): "Indo para Lugar 2 · 1,2 km"
   [Navegar] [Cheguei] → chegou → countdown no cartão [+15] [Próximo ›].
   Alarme nativo e voz continuam os de hoje (esses ficaram certos).
5. **Ícone à direita** → volta pra tela padrão de trabalho NA HORA (tour, se
   ativo, segue vivo em fundo — o ícone ganha um ponto indicando).

## O que MORRE (da v1 de 29/07)

- A tela `passeioScreen` com 3 vistas (lista → editor → tour) como PORTA.
- Modal "Novo roteiro" + nome obrigatório de roteiro.
- Modal "Novo lugar" como passo obrigatório (vira balão opcional no pino).
- O vazio "Nenhum roteiro ainda / Nenhum lugar ainda" como primeira coisa que
  o usuário vê.

## O que FICA (bagagem pronta, não reescrever)

- Backend INTEIRO: débito idempotente por tourId, gate admin×passeioEquipe,
  ação `passeio_tour` no /master. Intocado.
- `PasseioAlarme.kt` + ponte (alarme nativo com tela apagada) — intocado.
- OSRM self-host (`hbx-osrm`) + `roadGeometry` pra linha pelas ruas.
- Auto-chegada (<80 m com accuracy boa), voz, sons, persistência em H.cache.
- Chave "Liberar para a equipe" nos Ajustes.
- Lei 1 no pino: **segurar o pino no mapa = remover** (com o vermelho de hold).

## Sprints (pequenos, cada um termina na tela)

- **S1 — A pele:** "Modo passeio" nos Ajustes liga `passeio-modo` e cai na
  Rota; `body.pss-active` esconde nav/avisos/lista de entregas; hero ganha o
  ícone da direita (alternar trabalho↔passeio, persiste no cache). Mapa da
  rota vai pra GARAGEM (mecanismo pronto do item 8) e o mapa do passeio assume
  o mesmo espaço, tela cheia.
- **S2 — Pino direto:** toque no mapa = pino numerado na hora (nome nasce
  sozinho "Lugar N", tempo nasce 30 min — em SILÊNCIO, sem mostrar formulário
  nenhum). Toque no pino = balão inline (chips de tempo + Remover + nome
  opcional). Segurar pino = remover (Lei 1). Traçado persiste sozinho (sem
  "salvar", sem nome de roteiro). O modal "Novo lugar" inteiro morre.
- **S2b — Busca no mapa:** campo único flutuando no topo do mapa;
  `GET /logistica/geo/busca?q=` novo no backend (proxy Nominatim com cache +
  freio de 1 req/s — mesmo espírito do proxy OSRM; endereço BR pode desempatar
  pelo CNEFE que já é nosso). Resultado tocado = pino (nome vem do resultado —
  ninguém digita nome). Allowlist do APK ganha a rota nova + rebuild.
- **S3 — Tour no cartão:** "Iniciar passeio ›" (debita, mesmo endpoint) →
  cartão compacto sobre o mapa com os 2 estados (indo / no lugar + countdown);
  Encerrar mora no cartão (confirmação). Reusar o motor de tour da v1
  (passeioChegou/Mais15/Proximo/alarme) — só a CASCA muda.
- **S4 — Roteiros discretos (opcional, só depois do dono aprovar S1-S3):**
  chip "Roteiros" no canto do mapa → bottom-sheet: salvar o traçado atual com
  nome (1 campo) e carregar salvo (1 toque). NUNCA porta de entrada.
- **S5 — Bateria:** reescrever o bloco B do PR29072026-MODO-PASSEIO-TESTES.md
  pra esta cena (o bloco A/backend e o C/regressão continuam valendo).

## Regras de forma (pra não repetir o erro)

- Nenhum fluxo do passeio pode exigir teclado. Digitação é sempre OPCIONAL.
- Nenhuma tela intermediária entre "cliquei em Modo passeio" e "estou vendo o
  mapa pronto pra tocar".
- Copy: só o que está na CENA. Nada de instrução em parágrafo.
