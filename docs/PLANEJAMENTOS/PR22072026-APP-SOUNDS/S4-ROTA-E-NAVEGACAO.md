# S4 — Rota e navegação (onde o som encosta na voz)

**Depende de:** S1, S2, S3.

Sprint pequena em código e grande em risco: é a única que divide o alto-falante com a voz da
navegação (S5 da PR21072026-NAVEGACAO-HBX).

## Mapa evento → som

| Evento | Onde | Som |
|---|---|---|
| Rota iniciada | após `routeActivated` / início da Leitura de Rota (`app.js:5001`, "Montando a rota…") | `route_start` |
| Rota encerrada | `finish-route` confirmado (`app.js:4908` monta a confirmação; tocar no sucesso, `app.js:4458`) | `route_stop` |
| Pausa detectada no GPS | listener de `hbx:leitura-pausa` (modal em `app.js:1256`) | `pause_detected` |
| Navegação aberta | ao entrar no modo navegação / `H.maps()` | `navigation_open` |

`route_start` toca no **sucesso** da montagem, nunca ao apertar o botão — montar rota pode falhar
por crédito, GPS ou rede.

## A regra dura: efeito nunca corta a voz

O gate do S1 já descarta efeito enquanto `tts.isSpeaking`. S4 é onde isso é **testado de verdade**,
porque `navigation_open` e `pause_detected` acontecem exatamente quando a voz costuma estar falando.

Ordem de prioridade, sem exceção:

```
voz da navegação  >  alerta de chegada  >  efeito curto
```

- Efeito que chega durante a fala é **descartado** (não enfileirado — instrução de rota atrasada é
  pior que instrução nenhuma; é o mesmo motivo do `QUEUE_FLUSH` no `speak()`).
- `pause_detected` é a exceção parcial: a pausa gera um modal que fica na tela, então perder o som
  não perde a informação. Descarte é seguro.
- **Nunca** chamar `speakStop()` para abrir espaço a um efeito.

## Cuidado com o `navigation_open`

Abrir navegação já dispara: mudança de tela + possível fala da 1ª instrução + (às vezes) o app de
mapas externo. Se em teste no aparelho o `navigation_open` soar redundante, **cortar o som e
registrar aqui** — 16 sons é teto, não meta.

## Aceite do S4

- [ ] Iniciar rota → `route_start` uma vez; falhar por crédito → só `error`
- [ ] Encerrar rota → `route_stop` depois do sucesso da API
- [ ] Com a voz falando "vire à direita": disparar pausa/navegação → **a voz não é cortada**
- [ ] Pausa de GPS em campo → som + modal, sem repique quando o modal re-renderiza
- [ ] Veredito escrito sobre `navigation_open`: fica ou sai
