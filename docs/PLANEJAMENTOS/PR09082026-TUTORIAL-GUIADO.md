# PR09082026 — TUTORIAL GUIADO: O OBRIGATÓRIO E O AVANÇADO

> Encomenda do dono (09/08): *"tutorial que todo cliente depois dessa atualização vai ter q ler.
> Obrigatório: simples de tudo, explica como montar a rota, onde acessar clientes e cadastro.
> Avançado: ensina tudo, mas dá pra fechar a qualquer momento. Já existe tutorial hoje, mas
> quero muito mais bem feito: efeito blur escuro na parte q está fora, aguardando o click do
> cliente, ensinando ativar o modo prospector (se não tiver, tem q pular sozinho essa parte).
> Objetivo: o cliente parar de fazer pergunta besta."*

**Cena de aceite:** motorista novo abre o app pela 1ª vez → o app o pega pela mão: tudo escuro
e desfocado, só o botão certo aceso, o balão diz o que fazer, e **o passo só anda quando ELE
toca no botão de verdade**. Em ~90 segundos ele montou uma rota, achou os clientes e sabe onde
cadastra. Depois disso, a lâmpada e o "Aprenda a usar" nos Ajustes ensinam o resto — fecháveis
a qualquer momento. Prospector só aparece pra quem TEM.

---

## §1 — O QUE EXISTE HOJE (medido no código, não de cabeça)

Duas peças, nenhuma faz o que o dono pediu:

| Peça | Onde | O que faz | O que NÃO faz |
|---|---|---|---|
| **AULA DA TELA** (lâmpada) | `logistica-2.0.html:5646-5770` (motor) + `:1737-1758` (furo/caixa) | Coach mark de mercado: escurece com `box-shadow` gigante, abre FURO na peça real medida na hora, 7 telas com aula (`AULAS`, `:5662`), teto de 4 passos, passo sem alvo cai sozinho e grita no console | É **passiva** ("A AULA NÃO APERTA BOTÃO", `:5655`) — anda no "Próximo", nunca espera o clique real; é **por tela** — não existe jornada Rota→Ajustes→Clientes; visto é **por APARELHO** (`localStorage hbx:aula:`, `:5706`); **sem blur** (scrim chapado `rgba(3,7,14,.8)`); **sem condição por empresa** (prospector/financeiro/admin não filtram nada); **ninguém é obrigado** a ver |
| **`.pt-passo`** (mini-passos) | `:712-729` | Linha inline neutra que explica função ainda não usada, dentro de portões | É texto parado; não guia, não destaca, não espera nada |

**O diagnóstico em uma frase:** o esqueleto certo (furo medido, passo-como-seletor, filtro que
pula passo sem alvo) **já existe** — falta virar um TOUR: jornada entre telas, que espera o
dedo, com blur, obrigatório 1ª vez, e com capítulo condicional por empresa.

Regra de obra: **evoluir a AULA in-place** (mesma `.aula-wrap`/`.aula-furo`/`.aula-cx`), nunca
um segundo motor concorrente. Dois motores de coach mark = duas verdades pra mesma tela.

---

## §2 — ARQUITETURA: UM MOTOR, DOIS USOS

### 2.1 O motor (TOUR) — evolução do `abrirAula`

Cada passo deixa de ser `[seletor, título, texto]` e vira objeto:

```js
{ tela:'rota',                    // jornada: o tour chama ir() se não estiver nela
  alvo:'[data-acao="montar"]',    // o furo — continua SELETOR (manual que envelhece junto com a tela)
  tipo:'fazer',                   // 'fazer' = espera o CLIQUE REAL no alvo | 'mostrar' = botão Próximo
  titulo:'Monte sua rota', texto:'Toque aqui. Só aparece dia que tem cliente.',
  se: d => d.config.prospectorAtivo }   // condição: falsa ⇒ passo/capítulo PULA SOZINHO, sem buraco
```

- **`fazer` = aguardando o click do cliente.** O scrim bloqueia TUDO (`pointer-events`), menos
  o furo — o alvo real continua clicável e **o clique de verdade é o que avança** (o clique
  também executa a ação real: aprendeu fazendo). 4 s sem tocar ⇒ o anel do furo **pulsa**
  (padrão de mercado: dica sem bronca). Tocar fora não vaza e não fecha.
