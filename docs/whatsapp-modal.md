# WhatsApp Modal externo

## Objetivo

Integrar o HBX a um serviço externo de WhatsApp rodando em Docker, sem trazer o motor para dentro do monorepo. O backend HBX passa a consumir um adapter HTTP interno e o frontend fala apenas com os endpoints do próprio HBX.

## Variáveis de ambiente do backend

- `WHATSAPP_MODAL_ENABLED=false`
- `WHATSAPP_MODAL_INTERNAL_URL=http://whatsapp-modal:3001`
- `WHATSAPP_MODAL_API_KEY=`
- `WHATSAPP_MODAL_TIMEOUT_MS=15000`

Com `WHATSAPP_MODAL_ENABLED=false`, a feature fica desligada sem quebrar o ambiente atual.

## Network Docker

O compose principal do repo publica a network nomeada `hbx_net`. O container externo do modal deve entrar nessa mesma network para que o backend consiga resolver `http://whatsapp-modal:3001` por DNS Docker, sem usar `localhost` dentro do container.

Exemplo em outro compose:

```yaml
services:
  whatsapp-modal:
    image: your-registry/whatsapp-modal:latest
    container_name: whatsapp-modal
    restart: unless-stopped
    environment:
      PORT: "3001"
    networks:
      - hbx_net

networks:
  hbx_net:
    external: true
```

## Contrato esperado do serviço externo

- `GET /health`
- `GET /sessions/:tenant/status`
- `POST /sessions/:tenant/start`
- `GET /sessions/:tenant/qr`
- `POST /sessions/:tenant/disconnect`
- `POST /sessions/:tenant/restart`

O HBX usa `tenantKey=company-<companyId>` como identificador estável da sessão e envia também `companyId`, `companySlug` e `companyName` no `start`.

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