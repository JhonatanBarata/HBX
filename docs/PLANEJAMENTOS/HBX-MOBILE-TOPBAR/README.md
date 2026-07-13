# HBX Mobile — topbar, login e presença

## Entregue nesta etapa

- remove o botão flutuante **Aplicativo móvel** de Configurações;
- adiciona o ícone de celular à barra superior, antes do avatar;
- diferencia aparelho não vinculado, vinculado offline e online;
- usa a cor do tema quando o aparelho está online;
- adiciona popover com aparelho, último acesso, download e gerenciamento;
- adiciona download do APK e intenção de vínculo na página de login;
- após **Entrar e vincular**, login por senha ou Google abre `/configuracoes/aplicativo`;
- adiciona `POST /mobile/devices/heartbeat` para presença real do APK.

## Variável obrigatória no frontend

```env
NEXT_PUBLIC_ANDROID_APK_URL=https://SEU-ENDERECO/hbx-entrega.apk
```

A URL deve apontar para o APK baixável atual. Como é uma variável `NEXT_PUBLIC_*`, alterar o valor exige novo build/publicação do frontend.

Para evitar alterar o frontend em cada versão, prefira uma URL estável, por exemplo:

```env
NEXT_PUBLIC_ANDROID_APK_URL=https://www.hbxsystem.com.br/download/android
```

Esse endereço pode redirecionar no servidor para o arquivo APK mais recente.

## Atualização necessária no APK

Enquanto o APK não enviar heartbeat, o ícone ficará online por até 90 segundos depois que o aparelho abrir uma sessão. Para presença contínua, enviar a cada 30 segundos enquanto o aplicativo estiver ativo:

```http
POST /mobile/devices/heartbeat
Content-Type: application/json

{
  "deviceToken": "TOKEN_PERSISTENTE_DO_APARELHO",
  "installationId": "ID_DA_INSTALACAO"
}
```

Resposta esperada:

```json
{
  "ok": true,
  "deviceId": "...",
  "serverTime": "2026-07-13T18:00:00.000Z",
  "onlineUntil": "2026-07-13T18:01:30.000Z"
}
```

Regras sugeridas no Android:

1. enviar heartbeat ao abrir o app;
2. repetir a cada 30 segundos somente enquanto a Activity estiver ativa;
3. parar no `onStop`/`onDestroy`;
4. ao receber HTTP 401, limpar a credencial e voltar à tela de vínculo;
5. não criar serviço permanente em segundo plano nesta etapa.

## Teste local para o Codex

### Frontend

```bash
cd frontend
npm ci
npm run lint
npm run build
```

Validar manualmente:

- login mostra o bloco **HBX no celular**;
- `Baixar Android` usa `NEXT_PUBLIC_ANDROID_APK_URL`;
- `Entrar e vincular` redireciona após senha e após Google;
- o antigo botão flutuante não aparece em Configurações;
- o ícone de celular aparece antes do avatar;
- sem aparelho: ícone cinza com `+`;
- aparelho vinculado e parado: cinza com ponto;
- heartbeat recente: cor do tema;
- erro de API: estado vermelho e mensagem no popover.

### Backend

```bash
cd backend
npm ci
npm run build
npm test -- --runInBand
```

Validar o endpoint com um `deviceToken` real do APK e o mesmo `installationId` usado no pareamento.

## Fora desta etapa

- encaminhamento de ligações web para o APK;
- abertura automática do discador;
- push em segundo plano;
- publicação pela Play Store;
- deep link que preenche o código sem interação.