- **Jornada:** passo com `tela` diferente da atual navega e **re-monta na camada VIVA** —
  mesma lei do `portao()` (última `.tela`, nunca a primeira). Repinte da tela no meio do passo
  ⇒ re-medir o alvo (o furo já transiciona, `:1748`).
- **Condição:** `se(DADOS)` lê o que a ponte já entrega (`prospectorAtivo`,
  `appModulosDesativados`, `admin`, `financeiro`). Reaproveita o filtro que já existe
  (`:5721`): alvo ausente OU condição falsa ⇒ passo fora, console avisa. **"Pular sozinho" é
  lei do motor, não if espalhado por capítulo.**
- **Segurança (herda a lei da aula):** passo `fazer` é PROIBIDO em rota viva e em tela com
  dinheiro (`routeStatus===ACTIVE` ⇒ o motor rebaixa `fazer`→`mostrar` sozinho). O obrigatório
  roda no 1º acesso — não há rota nem dinheiro pra estragar.

### 2.2 O visual — blur escuro de verdade

- Scrim ganha `backdrop-filter: blur(4px)` + escurecida — o fora fica FOSCO, o furo fica vivo.
  Técnica: o furo continua sendo o `box-shadow` gigante (recorte de graça); o blur entra numa
  camada irmã com `mask` de furo (2 gradientes compostos) **ou** 4 painéis em volta do alvo —
  decidir na bancada pelo que o g15 aguenta a 60 fps.
- **Fallback obrigatório:** aparelho que engasgar com `backdrop-filter` cai pro scrim chapado
  atual (que já funciona). Enfeite não derruba rota.
- **Contraste MEDIDO nos 2 modos** — a aula já caiu DUAS vezes na armadilha do claro
  (`:2022`); furo, anel, balão e botões passam por `getComputedStyle` nas duas peles.
- Balão ganha: barra de progresso do capítulo, "2 de 5", e no avançado o **X sempre visível**.

### 2.3 Persistência — a lição do recado vs. a da lâmpada

| O quê | Dono do estado | Por quê |
|---|---|---|
| **Obrigatório visto** | **USUÁRIO, no servidor** | "Todo cliente vai ter q ler" = cada pessoa, uma vez. Por aparelho repete a cada reinstalação e some no celular novo — o recado já ensinou: estado de pessoa não mora no aparelho |
| Lâmpada/aula avançada vista | Aparelho (`localStorage`) — como hoje | Conveniência de leitura, não garantia |
| Capítulo em andamento | Aparelho | Matou o app no meio ⇒ retoma do passo, não do zero |

Servidor — **ZERO MIGRATION** (medido na execução de 09/08): `UsersService.stampOnboardingEvent`
(`users.service.ts:861`) já é um carimbo de marco POR USUÁRIO, idempotente e tolerante a JSON
legado. O tutorial vira o evento `logistica_tutorial_obrigatorio`. Nada de coluna nova.

Endereço: **endpoint próprio**, não campo no `GET /logistica/config`.

> Correção de rumo em relação ao rascunho deste plano ("zero chamada nova"): o `/config` é
> chamado **a cada minuto por cada motorista** (`ponte.js:1019`). Pendurar ali uma consulta de
> usuário custaria uma query por minuto por aparelho para um dado que só interessa no boot.
> Uma chamada extra no boot é mais barata que uma chamada a mais por minuto para sempre.

```
GET  /logistica/tutorial        -> { obrigatorioVistoEm: string|null }
POST /logistica/tutorial/visto  -> { ok: true, vistoEm: string }
```

⚠️ A abertura não repinta (memória 07/08): o disparo do obrigatório é **PORTA** — a ponte chama
`TUTOR.obrigatorio()` quando a resposta chega dizendo "não visto" — nunca dado pintado no boot.

---

## §3 — O OBRIGATÓRIO (~90 s, 3 capítulos, sem X)

Dispara sozinho no 1º acesso após o update (novos E existentes — o app novo é novo pra todo
mundo). Sem X no meio; cada capítulo termina em "Entendi". Rever depois: Ajustes › Aprenda a
usar. Copy na língua do motorista, teto de 5 passos por capítulo.

**Cartão de boas-vindas** (1 tela, tom `info`): "O app mudou. Em 1 minuto te mostro o que
importa." → [Vamos lá]

