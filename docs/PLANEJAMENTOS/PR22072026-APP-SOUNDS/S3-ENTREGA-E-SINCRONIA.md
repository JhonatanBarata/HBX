# S3 — Entrega e sincronia (o núcleo do dia a dia)

**Depende de:** S1, S2.

É aqui que o som paga a conta: o motorista confirma entrega de mão cheia, celular no suporte, sem
poder ler toast. O som diz *"salvou"* — e, mais importante, diz *"NÃO salvou"*.

## Ponto de maior alavancagem: o `toast()` central

`app.js:351` — `function toast(message, error)` é o funil por onde **todo** aviso do app passa, e já
carrega a flag `error`. Uma linha ali cobre dezenas de call sites de uma vez:

```javascript
// dentro de toast(), antes do render()
H.sound(error ? "error" : "success");
```

**Cuidados obrigatórios:**
- O anti-repique de 400 ms do S1 é o que impede o `toast()` dentro de loop virar metralhadora.
- Eventos que ganham som **próprio** (entrega, comprovante, offline, sync) devem **suprimir** o
  `success` genérico do toast — senão toca dois sons colados. Fazer com um parâmetro:
  `toast(msg, error, { mudo: true })` nos call sites que já tocaram o som certo.
- `success` está com volume 0.55 no sound-map (baixo de propósito) — não subir.

## Mapa evento → som

| Evento | Onde | Som | Vibra? |
|---|---|---|---|
| Confirmar entrega (sucesso) | `action === "confirm"` na folha de entrega (`app.js:3479` monta o botão) | `delivery_complete` | ✅ 12 ms |
| Comprovante (foto/assinatura) guardado ou enviado | `uploadProof` da ponte (`native.js:94`) — no **callback de sucesso**, não no clique | `proof_saved` | — |
| Operação salva **sem internet** | ramo offline da confirmação / `OperationalStore` | `offline_saved` | ✅ 12 ms |
| Operação entrou na fila | idem, quando só enfileira | `sync_pending` | — |
| Fila offline **zerou** | `OperationalSync` / `TrackingSync` ao concluir com pendências > 0 antes | `sync_complete` | — |
| Falha de operação ou rede | `toast(..., true)` | `error` | ✅ 25 ms |
| Aviso que exige atenção (crédito acabando, GPS negado) | `toast` de aviso | `warning` | — |
| Atualização do APK concluída | `checkAppUpdate`/`downloadAndInstall` sucesso (`app.js:1667+`) | `update_complete` | — |
| Pareamento concluído | `PairingActivity` | `pairing_success` | — |

**`sync_complete` só toca se havia pendência.** Sincronia que não tinha nada pra mandar é ruído —
o motorista aperta Sincronizar 20×/dia por ansiedade.

## Regra de ouro do S3

Som toca **no fato**, nunca na intenção. `delivery_complete` no callback de sucesso da confirmação —
jamais no `onclick`. Som antes da confirmação real ensina o motorista a confiar em algo que pode
ter falhado, e isso volta como entrega perdida.

## Aceite do S3

- [ ] Confirmar entrega **online**: 1 som (`delivery_complete`), não dois
- [ ] Modo avião: confirmar entrega → `offline_saved`; reconectar → `sync_complete` uma vez só
- [ ] Forçar 500 no backend: toca `error`, e o `delivery_complete` **não** toca
- [ ] Sincronizar com fila vazia: **silêncio**
- [ ] Confirmar 3 entregas seguidas rápido: 3 sons distintos, sem sobreposição/glitch
