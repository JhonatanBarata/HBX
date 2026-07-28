# HBXLOG — o que ficou de pé e o que falta (28/07/2026, madrugada)

> Handoff pra próxima sessão. Ler junto com a memória `hbxlog` (regra de teste no celular,
> 10 Leis de UI, build/publish/ADB). Aparelho: moto g15 `ZF5255SMWF`, cabo plugado.
> **NO AR agora: Loghbx v86** (backend + APK publicados 28/07 ~03:40, `HBX_PUBLISH_COMMITTED_ONLY=1
> npm run new`) — o g15 está com o build local **87** (fix do encaixe da Rota rápida, ainda não publicado).

---

## 1. O que ENTROU e está no ar (não refazer)

| # | Pedido do dono | Onde vive | Provado na tela? |
|---|---|---|---|
| 1 | Endereço conferido **antes** de montar a rota; tela só com os erros; a parte errada marcada | `checarEnderecos` (backend) + `checagemModal` (app.js) | ✅ 26 de 52 na segunda, montagem barrada |
| 2 | Fora "Corrigir" e o liga/desliga do Gerenciador | `conferenciaParadaRow` | ✅ |
| 3 | Fora a linha "Créditos atual / Aceitar Debitará" | `custoPreviewBanner` | ✅ (sobra só o aviso de saldo que NÃO cobre) |
| 4 | "+" da Rota vira **Rota rápida** (entrega avulsa morreu) | `montagemRapidaModal` + `encaixarParadaNaRota` | ⚠️ modal ✅ / **encaixe por proximidade NÃO testado com rota de pé** |
| 6 | Mapa parado mostra você + endereço; bolinha azul abre balão | `updateMapaOcioso`, `abrirBalaoLocal` | ✅ |
| 7 | Voltar limpa rota **não aceita**; rota aceita não morre | carimbo `logistica-rota-aceita-dia` | ⚠️ código pronto, **não testado ao vivo** |
| 8 | Fim da piscada do mapa + entrada "aproximando/montando" | garagem do mapa + `animarEntradaDoMapa` | ✅ (vídeo do aparelho) |

**Arquivos tocados:** `EntregaShell/app/src/logistica/assets/app/app.js`,
`EntregaShell/app/src/main/assets/app/app.css`,
`EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/NativeApiClient.kt` (allowlist),
`backend/src/logistica/logistica-conferencia.service.ts` (`checarEnderecos`),
`backend/src/logistica/logistica.controller.ts` (`POST rota/checar-enderecos`, `POST rota/tirar-do-dia`),
`backend/src/logistica/dto/logistica.dto.ts`.

---

## 2. FILA 1 — RODADA NO APARELHO 28/07 ~04:00 (resultado)

> Rodada no moto g15 com cliente de teste (`123testeOK` = endereço bom, `123testeERRO` = sem pino),
> ambos na TERÇA (o dia do dono estava vazio de cliente vivo). **Resíduo apagado no fim** — a
> empresa 48 voltou a 229 clientes, zero `123teste*`.

| # | Item | Resultado |
|---|---|---|
| 1 | **"Tirar só da rota de hoje (1)"** | ✅ tira da montagem de HOJE, a rota monta com o resto e cai na Conferência ("1 parada, 0 com avisos"). **Cadastro intocado** conferido no banco (`diasSemana` e plano seguem lá). |
| 2 | **"Remover este dia do cadastro (1)"** | ❌ **META BUG** — tira o dia do VÍNCULO (`diasSemana` esvazia) mas o **plano da Agenda continua `ativo`**, então o cliente **volta no roster do dia**: a reconferência devolveu "1 problema em 2 clientes" outra vez. É o oposto do que o dono pediu ("assim não volta na rota"). Ver §2b. |
| 3 | Toque na linha de erro → cadastro → volta | ✅ abre a ficha real, fechar volta pra tela de erros já reconferindo. |
| 4 | Rota salva com dia fixo no mesmo portão | ⬜ não testado (não havia rota salva com dia fixo à mão). |
| 5 | **Encaixe da Rota rápida com rota de pé** | 🔧 estava **QUEBRADO**, corrigido e provado: a parada nascia, mas ficava NO DIA e FORA da rota (`rotaOrdem` null, contador travado em "1 de 1"). Causa: `items()` filtra pela seleção do dia e o id novo não entrava nela, então `openItems()` não via a parada e `encaixarParadaNaRota` devolvia `aplicado:false` (o caminho do Gerenciador já somava o id; o da tela Rota não). Depois do fix: **"1 de 2" na tela**. |
| 6 | Voltar não mata rota **aceita** | ✅ com a rota aceita, Voltar fecha o Gerenciador e a rota continua de pé. |
| 7 | Header cortado | ✅ não reproduziu em nenhum dos estados percorridos. |

