# PR07082026 — FECHAR O LOGISTICA2: ligar o que falta e devolver pro VPS

> **Pra que serve:** este documento é o ÚNICO que a próxima sessão precisa ler pra
> terminar a frente. Ele diz o que está pronto, o que falta **endpoint por endpoint**,
> como rodar a bancada e como fazer a troca. Nada aqui depende do chat anterior.
>
> **Ordem do dono (07/08):** *"crie um plano do que falta aqui, incluindo ligar todos
> endpoints e voltar pro vps essa versão, 100% ela."*
>
> **Leia junto:** `PR06082026-RECOMECO-LOGISTICA2.md` (o plano-mãe, com as 4 leis e o
> mapa de fiação) e `INVENTARIO-APP-ANTIGO-VS-NOVO.md` (a lista item a item + o CORTE
> de 06/08, que diz o que NÃO sobe).

---

## 1. ESTADO MEDIDO — 07/08/2026

**14 commits locais, nada publicado.** `HEAD` = `267d8e06`.

| Leva | Estado | Prova |
|---|---|---|
| L1 rota do dia | ✅ | paradas reais no g15 |
| L2 montar → iniciar → encerrar | 🔶 | falta só o Iniciar que DEBITA (bancada sem crédito) |
| L3a mapa | ✅ | maplibre + PMTiles offline no aparelho |
| **L3b navegação** | ⬜ | **é o maior buraco — ver §4.1** |
| L4 entregar / não entregar | ✅ | `arrivedAt`, `receiptMethod` e motivo medidos no banco |
| L5 caderneta + semana | ✅ | fechar o dia criou a "Caderneta de Sexta" |
| L6 clientes + ficha | ✅ | número, CPF, dias e o pino morto medidos |
| L7 produtos | ✅ | preço 9 → 9.5 medido |
| L8 chat e recados | ✅ | visto, resposta e "Entendi" medidos |
| L9 ajustes / recarga / consumo | ✅ | `modoCaderneta` t→f pela tela |
| L10 rotas salvas | ✅ | "Abrir" gerou a rota (entregas 0→1) |
| L10 rápida / gerenciador | ⬜ | **ver §4.2 e §4.3** |

### As 28 portas JÁ ligadas na `ponte.js`
```
/credits/me                          /logistica/produtos            /nucleo/clientes
/logistica/config                    /logistica/produtos/:id        /nucleo/clientes/:id
/logistica/rota                      /logistica/cliente-produtos    /nucleo/contas/:id
/logistica/rota/planejar             /logistica/rota-modelos        /nucleo/locais/:id
/logistica/rota/conferir             /logistica/rota-modelos/:id/gerar  /nucleo/telefones/:id
/logistica/rota/custo-preview        /logistica/recados/me
/logistica/rota/iniciar              /logistica/recados/portao
/logistica/rota/encerrar             /logistica/recados/visto
/logistica/entregas/:id/confirmar    /logistica/recados/responder
/logistica/entregas/:id/cancelar     /logistica/recados/:id/entendi
/logistica/caderneta/resumo          /logistica/creditos/extrato
/logistica/caderneta/finalizar       /logistica/clientes/:id/dias
```

### Portões (rodar SEMPRE antes de commitar)
```bash
node scripts/casca-injetar.js && node scripts/casca-conferir.js && node scripts/casca-antes-e-depois.js
```
- `casca-conferir` **66/66** = a pele é o mock, pixel a pixel. Ele também pega **erro de
  sintaxe que dá tela preta** (já pegou uma crase dentro de comentário HTML).
- `casca-antes-e-depois` só deve acusar a tela que você mexeu de propósito.

---

## 2. A BANCADA — como rodar (sem isto nada anda)

```bash
adb -s ZF5255SMWF reverse tcp:3000 tcp:3000
adb -s ZF5255SMWF reverse tcp:3001 tcp:3001
cd EntregaShell && ./gradlew assembleLogistica2Debug
adb -s ZF5255SMWF install -r app/build/outputs/apk/logistica2/debug/app-logistica2-debug.apk
```
Empresa da bancada: **39 (Atlas Distribuidora)**, usuário `Ana Souza` (id 36).
Banco local: `docker exec app-db-1 psql -U admin -d jhonatan_dev`.

**Armadilhas da bancada, todas medidas:**
1. 🔴 **O backend local NÃO recompila sozinho.** Editou `backend/src`? `docker restart backend`
   e espere o `/health` responder 200. Perdi uma hora caçando um "bug" que era `dist` velho.
2. 🔴 **O `adb reverse` cai** quando o aparelho reconecta. Sintoma: tela sem dado, sem erro.
   Refaça antes de desconfiar do código.
