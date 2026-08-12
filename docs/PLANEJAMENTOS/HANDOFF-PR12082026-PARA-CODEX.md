# HANDOFF — PR12082026 PESQUISA/PAINEL DA PARADA AVULSA (Claude → Codex, 12/08 ~08h)

Escrito pelo FISCAL da sessão. Quem pegar isto: leia inteiro antes de tocar em arquivo.
Plano original: `docs/PLANEJAMENTOS/PR12082026-PESQUISA-PAINEL-AVULSA.md`.
Desenho aprovado pelo dono: `docs/mockups/pesquisa-avulsa-v2.html`.

---

## 1. ESTADO EXATO NESTE MINUTO (conferir antes de acreditar)

```bash
git log --oneline -6 && git status --short && git rev-parse HEAD origin/master
```

- **origin/master = `10304d87`**. O HEAD local está **3 commits À FRENTE, NÃO PUBLICADOS**:
  | commit | dono | o que é |
  |---|---|---|
  | `a42afdbb` | F4 (esta frente) | backend: o pino do VIZINHO se vestia de PORTA do Censo (`geoFonte` novo `cnefe_cep`) |
  | `9426a00a` | **OUTRA sessão** | apk-gps: número do velocímetro no centro do disco |
  | `c5790c44` | F4 (esta frente) | app: o que o painel achou morria na porta do cadastro |
- **Tree sujo (NÃO é meu, NÃO reverter):** `assets/app/mock.css`, `assets/app/mock.js`,
  `assets/app/ponte.js`, `ponte-src/66-radar-nav.js`, `docs/mockups/logistica2.0/logistica-2.0.html`,
  `.codex-current-phone.png`. É de sessão(ões) paralela(s) (radar-nav). **Qualquer publish leva isso
  junto** (`npm run publish` faz `git add -A`) — ver §6.
- **NO AR (produção, APK 270 / SHA `bd3fcb10…`, backend com boot ~07:04):** F1 (busca) + F2 (painel),
  provados na tela do g15. **F4 NÃO está no ar. F3 (voz) NÃO existe** (worker morto no levantamento,
  zero código escrito).

### O que já foi entregue e provado (não refazer)
- **F1** — `GET /logistica/busca?q=&lat=&lng=` (3 grupos: clientes pg_trgm fuzzy, CNEFE vias, RFB×CnpjGeo)
  e `GET /logistica/busca/porta?municipio=&via=&numero=`. Guard = trio padrão do `LogisticaController`
  (`JwtAuthGuard + ModuleAccessGuard + @ModuleAccess('logistica')`). Ambos na allowlist do
  `NativeApiClient.kt`. Índices criados em prod (GIN trgm em `CustomerProfile.searchName` 416 kB;
  cobridor parcial SP `CnpjPublicCompany_buscaSpCover_idx` 1.452 MB; GIN em `cnefe_via.via_canon` 20 MB).
- **F2** — o painel na tela `rapida`, aba **"Procurar"** (`ponte-src/C5-busca-painel.js`).
- Provado no g15 no binário publicado (07:09–07:11): "bar do ze" → 3 grupos com distância/badge;
  "Mracia" → Jorge/Márcia em 1º (3,1 km); "rua 8" → 6 vias do Censo, "1054 portas", grifo verde.

---

## 2. FALTA #1 — GATE DO LOTE F4 (fazer ANTES de publicar)

O worker F4 entregou verde, **mas ninguém auditou o raio de alcance da mudança de `geoFonte`**.
Isto é o que eu ia rodar. É o item de MAIOR risco do que falta: mexe em vocabulário lido por
várias telas e regras.

**O que mudou:** `backend/src/nucleo/nucleo-geo.util.ts` — `resolveServerGeo` carimbava pino de
**vizinho** como `'cnefe'` (porta provada, força 3, intocável pela cura, contada como "provado").
Agora vizinho vira **`'cnefe_cep'`** (força 2) e `geoFonteDaPorta('cnefe_cep') = false`.

**Checar, um por um (cada `NÃO` vira conserto antes do publish):**
1. Quem LÊ `geoFonte` e pode quebrar com o valor novo:
   ```bash
   grep -rn "geoFonte" backend/src frontend/src EntregaShell/app/src --include=*.ts --include=*.tsx --include=*.js | grep -v node_modules
   grep -rn "FORCA_GEO_FONTE\|geoFonteDaPorta\|gps_impreciso\|'cnefe'" backend/src | grep -v test
   ```
   Perguntas: existe comparação `=== 'cnefe'` que agora deixa de casar? existe lista/enum/união de
   tipos TS que não tem `cnefe_cep` (compila mas o valor viaja)? o **contador de "provado"** e os
   badges de qualidade de pino em `/logistica` e no app mudam de número na tela do dono?
