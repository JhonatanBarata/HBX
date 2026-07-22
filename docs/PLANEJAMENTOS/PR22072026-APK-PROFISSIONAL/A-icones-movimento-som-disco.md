# Worker A — S1 contrato · S2 movimento · S4 som · S5 disco

Arquivos que você pode tocar (**só estes dois**):
- `EntregaShell/app/src/main/assets/app/app.css`
- `EntregaShell/app/src/logistica/assets/app/app.js`

Se precisar mexer em `native.js` ou `mobile-contract.js`: **NÃO mexa** — outro worker está neles.
Anote no RESULTADO.

---

## S1 — o glifo volta a carregar só geometria

**Onde:** `app.css` linhas ~94–131.

O bloco `.hbx-icon[data-hbx-icon="x"] > path:first-of-type { stroke: var(--info) }` (e os ~30
seletores irmãos) pinta **filho por filho, selecionando por posição no DOM**. É o mesmo pecado do
`fill='currentColor'` que já estava cravado no glifo `stop` — só mudou de lugar, do JS pro CSS, e
ficou pior: amarra a aparência à ORDEM dos sub-elementos dentro da string do traçado. No minuto em
que alguém trouxer um glifo novo do Lucide (que é o que a regra manda fazer quando falta um), a cor
cai na parte errada ou some — sem erro, sem aviso.

Além disso a cor deixou de significar estado: `trash` vermelho SEMPRE, `lock`/`calendar`/`moon`/
`wallet` âmbar SEMPRE. Vermelho para de querer dizer "você está travado" e passa a querer dizer
"isto é uma lixeira"; cadeado âmbar numa linha de Ajustes vira alarme permanente que não alarma
nada. Sinal que está sempre ligado não é sinal.

**Fazer:**
1. Apagar o bloco inteiro de cor por sub-elemento (das linhas ~94 até ~131, incluindo a regra
   `.btn-primary .hbx-icon > * { stroke: currentColor }`, que só existia pra desfazer o estrago).
   Ícone volta a ser 100% `currentColor`. Quem pinta é o COMPONENTE — o botão de perigo é vermelho
   e o ícone herda; o chip de sucesso é verde e o ícone herda.
2. Se ao apagar algum ícone ficar sem contraste onde HOJE tinha (ex.: um ícone solto sobre fundo
   claro que dependia do `--info`), a correção é na CLASSE DO COMPONENTE (`color:` no botão/chip),
   nunca voltando o seletor por sub-elemento.
3. **Bug de tema, confirmado:** `--info: #0865df` está definido só no `:root` (linha 24). O bloco
   `:root[data-theme="dark"]` (linha 34) redefine `--danger`, `--warning`, `--success` — mas NÃO o
   `--info`. No escuro fica azul de tema claro sobre `--surface: #151c15`: contraste cai de ~5,3:1
   pra ~3,3:1. Definir um `--info` claro no bloco dark (mesma família, luminosidade alinhada com
   `--success: #73d69b`). Deixar comentário explicando por que o par dark existe.

---

## S2 — movimento domado (a causa do "sobe e desce")

**Onde:** `app.css` ~133–191, `app.js` `replayIconMotion()` (~356) e o listener de `pointerdown`
(~5250) / `click` (~5268).

### 2a. Animação deixa de ser global no toque
Hoje `replayIconMotion` está pendurado no `pointerdown` de **qualquer** toque no app, e sobe pelo
`closest("button,a,[role='button'],[data-action],[data-nav],[data-screen]")` pra achar um ícone.
Dois problemas: (i) dispara dentro dos cards que usam **segurar-pressionado** (Lei 1 do APK —
excluir é segurar, nunca lixeira), então duas linguagens visuais competem no mesmo gesto e a que
não pode falhar é a do hold; (ii) qualquer toque de scroll acende ícone.

Trocar por: **opt-in**. Só anima quem foi marcado de propósito — ex.: `[data-hbx-motion]` no
controle, ou lista curta e explícita de ações que merecem feedback (refresh, tema, play/stop).
Manter o respeito a `prefers-reduced-motion` que já existe.

### 2b. Limpar a classe no fim
`is-animating` entra e **nunca sai**. Usar `animationend` pra remover. E trocar
`animation-fill-mode: both` por `backwards` — `both` congela `transform`/`filter` como identidade e
cria containing-block eterno pra `position: fixed` (foi o que já cortou modal em 22/07; está
registrado na memória `fill-both-quebra-modal-fixed`).

### 2c. `stroke-dasharray: 64` chumbado
Linha ~155: o mesmo `64` serve `route`, `check` e `volumeOff`, que têm comprimentos bem diferentes.
Em traçado curto o "desenhar" vira um fade. Correto: `pathLength="1"` no elemento (adicionar no
`icon()` do `app.js` ou nos paths do catálogo) + `stroke-dasharray: 1` / `stroke-dashoffset: 1`.

