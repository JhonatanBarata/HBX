# W — Resiliência de sessão: 401 de endpoint não pode deslogar o app inteiro

## Dor (provada em prod, 20/07 — vale pra TODO usuário, não só o master)
O dono é "jogado pra fora" sem parar. Diagnóstico ao vivo na VPS PROVOU que **a sessão web
NÃO estava morrendo no servidor** (8 sessões vivas, zero revogações, `sessionVersion` travado).
O chute vem do **frontend**: `apiFetch` (`frontend/src/lib/api.ts`, bloco `if (!res.ok)` ~linha
136-151) faz `clearToken()` + `leaveWithFade("/?entrar")` em **QUALQUER** 401 de rota fora de
`/auth/`. Um **poll de fundo** (`GET /mobile/actions/history` disparado em loop por um widget,
que usa um token de celular ausente/velho → 401) derruba a sessão web inteira. Como o token é
apagado ANTES do redirect, os guardas de entrada (`AUTH_BOOT` em page.tsx, efeito do
`public-entry`) não têm o que reaproveitar → o dono trava no card de login mesmo com sessão viva.

## Princípio da correção (ordem do dono)
"Não recriar token, aproveitar sempre." **Um 401 só desloga se o token web estiver
comprovadamente morto (ausente OU `exp` vencido).** 401 com token vivo = falha DAQUELE endpoint
(permissão, token de celular, transiente de deploy) — NÃO pode derrubar a sessão. Consequência
direta: `/login` (e `/?entrar`) com token ativo cai no menu, porque o token deixa de ser apagado
à toa e os guardas existentes o reaproveitam.

## Arquivos permitidos (SÓ estes 2)
1. `frontend/src/lib/api.ts`
2. `frontend/src/components/hbx/public-entry.tsx`

**NÃO tocar:** `auth-gate.tsx` (o logout de "empresa removida" na linha ~32 é regra de negócio
legítima, fica), `logout.ts`, `page.tsx`/`AUTH_BOOT` (já reaproveita o token por presença — com
o token preservado, funciona), nem o widget que faz o poll.

## Implementação

### 1. `frontend/src/lib/api.ts` — novo helper exportado `isTokenLive()`
Colocar logo depois de `getToken()` (~linha 58). Regra: **na dúvida, MANTÉM a sessão** (o objetivo
é parar de deslogar à toa; o servidor é a fonte da verdade). Só retorna `false` quando o token
sumiu OU o `exp` comprovadamente venceu.
```ts
// Token "vivo": existe E (não dá pra ler o exp OU o exp ainda não passou). Decodifica
// o payload do JWT só pra ler `exp` — não valida assinatura (isso é do servidor). Erro de
// parse / sem exp = trata como VIVO de propósito: um 401 nunca pode derrubar a sessão só
// porque o cliente não conseguiu ler o token. Base para "aproveitar o token sempre".
export function isTokenLive(): boolean {
  const token = getToken();
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length < 2) return true; // não é JWT decodificável → mantém
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = JSON.parse(typeof atob === "function" ? atob(b64) : "");
    const exp = Number((json as { exp?: unknown })?.exp);
    if (!Number.isFinite(exp)) return true; // sem exp → mantém
    return exp * 1000 > Date.now();
  } catch {
    return true; // não conseguiu ler → mantém (não desloga à toa)
  }
}
```

### 2. `frontend/src/lib/api.ts` — travar o logout do 401 atrás de `!isTokenLive()`
No bloco `if (!res.ok)` (~linha 142), adicionar a condição `&& !isTokenLive()` e um comentário
curto. Fica:
```ts
    if (
      res.status === 401 &&
      !path.startsWith("/auth/") &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/" &&
      !isTokenLive()   // token vivo → o 401 é DAQUELE endpoint (permissão/token de celular/
                       // transiente), não morte de sessão. Não derruba o app (bug do poll
                       // de fundo que expulsava todo mundo). Só desloga com token morto/ausente.
    ) {
      try { sessionStorage.setItem("hbx:session-notice", "expired"); } catch { /* sem storage */ }
      clearToken();
      leaveWithFade("/?entrar");
    }
```
O resto do bloco (montar `ApiError`, `throw`) fica IGUAL — o caller continua recebendo o erro do
endpoint; só o efeito colateral de logout-geral some quando o token está vivo.

### 3. `frontend/src/components/hbx/public-entry.tsx` — encaminhar por liveness
No efeito ~linha 230-232, trocar a presença por liveness (evita mandar token vencido pro app e
garante "/login com token ATIVO → menu"):
```ts
  useEffect(() => {
    if (isTokenLive()) router.replace("/dashboard");
  }, [router]);
```
Ajustar o import de `@/lib/api` (linha ~12) pra incluir `isTokenLive` junto de `getToken`.
(`getToken` segue usado? Se não sobrar uso, remover do import pra não quebrar lint de unused.)

## Regras do repo
- Trabalhar direto na master; NÃO commitar (orquestrador publica). NÃO criar branch.
- Comentários PT-BR, no estilo do arquivo. Só os 2 arquivos.

## Checks obrigatórios (rodar e colar saída real)
```
cd frontend && npx tsc --noEmit -p tsconfig.json
```
Se houver script de lint rápido (`npm run lint`), rodar também e colar. NÃO precisa `next build`
completo (lento) — o typecheck cobre a mudança (TS puro, zero CSS).
Reportar: arquivos tocados, saída dos checks, e se `getToken` ficou ou não no import do public-entry.