2. **Banco:** a coluna `geoFonte` é texto livre ou enum/constraint? Se houver CHECK/enum, `cnefe_cep`
   quebra INSERT em produção — **isso derruba cadastro**. Conferir schema + valores distintos hoje:
   ```bash
   node scripts/vps-run.js --stdin <<'EOF'
   docker exec hbx-postgres psql -U hbx_user -d hbx_prod -At -c "\d+ \"CustomerProfile\"" | grep -i geofonte
   docker exec hbx-postgres psql -U hbx_user -d hbx_prod -At -c "SELECT \"geoFonte\", count(*) FROM \"CustomerProfile\" GROUP BY 1 ORDER BY 2 DESC"
   EOF
   ```
3. **Dado velho:** contas já gravadas como `'cnefe'` vindas de vizinho continuam com o rótulo antigo
   (o worker NÃO fez backfill, de propósito). Decidir com o dono se quer backfill. **Sem backfill
   nada quebra** — só ficam pinos velhos rotulados melhor do que são.
4. **A cura automática:** confirmar que `cnefe_cep` (força 2) agora PODE ser melhorado pela cura e
   que isso não reabre a "cura por nome de rua", que está MORTA por lei de 10/08.
5. Rodar de verdade (não confiar no relatório):
   ```bash
   cd backend && npm run build && node --test dist/nucleo/pino-do-censo-no-cadastro.test.js
   node --test "dist/nucleo/**/*.test.js" "dist/logistica/**/*.test.js"
   ```

---

## 3. FALTA #2 — PUBLICAR

**Pré-condições (todas, na ordem):**
1. Gate do §2 verde.
2. `git status` — se houver sujo alheio (hoje tem: radar-nav), decidir: ou esperar a sessão dona
   commitar, ou publicar sabendo que **vai junto**. Publicar sujo alheio já quebrou o master hoje.
3. **Tree parado**: hashear 2× com 30 s de intervalo e só publicar se for igual:
   ```bash
   git diff | sha1sum; sleep 30; git diff | sha1sum
   ```
4. `cd backend && npm run build` **verde** (o publish roda typecheck ESTRITO; build quebrado =
   publish morre e o master fica armado — foi o que aconteceu às 04:18 hoje).

**Publicar:**
```bash
npm run publish
```

**Conferir DEPOIS (obrigatório — "health 200" mente):**
```bash
node scripts/vps-run.js --stdin <<'EOF'
cd /root/HBX && git log --oneline -1
docker ps --format '{{.Names}} {{.Status}}' | grep backend      # "Up N segundos" = deploy aconteceu
curl -s -o /dev/null -w 'health %{http_code}\n' http://localhost:3000/health
curl -s -o /dev/null -w 'busca %{http_code}\n' 'http://localhost:3000/logistica/busca?q=bar'   # 401 = viva atrás do guard
cat /var/www/hbx-downloads/version-logistica.json
EOF
```
- O `versionCode`/`sha256` do manifesto tem que bater com o APK real:
  `sha256sum /var/www/hbx-downloads/hbx-logistica.apk`.
- Conteúdo novo DENTRO do APK publicado:
  `cd /tmp && unzip -o -q /var/www/hbx-downloads/hbx-logistica.apk assets/app/ponte.js && grep -c "<string nova>" assets/app/ponte.js`

---

## 4. FALTA #3 — TESTAR NO CELULAR (regra do dono: a prova é a tela)

**Aparelho:** moto g15, ADB `ZF5255SMWF`. Tela 1080×2400. **Coordenada de toque = px do screenshot**
(uso `input tap` com as coordenadas REAIS do 1080×2400). No Git Bash, todo comando adb com caminho
precisa de `MSYS_NO_PATHCONV=1`, senão o `/sdcard/...` vira `C:/Program Files/Git/sdcard/...`.

```bash
SP="<pasta scratch>"
MSYS_NO_PATHCONV=1 adb shell dumpsys package br.com.hbxsystem.logistica | grep -E "versionCode|lastUpdateTime"
MSYS_NO_PATHCONV=1 adb shell "screencap -p /sdcard/t.png"; MSYS_NO_PATHCONV=1 adb pull -q /sdcard/t.png "$SP/t.png"
MSYS_NO_PATHCONV=1 adb shell input tap <x> <y>
MSYS_NO_PATHCONV=1 adb shell input text "bar%sdo%sze"      # %s = espaço
MSYS_NO_PATHCONV=1 adb shell input keyevent 111            # esconde teclado (ESC)
```
O aparelho **atualiza sozinho** pelo aviso do app depois do publish (esperar ~5 min ou abrir o app);
conferir `versionCode` novo antes de testar, senão você testa o app velho (armadilha já documentada).