**Capítulo 1 — MONTAR A ROTA** (tela Rota → Montagem; passos `fazer`)
1. `fazer` · Rota · botão de montar — "Toque aqui pra montar seu dia."
2. `fazer` · Montagem · `.day-chips` — "Escolha o dia. Só aparece dia que tem cliente."
3. `mostrar` · `.stop` + `.grip` — "Cada cartão é uma parada. Segure e arraste pra mudar a ordem."
4. `mostrar` · botão de iniciar — "Quando quiser sair entregando, é aqui. Hoje é só olhar."
   (não inicia de verdade: iniciar debita crédito — dinheiro não entra em tutorial)

**Capítulo 2 — ONDE MORAM OS CLIENTES** (jornada Rota → Ajustes → Clientes)
1. `fazer` · `.nav` Ajustes — "Cadastro fica aqui, no terceiro botão."
2. `fazer` · Ajustes · `linhaIr` Clientes — "Sua lista de clientes."
3. `mostrar` · `.cli` — "Toque num cliente pra abrir a ficha: endereço, preço e caderneta."

**Capítulo 3 — CADASTRAR CLIENTE** (tela Cadastrar cliente; só `mostrar` — não cria dado real)
1. `mostrar` · botão "+" — "Cliente novo entra por aqui."
2. `mostrar` · `[data-acao="usar-meu-local"]` — "Parado na frente da casa, toque: rua, bairro e
   CEP entram sozinhos, no lugar exato."
3. `mostrar` · `[data-campo="novo-numero"]` — "O número da casa você digita. Sem número, SN."

Fecho: "Pronto. Quer ver de novo? Ajustes › Aprenda a usar. 💡 no topo ensina cada tela." →
grava `tutorialVistoEm`.

⚠️ **Dependência declarada:** o cap. 1 ensina o fluxo ATUAL de montar — que o
`PR08082026-ROTA-DOIS-MODOS` (aguardando GO) vai mudar pra "rota nasce pronta". Ensinar um
fluxo condenado = pagar o conteúdo duas vezes e ensinar errado. **Recomendação: F2/F3 daquele
plano entram ANTES (ou junto) do obrigatório.** Se o dono quiser o tutorial já, os passos são
DADO — trocar o capítulo depois custa uma tarde. Decisão nº 1 do §6.

---

## §4 — O AVANÇADO ("ensina tudo, fecha quando quiser")

Duas portas, mesmo motor, **X sempre visível**, retoma de onde parou:

1. **Ajustes › "Aprenda a usar"** — catálogo de capítulos com carimbo ✓ de concluído:

| Capítulo | Condição pra aparecer |
|---|---|
| Montar e iniciar a rota (completo: salvar, dia, custo) | sempre |
| Parada avulsa (o "+", link do WhatsApp) | sempre |
| Entregar e receber (folha da venda) | sempre |
| Caderneta e fechamento do dia | `financeiro` ligado |
| Chat e recados da Central | módulo chat ativo |
| **Prospector — vender no caminho** | ver §5 |
| Rotas salvas · Sons e voz | sempre |
| Consumo, créditos e recarga | `admin` |

2. **A lâmpada 💡** (já existe) segue sendo a porta contextual por tela — e vira a mesma
   máquina: o conteúdo das `AULAS` de hoje NÃO se joga fora, vira os capítulos `mostrar`.
   Sinergia com a VITRINE (`PR08082026-VITRINE-DO-APP` V1): a lâmpada que acende pra novidade
   é a MESMA que acende pra aula não vista — um símbolo só pro cliente aprender.

Regra que fica da aula antiga: em tela com rota viva/dinheiro o avançado só `mostrar` — quem
faz é sempre o motorista.

---

## §5 — PROSPECTOR: O CAPÍTULO QUE SE ADAPTA (a régua do "pular sozinho")

A chave é `LogisticaConfig.prospectorAtivo` (default false; liga hoje no desktop
`/logistica/config`; o app já a recebe). Três estados, três conteúdos — o motor decide pelo
`se:` de cada passo, nada de tour separado:

| Estado da empresa/usuário | O que o tutorial faz |
|---|---|
| Prospector ATIVO | Capítulo completo: o que são os prédios acesos no corredor, o toque no prédio, o crédito que vira lead |
| Disponível mas DESLIGADO + usuário `admin` | Capítulo "ligue o prospector": mostra o ganho ("empresas no seu caminho viram cliente") e ensina ONDE liga |
| Desligado + não-admin, OU indisponível pra empresa | **Capítulo não existe.** Nem no catálogo, nem no obrigatório — pular sozinho, sem espaço vazio |

