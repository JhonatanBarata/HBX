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
2. o backend no VPS salva a ação na fila do aparelho vinculado;
3. o APK consulta essa fila a cada 30 segundos enquanto está em primeiro plano;
4. ao receber a ação, o APK mostra **Ligar para [lead]**;
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
  "requestId": "9d192d5d-dbc1-41ad-a3ce-752ffc2fe389",
  "kind": "call",
  "phone": "5519999999999",
  "leadId": "opcional",
  "contactName": "Oficina Silva"
}
```

WhatsApp:

```json
{
  "requestId": "12196233-f64b-4b2b-a6a1-fe40ec055d3a",
  "kind": "whatsapp",
  "phone": "5519999999999",
  "contactName": "Oficina Silva",
  "message": "Olá, tudo bem? Preparei uma proposta para sua empresa."
}
```

### Credencial do aparelho

```http
POST /mobile/devices/heartbeat
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

- cria `MobileAction`;
- cria `MobileActionEvent`;
- adiciona índices por empresa, usuário, aparelho, lead e data;
- preserva o histórico quando um usuário é excluído;
- torna criação e eventos idempotentes para suportar retries de rede.

## Download do APK

Frontend:

```env
NEXT_PUBLIC_ANDROID_APK_URL=https://www.hbxsystem.com.br/download/android
```

Use uma URL estável que redirecione para o APK atual. Como a variável é `NEXT_PUBLIC_*`, trocar seu valor exige novo build do frontend; trocar apenas o destino do redirecionamento não exige.

No deploy da Hostinger, a URL assume `https://www.hbxsystem.com.br/download/android` por padrão e é passada ao build Docker do frontend. O APK continua fora do Git e deve ser publicado no destino estável com a assinatura oficial.

Na VPS atual, o Nginx atende essa rota pelo link `/var/www/hbx-downloads/hbx-mobile.apk`. O HBX Logística usa a rota estável `https://www.hbxsystem.com.br/download/android-logistica` e o link `/var/www/hbx-downloads/hbx-logistica.apk`. Cada release deve enviar os APKs com nomes versionados, conferir o SHA-256 remoto e só então atualizar os links; os AABs continuam reservados à Play depois do aceite em aparelho físico.

## Entrega pelo VPS e despertar por FCM

A ação e seu histórico ficam persistidos no PostgreSQL do HBX. O FCM transporta somente um sinal de despertar, sem telefone, mensagem ou dados do lead; ao recebê-lo, o APK consulta `POST /mobile/actions/pull` com a credencial revogável do aparelho. Se o push atrasar ou falhar, a fila continua sendo recuperada na abertura do aplicativo e pelo polling em primeiro plano.

## Comportamento do HBX Vendas 2.0.0

- `versionCode = 8`;
- interface local, empacotada no APK, sem carregar o frontend web do HBX;
- solicita permissão de notificações uma vez após o vínculo;
- recebe o despertar FCM mesmo com a interface fechada e busca a ação no VPS;
- envia heartbeat e mantém o fallback de fila em primeiro plano;
- cria notificação com `PendingIntent` para `MobileActionActivity`;
- persiste eventos localmente até o VPS confirmar o recebimento;
- abre discador ou WhatsApp pessoal;
- detecta o retorno ao HBX;
- registra duração aproximada e resultado.

O HBX Logística é distribuído separadamente, com o pacote `br.com.hbxsystem.logistica`. Ele preserva o pareamento, heartbeat, fila offline e serviço de localização da rota, mas não consome ações comerciais de ligação ou WhatsApp destinadas ao HBX Vendas.

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
node --test
```

Aplicar a migration em banco descartável e validar:

- isolamento por `companyId` e `userId`;
- aparelho revogado não puxa ações nem registra eventos;
- código/token de outro aparelho falha;
- ação permanece em `queued` até o aparelho reservar a fila;
- pull muda para `delivering` e uma resposta perdida volta à fila após o lease;
- o APK confirma `delivered` somente depois de expor a notificação/tela;
- retorno e conclusão gravam duração/resultado;
- histórico não expõe ação de outro usuário ou tenant;
- nomes reais das tabelas/colunas usados no SQL raw;
- serialização do array em `ANY($1::text[])`; se o driver Prisma/Postgres atual não aceitar, trocar por `Prisma.join(ids)` em `IN (...)`.

### Android

```bash
cd EntregaShell
./gradlew :app:assembleDebug
./gradlew :app:assembleRelease :app:bundleRelease
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
9. revogar aparelho e confirmar bloqueio imediato.

## Fora deste PR

- enviar mensagem automaticamente pelo WhatsApp pessoal;
- ler mensagens privadas do WhatsApp pessoal;
- duração oficial da chamada da operadora;
- tornar o HBX o aplicativo de telefone padrão;
- publicação na Play Store.

**HBX CHECKPOINT: implementação concluída com fila no VPS, sem Firebase. Build, migration e testes automatizados são obrigatórios antes do merge; o roteiro em aparelho real permanece como aceite operacional do APK.**
