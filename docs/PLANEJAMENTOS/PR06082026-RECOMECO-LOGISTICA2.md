# PR06082026 — RECOMEÇO LOGISTICA2: o mock É o front, o backend V1 liga por trás

> **A ordem que rege este plano (dono, 06/08/2026):** o app de rastreio logístico recomeça.
> Nada do front anterior volta — roteiro novo, outra cara. O mock injetado é a casca.
> O backend V1 que já existe no ar é a fonte de TUDO — só consultar e ligar.
> E **cada coisa feita aqui tem que deixar a próxima troca de casca FÁCIL** — se um dia a
> casca virar ambiente natalino, todas as telas se adequam trocando UMA fonte, não reescrevendo tela.

---

## 0. As 4 leis do recomeço (nada entra no repo sem obedecer)

1. **O MOCK É A FONTE.** `docs/mockups/logistica2.0/logistica-2.0.html` → `node scripts/casca-injetar.js`
   → app. `mock.css`/`mock.js` são GERADOS: editar à mão morre na próxima injeção.
   Mudança visual se faz NO MOCK; mudança de dado se faz no seam (lei 3).
2. **COR NOVA NASCE TOKEN.** Nenhum hex/rgb novo solto em regra de tela. É o que torna a lei 4 possível.
3. **TRADUZIR ≠ DECIDIR.** A fiação traduz dado real pro desenho do mock. Sem fonte → VAZIO,
   nunca chute (número inventado em tela de dinheiro é mentira com cara de app pronto).
4. **CASCA TROCÁVEL É REQUISITO, NÃO FASE.** Toda entrega responde: *"se eu trocar a casca amanhã,
   esta tela se adequa sozinha?"* Se a resposta for não, a entrega está errada.

Regras herdadas que continuam valendo (pagas em dinheiro): bancada nunca publica
(`logistica2` fora da digital do APK); endpoint novo = app + allowlist Kotlin + rebuild, os três;
offline repassa por lista branca (campo novo se cita); contraste se MEDE nos 2 modos; crédito real
do dono não é cobaia (iniciar rota DEBITA — teste em empresa de teste).

---

## 1. FOTO DO ESTADO (levantado e medido em 06/08, HEAD `215a25dc`)

### O que está DENTRO do app hoje
- `EntregaShell/app/src/logistica2/assets/app/index.html` carrega **só** `mock.css` + `mock.js`.
  O app abre na abertura do mock e navega pelas **33 telas**, nos 2 modos de luz, com todas as
  transições. Provado por `node scripts/casca-conferir.js`: casca sobe sob CSP + 66/66 pixel-idêntica.
- **Arquivos mortos no diretório** (existem, não carregam): `app.js` (13.686 linhas — o front velho),
  `native.js` (924 — a ponte H.api/H.cache com o Kotlin), `app.css`, `matriz.js`, `mobile-contract.js`,
  `offline-controls.js`. O front velho NÃO volta; a ponte volta (fase F2), porque sem ela o mock não
  tem como falar com o backend.
- **O mock não tem nenhum gancho de dado** (`data-acao`: 0) — a fiação antiga foi revertida por ordem.
  Todo dado na tela é literal do mock.
- **Kotlin intocado e pronto**: allowlist do celular já cobre a API V1 quase inteira (levantada abaixo),
  GPS/tracking, alarmes, update, offline-queue, pareamento — tudo já existe no nativo.

### As 33 telas do mock (a matéria-prima do roteiro)
6 abas na barra: **Caderneta · Clientes · ROTA (centro) · Produtos · Chat · Ajustes**.

| Grupo | Telas |
|---|---|
| Rota (o dia de trabalho) | `rota` (7 estados), `rotafoto`, `mapa` (dirigindo, tela cheia), `mapachegou`, `mapalista`, `gerenciador`, `montagem`, `conferencia`, `venda`, `folha`, `folhanao`, `rapida`, `salvas`, `chat` |
| Caderneta | `caderneta` (fechamento), `semana` (histórico) |
| Cadastro | `clientes`, `ficha`, `produtos`, `fichaproduto`, `ajustes` |
| Ajustes (sub) | `recarga`, `financeiro`, `avancado`, `sons`, `historico`, `consumo` |
| Sistema | `entrada` (abertura), `passeio`, `leitura`, `gestos`*, `portoes`*, `padroes`* |

