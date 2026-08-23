# PR22082026 — `npm run play` (o app vai à loja sozinho) e o publish vira só servidor

> Ordem do dono (22/08/2026, tarde): *"publish não altera mais celular, nada q for apk, ou aab
> blz? npm run play vamos desenvolver agora, faça um plano. Obs: quando rodar o play, tem q
> atualizar o .apk tbm, eu tenho q estar na mesma versão que a google play!"*

## 0. O que muda, em uma frase

Hoje `npm run publish` monta dois APKs, joga em `EntregaShell/dist/`, sobe pro VPS e escreve um
manifesto de update que **ninguém do Logística lê desde 20/08** (o app virou app-só-de-Play e os
verbos de auto-update foram deletados). Depois disto: **publish = servidor** e **`npm run play`
= app na loja**, com o `.apk` do dono saindo na MESMA versão — e, melhor que isso, sendo o
**binário idêntico ao da loja** (§2.6).

## 1. Os dois canais (a lei nova)

| Mudou | Comando | Chega em | Quando |
|---|---|---|---|
| Backend, frontend, motores, nginx | `npm run publish` / `new` | todos | minutos |
| App Logística (Kotlin, casca, ponte) | **`npm run play`** | faixa da loja | minutos p/ subir + processamento da Play |
| App Vendas (fora da Play, sideload) | **`npm run apk`** (§4) | quem tem o APK do site | minutos |

🔴 **O Vendas não pode ser esquecido no meio disto.** Ele **não** está na Play, o auto-update
dele **funciona** e depende exatamente do que sai do publish (APK no VPS + `version-vendas.json`).
Tirar o Android do publish sem lhe dar casa nova = matar o canal de update do Vendas em silêncio
— o mesmo defeito mudo de 19/08. Por isso o `npm run apk` nasce no mesmo PR.

## 2. O que o `npm run play` faz, na ordem

### 2.1 Portões (antes de gastar Gradle)
- Working tree limpa e branch `master` (mesma régua do publish; `--sujo` libera para emergência).
- **Regenera e confere o gerado**: `casca-injetar` + `ponte-costurar` + `casca-conferir` +
  `ponte-conferir`. Casca sem ponte = maquete na mão do cliente; o publish já barra isso e o
  `play` herda a trava.
- `:app:testLogisticaReleaseUnitTest` (a allowlist do `NativeApiClient` mora nesse teste).
- Confere que `HBX_PLAY=true` no flavor e que **zero** verbo de auto-update sobrou no dex
  (`REQUEST_INSTALL_PACKAGES`, `downloadAndInstall`) — é a única violação com risco de suspensão
  de conta, e ela não pode voltar por descuido.

### 2.2 O versionCode deixa de ser adivinhação
Hoje o número é chute contra um histórico que ninguém lembra (1, 2, 353, 355, 356 — três
recusas da Play em 21/08 por número queimado). O `play` **pergunta à própria Play**:

```
GET /androidpublisher/v3/applications/{pkg}/edits/{editId}/bundles   → lista todos os bundles
próximo = max(versionCode enviado, piso do versao-logistica.properties) + 1
```

Número queimado deixa de existir como problema — a fonte da verdade passa a ser o Console, não
a memória. Se a API não responder, cai no piso do `.properties` +1 e **avisa alto**.

### 2.3 Um número, dois binários
Um `-PhbxLogisticaVersionCode=N` único alimenta as duas tasks, no mesmo build:
- `:app:bundleLogisticaRelease` → `.aab` (vai pra loja)
- `:app:assembleLogisticaRelease` → `.apk` (o de bancada, assinado com a chave de upload)

### 2.4 Sobe pra Play (API v3, faixa escolhida)
`edits.insert` → `edits.bundles.upload` (media, timeout de 2 min) → `edits.tracks.update`
(`releases[{versionCodes:[N], status:"completed", releaseNotes:[{language:"pt-BR", text}]}]`)
→ `edits.commit`.

- Faixa **`internal` por padrão**; `--faixa closed|alpha|beta` quando quiser.
  🔴 **`production` NUNCA por padrão** — exige `--faixa production --eu-quero-producao`.
- `releaseNotes` sai do assunto do último commit (ou `--notas "texto"`).
- Erro da API é **cru na tela** (mensagem + código): a Play recusa por motivos específicos
  (número queimado, formulário faltando, target SDK) e mascarar isso custa horas.

### 2.5 Grava a versão e commita
`versao-logistica.properties` recebe o número que **realmente** subiu, com a data e a faixa no
comentário, e vira commit `build(play): versionCode N → faixa`. O arquivo deixa de ser um piso
adivinhado e passa a ser o registro do que a loja tem.

### 2.6 O `.apk` do dono — e aqui vem o pulo do gato
O pedido foi *"eu tenho q estar na mesma versão que a google play"*. Dá para fazer melhor que
"mesmo número": dá para entregar **o mesmo binário**.

Depois que a Play processa o bundle, ela **gera e assina** os APKs com a chave de assinatura do
app (a da Google) e a API deixa baixar:

```
GET /androidpublisher/v3/applications/{pkg}/generatedApks/{versionCode}   → lista
GET /androidpublisher/v3/applications/{pkg}/generatedApks/{downloadId}    → baixa
```

O `play` faz poll até o `generatedUniversalApk` aparecer, **confere o `certificateSha256Hash`
contra a chave da Play** (`26:C9:F3:B6:A7:42:97:E4…`, medida em 21/08) e salva em
`EntregaShell/dist/HBX-Logistica-<N>-play.apk`.