3. 🔴 **O OSRM da bancada é o SERVIDOR PÚBLICO, e o nosso não.** Medido em 07/08:
   - VPS: `hbx-osrm` (`osrm/osrm-backend`) de pé há 8 dias, `OSRM_BASE_URL=http://172.18.0.1:5000`,
     resposta em **341 ms**;
   - bancada: o container local **não tem `OSRM_BASE_URL`** → cai no default do código
     (`router.project-osrm.org`), que responde ~1 s quase sempre e **às vezes estoura os 9 s**
     de timeout. **É ISSO — e só isso — o "OSRM dá timeout" que travou o L2 e o L3b.**
   - **Cura:** apontar a bancada pro nosso OSRM. Ele está preso ao bridge do Docker da VPS
     (`172.18.0.1:5000`, sem porta pública), então daqui só chega por **túnel SSH** — mesmo
     canal do `scripts/vps-run.js`, que já tem credencial. Depois: `OSRM_BASE_URL` no
     container local + `docker restart backend`.
   - ⚠️ **NÃO subir `UPSTREAM_TIMEOUT_MS` de 9 s.** Em produção o roteador é nosso e responde
     em 341 ms; 30 s ali seguraria a tela do motorista numa queda real.
4. Teste no celular é **por TOQUE** (`adb shell input tap`), não por script — a regra §1 do
   `hbxapk.md`. `adb shell input text` corta no espaço: use `%s` ou digite sem espaço.

---

## 3. AS LEIS QUE NASCERAM NESTA FRENTE (não re-quebrar)

1. 🔴 **FALHA DE REDE NÃO APAGA A TELA.** *"Vazio porque o servidor disse vazio"* e *"vazio
   porque a rede caiu"* são opostos. Chamada que falhou **não escreve no seam**. Já mordeu em
   3 lugares (recados, caderneta, crédito). E se a fonte de uma TRAVA falhar, mantém a trava.
2. 🔴 **A LEI DO IF: zero não é informação.** Todo RECORTE (forma de pagamento, contagem,
   bônus) some quando é zero — se todo mundo pagou no pix, aparece só Pix. **Limite de
   propósito:** vale pro recorte, **não** pra medida principal ("0 paradas hoje" fica).
3. 🔴 **O DIA É O DE SÃO PAULO** — nem o relógio do aparelho, nem o do servidor (os dois
   containers rodam **UTC**). Toda porta com data leva `?date=` do `diaOperacional()`.
4. 🔴 **O ENDEREÇO MATA O PINO.** Mudou rua/número/bairro/CEP → `lat/lng = null`. Sem
   coordenada a parada vira "sem trajeto" e a conferência acusa. Barulho > silêncio errado.
5. 🔴 **RASCUNHO NASCE DE TECLA, não de foto.** Fotografar os campos antes de repintar grava
   `""` como se fosse escolha do usuário e apaga o dado do servidor.
6. 🔴 **BEST-EFFORT QUE ENGOLE ERRO PRECISA DE ALARME** (`logger.warn`). Sem isso o recurso
   some da tela sem explicação.
7. 🔴 **CHAVE/BOTÃO SEM PORTA NÃO ENTRA NA TELA.** Pior que ausente.
8. 🔴 **O GANCHO NASCE DO DADO:** `data-acao` só sai no HTML quando o item tem `id` real —
   é o que mantém o mock byte-a-byte idêntico.
9. Copy: **"pino" é PROIBIDA em tela** (Lei 8 do `hbxapk.md`). Diga "local".

---

## 4. O QUE FALTA LIGAR — endpoint por endpoint

> Ordem sugerida: **4.1 → 4.4 → 4.2 → 4.3 → 4.5**. O 4.4 tem o BLOQUEADOR da troca.

### 4.1 — L3b: A NAVEGAÇÃO (o maior, e está no piso que o dono escolheu)

Hoje o mapa é real (L3a) mas **todo o cromo em volta é literal do mock**: manobra,
velocímetro, ETA, bússola, "Parada 3 de 8". Telas: `T.mapa` / `T.mapachegou`
(`telaGps()` no mock).

| O que ligar | Porta / fonte |
|---|---|
| Traço da rota pelas ruas | `GET /logistica/osrm/route?coords=…&steps=1` → `routes[0].geometry` (GeoJSON) numa layer do maplibre |
| Reta tracejada (sem trajeto) | quando o OSRM falhar — é o fallback honesto, não pode ficar sem linha |
| Manobra (distância + verbo + rua) | `legs[].steps[].maneuver` + `.name` do mesmo `route` |
| ETA · restante · distância (rodapé) | `routes[0].duration` / `.distance` + relógio do aparelho |
| "Parada N de M" | já existe em `DADOS.rota` / `ENTREGAS` |
| Velocímetro | `navigator.geolocation` → `coords.speed` (m/s → km/h) |
| Bússola | `coords.heading` (o mapa já gira pelo rumo no mock) |
| Faixa de GPS (precisão) | `coords.accuracy` |
| Voz da navegação | `HBX.speak` (Kotlin JÁ existe, sem chamador) |
| Manter tela acesa / modo navegação | `HBX.manterTelaAcesa` / `HBX.modoNavegacao` (Kotlin JÁ existe) |
| Enquadrar rota / recentralizar / garagem | maplibre — **uma função só decide a câmera** |
| Aviso "estou chegando" (~500 m) | `POST /logistica/entregas/:id/chegando` (allowlist ok) |

