# Website Admin Auth Flow

## Objetivo

O HBX nao constroi mais websites. O site da empresa vive fora do HBX, normalmente em Firebase Hosting. O HBX agora faz apenas tres coisas:

1. guarda a configuracao do website por empresa;
2. abre o site correto ao entrar no modulo `website`;
3. libera o admin do site com token temporario e sessao assinada.

## Configuracao no MASTER

Cada empresa passa a ter os campos abaixo no cadastro de website:

- `websiteEnabled`
- `websitePublicUrl`
- `websiteAdminUrl`
- `websiteProjectId`
- `websiteAdminEnabled`
- `websiteLaunchMode` (`public` ou `admin`)

## Endpoints novos do HBX

### 1. Abrir website a partir do modulo

- `GET /website/portal?target=auto|public|admin`
- Autenticado no HBX
- Retorna `launchUrl` quando o website esta configurado

Regras:

- `target=auto`: respeita `websiteLaunchMode`
- `target=public`: abre o site publico
- `target=admin`: tenta abrir o admin com token temporario

### 2. Salvar configuracao da empresa no MASTER

- `PATCH /website/master/company/:companyId/config`
- Apenas MASTER

### 3. Trocar token temporario por sessao do admin

- `POST /website/admin/exchange`
- Publico
- Body:

```json
{
  "entryToken": "TOKEN_TEMPORARIO"
}
```

Resposta:

```json
{
  "ok": true,
  "sessionToken": "JWT_DE_SESSAO",
  "expiresAt": "2026-03-21T12:00:00.000Z",
  "company": {
    "id": 1,
    "name": "Empresa X",
    "slug": "empresa-x"
  },
  "website": {
    "projectId": "empresa-x-prod",
    "publicUrl": "https://empresa-x.web.app",
    "adminUrl": "https://empresa-x.web.app/admin-entry.html"
  },
  "user": {
    "id": 10,
    "username": "admin.empresa",
    "name": "Admin Empresa",
    "role": "ADMIN"
  }
}
```

### 4. Validar sessao do admin

- `POST /website/admin/verify`
- Publico
- Body:

```json
{
  "sessionToken": "JWT_DE_SESSAO"
}
```

## Fluxo esperado no website externo

### Entrada segura

1. O HBX abre `websiteAdminUrl` com query string `hbx_entry=<token>`.
2. A pagina `admin-entry` do website le `hbx_entry`.
3. O website chama `POST /website/admin/exchange`.
4. Se o HBX validar empresa, usuario, permissao e expiração, devolve `sessionToken`.
5. O website salva esse `sessionToken` em memoria ou `sessionStorage`.
6. O website redireciona para a area admin real.

### Validacao no bootstrap do admin

1. Ao carregar a area admin, o website recupera o `sessionToken`.
2. Chama `POST /website/admin/verify`.
3. Se `ok=true`, libera o admin.
4. Se falhar, limpa a sessao e redireciona para uma pagina de acesso negado.

## Regras de seguranca

- O link do admin nao deve confiar apenas em esconder tela.
- O token de entrada e curto e de uso unico.
- A sessao do admin e assinada pelo HBX.
- O HBX so gera sessao se:
  - o usuario estiver ativo;
  - a empresa estiver correta;
  - o modulo `website` estiver liberado;
  - o admin do website estiver habilitado na empresa.

## Observacao importante

Em Firebase Hosting puro, o HTML do admin pode ate carregar, mas sem `sessionToken` valido o painel deve bloquear APIs, esconder dados sensiveis e redirecionar para acesso negado logo no bootstrap.