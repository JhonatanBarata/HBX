# 2D e 3D SÃO UMA TELA SÓ — contrato de execução (17/08/2026)

> Ordem do dono, com as 8 fotos na mão (16/08 madrugada). Nove itens. Este arquivo é o
> **CONTRATO**: nomes de classe, ganchos e donos de cada peça. Quem executa (worker) segue
> daqui; quem integra (sessão principal) cobra daqui. Nada de inventar nome novo — peça com
> dois nomes é a receita de os dois discordarem amanhã.

## O pedido, literal

1. Com rota montada, **2D e 3D em tela cheia**. Um ÍCONE desliga isso, **logo acima do atalho
   do chat** — e o atalho do chat **desaparece quando a tela cheia sai**, porque aí o chat
   volta a aparecer no guia (cabeçalho).
2. A tira de indicadores (**foto 1**: `2 h 13 restante · 73,9 km distância · 00:58 chegada`)
   passa a existir **nos dois modos**.
3. **Fotos 2 e 3** — o botão do meio se transmuxa entre os modos: 3D = `Panorâmica`
   (glifo `map`), 2D = `Direção` (glifo `nav`).
4. Na troca 3D→2D: **a foto 4 recolhe** (cartão da manobra) e **a foto 5 entra de cima**
   (o topo do 2D). Na volta, o inverso. A **foto 6** (bússola) aparece no 3D e some no 2D.
   *"A tela não tem mais motivo para piscar tudo, ambos os estados têm q ser idênticos."*
5. **Recuperar e melhorar o efeito de montar rota**: terminou o carregamento (foto 7) →
   escurece a tela **na cor original do mapa** → entra em tela cheia → roda a cena que já
   existe (ruas/rota desenhando com brilho) → **desce até o 3D**. O pouso obedece o
   **último modo usado** (decisão do dono: *"é o próprio Panorâmica/Direção"*) — 3D pousa no
   3D, 2D pousa no 2D. Subir e descer é o **mesmo mapa**.
6. Mapa **2D**: aproximando aparece o **número** da parada; com mais zoom, o **nome do
   cliente**.
7. Workers Opus fazem; a sessão principal junta as peças.
8. O dock passa a ser **painel de 4 botões, nos dois modos**: **esquerda** `Cancelar`,
   **centro** `Registrar` e `Finalizar`, **direita** `Panorâmica`/`Direção`.
9. **Chat com rota ativa não sai da tela cheia**: vira **pop-up** por cima do mapa.

## Decisões de arquitetura (fechadas — não reabrir sem o dono)

**D1. Um mapa só, um palco só.** `data-mapa="rota"` já é um palco único (16/08). Nada aqui
pode criar segundo palco, segunda instância de maplibre ou segunda câmera. Subir e descer é
`easeTo` no MESMO mapa (§ `45-troca-de-modo.js`).

**D2. O topo do 2D em tela cheia é o da foto 5** (decisão do dono, respondida no chat):
cabeçalho flutuante (HBX + lâmpada + balão do chat) **+** a barra de paradas. Os dois viajam
juntos numa peça só, `.plano-topo` — é ELA que "entra de cima" no item 4.

**D3. A coluna lateral é a mesma peça nos dois modos** (`.plano-lado` / `.gps-lado`, já é um
seletor só). Ordem, de cima pra baixo: **tela-cheia** → **chat** → **voz** → **alvo**.
O cadeado (`fechar-dia`) **sai da coluna**: ele virou o `Finalizar` do dock (item 8), e botão
repetido a 60px de si mesmo é o defeito que esta casa já pagou em 12/08.

**D4. O rodapé é UMA peça nos dois modos** (`.gps-rodape`): tira de indicadores (item 2) +
painel de 4 botões (item 8). O 2D em tela cheia **deixa de usar** `.tmx-dock`; sem tela cheia
(preferência desligada, ou dia sem rota) o 2D continua com `.tmx-dock` + abas, que é a tela de
app comum.

**D5. A troca 2D⇄3D não anima CAMADA — anima PEÇA.** A camada que sai já vira `so-cromo`
(sem fundo, 16/08). Agora ela também perde o `mvCheioSai`: quem se move são a manobra, o
`.plano-topo`, a bússola e o miolo do botão do meio. Mapa parado, cromo trocando.

**D6. A cena de montar é a cena que já existe.** Nada de efeito novo: `pedirCena` +
`entrarNaDescida` (ponte) e a marca `cena` na camada (mock). O que muda é (a) a cena passa a
valer no 2D também, (b) o pouso obedece o último modo, (c) o véu escurece na cor do mapa.

**D7. Preferência mora no aparelho, chega pelo seam.** `window.HBX.cache.set/get` é o
mecanismo (§ `00-nucleo.js:202`). O mock NUNCA lê `localStorage` — ele lê `DADOS`.

## Contrato de casca (mock `docs/mockups/logistica2.0/logistica-2.0.html`)

