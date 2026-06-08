# Ajuste - Turbo ambos exige backends especificos

Data: 2026-06-07

## Problema visto no cockpit

Ao selecionar filtro e clicar em `Turbo ambos`, o Ops Control retornou:

`0 ok, 2 precisa configurar`

Motivo: o `.env.ops-control` tinha SSH da VPS, mas nao tinha os backends master separados:

- `OPS_CONTROL_LOCAL_BACKEND_URL`
- `OPS_CONTROL_LOCAL_BACKEND_TOKEN`
- `OPS_CONTROL_VPS_BACKEND_URL`
- `OPS_CONTROL_VPS_BACKEND_TOKEN`

Sem essas quatro variaveis, o Ops Control bloqueia `Local + VPS` para nao disparar duas vezes no mesmo backend por engano.

## Correcao aplicada

O cockpit agora mostra um preflight visual `Backends Local/VPS` antes do clique:

- mostra LOCAL configurado/faltando;
- mostra VPS configurado/faltando;
- lista as variaveis ausentes;
- nao expõe JWT/token.

Quando o alvo for `Local + VPS` e os backends especificos estiverem ausentes, a UI bloqueia o POST antes de chamar o servidor.

## Ajuste de UX do filtro

Antes, o seletor `Filtro` so era usado pelo botao `Forcar filtro`.

Agora:

- `Sem filtro obrigatorio` fica disponivel no seletor;
- se o operador escolher `Email obrigatorio`, `WhatsApp obrigatorio` etc. e clicar em `Turbo LOCAL`, `Turbo VPS` ou `Turbo ambos`, o Turbo tambem envia:

```json
{
  "requiredChannels": ["email"],
  "channelMatchMode": "all_required",
  "freshness": "live"
}
```

`Forcar filtro` continua existindo como botao explicito para o mesmo canal obrigatorio selecionado.

## Configuracao correta

No Ops Control rodando via Docker:

```text
OPS_CONTROL_LOCAL_BACKEND_URL=http://host.docker.internal:3000
OPS_CONTROL_LOCAL_BACKEND_TOKEN=<jwt-master-local>
OPS_CONTROL_VPS_BACKEND_URL=<url-do-backend-vps-acessivel-pelo-ops-control>
OPS_CONTROL_VPS_BACKEND_TOKEN=<jwt-master-vps>
```

No Ops Control rodando direto no Windows, o backend local normalmente fica em:

```text
OPS_CONTROL_LOCAL_BACKEND_URL=http://127.0.0.1:3000
```

## Validacoes

- `node --check ops-control/server.js`
- `node --check ops-control/public/app.js`
- smoke de `/api/radar-cockpit` confirmou `backendConfig.bothReady=false` e variaveis faltantes sem vazamento de token;
- smoke de `/api/opscontrol/turbo` com dois backends fake confirmou 2 chamadas com `requiredChannels=["email"]`, uma usando JWT local e outra JWT VPS.