### 2b. O buraco que apareceu no meio (vale mais que os itens acima)

**O espelho cadastro→Agenda não está escrevendo plano nenhum na empresa 48.** Duas provas na mesma noite:

1. **Tirar o dia** (item 2): `definirDiasDoCliente` limpa o vínculo, mas `LogisticaPlanoEntrega` do dia
   segue `ativo=true` → o cliente volta.
2. **Pôr o dia**: cliente novo com TER marcado e produto salvo ficou com `ClienteProduto.diasSemana='2'`
   e **zero plano** → card com pendência "Dia" pra sempre e cliente fora de todo roster.

`agendaV2Ativa` está `true` nas 8 empresas e o `create` do plano funciona na mão (testado com Prisma no
container, criou), então a falha está DENTRO de `espelharVinculoCadastro` (ou no `updatePlan`/`createPlan`
que ele chama) — e ela é **silenciosa**: o retorno tem `agendaAvisos`, mas nem o controller loga nem o app
mostra. **Primeiro passo da próxima sessão: logar o `agendaAvisos` do `PATCH /logistica/clientes/:id/dias`
e do `POST /logistica/rota/tirar-do-dia`** — sem isso o diagnóstico é chute.

Efeito colateral do mesmo buraco, no cadastro NOVO: o `salvarDiasDoCliente` só é chamado dentro do
`if (productIdNovo)` (app.js, ramo `new-client-form`), então **cliente cadastrado com dia marcado e sem
produto perde o dia calado** — o form de edição já faz certo (`if (diasNovos.length)`), o de criação não.

Copy: a confirmação diz "1 cliente perde este dia no cadastro e **não voltam** sozinhos" (singular×plural).

---

## 2c. Itens que continuam sem prova no aparelho

1. **Rota salva com dia fixo** passa pelo mesmo portão de checagem (`apply-route-modelo`).
2. **"Primeira parada"** da Rota rápida (só o "No caminho" foi visto rodando).
3. O toast **"Entra depois de Fulano."** — com 1 parada só na rota o encaixe cai no genérico; precisa de
   rota com 3+ paradas pra ver a frase e a perna escolhida pelo OSRM `table`.
4. **Voltar com rota NÃO aceita** continua desfazendo (só o caso "aceita" foi provado).

---

## 3. ITEM 5 — "Buscar online" (dono escolheu: **prospecção**)

> "Eu vou querer ver um barzinho aqui perto." Decisão do dono: **não** competir com o Google Maps em
> "achar um bar"; o que vale dinheiro é **"quem por aqui pode virar meu cliente"**.

### Dado medido (28/07, base do VPS — `hbx_prod.CnpjPublicCompany`)
- **Rio Claro: 1.223 bares/restaurantes ATIVOS** (CNAE `5611%`), **1.166 com telefone (95%)**.
- 355 mercearias/minimercados (`4712%`).
- Custo por consulta: **zero** (base nossa). Google Places faria ~US$32/1.000 buscas — mata a margem.
- Índices que já existem: `(normalizedCity, cnae)`, `(state, cnae)`, `(phoneDigits)`.

### O buraco técnico (único)
A tabela **não tem lat/lng nem CEP** (`rawJson` vem NULL) — o endereço é texto composto:
`"RUA CAIXA DAGUA, 730, CENTRO"`. A coordenada sai do CNEFE, e o índice necessário **já existe**:
`cnefe.cnefe_endereco (cod_municipio, logradouro_norm)` + coluna `numero`, `lat`, `lng`.
→ Reusar `normalizarVia`/`resolverCnefeLote` (mesmo motor da cura de pino, com as armadilhas já
documentadas: abreviação com ponto, endereço que começa pelo bairro, rua comprida com vários CEPs).
Taxa de acerto esperada 60-80% — **medir e publicar o número**, não chutar.

### Desenho proposto
1. **Backend** `GET /logistica/perto?q=<texto|cnae>&lat=&lng=&raio=` (allowlist do APK):
   - dicionário curto de sinônimo → CNAE ("barzinho/boteco/bar" → `5611`, "mercearia/mercadinho" → `4712`,
     "padaria" → `4721`, "salão" → `9602`, "academia" → `9313`…);
   - `WHERE normalizedCity = <cidade do GPS> AND cnae LIKE '<prefixo>%' AND situacao='ativa'` — **sempre com
     LIMIT, nunca COUNT** (lição do pool-storm da RFB 28M);
   - geocodifica em LOTE pelo CNEFE, ordena por haversine da posição do motorista, devolve 20;
   - marca quem **já é cliente** (`CustomerProfile` por CNPJ/telefone) pra sumir da lista.
