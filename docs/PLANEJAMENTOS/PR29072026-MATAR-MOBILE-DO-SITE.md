# PR29072026 — MATAR O MODO MOBILE DO SITE (sem legado)

**Pedido do dono (29/07, depois de logar com `jbinformatica1100@gmail.com` e cair numa
tela quebrada em `/entrega/financeiro`):**

> "Primeiro lugar: isso é temas, ache um remendo para não aparecer isso novamente agora.
> Depois crie um plano para limpar SEM LEGADO o modo mobile pelo site. Motivo: bagunçou,
> tem coisa no apk q não tem no webview, tem coisa no webview q não tem no apk. Eu sou uma
> pessoa só. Motivo2: estamos já fazendo o app android, assim que sair para o iphone vamos
> remover de vez do webview."

Texto que o dono CRAVOU pra tela nova (Lei nº8 — copy cravada é literal):

> "Esta tela ainda vive só no app. No celular Android use nosso app de instalar :
> {Link do app em um botão} (futuramente) e o Iphone use a apple store."

---

## 0. ALVO E NÃO-ALVO (fixado pelo dono em 29/07 — ler antes de tudo)

O plano mata **UMA** coisa: **o modo celular DO SITE**. Nada mais.

| | |
|---|---|
| 🎯 **ALVO — morre** | A casca de celular do site (`components/casca/` + 19 telas duplicadas), o CSS mobile, o breakpoint que transformava o site em app de telefone, e o `/entrega` **quando aberto no celular**. |
| ✅ **NÃO-ALVO — não se toca** | **O APK** (`EntregaShell/`, assets locais — nunca carrega o site) e **o sistema no COMPUTADOR** (`/logistica`, `/vendas`, `/entrega` no desktop, todo o `(app)/`). |

**No computador nada some, nada encolhe — pelo contrário: o desktop ENGORDA.**
Frente irmã aberta em 29/07: `/logistica` no computador ganha o console de montagem
em paridade com o celular (mapa, distância entre paradas, total de km, previsão de
terminar, créditos que o Iniciar vai debitar, portão de endereços com erro, desfazer
ao sair sem confirmar) — hoje o montador do site é cego e só escreve "Rota planejada.".
Matar o mobile do site é o que TORNA isso possível: uma tela por lugar.

---

## 1. DIAGNÓSTICO — por que ficou horrendo (o dono acertou: **é tema**)

Três defeitos empilhados, medidos no código:

**(a) A casca mobile só tem roupa numa pele.**
`grep -c "\.casca" app/hbx-theme/casca-*.css`:

| folha | regras `.casca*` |
|---|---|
| `casca-modern.css` (casca **Backup**, attr `modern`) | **21** |
| `casca-premium.css` (casca **HBX** — a PADRÃO desde 28/07) | **0** |
| `casca-corporativa.css` (casca **Corporativo**) | **0** |

A Premium foi escrita do zero em 28/07 ("NÃO APROVEITE NADA") e **nunca ganhou o
capítulo do celular**. Como ela é a casca padrão, todo mobile do site anda pelado:
só a estrutura crua do `casca.css`.

**(b) O nome da empresa fugiu pro meio da tela.**
`.ent-top-empresa` (entrega.css:2235) é `position:absolute; left:50%; top:50%`.
O `position:relative` que segurava ele morava **só** em
`casca-modern.css:310` (`[data-casca="modern"] .casca-top`). Fora da Backup, o
âncora vira a `.casca` (`position:fixed; inset:0`) — ou seja, **o centro da
viewport**. Foi por isso que `jbinformatica1100@gmail.com` (o nome da empresa dele)
apareceu em negrito no meio da tela, por cima do conteúdo. Confere na foto: o
texto está exatamente em `altura/2`.

**(c) Largura sozinha decidia "isto é um celular".**
`QUERY = (max-width: 767px)`. Estreitar a janela do **computador** transformava o
app inteiro no app de telefone — casca, tab bar e tudo. Foi o que aconteceu quando
ele redimensionou.

---

## 2. REMENDO — JÁ APLICADO (entrou no publish `da78b1f4`, 29/07 16:03)