**Caminho de toque até o painel** (medido hoje, coordenadas reais 1080×2400):
1. Aba **Rota** (rodapé): `540 2208`
2. **Montar rota** (botão azul do dock): `540 2036` → cai em "Montagem de rota" (só NAVEGA, não monta)
3. **Adicionar parada** (botão verde no rodapé da Montagem): `540 2047`
4. Aba **"Procurar"** (no topo, ao lado de "Meus clientes"): `793 294`
5. Campo de busca: `540 407` · o **×** de limpar: `996 408`

**Checklist da F4 (o que provar):**
1. "Procurar" → digitar uma rua conhecida → tocar na rua → digitar um número **que existe** → "Usar"
   → o pé mostra a pílula verde **"nasce com CEP …"** → "Adicionar à rota" → abrir a ficha do cliente
   novo: **CEP preenchido**, **número igual ao digitado**, cidade escrita como gente ("Rio Claro").
2. Mesmo caminho com número que **não existe** (ex.: 9000): a tela avisa que o ponto/CEP são do
   **vizinho mais perto**, e o cadastro nasce **no número que você digitou**.
3. "Procurar" → um **comércio da Receita** → o pé traz CEP → adicionar → a ficha tem o número da
   placa (não "S/N").
4. Repetir o passo 3 com o MESMO comércio: tem que dizer **"já está na rota de hoje"** e **não**
   criar cliente novo (conferir na lista de Clientes que só existe um).
5. Comércio de outra cidade/bairro: a tela avisa "ponto aproximado" e a parada cai pelo CEP.

**PROIBIDO no aparelho:** tocar **Iniciar rota** (cobra crédito/assento — gesto do dono) e, na
company 41, confirmar qualquer coisa que suje o dia real além do necessário para as cenas acima.
No fim: apagar os prints do `/sdcard`, deixar o app na tela de Rota e conferir `dumpsys` de novo.

---

## 5. FALTA #4 — F3 (VOZ) — NÃO EXISTE UMA LINHA ESCRITA

**Cena:** motorista com luva/sol toca o microfone, **fala** "bar do zé", o texto cai no campo e a
busca de sempre roda. A voz **só preenche o input** — nenhum verbo novo, nada de escolher parada ou
confirmar cadastro por voz.

**Decisões já tomadas (não reinventar):**
- **`SpeechRecognizer` NATIVO do Android** (`android.speech`), 1 intent + callback pela ponte.
  **NÃO** usar Web Speech API do WebView (depende de serviço Google no WebView e cai no
  `permissions.query` que MENTE — já queimou tempo nesta casa).
- Método novo exposto no Kotlin (`NativeAppBridge`/`HbxMobileBridge`/`MainActivity` — seguir o padrão
  que o `native.js` usa) e chamado do `C5-busca-painel.js`. **Provar os DOIS lados**: capacidade
  nativa sem chamador é bug; chamador sem capacidade nativa é tela morta (o "padrão da fusão").
- **`RECORD_AUDIO` se pede NO TOQUE do mic**, nunca no boot (lei do GPS de 08/08). Recusa vira aviso
  honesto, **nunca tela muda**. Conceder depois tem que **rearmar sem recarregar** — copiar o padrão
  do `HBXApp.locationPermissionChanged`.
- **Se o aparelho não tem reconhecedor, o botão NÃO nasce** (botão morto é proibido) — e isso se
  decide por MEDIDA do nativo, não por chute do JS.
- Visual: o mic do `docs/mockups/pesquisa-avulsa-v2.html` (56×56 ao lado do campo, `.ouvindo`
  pulsando, véu "Ouvindo… / fale o nome, a rua ou o comércio"). O pulso tem que ser **loop com
  from==to** (o único tipo que sobrevive a repinte), e regra de entrada cita `.entra`.

**Provas que a F3 precisa (red-first honesta):** mic ausente quando o nativo não tem reconhecedor ·
toque pede permissão e a recusa vira aviso · o texto reconhecido cai no input **pelo MESMO caminho
do teclado** (mesma função, não caminho paralelo) · o pulso não reencena a cada repinte · fala
vazia/erro **não apaga** o que já estava digitado.

---

## 6. LEIS E ARMADILHAS QUE CUSTARAM CARO HOJE (não repetir)

1. **`npm run publish` faz `git add -A`** — leva o trabalho sujo de QUALQUER sessão. Hoje isso subiu
   código pela metade 2× e **quebrou o master** (const usada antes de declarada, TDZ).
2. **Publish que falha no build não avisa**: `/health 200` e "container up" MENTEM. A testemunha é a
   **hora de boot do container** (`Up N segundos` = deploy novo; `Up 2 horas` = deploy não aconteceu).
3. **Worker que morre no limite deixa arquivo pela metade** — lote órfão é bomba, não "trabalho a
   continuar". Quem assumir roda build/typecheck ANTES de confiar.