\* `gestos`/`portoes`/`padroes` são telas-ESPECIFICAÇÃO (catálogo de gesto, bloqueio e movimento).
No app não entram na navegação do usuário — são o contrato de comportamento que a fiação implementa.

### Lacunas achadas (as duas únicas telas/peças que o mock NÃO tem)
1. **Pareamento** — o app real loga por código (`POST /mobile/devices/pair`). O mock abre direto
   na rota. **Correção medida na F0 (06/08 noite): a tela de pareamento JÁ EXISTE e é NATIVA**
   (`PairingActivity` Kotlin — instalação virgem sem backend cai nela). A decisão da F2 vira:
   vestir a nativa com a cara do mock, ou nascer tela no mock e aposentar a nativa.
2. **A ponte** — `index.html` sem `native.js` = sem H.api, sem Voltar do Android (Lei 10), sem
   teclado (Lei 4), sem update check. Volta na F2, enxuta. (A 4ª adaptação do injetor já fala
   com a ponte crua: `HBXAndroid.appReady` destrava a cortina do boot.)

---

## 2. O ROTEIRO NOVO (a jornada, não a lista de telas)

O roteiro anterior morreu. Este nasce da regra de ouro do mercado de last-mile: **o motorista vê
UMA pergunta por vez** ("o que eu faço agora?"), e o admin vê O DIA inteiro. O botão do meio da
tela Rota é sempre "o que se faz agora" — o mock já cravou isso (`ROTA_ESTADOS`).

### Jornada 1 — O DIA DO MOTORISTA (o coração; fases L1–L5)
```
entrada ─► rota[montar] ─► montagem/conferencia ─► rota[pronta]
              │                                        │ Iniciar (debita)
              │ Rota rápida (rapida)                   ▼
              │ Rotas recebidas (aviso)             mapa (dirigindo, tela cheia)
              ▼                                        │ ~chegou
        rota[7 estados]                             mapachegou ─► venda | folha | folhanao
        (montar·pronta·rodando·                        │ próxima parada (volta ao mapa)
         pausada·fim…)                                 ▼ fim do dia
                                                    caderneta (fechamento) ─► semana
```
- A **chegada** tem 3 saídas e nenhuma tem parágrafo: `venda` (vendeu/recebeu), `folha`
  (entrega completa), `folhanao` (não entregue + motivo). Tudo funciona SEM REDE (fila offline).
- `mapalista` é o meio-termo mapa+fila pra quem quer ver a sequência sem sair da direção.
- **Portões** (tela `portoes` como spec): endereço com erro trava montar; crédito zero trava iniciar;
  recado da Central trava confirmar até o "Entendi"; update obrigatório trava tudo.

### Jornada 2 — O ADMIN NO CELULAR (fases L6–L10)
```
clientes ─► ficha (dias, financeiro, histórico, extrato)
produtos ─► fichaproduto
rota ─► gerenciador (reordenar, retirar, sanear) · salvas (modelos) · leitura (reconhecimento)
chat ─► recados com a Central (portão/alarme)
ajustes ─► recarga · consumo · sons · avancado · financeiro · historico
```
O admin de verdade opera no DESKTOP (front web já existe); o celular é o admin de bolso —
mesmas portas do backend, desenho do mock.

### Jornada 3 — SISTEMA (transversal)
`entrada` (abertura 3,4s → rota) · **pareamento** (novo, 1ª abertura) · `passeio` (turismo,
debita) · avisos que CHEGAM (recado/ok/falta — um por vez, quem dirige lê UM).

---

## 3. MAPA DE FIAÇÃO — tela → backend V1 (tudo já existe e já passa na allowlist do celular)

> Coluna "Porta" = endpoint real no ar hoje. Nenhum endpoint novo é necessário nas fases L1–L10.
> Isso foi conferido contra os controllers E contra `isMobileEndpointAllowed` do Kotlin.