| # | arquivo | mudança |
|---|---|---|
| 1 | `frontend/src/app/hbx-theme/casca.css` | `.casca-top { position: relative }` — subiu de `casca-modern.css` pra folha ESTRUTURAL. Vale nas 3 cascas; o nome da empresa volta pro topo em qualquer pele. |
| 2 | `frontend/src/lib/casca-mobile-const.ts` | `QUERY` ganhou `and (pointer: coarse)`. Mouse/trackpad = `fine` → **janela estreita no PC nunca mais vira app de telefone**. Celular/tablet (dedo = `coarse`) continua igual. |

Fonte única: o script de boot pré-pintura (`layout.tsx`) e o hook `useCascaMobile`
leem a MESMA `QUERY` — 1 linha cobre os dois caminhos.

Gates: `tsc` verde; `check-pele` sem nenhuma linha dos meus 2 arquivos (o vermelho
que sobra é o pré-existente do `kit.css`).

**Isto é remendo, não cura.** A cura é a seção 4.

---

## 3. INVENTÁRIO — o que exatamente é "modo mobile pelo site"

### MORRE (o alvo)

| bloco | tamanho | o que é |
|---|---|---|
| `frontend/src/components/casca/` | **5.524 linhas**, 20 arquivos + **19 telas** em `screens/` | A casca de celular do app central: shell, tab bar, registry, transições, swipe, toast + reimplementação mobile de Vendas (funil/buscar/foco), Conversas (lista/chat), Empresas (lista/ficha), Configurações, folha "Mais". **Cada uma dessas 19 telas é uma segunda versão da tela do desktop** — é a bagunça que o dono descreveu, dentro do próprio site. |
| `app/hbx-theme/casca.css` | 761 | estrutura da moldura mobile |
| `app/hbx-theme/casca-mobile-acabamento.css` | 328 | acabamento premium do mobile |
| bloco `.casca*` do `casca-modern.css` | 21 seletores (~210 linhas) | a única roupa que existe |
| `lib/casca-mobile.ts` · `casca-mobile-const.ts` · `casca-fullscreen.ts` · `casca-toast.ts` | ~150 | breakpoint, boot, fullscreen, toast |
| `app/layout.tsx` — `CASCA_BOOT` + `CASCA_BOOT_CSS` | ~10 | script + `<style>` pré-pintura que esconde a sidebar |
| `app/entrega/**` (web) | **11.705 linhas** + `entrega.css` **2.442** | o app de entrega **no navegador** — o gêmeo divergente do APK (ver decisão D1) |
| 47 `@media (max-width: …)` em 17 folhas | — | varredura final (fase F4) |

### FICA (não é mobile-web — é PONTE do APK; derrubar quebra o app do celular)

- `app/mobile/entry/` → resgata a sessão do APK (`POST /mobile/devices/web-session`).
- `components/hbx/mobile-device-topbar.tsx` · `mobile-app-login-card.tsx`
- `app/(app)/configuracoes/aplicativo/` (painel do aparelho) e `app/(app)/logistica/instalar/` (QR de pareamento).
- `lib/app-mobile.ts` → `MOBILE_APK_URL` — **já existe a fonte única do link do APK**
  (`NEXT_PUBLIC_ANDROID_APK_URL` ou `/download/android-logistica`). A Porta do App
  (F1) usa esta constante, não inventa link novo.
- `app/rota/page.client.tsx` (site público da Rota) e a landing.

**Confirmado no código:** o APK carrega `LOCAL_ENTRY` (assets locais —
`MainActivity.kt:250`), **nunca** `hbxsystem.com.br/entrega`. Apagar o mobile do site
não encosta no APK.

---

## 4. AS FASES

### F1 — A PORTA DO APP (a única tela mobile que sobra)

Um componente só, `components/hbx/porta-do-app.tsx`, montado no `AppShell` **no lugar**
da `MobileShell`. Viewport de celular (ou dedo) → renderiza SÓ isto, nunca a tela real:

```
Esta tela ainda vive só no app.
No celular Android use nosso app de instalar:  [ Baixar o app ]   ← MOBILE_APK_URL
(futuramente) e o Iphone use a apple store.
```

- Texto **literal** do dono (Lei nº8) — zero parágrafo inventado.
- Reage a redimensionamento ao vivo (mesma `QUERY`, já é `matchMedia` reativo).
- CSS: **classe central nova** em `casca.css` renomeado pra `porta-do-app.css` — zero
  hex, tokens `--hbx-*` (5 Leis). Nasce vestida nas **3** cascas, não em uma.