### Dados novos no seam (`DADOS.rota`)
| campo | tipo | default | quem escreve |
|---|---|---|---|
| `telaCheia` | bool | `true` | ponte (preferência do aparelho) |
| `modoUltimo` | `'mapa'` \| `'rota'` | `'mapa'` | ponte, a cada troca de modo |

`cheio` nas duas telas = `temRotaNoDia(estado) && DADOS.rota.telaCheia !== false`.

### Classes
| classe | onde | papel |
|---|---|---|
| `.plano-topo` | 2D, dentro de `.plano` | cabeçalho flutuante + barra de paradas (a foto 5) |
| `.plano.cheio` / `.tela.cheio` | já existem | tela cheia |
| `.tela.troca-desce` | as DUAS camadas | 2D→3D (a câmera desce) |
| `.tela.troca-sobe` | as DUAS camadas | 3D→2D (a câmera sobe) |
| `.tela.so-cromo` | camada que sai | já existe — sem fundo nenhum |
| `.tela.cena` | camada que entra | já existe — a cena de montar/entrar |
| `.gps-rodape` | os DOIS modos | rodapé único (indicadores + 4 botões) |
| `.gps-veu` | os DOIS modos | o escurecimento da cena, na cor do mapa |
| `.chat-wrap` | por cima de qualquer modo | o pop-up do chat (item 9) |
| `.map-pino .n` / `.map-pino .nome` | pino do mapa real | número e nome (item 6) |
| `.map-pino.min` / `.map-pino.com-nome` | pino do mapa real | rebaixado a ponto / com nome |

### Ganchos (`data-acao` / `data-ir`) que a ponte atende
| gancho | efeito |
|---|---|
| `tela-cheia` | alterna `DADOS.rota.telaCheia`, grava no aparelho, repinta, avisa o nativo |
| `abrir-chat` | abre o pop-up (`.chat-wrap`) sem trocar de tela — só com rota ativa |
| `navegar` (já existe) | `ir('mapa')` + grava `modoUltimo='mapa'` |
| `ir:'rota'` (já existe) | 2D + grava `modoUltimo='rota'` |
| `fechar-dia` (já existe) | agora mora no dock, rótulo **Finalizar** |

### `ROTA_ESTADOS` — o painel de 4
```
rodando:   { esq:Cancelar, meio:[Registrar, Finalizar], main:{acao:'navegar', glifo:'nav', rotulo:'Direção'} }
dirigindo: { esq:Cancelar, meio:[Registrar, Finalizar], main:{ir:'rota',     glifo:'map', rotulo:'Panorâmica'} }
```
`meio` é ARRAY de satélites (`.tmx-sat`), renderizado entre `esq` e `main`. `main` continua
`flex:1` e verde — a lei do "botão grande é o próximo passo" fica de pé. Os outros estados do
`ROTA_ESTADOS` **não mudam**.

⚠️ A altura do dock é conta MEDIDA (`--tmx-h`, `.body.com-dock:147px`, `--gps-rodape-h:133px`,
`--map-chao`, `--map-piso`). Quem mexer no número refaz a conta e ANOTA a medida no comentário.

## Contrato de ponte (`EntregaShell/app/src/logistica/ponte-src/*.js`)

| arquivo | o que muda |
|---|---|
| `80-gps-rotas-salvas.js` | `modoTelaCheia` passa a obedecer a preferência; grava/lê `HBX.cache('mapa-cheio')`; atende `tela-cheia`; escreve `DADOS.rota.telaCheia` no seam |
| `45-troca-de-modo.js` | grava `modoUltimo` na subida/descida; `acertarPinos` ganha o 3º degrau (nome, item 6) |
| `40-mapa-palcos.js` | `vestirPino` passa a montar `<b class="n">` + `<i class="nome">` (item 6) e a sonda `HBXTroca.pinos()` acompanha |
| `32-verbos-montar-iniciar.js` | `pousarNaRota()` pousa no `modoUltimo` (item 5) |
| `A0-chat-produtos.js` | o chat responde dentro do pop-up (item 9) |

## Portões

- Regenerar SEMPRE antes de medir: `node scripts/casca-injetar.js` (mock → `mock.js`/`mock.css`/
  `index.html`) e `node scripts/ponte-costurar.js` (`ponte-src/*` → `ponte.js`).
  Prova que abre `assets/app/**` chama `regenerarGerados()` na 1ª linha (§ `scripts/_regenerar.js`).
- Provas desta frente: `prova-ir-e-vir.js` (a troca), `prova-cena-ruas.js` (a cena),
  `prova-mapa-2d.js` (pinos/rótulos), `prova-espacos-rota.js` (as alturas),
  `prova-encaixe-gps.js` (o piso do puck), `prova-fluxo-rota.js` (montar → pousar).
- `check-pele.mjs` reprova hex/inline: **toda cor nova nasce em token**.
