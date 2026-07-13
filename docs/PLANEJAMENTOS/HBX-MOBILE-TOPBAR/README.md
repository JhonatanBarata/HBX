# HBX Mobile — topbar, vínculo e ponte operacional

## Entregue

### Interface web

- remove o botão flutuante **Aplicativo móvel** de Configurações;
- adiciona o ícone de celular à barra superior, antes do avatar;
- diferencia aparelho não vinculado, vinculado offline, online e erro;
- usa a cor do tema quando o aparelho está online;
- adiciona download do APK e intenção de vínculo na página de login;
- após **Entrar e vincular**, login por senha ou Google abre `/configuracoes/aplicativo`;
- permite escolher no popover:
  - **Ligações → Celular** ou neste dispositivo;
  - **WhatsApp pessoal → Celular** ou direto no computador;
- mostra as cinco ações móveis mais recentes, com resultado e duração aproximada.

### Ponte web → celular

Ao clicar no telefone de um lead no desktop, com **Ligações → Celular**:

1. o frontend cria uma ação em `POST /mobile/actions`;
2. o backend salva a ação e tenta enviar push FCM;
3. sem Firebase/token, a ação permanece na fila e é recebida quando o APK volta ao primeiro plano;
4. o APK mostra **Ligar para [lead]**;
5. ao tocar, abre `ACTION_DIAL` com o número preenchido;
6. quando a pessoa volta ao HBX, o app calcula o tempo aproximado fora do aplicativo;
7. pergunta o resultado: atendeu, não atendeu, retornar ou sem interesse;
8. eventos, duração e resultado ficam no histórico da ação.

Ao clicar no WhatsApp, com **WhatsApp pessoal → Celular**:

1. o HBX envia número, nome do lead e mensagem preparada;
2. o APK abre WhatsApp normal ou Business no número informado;
3. a mensagem entra preenchida;
4. a pessoa ainda confirma o envio dentro do WhatsApp;
5. ao voltar, informa se enviou, não enviou ou se precisa retornar.

O HBX **não envia mensagem silenciosamente pelo WhatsApp pessoal** e **não assume ser o discador padrão**. A duração registrada é estimada entre a abertura do app externo e o retorno ao HBX, não a duração oficial da operadora.

## Endpoints

### Web autenticada

```http
POST /mobile/actions
GET  /mobile/actions/history?take=20&leadId=OPCIONAL
```

Exemplo:

```json
{
  "kind": "call",
  "phone": "5519999999999",
  "leadId": "opcional",
  "contactName": "Oficina Silva"
}
```

WhatsApp:

```json
{
  "kind": "whatsapp",
  "phone": "5519999999999",
  "contactName": "Oficina Silva",
  "message": "Olá, tudo bem? Preparei uma proposta para sua empresa."
}
```

### Credencial do aparelho

```http
POST /mobile/devices/heartbeat
POST /mobile/actions/register-push
POST /mobile/actions/pull
POST /mobile/actions/:actionId/event
```

O APK envia `deviceToken` e `installationId`; o backend nunca confia em `deviceId` informado pelo cliente.

## Banco de dados

Aplicar antes de subir backend/frontend:

```text
backend/prisma/migrations/20260713213000_mobile_action_bridge/migration.sql
```

A migration:

- adiciona token FCM e versão do APK em `MobileDevice`;
- cria `MobileAction`;
- cria `MobileActionEvent`;
- adiciona índices por empresa, usuário, aparelho, lead e data.

## Download do APK

Frontend:

```env
NEXT_PUBLIC_ANDROID_APK_URL=https://www.hbxsystem.com.br/download/android
```

Use uma URL estável que redirecione para o APK atual. Como a variável é `NEXT_PUBLIC_*`, trocar seu valor exige novo build do frontend; trocar apenas o destino do redirecionamento não exige.

## Firebase Cloud Messaging

Push é opcional para o funcionamento básico: sem ele, a fila é puxada a cada 30 segundos enquanto o APK está aberto. Para receber com o aplicativo em segundo plano, configurar Firebase.

### Backend/VPS

```env
HBX_FIREBASE_PROJECT_ID=seu-project-id
HBX_FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

`HBX_FIREBASE_SERVICE_ACCOUNT_JSON` deve permanecer somente no backend. Nunca colocar a chave privada dentro do APK ou do frontend.

### Build Android

Em `~/.gradle/gradle.properties`, CI secret ou argumentos `-P`:

```properties
hbxFirebaseProjectId=seu-project-id
hbxFirebaseApplicationId=1:000000000000:android:0000000000000000
hbxFirebaseApiKey=AIza...
hbxFirebaseSenderId=000000000000
```

Esses dados identificam o app Firebase e não incluem a chave privada da service account.

O Android inicializa Firebase programaticamente; não é necessário versionar `google-services.json`.

## Comportamento do APK 1.2.0

- `versionCode = 5`;
- solicita permissão de notificações uma vez após o vínculo;
- registra/renova token FCM;
- envia heartbeat e consulta fila a cada 30 segundos somente em primeiro plano;
- para o polling quando o aplicativo vai para segundo plano;
- recebe push data-only em `HbxFirebaseMessagingService`;
- cria notificação com `PendingIntent` para `MobileActionActivity`;
- abre discador ou WhatsApp;
- detecta o retorno ao HBX;
- registra duração aproximada e resultado.

## Testes para o Codex

### Frontend

```bash
cd frontend
npm ci
npm run lint
npm run build
```

Validar:

- bloco **HBX no celular** no login;
- download usando `NEXT_PUBLIC_ANDROID_APK_URL`;
- vínculo após senha e Google;
- ícone antes do avatar;
- estados sem aparelho, offline, online e erro;
- preferências de ligação e WhatsApp;
- clique em telefone no desktop gera ação e não abre `tel:` local quando modo celular;
- falha de API cai no comportamento local;
- histórico recente aparece no popover.

### Backend

```bash
cd backend
npm ci
npx prisma validate
npm run build
npm test -- --runInBand
```

Aplicar a migration em banco descartável e validar:

- isolamento por `companyId` e `userId`;
- aparelho revogado não puxa ações nem registra eventos;
- código/token de outro aparelho falha;
- ação sem push permanece na fila;
- push enviado muda para `notified`;
- pull muda para `delivered`;
- retorno e conclusão gravam duração/resultado;
- histórico não expõe ação de outro usuário ou tenant;
- nomes reais das tabelas/colunas usados no SQL raw;
- serialização do array em `ANY($1::text[])`; se o driver Prisma/Postgres atual não aceitar, trocar por `Prisma.join(ids)` em `IN (...)`.

### Android

```bash
cd EntregaShell
./gradlew :app:assembleDebug
```

Validar em aparelho real:

1. vincular o APK;
2. conceder notificações;
3. confirmar ícone online no HBX web;
4. clicar em telefone no desktop;
5. abrir notificação e discador;
6. voltar e marcar resultado;
7. confirmar duração aproximada no histórico;
8. repetir com WhatsApp normal e Business;
9. remover Firebase e confirmar fallback por fila com o app aberto;
10. revogar aparelho e confirmar bloqueio imediato.

## Fora deste PR

- enviar mensagem automaticamente pelo WhatsApp pessoal;
- ler mensagens privadas do WhatsApp pessoal;
- duração oficial da chamada da operadora;
- tornar o HBX o aplicativo de telefone padrão;
- publicação na Play Store.