4. **CRASE em comentário dentro de template literal FECHA a string** (mordeu 2× hoje; o erro aparece
   longe do lugar, como "Invalid character").
5. **Só COMMIT sobrevive** — `git add`/index somem quando outra sessão publica. Commit por pathspec
   explícito: `git commit -m "..." -- <paths>`; conferir `git diff --cached --stat` antes.
6. **Dublê infiel reprova código certo**: quando o servidor passa a mandar campo novo (`escolhida`),
   o dublê da prova tem que mandar também — senão o portão fica vermelho contra código bom e todo
   mundo aprende a ignorar o vermelho.
7. **Guarda que não dispara é pior que guarda nenhuma** (o aviso de porta repetida só confirma com
   CEP **ou** cidade batendo — bairro não entra na conta).
8. **Camada nova nasce PARADA**: regra de ENTRADA de animação sempre cita `.entra`.
9. **Fonte é o mock HTML**; `mock.js`/`mock.css`/`ponte.js` são GERADOS — nunca editar à mão.
10. `MSYS_NO_PATHCONV=1` em todo adb com caminho, no Git Bash.

---

## 7. PORTÕES — comandos exatos (rodar TODOS antes de publicar)

```bash
node scripts/prova-painel-avulsa.js        # 64/64 depois da F4
node scripts/prova-busca-avulsa.js         # 27/27 (banco do VPS, só-leitura por PGOPTIONS)
node scripts/prova-busca-avulsa.js --sabotagem   # tem que REPROVAR (prova não decorativa)
node scripts/prova-fluxo-rota.js           # 123/123
node scripts/prova-navegar.js              # 17/17  (1.9 reprova sob máquina carregada: re-rodar calmo)
node scripts/prova-meus-clientes.js        # 20/20
node scripts/prova-chegada.js              # 29/29
node scripts/prova-teclado-vivo.js         # 18/18
node scripts/prova-pisca-cancelar.js       # 4/4
node scripts/prova-mapa-2d.js              # 54/54
node scripts/prova-abertura.js             # 32/32
node scripts/prova-espacos.js              # 45/45
node scripts/prova-manobra-fantasma.js     # 12/12
node scripts/prova-encaixe-gps.js          # 3 alturas
node scripts/prova-folha-sobe-uma-vez.js   # 11/11
node scripts/casca-conferir.mjs            # 68/68 (nome exato: conferir em scripts/)
node scripts/casca-antes-e-depois.mjs      # só as telas mexidas, nos 2 modos
node scripts/ponte-conferir.mjs            # 23 fontes, maior 936 linhas (teto 1000)
cd backend && npm run build && node --test "dist/logistica/**/*.test.js" "dist/nucleo/**/*.test.js"
```
(Os nomes com extensão podem variar — `ls scripts/ | grep -E "prova-|casca-|ponte-"` resolve.)

---

## 8. PENDÊNCIAS CONHECIDAS (com moradia)

- `EntregaShell/app/src/logistica/ponte-src/C5-busca-painel.js:485` — as 6 linhas de `data-acao` do
  painel vivem em ouvinte próprio, **fora** do mapa do `D0-porta-entrega.js` (foi assim pra não
  colidir com sessão paralela). O lote que bloqueava já pousou: dá pra devolver pro mapa.
- `backend/src/logistica/logistica-busca.service.ts` — o **fallback fuzzy de comércio custa ~390–540 ms**
  (só quando o LIKE volta vazio). Teto do serviço 1500 ms, orçamento total do request 2 s.
- **Backfill do `geoFonte`**: contas antigas gravadas como `cnefe` vindas de vizinho seguem com o
  rótulo antigo. Precisa de GO do dono.
- **F1 — `CnpjGeo` só cobre SP**: fora de SP o grupo de comércios degrada pro caminho do heap
  (~140 ms) e o ranking por distância perde qualidade. Anotado, não bloqueia.
- **Prova da busca não bate no ENDPOINT HTTP** (só no SQL): controller/service/auth/merge não têm
  prova automatizada. Se sobrar fôlego, uma cena HTTP com token de teste fecharia o buraco.
- **Memórias já atualizadas** por mim: `hbxapk.md` (seção do painel, APK 269/270) e
  `guerra-de-sessoes-paralelas-add-a.md` (a mordida de hoje).

---

## 9. ORDEM SUGERIDA PARA O CODEX

1. §2 (gate do F4 — principalmente o **enum/constraint de `geoFonte` no banco**, que é o único item
   capaz de derrubar cadastro em produção).
2. §3 publicar + conferir (com a decisão sobre o sujo alheio).
3. §4 testar no g15 as 5 cenas da F4.
4. §5 fazer a F3 (voz) do zero, com as provas dela.
5. Publicar de novo + testar a voz no aparelho (mesmo caminho de toque, agora com o mic).