| Tela do mock | Porta V1 (método caminho) | Nota |
|---|---|---|
| `rota` (estados) | GET `/logistica/rota` · GET `/logistica/dia-preview` · POST `/logistica/gerar-dia` | o estado da rota DECIDE o transmux `ROTA_ESTADOS` |
| `montagem` | POST `/logistica/rota/planejar` · GET `/logistica/rota/custo-preview` | preview == débito real (lei de dinheiro) |
| `conferencia` | POST `/logistica/rota/conferir` · POST `/logistica/rota/checar-enderecos` | sanitização roda DENTRO do conferir, sem botão |
| `rota` Iniciar | POST `/logistica/rota/iniciar` | **DEBITA** — só "Confirmar rota" consolida |
| `rota` Cancelar | POST `/logistica/rota/encerrar` · `/descartar-montagem` | abertas viram `agendada`, nunca canceladas |
| `mapa` (dirigindo) | GET `/logistica/osrm/route`·`table` · POST `/mobile/logistica/tracking/sessions/*` | traço/voz/retraço; PMTiles quando publicar (`a889d19f`) |
| `mapachegou` | POST `/logistica/entregas/:id/chegando` | aviso ~500m ao cliente (WhatsApp) |
| `venda` | POST `/logistica/caderneta/vender` | idempotência de clique; 'deveu' = fiado EXPLÍCITO |
| `folha` / `folhanao` | POST `/logistica/entregas/:id/confirmar`·`cancelar`·`comprovantes`·`comprovante-codigo` | leva `arrivedAt` no desfecho (carimbo de chegada) |
| `caderneta` | GET `/logistica/caderneta/resumo` · POST `/logistica/caderneta/finalizar`·`apagar-venda` | crédito é INTEIRO, nunca moeda |
| `semana` | GET `/logistica/caderneta/resumo` (janela 7d) · GET `/logistica/resumo-dia` | |
| `rapida` | GET `/logistica/geo/busca`·`cep`·`link`·`reverse` · POST `/nucleo/contas` · GET `/nucleo/contas/por-endereco` | anti-duplicata de porta é fail-closed |
| `salvas` | GET/POST/PATCH/DELETE `/logistica/rota-modelos` · POST `/rota-modelos/:id/gerar` | |
| `gerenciador` | POST `/logistica/rota/tirar-do-dia`·`sanitizar`·`limpar-dia` · PATCH `/logistica/agenda/dias/:dia/ordem` | |
| `leitura` | POST `/logistica/leitura/iniciar`·`:id/parada`·`finalizar`·`cancelar`·`trilha` · GET `atual`·`resumo` | |
| `chat` | POST `/logistica/recados/puxar`·`pendentes`·`recebidos`·`visto`·`responder`·`:id/entendi` · GET `me`·`portao` | portão trava Confirmar até "Entendi" |
| avisos (sino) | GET `/logistica/rota-avisos` · POST `/rota-avisos/:id/visto` · GET/POST `/logistica/rota-indicadas/*` | rotas recebidas da Central |
| `clientes` | GET `/nucleo/clientes` | PULL, busca |
| `ficha` | PATCH `/logistica/clientes/:id/dias`·`financeiro` · GET `extrato`·`score`·`entregas`·`historico` · PATCH `/nucleo/contas`·`locais`·`telefones` | dia é do CLIENTE, nunca do produto |
| `produtos` / `fichaproduto` | GET/POST/PATCH `/logistica/produtos` · GET/POST/PATCH/DELETE `/logistica/cliente-produtos` | preço SEMPRE do catálogo |
| `ajustes` | GET/PATCH `/logistica/config` | os toggles reais do app, com a cara do mock |
| `recarga` | GET `/financeiro/payments-config` · POST `/financeiro/credits/recharge` · GET `/credits/me` | checkout nativo já existe (RechargeCheckoutActivity) |
| `consumo` | GET `/logistica/creditos/extrato` | |
| `passeio` | POST `/logistica/passeio/iniciar` | debita por `tourId`, idempotente |
| **pareamento** (novo no mock) | POST `/mobile/devices/pair` | Kotlin já faz; a tela é que não existia |
| offline (transversal) | POST `/mobile/logistica/offline/prepare`·`sync`·`proofs` | lista branca de campos — campo novo SE CITA |

