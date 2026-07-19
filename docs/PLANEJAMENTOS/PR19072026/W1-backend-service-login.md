# W1 — Backend: `POST /auth/service-login` (token de máquina, sem AuthSession)

## Contexto (por que existe)
O login master do dono no navegador vive caindo porque o HBX Owner agent e o Ops Control
logam como a MESMA conta master via `/auth/login`, e cada login cria uma `AuthSession`
nova. A conta multi-sessão tem teto de 4 (`MAX_ADMIN_WEB_SESSIONS`, despejo por
`lastSeenAt`) — os robôs fazem polling, o `lastSeenAt` deles está sempre fresco, e o
humano é sempre o despejado (`session_limit_reached`).

A solução já tem precedente PROVADO no código: o mint do ops-control emite JWT com claim
`ops: true`, que o `jwt.strategy.ts` (linhas 89–99) aceita para `isSystemMaster` SEM tocar
em `AuthSession`/`currentSessionId`/`sessionVersion`. Só que hoje esse token só nasce via
`docker exec` (ops-control/server.js `buildBackendAutoSessionScript`). Este worker cria o
emissor HTTP dessa mesma faixa.

## O que fazer

### 1. `backend/src/auth/auth.service.ts` — novo método `serviceLogin(username, password)`
Espelhar o INÍCIO de `loginWithUsername` (mesma disciplina anti-enumeração/anti-timing):
1. Normalizar username/senha; ambos obrigatórios → `BadRequestException` se faltar.
2. Se username == `masterUsername()` (case-insensitive) → `await this.ensureSystemMasterUser()`.
3. `findByLoginIdentifier`; se não achar → `bcrypt.compare(pass, DUMMY_BCRYPT_HASH)` +
   `UnauthorizedException('Usuário ou senha inválidos')` (mensagem GENÉRICA, igual login).
4. `bcrypt.compare` da senha; falhou → mesma mensagem genérica.
5. SÓ DEPOIS da prova de senha: se `user.isActive === false` OU `!user.isSystemMaster` →
   a MESMA `UnauthorizedException` genérica (não vazar que a conta existe mas não é master).
6. Emitir token ESPELHANDO o mint do ops-control (ops-control/server.js:673-678):
   ```ts
   const access_token = this.jwtService.sign(
     { sub: user.id, email: user.email, companyId: user.companyId || undefined, ops: true },
     { expiresIn: '4h' },
   );
   return { access_token, token_type: 'service', expires_in: 4 * 60 * 60 };
   ```
**PROIBIDO neste método:** criar/revogar `AuthSession`, mexer em `currentSessionId`,
incrementar `sessionVersion`, chamar `this.login()`. O ponto INTEIRO é não tocar em sessão.

### 2. `backend/src/auth/auth.controller.ts` — rota
```ts
@Post('service-login')
@Throttle({ default: { limit: 10, ttl: 60 } })
async serviceLogin(@Body() dto: LoginDto) {
  return this.authService.serviceLogin(dto.username, dto.password);
}
```
Reusar o `LoginDto` existente (tem username/password). Sem guard de JWT (é rota de login,
mesmo padrão do `@Post('login')` vizinho). Comentário curto no controller explicando: token
de máquina `ops:true`, não cria AuthSession — cabo da guerra de sessão do /master
(ver jwt.strategy.ts:89-99).

### 3. Teste — `backend/src/auth/service-login.test.ts`
Seguir o harness dos testes vizinhos de `backend/src/auth/` (node:test + mocks manuais,
olhar `auth.service.test.ts` / `jwt.strategy.test.ts` como referência de estilo). Casos:
1. Credencial master válida → retorna `access_token`; decodificar/inspecionar o payload
   assinado e afirmar `ops === true`; afirmar que `prisma.authSession.create` NÃO foi
   chamado e que nenhum update de user tocou `sessionVersion`/`currentSessionId`.
2. Credencial válida de usuário NÃO-master → `UnauthorizedException` com a mensagem genérica.
3. Senha errada → `UnauthorizedException` genérica.
4. Usuário inexistente → `UnauthorizedException` genérica (e o dummy compare rodou — se o
   harness permitir afirmar isso sem contorcionismo; senão, só o erro).

## Regras do repo
- PT-BR nos comentários; comentar só restrição que o código não mostra.
- NÃO criar branch — trabalhar direto na master, commit fica com o orquestrador (NÃO commitar).
- NÃO tocar em nenhum arquivo fora dos 3 listados.

## Checks obrigatórios (rodar e reportar saída real)
```
cd backend && npm run build
node --test dist/auth/service-login.test.js
node --test dist/auth/jwt.strategy.test.js   # regressão da faixa ops
```
Reportar: arquivos tocados, resultado dos checks, e qualquer desvio da spec com motivo.
