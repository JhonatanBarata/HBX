# WhatsApp Modal externo

## Objetivo

Integrar o HBX ao Webwhats real, sem adapter `/sessions` e sem trazer o motor para dentro do monorepo. O backend HBX consome diretamente o contrato `/instance/...` e o frontend fala apenas com os endpoints do próprio HBX.

## Variáveis de ambiente do backend

- `WHATSAPP_MODAL_ENABLED=true`
- `WHATSAPP_MODAL_INTERNAL_URL=http://147.15.36.137:8080`
- `WHATSAPP_MODAL_API_KEY=` ou `AUTHENTICATION_API_KEY=`
- `WHATSAPP_MODAL_TIMEOUT_MS=15000`

Com `WHATSAPP_MODAL_ENABLED=true`, a feature fica habilitada no backend HBX.

## Network Docker

No ambiente atual do HBX, o backend aponta para `http://147.15.36.137:8080`.

Se o motor for rodado na mesma infra Docker do HBX, ele tambem pode entrar na network nomeada `hbx_net` e ser resolvido por DNS Docker.

Exemplo em outro compose:

```yaml
services:
  whatsapp-modal:
    image: your-registry/whatsapp-modal:latest
    container_name: whatsapp-modal
    restart: unless-stopped
    environment:
      PORT: "3100"
    networks:
      - hbx_net

networks:
  hbx_net:
    external: true
```

## Contrato esperado do Webwhats

- `POST /instance/create`
- `GET /instance/connect/:instanceName`
- `GET /instance/connectionState/:instanceName`
- `POST /instance/restart/:instanceName`
- `DELETE /instance/logout/:instanceName`

O HBX usa `instanceName=company-<companyId>` como identificador estável da instância e envia o header `apikey` com a mesma chave configurada no Webwhats em `AUTHENTICATION_API_KEY`.

## Endpoints internos do HBX

- `GET /companies/me/whatsapp-modal/status`
- `POST /companies/me/whatsapp-modal/start`
- `GET /companies/me/whatsapp-modal/qr`
- `POST /companies/me/whatsapp-modal/disconnect`
- `POST /companies/me/whatsapp-modal/restart`
- `GET /companies/:id/whatsapp-modal/status`
- `POST /companies/:id/whatsapp-modal/start`
- `GET /companies/:id/whatsapp-modal/qr`
- `POST /companies/:id/whatsapp-modal/disconnect`
- `POST /companies/:id/whatsapp-modal/restart`

Todos retornam payload padronizado com `success`, `status`, `message`, `data` e `errorCode`.

## Persistência mínima no HBX

O HBX persiste apenas metadados operacionais em `Company`:

- `whatsappModalStatus`
- `whatsappModalProvider`
- `whatsappModalPhone`
- `whatsappModalConnectedAt`
- `whatsappModalLastError`
- `whatsappModalUpdatedAt`

QR code bruto não é persistido em banco; ele é consultado sob demanda no endpoint próprio.