Pra "ensinar a ativar" DENTRO do app: hoje a chave só existe no desktop. Proposta (decisão
nº 3): **1 linha-chave em Ajustes › Avançado (bloco `admin`)**, padrão `avisoChegada`
(`:4177`) — aí o capítulo admin termina num `fazer` de verdade: o dono liga na hora, aprendeu
fazendo. Sem ela, o capítulo termina em "liga no computador, em Configurações da Logística".

---

## §6 — DECISÕES (o dono deu GO em 09/08: *"orquestre com workers e teste"*)

As quatro subiram como pergunta no plano; com o GO, foram decididas pelo default declarado e
executadas. Ficam aqui registradas — qualquer uma se reverte barato, e as três primeiras são
DADO, não motor.

| # | Decisão | Como ficou | Por quê |
|---|---|---|---|
| 1 | Ordem com a ROTA-DOIS-MODOS | **Sai agora**, ensinando o fluxo ATUAL | Os capítulos são dado (`{tela,alvo,tipo,titulo,texto}`). Quando o fluxo mudar, troca-se o dado, não o motor — segurar o tutorial inteiro por causa disso custa mais que reescrever 5 passos |
| 2 | "Deixar pra depois" no obrigatório | **Sem escapatória**, mas ≤90 s | Cliente pagante travado em tutorial longo troca pergunta besta por raiva; a defesa é ser curto, não ter botão de fuga |
| 3 | Chave do prospector dentro do app | **Entra** em Ajustes › Avançado (admin) | É o que deixa o capítulo terminar num `fazer` de verdade — o dono liga na hora, aprendeu fazendo. O campo já existe no backend; é 1 linha de tela |
| 4 | Usuários existentes | **Veem o obrigatório** no próximo login | "Todo cliente vai ter q ler", literal. O app é novo pra quem já usa também |

---

## §6b — EXECUTADO E PROVADO NO APARELHO (09/08, 02:19) ✅

F0–F3 no ar. **APK 207 publicado**; conferido baixando o APK que o cliente recebe
(`/download/android-logistica`): freio fora, chamada ativa, `mock.js` íntegro.

Roteiro rodado no g15 contra a PRODUÇÃO, com print por passo
(`scratchpad/g15-01…17`):

| # | Passo | Resultado |
|---|---|---|
| C1 | Boot frio com carimbo zerado | obrigatório dispara sozinho depois da abertura: "O app mudou · Vamos lá" |
| C2 | "Vamos lá" (o toque que travava o APK 205) | abre o capítulo 1 — véu, furo e balão, app respondendo |
| C3 | Toque FORA do furo | nada acontece; não anda e não fecha; anel pulsa aos 4 s |
| C4 | Toque DENTRO do furo | executa a ação REAL (abre a Montagem, troca o dia) **e** anda o passo |
| C5 | Jornada entre telas | Rota → Montagem → Rota → Ajustes → Cadastrar cliente, sozinho |
| C6 | Último "Entendi" | volta pra Rota inteira e grava no servidor |
| C7 | Carimbo em produção | usuário 58 com `logistica_tutorial_obrigatorio` no `onboardingStateJson` |
| C8 | Reabrir o app | **não repete** |
| C9 | Catálogo Ajustes › Aprenda a usar | 4 capítulos, com o do Prospector presente (empresa com a chave ligada) |

Contraste medido nas 2 peles pelo worker do motor; 3 reprovas no claro achadas e
corrigidas (contador, anel do furo a 1,81:1, barra do capítulo).
Portões: `casca-conferir` **66/66 idênticas**, 33 telas.

### O falso culpado que quase matou a frente

Às 02:0x uma sessão paralela mediu no g15 (APK 205) que o tutorial **travava o
app**: véu comendo o dedo, sem furo e sem balão. Puxou o freio — decisão certa
com a informação que tinha. A causa, porém, não era o motor: o `casca-injetar`
rodou ENTRE duas edições e gerou um `mock.js` que **chamava `acharAlvo()` sem
definir a função**. O APK 205 nasceu desse arquivo, e o passo estourava
`ReferenceError` exatamente depois de montar o véu e antes de desenhar — o
sintoma, nos mínimos detalhes. Reinjetado e remedido no aparelho: tudo passa.