🔴 **RETRAÇO (saiu do caminho) — o que já custou uma madrugada:**
- resultado de rede guardado em memória leva **carimbo da entrada que o gerou** (assinatura
  da fila); sem isso o traço velho sobrevive a uma troca de rota;
- orçamento **SEPARADO** por assinatura: 1 em voo, backoff, teto por dia;
- **`isStyleLoaded()` NUNCA como portão de fluxo** — mapa remontado fica "não pronto" por
  tempo indeterminado e mata o pedido E o desenho. Use `once('styledata')` + teto de 1,2 s.

### 4.2 — L10 `rapida` (cadastro na rua) — é do tamanho da L6, não é resto de leva

| O que ligar | Porta |
|---|---|
| Campo único (endereço escrito) | `GET /logistica/geo/busca` |
| CEP + número → local | `GET /logistica/geo/cep` |
| Link do Maps colado | `GET /logistica/geo/link` |
| Reverse geocode | `GET /logistica/geo/reverse` |
| Anti-duplicata de porta | `GET /nucleo/contas/por-endereco` (**fail-closed**) |
| Criar cliente | `POST /nucleo/contas` |
| Criar entrega avulsa | `POST /logistica/entregas` |

⚠️ Ler antes: `endereco-identidade-e-numero-nao-o-ponto` — **mesmo CEP/ponto não prova
duplicata**; a régua é `mesmaPorta` (número + apartamento).

### 4.3 — L10 `gerenciador`

| O que ligar | Porta |
|---|---|
| Tirar do dia | `POST /logistica/rota/tirar-do-dia` |
| Limpar dia | `POST /logistica/rota/limpar-dia` |
| Descartar montagem | `POST /logistica/rota/descartar-montagem` |
| Sanitizar endereço | `POST /logistica/rota/sanitizar` |
| Reordenar a agenda | `PATCH /logistica/agenda/dias/:dia/ordem` |

### 4.4 — O RESTO DO PISO (pequenos, mas um deles é BLOQUEADOR)

| O que ligar | Porta / fonte | Nota |
|---|---|---|
| 🔴 **Aviso de atualização** | `GET /downloads/version-logistica.json` + `HBX` update | **BLOQUEADOR DA TROCA** — sem ele, a troca é a ÚLTIMA atualização que o celular recebe na vida. Gate `HBX_V2` pendente |
| Pulso (tela a cada 5 s) | `POST /logistica/recados/pendentes` com `{tela}` | é o mesmo poll do chat: leva o pulso de carona |
| Ver Tela (espelho) | `POST /logistica/espelho/quadro` | 3.914 chamadas em 2 semanas — é o suporte do dono |
| Erros do cliente | buffer de 20, de carona no poll | |
| Prévia do dia | `GET /logistica/dia-preview` | 456 chamadas em produção |
| Próxima parada (overlay) | estado local + `ENTREGAS` | |
| Banner "sem sinal" / "pausada" | estado local | |
| Salvar montagem / reordenar / otimizar | `POST /logistica/rota/planejar` + ordem manual | |
| Pausar / continuar / finalizar rota | estado local + `rota/encerrar` | |
| Tela de conferência (com a LISTA) | `POST /logistica/rota/checar-enderecos` | hoje só o portão com a contagem |
| Criar cliente pela ficha | `POST /nucleo/contas` | hoje só edita |
| CEP → endereço (ViaCEP) + DDD | `GET /logistica/geo/cep` | |
| Arquivar produto (segurar) | `PATCH /logistica/produtos/:id {ativo:false}` | |
| Preço do dia / **moeda estilo banco** | — | ⬜ a máscara não existe; hoje o freio é o portão que lê o preço de volta |
| Sons / vibração / voz | `HBX.sound` · `HBX.vibrate` · `HBX.speak` | Kotlin pronto, sem chamador |
| Permissão de localização | `HBX.requestLocationPermission` | |
| Ligar / WhatsApp / Maps | `HBX.call` · `whatsapp` · `maps` | |
| Leis de casca (A) | Enter avança campo, bottom-sheet, confirmação, toast, **segurar pra excluir** | 5 itens, baratos |
| 4 sub-telas de Ajustes | `financeiro` · `avancado` · `sons` · `historico` | ⚠️ **decisão do dono pendente** — ver §5 |