### 2d. Ícone parado fica parado — o "sobe e desce" ao criar rota
`app.css` ~1020–1030: `.lrt-endereco-loading-icon` tem `animation: lrt-gps-pulse 1.15s
ease-in-out infinite` — escala 1↔1.04 + anel de sombra, **pra sempre**, e dentro dela mora o ícone
`gps` (`app.js` ~3094, tela "Recebendo sinal do GPS… / Localizando endereço…"). É um ícone
respirando sem parar durante a criação da rota. **Tirar o pulso do ícone.** A espera já tem
indicador honesto: o anel `hbx-loading-spin` de `.lrt-endereco-loading::before` (linha ~1017) —
usar ele, ou uma barra de progresso indeterminada. Um indicador de espera, não dois.
**Manter** `route-current-location-pulse` (linha ~623): esse é o ping do ponto azul NO MAPA, é o
padrão do mercado (Google Maps/Waze) e não é ícone de UI.

Varredura final: nenhuma `animation: ... infinite` pode cair em `.hbx-icon` nem em elemento que
contenha um. Loop só em spinner de carregamento de verdade.

---

## S4 — 1 gesto = 1 som

**Onde:** `app.js`. O gate central `toast()` (linha ~424) já toca som sozinho:
`if (!options.mudo) H.sound(error ? "error" : "success")`. A arquitetura está certa — quem chama
`H.sound()` explícito tem que passar `{ mudo: true }` no toast que vem junto.

`confirmDelivery` (~4919-4921) faz certo: `H.sound("delivery_complete")` + `toast("...", false,
{ mudo: true })`. **Auditar TODOS os outros call sites** de `H.sound(` (há ~15: linhas ~1883, 2642,
3281, 3987, 4002, 4015, 4624, 4986, 5106, 5161, 6553) e conferir, em cada fluxo, se existe um
`toast()` sem `mudo` disparando no mesmo gesto — isso são dois sons quase simultâneos, que é
exatamente o que o dono ouve como "tocando 2x".

Conferir também:
- listener registrado de novo a cada render (acúmulo = 2x, 3x…). O guarda `__hbxDayBound` em
  `render()` (~4450) existe porque isso JÁ aconteceu com `[data-day]`. Procurar
  `addEventListener` dentro de função chamada pelo `render()` sem guarda equivalente.
- som dentro de função que também é chamada pelo `refresh()`/`render()`, não só pelo gesto. Foi a
  causa do fix `19a4141b` (som de iniciar rota tocava 2x em "Iniciar" e "Continuar rota") — o
  padrão pode ter sobrado em outro fluxo.

Regra a documentar em comentário: **som toca no FATO, depois do `await`, no ponto único do fluxo**
— nunca no clique, nunca em função reusada pelo refresh.

---

## S5 — o disco de rota nasce do catálogo

**Onde:** `app.js` ~3545–3555 (markup do `.route-transmux`) e `app.css` ~686–727.

O disco play/gps/stop é hoje um SVG desenhado à mão, com **hex cravado**: `#fff`, `#168be8`,
`#e10a1d`, `rgba(8,101,223,.22)`, `rgba(223,7,26,.14)`. É o exemplo mais visível de "cada ícone
decide a própria aparência" — e é o botão principal do app.

**Fazer:** os símbolos passam a sair da geometria do catálogo `paths` (`play`, `stop`,
`navigation`/`gps`), escalados pro viewBox 120 do disco (grade 24 → fator 5).

**Dois cuidados, nesta ordem de prioridade:**
1. **O disco continua SÓLIDO.** Ele é um CTA de 90px; contorno de traço 1.8 esticado nesse tamanho
   lê fino e fraco. "Cheio é papel do COMPONENTE" — o preenchimento vem da classe do disco, a
   SILHUETA vem do catálogo. Não empurre o outline cru pra dentro do disco.
2. **Zero hex.** Tudo em token (`--brand`, `--cta`, `--danger`, `--surface`). Se faltar token pra
   algum caso, criar UM token nomeado no `:root` + par dark, nunca hex solto.

O `stop` atual é um octógono de placa com barra vermelha, e o catálogo tem `rect rx 2.5`.
Padronizar pelo catálogo (é o ponto do A). **Se na sua avaliação o resultado ficar pior que o
octógono, NÃO decida sozinho: implemente pelo catálogo e registre a ressalva no RESULTADO** — o
dono julga com o olho dele.

---

## Fechamento
- Sem branch nova. Commit local no `master`, mensagem `fix(apk): ...`, sem publish.
- Um commit por sprint (S1, S2, S4, S5) — o dono precisa poder reverter um sem perder os outros.
- Escrever `A-RESULTADO.md` nesta pasta: o que mudou, o que NÃO deu pra fazer, ressalvas visuais e
  qualquer necessidade de mexer em arquivo do worker B.
- **Não testar no aparelho** — o dono testa.
