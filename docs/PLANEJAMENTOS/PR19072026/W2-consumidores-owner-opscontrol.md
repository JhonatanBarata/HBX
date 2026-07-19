# W2 — Consumidores: HBX Owner agent + start-owner.ps1 + Ops Control usam `/auth/service-login`

## Contexto
O backend está ganhando (worker W1, em paralelo) o endpoint `POST /auth/service-login`:
- Body: `{ "username": "...", "password": "..." }` (sem forceSession).
- Sucesso: `{ "access_token": "...", "token_type": "service", "expires_in": 14400 }`.
- Erro: 401 genérico. Token dura 4h, claim `ops:true` — NÃO cria AuthSession, então os
  robôs param de despejar a sessão humana do dono no /master (teto de 4 sessões).

Os 3 consumidores que hoje fazem `/auth/login` como master devem migrar para
`/auth/service-login` **com fallback para `/auth/login` quando o backend responder
404 ou 405** (backend local antigo ainda não rebuildado — o deploy da VPS é atômico com
o publish, mas o backend local em Docker do dono só atualiza quando ele rodar `npm run up`).

## O que fazer

### 1. `hbx-owner/local-agent/server.js` — `refreshBackendToken()` (~linha 1272)
Hoje: POST `${backendUrl}/auth/login` com `{ username, password, forceSession: true }`.
Mudar para: tentar `${backendUrl}/auth/service-login` com `{ username, password }`;
se a resposta for **404 ou 405**, repetir a MESMA requisição contra `/auth/login` com
`{ username, password, forceSession: true }` (comportamento atual, intocado).
- Preservar: single-flight (`backendTokenRefreshPromise`), timeout 8000ms, parsing e
  formatos de erro/resolve atuais, escolha de módulo http/https (`httpModuleForUrl` — o
  comentário "BUG D1" deve continuar valendo nos dois caminhos).
- Sugestão de forma: extrair um helper interno que faz 1 POST de login pra uma rota+body e
  devolve `{ ok, statusCode, token, error }`, e o `refreshBackendToken` orquestra
  service-login → (404/405) → login. Não bufferizar além do que já se faz.
- Comentário curto no código: service-login = token de máquina `ops:true`, não cria
  AuthSession (fim do despejo do dono no /master); fallback existe só pra backend local
  desatualizado.

### 2. `hbx-owner/local-agent/start-owner.ps1` (~linhas 98–118)
Mesma migração: tentar `POST $backendUrl/auth/service-login`; se falhar com 404/405,
cair pro `POST $backendUrl/auth/login` atual. Manter timeout 5s e o warning atual.
⚠️ Este arquivo pode ter ACL DENY de escrita (proteção do dono). Se a edição falhar por
permissão: NÃO forçar, NÃO mexer em ACL — deixar o arquivo como está e REPORTAR. O fluxo
continua funcional sem essa edição (o agent renova o token sozinho via item 1; o custo é
1 sessão humana por boot, tolerável).
Se editar, validar sintaxe:
`pwsh -NoProfile -NonInteractive -Command "$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile('hbx-owner/local-agent/start-owner.ps1',[ref]$t,[ref]$e)|Out-Null;$e"`

### 3. `ops-control/server.js` — `loginBackendWithCredentials` (~linha 626) e cache
- `loginBackendWithCredentials(config)`: tentar `POST /auth/service-login` com
  `{ username, password }`; se 404/405 → caminho atual `/auth/login` com forceSession.
  Devolver também de qual faixa veio o token (ex.: retornar `{ token, service: boolean }`
  ou equivalente — escolher a forma que menos espalha mudança).
- `resolveBackendAuthToken` (~linha 705): o cache hoje expira em 60s (linha ~721) — era o
  motor do re-login por minuto. Com token de serviço (4h), cachear por **3h**
  (`3 * 60 * 60 * 1000`); no fallback legado (`/auth/login`), manter os 60s atuais.
- Não mexer no caminho `autoSession`/mint (`buildBackendAutoSessionScript`) nem em SSH.

## Regras do repo
- PT-BR nos comentários. NÃO criar branch; NÃO commitar (orquestrador commita).
- NÃO tocar em arquivos fora dos 3 listados. NÃO reiniciar serviço nenhum (nada de
  systemctl/docker restart — só edição de código).

## Checks obrigatórios (rodar e reportar saída real)
```
node --check hbx-owner/local-agent/server.js
node --check ops-control/server.js
cd hbx-owner/local-agent && npm test        # se existir script de teste no package.json
```
+ o ParseFile do ps1 se ele tiver sido editado.
Reportar: arquivos tocados, resultado dos checks, se o ps1 foi editado ou bloqueado por ACL,
e qualquer desvio da spec com motivo.