**Sub-telas de Ajustes com desenho ≠ função** (levantamento que já matou 4 atalhos): `financeiro`
(mock=painel de cobrança; app=chaves), `historico` (mock=rotas; app=cliente), `avancado` (mock tem
chave que contraria decisão de 26/07), `sons` (mock 6 chaves; app 2). **Regra da casca única:** essas
telas entram VESTIDAS com o que o app TEM (2 chaves com a cara do mock ≠ 6 chaves enfeite). Chave
que aparece e não controla nada é pior que chave ausente.

---

## 4. MERCADO — o que o last-mile entrega em 2026, onde estamos, o que adequar

Referência: Circuit for Teams, Onfleet, Track-POD, Detrack, Shipday, Routific, Bringg (horizontal)
+ a realidade da vertical água/gás no Brasil (cobrança na porta, fiado, cliente recorrente).

| Padrão de mercado | Mercado | HBX hoje | Veredito |
|---|---|---|---|
| Otimização/roteirização | todos | OSRM self-host + conferência + montagem | ✅ no nível |
| App do motorista "uma pergunta por vez" | Circuit é a régua | mock 2.0 (botão do meio = agora) | ✅ acima — o mock é mais limpo |
| Prova de entrega: foto + código | core em todos | comprovantes + código 6 dígitos | ✅ no nível |
| Prova de entrega: ASSINATURA | Track-POD/Detrack têm | não tem | 🔶 decisão do dono (custo baixo, canvas → comprovante) |
| Aviso ao cliente com ETA + link vivo | SMS nos gringos | **WhatsApp** + chegando ~500m + `public/tracking` | ✅ acima (WhatsApp > SMS no Brasil) |
| Rastreio ao vivo no admin | todos | `tracking/live` + Ver Tela (espelho do app) | ✅ acima — Ver Tela ninguém tem |
| Offline de verdade | quase todos degradam mal | fila offline + desfecho sem rede + PMTiles (60km no bolso) | ✅ acima quando PMTiles publicar |
| Falha com motivo + reagendar | todos | `folhanao` + reabrir + agendada | ✅ no nível |
| Cobrança na porta / fiado / caderneta | fraco no horizontal (COD básico) | caderneta + fiado explícito + PIX + fechamento | ✅✅ NOSSO diferencial — é o que a vertical paga |
| Navegação | handoff pro Waze/Maps | turn-by-turn PRÓPRIO (traço, voz, retraço) | ✅ acima (só Bringg/eLogii têm embutido) |
| Scanner código de barras | e-commerce sim | não tem | ⚪ fora — galão não tem etiqueta; sem dor |
| Chat motorista↔central | Onfleet sim, Circuit não | recados com portão + alarme | ✅ no nível |
| Métricas (sucesso, km, tempo/parada) | todos | resumo-dia + semana + `arrivedAt` (tempo de parada já gravado) | 🔶 adequar: EXIBIR tempo-de-parada e ETA por parada na lista |
| Onboarding do aparelho | login e-mail | pareamento por código | ✅ mais simples — falta só a TELA no mock |

**Conclusão honesta:** o V1 já entrega o que o mercado cobra e passa em 3 pontos (WhatsApp,
offline+mapa embarcado, caderneta/fiado). O recomeço NÃO é feature — é casca + organização.
As duas únicas adequações de produto que valem a pena: assinatura (decisão) e exibição de
ETA/tempo-por-parada (faço, gravidade zero, dado já existe).

---

## 5. CASCA TROCÁVEL — a arquitetura do "Papai Noel em 1 arquivo"

**Medido hoje no mock: 389 hex cravados, 21 tokens.** Trocar a casca hoje custaria o que o modo
claro custou (192 regras de override à mão). A cura é estrutural e tem que ser AGORA, enquanto o
app está morto — nunca mais será tão barato.

### O contrato de casca (3 camadas, só a 1ª troca)
```
┌─ CASCA (troca)      cascas/<nome>.css — SÓ tokens + decoração por slot
│   • cor semântica:  --fundo --cartao --tinta-1/2/3 --marca --cta --perigo --aviso --ok --fio --vidro
│   • forma:          --raio-cartao --raio-botao --sombra-1/2
│   • tipo:           --fonte --peso-titulo
│   • movimento:      --dur-tela --dur-folha --mola
│   • luz:            os DOIS modos (data-luz escuro/claro) definidos DENTRO da casca
│   • decoração:      slots fixos (fundo-da-tela, cabeçalho, abertura) — o Papai Noel entra
│                     por slot ::before/::after, NUNCA editando template de tela
├─ ESTRUTURA (fica)   os templates das 33 telas — zero cor literal, só var()
└─ MOTOR (fica)       navegação, estados, fiação — não sabe que casca existe
```