- Rotas que NÃO passam pela porta: `/` (landing), `/?entrar`, `/mobile/entry`,
  `/rota`, `/acompanhar` (rastreio público do cliente final) e `/entrega` enquanto a
  decisão D1 não sair.

**Fim da F1 = o dono nunca mais vê tela mobile quebrada**, em qualquer largura,
em qualquer pele.

### F2 — Demolir a casca central (sem legado)

`git rm -r components/casca/` inteiro (5.524 linhas, 19 telas duplicadas),
`casca-mobile-acabamento.css`, o bloco `.casca*` do `casca-modern.css`,
`lib/casca-mobile*.ts`, `casca-fullscreen.ts`, `casca-toast.ts`, o
`CASCA_BOOT`/`CASCA_BOOT_CSS` do `layout.tsx` e a classe `app-shell-root`.
Nada de flag, nada de "deixa quieto que não atrapalha" — **sem legado é sem legado**.

⚠️ Antes de apagar, 3 coisas moram lá e precisam de moradia (senão viram
["fica pra depois" sem moradia](../../CLAUDE.md)):
1. `CascaLoading` — o loader com a marca HBX. Vai pra `components/hbx/` (a Porta usa).
2. `HbxMarkViva` — a marca »HBX viva. Idem, ou morre junto (decisão de 1 linha).
3. `CascaToastHost`/`casca-toast.ts` — **o `/entrega` usa** (`EntregaScaffold`). Só
   morre depois da D1.

### F3 — `/entrega` no navegador → **desktop-only** (D1 FECHADA, 29/07)

11.705 linhas + 2.442 de CSS. É o maior pedaço e é exatamente onde mora a divergência
"tem coisa no APK que não tem no webview".

**Saída única:** `/entrega` vira **desktop-only**. No celular cai na Porta do App; no
computador continua sendo o sistema da empresa só-logística ("MODO DISTRIBUIDORA", a
coluna de 560px que já existe em `entrega.css:2372`).

⛔ **A saída "matar o `/entrega` inteiro" foi DESCARTADA** (era a antiga opção B).
Ela tirava uma tela **do computador** — fora do alvo da seção 0, e deixaria a empresa
só-logística sem sistema no PC (ela não tem `/dashboard`; o `SoLogisticaGate` manda ela
pro `/entrega`). Regra desta frente: **no desktop nada é removido.** A divergência do
desktop com o APK se resolve ENGORDANDO o `/logistica` do computador (seção 0), nunca
apagando tela de PC.

### F4 — Varredura das 47 media queries + PWA

Com a Porta no lugar, `@media (max-width: 480–860px)` em 17 folhas vira código morto.
Varrer folha por folha, medindo no navegador (não apagar às cegas — CSS
[morre calado](../../CLAUDE.md) e o build fica verde). Junto: decidir o
`/entrega/manifest.webmanifest` e o `hbx-sw.js` (PWA "HBX Entregas" instalável no
celular — se o mobile web morre, o PWA morre com ele).

### F5 — iOS

Quando o app do iPhone sair: trocar o "(futuramente)" pelo link real da App Store na
Porta do App. **Um arquivo, uma linha** — é o objetivo de todo o resto do plano.

---

## 5. DECISÕES ABERTAS (não decido sozinho)

| # | pergunta | recomendação |
|---|---|---|
| ~~**D1**~~ | ~~`/entrega` no navegador: desktop-only ou morre inteiro?~~ | **FECHADA 29/07: desktop-only.** No desktop nada é removido (seção 0). |
| **D2** | Hoje não existe app iOS. A Porta do App **bloqueia** o cliente de iPhone: ele não opera nada pelo celular até o app sair. É isso mesmo? | sim — é o preço de "eu sou uma pessoa só" |
| **D3** | O "(futuramente)" do texto qualifica o **botão do Android** (o link ainda não existe) ou a **App Store**? Mudar isso muda a frase na tela. | App Store |

## 6. ORDEM SUGERIDA

`F1` (a Porta — resolve a dor) → `F2` (demolir a casca) → `D1` → `F3` → `F4` → `F5`.

F1 sozinha já entrega o pedido do dono; F2 em diante é a limpeza que impede a bagunça
de voltar.