**LEI: app que quebra logo depois de uma injeção — o primeiro suspeito é o
ARQUIVO GERADO, não a lógica recém-escrita.**

## §7 — FASES (cada uma com gate; nenhuma depende da seguinte)

| Fase | Entrega | Gate de saída |
|---|---|---|
| **F0 — Motor** | passo-objeto (`fazer`/`mostrar`/`se`/`tela`) + blur com fallback + contraste medido 2 peles | bancada: capítulo-demo roda no mock; g15 60 fps ou fallback |
| **F1 — Obrigatório** | 3 capítulos + boas-vindas + `tutorialVistoEm` por usuário + porta na ponte | C1–C5 do §8 passam no g15 |
| **F2 — Avançado** | Ajustes › "Aprenda a usar" + AULAS de hoje viram capítulos + X/retomada | C6–C7 passam |
| **F3 — Condições** | capítulos condicionais (prospector 3 estados, financeiro, admin) + chave no app (se GO nº 3) | C8–C9 + prova negativa |
| **F4 — Primeiros passos** (opcional, mercado) | cartão-checklist na Rota: "Monte a 1ª rota · Cadastre 1 cliente · Faça 1 entrega", some quando completa | print antes/depois; some ao completar |

F0–F2 são só app (mock+ponte) + 1 campo/endpoint no backend (F1). F3 lê config que já viaja.
Tudo passa pelos portões `casca-*` (32 telas/64 — tour é CAMADA, não tela nova; se virar tela,
atualizar o cravado do `casca-conferir`).

---

## §8 — BATERIA DE TESTES

### A) Bancada (a cada leva)
`node scripts/casca-injetar.js && node scripts/casca-conferir.js && node scripts/casca-antes-e-depois.js`
+ capítulo-demo navegável no mock (o tour é testável no navegador antes do APK).

### B) Visual (medido, não achado)
Furo/anel/balão/botões por `getComputedStyle` nas 2 peles (a aula já caiu 2× no claro);
blur ligado vs. fallback: print dos dois.

### C) Roteiro no g15 (C0 do ROTA-DOIS-MODOS antes: APK instalado ≥ publicado)
| # | Passo | PASSA se |
|---|---|---|
| C1 | 1º login de usuário virgem | obrigatório dispara SOZINHO após o bootstrap; fora do furo TUDO fosco/escuro |
| C2 | Tocar fora do furo | nada acontece; não fecha, não vaza clique |
| C3 | Passo `fazer` | só o clique NO ALVO avança — e executa a ação real (a montagem abre de verdade); 4 s parado ⇒ anel pulsa |
| C4 | Matar o app no cap. 2 | reabre no cap. 2, não do zero; concluir grava `tutorialVistoEm` |
| C5 | MESMO usuário, outro aparelho | obrigatório NÃO repete (estado é do usuário, não do aparelho) |
| C6 | Avançado: X no meio | fecha na hora; reabrir retoma do passo |
| C7 | Rota ACTIVE + capítulo com `fazer` | motor rebaixa pra `mostrar`; nenhum botão de rota viva é esperado como clique |
| C8 | `prospectorAtivo=false` + não-admin | capítulo prospector INVISÍVEL no catálogo e no obrigatório (prova negativa) |
| C9 | `prospectorAtivo=false` + admin | capítulo "ligue o prospector" aparece; ligar pela chave (se GO) conclui o capítulo |

### D) Regressão
Lâmpada continua acendendo só pra aula nova; passo com alvo sumido continua caindo com aviso
no console (nenhum "sumiu da tela" nos roteiros dos capítulos); portões e avisos continuam
por cima do tour (`z-index`); 60 s de tour na navegação = 1 mapa na garagem.

---

*Plano da sessão 09/08/2026. Nada de código alterado. Fontes medidas:
`logistica-2.0.html` (AULAS `:5662`, motor `:5715`, furo `:1746`, Ajustes `:4698`,
Avançado `:4154`), `ponte.js` (`aplicarProspector :589`), `schema.prisma`
(`prospectorAtivo :2346`), planos irmãos `PR08082026-ROTA-DOIS-MODOS.md` e
`PR08082026-VITRINE-DO-APP.md`.*