### Como chega lá sem mudar UM pixel
1. Tokenização NO MOCK: 389 hex → tokens semânticos, leva a leva.
2. **Prova a cada leva:** portão antes-e-depois (renderiza 33 telas × 2 modos antes e depois do
   refactor — qualquer pixel diferente REPROVA). O modo claro vira a 1ª prova real de que o eixo
   funciona: hoje ele são 192 regras; no fim, é só a casca declarando os tokens da luz clara.
3. `casca-injetar.js --casca <nome>`: injeta mock + casca escolhida. Sem `--casca` = padrão (a de hoje).
4. **Toda casca passa no portão de contraste** (o conferidor já mede WCAG, inclusive nas peças
   sobrepostas) — o tema natalino não tem licença pra ser ilegível.

**Teste de aceite da fase (a cena):** eu crio uma casca de prova num arquivo único, rodo o injetor,
e as 33 telas mudam de ambiente no aparelho — sem UMA linha editada em template de tela.

---

## 6. FASES — cada uma com portão de saída medível (nada avança com portão vermelho)

### F0 — A CASCA NO VIDRO (agora; é o que o dono pediu pra VER)
Build `logistica2Debug` → instalar no g15 → dirigir pelas 33 telas nos 2 modos.
Consertar só o que O VIDRO mostrar (dvh/viewport, notch real, fluidez das transições no WebView,
toque/gesto). Cada conserto vai pro MOCK e re-injeta.
**Portão:** dono navega no aparelho e diz "é o mock" · `casca-conferir` 66/66 verde · zero erro de página.

### F1 — CASCA TROCÁVEL (tokenização; a lei 4 vira verdade)
389 hex → tokens no mock · contrato de casca · `--casca` no injetor · portão antes-e-depois recriado
· casca de prova demonstrada no aparelho.
**Portão:** 66/66 idêntica com a casca padrão · casca de prova troca o ambiente inteiro · contraste AA nos 2 modos.

### F2 — A PONTE E A PORTA (o app deixa de ser maquete)
`native.js` enxuto volta ao boot (H.api/H.cache/teclado/Voltar) · tela de **pareamento nasce no
mock** · sessão JWT · mapa de Voltar por tela (Lei 10) · update check com gate `HBX_V2`.
**Portão:** parear com o backend local no g15 e cair na Rota REAL vazia (estado `montar`) · Voltar
se comporta em TODAS as telas · teclado não cobre campo.

### L1→L11 — FIAÇÃO POR CENA (uma leva = uma cena do dono funcionando)
Cada leva: seam de dados no MOCK (`DADOS` + `data-acao`) → `motor.js` (novo, PEQUENO, não-gerado)
traduz porta V1 → prova NA TELA do g15 → commit. Portões de toda leva: `casca-conferir` +
antes-e-depois verdes; sem fonte → VAZIO.