### 4.5 — O QUE **NÃO** ENTRA (corte do dono, 06/08 — não reabrir sem ordem)

Comprovante foto/código · Modo Passeio (8) · Leitura de rota (6) · pacote offline
`prepare/sync/proofs` (4) · tracking ao vivo · mapa offline antigo (3) · missões e rota
indicada (4, **e o poll de 2.981 chamadas morre junto**) · editor/duplicar modelo (2) ·
`gerar-dia` · tela de chegada nativa.

---

## 5. DECISÕES DO DONO AINDA PENDENTES

1. **As 4 sub-telas de Ajustes** (`financeiro`, `avancado`, `sons`, `historico`): o mock
   desenhou conteúdo DIFERENTE do que o app tem (mock `financeiro` é painel de cobrança, o
   app é lista de chaves; mock `historico` é de ROTAS, o app é do CLIENTE). Vestir a função
   atual com a cara do mock, ou o desenho vira feature nova?
2. **Semana — "produtos por dia" e "recebido por dia"**: o `caderneta/resumo` só manda o
   total. Ou 7 chamadas (uma por página), ou 2 campos aditivos no `historicoDias`.
3. **`nucleo-r5.crosstenant`** falha 1 de 2 — **medido com stash: PRÉ-EXISTENTE**, a metade
   que quebra é a de logística. Investigar em leva própria ou deixar anotado?
4. **`Product.stock` legado**: o `PATCH /logistica/produtos {estoque}` escreve NELE, não no
   estoque fiscal. O app novo nunca manda, mas a porta segue aberta.

---

## 6. FX — A TROCA: devolver esta versão pro VPS

> Só com ordem explícita do dono. **A troca é irreversível pro aparelho do André:**
> mesmo `applicationId`, mesma assinatura, ele atualiza sozinho pelo aviso.

### 6.1 — Antes de trocar (checklist duro)
- [ ] Tudo do §4 ligado e **provado por toque no g15** (regra §1 do `hbxapk.md`).
- [ ] 🔴 **Aviso de atualização funcionando** — sem ele o cordão de entrega arrebenta.
- [ ] `casca-conferir` 66/66 · `casca-antes-e-depois` limpo · `tsc` back e front limpos.
- [ ] Rodar contra o **VPS** (não a bancada) e repetir a cena do dia inteiro.
- [ ] Iniciar rota com **crédito real** numa empresa de TESTE — o débito nunca foi provado.

### 6.2 — Os 3 que quebram CALADO se esquecer
1. 🔴 **Religar `google-services` no flavor.** Hoje está desligado (o `google-services.json`
   só declara `br.com.hbxsystem` e `.logistica`). Quando o applicationId voltar pro
   `.logistica`, religar — senão o **push morre em silêncio** (a chamada vive dentro de
   `runCatching`).
2. 🔴 **Apagar `logistica2/assets/app/app.js` (13.688 linhas) e `app.css`.** O `index.html`
   não carrega nenhum dos dois: são **1,1 MB de peso morto** no APK e uma "reserva" que não
   existe.
3. 🔴 **Devolver `logistica2` à digital do APK** (`collectApkInputFiles` em
   `scripts/ops/deploy-vps.js`) — ele está FORA de propósito, pra bancada não carimbar
   versão nova em produção. Depois da troca, tem que voltar.

### 6.3 — A troca em si
- assets do `logistica2` viram os do `logistica`;
- `applicationId` volta pra `br.com.hbxsystem.logistica`;
- sai o `-bancada` do `versionName`; **piso do `versionCode` acima do publicado**;
- `npm run publish` (o publish **aborta fora do master** e **apaga branch não-master**);
- ⚠️ conferir o tree antes: `publish` faz `git add -A` e leva junto o que estiver sujo.

### 6.4 — Depois de publicar
- [ ] A **1ª prova é o aviso de atualização aparecendo sozinho** no celular — `adb install`
      NÃO é entrega (regra §6 do `hbxapk.md`).
- [ ] Conferir o SHA do APK público e a versão instalada.
- [ ] Abrir a ficha da empresa 41 no `/master` e usar o **Ver Tela** no e13 do André.

---

## 7. SUJEIRA DE TESTE DEIXADA NA BANCADA (empresa 39, não é produção)

- `modoCaderneta` da 39 ficou **false** (desligado ao testar o toggle).
- 2 recados de teste (`teste-l8-normal`, `teste-l8-urgente`) e uma resposta do motorista.
- Bruno Pereira com CPF `12345678909`, número 32, dia SEG e **pino nulo** (foi o teste do
  endereço que mata o pino).
- Produto 35 com preço **9,50** (era 9).
- Entregas de 06/08 e 07/08 confirmadas em dinheiro/pix/cartão/fiado.
