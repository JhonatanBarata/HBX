# Regras — GOOGLE PLAY E DISTRIBUIÇÃO ANDROID

> Publicação do `EntregaShell` na Google Play, permissões sensíveis, alvo de API e
> verificação de desenvolvedor. **Fonte apurada em 20/08/2026** contra
> `support.google.com/googleplay/android-developer` e `developer.android.com`.
>
> 🔴 **LEIA ISTO ANTES DE PESQUISAR DE NOVO.** Este arquivo existe porque a
> pesquisa custou ~5M de tokens em 50 agentes lendo a MESMA documentação fatiada
> em perguntas. Regra de Play muda 1–2× por ano: confira a data de cada seção,
> atualize o que venceu, e **não refaça a varredura**. Ver §9.

---

## 0. A DECISÃO QUE MANDA EM TUDO (20/08/2026)

**O HBX Logística existe SÓ na Google Play.** Ordem do dono. O canal de APK no
site morreu para este app — e a decisão apagou trabalho em vez de criar:

- O auto-update inteiro virou código morto e foi **DELETADO** (o Vendas nunca se
  auto-atualizou). Saíram juntos: `REQUEST_INSTALL_PACKAGES` dos DOIS APKs, o
  `PackageInstaller`, o `AppAtualizadoReceiver`, os 3 `@JavascriptInterface` de
  update e a entrada `updates/` do `file_paths.xml`.
- Não existe divisão de canal para manter: **o canal é o flavor**. `HBX_PLAY` é
  ligado no flavor `logistica` e só nele.
- A verificação de desenvolvedor de 30/09 deixa de ameaçar o Logística (a Play
  registra sozinha). ⚠️ **O Vendas continua fora da Play e continua precisando
  do registro manual** no Android Developer Console.
- O checkout do Mercado Pago saiu do sourceSet do logística e virou pasta neutra
  (`app/src/checkout-mp/`), injetada só no Vendas.

**A série de versão zerou: `versionCode=1`, `versionName=1.0.0`.**
⚠️ O celular do André tem o 352 e o Android **não atualiza para versionCode
menor** — ele precisa DESINSTALAR e instalar pela Play. Desinstalar apaga o
pareamento e o `hbx_operational.db`: **confirmar por telefone que não há entrega
pendente sem sincronizar** antes de mandar desinstalar.

🔴 **O PREÇO, e é o único:** a casca inteira (`mock.js` + `ponte.js`) viaja
DENTRO do binário. Sem auto-update, todo ajuste de tela espera a revisão da Play —
hoje isso levava minutos. A saída legítima existe e a política do Google a abre
expressamente (JavaScript em WebView é a exceção da regra de auto-atualização):
**servir a casca do VPS** devolve a correção em minutos sem violar nada. É a
frente que vale abrir depois de publicado.

**Estado do artefato em 20/08/2026** (medido com `aapt2 dump badging`, não no olho):
`br.com.hbxsystem.logistica` · versionCode 1 · versionName 1.0.0 · targetSdk 36 ·
13 permissões, nenhuma restrita · zero bytes de checkout no `.aab` (3,9 MB) ·
zero digitais do updater no dex. Portões: 25/25 verdes.
**⬜ Falta a prova no g15 — nesta casa a régua é a foto, não o build verde.**

### 0.1 A MIGRAÇÃO DOS APARELHOS ANTIGOS — decidido, ⬜ não construído

Pedido do dono em 20/08: **todo celular que ainda rodar o APK antigo é avisado
para baixar da Play.**

**O que a Google já faz sozinha:** ao criar o app, o Console avisa que o binário
recebe *proteção automática* — "uma verificação do instalador será adicionada ao
código do app. Se os usuários instalarem o app protegido em outra fonte, eles vão
receber uma solicitação para fazer o download dele no Google Play".
⚠️ **Isso NÃO cobre o caso do HBX.** A proteção viaja dentro do binário *novo*; o
aparelho do André tem o 352, assinado com outra chave e sem essa verificação. Só
o servidor alcança quem já está instalado.

**🔴 POR QUE ISTO NÃO PODE SER FEITO AGORA:** durante o teste fechado o app **não
é público** — a página da Play só responde para quem está na faixa. Um aviso
apontando para um link morto é pior que aviso nenhum. **Vai ao ar depois da
produção**, e não antes.

**Por onde entra, quando entrar:** pelo canal de RECADOS que o app antigo já tem
(`carregarRecados()`). Não precisa — e não pode — de tela nova: a casca inteira
viaja dentro do binário, então qualquer tela nova exigiria trocar o APK, que é
exatamente o que não dá para fazer nesses aparelhos.

**São DUAS mensagens, para dois públicos.** O texto que o dono propôs
("ESTAMOS OFICIALIZANDO O HBX, AJUDE-NOS?") pede favor sem dizer a ação — serve
para um público, não para o outro:

