# S1 — Cooldown do webhook: limpar no delete/recreate + carimbar só no sucesso + logar skip

## Contexto (incidente 20/07)
Instância `company-5-user-6` ficou `open` no motor SEM webhook: o delete→recreate da instância
apaga a linha `Webhook` (cascade), e a reconfiguração pós-recreate foi engolida pelo cooldown de
60s de `tryConfigureProviderWebhook` — que é re-carimbado pelo poll de /qr (4s) e faz `return`
mudo. Resultado: chip conectado e mudo, sem nenhum log. Diagnóstico completo em
`docs/PLANEJAMENTOS/PR21072026/` (este PR) e memória `incidente-webhook-engolido-20-07`.

## Arquivo
`backend/src/companies/whatsapp-modal.service.ts` (ÚNICO arquivo desta sprint).
⚠️ O arquivo tem um byte NUL (~offset 78644): ripgrep/Grep para no meio e reporta resultado
INCOMPLETO. Use `grep -a` no Bash ou Read por faixas de linha. NÃO "conserte" o NUL — fora de escopo.

## Mudanças (3, cirúrgicas)

### 1. Instância nova nunca herda cooldown
Em `resetProviderInstanceForPairing` (linha ~2172), junto de
`this.recentConnectAttemptAt.delete(tenantKey)` e `this.qrCodeCache.delete(tenantKey)`, adicionar:
```ts
this.recentWebhookConfigureAt.delete(tenantKey);
```
Idem em `disconnectCompanySession` logo após o `deleteProviderInstance` pós-disconnect (linha
~1072, dentro do try — adicionar após a chamada, fora do catch): a instância foi deletada, o
próximo start precisa poder configurar webhook imediatamente.

### 2. Carimbar cooldown SÓ após sucesso validado
Hoje `tryConfigureProviderWebhook` (linha ~2872) faz `.set(tenantKey, Date.now())` ANTES do POST
(linha ~2885) — uma tentativa que FALHA também bloqueia retry por 60s. Mudar para:
- Remover o `.set` antecipado da linha ~2885.
- Adicionar `this.recentWebhookConfigureAt.set(tenantKey, Date.now())` APENAS no caminho de sucesso
  total (após a validação ok, junto do `this.logger.log('Webhook WebWhats configurado e validado...')`,
  linha ~2932).
- Nos caminhos de falha (set falhou ~2900, find falhou ~2915, validação falhou ~2924, catch ~2936):
  carimbar um cooldown CURTO de falha para não martelar o motor a cada poll de 4s:
  `this.recentWebhookConfigureAt.set(tenantKey, Date.now() - this.webhookConfigureCooldownMs + this.webhookConfigureFailureRetryMs);`
  com novo campo `private readonly webhookConfigureFailureRetryMs = 10000;` declarado junto de
  `webhookConfigureCooldownMs` (linha ~197). Efeito: falha → retry em 10s; sucesso → 60s. Sem
  estado novo além do timestamp (mantém o Map<string, number> atual).

### 3. Logar o skip do cooldown sem spammar
No early-return do cooldown (linha ~2882), logar APENAS quando `reason !== 'connect'`
(o 'connect' é o poll de 4s do modal — logar todo poll viraria spam; start/restart/pairing_code
são ações críticas de usuário e o skip delas é exatamente o sintoma do incidente):
```ts
if (reason !== 'connect') {
  this.logger.warn(`Webhook WebWhats skip por cooldown instance=${tenantKey} reason=${reason} elapsedMs=${Date.now() - lastAttemptAt}`);
}
return;
```

## Proibições
- NÃO criar branch, NÃO commitar, NÃO publicar, NÃO tocar em outros arquivos.
- NÃO mudar assinatura pública de nenhum método.
- NÃO mexer no fluxo de conexão/socket (nada de connect/logout/restart novos) — risco de ban.

## Gate
`cd backend && npx tsc -p tsconfig.json --noEmit` limpo (ou `npm run build` se o tsc puro reclamar
de paths). Relatar: diff resumido (linhas alteradas) + resultado do typecheck.