2. **App**: tela de busca (cartão central, Lei nº3) com chips de ramo + "perto de mim"; linha =
   `Nome — rua, nº · 320 m`. Toque = ficha curta (telefone, CNAE) com 2 ações: **"Virar lead"**
   (cria em `/vendas` com o pino e o telefone da Receita) e **"Ir agora"** (vira parada pela
   Rota rápida que já existe).
3. **Decisão do dono antes de codar:** cobra crédito por busca/lead (como o Radar) ou entra no plano?
   Isso muda o gate e a LEI DO VENDEDOR na tela.

### Ideia extra (barata, usa o que já existe)
**Radar de rua:** durante a rota, cruzar a trilha GPS já gravada com a base RFB e, no fim do dia:
"Você passou na porta de 14 bares hoje; 9 não são seus clientes." Zero API nova.

---

## 4. Pendências de INFRA que vão morder a próxima sessão

1. ✅ **RESOLVIDO 28/07 ~03:40 — os engines duplicados foram limpos.** Eram 9 containers órfãos com
   prefixo de hash (`c41cb7443d02_hbx-engine-7`, `…_webscraping` etc): sobra do recreate que morreu no
   meio (o compose renomeia o antigo pra `<id>_<nome>` e cria o novo; travou entre as duas coisas).
   Foram removidos (`docker rm -f`) e os **20 engines + webscraping recriados com nome limpo**
   (`docker compose --env-file .env -f docker-compose.hostinger.yml up -d hbx-engine-1..20 webscraping`).
   O bloqueio `hbx-engine-20 already in use` do publish full morreu com eles.
   ⚠️ Normal: minutos depois os engines 9-20 aparecem `Exited (0)` — é o **governor** estacionando motor
   ocioso, não falha. O que importa é o NOME limpo (o governor fala com eles por nome pelo socket).
2. **Levantar backend na mão é `docker compose --env-file .env -f docker-compose.hostinger.yml up -d backend`.**
   NUNCA `-f docker-compose.yml` — cria `backend`/`hbx-db-1` errados (nomes fora do padrão de produção).
3. **Publish + frentes do dono no mesmo tree:** o `add -A` carimba versão intermediária dos arquivos
   dele e quebra o build (aconteceu com `master/janela-creditos.tsx`). Saída usada:
   `HBX_PUBLISH_COMMITTED_ONLY=1 npm run new`, commitando só o arquivo já corrigido.
4. **Piso do versionCode: subido pra 87** (28/07). Estava 84, publicado 85, e no teste desta madrugada
   entrou **86 no ar** (`HBX_PUBLISH_COMMITTED_ONLY=1 npm run new`) e **87 instalado na mão** no g15.
   Com o piso em 87 o próximo publish gera **88** e o celular do dono recebe a oferta — sem isso ele
   ficaria preso no 87 local achando que está atualizado.
5. **Estado do que está no ar × no aparelho (28/07 ~04:30):** VPS = backend + **Loghbx v86**;
   g15 = build local **87** (com o fix do encaixe da Rota rápida). O fix já está **commitado**
   (entrou no `a8cd2615` do dono), mas **não publicado** — 1 `HBX_PUBLISH_COMMITTED_ONLY=1 npm run new`
   coloca no ar. Não publiquei porque o tree tem 7 arquivos em edição do dono (app.js, native.js,
   app.css, opening.html, offline-controls.js, HbxMobileBridge.kt, HbxSoundEngine.kt).

---

## 5. Fila antiga que continua aberta (do roteiro anterior)

- **R9**: varredura em massa `sem_pino` via CNEFE + job por UF às 20h (o único do R1–R10 que falta).
- Carimbo "endereço já conferido" (travado: Docker Desktop parado → sem `migrate dev`).
- "Salvar como minha rota do dia" sem moradia na UI.
- `prompt()` nativo em `app.js` (código de 6 dígitos do comprovante) — Kotlin não implementa `onJsPrompt`,
  entrega com `codigoObrigatorio` nunca confirma no aparelho.
- Sons `pairing_success` (não toca) e `sync_complete` (só na Leitura).
- Decisões do dono paradas: APK de vendas (congelar × investir); chegada financeiro-OFF; piso de accuracy
  no `gps_cadastro`; preço final dos 3 níveis (agora com o modelo híbrido que ele mesmo commitou 28/07).

---

## 6. Como testar (resumo da regra do dono)

1. Só front (`app.js`/`app.css`) → build local + `adb install -r` → **eu dirijo até a tela e deixo aberta** →
   dono só olha e responde. Depois publica.
2. Mexeu em backend/Kotlin/allowlist → **publica primeiro**, testa depois.
3. Release não abre CDP: diagnóstico de UI é `adb shell screenrecord` + `ffmpeg fps/tile` (contact sheet).
   Foi assim que apareceu o `fitBounds` rodando a cada render.
4. Nunca anunciar conserto que não foi visto acontecer na tela.