| Público | Mensagem |
|---|---|
| **Motorista** (quer entregar, não quer ajudar ninguém) | **"O HBX agora está na Google Play."** / "Baixe por lá para continuar recebendo as atualizações." + botão *Abrir na Play Store* |
| **Dono de distribuidora** (aí o pedido é real, e recruta testador) | **"Estamos oficializando o HBX na Google Play. Nos ajuda?"** / "Precisamos de gente testando por 14 dias antes do lançamento." |

⚠️ **Na ligação, antes de mandar desinstalar:** confirmar que não há entrega
pendente sem sincronizar. Desinstalar apaga o pareamento e o `hbx_operational.db`.

**Política:** nenhum problema. A proibição do Google é a inversa (app da loja
mandando pagar/baixar fora); do sideload para a loja é o mesmo movimento que a
proteção automática dela faz.

---

## 1. Os dois relógios (datas duras)

| Data | O que acontece | Status HBX |
|---|---|---|
| **31/08/2026** | App novo **e toda atualização** passam a exigir `targetSdk = 36` (Android 16). Extensão possível até 01/11/2026, caso a caso. | ✅ **feito 20/08** — build verde. ⬜ falta prova no g15 |
| **30/09/2026** | **Brasil** entra na 1ª fase da *Android Developer Verification*, junto de Indonésia, Singapura e Tailândia. Em aparelho certificado, app de desenvolvedor não verificado **para de instalar pelo caminho normal**. | ⬜ nada registrado |
| 2027 | Verificação de desenvolvedor vira global. | — |

**Por que a 2ª data importa mais do que parece:** o modelo atual do HBX é APK
baixado de `hbxsystem.com.br/downloads/`. Depois de 30/09 esse APK só instala em
celular novo de cliente se o desenvolvedor estiver verificado e o **package name +
chave de assinatura** estiverem registrados no **Android Developer Console**
(`android.google.com/developerconsole`). Sobra ADB e o "fluxo avançado" — nenhum
dos dois se pede a motorista.

