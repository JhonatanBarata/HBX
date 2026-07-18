# L4-G — Google no APK cadastra gente nova (igual ao site)

## Estado real (18/07)
- SITE: `auth.service.ts:1370 googleLoginOrSignup` = verifica token → acha por googleId →
  vincula por e-mail → **cadastra novo** (`signupWithGoogle`: empresa NEUTRA + user, Google
  já confirmado, créditos welcome via `isCreditsFeatureEnabled`). Funciona em prod.
- APK: PairingActivity já tem o fluxo inteiro (Credential Manager → idToken →
  `POST /mobile/devices/google-pair`). `GOOGLE_CLIENT_ID` na VPS = mesmo client do app.
- GAP (pedido do dono): `mobile-device.service.ts:410 resolveGooglePairingUserTx` joga
  `UnauthorizedException('Não existe uma conta HBX vinculada a este e-mail Google.')`
  quando o e-mail não existe — **não cadastra**. Dono: "tem q funcionar igual do website
  (cadastrar pessoas novas tbm)".

## Entrega
1. **auth.service.ts**: extrair do `googleLoginOrSignup` o miolo find-or-create pra um
   método público reutilizável `ensureGoogleAccount(payload: { sub, email, name?, ... })`
   que devolve o user (byGoogleId → byEmail+vincula googleId/emailConfirmedAt →
   `signupWithGoogle`). `googleLoginOrSignup` continua: verificar token → ensureGoogleAccount
   → `login(...)`. ZERO mudança de comportamento pro site (testes atuais verdes provam).
   ensureGoogleAccount recebe payload JÁ VERIFICADO (não re-verifica token — o pareamento
   usa o verifier próprio dele).
2. **mobile-device.service.ts `googlePairDevice`**: depois do `googleIdTokens.verify`,
   ANTES da transação de pareamento, chamar `authService.ensureGoogleAccount(identity...)`
   (adaptar shape VerifiedGoogleIdentity→payload). A transação existente segue igual —
   `resolveGooglePairingUserTx` vai achar byGoogleId. Cuidar ciclo de DI (AuthModule já
   provê ambos? conferir; se preciso, forwardRef como os vizinhos fazem).
3. **Módulos da empresa nova**: INVESTIGAR se a empresa neutra recém-criada consegue usar
   `/logistica/*` no app (teto CompanyModule masterEnabled×enabled — qual o default sem
   linha?). Se um signup novo ficar 403 no app de logística, resolver do jeito MÍNIMO e
   documentado (espelhar o que o pós-OOBE do site ativa pra logística; nunca tocar
   kill-switch do master). Se já funciona por default, só reportar a prova.
4. **Erros preservados**: conta desativada, googleId em outra conta (P2002/Conflict),
   dois e-mails ambíguos → mensagens atuais intactas. A mensagem "Não existe uma conta…"
   deixa de ser alcançável no pareamento (vira cadastro) — remover/ajustar comentário.

## Testes
- `mobile-device-google-pair.service.test.ts`: caso NOVO "e-mail sem conta → cria empresa+
  user (neutra, google confirmado) e pareia o aparelho"; casos existentes intactos.
- `auth.service.test.ts` (site) precisa continuar verde sem edição de expectativa
  (refactor não muda contrato).

## Gates
`cd backend && npx tsc --noEmit` limpo + testes dos arquivos tocados verdes (node:test,
mesmo runner dos vizinhos). NÃO tocar EntregaShell. NÃO commitar. Auth é sensível:
diff mínimo, nada de "aproveitar pra arrumar".