| Leva | Cena que o dono vê funcionando | Portas (§3) |
|---|---|---|
| **L1** | ✅ **FEITA E PROVADA NO g15** (06/08, `a1c2879d`+`b1731857`). Seam `DADOS.rota` no mock (literais MOVIDOS, portão 66/66) + tradução na ponte. Provado com 3 entregas REAIS criadas no backend local (nome, endereço, hora, qtd, valor, somatório) e com a empresa vazia → "Sem paradas hoje". Crédito e caixa do dia REAIS (`/credits/me` e `caderneta/resumo`). 🔴 Defeito do MOCK achado pelo print e curado no mock: o satélite do transmux usava classe genérica (`aviso`/`esq`) e herdava regra do cartão de aviso e do esqueleto — o botão principal ia pro canto. Resíduo de teste limpo do banco local. | rota · dia-preview · gerar-dia |
| **L2** | 🔶 **QUASE** (06/08, a438dbf2). Provado no g15: montar → montagem com 3 paradas reais (3 paradas · 6 produtos · R$ 27,00) e portão do dinheiro com número do SERVIDOR (Debita 4,8 · você tem 0 → trava). Cancelar/encerrar ligado. ⬜ **NÃO provado: o Iniciar que DEBITA** — a empresa da bancada tem 0 crédito e não fabrico lançamento no ledger à mão; falta dar crédito pelo /master e repetir. ⚠️ Medido: montar leva ~43s no ambiente LOCAL (sem OSRM → timeout → haversine); o dedo recebe o esqueleto enquanto isso. | planejar · conferir · custo-preview · iniciar · encerrar |
| **L3** | 🔶 **L3a FEITA** (06/08, 651aba00): o mapa deixou de ser desenho — maplibre real, OFFLINE (tiles do próprio aparelho, brasil-20260804.pmtiles já gravado: 60 km/3.187 tiles), com nome de rua, dentro da casca do mock intocada. Armadilhas pagas: worker-src blob na CSP, sprite/glyphs absolutos, maxzoom 14. ⬜ **L3b**: manobra, velocímetro, ETA e contador de parada ainda são do MOCK (número de enfeite na tela de quem dirige) — dependem do OSRM, que no ambiente local dá timeout. | osrm · tracking · chegando · (PMTiles) |
| **L4** | ✅ **FEITA E PROVADA NO g15 POR TOQUE** (06/08, `d3876caa`). Toco na parada → folha certa pela CONFIG, com cliente/produto/conta reais → escolho a forma → confirmo; a rota volta com o desfecho na lista e o caixa somando (Dinheiro 9 + Pix 32 = 41, conferido no banco). "Não entregue" grava o motivo MARCADO. Carimbo de chegada viajando no desfecho. Comprovante FORA (corte do dono). 🔴 3 defeitos achados USANDO: rota vazia depois das 21h (a ponte pedia sem data e o servidor é UTC — defeito meu da L1), cancelada aparecendo como "Pendente", e o stepper empilhado por cascata (`.item-linha span` vence `.passo`). 🔴 E um bug de PRODUÇÃO: a lista branca da fila offline não tinha `cartao` — a entrega gravava e a forma de pagamento sumia calada. | entregas confirmar/cancelar · vender |
| **L5** | Fechar o dia: caderneta e semana com dinheiro real | caderneta resumo/finalizar · resumo-dia |
| **L6** | Clientes e ficha completos | nucleo/clientes · dias · financeiro · historico |
| **L7** | Produtos e vínculos | produtos · cliente-produtos |
| **L8** | Chat, avisos e portões vivos | recados · rota-avisos · rota-indicadas |
| **L9** | Ajustes REAIS com a cara do mock | config · creditos/extrato · recarga |
| **L10** | Satélites: salvas (lista+gerar), rápida, gerenciador | rota-modelos · geo/* |
| ~~**L11**~~ | ~~Modo avião do começo ao fim do dia~~ **CORTADA 06/08** | ~~offline prepare/sync/proofs~~ |

L1–L5 é o dia do motorista — vem primeiro, é o produto. L6–L10 é o admin de bolso.
**L11 morreu na decisão de 06/08** (0 chamadas em 2 semanas de produção): o offline segue
transversal desde L1 pela fila do Kotlin (`interceptMutation`), que é grátis e já funciona — o que
saiu foi só a bateria dedicada do pacote `prepare/sync/proofs`.

### 🔴 O CORTE — decisão do dono, 06/08 (a lista item a item vive no INVENTÁRIO)
Ritmo escolhido: **piso + navegação completa**. Corte de **34 em 152 pendentes (22%)** — a troca é
praticamente paridade. **Fora:** comprovante foto/código (morre de vez), Passeio (8), Leitura de
rota (6), pacote offline (4), tracking ao vivo, mapa offline antigo (3), missões/rota indicada (4),
editor de modelo (2), `gerar-dia`, tela de chegada nativa.
**Dentro do piso, e não são feature — travam a troca se faltarem:** aviso de atualização
(`appUpdateModal` + gate `HBX_V2`), Pulso/Ver Tela/Erros, e a navegação turn-by-turn completa
(L3b deixa de ser opcional). Lista completa e os números que a justificam:
`docs/PLANEJAMENTOS/INVENTARIO-APP-ANTIGO-VS-NOVO.md`.

### FX — A TROCA (fora deste plano)
Bancada → produção pela regra já cravada: assets do `logistica2` viram `logistica`, mesmo
applicationId/assinatura, André atualiza pelo aviso sem reparear. Só com ordem do dono.
**3 itens que quebram calado se esquecer** (detalhe no INVENTÁRIO §DECISÃO):
1. **religar `google-services`** no flavor — hoje está desligado, e o push morre em silêncio;
2. **apagar `logistica2/assets/app/app.js` (13.688 linhas) e `app.css`** — o `index.html` não
   carrega nenhum dos dois; é 1,1 MB de peso morto e uma reserva que não existe;
3. applicationId/versionName/versionCode + devolver `logistica2` à digital do APK.

---

## 7. PAINEL DE BORDO (atualizar A CADA leva — este é o placar, não relatório de fase técnica)

| Fase | Estado | Prova |
|---|---|---|
| F0 casca no vidro | ✅ MEDIDA 06/08 (`624461d5`) — 2 defeitos de vidro mortos: cortina nativa congelada em 42% (mock não chamava `appReady`; no V2 a cortina antiga nem sobe) e barra de status DUPLA ("9:41" de maquete sob a real → 5ª adaptação). **Varredura no WebView REAL do g15: 66/66 telas×modos renderizam sem exceção de JS** (script `varrer-33-no-vidro` via CDP; 1 ruído raro de recurso do próprio WebView, sem URL no código e sem pedido na rede — não reprova). Tela Rota vista no vidro limpa. Falta só o OLHO do dono dizer "é o mock". | foto do g15 + conferidor verde |
| F1 casca trocável | ✅ **FEITA E PROVADA** (06/08, levas 1–5 + mecanismo, `acfb20b9`). `--casca <nome>` no injetor · casca `ferro` de prova (91 linhas, zero seletor de tela) · `casca-prova.js` mede alcance E contraste. **MEDIDO: 66/66 telas×modos trocam de ambiente e a casca não cria NENHUM texto sub-AA** (3.308 medidos; 133 sub-AA são herdados do mock — número pro dono decidir). Placar da folha: 404→282 hex, 63 tokens. ⬜ sobra: colapsar as 143 regras do claro (o claro declara só 16 dos 66 tokens — é essa a dívida). | casca de prova trocando o ambiente |
| F2 ponte e porta | ✅ **FEITA E PROVADA NO g15** (06/08, `70bb576f`). `ponte.js` (à mão, único ponto onde a casca encosta no aparelho) + index.html carregando native→mock→ponte. **API REAL respondeu** (`/logistica/config` do backend local) · Voltar (Lei 10) com tabela verde, inclusive update obrigatório SEGURANDO · tema com 1 dono · teclado pela visualViewport. 3 defeitos meus achados medindo (let de topo não é window; tom≠obrigação; escape≠só data-escape). ⬜ pareamento segue na tela NATIVA — decisão: vestir ou aposentar. | pareado no g15, Rota real vazia |
| L1…L11 | ⬜ | cena de cada leva na tela |

## 8. DECISÕES DO DONO (só o que muda rumo — o resto eu decido e conto)

0. ✅ **RESOLVIDA 06/08 — o corte da troca** (ver §6 "O CORTE"): piso + navegação completa;
   Passeio e Leitura não sobem; comprovante foto/código morre de vez. 34 de 152 cortados.
   ⚠️ Isto **responde por tabela a decisão nº1 abaixo**: sem comprovante, assinatura sai de pauta.
1. ~~**Assinatura do cliente como prova de entrega?**~~ **PREJUDICADA 06/08** — o dono matou a prova
   de entrega por foto/código (0 uso na história do produto). Assinatura é a mesma família; só volta
   se um cliente pedir.
2. **Os 4 Ajustes redesenhados no mock** (financeiro/historico/avancado/sons): quando a fiação chegar
   neles (L9), vale o desenho do mock como FUNÇÃO nova, ou veste-se a função atual? Meu default
   pela casca única: vestir a função ATUAL com a cara do mock; desenho vira backlog de feature.
3. **Sub-AA herdados do mock** (3 casos já medidos: knob `.act.go`, rótulo de mapa, azul `#3d8bff`
   com branco): a tokenização é a hora de fechar — `#1a5fd0` já é o precedente do próprio dono.