**Por que isso importa na prática (e custou o pareamento do g15 hoje):** o APK de bancada é
assinado com a chave de **upload**; o da loja, com a da **Google**. Assinaturas diferentes não
se substituem — para trocar de um para o outro é preciso **desinstalar** (apaga pareamento e o
`hbx_operational.db`). Com o APK gerado pela Play, o dono instala **por cima**, sem desinstalar
nada, e fica com o binário idêntico ao dos testadores.

Saem os dois arquivos, com o papel de cada um escrito no relatório:

| Arquivo | Assinatura | Para quê |
|---|---|---|
| `HBX-Logistica-<N>-play.apk` | chave da **Google** | instalar no aparelho que já tem o da loja, **sem desinstalar** — é o binário real |
| `HBX-Logistica-<N>-upload.apk` | chave de **upload** | bancada/emulador, quando a Play ainda não processou |

⚠️ O login com Google só funciona no `-upload.apk` depois que o **2º cliente OAuth Android**
(SHA-1 `B4:21:95:11:…`) existir no Cloud Console — pendência aberta desde 21/08. No
`-play.apk` funciona hoje.

### 2.7 Instala no aparelho, se houver um plugado
`--instalar` (ou perguntar quando achar exatamente 1 aparelho no `adb`): instala o
`-play.apk` por cima. **Nunca desinstala sozinho** — se a assinatura não bater, para e explica
(foi a trava que usei hoje).

### 2.8 Relatório final
Versão, faixa, link do Console, SHA-256 dos dois APKs, e o que fazer em seguida.

## 3. A chave de acesso — o que o DONO faz, uma vez

1. **Google Cloud Console** → projeto (pode ser o mesmo do OAuth, `959050454992-…`) →
   **ativar a "Google Play Android Developer API"**.
2. **IAM → Contas de serviço** → criar `hbx-play-publisher` → **criar chave JSON**.
3. **Play Console → Usuários e permissões → Convidar novo usuário** → e-mail da conta de
   serviço → permissões de app para `br.com.hbxsystem.logistica`:
   **"Lançar em faixas de teste"** (+ "Lançar em produção" só quando for a hora).
   🔴 Não dar acesso financeiro; não dar produção agora.
4. Salvar o JSON **fora do git**: `secrets/play-service-account.json` (entra no `.gitignore`) ou
   env `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.

⚠️ A permissão leva alguns minutos para propagar; o 1º `--dry-run` diz se já valeu.

## 4. O que sai do publish (e para onde vai)

Sai de `scripts/ops/deploy-vps.js`: `resolveAndroidVersion`, `buildAndroidApk`,
`publishAndroidApk`, `publishVersionJson` e o bloco `androidApps` do fluxo principal.
O publish deixa de compilar Android — ganha ~4 min por rodada.

O que era do **Vendas** vira `npm run apk` (`scripts/ops/apk-vendas.js`), reaproveitando as
funções acima **movidas, não reescritas**: build → APK no VPS → `version-vendas.json` → a
mesma cobrança alta se o manifesto não responder (a lição de 19/08 fica).

## 5. Arquivos

| Arquivo | O quê |
|---|---|
| `scripts/ops/play-publish.js` | o comando inteiro (novo) |
| `scripts/ops/lib/play-api.js` | JWT da conta de serviço + chamadas v3 (novo) |
| `scripts/ops/apk-vendas.js` | o canal do Vendas (movido do deploy) |
| `scripts/ops/deploy-vps.js` | perde o Android |
| `package.json` | `"play"`, `"play:dry"`, `"apk"` |
| `.gitignore` | `secrets/` |
| `docs/Rules/ANDROID-PLAY.md` | §11 nova: os dois canais e o comando |

**Zero dependência nova**: o JWT RS256 sai do `crypto` nativo e as chamadas do `fetch` do Node
— a raiz do repo não tem `dependencies` hoje e continua sem.

## 6. Riscos e travas

| Risco | Trava |
|---|---|
| Subir para produção sem querer | `production` exige duas flags explícitas |
| Número queimado | pergunta à Play antes de compilar (§2.2) |
| Auto-update voltar por descuido | portão que varre o dex (§2.1) |
| Maquete na loja (casca sem ponte) | `casca-conferir` + `ponte-conferir` no portão |
| APK errado no aparelho do dono | confere o `certificateSha256Hash` antes de instalar |
| Chave JSON vazar | `secrets/` no `.gitignore`; nunca em log; o script imprime só o e-mail da conta |
| Play ainda processando o bundle | poll com teto; se estourar, entrega o `-upload.apk` e diz por quê |

## 7. Verificação (portões deste PR)

- `npm run play:dry` → resolve versão, valida credencial e portões, **não sobe nada**.
- 1º `npm run play` real → faixa **interna** → conferir no Console e instalar o `-play.apk` no
  g15 por cima, **sem desinstalar** (é a prova de que §2.6 funciona).
- `npm run new` depois → tem que terminar **sem compilar Android nenhum**.
- `npm run apk` → APK do Vendas no site + `version-vendas.json` respondendo 200.

## 8. Ordem de execução

1. `play-api.js` + `play-publish.js` com `--dry-run` (roda sem a chave, só valida o que dá)
2. Dono cria a conta de serviço (§3) — pode ser em paralelo
3. 1º envio real para a faixa interna + baixar o `-play.apk`
4. Tirar o Android do publish + `npm run apk` do Vendas
5. Documentar no `ANDROID-PLAY.md` §11
