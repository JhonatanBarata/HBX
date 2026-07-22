# PR22072026 — APP SOUNDS (identidade sonora do APK entregador)

Fonte do pacote: `docs/APP SOUNDS/` (20 OGG prontos + `docs/sound-map.json` com key/volume/categoria).
Os `masters-wav/` (4,4 MB) **nunca** entram no APK — são fonte, ficam em docs.

## Tese

Som no app de entrega não é enfeite: o motorista está dirigindo, celular no suporte, olho na rua.
Som = **confirmação sem olhar**. Por isso o critério de aceite não é "tocou", é "ele soube o que
aconteceu sem tirar o olho da rua e sem se irritar no terceiro dia".

## Escopo — 16 entram, 4 ficam de fora

| Entra (res/raw) | Fica fora | Motivo do corte |
|---|---|---|
| arrival_alert_loop, arrival_confirm, delivery_complete, proof_saved, offline_saved, sync_pending, sync_complete, pause_detected, route_start, route_stop, navigation_open, error, warning, success, update_complete, pairing_success | `opening_signature` (88 KB) | 6,2 s tocando em TODA abertura; o motorista abre o app ~40×/dia. É o arquivo mais pesado E o mais irritante. |
| | `sonic_logo` (25 KB) | O próprio sound-map diz "vídeos, login e comunicação da marca" = material de marketing, vive no site, não no APK. |
| | `tap_soft`, `toggle` (11 KB) | Som em toque de botão irrita em 10 minutos. O feedback de toque já existe e é melhor: aperto/escala + `H.vibrate`. |

**Peso:** 218 KB em res/raw → APK ~1,58 MB → **~1,79 MB (+13%)**. Android não recomprime `.ogg`,
então o crescimento é 1:1, sem surpresa. Não se envia para o aparelho som que não se toca.

## Leis desta frente

1. **Um gate único, nunca `if` espalhado.** Mudo/volume/preferência/`APP_MODE` decidem em UM lugar
   (`HbxSoundEngine.play`). Call site só diz a key.
   **Som e fala são canais separados:** a chave-mestra dos sons não cala a voz do GPS, e desligar a
   voz não cala os sons (S5). São dois botões porque são duas dores diferentes.
2. **Voz > alerta > efeito.** A voz da navegação (S5 da NAVEGACAO-HBX) nunca é cortada por um "ding".
   Efeito que chegar enquanto o TTS fala é **descartado**, não enfileirado.
3. **Som é acessório — falha vira no-op silencioso.** Mesmo padrão já provado no TTS: nenhuma exceção
   de áudio pode derrubar entrega, Activity ou fila offline.
4. **Um evento, um som.** Chegada hoje já tem alarme + vibração + voz "Chegou: X". Somar mais um
   sem dedupe vira barulheira.
5. **Vibração anda junto.** Em caminhão com música/rádio o som some; `H.vibrate` atravessa.
   Todo evento crítico é som **+** vibração.
6. **Nada de som em espera.** Loading/spinner nunca ganham áudio — som em espera faz a espera
   parecer maior.

## Sprints

| # | Sprint | Entrega | Toca som? |
|---|---|---|---|
| S1 | [Fundação nativa](S1-FUNDACAO-NATIVA.md) | `HbxSoundEngine` + res/raw + ponte + gate único | ❌ nada ainda |
| S2 | [Chegada](S2-CHEGADA.md) | alarme padrão → `arrival_alert_loop`, dedupe com a voz | ✅ |
| S3 | [Entrega e sincronia](S3-ENTREGA-E-SINCRONIA.md) | delivery/proof/offline/sync/error | ✅ |
| S4 | [Rota e navegação](S4-ROTA-E-NAVEGACAO.md) | route_start/stop, pausa, navegação, prioridade da voz | ✅ |
| S5 | [Central de Sons](S5-PREFERENCIA.md) | chip no topo (esq. do GPS) + linha "Sons" em Ajustes → folha com os 16 + mestra + **Voz do GPS** | ✅ |
| S7 | [Aviso de créditos](S7-AVISO-CREDITOS.md) | trava de crédito passa a existir pro motorista, com o motivo certo pra cada papel | ✅ |
| S6 | [QA no aparelho + peso](S6-QA-E-PESO.md) | roteiro no moto g15 via ADB, APK antes/depois | ✅ |

Ordem é dura: **S1 antes de tudo** (sem o gate, cada sprint inventa a própria regra de mudo),
**S2 antes de S3/S4** (chegada é onde os sons se atropelam).

## Fora de escopo (fica pra depois)

- **Escada de loading + entrega otimista** (a outra metade da conversa de 22/07): é frente separada,
  não mistura com áudio. Som não conserta render lento.
- **Conversão para mono** (-40% ⇒ pacote ~130 KB): só se o peso incomodar depois de medido — S6 decide.
- **Vendas** (`APP_MODE=vendas`): esta frente é logistica-only, igual ao TTS.