- Quem publica pela Play tem o app registrado automaticamente ("Google Play
  automatically registers 99% of apps").
- **`br.com.hbxsystem` (Vendas) não vai à Play** → depende 100% do registro
  manual. Mesmo prazo. Não esquecer.

---

## 2. Conta pessoal: teste fechado obrigatório

Vale para conta pessoal criada **depois de 13/11/2023**. Sem exceção.

- **12 testadores** (eram 20 até 11/12/2024), **14 dias consecutivos** cada.
- Texto oficial (`answer/14151465`): *"At least 12 testers must be opted in to your
  closed test when you apply for production access, and they must have been opted
  in continuously for the preceding 14 days."*
- **É janela deslizante, não contador que zera.** A avaliação é no instante do
  pedido, olhando 14 dias para trás, e o relógio é **por testador**. Perder 1 no
  dia 7 não zera os outros 11. Dá para adicionar gente no meio.
  ⚠️ Quase todo blog que diz "reseta pra zero" é empresa que **vende** pacote de
  testador. Não pagar por isso.
- **Teste INTERNO não conta.** Tem que ser *Closed testing*.
- O **link de opt-in só existe com o app "Published"** na faixa. Em Draft/Pending
  o link não aparece — não é bug do Console.
- Limites: 200 listas/conta, 2.000 e-mails/lista, 50 listas/faixa. Grupo do Google
  (`nome@googlegroups.com`) é melhor que lista solta: administra-se fora da faixa.
- Formulário de acesso à produção tem 3 seções (teste / app / prontidão) e a
  pergunta que mais pesa é **como recrutou**. Análise em até 7 dias.
- ⚠️ **Escrever o diário DURANTE os 14 dias.** Feedback nomeado ("o André reclamou
  do alarme atrasar com a tela apagada, ajustamos X") passa; "feedback positivo"
  reprova.

### 2.1 Como o testador RECEBE o app (a dúvida que sempre volta)

**O e-mail não é endereço de entrega, é CHAVE.** Ninguém recebe APK por e-mail, e a
Google **não avisa ninguém**. O e-mail só destranca a ficha da Play para aquela conta.

Fluxo real: lista/grupo no Console -> Console gera o link de opt-in
(`play.google.com/apps/testing/br.com.hbxsystem.logistica`) -> **o dono** manda o link
(WhatsApp) -> a pessoa clica em *Tornar-se um testador* -> o HBX aparece na Play Store
dela e instala como qualquer app, com atualização automática.

- 🔴 **Tem que ser a conta Google LOGADA NA PLAY STORE DO CELULAR**, não o e-mail de
  trabalho. E-mail errado = o link abre e diz que o app não existe, **sem explicar**.
  Instrução a mandar: *"abre a Play Store, toca na sua foto no canto; o e-mail do topo
  é esse"*.
- 🔴 **O relógio de 14 dias começa no CLIQUE, nao no cadastro.** Botar 12 e-mails na
  lista não conta nada. Relógio por pessoa -> juntar todo mundo e fazer clicar **no
  mesmo dia**, senão o 12º atrasa o pedido inteiro.
- **Testador não precisa ser cliente.** O botão *Conectar com Google Play* da
  `PairingActivity.kt:489` **cria a conta na hora** — qualquer pessoa com Android entra
  e vê o app funcionando. Logo o pool é cunhado/vizinho/amigo, não só distribuidora.
  Isso resolve o "eu só tenho o André".
- Grupo do Google > lista solta: administra-se fora da faixa de teste.

---

## 3. Bloqueadores de política que o HBX tem hoje

### 3.1 Auto-update de APK — RESOLVIDO POR DELECAO em 20/08/2026
> *"Os apps distribuídos pelo Google Play só podem ser modificados, substituídos ou
> atualizados pelo mecanismo de atualização do Google Play."* — Uso Indevido de
> Dispositivo e Rede

- **Exceção que nos salva:** *"não se aplica a códigos executados em máquinas
  virtuais ou intérpretes (como o JavaScript em um WebView)"*. A casca e a ponte
  continuam podendo se atualizar do servidor. **Só o `.apk` não pode.**
- `REQUEST_INSTALL_PACKAGES` também é restrita por conta própria: só para app cujo
  **núcleo** é instalar apps. *"may not be used to perform self updates."*
- É a **única** violação da lista com risco de suspensão de conta, não só recusa.
- Onde mora: `AndroidManifest.xml:28-29` · `NativeAppBridge.kt:839-1005`
  (`USER_ACTION_NOT_REQUIRED` = instalação silenciosa) · `AppAtualizadoReceiver.kt`
  · `ponte-src/00-nucleo.js:153-349` · `res/xml/file_paths.xml:5`.
- ⚠️ O JS faz feature-detect `typeof b.downloadAndInstall === 'function'`. No canal
  Play os métodos precisam **NÃO EXISTIR** — stub devolvendo `false` reacende o
  portão sem instalar nada.

### 3.2 Recarga / compra dentro do app — RESOLVIDO em 20/08/2026
- Crédito HBX é **bem digital consumido dentro do app** (rota debita ao iniciar,
  lead do prospector custa 1) → exigiria Play Billing e proíbe Mercado Pago.
- **A saída é ser `consumption-only`:** *"Google Play allows any app to be
  consumption-only, even if it is part of a paid service."* Zero compra dentro do
  app, e **nenhum link/botão/CTA** que leve a pagar fora. Só texto informativo.
- ⚠️ **Não existe isenção genérica de "B2B/SaaS"** no texto da política — procurei.
  As isenções são bem físico, serviço físico, P2P, leilão, doação, aposta e conta
  de crédito/utilidade. Software em nuvem vendido dentro do app **entra** no Play
  Billing.
- ⚠️ Link-out (EUA/Reino Unido/EEE) **não cobre o Brasil**.
- **É isento e FICA:** recebimento na porta (Dinheiro/Pix/Cartão/Marcar) — é
  anotação de pagamento de mercadoria física, sem gateway. Chip "N créditos hoje"
  e trava "Créditos insuficientes" também ficam (saldo/consumo, não oferta) — mas
  precisam dizer o que fazer, senão vira beco sem saída (*Broken Functionality*).
- Onde mora: `RechargeCheckoutActivity.kt` · `NativeAppBridge.kt:534-540` (único
  verbo de dinheiro **sem gate de flavor**) · `NativeApiClient.kt:321-327,421` ·
  `src/logistica/assets/checkout/` (empacotado no release do **logística**, não só
  do vendas) · `90-ajustes-financeiro.js:231-254`.

### 3.3 `USE_EXACT_ALARM` — RESOLVIDO em 20/08/2026
- Restrita a app que **É** despertador, timer ou calendário. App de rota que *tem*
  um alarme não entra. O Console barra o upload.
- **Trocar por `SCHEDULE_EXACT_ALARM`** sem `maxSdkVersion` — é a alternativa que a
  própria política aponta e **não exige formulário**. Pedir ao usuário na tela onde
  ele marca a missão, nunca na abertura.
- O fallback já existe: `MissaoAlarme.kt:120-134` (janela 5 min) e
  `PasseioAlarme.kt:43-53` (10 min).
- ⚠️ O comentário do manifesto justifica a permissão com *"app distribuído fora da
  Play"* — essa frase morre no dia do upload. Reescrever.

### 3.4 `USE_FULL_SCREEN_INTENT`
- Desde 22/01/2025, pré-concedida só a app cujo core é chamada ou alarme.
- **Declaração obrigatória no Console.** Responder honestamente que não é o core —
  declarar "sou app de alarme" é caminho curto para suspensão por declaração falsa.
- Falta implementar o caminho de permissão negada (`canUseFullScreenIntent()` →
  `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`).

### 3.5 Artefato — RESOLVIDO em 20/08/2026
- Play só aceita **`.aab`** para app novo desde ago/2021.
- Task certa: **`:app:bundleLogisticaRelease`** (provada por dry-run) →
  `app/build/outputs/bundle/logisticaRelease/`.
- `deploy-vps.js:585` só faz `assemble*`. **Não colocar a Play dentro do
  `npm run publish`** — misturar canais é como o versionCode se perde.

---

## 4. Permissões — veredito item a item

| Permissão | Veredito |
|---|---|
| `REQUEST_INSTALL_PACKAGES` | ⛔ sai do binário da Play (§3.1) |
| `USE_EXACT_ALARM` | ⛔ trocar por `SCHEDULE_EXACT_ALARM` (§3.3) |
| `USE_FULL_SCREEN_INTENT` | ⚠️ declaração no Console + caminho de negação |
| `FOREGROUND_SERVICE_LOCATION` | ⚠️ declaração **com link de vídeo obrigatório**; caso de uso *"Background Location Updates: Navigation"* |
| `ACCESS_FINE/COARSE_LOCATION` | ✅ primeiro plano, pedida no toque, com aviso antes do diálogo do sistema |
| `ACCESS_BACKGROUND_LOCATION` | ✅ **NÃO declarada** — e não adicionar "por garantia". Some o formulário mais reprovado da Play |
| `RECORD_AUDIO` | ✅ ditado na busca, on-device preferencial, sem formulário |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `POST_NOTIFICATIONS`, `VIBRATE` | ✅ limpos |
| `<queries>` com pacotes nomeados | ✅ certo. **`QUERY_ALL_PACKAGES` não é declarada** |

⚠️ **Geofencing deixou de ser caso de uso aceito para FGS `location` em 26/08/2026.**
Se um dia houver geofence à mão com FGS, migrar para a Geofence API antes de enviar.

---

## 5. Assinatura, versão e identidade — decisões sem volta

- **Play App Signing é obrigatório.** Se a Google gerar chave nova, o APK da loja
  tem certificado diferente do APK do site → **Android recusa atualizar**. O
  motorista teria que desinstalar, e desinstalar apaga `DeviceCredentialStore`
  (pareamento) e `OperationalStore` (SQLite com entregas pendentes).
  → **Subir o `hbx-upload.jks` como app signing key** (ferramenta PEPK) e criar uma
  upload key separada. Backup fora da máquina: chave perdida = app perdido.
- ✅ **ERRADO — CORRIGIDO EM 20/08/2026, MEDINDO NO g15.** Eu tinha escrito aqui
  que a re-assinatura da Play quebraria o "Entrar com o Google" porque o
  `google-services.json` está com `oauth_client: []` vazio. **Não quebra, e o
  campo vazio é irrelevante** — o app nunca o lê. `PairingActivity.kt:139` usa
  `GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID)`, ou seja
  **Credential Manager com Web client ID**, que não é vinculado à assinatura do
  APK (quem valida é o backend, contra o `aud` do token). O caminho legado
  `GoogleSignInClient`, esse sim exigiria cliente OAuth Android com o SHA-1 — e
  este app não o usa. Provado: instalação limpa do APK 1.0.0 no g15, login
  completo, app dentro. Conferência final continua barata: repetir o login no
  artefato re-assinado da faixa de teste.
  SHA-1 da chave de upload (`CN=HBX System`), para quando precisar:
  `B4:21:95:11:95:BB:20:C3:F1:86:41:CE:39:3A:7E:AF:27:7A:9C:02`.
- **versionCode na Play é estritamente crescente e GASTA o número para sempre** —
  inclusive em teste interno, inclusive se a release for descartada.
  ⚠️ `resolveAndroidVersion()` (`deploy-vps.js:456-466`) **mantém** o número quando
  a digital não muda — comportamento incompatível com a Play.
  → **Decisão do dono, 20/08: começa em `1` / `1.0.0`.** Na Play o histórico do
  sideload não existe, então 1 é legítimo. ⚠️ **Custo medido no g15:** com 351
  instalado, `adb install -r -d` do 1 falha com `INSTALL_FAILED_VERSION_DOWNGRADE`
  — e o `-d` **não** vence em app de release. Todo aparelho com sideload antigo
  precisa **desinstalar** antes (apaga pareamento e `hbx_operational.db`). Antes de
  mandar o André desinstalar, confirmar que não há entrega por sincronizar.
- **`versionName` é texto visível ao usuário.** Está `alpha1`. Trocar para `1.0.0`
  antes do 1º upload — a Google avalia *production readiness*.
- **`applicationId` é permanente e irreversível** na Play. Mesmo apagando o app, o
  nome fica queimado para sempre.
- **Conta pessoal:** documento oficial com foto; **nome legal e e-mail ficam
  públicos** na ficha. Verificação leva dias e trava tudo em silêncio — começar
  cedo. Logística **não** está nas categorias que obrigam conta de organização
  (financeiro, saúde, VPN, governo).

---

## 5.1 ✅ O LOGIN COM GOOGLE E A RE-ASSINATURA — RESOLVIDO EM 21/08/2026

**Não era propagação. Era a SHA-1 errada, e esperar 15 horas nunca ia consertar.**

Medido em 21/08 no g15, puxando o APK que a Play instalou
(`adb pull $(pm path …)/base.apk`) e lendo o certificado com
`apksigner verify --print-certs` — fonte da verdade, não o que o Console exibe:

| Chave | SHA-1 | SHA-256 |
|---|---|---|
| **APK instalado pela Play** (`installer=com.android.vending`) | **`DF:CB:94:8D:3C:5C:17:F7:28:E2:B4:0A:3A:94:44:E4:64:E2:CD:5E`** | `26:C9:F3:B6:A7:42:97:E4…` |
| Upload (`hbx-upload.jks`, alias `hbx-upload`) | `B4:21:95:11:95:BB:20:C3:F1:86:41:CE:39:3A:7E:AF:27:7A:9C:02` | `58:D8:5C:2D:E5:F8:DA:35…` |
| ❌ Registrada no cliente OAuth Android em 20/08 | `65:E1:BB:17:12:4C:84:86:F7:40:BC:32:76:17:73:FF:42:54:5C:93` | — |

As duas SHA-256 batem com as anotadas em 20/08, então o binário medido **é** o da
Play. E duas impressões do MESMO certificado não podem divergir: `65:E1:BB…` não é
a chave da Play nem a de upload. **Foi copiada do botão errado** — a página
*Proteger a chave de assinatura do app* mostra várias, e as da Google ficam atrás
da aba **Chave clássica**, em botões que copiam sem exibir.

**A CORREÇÃO** (Google Cloud Console → APIs e Serviços → Credenciais, projeto do
Web client `959050454992-6pcir0…`):
1. Editar o cliente **OAuth Android** de `br.com.hbxsystem.logistica` e trocar a
   impressão para `DF:CB:94:8D:3C:5C:17:F7:28:E2:B4:0A:3A:94:44:E4:64:E2:CD:5E`.
2. Criar um **SEGUNDO** cliente Android, mesmo pacote, com `B4:21:95:11:…` — um
   cliente aceita UMA SHA-1 só, e sem esse segundo o `assembleLogisticaRelease`
   local para de entrar assim que o primeiro for corrigido.

⚠️ **`EntregaShell/app/google-services.json` não tem NENHUM `oauth_client`** para os
dois pacotes: foi baixado antes de os clientes existirem. Baixar de novo depois da
correção é o jeito barato de CONFERIR o registro sem abrir o Console.

### ✅ E o defeito que fez isso custar 15 horas (corrigido em 21/08)

`PairingActivity.startGoogleSignIn()` tinha `catch (_: GetCredentialCancellationException)
{ setBusy(false) }` — **ramo mudo**. Com registro errado o GMS não devolve erro de
assinatura: ele **CANCELA**. Então "o usuário fechou a folha" e "o app foi barrado
por SHA-1 errada" chegavam pelo mesmo caminho, sem mensagem na tela e **sem uma
linha no logcat** — e a hipótese que sobrou foi "deve ser propagação".
Agora os três `catch` logam em `HBXLogin` (`adb logcat -s HBXLogin`), o genérico
imprime `GetCredentialException.type` (o `message` do Credential Manager é quase
sempre nulo) e o de cancelamento aponta o cliente OAuth como suspeito.
**Nunca apagar esse `Log.w`.** Build verde: `:app:compileLogisticaReleaseKotlin`.
⚠️ O log novo só existe no PRÓXIMO upload — o binário que está na Play é o mudo.

---

## 5.1.1 O histórico da investigação (20/08/2026)

**Eu escrevi as duas coisas opostas hoje. A verdade medida está aqui.**

| Binário | Assinatura | Login com Google |
|---|---|---|
| APK local `assembleLogisticaRelease` | `hbx-upload.jks` (`58:D8:5C:…`) | ✅ entrou, app dentro |
| Instalado **pela Play** (teste interno) | chave da Google (`26:C9:F3:…` SHA-256) | ❌ falha |

Sintoma: a folha abre e resolve o nome certo (*"para continuar no app HBX Logística"*),
tocar na conta roda `GoogleSignIn_flowRunner` e `AccountReauth_flowRunner` (ambos
"completed"), depois a `CredentialSelectorActivity` fica no topo **sem desenhar nada** e
o app volta à `PairingActivity` **sem mensagem** — o ramo de *cancelamento*, não o de erro.
**Falha igual nas DUAS contas do aparelho** → não é estado de conta.

- ⚠️ **NÃO repetir a afirmação de que Credential Manager com Web client ID ignora a
  assinatura do APK.** Eu afirmei isso com base em arquitetura e a medição contradisse.
- O app usa `GetSignInWithGoogleOption(BuildConfig.GOOGLE_WEB_CLIENT_ID)` =
  `959050454992-6pcir0…` (cliente Web **HBX System**). Isso não muda.
- Cliente OAuth Android criado 20/08 às ~16:55 com o pacote e o que se ACREDITAVA ser
  a SHA-1 da chave de assinatura da Play: `65:E1:BB:17:12:4C:84:86:F7:40:BC:32:76:17:73:FF:42:54:5C:93`.
  🔴 **ERRADO — medido em 21/08: a chave da Play é `DF:CB:94:8D:…`** (ver §5.1). A
  espera por "propagação" durou 15 h e não podia dar em nada: propagação não conserta
  impressão trocada. **Lição: fingerprint se mede no artefato** (`apksigner
  verify --print-certs` no APK puxado do aparelho), nunca se copia de botão de painel.
- Onde acham-se as impressões: Play Console → Protegido com o Google Play → Proteção da
  Google Play Store → **Proteger a chave de assinatura do app**. As da chave da Google
  ficam atrás da aba **"Chave clássica"**, em botões que **copiam** em vez de exibir.
  Atalho: o **JSON do Digital Asset Links** no rodapé da mesma página já mostra a SHA-256
  da chave de assinatura, sem clicar em nada.
- ⚠️ Se não resolver: a porta do revisor é **única** (Google ou código de 6 min que
  expira). Plano B seria um caminho de acesso próprio pra análise.

---
## 6. Subir para API 36 — o que quebra neste app

**✅ LOTE FEITO EM 20/08/2026** — build verde nos dois flavors, `targetSdkVersion="36"`
provado no manifesto mesclado.

### 6.1 ✅ PROVA NO g15 — 20/08/2026 12:12–12:22 (moto g15, ZF5255SMWF)

Instalação **limpa** do `app-logistica-release.apk` (`versionCode 1`, `versionName
1.0.0`, `targetSdk 36`), que é o caminho do revisor e de todo testador.

| O que | Resultado |
|---|---|
| Boot pelo ícone → `OpeningActivity` → `PairingActivity` | ✅ sem crash |
| Edge-to-edge (pareamento, ajustes, mapa) | ✅ fundo passa sob as barras, conteúdo não é encoberto |
| **Entrar com o Google** | ✅ folha abriu como *"continuar no app HBX Logística"*, login completo, app dentro |
| Diálogo de localização | ✅ **sem "Permitir o tempo todo"** — prova no aparelho de que não há background location |
| Mapa e Montagem de rota com dado real (bancada 51) | ✅ renderiza, insets certos |
| Linha "Versão" → toque | ✅ *"As atualizações chegam pela Google Play, automaticamente."* |
| Reinstalação por cima (`-r`) | ✅ pareamento sobreviveu, entrou direto |

**⚠️ O QUE ESTA PROVA NÃO PROVA:** o g15 roda **Android 15 / API 35**. Ela prova
que o binário `targetSdk 36` **roda** e que o edge-to-edge está certo (o Android 15
já o exige para targetSdk ≥ 35). **Não** prova nada exclusivo do Android 16 — cota
de `JobScheduler` junto de serviço em primeiro plano, e o descarte de
`screenOrientation` em tela ≥ 600dp. Este último não alcança telefone (o g15 tem
432dp), só tablet/dobrável — por isso o `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY`.

#### ✅ Modo dirigir e serviço em primeiro plano — provado 12:27–12:30

Rota de 3 paradas montada na bancada e iniciada. `dumpsys activity services`:

```
isForeground=true  foregroundId=1001  types=0x00000008
foregroundNoti=Notification(channel=rota_status flags=ONGOING_EVENT|FOREGROUND_SERVICE)
```

`0x00000008` = `FOREGROUND_SERVICE_TYPE_LOCATION` — exatamente o tipo declarado no
manifesto (`RotaService`). Notificação **"Rota em andamento · 3 paradas"** persiste
com o app em segundo plano, e o ícone de localização fica ativo na barra.

- **A tela de dirigir é IMERSIVA** — esconde as barras do sistema. Logo o
  edge-to-edge do Android 15/16 **não a alcança**: era o meu maior receio do API 36
  e ele simplesmente não existe. Instrução de curva, rota, seta com rumo, velocidade,
  ETA e os quatro verbos (Cancelar/Registrar/Finalizar/Panorâmica) todos no lugar.
- ⚠️ A notificação cai na seção **"Silenciosas"** e o ícone pequeno aparece como um
  anel vazio. Não reprova nada, mas num vídeo de análise fica fraca — vale conferir
  o ícone monocromático do canal `rota_status`.

#### ✅ Chegada, entrega e encerramento — provado 12:41–12:44

Fechando o roteiro no mesmo binário: parada → **Folha da venda** (formas de pagamento
dinheiro/Pix/cartão/marcar, resumo do recebimento) → confirmar → **Finalizar** →
**"Dia encerrado · Fechado às 12:43 · 2 paradas ficaram pra amanhã"** com fechamento
de **1 entregue / 1 cliente** → **Sair**, que devolve à `PairingActivity`.
O `RotaService` **parou junto** (0 ocorrências em `dumpsys activity services`) — o
serviço não vaza depois do fim da rota.

**✅ O ROTEIRO INTEIRO ESTÁ PROVADO NO g15** com `versionCode 1` / `targetSdk 36`:
abrir → parear (Google) → montar → dirigir → chegar → entregar → encerrar → sair.

#### O vídeo que o Console exige — e o que ele NÃO exige

**Não precisa dirigir.** O que a declaração de *Foreground service types* pede é o
**vídeo da jornada** que justifica o serviço, não deslocamento. `RotaService.sync()`
sobe com **rota de ≥ 1 parada iniciada** — parado na garagem sobe igual. A sequência
que responde à pergunta do revisor é: iniciar a rota → notificação aparece → **sair
do app / bloquear a tela e a notificação continuar**. Gravação pelo PC, sem câmera:
`adb shell screenrecord --time-limit 40 /sdcard/x.mp4` + `adb pull`.
⚠️ No Git Bash, exportar `MSYS_NO_PATHCONV=1` antes — senão `/sdcard/…` vira caminho
do Windows e o comando morre com *"Must specify output file"*.
⚠️ O link do vídeo tem que ser **público** (YouTube não listado, ou Drive com
"qualquer pessoa com o link"). Link privado reprova a declaração.

#### Dois defeitos achados e corrigidos na própria sessão

1. **A linha "Versão" mentia.** Dizia *"toque para procurar atualização"* num app
   cujo atualizador foi deletado — `checkAppUpdate` volta no primeiro `if` e nada
   é procurado. Agora diz **"atualizações pela Google Play"**, e o tique de 10 min
   não é mais agendado na loja. Fonte: `logistica/ponte-src/00-nucleo.js`
   (**nunca** o `assets/app/ponte.js`, que é gerado — rodar `ponte-costurar`).
   ⚠️ O helper nasceu como `const naLoja = () => …` **depois** da linha que o
   chama: zona morta temporal, `ReferenceError` no boot. Virou função declarada.
2. **Três telas sem trava de orientação.** `NotificationPermissionActivity`
   apareceu **deitada** logo após o login, com o aparelho em retrato. Ela, a
   `ClosingActivity` e a `ChegadaActivity` eram as únicas 3 sem `screenOrientation`
   (assim desde `7308a3d5`, 13/07 — não é regressão do API 36). Chegada deitada é
   defeito de campo. Agora **10 de 10** em `portrait`.

- **Pré-requisito de ferramenta:** compileSdk 36 exige **AGP ≥ 8.9.1** e
  **Gradle ≥ 8.11.1**. ✅ AGP 8.7.3 → 8.9.1, wrapper 8.9 → 8.11.1, numa leva
  SEPARADA e com o SDK ainda em 35 — para que qualquer quebra tivesse um suspeito
  só. Kotlin 1.9.24 **passou sem reclamar**; não precisou do K2.
- **Edge-to-edge sem opt-out.** ⚠️ A auditoria errou aqui: `PairingActivity` **já
  tratava** insets (`PairingActivity.kt:80-84`), e `NotificationPermissionActivity`
  é um `AlertDialog` (o sistema resolve). `Opening` e `Closing` são fundo chapado
  cobrindo a tela — só ficam melhores. Quem realmente tinha controle passível de
  ficar sob a barra de gestos eram **duas**: `MobileActionActivity` (botões
  Ligar/WhatsApp no rodapé) e `RechargeCheckoutActivity` (confirmar do cartão).
  ✅ Lei central em `InsetsDeSistema.kt` (`recuarDasBarrasDoSistema()`), aplicada
  nas duas. Tela nova chama isso na montagem.
  ✅ `statusBarColor`/`navigationBarColor` saíram do `Theme.EntregaShell.Closing` —
  eram no-op em 36, e atributo que não faz nada engana quem for depurar cor depois.
- **`screenOrientation="portrait"` ignorado** em tela ≥ 600 dp (7 activities).
  ✅ `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY` declarada em `<application>`.
  ⚠️ **É dívida com prazo: expira quando o app mirar a API 37.** O conserto
  definitivo é layout adaptativo.
- **Cota nova de JobScheduler** para job rodando junto com FGS — atinge
  `TrackingUploadJobService` e `OperationalUploadJobService` exatamente enquanto o
  motorista dirige. Assinatura do defeito: entrega gravada que nunca sobe, sem erro
  na tela. Instrumentar `getStopReason()` e medir no g15.
- ✅ **Predictive back** já conforme (`onBackPressedDispatcher` nas 7 telas).
- ✅ **16 KB page size** conforme — medido: `p_align = 0x4000` em todos os `PT_LOAD`.
  Reconferir se mexer em `androidx.credentials` ou `firebase-bom`.

---

## 7. Ficha da loja e formulários

🔴 **Os arquivos da ficha vivem em [`docs/play/`](../play/LEIA-ME.md)** — guia campo a
campo da página "Detalhes do app", textos prontos para colar e o gerador das imagens.
⚠️ Em 20/08 a *Cola do Console* listou esses arquivos como prontos quando **nenhum
existia**; foram feitos de verdade em 21/08. Estado de arquivo se confere com `ls`.

| Item | Especificação exata | Status |
|---|---|---|
| Ícone da loja | PNG 32-bit **com** alfa, 512×512, ≤ 1024 KB. O launcher adaptativo **não serve** | ✅ `docs/play/icone-512.png` (45 KB) |
| Feature graphic | JPEG/PNG 24-bit **sem** alfa, 1024×500 | ✅ `docs/play/feature-1024x500.png` (95 KB) |
| Capturas | mín. 2, recomendado 4–8 em 1080×1920. Lado maior ≤ 2× o menor | ✅ 5 em `docs/play/print-*.png` (1080×2160), tiradas do g15 em 21/08 no modo demonstração |
| Nome | ≤ 30 caracteres | ✅ "HBX Logística" (13) |
| Descrição curta / completa | 80 / 4000 caracteres | ✅ 75 e 3.031, em `docs/play/TEXTOS-DA-FICHA.md` |
| Política de privacidade | link no Console **e** dentro do app | ✅ `/politicas` no ar |
| Exclusão de conta | página pública, sem exigir login | ✅ `/excluir-conta` no ar |
| Segurança de dados | localização precisa, identificadores, e-mail/telefone, **Fotos** | ⬜ |
| Classificação IARC | app sem classificação não é permitido | ⬜ |
| Público-alvo | marcar só 18+, declarar sem anúncios | ⬜ |
| App access | credencial de demonstração **funcional** | ✅ botão do Google |

⚠️ **Fotos precisam ser declaradas como compartilhadas.** O cadastro em massa
(`C9-captura-clientes.js` → `POST /logistica/cadastro-em-massa` →
`logistica-cadastro-massa.service.ts:58-113`) manda a imagem como **anexo de e-mail**
para o `ADMIN_SUPPORT_EMAIL`. O arquivo sai do app. E um revisor com conta nova e
zero clientes **cai nessa tela**.

⚠️ A política de privacidade precisa citar a entidade da ficha e mencionar foto —
hoje o CNPJ está `[a preencher]` e câmera não aparece. A Play cruza os dois textos.

### App access — a porta do revisor
O pareamento por código de 6 dígitos **não serve**: gerado em painel logado, uso
único, 10 min de vida. Nenhum número escrito no Console estaria vivo.
→ **Usar o botão "Conectar com Google Play"** (`PairingActivity.kt:489-513`), que
manda idToken para `/mobile/devices/google-pair` e **cadastra empresa + usuário na
hora**. Já publicado. O revisor entra em 2 toques, e como a empresa nasce sem
clientes, o **modo demonstração** (`C8-demonstracao.js`) dispara sozinho.
Melhorias baratas: subir o botão para **antes** do campo de código, e trocar o
rótulo para "Entrar com o Google".

---

## 8. O que NÃO é problema (não gastar energia)

- Localização em segundo plano: não existe no app.
- `showWhenLocked` na MainActivity: **não há regra da Play que proíba** (procurei).
  É risco de privacidade, não de política — mas o canal de alarme está
  `VISIBILITY_PUBLIC`, imprimindo nome e endereço de cliente na tela de bloqueio.
- Grupos recíprocos de testador (Reddit/Telegram): **nenhum caso documentado** de
  conta encerrada especificamente por isso. As histórias de detecção por
  fingerprint de emulador vêm todas de quem vende testador. Ainda assim não é
  preciso — o HBX tem usuários reais.

---

## 9. 🔴 COMO PESQUISAR ISTO DE NOVO (a lei que este arquivo pagou)

Em 20/08/2026 esta pesquisa foi feita com **50 agentes** e ~5M de tokens. O gasto
não foi a pesquisa: foi o **pedágio fixo de existir** (system prompt + schemas +
CLAUDE.md + exploração inicial ≈ 48k por agente) pago 50 vezes, para agentes que
liam **a mesma documentação** fatiada em perguntas diferentes. Vários devolveram
uma linha útil cada.

**Regra: se os agentes leriam a MESMA fonte, é UM agente.**

- Fan-out serve para **território independente** (40 arquivos, 40 subsistemas),
  nunca para uma fonte só fatiada em perguntas.
- Um agente por **FONTE**, não por **PERGUNTA**.
- **Leitura mecânica é Haiku com effort baixo.** Extrair "512×512" de uma página
  não é trabalho de Opus. Opus só na síntese e na decisão.
- Requisitos de Play são 4–5 URLs públicas e estáveis: `WebFetch` direto no loop
  principal resolve em ~40k. Não precisa de agente nenhum.
- **Antes de propor fan-out, dizer o número de agentes e o custo estimado.**
- Atualizar ESTE arquivo em vez de refazer a varredura. Regra de Play muda 1–2×
  por ano — e a data está no topo de cada seção.

---

**Plano de execução completo (lotes, cronograma, decisões do dono):**
artefato *HBX Logística na Play*, 20/08/2026.
